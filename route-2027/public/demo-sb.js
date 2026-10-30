/* Demo mode: when config.js has no Supabase project yet, this stands in for Supabase.
   Everything is stored in this browser only, so a phone can play the bot and then open
   the team dashboard to see its own answers. Swap in real keys to go live. */
(function(){
  const cfg=window.R27||{};
  const demo=!cfg.url||/PROJECT_REF/.test(cfg.url);
  window.R27_DEMO=demo;
  if(!demo)return;

  const PK={profiles:['id'],player_state:['user_id'],inbox:['id'],content:['kind','id'],leaderboard:['user_id']};
  const store={
    read(t){try{return JSON.parse(localStorage.getItem('r27demo_'+t)||'[]')}catch(e){return[]}},
    write(t,rows){try{localStorage.setItem('r27demo_'+t,JSON.stringify(rows))}catch(e){}}
  };
  const sessKey='r27demo_session_'+(/admin/.test(location.pathname)?'team':'player');
  const getSess=()=>{try{return JSON.parse(localStorage.getItem(sessKey)||'null')}catch(e){return null}};
  const setSess=s=>{try{s?localStorage.setItem(sessKey,JSON.stringify(s)):localStorage.removeItem(sessKey)}catch(e){}};
  const uid=()=>(getSess()||{user:{}}).user.id||null;
  const newId=()=>'d'+Date.now().toString(36)+Math.random().toString(36).slice(2,8);
  const now=()=>new Date().toISOString();
  const keyOf=(t,r)=>PK[t].map(k=>r[k]).join('|');

  function ensureProfile(id,role,extra){
    const rows=store.read('profiles');if(!rows.find(r=>r.id===id)){rows.push(Object.assign({id,role,created_at:now()},extra||{}));store.write('profiles',rows)}
  }

  class Q{
    constructor(t){this.t=t;this.f=[];this.op='select';this.ord=null;this.lim=null;this.one=null;this.payload=null}
    select(){return this}
    eq(c,v){this.f.push(r=>r[c]===v);return this}
    neq(c,v){this.f.push(r=>r[c]!==v);return this}
    not(c){this.f.push(r=>r[c]!=null&&r[c]!=='');return this}
    order(c,o){this.ord=[c,!!(o&&o.ascending===false)];return this}
    limit(n){this.lim=n;return this}
    maybeSingle(){this.one='maybe';return this}
    single(){this.one='single';return this}
    insert(r){this.op='insert';this.payload=r;return this}
    upsert(r){this.op='upsert';this.payload=r;return this}
    update(r){this.op='update';this.payload=r;return this}
    delete(){this.op='delete';return this}
    then(res,rej){return Promise.resolve().then(()=>this.run()).then(res,rej)}
    run(){
      const t=this.t;let rows=store.read(t);const match=r=>this.f.every(f=>f(r));let out=[];
      if(this.op==='insert'||this.op==='upsert'){
        const items=(Array.isArray(this.payload)?this.payload:[this.payload]).map(x=>Object.assign({},x));
        for(const it of items){
          if(t==='inbox'){it.id=it.id||newId();it.user_id=it.user_id||uid();it.created_at=it.created_at||now();if(it.seen==null)it.seen=false;it.status=it.status||'new'}
          if(t==='leaderboard'||t==='player_state')it.user_id=it.user_id||uid();
          const i=rows.findIndex(r=>keyOf(t,r)===keyOf(t,it));
          if(i>=0){if(this.op==='insert')return{data:null,error:{message:'duplicate'}};rows[i]=Object.assign({},rows[i],it)}else rows.push(it);
          out.push(it);
        }
        store.write(t,rows);
      }else if(this.op==='update'){
        rows=rows.map(r=>{if(!match(r))return r;const n=Object.assign({},r,this.payload);if(t==='inbox'&&'answer' in this.payload&&this.payload.answer!==r.answer){n.answered_at=now();n.seen=false}out.push(n);return n});
        store.write(t,rows);
      }else if(this.op==='delete'){
        out=rows.filter(match);store.write(t,rows.filter(r=>!match(r)));
      }else{
        out=rows.filter(match);
        if(this.ord){const [c,desc]=this.ord;out.sort((a,b)=>(a[c]>b[c]?1:a[c]<b[c]?-1:0)*(desc?-1:1))}
        if(this.lim)out=out.slice(0,this.lim);
      }
      if(this.one)return{data:out[0]||null,error:this.one==='single'&&!out[0]?{message:'not found'}:null};
      return{data:out,error:null};
    }
  }

  const media={};
  const client={
    auth:{
      async getSession(){return{data:{session:getSess()}}},
      async signInAnonymously(){const s={user:{id:newId(),is_anonymous:true}};setSess(s);ensureProfile(s.user.id,'player');return{data:{user:s.user,session:s},error:null}},
      async signInWithPassword({email}){const id='team-'+String(email||'demo').toLowerCase();const s={user:{id,email}};
        const rows=store.read('profiles');const existing=rows.find(r=>r.id===id);
        if(!existing)ensureProfile(id,rows.some(r=>r.role==='superadmin')?'superadmin':'superadmin',{display_name:'Demo · '+email});
        setSess(s);return{data:{session:s},error:null}},
      async signUp(){return{data:null,error:{message:'Demo mode: owner setup happens on the live system. Just sign in with any email and password to explore.'}}},
      async updateUser(){return{data:{},error:null}},
      async signOut(){setSess(null);return{error:null}}
    },
    from:t=>new Q(t),
    async rpc(name){if(name==='delete_me'){const id=uid();for(const t of ['inbox','player_state','leaderboard','profiles']){const k=t==='profiles'?'id':'user_id';store.write(t,store.read(t).filter(r=>r[k]!==id))}setSess(null)}return{data:null,error:null}},
    functions:{async invoke(name,{body}){if(name!=='create-team-member')return{data:null,error:{message:'Unknown function'}};
      const id='team-'+String(body.email).toLowerCase();ensureProfile(id,body.role,{county:body.county||null,display_name:body.display_name});return{data:{ok:true,id},error:null}}},
    storage:{from:()=>({
      async upload(path,file){media[path]=URL.createObjectURL(file);return{data:{path},error:null}},
      getPublicUrl(path){return{data:{publicUrl:media[path]||''}}}
    })}
  };
  window.supabase={createClient:()=>client};

  document.addEventListener('DOMContentLoaded',()=>{
    const h=document.querySelector('header .brand');if(!h)return;
    const b=document.createElement('span');b.className='draft';b.textContent='Demo · data stays on this phone';h.appendChild(b);
  });
})();
