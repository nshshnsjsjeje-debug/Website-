let currentRef=null;
let pendingGifts=[];
let currentGift=null;
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

let notificationQueue=[];
let activeNotification=null;

function showNotificationCard(n){
  const modal=$('notificationModal');
  if(!modal)return;
  activeNotification=n;
  $('notificationTitle').textContent=n.title||'إشعار جديد';
  $('notificationText').textContent=n.text||'';
  $('notificationModal').classList.add('open');
}

async function pollNotifications(){
  try{
    const d=await api('/api/notifications');
    if(Array.isArray(d.notifications) && d.notifications.length){
      notificationQueue.push(...d.notifications);
      if(!$('notificationModal').classList.contains('open')) showNextNotification();
    }
  }catch(e){}
}

function showNextNotification(){
  if(activeNotification || !notificationQueue.length)return;
  showNotificationCard(notificationQueue.shift());
}

async function confirmNotification(){
  const n=activeNotification;
  activeNotification=null;
  $('notificationModal').classList.remove('open');
  if(n){
    try{await api('/api/notifications/read',{method:'POST',body:{id:n.id}})}catch(e){}
  }
  setTimeout(showNextNotification,120);
}

async function sendSupportInline(){
  const input=$('supportModalInput'); const message=input?.value.trim();
  if(!message)return toast('اكتب رسالتك أولاً','لا يمكن إرسال رسالة فارغة.','error');
  try{
    await api('/api/support',{method:'POST',body:{message}});
    input.value='';
    closeSupportModal();
    toast('تم إرسال الرسالة ✓','وصلت رسالتك مباشرة إلى الدعم الفني.');
  }catch(e){toast('تعذر إرسال الرسالة',e.message,'error')}
}
function closeSupportModal(){ $('supportModal')?.classList.remove('open'); }

async function broadcastNotification(){
  const title=$('broadcastTitle').value.trim(),text=$('broadcastText').value.trim();
  if(!title||!text)return toast('أكمل بيانات الإشعار','اكتب العنوان والنص أولاً.','error');
  try{const d=await api('/api/owner/broadcast',{method:'POST',body:{title,text}}); $('broadcastTitle').value='';$('broadcastText').value=''; toast('تم إرسال الإشعار ✓',`وصل إلى ${d.count} مستخدم.`);}
  catch(e){toast('تعذر إرسال الإشعار',e.message,'error')}
}

async function giftAllUsers(){
  const amount=Math.floor(Number($('giftAllAmount').value||0));
  if(!amount||amount<1)return toast('حدد عدد العملات','اكتب قيمة أكبر من صفر.','error');
  if(!confirm(`هل تريد إضافة ${amount.toLocaleString()} عملة لكل المستخدمين؟`))return;
  try{const d=await api('/api/owner/gift-all',{method:'POST',body:{amount}}); $('giftAllAmount').value=''; toast('تم إرسال الهدية 🎁',`تمت إضافة ${amount.toLocaleString()} عملة إلى ${d.count} مستخدم.`);}
  catch(e){toast('تعذر إرسال الهدية',e.message,'error')}
}


function openRPGuide(){
  const m=$('rpGuideModal');
  if(!m)return;
  m.classList.add('open');
  document.body.classList.add('modal-open');
}
function closeRPGuide(){
  const m=$('rpGuideModal');
  if(!m)return;
  m.classList.remove('open');
  document.body.classList.remove('modal-open');
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
    const r=await api('/api/login',{method:'POST',body:{username,password}});
    closeAuth();
    await init(false);
    toast('تم تسجيل الدخول ✓','أهلاً بك في Falcon on Top');
    if(r.dailyGranted){
      setTimeout(()=>toast('تم استلام الهداية اليومية 🎁','تمت إضافة 50 عملة فالكون إلى رصيدك.'),450);
    }
    setTimeout(()=>loadPendingGifts(),850);
  }catch(e){toast('تعذر تسجيل الدخول',e.message,'error')}
}
async function register(){
  const username=$('regUser').value.trim(),password=$('regPass').value,password2=$('regPass2').value;
  if(password!==password2)return toast('كلمتا المرور غير متطابقتين','اكتب نفس كلمة المرور في الحقلين.','error');
  try{
    await api('/api/register',{method:'POST',body:{username,password}});
    closeAuth();
    await init(false);
    toast('تم إنشاء الحساب ✓','حصلت على 50 عملة فالكون كبداية.');
    setTimeout(()=>toast('تم استلام الهداية اليومية 🎁','تمت إضافة 50 عملة فالكون إلى رصيدك.'),450);
    setTimeout(()=>loadPendingGifts(),850);
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
      closeModal(); updateCoins(r.coins); toast('تم الشراء ✓','تم تسجيل طلبك وسيتم التواصل معك من الدعم الفني.');
    }catch(e){
      if(e.code==='NO_COINS') toast('ليس لديك عملات كافية 🪙',`تحتاج ${price.toLocaleString()} عملة فالكون لشراء ${name}.`,'error');
      else toast('تعذر تنفيذ الشراء',e.message,'error');
    }
  };
}
function support(){
  const modal=$('supportModal');
  if(!modal)return;
  modal.classList.add('open');
  setTimeout(()=>$('supportModalInput')?.focus(),120);
}

async function claimCurrentRef(silent=false){
  if(!currentRef)return false;
  try{
    const r=await api('/api/ref/'+encodeURIComponent(currentRef)+'/claim',{method:'POST'});
    if(r.claimed){
      updateCoins(r.coins);
      closeGiftModal();
      toast('تم الاستلام ✓',`تمت إضافة ${r.amount.toLocaleString()} عملة فالكون إلى رصيدك.`);
      currentRef=null;
      return true;
    }
    if(!silent)toast('الجائزة مستلمة بالفعل','لا يمكنك استلام نفس الرابط مرتين.','error');
    return false;
  }catch(e){
    if(e.status===401)showAuth('login');
    else if(!silent)toast('تعذر استلام الهدية',e.message,'error');
    return false;
  }
}

function closeGiftModal(){
  $('giftModal')?.classList.remove('open');
}

async function loadPendingGifts(){
  try{
    const d=await api('/api/gifts');
    pendingGifts=Array.isArray(d.gifts)?d.gifts:[];
    if(pendingGifts.length) showGiftPrompt();
  }catch(e){}
}

function showGiftPrompt(){
  if(!pendingGifts.length || !$('giftModal'))return;
  currentGift=pendingGifts[0];
  $('giftDesc').textContent=`هدية بقيمة ${Number(currentGift.amount||0).toLocaleString('ar-EG')} عملة فالكون من الدعم الفني.`;
  $('giftList').innerHTML=pendingGifts.map(g=>`<div class="giftRow"><span>🎁 هدية من الدعم الفني</span><b>${Number(g.amount||0).toLocaleString('ar-EG')} 🪙</b></div>`).join('');
  $('giftModal').classList.add('open');
}

function showGiftPromptIfNeeded(){ if(pendingGifts.length)showGiftPrompt(); }

async function claimGiftFromPrompt(){
  if(!currentGift)return;
  const btn=$('giftClaimBtn');
  if(btn){btn.disabled=true;btn.textContent='جاري الاستلام...';}
  try{
    const r=await api('/api/gifts/'+encodeURIComponent(currentGift.id)+'/claim',{method:'POST'});
    updateCoins(r.coins);
    pendingGifts=pendingGifts.filter(g=>g.id!==currentGift.id);
    currentGift=pendingGifts[0]||null;
    toast('تم استلام الهدية 🎁',`تمت إضافة ${Number(r.amount).toLocaleString('ar-EG')} عملة فالكون إلى رصيدك.`);
    if(currentGift){showGiftPrompt();}else closeGiftModal();
  }catch(e){toast('تعذر استلام الهدية',e.message,'error');}
  finally{if(btn){btn.disabled=false;btn.textContent='استلام الهدية';}}
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

async function init(showDaily=true){
  try{
    const d=await api('/api/me');
    if(d.loggedIn){
      updateCoins(d.user.coins);
      $('loginState').textContent=d.owner?'المالك 👑':'عضو مسجل';
      $('account').innerHTML=`<button class="accountBtn" onclick="logout()">${esc(d.user.username)} • خروج</button>`;
      $('mobileOwner').style.display=d.owner?'block':'none';
      $('owner').style.display=d.owner?'block':'none';
      if(d.owner)loadOwner();
      if(showDaily && d.dailyGranted){
        setTimeout(()=>toast('تم استلام الهداية اليومية 🎁','تمت إضافة 50 عملة فالكون إلى رصيدك.'),350);
      }
      setTimeout(()=>loadPendingGifts(),showDaily?800:300);
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
  setTimeout(()=>{$('loader').classList.add('hide')},1100);
  await init(true);
  setTimeout(pollNotifications, 500);
  setInterval(pollNotifications, 5000);
  // The giveaway is intentionally NOT auto-claimed.
  // Logged-in visitors get a prompt with an "استلام الهدية" button.
});


/* Falcon on Top global UI motion helpers */
(function(){
  function mark(el, cls){
    if(!el) return;
    el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
  }
  window.falconOnTopAnimate = function(el){ mark(el,'falcon-on-top-success'); };
  document.addEventListener('click', function(e){
    const b=e.target.closest('button,.btn,a');
    if(b) { b.classList.remove('falcon-on-top-click'); void b.offsetWidth; b.classList.add('falcon-on-top-click'); }
  });
})();


(function(){window.falconOnTopAnimate=function(el){if(!el)return;el.classList.remove('falcon-on-top-success');void el.offsetWidth;el.classList.add('falcon-on-top-success')}})();
