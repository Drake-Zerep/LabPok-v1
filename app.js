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
function winamax5RfiSeed(){
  const specs={
    rfi_utg:{name:'UTG',size:'2.5 BB',pct:'20.1%',combos:266,tokens:['22+','A2s+','ATo+','K9s+','KJo+','Q9s+','QJo','J9s+','T9s','98s','87s','76s','65s'],note:'BASE 7A-A · 20.1% / 266 combos / 2.5 BB. La literatura francesa consultada sitúa el primer open 5-max alrededor del HJ/MP de 6-max, con una referencia aproximada de 18-20%. Esta propuesta queda en 20.1%. Fuentes de trabajo: Kill Tilt (ranges micro 5-max) y Poker Académie (adaptación 5-max). EXPERIMENTAL: validar con pool y muestra propia.'},
    rfi_co:{name:'CO',size:'2.5 BB',pct:'24.9%',combos:330,tokens:['22+','A2s+','A9o+','K8s+','KTo+','Q9s+','QTo+','J8s+','JTo','T8s+','98s','87s','76s','65s','54s'],note:'BASE 7A-B · CO 5-MAX · 24.9% / 330 combos / 2.5 BB. Referencias francesas: Kill Tilt sitúa CO alrededor de 25-30% en micro 5-max; otra discusión de Kill Tilt da una referencia de ~27% CO en micro. Poker Académie señala que la adaptación 6-MAX→5-MAX consiste esencialmente en hacer desaparecer una posición temprana, por lo que la estructura posicional importa más que forzar una ampliación arbitraria. Construcción elegida: rango conservador cercano al 25%, con 22+, A2s+, A9o+, K8s+, KTo+, Q9s+, QTo+, J8s+, JTo, T8s+, 98s, 87s, 76s, 65s, 54s. Fronteras de estudio: A8o/K9o/Q8s/J9o/T7s quedan fuera de momento y serán candidatas para futuras expansiones según pool y datos. Sizing base 2.5 BB. EXPERIMENTAL: no marcar como VALIDADO hasta contrastarlo con muestras reales de Winamax.'},
    rfi_btn:{name:'BTN',size:'2.5 BB',pct:'46.9%',combos:622,tokens:['22+','A2s+','A2o+','K2s+','K8o+','Q4s+','Q9o+','J6s+','J8o+','T6s+','T8o+','96s+','97o+','86s+','87o+','75s+','76o+','65s','54s'],note:'BASE 7A-C · BTN 5-MAX · 46.9% / 622 combos / 2.5 BB. Investigación francesa: Kill Tilt ha utilizado referencias de 5-MAX Winamax y en discusiones de micro se observan aperturas mucho más amplias desde BTN que desde posiciones tempranas; una referencia de micro 5-MAX sitúa el BU aproximadamente en 38-50%, y otra discusión de NL2 menciona 48% como referencia de trabajo. Estas fuentes son antiguas y no constituyen una tabla oficial de NL2 2026, por lo que las usamos como evidencia contextual, no como GTO. Construcción experimental: 22+, todos los Ax, K2s+/K8o+, Q4s+/Q9o+, J6s+/J8o+, T6s+/T8o+, 96s+/97o+, 86s+/87o+, 75s+/76o+, 65s, 54s. Fronteras de estudio: manos marginales cercanas a K7o/Q8o/J8o/T8o/97o/87o/76o se revisarán después con pool y resultados propios. Sizing base 2.5 BB. EXPERIMENTAL.'},
    rfi_sb:{name:'SB',size:'3 BB',pct:'50.8%',combos:674,tokens:['22+','A2s+','A2o+','K2s+','K7o+','Q3s+','Q8o+','J5s+','J8o+','T5s+','T8o+','95s+','97o+','85s+','87o+','74s+','76o+','64s+','54s'],note:'BASE 7A-D · SB 5-MAX · 50.8% / 674 combos / 3 BB. Investigación francesa: Kill Tilt sitúa SB alrededor de 45-50% en micro 5-MAX y señala que puede abrirse más cuando BB foldea demasiado; otra discusión de Kill Tilt recomienda progresar desde ~35% hacia 45-55% según experiencia y field, llegando incluso más alto contra ciertos perfiles. Por eso 50.8% se mantiene como base experimental, no como rango universal. Punto crítico: SB juega OOP postflop, por lo que la amplitud debe validarse junto con BB vs SB y resultados propios. Sizing base 3 BB. EXPERIMENTAL.'}
  };
  return Object.entries(specs).map(([id,x])=>{
    const c=blankCells(); addRange(c,x.tokens,'open');
    return table(`w5_${id}`,x.name,'WINAMAX 5-MAX',`RFI ${x.name} · 5-MAX · ${x.pct} · ${x.combos} combos`,c,x.note,{status:'EXPERIMENTAL',format:'5-MAX',room:'Winamax',position:x.name,openSize:x.size,phase:'7A',subcategory:'RFI'});
  });
}
function winamax5BbDefenseSeed(){
  const t=table(
    'w5_bb_utg','BB vs UTG','WINAMAX 5-MAX',
    'Defensa BB vs UTG · 14.0% total · open 3 BB',
    blankCells(),
    'BASE 7B-1 · BB vs UTG 5-MAX · referencia de trabajo frente a open de 3 BB. Investigación francesa: en Kill Tilt se comparan referencias de defensa BB vs UTG (HJ en 5-MAX) de aproximadamente 13% y 23%; la propia discusión advierte que el rango depende del rival, del juego postflop y de la estructura del spot. Para nuestro sistema NL2 Winamax elegimos una base intermedia/conservadora de 14.0%, coherente además con nuestra defensa 6-MAX BB vs LJ de trabajo. No se presenta como GTO ni como rango universal. 3BET: 58 combos (4.37%). CALL: 128 combos (9.65%). Total defensa: 186 combos (14.03%). Open de referencia: 3 BB. Las fronteras se revisarán con pool y datos propios.',
    {status:'EXPERIMENTAL',format:'5-MAX',room:'Winamax',position:'BB',opponent:'UTG',phase:'7B',subcategory:'BB DEFENSE',openSize:'vs 3 BB'}
  );
  const threeBet=['AA','KK','QQ','AKs','AKo','A5s','A4s','A3s','A2s','KQs','AQs'];
  const call=['22','33','44','55','66','77','88','99','TT','JJ','AJs','ATs','KJs','QJs','JTs','T9s','98s','87s','76s','65s','A9s','A8s','A7s','A6s','KTs','QTs','J9s'];
  for(const h of expandSimple(threeBet)) t.cells[h]='bet3';
  for(const h of expandSimple(call)) t.cells[h]='call';
  return t;
}
function winamax5Templates(){
  const templates=[];
  const add=(id,name,subtitle,meta={})=>templates.push(table(`w5_${id}`,name,'WINAMAX 5-MAX',subtitle,blankCells(),'Plantilla 5-MAX Winamax. PENDIENTE: introducir y validar rango específico antes de usar.',{status:'PENDIENTE',format:'5-MAX',room:'Winamax',subcategory:meta.subcategory||'OTRO',...meta}));
  // 5-max cash positions: UTG, CO, BTN, SB, BB.
  winamax5RfiSeed().forEach(t=>templates.push(t));
  [['bb_utg','BB vs UTG','Defensa BB vs UTG'],['bb_co','BB vs CO','Defensa BB vs CO'],['bb_btn','BB vs BTN','Defensa BB vs BTN'],['bb_sb','BB vs SB','Blind vs Blind · BB vs SB']].forEach(([id,n,sub])=>add(id,n,sub,{position:'BB',opponent:n.replace('BB vs ',''),subcategory:'BB DEFENSE'}));
  [['3b_utg','vs UTG','3BET / CC vs UTG'],['3b_co','vs CO','3BET / CC vs CO'],['3b_btn','vs BTN','3BET / CC vs BTN'],['3b_sb','vs SB','3BET / CC vs SB']].forEach(([id,n,sub])=>add(id,n,sub,{opponent:n.replace('vs ',''),subcategory:'3BET / CC'}));
  [['vs3_utg','vs UTG','Respuesta a 3BET después de abrir UTG'],['vs3_co','vs CO','Respuesta a 3BET después de abrir CO'],['vs3_btn','vs BTN','Respuesta a 3BET después de abrir BTN'],['vs3_sb','vs SB','Respuesta a 3BET después de abrir SB']].forEach(([id,n,sub])=>add(id,n,sub,{opponent:n.replace('vs ',''),subcategory:'VS 3BET'}));
  [['4b_utg','vs UTG','4BET / CALL / FOLD vs UTG'],['4b_co','vs CO','4BET / CALL / FOLD vs CO'],['4b_btn','vs BTN','4BET / CALL / FOLD vs BTN'],['4b_sb','vs SB','4BET / CALL / FOLD vs SB']].forEach(([id,n,sub])=>add(id,n,sub,{opponent:n.replace('vs ',''),subcategory:'4BET'}));
  add('iso_utg','UTG vs limper','ISO RAISE · UTG vs limper',{position:'UTG',subcategory:'ISO RAISE'});
  add('iso_co','CO vs limper','ISO RAISE · CO vs limper',{position:'CO',subcategory:'ISO RAISE'});
  add('iso_btn','BTN vs limper','ISO RAISE · BTN vs limper',{position:'BTN',subcategory:'ISO RAISE'});
  add('iso_sb','SB vs limper','ISO RAISE · SB vs limper',{position:'SB',subcategory:'ISO RAISE'});
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
  const phase7=winamax5Templates(); return {schema:'labpok.v1',app:'LabPok v1',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),settings:{theme:'black-gold-neon'},actions:actionDefaults(),tables:[...tables,...phase2,...phase7],categories:['OR','ISO RAISE','3BET / CC','VS 3BET','4BET','BB DEFENSE','BLIND vs BLIND','WINAMAX 5-MAX'],guide:[],leaks:[],training:{},notes:[]};
}
function normalizeState(input){
  const s=clone(input || state || {});
  s.schema=s.schema||'labpok.v1';
  s.actions={...actionDefaults(),...(s.actions||{})};
  s.categories=[...(s.categories||[])];
  const extra=['OR','ISO RAISE','3BET / CC','VS 3BET','4BET','BB DEFENSE','BLIND vs BLIND','WINAMAX 5-MAX'];
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
  s.postflop={...(s.postflop||{}),score:Number(s.postflop?.score||0),attempts:Number(s.postflop?.attempts||0),streak:Number(s.postflop?.streak||0),bestStreak:Number(s.postflop?.bestStreak||0),spots:Array.isArray(s.postflop?.spots)?s.postflop.spots:[]};
  return s;
}
function actionDef(key){return state.actions[key]||BUILTIN_ACTIONS.fold}
function actionCss(key){const a=actionDef(key);return `--cell-bg:${a.color};--cell-text:${a.text||'#fff'};`}
function actionLabel(key){return actionDef(key).label||key.toUpperCase()}
function markDirty(entity=null){dirty=true;$('#dirtyBadge').textContent='CAMBIOS SIN EXPORTAR';$('#dirtyBadge').style.color='var(--orange)';queueCloudSave()}
function clearDirty(){dirty=false;$('#dirtyBadge').textContent='DATOS EN MEMORIA';$('#dirtyBadge').style.color='var(--green)'}
function getTable(){return state.tables.find(t=>t.id===selectedTableId)}
function ensureWinamax7A(){
  if(!state?.tables) return false;
  const seeded=winamax5RfiSeed();
  let changed=false;
  for(const seed of seeded){
    const t=state.tables.find(x=>x.id===seed.id);
    if(!t) continue;
    const hasOpen=Object.values(t.cells||{}).some(v=>v==='open');
    const isOldTemplate=String(t.status||'').toUpperCase()==='PENDIENTE' || !hasOpen;
    if(isOldTemplate || t.phase!=='7A'){
      t.cells=clone(seed.cells); t.status=seed.status; t.phase=seed.phase; t.format=seed.format; t.room=seed.room; t.position=seed.position; t.openSize=seed.openSize; t.name=seed.name; t.subtitle=seed.subtitle; t.notes=seed.notes; t.version=Math.max(1,Number(t.version)||1); t.updated=new Date().toISOString(); changed=true;
    }
  }
  const bbSeed=winamax5BbDefenseSeed();
  const bbTable=state.tables.find(x=>x.id===bbSeed.id);
  if(bbTable){
    const hasDefense=Object.values(bbTable.cells||{}).some(v=>v==='call'||v==='bet3');
    const isPending=String(bbTable.status||'').toUpperCase()==='PENDIENTE' || !hasDefense;
    if(isPending || bbTable.phase!=='7B'){
      bbTable.cells=clone(bbSeed.cells); bbTable.status=bbSeed.status; bbTable.phase=bbSeed.phase; bbTable.format=bbSeed.format; bbTable.room=bbSeed.room; bbTable.position=bbSeed.position; bbTable.opponent=bbSeed.opponent; bbTable.openSize=bbSeed.openSize; bbTable.name=bbSeed.name; bbTable.subtitle=bbSeed.subtitle; bbTable.notes=bbSeed.notes; bbTable.subcategory='BB DEFENSE'; bbTable.version=Math.max(1,Number(bbTable.version)||1); bbTable.updated=new Date().toISOString(); changed=true;
    }
  }
  const subById={
    w5_rfi_utg:'RFI',w5_rfi_co:'RFI',w5_rfi_btn:'RFI',w5_rfi_sb:'RFI',
    w5_bb_utg:'BB DEFENSE',w5_bb_co:'BB DEFENSE',w5_bb_btn:'BB DEFENSE',w5_bb_sb:'BB DEFENSE',
    w5_3b_utg:'3BET / CC',w5_3b_co:'3BET / CC',w5_3b_btn:'3BET / CC',w5_3b_sb:'3BET / CC',
    w5_vs3_utg:'VS 3BET',w5_vs3_co:'VS 3BET',w5_vs3_btn:'VS 3BET',w5_vs3_sb:'VS 3BET',
    w5_4b_utg:'4BET',w5_4b_co:'4BET',w5_4b_btn:'4BET',w5_4b_sb:'4BET',
    w5_iso_utg:'ISO RAISE',w5_iso_co:'ISO RAISE',w5_iso_btn:'ISO RAISE',w5_iso_sb:'ISO RAISE'
  };
  for(const t of state.tables.filter(x=>x.category==='WINAMAX 5-MAX')){
    const sub=subById[t.id];
    if(sub && t.subcategory!==sub){t.subcategory=sub;changed=true;}
  }
  if(!state.categories.includes('WINAMAX 5-MAX')){state.categories.push('WINAMAX 5-MAX');changed=true;}
  return changed;
}
function render(){renderNav();renderDashboard();renderRanges();renderGuide();renderTraining();renderLeaks();renderPostflop();renderWinamax5()}
function renderNav(){$$('.nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===activeView));$$('.view').forEach(v=>v.classList.toggle('active',v.id===`view-${activeView}`));$('#pageTitle').textContent={dashboard:'Dashboard',ranges:'Rangos',guide:'Guía de póker',training:'Entrenamiento',leaks:'Manos / Leaks',postflop:'Postflop Lab',winamax5:'Winamax 5-MAX',data:'Datos y backups'}[activeView]||'LabPok v1'}
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
      ensureWinamax7A();
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

const POSTFLOP_SPOTS = [
  {id:'k72r',name:'K72 rainbow',texture:'SECO',pot:'SRP · IP',street:'FLOP',board:['K♠','7♦','2♣'],hero:['A♠','K♥'],question:'Si eres el agresor preflop y tienes una mano fuerte en un board seco, ¿qué sizing base encaja con la guía?',options:['25–33%','50–66%','75%+','CHECK'],correct:'25–33%',why:'La guía actual usa K72r como referencia de board seco: 25–33%.'},
  {id:'j96tt',name:'J96 two-tone',texture:'MEDIO / COORDINADO',pot:'SRP · IP',street:'FLOP',board:['J♠','9♠','6♦'],hero:['A♠','J♦'],question:'En un J96 two-tone, ¿qué sizing base de estudio corresponde a la textura?',options:['25–33%','50–66%','75%+','CHECK'],correct:'50–66%',why:'La guía usa J96 two-tone como referencia de textura media: 50–66%.'},
  {id:'987tt',name:'987 two-tone',texture:'MUY DINÁMICO',pot:'SRP · IP',street:'FLOP',board:['9♠','8♠','7♦'],hero:['A♠','A♥'],question:'En un 987 two-tone, ¿qué sizing base de estudio se plantea?',options:['25–33%','33–50%','50–66%','75%+'],correct:'75%+',why:'La guía usa 987 two-tone como referencia dinámica: 75%+.'},
  {id:'772',name:'772 rainbow',texture:'PAREADO',pot:'SRP · IP',street:'FLOP',board:['7♠','7♦','2♣'],hero:['A♠','Q♠'],question:'En 772, ¿qué sizing base aparece en la guía?',options:['25–33%','50–66%','75%+','CHECK SIEMPRE'],correct:'25–33%',why:'La guía da 25–33% para 772, con la advertencia de que un board pareado no es automáticamente un buen bluff.'},
  {id:'a94mono',name:'A94 monotone',texture:'MONOCOLOR',pot:'SRP · IP',street:'FLOP',board:['A♠','9♠','4♠'],hero:['K♦','Q♠'],question:'En un board monotone, ¿qué rango de sizing usa la guía como referencia?',options:['25–33%','33–50%','66–75%','75%+'],correct:'33–50%',why:'La guía actual usa 33–50% para monotone y pide priorizar equity, bloqueadores y backdoors.'},
  {id:'discipline',name:'Board antes de mano',texture:'PRINCIPIO',pot:'CUALQUIERA',street:'FLOP',board:['K♣','7♦','2♠'],hero:['Q♥','J♥'],question:'¿Qué debe venir antes de decidir el sizing?',options:['Solo la fuerza de mi mano','Textura + rango + posición + sizing','Solo el resultado de la mano','El tamaño de mi stack'],correct:'Textura + rango + posición + sizing',why:'La guía resume la regla madre como RANGO × BOARD y pide considerar posición y sizing; la mano aislada no decide por sí sola.'}
];
function postflopCardHtml(card){const suit=card.slice(-1),rank=card.slice(0,-1);const red=['♥','♦'].includes(suit);return `<div class="post-card ${red?'red':''}"><span>${escapeHtml(rank)}</span><b>${escapeHtml(suit)}</b></div>`}
function postflopSpotHtml(spot){return `<article class="post-spot"><div class="post-spot-top"><div><span class="phase-badge">${escapeHtml(spot.street)}</span> <span class="phase-badge">${escapeHtml(spot.pot)}</span></div><strong>${escapeHtml(spot.name)}</strong></div><div class="post-board">${spot.board.map(postflopCardHtml).join('')}</div><div class="post-meta"><span>${escapeHtml(spot.texture)}</span><span>Hero: ${spot.hero.map(postflopCardHtml).join('')}</span></div><p>${escapeHtml(spot.why)}</p></article>`}
function renderPostflop(){
 const host=$('#postflopContent');if(!host)return;
 const pf=state.postflop||{}; const saved=[...(pf.spots||[])].sort((a,b)=>(b.updated||'').localeCompare(a.updated||''));
 host.innerHTML=`<div class="hero"><div class="card hero-main"><div class="eyebrow">LABPOK V1 / PHASE 06</div><h2>Postflop <span class="hero-accent">Lab</span>.</h2><p>Primera capa postflop de LabPok: lectura de textura, sizing base, entrenamiento de decisiones y registro de spots. Es una herramienta de estudio basada en la guía actual de LabPok; no pretende sustituir un solver ni dar una solución GTO exacta.</p><div class="toolbar"><button class="btn gold" id="newPostQuizBtn">Nueva situación →</button><button class="btn" id="postResetBtn">Reiniciar puntuación</button></div></div><div class="card training-score"><div class="stat-label">POSTFLOP SCORE</div><div class="stat-value">${pf.score}</div><div class="stat-foot">${pf.attempts} intentos · racha ${pf.streak} · mejor ${pf.bestStreak}</div></div></div>
 <div class="grid cards"><div class="card"><div class="stat-label">BOARD SECO</div><div class="stat-value">25–33%</div><div class="stat-foot">K72r</div></div><div class="card"><div class="stat-label">BOARD MEDIO</div><div class="stat-value">50–66%</div><div class="stat-foot">J96 two-tone</div></div><div class="card"><div class="stat-label">DINÁMICO</div><div class="stat-value">75%+</div><div class="stat-foot">987 two-tone</div></div><div class="card"><div class="stat-label">MONOTONE</div><div class="stat-value">33–50%</div><div class="stat-foot">A94 monotone</div></div></div>
 <div class="section-title">Entrenamiento postflop</div><div id="postQuizArea" class="card quiz-area"><div class="empty">Pulsa «Nueva situación» para empezar.</div></div>
 <div class="section-title">Biblioteca de texturas</div><div class="post-grid">${POSTFLOP_SPOTS.slice(0,5).map(postflopSpotHtml).join('')}</div>
 <div class="section-title">Registrar spot de estudio</div><div class="card post-review"><div class="eyebrow">HAND REVIEW</div><h3>Guardar una mano para revisar</h3><div class="meta-grid"><div class="field"><label>Street</label><select id="pfStreet"><option>FLOP</option><option>TURN</option><option>RIVER</option></select></div><div class="field"><label>Tipo de bote</label><select id="pfPot"><option>SRP</option><option>3BET POT</option><option>BLIND vs BLIND</option><option>OTRO</option></select></div><div class="field"><label>Posición</label><input id="pfPosition" placeholder="BTN vs BB"></div><div class="field"><label>Board</label><input id="pfBoard" placeholder="K♠ 7♦ 2♣"></div><div class="field"><label>Mano Hero</label><input id="pfHero" placeholder="A♠ K♥"></div><div class="field"><label>Acción / sizing</label><input id="pfAction" placeholder="C-bet 33% / check / call..."></div><div class="field full"><label>Qué quiero estudiar</label><textarea id="pfNote" placeholder="Qué ocurrió, qué dudaste y qué quieres comprobar."></textarea></div></div><div class="toolbar"><button class="btn gold" id="savePostSpotBtn">+ Guardar spot</button></div></div>
 <div class="section-title">Spots guardados</div><div id="postSavedSpots">${saved.length?saved.map(x=>`<article class="post-saved"><div class="note-meta"><span class="phase-badge">${escapeHtml(x.street)}</span><span>${escapeHtml(x.pot||'')}</span><span>${new Date(x.updated).toLocaleString('es-ES')}</span></div><h4>${escapeHtml(x.board||'Board')} · ${escapeHtml(x.hero||'')}</h4><p><b>${escapeHtml(x.position||'')}</b> · ${escapeHtml(x.action||'')}</p><p>${escapeHtml(x.note||'')}</p><button class="mini-btn danger-mini delete-post-spot" data-id="${escapeAttr(x.id)}">Eliminar</button></article>`).join(''):'<div class="empty">Todavía no hay spots guardados.</div>'}</div>`;
 $('#newPostQuizBtn').onclick=startPostflopQuiz;$('#postResetBtn').onclick=()=>{state.postflop.score=0;state.postflop.attempts=0;state.postflop.streak=0;state.postflop.bestStreak=0;markDirty();renderPostflop();toast('Puntuación postflop reiniciada.')};
 $('#savePostSpotBtn').onclick=savePostflopSpot;$$('.delete-post-spot',host).forEach(b=>b.onclick=()=>{state.postflop.spots=(state.postflop.spots||[]).filter(x=>x.id!==b.dataset.id);markDirty();renderPostflop();toast('Spot eliminado.')});
}
function startPostflopQuiz(){const spot=POSTFLOP_SPOTS[Math.floor(Math.random()*POSTFLOP_SPOTS.length)];window.currentPostQuiz=spot;const area=$('#postQuizArea');if(!area)return;area.innerHTML=`<div class="quiz-head"><div><div class="eyebrow">POSTFLOP DRILL</div><h3>${escapeHtml(spot.question)}</h3></div><span class="phase-badge">${escapeHtml(spot.pot)} · ${escapeHtml(spot.street)}</span></div><div class="post-quiz-board">${spot.board.map(postflopCardHtml).join('')}</div><div class="post-hero-line">Hero: ${spot.hero.map(postflopCardHtml).join('')}</div><div class="quiz-options post-options">${spot.options.map(o=>`<button class="quiz-option post-answer" data-answer="${escapeAttr(o)}">${escapeHtml(o)}</button>`).join('')}</div><div class="quiz-context">Textura: ${escapeHtml(spot.texture)} · Responde según la base de estudio actual de LabPok.</div>`;$$('.post-answer',area).forEach(b=>b.onclick=()=>answerPostflop(b.dataset.answer))}
function answerPostflop(answer){const q=window.currentPostQuiz;if(!q)return;const correct=answer===q.correct;const pf=state.postflop;pf.attempts++;if(correct){pf.score++;pf.streak++;pf.bestStreak=Math.max(pf.bestStreak,pf.streak)}else pf.streak=0;markDirty();const area=$('#postQuizArea');$$('.post-answer',area).forEach(b=>b.disabled=true);area.insertAdjacentHTML('beforeend',`<div class="quiz-result ${correct?'correct':'wrong'}"><strong>${correct?'✓ CORRECTO':'✕ INCORRECTO'}</strong><span>${escapeHtml(q.why)} ${!correct?`Tu respuesta: <b>${escapeHtml(answer)}</b>. Base: <b>${escapeHtml(q.correct)}</b>.`:''}</span><button class="btn gold" onclick="startPostflopQuiz()">Siguiente →</button></div>`);renderPostflopStatsOnly()}
function renderPostflopStatsOnly(){const score=$('#postflopContent .training-score');if(score){const pf=state.postflop;score.innerHTML=`<div class="stat-label">POSTFLOP SCORE</div><div class="stat-value">${pf.score}</div><div class="stat-foot">${pf.attempts} intentos · racha ${pf.streak} · mejor ${pf.bestStreak}</div>`}}
function savePostflopSpot(){const board=$('#pfBoard').value.trim(),hero=$('#pfHero').value.trim(),note=$('#pfNote').value.trim();if(!board||!hero||!note){toast('Completa Board, Mano Hero y Qué quiero estudiar.');return}const now=new Date().toISOString();state.postflop.spots=state.postflop.spots||[];state.postflop.spots.push({id:uid('pf'),street:$('#pfStreet').value,pot:$('#pfPot').value,position:$('#pfPosition').value.trim(),board,hero,action:$('#pfAction').value.trim(),note,created:now,updated:now});markDirty();renderPostflop();toast('Spot guardado en LabPok.')}
function renderWinamax5(){
  const host=$('#winamax5Content'); if(!host)return;
  const tables=state.tables.filter(t=>t.category==='WINAMAX 5-MAX');
  const groups={
    'RFI':['w5_rfi_utg','w5_rfi_co','w5_rfi_btn','w5_rfi_sb'],
    'BB DEFENSE':['w5_bb_utg','w5_bb_co','w5_bb_btn','w5_bb_sb'],
    '3BET / CC':['w5_3b_utg','w5_3b_co','w5_3b_btn','w5_3b_sb'],
    'VS 3BET':['w5_vs3_utg','w5_vs3_co','w5_vs3_btn','w5_vs3_sb'],
    '4BET':['w5_4b_utg','w5_4b_co','w5_4b_btn','w5_4b_sb'],
    'ISO RAISE':['w5_iso_utg','w5_iso_co','w5_iso_btn','w5_iso_sb']
  };
  const count=tables.length;
  const labels={
    'RFI':'Open Raise por posición',
    'BB DEFENSE':'Defensa de BB frente a cada open',
    '3BET / CC':'3BET y Cold Call frente a open',
    'VS 3BET':'Respuesta después de abrir y recibir 3BET',
    '4BET':'4BET / CALL / FOLD',
    'ISO RAISE':'Aislamiento frente a limpers'
  };
  const active=window.w5ActiveCategory && groups[window.w5ActiveCategory] ? window.w5ActiveCategory : 'RFI';
  const cards=groups[active].map(id=>{
    const t=state.tables.find(x=>x.id===id); if(!t)return '';
    const vals=Object.values(t.cells||{});
    const openCount=vals.filter(v=>v==='open').length;
    const callCount=vals.filter(v=>v==='call').length;
    const threeBetCount=vals.filter(v=>v==='bet3').length;
    const rangeInfo=openCount ? `${openCount} OPEN` : (callCount||threeBetCount ? `${threeBetCount} 3BET · ${callCount} CALL` : 'sin rango cargado');
    return `<button class="module w5-table" data-table-id="${t.id}"><div class="icon">${t.status==='VALIDADO'?'✓':t.status==='EXPERIMENTAL'?'◆':'○'}</div><h3>${escapeHtml(t.name)}</h3><p>${escapeHtml(t.subtitle||'')}</p><div class="w5-card-meta"><span class="phase-badge">${escapeHtml(t.status||'PENDIENTE')}</span><span>${rangeInfo}</span></div></button>`;
  }).join('');
  const completed=Object.fromEntries(Object.entries(groups).map(([g,ids])=>[g,ids.filter(id=>state.tables.find(t=>t.id===id)?.status==='VALIDADO').length]));
  host.innerHTML=`
    <div class="hero"><div class="card hero-main"><div class="eyebrow">LABPOK V1 / WINAMAX 5-MAX</div><h2>Nuevo formato. <span class="hero-accent">Nueva estrategia.</span></h2><p>Perfil independiente para cash 5-MAX de Winamax. Trabajaremos <b>UTG · CO · BTN · SB · BB</b> sin mezclarlo con las tablas 6-MAX.</p><div class="toolbar"><button class="btn gold" id="seedW5Btn">Aplicar / recuperar estructura</button><button class="btn" onclick="switchView('ranges')">Abrir editor de rangos →</button></div></div><div class="card training-score"><div class="stat-label">TABLAS 5-MAX</div><div class="stat-value">${count}</div><div class="stat-foot">6 categorías · 24 tablas</div></div></div>
    <div class="notice w5-warning"><b>Estado:</b> estamos construyendo el sistema 5-MAX por módulos. <b>7A = RFI</b> está construido y <b>7B = BB Defense</b> empieza ahora; el resto son plantillas pendientes. No se presentan como GTO.</div>
    <div class="section-title">Mapa de posiciones</div><div class="w5-seats"><div>UTG<small>Primera en hablar preflop</small></div><div>CO<small>Cutoff</small></div><div>BTN<small>Botón</small></div><div>SB<small>Ciega pequeña</small></div><div>BB<small>Ciega grande</small></div></div>
    <div class="section-title">Módulos 5-MAX</div>
    <div class="w5-category-tabs">${Object.keys(groups).map(g=>`<button class="w5-cat-tab ${g===active?'active':''}" data-w5cat="${escapeAttr(g)}"><strong>${escapeHtml(g)}</strong><span>${labels[g]}</span><em>${completed[g]||0}/4 validadas</em></button>`).join('')}</div>
    <div class="w5-category-head"><div><div class="eyebrow">${escapeHtml(active)}</div><h3>${escapeHtml(labels[active])}</h3></div><span class="phase-badge">${active==='RFI'?'FASE 7A':'PENDIENTE'}</span></div>
    <div class="module-grid w5-grid">${cards}</div>
    ${active==='RFI'?`<div class="card w5-study-box"><div class="eyebrow">7A · RFI</div><h3>Cómo vamos a construir los opens</h3><div class="w5-study-grid"><div><b>UTG</b><span>7A-A · Base temprana. Rango más cerrado del sistema.</span></div><div><b>CO</b><span>7A-B · Ampliación moderada al desaparecer una posición temprana.</span></div><div><b>BTN</b><span>7A-C · Steal IP. Mayor presión sobre SB/BB y rango más amplio.</span></div><div><b>SB</b><span>7A-D · Open específico SB vs BB; sizing propio y juego OOP.</span></div></div><p class="muted">Los cuatro rangos actuales son una base experimental. Antes de marcarlos como VALIDADO revisaremos composición, combos, sizing y después tus datos reales de Winamax.</p></div>`:''}
    ${active==='BB DEFENSE'?`<div class="card w5-study-box"><div class="eyebrow">7B · BB DEFENSE</div><h3>Primera defensa: BB vs UTG</h3><p class="muted">Base frente a open de 3 BB: 14.0% total. Separamos 3BET y CALL para estudiar la composición y no mezclar defensa pasiva con agresiva.</p><div class="w5-study-grid"><div><b>3BET</b><span>58 combos · 4.37% del total.</span></div><div><b>CALL</b><span>128 combos · 9.65% del total.</span></div><div><b>FOLD</b><span>Resto de combos.</span></div><div><b>CRITERIO</b><span>Rango conservador frente a la posición temprana; ajustar con pool y datos propios.</span></div></div></div>`:''}
    <div class="section-title">Orden de desarrollo</div><div class="card"><ol class="w5-roadmap"><li><b>7A · RFI</b> — construir y validar UTG, CO, BTN y SB.</li><li><b>7B · BB Defense</b> — BB vs UTG / CO / BTN / SB.</li><li><b>7C · 3BET / CC</b> — respuestas por posición.</li><li><b>7D · VS 3BET</b> — continuar, 4BET y fold.</li><li><b>7E · 4BET</b> — value, bluff y defensa.</li><li><b>7F · ISO RAISE</b> — ajustes contra limpers.</li><li><b>7G</b> — entrenamiento 5-MAX conectado a las tablas.</li></ol></div>`;
  $('#seedW5Btn').onclick=seedW5Templates;
  $$('.w5-cat-tab',host).forEach(b=>b.onclick=()=>{window.w5ActiveCategory=b.dataset.w5cat;renderWinamax5()});
  $$('.w5-table',host).forEach(b=>b.onclick=()=>{selectedTableId=b.dataset.tableId;activeRangeCategory='WINAMAX 5-MAX';switchView('ranges')});
}

function seedW5Templates(){
  const existing=new Set(state.tables.filter(t=>t.category==='WINAMAX 5-MAX').map(t=>t.id));
  const fresh=winamax5Templates().filter(t=>!existing.has(t.id));
  if(fresh.length){state.tables.push(...fresh); if(!state.categories.includes('WINAMAX 5-MAX'))state.categories.push('WINAMAX 5-MAX'); markDirty(); toast(`${fresh.length} plantillas 5-MAX creadas.`)}else toast('Las plantillas 5-MAX ya están creadas.');
  renderWinamax5();
}
function switchView(v){activeView=v;if(v==='ranges'&&!selectedTableId)selectedTableId=state.tables[0]?.id||null;renderNav();if(v==='ranges')renderRanges();if(v==='dashboard')renderDashboard();if(v==='guide')renderGuide();if(v==='training')renderTraining();if(v==='leaks')renderLeaks();if(v==='postflop')renderPostflop();if(v==='winamax5')renderWinamax5()}
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
      state=remote;const migrated7A=ensureWinamax7A();selectedTableId=state.tables?.[0]?.id||null;remoteReady=true;clearDirty();render();if(migrated7A){await syncCloud();toast('7A · RFI 5-MAX cargado y guardado en Firebase.')}else{setCloudStatus('SINCRONIZADO');toast('LabPok cargado desde Firebase.');}
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
