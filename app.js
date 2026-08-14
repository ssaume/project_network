
(() => {
'use strict';
const d=window.CPM_DATA, tasks=d.tasks, taskMap=new Map(tasks.map(t=>[t.id,t]));
const state={view:'gantt',filter:'ALL',milestone:'ALL',platform:'ALL',q:'',dep:'CRITICAL',dayPx:3.6};
const taskPane=document.querySelector('#taskPane'), timelinePane=document.querySelector('#timelinePane');
const projectStart=new Date(d.meta.projectStart+'T00:00:00');
const projectEnd=new Date(d.meta.projectEnd+'T00:00:00');
const DAY=86400000;

document.querySelector('#kWeeks').textContent=d.meta.projectWeeks;
document.querySelector('#kTasks').textContent=d.meta.taskCount;
document.querySelector('#kCrit').textContent=d.meta.criticalCount;
document.querySelector('#kNear').textContent=d.meta.nearCriticalCount;
for(const m of d.milestones){const o=document.createElement('option');o.value=m.milestone;o.textContent=`${m.milestone} · ${m.release}`;document.querySelector('#milestone').appendChild(o)}

function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function date(s){return new Date(s+'T00:00:00')}
function dayDiff(a,b){return Math.round((b-a)/DAY)}
function xForDate(dt){return dayDiff(projectStart,dt)*state.dayPx}
function addBusinessDays(date0,n){
  const dt=new Date(date0); let remaining=n;
  while(remaining>0){dt.setDate(dt.getDate()+1);const w=dt.getDay();if(w!==0&&w!==6)remaining--}
  return dt;
}
function fmt(dt){return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`}
function matches(t){
 if(state.milestone!=="ALL"&&t.milestone!==state.milestone)return false;
 if(state.platform!=="ALL"&&t.platform!==state.platform)return false;
 if(state.filter==="CRITICAL"&&!t.critical)return false;
 if(state.filter==="NEAR"&&!(t.critical||t.nearCritical))return false;
 const q=state.q.toLowerCase();
 if(q&&!([t.id,t.name,t.module,t.owner,t.useCase,t.release].join(' ').toLowerCase().includes(q)))return false;
 return true;
}
function taskSort(a,b){
 const ma=Number(a.milestone.slice(1)), mb=Number(b.milestone.slice(1));
 if(ma!==mb)return ma-mb;
 const typeRank=x=>x.type==="Release/Foundation"?0:x.type==="Capability Build"?1:2;
 return typeRank(a)-typeRank(b)||date(a.plannedStart)-date(b.plannedStart)||a.id.localeCompare(b.id);
}
function visibleRows(){
 const vt=tasks.filter(matches).sort(taskSort), rows=[];
 for(const m of d.milestones){
   const group=vt.filter(t=>t.milestone===m.milestone);
   if(!group.length)continue;
   rows.push({kind:'group',milestone:m, id:`GROUP-${m.milestone}`});
   group.forEach(t=>rows.push({kind:'task',task:t,id:t.id}));
 }
 return rows;
}
function statusClass(t){return t.critical?'critical':t.nearCritical?'near':(t.platform||'Cross').toLowerCase()}
function buildHeader(totalWidth){
 const h=document.querySelector('#timelineHeader');h.style.width=totalWidth+'px';
 let out='';
 let cur=new Date(projectStart.getFullYear(),projectStart.getMonth(),1);
 while(cur<=projectEnd){
   const next=new Date(cur.getFullYear(),cur.getMonth()+1,1);
   const start=cur<projectStart?projectStart:cur, end=next>projectEnd?new Date(projectEnd.getTime()+DAY):next;
   const x=xForDate(start), w=Math.max(1,dayDiff(start,end)*state.dayPx);
   out+=`<div class="monthCell" style="left:${x}px;width:${w}px">${start.getFullYear()} / ${start.getMonth()+1}</div>`;
   cur=next;
 }
 let wk=new Date(projectStart);
 const day=wk.getDay(), delta=(day+6)%7; wk.setDate(wk.getDate()-delta);
 let wi=1;
 while(wk<=projectEnd){
   const s=wk<projectStart?projectStart:wk, e=new Date(wk);e.setDate(e.getDate()+7);
   const ee=e>projectEnd?new Date(projectEnd.getTime()+DAY):e;
   const x=xForDate(s),w=Math.max(1,dayDiff(s,ee)*state.dayPx);
   if(w>0)out+=`<div class="weekCell" style="left:${x}px;width:${w}px">W${wi}</div>`;
   wk=e;wi++;
 }
 h.innerHTML=out;
}
function renderGantt(){
 const rows=visibleRows();
 const totalDays=dayDiff(projectStart,new Date(projectEnd.getTime()+DAY));
 const totalWidth=Math.max(1250,totalDays*state.dayPx);
 document.documentElement.style.setProperty('--weekPx',(7*state.dayPx)+'px');
 const taskRows=document.querySelector('#taskRows'), tlRows=document.querySelector('#timelineRows');
 taskRows.innerHTML='';tlRows.innerHTML='';buildHeader(totalWidth);
 document.querySelector('#timelineCanvas').style.width=totalWidth+'px';
 const rowPos=new Map(); let y=0;
 for(const row of rows){
   if(row.kind==='group'){
     const m=row.milestone;
     taskRows.insertAdjacentHTML('beforeend',`<div class="groupRow"><div class="groupName">${esc(m.milestone)} · ${esc(m.release)}</div><div class="groupMeta">${esc(m.start)} → ${esc(m.end)}</div></div>`);
     const start=date(m.start), end=date(m.end), left=xForDate(start), right=xForDate(end), width=Math.max(8,right-left+state.dayPx);
     tlRows.insertAdjacentHTML('beforeend',`<div class="timelineGroup" style="width:${totalWidth}px"><div class="groupWindow" style="left:${left}px;width:${width}px"></div><div class="groupWindowLabel" style="left:${left+6}px">${esc(m.milestone)} · ${esc(m.release)}</div></div>`);
     y+=34;
   } else {
     const t=row.task, cls=statusClass(t);
     const clean=t.name.replace(' - 建置與驗證','');
     taskRows.insertAdjacentHTML('beforeend',`<div class="taskRow ${t.critical?'critical':t.nearCritical?'near':''}" data-task="${t.id}"><div class="wbs">${esc(t.id)}</div><div title="${esc(t.name)}">${esc(clean)}</div><div title="${esc(t.owner)}">${esc(t.owner)}</div><div class="dur">${t.duration}d</div><div class="float">${t.float}d</div></div>`);
     const s=date(t.plannedStart), e=date(t.plannedEnd), left=xForDate(s), endX=xForDate(new Date(e.getTime()+DAY));
     const width=Math.max(5,endX-left);
     const latestFinish=addBusinessDays(e,t.float), lfX=xForDate(new Date(latestFinish.getTime()+DAY));
     const tailWidth=Math.max(0,lfX-endX);
     const label=clean.length>22?clean.slice(0,22)+'…':clean;
     let content='';
     if(t.type==='User Release Gate'){
       const dx=Math.max(0,endX-7);
       content+=`<div class="releaseDiamond" data-task="${t.id}" style="left:${dx}px" title="${esc(t.name)}"></div><div class="releaseLabel" style="left:${endX+8}px">${esc(t.release)}</div>`;
     }else{
       content+=`<div class="ganttBar ${cls}" data-task="${t.id}" style="left:${left}px;width:${width}px" title="${esc(t.id)} · ${esc(t.name)}"><span class="barLabel">${esc(label)}</span></div>`;
     }
     if(t.float>0){
       content+=`<div class="floatTail" style="left:${endX}px;width:${tailWidth}px"></div><div class="floatCap" style="left:${lfX}px"></div>`;
     }
     tlRows.insertAdjacentHTML('beforeend',`<div class="timelineRow" style="width:${totalWidth}px">${content}</div>`);
     rowPos.set(t.id,{y:y+17, startX:left, finishX:endX, task:t});
     y+=36;
   }
 }
 document.querySelectorAll('[data-task]').forEach(x=>x.addEventListener('click',e=>{e.stopPropagation();openTask(x.dataset.task)}));
 renderDependencies(rows,rowPos,totalWidth,y);
}
function renderDependencies(rows,rowPos,totalWidth,totalHeight){
 const svg=document.querySelector('#dependencySvg');svg.setAttribute('width',totalWidth);svg.setAttribute('height',Math.max(totalHeight,400));svg.style.width=totalWidth+'px';svg.style.height=Math.max(totalHeight,400)+'px';
 if(state.dep==='NONE'){svg.innerHTML='';return}
 const visible=new Set([...rowPos.keys()]);
 let h=`<defs><marker id="arr" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#98a8b7"/></marker><marker id="arrCrit" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#d92d20"/></marker></defs>`;
 for(const e of d.edges){
   if(e.from==='START'||!visible.has(e.from)||!visible.has(e.to))continue;
   if(state.dep==='CRITICAL'&&!e.critical)continue;
   const a=rowPos.get(e.from),b=rowPos.get(e.to);
   const rel=e.relation||'FS';
   const source=rel.startsWith('SS')?a.startX:a.finishX;
   const target=rel.startsWith('FF')?b.finishX:b.startX;
   const y1=a.y,y2=b.y;
   const elbow=Math.max(source+12, Math.min(target-12,(source+target)/2));
   const cls=e.critical?'dep critical':'dep';
   const marker=e.critical?'arrCrit':'arr';
   h+=`<path class="${cls}" d="M${source},${y1} H${elbow} V${y2} H${target}" marker-end="url(#${marker})"/>`;
   if(e.critical)h+=`<text x="${elbow+3}" y="${Math.min(y1,y2)+Math.abs(y2-y1)/2-3}" class="depLabel critical">${esc(rel)}</text>`;
 }
 svg.innerHTML=h;
}
function renderStrip(){
 const el=document.querySelector('#criticalStripPath');
 el.innerHTML=d.meta.criticalPath.map((id,i)=>{const t=taskMap.get(id);return `${i?'<span class="stripArrow">→</span>':''}<button class="stripNode" data-task="${id}">${id} · ${esc(t.release||t.name)}</button>`}).join('');
 el.querySelectorAll('[data-task]').forEach(x=>x.onclick=()=>openTask(x.dataset.task));
}
function renderReleases(){
 document.querySelector('#releaseGrid').innerHTML=d.milestones.map(m=>`<article class="releaseCard"><span class="m">${esc(m.milestone)}</span><h3>${esc(m.release)}</h3><p>${m.start} → ${m.end}</p><ul>${String(m.useCase||'').split(';').map(x=>`<li>${esc(x.trim())}</li>`).join('')}</ul><div class="releaseMeta"><span>Critical ${m.criticalCount}</span><span>Near-critical ${m.nearCriticalCount}</span></div></article>`).join('');
}
function renderCritical(){
 document.querySelector('#criticalList').innerHTML=d.meta.criticalPath.map(id=>{const t=taskMap.get(id);return `<div class="pathItem" data-task="${id}"><strong>${id} · ${esc(t.name)}</strong><span>${esc(t.milestone)} · ${t.duration}d · ${t.plannedStart} → ${t.plannedEnd}</span></div>`}).join('');
 const near=tasks.filter(t=>t.nearCritical).sort((a,b)=>a.float-b.float||a.es-b.es);
 document.querySelector('#nearList').innerHTML=near.map(t=>`<div class="nearItem" data-task="${t.id}"><strong>${t.id} · ${esc(t.name)}</strong><span>${esc(t.milestone)} / ${esc(t.module)} · Float ${t.float}d</span></div>`).join('');
 document.querySelectorAll('[data-task]').forEach(x=>x.addEventListener('click',()=>openTask(x.dataset.task)));
}
function openTask(id){
 const t=taskMap.get(id);if(!t)return;
 const stateChip=t.critical?'<span class="chip critical">Critical Path</span>':t.nearCritical?'<span class="chip near">Near-critical</span>':'';
 document.querySelector('#drawerBody').innerHTML=`<div class="chips"><span class="chip">${esc(t.milestone)}</span><span class="chip">${esc(t.platform)}</span>${stateChip}</div><h2>${esc(t.id)} · ${esc(t.name)}</h2><p>${esc(t.release)}</p><div class="metricGrid"><div class="metric"><strong>${t.duration}d</strong><span>Duration</span></div><div class="metric"><strong>${t.hours}h</strong><span>Hours</span></div><div class="metric"><strong>${t.float}d</strong><span>Total Float</span></div><div class="metric"><strong>${t.critical?'Critical':t.nearCritical?'Near':'Normal'}</strong><span>CPM Status</span></div></div><div class="drawerSection"><h3>Gantt Schedule</h3><p>Planned: ${t.plannedStart} → ${t.plannedEnd}<br>ES / EF: D${t.es} / D${t.ef}<br>LS / LF: D${t.ls} / D${t.lf}</p></div><div class="drawerSection"><h3>Owner</h3><p>${esc(t.owner)}</p></div><div class="drawerSection"><h3>Use Case</h3><p>${esc(t.useCase)}</p></div><div class="drawerSection"><h3>Predecessors</h3>${t.predecessors.length?t.predecessors.map(p=>`<div class="pred ${p.critical?'critical':''}">${esc(p.id)} · ${esc(p.relation)} · ${esc(p.label)}</div>`).join(''):'<p>Project start</p>'}</div>`;
 document.querySelector('#backdrop').classList.remove('hidden');document.querySelector('#drawer').classList.add('open');document.querySelector('#drawer').setAttribute('aria-hidden','false');
}
function closeDrawer(){document.querySelector('#backdrop').classList.add('hidden');document.querySelector('#drawer').classList.remove('open');document.querySelector('#drawer').setAttribute('aria-hidden','true')}
document.querySelector('#closeDrawer').onclick=closeDrawer;document.querySelector('#backdrop').onclick=closeDrawer;

let syncing=false;
taskPane.addEventListener('scroll',()=>{if(syncing)return;syncing=true;timelinePane.scrollTop=taskPane.scrollTop;syncing=false});
timelinePane.addEventListener('scroll',()=>{if(syncing)return;syncing=true;taskPane.scrollTop=timelinePane.scrollTop;syncing=false});

document.querySelectorAll('.viewBtn').forEach(b=>b.onclick=()=>{state.view=b.dataset.view;document.querySelectorAll('.viewBtn').forEach(x=>x.classList.toggle('active',x===b));document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));document.querySelector(`#${state.view}View`).classList.add('active');if(state.view==='releases')renderReleases();if(state.view==='critical')renderCritical()});
document.querySelectorAll('.filterBtn').forEach(b=>b.onclick=()=>{state.filter=b.dataset.filter;document.querySelectorAll('.filterBtn').forEach(x=>x.classList.toggle('active',x===b));renderGantt()});
document.querySelector('#search').oninput=e=>{state.q=e.target.value.trim();renderGantt()};
document.querySelector('#milestone').onchange=e=>{state.milestone=e.target.value;renderGantt()};
document.querySelector('#platform').onchange=e=>{state.platform=e.target.value;renderGantt()};
document.querySelector('#dependencyMode').onchange=e=>{state.dep=e.target.value;renderGantt()};
document.querySelector('#zoom').onchange=e=>{state.dayPx=Number(e.target.value);renderGantt()};

renderStrip();renderGantt();
})();
