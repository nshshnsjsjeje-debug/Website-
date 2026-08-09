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
if(!Array.isArray(db.offers)) db.offers=[];
if(!db.wheel || typeof db.wheel!=='object') db.wheel={};
if(!db.products || typeof db.products!=='object' || Array.isArray(db.products)) db.products={};
if(!Array.isArray(db.favorites)) db.favorites=[];
if(!db.admins || typeof db.admins!=='object' || Array.isArray(db.admins)) db.admins={};
if(!Array.isArray(db.auctions)) db.auctions=[];
if(!db.unlockCodes || typeof db.unlockCodes!=='object' || Array.isArray(db.unlockCodes)) db.unlockCodes={};
if(!db.news || typeof db.news!=='object' || Array.isArray(db.news)) db.news=[];
if(!db.siteConfig || typeof db.siteConfig!=='object' || Array.isArray(db.siteConfig)) db.siteConfig={};
if(!db.siteConfig.banner) db.siteConfig.banner={enabled:false,title:'',text:'',buttonText:'شاهد العرض',buttonUrl:'#home'};
if(!db.siteConfig.home) db.siteConfig.home={tag:'Falcon on Top • ROLE PLAY',title:'مستقبل الـ RP',accent:'يبدأ من هنا.',description:'متجر Falcon on Top الاحترافي. اجمع عملات فالكون يومياً، استلم الهدايا، واحصل على مميزاتك داخل السيرفر.'};
if(!db.maintenance || typeof db.maintenance!=='object') db.maintenance={enabled:false,message:'الموقع تحت الصيانة حالياً. نعود قريباً 🦅'};
const save=()=>fs.writeFileSync(dataPath,JSON.stringify(db,null,2));
const owner=req=>!!(req.session.user && String(req.session.user.username||'').toLowerCase()==='3zazel');
const staff=req=>{const u=getUserBySession(req); return !!(u && (u.owner || u.role==='admin' || db.admins[u.id]));};
const notifyUser=(recipientId,title,text,type='system',sender='النظام')=>{db.notifications.push({id:crypto.randomUUID(),recipientId,title,text,type,sender,createdAt:new Date().toISOString(),readBy:[]});};
const staffOrOwner=req=>staff(req);
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
 res.json({loggedIn:true,user:u,owner:owner(req),staff:staff(req),dailyGranted:changed});
});


const DEFAULT_PRODUCTS={
 customCar:{id:'customCar',name:'عربية مخصصة',icon:'🚘',desc:'عربية بمواصفاتك أنت فقط',price:5000,stock:true},
 gangAlley:{id:'gangAlley',name:'حارة خاصة بعصابتك',icon:'🏴',desc:'حارة خاصة مرتبطة بعصابتك',price:8000,stock:true},
 customSkin:{id:'customSkin',name:'سكن مخصص لك فقط',icon:'🧍',desc:'سكن خاص لا يملكه غيرك',price:7000,stock:true},
 villa:{id:'villa',name:'فيلا خاصة',icon:'🏡',desc:'فيلا خاصة بك داخل السيرفر',price:10000,stock:false},
 vip:{id:'vip',name:'رتبة VIP',icon:'👑',desc:'رتبة VIP بمميزات خاصة',price:3000,stock:false},
 workshop:{id:'workshop',name:'ورشة خاصة',icon:'🔧',desc:'ورشة خاصة بك داخل السيرفر',price:20000,stock:false}
};
function catalog(){ return Object.keys(DEFAULT_PRODUCTS).map(k=>db.products[k] ? {...DEFAULT_PRODUCTS[k],...db.products[k]} : DEFAULT_PRODUCTS[k]); }
function productById(id){ return catalog().find(p=>p.id===id); }
function userCart(u){ if(!u) return []; if(!Array.isArray(db.carts[u.id])) db.carts[u.id]=[]; return db.carts[u.id]; }
function ticketForUser(id,t){return t && t.userId===id;}
function visibleCatalogFor(req){
 const unlocked=Array.isArray(req.session.unlockedProducts)?req.session.unlockedProducts:[];
 return catalog().filter(p=>!p.hiddenByCode || unlocked.includes(p.id));
}
app.get('/api/products',(req,res)=>res.json({products:visibleCatalogFor(req)}));
app.get('/api/unlock-status',(req,res)=>res.json({unlocked:Array.isArray(req.session.unlockedProducts)?req.session.unlockedProducts:[]}));
app.post('/api/unlock-code',(req,res)=>{
 const code=String(req.body.code||'').trim().toUpperCase(); const row=db.unlockCodes[code];
 if(!row)return res.status(404).json({error:'الكود غير صحيح'});
 if(row.expiresAt && new Date(row.expiresAt).getTime()<=Date.now())return res.status(400).json({error:'انتهى وقت الكود'});
 if(row.maxUses && row.usedBy.length>=row.maxUses)return res.status(400).json({error:'انتهت استخدامات الكود'});
 if(!Array.isArray(req.session.unlockedProducts))req.session.unlockedProducts=[];
 if(!req.session.unlockedProducts.includes(row.productId))req.session.unlockedProducts.push(row.productId);
 if(!row.usedBy.includes(req.session.user?.id||'guest'))row.usedBy.push(req.session.user?.id||'guest');
 save(); req.session.save(()=>res.json({ok:true,productId:row.productId,message:'تم فتح المنتج ✓'}));
});
app.post('/api/owner/unlock-codes',(req,res)=>{
 if(!owner(req))return res.status(403).json({error:'لصاحب الموقع فقط'});
 const code=String(req.body.code||'').trim().toUpperCase().replace(/[^A-Z0-9_-]/g,'');
 const productId=String(req.body.productId||'').trim(); const maxUses=Math.max(0,Math.floor(Number(req.body.maxUses||0)));
 const expiresAt=req.body.expiresAt?new Date(req.body.expiresAt).toISOString():'';
 if(!code||!productById(productId))return res.status(400).json({error:'اختر منتجاً واكتب كوداً صحيحاً'});
 if(db.unlockCodes[code])return res.status(400).json({error:'الكود موجود بالفعل'});
 db.unlockCodes[code]={code,productId,maxUses,expiresAt,usedBy:[],createdAt:new Date().toISOString()};save();res.json({ok:true,code:db.unlockCodes[code]});
});
app.get('/api/owner/unlock-codes',(req,res)=>{if(!owner(req))return res.status(403).json({error:'لصاحب الموقع فقط'});res.json({codes:Object.values(db.unlockCodes)});});
app.get('/api/owner/products',(req,res)=>{if(!owner(req))return res.status(403).json({error:'لصاحب الموقع فقط'});res.json({products:catalog()});});
app.get('/api/favorites',(req,res)=>{const u=getUserBySession(req);if(!u)return res.status(401).json({error:'سجل دخولك أولاً'});res.json({favorites:db.favorites.filter(x=>x.userId===u.id).map(x=>x.productId)});});
app.post('/api/favorites/:id',(req,res)=>{const u=getUserBySession(req);if(!u)return res.status(401).json({error:'سجل دخولك أولاً'});const id=req.params.id;if(!productById(id))return res.status(404).json({error:'المنتج غير موجود'});const i=db.favorites.findIndex(x=>x.userId===u.id&&x.productId===id);if(i>=0)db.favorites.splice(i,1);else db.favorites.push({userId:u.id,productId:id,createdAt:new Date().toISOString()});save();res.json({ok:true,favorited:i<0});});
app.get('/api/notifications/all',(req,res)=>{const u=getUserBySession(req);if(!u)return res.status(401).json({error:'سجل الدخول أولاً'});const rows=db.notifications.filter(n=>!n.recipientId||n.recipientId===u.id).slice().reverse().slice(0,50).map(n=>({...n,read:Array.isArray(n.readBy)&&n.readBy.includes(u.id)}));res.json({notifications:rows,unread:rows.filter(n=>!n.read).length});});
app.post('/api/notifications/read-all',(req,res)=>{const u=getUserBySession(req);if(!u)return res.status(401).json({error:'سجل الدخول أولاً'});for(const n of db.notifications.filter(n=>!n.recipientId||n.recipientId===u.id)){n.readBy=Array.isArray(n.readBy)?n.readBy:[];if(!n.readBy.includes(u.id))n.readBy.push(u.id);}save();res.json({ok:true});});
app.post('/api/staff/broadcast',(req,res)=>{if(!staff(req))return res.status(403).json({error:'لصاحب الموقع أو الإدارة فقط'});const title=String(req.body.title||'').trim(),text=String(req.body.text||'').trim(),type=String(req.body.type||'general');if(!title||!text)return res.status(400).json({error:'العنوان والنص مطلوبان'});db.notifications.push({id:crypto.randomUUID(),title,text,type,createdAt:new Date().toISOString(),sender:getUserBySession(req).name,readBy:[]});if(db.notifications.length>200)db.notifications=db.notifications.slice(-200);save();res.json({ok:true,count:Object.keys(db.users).length});});

function activeAuctions(){ return db.auctions.filter(a=>a.status==='active' && (!a.endsAt || new Date(a.endsAt).getTime()>Date.now())); }
app.get('/api/auctions',(req,res)=>{
 const rows=activeAuctions().map(a=>({...a,leader:a.bids?.length?a.bids.slice().sort((x,y)=>y.amount-x.amount)[0]:null,bidCount:(a.bids||[]).length}));
 res.json({auctions:rows});
});
app.get('/api/auctions/:id',(req,res)=>{const a=db.auctions.find(x=>x.id===req.params.id);if(!a)return res.status(404).json({error:'المزاد غير موجود'});const leader=(a.bids||[]).slice().sort((x,y)=>y.amount-x.amount)[0]||null;res.json({auction:{...a,leader,bidCount:(a.bids||[]).length}});});
app.post('/api/auctions/:id/bid',(req,res)=>{
 const u=getUserBySession(req); if(!u)return res.status(401).json({error:'سجل دخولك أولاً'});
 const a=db.auctions.find(x=>x.id===req.params.id); if(!a||a.status!=='active'||(a.endsAt&&new Date(a.endsAt).getTime()<=Date.now()))return res.status(400).json({error:'المزاد انتهى أو غير متاح'});
 const amount=Math.floor(Number(req.body.amount||0)); const current=Math.max(Number(a.startBid||1),...(a.bids||[]).map(b=>Number(b.amount)||0));
 if(!Number.isFinite(amount)||amount<=current)return res.status(400).json({error:`يجب أن تكون المزايدة أعلى من ${current.toLocaleString('ar-EG')} عملة`});
 if(amount>Number(u.coins||0))return res.status(400).json({error:'لا تملك عملات كافية لهذه المزايدة'});
 a.bids=Array.isArray(a.bids)?a.bids:[];a.bids.push({id:crypto.randomUUID(),userId:u.id,user:u.name,amount,date:new Date().toISOString()});
 const old=a.bids.slice(0,-1).filter(b=>b.userId!==u.id).sort((x,y)=>y.amount-x.amount)[0];
 if(old){const oldUser=Object.values(db.users).find(x=>x.id===old.userId);if(oldUser)db.notifications.push({id:crypto.randomUUID(),recipientId:oldUser.id,type:'auction',title:'⚡ تم رفع المزايدة عليك',text:`تم رفع مزايدتك في ${a.title}. أعلى مزايدة الآن ${amount.toLocaleString('ar-EG')} عملة.`,createdAt:new Date().toISOString(),readBy:[]});}
 save();res.json({ok:true,current:amount,leader:{user:u.name,amount},message:'تم تسجيل مزايدتك ✓'});
});
app.post('/api/owner/auctions',(req,res)=>{
 if(!owner(req))return res.status(403).json({error:'لصاحب الموقع فقط'});
 const title=String(req.body.title||'').trim(),desc=String(req.body.desc||'').trim(),icon=String(req.body.icon||'🚘').trim(),details=String(req.body.details||'').trim();
 const startBid=Math.max(1,Math.floor(Number(req.body.startBid||1))),endsAt=req.body.endsAt?new Date(req.body.endsAt).toISOString():'';
 if(!title||!desc||!endsAt)return res.status(400).json({error:'اكتب اسم المزاد والوصف وموعد الانتهاء'});
 const a={id:crypto.randomUUID(),title,desc,icon,details,startBid,endsAt,status:'active',bids:[],createdAt:new Date().toISOString()};db.auctions.unshift(a);save();res.json({ok:true,auction:a});
});
app.post('/api/owner/auctions/:id/close',(req,res)=>{
 if(!owner(req))return res.status(403).json({error:'لصاحب الموقع فقط'});const a=db.auctions.find(x=>x.id===req.params.id);if(!a)return res.status(404).json({error:'المزاد غير موجود'});
 const winner=(a.bids||[]).slice().sort((x,y)=>y.amount-x.amount)[0]||null;a.status='closed';a.closedAt=new Date().toISOString();a.winner=winner||null;
 if(winner){const u=Object.values(db.users).find(x=>x.id===winner.userId);if(u)db.notifications.push({id:crypto.randomUUID(),recipientId:u.id,type:'auction',title:'🏆 أنت الفائز في المزاد!',text:`فزت في مزاد ${a.title} بأعلى مزايدة ${winner.amount.toLocaleString('ar-EG')} عملة. تواصل مع الدعم لإتمام التسليم.`,createdAt:new Date().toISOString(),readBy:[]});}
 save();res.json({ok:true,winner});
});
app.delete('/api/owner/auctions/:id',(req,res)=>{if(!owner(req))return res.status(403).json({error:'لصاحب الموقع فقط'});db.auctions=db.auctions.filter(x=>x.id!==req.params.id);save();res.json({ok:true});});

app.post('/api/owner/products',(req,res)=>{if(!owner(req))return res.status(403).json({error:'لصاحب الموقع فقط'});const id=String(req.body.id||'').trim()||'p_'+crypto.randomUUID().slice(0,8),name=String(req.body.name||'').trim(),icon=String(req.body.icon||'🛍️').trim(),desc=String(req.body.desc||'').trim(),price=Math.floor(Number(req.body.price)),stock=!!req.body.stock,hiddenByCode=!!req.body.hiddenByCode;if(!name||!Number.isFinite(price)||price<0)return res.status(400).json({error:'بيانات المنتج غير صحيحة'});db.products[id]={id,name,icon,desc,price,stock,hiddenByCode};save();res.json({ok:true,product:productById(id)});});
app.delete('/api/owner/products/:id',(req,res)=>{if(!owner(req))return res.status(403).json({error:'لصاحب الموقع فقط'});delete db.products[req.params.id];save();res.json({ok:true});});
app.post('/api/owner/admin',(req,res)=>{if(!owner(req))return res.status(403).json({error:'لصاحب الموقع فقط'});const username=String(req.body.username||'').trim().toLowerCase(),u=Object.values(db.users).find(x=>x.username.toLowerCase()===username);if(!u)return res.status(404).json({error:'المستخدم غير موجود'});u.role='admin';db.admins[u.id]=true;save();res.json({ok:true});});
app.delete('/api/owner/admin/:id',(req,res)=>{if(!owner(req))return res.status(403).json({error:'لصاحب الموقع فقط'});const u=Object.values(db.users).find(x=>x.id===req.params.id);if(u)delete u.role;delete db.admins[req.params.id];save();res.json({ok:true});});
app.get('/api/dashboard',(req,res)=>{const u=getUserBySession(req);if(!u)return res.status(401).json({error:'سجل دخولك أولاً'});res.json({user:u,orders:db.orders.filter(o=>o.userId===u.id),tickets:db.tickets.filter(t=>ticketForUser(u.id,t))});});
app.get('/api/cart',(req,res)=>{const u=getUserBySession(req);if(!u)return res.status(401).json({error:'سجل دخولك أولاً'});res.json({cart:userCart(u)});});
app.post('/api/cart',(req,res)=>{const u=getUserBySession(req);if(!u)return res.status(401).json({error:'سجل دخولك أولاً'});const p=productById(req.body.product);if(!p)return res.status(400).json({error:'منتج غير صالح'});if(!p.stock)return res.status(400).json({error:'هذا المنتج Un stock حالياً'});const c=userCart(u),existing=c.find(x=>x.product===req.body.product);if(existing)existing.qty+=1;else c.push({product:req.body.product,name:p.name,price:p.price,qty:1});save();res.json({ok:true,cart:c});});
app.delete('/api/cart/:product',(req,res)=>{const u=getUserBySession(req);if(!u)return res.status(401).json({error:'سجل دخولك أولاً'});db.carts[u.id]=userCart(u).filter(x=>x.product!==req.params.product);save();res.json({ok:true,cart:db.carts[u.id]});});
app.post('/api/cart/checkout',(req,res)=>{const u=getUserBySession(req);if(!u)return res.status(401).json({error:'سجل دخولك أولاً'});const note=String(req.body.note||'').trim();const couponCode=String(req.body.couponCode||'').trim().toUpperCase();if(!note)return res.status(400).json({error:'اكتب اسمك في ديسكورد أو البيانات المطلوبة'});const c=userCart(u);if(!c.length)return res.status(400).json({error:'السلة فارغة'});let total=c.reduce((a,x)=>a+Number(x.price)*Number(x.qty),0);let discount=0;let coupon=null;if(couponCode){coupon=db.coupons[couponCode];if(!coupon)return res.status(400).json({error:'الكوبون غير موجود'});if(coupon.usedBy.includes(u.id))return res.status(400).json({error:'استخدمت هذا الكوبون من قبل'});if(coupon.maxUses&&coupon.usedBy.length>=coupon.maxUses)return res.status(400).json({error:'انتهت استخدامات الكوبون'});discount=Math.floor(total*coupon.percent/100);total-=discount;}if(u.coins<total)return res.status(400).json({code:'NO_COINS',error:'ليس لديك عملات فالكون كافية'});for(const item of c){for(let i=0;i<Number(item.qty||1);i++)db.orders.unshift({id:crypto.randomUUID(),userId:u.id,user:u.name,product:item.name,price:item.price,note,date:new Date().toISOString(),status:'جديد'});}u.coins-=total;if(coupon)coupon.usedBy.push(u.id);db.carts[u.id]=[];save();res.json({ok:true,coins:u.coins,cart:[],total,discount});});
app.get('/api/tickets',(req,res)=>{const u=getUserBySession(req);if(!u)return res.status(401).json({error:'سجل دخولك أولاً'});res.json({tickets:db.tickets.filter(t=>t.userId===u.id)});});
app.post('/api/tickets',(req,res)=>{const u=getUserBySession(req);if(!u)return res.status(401).json({error:'سجل دخولك أولاً'});const subject=String(req.body.subject||'').trim(),message=String(req.body.message||'').trim();if(!subject||!message)return res.status(400).json({error:'عنوان التذكرة والرسالة مطلوبان'});const t={id:crypto.randomUUID(),userId:u.id,user:u.name,subject,message,status:'مفتوحة',createdAt:new Date().toISOString(),replies:[]};db.tickets.unshift(t);save();res.json({ok:true,ticket:t});});
app.post('/api/tickets/:id/reply',(req,res)=>{const u=getUserBySession(req);if(!u)return res.status(401).json({error:'سجل دخولك أولاً'});const t=db.tickets.find(x=>x.id===req.params.id&&x.userId===u.id);if(!t)return res.status(404).json({error:'التذكرة غير موجودة'});const text=String(req.body.text||'').trim();if(!text)return res.status(400).json({error:'اكتب الرد'});t.replies.push({from:u.name,text,date:new Date().toISOString()});t.status='مفتوحة';save();res.json({ok:true,ticket:t});});
app.post('/api/owner/order-status',(req,res)=>{if(!staffOrOwner(req))return res.status(403).json({error:'للإدارة أو صاحب الموقع فقط'});const o=db.orders.find(x=>x.id===String(req.body.id||''));const status=String(req.body.status||'').trim();const allowed=['جديد','قيد المراجعة','قيد التجهيز','تم التسليم','ملغي'];if(!o||!allowed.includes(status))return res.status(400).json({error:'بيانات الحالة غير صحيحة'});o.status=status;notifyUser(o.userId,'تحديث طلبك 📦',`تم تحديث طلب ${o.product} إلى: ${status}`,'system','إدارة Falcon');save();res.json({ok:true,order:o});});
app.get('/api/owner/tickets',(req,res)=>{if(!owner(req))return res.status(403).json({error:'لصاحب الموقع فقط'});res.json({tickets:db.tickets});});
app.post('/api/owner/tickets/:id/reply',(req,res)=>{if(!staffOrOwner(req))return res.status(403).json({error:'للإدارة أو صاحب الموقع فقط'});const t=db.tickets.find(x=>x.id===req.params.id);if(!t)return res.status(404).json({error:'التذكرة غير موجودة'});const text=String(req.body.text||'').trim();if(!text)return res.status(400).json({error:'اكتب الرد'});t.replies.push({from:'الدعم الفني',text,date:new Date().toISOString()});t.status='تم الرد';notifyUser(t.userId,'رد جديد من الدعم الفني 🎧',text,'system','الدعم الفني');save();res.json({ok:true,ticket:t});});
app.post('/api/owner/tickets/:id/status',(req,res)=>{if(!staffOrOwner(req))return res.status(403).json({error:'للإدارة أو صاحب الموقع فقط'});const t=db.tickets.find(x=>x.id===req.params.id);const status=String(req.body.status||'').trim();if(!t||!['مفتوحة','قيد المتابعة','تم الحل','مغلقة'].includes(status))return res.status(400).json({error:'بيانات غير صحيحة'});t.status=status;notifyUser(t.userId,'تحديث تذكرة الدعم 🎫',`تم تحديث تذكرتك إلى: ${status}`,'system','الدعم الفني');save();res.json({ok:true,ticket:t});});



app.get('/api/site/config',(req,res)=>{res.json({banner:db.siteConfig.banner,home:db.siteConfig.home,maintenance:db.maintenance});});
app.get('/api/news',(req,res)=>{res.json({news:db.news.slice(0,30)});});
app.get('/api/owner/dashboard',(req,res)=>{if(!staff(req))return res.status(403).json({error:'للإدارة أو صاحب الموقع فقط'});const users=Object.values(db.users);res.json({users:users.length,coins:users.reduce((a,u)=>a+Number(u.coins||0),0),orders:db.orders.length,newOrders:db.orders.filter(o=>['جديد','قيد المراجعة'].includes(o.status)).length,tickets:db.tickets.length,openTickets:db.tickets.filter(t=>!['تم الحل','مغلقة'].includes(t.status)).length,support:db.messages.length,auctions:db.auctions.filter(a=>a.status==='active'&&new Date(a.endsAt).getTime()>Date.now()).length,news:db.news.length});});
app.post('/api/owner/maintenance',(req,res)=>{if(!owner(req))return res.status(403).json({error:'لصاحب الموقع فقط'});db.maintenance={enabled:!!req.body.enabled,message:String(req.body.message||'الموقع تحت الصيانة حالياً. نعود قريباً 🦅').trim()||'الموقع تحت الصيانة حالياً. نعود قريباً 🦅'};save();res.json({ok:true,maintenance:db.maintenance});});
app.post('/api/owner/banner',(req,res)=>{if(!owner(req))return res.status(403).json({error:'لصاحب الموقع فقط'});db.siteConfig.banner={enabled:!!req.body.enabled,title:String(req.body.title||'').trim(),text:String(req.body.text||'').trim(),buttonText:String(req.body.buttonText||'شاهد العرض').trim(),buttonUrl:String(req.body.buttonUrl||'#home').trim()||'#home'};save();res.json({ok:true,banner:db.siteConfig.banner});});
app.post('/api/owner/home',(req,res)=>{if(!owner(req))return res.status(403).json({error:'لصاحب الموقع فقط'});db.siteConfig.home={tag:String(req.body.tag||'').trim(),title:String(req.body.title||'').trim(),accent:String(req.body.accent||'').trim(),description:String(req.body.description||'').trim()};save();res.json({ok:true,home:db.siteConfig.home});});
app.post('/api/owner/news',(req,res)=>{if(!owner(req))return res.status(403).json({error:'لصاحب الموقع فقط'});const title=String(req.body.title||'').trim(),text=String(req.body.text||'').trim();if(!title||!text)return res.status(400).json({error:'عنوان الخبر ومحتواه مطلوبان'});const n={id:crypto.randomUUID(),title,text,createdAt:new Date().toISOString()};db.news.unshift(n);save();res.json({ok:true,news:n});});
app.delete('/api/owner/news/:id',(req,res)=>{if(!owner(req))return res.status(403).json({error:'لصاحب الموقع فقط'});db.news=db.news.filter(n=>n.id!==req.params.id);save();res.json({ok:true});});
app.post('/api/settings',(req,res)=>{
 const u=getUserBySession(req); if(!u)return res.status(401).json({error:'سجل دخولك أولاً'});
 const username=String(req.body.username||'').trim(),oldPassword=String(req.body.oldPassword||''),newPassword=String(req.body.newPassword||'');
 if(u.owner && username.toLowerCase()!=='3zazel')return res.status(400).json({error:'اسم صاحب الموقع لا يمكن تغييره من هنا.'});
 if(!validUsername(username))return res.status(400).json({error:'اسم المستخدم يجب أن يكون من 3 إلى 20 حرفاً ورقماً.'});
 const sameKey=Object.keys(db.users).find(k=>db.users[k]===u);
 const existing=Object.keys(db.users).find(k=>k.toLowerCase()===username.toLowerCase());
 if(existing && db.users[existing]!==u)return res.status(400).json({error:'اسم المستخدم مستخدم بالفعل.'});
 if(newPassword && !validPassword(newPassword))return res.status(400).json({error:'كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل.'});
 if(username!==u.username || newPassword){
   if(!oldPassword)return res.status(400).json({error:'اكتب كلمة المرور الحالية لتعديل الحساب.'});
   const h=hashPassword(oldPassword,u.passwordSalt);
   if(!crypto.timingSafeEqual(Buffer.from(h,'hex'),Buffer.from(u.passwordHash,'hex')))return res.status(400).json({error:'كلمة المرور الحالية غير صحيحة.'});
 }
 if(username!==u.username){delete db.users[sameKey];u.username=username;u.name=username;db.users[username.toLowerCase()]=u;}
 if(newPassword){const salt=crypto.randomBytes(16).toString('hex');u.passwordSalt=salt;u.passwordHash=hashPassword(newPassword,salt);}
 req.session.user={id:u.id,username:u.username,name:u.name};save();
 res.json({ok:true,user:u});
});
app.get('/api/offers',(req,res)=>{
 const now=Date.now();db.offers=db.offers.filter(o=>new Date(o.endsAt).getTime()>now);save();
 res.json({offers:db.offers});
});
app.post('/api/owner/offers',(req,res)=>{
 if(!owner(req))return res.status(403).json({error:'لصاحب الموقع فقط'});
 const title=String(req.body.title||'').trim(),desc=String(req.body.desc||'').trim(),price=Math.floor(Number(req.body.price)),endsAt=new Date(req.body.endsAt);
 if(!title||!desc||!price||Number.isNaN(endsAt.getTime())||endsAt.getTime()<=Date.now())return res.status(400).json({error:'بيانات العرض غير صحيحة أو انتهى الوقت.'});
 const o={id:crypto.randomUUID(),title,desc,price,endsAt:endsAt.toISOString(),createdAt:new Date().toISOString()};
 db.offers.unshift(o);save();res.json({ok:true,offer:o});
});
const DEFAULT_WHEEL={enabled:true,cost:0,dailyLimit:1,prizes:[{amount:0,label:'حظ أوفر',weight:35},{amount:25,label:'25 عملة',weight:25},{amount:50,label:'50 عملة',weight:20},{amount:100,label:'100 عملة',weight:15},{amount:250,label:'250 عملة',weight:5}]};
function wheelConfig(){return {...DEFAULT_WHEEL,...db.wheel,prizes:Array.isArray(db.wheel.prizes)&&db.wheel.prizes.length?db.wheel.prizes:DEFAULT_WHEEL.prizes};}
app.get('/api/wheel/config',(req,res)=>res.json({wheel:wheelConfig()}));
app.post('/api/owner/wheel',(req,res)=>{if(!owner(req))return res.status(403).json({error:'لصاحب الموقع فقط'});const enabled=!!req.body.enabled,cost=Math.max(0,Math.floor(Number(req.body.cost||0))),dailyLimit=Math.max(1,Math.floor(Number(req.body.dailyLimit||1)));let prizes=req.body.prizes;if(typeof prizes==='string'){try{prizes=JSON.parse(prizes)}catch(e){prizes=null}}if(!Array.isArray(prizes)||!prizes.length)return res.status(400).json({error:'أضف جائزة واحدة على الأقل'});prizes=prizes.map(x=>({amount:Math.max(0,Math.floor(Number(x.amount||0))),label:String(x.label||`${Number(x.amount||0)} عملة`).trim(),weight:Math.max(1,Number(x.weight||1))})).filter(x=>x.label);db.wheel={enabled,cost,dailyLimit,prizes};save();res.json({ok:true,wheel:wheelConfig()});});
app.post('/api/wheel',(req,res)=>{
 const u=getUserBySession(req);if(!u)return res.status(401).json({error:'سجل دخولك أولاً'});const cfg=wheelConfig();if(!cfg.enabled)return res.status(400).json({error:'عجلة الحظ متوقفة حالياً'});
 const key=todayKey();u.wheelUses=u.wheelUses||{};const used=Number(u.wheelUses[key]||0);if(used>=cfg.dailyLimit)return res.status(400).json({error:'انتهت لفاتك اليوم. ارجع غداً.'});
 if(u.coins<cfg.cost)return res.status(400).json({error:'ليس لديك عملات كافية للفة'});u.coins-=cfg.cost;const total=cfg.prizes.reduce((a,x)=>a+Number(x.weight),0);let n=Math.random()*total,r=cfg.prizes[0];for(const prize of cfg.prizes){n-=Number(prize.weight);if(n<=0){r=prize;break;}}u.coins+=Number(r.amount);u.wheelUses[key]=used+1;save();res.json({ok:true,amount:r.amount,message:`${r.label}${r.amount?' — ربحت '+r.amount.toLocaleString('ar-EG')+' عملة فالكون!':'!'}`,coins:u.coins,cost:cfg.cost});
});
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
 const u=getUserBySession(req), rawProduct=String(req.body.product||''), note=String(req.body.note||'').trim();
 let price=0,name='',stock=false;
 if(rawProduct.startsWith('offer:')){
   const o=db.offers.find(x=>x.id===rawProduct.slice(6) && new Date(x.endsAt).getTime()>Date.now());
   if(!o)return res.status(400).json({error:'العرض غير موجود أو انتهى.'});
   price=Number(o.price);name=o.title;stock=true;
 }else{
   const p=PRODUCT_CATALOG[rawProduct];
   if(!p)return res.status(400).json({error:'منتج غير صالح'});
   price=Number(p.price);name=p.name;stock=!!p.stock;
 }
 if(!stock)return res.status(400).json({error:'هذا المنتج Un stock حالياً'});
 if(!note)return res.status(400).json({error:'اكتب مواصفات الطلب واسمك في ديسكورد والمعلومات المطلوبة'});
 if(!u)return res.status(401).json({error:'انتهت الجلسة، سجل دخولك مرة أخرى'});
 if(u.coins<prices[product])return res.status(400).json({code:'NO_COINS',error:'ليس لديك عملات فالكون كافية'});
 u.coins-=prices[product];db.orders.unshift({id:crypto.randomUUID(),userId:u.id,user:u.name,email:u.email,product:names[product],price:prices[product],note:String(note).trim(),date:new Date().toISOString(),status:'جديد'});save();
 res.json({ok:true,coins:u.coins,message:'تم إرسال طلب الشراء للدعم الفني وسيتم التواصل معك.'});
});
app.post('/api/support',(req,res)=>{if(!req.session.user)return res.status(401).json({error:'سجل دخول بحسابك أولاً'});if(!req.body.message?.trim())return res.status(400).json({error:'اكتب رسالتك أولاً'});const u=getUserBySession(req);if(!u)return res.status(401).json({error:'انتهت الجلسة، سجل دخولك مرة أخرى'});db.messages.unshift({id:crypto.randomUUID(),userId:u.id,user:u.name,email:u.email,message:req.body.message.trim(),date:new Date().toISOString()});save();res.json({ok:true,message:'تم إرسال رسالتك للدعم الفني'});});

app.get('/api/owner',(req,res)=>{if(!staff(req))return res.status(403).json({error:'لصاحب الموقع فقط'});res.json({purchases:db.orders,supportMessages:db.messages,tickets:db.tickets,refs:db.refs,auctions:db.auctions,unlockCodes:Object.values(db.unlockCodes),users:Object.values(db.users).map(u=>({id:u.id,user:u.name,email:u.email,coins:u.coins}))});});
app.get('/api/notifications',(req,res)=>{
 if(!req.session.user)return res.json({notifications:[]});
 const u=getUserBySession(req); if(!u)return res.json({notifications:[]});
 const unread=db.notifications.filter(n=>(!n.recipientId || n.recipientId===u.id) && !(n.readBy||[]).includes(u.id)).slice(-10);
 res.json({notifications:unread});
});
app.post('/api/notifications/read',(req,res)=>{
 if(!req.session.user)return res.status(401).json({error:'سجل الدخول أولاً'});
 const u=getUserBySession(req),n=db.notifications.find(x=>x.id===String(req.body.id||''));
 if(n&&u){if(!Array.isArray(n.readBy))n.readBy=[];if(!n.readBy.includes(u.id))n.readBy.push(u.id);save();}
 res.json({ok:true});
});
app.post('/api/owner/broadcast',(req,res)=>{
 if(!staff(req))return res.status(403).json({error:'لصاحب الموقع فقط'});
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




