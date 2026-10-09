const SE_UI_BASE=new URL('..',document.currentScript?document.currentScript.src:location.href);
(async()=>{const SE=window.SE||(window.SE={selectPlanet(){},zoom(){},look(){}});
let P=[];try{P=await (await fetch(new URL('planets.json?v=1791547913',SE_UI_BASE),{cache:'no-cache'})).json();}catch(e){console.warn('[ui] planets.json failed',e);}
const r=document.createElement('div');r.id='se-ui';
r.innerHTML='<div id="se-card"></div><button id="se-menu">☰</button><div id="se-bar"></div>';document.body.appendChild(r);
const card=r.querySelector('#se-card'),bar=r.querySelector('#se-bar');
const sfx=n=>{const a=new Audio(new URL('audio/'+n,SE_UI_BASE));a.volume=.6;a.play().catch(()=>{});};window.SE_SFX=sfx;
function show(p,quiet){sfx('open.mp3');if(!quiet){sfx('fly.mp3');SE.selectPlanet(p.name);}card.style.display='block';
card.innerHTML=`<button class="x">×</button><h2>${p.name}</h2><div>${p.type} · radius ${p.radius_km.toLocaleString()} km${p.moons!=null?' · '+p.moons+' moons':''}</div><p>${p.fact}</p>${(()=>{const m=P.filter(x=>x.parent===p.name);return m.length?'<div class="mo">'+m.map(x=>`<button data-n="${x.name}">${x.name}</button>`).join('')+'</div>':''})()}${p.parent?`<button class="up" data-n="${p.parent}">← ${p.parent}</button>`:''}`;
if(SE.land&&(SE.canLand?SE.canLand(p.name):!/star|giant/i.test(p.type))){const L=document.createElement('button');L.className='land';L.textContent='🛬 Land on '+p.name;L.onclick=()=>{sfx('land.mp3');SE.land(p.name);};card.appendChild(L);}
if(window.ASTRO){const Q=document.createElement('button');Q.className='ask';Q.textContent='🤖 Ask Astro';Q.onclick=()=>openAstro(p.name);card.appendChild(Q);}
card.querySelectorAll('[data-n]').forEach(b=>b.onclick=()=>show(P.find(x=>x.name===b.dataset.n)));
card.querySelector('.x').onclick=()=>card.style.display='none';}
P.filter(p=>!p.parent).forEach(p=>{const b=document.createElement('button');b.textContent=p.name;b.onclick=()=>show(p);bar.appendChild(b);});
r.addEventListener('click',e=>{if(e.target.tagName==='BUTTON'&&!e.target.matches('.land,#se-takeoff'))sfx(e.target.classList.contains('up')?'back.mp3':'tap.mp3');},true);
bar.style.display='flex';r.querySelector('#se-menu').onclick=()=>bar.style.display=getComputedStyle(bar).display==='none'?'flex':'none';
addEventListener('se:selected',e=>{const d=e.detail,n=typeof d==='string'?d:d&&(d.name||d.planet);const p=P.find(x=>x.name===n);p&&show(p,true);});
const TO=document.createElement('button');TO.id='se-takeoff';TO.textContent='🚀 Take off';TO.onclick=()=>{sfx('takeoff.mp3');SE.takeOff&&SE.takeOff();};r.appendChild(TO);const CR=document.createElement('a');CR.id='se-credits';CR.href=new URL('credits.html',SE_UI_BASE);CR.target='_blank';CR.textContent='Credits';r.appendChild(CR);
addEventListener('se:landed',()=>{r.classList.add('landed');card.style.display='none';});
addEventListener('se:tookoff',()=>r.classList.remove('landed'));
const AS=document.createElement('div');AS.id='se-astro';r.appendChild(AS);
async function openAstro(n){AS.style.display='flex';AS.innerHTML=`<div class="hd">🤖 Astro · ${n}<button class="x">×</button></div><div class="log"></div><div class="qs"></div><form class="in"><input placeholder="Ask Astro anything…" enterkeyhint="send"><button>Send</button></form>`;
AS.querySelector('.x').onclick=()=>{AS.style.display='none';try{speechSynthesis.cancel()}catch(e){}};
const log=AS.querySelector('.log'),qs=AS.querySelector('.qs');const add=(t,c)=>{const d=document.createElement('div');d.className=c;d.textContent=t;log.appendChild(d);log.scrollTop=1e6;};
add('Hi! Ask me anything about '+n+'.','a');
const F=AS.querySelector('.in'),I=F.querySelector('input');['keydown','keyup'].forEach(k=>I.addEventListener(k,e=>e.stopPropagation()));
F.onsubmit=async e=>{e.preventDefault();const q=I.value.trim();if(!q)return;I.value='';add(q,'q');let a='Hmm, I am not sure about that one.';try{a=await (ASTRO.ask?ASTRO.ask(n,q):ASTRO.answer(n,q))||a}catch(e){}add(a,'a');try{ASTRO.speak&&ASTRO.speak(a)}catch(e){}};let list=[];try{list=await ASTRO.questions(n)||[]}catch(e){}
list.forEach(q=>{const b=document.createElement('button');b.textContent=q;b.onclick=async()=>{add(q,'q');let a='Hmm, I am not sure about that one.';try{a=await ASTRO.answer(n,q)||a}catch(e){}add(a,'a');try{ASTRO.speak&&ASTRO.speak(a)}catch(e){}};qs.appendChild(b);});}
addEventListener('se:landed',()=>AS.style.display='none');
window.SE_UI={astro:n=>openAstro(n),show:n=>{const p=P.find(x=>x.name===n);p&&show(p);}};
const t=new Map();let pd=0;const c=document.querySelector('canvas')||document.body;
c.addEventListener('pointerdown',e=>e.target===c&&t.set(e.pointerId,{x:e.clientX,y:e.clientY}));
c.addEventListener('pointermove',e=>{const o=t.get(e.pointerId);if(!o)return;
if(t.size===1)SE.look(e.clientX-o.x,e.clientY-o.y);t.set(e.pointerId,{x:e.clientX,y:e.clientY});
if(t.size===2){const[a,b]=[...t.values()],d=Math.hypot(a.x-b.x,a.y-b.y);if(pd)SE.zoom((d-pd)/100);pd=d;}});
['pointerup','pointercancel'].forEach(k=>c.addEventListener(k,e=>{t.delete(e.pointerId);pd=0;}));
c.addEventListener('wheel',e=>SE.zoom(-e.deltaY/500),{passive:true});c.style.touchAction='none';})();
(()=>{const t=document.createElement('div');t.id='se-title';t.innerHTML='<h1>SPACE EXPLORER X</h1><p style="margin:0 0 20px;color:#9cf">FREE on mobile &amp; computer<br><span style="font-size:13px;opacity:.8">Made by Nova Labs ⭐</span></p><button>Start exploring</button><a href="'+new URL('credits.html',SE_UI_BASE)+'" target="_blank" style="margin-top:18px;color:#9cf;font-size:14px">Credits &amp; About</a>';
document.body.appendChild(t);t.querySelector('button').onclick=()=>{t.remove();window.SE_SFX?SE_SFX('start.mp3'):new Audio(new URL('audio/start.mp3',SE_UI_BASE)).play().catch(()=>{});const m=new Audio(new URL('audio/'+(matchMedia('(pointer:fine) and (min-width:900px)').matches?'ambient_long.mp3':'ambient.mp3'),SE_UI_BASE));m.loop=true;m.volume=.35;m.play().catch(()=>{});window.SE_MUSIC=m;try{Promise.resolve(document.documentElement.requestFullscreen&&document.documentElement.requestFullscreen()).catch(()=>{})}catch(e){}};})();
setInterval(()=>{const m=window.SE_MUSIC;if(!m)return;let s=false;try{s=speechSynthesis.speaking}catch(e){}const t=s?.08:.35;m.volume+=(t-m.volume)*.3;},100);
(function k(){const r=document.getElementById('se-ui');if(!r)return setTimeout(k,200);const d=document.createElement('div');d.id='se-keys';
d.innerHTML='<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> fly · <kbd>Q</kbd>/<kbd>E</kbd> down/up · <kbd>Shift</kbd> boost · drag to look · scroll to zoom · click to select · double-click to fly there';r.appendChild(d);})();
(function b(){const r=document.getElementById('se-ui');if(!r)return setTimeout(b,200);
const W=document.createElement('div');W.id='se-speed';W.innerHTML='<span class="cur">×1</span><input type="number" inputmode="numeric" min="1" max="100000" value="10" aria-label="Boost speed">';
const B=document.createElement('button');B.id='se-boost';B.textContent='⚡';r.appendChild(W);r.appendChild(B);
const I=W.querySelector('input'),C=W.querySelector('.cur');let on=false;
const val=()=>Math.min(100000,Math.max(1,Math.round(+I.value)||1));
const apply=()=>{const v=on?val():1;C.textContent='×'+v.toLocaleString();B.classList.toggle('on',on);window.SE&&SE.setBoost&&SE.setBoost(v);};
B.onclick=()=>{on=!on;if(on&&window.SE_SFX)SE_SFX('boost.mp3');apply();};
['keydown','keyup'].forEach(k=>I.addEventListener(k,e=>{e.stopPropagation();if(k==='keydown'&&e.key==='Enter'){I.blur();}}));
I.addEventListener('change',()=>{I.value=val();on=true;apply();});
addEventListener('keyup',e=>{if(e.key==='Shift'&&on)setTimeout(apply,0);});addEventListener('blur',()=>on&&setTimeout(apply,0));
window.SE_UI_SPEED={set:v=>{I.value=v;on=true;apply();},off:()=>{on=false;apply();}};})();
addEventListener('keydown',e=>{if(e.key==='Shift'&&!e.repeat&&window.SE_SFX)SE_SFX('boost.mp3');});
