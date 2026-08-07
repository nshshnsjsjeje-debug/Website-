let currentProduct=null;
const $=id=>document.getElementById(id);
function toast(t){$("toast").textContent=t;$("toast").style.display="block";setTimeout(()=>$("toast").style.display="none",2800)}
async function api(url,opt={}){let r=await fetch(url,{headers:{"Content-Type":"application/json"},...opt});let d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"حدث خطأ");return d}
async function init(){
 const m=await api("/api/me"); const a=$("account");
 if(m.loggedIn){a.innerHTML=`<div class="user"><img class="avatar" src="${m.user.avatar?"https://cdn.discordapp.com/avatars/"+m.user.id+"/"+m.user.avatar+".png?size=64":"https://cdn.discordapp.com/embed/avatars/0.png"}"><span>${m.user.global_name}<br><small class="coins">🪙 ${m.user.coins} عملة</small></span></div>`;$("coinsBig").textContent=m.user.coins;if(m.owner){$("owner").style.display="block";loadOwner()}}
 else {a.innerHTML='<a class="login" href="/auth/discord">تسجيل دخول Discord</a>'; $("coinsBig").textContent="سجّل دخولك"}
 const ref=new URLSearchParams(location.search).get("ref");if(ref&&m.loggedIn){try{let r=await api("/api/ref/"+encodeURIComponent(ref)+"/claim",{method:"POST"});if(r.claimed){toast("🎁 حصلت على "+r.amount+" عملة فالكون من رابط الدعوة!");setTimeout(init,700)}}catch(e){}}
}
function buy(product,name){
 currentProduct=product;
 $("modalTitle").textContent="شراء "+name;
 $("modalDesc").textContent="اكتب اسمك في ديسكورد أو أي بيانات تريد أن تصل للدعم الفني.";
 $("modalNotice").style.display="block";
 $("modalInput").value="";
 $("modal").style.display="grid";
 $("modalBtn").textContent="تأكيد الشراء";
 $("modalBtn").onclick=async()=>{
  try{
   let r=await api("/api/order",{method:"POST",body:JSON.stringify({product,note:$("modalInput").value})});
   closeModal();
   toast("تم تسجيل طلبك ✅ سيتم التواصل معك من الدعم الفني.");
   setTimeout(init,700);
  }catch(e){toast(e.message)}
 }
}
function support(){
 $("modalTitle").textContent="رسالة للدعم الفني";
 $("modalDesc").textContent="اكتب المشكلة أو الطلب الذي تريد إرساله للإدارة.";
 $("modalNotice").style.display="none";
 $("modalInput").value="";
 $("modal").style.display="grid";
 $("modalBtn").textContent="إرسال الرسالة";
 $("modalBtn").onclick=async()=>{
  try{
   await api("/api/support",{method:"POST",body:JSON.stringify({message:$("modalInput").value})});
   closeModal();
   toast("تم إرسال رسالتك للدعم الفني ✅");
  }catch(e){toast(e.message)}
 }
}
function closeModal(){$("modal").style.display="none"}
async function loadOwner(){
 let d=await api("/api/owner");
 $("orders").innerHTML=d.purchases.length
 ?d.purchases.map(x=>`<div class="item"><b>🛒 ${esc(x.product)}</b> — ${esc(x.user)}<br>اسم/بيانات Discord: <b>${esc(x.note)}</b><br>السعر: ${x.price.toLocaleString()} عملة فالكون<br>الحالة: ${esc(x.status)}<br>${new Date(x.date).toLocaleString("ar-EG")}</div>`).join("")
 :"لا توجد طلبات شراء حالياً";
 $("messages").innerHTML=d.supportMessages.length
 ?d.supportMessages.map(x=>`<div class="item"><b>🎧 ${esc(x.user)}</b><br>${esc(x.message)}<br>${new Date(x.date).toLocaleString("ar-EG")}</div>`).join("")
 :"لا توجد رسائل دعم حالياً";
 $("refs").innerHTML=Object.entries(d.refs).map(([k,v])=>`<div class="item"><b>${esc(k)}</b> — ${v.amount} عملة لكل شخص<br>المستخدمون: ${v.usedBy.length}/${v.maxUses}<br>${location.origin}/?ref=${encodeURIComponent(k)}</div>`).join("")||"لا توجد روابط";
}
async function createRef(){
 try{
  const amount=$("refAmount").value, maxUses=$("refMaxUses").value;
  if(!amount||!maxUses){toast("حدد عدد العملات وعدد الأشخاص أولاً");return}
  let d=await api("/api/ref",{method:"POST",body:JSON.stringify({code:$("refCode").value,amount,maxUses})});
  try{await navigator.clipboard.writeText(d.url)}catch(e){}
  $("createdRef").innerHTML=`<div class="item"><b>تم إنشاء الرابط ونسخه ✅</b><br><span style="word-break:break-all">${esc(d.url)}</span><br>${d.amount} عملة لكل شخص • ${d.maxUses} أشخاص</div>`;
  toast("تم إنشاء الرابط ونسخه 📋");
  $("refCode").value="";$("refAmount").value="";$("refMaxUses").value="";
  loadOwner();
 }catch(e){toast(e.message)}
}
function esc(s){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
function toggleMenu(){}
init();
