const PK=(()=>{
const TIERS=[
 {name:'Beach Shack',sb:5,bb:10,buy:1000,lvl:1,skill:.35},
 {name:'Downtown Lounge',sb:25,bb:50,buy:5000,lvl:3,skill:.5},
 {name:'Riverboat',sb:100,bb:200,buy:20000,lvl:6,skill:.62},
 {name:'Mountain Lodge',sb:500,bb:1000,buy:100000,lvl:10,skill:.74},
 {name:'Monte Carlo',sb:2500,bb:5000,buy:500000,lvl:15,skill:.85},
 {name:'Sky Palace',sb:10000,bb:20000,buy:2000000,lvl:22,skill:.95}];
const BOTS=['Ava','Rico','Jun','Priya','Mateo','Zoe','Omar','Lena','Theo','Nia','Kenji','Sasha','Diego','Ivy','Malik','Rosa','Felix','Hana','Bruno','Tess'];
const HN=['High card','Pair','Two pair','Three of a kind','Straight','Flush','Full house','Four of a kind','Straight flush'];
const P5=13**5;
function evalHand(cs){
 const rc=new Array(13).fill(0),sc=[0,0,0,0],sm=[0,0,0,0];let all=0;
 for(const c of cs){const r=c>>2,s=c&3;rc[r]++;sc[s]++;sm[s]|=1<<r;all|=1<<r}
 const st=m=>{for(let h=12;h>=4;h--){const w=0x1F<<(h-4);if((m&w)===w)return h}return (m&0x100F)===0x100F?3:-1};
 const enc=(cat,ks)=>{let v=cat;for(let i=0;i<5;i++)v=v*13+(ks[i]||0);return v};
 const hi=(ex,n)=>{const o=[];for(let r=12;r>=0&&o.length<n;r--)if(rc[r]&&!ex.includes(r))o.push(r);return o};
 let f=-1;for(let s=0;s<4;s++)if(sc[s]>=5)f=s;
 if(f>=0){const h=st(sm[f]);if(h>=0)return enc(8,[h])}
 const q=[],t=[],p=[];
 for(let r=12;r>=0;r--){if(rc[r]===4)q.push(r);else if(rc[r]===3)t.push(r);else if(rc[r]===2)p.push(r)}
 if(q.length)return enc(7,[q[0],hi([q[0]],1)[0]]);
 if(t.length&&(t.length>1||p.length))return enc(6,[t[0],Math.max(t[1]??-1,p[0]??-1)]);
 if(f>=0){const o=[];for(let r=12;r>=0&&o.length<5;r--)if(sm[f]&(1<<r))o.push(r);return enc(5,o)}
 const h=st(all);if(h>=0)return enc(4,[h]);
 if(t.length)return enc(3,[t[0],...hi([t[0]],2)]);
 if(p.length>=2)return enc(2,[p[0],p[1],hi([p[0],p[1]],1)[0]]);
 if(p.length)return enc(1,[p[0],...hi([p[0]],3)]);
 return enc(0,hi([],5));
}
const handName=v=>HN[Math.floor(v/P5)];
function equity(hole,board,opp,iters){
 if(opp<1)return 1;const used=new Set([...hole,...board]),rest=[];
 for(let c=0;c<52;c++)if(!used.has(c))rest.push(c);
 const need=5-board.length,n=need+opp*2;let win=0;
 for(let it=0;it<iters;it++){
  for(let i=0;i<n;i++){const j=i+Math.floor(Math.random()*(rest.length-i));const x=rest[i];rest[i]=rest[j];rest[j]=x}
  const b=board.concat(rest.slice(0,need)),my=evalHand(hole.concat(b));let ties=0,lose=false;
  for(let o=0;o<opp;o++){const v=evalHand([rest[need+o*2],rest[need+o*2+1],...b]);if(v>my){lose=true;break}if(v===my)ties++}
  if(!lose)win+=1/(ties+1)}
 return win/iters;
}
function shuffle(){const d=[...Array(52).keys()];for(let i=51;i>0;i--){const j=Math.floor(Math.random()*(i+1));[d[i],d[j]]=[d[j],d[i]]}return d}
let botN=Math.floor(Math.random()*20);
function bot(buy){return{kind:'bot',name:BOTS[(botN++)%BOTS.length],uid:null,peer:null,stack:buy,persona:{tight:Math.random(),aggr:Math.random(),bluff:Math.random()*.6},cards:[],bet:0,total:0,folded:true,allin:false,acted:false,out:false,la:''}}
function human(o,buy){return{kind:'human',name:o.name||'Player',uid:o.uid||null,peer:o.peer||null,stack:o.stack??buy,cards:[],bet:0,total:0,folded:true,allin:false,acted:false,out:false,la:''}}

class Game{
 constructor(tier,o={}){this.tier=tier;this.t=TIERS[tier];this.online=!!o.online;this.seats=[];
  for(let i=0;i<6;i++)this.seats.push(bot(this.t.buy));
  this.button=-1;this.phase='waiting';this.board=[];this.hand=0;this.toAct=-1;this.cb=0;this.mr=this.t.bb;this.win=null;this.reveal=false;
  this.ep=o.ep||0;this.timers=[];this.onChange=o.onChange||(()=>{});this.onHandStart=o.onHandStart||(()=>{});this.delay=o.delay??1;this.dl=0;this.speech='';}
 later(fn,ms){const id=setTimeout(()=>{this.timers=this.timers.filter(x=>x!==id);if(!this.dead)fn()},ms*this.delay);this.timers.push(id);return id}
 stop(){this.dead=true;this.timers.forEach(clearTimeout);this.timers=[]}
 pot(){return this.seats.reduce((a,s)=>a+s.total,0)}
 inHand(s){return s.cards.length>0&&!s.folded}
 canAct(s){return this.inHand(s)&&!s.allin}
 next(i,pred){for(let k=1;k<=6;k++){const j=(i+k+6)%6;if(pred(this.seats[j]))return j}return -1}
 seatHuman(i,o){const s=human(o,this.t.buy);this.seats[i]=s;return s}
 startHand(){
  if(this.dead)return;this.timers.forEach(clearTimeout);this.timers=[];
  this.seats.forEach((s,i)=>{
   if(s.pend){this.seats[i]=human(s.pend,this.t.buy);return}
   if(s.leaving){this.seats[i]=bot(this.t.buy);return}
   if(s.kind==='bot'&&s.stack<this.t.bb){this.seats[i]=bot(this.t.buy)}
  });
  this.seats.forEach(s=>{s.out=s.stack<=0||!!s.sitout;s.cards=[];s.bet=0;s.total=0;s.folded=true;s.allin=false;s.acted=false;s.la=''});
  const act=this.seats.filter(s=>!s.out);
  this.win=null;this.reveal=false;this.board=[];
  if(act.length<2){this.phase='waiting';this.toAct=-1;this.change();return}
  this.hand++;this.deck=shuffle();
  this.seats.forEach(s=>{if(!s.out)s.folded=false});
  const ok=s=>!s.out;
  this.button=this.next(this.button,ok);
  let sbI,bbI;if(act.length===2){sbI=this.button;bbI=this.next(sbI,ok)}else{sbI=this.next(this.button,ok);bbI=this.next(sbI,ok)}
  this.post(sbI,this.t.sb);this.post(bbI,this.t.bb);this.seats[sbI].la='SB';this.seats[bbI].la='BB';
  for(let r=0;r<2;r++)this.seats.forEach(s=>{if(!s.out)s.cards.push(this.deck.pop())});
  this.cb=this.t.bb;this.mr=this.t.bb;this.phase='preflop';
  this.toAct=this.next(bbI,s=>this.canAct(s));
  this.speech='Blinds '+this.t.sb+'/'+this.t.bb+'. Cards are in the air.';
  this.onHandStart();
  if(this.toAct<0||this.needers().length===0){this.endStreet();return}
  this.change();this.schedule();
 }
 post(i,a){const s=this.seats[i];a=Math.min(a,s.stack);s.stack-=a;s.bet+=a;s.total+=a;if(s.stack===0)s.allin=true}
 needers(){return this.seats.filter(s=>this.canAct(s)&&(!s.acted||s.bet<this.cb))}
 legal(i){const s=this.seats[i];const toCall=Math.min(this.cb-s.bet,s.stack);const maxTo=s.bet+s.stack;const minTo=Math.min(this.cb+this.mr,maxTo);return{toCall,minTo,maxTo,canRaise:maxTo>this.cb&&this.seats.some((o,j)=>j!==i&&this.canAct(o))}}
 act(i,ty,amt){
  if(!['preflop','flop','turn','river'].includes(this.phase)||i!==this.toAct)return false;
  const s=this.seats[i],L=this.legal(i);
  if(ty==='check'&&L.toCall>0)ty='call';
  if(ty==='allin'){ty=L.maxTo>this.cb&&L.canRaise?'raise':'call';amt=L.maxTo}
  if(ty==='raise'&&!L.canRaise)ty='call';
  if(ty==='fold'){s.folded=true;s.la='Fold'}
  else if(ty==='check'){s.la='Check'}
  else if(ty==='call'){this.put(s,L.toCall);s.la=s.allin?'All-in':(L.toCall?'Call':'Check')}
  else if(ty==='raise'){
   amt=Math.round(Math.max(L.minTo,Math.min(amt||0,L.maxTo)));
   const by=amt-this.cb;if(by>=this.mr)this.mr=by;
   const wasOpen=this.cb===0;
   this.put(s,amt-s.bet);this.cb=Math.max(this.cb,s.bet);
   this.seats.forEach(o=>{if(o!==s)o.acted=false});
   s.la=s.allin?'All-in':(wasOpen?'Bet':'Raise')}
  else return false;
  s.acted=true;this.clearTurn();
  if(this.checkUncontested())return true;
  if(this.needers().length===0)this.endStreet();
  else{this.toAct=this.next(i,o=>this.canAct(o)&&(!o.acted||o.bet<this.cb));this.change();this.schedule()}
  return true;
 }
 put(s,a){a=Math.min(a,s.stack);s.stack-=a;s.bet+=a;s.total+=a;if(s.stack===0)s.allin=true}
 forceFold(i){const s=this.seats[i];if(!this.inHand(s))return;if(i===this.toAct){this.act(i,'fold');return}s.folded=true;s.la='Fold';if(!this.checkUncontested()){if(this.needers().length===0&&this.toAct>=0){this.clearTurn();this.endStreet()}else this.change()}}
 checkUncontested(){
  const live=this.seats.filter(s=>this.inHand(s));
  if(live.length!==1||this.phase==='done')return false;
  const w=live[0],amt=this.pot();w.stack+=amt;this.seats.forEach(s=>{s.bet=0});
  this.win=[{seat:this.seats.indexOf(w),amt,hn:''}];this.phase='done';this.toAct=-1;
  this.speech=w.name+' takes the pot of '+amt.toLocaleString()+'.';
  this.change();this.later(()=>this.startHand(),3200);return true;
 }
 endStreet(){
  this.seats.forEach(s=>{s.bet=0;s.acted=false;if(this.inHand(s)&&s.la!=='All-in')s.la=''});
  this.cb=0;this.mr=this.t.bb;this.toAct=-1;
  if(this.phase==='river'){this.showdown();return}
  const d=this.deck;
  if(this.phase==='preflop'){d.pop();this.board.push(d.pop(),d.pop(),d.pop());this.phase='flop'}
  else if(this.phase==='flop'){d.pop();this.board.push(d.pop());this.phase='turn'}
  else{d.pop();this.board.push(d.pop());this.phase='river'}
  this.speech=({flop:'Here comes the flop.',turn:'The turn.',river:'And the river.'})[this.phase];
  const actors=this.seats.filter(s=>this.canAct(s)).length;
  if(actors<=1){this.reveal=true;this.change();this.later(()=>this.endStreet(),1100);return}
  this.toAct=this.next(this.button,s=>this.canAct(s));this.change();this.schedule();
 }
 showdown(){
  this.phase='done';this.toAct=-1;this.reveal=true;
  const live=this.seats.map((s,i)=>({s,i})).filter(x=>this.inHand(x.s));
  live.forEach(x=>x.v=evalHand(x.s.cards.concat(this.board)));
  const levels=[...new Set(live.map(x=>x.s.total))].sort((a,b)=>a-b);
  let prev=0;const won={};let paid=0;
  for(const L of levels){
   let amt=0;this.seats.forEach(s=>{amt+=Math.max(0,Math.min(s.total,L)-prev)});
   const el=live.filter(x=>x.s.total>=L);const best=Math.max(...el.map(x=>x.v));
   const ws=el.filter(x=>x.v===best).sort((a,b)=>((a.i-this.button+5)%6)-((b.i-this.button+5)%6));
   const sh=Math.floor(amt/ws.length);let rem=amt-sh*ws.length;
   ws.forEach(x=>{const g=sh+(rem>0?1:0);if(rem>0)rem--;won[x.i]=(won[x.i]||0)+g});
   paid+=amt;prev=L}
  const left=this.pot()-paid;if(left>0){const top=live.reduce((a,b)=>b.v>a.v?b:a);won[top.i]=(won[top.i]||0)+left}
  this.win=Object.keys(won).map(k=>({seat:+k,amt:won[k],hn:handName(live.find(x=>x.i===+k).v)}));
  this.win.forEach(w=>{this.seats[w.seat].stack+=w.amt});
  const w0=this.win.reduce((a,b)=>b.amt>a.amt?b:a);
  this.speech=this.win.length>1?'Split pot! '+this.win.map(w=>this.seats[w.seat].name).join(' & ')+' with '+w0.hn.toLowerCase()+'.':this.seats[w0.seat].name+' wins '+w0.amt.toLocaleString()+' with '+w0.hn.toLowerCase()+'.';
  this.change();this.later(()=>this.startHand(),5000);
 }
 clearTurn(){if(this.turnT){clearTimeout(this.turnT);this.timers=this.timers.filter(x=>x!==this.turnT);this.turnT=null}this.dl=0}
 schedule(){
  const i=this.toAct;if(i<0)return;const s=this.seats[i];
  if(s.kind==='bot')this.later(()=>{if(this.toAct===i)this.botAct(i)},600+Math.random()*900);
  else if(this.online){this.dl=Date.now()+25000;this.turnT=this.later(()=>{if(this.toAct===i){const s2=this.seats[i];this.act(i,s2.bet>=this.cb?'check':'fold')}},25000)}
 }
 botAct(i){
  const s=this.seats[i],L=this.legal(i),p=s.persona,sk=this.t.skill,bb=this.t.bb;
  const opp=this.seats.filter(o=>o!==s&&this.inHand(o)).length;
  const eq=equity(s.cards,this.board,opp,Math.round(120+sk*260));
  const e=eq+(1-sk)*(Math.random()-.5)*.35;
  const pot=this.pot(),odds=L.toCall/(pot+L.toCall||1);
  const fair=1/(opp+1);
  const size=()=>{let to=this.cb+Math.max(this.mr,Math.round(pot*(.45+Math.random()*.6)/bb)*bb);if(e>fair*2.6&&Math.random()<.18+p.aggr*.2)to=L.maxTo;return to};
  const r=Math.random();
  if(L.toCall===0){
   if(L.canRaise&&(e>fair*1.5+p.tight*.08||r<p.bluff*.25*(1-sk*.5)))return this.act(i,'raise',size());
   return this.act(i,'check');}
  if(L.canRaise&&e>fair*2&&r<.35+p.aggr*.45)return this.act(i,'raise',size());
  if(e>=odds*(1+p.tight*.35)||(L.toCall<=bb&&r<.45-p.tight*.3))return this.act(i,'call');
  if(L.canRaise&&r<p.bluff*.12*(1-sk*.6))return this.act(i,'raise',size());
  return this.act(i,'fold');
 }
 change(){this.onChange(this)}
 pub(){return{ep:this.ep,tier:this.tier,hand:this.hand,phase:this.phase,board:this.board,button:this.button,toAct:this.toAct,cb:this.cb,mr:this.mr,pot:this.pot(),reveal:this.reveal,win:this.win,sp:this.speech,dl:this.dl?Math.max(0,this.dl-Date.now()):0,
  seats:this.seats.map(s=>({n:s.name,k:s.kind,u:s.uid,p:s.peer,st:s.stack,b:s.bet,t:s.total,f:s.folded,a:s.allin,o:s.out,la:s.la,lv:!!s.leaving,pd:!!s.pend,c:(this.reveal&&this.inHand(s))?s.cards:(s.cards.length?2:0)}))}}
 static fromPub(P,present,o){
  const g=new Game(P.tier,o);g.ep=(P.ep||0)+1;g.button=P.button;g.hand=P.hand;
  g.seats=P.seats.map(s=>{if(s.k==='human'&&present(s.p))return human({name:s.n,uid:s.u,peer:s.p,stack:s.st+s.t},0);const b=bot(g.t.buy);if(s.k==='bot'){b.name=s.n;b.stack=Math.max(s.st+s.t,0)}return b});
  return g;
 }
}
return{TIERS,Game,evalHand,handName,equity,HN};
})();
