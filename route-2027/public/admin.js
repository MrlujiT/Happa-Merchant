(function(){
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function toast(t){const d=document.createElement('div');d.className='toast';d.textContent=t;document.body.appendChild(d);setTimeout(()=>d.remove(),2400)}
const sb=window.supabase.createClient(window.R27.url,window.R27.key,{auth:{persistSession:true,autoRefreshToken:true}});
const ROLE_NAMES={coordinator:'County coordinator',factdesk:'Fact-check desk',editor:'Content editor',admin:'Campaign admin',superadmin:'Superadmin'};
const VIEWS=[
 ['overview','Overview',['editor','admin','superadmin']],
 ['reports','Reports',['coordinator','factdesk','editor','admin','superadmin']],
 ['inbox','Fact-checks',['factdesk','editor','admin','superadmin']],
 ['volunteers','Volunteers',['coordinator','admin','superadmin']],
 ['story','Storylines',['editor','admin','superadmin']],
 ['tasks','Tasks',['editor','admin','superadmin']],
 ['manifesto','Manifesto',['editor','admin','superadmin']],
 ['team','Team',['admin','superadmin']],
 ['account','My account',['coordinator','factdesk','editor','admin','superadmin']]
];
let me=null,view=null,data={players:[],inbox:[],team:[]};
let OV={chapters:{},tasks:{},topics:{}};
const el=$('#dash');

/* ---------- auth ---------- */
$('#tosignup').onclick=e=>{e.preventDefault();$('#loginf').hidden=true;$('#signupf').hidden=false};
$('#tologin').onclick=e=>{e.preventDefault();$('#loginf').hidden=false;$('#signupf').hidden=true};
$('#loginf').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.target);$('#loginmsg').textContent='Signing in…';
  const {error}=await sb.auth.signInWithPassword({email:fd.get('email'),password:fd.get('password')});
  if(error){$('#loginmsg').textContent='Sign-in failed: check the email and password.';return}start()};
$('#signupf').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.target);
  const {error}=await sb.auth.signUp({email:fd.get('email'),password:fd.get('password')});
  $('#signupmsg').textContent=error?error.message:'Account created. Confirm the email Supabase sends you, then ask Claude to promote it to superadmin.'};
$('#signout').onclick=async()=>{await sb.auth.signOut();location.reload()};
if(window.R27_DEMO){$('#loginmsg').textContent='Demo mode: sign in with any email and password. You will see the data from this phone only.'}

async function start(){
  const {data:{session}}=await sb.auth.getSession();if(!session)return;
  const {data:p}=await sb.from('profiles').select('id,role,county,display_name').eq('id',session.user.id).maybeSingle();
  $('#signout').hidden=false;
  if(!p||p.role==='player'){$('#loginf').innerHTML='<h3>No team access</h3><p class="src">This account is signed in but has no team role. Ask the campaign admin to add you.</p>';return}
  me=Object.assign({email:session.user.email},p);
  $('#who').textContent=(me.display_name||me.email)+' · '+ROLE_NAMES[me.role]+(me.county?' · '+me.county:'');
  $('#auth').hidden=true;$('#main').hidden=false;
  const allowed=VIEWS.filter(v=>v[2].includes(me.role));
  $('#dtabs').innerHTML=allowed.map((v,i)=>`<button data-v="${v[0]}" aria-selected="${i===0}">${v[1]}</button>`).join('');
  $('#dtabs').querySelectorAll('button').forEach(b=>b.onclick=()=>{view=b.dataset.v;$('#dtabs').querySelectorAll('button').forEach(x=>x.setAttribute('aria-selected',x===b));render()});
  view=allowed[0][0];await load();render();
}

/* ---------- data ---------- */
async function load(){
  el.innerHTML='<div class="empty">Loading…</div>';
  const can=r=>r.includes(me.role);
  const jobs=[];
  jobs.push(sb.from('content').select('kind,id,data').then(({data:d})=>{OV={chapters:{},tasks:{},topics:{}};(d||[]).forEach(r=>{OV[r.kind==='chapter'?'chapters':r.kind==='task'?'tasks':'topics'][r.id]=r.data||{}})}));
  if(can(['coordinator','editor','admin','superadmin']))jobs.push(sb.from('player_state').select('state,county,updated_at').order('updated_at',{ascending:false}).limit(10000).then(({data:d})=>{data.players=(d||[]).map(r=>Object.assign({},r.state,{_county:r.county,_updated:r.updated_at}))}));
  if(can(['coordinator','factdesk','editor','admin','superadmin']))jobs.push(sb.from('inbox').select('*').order('created_at',{ascending:false}).limit(3000).then(({data:d})=>{data.inbox=d||[]}));
  if(can(['admin','superadmin']))jobs.push(sb.from('profiles').select('id,role,county,display_name,created_at').neq('role','player').order('created_at').then(({data:d})=>{data.team=d||[]}));
  await Promise.all(jobs);
}
function chapters(){return CHAPTERS.concat(Object.values(OV.chapters).filter(c=>!CHAPTERS.find(b=>b.id===c.id))).map(c=>Object.assign({},c,OV.chapters[c.id]||{})).sort((a,b)=>(a.order||0)-(b.order||0))}
function tasksAll(){return TASKS.concat(Object.values(OV.tasks).filter(t=>!TASKS.find(b=>b.id===t.id))).map(t=>Object.assign({},t,OV.tasks[t.id]||{})).sort((a,b)=>(a.order||0)-(b.order||0))}
function topic(k){return Object.assign({},TOPICS[k]||{name:k},OV.topics[k]||{})}
function topicKeys(){return Object.keys(TOPICS).concat(Object.keys(OV.topics).filter(k=>!TOPICS[k]))}
function factOf(c){if(c.factText)return{t:c.factText,s:c.factSource||''};return c.fact&&FACTS[c.fact]?FACTS[c.fact]:null}
async function saveContent(kind,id,obj){const {error}=await sb.from('content').upsert({kind,id,data:obj,updated_at:new Date().toISOString()});if(error)throw error}
function csv(rows,name){
  if(!rows.length){toast('Nothing to export');return}
  const cols=Object.keys(rows[0]);const q=v=>'"'+String(v==null?'':v).replace(/"/g,'""')+'"';
  const blob=new Blob([[cols.join(','),...rows.map(r=>cols.map(c=>q(r[c])).join(','))].join('\n')],{type:'text/csv'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000);
}
const when=d=>new Date(d||0).toLocaleString('en-KE',{dateStyle:'medium',timeStyle:'short'});
const bars=obj=>{const e=Object.entries(obj).sort((a,b)=>b[1]-a[1]).slice(0,25);const mx=Math.max(1,...e.map(x=>x[1]));return e.length?e.map(([k,v])=>`<div class="hbar"><span>${esc(k)}</span><span class="track"><i style="width:${(v/mx*100).toFixed(0)}%"></i></span><span class="v">${v}</span></div>`).join(''):'<div class="empty">No data yet.</div>'};
function count(arr,f){const o={};arr.forEach(x=>{const k=f(x);if(k!=null&&k!=='')o[k]=(o[k]||0)+1});return o}

/* ---------- views ---------- */
function overview(){
  const P2=data.players,CH=chapters().filter(c=>!c.hidden);const consented=P2.filter(p=>p.consent===true);
  const q=P2.flatMap(p=>Object.values(p.quiz||{}));const mins=Math.round(P2.reduce((s,p)=>s+(p.timeSec||0),0)/60);
  const day=Date.now()-864e5,week=Date.now()-7*864e5;
  const active1=P2.filter(p=>(p.updated||0)>day).length,active7=P2.filter(p=>(p.updated||0)>week).length;
  const funnel={};CH.forEach((c,i)=>funnel[(i+1)+'. '+c.town]=P2.filter(p=>(p.completed||[]).includes(c.id)).length);
  let polls='';CH.filter(c=>c.poll).forEach(c=>{const o=count(P2,p=>(p.polls||{})[c.id]);if(Object.keys(o).length)polls+=`<div class="item"><b>${esc(c.poll.q)}</b>${bars(o)}</div>`});
  const dreamT={};P2.forEach(p=>Object.entries(p.dream||{}).forEach(([r,n])=>{const k=r+': '+String(n).trim();dreamT[k]=(dreamT[k]||0)+1}));
  el.innerHTML=`<div class="stats">
    <div class="stat"><b>${P2.length}</b><span>Players</span></div>
    <div class="stat"><b>${active1}</b><span>Active today</span></div>
    <div class="stat"><b>${active7}</b><span>Active this week</span></div>
    <div class="stat"><b>${consented.length?Math.round(mins/consented.length):0}</b><span>Avg minutes / player</span></div>
    <div class="stat"><b>${q.length?Math.round(q.filter(Boolean).length/q.length*100):0}%</b><span>Quiz accuracy</span></div>
    <div class="stat"><b>${P2.filter(p=>p.registered===true).length}</b><span>Say they're registered</span></div>
    <div class="stat"><b>${data.inbox.filter(x=>x.type==='report').length}</b><span>Ground reports</span></div>
    <div class="stat"><b>${data.inbox.filter(x=>x.type!=='report'&&!x.answer).length}</b><span>Unanswered</span></div>
    <div class="stat"><b>${P2.filter(p=>p.optIn).length}</b><span>Opted into updates</span></div>
    <div class="stat"><b>${P2.filter(p=>p.volunteer).length}</b><span>Volunteers</span></div>
  </div>
  <div class="sec"><h3>Where players are (stage completed)</h3>${bars(funnel)}</div>
  <div class="sec"><h3>Why people didn't vote</h3>${bars(count(P2.flatMap(p=>p.talks||[]),x=>x.r))}</div>
  <div class="sec"><h3>Polls</h3>${polls||'<div class="empty">No poll answers yet.</div>'}</div>
  <div class="split"><div class="sec"><h3>Vehicle</h3>${bars(count(P2,p=>p.vehicle))}</div><div class="sec"><h3>Language</h3>${bars(count(P2,p=>p.lang))}</div></div>
  <div class="sec"><h3>Ground reports by area</h3>${bars(count(data.inbox.filter(x=>x.type==='report'),x=>String(x.county||'').split(',').pop().trim()))}</div>
  <div class="sec"><h3>Dream team nominations</h3>${bars(dreamT)}</div>
  <div class="row"><button class="btn ghost sm" id="rf">Refresh</button></div>`;
  $('#rf').onclick=async()=>{await load();render()};
}
function reports(){
  const R=data.inbox.filter(x=>x.type==='report');
  el.innerHTML=`<div class="sec"><h3>Ground reports${me.role==='coordinator'?' · '+esc(me.county):''}</h3>
   <div class="row"><button class="btn ghost sm" id="exp">Export CSV</button><button class="btn ghost sm" id="rf">Refresh</button></div>`+(R.length?R.map(r=>`<div class="item"><div class="meta">${esc(r.ref)} · ${esc(r.nick)} · ${when(r.created_at)} · <span class="pill ${r.status==='new'?'new':r.status==='rejected'?'mid':'ok'}">${esc(r.status)}</span> ${r.public_ok===true?'<span class="pill ok">Public OK</span>':r.public_ok===false?'<span class="pill mid">Private</span>':''}</div>
    <div><b>${esc(r.county)}</b>: ${esc(r.issue)}</div><div class="meta">Impact: ${esc(r.impact)}</div><div class="meta">Solution: ${esc(r.solution)}</div>
    <div class="row">${['verified','published','rejected'].map(s=>`<button class="btn sm ${r.status===s?'':'ghost'}" data-i="${esc(r.id)}" data-s="${s}" ${s==='published'&&r.public_ok!==true?'disabled title="Player did not allow public use"':''}>${s}</button>`).join('')}</div></div>`).join(''):'<div class="empty">No reports yet. They appear here as players send them.</div>')+'</div>';
  el.querySelectorAll('[data-s]').forEach(b=>b.onclick=async()=>{const {error}=await sb.from('inbox').update({status:b.dataset.s}).eq('id',b.dataset.i);if(error){toast('Could not save');return}data.inbox.find(x=>x.id===b.dataset.i).status=b.dataset.s;toast('Status updated');reports()});
  $('#exp').onclick=()=>csv(R.map(r=>({ref:r.ref,date:r.created_at,area:r.county,issue:r.issue,impact:r.impact,solution:r.solution,status:r.status,public_ok:r.public_ok})),'route2027-reports.csv');
  $('#rf').onclick=async()=>{await load();render()};
}
function inbox(){
  const I=data.inbox.filter(x=>x.type!=='report').sort((a,b)=>(!!a.answer)-(!!b.answer)||new Date(b.created_at)-new Date(a.created_at));
  el.innerHTML='<div class="sec"><h3>Fact-checks and questions</h3><p class="src">Answers are delivered into the player\'s chat the next time they open the app.</p>'+(I.length?I.map(r=>`<div class="item"><div class="meta">${r.type==='claim'?'Claim':'Question'}${r.topic?' · '+esc(topic(r.topic).name):''} · ${esc(r.nick)} · ${when(r.created_at)} · <span class="pill ${r.answer?'ok':'new'}">${r.answer?(r.seen?'Delivered':'Answered'):'Pending'}</span></div>
    <div><b>${esc(r.text)}</b></div>
    <form class="form" data-i="${esc(r.id)}">
      ${r.type==='claim'?`<label>Status<select name="verdict">${['Verified','Partly verified','Disputed','Not enough evidence'].map(v=>`<option ${r.verdict===v?'selected':''}>${v}</option>`).join('')}</select></label>`:''}
      <label>Answer in plain language<textarea name="answer">${esc(r.answer||'')}</textarea></label>
      <label>Source and date<input name="source" value="${esc(r.source||'')}"></label>
      <div><button class="btn sm" type="submit">Send answer</button></div></form></div>`).join(''):'<div class="empty">No claims or questions yet.</div>')+'</div>';
  el.querySelectorAll('form').forEach(f=>f.onsubmit=async e=>{e.preventDefault();const fd=new FormData(f);const u={answer:String(fd.get('answer')||'').trim(),source:fd.get('source')||null,status:'answered'};if(fd.get('verdict'))u.verdict=fd.get('verdict');if(!u.answer){toast('Write an answer first');return}
    const {error}=await sb.from('inbox').update(u).eq('id',f.dataset.i);if(error){toast('Could not save');return}Object.assign(data.inbox.find(x=>x.id===f.dataset.i),u,{seen:false});toast('Answer sent');inbox()});
}
function volunteers(){
  const V=data.players.filter(p=>p.volunteer);
  el.innerHTML=`<div class="sec"><h3>Volunteers${me.role==='coordinator'?' · '+esc(me.county):''}</h3><p class="src">Only players who said yes to being contacted appear here. They are reached through the app, never by phone number.</p>
    <div class="row"><button class="btn ghost sm" id="exp">Export CSV</button></div>`+(V.length?V.map(p=>`<div class="item"><div><b>${esc(p.nick)}</b> · ${esc(p.volunteer.area)}</div><div class="meta">Since ${when(p.volunteer.at)} · ${(p.completed||[]).length} stages · streak ${(p.streak||{}).n||0}</div></div>`).join(''):'<div class="empty">No volunteers yet.</div>')+'</div>';
  $('#exp').onclick=()=>csv(V.map(p=>({nick:p.nick,area:p.volunteer.area,since:new Date(p.volunteer.at||0).toISOString(),stages:(p.completed||[]).length})),'route2027-volunteers.csv');
}
async function upload(file,folder){
  const path=folder+'/'+Date.now().toString(36)+'-'+file.name.replace(/[^\w.\-]+/g,'_');
  const {error}=await sb.storage.from('media').upload(path,file,{upsert:false,contentType:file.type});if(error)throw error;
  return sb.storage.from('media').getPublicUrl(path).data.publicUrl;
}
function story(){
  const CH=chapters();
  el.innerHTML=`<div class="sec"><h3>Storylines</h3><p class="src">Each stage is a stop on the route. Edit any text, data card, quiz, poll or media. New stages slot in by order (6.5 sits between 6 and 7).</p>
    <div class="row"><button class="btn sm" id="add">+ New stage</button></div>
    ${CH.map(c=>`<div class="item"><div class="meta">#${c.order} · ${esc(c.id)} ${c.hidden?'<span class="pill mid">hidden</span>':''} ${OV.chapters[c.id]?'<span class="pill ok">edited</span>':''} ${c.voiceUrl?'🎧':''} ${c.videoUrl?'▶️':''}</div><div><b>${esc(c.emoji||'')} ${esc(c.town)}: ${esc(c.title)}</b></div><div class="row"><button class="btn ghost sm" data-e="${esc(c.id)}">Edit</button></div></div>`).join('')}</div>`;
  $('#add').onclick=()=>editStage({id:'c'+Date.now().toString(36),order:CH.length+1,town:'',emoji:'📍',scene:'rift',title:'',story:'',voice:'',explainer:'',topic:'debt',quiz:{q:'',o:['','',''],a:0,why:''},poll:{q:'',o:['','']},share:''});
  el.querySelectorAll('[data-e]').forEach(b=>b.onclick=()=>editStage(CH.find(c=>c.id===b.dataset.e)));
}
function editStage(c){
  const f=factOf(c)||{t:'',s:''};const q=c.quiz||{q:'',o:['','',''],a:0,why:''};const pl=c.poll||{q:'',o:['','']};
  el.innerHTML=`<form class="form" id="sf"><h3>${c.town?'Edit stage: '+esc(c.town):'New stage'}</h3>
    <div class="split"><label>Order<input name="order" type="number" step="0.1" value="${esc(c.order)}"></label><label>Town<input name="town" required value="${esc(c.town)}"></label><label>Emoji<input name="emoji" value="${esc(c.emoji)}"></label>
    <label>Scenery<select name="scene">${['coast','sgr','tsavo','city','rift','tea','lake'].map(s=>`<option ${c.scene===s?'selected':''}>${s}</option>`).join('')}</select></label>
    <label><span><input type="checkbox" name="danger" ${c.danger?'checked':''}> Blackspot leg (harder)</span></label></div>
    <label>Title<input name="title" value="${esc(c.title)}"></label>
    <label>Story<textarea name="story">${esc(String(c.story||'').replace(/<\/?b>/g,''))}</textarea></label>
    <label>Voice note script<textarea name="voice">${esc(c.voice)}</textarea></label>
    <label>Voice note audio ${c.voiceUrl?'(uploaded ✓)':''}<input type="file" name="voiceFile" accept="audio/*"></label>
    <label>30-sec explainer script<textarea name="explainer">${esc(c.explainer)}</textarea></label>
    <label>Explainer video ${c.videoUrl?'(uploaded ✓)':''}<input type="file" name="videoFile" accept="video/*"></label>
    <div class="split"><label>Data card fact<textarea name="factText">${esc(f.t)}</textarea></label><label>Source and date<input name="factSource" value="${esc(f.s)}"></label></div>
    <label>Manifesto topic<select name="topic">${topicKeys().map(k=>`<option value="${esc(k)}" ${c.topic===k?'selected':''}>${esc(topic(k).name)}</option>`).join('')}</select></label>
    <label>Quiz question<input name="qq" value="${esc(q.q)}"></label>
    <label>Quiz options, one per line<textarea name="qo">${esc((q.o||[]).join('\n'))}</textarea></label>
    <div class="split"><label>Correct option number<input name="qa" type="number" min="1" value="${(q.a||0)+1}"></label><label>Why (shown after the answer)<input name="qw" value="${esc(q.why)}"></label></div>
    <label>Poll question<input name="pq" value="${esc(pl.q)}"></label>
    <label>Poll options, one per line<textarea name="po">${esc((pl.o||[]).join('\n'))}</textarea></label>
    <label>Share card text<input name="share" value="${esc(c.share)}"></label>
    <label><span><input type="checkbox" name="hidden" ${c.hidden?'checked':''}> Hide this stage from players</span></label>
    <div class="row"><button class="btn" type="submit" id="svb">Save stage</button><button class="btn ghost" type="button" id="cx">Cancel</button></div></form>`;
  $('#cx').onclick=story;
  $('#sf').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.target);const lines=k=>String(fd.get(k)||'').split('\n').map(s=>s.trim()).filter(Boolean);
    $('#svb').disabled=true;$('#svb').textContent='Saving…';
    try{
      let voiceUrl=c.voiceUrl||null,videoUrl=c.videoUrl||null;
      const vf=fd.get('voiceFile'),xf=fd.get('videoFile');
      if(vf&&vf.size)voiceUrl=await upload(vf,'voice');if(xf&&xf.size)videoUrl=await upload(xf,'video');
      const o={id:c.id,order:parseFloat(fd.get('order'))||0,town:fd.get('town'),emoji:fd.get('emoji'),scene:fd.get('scene'),danger:!!fd.get('danger'),title:fd.get('title'),story:fd.get('story'),voice:fd.get('voice'),explainer:fd.get('explainer'),voiceUrl,videoUrl,
        factText:fd.get('factText'),factSource:fd.get('factSource'),topic:fd.get('topic'),custom:true,share:fd.get('share'),hidden:!!fd.get('hidden'),
        quiz:lines('qo').length>=2&&fd.get('qq')?{q:fd.get('qq'),o:lines('qo'),a:Math.max(0,Math.min(lines('qo').length-1,(parseInt(fd.get('qa'),10)||1)-1)),why:fd.get('qw')}:null,
        poll:lines('po').length>=2&&fd.get('pq')?{q:fd.get('pq'),o:lines('po')}:null};
      await saveContent('chapter',c.id,o);OV.chapters[c.id]=o;toast('Stage saved. Players see it on their next open.');story();
    }catch(err){toast('Could not save: '+(err.message||'error'));$('#svb').disabled=false;$('#svb').textContent='Save stage'}};
}
function tasksV(){
  const T=tasksAll();
  el.innerHTML=`<div class="sec"><h3>Daily tasks</h3><p class="src">The bot rotates these one per day. Finishing one keeps the player's streak alive.</p><div class="row"><button class="btn sm" id="add">+ New task</button></div>
    ${T.map(t=>`<div class="item"><div class="meta">#${t.order} · ${esc(t.kind)} ${t.hidden?'<span class="pill mid">hidden</span>':''}</div><div><b>${esc(t.title)}</b></div><div class="meta">${esc(t.body)}</div><div class="row"><button class="btn ghost sm" data-e="${esc(t.id)}">Edit</button></div></div>`).join('')}</div>`;
  $('#add').onclick=()=>editTask({id:'t'+Date.now().toString(36),order:T.length+1,kind:'share',title:'',body:''});
  el.querySelectorAll('[data-e]').forEach(b=>b.onclick=()=>editTask(T.find(t=>t.id===b.dataset.e)));
}
function editTask(t){
  el.innerHTML=`<form class="form" id="tf"><h3>${t.title?'Edit task':'New task'}</h3>
    <div class="split"><label>Order<input name="order" type="number" step="0.1" value="${esc(t.order)}"></label><label>Type<select name="kind">${[['video','Video 15–45s'],['share','Share a fact'],['talk','Talk to a non-voter'],['report','Ground report'],['quiz','Quiz streak'],['other','Other (self-report)']].map(([k,n])=>`<option value="${k}" ${t.kind===k?'selected':''}>${n}</option>`).join('')}</select></label></div>
    <label>Title<input name="title" required value="${esc(t.title)}"></label><label>Instructions<textarea name="body">${esc(t.body)}</textarea></label>
    <label><span><input type="checkbox" name="hidden" ${t.hidden?'checked':''}> Hide this task</span></label>
    <div class="row"><button class="btn" type="submit">Save task</button><button class="btn ghost" type="button" id="cx">Cancel</button></div></form>`;
  $('#cx').onclick=tasksV;
  $('#tf').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.target);const o={id:t.id,order:parseFloat(fd.get('order'))||0,kind:fd.get('kind'),title:fd.get('title'),body:fd.get('body'),hidden:!!fd.get('hidden')};
    try{await saveContent('task',t.id,o);OV.tasks[t.id]=o;toast('Task saved');tasksV()}catch(err){toast('Could not save')}};
}
function manifestoV(){
  el.innerHTML=`<div class="sec"><h3>Manifesto topics</h3><p class="src">This is where Sifuna's own positions go. Players see drafts labelled as drafts. Only an admin can mark a topic "Approved by Sifuna's team".</p>
    ${topicKeys().map(k=>{const t=topic(k);return `<div class="item"><div class="meta"><span class="pill ${t.proposal?(t.status==='approved'?'ok':'mid'):'new'}">${t.proposal?(t.status==='approved'?'approved':'draft'):'empty'}</span></div><div><b>${esc(t.name)}</b></div><div class="meta">${esc(t.proposal||'No proposal yet')}</div><div class="row"><button class="btn ghost sm" data-e="${esc(k)}">Edit</button></div></div>`}).join('')}
    <div class="row"><button class="btn sm" id="add">+ New topic</button></div></div>`;
  el.querySelectorAll('[data-e]').forEach(b=>b.onclick=()=>editTopic(b.dataset.e));
  $('#add').onclick=()=>editTopic('tp'+Date.now().toString(36));
}
function editTopic(k){
  const t=topic(k);const isAdmin=['admin','superadmin'].includes(me.role);
  el.innerHTML=`<form class="form" id="mf"><h3>${esc(t.name&&t.name!==k?t.name:'New topic')}</h3>
    <label>Topic name<input name="name" required value="${esc(t.name===k?'':t.name)}"></label>
    <label>The problem<textarea name="problem">${esc(t.problem)}</textarea></label><label>Why it matters<textarea name="why">${esc(t.why)}</textarea></label>
    <label>Sifuna's proposal<textarea name="proposal">${esc(t.proposal)}</textarea></label>
    <label>How it would be funded<textarea name="funding">${esc(t.funding)}</textarea></label>
    <label>How progress would be measured<textarea name="measure">${esc(t.measure)}</textarea></label>
    <label>Full policy text<textarea name="full">${esc(t.full)}</textarea></label>
    <label>Explainer video ${t.videoUrl?'(uploaded ✓)':''}<input type="file" name="videoFile" accept="video/*"></label>
    <label>Status<select name="status"><option value="draft" ${t.status!=='approved'?'selected':''}>Draft</option><option value="approved" ${t.status==='approved'?'selected':''} ${isAdmin?'':'disabled'}>Approved by Sifuna's team${isAdmin?'':' (admins only)'}</option></select></label>
    <div class="row"><button class="btn" type="submit" id="svb">Save topic</button><button class="btn ghost" type="button" id="cx">Cancel</button></div></form>`;
  $('#cx').onclick=manifestoV;
  $('#mf').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.target);const o={};['name','problem','why','proposal','funding','measure','full','status'].forEach(f=>o[f]=fd.get(f)||'');
    $('#svb').disabled=true;
    try{o.videoUrl=t.videoUrl||null;const xf=fd.get('videoFile');if(xf&&xf.size)o.videoUrl=await upload(xf,'video');
      await saveContent('topic',k,o);OV.topics[k]=o;toast('Topic saved');manifestoV()}catch(err){toast('Could not save');$('#svb').disabled=false}};
}
function team(){
  const isSuper=me.role==='superadmin';
  el.innerHTML=`<div class="sec"><h3>Team</h3>
    ${data.team.map(m=>`<div class="item"><div><b>${esc(m.display_name||'(no name)')}</b> · ${esc(ROLE_NAMES[m.role]||m.role)}${m.county?' · '+esc(m.county):''}</div>
      ${m.id===me.id||m.role==='superadmin'?'':`<div class="row"><select data-r="${esc(m.id)}">${Object.keys(ROLE_NAMES).filter(r=>r!=='superadmin'&&(isSuper||r!=='admin')).map(r=>`<option value="${r}" ${m.role===r?'selected':''}>${ROLE_NAMES[r]}</option>`).join('')}</select><input data-c="${esc(m.id)}" placeholder="County (coordinators)" value="${esc(m.county||'')}"><button class="btn ghost sm" data-s="${esc(m.id)}">Save</button><button class="btn ghost sm" data-x="${esc(m.id)}">Remove access</button></div>`}</div>`).join('')}</div>
  <form class="form item" id="nf"><h3>Add a team member</h3>
    <div class="split"><label>Name<input name="display_name" required></label><label>Email<input name="email" type="email" required></label>
    <label>Role<select name="role">${Object.keys(ROLE_NAMES).filter(r=>r!=='superadmin'&&(isSuper||r!=='admin')).map(r=>`<option value="${r}">${ROLE_NAMES[r]}</option>`).join('')}</select></label>
    <label>County (coordinators)<input name="county"></label></div>
    <div><button class="btn" type="submit" id="nb">Create account</button></div><div id="cred"></div></form>`;
  el.querySelectorAll('[data-s]').forEach(b=>b.onclick=async()=>{const id=b.dataset.s;const role=el.querySelector(`[data-r="${id}"]`).value,county=el.querySelector(`[data-c="${id}"]`).value.trim()||null;
    if(role==='coordinator'&&!county){toast('Coordinators need a county');return}
    const {error}=await sb.from('profiles').update({role,county}).eq('id',id);if(error){toast('Could not save');return}Object.assign(data.team.find(m=>m.id===id),{role,county});toast('Saved');team()});
  el.querySelectorAll('[data-x]').forEach(b=>b.onclick=async()=>{if(b.dataset.confirm!=='1'){b.dataset.confirm='1';b.textContent='Tap again to confirm';return}
    const {error}=await sb.from('profiles').update({role:'player',county:null}).eq('id',b.dataset.x);if(error){toast('Could not remove');return}data.team=data.team.filter(m=>m.id!==b.dataset.x);toast('Access removed');team()});
  $('#nf').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.target);
    const pw='R27-'+Array.from(crypto.getRandomValues(new Uint8Array(6))).map(x=>'abcdefghjkmnpqrstuvwxyz23456789'[x%31]).join('');
    const body={email:fd.get('email'),display_name:fd.get('display_name'),role:fd.get('role'),county:fd.get('county'),password:pw};
    $('#nb').disabled=true;$('#nb').textContent='Creating…';
    const {data:r,error}=await sb.functions.invoke('create-team-member',{body});
    $('#nb').disabled=false;$('#nb').textContent='Create account';
    let msg=error?(await error.context?.json?.().catch(()=>null))?.error||error.message:r&&r.error;
    if(msg){$('#cred').innerHTML=`<p class="src">${esc(msg)}</p>`;return}
    const link=location.origin+location.pathname;
    const text=`Karibu kwa timu ya The Route 2027.\nLogin: ${link}\nEmail: ${body.email}\nPassword ya muda: ${pw}\nBadilisha password ukiingia.`;
    $('#cred').innerHTML=`<div class="item"><b>Account created. Share these details with ${esc(body.display_name)}:</b><pre style="white-space:pre-wrap;margin:0">${esc(text)}</pre>
      <div class="row"><a class="btn sm" href="https://wa.me/?text=${encodeURIComponent(text)}" target="_blank" rel="noopener">Send on WhatsApp</a><button class="btn ghost sm" type="button" id="cp">Copy</button></div></div>`;
    $('#cp').onclick=()=>navigator.clipboard.writeText(text).then(()=>toast('Copied'),()=>toast('Copy failed'));
    data.team.push({id:r.id,role:body.role,county:body.county||null,display_name:body.display_name});
  };
}
function account(){
  el.innerHTML=`<form class="form item" id="pf" style="max-width:420px"><h3>Change password</h3><p class="src">${esc(me.email)} · ${esc(ROLE_NAMES[me.role])}</p>
    <label>New password (8+ characters)<input name="p1" type="password" minlength="8" autocomplete="new-password" required></label>
    <label>Repeat it<input name="p2" type="password" minlength="8" autocomplete="new-password" required></label>
    <div><button class="btn" type="submit">Update password</button></div></form>`;
  $('#pf').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.target);if(fd.get('p1')!==fd.get('p2')){toast('The two passwords differ');return}
    const {error}=await sb.auth.updateUser({password:fd.get('p1')});toast(error?'Could not update: '+error.message:'Password updated');if(!error)e.target.reset()};
}
function render(){({overview,reports,inbox,volunteers,story,tasks:tasksV,manifesto:manifestoV,team,account})[view]()}

sb.auth.getSession().then(({data:{session}})=>{if(session)start()});
})();
