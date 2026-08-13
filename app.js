
(() => {
const d=window.CPM_DATA, tasks=d.tasks, taskMap=new Map(tasks.map(t=>[t.id,t]));
const state={view:'network',filter:'ALL',milestone:'ALL',platform:'ALL',q:'',scale:1,tx:0,ty:0};
const lanes=["Release","共用/Release","統一需求模型","需求資料交換","需求事件中心","需求分析","需求規劃工作台","需求協同與審查","自動化工作室 (DM)","統一供應模型","供應資料交換","供應事件中心","供應分析","供應規劃工作台","供應協同與審查","自動化工作室 (SCP)"];
const laneOf=t=>t.type==="User Release Gate"?"Release":t.type==="Release/Foundation"?"共用/Release":t.module==="自動化工作室"?`自動化工作室 (${t.platform})`:t.module;
const laneIndex=new Map(lanes.map((x,i)=>[x,i]));
const colors={DM:"#dceeff",SCP:"#e2f5e8",Cross:"#eee8f8"};
const stroke={DM:"#428ac7",SCP:"#3c9a61",Cross:"#7a5cad"};

document.querySelector('#kWeeks').textContent=d.meta.projectWeeks;
document.querySelector('#kTasks').textContent=d.meta.taskCount;
document.querySelector('#kCrit').textContent=d.meta.criticalCount;
document.querySelector('#kNear').textContent=d.meta.nearCriticalCount;
for(const m of d.milestones){const o=document.createElement('option');o.value=m.milestone;o.textContent=m.milestone;document.querySelector('#milestone').appendChild(o)}

function matches(t){
 if(state.milestone!=="ALL"&&t.milestone!==state.milestone)return false;
 if(state.platform!=="ALL"&&t.platform!==state.platform)return false;
 if(state.filter==="CRITICAL"&&!t.critical)return false;
 if(state.filter==="NEAR"&&!(t.critical||t.nearCritical))return false;
 const q=state.q.toLowerCase(); if(q&&!([t.id,t.name,t.module,t.owner,t.useCase,t.release].join(' ').toLowerCase().includes(q)))return false;
 return true;
}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}

function renderNetwork(){
 const svg=document.querySelector('#networkSvg'), W=Math.max(4200,d.meta.projectWorkdays*9.3+450), H=lanes.length*96+130;
 svg.setAttribute('viewBox',`0 0 ${W} ${H}`);
 const x0=210, scale=8.9, nw=145, nh=42;
 const visible=new Set(tasks.filter(matches).map(t=>t.id));
 const positions=new Map(), last=new Map(lanes.map(l=>[l,[-1e9,-1e9,-1e9]]));
 const ordered=[...tasks].sort((a,b)=>a.es-b.es||laneIndex.get(laneOf(a))-laneIndex.get(laneOf(b))||a.id.localeCompare(b.id));
 for(const t of ordered){
   const lane=laneOf(t), x=x0+t.es*scale, arr=last.get(lane); let sr=arr.findIndex(v=>x>v+7); if(sr<0)sr=arr.indexOf(Math.min(...arr));
   const y=70+laneIndex.get(lane)*96+sr*23; arr[sr]=x+nw; positions.set(t.id,{x,y});
 }
 let h=`<defs><marker id="a" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#aab6c3"/></marker><marker id="ac" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#d92d20"/></marker></defs>`;
 for(let day=0;day<=d.meta.projectWorkdays;day+=20){const x=x0+day*scale;h+=`<line x1="${x}" y1="40" x2="${x}" y2="${H-20}" stroke="#edf1f5"/><text x="${x+2}" y="35" class="axisText">D${day}</text>`}
 lanes.forEach((l,i)=>{const y=78+i*96;h+=`<text x="12" y="${y}" class="laneLabel">${esc(l)}</text><line x1="195" y1="${y+12}" x2="${W-20}" y2="${y+12}" stroke="#eef2f5"/>`});
 for(const e of d.edges){
   if(e.from==="START"||!positions.has(e.from)||!positions.has(e.to))continue;
   const p1=positions.get(e.from),p2=positions.get(e.to), dim=!(visible.has(e.from)&&visible.has(e.to)), critical=e.critical;
   const x1=p1.x+nw,y1=p1.y+nh/2,x2=p2.x,y2=p2.y+nh/2,mid=(x1+x2)/2;
   h+=`<path class="edge ${critical?'critical':''} ${dim?'dim':''}" d="M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}" marker-end="url(#${critical?'ac':'a'})"/>`;
 }
 for(const t of tasks){const p=positions.get(t.id),dim=!visible.has(t.id),cls=`node ${t.critical?'critical':''} ${t.nearCritical?'near':''} ${dim?'dim':''}`;
   let fill=colors[t.platform]||colors.Cross, st=stroke[t.platform]||stroke.Cross; if(t.critical){fill="#fff1f0";st="#d92d20"} else if(t.nearCritical){fill="#fff8e8";st="#f79009"}
   const name=t.name.replace(' - 建置與驗證',''); const short=name.length>18?name.slice(0,18)+'…':name;
   h+=`<g class="${cls}" data-id="${t.id}" transform="translate(${p.x},${p.y})"><rect width="${nw}" height="${nh}" rx="7" fill="${fill}" stroke="${st}"/><text x="7" y="15" class="nodeTitle">${esc(t.id)} · ${esc(short)}</text><text x="7" y="30" class="nodeMeta">${esc(t.milestone)} · ${t.duration}d · Float ${t.float}d</text></g>`;
 }
 svg.innerHTML=h; svg.querySelectorAll('.node:not(.dim)').forEach(n=>n.addEventListener('click',()=>openTask(n.dataset.id)));
 applyTransform();
}
function applyTransform(){document.querySelector('#networkSvg').style.transform=`translate(${state.tx}px,${state.ty}px) scale(${state.scale})`;document.querySelector('#networkSvg').style.transformOrigin='0 0'}
const wrap=document.querySelector('#networkWrap');let dragging=false,sx=0,sy=0,otx=0,oty=0;
wrap.addEventListener('wheel',e=>{e.preventDefault();state.scale=Math.min(2.6,Math.max(.35,state.scale*(e.deltaY<0?1.1:.9)));applyTransform()},{passive:false});
wrap.addEventListener('mousedown',e=>{dragging=true;sx=e.clientX;sy=e.clientY;otx=state.tx;oty=state.ty});
window.addEventListener('mouseup',()=>dragging=false);window.addEventListener('mousemove',e=>{if(!dragging)return;state.tx=otx+e.clientX-sx;state.ty=oty+e.clientY-sy;applyTransform()});

function renderReleases(){
 document.querySelector('#releaseGrid').innerHTML=d.milestones.map(m=>`<article class="releaseCard"><span class="m">${m.milestone}</span><h3>${esc(m.release)}</h3><p>${m.start} → ${m.end}</p><ul>${String(m.useCase||'').split(';').map(x=>`<li>${esc(x.trim())}</li>`).join('')}</ul><div class="releaseMeta"><span>Critical ${m.criticalCount}</span><span>Near-critical ${m.nearCriticalCount}</span></div></article>`).join('');
}
function renderCritical(){
 document.querySelector('#criticalList').innerHTML=d.meta.criticalPath.map(id=>{const t=taskMap.get(id);return `<div class="pathItem" data-task="${id}"><strong>${id} · ${esc(t.name)}</strong><span>${esc(t.milestone)} · ${t.duration}d · ${t.plannedStart} → ${t.plannedEnd}</span></div>`}).join('');
 const near=tasks.filter(t=>t.nearCritical).sort((a,b)=>a.float-b.float||a.es-b.es);
 document.querySelector('#nearList').innerHTML=near.map(t=>`<div class="nearItem" data-task="${t.id}"><strong>${t.id} · ${esc(t.name)}</strong><span>${esc(t.milestone)} / ${esc(t.module)} · Float ${t.float}d</span></div>`).join('');
 document.querySelectorAll('[data-task]').forEach(x=>x.addEventListener('click',()=>openTask(x.dataset.task)));
}
function openTask(id){
 const t=taskMap.get(id);if(!t)return;document.querySelector('#drawerBody').innerHTML=`<span class="chip">${esc(t.milestone)}</span> <span class="chip">${esc(t.platform)}</span><h2>${esc(t.id)} · ${esc(t.name)}</h2><p>${esc(t.release)}</p><div class="metricGrid"><div class="metric"><strong>${t.duration}d</strong><span>Duration</span></div><div class="metric"><strong>${t.hours}h</strong><span>Hours</span></div><div class="metric"><strong>${t.float}d</strong><span>Total Float</span></div><div class="metric"><strong>${t.critical?'Critical':t.nearCritical?'Near':'Normal'}</strong><span>Status</span></div></div><div class="drawerSection"><h3>Schedule</h3><p>Planned: ${t.plannedStart} → ${t.plannedEnd}<br>ES/EF: D${t.es} / D${t.ef}<br>LS/LF: D${t.ls} / D${t.lf}</p></div><div class="drawerSection"><h3>Owner</h3><p>${esc(t.owner)}</p></div><div class="drawerSection"><h3>Use case</h3><p>${esc(t.useCase)}</p></div><div class="drawerSection"><h3>Predecessors</h3>${t.predecessors.length?t.predecessors.map(p=>`<div class="pred">${esc(p.id)} · ${esc(p.relation)} · ${esc(p.label)}</div>`).join(''):'<p>Project start</p>'}</div>`;
 document.querySelector('#backdrop').classList.remove('hidden');document.querySelector('#drawer').classList.add('open');
}
function close(){document.querySelector('#backdrop').classList.add('hidden');document.querySelector('#drawer').classList.remove('open')}
document.querySelector('#closeDrawer').onclick=close;document.querySelector('#backdrop').onclick=close;

document.querySelectorAll('.viewBtn').forEach(b=>b.onclick=()=>{state.view=b.dataset.view;document.querySelectorAll('.viewBtn').forEach(x=>x.classList.toggle('active',x===b));document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));document.querySelector(`#${state.view}View`).classList.add('active');if(state.view==='releases')renderReleases();if(state.view==='critical')renderCritical()});
document.querySelectorAll('.filterBtn').forEach(b=>b.onclick=()=>{state.filter=b.dataset.filter;document.querySelectorAll('.filterBtn').forEach(x=>x.classList.toggle('active',x===b));renderNetwork()});
document.querySelector('#search').oninput=e=>{state.q=e.target.value;renderNetwork()};document.querySelector('#milestone').onchange=e=>{state.milestone=e.target.value;renderNetwork()};document.querySelector('#platform').onchange=e=>{state.platform=e.target.value;renderNetwork()};
renderNetwork();
})();