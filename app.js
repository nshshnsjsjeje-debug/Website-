let currentRef=null;
const $=id=>document.getElementById(id);
async function api(url,opts={}){
 opts.headers={...(opts.headers||{}),'Content-Type':'application/json'};
 const r=await fetch(url,{credentials:'same-origin',...opts});
 let d={};
 try{d=await r.json()}catch(e){}
 if(!r.ok) throw new Error(d.error||'حدث خطأ في الاتصال بالخادم');
 return d;
}

function showAuth(type){ if(!$('authModal')){toast('واجهة تسجيل الدخول غير متاحة','error');return} 
 $('authModal').classList.add('open');
 const login=type==='login';
 $('loginForm').style.display=login?'block':'none';
 $('registerForm').style.display=login?'none':'block';
 $('loginTab').classList.toggle('active',login);
 $('registerTab').classList.toggle('active',!login);
}
function closeAuth(){$('authModal').classList.remove('open')}
async function login(){
 const username=$('loginUser').value.trim(),password=$('loginPass').value;
 try{
   const r=await api('/api/login',{method:'POST',body:JSON.stringify({username,password})});
   closeAuth();toast('تم تسجيل الدخول ✓','أهلاً بك في Falcon RP');
   setTimeout(init,250);
 }catch(e){toast('تعذر تسجيل الدخول',e.message,'error')}
}
async function register(){
 const username=$('regUser').value.trim(),password=$('regPass').value,password2=$('regPass2').value;
 if(password!==password2)return toast('كلمتا المرور غير متطابقتين','اكتب نفس كلمة المرور في الحقلين.','error');
 try{
   const r=await api('/api/register',{method:'POST',body:JSON.stringify({username,password})});
   closeAuth();toast('تم إنشاء الحساب ✓','حصلت على 50 عملة فالكون كبداية.');
   setTimeout(init,250);
 }catch(e){toast('تعذر إنشاء الحساب',e.message,'error')}
}

function buy(product,name,price){
 openModal('شراء '+name,`السعر ${price.toLocaleString()} عملة فالكون.`,'<div class="buyHint">اكتب اسمك في ديسكورد أو أي بيانات يحتاجها الدعم الفني.</div>');$('modalBtn').textContent='تأكيد الشراء';
 $('modalBtn').onclick=async()=>{try{const r=await api('/api/order',{method:'POST',body:JSON.stringify({product,note:$('modalInput').value})});closeModal();toast('تم إرسال طلب الشراء ✓','سيتم التواصل معك من الدعم الفني.');$('coinsTop').textContent=r.coins.toLocaleString();}catch(e){toast(e.message,'', 'error')}}
}
function support(){openModal('الدعم الفني','اكتب المشكلة أو الطلب الذي تريد إرساله للإدارة.','<div class="buyHint">سيصل طلبك مباشرة إلى لوحة صاحب الموقع.</div>');$('modalBtn').textContent='إرسال الرسالة';$('modalBtn').onclick=async()=>{try{await api('/api/support',{method:'POST',body:JSON.stringify({message:$('modalInput').value})});closeModal();toast('تم إرسال الرسالة ✓','وصلت رسالتك إلى الدعم الفني.')}catch(e){toast(e.message,'','error')}}}
async function claimCurrentRef(){if(!currentRef){toast('لا يوجد رابط مكافأة','افتح الموقع من رابط الهدايا أولاً.','error');return}try{const r=await api('/api/ref/'+encodeURIComponent(currentRef)+'/claim',{method:'POST'});if(r.claimed){toast('مبروك 🎁',`تمت إضافة ${r.amount.toLocaleString()} عملة فالكون`);$('coinsTop').textContent=r.coins.toLocaleString()}else toast('الجائزة مستلمة بالفعل','لا يمكنك استلام نفس الرابط مرتين.','error')}catch(e){toast('تعذر استلام الهدية',e.message,'error')}}
async function createRef(){try{const amount=$('refAmount').value,maxUses=$('refMaxUses').value;if(!amount||!maxUses)return toast('حدد البيانات أولاً','عدد العملات وعدد الأشخاص مطلوبان.','error');const d=await api('/api/ref',{method:'POST',body:JSON.stringify({code:$('refCode').value,amount,maxUses})});try{await navigator.clipboard.writeText(d.url)}catch(e){}$('createdRef').innerHTML=`<div class="created"><b>تم إنشاء الرابط ونسخه ✓</b><span>${esc(d.url)}</span><small>${d.amount.toLocaleString()} عملة لكل شخص • ${d.maxUses} أشخاص</small></div>`;toast('تم إنشاء الرابط ✓','تم نسخه إلى الحافظة.');$('refCode').value='';$('refAmount').value='';$('refMaxUses').value='';loadOwner()}catch(e){toast('تعذر إنشاء الرابط',e.message,'error')}}
async function loadOwner(){const d=await api('/api/owner');$('orders').innerHTML=d.purchases.length?d.purchases.map(x=>`<div class="item"><b>🛒 ${esc(x.product)}</b> — ${esc(x.user)}<br>Discord: ${esc(x.note)}<br>${x.price.toLocaleString()} عملة • ${new Date(x.date).toLocaleString('ar-EG')}</div>`).join(''):'لا توجد طلبات';$('messages').innerHTML=d.supportMessages.length?d.supportMessages.map(x=>`<div class="item"><b>🎧 ${esc(x.user)}</b><br>${esc(x.message)}<br>${new Date(x.date).toLocaleString('ar-EG')}</div>`).join(''):'لا توجد رسائل';$('refs').innerHTML=Object.entries(d.refs).map(([k,v])=>`<div class="item"><b>${esc(k)}</b><br>${v.amount.toLocaleString()} عملة لكل شخص • ${v.usedBy.length}/${v.maxUses}<br>${location.origin}/?ref=${encodeURIComponent(k)}</div>`).join('')||'لا توجد روابط'}
function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
window.addEventListener('load',()=>{setTimeout(()=>{$('loader').classList.add('hide');init()},1200)});
