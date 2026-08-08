let currentRef=null;
const $=id=>document.getElementById(id);

async function api(url,opts={}){
  const options={...opts,credentials:'same-origin',headers:{...(opts.headers||{})}};
  if(options.body && typeof options.body !== 'string'){
    options.headers['Content-Type']='application/json';
    options.body=JSON.stringify(options.body);
  }
  const r=await fetch(url,options);
  let d={};
  try{d=await r.json()}catch(e){}
  if(!r.ok) throw Object.assign(new Error(d.error||'حدث خطأ في الاتصال بالخادم'),{code:d.code,status:r.status});
  return d;
}

function toast(title,text='',type='success'){
  const el=$('toast'); if(!el)return;
  $('toastTitle').textContent=title;
  $('toastText').textContent=text;
  $('toastIcon').textContent=type==='error'?'!':'✓';
  el.classList.remove('error','show');
  if(type==='error')el.classList.add('error');
  requestAnimationFrame(()=>el.classList.add('show'));
  clearTimeout(window.__toastTimer);
  window.__toastTimer=setTimeout(()=>el.classList.remove('show'),3200);
}

function openModal(title,desc,extra=''){
  $('modalTitle').textContent=title;
  $('modalDesc').textContent=desc;
  $('modalExtra').innerHTML=extra;
  $('modalInput').value='';
  $('modal').classList.add('open');
}
function closeModal(){$('modal').classList.remove('open')}
function toggleMenu(){$('mobileMenu').classList.toggle('open')}

function showAuth(type){
  $('authModal').classList.add('open');
  const loginMode=type==='login';
  $('loginForm').style.display=loginMode?'block':'none';
  $('registerForm').style.display=loginMode?'none':'block';
  $('loginTab').classList.toggle('active',loginMode);
  $('registerTab').classList.toggle('active',!loginMode);
  setTimeout(()=>$(loginMode?'loginUser':'regUser')?.focus(),100);
}
function closeAuth(){$('authModal').classList.remove('open')}

async function login(){
  const username=$('loginUser').value.trim(),password=$('loginPass').value;
  try{
    await api('/api/login',{method:'POST',body:{username,password}});
    closeAuth(); toast('تم تسجيل الدخول ✓','أهلاً بك في Moga');
    await init();
    await claimCurrentRef(true);
  }catch(e){toast('تعذر تسجيل الدخول',e.message,'error')}
}
async function register(){
  const username=$('regUser').value.trim(),password=$('regPass').value,password2=$('regPass2').value;
  if(password!==password2)return toast('كلمتا المرور غير متطابقتين','اكتب نفس كلمة المرور في الحقلين.','error');
  try{
    await api('/api/register',{method:'POST',body:{username,password}});
    closeAuth(); toast('تم إنشاء الحساب ✓','حصلت على 50 عملة فالكون كبداية.');
    await init();
    await claimCurrentRef(true);
  }catch(e){toast('تعذر إنشاء الحساب',e.message,'error')}
}

function buy(product,name,price){
  openModal('شراء '+name,`السعر ${price.toLocaleString()} عملة فالكون.`,'<div class="buyHint">اكتب اسمك في ديسكورد أو البيانات المطلوبة.</div>');
  $('modalBtn').textContent='تأكيد الشراء';
  $('modalBtn').onclick=async()=>{
    const note=$('modalInput').value.trim();
    if(!note)return toast('اكتب البيانات المطلوبة','اكتب اسمك في ديسكورد أولاً.','error');
    try{
      const r=await api('/api/order',{method:'POST',body:{product,note}});
      closeModal(); updateCoins(r.coins); toast('تم إرسال طلب الشراء ✓','سيتم التواصل معك من الدعم الفني.');
    }catch(e){
      if(e.code==='NO_COINS') toast('ليس لديك عملات كافية 🪙',`تحتاج ${price.toLocaleString()} عملة فالكون لشراء ${name}.`,'error');
      else toast('تعذر تنفيذ الشراء',e.message,'error');
    }
  };
}
function support(){
  openModal('الدعم الفني','اكتب المشكلة أو الطلب الذي تريد إرساله للإدارة.','<div class="buyHint">ستصل الرسالة مباشرة إلى لوحة صاحب الموقع.</div>');
  $('modalBtn').textContent='إرسال الرسالة';
  $('modalBtn').onclick=async()=>{
    const message=$('modalInput').value.trim();
    if(!message)return toast('اكتب رسالتك أولاً','لا يمكن إرسال رسالة فارغة.','error');
    try{await api('/api/support',{method:'POST',body:{message}});closeModal();toast('تم الإرسال ✓','وصلت رسالتك إلى الدعم الفني.');}
    catch(e){toast('تعذر إرسال الرسالة',e.message,'error')}
  };
}
async function claimCurrentRef(silent=false){
  if(!currentRef)return false;
  try{
    const r=await api('/api/ref/'+encodeURIComponent(currentRef)+'/claim',{method:'POST'});
    if(r.claimed){updateCoins(r.coins); if(!silent)toast('مبروك 🎁',`تمت إضافة ${r.amount.toLocaleString()} عملة فالكون`); return true;}
    if(!silent)toast('الجائزة مستلمة بالفعل','لا يمكنك استلام نفس الرابط مرتين.','error');
    return false;
  }catch(e){
    if(e.status===401)showAuth('login');
    else if(!silent)toast('تعذر استلام الهدية',e.message,'error');
    return false;
  }
}
async function createRef(){
  try{
    const amount=$('refAmount').value,maxUses=$('refMaxUses').value,code=$('refCode').value.trim();
    if(!amount||!maxUses)return toast('حدد البيانات أولاً','عدد العملات وعدد الأشخاص مطلوبان.','error');
    const d=await api('/api/ref',{method:'POST',body:{code,amount,maxUses}});
    try{await navigator.clipboard.writeText(d.url)}catch(e){}
    $('createdRef').innerHTML=`<div class="created"><b>تم إنشاء الرابط ونسخه ✓</b><span>${esc(d.url)}</span><small>${d.amount.toLocaleString()} عملة لكل شخص • ${d.maxUses} أشخاص</small></div>`;
    toast('تم إنشاء الرابط ✓','تم نسخه إلى الحافظة.');
    $('refCode').value=$('refAmount').value=$('refMaxUses').value='';
    loadOwner();
  }catch(e){toast('تعذر إنشاء الرابط',e.message,'error')}
}
async function loadOwner(){
  try{
    const d=await api('/api/owner');
    $('orders').innerHTML=d.purchases.length?d.purchases.map(x=>`<div class="item"><b>🛒 ${esc(x.product)}</b> — ${esc(x.user)}<br>Discord: ${esc(x.note)}<br>${Number(x.price).toLocaleString()} عملة • ${new Date(x.date).toLocaleString('ar-EG')}</div>`).join(''):'لا توجد طلبات';
    $('messages').innerHTML=d.supportMessages.length?d.supportMessages.map(x=>`<div class="item"><b>🎧 ${esc(x.user)}</b><br>${esc(x.message)}<br>${new Date(x.date).toLocaleString('ar-EG')}</div>`).join(''):'لا توجد رسائل';
    $('refs').innerHTML=Object.entries(d.refs).map(([k,v])=>`<div class="item"><b>${esc(k)}</b><br>${Number(v.amount).toLocaleString()} عملة لكل شخص • ${v.usedBy.length}/${v.maxUses}<br>${location.origin}/?ref=${encodeURIComponent(k)}</div>`).join('')||'لا توجد روابط';
  }catch(e){console.warn(e)}
}
function updateCoins(n){$('coinsTop').textContent=Number(n||0).toLocaleString('ar-EG')}
function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}

async function init(){
  try{
    const d=await api('/api/me');
    if(d.loggedIn){
      updateCoins(d.user.coins);
      $('loginState').textContent=d.owner?'المالك 👑':'عضو مسجل';
      $('account').innerHTML=`<button class="accountBtn" onclick="logout()">${esc(d.user.username)} • خروج</button>`;
      $('mobileOwner').style.display=d.owner?'block':'none';
      $('owner').style.display=d.owner?'block':'none';
      if(d.owner)loadOwner();
    }else{
      $('coinsTop').textContent='—'; $('loginState').textContent='زائر';
      $('account').innerHTML='<button class="accountBtn" onclick="showAuth(\'login\')">تسجيل الدخول</button>';
      $('mobileOwner').style.display='none'; $('owner').style.display='none';
    }
  }catch(e){toast('تعذر الاتصال بالخادم','تأكد أن الموقع يعمل من خلال السيرفر وليس ملف HTML فقط.','error')}
}
async function logout(){await fetch('/auth/logout',{credentials:'same-origin'});toast('تم تسجيل الخروج','إلى اللقاء 👋');setTimeout(init,200)}

window.addEventListener('load',async()=>{
  const params=new URLSearchParams(location.search); currentRef=params.get('ref')||null;
  setTimeout(()=>{$('loader').classList.add('hide')},1000);
  await init();
  if(currentRef){history.replaceState({},'',location.pathname); await claimCurrentRef(true);}
});
