let cart=[];
let tickets=[];
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
  openFixedModal('notificationModal');
}


let notificationInbox=[];
async function loadNotificationInbox(){
  try{
    const d=await api('/api/notifications/all');
    notificationInbox=Array.isArray(d.notifications)?d.notifications:[];
    renderNotificationInbox();
  }catch(e){ notificationInbox=[]; renderNotificationInbox(); }
}
function renderNotificationInbox(){
  const box=$('notificationsList'), count=$('notificationCount');
  if(count) count.textContent=notificationInbox.filter(n=>!n.read).length;
  if(!box)return;
  box.innerHTML=notificationInbox.length ? notificationInbox.map(n=>`
    <div class="notificationRow ${n.read?'read':''}">
      <div class="notificationRowIcon">🔔</div>
      <div><b>${esc(n.title||'إشعار')}</b><p>${esc(n.text||'')}</p><small>${n.createdAt?new Date(n.createdAt).toLocaleString('ar-EG'):''}</small></div>
    </div>`).join('') : '<div class="emptyState">لا توجد إشعارات حتى الآن.</div>';
}
async function openNotifications(){
  openFixedModal('notificationsModal');
  await loadNotificationInbox();
  // Mark visible notifications as read after opening the inbox.
  for(const n of notificationInbox.filter(x=>!x.read)){
    try{await api('/api/notifications/read',{method:'POST',body:{id:n.id}});n.read=true;}catch(e){}
  }
  renderNotificationInbox();
}
async function loadAllNotifications(){
  try{const d=await api('/api/notifications/all');notificationInbox=d.notifications||[];renderNotificationInbox();}catch(e){}
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
  closeFixedModal('notificationModal');
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
function closeSupportModal(){ closeFixedModal('supportModal'); }

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

function openModal(title,desc,extra=''){
  $('modalTitle').textContent=title;
  $('modalDesc').textContent=desc;
  $('modalExtra').innerHTML=extra;
  $('modalInput').value='';
  openFixedModal('modal');
}
function closeModal(){closeFixedModal('modal')}
function toggleMenu(){
  const m=$('mobileMenu'); if(!m)return;
  const opening=!m.classList.contains('open');
  m.classList.toggle('open');
  if(opening) lockPageForModal(); else unlockPageForModal();
}

function showAuth(type){
  openFixedModal('authModal');
  const loginMode=type==='login';
  $('loginForm').style.display=loginMode?'block':'none';
  $('registerForm').style.display=loginMode?'none':'block';
  $('loginTab').classList.toggle('active',loginMode);
  $('registerTab').classList.toggle('active',!loginMode);
  setTimeout(()=>$(loginMode?'loginUser':'regUser')?.focus(),100);
}
function closeAuth(){closeFixedModal('authModal')}

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

function openDashboard(){
  if(!$('dashboardModal'))return;
  openFixedModal('dashboardModal');
  loadDashboard();
}
async function loadDashboard(){
  try{
    const d=await api('/api/dashboard');
    const u=d.user;
    $('dashboardContent').innerHTML=`<div class="dashStats"><div><b>🪙 ${Number(u.coins||0).toLocaleString('ar-EG')}</b><small>الرصيد</small></div><div><b>📦 ${d.orders.length}</b><small>الطلبات</small></div><div><b>🎧 ${d.tickets.length}</b><small>التذاكر</small></div></div><div class="dashSection"><h3>📦 آخر الطلبات</h3>${d.orders.length?d.orders.slice(0,6).map(o=>`<div class="orderRow"><b>${esc(o.product)}</b><span>${Number(o.price).toLocaleString('ar-EG')} 🪙</span><em class="status-${statusClass(o.status)}">${esc(o.status)}</em></div>`).join(''):'<p class="muted">لا توجد طلبات بعد.</p>'}</div>`;
  }catch(e){if(e.status===401)showAuth('login');else toast('تعذر فتح لوحة الحساب',e.message,'error')}
}
function statusClass(s){return String(s||'جديد').replace(/[^\u0600-\u06FFa-zA-Z0-9]/g,'').slice(0,12)}
async function addToCart(product,name,price){
  try{const d=await api('/api/cart',{method:'POST',body:{product,name,price}});cart=d.cart||[];renderCart();updateCartCount();toast('تمت الإضافة للسلة 🛒',name);}
  catch(e){if(e.status===401)showAuth('login');else toast('تعذر إضافة المنتج',e.message,'error')}
}
async function loadCart(){try{const d=await api('/api/cart');cart=d.cart||[];updateCartCount();}catch(e){cart=[];updateCartCount()}}
function updateCartCount(){$('cartCount').textContent=cart.reduce((a,x)=>a+Number(x.qty||1),0)}
function openCart(){openFixedModal('cartModal');loadCart().then(renderCart)}
function renderCart(){
 const box=$('cartContent'); if(!box)return;
 if(!cart.length){box.innerHTML='<p class="muted">السلة فارغة.</p>';return}
 const subtotal=cart.reduce((a,x)=>a+Number(x.price||0)*Number(x.qty||1),0);const discount=window.appliedCoupon?Math.floor(subtotal*Number(window.appliedCoupon.percent||0)/100):0;const total=subtotal-discount;
 box.innerHTML=cart.map(x=>`<div class="cartRow"><div><b>${esc(x.name)}</b><small>${Number(x.price).toLocaleString('ar-EG')} 🪙 × ${x.qty}</small></div><button onclick="removeFromCart('${x.product}')">حذف</button></div>`).join('')+`<div class="cartTotal"><b>الإجمالي</b><strong>${total.toLocaleString('ar-EG')} 🪙</strong>${discount?`<small>قبل الخصم: ${subtotal.toLocaleString('ar-EG')} 🪙 — خصم ${discount.toLocaleString('ar-EG')} 🪙</small>`:''}</div><input id="cartNote" placeholder="اسمك في ديسكورد أو البيانات المطلوبة"><button class="btn primary" onclick="checkoutCart()">إتمام الشراء</button>`;
}
async function removeFromCart(product){try{const d=await api('/api/cart/'+encodeURIComponent(product),{method:'DELETE'});cart=d.cart||[];renderCart();updateCartCount()}catch(e){toast('تعذر حذف المنتج',e.message,'error')}}
async function checkoutCart(){
 const note=$('cartNote')?.value.trim(); if(!note)return toast('اكتب البيانات المطلوبة','اكتب اسمك في ديسكورد أولاً.','error');
 try{const d=await api('/api/cart/checkout',{method:'POST',body:{note,couponCode:window.appliedCoupon?.code||''}});cart=d.cart||[];updateCoins(d.coins);updateCartCount();renderCart();toast('تم إرسال الطلب ✓','تم إنشاء الطلبات وحالتها الآن: جديد.');}catch(e){if(e.status===401)showAuth('login');else toast('تعذر إتمام الشراء',e.message,'error')}
}
async function openTickets(){openFixedModal('ticketsModal');await loadTickets()}
async function loadTickets(){try{const d=await api('/api/tickets');tickets=d.tickets||[];renderTickets()}catch(e){if(e.status===401)showAuth('login');else toast('تعذر تحميل التذاكر',e.message,'error')}}
function renderTickets(){const box=$('ticketList');if(!box)return;box.innerHTML=tickets.length?tickets.map(t=>`<div class="ticketCard"><div class="ticketHead"><b>#${esc(t.id.slice(0,8))} — ${esc(t.subject)}</b><em>${esc(t.status)}</em></div><p>${esc(t.message)}</p>${t.replies?.length?`<div class="ticketReplies">${t.replies.map(r=>`<div><b>${esc(r.from)}:</b> ${esc(r.text)}</div>`).join('')}</div>`:''}<div class="ticketReply"><input id="reply-${esc(t.id)}" placeholder="اكتب ردك..."><button onclick="replyTicket('${esc(t.id)}')">إرسال</button></div></div>`).join(''):'<p class="muted">لا توجد تذاكر. افتح أول تذكرة من النموذج أعلاه.</p>'}
async function createTicket(){const subject=$('ticketSubject').value.trim(),message=$('ticketMessage').value.trim();if(!subject||!message)return toast('أكمل بيانات التذكرة','العنوان والرسالة مطلوبان.','error');try{await api('/api/tickets',{method:'POST',body:{subject,message}});$('ticketSubject').value='';$('ticketMessage').value='';await loadTickets();toast('تم فتح التذكرة ✓','سيظهر رد الدعم داخل نفس التذكرة.')}catch(e){toast('تعذر فتح التذكرة',e.message,'error')}}
async function replyTicket(id){const i=$('reply-'+id),text=i?.value.trim();if(!text)return;if(!await api('/api/tickets/'+encodeURIComponent(id)+'/reply',{method:'POST',body:{text}}).catch(e=>{toast('تعذر إرسال الرد',e.message,'error');return null}))return;i.value='';loadTickets()}
function searchSite(q){q=q.trim().toLowerCase();const box=$('searchResults');if(!q){box.innerHTML='';box.classList.remove('show');return}const items=[...document.querySelectorAll('.product')].map(x=>({title:x.querySelector('h3')?.textContent||'',desc:x.querySelector('p')?.textContent||'',el:x}));const role=[...document.querySelectorAll('.rpGrid article')].map(x=>({title:x.querySelector('b')?.textContent||'مفهوم رول بلاي',desc:x.querySelector('p')?.textContent||'',el:x}));const all=[...items,...role].filter(x=>(x.title+' '+x.desc).toLowerCase().includes(q)).slice(0,8);box.innerHTML=all.length?all.map((x,i)=>`<button class="searchResult" onclick="jumpToSearch(${i})"><b>${esc(x.title)}</b><small>${esc(x.desc)}</small></button>`).join(''):'<div class="noSearch">لا توجد نتائج.</div>';box.classList.add('show');window.__searchItems=all}
function jumpToSearch(i){const x=window.__searchItems?.[i];if(!x)return;clearSearch();x.el.scrollIntoView({behavior:'smooth',block:'center'})}
function clearSearch(){$('siteSearch').value='';$('searchResults').innerHTML='';$('searchResults').classList.remove('show')}
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

let __modalScrollY=0;
function lockPageForModal(){
  if(document.body.classList.contains('modalLocked')) return;
  __modalScrollY=window.scrollY||window.pageYOffset||0;
  document.documentElement.classList.add('modalLocked');
  document.body.classList.add('modalLocked');
  document.body.style.position='fixed';
  document.body.style.top=`-${__modalScrollY}px`;
  document.body.style.left='0';
  document.body.style.right='0';
  document.body.style.width='100%';
}
function unlockPageForModal(){
  if(!document.body.classList.contains('modalLocked')) return;
  document.documentElement.classList.remove('modalLocked');
  document.body.classList.remove('modalLocked');
  document.body.style.position='';
  document.body.style.top='';
  document.body.style.left='';
  document.body.style.right='';
  document.body.style.width='';
  window.scrollTo(0,__modalScrollY);
}
function openFixedModal(id){
  const el=$(id);
  if(!el)return false;
  lockPageForModal();
  el.classList.add('open');
  return true;
}
function closeFixedModal(id){
  const el=$(id);
  if(el)el.classList.remove('open');
  if(!document.querySelector('.modal.open')) unlockPageForModal();
}
function support(){
  if(!openFixedModal('supportModal'))return;
  setTimeout(()=>{const i=$('supportModalInput'); i?.focus();},120);
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
  closeFixedModal('giftModal');
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
  openFixedModal('giftModal');
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
    $('orders').innerHTML=d.purchases.length?d.purchases.map(x=>`<div class="item"><b>🛒 ${esc(x.product)}</b> — ${esc(x.user)}<br>Discord: ${esc(x.note)}<br>${Number(x.price).toLocaleString()} عملة • ${new Date(x.date).toLocaleString('ar-EG')}<br><select onchange="updateOrderStatus('${esc(x.id)}',this.value)"><option ${x.status==='جديد'?'selected':''}>جديد</option><option ${x.status==='قيد المراجعة'?'selected':''}>قيد المراجعة</option><option ${x.status==='قيد التجهيز'?'selected':''}>قيد التجهيز</option><option ${x.status==='تم التسليم'?'selected':''}>تم التسليم</option><option ${x.status==='ملغي'?'selected':''}>ملغي</option></select></div>`).join(''):'لا توجد طلبات';
    $('messages').innerHTML=d.supportMessages.length?d.supportMessages.map(x=>`<div class="item"><b>🎧 ${esc(x.user)}</b><br>${esc(x.message)}<br>${new Date(x.date).toLocaleString('ar-EG')}</div>`).join(''):'لا توجد رسائل';
    $('refs').innerHTML=Object.entries(d.refs).map(([k,v])=>`<div class="item"><b>${esc(k)}</b><br>${Number(v.amount).toLocaleString()} عملة لكل شخص • ${v.usedBy.length}/${v.maxUses}<br>${location.origin}/?ref=${encodeURIComponent(k)}</div>`).join('')||'لا توجد روابط';
    $('tickets').innerHTML=(d.tickets||[]).length?d.tickets.map(t=>`<div class="item"><b>🎫 #${esc(t.id.slice(0,8))} — ${esc(t.user)}</b><br>${esc(t.subject)}<br>${esc(t.message)}<br><b>الحالة:</b> ${esc(t.status)}${(t.replies||[]).length?'<div class="ticketReplies">'+t.replies.map(r=>`<div><b>${esc(r.from)}:</b> ${esc(r.text)}</div>`).join('')+'</div>':''}<input id="ownerReply-${esc(t.id)}" placeholder="رد الدعم..."><button onclick="ownerReplyTicket('${esc(t.id)}')">إرسال الرد</button> <select onchange="ownerTicketStatus('${esc(t.id)}',this.value)"><option>مفتوحة</option><option>قيد المتابعة</option><option>تم الحل</option><option>مغلقة</option></select></div>`).join(''):'لا توجد تذاكر';
  }catch(e){console.warn(e)}
}
async function updateOrderStatus(id,status){try{await api('/api/owner/order-status',{method:'POST',body:{id,status}});toast('تم تحديث حالة الطلب ✓',status)}catch(e){toast('تعذر تحديث الطلب',e.message,'error')}}
async function ownerReplyTicket(id){const i=$('ownerReply-'+id),text=i?.value.trim();if(!text)return;try{await api('/api/owner/tickets/'+encodeURIComponent(id)+'/reply',{method:'POST',body:{text}});i.value='';loadOwner();toast('تم إرسال رد الدعم ✓')}catch(e){toast('تعذر إرسال الرد',e.message,'error')}}
async function ownerTicketStatus(id,status){try{await api('/api/owner/tickets/'+encodeURIComponent(id)+'/status',{method:'POST',body:{status}});loadOwner()}catch(e){toast('تعذر تحديث التذكرة',e.message,'error')}}

function updateCoins(n){$('coinsTop').textContent=Number(n||0).toLocaleString('ar-EG')}
function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}


async function loadOffers(){
  const box=$('offersList'); if(!box)return;
  try{
    const d=await api('/api/offers');
    box.innerHTML=(d.offers||[]).map(o=>`<article class="offerCard"><div class="offerBadge">-${o.discount}%</div><h3>${esc(o.title)}</h3><p>${esc(o.description)}</p><strong>ينتهي ${new Date(o.endsAt).toLocaleString('ar-EG',{hour:'2-digit',minute:'2-digit'})}</strong></article>`).join('');
  }catch(e){box.innerHTML='<div class="emptyState">العروض غير متاحة حالياً.</div>'}
}
async function spinWheel(){
  const circle=$('wheelCircle'), result=$('wheelResult');
  if(!circle)return;
  circle.classList.add('spinning');
  result.textContent='جاري تدوير العجلة...';
  try{
    const d=await api('/api/wheel/spin',{method:'POST'});
    setTimeout(()=>{
      circle.classList.remove('spinning');
      updateCoins(d.coins);
      result.textContent=`🎉 ربحت ${d.prize.label}!`;
      toast('نتيجة عجلة الحظ 🎡',`ربحت ${d.prize.label} وتمت إضافتها لرصيدك.`);
    },1200);
  }catch(e){
    circle.classList.remove('spinning');
    result.textContent=e.message;
    if(e.status===401)showAuth('login');
  }
}
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
  await loadCart();
  await loadOffers();
  await loadAllNotifications();
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

document.addEventListener('keydown',e=>{
  if(e.key!=='Escape')return;
  const open=[...document.querySelectorAll('.modal.open')].pop();
  if(!open)return;
  if(open.id==='supportModal') closeSupportModal();
  else if(open.id==='authModal') closeAuth();
  else if(open.id==='giftModal') closeGiftModal();
  else if(open.id==='modal') closeModal();
  else if(open.id==='notificationModal') confirmNotification();
  else if(open.id==='notificationsModal') closeFixedModal('notificationsModal');
  else if(open.id==='dashboardModal'||open.id==='cartModal'||open.id==='ticketsModal') closeFixedModal(open.id);
});

let currentReviewProduct='';
async function openReviews(btn){
 const article=btn.closest('.product'); currentReviewProduct=article?.querySelector('h3')?.textContent||'';
 if(!currentReviewProduct)return;
 openFixedModal('reviewsModal'); $('reviewsTitle').textContent='تقييمات '+currentReviewProduct;
 try{const d=await api('/api/reviews?product='+encodeURIComponent(currentReviewProduct));
 $('reviewsList').innerHTML=d.reviews.length?d.reviews.map(r=>`<div class="reviewRow"><b>${esc(r.user)}</b><span>${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</span><p>${esc(r.text)}</p></div>`).join(''):'<p class="muted">لا توجد تقييمات بعد. كن أول من يقيّم.</p>';
 }catch(e){$('reviewsList').innerHTML='<p class="muted">سجّل الدخول لعرض وإضافة التقييمات.</p>'}
}
async function submitReview(){
 const text=$('reviewText').value.trim(),rating=Number($('reviewRating').value);
 if(!text)return toast('اكتب تقييمك أولاً','اكتب رأيك في المنتج.','error');
 try{await api('/api/reviews',{method:'POST',body:{product:currentReviewProduct,rating,text}});$('reviewText').value='';toast('تم إرسال التقييم ⭐','شكرًا على تقييمك.');const btn=[...document.querySelectorAll('.product')].find(x=>x.querySelector('h3')?.textContent===currentReviewProduct)?.querySelector('.reviewMini button'); if(btn)openReviews(btn);}
 catch(e){if(e.status===401)showAuth('login');else toast('تعذر إرسال التقييم',e.message,'error')}
}
function searchSite(q){
 q=String(q||'').trim().toLowerCase();
 document.querySelectorAll('.product').forEach(card=>{card.style.display=!q||card.textContent.toLowerCase().includes(q)?'':'none'});
 document.querySelectorAll('.roleplay article').forEach(card=>{card.style.display=!q||card.textContent.toLowerCase().includes(q)?'':'none'});
}
window.appliedCoupon=null;
async function applyCoupon(){
 const code=$('couponCode')?.value.trim(); if(!code)return;
 try{const d=await api('/api/coupons/check',{method:'POST',body:{code}});window.appliedCoupon=d;$('couponResult').textContent=`✓ خصم ${d.percent}% مطبق`;renderCart();toast('تم تطبيق الكوبون 🎟️',`خصم ${d.percent}% على السلة.`)}
 catch(e){window.appliedCoupon=null;$('couponResult').textContent='';toast('الكوبون غير صالح',e.message,'error')}
}
async function loadLeaderboard(){
 try{const d=await api('/api/leaderboard');const box=$('leaderboardList');if(!box)return;
 box.innerHTML=d.leaderboard.length?d.leaderboard.map(x=>`<div class="leaderRow"><b>#${x.rank}</b><strong>${esc(x.user)}</strong><span>المستوى ${x.level}</span><em>${x.coins.toLocaleString('ar-EG')} 🪙</em></div>`).join(''):'<p class="muted">لا يوجد مستخدمون بعد.</p>';
 }catch(e){}
}
async function createCoupon(){
 const code=$('couponCreateCode').value.trim(),percent=Number($('couponPercent').value),maxUses=Number($('couponMaxUses').value||0);
 try{await api('/api/owner/coupons',{method:'POST',body:{code,percent,maxUses}});$('couponCreateCode').value=$('couponPercent').value=$('couponMaxUses').value='';toast('تم إنشاء الكوبون 🎟️');loadOwnerCoupons();}
 catch(e){toast('تعذر إنشاء الكوبون',e.message,'error')}
}
async function loadOwnerCoupons(){
 try{const d=await api('/api/owner/coupons');const box=$('couponAdminList');if(box)box.innerHTML=d.coupons.map(c=>`<div class="item"><b>${esc(c.code)}</b> — خصم ${c.percent}% — ${c.usedBy.length}${c.maxUses?' / '+c.maxUses:''} استخدام</div>`).join('')||'لا توجد كوبونات';}catch(e){}
}
const __oldLoadOwner=window.loadOwner;

setTimeout(loadLeaderboard,500); setTimeout(loadOwnerCoupons,800);
