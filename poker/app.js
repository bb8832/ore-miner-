import {FIREBASE_CONFIG} from './firebase-config.js';
const {TIERS,Game}=PK;
const SDK='https://www.gstatic.com/firebasejs/10.14.1/';
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>{n=Math.round(n||0);const a=Math.abs(n);if(a>=1e6)return(n/1e6).toFixed(a>=1e7?0:1).replace(/\.0$/,'')+'M';if(a>=1e5)return Math.round(n/1e3)+'K';return n.toLocaleString()};
const today=()=>new Date().toISOString().slice(0,10);
const hue=s=>{let h=0;for(const c of String(s))h=(h*31+c.charCodeAt(0))%360;return `hsl(${h} 60% 45%)`};
const lvl=xp=>Math.floor(Math.sqrt((+xp||0)/30))+1;
const lvXp=l=>(l-1)**2*30;
const RANKS='23456789TJQKA',SUITS='♣♦♥♠';

/* ---------- dealers ---------- */
const DEALERS=[
 {n:'Marisol',bg:'#ffb36b',skin:'#c98b5e',hair:'#2b1a12',hs:'long',out:'#1fa3a3',acc:'floral',hat:'sun',line:'Sand in your shoes, chips in your pocket.'},
 {n:'Dex',bg:'#8e7cc3',skin:'#8d5a3b',hair:'#1b1b1b',hs:'short',out:'#3b2f5c',acc:'bow',bow:'#d6283a',line:'Smooth jazz, sharp players.'},
 {n:'Belle',bg:'#d9a066',skin:'#f1c7a5',hair:'#8a3b1c',hs:'bun',out:'#5a2a3a',acc:'collar',line:'All aboard, sugar. The river decides.'},
 {n:'Hank',bg:'#6fa8dc',skin:'#e3a985',hair:'#6b4423',hs:'beard',out:'#a8322b',acc:'flannel',hat:'beanie',line:'Fire\'s warm. Pots are bigger.'},
 {n:'Céline',bg:'#c27ba0',skin:'#f0c9b0',hair:'#e0b45a',hs:'long',out:'#1a1a24',acc:'pearls',line:'Bonsoir. Here, we play for real.'},
 {n:'Kai',bg:'#a4c2f4',skin:'#d9a066',hair:'#151515',hs:'short',out:'#f2f2f2',acc:'bow',bow:'#111',line:'Welcome above the clouds. Only legends sit here.'}];
function dealerSVG(i){const d=DEALERS[i];let s=`<svg viewBox="0 0 120 120" role="img" aria-label="Dealer ${esc(d.n)}"><circle cx="60" cy="60" r="60" fill="${d.bg}"/>`;
 if(d.hs==='long')s+=`<path d="M34 50 Q34 22 60 22 Q86 22 86 50 L90 98 L30 98Z" fill="${d.hair}"/>`;
 s+=`<path d="M12 124 C12 92 32 82 60 82 C88 82 108 92 108 124Z" fill="${d.out}"/><rect x="52" y="66" width="16" height="18" rx="6" fill="${d.skin}"/>`;
 if(d.acc==='floral')s+=[[30,100],[46,92],[78,96],[92,108],[64,110],[40,114]].map(([x,y])=>`<circle cx="${x}" cy="${y}" r="4" fill="#fff" opacity=".85"/><circle cx="${x}" cy="${y}" r="1.6" fill="#ffd166"/>`).join('')+`<path d="M50 82 L60 96 L70 82" fill="none" stroke="#fff" stroke-width="3"/>`;
 if(d.acc==='bow')s+=`<path d="M48 82 L60 104 L72 82Z" fill="${d.out==='#f2f2f2'?'#ddd':'#fff'}"/><path d="M50 86 L60 90 L50 94Z M70 86 L60 90 L70 94Z" fill="${d.bow}"/>`;
 if(d.acc==='collar')s+=`<path d="M46 80 Q60 92 74 80 L72 70 Q60 80 48 70Z" fill="#f6ead6"/>`;
 if(d.acc==='flannel')s+=`<path d="M30 96 H90 M24 108 H96 M44 86 V124 M76 86 V124" stroke="#00000044" stroke-width="3"/><path d="M50 82 L60 94 L70 82" fill="none" stroke="#5a1a14" stroke-width="3"/>`;
 if(d.acc==='pearls')s+=`<path d="M46 80 Q60 90 74 80 L72 72 Q60 80 48 72Z" fill="#1a1a24"/>`+[48,53,58,63,68,72].map((x,k)=>`<circle cx="${x}" cy="${86+Math.sin(k/1.6)*3}" r="2.4" fill="#fff"/>`).join('');
 s+=`<ellipse cx="60" cy="52" rx="21" ry="23" fill="${d.skin}"/>`;
 if(d.hs==='long')s+=`<path d="M38 50 Q40 26 60 26 Q80 26 82 50 Q74 34 60 36 Q46 34 38 50Z" fill="${d.hair}"/>`;
 if(d.hs==='short')s+=`<path d="M39 48 Q38 26 60 26 Q82 26 81 48 Q76 36 60 36 Q44 36 39 48Z" fill="${d.hair}"/>`;
 if(d.hs==='bun')s+=`<circle cx="60" cy="24" r="9" fill="${d.hair}"/><path d="M39 50 Q38 28 60 28 Q82 28 81 50 Q76 36 60 37 Q44 36 39 50Z" fill="${d.hair}"/>`;
 if(d.hs==='beard')s+=`<path d="M40 54 Q42 78 60 78 Q78 78 80 54 Q76 66 60 66 Q44 66 40 54Z" fill="${d.hair}"/>`;
 if(d.hat==='sun')s+=`<ellipse cx="60" cy="34" rx="38" ry="8" fill="#e8c27a"/><path d="M44 34 Q46 16 60 16 Q74 16 76 34Z" fill="#e8c27a"/><rect x="44" y="28" width="32" height="5" fill="#ff6b57"/>`;
 if(d.hat==='beanie')s+=`<path d="M38 44 Q38 20 60 20 Q82 20 82 44Z" fill="#b33a2b"/><rect x="37" y="40" width="46" height="8" rx="4" fill="#8a2a1f"/><circle cx="60" cy="18" r="5" fill="#f6ead6"/>`;
 s+=`<circle cx="52" cy="53" r="2.6" fill="#1b1b1b"/><circle cx="68" cy="53" r="2.6" fill="#1b1b1b"/><circle cx="47" cy="60" r="3.5" fill="#ff6b57" opacity=".3"/><circle cx="73" cy="60" r="3.5" fill="#ff6b57" opacity=".3"/><path d="M53 63 Q60 69 67 63" fill="none" stroke="#1b1b1b" stroke-width="2.4" stroke-linecap="round"/></svg>`;return s}

/* ---------- firebase ---------- */
let fb=null;
const configured=FIREBASE_CONFIG&&FIREBASE_CONFIG.apiKey&&!String(FIREBASE_CONFIG.apiKey).startsWith('PASTE');
async function initFB(){
 const [{initializeApp},A,D]=await Promise.all([import(SDK+'firebase-app.js'),import(SDK+'firebase-auth.js'),import(SDK+'firebase-database.js')]);
 const app=initializeApp(FIREBASE_CONFIG);return{auth:A.getAuth(app),A,db:D.getDatabase(app),D}}
const R=p=>fb.D.ref(fb.db,p);
const dget=async p=>(await fb.D.get(R(p))).val();
const dset=(p,v)=>fb.D.set(R(p),v);
const dupd=(p,v)=>fb.D.update(R(p),v);
const drm=p=>fb.D.remove(R(p));
const listen=(p,fn)=>fb.D.onValue(typeof p==='string'?R(p):p,s=>fn(s.val(),s),()=>{});

/* ---------- profile ---------- */
const DEF={name:'',chips:10000,xp:0,hands:0,wins:0,friends:{},streaks:{},bonusDay:'',seated:0,last:0};
const me={id:null};
let prof=Object.assign({},DEF),saveT=null,saving=false,dirty=false;
function loadLocal(){try{const l=JSON.parse(localStorage.getItem('aii-offline')||'null');prof=Object.assign({},DEF,l||{})}catch(e){prof=Object.assign({},DEF)}if(!prof.friends||Array.isArray(prof.friends))prof.friends={};refund()}
function refund(){if(prof.seated>0){prof.chips+=prof.seated;prof.seated=0}}
function save(){if(!me.id){try{localStorage.setItem('aii-offline',JSON.stringify(prof))}catch(e){}}else{clearTimeout(saveT);saveT=setTimeout(flush,600)}renderTop()}
async function flush(){if(!fb||!me.id)return;if(saving){dirty=true;return}saving=true;
 try{prof.last=Date.now();prof.nameLower=(prof.name||'').toLowerCase();await dset('users/'+me.id,JSON.parse(JSON.stringify(prof)))}catch(e){console.warn(e)}
 saving=false;if(dirty){dirty=false;flush()}}
const pname=()=>prof.name||'Player';

/* ---------- screens ---------- */
function show(id){['auth','home','table'].forEach(x=>{$('#'+x).hidden=x!==id});document.body.classList.toggle('authed',id!=='auth');window.scrollTo(0,0)}

/* ---------- auth screen ---------- */
let authMode='up';
document.querySelectorAll('[data-at]').forEach(b=>b.onclick=()=>{authMode=b.dataset.at;document.querySelectorAll('[data-at]').forEach(x=>x.classList.toggle('on',x===b));
 $('#unWrap').hidden=authMode!=='up';$('#aGo').textContent=authMode==='up'?'Create account':'Log in';$('#aForgot').hidden=authMode==='up';$('#aPass').autocomplete=authMode==='up'?'new-password':'current-password';$('#aErr').textContent=''});
const authErr=e=>({'auth/email-already-in-use':'That email already has an account. Try logging in.','auth/invalid-email':'That email doesn\'t look right.','auth/weak-password':'Use at least 6 characters for your password.','auth/invalid-credential':'Wrong email or password.','auth/wrong-password':'Wrong email or password.','auth/user-not-found':'No account with that email.','auth/too-many-requests':'Too many tries. Wait a minute and try again.','auth/network-request-failed':'No connection. Check your internet.','auth/operation-not-allowed':'Email sign-in is not turned on in Firebase yet (see README).'}[e&&e.code]||(e&&e.message)||'Something went wrong.');
$('#authForm').onsubmit=async e=>{e.preventDefault();const err=$('#aErr');err.textContent='';
 if(!fb){err.textContent='Online accounts are not set up yet. You can still play solo offline.';return}
 const email=$('#aEmail').value.trim(),pass=$('#aPass').value,user=$('#aUser').value.trim();const go=$('#aGo');go.disabled=true;
 try{
  if(authMode==='up'){
   if(!/^[A-Za-z0-9_]{3,16}$/.test(user))throw{message:'Usernames are 3-16 letters, numbers or _.'};
   const low=user.toLowerCase();if(await dget('usernames/'+low))throw{message:'That username is taken.'};
   const cred=await fb.A.createUserWithEmailAndPassword(fb.auth,email,pass);
   const res=await fb.D.runTransaction(R('usernames/'+low),v=>v&&v!==cred.user.uid?undefined:cred.user.uid);
   if(!res.committed){await cred.user.delete().catch(()=>{});throw{message:'That username was just taken. Pick another.'}}
   pendingName=user;await fb.A.updateProfile(cred.user,{displayName:user}).catch(()=>{});
   await dset('users/'+cred.user.uid,Object.assign({},DEF,{name:user,nameLower:low,last:Date.now()}));
  }else await fb.A.signInWithEmailAndPassword(fb.auth,email,pass);
 }catch(x){err.textContent=authErr(x)}go.disabled=false};
$('#aForgot').onclick=async()=>{const email=$('#aEmail').value.trim();if(!email){$('#aErr').textContent='Type your email first.';return}
 try{await fb.A.sendPasswordResetEmail(fb.auth,email);toast('Password reset email sent.')}catch(x){$('#aErr').textContent=authErr(x)}};
$('#aOffline').onclick=()=>{me.id=null;loadLocal();if(!prof.name)prof.name='Player';$('#netNote').textContent='Offline: solo tables only. Log in for friends and live tables.';enterHome()};
let pendingName=null;

/* ---------- top bar ---------- */
function renderTop(){
 $('#chips').textContent=fmt(prof.chips);const L=lvl(prof.xp),a=lvXp(L),b=lvXp(L+1),p=(prof.xp-a)/(b-a);
 $('#lvRing').innerHTML=`<svg viewBox="0 0 36 36" width="32" height="32"><circle cx="18" cy="18" r="15" fill="#0006" stroke="#ffffff22" stroke-width="4"/><circle cx="18" cy="18" r="15" fill="none" stroke="#f4c95d" stroke-width="4" stroke-dasharray="${(p*94).toFixed(1)} 100" transform="rotate(-90 18 18)" stroke-linecap="round"/></svg><b>${L}</b>`;
 $('#meName').textContent=pname();
 const can=prof.bonusDay!==today(),btn=$('#bonusBtn');btn.disabled=!can;btn.textContent='Claim 2,500';
 $('#bonusTxt').textContent=can?'Grab free chips once a day.':'Come back tomorrow for more.';
 if(!can&&prof.chips<500){btn.disabled=false;btn.textContent='Free 1,000 refill';$('#bonusTxt').textContent='Running low? Take a free refill.'}
}
$('#bonusBtn').onclick=()=>{if(prof.bonusDay!==today()){prof.bonusDay=today();prof.chips+=2500;toast('+2,500 chips. Good luck!')}else if(prof.chips<500){prof.chips+=1000;toast('+1,000 chips refill.')}save();renderMap()};

/* ---------- chip codes ---------- */
// Codes are stored as SHA-256 hashes so the real code isn't readable in the source. Each works once per account.
const CODES={'0a711e831fadc6c41f3f55053d732056950b86abedecc92e8c4a1adfb18e7176':50000};
async function sha(s){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')}
$('#redeemForm').onsubmit=async e=>{e.preventDefault();const inp=$('#redeemIn');const code=inp.value.trim().toUpperCase().replace(/\s+/g,'');if(!code)return;
 const h=await sha(code),amt=CODES[h];if(!amt){toast('That code doesn\'t work.');return}
 prof.redeemed=prof.redeemed||{};if(prof.redeemed[h.slice(0,16)]){toast('You already used that code.');return}
 prof.redeemed[h.slice(0,16)]=true;prof.chips+=amt;save();renderMap();inp.value='';toast(`+${amt.toLocaleString()} chips!`)};

/* ---------- map ---------- */
const NODES=[[150,470],[330,320],[540,450],[640,215],[850,390],[830,110]];
const LM=[
 `<ellipse cx="0" cy="34" rx="58" ry="12" fill="#00000030"/><path d="M8 34 V-2 M8 -2 Q-6 -10 -22 -4 M8 -2 Q20 -14 34 -6 M8 -2 Q0 -20 -10 -24 M8 -2 Q18 -22 26 -26" stroke="#2f7d3c" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M8 34 Q4 14 8 -2" stroke="#8a5a2b" stroke-width="6" fill="none"/><rect x="-44" y="6" width="40" height="28" fill="#c98a4b"/><path d="M-50 8 L-24 -14 L2 8Z" fill="#e8c27a"/><rect x="-30" y="16" width="12" height="18" fill="#6b3d1e"/>`,
 `<ellipse cx="0" cy="36" rx="60" ry="11" fill="#00000030"/>${[[-44,-10,22,46,'#4a6fa5'],[-20,-40,26,76,'#3b4f7a'],[8,-22,22,58,'#5b7cb8'],[32,-4,20,40,'#2f3f63']].map(([x,y,w,h,c])=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"/>`+Array.from({length:Math.floor(h/12)},(_,k)=>`<rect x="${x+4}" y="${y+5+k*12}" width="${w-8}" height="4" fill="#ffe08a" opacity=".8"/>`).join('')).join('')}<rect x="-12" y="-50" width="10" height="10" fill="#ff6b57"/>`,
 `<ellipse cx="0" cy="34" rx="64" ry="10" fill="#1c5f80"/><path d="M-52 14 H52 L40 32 H-40Z" fill="#f6ead6"/><rect x="-36" y="-2" width="64" height="16" fill="#fff"/><rect x="-28" y="-14" width="46" height="12" fill="#f6ead6"/><rect x="-18" y="-40" width="8" height="26" fill="#333"/><rect x="2" y="-40" width="8" height="26" fill="#333"/><circle cx="40" cy="12" r="16" fill="none" stroke="#c23b2e" stroke-width="5"/><path d="M40 -4 V28 M24 12 H56" stroke="#c23b2e" stroke-width="3"/>`,
 `<ellipse cx="0" cy="36" rx="64" ry="11" fill="#00000030"/><path d="M-64 34 L-24 -40 L10 34Z" fill="#6c7a89"/><path d="M-34 -22 L-24 -40 L-14 -22 L-20 -16 L-26 -24Z" fill="#fff"/><path d="M-10 34 L28 -28 L64 34Z" fill="#7f8c9a"/><path d="M18 -12 L28 -28 L38 -12 L32 -8 L26 -14Z" fill="#fff"/><rect x="-4" y="12" width="30" height="22" fill="#8a5a2b"/><path d="M-8 14 L11 -2 L30 14Z" fill="#5a2c1a"/><rect x="6" y="20" width="8" height="8" fill="#ffd166"/>`,
 `<ellipse cx="0" cy="36" rx="66" ry="11" fill="#00000030"/><rect x="-50" y="0" width="100" height="34" fill="#f2e6cf"/>${[-40,-24,-8,8,24,40].map(x=>`<rect x="${x-3}" y="4" width="6" height="30" fill="#d9c7a1"/>`).join('')}<path d="M-56 0 H56 L50 -8 H-50Z" fill="#c9a96e"/><path d="M-26 -8 Q0 -52 26 -8Z" fill="#7fb7a8"/><rect x="-2" y="-52" width="4" height="12" fill="#c9a96e"/><circle cx="0" cy="-54" r="4" fill="#f4c95d"/>`,
 `<ellipse cx="-10" cy="30" rx="58" ry="16" fill="#fff"/><ellipse cx="26" cy="26" rx="40" ry="14" fill="#f1f5fb"/><ellipse cx="-40" cy="24" rx="28" ry="12" fill="#f1f5fb"/><rect x="-30" y="-14" width="56" height="36" fill="#e8ecff"/>${[-30,-6,18].map(x=>`<rect x="${x}" y="-38" width="12" height="26" fill="#cfd8ff"/><path d="M${x-2} -38 L${x+6} -54 L${x+14} -38Z" fill="#f4c95d"/>`).join('')}<rect x="-6" y="4" width="12" height="18" rx="6" fill="#8e7cc3"/>`];
let liveCounts=[0,0,0,0,0,0];
function renderMap(){
 const L=lvl(prof.xp);const path=NODES.map((p,i)=>(i?'L':'M')+p[0]+' '+p[1]).join(' ');
 $('#map').innerHTML=`<svg viewBox="0 0 1000 600" role="img" aria-label="Island map of poker tables">
 <defs><radialGradient id="sea" cx="50%" cy="40%" r="75%"><stop offset="0" stop-color="#1f8fa0"/><stop offset="1" stop-color="#0a4752"/></radialGradient></defs>
 <rect width="1000" height="600" fill="url(#sea)"/>
 ${[[120,90],[420,560],[960,520],[60,300]].map(([x,y])=>`<path d="M${x} ${y} q12 -8 24 0 t24 0" stroke="#ffffff40" stroke-width="3" fill="none"/>`).join('')}
 <path d="M60 520 Q40 420 150 380 Q230 330 260 250 Q300 150 450 140 Q560 120 640 120 Q760 40 900 70 Q980 120 950 240 Q930 330 960 420 Q960 540 820 560 Q650 590 520 560 Q380 590 260 570 Q120 590 60 520Z" fill="#f2dcae"/>
 <path d="M110 500 Q110 430 190 400 Q270 360 300 270 Q340 190 460 180 Q570 165 650 160 Q760 100 880 110 Q930 150 905 240 Q890 330 910 420 Q900 510 800 520 Q660 545 530 520 Q390 545 270 530 Q150 545 110 500Z" fill="#5fa86a"/>
 <path d="M470 180 Q500 300 540 380 Q570 440 560 560" stroke="#3aa6c4" stroke-width="22" fill="none" stroke-linecap="round"/>
 <path d="${path}" stroke="#fff8" stroke-width="5" stroke-dasharray="2 14" stroke-linecap="round" fill="none"/>
 ${NODES.map(([x,y],i)=>{const t=TIERS[i],lock=L<t.lvl,n=liveCounts[i];return `<g class="node${lock?' locked':''}" data-t="${i}" tabindex="0" role="button" aria-label="${t.name}${lock?' locked':''}" transform="translate(${x} ${y})">
  <g class="lm">${LM[i]}</g>
  <rect x="-78" y="44" width="156" height="44" rx="14" fill="#041c21e6"/>
  <text x="0" y="64" text-anchor="middle" fill="#f6f1e7" font-family="Limelight,serif" font-size="18">${t.name}</text>
  <text x="0" y="82" text-anchor="middle" fill="${lock?'#ff9b8c':'#f4c95d'}" font-family="Outfit,sans-serif" font-size="14" font-weight="700">${lock?'Unlocks at level '+t.lvl:'Blinds '+fmt(t.sb)+'/'+fmt(t.bb)}</text>
  ${lock?`<g transform="translate(0 -6)"><rect x="-14" y="-6" width="28" height="22" rx="4" fill="#041c21"/><path d="M-8 -6 V-14 Q0 -24 8 -14 V-6" stroke="#041c21" stroke-width="5" fill="none"/></g>`:''}
  ${n?`<g transform="translate(58 -30)"><rect x="-28" y="-13" width="56" height="26" rx="13" fill="#fffc00"/><text y="5" text-anchor="middle" font-family="Outfit" font-size="13" font-weight="800" fill="#111">${n} live</text></g>`:''}
 </g>`}).join('')}
 </svg>`;
 $('#map').querySelectorAll('.node').forEach(g=>{const f=()=>openTable(+g.dataset.t);g.onclick=f;g.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();f()}}});
}
$('#quick').onclick=()=>{const L=lvl(prof.xp);let t=0;TIERS.forEach((x,i)=>{if(L>=x.lvl&&prof.chips>=x.buy)t=i});if(prof.chips<TIERS[0].buy){toast('You need 1,000 chips. Grab your daily chips first.');return}startSolo(t)};
$('#codeForm').onsubmit=e=>{e.preventDefault();const c=$('#codeIn').value.trim().toLowerCase().replace(/[^a-z0-9]/g,'');if(c.length<4){toast('Codes are 5 characters.');return}goOnline(c,null,'join')};

/* ---------- modal + toast ---------- */
function modal(html){$('#modalRoot').innerHTML=`<div class="modal" id="mbg"><div class="mbox" role="dialog" aria-modal="true">${html}</div></div>`;$('#mbg').onclick=e=>{if(e.target.id==='mbg')closeModal()};$('#modalRoot').querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',closeModal))}
function closeModal(){$('#modalRoot').innerHTML=''}
function toast(msg,o={}){const el=document.createElement('div');el.className='toast'+(o.inv?' inv':'');el.innerHTML=`<span></span>`+(o.btn?`<button class="pri">${esc(o.btn)}</button>`:'')+`<button class="ghost" aria-label="Dismiss" style="color:inherit">✕</button>`;el.querySelector('span').textContent=msg;
 const kill=()=>el.remove();if(o.btn)el.querySelector('.pri').onclick=()=>{kill();o.fn()};el.querySelector('.ghost').onclick=()=>{kill();o.no&&o.no()};$('#toasts').appendChild(el);setTimeout(kill,o.ms||(o.btn?20000:3500))}
function openTable(i){const t=TIERS[i],L=lvl(prof.xp),lock=L<t.lvl,poor=prof.chips<t.buy,d=DEALERS[i];
 const why=lock?`Reach level ${t.lvl} to sit here. You're level ${L}.`:poor?`You need ${fmt(t.buy)} chips for the buy-in.`:'';
 const off=!me.id?'disabled':'';
 modal(`<div class="dl">${dealerSVG(i)}<div><h2>${t.name}</h2><p class="note" style="margin:6px 0 0">Dealer ${esc(d.n)}: “${esc(d.line)}”</p></div></div>
 <div class="facts"><div><span>Blinds</span><b>${fmt(t.sb)} / ${fmt(t.bb)}</b></div><div><span>Buy-in</span><b>${fmt(t.buy)}</b></div><div><span>Level needed</span><b>${t.lvl}</b></div><div><span>AI skill</span><b>${['Rookie','Casual','Solid','Sharp','Pro','Legend'][i]}</b></div></div>
 ${why?`<p style="color:#ff9b8c;margin:0 0 12px">${why}</p>`:''}
 <div class="opts">
  <button class="pri" id="oSolo" ${why?'disabled':''}>Play solo<small>Just you and five AI players</small></button>
  <button class="gold" id="oLive" ${why||off}>Join the live table<small>${me.id?'Sit with anyone online here. AI fills the empty seats':'Log in to play online'}</small></button>
  <button id="oPriv" ${why||off}>Private table with friends<small>${me.id?'Get a code, invite friends, AI fills the rest':'Log in to play online'}</small></button>
  <button class="ghost" data-close>Back to the map</button>
 </div>`);
 $('#oSolo').onclick=()=>{closeModal();startSolo(i)};$('#oLive').onclick=()=>goOnline('pub'+i,i,'pub');
 $('#oPriv').onclick=()=>{const a='abcdefghjkmnpqrstuvwxyz23456789';let c='';for(let k=0;k<5;k++)c+=a[Math.floor(Math.random()*a.length)];goOnline(c,i,'host')};
}
$('#meBtn').onclick=()=>{const L=lvl(prof.xp);
 modal(`<h2>${esc(pname())}</h2><div class="xpbar" style="margin:14px 0 4px"><i style="width:${Math.min(100,(prof.xp-lvXp(L))/(lvXp(L+1)-lvXp(L))*100)}%"></i></div><p class="note" style="margin:0 0 14px">Level ${L}. ${lvXp(L+1)-prof.xp} XP to level ${L+1}. You get XP for every hand, more for wins at bigger tables.</p>
 <div class="stats"><div><b>${prof.hands}</b><span>Hands</span></div><div><b>${prof.wins}</b><span>Pots won</span></div><div><b>${prof.hands?Math.round(prof.wins/prof.hands*100):0}%</b><span>Win rate</span></div></div>
 ${me.id?`<p class="note" style="margin-top:16px">Signed in as ${esc(fb.auth.currentUser?.email||'')}</p>`:`<form id="nmF" class="row" style="margin-top:16px"><input id="nmI" maxlength="16" value="${esc(pname())}" aria-label="Name"><button class="pri">Save name</button></form>`}
 <div class="row" style="margin-top:12px">${me.id?'<button class="ghost" id="logout">Log out</button>':(configured?'<button class="gold" id="toLogin">Log in or sign up</button>':'')}<button class="ghost" data-close>Close</button></div>`);
 const f=$('#nmF');if(f)f.onsubmit=e=>{e.preventDefault();const v=$('#nmI').value.trim().slice(0,16);if(v){prof.name=v;save();closeModal()}};
 const lo=$('#logout');if(lo)lo.onclick=async()=>{closeModal();if(cur)leaveTable();await flush();fb.A.signOut(fb.auth)};
 const tl=$('#toLogin');if(tl)tl.onclick=()=>{closeModal();show('auth')}};

/* ---------- table screen ---------- */
let cur=null;
function showTable(){show('table');renderTable()}
function enterHome(){show('home');renderMap();renderTop()}
function pay(t){const b=TIERS[t].buy;if(prof.chips<b){toast(`You need ${fmt(b)} chips for this table.`);return false}prof.chips-=b;prof.seated=b;save();return true}
function startSolo(t){if(cur)leaveTable();if(!pay(t))return;const g=new Game(t,{onChange:onLocalChange});g.seatHuman(0,{name:pname(),uid:me.id,stack:TIERS[t].buy});
 cur={mode:'solo',game:g,tier:t,pub:null,myCards:null,lastDone:0,raise:null,bubbles:{}};showTable();g.startHand()}
function onLocalChange(g){if(!cur||cur.game!==g)return;cur.pub=g.pub();const mi=mySeat();cur.myCards={h:g.hand,ep:g.ep,c:mi>=0?g.seats[mi].cards:[]};if(cur.net)cur.deadline=g.dl;afterPub();renderTable();if(cur.net&&cur.net.host)broadcast()}
function mySeat(){if(!cur||!cur.pub)return -1;if(cur.mode==='solo')return 0;return cur.pub.seats.findIndex(s=>s.k==='human'&&s.p===me.id)}
function afterPub(){const P=cur.pub,mi=mySeat();if(mi<0)return;const s=P.seats[mi];
 if(P.phase==='done'&&P.hand!==cur.lastDone){cur.lastDone=P.hand;
  if(s.c){const L0=lvl(prof.xp);prof.hands++;prof.xp+=10;if((P.win||[]).some(x=>x.seat===mi)){prof.wins++;prof.xp+=30+P.tier*10}
   const L1=lvl(prof.xp);if(L1>L0){const un=TIERS.find(t=>t.lvl===L1);toast(`Level ${L1}!`+(un?` ${un.name} is now open.`:''))}
   const d=today(),y=new Date(Date.now()-864e5).toISOString().slice(0,10);
   P.seats.forEach(o=>{if(o.k==='human'&&o.u&&o.u!==me.id&&prof.friends[o.u]){const st=prof.streaks[o.u]||{n:0,d:''};if(st.d!==d)prof.streaks[o.u]={n:st.d===y?st.n+1:1,d}}})}
  prof.seated=s.st;save()}
 else if(P.phase==='waiting'&&prof.seated!==s.st){prof.seated=s.st;save()}}
function leaveTable(){if(!cur)return;const P=cur.pub,mi=mySeat();let back=0;
 if(P&&mi>=0)back=P.seats[mi].st;else if(cur.net&&cur.net.paid)back=cur.net.paid;
 prof.chips+=back;prof.seated=0;save();
 if(cur.game)cur.game.stop();
 if(cur.net){const n=cur.net;clearInterval(n.hb);clearInterval(n.sitIv);clearTimeout(n.migT);n.un.forEach(u=>{try{u()}catch(e){}});
  drm(n.base+'/here/'+me.id).catch(()=>{});drm(n.base+'/sits/'+me.id).catch(()=>{});
  if(n.host){fb.D.onDisconnect(R(n.base+'/host')).cancel().catch(()=>{});drm(n.base+'/host').catch(()=>{})}
  lobbyPresence(null,null)}
 cur=null;enterHome();if(back)toast(`Cashed out ${fmt(back)} chips.`)}
$('#leaveBtn').onclick=leaveTable;
const POS=[[50,100],[4,70],[13,6],[50,-2],[87,6],[96,70]];
function card(c,cls=''){if(c==null)return`<div class="card slot ${cls}"></div>`;const r=RANKS[c>>2],s=c&3;return`<div class="card ${s===1||s===2?'r':''} ${cls}">${r==='T'?'10':r}<span>${SUITS[s]}</span></div>`}
function renderTable(){
 if(!cur||$('#table').hidden)return;const P=cur.pub,t=cur.tier??(P&&P.tier);
 if(t!=null){const d=DEALERS[t];$('#dealerBox').innerHTML=dealerSVG(t)+`<div class="say"><small>${esc(d.n)} · ${TIERS[t].name}</small><span id="sayTxt"></span></div>`;$('#sayTxt').textContent=(P&&P.sp)||d.line}
 else $('#dealerBox').innerHTML=`<div class="say"><span>Finding your table…</span></div>`;
 const on=cur.mode==='online';$('#inviteBtn').hidden=!on||cur.net.code.startsWith('pub');
 $('#tCode').textContent=on?(cur.net.code.startsWith('pub')?'Live table':'Code: '+cur.net.code.toUpperCase()):'Solo vs AI';
 if(!P){$('#felt').innerHTML=`<div class="center"><div class="pot">Shuffling up…</div></div>`;$('#actions').innerHTML=`<span class="wait">Connecting to the table…</span>`;return}
 const mi=mySeat(),base=mi>=0?mi:0;let h='';
 h+=`<div class="center"><div class="board">${[0,1,2,3,4].map(k=>card(P.board[k])).join('')}</div><div class="pot">Pot ${fmt(P.pot)}</div></div>`;
 const wins={};(P.win||[]).forEach(w=>wins[w.seat]=w);
 for(let k=0;k<6;k++){const idx=(base+k)%6,s=P.seats[idx],[x,y]=POS[k];const isMe=idx===mi;
  let cards='';const myC=isMe&&cur.myCards&&cur.myCards.h===P.hand&&cur.myCards.ep===P.ep?cur.myCards.c:null;
  if(Array.isArray(s.c))cards=s.c.map(c=>card(c,isMe?'':'sm')).join('');else if(s.c){cards=myC&&myC.length?myC.map(c=>card(c,s.f?'dim':'')).join(''):'<div class="card back sm"></div><div class="card back sm"></div>'}
  const w=wins[idx],cls=['seat',P.toAct===idx?'turn':'',s.f&&s.c?'fold':'',w?'win':'',isMe?'me':''].join(' ');
  const label=s.o?'Sitting out':s.lv?'Leaving':s.pd?'Seat saved':'';
  h+=`<div class="${cls}" style="left:${x}%;top:${y}%"><div class="cards">${cards}</div><div class="plate"><div class="av" style="background:${s.k==='bot'?'#56707a':hue(s.n)}">${esc((s.n||'?')[0])}</div>${s.la?`<span class="la">${esc(s.la)}</span>`:''}
   <div class="nm">${esc(s.n)}${isMe?' (you)':''}${s.k==='bot'?' · AI':''}</div><div class="stk">${label||fmt(s.st)}</div>${w?`<div class="hn">+${fmt(w.amt)}${w.hn?' · '+esc(w.hn):''}</div>`:''}
   ${P.button===idx?'<div class="btn-d">D</div>':''}${P.toAct===idx&&cur.deadline?'<div class="tm" id="tmr"></div>':''}</div>
   ${cur.bubbles&&cur.bubbles[idx]?`<div class="bubble">${esc(cur.bubbles[idx])}</div>`:''}</div>`;
  if(s.b>0){const bx=x+(50-x)*.38,by=y+(48-y)*.42;h+=`<div class="bet" style="left:${bx}%;top:${by}%"><div class="chip"></div>${fmt(s.b)}</div>`}}
 $('#felt').innerHTML=h;renderActions();}
function legalPub(P,i){const s=P.seats[i];const toCall=Math.min(P.cb-s.b,s.st),maxTo=s.b+s.st,minTo=Math.min(P.cb+P.mr,maxTo);const others=P.seats.some((o,j)=>j!==i&&o.c&&!o.f&&!o.a);return{toCall,maxTo,minTo,canRaise:maxTo>P.cb&&others}}
const QC=['Nice hand','GG','Wow','Bluff!','Hurry up','Lucky'];
function renderActions(){const P=cur.pub,mi=mySeat(),A=$('#actions');
 const qc=`<div class="row qc" style="flex:0 1 auto">${QC.map((q,k)=>`<button data-qc="${k}">${q}</button>`).join('')}</div>`;
 const betting=['preflop','flop','turn','river'].includes(P.phase);
 if(mi<0){A.innerHTML=`<span class="wait">${cur.net&&cur.net.paid?'Saving you a seat. You join at the next hand…':'Watching…'}</span>`;return}
 if(!(betting&&P.toAct===mi)){const s=P.seats[mi];let msg=P.phase==='waiting'?'Waiting for players…':P.phase==='done'?'Next hand coming up…':P.toAct>=0?`${P.seats[P.toAct].n} is thinking…`:'Dealing…';if(s.o)msg='You are out of chips at this table. Leave to cash out and come back.';
  A.innerHTML=`<span class="wait"></span>${qc}`;A.querySelector('.wait').textContent=msg;bindQC();return}
 const L=legalPub(P,mi),bb=TIERS[P.tier].bb;if(cur.raiseKey!==P.hand+':'+P.phase+':'+P.cb){cur.raiseKey=P.hand+':'+P.phase+':'+P.cb;cur.raise=L.minTo}
 cur.raise=Math.max(L.minTo,Math.min(cur.raise,L.maxTo));
 A.innerHTML=`${L.toCall>0?'<button data-a="fold">Fold</button>':''}<button class="gold" data-a="${L.toCall>0?'call':'check'}">${L.toCall>0?(L.toCall>=P.seats[mi].st?'Call all-in ':'Call ')+fmt(L.toCall):'Check'}</button>
 ${L.canRaise&&L.maxTo>L.minTo?`<div class="grow"><button class="ghost" data-p=".5">½ pot</button><button class="ghost" data-p="1">Pot</button><input type="range" id="rr" min="${L.minTo}" max="${L.maxTo}" step="${bb}" value="${cur.raise}" aria-label="Raise amount"><span class="raiseval" id="rv">${fmt(cur.raise)}</span><button class="pri" data-a="raise">${P.cb>0?'Raise':'Bet'}</button></div>`:''}
 ${L.canRaise?'<button class="pri" data-a="allin">All-in</button>':''}`;
 const rr=$('#rr');if(rr)rr.oninput=()=>{cur.raise=+rr.value;$('#rv').textContent=fmt(cur.raise)};
 A.querySelectorAll('[data-p]').forEach(b=>b.onclick=()=>{const v=Math.round((P.cb+(P.pot+L.toCall)*+b.dataset.p)/bb)*bb;cur.raise=Math.max(L.minTo,Math.min(v,L.maxTo));if(rr){rr.value=cur.raise;$('#rv').textContent=fmt(cur.raise)}});
 A.querySelectorAll('[data-a]').forEach(b=>b.onclick=()=>doAct(b.dataset.a,cur.raise));}
function bindQC(){$('#actions').querySelectorAll('[data-qc]').forEach(b=>b.onclick=()=>{const k=+b.dataset.qc,mi=mySeat();if(cur.net)dset(cur.net.base+'/chat',{uid:me.id,t:k,at:Date.now()}).catch(()=>{});else bubble(mi,QC[k])})}
function bubble(i,txt){if(!cur)return;cur.bubbles=cur.bubbles||{};cur.bubbles[i]=txt;renderTable();setTimeout(()=>{if(cur&&cur.bubbles[i]===txt){delete cur.bubbles[i];renderTable()}},2500)}
function doAct(ty,amt){const mi=mySeat();if(cur.mode==='solo'||cur.net.host)cur.game.act(mi,ty,amt);else{fb.D.push(R(cur.net.base+'/actions'),{uid:me.id,h:cur.pub.hand,ty,amt:amt||0}).catch(()=>{});$('#actions').innerHTML='<span class="wait">Sent…</span>'}}
setInterval(()=>{const el=document.getElementById('tmr');if(el&&cur&&cur.deadline){const left=Math.max(0,cur.deadline-Date.now());el.style.transform=`scaleX(${left/25000})`}},250);
$('#inviteBtn').onclick=()=>openDrawer('friends');

/* ---------- online tables (Firebase) ---------- */
function norm(v){v=Object.assign({},v);v.board=v.board||[];v.win=v.win?Object.values(v.win):null;
 v.seats=(Array.isArray(v.seats)?v.seats:Object.values(v.seats||{})).map(s=>Object.assign({n:'',k:'bot',st:0,b:0,t:0,c:0,la:'',f:false,a:false,o:false},s,{c:s&&s.c?(typeof s.c==='number'?s.c:Object.values(s.c)):0}));return v}
async function goOnline(code,tier,mode){
 if(!fb||!me.id){toast('Log in to play online.');return}
 if(tier!=null&&prof.chips<TIERS[tier].buy){toast(`You need ${fmt(TIERS[tier].buy)} chips for this table.`);return}
 if(cur)leaveTable();closeModal();
 const base='tables/'+code,net={code,mode,base,host:false,ep:-1,paid:0,un:[],here:{},hostInfo:null,tier};
 cur={mode:'online',net,game:null,pub:null,myCards:null,tier,lastDone:0,bubbles:{}};showTable();
 try{const hr=R(base+'/here/'+me.id);await fb.D.onDisconnect(hr).remove();await dset(base+'/here/'+me.id,{n:pname(),t:Date.now()});
  const [hs,here]=await Promise.all([dget(base+'/host'),dget(base+'/here')]);net.here=here||{};net.hostInfo=hs;
  if(!cur||cur.net!==net)return;
  net.un.push(listen(base+'/here',v=>{net.here=v||{};onHere(net)}));
  net.un.push(listen(base+'/host',v=>{net.hostInfo=v;onHostInfo(net)}));
  net.un.push(listen(base+'/state',v=>{if(v)onState(net,norm(v))}));
  net.un.push(listen(base+'/hole/'+me.id,v=>{if(v&&cur&&cur.net===net&&!net.host){cur.myCards={h:v.h,ep:v.ep,c:v.c?Object.values(v.c):[]};renderTable()}}));
  net.un.push(listen(base+'/chat',v=>{if(!v||!cur||cur.net!==net||Date.now()-v.at>8000||!cur.pub)return;const i=cur.pub.seats.findIndex(s=>s.p===v.uid);if(i>=0&&QC[v.t])bubble(i,QC[v.t])}));
  lobbyPresence(code,tier);
  const alive=hs&&hs.uid&&net.here[hs.uid]&&hs.uid!==me.id;
  if(!alive){if(mode==='join'&&!(hs&&hs.uid===me.id)){toast(`No table is open with code ${code.toUpperCase()}.`);leaveTable();return}await claimHost(net,tier,null)}
  net.sitIv=setInterval(()=>{if(cur&&cur.net===net&&!net.host&&!net.paid&&cur.pub)requestSit(net)},3000);
 }catch(e){console.warn(e);toast('Could not reach the table. Check the Firebase rules (see README).');if(cur&&cur.net===net)leaveTable()}}
async function claimHost(net,tier,P){
 const res=await fb.D.runTransaction(R(net.base+'/host'),v=>{if(v&&v.uid&&v.uid!==me.id&&net.here[v.uid])return;return{uid:me.id,at:Date.now()}});
 if(!res.committed||!cur||cur.net!==net)return false;
 fb.D.onDisconnect(R(net.base+'/host')).remove();
 let oldEp=-1;try{const st=await dget(net.base+'/state/ep');if(typeof st==='number')oldEp=st}catch(e){}
 becomeHost(net,tier??(P&&P.tier),P,Math.max(oldEp,net.ep)+1);return true}
function becomeHost(net,tier,P,ep){
 const opts={online:true,onChange:onLocalChange,onHandStart:()=>sendHoles()};let g;
 const humansHere=P&&P.seats.some(s=>s.k==='human'&&s.p&&s.p!==me.id&&net.here[s.p]);
 if(P&&(humansHere||P.seats.some(s=>s.p===me.id)))g=Game.fromPub(P,u=>!!net.here[u],opts);
 else{if(tier==null){toast('That table closed.');leaveTable();return}if(!net.paid){if(!pay(tier)){leaveTable();return}net.paid=TIERS[tier].buy}
  g=new Game(tier,opts);g.seatHuman(0,{name:pname(),uid:me.id,peer:me.id,stack:TIERS[tier].buy});P=null}
 g.ep=ep;net.ep=ep;net.host=true;cur.game=g;cur.tier=g.tier;
 if(P&&!g.seats.some(s=>s.peer===me.id)){const b=TIERS[g.tier].buy;if(!(net.paid>0)&&prof.chips>=b){prof.chips-=b;prof.seated=b;net.paid=b;save()}
  if(net.paid>0){const i=g.seats.findIndex(s=>s.kind==='bot');if(i>=0)g.seats[i].pend={name:pname(),uid:me.id,peer:me.id}}}
 lobbyPresence(net.code,g.tier);
 net.un.push(fb.D.onChildAdded(R(net.base+'/sits'),s=>{if(!net.host)return;hostSit(s.key,s.val());drm(net.base+'/sits/'+s.key).catch(()=>{})}));
 net.un.push(fb.D.onChildAdded(R(net.base+'/actions'),s=>{if(!net.host)return;const v=s.val();drm(net.base+'/actions/'+s.key).catch(()=>{});if(v&&v.uid)hostAct(v.uid,v)}));
 net.hb=setInterval(()=>{if(cur&&cur.net===net&&net.host)broadcast()},5000);
 if(P){g.speech='New host here. Fresh hand coming up.';onLocalChange(g);g.later(()=>g.startHand(),1200)}else g.startHand()}
function abdicate(net){const g=cur.game;let mine=0;if(g){const s=g.seats.find(x=>x.kind==='human'&&x.peer===me.id);if(s)mine=s.stack+s.total;g.stop()}
 clearInterval(net.hb);net.host=false;cur.game=null;net.paid=0;prof.chips+=mine;prof.seated=0;save();toast('Another player took over hosting.')}
function broadcast(){const n=cur.net;dset(n.base+'/state',JSON.parse(JSON.stringify(cur.game.pub()))).catch(e=>console.warn(e))}
function sendHoles(){const g=cur&&cur.game,n=cur&&cur.net;if(!g||!n)return;const up={};g.seats.forEach(s=>{if(s.kind==='human'&&s.peer&&s.peer!==me.id&&s.cards.length)up[s.peer]={h:g.hand,ep:g.ep,c:s.cards}});if(Object.keys(up).length)dupd(n.base+'/hole',up).catch(e=>console.warn(e))}
function hostSit(uid,v){const g=cur.game;if(!g||!v||!cur.net.here[uid])return;if(g.seats.some(s=>s.peer===uid||(s.pend&&s.pend.peer===uid)))return;
 let i=g.seats.findIndex(s=>s.kind==='bot'&&!s.pend&&!g.inHand(s));if(i<0)i=g.seats.findIndex(s=>s.kind==='bot'&&!s.pend);if(i<0)return;
 g.seats[i].pend={name:String(v.n||'Player').slice(0,16),uid,peer:uid};if(g.phase==='waiting')g.startHand();else g.change()}
function hostAct(uid,v){const g=cur.game;if(!g)return;const i=g.seats.findIndex(s=>s.kind==='human'&&s.peer===uid);if(i<0||v.h!==g.hand)return;g.act(i,String(v.ty),+v.amt||0)}
function hostLeave(uid){const g=cur.game;if(!g)return;let ch=false;g.seats.forEach((s,i)=>{if(s.pend&&s.pend.peer===uid){delete s.pend;ch=true}if(s.kind==='human'&&s.peer===uid&&!s.leaving){s.leaving=true;g.forceFold(i);ch=true}});if(ch)g.change()}
function onHere(net){if(!cur||cur.net!==net)return;
 if(net.host&&cur.game){cur.game.seats.forEach(s=>{const u=s.kind==='human'?s.peer:(s.pend&&s.pend.peer);if(u&&u!==me.id&&!net.here[u])hostLeave(u)});return}
 checkHost(net)}
function onHostInfo(net){if(!cur||cur.net!==net)return;
 if(net.host){if(!net.hostInfo||net.hostInfo.uid!==me.id){if(!net.hostInfo){dset(net.base+'/host',{uid:me.id,at:Date.now()}).catch(()=>{});return}abdicate(net)}return}
 checkHost(net)}
function checkHost(net){const h=net.hostInfo;if(h&&h.uid&&net.here[h.uid])return;clearTimeout(net.migT);
 const P=cur.pub;const seated=new Set(P?P.seats.filter(s=>s.k==='human').map(s=>s.p):[]);
 const order=Object.keys(net.here).sort((a,b)=>(seated.has(b)-seated.has(a))||(a<b?-1:1));const rank=Math.max(0,order.indexOf(me.id));
 net.migT=setTimeout(()=>{if(!cur||cur.net!==net||net.host)return;const h2=net.hostInfo;if(h2&&h2.uid&&net.here[h2.uid])return;claimHost(net,P?P.tier:net.tier,P)},700+rank*1200)}
function onState(net,v){if(!cur||cur.net!==net||net.host)return;if(v.ep<net.ep)return;
 net.ep=v.ep;cur.pub=v;cur.tier=v.tier;net.tier=v.tier;cur.deadline=v.dl?Date.now()+v.dl:0;
 afterPub();renderTable();if(!net.paid&&mySeat()<0)requestSit(net)}
function requestSit(net){const t=cur.pub.tier;if(!net.paid){if(prof.chips<TIERS[t].buy){toast(`You need ${fmt(TIERS[t].buy)} chips to sit at ${TIERS[t].name}. You can watch.`);clearInterval(net.sitIv);net.paid=-1;return}prof.chips-=TIERS[t].buy;prof.seated=TIERS[t].buy;net.paid=TIERS[t].buy;save()}
 if(net.paid>0&&mySeat()<0)dset(net.base+'/sits/'+me.id,{n:pname(),t:Date.now()}).catch(()=>{})}
setInterval(()=>{if(cur&&cur.net&&!cur.net.host&&cur.net.paid>0&&mySeat()<0&&cur.pub)requestSit(cur.net)},4000);

/* ---------- presence + friends ---------- */
let tab='friends',search='',searchHits=[],people={},status={},requests={},invites={},quick=[];const subs={};
function lobbyPresence(at,tier){if(fb&&me.id)dupd('status/'+me.id,{on:true,at:at||null,tier:tier??null,t:Date.now()}).catch(()=>{})}
function watchUser(u){if(subs[u]||!fb)return;subs[u]=[listen('users/'+u,v=>{people[u]=v||null;refreshFriends()}),listen('status/'+u,v=>{status[u]=v||null;refreshFriends()})]}
const theirs=u=>(people[u]&&people[u].friends)||{};
const mutual=u=>!!prof.friends[u]&&!!theirs(u)[me.id];
const nameOf=u=>(people[u]&&people[u].name)||'Player';
let rfT=null;function refreshFriends(){clearTimeout(rfT);rfT=setTimeout(()=>{updateBadges();if($('#drawer').classList.contains('open'))renderFriends()},120)}
function openDrawer(t){if(t)tab=t;$('#drawer').classList.add('open');if(tab==='quick')loadQuick();renderFriends()}
$('#fBtn').onclick=()=>openDrawer();$('#fClose').onclick=()=>$('#drawer').classList.remove('open');
document.querySelectorAll('.tabs button[data-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;if(tab==='quick')loadQuick();renderFriends()});
async function loadQuick(){if(!fb||!me.id)return;try{const q=fb.D.query(R('users'),fb.D.orderByChild('last'),fb.D.limitToLast(40));const s=await fb.D.get(q);const out=[];s.forEach(c=>{people[c.key]=c.val();out.push(c.key)});quick=out.reverse();renderFriends()}catch(e){console.warn(e)}}
let sT=null;$('#fSearch').oninput=e=>{search=e.target.value.trim().toLowerCase().replace(/[^a-z0-9_]/g,'');clearTimeout(sT);sT=setTimeout(async()=>{searchHits=[];
 if(search&&fb&&me.id){try{const q=fb.D.query(R('usernames'),fb.D.orderByKey(),fb.D.startAt(search),fb.D.endAt(search+''),fb.D.limitToFirst(12));const s=await fb.D.get(q);const ids=[];s.forEach(c=>{if(c.val()!==me.id)ids.push(c.val())});
  await Promise.all(ids.map(async u=>{if(!people[u])people[u]=await dget('users/'+u)}));searchHits=ids}catch(e){console.warn(e)}}renderFriends()},250)};
function updateBadges(){const added=Object.keys(requests).filter(u=>!prof.friends[u]).length,n=added+Object.keys(invites).length;
 $('#fBadge').hidden=!n;$('#fBadge').textContent=n;$('#addedBadge').hidden=!added;$('#addedBadge').textContent=added}
const flame=n=>n>0?`<span class="streak"><svg width="14" height="16" viewBox="0 0 14 16"><path d="M7 0 C9 4 13 6 13 10 A6 6 0 0 1 1 10 C1 7 3 6 4 3 C5 6 6 6 7 0Z" fill="#ff7a1a"/></svg>${n}</span>`:'';
function ago(t){const m=Math.round((Date.now()-t)/6e4);return m<2?'just now':m<60?m+' min ago':m<1440?Math.round(m/60)+' h ago':Math.round(m/1440)+' d ago'}
function renderFriends(){
 document.querySelectorAll('.tabs button[data-tab]').forEach(b=>b.classList.toggle('on',b.dataset.tab===tab));updateBadges();
 const L=$('#flist');if(!fb||!me.id){L.innerHTML=`<div class="empty">Log in to add friends and play together.</div>`;return}
 let sections;
 if(search)sections=[['Results',searchHits]];
 else if(tab==='friends'){const fr=Object.keys(prof.friends);sections=[['Invites',Object.keys(invites)],['My friends',fr.filter(mutual)],['Waiting for them to add you back',fr.filter(u=>!mutual(u))]]}
 else if(tab==='added')sections=[['Added me',Object.keys(requests).filter(u=>!prof.friends[u])]];
 else sections=[['People playing here',quick.filter(u=>u!==me.id&&!prof.friends[u])]];
 sections.forEach(s=>s[1].forEach(u=>{if(s[0]!=='Results'&&s[0]!=='People playing here')watchUser(u)}));
 const row=(u,sec)=>{const o=status[u]&&status[u].on?status[u]:null,p=people[u],nm=nameOf(u);const st=prof.streaks[u];const sN=st&&(Date.now()-new Date(st.d).getTime())<2*864e5?st.n:0;
  const inv=sec==='Invites'?invites[u]:null;
  const sub=inv?`Invited you to ${TIERS[inv.tier]?.name||'a table'}`:o?(o.at?`Playing at ${TIERS[o.tier]?.name||'a table'}`:'Online now'):p?`Level ${lvl(p.xp)} · ${p.last?ago(p.last):'new'}`:'';
  let btns='';
  if(inv)btns=`<button class="y" data-join="${esc(inv.code)}" data-tier="${inv.tier}" data-inv="${esc(u)}">Join</button>`;
  else if(mutual(u)){if(o&&o.at)btns+=`<button class="y" data-join="${esc(o.at)}" data-tier="${o.tier}">Join</button>`;if(cur&&cur.net&&!cur.net.code.startsWith('pub'))btns+=`<button data-invite="${esc(u)}">Invite</button>`}
  else if(!prof.friends[u])btns=`<button class="y" data-add="${esc(u)}">${requests[u]?'Accept':'+ Add'}</button>`;
  else btns=`<button data-rm="${esc(u)}" style="background:#eee;color:#111">Cancel</button>`;
  return`<div class="fr"><div class="ini ${o?'on':''}" style="background:${hue(u)}">${esc(nm[0])}</div><div class="info"><b>${esc(nm)}</b><small>${esc(sub)}</small></div>${flame(sN)}${btns}</div>`};
 const html=sections.filter(s=>s[1].length).map(([t,us])=>`<div class="sec">${t}</div>`+us.map(u=>row(u,t)).join('')).join('');
 L.innerHTML=html||`<div class="empty">${search?'No players with that username.':tab==='friends'?'No friends yet. Search a username above or check Quick add.':tab==='added'?'Nobody has added you yet.':'Nobody else has signed up yet. Send your friends the link.'}</div>`;
 L.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>addFriend(b.dataset.add));
 L.querySelectorAll('[data-rm]').forEach(b=>b.onclick=()=>{const u=b.dataset.rm;delete prof.friends[u];save();drm('requests/'+u+'/'+me.id).catch(()=>{});renderFriends()});
 L.querySelectorAll('[data-invite]').forEach(b=>b.onclick=()=>sendInvite(b.dataset.invite));
 L.querySelectorAll('[data-join]').forEach(b=>b.onclick=()=>{if(b.dataset.inv)dropInvite(b.dataset.inv);$('#drawer').classList.remove('open');const t=parseInt(b.dataset.tier);goOnline(b.dataset.join,isNaN(t)?null:t,'join')});
}
function addFriend(u){if(prof.friends[u])return;prof.friends[u]=true;save();watchUser(u);
 if(requests[u])drm('requests/'+me.id+'/'+u).catch(()=>{});else dset('requests/'+u+'/'+me.id,Date.now()).catch(()=>{});
 toast(requests[u]?`You and ${nameOf(u)} are now friends.`:`Friend request sent to ${nameOf(u)}.`);delete requests[u];renderFriends()}
async function sendInvite(u){if(!cur||!cur.net)return;try{await dset('invites/'+u+'/'+me.id,{code:cur.net.code,tier:cur.tier,at:Date.now()});toast('Invite sent.')}catch(e){toast('Could not send the invite.')}}
function dropInvite(from){delete invites[from];drm('invites/'+me.id+'/'+from).catch(()=>{});updateBadges()}

/* ---------- sign-in lifecycle ---------- */
let unsubs=[];
async function onSignedIn(user){
 me.id=user.uid;const d=await dget('users/'+user.uid).catch(()=>null);
 prof=Object.assign({},DEF,d||{name:pendingName||user.displayName||'Player'});if(!prof.friends||typeof prof.friends!=='object')prof.friends={};if(!prof.streaks)prof.streaks={};refund();
 if(!d||d.seated>0)flush();
 $('#netNote').textContent='Online. Friends and live tables are on.';
 const sref=R('status/'+me.id);
 unsubs.push(listen('.info/connected',v=>{if(v){fb.D.onDisconnect(sref).set({on:false,t:fb.D.serverTimestamp()});dset('status/'+me.id,{on:true,at:cur&&cur.net?cur.net.code:null,tier:cur?cur.tier??null:null,t:Date.now()})}}));
 unsubs.push(listen('requests/'+me.id,v=>{requests=v||{};Object.keys(requests).forEach(watchUser);refreshFriends()}));
 unsubs.push(listen('invites/'+me.id,v=>{const fresh={};Object.entries(v||{}).forEach(([from,x])=>{if(x&&typeof x.code==='string'&&Date.now()-x.at<3*36e5)fresh[from]=x});
  Object.keys(fresh).filter(f=>!invites[f]||invites[f].at!==fresh[f].at).forEach(async f=>{watchUser(f);const x=fresh[f];if(!people[f])people[f]=await dget('users/'+f).catch(()=>null);
   toast(`${nameOf(f)} invited you to ${TIERS[x.tier]?.name||'a table'}`,{inv:true,btn:'Join',fn:()=>{dropInvite(f);goOnline(x.code,x.tier,'join')},no:()=>dropInvite(f)})});
  invites=fresh;refreshFriends()}));
 Object.keys(prof.friends).forEach(watchUser);
 TIERS.forEach((_,i)=>unsubs.push(listen('tables/pub'+i+'/here',v=>{liveCounts[i]=v?Object.keys(v).length:0;if(!$('#home').hidden)renderMap()})));
 enterHome()}
function onSignedOut(){unsubs.forEach(u=>{try{u()}catch(e){}});unsubs=[];Object.values(subs).flat().forEach(u=>{try{u()}catch(e){}});for(const k in subs)delete subs[k];
 me.id=null;people={};status={};requests={};invites={};show('auth')}

/* ---------- boot ---------- */
(async()=>{
 show('auth');
 if(!configured){$('#aNote').textContent='Online accounts are not connected yet: add your Firebase settings to firebase-config.js (see README). Solo play works now.';return}
 try{fb=await initFB()}catch(e){console.warn(e);$('#aNote').textContent='Could not load Firebase. Check your connection. Solo play still works.';return}
 fb.A.onAuthStateChanged(fb.auth,u=>{if(u)onSignedIn(u);else onSignedOut()});
})();
