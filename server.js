// Load .env without requiring an extra package. Render can also provide the same values as Environment Variables.
const fs=require('fs');
const path=require('path');
const envFile=path.join(__dirname,'.env');
if(fs.existsSync(envFile)){
  for(const line of fs.readFileSync(envFile,'utf8').split(/\r?\n/)){
    const m=line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if(m && process.env[m[1]]===undefined) process.env[m[1]]=m[2].replace(/^['"]|['"]$/g,'');
  }
}
const express=require('express');
const session=require('express-session');
const crypto=require('crypto');
const app=express();
app.set('trust proxy',1);
const PORT=Number(process.env.PORT||3000);
const BASE_URL=(process.env.BASE_URL||'').replace(/\/$/,'');
const dataPath=path.join(__dirname,'data/store.json');
if(!fs.existsSync(path.dirname(dataPath)))fs.mkdirSync(path.dirname(dataPath),{recursive:true});
if(!fs.existsSync(dataPath))fs.writeFileSync(dataPath,JSON.stringify({users:{},orders:[],messages:[],refs:{},notifications:[]},null,2));
let db;
try { db=JSON.parse(fs.readFileSync(dataPath,'utf8')); } catch(e) { db={}; }
if(!db || typeof db!=='object' || Array.isArray(db)) db={};
if(!db.users || typeof db.users!=='object' || Array.isArray(db.users)) db.users={};
if(!Array.isArray(db.orders)) db.orders=[];
if(!Array.isArray(db.messages)) db.messages=[];
if(!db.refs || typeof db.refs!=='object' || Array.isArray(db.refs)) db.refs={};
if(!Array.isArray(db.notifications)) db.notifications=[];
if(!Array.isArray(db.gifts)) db.gifts=[];
const save=()=>fs.writeFileSync(dataPath,JSON.stringify(db,null,2));
const owner=req=>!!(req.session.user && String(req.session.user.username||'').toLowerCase()==='3zazel');
app.use(express.json());app.use(express.urlencoded({extended:true}));
app.use(session({secret:process.env.SESSION_SECRET || 'falcon-on-top-change-this-secret',resave:false,saveUninitialized:false,cookie:{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:1000*60*60*24*7}}));
app.use(express.static(path.join(__dirname,'public')));


function hashPassword(password,salt){
 return crypto.scryptSync(password,salt,64).toString('hex');
}
function validUsername(v){
 return typeof v==='string' && /^[A-Za-z0-9_]{3,20}$/.test(v);
}
function validPassword(v){
 return typeof v==='string' && v.length>=6 && v.length<=128;
}
function todayKey(){return new Date().toDateString();}
function giveDaily(u){
 const today=todayKey();
 if(u.lastDaily!==today){
   u.coins=Number(u.coins||0)+50;
   u.lastDaily=today;
   return true;
 }
 return false;
}



function getUserBySession(req){
  if(!req.session.user) return null;
  const key=Object.keys(db.users).find(k=>db.users[k] && db.users[k].id===req.session.user.id);
  return key ? db.users[key] : null;
}

function ensureOwner(){
 if(!db.users || typeof db.users!=='object' || Array.isArray(db.users)) db.users={};
 const username='3zazel';
 const key=Object.keys(db.users).find(k=>k.toLowerCase()===username);
 if(key) return;
 const password=process.env.OWNER_PASSWORD || '0104888ss';
 const salt=crypto.randomBytes(16).toString('hex');
 db.users[username]={
   id:crypto.randomUUID(),
   username,
   name:username,
   coins:0,
   lastDaily:'',
   passwordSalt:salt,
   passwordHash:hashPassword(password,salt),
   createdAt:new Date().toISOString(),
   owner:true
 };
 save();
}
ensureOwner();

app.post('/api/register',(req,res)=>{
 if(!db.users || typeof db.users!=='object' || Array.isArray(db.users)) db.users={};
 try{
   const username=String(req.body.username||'').trim();
   const password=String(req.body.password||'');
   if(!validUsername(username)) return res.status(400).json({error:'اسم المستخدم يجب أن يكون من 3 إلى 20 حرفاً أو رقماً، ويسمح بـ _ فقط.'});
   if(!validPassword(password)) return res.status(400).json({error:'كلمة المرور يجب أن تكون 6 أحرف على الأقل.'});
   if(Object.keys(db.users).some(k=>k.toLowerCase()===username.toLowerCase()))
   return res.status(400).json({error:'اسم المستخدم مستخدم بالفعل.'});
   if(username.toLowerCase()==='3zazel')
      return res.status(400).json({error:'اسم المستخدم محجوز.'});

   const salt=crypto.randomBytes(16).toString('hex');
   const id=crypto.randomUUID();
   const u={
     id,username,name:username,coins:50,lastDaily:todayKey(),
     passwordSalt:salt,passwordHash:hashPassword(password,salt),
     createdAt:new Date().toISOString()
   };
   db.users[username.toLowerCase()]=u;
   // Persist the account before creating the session so registration survives refresh/restart.
   save();
   req.session.user={id,username:u.username,name:u.name};
   save();
   req.session.save(err=>{
     if(err){ console.error(err); return res.status(500).json({error:'تم إنشاء الحساب لكن تعذر تسجيل الدخول تلقائياً. حاول تسجيل الدخول مرة أخرى.'}); }
     res.json({ok:true,user:u,message:'تم إنشاء الحساب بنجاح'});
   });
 }catch(e){
   console.error(e);
   res.status(500).json({error:'تعذر إنشاء الحساب.'});
 }
});

app.post('/api/login',(req,res)=>{
 if(!db.users || typeof db.users!=='object' || Array.isArray(db.users)) db.users={};
 try{
   const username=String(req.body.username||'').trim();
   const password=String(req.body.password||'');
   const userKey=Object.keys(db.users).find(k=>k.toLowerCase()===username.toLowerCase());
 const u=userKey?db.users[userKey]:null;
   if(!u || !u.passwordSalt || !u.passwordHash) return res.status(401).json({error:'اسم المستخدم أو كلمة المرور غير صحيحة.'});
   const hash=hashPassword(password,u.passwordSalt);
   if(!crypto.timingSafeEqual(Buffer.from(hash,'hex'),Buffer.from(u.passwordHash,'hex')))
      return res.status(401).json({error:'اسم المستخدم أو كلمة المرور غير صحيحة.'});

   const dailyGranted=giveDaily(u);
   req.session.user={id:u.id,username:u.username,name:u.name};
   save();
   req.session.save(err=>{
     if(err){ console.error(err); return res.status(500).json({error:'تعذر حفظ جلسة الدخول. حاول مرة أخرى.'}); }
     res.json({ok:true,user:u,dailyGranted,message:'تم تسجيل الدخول'});
   });
 }catch(e){
   console.error(e);
   res.status(500).json({error:'تعذر تسجيل الدخول.'});
 }
});

app.get('/auth/logout',(req,res)=>req.session.destroy(()=>res.redirect('/')));
app.get('/api/me',(req,res)=>{
 if(!req.session.user)return res.json({loggedIn:false});
 const u=getUserBySession(req);
 if(!u)return res.json({loggedIn:false});
 const changed=giveDaily(u);
 if(changed)save();
 res.json({loggedIn:true,user:u,owner:owner(req),dailyGranted:changed});
});


const PRODUCT_CATALOG={car:{name:'سيارة خاصة',price:5000},villa:{name:'فيلا خاصة',price:10000},vip:{name:'رتبة VIP',price:3000},workshop:{name:'ورشة خاصة',price:20000}};
function userCart(u){ if(!u) return []; if(!Array.isArray(db.carts[u.id])) db.carts[u.id]=[]; return db.carts[u.id]; }
function ticketForUser(id,t){return t && t.userId===id;}
app.get('/api/dashboard',(req,res)=>{const u=getUserBySession(req);if(!u)return res.status(401).json({error:'سجل دخولك أولاً'});res.json({user:u,orders:db.orders.filter(o=>o.userId===u.id),tickets:db.tickets.filter(t=>ticketForUser(u.id,t))});});
app.get('/api/cart',(req,res)=>{const u=getUserBySession(req);if(!u)return res.status(401).json({error:'سجل دخولك أولاً'});res.json({cart:userCart(u)});});
app.post('/api/cart',(req,res)=>{const u=getUserBySession(req);if(!u)return res.status(401).json({error:'سجل دخولك أولاً'});const p=PRODUCT_CATALOG[req.body.product];if(!p)return res.status(400).json({error:'منتج غير صالح'});const c=userCart(u),existing=c.find(x=>x.product===req.body.product);if(existing)existing.qty+=1;else c.push({product:req.body.product,name:p.name,price:p.price,qty:1});save();res.json({ok:true,cart:c});});
app.delete('/api/cart/:product',(req,res)=>{const u=getUserBySession(req);if(!u)return res.status(401).json({error:'سجل دخولك أولاً'});db.carts[u.id]=userCart(u).filter(x=>x.product!==req.params.product);save();res.json({ok:true,cart:db.carts[u.id]});});
app.post('/api/cart/checkout',(req,res)=>{const u=getUserBySession(req);if(!u)return res.status(401).json({error:'سجل دخولك أولاً'});const note=String(req.body.note||'').trim();const couponCode=String(req.body.couponCode||'').trim().toUpperCase();if(!note)return res.status(400).json({error:'اكتب اسمك في ديسكورد أو البيانات المطلوبة'});const c=userCart(u);if(!c.length)return res.status(400).json({error:'السلة فارغة'});let total=c.reduce((a,x)=>a+Number(x.price)*Number(x.qty),0);let discount=0;let coupon=null;if(couponCode){coupon=db.coupons[couponCode];if(!coupon)return res.status(400).json({error:'الكوبون غير موجود'});if(coupon.usedBy.includes(u.id))return res.status(400).json({error:'استخدمت هذا الكوبون من قبل'});if(coupon.maxUses&&coupon.usedBy.length>=coupon.maxUses)return res.status(400).json({error:'انتهت استخدامات الكوبون'});discount=Math.floor(total*coupon.percent/100);total-=discount;}if(u.coins<total)return res.status(400).json({code:'NO_COINS',error:'ليس لديك عملات فالكون كافية'});for(const item of c){for(let i=0;i<Number(item.qty||1);i++)db.orders.unshift({id:crypto.randomUUID(),userId:u.id,user:u.name,product:item.name,price:item.price,note,date:new Date().toISOString(),status:'جديد'});}u.coins-=total;if(coupon)coupon.usedBy.push(u.id);db.carts[u.id]=[];save();res.json({ok:true,coins:u.coins,cart:[],total,discount});});
app.get('/api/tickets',(req,res)=>{const u=getUserBySession(req);if(!u)return res.status(401).json({error:'سجل دخولك أولاً'});res.json({tickets:db.tickets.filter(t=>t.userId===u.id)});});
app.post('/api/tickets',(req,res)=>{const u=getUserBySession(req);if(!u)return res.status(401).json({error:'سجل دخولك أولاً'});const subject=String(req.body.subject||'').trim(),message=String(req.body.message||'').trim();if(!subject||!message)return res.status(400).json({error:'عنوان التذكرة والرسالة مطلوبان'});const t={id:crypto.randomUUID(),userId:u.id,user:u.name,subject,message,status:'مفتوحة',createdAt:new Date().toISOString(),replies:[]};db.tickets.unshift(t);save();res.json({ok:true,ticket:t});});
app.post('/api/tickets/:id/reply',(req,res)=>{const u=getUserBySession(req);if(!u)return res.status(401).json({error:'سجل دخولك أولاً'});const t=db.tickets.find(x=>x.id===req.params.id&&x.userId===u.id);if(!t)return res.status(404).json({error:'التذكرة غير موجودة'});const text=String(req.body.text||'').trim();if(!text)return res.status(400).json({error:'اكتب الرد'});t.replies.push({from:u.name,text,date:new Date().toISOString()});t.status='مفتوحة';save();res.json({ok:true,ticket:t});});
app.post('/api/owner/order-status',(req,res)=>{if(!owner(req))return res.status(403).json({error:'لصاحب الموقع فقط'});const o=db.orders.find(x=>x.id===String(req.body.id||''));const status=String(req.body.status||'').trim();const allowed=['جديد','قيد المراجعة','قيد التجهيز','تم التسليم','ملغي'];if(!o||!allowed.includes(status))return res.status(400).json({error:'بيانات الحالة غير صحيحة'});o.status=status;save();res.json({ok:true,order:o});});
app.get('/api/owner/tickets',(req,res)=>{if(!owner(req))return res.status(403).json({error:'لصاحب الموقع فقط'});res.json({tickets:db.tickets});});
app.post('/api/owner/tickets/:id/reply',(req,res)=>{if(!owner(req))return res.status(403).json({error:'لصاحب الموقع فقط'});const t=db.tickets.find(x=>x.id===req.params.id);if(!t)return res.status(404).json({error:'التذكرة غير موجودة'});const text=String(req.body.text||'').trim();if(!text)return res.status(400).json({error:'اكتب الرد'});t.replies.push({from:'الدعم الفني',text,date:new Date().toISOString()});t.status='تم الرد';save();res.json({ok:true,ticket:t});});
app.post('/api/owner/tickets/:id/status',(req,res)=>{if(!owner(req))return res.status(403).json({error:'لصاحب الموقع فقط'});const t=db.tickets.find(x=>x.id===req.params.id);const status=String(req.body.status||'').trim();if(!t||!['مفتوحة','قيد المتابعة','تم الحل','مغلقة'].includes(status))return res.status(400).json({error:'بيانات غير صحيحة'});t.status=status;save();res.json({ok:true,ticket:t});});


app.get('/api/leaderboard',(req,res)=>{
 const list=Object.values(db.users).filter(u=>!u.owner).sort((a,b)=>Number(b.coins||0)-Number(a.coins||0)).slice(0,10)
 .map((u,i)=>({rank:i+1,user:u.name,coins:Number(u.coins||0),level:Math.max(1,Math.floor(Number(u.coins||0)/5000)+1)}));
 res.json({leaderboard:list});
});
app.get('/api/reviews',(req,res)=>{
 const product=String(req.query.product||'').trim();
 const rows=db.reviews.filter(r=>!product||r.product===product).slice(0,50);
 const avg=rows.length?rows.reduce((a,r)=>a+Number(r.rating),0)/rows.length:0;
 res.json({reviews:rows,average:avg});
});
app.post('/api/reviews',(req,res)=>{
 const u=getUserBySession(req); if(!u)return res.status(401).json({error:'سجل دخولك أولاً'});
 const product=String(req.body.product||'').trim(), text=String(req.body.text||'').trim(), rating=Math.floor(Number(req.body.rating));
 if(!product||!text||rating<1||rating>5)return res.status(400).json({error:'بيانات التقييم غير صحيحة'});
 const exists=db.reviews.find(r=>r.product===product&&r.userId===u.id);
 if(exists)return res.status(400).json({error:'لقد قيّمت هذا المنتج بالفعل'});
 const r={id:crypto.randomUUID(),product,userId:u.id,user:u.name,rating,text,date:new Date().toISOString()};
 db.reviews.unshift(r);save();res.json({ok:true,review:r});
});
app.post('/api/owner/coupons',(req,res)=>{
 if(!owner(req))return res.status(403).json({error:'لصاحب الموقع فقط'});
 const code=String(req.body.code||'').trim().toUpperCase().replace(/[^A-Z0-9_-]/g,'');
 const percent=Math.floor(Number(req.body.percent)), maxUses=Math.floor(Number(req.body.maxUses||0));
 if(!code||percent<1||percent>100)return res.status(400).json({error:'بيانات الكوبون غير صحيحة'});
 if(db.coupons[code])return res.status(400).json({error:'الكوبون موجود بالفعل'});
 db.coupons[code]={code,percent,maxUses:maxUses>0?maxUses:null,usedBy:[],createdAt:new Date().toISOString()};
 save();res.json({ok:true,coupon:db.coupons[code]});
});
app.get('/api/owner/coupons',(req,res)=>{if(!owner(req))return res.status(403).json({error:'لصاحب الموقع فقط'});res.json({coupons:Object.values(db.coupons)});});
app.post('/api/coupons/check',(req,res)=>{
 const u=getUserBySession(req); if(!u)return res.status(401).json({error:'سجل دخولك أولاً'});
 const code=String(req.body.code||'').trim().toUpperCase(), c=db.coupons[code];
 if(!c)return res.status(404).json({error:'الكوبون غير موجود'});
 if(c.usedBy.includes(u.id))return res.status(400).json({error:'استخدمت هذا الكوبون من قبل'});
 if(c.maxUses && c.usedBy.length>=c.maxUses)return res.status(400).json({error:'انتهت استخدامات الكوبون'});
 res.json({ok:true,code,percent:c.percent});
});

app.post('/api/order',(req,res)=>{
 if(!req.session.user)return res.status(401).json({error:'سجل دخول بحسابك أولاً'});
 const prices={car:5000,villa:10000,vip:3000,workshop:20000},names={car:'سيارة خاصة',villa:'فيلا خاصة',vip:'رتبة VIP',workshop:'ورشة خاصة'};
 const {product,note}=req.body,u=getUserBySession(req);
 if(!prices[product])return res.status(400).json({error:'منتج غير صالح'});
 if(!note||!String(note).trim())return res.status(400).json({error:'اكتب اسمك في ديسكورد أو البيانات المطلوبة'});
 if(!u)return res.status(401).json({error:'انتهت الجلسة، سجل دخولك مرة أخرى'});
 if(u.coins<prices[product])return res.status(400).json({code:'NO_COINS',error:'ليس لديك عملات فالكون كافية'});
 u.coins-=prices[product];db.orders.unshift({id:crypto.randomUUID(),userId:u.id,user:u.name,email:u.email,product:names[product],price:prices[product],note:String(note).trim(),date:new Date().toISOString(),status:'جديد'});save();
 res.json({ok:true,coins:u.coins,message:'تم إرسال طلب الشراء للدعم الفني وسيتم التواصل معك.'});
});
app.post('/api/support',(req,res)=>{if(!req.session.user)return res.status(401).json({error:'سجل دخول بحسابك أولاً'});if(!req.body.message?.trim())return res.status(400).json({error:'اكتب رسالتك أولاً'});const u=getUserBySession(req);if(!u)return res.status(401).json({error:'انتهت الجلسة، سجل دخولك مرة أخرى'});db.messages.unshift({id:crypto.randomUUID(),userId:u.id,user:u.name,email:u.email,message:req.body.message.trim(),date:new Date().toISOString()});save();res.json({ok:true,message:'تم إرسال رسالتك للدعم الفني'});});


app.get('/api/offers',(req,res)=>{
 const now=Date.now();
 const offers=[
  {id:'vip-week',title:'خصم VIP',description:'خصم محدود على رتبة VIP.',discount:20,endsAt:new Date(now+6*60*60*1000).toISOString()},
  {id:'car-week',title:'عرض السيارة الخاصة',description:'عرض مؤقت على السيارة الخاصة.',discount:15,endsAt:new Date(now+10*60*60*1000).toISOString()},
  {id:'coins-bonus',title:'مكافأة العملات',description:'احصل على مكافأة إضافية عند إتمام الشراء.',discount:10,endsAt:new Date(now+18*60*60*1000).toISOString()}
 ];
 res.json({offers});
});
app.post('/api/wheel/spin',(req,res)=>{
 if(!req.session.user)return res.status(401).json({error:'سجل دخولك أولاً'});
 const u=getUserBySession(req); if(!u)return res.status(401).json({error:'انتهت الجلسة'});
 const today=todayKey();
 if(u.lastWheel===today)return res.status(400).json({code:'ALREADY_SPUN',error:'استخدمت عجلة الحظ اليوم. ارجع غداً لجولة جديدة.'});
 const prizes=[
  {label:'10 عملات',amount:10,weight:40},
  {label:'25 عملة',amount:25,weight:30},
  {label:'50 عملة',amount:50,weight:20},
  {label:'100 عملة',amount:100,weight:9},
  {label:'250 عملة',amount:250,weight:1}
 ];
 let r=Math.random()*100, prize=prizes[0];
 for(const p of prizes){r-=p.weight;if(r<=0){prize=p;break;}}
 u.coins=Number(u.coins||0)+prize.amount;
 u.lastWheel=today;
 db.notifications.push({id:crypto.randomUUID(),recipientId:u.id,title:'🎡 نتيجة عجلة الحظ',text:`ربحت ${prize.label} من عجلة الحظ.`,createdAt:new Date().toISOString(),readBy:[]});
 if(db.notifications.length>500)db.notifications=db.notifications.slice(-500);
 save();
 res.json({ok:true,prize,coins:u.coins});
});
app.get('/api/owner',(req,res)=>{if(!owner(req))return res.status(403).json({error:'لصاحب الموقع فقط'});res.json({purchases:db.orders,supportMessages:db.messages,tickets:db.tickets,refs:db.refs,users:Object.values(db.users).map(u=>({id:u.id,user:u.name,email:u.email,coins:u.coins}))});});
app.get('/api/notifications',(req,res)=>{
 if(!req.session.user)return res.json({notifications:[]});
 const u=getUserBySession(req); if(!u)return res.json({notifications:[]});
 const unread=db.notifications.filter(n=>(!n.recipientId || n.recipientId===u.id) && !(n.readBy||[]).includes(u.id)).slice(-10);
 res.json({notifications:unread});
});

app.get('/api/notifications/all',(req,res)=>{
 if(!req.session.user)return res.json({notifications:[]});
 const u=getUserBySession(req); if(!u)return res.json({notifications:[]});
 const notifications=db.notifications.filter(n=>!n.recipientId || n.recipientId===u.id).slice(-50).reverse().map(n=>({...n,read:Array.isArray(n.readBy)&&n.readBy.includes(u.id)}));
 res.json({notifications});
});
app.post('/api/notifications/read',(req,res)=>{
 if(!req.session.user)return res.status(401).json({error:'سجل الدخول أولاً'});
 const u=getUserBySession(req),n=db.notifications.find(x=>x.id===String(req.body.id||''));
 if(n&&u){if(!Array.isArray(n.readBy))n.readBy=[];if(!n.readBy.includes(u.id))n.readBy.push(u.id);save();}
 res.json({ok:true});
});
app.post('/api/owner/broadcast',(req,res)=>{
 if(!owner(req))return res.status(403).json({error:'لصاحب الموقع فقط'});
 const title=String(req.body.title||'').trim(),text=String(req.body.text||'').trim();
 if(!title||!text)return res.status(400).json({error:'العنوان والنص مطلوبان'});
 db.notifications.push({id:crypto.randomUUID(),title,text,createdAt:new Date().toISOString(),readBy:[]});
 if(db.notifications.length>100)db.notifications=db.notifications.slice(-100);
 save();res.json({ok:true,count:Object.keys(db.users).length});
});
app.post('/api/owner/gift-all',(req,res)=>{
 if(!owner(req))return res.status(403).json({error:'لصاحب الموقع فقط'});
 const amount=Math.floor(Number(req.body.amount||0));
 if(!Number.isFinite(amount)||amount<1||amount>100000000)return res.status(400).json({error:'عدد العملات غير صالح'});
 let count=0;
 for(const u of Object.values(db.users)){
   if(!Array.isArray(u.pendingGifts))u.pendingGifts=[];
   const gift={id:crypto.randomUUID(),amount,from:'الدعم الفني',createdAt:new Date().toISOString()};
   u.pendingGifts.push(gift);
   db.notifications.push({id:crypto.randomUUID(),recipientId:u.id,type:'gift',giftId:gift.id,title:'🎁 لديك هدية من الدعم الفني',text:`لديك هدية بقيمة ${amount.toLocaleString('ar-EG')} عملة فالكون جاهزة للاستلام.`,createdAt:new Date().toISOString(),readBy:[]});
   count++;
 }
 if(db.notifications.length>500)db.notifications=db.notifications.slice(-500);
 save();res.json({ok:true,count});
});

app.get('/api/gifts',(req,res)=>{
 if(!req.session.user)return res.status(401).json({error:'سجل دخول أولاً'});
 const u=getUserBySession(req);
 if(!u)return res.status(401).json({error:'انتهت الجلسة'});
 if(!Array.isArray(u.pendingGifts))u.pendingGifts=[];
 res.json({gifts:u.pendingGifts});
});

app.post('/api/gifts/:id/claim',(req,res)=>{
 if(!req.session.user)return res.status(401).json({error:'سجل دخول أولاً'});
 const u=getUserBySession(req);
 if(!u)return res.status(401).json({error:'انتهت الجلسة'});
 if(!Array.isArray(u.pendingGifts))u.pendingGifts=[];
 const idx=u.pendingGifts.findIndex(g=>g.id===String(req.params.id));
 if(idx<0)return res.status(404).json({error:'هذه الهدية غير متاحة أو تم استلامها بالفعل'});
 const gift=u.pendingGifts[idx];
 u.coins=Number(u.coins||0)+Number(gift.amount||0);
 u.pendingGifts.splice(idx,1);
 save();
 res.json({ok:true,amount:Number(gift.amount||0),coins:u.coins});
});
app.post('/api/ref',(req,res)=>{if(!owner(req))return res.status(403).json({error:'لصاحب الموقع فقط'});const amount=Math.max(1,Math.floor(Number(req.body.amount||0)));const maxUses=Math.max(1,Math.floor(Number(req.body.maxUses||0)));let code=(req.body.code||crypto.randomBytes(5).toString('hex')).replace(/[^a-zA-Z0-9_-]/g,'');if(!code)code=crypto.randomBytes(5).toString('hex');if(db.refs[code])return res.status(400).json({error:'الرابط موجود بالفعل'});if(!Number.isFinite(amount)||!Number.isFinite(maxUses))return res.status(400).json({error:'بيانات غير صحيحة'});db.refs[code]={amount,maxUses,createdAt:new Date().toISOString(),usedBy:[]};save();const origin=BASE_URL || `${req.protocol}://${req.get('host')}`;res.json({url:`${origin}/?ref=${encodeURIComponent(code)}`,code,amount,maxUses});});
app.post('/api/ref/:code/claim',(req,res)=>{if(!req.session.user)return res.status(401).json({error:'سجل دخول أولاً'});const r=db.refs[req.params.code],u=getUserBySession(req);if(!u)return res.status(401).json({error:'انتهت الجلسة، سجل دخولك مرة أخرى'});if(!r)return res.status(404).json({error:'الرابط غير موجود'});if(r.usedBy.includes(u.id))return res.json({ok:true,claimed:false,error:'لقد حصلت على جائزة هذا الرابط من قبل'});if(r.usedBy.length>=r.maxUses)return res.status(400).json({error:'انتهت كل استخدامات هذا الرابط'});r.usedBy.push(u.id);u.coins+=r.amount;save();res.json({ok:true,claimed:true,amount:r.amount,coins:u.coins,remaining:r.maxUses-r.usedBy.length});});
app.listen(PORT,()=>console.log(`Falcon on Top running on ${PORT}`));




