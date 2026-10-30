(function(){
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fmt=n=>'KSh '+Math.round(n).toLocaleString('en-KE');
const local={get(k,d){try{const v=localStorage.getItem(k);return v==null?d:JSON.parse(v)}catch(e){return d}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}},del(k){try{localStorage.removeItem(k)}catch(e){}}};
const PER_SEC=3.47e9/86400; // KSh 416.2bn new foreign loans Jan–Apr 2026 ≈ KSh 3.47bn/day
const SHARE=t=>'https://wa.me/?text='+encodeURIComponent(t);
const today=()=>new Date().toISOString().slice(0,10);
function toast(t){const d=document.createElement('div');d.className='toast';d.textContent=t;document.body.appendChild(d);setTimeout(()=>d.remove(),2200)}

/* ================= STORAGE (Supabase) ================= */
const sb=window.supabase.createClient(window.R27.url,window.R27.key,{auth:{persistSession:true,autoRefreshToken:true}});
let uid=null;
let OV={chapters:{},tasks:{},topics:{}};
const DEF_P=()=>({nick:'',lang:'',vehicle:'',consent:null,stop:false,chapter:0,completed:[],quiz:{},polls:{},topicsOpened:[],viewedProposals:0,missions:0,reports:0,claims:0,streak:{n:0,last:''},tasksDone:{},game:{best:0,runs:0,legs:0,seconds:0},dream:{},talks:[],optIn:false,volunteer:null,county:null,timeSec:0,created:Date.now(),updated:Date.now()});
let P=Object.assign(DEF_P(),local.get('r27_p',{}));
let saveT=null,saving=false,dirty=false,lastNick=null;
function save(){P.updated=Date.now();local.set('r27_p',P);dirty=true;clearTimeout(saveT);saveT=setTimeout(flush,1200)}
let authP=null;
function ensureAuth(){
  if(uid)return Promise.resolve(uid);
  if(authP)return authP; // one sign-in at a time, so a player never gets two accounts
  authP=(async()=>{
    try{const {data}=await sb.auth.getSession();if(data.session){uid=data.session.user.id;return uid}}catch(e){}
    if(P.consent!==true)return null; // no account is created before consent
    const r=await sb.auth.signInAnonymously();if(r.error){console.warn(r.error.message);return null}
    uid=r.data.user.id;return uid;
  })();
  authP.finally(()=>{authP=null});
  return authP;
}
async function flush(){
  if(saving||!dirty)return;if(!await ensureAuth())return;saving=true;dirty=false;
  try{await sb.from('player_state').upsert({user_id:uid,state:P,county:P.county||null,updated_at:new Date().toISOString()});
    if(P.nick&&P.nick!==lastNick){lastNick=P.nick;await sb.from('profiles').update({nick:P.nick}).eq('id',uid)}}catch(e){}
  saving=false;if(dirty)saveT=setTimeout(flush,1200);
}
async function addInbox(item){
  if(!await ensureAuth()){toast('Haikutumwa. Kubali privacy kwanza.');return null}
  const row={type:item.type,nick:P.nick||'Anonymous',county:item.county||null,issue:item.issue||null,impact:item.impact||null,solution:item.solution||null,text:item.text||null,topic:item.topic||null,ref:item.ref||null,status:item.status||'new'};
  const {data,error}=await sb.from('inbox').insert(row).select('id').single();
  if(error){toast('Haikutumwa. Jaribu tena.');return null}return data.id;
}
async function setInbox(id,patch){if(!id)return;try{await sb.from('inbox').update(patch).eq('id',id)}catch(e){}}
async function delInbox(id){if(!id)return;try{await sb.from('inbox').delete().eq('id',id)}catch(e){}}
function chapters(){return CHAPTERS.concat(Object.values(OV.chapters).filter(c=>!CHAPTERS.find(b=>b.id===c.id))).map(c=>Object.assign({},c,OV.chapters[c.id]||{})).filter(c=>!c.hidden).sort((a,b)=>(a.order||0)-(b.order||0))}
function tasks(){return TASKS.concat(Object.values(OV.tasks).filter(t=>!TASKS.find(b=>b.id===t.id))).map(t=>Object.assign({},t,OV.tasks[t.id]||{})).filter(t=>!t.hidden).sort((a,b)=>(a.order||0)-(b.order||0))}
function topic(k){return Object.assign({},TOPICS[k]||{name:k},OV.topics[k]||{})}
function factOf(c){if(c.factText)return{t:c.factText,s:c.factSource||'Campaign research team'};return c.fact&&FACTS[c.fact]?FACTS[c.fact]:null}

/* ================= BOT ================= */
const chat=$('#chat'),chipsEl=$('#chips');
let pending=null,lastChips=[];
function say(html){const d=document.createElement('div');d.className='msg bot';d.innerHTML=html;chat.appendChild(d);chat.scrollTop=chat.scrollHeight}
function me(t){const d=document.createElement('div');d.className='msg me';d.textContent=t;chat.appendChild(d);chat.scrollTop=chat.scrollHeight}
function chips(list){lastChips=list;chipsEl.innerHTML='';list.forEach(([label,fn],i)=>{const b=document.createElement('button');b.type='button';b.innerHTML=`<span class="n">${i+1}</span>${esc(label)}`;b.onclick=()=>{me(label);pending=null;fn()};chipsEl.appendChild(b)})}
function ask(prompt,fn){if(prompt)say(prompt);chips([['⬅️ Main menu',menu]]);pending=fn}
const nick=()=>esc(P.nick||'captain');
const factHTML=f=>f?`<span class="card">${esc(f.t)}<span class="fact">Chanzo: ${esc(f.s)}</span></span>`:'';

/* 1–2 welcome */
function welcome(){
  say('🇰🇪 <b>WAZI, KARIBU THE ROUTE 2027.</b>\n\nUko karibu kuanza safari ya Mombasa hadi Kisumu, safari ya kupitia story ya Kenya, kuelewa vile tumefika hapa, na kuona ideas za Sifuna za kubadilisha hii situation.\n\nHii si kawaida ya manifesto ya pages mia mbili. Hapa uta-experience story pole pole kupitia short videos, voice notes, quizzes, choices na challenges.\n\n<b>Uko ready kuanza safari?</b>');
  chips([['Niko ready',privacy],['Nieleze zaidi',explain],['Sitaki kuendelea',()=>say('Sawa, hakuna shida. Ukibadilisha mind, tuma START.')]]);
}
/* 3 */
function explain(){
  say('<b>The Route 2027 ni nini?</b>\n\nNi interactive journey inayokupeleka kupitia different parts of Kenya\'s story. Kila stage itaonyesha:\n\n<b>What happened → Inatugusa aje leo → What can change → Sifuna anapropose nini.</b>\n\nUtapata nafasi ya kusoma, kusikiza, kupiga kura kwa poll, kuuliza swali, na kuchagua vile unaendelea.\n\nUtapata pia option ya kutuma local issue yako. Ukifanya hivyo, tutakuambia wazi vile data itatumika.\n\n<b>Kumbuka:</b> hii ni private one-on-one chat, lakini si anonymity ya 100%. Platforms na service providers wanaweza process technical details. Hatutashow contact yako kwa players wengine.\n\nUnaendelea aje?');
  chips([['Anza safari',privacy],['Soma privacy kwanza',privacy],['Exit',()=>say('Sawa. Tuma START ukirudi.')]]);
}
/* 4 */
function privacy(){
  say('🔐 <b>PRIVACY NA CONSENT</b>\n\nKabla uanze:\n• Hii ni private chat kati yako na bot.\n• Players wengine hawataona jina yako ama replies zako.\n• Technical providers wanaweza process message metadata.\n• Hatutauza details zako.\n• Usitume ID number, PIN, password ama sensitive personal information.\n• Unaweza kuandika <b>STOP</b> wakati wowote kuacha messages.\n• Unaweza kuandika <b>DELETE</b> kuomba data yako iondolewe.\n\nBy continuing, unakubali kupokea messages za The Route 2027. Consent yako inaweza ku-withdraw anytime.\n\nUnakubali kuendelea?');
  chips([['Nakubali',()=>{P.consent=true;P.stop=false;save();ensureAuth().then(()=>flush());language()}],['Sikubali',()=>{P.consent=false;save();say('Sawa, hakuna shida. Hatutaendelea na campaign flow. Ukibadilisha mind, tuma <b>START</b>.\n\nAsante kwa kusoma privacy notice.');chips([])}]]);
}
/* 5 */
function language(){
  say('Unataka safari ikuwe kwa lugha gani?');
  const pick=l=>()=>{P.lang=l;save();say(l==='sheng'?'Fiti. Tutatumia Sheng mostly, lakini important terms, sources na policy details tutaziweka clear. Ukiona phrase haieleweki, reply <b>EXPLAIN</b>.':'Fiti. Pitch hii iko kwa Sheng-mix; version za '+(l==='en'?'English':l==='sw'?'Kiswahili sanifu':'lugha zote')+' zinaongezwa na timu kupitia dashboard.');nickname()};
  chips([['Sheng mostly',pick('sheng')],['Kiswahili',pick('sw')],['English',pick('en')],['Mix ya zote',pick('mix')]]);
}
/* 6 */
function nickname(){
  say('Sawa, captain. Hapa huhitaji kutumia jina yako ya real life.\n\nChagua nickname ya safari. Unaweza type any name, ama tumia one ya sample:');
  const set=n=>{P.nick=String(n).slice(0,24);save();say(`Poa, <b>${nick()}</b>. Hiyo ndiyo tutatumia kwa game.\n\n<b>Usiweke full name, ID number ama phone number hapa.</b>`);vehicle()};
  chips([['Msee wa Route',()=>set('Msee wa Route')],['Hustler wa Kenya',()=>set('Hustler wa Kenya')],['Captain Change',()=>set('Captain Change')],['Type my own',()=>ask('Andika nickname yako:',t=>set(t))]]);
}
/* 7 */
const VEH={ma3:{name:'Ma3 ya kawaida',emoji:'🚐',desc:'Hii ni route ya wasee wengi: fare, hustle, family, shule, hospitali na daily survival.\n\nUtapata choices zinahusu vile public decisions zinaingia kwa life ya kawaida.',perk:'Game: Ma3 inaweza kuhimili kugonga mara moja kwa kila leg.'},
 vitz:{name:'Vitz ya hustle',emoji:'🚗',desc:'Hii ni route ya cost of living, biashara ndogo, jobs, taxes na kupanga maisha ukiwa na limited resources.',perk:'Game: Vitz ni ndogo, inapenya nafasi ndogo kwa urahisi.'},
 subaru:{name:'Subaru ya speed',emoji:'🏎️',desc:'Hii ni fast route yenye iko na more choices, quick quizzes na pressure moments.\n\nUsikimbie sana. Story ndiyo muhimu kuliko speed.',perk:'Game: Subaru ni fast na inaruka juu zaidi.'}};
function vehicle(){
  say('Sasa chagua ndai yako. Hii ni ya mchezo tu. Hakuna option iko "better" kuliko ingine. Each one inaonyesha style different ya journey.');
  const pick=k=>()=>{P.vehicle=k;save();const v=VEH[k];say(`${v.emoji} <b>${v.name.toUpperCase()}</b>\n\n${v.desc}\n\n<span class="fact">${v.perk}</span>`);expectations()};
  chips([['🚐 Ma3 ya kawaida',pick('ma3')],['🚗 Vitz ya hustle',pick('vitz')],['🏎️ Subaru ya speed',pick('subaru')]]);
}
/* 8 */
function expectations(){
  say('<b>Vile safari inawork:</b>\n1. Utapokea one stage at a time.\n2. Kila stage itakuwa na short story, data card ama voice note.\n3. Utachagua vile unaendelea.\n4. Response ya Sifuna itaonekana after the issue imeelezwa.\n5. Kati ya stages, utaendesha leg ya game kufika town inayofuata.\n6. Unaweza skip stage, pause, ama kuanza tena.\n\nSitakushurutisha forward message ama invite mtu. Ukipenda kushare, nitakupatia share card yenye unaweza review kwanza.\n\nReady?');
  chips([['Twende',()=>runChapter(P.chapter)],['How long ni journey?',()=>{say(`Full route ina stages ${chapters().length} na game legs ${chapters().length-1}. Inaweza kuchukua around dakika 90 hadi 120, lakini unaweza pause anytime.\n\nUnaweza pia kucheza one chapter pekee, kurudi baadaye na <b>RESUME</b>, ama kuanza upya na <b>RESTART</b>.\n\nKila siku pia kuna <b>Task ya leo</b> na <b>Free drive</b> kwa leaderboard.`);chips([['Twende',()=>runChapter(P.chapter)],['Main menu',menu]])}],['Main menu',menu]]);
}

/* 9–11 chapter engine */
function runChapter(i){
  const CH=chapters();if(i>=CH.length){arrival();return}
  P.chapter=i;save();const c=CH[i];
  const done={voice:false,explainer:false,quiz:false};
  say(`${esc(c.emoji||'📍')} <b>STAGE ${i+1}: ${esc(String(c.town).toUpperCase())}: ${esc(String(c.title).toUpperCase())}</b>\n\n${c.custom?esc(c.story):c.story}\n\nChagua vile unataka kuanza:`);
  const opts=()=>{const l=[];
    if(!done.voice)l.push(['🎧 Sikiliza voice note',()=>{done.voice=true;say(`🎧 <b>VOICE NOTE</b>${c.voiceUrl?`<audio controls preload="none" src="${esc(c.voiceUrl)}"></audio>`:''}<span class="voice">"${esc(c.voice||'')}"</span>`);opts()}]);
    if(!done.explainer)l.push(['▶️ Watch 30-sec explainer',()=>{done.explainer=true;say(`▶️ <b>EXPLAINER (30 sec)</b>${c.videoUrl?`<video controls playsinline preload="none" src="${esc(c.videoUrl)}"></video>`:''}<span class="card">${esc(c.explainer||'')}</span>`);opts()}]);
    if(!done.quiz&&c.quiz)l.push(['🧠 Take quick quiz',()=>{done.quiz=true;quiz(c,opts)}]);
    l.push(['➡️ Continue',()=>dataCard(c,i)]);chips(l)};
  opts();
}
function quiz(c,next){
  const q=c.quiz;say(`<b>QUIZ: ${esc(c.town)}</b>\n${esc(q.q)}`);
  chips(q.o.map((o,j)=>[o,()=>{const ok=j===q.a;P.quiz[c.id]=ok;save();
    say((ok?`✅ <b>Umecheck vizuri. "${esc(q.o[q.a])}."</b>`:`❌ Si hiyo. Jibu ni <b>${esc(q.o[q.a])}</b>.`)+`\n\n${esc(q.why||'')}`);next()}]));
}
function dataCard(c,i){
  const f=factOf(c);
  say('📊 <b>DATA CARD</b>'+(f?factHTML(f):'<span class="card">Data ya stage hii inaongezwa na research team. Hatutumii takwimu ambazo hazijathibitishwa.</span>'));
  manifestoDrop(c,i);
}
function proposalHTML(t){
  if(t.proposal){P.viewedProposals++;save();return `<span class="card">${esc(t.proposal)}</span>`+(t.funding?`<span class="fact">Funding: ${esc(t.funding)}</span>`:'')+(t.measure?`<span class="fact">Progress measure: ${esc(t.measure)}</span>`:'')+(t.status!=='approved'?'<span class="fact">Status: rasimu, haijaidhinishwa na timu ya Sifuna.</span>':'')}
  return '<span class="card">Timu ya Sifuna inaandaa response ya issue hii. Ikiwa tayari, itaonekana hapa automatically.</span>';
}
function manifestoDrop(c,i){
  const t=topic(c.topic);if(!P.topicsOpened.includes(c.topic)){P.topicsOpened.push(c.topic);save()}
  say(`<b>SASA, RESPONSE YA SIFUNA: ${esc(String(t.name).toUpperCase())}</b>\n\nBaada ya kuona issue hii, Sifuna anapropose:${proposalHTML(t)}\n\nHizi ni campaign proposals. Zisome, zilinganishe na plans zingine, then decide vile unaona.\n\nUnataka kufanya nini?`);
  chips([['Soma details',()=>{topicCard(c.topic,()=>mission(c,i))}],['Compare na current system',()=>{say(`<b>Current system:</b>\n${esc(t.problem||'')}\n\n<b>Why it matters:</b>\n${esc(t.why||'')}`);chips([['Ask a question',()=>askQ(c.topic,()=>mission(c,i))],['Continue route',()=>mission(c,i)]])}],['Ask a question',()=>askQ(c.topic,()=>mission(c,i))],['Continue route',()=>mission(c,i)]]);
}
function askQ(tp,next){ask('Andika swali lako kuhusu hii topic. Timu itajibu hapa kwa chat.',async t=>{await addInbox({type:'question',topic:tp,text:t,status:'pending'});P.claims++;save();say('Swali lako limetumwa ✅. Ukirudi, jibu litakuwa hapa.');next()})}
function mission(c,i){
  P.missions++;save();const n=String(i+1).padStart(2,'0');
  say(`🫡 <b>MISSION ${n}: ELEWA BEFORE USHARE</b>\nChagua one:`);
  chips([[c.quiz&&P.quiz[c.id]===undefined?'Answer quiz ya stage hii':'Quiz ya stage nyingine',()=>{const CH=chapters();const qc=P.quiz[c.id]===undefined?c:CH[Math.floor(Math.random()*CH.length)];quiz(qc,()=>poll(c,i))}],
   ['Share card ya stage hii',()=>{say(`Hii ndiyo card yako:\n<span class="card"><b>"${esc(c.share||'')}"</b></span>\nBefore ushare, check kama message inaeleweka. Sharing ni optional.\n<a href="${SHARE(String(c.share||'')+' (The Route 2027)')}" target="_blank" rel="noopener">Fungua WhatsApp ↗</a>`);chips([['Continue',()=>poll(c,i)]])}],
   ['Tuma local issue yako',()=>groundReport(()=>poll(c,i))],
   ['Continue bila mission',()=>poll(c,i)]]);
}
function poll(c,i){
  if(!c.poll){leg(c,i);return}
  say(`🗳️ <b>POLL</b>\n${esc(c.poll.q)}`);
  chips(c.poll.o.map(o=>[o,()=>{P.polls[c.id]=o;save();say('Asante. Poll ni anonymous kwa players wengine.');leg(c,i)}]));
}
function leg(c,i){
  const CH=chapters();if(!P.completed.includes(c.id)){P.completed.push(c.id)}save();
  if(i+1>=CH.length){arrival();return}
  const nx=CH[i+1];
  say(`🚐 <b>LEG ${i+1}: ${esc(c.town)} → ${esc(nx.town)}</b>\nEndesha ufike ${esc(nx.town)}. Chunga potholes, lorries na roadblocks.`);
  chips([['🚐 Endesha leg hii',()=>{showTab('game');Game.playLeg(i,CH,res=>{showTab('bot');me('🏁 Nimefika '+nx.town);say(`Fiti! Umefika <b>${esc(nx.town)}</b> kwa ${res.time}, crashes ${res.crashes}, score ${res.score}.`);setTimeout(()=>runChapter(i+1),400)})}],
   ['⏭️ Skip leg',()=>runChapter(i+1)],['Pause (Main menu)',menu]]);
}
/* 19 arrival */
function arrival(){
  const CH=chapters();
  say(`🏁 <b>UMEWASILI KISUMU, ${nick()}.</b>\n\nUmefanya safari kupitia stories za debt, public projects, road safety, jobs, services na historical experiences.\n\nHii ndiyo point ya muhimu: Kenya haibadilishwi na slogan moja. Inabadilishwa na choices, institutions, accountability na citizens wenye wanaelewa kile kinapendekezwa.\n\nSasa fungua Civic Invoice yako.`);
  chips([['🧾 Fungua Civic Invoice',()=>invoice(CH)]]);
}
function invoice(CH){
  const mins=Math.round(P.timeSec/60);const q=Object.values(P.quiz);
  say(`🧾 <b>CIVIC INVOICE YA SAFARI YAKO</b><div class="invoice">
<div><span>Chapters completed</span><span>${P.completed.length}/${CH.length}</span></div>
<div><span>Time spent</span><span>${mins} min</span></div>
<div><span>Topics explored</span><span>${P.topicsOpened.length}</span></div>
<div><span>Manifesto proposals viewed</span><span>${P.viewedProposals}</span></div>
<div><span>Quizzes right</span><span>${q.filter(Boolean).length}/${q.length}</span></div>
<div><span>Ground reports</span><span>${P.reports}</span></div>
<div><span>Kenya borrowed while you drove</span><span>${fmt(P.game.seconds*PER_SEC)}</span></div>
</div>Hii si bill ya kusema kila citizen anadaiwa exact amount fulani. Ni reminder ya shared public costs: debt, lost opportunities, weak services, unsafe roads na unresolved injustices.\n\nSasa chagua next step yako:`);
  chips([['Read full manifesto',library],['Compare policy proposals',library],['Register/check voter information',register],['Join campaign updates',()=>{P.optIn=true;save();say('Umejiunga na updates ✅. Unaweza kutoka wakati wowote na STOP.');menu()}],['Volunteer',volunteer],['Share the journey',()=>shareCard('Nimefanya safari ya Mombasa hadi Kisumu kwa The Route 2027. Njoo uone story ya Kenya, elewa cost yake, soma solutions, then decide mwenyewe.')],['Finish without joining',()=>{say('Asante kwa safari, '+nick()+'. Uko na choice. 🙏🏾 Tuma MENU wakati wowote.');chips([['Main menu',menu]])}]]);
}
function volunteer(){
  say('Asante kwa interest. Ku-volunteer ni <b>optional</b>, na tutakuongeza tu ukikubali wazi.\n\nUnakubali timu ikuwasiliane kuhusu volunteering?');
  chips([['Ndiyo, nakubali',()=>ask('Uko county / ward gani? (Usiweke namba ya simu hapa.)',t=>{P.volunteer={area:String(t).slice(0,60),at:Date.now()};P.county=P.county||String(t).slice(0,60);save();say('Fiti ✅. Coordinator wa area yako atakufikia kupitia chat hii.');menu()})],['Hapana, asante',menu]]);
}

/* 12 ground report */
function groundReport(next){
  next=next||menu;const r={};
  say('📍 <b>GROUND REPORT</b>\nKuna issue ya area yako unataka tujue? Unaweza ituma hapa.\n\n<b>Usiweke:</b>\n• ID number\n• phone numbers za watu wengine\n• passwords\n• allegations ambazo huwezi verify\n• information ya mtoto ama vulnerable person yenye inaweza kumidentify\n\nTutakuuliza maswali manne.');
  ask('<b>County / area:</b>',t=>{r.county=t;P.county=t;ask('<b>Issue:</b>',t=>{r.issue=t;ask('<b>Inaku-affect aje:</b>',t=>{r.impact=t;ask('<b>Unafikiri solution ni gani:</b>',async t=>{r.solution=t;
    const ref='R27-'+Math.random().toString(36).slice(2,7).toUpperCase();r.ref=ref;r.type='report';r.status='new';r.publicOk=null;
    const id=await addInbox(r);P.reports++;save();
    say(`Asante, <b>${nick()}</b>. Tumepokea report yako.\n\n<b>Reference:</b> <code>${ref}</code>\n\nHii report haimaanishi claim imethibitishwa. Team inaweza ku-review details na kukuuliza clarification bila kuhitaji jina yako.\n\nUnataka report yako itumike publicly ikiwa details zimetolewa identifying information?`);
    const setPub=v=>async()=>{await setInbox(id,{public_ok:v});say(v?'Sawa, itatumika baada ya anonymising.':'Sawa, itabaki private.');next()};
    chips([['Ndiyo, baada ya anonymising',setPub(true)],['Hapana, iwe private',setPub(false)],['Delete report',async()=>{await delInbox(id);P.reports=Math.max(0,P.reports-1);save();say('Report imefutwa.');next()}]]);
  })})})});
}

/* 13 main menu */
function menu(){
  if(P.consent!==true){welcome();return}
  const CH=chapters();const cur=CH[Math.min(P.chapter,CH.length-1)];
  say(`🧭 <b>MAIN MENU: THE ROUTE 2027</b>\nUko ${esc(cur?cur.town:'')}. Streak: 🔥 ${P.streak.n}`);
  chips([['Continue journey',()=>runChapter(P.chapter)],['Repeat last stage',()=>runChapter(Math.max(0,P.chapter))],['View manifesto responses',library],['Ground report',()=>groundReport()],['Fact-check a claim',factCheck],['My progress',progress],['✅ Task ya leo',dailyTask],['🏁 Free drive (leaderboard)',()=>{showTab('game');Game.free()}],['🗳️ Jiandikishe kura',register],['👥 Dream team',dream],['Privacy and data controls',dataControls],['Stop messages',stop]]);
}
/* 14 fact-check */
function factCheck(){
  say('🔎 <b>FACT-CHECK HUB</b>\nTuma claim unataka tu-check. Example:\n"Kenya debt ni KSh ___."\n"Accidents zinacost ___."\n"Sifuna promised ___."\n\nTutajaribu kukuonyesha: claim yenyewe, date, whether ni verified, disputed ama unclear, na distinction between fact and campaign opinion.\n\nTuma claim moja at a time.');
  ask(null,async t=>{
    const s=t.toLowerCase();let k=null;
    if(/deni|debt|loan|mkopo|trillion/.test(s))k='debt';else if(/ajali|accident|road|barabara|ntsa/.test(s))k='roads';else if(/sgr|reli|railway/.test(s))k='sgr';
    else if(/kura|vote|iebc|register/.test(s))k='voters';else if(/protest|maandamano|police|polisi/.test(s))k='life';else if(/land|shamba|ardhi/.test(s))k='land';else if(/wagalla|shifta/.test(s))k='north';else if(/kisumu|1969/.test(s))k='kisumu';
    await addInbox({type:'claim',text:t,status:'pending'});P.claims++;save();
    if(k){const f=FACTS[k];say(`<b>CLAIM:</b> ${esc(t)}\n<b>STATUS:</b> Related facts found, desk itathibitisha claim yako hasa\n<b>SOURCE:</b> ${esc(f.s)}\n<b>WHY:</b>${factHTML(f)}\n\n<b>Campaign position:</b> inaongezwa na timu.\n\nFact-check hii haimaanishi lazima ukubali campaign position. Unaweza compare na other sources.`)}
    else say(`<b>CLAIM:</b> ${esc(t)}\n<b>STATUS:</b> Not enough evidence bado\n\nDesk ya fact-check imepokea. Jibu kamili (verdict, source, date) litakuja hapa kwa chat.`);
    chips([['Claim nyingine',factCheck],['Main menu',menu]]);
  });
}
/* 15 manifesto library */
function library(){
  say('📚 <b>MANIFESTO LIBRARY</b>\nChagua topic:');
  chips(Object.keys(TOPICS).concat(Object.keys(OV.topics).filter(k=>!TOPICS[k])).map(k=>[topic(k).name,()=>topicCard(k,library)]).concat([['Main menu',menu]]));
}
function topicCard(k,back){
  const t=topic(k);if(!P.topicsOpened.includes(k)){P.topicsOpened.push(k);save()}
  say(`<b>${esc(String(t.name).toUpperCase())}: IN SHORT</b>\n<b>The problem:</b> ${esc(t.problem||'')}\n<b>Why it matters:</b> ${esc(t.why||'')}\n<b>Sifuna's proposal:</b>${proposalHTML(t)}\n\nNext:`);
  chips([['Watch explainer',()=>{say(t.videoUrl?`▶️ <video controls playsinline preload="none" src="${esc(t.videoUrl)}"></video>`:'▶️ Explainer video ya topic hii itawekwa na timu.');chips([['Back',back]])}],['Read full policy',()=>{say(t.full?esc(t.full):'Full policy document inaongezwa na timu ya Sifuna.');chips([['Back',back]])}],['Ask a question',()=>askQ(k,back)],['Back',back]]);
}
/* 16 progress */
function progress(){
  const CH=chapters();const q=Object.values(P.quiz);
  say(`📊 <b>YOUR ROUTE PROGRESS</b>\nCaptain: <b>${nick()}</b>\nVehicle: <b>${esc(VEH[P.vehicle]?VEH[P.vehicle].name:'-')}</b>\nChapters completed: <b>${P.completed.length}/${CH.length}</b>\nQuizzes completed: <b>${q.length}</b> (right: ${q.filter(Boolean).length})\nPolicy topics opened: <b>${P.topicsOpened.length}</b>\nGround reports: <b>${P.reports}</b>\nStreak: <b>🔥 ${P.streak.n}</b>\nFree drive best: <b>${P.game.best} m</b>\nTime on the route: <b>${Math.round(P.timeSec/60)} min</b>`);
  chips([['Continue journey',()=>runChapter(P.chapter)],['Main menu',menu]]);
}
/* 17 data controls */
function stop(){P.stop=true;save();say('Sawa. Ume-stop campaign messages. Hutapokea missions ama updates zingine kutoka kwa bot hii isipokuwa uanze tena mwenyewe.\n\nUkibadilisha mind, tuma <b>START</b>.\nFor privacy questions, tuma <b>PRIVACY</b>.');chips([])}
function dataControls(){say('Data controls:');chips([['Soma privacy',privacyInfo],['DELETE my data',del],['Stop messages',stop],['Main menu',menu]])}
function privacyInfo(){say('Short version: bot hii inalinda user-to-user visibility, lakini haiwezi promise anonymity ya 100% kwa sababu platforms, providers na authorised administrators wanaweza process technical data.');chips([['Main menu',menu]])}
async function wipeInbox(type){if(!uid)return;let q=sb.from('inbox').delete().eq('user_id',uid);if(type)q=q.eq('type',type);try{await q}catch(e){}}
function del(){
  say('Tumepokea request ya kufuta data yako.\nTafadhali chagua:');
  const done=()=>{say('Request yako imewekwa. Baadhi ya technical records zinaweza kubaki kwa providers kwa muda.');chips([['Main menu',menu]])};
  chips([['Delete game progress',()=>{const keep={nick:P.nick,consent:P.consent,lang:P.lang,vehicle:P.vehicle};P=Object.assign(DEF_P(),keep);save();done()}],
   ['Delete ground reports',async()=>{await wipeInbox('report');P.reports=0;save();done()}],
   ['Delete campaign tags',()=>{P.optIn=false;P.volunteer=null;save();done()}],
   ['Delete everything possible',async()=>{clearTimeout(saveT);dirty=false;if(uid){try{await sb.rpc('delete_me')}catch(e){}try{await sb.auth.signOut()}catch(e){}uid=null}local.del('r27_p');P=DEF_P();say('Data yako imefutwa. Tuma START ukitaka kuanza upya.');chips([])}]]);
}
/* 18 re-engagement */
function welcomeBack(){
  const CH=chapters();const cur=CH[Math.min(P.chapter,CH.length-1)];
  say(`<b>Ulipark wapi, ${nick()}?</b>\n\nSafari bado iko. Umefika <b>${esc(cur?cur.town:'')}</b>, na next stop iko ready.${P.streak.last!==today()?'\n\n✅ Task ya leo iko ready.':''}\n\nUnaweza:`);
  chips([['Continue',()=>runChapter(P.chapter)],['Replay last stage',()=>runChapter(P.chapter)],['View manifesto',library],['Task ya leo',dailyTask],['Pause updates',stop],['Main menu',menu]]);
}

/* daily tasks, register, dream, share */
function bumpStreak(){const d=today();if(P.streak.last===d)return;const y=new Date(Date.now()-864e5).toISOString().slice(0,10);P.streak={n:P.streak.last===y?P.streak.n+1:1,last:d};save()}
function dailyTask(){
  const T=tasks();if(!T.length){say('Hakuna task leo.');menu();return}
  const doy=Math.floor((Date.now()-new Date(new Date().getFullYear(),0,0))/864e5);const t=T[doy%T.length];
  const doneToday=P.tasksDone[today()];
  say(`✅ <b>TASK YA LEO: ${esc(t.title)}</b>\n${esc(t.body)}${doneToday?'\n\n<span class="fact">Umeshafanya task ya leo. Streak: 🔥 '+P.streak.n+'</span>':''}`);
  const finish=()=>{P.tasksDone[today()]=t.id;bumpStreak();save();say(`🔥 Task imekamilika! Streak: <b>${P.streak.n}</b>.`);chips([['Main menu',menu]])};
  const k=t.kind;
  if(k==='video')chips([['📁 Chagua video',()=>{$('#vid').onchange=e=>checkVideo(e,finish);$('#vid').click()}],['Baadaye',menu]]);
  else if(k==='share')chips([['Chagua fact ya ku-share',()=>{const keys=Object.keys(FACTS);const f=FACTS[keys[doy%keys.length]];say(factHTML(f)+`\n<a href="${SHARE(f.t+' (Chanzo: '+f.s+') The Route 2027')}" target="_blank" rel="noopener">Share kwa WhatsApp ↗</a>`);chips([['Nime-share na watatu',finish],['Baadaye',menu]])}],['Baadaye',menu]]);
  else if(k==='talk')chips([['Nimeongea na mtu',()=>{say('Sababu yake kubwa ilikuwa gani?');chips(['Hakuna maana','Sikuwa nimejiandikisha','Sikuwa nyumbani','Siamini system','Nyingine'].map(r=>[r,()=>{P.talks.push({r,at:Date.now()});finish()}]))}],['Baadaye',menu]]);
  else if(k==='report')chips([['Tuma report sasa',()=>groundReport(finish)],['Baadaye',menu]]);
  else if(k==='quiz')chips([['Anza quiz streak',()=>{const CH=chapters().filter(c=>c.quiz);let n=0,right=0;const go=()=>{if(n===3){say(`Umepata ${right}/3.`);if(right===3)finish();else chips([['Jaribu tena kesho',menu]]);return}const c=CH[Math.floor(Math.random()*CH.length)];n++;const q=c.quiz;say(`<b>Swali ${n}/3</b>\n${esc(q.q)}`);chips(q.o.map((o,j)=>[o,()=>{if(j===q.a){right++;say('✅')}else say('❌ Jibu: '+esc(q.o[q.a]));go()}]))};go()}],['Baadaye',menu]]);
  else chips([['Nimefanya',finish],['Baadaye',menu]]);
}
function checkVideo(e,finish){
  const f=e.target.files[0];if(!f)return;const v=document.createElement('video');v.preload='metadata';
  v.onloadedmetadata=()=>{const d=Math.round(v.duration);URL.revokeObjectURL(v.src);
    if(!isFinite(d)){say('Sikuweza kusoma urefu wa video hii. Jaribu nyingine.');return}
    if(d<15||d>45){say(`Video yako ni sekunde ${d}. Inafaa iwe kati ya 15 na 45.`);return}
    say(`Video ya sekunde ${d} imekubalika ✅ (prototype: haitumwi popote). I-post na <b>#Sifunated</b> ukipenda.`);finish()};
  v.onerror=()=>say('Faili hiyo haikufunguka kama video.');v.src=URL.createObjectURL(f);e.target.value='';
}
function register(){
  say('🗳️ <b>Jiandikishe / check voter information</b>\n1. Beba ID au passport yako.\n2. Tembelea ofisi ya IEBC ya constituency yako, ama kituo cha usajili wakati wa mass voter registration.\n3. Hakikisha usajili wako kupitia huduma za IEBC.\n\n<a href="https://www.iebc.or.ke" target="_blank" rel="noopener">iebc.or.ke ↗</a>'+factHTML(FACTS.voters));
  chips([['✅ Nimejiandikisha',()=>{P.registered=true;save();say('Fiti 💪🏾.');menu()}],['Bado',()=>{P.registered=false;save();menu()}]]);
}
const ROLES=['Treasury (Fedha)','Health (Afya)','Education (Elimu)','Interior (Usalama)','Lands (Ardhi)','Transport (Barabara)','Youth & Jobs'];
function dream(){
  say('👥 <b>THE DREAM TEAM</b>\nSifuna hawezi peke yake. Wewe ungependekeza nani kwa wizara gani? (Hii ni maoni ya players, si orodha rasmi.)');
  chips(ROLES.map(r=>[r,()=>ask(`Nani angefaa <b>${esc(r)}</b>?`,t=>{P.dream[r]=String(t).slice(0,40);save();say('Pick yako imehifadhiwa.\n\n'+Object.entries(P.dream).map(([a,b])=>'• '+esc(a)+': <b>'+esc(b)+'</b>').join('\n'));chips([['Ongeza mwingine',dream],['Main menu',menu]])})]).concat([['Main menu',menu]]));
}
function shareCard(text){say(`Hii ndiyo card yako:\n<span class="card">${esc(text)}</span>\nHauko obligated kushare.\n<a href="${SHARE(text)}" target="_blank" rel="noopener">Fungua WhatsApp ↗</a>`);chips([['Main menu',menu]])}
async function deliverAnswers(){
  if(!uid)return;try{const {data}=await sb.from('inbox').select('id,type,text,verdict,answer,source').eq('user_id',uid).not('answer','is',null).eq('seen',false);
    for(const x of data||[]){
      say(`🔎 <b>JIBU KUTOKA KWA DESK</b>\n<b>${x.type==='question'?'SWALI':'CLAIM'}:</b> ${esc(x.text)}\n${x.verdict?'<b>STATUS:</b> '+esc(x.verdict)+'\n':''}<b>WHY:</b> ${esc(x.answer)}${x.source?'\n<span class="fact">Chanzo: '+esc(x.source)+'</span>':''}`);
      await setInbox(x.id,{seen:true})}}catch(e){}
}

/* typed input */
$('#composer').onsubmit=e=>{e.preventDefault();const i=$('#msg');const t=i.value.trim();if(!t)return;i.value='';me(t);const U=t.toUpperCase();
  if(U==='STOP'){stop();return}if(U==='START'){P.stop=false;save();P.consent===true?menu():welcome();return}
  if(U==='MENU'){pending=null;menu();return}if(U==='DELETE'){del();return}if(U==='PRIVACY'){privacyInfo();return}
  if(U==='RESUME'){runChapter(P.chapter);return}if(U==='RESTART'){P.chapter=0;save();runChapter(0);return}
  if(U==='EXPLAIN'){say('Hakuna shida. Nitumie phrase ambayo haieleweki, timu ya lugha itaboresha. Kwa sasa: "Wazi?" = Is it clear? "Fiti" = Good. "Twende" = Let\'s go. "Ndai" = Gari.');return}
  if(pending){const fn=pending;pending=null;fn(t);return}
  const n=parseInt(t,10);if(n>0&&n<=lastChips.length){const c=lastChips[n-1];c[1]();return}
  if(P.stop){say('Messages ziko stopped. Tuma START kuendelea.');return}
  say('Sijaelewa hiyo 🙂 Chagua option, ama tuma MENU.');
};

/* time on route */
setInterval(()=>{if(!document.hidden&&P.consent===true){P.timeSec+=15;if(P.timeSec%120===0)save();else local.set('r27_p',P)}},15000);

/* ================= GAME ================= */
const Game=(()=>{
  const cv=$('#cv'),ctx=cv.getContext('2d'),ov=$('#ov');
  let W=600,H=260,GY=210,dpr=1;
  let mode='idle',st='idle',legIdx=0,legs=[],onDone=null,dist=0,t=0,borrowed=0,crashes=0,score=0,obs=[],coins=[],nextGap=400,nextCoin=300,scroll=0,last=0,shield=0,legLen=16000,speedBase=280;
  const car={x:70,y:0,vy:0,w:64,h:34,jumps:0};
  const SKY={coast:['#BFE3EE','#F6E6C8'],sgr:['#BFE3EE','#F3E2C4'],tsavo:['#E9D9B5','#F2C98E'],city:['#C7D3DA','#E7E1D6'],rift:['#BCD7E3','#E9E2CF'],tea:['#C9E2D6','#EEF0D9'],lake:['#F2C6A0','#F6E2C2']};
  const GROUND={coast:'#D9B57A',sgr:'#C47A45',tsavo:'#B5552E',city:'#8E8A80',rift:'#9C8F64',tea:'#4E7A3A',lake:'#7E8E5A'};
  function veh(){return P.vehicle||'ma3'}
  function resize(){const r=cv.getBoundingClientRect();if(!r.width)return;dpr=Math.min(2,window.devicePixelRatio||1);W=r.width;H=r.height;GY=H-46;cv.width=W*dpr;cv.height=H*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);car.w=veh()==='vitz'?52:64;car.y=Math.min(car.y||GY-car.h,GY-car.h);draw()}
  addEventListener('resize',resize);
  function overlay(h){ov.innerHTML=h;ov.hidden=false}
  function hideOv(){ov.hidden=true;ov.innerHTML=''}
  function scene(){if(mode==='free'){const CH=chapters();return(CH[Math.floor(dist/6000)%CH.length]||{}).scene||'coast'}return (legs[legIdx+1]||{}).scene||'coast'}
  function danger(){return mode==='leg'&&(legs[legIdx+1]||{}).danger}
  function speed(){const v=veh()==='subaru'?1.15:veh()==='vitz'?1.05:1;const ramp=mode==='free'?Math.min(260,dist/120):legIdx*10+dist/legLen*40;return (speedBase+ramp+(danger()?45:0))*v}
  function reset(){dist=0;t=0;borrowed=0;crashes=0;score=0;obs=[];coins=[];nextGap=500;nextCoin=300;car.y=GY-car.h;car.vy=0;car.jumps=0;shield=veh()==='ma3'?1:0}
  function hud(){
    $('#tick').textContent=fmt(borrowed);$('#score').textContent=score;
    const s=Math.floor(t);$('#clock').textContent=Math.floor(s/60)+':'+String(s%60).padStart(2,'0');$('#crashes').textContent=crashes;
    if(mode==='leg'){$('#prog').style.width=Math.min(100,dist/legLen*100).toFixed(1)+'%';$('#from').textContent=legs[legIdx].town;$('#to').textContent=legs[legIdx+1].town;$('#legname').textContent='Leg '+(legIdx+1)}
    else{$('#prog').style.width=Math.min(100,(dist%6000)/60).toFixed(1)+'%';$('#from').textContent='Free drive';$('#legname').textContent=Math.floor(dist/10)+' m';$('#to').textContent='Best '+P.game.best+' m'}
  }
  function idleScreen(){
    mode='idle';st='idle';reset();hud();draw();
    const CH=chapters();const i=Math.min(P.chapter,CH.length-2);
    overlay(`<div class="sheet"><div class="eyebrow">Drive</div><h2>Mombasa → Kisumu</h2>
      <p>Legs za safari zinafunguliwa kutoka kwa bot, kila baada ya stage. Free drive ni endless, kwa leaderboard.</p>
      <p class="src">Ticker inahesabu kile Kenya inakopa ukiendesha, kwa kasi ya Jan–Apr 2026 (karibu KSh 3.5 billion kwa siku).</p>
      <div class="row"><button class="btn" id="g-free">Free drive</button>${P.consent===true?`<button class="btn ghost" id="g-leg">Leg ${i+1}: ${esc(CH[i].town)} → ${esc(CH[i+1].town)}</button>`:''}</div></div>`);
    $('#g-free').onclick=free;const l=$('#g-leg');if(l)l.onclick=()=>playLeg(i,CH,res=>{showTab('bot');me('🏁 Nimefika '+CH[i+1].town);say(`Fiti! Umefika <b>${esc(CH[i+1].town)}</b> (${res.time}, crashes ${res.crashes}).`);setTimeout(()=>runChapter(i+1),400)});
  }
  function playLeg(i,CH,cb){st='idle';loopId++;legs=CH;legIdx=i;onDone=cb;mode='leg';resize();reset();legLen=14000+i*900;hud();
    const v=VEH[veh()];
    overlay(`<div class="sheet${legs[i+1].danger?' danger':''}"><div class="eyebrow">Leg ${i+1} of ${CH.length-1} · ${v?v.emoji+' '+v.name:''}</div><h2>${esc(CH[i].town)} → ${esc(CH[i+1].town)}</h2>
      <p>Tap ama Space kuruka.${veh()==='subaru'?' Subaru inaweza kuruka mara mbili hewani.':''}${veh()==='ma3'?' Ma3 inahimili kugonga mara moja.':''} Okota sarafu 🪙 kwa score.</p>
      ${legs[i+1].danger?'<p><b>Onyo:</b> hii ni blackspot leg. Lorries zaidi.</p>':''}
      <div class="row"><button class="btn" id="go">Twende</button></div></div>`);$('#go').onclick=()=>{hideOv();run()};$('#go').focus()}
  function free(){st='idle';loopId++;mode='free';resize();reset();hideOv();run()}
  let loopId=0;
  function run(){st='run';last=performance.now();const id=++loopId;const step=n=>{if(id!==loopId)return;loop(n,step)};requestAnimationFrame(step)}
  function pause(){if(st==='run')st='paused'}
  function resume(){if(st==='paused'&&ov.hidden)run()}
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();else if(!$('#p-game').hidden)resume()});
  function jump(){if(st!=='run')return;const ground=car.y>=GY-car.h-1;const maxJ=veh()==='subaru'?2:1;if(ground)car.jumps=0;if(car.jumps<maxJ){car.vy=veh()==='subaru'?-680:-640;car.jumps++}}
  cv.addEventListener('pointerdown',e=>{e.preventDefault();jump()});
  addEventListener('keydown',e=>{if($('#p-game').hidden)return;if((e.code==='Space'||e.code==='ArrowUp')&&st==='run'){e.preventDefault();jump()}});
  function spawn(){
    const r=Math.random(),dg=danger();let o;
    if(r<0.28)o={k:'pot',w:46,h:8};else if(r<0.5)o={k:'cone',w:30,h:30};else if(r<0.62)o={k:'bump',w:60,h:12};
    else if(r<(dg?0.95:0.84))o={k:'lorry',w:80,h:46};else o={k:'boda',w:40,h:36,extra:120};
    o.x=W+20;obs.push(o);const s=speed()/280;nextGap=(dg?220:290)*s+Math.random()*260*s;
  }
  function loop(now,step){
    if(st!=='run')return;
    const dt=Math.min(0.033,(now-last)/1000);last=now;const v=speed();
    t+=dt;borrowed+=PER_SEC*dt;dist+=v*dt;scroll+=v*dt;
    car.vy+=1900*dt;car.y+=car.vy*dt;if(car.y>GY-car.h){car.y=GY-car.h;car.vy=0;car.jumps=0}
    nextGap-=v*dt;if(nextGap<=0&&(mode==='free'||dist<legLen-600))spawn();
    nextCoin-=v*dt;if(nextCoin<=0){coins.push({x:W+20,y:GY-40-Math.random()*70});nextCoin=180+Math.random()*320}
    for(const o of obs)o.x-=(v+(o.extra||0))*dt;for(const c of coins)c.x-=v*dt;
    obs=obs.filter(o=>o.x+o.w>-20);coins=coins.filter(c=>c.x>-20&&!c.got);
    const cx=car.x+8,cw=car.w-16,cy=car.y+6,ch=car.h-6;
    for(const c of coins){if(c.x>cx-8&&c.x<cx+cw+8&&c.y>cy-10&&c.y<cy+ch+10){c.got=true;score+=10}}
    for(const o of obs){const oy=GY-o.h;if(!o.hit&&cx<o.x+o.w-6&&cx+cw>o.x+6&&cy+ch>oy+2){
      if(shield>0){shield--;o.hit=true;toast('Ma3 imehimili 💪🏾');continue}crash(o);return}}
    if(mode==='leg'&&dist>=legLen){finishLeg();return}
    hud();draw();requestAnimationFrame(step);
  }
  function crash(o){
    st='crash';crashes++;hud();draw(true);
    const what={pot:'pothole',cone:'roadblock',lorry:'lorry',boda:'boda boda',bump:'bump bila alama'}[o.k];
    const fr=FACTS.roads;
    if(mode==='free'){const m=Math.floor(dist/10);P.game.runs++;P.game.seconds+=Math.floor(t);const nb=m>P.game.best;if(nb)P.game.best=m;save();postBoard();
      overlay(`<div class="sheet danger"><div class="eyebrow">Free drive · ${m} m</div><h2>💥 Umegonga ${esc(what)}</h2><p>${esc(fr.t)}</p><p class="src">Chanzo: ${esc(fr.s)}</p>
      <div class="invoice"><div><span>Distance</span><span>${m} m</span></div><div><span>Score</span><span>${score}</span></div><div><span>Best</span><span>${P.game.best} m${nb?' 🆕':''}</span></div><div><span>Kenya borrowed meanwhile</span><span>${fmt(borrowed)}</span></div></div>
      <div class="row"><button class="btn" id="again">Endesha tena</button><a class="btn ghost" href="${SHARE(`Nimeendesha ${m} m kwa The Route 2027 bila kugonga. Unaweza kunipita?`)}" target="_blank" rel="noopener">Challenge marafiki ↗</a></div></div>`);
      $('#again').onclick=free;loadBoard();return}
    overlay(`<div class="sheet danger"><div class="eyebrow">Crash near ${esc(legs[legIdx+1].town)}</div><h2>💥 Game over, maze</h2>
      <p>Umegonga ${esc(what)}. ${esc(danger()?FACTS.roads.t:'Kila siku, karibu Wakenya 12 hufa barabarani.')}</p><p class="src">Chanzo: NTSA</p>
      <div class="row"><button class="btn" id="re">Respawn</button><button class="btn ghost" id="lis">Sikiliza suluhisho</button></div></div>`);
    const respawn=()=>{dist=Math.max(0,dist-1400);obs=[];nextGap=500;car.y=GY-car.h;car.vy=0;shield=veh()==='ma3'?1:0;hideOv();run()};
    $('#re').onclick=respawn;$('#re').focus();
    $('#lis').onclick=()=>{const tp=topic('roads');overlay(`<div class="sheet"><div class="eyebrow">Road safety</div><h2>Response ya Sifuna</h2>${tp.proposal?'<p>'+esc(tp.proposal)+'</p>':'<p>Timu ya Sifuna inaandaa mpango wa road safety. Utaonekana hapa.</p>'}<div class="row"><button class="btn" id="re2">Respawn</button></div></div>`);$('#re2').onclick=respawn};
  }
  function finishLeg(){
    st='done';P.game.legs++;P.game.seconds+=Math.floor(t);save();
    const s=Math.floor(t),mm=Math.floor(s/60)+':'+String(s%60).padStart(2,'0');
    overlay(`<div class="sheet"><div class="eyebrow">Leg ${legIdx+1} complete</div><h2>Umefika ${esc(legs[legIdx+1].town)}</h2>
      <div class="invoice"><div><span>Time</span><span>${mm}</span></div><div><span>Score</span><span>${score}</span></div><div><span>Crashes</span><span>${crashes}</span></div><div><span>Kenya borrowed meanwhile</span><span>${fmt(borrowed)}</span></div></div>
      <div class="row"><button class="btn" id="nx">Endelea na story →</button></div></div>`);
    $('#nx').onclick=()=>{hideOv();const cb=onDone;onDone=null;mode='idle';cb&&cb({time:mm,crashes,score})};$('#nx').focus();
  }
  async function postBoard(){if(!await ensureAuth())return;try{await sb.from('leaderboard').upsert({user_id:uid,nick:P.nick||'Anonymous',best:P.game.best,updated_at:new Date().toISOString()})}catch(e){}}
  async function loadBoard(){
    const el=$('#board');
    try{const {data,error}=await sb.from('leaderboard').select('nick,best').order('best',{ascending:false}).limit(10);if(error)throw error;
      el.innerHTML='🏆 <b>Free drive leaderboard</b>'+(!data||!data.length?'<div>Bado hakuna. Kuwa wa kwanza!</div>':'<ol>'+data.map(x=>`<li>${esc(x.nick)}: ${Number(x.best)||0} m</li>`).join('')+'</ol>')}catch(e){el.textContent='Leaderboard haipatikani sasa.'}
  }
  function rr(x,y,w,h,r){ctx.beginPath();ctx.roundRect?ctx.roundRect(x,y,w,h,r):ctx.rect(x,y,w,h);ctx.fill()}
  function draw(hit){
    const sc=scene(),[a,b]=SKY[sc]||SKY.coast;
    const g=ctx.createLinearGradient(0,0,0,GY);g.addColorStop(0,a);g.addColorStop(1,b);ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
    const p=scroll*0.25,m=scroll*0.5;
    if(sc==='rift'||sc==='tea'){ctx.fillStyle='#8FA7A8';ctx.beginPath();ctx.moveTo(0,GY-40);for(let x=0;x<=W;x+=20)ctx.lineTo(x,GY-60-30*Math.sin((x+p)/90)-14*Math.sin((x+p)/37));ctx.lineTo(W,GY);ctx.lineTo(0,GY);ctx.fill()}
    if(sc==='city'){ctx.fillStyle='#7E8B93';for(let i=0;i<14;i++){const x=((i*70-p)%(W+140)+W+140)%(W+140)-70,h=40+((i*53)%90);ctx.fillRect(x,GY-30-h,46,h+30)}}
    if(sc==='lake'){ctx.fillStyle='#6FA3BC';ctx.fillRect(0,GY-34,W,20);ctx.fillStyle='#E9A35E';ctx.beginPath();ctx.arc(W*0.7,GY-60,22,0,7);ctx.fill()}
    if(sc==='coast'){for(let i=0;i<7;i++){const x=((i*170-m)%(W+170)+W+170)%(W+170)-85;ctx.strokeStyle='#6B4F2A';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(x,GY);ctx.quadraticCurveTo(x+8,GY-40,x+4,GY-70);ctx.stroke();ctx.fillStyle='#3E7A3A';for(let k=0;k<5;k++){ctx.beginPath();ctx.ellipse(x+4+Math.cos(k*1.3)*16,GY-72+Math.sin(k*1.3)*6,18,5,k*1.3,0,7);ctx.fill()}}}
    if(sc==='sgr'||sc==='coast'){ctx.fillStyle='#A9A49A';ctx.fillRect(0,GY-82,W,8);for(let x=-(m%110);x<W;x+=110)ctx.fillRect(x+40,GY-74,10,74)}
    if(sc==='tsavo'){for(let i=0;i<8;i++){const x=((i*150-m)%(W+150)+W+150)%(W+150)-75;ctx.fillStyle='#5C4A2E';ctx.fillRect(x,GY-46,4,46);ctx.fillStyle='#6E7D3A';ctx.beginPath();ctx.ellipse(x+2,GY-50,34,8,0,0,7);ctx.fill()}}
    if(sc==='tea'){ctx.fillStyle='#3F6E31';for(let r=0;r<3;r++)for(let x=-(m%40)-40;x<W+40;x+=40){ctx.beginPath();ctx.arc(x+r*20,GY-10-r*12,14,Math.PI,0);ctx.fill()}}
    ctx.fillStyle=GROUND[sc]||'#999';ctx.fillRect(0,GY,W,H-GY);
    ctx.fillStyle='#2E3236';ctx.fillRect(0,GY,W,34);
    ctx.fillStyle='#F2B705';for(let x=-(scroll%60);x<W;x+=60)ctx.fillRect(x,GY+16,30,3);
    for(const c of coins){ctx.fillStyle='#E0A800';ctx.beginPath();ctx.arc(c.x,c.y,8,0,7);ctx.fill();ctx.fillStyle='#FFF3B0';ctx.fillRect(c.x-1,c.y-4,2,8)}
    for(const o of obs){const y=GY-o.h;
      if(o.k==='pot'){ctx.fillStyle='#15171A';ctx.beginPath();ctx.ellipse(o.x+o.w/2,GY+4,o.w/2,6,0,0,7);ctx.fill()}
      else if(o.k==='bump'){ctx.fillStyle='#4A4D50';ctx.beginPath();ctx.ellipse(o.x+o.w/2,GY,o.w/2,o.h,0,Math.PI,0);ctx.fill()}
      else if(o.k==='cone'){ctx.fillStyle='#E4572E';ctx.beginPath();ctx.moveTo(o.x+o.w/2,y);ctx.lineTo(o.x+o.w,GY);ctx.lineTo(o.x,GY);ctx.fill();ctx.fillStyle='#fff';ctx.fillRect(o.x+8,y+14,o.w-16,4)}
      else if(o.k==='lorry'){ctx.fillStyle='#3B5B7A';rr(o.x,y,o.w-20,o.h-6,3);ctx.fillStyle='#D9C27A';rr(o.x+o.w-22,y+12,22,o.h-18,3);ctx.fillStyle='#15171A';ctx.beginPath();ctx.arc(o.x+14,GY-4,7,0,7);ctx.arc(o.x+o.w-12,GY-4,7,0,7);ctx.fill()}
      else{ctx.fillStyle='#15171A';ctx.beginPath();ctx.arc(o.x+8,GY-6,6,0,7);ctx.arc(o.x+o.w-8,GY-6,6,0,7);ctx.fill();ctx.fillStyle='#C8102E';ctx.fillRect(o.x+6,GY-20,o.w-12,8);ctx.fillStyle='#F2B705';ctx.beginPath();ctx.arc(o.x+o.w/2,y+6,7,0,7);ctx.fill()}}
    const x=car.x,y=car.y,vk=veh(),cw=car.w;
    const body=hit?'#C8102E':vk==='subaru'?'#2B4FA0':vk==='vitz'?'#E9E6DF':'#F2B705';
    ctx.fillStyle=body;rr(x,y,cw,car.h-6,vk==='ma3'?6:10);
    ctx.fillStyle=vk==='ma3'?'#C8102E':'#15181A';ctx.fillRect(x,y+16,cw,4);
    if(vk==='ma3'){ctx.fillStyle='#15181A';ctx.fillRect(x+4,y-4,cw-12,4)}
    ctx.fillStyle='#BFDCE6';const wn=vk==='ma3'?4:2;for(let i=0;i<wn;i++)ctx.fillRect(x+6+i*((cw-12)/wn),y+4,(cw-12)/wn-3,9);
    ctx.fillStyle='#15171A';ctx.beginPath();ctx.arc(x+13,y+car.h-4,7,0,7);ctx.arc(x+cw-13,y+car.h-4,7,0,7);ctx.fill();
    if(shield>0){ctx.strokeStyle='rgba(242,183,5,.8)';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(x+cw/2,y+car.h/2,cw/2+8,car.h/2+8,0,0,7);ctx.stroke()}
    if(mode==='leg'&&st==='run'){const left=legLen-dist;if(left<W){const sx=car.x+left;ctx.fillStyle='#1E5F3A';rr(sx,GY-74,96,26,3);ctx.fillStyle='#fff';ctx.fillRect(sx+44,GY-48,4,48);ctx.font='700 13px Archivo, sans-serif';ctx.fillText(String(legs[legIdx+1].town).toUpperCase().slice(0,12),sx+8,GY-56)}}
  }
  function ready(){resize();loadBoard();if(st==='paused'){resume();return}if(mode==='idle'||st==='idle'||st==='done')idleScreen()}
  return {resize,ready,pause,playLeg,free};
})();

/* ================= TABS ================= */
function showTab(w){const bot=w==='bot';$('#tab-bot').setAttribute('aria-selected',bot);$('#tab-game').setAttribute('aria-selected',!bot);$('#p-bot').hidden=!bot;$('#p-game').hidden=bot;if(!bot)Game.ready();else Game.pause()}
$('#tab-bot').onclick=()=>showTab('bot');$('#tab-game').onclick=()=>showTab('game');

/* election countdown: polls open 6am EAT, Tuesday 10 August 2027 (IEBC gazette) */
(function(){const T=Date.parse('2027-08-10T06:00:00+03:00'),END=Date.parse('2027-08-10T17:00:00+03:00');const g=id=>document.getElementById(id);if(!g('cd-d'))return;
 const tick=()=>{const now=Date.now();if(now>=T){const lbl=document.querySelector('#countdown .lbl');lbl.innerHTML=now<END?'Leo ni siku ya kura! 🗳️<small>Vituo vinafunga saa kumi na moja jioni</small>':'Uchaguzi Mkuu 2027 umefanyika<small>10 August 2027</small>';document.querySelector('#countdown .clk').hidden=true;return}
  let s=Math.floor((T-now)/1000);const d=Math.floor(s/86400);s%=86400;const h=Math.floor(s/3600);s%=3600;const m=Math.floor(s/60);s%=60;
  g('cd-d').textContent=d;g('cd-h').textContent=String(h).padStart(2,'0');g('cd-m').textContent=String(m).padStart(2,'0');g('cd-s').textContent=String(s).padStart(2,'0')};
 tick();setInterval(tick,1000)})();
/* ================= BOOT ================= */
async function loadOverrides(){
  try{const {data}=await sb.from('content').select('kind,id,data');(data||[]).forEach(r=>{const k=r.kind==='chapter'?'chapters':r.kind==='task'?'tasks':'topics';OV[k][r.id]=r.data||{}})}catch(e){}
}
async function boot(){
  try{const {data}=await sb.auth.getSession();if(data.session){uid=data.session.user.id;
    const r=await sb.from('player_state').select('state').eq('user_id',uid).maybeSingle();
    if(r.data&&r.data.state&&(r.data.state.updated||0)>=(P.updated||0))P=Object.assign(DEF_P(),r.data.state);lastNick=P.nick}}catch(e){}
  await loadOverrides();
}
function start(){
  if(P.consent===true&&!P.stop&&P.nick){welcomeBack()}else if(P.stop){say('Messages ziko stopped. Tuma START kuendelea.')}else welcome();
}
const ready=boot();
Promise.race([ready,new Promise(r=>setTimeout(r,2500))]).then(()=>{start();ready.then(()=>deliverAnswers())});
setInterval(()=>{if(!document.hidden)deliverAnswers()},60000);
addEventListener('pagehide',()=>{if(dirty)flush()});
})();
