(() => {
'use strict';

const d = window.CPM_DATA;
const tasks = d.tasks;
const taskMap = new Map(tasks.map(t => [t.id, t]));
const baselineTasks = new Map(tasks.map(t => [t.id, JSON.parse(JSON.stringify(t))]));
const baselineEdges = d.edges.map(e => ({...e}));
const projectStart = new Date(d.meta.projectStart + 'T00:00:00');
const DAY = 86400000;
const STORAGE_KEY = 'dm-scp-gantt-cpm-editor-v2';
const taskPane = document.querySelector('#taskPane');
const timelinePane = document.querySelector('#timelinePane');

const state = {
  view:'gantt', filter:'ALL', milestone:'ALL', platform:'ALL', q:'', dep:'CRITICAL', dayPx:3.6,
  collapsed:new Set(), anchors:{}, orders:{}, undo:[], currentEdges:[], scheduleEnd:null, renderQueued:false
};

function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function date(s){return new Date(s+'T00:00:00')}
function fmt(dt){return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`}
function calendarDayDiff(a,b){return Math.round((b-a)/DAY)}
function addBusinessDays(date0,n){
  const dt=new Date(date0); let rem=Math.max(0,Math.round(n));
  while(rem>0){dt.setDate(dt.getDate()+1);const w=dt.getDay();if(w!==0&&w!==6)rem--}
  return dt;
}
function businessDayIndex(date0, target){
  let a=new Date(date0); a.setHours(0,0,0,0); let b=new Date(target); b.setHours(0,0,0,0);
  if(b<=a)return 0;
  let n=0; while(a<b){a.setDate(a.getDate()+1);const w=a.getDay();if(w!==0&&w!==6)n++}
  return n;
}
function xForDate(dt){return calendarDayDiff(projectStart,dt)*state.dayPx}
function projectEnd(){return state.scheduleEnd || date(d.meta.projectEnd)}
function groupKey(t){return `${t.milestone}|||${t.module}|||${t.platform}`}
function cloneEditor(){return {anchors:{...state.anchors},orders:JSON.parse(JSON.stringify(state.orders))}}
function pushUndo(){state.undo.push(cloneEditor());if(state.undo.length>20)state.undo.shift();updateEditorButtons()}
function saveEditor(){localStorage.setItem(STORAGE_KEY,JSON.stringify({anchors:state.anchors,orders:state.orders,collapsed:[...state.collapsed]}))}
function loadEditor(){
  try{const x=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');state.anchors=x.anchors||{};state.orders=x.orders||{};state.collapsed=new Set(x.collapsed||[])}catch(_){/* ignore */}
}
function toast(msg,type='info'){
  let el=document.querySelector('#toast');if(!el){el=document.createElement('div');el.id='toast';document.body.appendChild(el)}
  el.className=`toast show ${type}`;el.textContent=msg;clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),2600);
}

// -------------------- editable workstream sequence model --------------------
const sequenceGroups = new Map();
for(const t of tasks){
  if(t.type!=='Capability Build')continue;
  const key=groupKey(t);if(!sequenceGroups.has(key))sequenceGroups.set(key,{key,tasks:[]});sequenceGroups.get(key).tasks.push(t.id);
}
for(const g of sequenceGroups.values()){
  g.tasks.sort((a,b)=>baselineTasks.get(a).es-baselineTasks.get(b).es||a.localeCompare(b));
  g.baselineOrder=[...g.tasks];
  g.startEdge=baselineEdges.find(e=>e.label==='Workstream start'&&g.tasks.includes(e.to)) || null;
  g.lags=[];
  for(let i=0;i<g.tasks.length-1;i++){
    const e=baselineEdges.find(e=>e.label==='Planned workstream sequence'&&e.from===g.tasks[i]&&e.to===g.tasks[i+1]);
    g.lags.push(e?e.weight:2);
  }
}
function validOrder(g, candidate){return Array.isArray(candidate)&&candidate.length===g.baselineOrder.length&&candidate.every(x=>g.baselineOrder.includes(x))&&new Set(candidate).size===candidate.length}
function currentOrder(g){const o=state.orders[g.key];return validOrder(g,o)?o:g.baselineOrder}
function rebuildEdges(){
  const edges=baselineEdges.filter(e=>e.label!=='Workstream start'&&e.label!=='Planned workstream sequence').map(e=>({...e,critical:false}));
  for(const g of sequenceGroups.values()){
    const order=currentOrder(g);
    if(g.startEdge&&order.length){edges.push({...g.startEdge,to:order[0],critical:false})}
    for(let i=0;i<order.length-1;i++){
      const w=g.lags[i] ?? g.lags[g.lags.length-1] ?? 2;
      edges.push({from:order[i],to:order[i+1],weight:w,relation:`SS+${w}`,label:'Planned workstream sequence',critical:false});
    }
  }
  return edges;
}

// -------------------- CPM recompute --------------------
function recalcSchedule(){
  const base=rebuildEdges();
  const internal=[...base];
  for(const [id,w] of Object.entries(state.anchors)){
    if(taskMap.has(id)&&Number.isFinite(Number(w)))internal.push({from:'START',to:id,weight:Math.max(0,Math.round(Number(w))),relation:`SS+${Math.max(0,Math.round(Number(w)))}`,label:'Manual start constraint',critical:false,manual:true});
  }
  const nodes=['START',...tasks.map(t=>t.id)], indeg=new Map(nodes.map(n=>[n,0])), succ=new Map(nodes.map(n=>[n,[]])), incoming=new Map(nodes.map(n=>[n,[]]));
  for(const e of internal){if(!indeg.has(e.from)||!indeg.has(e.to))continue;succ.get(e.from).push(e);incoming.get(e.to).push(e);indeg.set(e.to,indeg.get(e.to)+1)}
  const q=nodes.filter(n=>indeg.get(n)===0).sort(), topo=[];
  while(q.length){const n=q.shift();topo.push(n);for(const e of succ.get(n)){indeg.set(e.to,indeg.get(e.to)-1);if(indeg.get(e.to)===0)q.push(e.to)}}
  if(topo.length!==nodes.length){toast('此拖曳會造成循環相依，已取消。','error');return false}
  const dur=new Map(tasks.map(t=>[t.id,Number(t.duration)]));dur.set('START',0);
  const ES=new Map(nodes.map(n=>[n,0]));
  for(const n of topo){for(const e of succ.get(n)){const cand=ES.get(n)+e.weight;if(cand>ES.get(e.to))ES.set(e.to,cand)}}
  const final=taskMap.has('WBS-128')?'WBS-128':tasks.filter(t=>t.type==='User Release Gate').sort((a,b)=>a.es-b.es).at(-1).id;
  const LS=new Map(nodes.map(n=>[n,Infinity]));LS.set(final,ES.get(final));
  for(let i=topo.length-1;i>=0;i--){const n=topo[i];if(n===final)continue;let best=Infinity;for(const e of succ.get(n)){const v=LS.get(e.to);if(Number.isFinite(v))best=Math.min(best,v-e.weight)}if(Number.isFinite(best))LS.set(n,best)}
  const TF=new Map(nodes.map(n=>[n,Number.isFinite(LS.get(n))?Math.max(0,LS.get(n)-ES.get(n)):9999]));
  for(const e of internal){e.critical=TF.get(e.from)===0&&TF.get(e.to)===0&&ES.get(e.to)===ES.get(e.from)+e.weight}
  // update tasks
  for(const t of tasks){
    t.es=Math.round(ES.get(t.id));t.ef=t.es+Number(t.duration);t.ls=Math.round(LS.get(t.id));t.lf=t.ls+Number(t.duration);t.float=Math.max(0,t.ls-t.es);t.critical=t.float===0;t.nearCritical=t.float>0&&t.float<=2;
    const s=addBusinessDays(projectStart,t.es), e=addBusinessDays(projectStart,t.es+Math.max(0,t.duration-1));
    t.plannedStart=fmt(s);t.plannedEnd=fmt(e);
  }
  // current predecessor display
  for(const t of tasks)t.predecessors=[];
  for(const e of internal){if(e.to!=='START'&&taskMap.has(e.to))taskMap.get(e.to).predecessors.push({id:e.from,relation:e.relation,label:e.label,critical:e.critical})}
  // milestones
  for(const m of d.milestones){
    const group=tasks.filter(t=>t.milestone===m.milestone);const gate=group.find(t=>t.type==='User Release Gate');
    const minEs=Math.min(...group.map(t=>t.es));m.start=fmt(addBusinessDays(projectStart,minEs));m.end=gate?gate.plannedEnd:fmt(addBusinessDays(projectStart,Math.max(...group.map(t=>t.ef))-1));
    m.criticalCount=group.filter(t=>t.critical).length;m.nearCriticalCount=group.filter(t=>t.nearCritical).length;
  }
  // critical path: choose the deepest controlling zero-float chain (avoids skipping a critical readiness task at a merge).
  const depth=new Map(nodes.map(n=>[n,n==='START'?0:-1])),criticalPred=new Map();
  for(const n of topo){if(n==='START')continue;const cand=(incoming.get(n)||[]).filter(e=>e.critical&&depth.get(e.from)>=0);if(cand.length){cand.sort((a,b)=>depth.get(b.from)-depth.get(a.from));criticalPred.set(n,cand[0]);depth.set(n,depth.get(cand[0].from)+1)}}
  const path=[];let cur=final,safety=0;while(cur&&cur!=='START'&&safety++<300){path.push(cur);const e=criticalPred.get(cur);if(!e)break;cur=e.from}path.reverse();
  d.meta.criticalPath=path;d.meta.criticalCount=tasks.filter(t=>t.critical).length;d.meta.nearCriticalCount=tasks.filter(t=>t.nearCritical).length;
  d.meta.projectWorkdays=taskMap.get(final).ef;d.meta.projectWeeks=Math.ceil(d.meta.projectWorkdays/5);state.scheduleEnd=addBusinessDays(projectStart,Math.max(0,d.meta.projectWorkdays-1));d.meta.projectEnd=fmt(state.scheduleEnd);
  state.currentEdges=base.map(e=>{const match=internal.find(x=>!x.manual&&x.from===e.from&&x.to===e.to&&x.label===e.label);return {...e,critical:match?match.critical:false}});
  // manual predecessor edges are useful in drawer, but don't clutter normal dependency layer
  updateKpis();updateEditorButtons();saveEditor();return true;
}

function updateKpis(){document.querySelector('#kWeeks').textContent=d.meta.projectWeeks;document.querySelector('#kTasks').textContent=d.meta.taskCount;document.querySelector('#kCrit').textContent=d.meta.criticalCount;document.querySelector('#kNear').textContent=d.meta.nearCriticalCount}
function updateEditorButtons(){document.querySelector('#undoBtn').disabled=!state.undo.length;document.querySelector('#resetBtn').disabled=!Object.keys(state.anchors).length&&!Object.keys(state.orders).length}
function scheduleRender(){if(state.renderQueued)return;state.renderQueued=true;requestAnimationFrame(()=>{state.renderQueued=false;renderStrip();renderGantt();if(state.view==='critical')renderCritical();if(state.view==='releases')renderReleases()})}

// -------------------- filtering / rows --------------------
function matches(t){
 if(state.milestone!=='ALL'&&t.milestone!==state.milestone)return false;
 if(state.platform!=='ALL'&&t.platform!==state.platform)return false;
 if(state.filter==='CRITICAL'&&!t.critical)return false;
 if(state.filter==='NEAR'&&!(t.critical||t.nearCritical))return false;
 const q=state.q.toLowerCase();if(q&&!([t.id,t.name,t.module,t.owner,t.useCase,t.release].join(' ').toLowerCase().includes(q)))return false;return true;
}
const moduleRank=new Map();let mr=0;for(const t of [...tasks].sort((a,b)=>baselineTasks.get(a.id).es-baselineTasks.get(b.id).es)){const k=`${t.milestone}|||${t.module}|||${t.platform}`;if(!moduleRank.has(k))moduleRank.set(k,mr++)}
function taskSort(a,b){
 const ma=Number(a.milestone.slice(1)),mb=Number(b.milestone.slice(1));if(ma!==mb)return ma-mb;
 const typeRank=x=>x.type==='Release/Foundation'?0:x.type==='Capability Build'?1:2;const tr=typeRank(a)-typeRank(b);if(tr)return tr;
 if(a.type==='Capability Build'&&b.type==='Capability Build'){
   const ga=groupKey(a),gb=groupKey(b);if(ga!==gb)return (moduleRank.get(ga)||0)-(moduleRank.get(gb)||0);
   const g=sequenceGroups.get(ga),o=g?currentOrder(g):[];return o.indexOf(a.id)-o.indexOf(b.id);
 }
 return a.es-b.es||a.id.localeCompare(b.id);
}
function visibleRows(){const vt=tasks.filter(matches).sort(taskSort),rows=[];for(const m of d.milestones){const group=vt.filter(t=>t.milestone===m.milestone);if(!group.length)continue;rows.push({kind:'group',milestone:m,id:`GROUP-${m.milestone}`});if(!state.collapsed.has(m.milestone))group.forEach(t=>rows.push({kind:'task',task:t,id:t.id}))}return rows}
function statusClass(t){return t.critical?'critical':t.nearCritical?'near':(t.platform||'Cross').toLowerCase()}

// -------------------- timeline --------------------
function buildHeader(totalWidth){
 const h=document.querySelector('#timelineHeader');h.style.width=totalWidth+'px';let out='';const endDate=projectEnd();let cur=new Date(projectStart.getFullYear(),projectStart.getMonth(),1);
 while(cur<=endDate){const next=new Date(cur.getFullYear(),cur.getMonth()+1,1),start=cur<projectStart?projectStart:cur,end=next>endDate?new Date(endDate.getTime()+DAY):next,x=xForDate(start),w=Math.max(1,calendarDayDiff(start,end)*state.dayPx);out+=`<div class="monthCell" style="left:${x}px;width:${w}px">${start.getFullYear()} / ${start.getMonth()+1}</div>`;cur=next}
 let wk=new Date(projectStart),delta=(wk.getDay()+6)%7;wk.setDate(wk.getDate()-delta);let wi=1;while(wk<=endDate){const s=wk<projectStart?projectStart:wk,e=new Date(wk);e.setDate(e.getDate()+7);const ee=e>endDate?new Date(endDate.getTime()+DAY):e,x=xForDate(s),w=Math.max(1,calendarDayDiff(s,ee)*state.dayPx);if(w>0)out+=`<div class="weekCell" style="left:${x}px;width:${w}px">W${wi}</div>`;wk=e;wi++}h.innerHTML=out;
}

function renderGantt(){
 const rows=visibleRows(),totalDays=calendarDayDiff(projectStart,new Date(projectEnd().getTime()+DAY)),totalWidth=Math.max(1250,totalDays*state.dayPx+80);document.documentElement.style.setProperty('--weekPx',(7*state.dayPx)+'px');
 const taskRows=document.querySelector('#taskRows'),tlRows=document.querySelector('#timelineRows');taskRows.innerHTML='';tlRows.innerHTML='';buildHeader(totalWidth);document.querySelector('#timelineCanvas').style.width=totalWidth+'px';
 const rowPos=new Map();let y=0,displaySeq=0;
 for(const row of rows){
   if(row.kind==='group'){
     const m=row.milestone,collapsed=state.collapsed.has(m.milestone),chev=collapsed?'▸':'▾';
     taskRows.insertAdjacentHTML('beforeend',`<div class="groupRow milestoneToggle" data-milestone="${m.milestone}" title="點擊收合 / 展開"><div class="groupName"><span class="chev">${chev}</span>${esc(m.milestone)} · ${esc(m.release)}</div><div class="groupMeta">${esc(m.start)} → ${esc(m.end)}</div></div>`);
     const start=date(m.start),end=date(m.end),left=xForDate(start),right=xForDate(end),width=Math.max(8,right-left+state.dayPx);
     tlRows.insertAdjacentHTML('beforeend',`<div class="timelineGroup milestoneToggle" data-milestone="${m.milestone}" style="width:${totalWidth}px" title="點擊收合 / 展開"><div class="groupWindow" style="left:${left}px;width:${width}px"></div><div class="groupWindowLabel" style="left:${left+6}px">${chev} ${esc(m.milestone)} · ${esc(m.release)}</div></div>`);y+=34;displaySeq=0;
   }else{
     const t=row.task,cls=statusClass(t),clean=t.name.replace(' - 建置與驗證','');displaySeq++;
     const canReorder=t.type==='Capability Build';
     taskRows.insertAdjacentHTML('beforeend',`<div class="taskRow ${t.critical?'critical':t.nearCritical?'near':''} ${canReorder?'reorderable':''}" data-task="${t.id}" ${canReorder?'draggable="true"':''}><div class="wbs"><span class="dragHandle" title="拖曳調整同模組順序">${canReorder?'⋮⋮':''}</span>${esc(t.id)}</div><div title="${esc(t.name)}"><span class="seqNo">${displaySeq}.</span> ${esc(clean)}</div><div title="${esc(t.owner)}">${esc(t.owner)}</div><div class="dur">${t.duration}d</div><div class="float">${t.float}d</div></div>`);
     const s=date(t.plannedStart),e=date(t.plannedEnd),left=xForDate(s),endX=xForDate(new Date(e.getTime()+DAY)),width=Math.max(5,endX-left),latestFinish=addBusinessDays(e,t.float),lfX=xForDate(new Date(latestFinish.getTime()+DAY)),tailWidth=Math.max(0,lfX-endX),label=clean.length>22?clean.slice(0,22)+'…':clean;let content='';
     if(t.type==='User Release Gate'){const dx=Math.max(0,endX-7);content+=`<div class="releaseDiamond draggableBar" data-task="${t.id}" style="left:${dx}px" title="拖曳調整 Release Gate"></div><div class="releaseLabel" style="left:${endX+8}px">${esc(t.release)}</div>`}
     else{content+=`<div class="ganttBar ${cls} draggableBar" data-task="${t.id}" style="left:${left}px;width:${width}px" title="拖曳調整開始時間"><span class="barLabel">${esc(label)}</span></div>`}
     if(t.float>0)content+=`<div class="floatTail" style="left:${endX}px;width:${tailWidth}px"></div><div class="floatCap" style="left:${lfX}px"></div>`;
     tlRows.insertAdjacentHTML('beforeend',`<div class="timelineRow" style="width:${totalWidth}px">${content}</div>`);rowPos.set(t.id,{y:y+17,startX:left,finishX:endX,task:t});y+=36;
   }
 }
 bindMilestoneToggles();bindTaskClicks();bindReorder();bindBarDrag();renderDependencies(rowPos,totalWidth,y);
}

function renderDependencies(rowPos,totalWidth,totalHeight){
 const svg=document.querySelector('#dependencySvg');svg.setAttribute('width',totalWidth);svg.setAttribute('height',Math.max(totalHeight,400));svg.style.width=totalWidth+'px';svg.style.height=Math.max(totalHeight,400)+'px';if(state.dep==='NONE'){svg.innerHTML='';return}
 const visible=new Set([...rowPos.keys()]);let h=`<defs><marker id="arr" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#98a8b7"/></marker><marker id="arrCrit" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#d92d20"/></marker></defs>`;
 for(const e of state.currentEdges){if(e.from==='START'||!visible.has(e.from)||!visible.has(e.to))continue;if(state.dep==='CRITICAL'&&!e.critical)continue;const a=rowPos.get(e.from),b=rowPos.get(e.to),rel=e.relation||'FS',source=rel.startsWith('SS')?a.startX:a.finishX,target=rel.startsWith('FF')?b.finishX:b.startX,y1=a.y,y2=b.y,elbow=Math.max(source+12,Math.min(target-12,(source+target)/2)),cls=e.critical?'dep critical':'dep',marker=e.critical?'arrCrit':'arr';h+=`<path class="${cls}" d="M${source},${y1} H${elbow} V${y2} H${target}" marker-end="url(#${marker})"/>`;if(e.critical)h+=`<text x="${elbow+3}" y="${Math.min(y1,y2)+Math.abs(y2-y1)/2-3}" class="depLabel critical">${esc(rel)}</text>`}
 svg.innerHTML=h;
}

// -------------------- milestone collapse --------------------
function bindMilestoneToggles(){document.querySelectorAll('.milestoneToggle').forEach(el=>el.addEventListener('click',()=>{const m=el.dataset.milestone;if(state.collapsed.has(m))state.collapsed.delete(m);else state.collapsed.add(m);saveEditor();scheduleRender()}))}

// -------------------- vertical reorder --------------------
let dragTaskId=null;
function bindReorder(){
 document.querySelectorAll('.taskRow.reorderable').forEach(row=>{
   row.addEventListener('dragstart',e=>{dragTaskId=row.dataset.task;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',dragTaskId);row.classList.add('dragging')});
   row.addEventListener('dragover',e=>{if(!dragTaskId)return;const src=taskMap.get(dragTaskId),dst=taskMap.get(row.dataset.task);if(!src||!dst||groupKey(src)!==groupKey(dst))return;e.preventDefault();e.dataTransfer.dropEffect='move';document.querySelectorAll('.dropTarget').forEach(x=>x.classList.remove('dropTarget'));row.classList.add('dropTarget')});
   row.addEventListener('drop',e=>{e.preventDefault();const src=taskMap.get(dragTaskId),dst=taskMap.get(row.dataset.task);document.querySelectorAll('.dropTarget').forEach(x=>x.classList.remove('dropTarget'));if(!src||!dst||groupKey(src)!==groupKey(dst)){toast('只能在同一里程碑、同一功能模組內調整 WBS 順序。','warn');return}if(src.id===dst.id)return;pushUndo();const g=sequenceGroups.get(groupKey(src)),order=[...currentOrder(g)],from=order.indexOf(src.id);order.splice(from,1);let to=order.indexOf(dst.id);const rect=row.getBoundingClientRect();if(e.clientY>rect.top+rect.height/2)to++;order.splice(Math.max(0,to),0,src.id);state.orders[g.key]=order;if(!recalcSchedule()){state.undo.pop();return}toast(`${src.id} 已重新排序；時間與要徑已重算。`,'success');scheduleRender()});
   row.addEventListener('dragend',()=>{dragTaskId=null;document.querySelectorAll('.dragging,.dropTarget').forEach(x=>x.classList.remove('dragging','dropTarget'))});
 });
}

// -------------------- horizontal bar drag --------------------
let barDrag=null,raf=0;
function bindBarDrag(){
 document.querySelectorAll('.draggableBar').forEach(bar=>bar.addEventListener('pointerdown',e=>{
   if(e.button!==0)return;e.preventDefault();e.stopPropagation();const t=taskMap.get(bar.dataset.task);if(!t)return;bar.setPointerCapture(e.pointerId);barDrag={bar,t,startX:e.clientX,dx:0,moved:false,originES:t.es,originDate:date(t.plannedStart)};bar.classList.add('barDragging');showDragTip(e.clientX,e.clientY,t.plannedStart);
 }))
}
window.addEventListener('pointermove',e=>{if(!barDrag)return;barDrag.dx=e.clientX-barDrag.startX;if(Math.abs(barDrag.dx)>3)barDrag.moved=true;if(!raf)raf=requestAnimationFrame(()=>{raf=0;if(!barDrag)return;barDrag.bar.style.transform=`translateX(${barDrag.dx}px)`;const cal=Math.round(barDrag.dx/state.dayPx),dt=new Date(barDrag.originDate);dt.setDate(dt.getDate()+cal);showDragTip(e.clientX,e.clientY,fmt(dt))})});
window.addEventListener('pointerup',e=>{if(!barDrag)return;const x=barDrag;hideDragTip();x.bar.classList.remove('barDragging');x.bar.style.transform='';barDrag=null;if(!x.moved){openTask(x.t.id);return}const cal=Math.round(x.dx/state.dayPx),target=new Date(x.originDate);target.setDate(target.getDate()+cal);const requested=Math.max(0,businessDayIndex(projectStart,target));pushUndo();state.anchors[x.t.id]=requested;const before=x.t.es;if(!recalcSchedule()){state.undo.pop();return}const actual=taskMap.get(x.t.id).es;if(actual>requested)toast(`${x.t.id} 受前置條件限制，已吸附到最早可行日期 ${taskMap.get(x.t.id).plannedStart}。`,'warn');else toast(`${x.t.id} 已調整；後續日期、Float 與要徑已重算。`,'success');scheduleRender()});
function showDragTip(x,y,text){let tip=document.querySelector('#dragTip');if(!tip){tip=document.createElement('div');tip.id='dragTip';tip.className='dragTip';document.body.appendChild(tip)}tip.textContent=text;tip.style.left=(x+14)+'px';tip.style.top=(y+14)+'px';tip.classList.add('show')}
function hideDragTip(){document.querySelector('#dragTip')?.classList.remove('show')}

// -------------------- summary views --------------------
function renderStrip(){const el=document.querySelector('#criticalStripPath');el.innerHTML=d.meta.criticalPath.map((id,i)=>{const t=taskMap.get(id);return `${i?'<span class="stripArrow">→</span>':''}<button class="stripNode" data-task="${id}">${id} · ${esc(t.release||t.name)}</button>`}).join('');el.querySelectorAll('[data-task]').forEach(x=>x.onclick=()=>openTask(x.dataset.task))}
function renderReleases(){document.querySelector('#releaseGrid').innerHTML=d.milestones.map(m=>`<article class="releaseCard"><span class="m">${esc(m.milestone)}</span><h3>${esc(m.release)}</h3><p>${m.start} → ${m.end}</p><ul>${String(m.useCase||'').split(';').map(x=>`<li>${esc(x.trim())}</li>`).join('')}</ul><div class="releaseMeta"><span>Critical ${m.criticalCount}</span><span>Near-critical ${m.nearCriticalCount}</span></div></article>`).join('')}
function renderCritical(){document.querySelector('#criticalList').innerHTML=d.meta.criticalPath.map(id=>{const t=taskMap.get(id);return `<div class="pathItem" data-task="${id}"><strong>${id} · ${esc(t.name)}</strong><span>${esc(t.milestone)} · ${t.duration}d · ${t.plannedStart} → ${t.plannedEnd}</span></div>`}).join('');const near=tasks.filter(t=>t.nearCritical).sort((a,b)=>a.float-b.float||a.es-b.es);document.querySelector('#nearList').innerHTML=near.map(t=>`<div class="nearItem" data-task="${t.id}"><strong>${t.id} · ${esc(t.name)}</strong><span>${esc(t.milestone)} / ${esc(t.module)} · Float ${t.float}d</span></div>`).join('');document.querySelectorAll('[data-task]').forEach(x=>x.addEventListener('click',()=>openTask(x.dataset.task)))}

// -------------------- drawer --------------------
function openTask(id){const t=taskMap.get(id);if(!t)return;const stateChip=t.critical?'<span class="chip critical">Critical Path</span>':t.nearCritical?'<span class="chip near">Near-critical</span>':'';const anchor=state.anchors[id]!=null?`<span class="chip edited">Manual start: D${state.anchors[id]}</span>`:'';document.querySelector('#drawerBody').innerHTML=`<div class="chips"><span class="chip">${esc(t.milestone)}</span><span class="chip">${esc(t.platform)}</span>${stateChip}${anchor}</div><h2>${esc(t.id)} · ${esc(t.name)}</h2><p>${esc(t.release)}</p><div class="metricGrid"><div class="metric"><strong>${t.duration}d</strong><span>Duration</span></div><div class="metric"><strong>${t.hours}h</strong><span>Hours</span></div><div class="metric"><strong>${t.float}d</strong><span>Total Float</span></div><div class="metric"><strong>${t.critical?'Critical':t.nearCritical?'Near':'Normal'}</strong><span>CPM Status</span></div></div><div class="drawerSection"><h3>Gantt Schedule</h3><p>Planned: ${t.plannedStart} → ${t.plannedEnd}<br>ES / EF: D${t.es} / D${t.ef}<br>LS / LF: D${t.ls} / D${t.lf}</p></div><div class="drawerSection"><h3>Owner</h3><p>${esc(t.owner)}</p></div><div class="drawerSection"><h3>Use Case</h3><p>${esc(t.useCase)}</p></div><div class="drawerSection"><h3>Predecessors</h3>${t.predecessors.length?t.predecessors.map(p=>`<div class="pred ${p.critical?'critical':''}">${esc(p.id)} · ${esc(p.relation)} · ${esc(p.label)}</div>`).join(''):'<p>Project start</p>'}</div>`;document.querySelector('#backdrop').classList.remove('hidden');document.querySelector('#drawer').classList.add('open');document.querySelector('#drawer').setAttribute('aria-hidden','false')}
function closeDrawer(){document.querySelector('#backdrop').classList.add('hidden');document.querySelector('#drawer').classList.remove('open');document.querySelector('#drawer').setAttribute('aria-hidden','true')}
function bindTaskClicks(){document.querySelectorAll('.taskRow[data-task]').forEach(x=>x.addEventListener('click',e=>{if(e.target.closest('.dragHandle'))return;openTask(x.dataset.task)}))}

// -------------------- editor actions --------------------
function undo(){if(!state.undo.length)return;const snap=state.undo.pop();state.anchors={...snap.anchors};state.orders=JSON.parse(JSON.stringify(snap.orders));recalcSchedule();toast('已復原上一個排程調整。','success');scheduleRender()}
function resetSchedule(){if(!Object.keys(state.anchors).length&&!Object.keys(state.orders).length)return;pushUndo();state.anchors={};state.orders={};recalcSchedule();toast('已恢復原始 WBS 排程與順序。','success');scheduleRender()}

// -------------------- events --------------------
loadEditor();
for(const m of d.milestones){const o=document.createElement('option');o.value=m.milestone;o.textContent=`${m.milestone} · ${m.release}`;document.querySelector('#milestone').appendChild(o)}
let syncing=false;taskPane.addEventListener('scroll',()=>{if(syncing)return;syncing=true;timelinePane.scrollTop=taskPane.scrollTop;syncing=false});timelinePane.addEventListener('scroll',()=>{if(syncing)return;syncing=true;taskPane.scrollTop=timelinePane.scrollTop;syncing=false});
document.querySelectorAll('.viewBtn').forEach(b=>b.onclick=()=>{state.view=b.dataset.view;document.querySelectorAll('.viewBtn').forEach(x=>x.classList.toggle('active',x===b));document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));document.querySelector(`#${state.view}View`).classList.add('active');if(state.view==='releases')renderReleases();if(state.view==='critical')renderCritical()});
document.querySelectorAll('.filterBtn').forEach(b=>b.onclick=()=>{state.filter=b.dataset.filter;document.querySelectorAll('.filterBtn').forEach(x=>x.classList.toggle('active',x===b));scheduleRender()});
document.querySelector('#search').oninput=e=>{state.q=e.target.value.trim();scheduleRender()};document.querySelector('#milestone').onchange=e=>{state.milestone=e.target.value;scheduleRender()};document.querySelector('#platform').onchange=e=>{state.platform=e.target.value;scheduleRender()};document.querySelector('#dependencyMode').onchange=e=>{state.dep=e.target.value;scheduleRender()};document.querySelector('#zoom').onchange=e=>{state.dayPx=Number(e.target.value);scheduleRender()};document.querySelector('#undoBtn').onclick=undo;document.querySelector('#resetBtn').onclick=resetSchedule;document.querySelector('#closeDrawer').onclick=closeDrawer;document.querySelector('#backdrop').onclick=closeDrawer;

if(!recalcSchedule()){state.anchors={};state.orders={};recalcSchedule()}
renderStrip();renderGantt();updateEditorButtons();
})();
