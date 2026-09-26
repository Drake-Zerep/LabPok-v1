const RANKS = ['A','K','Q','J','T','9','8','7','6','5','4','3','2'];
const ACTIONS = {
  open:{label:'OPEN',cls:'open'}, call:{label:'CALL',cls:'call'}, bet3:{label:'3BET',cls:'bet3'}, bet4:{label:'4BET VALUE',cls:'bet4'}, bluff:{label:'4BET BLUFF',cls:'bluff'}, mix:{label:'MIX',cls:'mix'}, fold:{label:'FOLD',cls:'fold'}
};
const DEFAULT_ACTIONS = ['open','call','bet3','bet4','bluff','mix','fold'];
let state = null;
let activeView = 'dashboard';
let selectedTableId = null;
let selectedAction = 'open';
let dirty = false;

const $ = (s,root=document)=>root.querySelector(s);
const $$ = (s,root=document)=>[...root.querySelectorAll(s)];

function uid(prefix='tbl'){return prefix+'_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8)}
function clone(x){return JSON.parse(JSON.stringify(x))}
function blankCells(){const c={}; for(const r of RANKS) for(const r2 of RANKS)c[r+r2]='fold'; return c}
function handAt(row,col){if(row===col)return RANKS[row]+RANKS[col]; if(col>row)return RANKS[row]+RANKS[col]+'s'; return RANKS[col]+RANKS[row]+'o'}
function matrixFrom(list,action='open'){
  const c=blankCells();
  for(const h of list) c[h]=action;
  return c;
}
function expandSimple(tokens){
  const out=new Set();
  for(const raw of tokens){
    let t=raw.trim(); if(!t)continue;
    if(/^([2-9TJQKA])\1\+$/.test(t)){const r=t[0], start=RANKS.indexOf(r); for(let i=0;i<=start;i++){const rr=RANKS[i]; if(rr>=r){} } /* handled below */}
    // pairs: 22+
    if(/^([2-9TJQKA])\1\+$/.test(t)){
      const start=RANKS.indexOf(t[0]); for(let i=0;i<=start;i++) out.add(RANKS[i]+RANKS[i]); continue;
    }
    if(/^([2-9TJQKA])\1$/.test(t)){out.add(t);continue}
    const m=t.match(/^([2-9TJQKA])([2-9TJQKA])([so])?\+?$/); if(!m)continue;
    const a=m[1],b=m[2],type=m[3]||null, plus=t.endsWith('+');
    const ia=RANKS.indexOf(a), ib=RANKS.indexOf(b);
    if(ia<0||ib<0||ia===ib)continue;
    if(!plus){out.add(a+b+(type||''));continue}
    // A8s+ => A8s,A9s,ATs,AJ s...; K9o+ => K9o,KTo,KJo,KQo
    const highIndex=ia; for(let j=ib;j>highIndex;j--){};
    for(let j=ib;j>ia;j--) out.add(a+RANKS[j]+(type||''));
  }
  return [...out];
}
function buildRange(parts,action='open'){return matrixFrom(expandSimple(parts),action)}
function addRange(c,parts,action){for(const h of expandSimple(parts))c[h]=action}
function table(id,name,category,subtitle,cells,notes='',meta={}){return {id,name,category,subtitle,cells,notes,version:1,history:[],updated:new Date().toISOString(),...meta}}
function seedState(){
  const tables=[];
  let c;
  c=blankCells(); addRange(c,['22+','A2s','A3s','A4s','A5s','A8s+','AJo+','K9s+','KJo+','Q9s+','QJo','J9s+','JTo','T9s','98s','87s','76s','65s','54s'],'open');
  tables.push(table('or_lj','LJ','OR','Open Raise · 17.3% · 230 combos',c,'Rango validado de trabajo. 2.5 BB.',{openSize:'2.5 BB',status:'VALIDADO'}));
  c=blankCells(); addRange(c,['22+','A2s','A3s','A4s','A5s','A8s+','ATo+','K8s+','KJo+','Q9s+','QJo','J9s+','JTo','T9s','98s','87s','76s','65s','54s'],'open');
  tables.push(table('or_hj','HJ','OR','Open Raise · 21.0% · 278 combos',c,'Rango validado de trabajo. 2.5 BB.',{openSize:'2.5 BB',status:'VALIDADO'}));
  c=blankCells(); addRange(c,['22+','A2s+','A2o+','K2s+','K8o+','Q5s+','Q9o+','J6s+','J8o+','T6s+','T8o+','96s+','97o+','86s+','87o+','75s+','76o+','65s','54s'],'open');
  // Keep CO explicitly pending: blank until validated in LabPok.
  tables.push(table('or_co_pending','CO','OR','Pendiente de validación · no usar como rango final',blankCells(),'CO se validará cuando empecemos a cargar los datos definitivos. Esta tabla es solo un marcador.',{openSize:'2.5 BB',status:'PENDIENTE'}));
  c=blankCells(); addRange(c,['22+','A2s+','A2o+','K2s+','K8o+','Q5s+','Q9o+','J6s+','J8o+','T6s+','T8o+','96s+','97o+','86s+','87o+','75s+','76o+','65s','54s'],'open');
  tables.push(table('or_btn','BTN','OR','Open Raise · 46.6% · 618 combos',c,'Rango validado. 2.5 BB.',{openSize:'2.5 BB',status:'VALIDADO'}));
  c=blankCells(); addRange(c,['22+','A2s+','A2o+','K2s+','K8o+','Q4s+','Q9o+','J6s+','J8o+','T6s+','T8o+','96s+','97o+','86s+','87o+','75s+','76o+','65s','54s'],'open');
  tables.push(table('or_sb','SB','OR','Open Raise · 46.9% · 622 combos',c,'Rango validado. Open 3 BB. Base raise-only.',{openSize:'3 BB',status:'VALIDADO'}));
  // BB defenses: exact validated action sets.
  const bbSets={
    lj:{bet3:['JJ+','AQs+','AKo','A5s','A4s'],call:['22+','ATs+','AJo+','KJs+','KQo','QJs','JTs','T9s','98s','87s','76s','65s']},
    hj:{bet3:['QQ+','A5s','A4s','A3s','A2s','AKs','AKo','KQs'],call:['22+','A6s+','AQo','K9s+','KQo','Q9s+','QJo','J9s+','JTo','T9s','98s','87s','76s','65s']},
    co:{bet3:['99+','A2s','A3s','A4s','A5s','AJs+','AQo+','K9s+','KQo'],call:['22+','A6s+','A9o+','K2s','K3s','K4s','K5s','K6s','K7s','K8s','KTo+','Q2s','Q3s','Q4s','Q5s','Q6s','Q7s','Q8s','Q9s','QTo+','J7s','J8s','J9s','J9o','JTo','T7s','T8s','T9s','T8o','T9o','98s','97s','87s','86s','76s','75s','65s','54s']},
    btn:{bet3:['TT+','AJs+','AQo+','A2s','A3s','A4s','A5s','K4s','K5s','K6s','K7s','K8s','K9s','Q7s','Q8s','Q9s','J7s','J8s','J9s','T9s'],call:['22+','A6s+','A9o+','K2s','K3s','KTs+','K9o+','Q2s','Q3s','Q4s','Q5s','Q6s','QTs+','Q9o+','J2s','J3s','J4s','J5s','J6s','JTs','J9o+','T2s','T3s','T4s','T5s','T6s','T7s','T8s','T9o','98s','97s','87s','86s','76s','75s','65s','54s']},
    sb:{bet3:['QQ+','AKs','AKo','A5s','A4s','A3s','A2s','K5s','K4s','Q5s','Q4s'],call:['22+','A2o+','A6s+','K2s+','K8o+','Q4s+','Q9o+','J6s+','J8o+','T6s+','T8o+','96s+','97o+','86s+','87o+','75s+','76o+','65s','54s']}
  };
  for(const [pos,sets] of Object.entries(bbSets)){c=blankCells();addRange(c,sets.call,'call');addRange(c,sets.bet3,'bet3');tables.push(table('bb_'+pos,`BB vs ${pos.toUpperCase()}`,'BB DEFENSE',`Defensa BB · ${pos.toUpperCase()}`,c,`Rango validado de trabajo contra open de ${pos.toUpperCase()}.`,{opponent:pos.toUpperCase(),status:'VALIDADO'}));}
  return {schema:'labpok.v1',app:'LabPok v1',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),settings:{theme:'black-gold-neon'},tables,categories:['OR','ISO RAISE','3BET / CC','VS 3BET','4BET','BB DEFENSE','BLIND vs BLIND'],guide:[],leaks:[],training:{},notes:[]};
}
function markDirty(){dirty=true;$('#dirtyBadge').textContent='CAMBIOS SIN EXPORTAR';$('#dirtyBadge').style.color='var(--orange)'}
function clearDirty(){dirty=false;$('#dirtyBadge').textContent='DATOS EN MEMORIA';$('#dirtyBadge').style.color='var(--green)'}
function getTable(){return state.tables.find(t=>t.id===selectedTableId)}
function actionClass(a){return ACTIONS[a]?.cls||'fold'}
function render(){renderNav();renderDashboard();renderRanges();renderGuide();}
function renderNav(){$$('.nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===activeView));$$('.view').forEach(v=>v.classList.toggle('active',v.id===`view-${activeView}`));$('#pageTitle').textContent={dashboard:'Dashboard',ranges:'Rangos',guide:'Guía de póker',training:'Entrenamiento',data:'Datos y backups'}[activeView]||'LabPok v1'}
function renderDashboard(){
  const counts={}; state.tables.forEach(t=>counts[t.category]=(counts[t.category]||0)+1);
  $('#statTables').textContent=state.tables.length; $('#statCategories').textContent=Object.keys(counts).length; $('#statVersions').textContent=state.tables.reduce((n,t)=>n+(t.history?.length||0)+1,0); $('#statStatus').textContent=dirty?'●':'✓';
  $('#categoryModules').innerHTML=state.categories.map(cat=>`<div class="module"><div class="icon">${iconFor(cat)}</div><h3>${cat}</h3><p>${counts[cat]||0} tabla(s) configurada(s).</p><span class="pill">Abrir módulo →</span></div>`).join('');
}
function iconFor(cat){return ({'OR':'↗','ISO RAISE':'⚔','3BET / CC':'3B','VS 3BET':'↔','4BET':'4B','BB DEFENSE':'♠','BLIND vs BLIND':'♣'}[cat]||'◆')}
function renderRanges(){
  const groups={}; state.tables.forEach(t=>(groups[t.category]??=[]).push(t));
  $('#rangeList').innerHTML=Object.entries(groups).map(([cat,tables])=>`<div class="list-cat"><div class="list-head"><h3>${cat}</h3><span class="muted">${tables.length}</span></div>${tables.map(t=>`<button class="list-item ${t.id===selectedTableId?'active':''}" data-table="${t.id}"><span>${t.name}</span><small>${t.status||''}</small></button>`).join('')}</div>`).join('')||'<div class="empty">No hay tablas.</div>';
  $$('.list-item').forEach(b=>b.onclick=()=>{selectedTableId=b.dataset.table;selectedAction='open';renderRanges()});
  const t=getTable();
  if(!t){$('#editorContent').innerHTML='<div class="empty">Selecciona una tabla o crea una nueva.</div>';return}
  $('#editorContent').innerHTML=editorHTML(t);bindEditor(t);
}
function editorHTML(t){
 const count={};Object.values(t.cells).forEach(a=>count[a]=(count[a]||0)+1);const total=169;const pct=a=>((count[a]||0)/total*100).toFixed(1);
 return `<div class="editor-header"><div><div class="eyebrow">${t.category} / ${t.status||'ACTIVA'}</div><h2>${escapeHtml(t.name)}</h2><p>${escapeHtml(t.subtitle||'Tabla 13×13')}</p></div><div class="editor-actions"><button class="btn" id="duplicateBtn">Duplicar</button><button class="btn" id="newVersionBtn">Guardar versión</button><button class="btn danger" id="deleteBtn">Eliminar</button></div></div>
 <div class="toolbar"><button class="btn gold" id="newTableBtn2">+ Nueva tabla</button><button class="btn" id="resetTableBtn">Restaurar tabla</button><button class="btn" id="exportOneBtn">Exportar tabla</button></div>
 <div class="editor-grid"><div class="matrix-wrap"><div class="matrix" id="matrix">${RANKS.map((r,i)=>RANKS.map((c,j)=>{const h=handAt(i,j),a=t.cells[h]||'fold';return `<button class="cell ${actionClass(a)}" data-hand="${h}" title="${h} · ${ACTIONS[a]?.label||a}">${h}</button>`}).join('')).join('')}</div><div class="legend">${Object.entries(ACTIONS).map(([k,v])=>`<span><i class="swatch ${v.cls}"></i>${v.label}</span>`).join('')}</div></div>
 <aside class="side-panel"><div class="side-box"><h4>Pintar acción</h4><div class="action-grid">${DEFAULT_ACTIONS.map(a=>`<button class="action-btn ${a===selectedAction?'active':''}" data-action="${a}">${ACTIONS[a].label}</button>`).join('')}</div></div>
 <div class="side-box"><h4>Estadísticas</h4><div class="meta-grid"><div class="field"><label>OPEN</label><input disabled value="${pct('open')}%"></div><div class="field"><label>CALL</label><input disabled value="${pct('call')}%"></div><div class="field"><label>3BET</label><input disabled value="${pct('bet3')}%"></div><div class="field"><label>FOLD</label><input disabled value="${pct('fold')}%"></div></div></div>
 <div class="side-box"><h4>Metadatos</h4><div class="meta-grid"><div class="field"><label>Nombre</label><input id="metaName" value="${escapeAttr(t.name)}"></div><div class="field"><label>Categoría</label><select id="metaCategory">${state.categories.map(c=>`<option ${c===t.category?'selected':''}>${c}</option>`).join('')}</select></div><div class="field full"><label>Subtítulo</label><input id="metaSubtitle" value="${escapeAttr(t.subtitle||'')}"></div><div class="field"><label>Status</label><select id="metaStatus"><option ${t.status==='VALIDADO'?'selected':''}>VALIDADO</option><option ${t.status==='PENDIENTE'?'selected':''}>PENDIENTE</option><option ${t.status==='EXPERIMENTAL'?'selected':''}>EXPERIMENTAL</option></select></div><div class="field"><label>Sizing</label><input id="metaSizing" value="${escapeAttr(t.openSize||'')}"></div><div class="field full"><label>Notas</label><textarea id="metaNotes">${escapeHtml(t.notes||'')}</textarea></div></div></div></aside></div>`;
}
function bindEditor(t){
 $$('#matrix .cell').forEach(cell=>cell.onclick=()=>{t.cells[cell.dataset.hand]=selectedAction; t.updated=new Date().toISOString(); markDirty(); renderRanges()});
 $$('.action-btn').forEach(b=>b.onclick=()=>{selectedAction=b.dataset.action;renderRanges()});
 $('#metaName').oninput=e=>{t.name=e.target.value;markDirty()};$('#metaCategory').onchange=e=>{t.category=e.target.value;markDirty();renderRanges()};$('#metaSubtitle').oninput=e=>{t.subtitle=e.target.value;markDirty()};$('#metaStatus').onchange=e=>{t.status=e.target.value;markDirty()};$('#metaSizing').oninput=e=>{t.openSize=e.target.value;markDirty()};$('#metaNotes').oninput=e=>{t.notes=e.target.value;markDirty()};
 $('#duplicateBtn').onclick=()=>duplicateTable(t);$('#newVersionBtn').onclick=()=>saveVersion(t);$('#deleteBtn').onclick=()=>deleteTable(t);$('#newTableBtn2').onclick=openNewModal;$('#resetTableBtn').onclick=()=>{if(confirm('Restaurar esta tabla a su versión inicial guardada? Esta acción reemplazará la matriz actual.')){const h=t.history?.[0]; if(h){t.cells=clone(h.cells);markDirty();renderRanges()}else toast('Esta tabla no tiene una versión inicial guardada.')}};$('#exportOneBtn').onclick=()=>downloadJSON({schema:'labpok.table.v1',table:t},`${slug(t.name)}.json`);
}
function saveVersion(t){t.history=t.history||[];t.history.push({version:t.version,cells:clone(t.cells),name:t.name,notes:t.notes,updated:t.updated});t.version++;t.updated=new Date().toISOString();markDirty();toast(`Versión v${t.version} guardada.`);renderRanges()}
function duplicateTable(t){const n=clone(t);n.id=uid('tbl');n.name=t.name+' · copia';n.version=1;n.history=[];n.updated=new Date().toISOString();state.tables.push(n);selectedTableId=n.id;markDirty();renderRanges();toast('Tabla duplicada.')}
function deleteTable(t){if(!confirm(`¿Eliminar «${t.name}»?`))return;state.tables=state.tables.filter(x=>x.id!==t.id);selectedTableId=state.tables[0]?.id||null;markDirty();renderRanges();toast('Tabla eliminada.')}
function openNewModal(){ $('#newModal').classList.add('open');$('#newName').focus() }
function closeModal(){$('#newModal').classList.remove('open')}
function createTable(){const name=$('#newName').value.trim()||'Nueva tabla';const category=$('#newCategory').value;const subtitle=$('#newSubtitle').value.trim();const t=table(uid('tbl'),name,category,subtitle,blankCells(),'Tabla nueva. Añade las decisiones y documenta la lógica.',{status:'EXPERIMENTAL'});t.history=[{version:1,cells:clone(t.cells),name:t.name,notes:t.notes,updated:t.updated}];state.tables.push(t);selectedTableId=t.id;closeModal();$('#newName').value='';$('#newSubtitle').value='';markDirty();renderRanges();toast('Nueva tabla creada.')}
function exportAll(){state.updated=new Date().toISOString();downloadJSON(state,`LabPok_v1_Backup_${new Date().toISOString().slice(0,10)}.json`);clearDirty();toast('Backup exportado. Guarda el archivo fuera del navegador.')}
function importAll(file){const reader=new FileReader();reader.onload=()=>{try{const data=JSON.parse(reader.result);if(!data||data.schema!=='labpok.v1')throw new Error('Formato de backup no reconocido.');state=data;selectedTableId=state.tables?.[0]?.id||null;clearDirty();render();toast('Backup cargado correctamente.')}catch(e){alert(e.message)}};reader.readAsText(file)}
function exportSelected(){const t=getTable();if(t)downloadJSON({schema:'labpok.table.v1',table:t},`${slug(t.name)}.json`)}
function downloadJSON(data,name){const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500)}
function slug(s){return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'')}
function escapeHtml(s=''){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function escapeAttr(s=''){return escapeHtml(s)}
function renderGuide(){
 $('#guideContent').innerHTML=`<div class="hero"><div class="card hero-main"><div class="eyebrow">Poker Lab / Guía</div><h2>Juega con <span class="hero-accent">estrategia</span>.</h2><p>Esta pestaña será el manual operativo de tu sistema: categorías de manos, C-BET, texturas, sizings, 3BET, defensa de ciegas y principios de toma de decisiones. En esta Fase 1 dejamos la estructura lista para incorporar la guía completa de la infografía.</p></div><div class="card quick-grid"><div class="quick"><strong>MF</strong><span>Mano fuerte / valor.</span></div><div class="quick"><strong>MS</strong><span>Showdown value.</span></div><div class="quick"><strong>AN</strong><span>Aire / proyecto.</span></div><div class="quick"><strong>BOARD</strong><span>Textura determina sizing.</span></div></div></div><div class="grid cards"><div class="card"><div class="stat-label">Regla madre</div><div class="stat-value">25–33%</div><div class="stat-foot">Boards secos y estáticos → tamaños pequeños.</div></div><div class="card"><div class="stat-label">Por defecto</div><div class="stat-value">50–66%</div><div class="stat-foot">Cuando la textura exige presión y no hay lectura clara.</div></div><div class="card"><div class="stat-label">Dinámico</div><div class="stat-value">75%+</div><div class="stat-foot">Boards húmedos y conectados.</div></div><div class="card"><div class="stat-label">Principio</div><div class="stat-value">EV+</div><div class="stat-foot">Disciplina, paciencia y decisiones repetibles.</div></div></div><div class="section-title">Bloques de la guía</div><div class="module-grid"><div class="module"><div class="icon">♛</div><h3>Monster / MF / MS / AN</h3><p>Categoriza la fuerza de tu mano antes de decidir la línea.</p></div><div class="module"><div class="icon">◎</div><h3>C-BET</h3><p>Dry high-card boards, paired boards, monotone y proyectos.</p></div><div class="module"><div class="icon">▥</div><h3>Texturas</h3><p>K72r, J96 two-tone, 987 two-tone, 772 y monotone.</p></div><div class="module"><div class="icon">3B</div><h3>3BET</h3><p>Construcción por posición y función de cada combo.</p></div><div class="module"><div class="icon">♠</div><h3>Big Blind</h3><p>Defensa frente a aperturas y blind-vs-blind.</p></div><div class="module"><div class="icon">↗</div><h3>Steal</h3><p>CO / BTN / SB como posiciones críticas de robo.</p></div></div>`;
}
function switchView(v){activeView=v; if(v==='ranges'&&!selectedTableId)selectedTableId=state.tables[0]?.id||null;renderNav();if(v==='ranges')renderRanges();if(v==='dashboard')renderDashboard();if(v==='guide')renderGuide()}
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(toast._t);toast._t=setTimeout(()=>t.classList.remove('show'),2200)}

window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue=''}});
document.addEventListener('DOMContentLoaded',()=>{
 state=seedState(); selectedTableId=state.tables[0].id;
 $$('.nav button').forEach(b=>b.onclick=()=>switchView(b.dataset.view));
 $('#newTableBtn').onclick=openNewModal;$('#exportBtn').onclick=exportAll;$('#importBtn').onclick=()=>$('#importFile').click();$('#importFile').onchange=e=>e.target.files[0]&&importAll(e.target.files[0]);$('#closeModal').onclick=closeModal;$('#cancelModal').onclick=closeModal;$('#createTable').onclick=createTable;$('#newModal').onclick=e=>{if(e.target.id==='newModal')closeModal()};
 $('#newCategory').innerHTML=state.categories.map(c=>`<option>${c}</option>`).join('');
 render();
});
