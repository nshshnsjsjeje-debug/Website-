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
if(!fs.existsSync(dataPath))fs.writeFileSync(dataPath,JSON.stringify({users:{},orders:[],messages:[],refs:{}},null,2));
let db=JSON.parse(fs.readFileSync(dataPath,'utf8'));
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
   req.session.user={id,username,name:username};
   save();
   res.json({ok:true,user:u,message:'تم إنشاء الحساب بنجاح'});
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
   res.json({ok:true,user:u,dailyGranted,message:'تم تسجيل الدخول'});
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

app.get('/api/owner',(req,res)=>{if(!owner(req))return res.status(403).json({error:'لصاحب الموقع فقط'});res.json({purchases:db.orders,supportMessages:db.messages,refs:db.refs,users:Object.values(db.users).map(u=>({id:u.id,user:u.name,email:u.email,coins:u.coins}))});});
app.post('/api/ref',(req,res)=>{if(!owner(req))return res.status(403).json({error:'لصاحب الموقع فقط'});const amount=Math.max(1,Math.floor(Number(req.body.amount||0)));const maxUses=Math.max(1,Math.floor(Number(req.body.maxUses||0)));let code=(req.body.code||crypto.randomBytes(5).toString('hex')).replace(/[^a-zA-Z0-9_-]/g,'');if(!code)code=crypto.randomBytes(5).toString('hex');if(db.refs[code])return res.status(400).json({error:'الرابط موجود بالفعل'});if(!Number.isFinite(amount)||!Number.isFinite(maxUses))return res.status(400).json({error:'بيانات غير صحيحة'});db.refs[code]={amount,maxUses,createdAt:new Date().toISOString(),usedBy:[]};save();const origin=BASE_URL || `${req.protocol}://${req.get('host')}`;res.json({url:`${origin}/?ref=${encodeURIComponent(code)}`,code,amount,maxUses});});
app.post('/api/ref/:code/claim',(req,res)=>{if(!req.session.user)return res.status(401).json({error:'سجل دخول أولاً'});const r=db.refs[req.params.code],u=getUserBySession(req);if(!u)return res.status(401).json({error:'انتهت الجلسة، سجل دخولك مرة أخرى'});if(!r)return res.status(404).json({error:'الرابط غير موجود'});if(r.usedBy.includes(u.id))return res.json({ok:true,claimed:false,error:'لقد حصلت على جائزة هذا الرابط من قبل'});if(r.usedBy.length>=r.maxUses)return res.status(400).json({error:'انتهت كل استخدامات هذا الرابط'});r.usedBy.push(u.id);u.coins+=r.amount;save();res.json({ok:true,claimed:true,amount:r.amount,coins:u.coins,remaining:r.maxUses-r.usedBy.length});});
app.listen(PORT,()=>console.log(`Falcon on Top running on ${PORT}`));


/* Falcon on Top global UI motion helpers */
(function(){
  function mark(el, cls){
    if(!el) return;
    el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
  }
  window.falcon-on-topAnimate = function(el){ mark(el,'falcon-on-top-success'); };
  document.addEventListener('click', function(e){
    const b=e.target.closest('button,.btn,a');
    if(b) { b.classList.remove('falcon-on-top-click'); void b.offsetWidth; b.classList.add('falcon-on-top-click'); }
  });
})();

