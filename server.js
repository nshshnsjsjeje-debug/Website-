require("dotenv").config();
const express=require("express"),session=require("express-session"),fs=require("fs"),path=require("path"),crypto=require("crypto");
const app=express(),PORT=process.env.PORT||3000;
const dataPath=path.join(__dirname,"data/store.json");
if(!fs.existsSync(path.dirname(dataPath)))fs.mkdirSync(path.dirname(dataPath),{recursive:true});
if(!fs.existsSync(dataPath))fs.writeFileSync(dataPath,JSON.stringify({users:{},orders:[],messages:[],refs:{}},null,2));
let db=JSON.parse(fs.readFileSync(dataPath));
const save=()=>fs.writeFileSync(dataPath,JSON.stringify(db,null,2));
const owner=req=>req.session.user&&req.session.user.id===process.env.DISCORD_OWNER_ID;
app.use(express.json());app.use(express.urlencoded({extended:true}));
app.use(session({secret:process.env.SESSION_SECRET||"falcon-secret",resave:false,saveUninitialized:false,cookie:{httpOnly:true,sameSite:"lax"}}));
app.use(express.static(path.join(__dirname,"public")));

app.get("/auth/discord",(req,res)=>{
 const p=new URLSearchParams({client_id:process.env.DISCORD_CLIENT_ID,redirect_uri:`${process.env.BASE_URL}/auth/discord/callback`,response_type:"code",scope:"identify email guilds"});
 res.redirect("https://discord.com/oauth2/authorize?"+p);
});
app.get("/auth/discord/callback",async(req,res)=>{
 try{
  const body=new URLSearchParams({client_id:process.env.DISCORD_CLIENT_ID,client_secret:process.env.DISCORD_CLIENT_SECRET,grant_type:"authorization_code",code:req.query.code,redirect_uri:`${process.env.BASE_URL}/auth/discord/callback`});
  const t=await fetch("https://discord.com/api/oauth2/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body});
  const token=await t.json();
  const u=await fetch("https://discord.com/api/users/@me",{headers:{Authorization:`Bearer ${token.access_token}`}});
  const user=await u.json();
  const now=new Date(),id=user.id;
  if(!db.users[id])db.users[id]={id,username:user.username,global_name:user.global_name||user.username,avatar:user.avatar,coins:50,lastDaily:now.toISOString()};
  else {db.users[id].username=user.username;db.users[id].global_name=user.global_name||user.username; if(new Date(db.users[id].lastDaily).toDateString()!==now.toDateString()){db.users[id].coins+=50;db.users[id].lastDaily=now.toISOString();}}
  req.session.user={id,username:user.username,global_name:user.global_name||user.username,avatar:user.avatar};save();res.redirect("/");
 }catch(e){res.status(500).send("فشل تسجيل الدخول عبر Discord.");}
});
app.get("/api/me",(req,res)=>{
 if(!req.session.user)return res.json({loggedIn:false});
 const u=db.users[req.session.user.id];res.json({loggedIn:true,user:u,owner:owner(req)});
});
app.post("/api/order",(req,res)=>{
 if(!req.session.user)return res.status(401).json({error:"سجل دخول أولاً"});
 const prices={car:5000,villa:10000,vip:3000,workshop:20000},names={car:"سيارة خاصة",villa:"فيلا خاصة",vip:"رتبة VIP",workshop:"ورشة خاصة"};
 const {product,note}=req.body,u=db.users[req.session.user.id];
 if(!prices[product])return res.status(400).json({error:"منتج غير صالح"});
 if(!note||!String(note).trim())return res.status(400).json({error:"اكتب اسمك في ديسكورد أو الرسالة المطلوبة"});
 if(u.coins<prices[product])return res.status(400).json({error:"عملات فالكون غير كافية"});
 u.coins-=prices[product];
 db.orders.unshift({
  id:crypto.randomUUID(),userId:u.id,user:u.global_name,username:u.username,
  product:names[product],price:prices[product],note:String(note).trim(),
  date:new Date().toISOString(),status:"جديد"
});
save();
res.json({
  ok:true,coins:u.coins,
  message:"تم استلام طلبك، وسيتم التواصل معك من الدعم الفني لإتمام عملية الشراء."
});
});
app.post("/api/support",(req,res)=>{
 if(!req.session.user)return res.status(401).json({error:"سجل دخول أولاً"});
 if(!req.body.message?.trim())return res.status(400).json({error:"اكتب رسالتك"});
 const u=db.users[req.session.user.id];
 db.messages.unshift({id:crypto.randomUUID(),userId:u.id,user:u.global_name,username:u.username,message:req.body.message.trim(),date:new Date().toISOString()});save();
 res.json({ok:true});
});
app.get("/api/owner",(req,res)=>{
 if(!owner(req))return res.status(403).json({error:"لصاحب الموقع فقط"});
 res.json({
  purchases:db.orders,
  supportMessages:db.messages,
  refs:db.refs,
  users:Object.values(db.users).map(u=>({id:u.id,user:u.global_name,username:u.username,coins:u.coins}))
});
});
app.post("/api/ref",(req,res)=>{
 if(!owner(req))return res.status(403).json({error:"لصاحب الموقع فقط"});
 const amount=Math.max(1,Number(req.body.amount||0));
 const maxUses=Math.max(1,Math.floor(Number(req.body.maxUses||0)));
 let code=(req.body.code||crypto.randomBytes(5).toString("hex")).replace(/[^a-zA-Z0-9_-]/g,"");
 if(!code) code=crypto.randomBytes(5).toString("hex");
 if(db.refs[code])return res.status(400).json({error:"الرابط موجود بالفعل"});
 if(!Number.isFinite(amount)||!Number.isFinite(maxUses))return res.status(400).json({error:"بيانات غير صحيحة"});
 db.refs[code]={amount,maxUses,createdAt:new Date().toISOString(),usedBy:[]};
 save();
 res.json({url:`${process.env.BASE_URL}/?ref=${code}`,code,amount,maxUses});
});
app.get("/api/ref/:code",(req,res)=>{
 const r=db.refs[req.params.code];if(!r)return res.status(404).json({error:"الرابط غير موجود"});
 res.json({ok:true});
});
app.post("/api/ref/:code/claim",(req,res)=>{
 if(!req.session.user)return res.status(401).json({error:"سجل دخول أولاً"});
 const r=db.refs[req.params.code],u=db.users[req.session.user.id];
 if(!r)return res.status(404).json({error:"الرابط غير موجود"});
 if(r.usedBy.includes(u.id))return res.json({ok:true,claimed:false});
 if(r.usedBy.length >= r.maxUses)return res.status(400).json({error:"انتهت كل استخدامات هذا الرابط"});
 r.usedBy.push(u.id);u.coins+=r.amount;save();
 res.json({ok:true,claimed:true,amount:r.amount,coins:u.coins,remaining:r.maxUses-r.usedBy.length});
});
app.listen(PORT,()=>console.log(`Falcon RP running on ${PORT}`));
