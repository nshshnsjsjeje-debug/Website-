let giftToken=location.pathname.startsWith("/gift/")?location.pathname.split("/")[2]:"";
if(giftToken)document.getElementById("gift").classList.remove("hidden");
async function load(){const r=await fetch("/api/me");const d=await r.json();if(d.loggedIn){document.getElementById("user").textContent=d.user.username;document.getElementById("balance").textContent=`🪙 ${d.user.coins} Coins`;document.getElementById("status").textContent="متصل بحساب Discord";}else{document.getElementById("balance").textContent="🪙 0 Coins";}}
async function post(u,b){const r=await fetch(u,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)});return r.json();}
async function daily(){const d=await post("/api/daily",{});alert(d.message||d.error);load();}
async function buy(item){const d=await post("/api/purchase",{item});alert(d.message||d.error);load();}
async function buyAndCopy(item){
  const d=await post("/api/purchase",{item});
  if(!d.ok){alert(d.error||"تعذر إتمام الشراء");return;}
  alert("✅ تم الشراء بنجاح!\n💳 تم خصم 20 Coins.\n📋 الآن يمكنك بدء عملية النسخ من نظام النسخ.");
  load();
}
async function claimGift(){const d=await post("/api/gift/claim",{token:giftToken});if(d.ok)document.getElementById("gift").innerHTML=`<h2>🎉 مبروك!</h2><p>لقد ربحت ${d.amount} 🪙 Coins</p>`;else alert(d.error);load();}
async function createGift(){const d=await post("/api/gift/create",{amount:Number(document.getElementById("amount").value),uses:Number(document.getElementById("uses").value||1)});document.getElementById("result").textContent=d.ok?location.origin+d.url:d.error;}
load();