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
  // Place the notice at the user's current document position, so it is visible
  // where they are standing instead of always appearing at the top of the site.
  el.style.top=(window.scrollY+24)+'px';
  el.style.right='24px';
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

async function openNotificationCenter(){
 try{
  const d=await api('/api/notifications/all');
  $('notificationCount').textContent=d.unread||0;
  $('notificationList').innerHTML=(d.notifications||[]).map(n=>{
    const icon=n.type==='offer'?'🔥':n.type==='gift'?'🎁':n.type==='giftClaimed'?'💰':n.type==='order'?'🛒':n.type==='auction'?'🏆':n.type==='system'?'⚙️':'🔔';
    const action=(n.type==='gift' && n.giftId)?`<button class="notificationClaimBtn" onclick="claimNotificationGift('${esc(n.giftId)}','${esc(n.id)}')">استلام</button>`:'';
    return `<div class="notificationItem ${n.read?'read':'unread'}"><div class="notificationIcon">${icon}</div><div class="notificationBody"><b>${esc(n.title)}</b><p>${esc(n.text)}</p><small>${n.sender?`من ${esc(n.sender)} • `:''}${new Date(n.createdAt).toLocaleString('ar-EG')}</small>${action}</div></div>`;
  }).join('')||'<p class="muted">لا توجد إشعارات.</p>';
  openFixedModal('notificationCenterModal');
 }catch(e){if(e.status===401)showAuth('login');else toast('تعذر فتح الإشعارات',e.message,'error')}
}
async function claimNotificationGift(giftId,notificationId){
 try{
  const r=await api('/api/gifts/'+encodeURIComponent(giftId)+'/claim',{method:'POST'});
  updateCoins(r.coins);
  await api('/api/notifications/read',{method:'POST',body:{id:notificationId}});
  toast('تم استلام العملات 🎁',`تمت إضافة ${Number(r.amount||0).toLocaleString('ar-EG')} عملة إلى رصيدك.`);
  await openNotificationCenter();
 }catch(e){toast('تعذر استلام العملات',e.message,'error')}
}
async function readAllNotifications(){try{await api('/api/notifications/read-all',{method:'POST'});$('notificationCount').textContent='0';await openNotificationCenter();}catch(e){}}
async function pollNotifications(){
  try{
    const d=await api('/api/notifications/all');
    const rows=Array.isArray(d.notifications)?d.notifications:[];
    $('notificationCount').textContent=String(d.unread||0); if($('mobileNotificationCount'))$('mobileNotificationCount').textContent=String(d.unread||0); if($('bottomNotificationCount'))$('bottomNotificationCount').textContent=String(d.unread||0);
    const known=window.__knownNotificationIds||new Set();
    const fresh=rows.filter(n=>!known.has(n.id));
    rows.forEach(n=>known.add(n.id));
    window.__knownNotificationIds=known;
    // Notifications are intentionally kept inside the notification center.
    // Do not interrupt the user with a full-screen popup.
    if(fresh.length) notificationQueue.push(...fresh);
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
function closeSupportModal(){ closeFixedModal('supportPageModal'); }

async function broadcastNotification(){
  const title=$('broadcastTitle').value.trim(),text=$('broadcastText').value.trim();
  if(!title||!text)return toast('أكمل بيانات الإشعار','اكتب العنوان والنص أولاً.','error');
  try{const d=await api('/api/owner/broadcast',{method:'POST',body:{title,text,type:$('broadcastType')?.value||'general'}}); $('broadcastTitle').value='';$('broadcastText').value=''; toast('تم إرسال الإشعار ✓',`وصل إلى ${d.count} مستخدم.`);}
  catch(e){toast('تعذر إرسال الإشعار',e.message,'error')}
}

async function giftAllUsers(){
  const amount=Math.floor(Number($('giftAllAmount').value||0));
  if(!amount||amount<1)return toast('حدد عدد العملات','اكتب قيمة أكبر من صفر.','error');
  if(!confirm(`هل تريد إضافة ${amount.toLocaleString()} عملة لكل المستخدمين؟`))return;
  try{const d=await api('/api/owner/gift-all',{method:'POST',body:{amount}}); $('giftAllAmount').value=''; toast('تم إرسال الهدية 🎁',`تم تجهيز ${amount.toLocaleString()} عملة لكل مستخدم (${d.count} مستخدم).`);}
  catch(e){toast('تعذر إرسال الهدية',e.message,'error')}
}

function openModal(title,desc,extra='',anchor=null){
  const modal=$('modal');
  const box=modal?.querySelector('.modalBox');
  $('modalTitle').textContent=title;
  $('modalDesc').textContent=desc;
  $('modalExtra').innerHTML=extra;
  $('modalInput').value='';
  if(box){box.style.position='relative';box.style.top='';box.style.left='';box.style.margin='auto';}
  openFixedModal('modal');
  if(anchor && box){
    requestAnimationFrame(()=>{
      const r=anchor.getBoundingClientRect();
      const bw=box.offsetWidth, bh=box.offsetHeight;
      const gap=10, pad=10;
      let top=r.top;
      if(top+bh>window.innerHeight-pad) top=Math.max(pad, r.bottom-bh);
      let left=Math.min(Math.max(pad,r.left),Math.max(pad,window.innerWidth-bw-pad));
      box.style.position='fixed';
      box.style.top=top+'px';
      box.style.left=left+'px';
      box.style.margin='0';
    });
  }
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
    setTimeout(()=>toast('تم استلام الهدية اليومية 🎁','تمت إضافة 50 عملة فالكون إلى رصيدك.'),450);
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
async function loadPurchaseCount(){
 try{const d=await api('/api/purchases');const n=(d.purchases||[]).length;if($('purchaseCount'))$('purchaseCount').textContent=n;}
 catch(e){if($('purchaseCount'))$('purchaseCount').textContent='0'}
}

function updateCartCount(){const n=cart.reduce((a,x)=>a+Number(x.qty||1),0); if($('cartCount'))$('cartCount').textContent=n; if($('mobileCartCount'))$('mobileCartCount').textContent=n}
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
 try{const d=await api('/api/cart/checkout',{method:'POST',body:{note,couponCode:window.appliedCoupon?.code||''}});cart=d.cart||[];updateCoins(d.coins);updateCartCount();renderCart();toast('تم إرسال الطلب ✓','تم إنشاء الطلبات وحالتها الآن: جديد.');}catch(e){if(e.status===401)showAuth('login');else if(e.code==='NO_COINS') toast('رصيدك غير كافٍ 🪙',e.message,'error');else toast('تعذر إتمام الشراء',e.message,'error')}
}
async function openTickets(){openFixedModal('ticketsModal');await loadTickets()}
async function loadTickets(){try{const d=await api('/api/tickets');tickets=d.tickets||[];renderTickets()}catch(e){if(e.status===401)showAuth('login');else toast('تعذر تحميل التذاكر',e.message,'error')}}
function renderTickets(){const box=$('ticketList');if(!box)return;box.innerHTML=tickets.length?tickets.map(t=>`<div class="ticketCard"><div class="ticketHead"><b>#${esc(t.id.slice(0,8))} — ${esc(t.subject)}</b><em>${esc(t.status)}</em></div><p>${esc(t.message)}</p>${t.replies?.length?`<div class="ticketReplies">${t.replies.map(r=>`<div><b>${esc(r.from)}:</b> ${esc(r.text)}</div>`).join('')}</div>`:''}<div class="ticketReply"><input id="reply-${esc(t.id)}" placeholder="اكتب ردك..."><button onclick="replyTicket('${esc(t.id)}')">إرسال</button></div></div>`).join(''):'<p class="muted">لا توجد تذاكر. افتح أول تذكرة من النموذج أعلاه.</p>'}
async function createTicket(){const subject=$('ticketSubject').value.trim(),message=$('ticketMessage').value.trim();if(!subject||!message)return toast('أكمل بيانات التذكرة','العنوان والرسالة مطلوبان.','error');try{await api('/api/tickets',{method:'POST',body:{subject,message}});$('ticketSubject').value='';$('ticketMessage').value='';await loadTickets();toast('تم فتح التذكرة ✓','سيظهر رد الدعم داخل نفس التذكرة.')}catch(e){toast('تعذر فتح التذكرة',e.message,'error')}}
async function replyTicket(id){const i=$('reply-'+id),text=i?.value.trim();if(!text)return;if(!await api('/api/tickets/'+encodeURIComponent(id)+'/reply',{method:'POST',body:{text}}).catch(e=>{toast('تعذر إرسال الرد',e.message,'error');return null}))return;i.value='';loadTickets()}
async function openSiteReviews(){
  openFixedModal('siteReviewsModal');
  try{
    const d=await api('/api/reviews?product='+encodeURIComponent('__site__'));
    const rows=d.reviews||[];
    const avg=Number(d.average||0);
    $('siteAverage').textContent=avg.toFixed(1);
    $('siteReviewCount').textContent=rows.length+' تقييم';
    $('siteReviewsList').innerHTML=rows.length?rows.map(r=>`<div class="reviewRow">${r.avatar?`<img class="reviewAvatar" src="${esc(r.avatar)}" alt="Avatar">`:''}<b>${esc(r.user)}</b><span>${'★'.repeat(Number(r.rating))}${'☆'.repeat(5-Number(r.rating))}</span><p>${esc(r.text)}</p><small>${new Date(r.date).toLocaleDateString('ar-EG')}</small></div>`).join(''):'<p class="muted">لا توجد تقييمات بعد. كن أول من يقيّم الموقع.</p>';
  }catch(e){toast('تعذر تحميل التقييمات',e.message,'error')}
}
async function submitSiteReview(){
  const text=$('siteReviewText').value.trim(), rating=Number($('siteReviewRating').value);
  if(!text)return toast('اكتب تقييمك أولاً','شاركنا رأيك في الموقع.','error');
  try{
    await api('/api/reviews',{method:'POST',body:{product:'__site__',rating,text}});
    $('siteReviewText').value='';
    toast('تم إرسال تقييمك ⭐','شكرًا على رأيك.');
    openSiteReviews();
  }catch(e){
    if(e.status===401)showAuth('login');else toast('تعذر إرسال التقييم',e.message,'error');
  }
}
function filterSamp(q){
 q=String(q||'').trim().toLowerCase();
 document.querySelectorAll('#sampProducts .storeItem').forEach(card=>{card.style.display=!q||card.textContent.toLowerCase().includes(q)?'':'none'});
}

function searchSite(q){q=q.trim().toLowerCase();const box=$('searchResults');if(!q){box.innerHTML='';box.classList.remove('show');return}const items=[...document.querySelectorAll('.product')].map(x=>({title:x.querySelector('h3')?.textContent||'',desc:x.querySelector('p')?.textContent||'',el:x}));const role=[...document.querySelectorAll('.rpGrid article')].map(x=>({title:x.querySelector('b')?.textContent||'مفهوم رول بلاي',desc:x.querySelector('p')?.textContent||'',el:x}));const all=[...items,...role].filter(x=>(x.title+' '+x.desc).toLowerCase().includes(q)).slice(0,8);box.innerHTML=all.length?all.map((x,i)=>`<button class="searchResult" onclick="jumpToSearch(${i})"><b>${esc(x.title)}</b><small>${esc(x.desc)}</small></button>`).join(''):'<div class="noSearch">لا توجد نتائج.</div>';box.classList.add('show');window.__searchItems=all}
function jumpToSearch(i){const x=window.__searchItems?.[i];if(!x)return;clearSearch();x.el.scrollIntoView({behavior:'smooth',block:'center'})}
function clearSearch(){$('siteSearch').value='';$('searchResults').innerHTML='';$('searchResults').classList.remove('show')}
function buy(product,name,price,anchor=null){
  let extra='<div class="buyHint">ما هي مواصفات العربه الذي تريدها + ما هو اسمك في دسكورد و ما معلوماتك لنجاح الشراء</div>';
  if(product!=='customCar') extra='<div class="buyHint">ما هي تفاصيل الطلب + ما هو اسمك في دسكورد و ما معلوماتك لنجاح الشراء</div>';
  openModal('شراء '+name,`السعر ${Number(price).toLocaleString()} عملة فالكون.`,extra,anchor);
  $('modalBtn').textContent='تأكيد الشراء';
  $('modalBtn').onclick=async()=>{
    const note=$('modalInput').value.trim();
    if(!note)return toast('أكمل بيانات الشراء','اكتب المواصفات واسمك في ديسكورد والمعلومات المطلوبة.','error');
    try{
      const r=await api('/api/order',{method:'POST',body:{product,note}});
      closeModal(); updateCoins(r.coins); toast('تم إرسال الطلب ✓','تم تسجيل طلبك وسيتم التواصل معك من الدعم الفني.');
    }catch(e){
      if(e.code==='NO_COINS') toast('ليس لديك عملات كافية 🪙',`تحتاج ${Number(price).toLocaleString()} عملة فالكون.`,'error');
      else toast('تعذر تنفيذ الشراء',e.message,'error');
    }
  };
}

let __modalScrollY=0;
function lockPageForModal(){ document.documentElement.classList.add('modalLocked'); }
function unlockPageForModal(){ document.documentElement.classList.remove('modalLocked'); document.body.classList.remove('modalLocked'); document.body.style.position='';document.body.style.top='';document.body.style.left='';document.body.style.right='';document.body.style.width=''; }
function openFixedModal(id){
  const el=$(id);
  if(!el)return false;
  // Never stack pages/modals on top of each other: this was causing pages to appear
  // offset and the background to become impossible to scroll on phones.
  document.querySelectorAll('.modal.open').forEach(m=>{if(m!==el)m.classList.remove('open');});
  el.classList.add('open');
  lockPageForModal();
  const pageBox=el.querySelector('.fullPageBox');
  if(pageBox){pageBox.scrollTop=0;requestAnimationFrame(()=>pageBox.scrollTop=0);}
  return true;
}
function closeFixedModal(id){
  const el=$(id);
  if(el)el.classList.remove('open');
  if(!document.querySelector('.modal.open'))unlockPageForModal();
}
function support(){openSupportPage();}
let favoriteIds=new Set();
async function loadFavorites(){try{const d=await api('/api/favorites');favoriteIds=new Set(d.favorites||[]);}catch(e){favoriteIds=new Set();}}
async function toggleFavorite(id){try{const d=await api('/api/favorites/'+encodeURIComponent(id),{method:'POST'});if(d.favorited)favoriteIds.add(id);else favoriteIds.delete(id);renderSampProducts(window.__sampProducts||[]);toast(d.favorited?'تمت الإضافة للمفضلة ❤️':'تمت الإزالة من المفضلة','');}catch(e){if(e.status===401)showAuth('login');else toast('تعذر تحديث المفضلة',e.message,'error')}}
function renderSampProducts(products){
 $('sampProducts').innerHTML=products.map(p=>{
   const hasDiscount=Number(p.discountPercent||0)>0 && Number(p.originalPrice||p.price)>Number(p.price);
   const priceHtml=hasDiscount?`<div class="discountPrice"><del>${Number(p.originalPrice).toLocaleString('ar-EG')} 🪙</del><strong>${Number(p.price).toLocaleString('ar-EG')} 🪙</strong><b>-${Number(p.discountPercent)}%</b></div>`:`<strong>${Number(p.price).toLocaleString('ar-EG')} 🪙</strong>`;
   return `<article class="storeItem ${p.stock?'':'out'}"><button class="favoriteBtn ${favoriteIds.has(p.id)?'active':''}" onclick="toggleFavorite('${esc(p.id)}')">${favoriteIds.has(p.id)?'♥':'♡'}</button><div class="productIcon">${esc(p.icon)}</div><h3>${esc(p.name)}</h3><p>${esc(p.desc)}</p>${priceHtml}<small class="stockText ${p.stock?'available':'unavailable'}">${p.stock?'🟢 متوفر — '+Number(p.stockQty||0):'🔴 غير متوفر'}</small>${p.stock?`<button onclick="buy('${esc(p.id)}','${esc(p.name)}',${Number(p.price)},this)">شراء ${esc(p.name)}</button>`:'<button disabled>غير متوفر</button>'}</article>`;
 }).join('')||'<p class="muted">لا توجد منتجات.</p>';
}
async function openAuctions(){
 try{const d=await api('/api/auctions');const rows=d.auctions||[];$('auctionList').innerHTML=rows.length?rows.map(x=>{const leader=x.leader;return `<article class="auctionCard"><div class="auctionIcon">${esc(x.icon||'🚘')}</div><div class="auctionInfo"><span class="auctionBadge">LIVE AUCTION</span><h3>${esc(x.title)}</h3><p>${esc(x.desc)}</p><small>${esc(x.details||'')}</small><div class="auctionMeta"><b>أعلى مزايدة: ${leader?Number(leader.amount).toLocaleString('ar-EG'):'لا توجد'} 🪙</b><span>المزايدات: ${x.bidCount||0}</span><span>ينتهي: ${new Date(x.endsAt).toLocaleString('ar-EG')}</span></div><div class="bidRow"><input id="bid-${esc(x.id)}" type="number" min="${Number(x.leader?.amount||x.startBid||1)+1}" placeholder="اكتب مزايدتك"><button class="btn primary" onclick="placeBid('${esc(x.id)}')">مزاد 🔥</button></div></div></article>`}).join(''):'<div class="emptyAuction">لا يوجد مزاد حاليًا. عندما ينشئ صاحب الموقع مزادًا سيظهر هنا 🔒</div>';openFixedModal('auctionModal');}catch(e){toast('تعذر تحميل المزادات',e.message,'error')}
}
async function placeBid(id){const input=$('bid-'+id),amount=Number(input?.value||0);if(!amount)return toast('اكتب المزايدة','حدد عدد العملات التي تريد المزايدة بها.','error');try{const d=await api('/api/auctions/'+encodeURIComponent(id)+'/bid',{method:'POST',body:{amount}});toast('تمت المزايدة 🔥',`أعلى مزايدة الآن ${Number(d.current).toLocaleString('ar-EG')} عملة.`);openAuctions();}catch(e){toast('لم تتم المزايدة',e.message,'error')}}
async function unlockProduct(){const code=$('unlockProductCode')?.value.trim();if(!code)return toast('اكتب الكود','أدخل كود إظهار المنتج.','error');try{const d=await api('/api/unlock-code',{method:'POST',body:{code}});$('unlockProductCode').value='';toast('تم فتح المنتج 🔓',d.message);openSamp();}catch(e){toast('الكود غير صالح',e.message,'error')}}

async function openSamp(){const el=$('sampModal');if(!el)return;await loadFavorites();try{const d=await api('/api/products');window.__sampProducts=d.products||[];renderSampProducts(window.__sampProducts);}catch(e){toast('تعذر تحميل المنتجات',e.message,'error')}openFixedModal('sampModal');}
function openSupportPage(){const i=$('supportModalInput');if(i)i.value='';openFixedModal('supportPageModal');}
function openWheel(){openFixedModal('wheelModal'); const r=$('wheelResult'); if(r)r.textContent='جاهز؟ حظ سعيد 🔥';}
function openRolePage(){openFixedModal('rolePageModal');}
async function openStaffNotifications(){
  try{
    const d=await api('/api/staff/notifications');
    const rows=d.notifications||[];
    const items=rows.map(n=>{
      let action='';
      if(n.type==='staffOrder' && n.orderId){
        action=`<div class="staffOrderActions"><button onclick="staffOrderStatus('${esc(n.orderId)}','تم التسليم')">تم التسليم</button><button class="dangerBtn" onclick="staffOrderStatus('${esc(n.orderId)}','ملغي')">إلغاء</button></div>`;
      }
      return `<div class="staffNoticeItem ${n.read?'read':''}"><b>${esc(n.title)}</b><p>${esc(n.text)}</p><small>${new Date(n.createdAt).toLocaleString('ar-EG')}</small>${action}</div>`;
    }).join('');
    $('staffNotifyList').innerHTML=items||'<div class="emptyAuction">لا توجد إشعارات إدارية جديدة.</div>';
    $('staffNotificationCount').textContent=d.unread||0;
    openFixedModal('staffNotifyModal');
  }catch(e){if(e.status===401)showAuth('login');else toast('تعذر فتح إشعارات الإدارة',e.message,'error')}
}
async function staffOrderStatus(id,status){
  try{
    const d=await api('/api/owner/order-status',{method:'POST',body:{id,status}});
    if(status==='ملغي') toast('تم إلغاء الطلب ✓',`تم إرجاع ${Number(d.order?.amountPaid||d.order?.price||0).toLocaleString('ar-EG')} عملة للعضو.`);
    else if(status==='تم التسليم') toast('تم التسليم ✓','تم إرسال إشعار للعضو.');
    else toast('تم تحديث الطلب ✓',status);
    openStaffNotifications();
  }catch(e){toast('تعذر تحديث الطلب',e.message,'error')}
}
function openStaffTicket(id){closeFixedModal('staffNotifyModal');openFixedModal('ownerTicketFocusModal');loadOwnerTicketFocus(id)}
async function loadOwnerTicketFocus(id){try{const d=await api('/api/owner');const t=(d.tickets||[]).find(x=>x.id===id);if(!t)return;const box=$('ownerTicketFocus');box.innerHTML=`<div class="ticketFocusCard"><h3>🎫 #${esc(t.id.slice(0,8))} — ${esc(t.subject)}</h3><p><b>${esc(t.user)}</b></p><div class="ticketFocusMessage">${esc(t.message)}</div><div class="ticketReplies">${(t.replies||[]).map(r=>`<div><b>${esc(r.from)}:</b> ${esc(r.text)}</div>`).join('')||'<span class="muted">لا توجد ردود بعد.</span>'}</div><textarea id="focusTicketReply" placeholder="اكتب رد الدعم للعضو..."></textarea><button class="btn primary" onclick="replyFocusedTicket('${esc(t.id)}')">إرسال الرد</button><select onchange="ownerTicketStatus('${esc(t.id)}',this.value)"><option ${t.status==='مفتوحة'?'selected':''}>مفتوحة</option><option ${t.status==='قيد المتابعة'?'selected':''}>قيد المتابعة</option><option ${t.status==='تم الحل'?'selected':''}>تم الحل</option><option ${t.status==='مغلقة'?'selected':''}>مغلقة</option></select></div>`;}catch(e){toast('تعذر فتح التذكرة',e.message,'error')}}
async function replyFocusedTicket(id){const text=$('focusTicketReply')?.value.trim();if(!text)return;try{await api('/api/owner/tickets/'+encodeURIComponent(id)+'/reply',{method:'POST',body:{text}});toast('تم إرسال الرد ✓','سيصل للعضو في مركز الإشعارات.');loadOwnerTicketFocus(id);}catch(e){toast('تعذر إرسال الرد',e.message,'error')}}

async function openPurchases(){
  try{
    const d=await api('/api/purchases');
    const rows=d.purchases||[];
    $('purchasesList').innerHTML=rows.length?rows.map(o=>{
      const status=o.status||'جديد';
      const discount=Number(o.discountPercent||0);
      return `<article class="purchaseRow">
        <div class="purchaseIcon">📦</div>
        <div class="purchaseInfo"><b>${esc(o.product)}</b><small>رقم الطلب: ${esc(String(o.id).slice(0,8))} • ${new Date(o.date).toLocaleString('ar-EG')}</small>
        <span>${discount?`<del>${Number(o.originalPrice||o.price).toLocaleString('ar-EG')} 🪙</del> ` : ''}<strong>${Number(o.amountPaid??o.price).toLocaleString('ar-EG')} 🪙</strong></span></div>
        <em class="purchaseStatus ${status==='تم التسليم'?'done':status==='ملغي'?'cancelled':''}">${esc(status)}</em>
      </article>`;
    }).join(''):'<div class="emptyAuction">لم تشترِ أي شيء حتى الآن.</div>';
    openFixedModal('purchasesModal');
  }catch(e){if(e.status===401)showAuth('login');else toast('تعذر تحميل مشترياتك',e.message,'error')}
}
function openSettings(){
  if(!$('settingsModal'))return;
  api('/api/me').then(d=>{if(!d.loggedIn)return showAuth('login');$('settingsUsername').value=d.user.username||'';$('settingsAvatar').value=d.user.avatar||'';$('settingsOldPass').value='';$('settingsNewPass').value='';openFixedModal('settingsModal')}).catch(()=>showAuth('login'));
}
async function saveSettings(){
  try{
    const username=$('settingsUsername').value.trim(),avatar=$('settingsAvatar').value.trim(),oldPassword=$('settingsOldPass').value,newPassword=$('settingsNewPass').value;
    const d=await api('/api/settings',{method:'POST',body:{username,avatar,oldPassword,newPassword}});
    closeFixedModal('settingsModal');await init(false);toast('تم حفظ الإعدادات ✓','تم تحديث بيانات حسابك.');
  }catch(e){toast('تعذر حفظ الإعدادات',e.message,'error')}
}
async function spinWheel(){const btn=$('wheelBtn');if(btn)btn.disabled=true;try{const r=await api('/api/wheel',{method:'POST'});const wheel=$('luckWheel');if(wheel){wheel.style.transition='transform 2.2s cubic-bezier(.12,.75,.2,1)';wheel.style.transform='rotate('+(1440+Math.floor(Math.random()*360))+'deg)';}setTimeout(()=>{if($('wheelResult'))$('wheelResult').textContent=r.message;},2200);updateCoins(r.coins);setTimeout(()=>{if(btn)btn.disabled=false;},2300);}catch(e){toast('تعذر لف العجلة',e.message,'error');if(btn)btn.disabled=false}}
async function loadBundles(){
 try{
  const d=await api('/api/bundles'); const box=$('bundlesList'); if(!box)return;
  box.innerHTML=(d.bundles||[]).length ? d.bundles.map(b=>{
   const names=(b.productNames||[]).map(esc).join(' + ');
   const ends=b.endsAt?`<span class="offerEnds">ينتهي: ${new Date(b.endsAt).toLocaleString('ar-EG')}</span>`:'';
   const pct=Number(b.originalTotal)>Number(b.price)?Math.round((1-Number(b.price)/Number(b.originalTotal))*100):0;
   return `<article class="offerCard bundleCard"><div class="bundleBadge">🎁 عرض مجمع ${pct?`-${pct}%`:''}</div><h3>${esc(b.title)}</h3><p>${esc(b.desc||'')}<br><small>${names}</small></p><div class="offerPrice"><del>${Number(b.originalTotal).toLocaleString('ar-EG')} 🪙</del> ${Number(b.price).toLocaleString('ar-EG')} 🪙</div>${ends}<button class="btn primary" onclick="buy('bundle:${esc(b.id)}','${esc(b.title)}',${Number(b.price)},this)">شراء العرض</button></article>`;
  }).join(''):'<p class="muted">لا توجد عروض مجمعة حالياً.</p>';
 }catch(e){if($('bundlesList'))$('bundlesList').innerHTML='<p class="muted">تعذر تحميل العروض المجمعة.</p>'}
}
async function loadOffers(){
  try{
    const d=await api('/api/offers');
    const box=$('offersList'); if(!box)return;
    box.innerHTML=d.offers.length?d.offers.map(o=>`<article class="offerCard"><h3>🔥 ${esc(o.title)}</h3><p>${esc(o.desc)}</p><div class="offerPrice">${Number(o.price).toLocaleString('ar-EG')} F</div><span class="offerEnds">ينتهي: ${new Date(o.endsAt).toLocaleString('ar-EG')}</span><button class="btn primary" onclick="buy('offer:${esc(o.id)}','${esc(o.title)}',${Number(o.price)},this)">شراء العرض</button></article>`).join(''):'<p class="muted">لا توجد عروض مؤقتة حالياً.</p>';
  }catch(e){}
}
async function createOffer(){
  try{
    const title=$('offerTitle').value.trim(),desc=$('offerDesc').value.trim(),price=Math.floor(Number($('offerPrice').value)),endsAt=$('offerEnds').value;
    if(!title||!desc||!price||!endsAt)return toast('أكمل بيانات العرض','كل البيانات مطلوبة.','error');
    const d=await api('/api/owner/offers',{method:'POST',body:{title,desc,price,endsAt}});
    $('offerTitle').value=$('offerDesc').value=$('offerPrice').value=$('offerEnds').value='';
    toast('تم نشر العرض ✓','سيظهر للمستخدمين حتى موعد انتهائه.');loadOffers();loadOwner();
  }catch(e){toast('تعذر إنشاء العرض',e.message,'error')}
}

async function claimCurrentRef(silent=false){
  if(!currentRef)return false;
  const code=currentRef;
  try{
    const r=await api('/api/ref/'+encodeURIComponent(code)+'/claim',{method:'POST'});
    currentRef=null;
    if(r.pending){
      toast('🎁 تم ربحك العملات',`لديك ${Number(r.amount||0).toLocaleString('ar-EG')} عملة فالكون جاهزة للاستلام.`);
      await loadPendingGifts(true);
      return true;
    }
    if(!silent)toast('الرابط غير متاح',r.error||'تعذر استخدام الرابط.','error');
    return false;
  }catch(e){
    if(e.status===401)showAuth('login');
    else if(!silent)toast('تعذر استخدام رابط العملات',e.message,'error');
    return false;
  }
}

function closeGiftModal(){
  closeFixedModal('giftModal');
}

async function loadPendingGifts(showPrompt=false){
  try{
    const d=await api('/api/gifts');
    pendingGifts=Array.isArray(d.gifts)?d.gifts:[];
    if(showPrompt && pendingGifts.length) showGiftPrompt();
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
async function saveAuction(){try{const body={title:$('auctionTitle').value.trim(),desc:$('auctionDesc').value.trim(),icon:$('auctionIcon').value.trim()||'🚘',details:$('auctionDetails').value.trim(),startBid:Number($('auctionStart').value||1),endsAt:$('auctionEnds').value};await api('/api/owner/auctions',{method:'POST',body});toast('تم إنشاء المزاد 🔥','ظهر الآن للمستخدمين.');['auctionTitle','auctionDesc','auctionDetails','auctionStart','auctionEnds'].forEach(id=>$(id).value='');loadOwner();}catch(e){toast('تعذر إنشاء المزاد',e.message,'error')}}
async function closeAuction(id){if(!confirm('إنهاء المزاد الآن؟'))return;try{const d=await api('/api/owner/auctions/'+encodeURIComponent(id)+'/close',{method:'POST'});toast('تم إنهاء المزاد ✓',d.winner?`الفائز: ${d.winner.user} — ${Number(d.winner.amount).toLocaleString('ar-EG')} عملة`:'لم توجد مزايدات');loadOwner();}catch(e){toast('تعذر إنهاء المزاد',e.message,'error')}}
async function createUnlockCode(){try{const body={code:$('unlockCode').value.trim(),productId:$('unlockProductId').value,maxUses:Number($('unlockMaxUses').value||0),expiresAt:$('unlockExpires').value};const d=await api('/api/owner/unlock-codes',{method:'POST',body});toast('تم إنشاء كود المنتج 🔓',`الكود: ${d.code.code}`);$('unlockCode').value=$('unlockMaxUses').value=$('unlockExpires').value='';loadOwner();}catch(e){toast('تعذر إنشاء الكود',e.message,'error')}}
async function saveBundleOffer(){
 const title=$('bundleTitle').value.trim(),desc=$('bundleDesc').value.trim(),ids=$('bundleProductIds').value.split(',').map(x=>x.trim()).filter(Boolean),price=Number($('bundlePrice').value),endsAt=$('bundleEnds').value;
 if(!title||ids.length<2||!price)return toast('أكمل بيانات العرض','اكتب الاسم ومنتجين على الأقل والسعر.','error');
 try{const d=await api('/api/owner/bundles',{method:'POST',body:{title,desc,productIds:ids,price,endsAt}});$('bundleTitle').value=$('bundleDesc').value=$('bundleProductIds').value=$('bundlePrice').value=$('bundleEnds').value='';toast('تم نشر العرض المجمع 🎁',`${d.bundle.productNames.length} منتجات في عرض واحد.`);loadOwner();loadBundles();}catch(e){toast('تعذر نشر العرض المجمع',e.message,'error')}
}
async function deleteBundle(id){try{await api('/api/owner/bundles/'+encodeURIComponent(id),{method:'DELETE'});toast('تم حذف العرض');loadOwner();loadBundles();}catch(e){toast('تعذر حذف العرض',e.message,'error')}}
async function loadOwner(){
  try{
    const d=await api('/api/owner');
    const pd=await api('/api/owner/products'); $('productAdminList').innerHTML=(pd.products||[]).map(x=>`<div class="item"><b>${esc(x.icon)} ${esc(x.name)}</b> — ${Number(x.price).toLocaleString('ar-EG')} 🪙 ${Number(x.discountPercent||0)?`— 🏷️ خصم ${Number(x.discountPercent)}%`:''} — ${x.stock?'🟢 متوفر: '+Number(x.stockQty||0):'🔴 غير متوفر'} ${x.stockEnabled===false?'🔒 مغلق':''} ${x.hiddenByCode?'— 🔒 بكود':''} <button onclick="editProductStock('${esc(x.id)}',${Number(x.stockQty||0)},${x.stockEnabled!==false})">تعديل الـStock</button> <button onclick="editProductDiscount('${esc(x.id)}',${Number(x.discountPercent||0)})">الخصم</button> <button onclick="deleteProduct('${esc(x.id)}')">حذف</button></div>`).join('');
    const psel=$('unlockProductId');if(psel)psel.innerHTML=(pd.products||[]).map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('');
    $('orders').innerHTML=d.purchases.length?d.purchases.map(x=>`<div class="item"><b>🛒 ${esc(x.product)}</b> — ${esc(x.user)}<br>Discord: ${esc(x.note)}<br>${Number(x.price).toLocaleString()} عملة • ${new Date(x.date).toLocaleString('ar-EG')}<br><select onchange="updateOrderStatus('${esc(x.id)}',this.value)"><option ${x.status==='جديد'?'selected':''}>جديد</option><option ${x.status==='قيد المراجعة'?'selected':''}>قيد المراجعة</option><option ${x.status==='قيد التجهيز'?'selected':''}>قيد التجهيز</option><option ${x.status==='تم التسليم'?'selected':''}>تم التسليم</option><option ${x.status==='ملغي'?'selected':''}>ملغي</option></select></div>`).join(''):'لا توجد طلبات';
    $('messages').innerHTML=d.supportMessages.length?d.supportMessages.map(x=>`<div class="item"><b>🎧 ${esc(x.user)}</b><br>${esc(x.message)}<br>${new Date(x.date).toLocaleString('ar-EG')}</div>`).join(''):'لا توجد رسائل';
    $('refs').innerHTML=Object.entries(d.refs).map(([k,v])=>`<div class="item"><b>${esc(k)}</b><br>${Number(v.amount).toLocaleString()} عملة لكل شخص • ${v.usedBy.length}/${v.maxUses}<br>${location.origin}/?ref=${encodeURIComponent(k)}</div>`).join('')||'لا توجد روابط';
    $('auctionAdminList').innerHTML=(d.auctions||[]).map(x=>{const w=x.winner||((x.bids||[]).slice().sort((a,b)=>b.amount-a.amount)[0]);return `<div class="item"><b>${esc(x.icon)} ${esc(x.title)}</b> — ${x.status==='active'?'🟢 مباشر':'⚫ منتهي'}<br>أعلى مزايدة: ${w?Number(w.amount).toLocaleString('ar-EG')+' 🪙 — '+esc(w.user):'لا توجد'}<br><small>ينتهي: ${new Date(x.endsAt).toLocaleString('ar-EG')}</small>${x.status==='active'?`<br><button onclick="closeAuction('${esc(x.id)}')">إنهاء المزاد</button>`:''}</div>`}).join('')||'لا توجد مزادات';
    $('unlockAdminList').innerHTML=(d.unlockCodes||[]).map(c=>`<div class="item"><b>🔓 ${esc(c.code)}</b> → ${esc(c.productId)}<br>${c.usedBy.length}${c.maxUses?' / '+c.maxUses:''} استخدام${c.expiresAt?' • ينتهي '+new Date(c.expiresAt).toLocaleString('ar-EG'):''}</div>`).join('')||'لا توجد أكواد';
    $('tickets').innerHTML=(d.tickets||[]).length?d.tickets.map(t=>`<div class="item"><b>🎫 #${esc(t.id.slice(0,8))} — ${esc(t.user)}</b><br>${esc(t.subject)}<br>${esc(t.message)}<br><b>الحالة:</b> ${esc(t.status)}${(t.replies||[]).length?'<div class="ticketReplies">'+t.replies.map(r=>`<div><b>${esc(r.from)}:</b> ${esc(r.text)}</div>`).join('')+'</div>':''}<input id="ownerReply-${esc(t.id)}" placeholder="رد الدعم..."><button onclick="ownerReplyTicket('${esc(t.id)}')">إرسال الرد</button></div>`).join(''):'لا توجد تذاكر';
    $('offerAdminList').innerHTML=(d.offers||[]).map(o=>`<div class="item"><b>🔥 ${esc(o.title)}</b> — ${Number(o.price).toLocaleString('ar-EG')} 🪙<br><small>${esc(o.desc)} • ينتهي ${new Date(o.endsAt).toLocaleString('ar-EG')}</small></div>`).join('')||'لا توجد عروض حالياً';
    $('bundleAdminList').innerHTML=(d.bundles||[]).map(b=>`<div class="item"><b>🎁 ${esc(b.title)}</b> — ${Number(b.price).toLocaleString('ar-EG')} 🪙 بدل ${Number(b.originalTotal).toLocaleString('ar-EG')} 🪙<br><small>${(b.productNames||[]).map(esc).join(' + ')}</small> <button onclick="deleteBundle('${esc(b.id)}')">حذف</button></div>`).join('')||'لا توجد عروض مجمعة حالياً';
    const nd=await api('/api/news');$('newsAdminList').innerHTML=(nd.news||[]).map(n=>`<div class="item"><b>${esc(n.title)}</b><br><small>${esc(n.text)}</small><br><button onclick="deleteNews('${esc(n.id)}')">حذف</button></div>`).join('')||'<p class="muted">لا توجد أخبار.</p>';
    loadWheelAdmin();
  }catch(e){console.warn(e)}
}

async function updateOrderStatus(id,status){try{await api('/api/owner/order-status',{method:'POST',body:{id,status}});toast('تم تحديث حالة الطلب ✓',status)}catch(e){toast('تعذر تحديث الطلب',e.message,'error')}}
async function ownerReplyTicket(id){const i=$('ownerReply-'+id),text=i?.value.trim();if(!text)return;try{await api('/api/owner/tickets/'+encodeURIComponent(id)+'/reply',{method:'POST',body:{text}});i.value='';loadOwner();toast('تم إرسال رد الدعم ✓')}catch(e){toast('تعذر إرسال الرد',e.message,'error')}}
async function ownerTicketStatus(id,status){try{await api('/api/owner/tickets/'+encodeURIComponent(id)+'/status',{method:'POST',body:{status}});loadOwner()}catch(e){toast('تعذر تحديث التذكرة',e.message,'error')}}

function updateCoins(n){$('coinsTop').textContent=Number(n||0).toLocaleString('ar-EG')}
function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}

async function saveProduct(){try{const body={id:$('prodId').value.trim(),name:$('prodName').value.trim(),icon:$('prodIcon').value.trim(),desc:$('prodDesc').value.trim(),price:Number($('prodPrice').value),discountPercent:Number($('prodDiscount').value||0),stockQty:Number($('prodStockQty').value||0),stockEnabled:$('prodStock').checked,hiddenByCode:$('prodHiddenByCode')?.checked};await api('/api/owner/products',{method:'POST',body});toast('تم حفظ المنتج ✓');$('prodId').value=$('prodName').value=$('prodDesc').value=$('prodPrice').value=$('prodStockQty').value=$('prodDiscount').value='';$('prodStock').checked=false;loadOwner();}catch(e){toast('تعذر حفظ المنتج',e.message,'error')}}
async function editProductDiscount(id,currentPercent){
 const val=prompt('نسبة الخصم من 0 إلى 100:',String(currentPercent||0));
 if(val===null)return;
 try{
   const d=await api('/api/staff/products/'+encodeURIComponent(id)+'/discount',{method:'POST',body:{discountPercent:Number(val)}});
   toast('تم تحديث الخصم ✓',d.product.discountPercent?`خصم ${d.product.discountPercent}%`:'تم إلغاء الخصم');loadOwner();
 }catch(e){toast('تعذر تحديث الخصم',e.message,'error')}
}
async function editProductStock(id,currentQty,currentEnabled){const qty=prompt('اكتب عدد الـStock:',String(currentQty));if(qty===null)return;const enabled=confirm('هل تريد فتح الـStock لهذا المنتج؟\nموافق = مفتوح\nإلغاء = مغلق');try{await api('/api/owner/products/'+encodeURIComponent(id)+'/stock',{method:'POST',body:{stockQty:Math.max(0,Number(qty)||0),stockEnabled:enabled}});toast(enabled?'تم فتح الـStock ✓':'تم قفل الـStock 🔒');loadOwner();}catch(e){toast('تعذر تعديل الـStock',e.message,'error')}}
async function deleteProduct(id){if(!confirm('حذف المنتج؟'))return;try{await api('/api/owner/products/'+encodeURIComponent(id),{method:'DELETE'});loadOwner();toast('تم حذف المنتج');}catch(e){toast('تعذر حذف المنتج',e.message,'error')}}
async function saveWheelSettings(){try{const lines=$('wheelPrizes').value.split('\n').map(x=>x.trim()).filter(Boolean).map(x=>{const [label,amount,weight]=x.split('|');return {label:label||'جائزة',amount:Number(amount||0),weight:Number(weight||1)}});const d=await api('/api/owner/wheel',{method:'POST',body:{enabled:$('wheelEnabled').checked,cost:Number($('wheelCost').value||0),dailyLimit:Number($('wheelLimit').value||1),prizes:lines}});toast('تم حفظ عجلة الحظ ✓',`${d.wheel.prizes.length} جوائز`);}catch(e){toast('تعذر حفظ العجلة',e.message,'error')}}
async function loadWheelAdmin(){try{const d=await api('/api/wheel/config'),w=d.wheel;$('wheelEnabled').checked=w.enabled;$('wheelCost').value=w.cost;$('wheelLimit').value=w.dailyLimit;$('wheelPrizes').value=w.prizes.map(x=>`${x.label}|${x.amount}|${x.weight}`).join('\n');}catch(e){}}
async function addAdmin(){const username=$('adminUsername').value.trim();if(!username)return;try{await api('/api/owner/admin',{method:'POST',body:{username}});$('adminUsername').value='';toast('تمت إضافة الإدارة ✓');}catch(e){toast('تعذر إضافة الإدارة',e.message,'error')}}
async function loadSiteConfig(isOwner=false,isStaff=false){
  try{
    const d=await api('/api/site/config');
    const b=d.banner||{};
    const banner=$('announcementBanner');
    if(banner){banner.style.display=b.enabled?'flex':'none';$('bannerTitle').textContent=b.title||'';$('bannerText').textContent=b.text||'';$('bannerButton').textContent=b.buttonText||'شاهد العرض';$('bannerButton').href=b.buttonUrl||'#home';}
    const h=d.home||{};
    if($('homeTag'))$('homeTag').textContent=h.tag||'';
    if($('homeTitle'))$('homeTitle').textContent=h.title||'';
    if($('homeAccent'))$('homeAccent').textContent=h.accent||'';
    if($('homeDescription'))$('homeDescription').textContent=h.description||'';
    const m=d.maintenance||{};
    const overlay=$('maintenanceOverlay');
    if(overlay){const show=!!m.enabled&&!isOwner&&!isStaff;overlay.style.display=show?'grid':'none';$('maintenanceText').textContent=m.message||'الموقع تحت الصيانة حالياً. نعود قريباً 🦅';}
    if(isStaff && $('bannerEnabled')){$('bannerEnabled').checked=!!b.enabled;$('bannerTitleInput').value=b.title||'';$('bannerTextInput').value=b.text||'';$('bannerButtonText').value=b.buttonText||'';$('bannerButtonUrl').value=b.buttonUrl||'';}
    if(isOwner){const state=$('maintenanceState');if(state)state.textContent=m.enabled?'🟢 مفعّل — الزوار يرون شاشة الصيانة':'⚪ متوقف — الموقع متاح للجميع';$('maintenanceEnabled').checked=!!m.enabled;$('maintenanceMessage').value=m.message||'';$('bannerEnabled').checked=!!b.enabled;$('bannerTitleInput').value=b.title||'';$('bannerTextInput').value=b.text||'';$('bannerButtonText').value=b.buttonText||'';$('bannerButtonUrl').value=b.buttonUrl||'';$('homeTagInput').value=h.tag||'';$('homeTitleInput').value=h.title||'';$('homeAccentInput').value=h.accent||'';$('homeDescriptionInput').value=h.description||'';}
  }catch(e){}
  loadNews();
}
async function loadNews(){try{const d=await api('/api/news');const box=$('newsList');if(box)box.innerHTML=(d.news||[]).map(n=>`<article class="newsCard"><small>${new Date(n.createdAt).toLocaleString('ar-EG')}</small><h3>📰 ${esc(n.title)}</h3><p>${esc(n.text)}</p></article>`).join('')||'<p class="muted">لا توجد أخبار حالياً.</p>';}catch(e){}}
async function saveMaintenance(){
  try{
    const enabled=!!$('maintenanceEnabled').checked;
    const message=$('maintenanceMessage').value.trim();
    const d=await api('/api/owner/maintenance',{method:'POST',body:{enabled,message}});
    toast('تم حفظ وضع الصيانة ✓',enabled?'تم تفعيل الصيانة للزوار.':'تم إيقاف وضع الصيانة.','success');
    const state=$('maintenanceState');if(state)state.textContent=enabled?'🟢 مفعّل — الزوار يرون شاشة الصيانة':'⚪ متوقف — الموقع متاح للجميع';
    await loadSiteConfig(true,true);
  }catch(e){toast('تعذر حفظ وضع الصيانة',e.message,'error')}
}
async function saveBanner(){try{await api('/api/owner/banner',{method:'POST',body:{enabled:$('bannerEnabled').checked,title:$('bannerTitleInput').value,text:$('bannerTextInput').value,buttonText:$('bannerButtonText').value,buttonUrl:$('bannerButtonUrl').value}});toast('تم حفظ البانر ✓');loadSiteConfig(true,true);}catch(e){toast('تعذر حفظ البانر',e.message,'error')}}
async function saveHomeCustomization(){try{await api('/api/owner/home',{method:'POST',body:{tag:$('homeTagInput').value,title:$('homeTitleInput').value,accent:$('homeAccentInput').value,description:$('homeDescriptionInput').value}});toast('تم حفظ تخصيص الصفحة الرئيسية ✓');loadSiteConfig(true,true);}catch(e){toast('تعذر حفظ الصفحة الرئيسية',e.message,'error')}}
async function createNews(){const title=$('newsTitleInput').value.trim(),text=$('newsTextInput').value.trim();if(!title||!text)return toast('أكمل الخبر','العنوان والمحتوى مطلوبان.','error');try{await api('/api/owner/news',{method:'POST',body:{title,text}});$('newsTitleInput').value=$('newsTextInput').value='';toast('تم نشر الخبر 📰');loadNews();loadOwner();}catch(e){toast('تعذر نشر الخبر',e.message,'error')}}
async function deleteNews(id){try{await api('/api/owner/news/'+encodeURIComponent(id),{method:'DELETE'});loadOwner();loadNews();}catch(e){toast('تعذر حذف الخبر',e.message,'error')}}
async function loadLiveDashboard(){try{const d=await api('/api/owner/dashboard');const box=$('liveDashboard');if(box)box.innerHTML=`<div><b>👥 ${d.users}</b><small>المستخدمون</small></div><div><b>📦 ${d.newOrders}</b><small>طلبات جديدة</small></div><div><b>🎫 ${d.openTickets}</b><small>تذاكر مفتوحة</small></div><div><b>🎧 ${d.support}</b><small>رسائل الدعم</small></div><div><b>🏆 ${d.auctions}</b><small>مزادات مباشرة</small></div><div><b>🪙 ${Number(d.coins).toLocaleString('ar-EG')}</b><small>إجمالي العملات</small></div>`;}catch(e){}}

let __siteRefreshTimer;
async function init(showDaily=true){
  try{
    const d=await api('/api/me');
    if(document.body.classList.contains('adminPage')){
      if(!d.loggedIn || !d.staff){ window.location.href='/'; return; }
      window.__isOwner=!!d.owner; window.__isStaff=true;
      await loadSiteConfig(window.__isOwner,true);
      document.querySelectorAll('.ownerOnlyCard').forEach(el=>el.style.display=d.owner?'block':'none');
      await loadOwner();
      loadLiveDashboard();
      clearInterval(window.__liveDashTimer);
      window.__liveDashTimer=setInterval(loadLiveDashboard,5000);
      return;
    }
    window.__isOwner=!!d.owner;window.__isStaff=!!d.staff;await loadSiteConfig(window.__isOwner,window.__isStaff);clearInterval(__siteRefreshTimer);__siteRefreshTimer=setInterval(()=>loadSiteConfig(window.__isOwner,window.__isStaff),30000);
    if(d.loggedIn){
      updateCoins(d.user.coins);
      $('loginState').textContent=d.owner?'المالك 👑':(d.staff?'الإدارة 🛡️':'عضو مسجل');
      $('account').innerHTML=`<button class="accountBtn" onclick="openSettings()">⚙️ ${esc(d.user.username)}</button>`;
      $('mobileOwner').style.display=d.staff?'block':'none';
      $('owner').style.display=d.staff?'block':'none';
      $('staffNotify').style.display=d.staff?'inline-flex':'none';
      if(d.staff){ try{ const sn=await api('/api/staff/notifications'); $('staffNotificationCount').textContent=sn.unread||0; }catch(e){} }
      if(d.staff && !document.querySelector('.desktopAdminLink')){
        const a=document.createElement('a'); a.href='/admin.html'; a.className='quickBtn desktopAdminLink'; a.textContent='🛡️ الإداريين'; document.querySelector('header')?.insertBefore(a,document.querySelector('#account'));
      }
      document.querySelectorAll('.ownerOnlyCard').forEach(el=>el.style.display=d.owner?'block':'none');
      if(d.staff){loadOwner();loadLiveDashboard();clearInterval(window.__liveDashTimer);window.__liveDashTimer=setInterval(loadLiveDashboard,5000);}
      if(showDaily && d.dailyGranted){
        setTimeout(()=>toast('تم استلام الهداية اليومية 🎁','تمت إضافة 50 عملة فالكون إلى رصيدك.'),350);
      }
      if(currentRef){ setTimeout(()=>claimCurrentRef(false),showDaily?900:350); }
      else setTimeout(()=>loadPendingGifts(),showDaily?800:300);
    }else{
      $('coinsTop').textContent='—'; $('loginState').textContent='زائر';
      $('account').innerHTML='<button class="accountBtn" onclick="showAuth(\'login\')">تسجيل الدخول</button>';
      $('mobileOwner').style.display='none'; $('owner').style.display='none'; $('staffNotify').style.display='none'; document.querySelectorAll('.ownerOnlyCard').forEach(el=>el.style.display='none'); clearInterval(window.__liveDashTimer);
    }
  }catch(e){toast('تعذر الاتصال بالخادم','تأكد أن الموقع يعمل من خلال السيرفر وليس ملف HTML فقط.','error')}
}
async function logout(){await fetch('/auth/logout',{credentials:'same-origin'});toast('تم تسجيل الخروج','إلى اللقاء 👋');setTimeout(init,200)}

window.addEventListener('load',async()=>{
  const params=new URLSearchParams(location.search); currentRef=params.get('ref')||null;
  setTimeout(()=>{$('loader').classList.add('hide')},1100);
  await init(true);
  await loadCart();
  await loadPurchaseCount();
  await loadFavorites();
  await loadOffers();
  await loadBundles();
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
function filterSamp(q){
 q=String(q||'').trim().toLowerCase();
 document.querySelectorAll('#sampProducts .storeItem').forEach(card=>{card.style.display=!q||card.textContent.toLowerCase().includes(q)?'':'none'});
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
