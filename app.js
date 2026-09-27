const RANKS = ['A','K','Q','J','T','9','8','7','6','5','4','3','2'];
const BUILTIN_ACTIONS = {
  open:{label:'OPEN',color:'#f6c945',text:'#090a0c'},
  call:{label:'CALL',color:'#2453a6',text:'#ffffff'},
  bet3:{label:'3BET',color:'#a23fce',text:'#ffffff'},
  bet4:{label:'4BET VALUE',color:'#f97316',text:'#090a0c'},
  bluff:{label:'4BET BLUFF',color:'#ef476f',text:'#ffffff'},
  mix:{label:'MIX',color:'#2f9b66',text:'#ffffff'},
  fold:{label:'FOLD',color:'#171a20',text:'#717781'}
};
const DEFAULT_ACTIONS = Object.keys(BUILTIN_ACTIONS);
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
function matrixFrom(list,action='open'){const c=blankCells();for(const h of list)c[h]=action;return c}
function expandSimple(tokens){
  const out=new Set();
  for(const raw of tokens){
    const t=raw.trim(); if(!t)continue;
    if(/^([2-9TJQKA])\1\+$/.test(t)){const start=RANKS.indexOf(t[0]);for(let i=0;i<=start;i++)out.add(RANKS[i]+RANKS[i]);continue}
    if(/^([2-9TJQKA])\1$/.test(t)){out.add(t);continue}
    const m=t.match(/^([2-9TJQKA])([2-9TJQKA])([so])?\+?$/); if(!m)continue;
    const a=m[1],b=m[2],type=m[3]||null,plus=t.endsWith('+');
    const ia=RANKS.indexOf(a),ib=RANKS.indexOf(b); if(ia<0||ib<0||ia===ib)continue;
    if(!plus){out.add(a+b+(type||''));continue}
    for(let j=ib;j>ia;j--)out.add(a+RANKS[j]+(type||''));
  }
  return [...out];
}
function addRange(c,parts,action){for(const h of expandSimple(parts))c[h]=action}
function table(id,name,category,subtitle,cells,notes='',meta={}){return {id,name,category,subtitle,cells,notes,version:1,history:[],updated:new Date().toISOString(),...meta}}
function actionDefaults(){return clone(BUILTIN_ACTIONS)}
function phase2Templates(){
  const templates=[];
  const add=(id,name,category,subtitle,meta={})=>templates.push(table(id,name,category,subtitle,blankCells(),`Plantilla de Fase 2. Pendiente de introducir/validar el rango.`,{status:'PENDIENTE',...meta}));
  // ISO RAISE
  [['iso_lj','LJ vs 1 limper'],['iso_hj','HJ vs 1 limper'],['iso_co','CO vs 1 limper'],['iso_btn','BTN vs 1 limper'],['iso_sb','SB vs 1 limper'],['iso_bb','BB vs 1 limper']].forEach(([id,n])=>add(id,n,'ISO RAISE','Iso-raise · 1 limper'));
  [['iso2_co','CO vs 2+ limpers'],['iso2_btn','BTN vs 2+ limpers'],['iso2_sb','SB vs 2+ limpers'],['iso2_bb','BB vs 2+ limpers']].forEach(([id,n])=>add(id,n,'ISO RAISE','Iso-raise · 2+ limpers'));
  // 3BET / CC
  ['LJ','HJ','CO','BTN','SB'].forEach(pos=>add('3b_'+pos.toLowerCase(),`vs ${pos}`,'3BET / CC',`3BET / Cold Call vs ${pos} open`,{opponent:pos}));
  // VS 3BET
  ['LJ','HJ','CO','BTN','SB'].forEach(pos=>add('vs3_'+pos.toLowerCase(),`vs ${pos}`,'VS 3BET',`Respuesta a 3BET después de abrir ${pos}`,{opponent:pos}));
  // 4BET
  ['LJ','HJ','CO','BTN','SB'].forEach(pos=>add('4b_'+pos.toLowerCase(),`vs ${pos}`,'4BET',`4BET / CALL / FOLD vs ${pos}`,{opponent:pos}));
  // Blind vs Blind
  add('bvb_sb','SB vs BB','BLIND vs BLIND','SB open / BB response');
  add('bvb_bb','BB vs SB','BLIND vs BLIND','BB response vs SB');
  return templates;
}
function seedState(){
  const tables=[];let c;
  c=blankCells();addRange(c,['22+','A2s','A3s','A4s','A5s','A8s+','AJo+','K9s+','KJo+','Q9s+','QJo','J9s+','JTo','T9s','98s','87s','76s','65s','54s'],'open');tables.push(table('or_lj','LJ','OR','Open Raise · 17.3% · 230 combos',c,'Rango validado de trabajo. 2.5 BB.',{openSize:'2.5 BB',status:'VALIDADO'}));
  c=blankCells();addRange(c,['22+','A2s','A3s','A4s','A5s','A8s+','ATo+','K8s+','KJo+','Q9s+','QJo','J9s+','JTo','T9s','98s','87s','76s','65s','54s'],'open');tables.push(table('or_hj','HJ','OR','Open Raise · 21.0% · 278 combos',c,'Rango validado de trabajo. 2.5 BB.',{openSize:'2.5 BB',status:'VALIDADO'}));
  tables.push(table('or_co_pending','CO','OR','Pendiente de validación · no usar como rango final',blankCells(),'CO se validará cuando empecemos a cargar los datos definitivos. Esta tabla es solo un marcador.',{openSize:'2.5 BB',status:'PENDIENTE'}));
  c=blankCells();addRange(c,['22+','A2s+','A2o+','K2s+','K8o+','Q5s+','Q9o+','J6s+','J8o+','T6s+','T8o+','96s+','97o+','86s+','87o+','75s+','76o+','65s','54s'],'open');tables.push(table('or_btn','BTN','OR','Open Raise · 46.6% · 618 combos',c,'Rango validado. 2.5 BB.',{openSize:'2.5 BB',status:'VALIDADO'}));
  c=blankCells();addRange(c,['22+','A2s+','A2o+','K2s+','K8o+','Q4s+','Q9o+','J6s+','J8o+','T6s+','T8o+','96s+','97o+','86s+','87o+','75s+','76o+','65s','54s'],'open');tables.push(table('or_sb','SB','OR','Open Raise · 46.9% · 622 combos',c,'Rango validado. Open 3 BB. Base raise-only.',{openSize:'3 BB',status:'VALIDADO'}));
  const bbSets={
    lj:{bet3:['JJ+','AQs+','AKo','A5s','A4s'],call:['22+','ATs+','AJo+','KJs+','KQo','QJs','JTs','T9s','98s','87s','76s','65s']},
    hj:{bet3:['QQ+','A5s','A4s','A3s','A2s','AKs','AKo','KQs'],call:['22+','A6s+','AQo','K9s+','KQo','Q9s+','QJo','J9s+','JTo','T9s','98s','87s','76s','65s']},
    co:{bet3:['99+','A2s','A3s','A4s','A5s','AJs+','AQo+','K9s+','KQo'],call:['22+','A6s+','A9o+','K2s','K3s','K4s','K5s','K6s','K7s','K8s','KTo+','Q2s','Q3s','Q4s','Q5s','Q6s','Q7s','Q8s','Q9s','QTo+','QTs','QJs','J7s','J8s','J9s','JTs','JTo','T7s','T8s','T9s','T8o','T9o','98s','97s','87s','86s','76s','75s','65s','54s']},
    btn:{bet3:['TT+','AJs+','AQo+','A2s','A3s','A4s','A5s','K4s','K5s','K6s','K7s','K8s','K9s','Q7s','Q8s','Q9s','J7s','J8s','J9s','T9s'],call:['22+','A6s+','A9o+','K2s','K3s','KTs+','K9o+','Q2s','Q3s','Q4s','Q5s','Q6s','QTs+','Q9o+','J2s','J3s','J4s','J5s','J6s','JTs','J9o+','T2s','T3s','T4s','T5s','T6s','T7s','T8s','T9o','98s','97s','87s','86s','76s','75s','65s','54s']},
    sb:{bet3:['QQ+','AKs','AKo','A5s','A4s','A3s','A2s','K5s','K4s','Q5s','Q4s'],call:['22+','A2o+','A6s+','K2s+','K8o+','Q4s+','Q9o+','J6s+','J8o+','T6s+','T8o+','96s+','97o+','86s+','87o+','75s+','76o+','65s','54s']}
  };
  for(const [pos,sets] of Object.entries(bbSets)){c=blankCells();addRange(c,sets.call,'call');addRange(c,sets.bet3,'bet3');tables.push(table('bb_'+pos,`BB vs ${pos.toUpperCase()}`,'BB DEFENSE',`Defensa BB · ${pos.toUpperCase()}`,c,`Rango validado de trabajo contra open de ${pos.toUpperCase()}.`,{opponent:pos.toUpperCase(),status:'VALIDADO'}));}
  const phase2=phase2Templates();
  return {schema:'labpok.v1',app:'LabPok v1',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),settings:{theme:'black-gold-neon'},actions:actionDefaults(),tables:[...tables,...phase2],categories:['OR','ISO RAISE','3BET / CC','VS 3BET','4BET','BB DEFENSE','BLIND vs BLIND'],guide:[],leaks:[],training:{},notes:[]};
}
function normalizeState(input){
  const s=clone(input || state || {});
  s.schema=s.schema||'labpok.v1';
  s.actions={...actionDefaults(),...(s.actions||{})};
  s.categories=[...(s.categories||[])];
  const extra=['OR','ISO RAISE','3BET / CC','VS 3BET','4BET','BB DEFENSE','BLIND vs BLIND'];
  for(const c of extra) if(!s.categories.includes(c)) s.categories.push(c);
  const actionByLabel={}; Object.entries(s.actions).forEach(([k,a])=>{if(a?.label) actionByLabel[String(a.label).trim().toUpperCase()]=k});
  s.tables=(s.tables||[]).map(t=>{
    // Accept both the current object format and older/alternate backup formats.
    if(Array.isArray(t.cells)){
      const obj=blankCells(); t.cells.forEach((v,i)=>{if(i<169)obj[Object.keys(obj)[i]]=v}); t.cells=obj;
    } else t.cells=t.cells||blankCells();
    const normalizedCells={}; Object.entries(t.cells).forEach(([h,v])=>{normalizedCells[h]=s.actions[v]?v:(actionByLabel[String(v||'').trim().toUpperCase()]||'fold')}); t.cells=normalizedCells;
    t.history=t.history||[];
    t.version=t.version||1;
    t.updated=t.updated||new Date().toISOString();
    t.category=t.category||'OTRO';
    t.status=String(t.status||'VALIDADO').toUpperCase();
    return t;
  });
  s.notes=Array.isArray(s.notes)?s.notes:[];
  s.training={...(s.training||{}),score:Number(s.training?.score||0),attempts:Number(s.training?.attempts||0),streak:Number(s.training?.streak||0),bestStreak:Number(s.training?.bestStreak||0)};
  return s;
}
function actionDef(key){return state.actions[key]||BUILTIN_ACTIONS.fold}
function actionCss(key){const a=actionDef(key);return `--cell-bg:${a.color};--cell-text:${a.text||'#fff'};`}
function actionLabel(key){return actionDef(key).label||key.toUpperCase()}
function markDirty(entity=null){dirty=true;$('#dirtyBadge').textContent='CAMBIOS SIN EXPORTAR';$('#dirtyBadge').style.color='var(--orange)';queueCloudSave()}
function clearDirty(){dirty=false;$('#dirtyBadge').textContent='DATOS EN MEMORIA';$('#dirtyBadge').style.color='var(--green)'}
function getTable(){return state.tables.find(t=>t.id===selectedTableId)}
function render(){renderNav();renderDashboard();renderRanges();renderGuide();renderTraining();renderLeaks()}
function renderNav(){$$('.nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===activeView));$$('.view').forEach(v=>v.classList.toggle('active',v.id===`view-${activeView}`));$('#pageTitle').textContent={dashboard:'Dashboard',ranges:'Rangos',guide:'Guía de póker',training:'Entrenamiento',data:'Datos y backups'}[activeView]||'LabPok v1'}
function renderDashboard(){const counts={};state.tables.forEach(t=>counts[t.category]=(counts[t.category]||0)+1);$('#statTables').textContent=state.tables.length;$('#statCategories').textContent=Object.keys(counts).length;$('#statVersions').textContent=state.tables.reduce((n,t)=>n+(t.history?.length||0)+1,0);$('#statStatus').textContent=dirty?'●':'✓';$('#categoryModules').innerHTML=state.categories.map(cat=>`<div class="module"><div class="icon">${iconFor(cat)}</div><h3>${escapeHtml(cat)}</h3><p>${counts[cat]||0} tabla(s) configurada(s).</p><span class="pill">${cat==='OR'?'Rangos base':cat==='ISO RAISE'||cat==='3BET / CC'||cat==='VS 3BET'||cat==='4BET'||cat==='BLIND vs BLIND'?'Fase 2':'Módulo activo'} →</span></div>`).join('')}
function iconFor(cat){return ({'OR':'↗','ISO RAISE':'⚔','3BET / CC':'3B','VS 3BET':'↔','4BET':'4B','BB DEFENSE':'♠','BLIND vs BLIND':'♣'}[cat]||'◆')}
let activeRangeCategory='OR';
function renderRanges(){
  const groups={}; state.tables.forEach(t=>(groups[t.category]??=[]).push(t));
  const cats=state.categories.filter(c=>groups[c]?.length).concat(Object.keys(groups).filter(c=>!state.categories.includes(c)));
  if(!cats.length){$('#rangeList').innerHTML='<div class="empty">No hay tablas.</div>';return}
  if(!cats.includes(activeRangeCategory)) activeRangeCategory=cats[0];
  const tables=groups[activeRangeCategory]||[];
  $('#rangeList').innerHTML=`<div class="range-cats">${cats.map(cat=>`<button class="range-cat-tab ${cat===activeRangeCategory?'active':''}" data-cat="${escapeAttr(cat)}"><span>${escapeHtml(cat)}</span><small>${groups[cat].length}</small></button>`).join('')}</div><div class="range-table-list">${tables.map(t=>`<button class="list-item ${t.id===selectedTableId?'active':''}" data-table="${t.id}"><span>${escapeHtml(t.name)}</span><small>${escapeHtml(t.status||'')}</small></button>`).join('')}</div>`;
  $$('.range-cat-tab').forEach(b=>b.onclick=()=>{activeRangeCategory=b.dataset.cat;const first=(groups[activeRangeCategory]||[])[0];if(first)selectedTableId=first.id;selectedAction='open';renderRanges()});
  $$('.list-item').forEach(b=>b.onclick=()=>{selectedTableId=b.dataset.table;selectedAction='open';renderRanges()});
  const t=getTable(); if(!t){$('#editorContent').innerHTML='<div class="empty">Selecciona una tabla o crea una nueva.</div>';return} $('#editorContent').innerHTML=editorHTML(t);bindEditor(t)
}
function editorHTML(t){
 const count={};Object.values(t.cells).forEach(a=>count[a]=(count[a]||0)+1);const total=169;const pct=a=>((count[a]||0)/total*100).toFixed(1);
 const actionButtons=Object.entries(state.actions).map(([k,v])=>`<button class="action-btn ${k===selectedAction?'active':''}" data-action="${escapeAttr(k)}" style="--action-bg:${v.color};--action-text:${v.text||'#fff'}"><span class="action-dot" style="background:${v.color}"></span>${escapeHtml(v.label)}</button>`).join('');
 const legend=Object.entries(state.actions).map(([k,v])=>`<span><i class="swatch" style="background:${v.color}"></i>${escapeHtml(v.label)}</span>`).join('');
 const stats=['open','call','bet3','fold'].map(k=>`<div class="field"><label>${escapeHtml(actionLabel(k))}</label><input disabled value="${pct(k)}%"></div>`).join('');
 return `<div class="editor-header"><div><div class="eyebrow">${escapeHtml(t.category)} / ${escapeHtml(t.status||'ACTIVA')}</div><h2>${escapeHtml(t.name)}</h2><p>${escapeHtml(t.subtitle||'Tabla 13×13')}</p></div><div class="editor-actions"><button class="btn" id="duplicateBtn">Duplicar</button><button class="btn" id="newVersionBtn">Guardar versión</button><button class="btn danger" id="deleteBtn">Eliminar</button></div></div>
 <div class="toolbar"><button class="btn gold" id="newTableBtn2">+ Nueva tabla</button><button class="btn" id="resetTableBtn">Restaurar tabla</button><button class="btn" id="exportOneBtn">Exportar tabla</button></div>
 <div class="editor-grid"><div class="matrix-wrap"><div class="matrix" id="matrix">${RANKS.map((r,i)=>RANKS.map((c,j)=>{const h=handAt(i,j),a=t.cells[h]||'fold';return `<button class="cell" style="${actionCss(a)}" data-hand="${h}" title="${escapeAttr(h+' · '+actionLabel(a))}">${h}</button>`}).join('')).join('')}</div><div class="legend">${legend}</div></div>
 <aside class="side-panel"><div class="side-box"><div class="side-box-head"><h4>Pintar acción</h4><button class="mini-btn" id="manageActionsBtn">⚙ Personalizar</button></div><div class="action-grid">${actionButtons}</div><div class="hint">Selecciona una acción y pulsa las casillas. Puedes crear tus propias acciones y colores.</div></div>
 <div class="side-box"><h4>Estadísticas</h4><div class="meta-grid">${stats}</div></div>
 <div class="side-box"><h4>Metadatos</h4><div class="meta-grid"><div class="field"><label>Nombre</label><input id="metaName" value="${escapeAttr(t.name)}"></div><div class="field"><label>Categoría</label><select id="metaCategory">${state.categories.map(c=>`<option ${c===t.category?'selected':''}>${escapeHtml(c)}</option>`).join('')}</select></div><div class="field full"><label>Subtítulo</label><input id="metaSubtitle" value="${escapeAttr(t.subtitle||'')}"></div><div class="field"><label>Status</label><select id="metaStatus"><option ${t.status==='VALIDADO'?'selected':''}>VALIDADO</option><option ${t.status==='PENDIENTE'?'selected':''}>PENDIENTE</option><option ${t.status==='EXPERIMENTAL'?'selected':''}>EXPERIMENTAL</option></select></div><div class="field"><label>Sizing</label><input id="metaSizing" value="${escapeAttr(t.openSize||'')}"></div><div class="field full"><label>Notas</label><textarea id="metaNotes">${escapeHtml(t.notes||'')}</textarea></div></div></div></aside></div>`;
}
function bindEditor(t){
  $$('#matrix .cell').forEach(cell=>cell.onclick=()=>{t.cells[cell.dataset.hand]=selectedAction;t.updated=new Date().toISOString();markDirty();renderRanges()});
  $$('.action-btn').forEach(b=>b.onclick=()=>{selectedAction=b.dataset.action;renderRanges()});
  $('#manageActionsBtn').onclick=openActionsModal;
  $('#metaName').oninput=e=>{t.name=e.target.value;markDirty()};$('#metaCategory').onchange=e=>{t.category=e.target.value;markDirty();renderRanges()};$('#metaSubtitle').oninput=e=>{t.subtitle=e.target.value;markDirty()};$('#metaStatus').onchange=e=>{t.status=e.target.value;markDirty()};$('#metaSizing').oninput=e=>{t.openSize=e.target.value;markDirty()};$('#metaNotes').oninput=e=>{t.notes=e.target.value;markDirty()};
  $('#duplicateBtn').onclick=()=>duplicateTable(t);$('#newVersionBtn').onclick=()=>saveVersion(t);$('#deleteBtn').onclick=()=>deleteTable(t);$('#newTableBtn2').onclick=openNewModal;$('#resetTableBtn').onclick=()=>{if(confirm('Restaurar esta tabla a su primera versión guardada?')){const h=t.history?.[0];if(h){t.cells=clone(h.cells);markDirty();renderRanges()}else toast('Esta tabla no tiene una versión inicial guardada.')}};$('#exportOneBtn').onclick=()=>downloadJSON({schema:'labpok.table.v1',actions:state.actions,table:t},`${slug(t.name)}.json`);
}
function openActionsModal(){renderActionManager();$('#actionsModal').classList.add('open')}
function closeActionsModal(){$('#actionsModal').classList.remove('open')}
function renderActionManager(){const host=$('#actionsManagerList');host.innerHTML=Object.entries(state.actions).map(([key,a])=>`<div class="action-manager-row"><div class="action-preview" style="background:${a.color};color:${a.text||'#fff'}">${escapeHtml(a.label)}</div><div class="action-key">${key}</div><input class="color-input" type="color" value="${a.color}" data-color-key="${escapeAttr(key)}"><input class="action-label-input" value="${escapeAttr(a.label)}" data-label-key="${escapeAttr(key)}"><button class="mini-btn save-action" data-save-key="${escapeAttr(key)}">Guardar</button>${BUILTIN_ACTIONS[key]?'<span class="locked">BASE</span>':`<button class="mini-btn danger-mini delete-action" data-delete-key="${escapeAttr(key)}">Eliminar</button>`}</div>`).join('');
  $$('.save-action',host).forEach(b=>b.onclick=()=>{const k=b.dataset.saveKey;const color=$(`[data-color-key="${CSS.escape(k)}"]`,host).value;const label=$(`[data-label-key="${CSS.escape(k)}"]`,host).value.trim()||k.toUpperCase();state.actions[k].color=color;state.actions[k].label=label;markDirty();renderActionManager();renderRanges();toast('Acción actualizada.')});
  $$('.delete-action',host).forEach(b=>b.onclick=()=>{const k=b.dataset.deleteKey;if(!confirm(`¿Eliminar la acción «${state.actions[k].label}»? Las casillas que la usan pasarán a FOLD.`))return;for(const t of state.tables)for(const h of Object.keys(t.cells))if(t.cells[h]===k)t.cells[h]='fold';delete state.actions[k];if(selectedAction===k)selectedAction='fold';markDirty();renderActionManager();renderRanges();toast('Acción eliminada.')});
}
function createCustomAction(){const label=$('#newActionLabel').value.trim();const color=$('#newActionColor').value;if(!label){toast('Escribe un nombre para la acción.');return}let key=slug(label)||uid('action');if(state.actions[key])key=key+'_'+Math.random().toString(36).slice(2,5);state.actions[key]={label,color,text:'#ffffff',custom:true};selectedAction=key;markDirty();$('#newActionLabel').value='';renderActionManager();renderRanges();toast(`Acción «${label}» creada.`)}
function saveVersion(t){t.history=t.history||[];t.history.push({version:t.version,cells:clone(t.cells),name:t.name,notes:t.notes,updated:t.updated,actions:clone(state.actions)});t.version++;t.updated=new Date().toISOString();markDirty();toast(`Versión v${t.version} guardada.`);renderRanges()}
function duplicateTable(t){const n=clone(t);n.id=uid('tbl');n.name=t.name+' · copia';n.version=1;n.history=[];n.updated=new Date().toISOString();state.tables.push(n);selectedTableId=n.id;markDirty();renderRanges();toast('Tabla duplicada.')}
function deleteTable(t){if(!confirm(`¿Eliminar «${t.name}»?`))return;state.tables=state.tables.filter(x=>x.id!==t.id);selectedTableId=state.tables[0]?.id||null;markDirty();renderRanges();toast('Tabla eliminada.')}
function openNewModal(){$('#newModal').classList.add('open');$('#newName').focus()}
function closeModal(){$('#newModal').classList.remove('open')}
function createTable(){const name=$('#newName').value.trim()||'Nueva tabla';const category=$('#newCategory').value;const subtitle=$('#newSubtitle').value.trim();const t=table(uid('tbl'),name,category,subtitle,blankCells(),'Tabla nueva. Añade las decisiones y documenta la lógica.',{status:'EXPERIMENTAL'});t.history=[{version:1,cells:clone(t.cells),name:t.name,notes:t.notes,updated:t.updated}];state.tables.push(t);selectedTableId=t.id;closeModal();$('#newName').value='';$('#newSubtitle').value='';markDirty();renderRanges();toast('Nueva tabla creada.')}
function exportAll(){state.updated=new Date().toISOString();downloadJSON(state,`LabPok_v1_Backup_${new Date().toISOString().slice(0,10)}.json`);clearDirty();toast('Backup exportado. Guarda el archivo fuera del navegador.')}
function importAll(file){
  const reader=new FileReader();
  reader.onload=async()=>{
    try{
      const data=normalizeState(JSON.parse(reader.result));
      if(!data||data.schema!=='labpok.v1')throw new Error('Formato de backup no reconocido.');
      if(currentUser && remoteReady){
        const ok=confirm('Este backup reemplazará los datos actuales de LabPok en Firebase. ¿Continuar?');
        if(!ok)return;
      }
      state=data;
      selectedTableId=state.tables?.[0]?.id||null;
      render();
      if(currentUser && remoteReady){
        await replaceCloudState();
        toast('Backup importado y guardado en Firebase.');
      }else{
        clearDirty();
        toast('Backup cargado. Inicia sesión para guardarlo en Firebase.');
      }
    }catch(e){console.error(e);alert(e.message||'No se pudo importar el backup.')}
  };
  reader.readAsText(file)
}
function downloadJSON(data,name){const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500)}
function slug(s){return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'')}
function escapeHtml(s=''){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function escapeAttr(s=''){return escapeHtml(s)}
function renderGuide(){
  const blocks=[
    ['♛','MONSTER / MF / MS / AN','Clasifica primero la fuerza de tu mano y la cantidad de valor/proyectos que contiene.','Monster: sets+ y manos muy fuertes. MF: top pair fuerte o mejor. MS: showdown value medio. AN: aire/proyecto con equity o backdoors.'],
    ['◎','C-BET','La textura del board determina cuánto quieres apostar y qué parte de tu rango puede presionar.','Dry A/K/Q/J altos → tamaños pequeños. En boards coordinados, aumenta el sizing cuando el rango y la ventaja de valor lo justifican. Monotone y paired boards requieren matices: no son automáticamente bluffs puros.'],
    ['▥','TEXTURAS','Lee conectividad, palos, pares y cartas altas antes de elegir sizing.','K72r → 25–33%. J96 two-tone → 50–66%. 987 two-tone → 75%+. 772 → 25–33% con cuidado frente a rangos con trips/full. Monotone → 33–50%, priorizando equity real y backdoors.'],
    ['3B','3BET','Construye el rango según posición, apertura y función del combo.','Contra posiciones tempranas usamos rangos más fuertes. Contra CO/BTN aumenta la frecuencia y aparecen más bluffs con blockers y manos suited.'],
    ['♠','BIG BLIND','La defensa depende directamente del tamaño y de la posición del agresor.','Vs SB 3 BB podemos defender mucho. Vs LJ 2.5 BB defendemos mucho menos. Las tablas de BB de LabPok son la referencia actual de trabajo.'],
    ['↗','STEAL','CO, BTN y SB concentran muchas situaciones de robo.','Cuando todos foldean hasta una posición tardía, el rango de apertura se amplía. El tamaño base actual es 2.5 BB IP y 3 BB desde SB.'],
    ['◆','DISCIPLINA','Una buena estrategia no es apostar siempre: es ejecutar una decisión coherente con rango, board, posición y sizing.','Si dudas entre dos líneas, vuelve a la textura, al rango del rival y a la función de tu mano. Evita convertir una simplificación de estudio en una regla absoluta.']
  ];
  $('#guideContent').innerHTML=`
  <div class="hero"><div class="card hero-main"><div class="eyebrow">LABPOK V1 / PHASE 04</div><h2>Guía de <span class="hero-accent">juego</span>.</h2><p>Manual operativo de tu sistema Cash 6-Max. Esta fase transforma la infografía en una guía navegable: fuerza de mano, texturas, C-BET, sizings, 3BET, defensa de ciegas, steal y principios de decisión.</p></div><div class="card quick-grid"><div class="quick"><strong>MF</strong><span>Mano fuerte / valor.</span></div><div class="quick"><strong>MS</strong><span>Showdown value.</span></div><div class="quick"><strong>AN</strong><span>Aire / proyecto.</span></div><div class="quick"><strong>BOARD</strong><span>La textura manda el sizing.</span></div></div></div>
  <div class="grid cards guide-metrics"><div class="card"><div class="stat-label">Board seco</div><div class="stat-value">25–33%</div><div class="stat-foot">K72r como referencia.</div></div><div class="card"><div class="stat-label">Board medio</div><div class="stat-value">50–66%</div><div class="stat-foot">J96 two-tone como referencia.</div></div><div class="card"><div class="stat-label">Board dinámico</div><div class="stat-value">75%+</div><div class="stat-foot">987 two-tone como referencia.</div></div><div class="card"><div class="stat-label">Regla madre</div><div class="stat-value">RANGO × BOARD</div><div class="stat-foot">El sizing no se decide solo por tu mano.</div></div></div>
  <div class="section-title">Manual operativo</div><div class="guide-grid">${blocks.map((b,i)=>`<article class="guide-card"><div class="guide-icon">${b[0]}</div><div><div class="guide-kicker">0${i+1}</div><h3>${b[1]}</h3><p class="guide-lead">${b[2]}</p><p>${b[3]}</p></div></article>`).join('')}</div>
  <div class="section-title">Mapa rápido de sizings</div><div class="board-grid">
    ${[['K72r','SECO','25–33%','Presión barata sobre un board estático.'],['J96 two-tone','MEDIO','50–66%','Más proyectos y más necesidad de proteger rango.'],['987 two-tone','DINÁMICO','75%+','Cambios de equity frecuentes; tamaños grandes tienen más impacto.'],['772','PAREADO','25–33%','No asumas que un board pareado es automáticamente un buen bluff.'],['A94 monotone','MONOCOLOR','33–50%','Prioriza equity, bloqueadores y backdoors; evita bluffear por sistema.']].map(x=>`<div class="board-card"><div class="board-top"><span>${x[1]}</span><strong>${x[0]}</strong></div><div class="board-sizing">${x[2]}</div><p>${x[3]}</p></div>`).join('')}
  </div>
  <div class="section-title">Cuaderno de estudio</div>
  <div class="notes-layout">
    <div class="card note-editor">
      <div class="eyebrow">STUDY NOTES</div><h3>Añadir apunte</h3>
      <div class="meta-grid"><div class="field"><label>Título</label><input id="noteTitle" placeholder="Ej. BB vs BTN — K4s"></div><div class="field"><label>Categoría</label><select id="noteCategory"><option>Preflop</option><option>Postflop</option><option>Leaks</option><option>Concepto</option><option>Manos</option><option>Zeros</option><option>NL2</option><option>NL5</option><option>Otro</option></select></div><div class="field full"><label>Apunte</label><textarea id="noteBody" placeholder="Escribe aquí lo que has aprendido, dudas, reglas, excepciones o conclusiones..."></textarea></div></div>
      <div class="toolbar"><button class="btn gold" id="saveNoteBtn">+ Guardar apunte</button><button class="btn" id="clearNoteBtn">Limpiar</button></div>
    </div>
    <div class="card"><div class="note-list-head"><div><div class="eyebrow">NOTEBOOK</div><h3>Mis apuntes</h3></div><span class="phase-badge">BACKUP INCLUIDO</span></div><div id="notesList"></div></div>
  </div>`;
  renderNotes();
}
function renderNotes(){const host=$('#notesList');if(!host)return;const notes=[...(state.notes||[])].sort((a,b)=>(b.updated||'').localeCompare(a.updated||''));host.innerHTML=notes.length?notes.map(n=>`<article class="note-item"><div class="note-meta"><span class="phase-badge">${escapeHtml(n.category||'Otro')}</span><span>${new Date(n.updated).toLocaleString('es-ES')}</span></div><h4>${escapeHtml(n.title||'Apunte')}</h4><p>${escapeHtml(n.body||'').replace(/\n/g,'<br>')}</p><button class="mini-btn danger-mini delete-note" data-note-id="${escapeAttr(n.id)}">Eliminar</button></article>`).join(''):'<div class="empty">Todavía no tienes apuntes. Empieza por guardar aquí las ideas importantes que vayas aprendiendo.</div>';$$('.delete-note',host).forEach(b=>b.onclick=()=>{state.notes=state.notes.filter(n=>n.id!==b.dataset.noteId);markDirty();renderNotes();toast('Apunte eliminado.')});$('#saveNoteBtn')?.addEventListener('click',saveNote,{once:true});$('#clearNoteBtn')?.addEventListener('click',clearNote,{once:true})}
function saveNote(){const title=$('#noteTitle').value.trim()||'Apunte sin título',body=$('#noteBody').value.trim();if(!body){toast('Escribe algo antes de guardar.');return}state.notes.push({id:uid('note'),title,category:$('#noteCategory').value,body,created:new Date().toISOString(),updated:new Date().toISOString()});markDirty();$('#noteTitle').value='';$('#noteBody').value='';renderNotes();toast('Apunte guardado en LabPok.')}
function clearNote(){$('#noteTitle').value='';$('#noteBody').value=''}
function normalizeTrainingCells(t){
  const source=t?.cells ?? t?.matrix ?? t?.grid ?? t?.range ?? t?.ranges;
  if(!source) return {};
  const out={};
  const hands=RANKS.flatMap(r=>RANKS.map(c=>r+c));
  const put=(h,v)=>{if(!h)return; const key=String(h); if(v===undefined||v===null||v==='')return; const raw=String(v).trim(); if(!raw)return; const direct=state.actions[raw]?raw:null; const byLabel=Object.entries(state.actions).find(([k,a])=>String(a?.label||'').trim().toUpperCase()===raw.toUpperCase())?.[0]; const byCommon={open:'open',call:'call',bet3:'bet3',bet4:'bet4',bet4bluff:'bet4bluff',fold:'fold',raise:'open'}[raw.toLowerCase()]; out[key]=direct||byLabel||byCommon||raw;};
  if(Array.isArray(source)){
    if(source.length===13 && source.every(row=>Array.isArray(row))){source.forEach((row,i)=>row.slice(0,13).forEach((v,j)=>put(RANKS[i]+RANKS[j],v)));}
    else source.slice(0,169).forEach((v,i)=>put(hands[i],v));
  } else if(typeof source==='object'){
    Object.entries(source).forEach(([h,v])=>{
      if(Array.isArray(v) && h.length===1){v.slice(0,13).forEach((x,j)=>put(h+RANKS[j],x));}
      else if(v && typeof v==='object' && 'action' in v) put(h,v.action);
      else put(h,v);
    });
  }
  return out;
}
function trainingTables(){
  return state.tables.filter(t=>{
    if(String(t.status||'VALIDADO').toUpperCase()==='PENDIENTE') return false;
    const cells=normalizeTrainingCells(t);
    return Object.keys(cells).some(h=>cells[h] && cells[h]!=='fold' && state.actions[cells[h]]) || Object.keys(cells).some(h=>cells[h] && state.actions[cells[h]]);
  });
}
function trainingHandKey(h){
  const k=String(h||'').trim().toUpperCase();
  return k;
}
function trainingHandBase(h){
  const k=trainingHandKey(h);
  return k.length===3 && /[SO]$/.test(k) ? k.slice(0,2) : k;
}
function trainingHandKind(h){
  const k=trainingHandKey(h);
  if(k.length===3 && k.endsWith('S')) return 'SUITED';
  if(k.length===3 && k.endsWith('O')) return 'OFFSUIT';
  if(k.length===2 && k[0]===k[1]) return 'PAIR';
  return 'COMBO';
}
function trainingHandsForTable(t){
  const cells=normalizeTrainingCells(t);
  const keys=Object.keys(cells).filter(h=>cells[h] && state.actions[cells[h]]);
  // Prefer explicit suited/offsuit combinations when the table contains them.
  // This prevents the quiz from showing an ambiguous "6T" when "T6s"/"T6o"
  // are available in the source table.
  const explicit=keys.filter(h=>String(h).length===3 && /[so]$/i.test(String(h)));
  const bases=new Set(explicit.map(trainingHandBase));
  const filtered=keys.filter(h=>{
    const k=String(h);
    return !(k.length===2 && bases.has(trainingHandBase(k)));
  });
  return filtered.length ? filtered : keys;
}
function suitSymbol(i){return ['♠','♥','♦','♣'][i%4]}
function handVisual(h){
  const k=trainingHandKey(h);
  const kind=trainingHandKind(k);
  if(k.length===3 && /[SO]$/.test(k)){
    const r1=k[0], r2=k[1], suited=k[2]==='S';
    const suit1=suitSymbol(Math.floor(Math.random()*4));
    let suit2=suit1;
    if(!suited){let n=Math.floor(Math.random()*4);if(suitSymbol(n)===suit1)n=(n+1)%4;suit2=suitSymbol(n)}
    return {
      label:`${r1}${r2}${suited?'s':'o'}`,
      kind,
      cards:`<span class="poker-card">${r1}<b>${suit1}</b></span><span class="poker-card">${r2}<b>${suit2}</b></span>`
    };
  }
  if(k.length===2 && k[0]===k[1]){
    const r=k[0];
    return {label:r+r,kind:'PAIR',cards:`<span class="poker-card">${r}<b>♠</b></span><span class="poker-card">${r}<b>♥</b></span>`};
  }
  return {
    label:k,
    kind:'COMBO',
    cards:`<span class="poker-card">${k[0]||''}<b>?</b></span><span class="poker-card">${k[1]||''}<b>?</b></span>`
  };
}
function renderTraining(){
  const host=$('#trainingContent');if(!host)return;
  const valid=trainingTables();
  const cats=[...new Set(valid.map(t=>t.category||'OTRO'))].sort((a,b)=>a.localeCompare(b,'es'));
  host.innerHTML=`<div class="hero"><div class="card hero-main"><div class="eyebrow">LABPOK V1 / PHASE 05</div><h2>Entrena para <span class="hero-accent">recordar</span>.</h2><p>El entrenamiento usa directamente las tablas que ya tienes en LabPok. Las combinaciones explícitas suited/offsuited se muestran como cartas para que no tengas que interpretar una notación ambigua.</p><div class="toolbar"><button class="btn gold" id="startQuizBtn">Nueva situación →</button><select class="training-select" id="trainingCategory"><option value="ALL">Todas las categorías</option>${cats.map(c=>`<option>${escapeHtml(c)}</option>`).join('')}</select></div></div><div class="card training-score"><div class="stat-label">Puntuación</div><div class="stat-value">${state.training.score}</div><div class="stat-foot">${state.training.attempts} intentos · mejor racha ${state.training.bestStreak}</div></div></div><div id="quizArea" class="card quiz-area"><div class="empty">Pulsa «Nueva situación» para empezar.</div></div>`;
  $('#startQuizBtn').onclick=startQuiz;
  $('#trainingCategory').onchange=()=>{if(window.currentQuiz)startQuiz()}
}
function startQuiz(){
  const cat=$('#trainingCategory')?.value||'ALL';
  let pool=trainingTables();
  if(cat!=='ALL')pool=pool.filter(t=>t.category===cat);
  if(!pool.length){toast(cat==='ALL'?'No hay tablas entrenables. Revisa que tengan decisiones cargadas.':`No hay tablas entrenables en «${cat}».`);return}
  const t=pool[Math.floor(Math.random()*pool.length)];
  const hands=trainingHandsForTable(t);
  if(!hands.length){toast('La tabla seleccionada no contiene acciones reconocibles.');return}
  const hand=hands[Math.floor(Math.random()*hands.length)];
  const cells=normalizeTrainingCells(t);
  const correct=cells[hand];
  window.currentQuiz={tableId:t.id,hand,correct};
  const options=Object.keys(state.actions).filter(k=>k!=='fold' || correct==='fold');
  const shuffled=options.sort(()=>Math.random()-.5).slice(0,Math.min(5,options.length));
  if(!shuffled.includes(correct))shuffled[Math.floor(Math.random()*shuffled.length)]=correct;
  const visual=handVisual(hand);
  const area=$('#quizArea');
  area.innerHTML=`<div class="quiz-head"><div><div class="eyebrow">${escapeHtml(t.category)}</div><h3>${escapeHtml(t.name)}</h3><p class="muted">¿Qué acción corresponde a esta mano?</p></div><span class="phase-badge">${escapeHtml(t.status||'ACTIVA')}</span></div><div class="quiz-hand-cards">${visual.cards}</div><div class="hand-notation"><strong>${escapeHtml(visual.label)}</strong><span>${visual.kind}</span></div><div class="quiz-options">${shuffled.map(k=>`<button class="quiz-option" data-answer="${escapeAttr(k)}" style="--action-bg:${state.actions[k].color}">${escapeHtml(state.actions[k].label)}</button>`).join('')}</div><div class="quiz-context">Tabla: <strong>${escapeHtml(t.name)}</strong> · Versión v${t.version||1}</div>`;
  $$('.quiz-option',area).forEach(b=>b.onclick=()=>answerQuiz(b.dataset.answer))
}
function answerQuiz(answer){if(!window.currentQuiz)return;const q=window.currentQuiz,correct=answer===q.correct;state.training.attempts++;if(correct){state.training.score++;state.training.streak++;state.training.bestStreak=Math.max(state.training.bestStreak,state.training.streak)}else state.training.streak=0;markDirty();recordTrainingAttempt(q,answer,correct).catch(e=>console.error(e));const t=state.tables.find(x=>x.id===q.tableId);const a=state.actions[q.correct];$('#quizArea').insertAdjacentHTML('beforeend',`<div class="quiz-result ${correct?'correct':'wrong'}"><strong>${correct?'✓ CORRECTO':'✕ INCORRECTO'}</strong><span>La tabla <b>${escapeHtml(t.name)}</b> marca <b style="color:${a.color}">${escapeHtml(a.label)}</b> para ${escapeHtml(q.hand)}.</span><button class="btn gold" onclick="startQuiz()">Siguiente →</button></div>`);$$('.quiz-option').forEach(b=>b.disabled=true);renderDashboard()}
function renderLeaks(){
  const host=$('#leaksContent'); if(!host) return;
  const leaks=[...(state.leaks||[])].sort((a,b)=>(b.updated||'').localeCompare(a.updated||''));
  host.innerHTML=`
    <div class="hero">
      <div class="card hero-main">
        <div class="eyebrow">LABPOK V1 / PHASE 05</div>
        <h2>Manos y <span class="hero-accent">Leaks</span>.</h2>
        <p>Cuaderno operativo para registrar patrones que quieras revisar. Cada entrada queda dentro de tu estado de LabPok y se sincroniza con Firebase.</p>
      </div>
      <div class="card training-score"><div class="stat-label">Leaks registrados</div><div class="stat-value">${leaks.length}</div><div class="stat-foot">prioriza los que aparecen con frecuencia</div></div>
    </div>
    <div class="grid leak-layout">
      <div class="card">
        <div class="eyebrow">LEAK TRACKER</div><h3>Nuevo leak / mano</h3>
        <div class="meta-grid">
          <div class="field full"><label>Título</label><input id="leakTitle" placeholder="Ej. BB vs BTN · defiendo demasiado"></div>
          <div class="field"><label>Categoría</label><select id="leakCategory"><option>Preflop</option><option>Postflop</option><option>River</option><option>3BET / 4BET</option><option>BB</option><option>Blind vs Blind</option><option>Disciplina</option><option>Otro</option></select></div>
          <div class="field"><label>Prioridad</label><select id="leakPriority"><option>ALTA</option><option>MEDIA</option><option>BAJA</option></select></div>
          <div class="field full"><label>Qué quiero corregir</label><textarea id="leakBody" placeholder="Describe el patrón, situación o decisión que quieres estudiar."></textarea></div>
          <div class="field full"><label>Plan de corrección</label><textarea id="leakPlan" placeholder="Ej. revisar 30 manos de BB vs BTN y comparar con la tabla."></textarea></div>
        </div>
        <div class="toolbar"><button class="btn gold" id="saveLeakBtn">+ Guardar leak</button></div>
      </div>
      <div class="card">
        <div class="note-list-head"><div><div class="eyebrow">REVIEW QUEUE</div><h3>Cola de revisión</h3></div></div>
        <div id="leaksList">${leaks.length?leaks.map(l=>`<article class="leak-item"><div class="note-meta"><span class="phase-badge">${escapeHtml(l.priority||'MEDIA')}</span><span>${escapeHtml(l.category||'Otro')}</span></div><h4>${escapeHtml(l.title||'Leak')}</h4><p>${escapeHtml(l.body||'').replace(/\\n/g,'<br>')}</p>${l.plan?`<div class="leak-plan"><strong>Plan:</strong> ${escapeHtml(l.plan)}</div>`:''}<button class="mini-btn danger-mini delete-leak" data-leak-id="${escapeAttr(l.id)}">Eliminar</button></article>`).join(''):'<div class="empty">Todavía no has registrado leaks.</div>'}</div>
      </div>
    </div>`;
  $('#saveLeakBtn')?.addEventListener('click',saveLeak);
  $$('.delete-leak',host).forEach(b=>b.onclick=()=>{state.leaks=(state.leaks||[]).filter(l=>l.id!==b.dataset.leakId);markDirty();renderLeaks();toast('Leak eliminado.')});
}
function saveLeak(){
  const title=$('#leakTitle').value.trim();
  const body=$('#leakBody').value.trim();
  if(!title||!body){toast('Añade un título y qué quieres corregir.');return}
  state.leaks=state.leaks||[];
  const now=new Date().toISOString();
  state.leaks.push({id:uid('leak'),title,category:$('#leakCategory').value,priority:$('#leakPriority').value,body,plan:$('#leakPlan').value.trim(),created:now,updated:now});
  markDirty();
  renderLeaks();
  toast('Leak guardado y sincronizado.');
}

function switchView(v){activeView=v;if(v==='ranges'&&!selectedTableId)selectedTableId=state.tables[0]?.id||null;renderNav();if(v==='ranges')renderRanges();if(v==='dashboard')renderDashboard();if(v==='guide')renderGuide();if(v==='training')renderTraining()}
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(toast._t);toast._t=setTimeout(()=>t.classList.remove('show'),2200)}
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue=''}});

/* ============================================================
   LABPOK CLOUD — FIREBASE
   ============================================================ */
let fbAuth = null;
let fbDb = null;
let currentUser = null;
let remoteReady = false;
let cloudSaveTimer = null;

function firebaseReady(){
  if(!window.firebase || !window.LABPOK_FIREBASE) throw new Error('Firebase no está configurado.');
  if(!fbAuth) fbAuth = firebase.auth();
  if(!fbDb) fbDb = firebase.firestore();
  return true;
}
function userDoc(){
  if(!currentUser) throw new Error('No hay usuario autenticado.');
  return fbDb.collection('users').doc(currentUser.uid);
}
function setCloudStatus(text,ok=true){
  const el=$('#cloudStatus');
  if(el){el.textContent=text;el.style.color=ok?'var(--green)':'var(--red)';}
}
function showAuth(show=true){
  $('#authScreen')?.classList.toggle('open',show);
  $('#appShell')?.classList.toggle('locked',show);
}
function setLoginMessage(msg,error=false){
  const el=$('#loginMessage');
  if(el){el.textContent=msg;el.className='auth-message '+(error?'error':'');}
}
function firebaseErrorMessage(err){
  const code=String(err?.code||'');
  const map={
    'auth/invalid-email':'El correo electrónico no es válido.',
    'auth/user-disabled':'Este usuario está deshabilitado.',
    'auth/user-not-found':'No existe un usuario con ese correo.',
    'auth/wrong-password':'La contraseña no es correcta.',
    'auth/invalid-credential':'El correo o la contraseña no son correctos.',
    'auth/too-many-requests':'Demasiados intentos. Espera unos minutos y vuelve a probar.',
    'auth/network-request-failed':'No se pudo conectar con Firebase. Comprueba tu conexión.',
    'permission-denied':'Firebase ha rechazado el acceso a los datos.'
  };
  return map[code] || err?.message || 'No se pudo completar la operación.';
}
async function loginLabPok(e){
  e?.preventDefault();
  const email=$('#loginEmail')?.value.trim();
  const password=$('#loginPassword')?.value;
  if(!email||!password){setLoginMessage('Introduce email y contraseña.',true);return;}
  setLoginMessage('Conectando…');
  try{
    firebaseReady();
    await fbAuth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
    await fbAuth.signInWithEmailAndPassword(email,password);
  }catch(err){console.error(err);setLoginMessage(firebaseErrorMessage(err),true);}
}
async function logoutLabPok(){
  try{firebaseReady();await fbAuth.signOut();}catch(e){console.error(e)}
  currentUser=null;remoteReady=false;showAuth(true);setCloudStatus('DESCONECTADO',false);
}
function firestoreSafeState(input){return JSON.parse(JSON.stringify(input,(_,v)=>v===undefined?null:v));}
async function loadCloudState(){
  if(!currentUser)return null;
  const snap=await userDoc().get();
  if(!snap.exists)return null;
  const data=snap.data()||{};
  if(!data.state || data.state.schema!=='labpok.v1')return null;
  return normalizeState(data.state);
}
async function replaceCloudState(){
  if(!currentUser)throw new Error('No hay usuario autenticado.');
  setCloudStatus('IMPORTANDO…');
  await userDoc().set({
    schema:'labpok.v1',
    app:'LabPok v1',
    state:firestoreSafeState(state),
    updatedAt:firebase.firestore.FieldValue.serverTimestamp()
  },{merge:false});
  remoteReady=true;setCloudStatus('SINCRONIZADO');clearDirty();
}
async function syncCloud(){
  if(!currentUser||!remoteReady)return;
  try{
    setCloudStatus('GUARDANDO…');
    await userDoc().set({schema:'labpok.v1',app:'LabPok v1',state:firestoreSafeState(state),updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
    setCloudStatus('SINCRONIZADO');clearDirty();
  }catch(err){console.error(err);setCloudStatus('ERROR',false);toast('No se pudo guardar en Firebase: '+firebaseErrorMessage(err));}
}
function queueCloudSave(){
  if(!currentUser||!remoteReady)return;
  clearTimeout(cloudSaveTimer);cloudSaveTimer=setTimeout(()=>syncCloud(),1800);
}
async function startCloudSession(){
  setCloudStatus('CONECTANDO…');
  try{
    const remote=await loadCloudState();
    if(remote){
      state=remote;selectedTableId=state.tables?.[0]?.id||null;remoteReady=true;clearDirty();render();setCloudStatus('SINCRONIZADO');toast('LabPok cargado desde Firebase.');
    }else{
      remoteReady=true;state=normalizeState(seedState());selectedTableId=state.tables?.[0]?.id||null;clearDirty();render();setCloudStatus('LISTO · IMPORTA TU BACKUP');toast('Cuenta conectada. Carga tu backup de LabPok para migrar tus rangos.');
    }
  }catch(err){console.error(err);remoteReady=false;setCloudStatus('ERROR',false);toast('Error al cargar Firebase: '+firebaseErrorMessage(err));}
}
async function saveToCloudNow(){
  if(!currentUser){toast('Primero inicia sesión.');return;}
  if(!remoteReady){toast('Firebase todavía no está listo.');return;}
  await syncCloud();
}
async function recordTrainingAttempt(q,answer,correct){return;}
async function initLabPokCloud(){
  firebaseReady();
  try{await fbAuth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);}catch(e){console.warn(e)}
  fbAuth.onAuthStateChanged(async user=>{
    if(user){
      currentUser=user;$('#cloudUser').textContent=user.email||'';showAuth(false);await startCloudSession();
    }else{
      currentUser=null;remoteReady=false;$('#cloudUser').textContent='';showAuth(true);setCloudStatus('DESCONECTADO',false);
    }
  });
}

document.addEventListener('DOMContentLoaded',async()=>{
  state=normalizeState(seedState());
  selectedTableId=state.tables[0]?.id||null;

  $$('.nav button').forEach(b=>b.onclick=()=>switchView(b.dataset.view));
  $('#newTableBtn').onclick=openNewModal;
  $('#exportBtn').onclick=exportAll;
  $('#importBtn').onclick=()=>$('#importFile').click();
  $('#importFile').onchange=e=>e.target.files[0]&&importAll(e.target.files[0]);
  $('#cancelModal').onclick=closeModal;
  $('#createTable').onclick=createTable;
  $('#newModal').onclick=e=>{if(e.target.id==='newModal')closeModal()};
  $('#actionsModal').onclick=e=>{if(e.target.id==='actionsModal')closeActionsModal()};
  $('#closeActionsModal').onclick=closeActionsModal;
  $('#addCustomActionBtn').onclick=createCustomAction;
  $('#loginForm').onsubmit=loginLabPok;
  $('#logoutBtn').onclick=logoutLabPok;
  $('#saveCloudBtn').onclick=saveToCloudNow;
  $('#newCategory').innerHTML=state.categories.map(c=>`<option>${escapeHtml(c)}</option>`).join('');

  render();
  await initLabPokCloud();
});
