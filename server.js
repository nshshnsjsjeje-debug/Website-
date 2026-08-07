const express=require("express");
const session=require("express-session");
const crypto=require("crypto");
const path=require("path");
const app=express();

app.use(express.json());
app.use(express.urlencoded({extended:true}));
app.use(session({
  secret:process.env.SESSION_SECRET||"change-this-secret",
  resave:false,saveUninitialized:false,
  cookie:{httpOnly:true,sameSite:"lax",secure:false}
}));
app.use(express.static(path.join(__dirname,"public")));

const CLIENT_ID=process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET=process.env.DISCORD_CLIENT_SECRET;
const REDIRECT_URI=process.env.DISCORD_REDIRECT_URI;

const users=new Map();
const gifts=new Map();

function today(){return new Date().toISOString().slice(0,10)}
function getUser(discord){
  if(!users.has(discord.id)) users.set(discord.id,{
    id:discord.id, username:discord.username, avatar:discord.avatar,
    coins:10,lastDaily:today()
  });
  const u=users.get(discord.id);
  u.username=discord.username;u.avatar=discord.avatar;
  return u;
}

app.get("/auth/discord",(req,res)=>{
  if(!CLIENT_ID||!REDIRECT_URI) return res.status(500).send("ضع Discord Client ID و Redirect URI في Environment Variables");
  const params=new URLSearchParams({
    client_id:CLIENT_ID,
    redirect_uri:REDIRECT_URI,
    response_type:"code",
    scope:"identify"
  });
  res.redirect("https://discord.com/oauth2/authorize?"+params.toString());
});

app.get("/auth/discord/callback",async(req,res)=>{
  try{
    if(!req.query.code) return res.status(400).send("Missing code");
    const tokenBody=new URLSearchParams({
      client_id:CLIENT_ID,client_secret:CLIENT_SECRET,
      grant_type:"authorization_code",code:req.query.code,
      redirect_uri:REDIRECT_URI
    });
    const tokenRes=await fetch("https://discord.com/api/oauth2/token",{
      method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},
      body:tokenBody
    });
    const token=await tokenRes.json();
    if(!token.access_token) return res.status(400).send("Discord OAuth failed");
    const meRes=await fetch("https://discord.com/api/users/@me",{
      headers:{Authorization:`Bearer ${token.access_token}`}
    });
    const discord=await meRes.json();
    const u=getUser(discord);
    req.session.userId=u.id;
    res.redirect("/");
  }catch(e){console.error(e);res.status(500).send("Login error")}
});

app.get("/api/me",(req,res)=>{
  if(!req.session.userId) return res.json({loggedIn:false});
  const u=users.get(req.session.userId);
  if(!u) return res.json({loggedIn:false});
  res.json({loggedIn:true,user:u});
});

app.post("/api/daily",(req,res)=>{
  if(!req.session.userId) return res.status(401).json({error:"سجل دخول Discord أولًا"});
  const u=users.get(req.session.userId), d=today();
  if(u.lastDaily===d) return res.json({ok:false,coins:u.coins,message:"استلمت مكافأة اليوم بالفعل"});
  u.coins+=10;u.lastDaily=d;
  res.json({ok:true,coins:u.coins,message:"تمت إضافة 10 Coins"});
});

app.post("/api/purchase",(req,res)=>{
  if(!req.session.userId) return res.status(401).json({error:"سجل دخول Discord أولًا"});
  const u=users.get(req.session.userId),item=String(req.body.item||"");
  if(u.coins<20)return res.status(400).json({error:"رصيدك غير كافٍ"});
  u.coins-=20;
  res.json({ok:true,coins:u.coins,message:`تم شراء ${item} مقابل 20 Coins`});
});

app.post("/api/gift/create",(req,res)=>{
  const amount=Math.max(1,Math.floor(Number(req.body.amount||0)));
  const uses=Math.max(1,Math.floor(Number(req.body.uses||1)));
  if(!amount)return res.status(400).json({error:"حدد عدد الكوينز"});
  const token=crypto.randomBytes(18).toString("base64url");
  gifts.set(token,{amount,uses,claimed:0});
  res.json({ok:true,url:`/gift/${token}`,amount,uses});
});

app.post("/api/gift/claim",(req,res)=>{
  if(!req.session.userId)return res.status(401).json({error:"سجل دخول Discord أولًا"});
  const token=String(req.body.token||""),g=gifts.get(token);
  if(!g)return res.status(404).json({error:"رابط الهدية غير صحيح"});
  if(g.claimed>=g.uses)return res.status(400).json({error:"الهدية انتهت"});
  const u=users.get(req.session.userId);
  u.coins+=g.amount;g.claimed++;
  res.json({ok:true,amount:g.amount,coins:u.coins});
});

app.get("/gift/:token",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
app.listen(process.env.PORT||3000,()=>console.log("Prime Store running"));
