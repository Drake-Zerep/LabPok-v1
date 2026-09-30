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
    'Defensa BB vs UTG · 14.0% total · open 2.5 BB',
    blankCells(),
    'BASE 7B-1 · BB vs UTG 5-MAX · referencia de trabajo frente a open de 2.5 BB. Investigación francesa: en Kill Tilt se comparan referencias de defensa BB vs UTG (HJ en 5-MAX) de aproximadamente 13% y 23%; la propia discusión advierte que el rango depende del rival, del juego postflop y de la estructura del spot. Para nuestro sistema NL2 Winamax elegimos una base intermedia/conservadora de 14.0%, coherente además con nuestra defensa 6-MAX BB vs LJ de trabajo. No se presenta como GTO ni como rango universal. 3BET: 58 combos (4.37%). CALL: 128 combos (9.65%). Total defensa: 186 combos (14.03%). Open de referencia: 2.5 BB. La frecuencia 14.03% se mantiene como base experimental conservadora; revisar con pool y datos propios.',
    {status:'EXPERIMENTAL',format:'5-MAX',room:'Winamax',position:'BB',opponent:'UTG',phase:'7B',subcategory:'BB DEFENSE',openSize:'vs 2.5 BB'}
  );
  const threeBet=['AA','KK','QQ','AKs','AKo','A5s','A4s','A3s','A2s','KQs','AQs'];
  const call=['22','33','44','55','66','77','88','99','TT','JJ','AJs','ATs','KJs','QJs','JTs','T9s','98s','87s','76s','65s','A9s','A8s','A7s','A6s','KTs','QTs','J9s'];
  for(const h of expandSimple(threeBet)) t.cells[h]='bet3';
  for(const h of expandSimple(call)) t.cells[h]='call';
  return t;
}
function winamax5BbCoDefenseSeed(){
  const t=table(
    'w5_bb_co','BB vs CO','WINAMAX 5-MAX',
    'Defensa BB vs CO · 31.8% total · open 2.5 BB',
    blankCells(),
    'BASE 7B-2 · BB vs CO 5-MAX · referencia de trabajo frente a open de 2.5 BB. La referencia solver consultada para BB vs CO a 100bb sitúa la defensa total alrededor de 31.4% (23.8% CALL + 7.7% 3BET), mientras que una referencia general de BB defense sitúa este spot alrededor de 40-45% en 6-MAX. Para nuestro sistema Winamax NL2 5-MAX elegimos una base de 31.8%, deliberadamente contenida por el rake y por el carácter experimental del módulo. 3BET: 106 combos (8.0%). CALL: 316 combos (23.8%). Total defensa: 422 combos (31.8%). Open de referencia: 2.5 BB. No se presenta como GTO ni como rango universal; las fronteras se revisarán con pool y datos propios.',
    {status:'EXPERIMENTAL',format:'5-MAX',room:'Winamax',position:'BB',opponent:'CO',phase:'7B',subcategory:'BB DEFENSE',openSize:'vs 2.5 BB'}
  );
  const threeBet=['QQ+','AQs+','AKo','A5s','A4s','A3s','A2s','KQs','KTs+','QTs+','JTs+','T9s','AJo','KQo'];
  const call=['22+','A6s+','ATo+','K9s+','KJo','Q9s+','QJo','J9s','JTo','T8s+','98s','87s','76s','65s','54s','KTs','QTs','JTs','T9s','97s','86s','75s','64s','KTo','QTo','A9o','K9o','Q9o','J9o','98o','87o','J8o','T9o'];
  for(const h of expandSimple(threeBet)) t.cells[h]='bet3';
  for(const h of expandSimple(call)) if(t.cells[h]==='fold') t.cells[h]='call';
  return t;
}
function winamax5BbBtnDefenseSeed(){
  const t=table(
    'w5_bb_btn','BB vs BTN','WINAMAX 5-MAX',
    'Defensa BB vs BTN · 39.1% total · open 2.5 BB',
    blankCells(),
    'BASE 7B-3 · BB vs BTN 5-MAX · referencia de trabajo frente a open de 2.5 BB. La investigación francesa consultada trata BB vs BTN como un spot central de defensa y señala que la amplitud debe adaptarse al porcentaje de apertura del BTN. Una referencia de Poker Académie muestra un spot teórico BB vs BU contra un open de 40% a 2.5x con rangos específicos para 5% de rake; el material no proporciona en texto una frecuencia única que debamos copiar. Para nuestro sistema NL2 Winamax 5-MAX construimos por inferencia una base de 39.1% total: 154 combos 3BET (11.6%) y 364 combos CALL (27.5%). El BTN de nuestro módulo abre 46.9%, por lo que la defensa se amplía respecto a BB vs CO. No se presenta como GTO ni como rango universal; es una base EXPERIMENTAL que se revisará con pool y datos propios.',
    {status:'EXPERIMENTAL',format:'5-MAX',room:'Winamax',position:'BB',opponent:'BTN',phase:'7B',subcategory:'BB DEFENSE',openSize:'vs 2.5 BB'}
  );
  const threeBet=['88+','ATs+','A5s','A4s','A3s','A2s','AJo+','KQs','KJs','QJs','KQo','KTs','QTs','JTs','T9s','98s'];
  const call=['22+','A6s+','K8s+','Q5s+','J6s+','T6s+','95s+','85s+','74s+','64s+','54s','43s','A8o+','K8o+','Q8o+','J8o+','T8o+','87o'];
  for(const h of expandSimple(threeBet)) t.cells[h]='bet3';
  for(const h of expandSimple(call)) if(t.cells[h]==='fold') t.cells[h]='call';
  return t;
}
function winamax5BbSbDefenseSeed(){
  const t=table(
    'w5_bb_sb','BB vs SB','WINAMAX 5-MAX',
    'Defensa BB vs SB · 55.4% total · open 3 BB',
    blankCells(),
    'BASE 7B-4 · BB vs SB / Blind vs Blind 5-MAX · referencia de trabajo frente a open de 3 BB. Este spot es distinto de BB vs BTN/CO porque BB queda IP postflop y recibe mejores condiciones de realización de equity. Las referencias francesas consultadas señalan precisamente que BB vs SB puede defenderse más ancho que frente a opens OOP, y un trabajo de Poker Académie sobre 5-MAX mantiene una estrategia BvB polarizada y ajustable al rango de SB. Para nuestro módulo, SB abre 50.8% y construimos una defensa base de 55.4%: 180 combos 3BET (13.6%) y 554 combos CALL (41.8%). Es una base EXPERIMENTAL, no una tabla GTO ni un rango universal. Sizing de referencia: SB open 3 BB. Las fronteras se revisarán con pool y datos propios.',
    {status:'EXPERIMENTAL',format:'5-MAX',room:'Winamax',position:'BB',opponent:'SB',phase:'7B',subcategory:'BB DEFENSE',openSize:'vs 3 BB'}
  );
  const threeBet=['99+','A2s+','AJo+','KQo','K9s+','Q9s+','J9s+','T9s','98s','87s'];
  const call=['22','33','44','55','66','77','88','A2o','A3o','A4o','A5o','A6o','A7o','A8o','A9o','ATo','K2s+','K7o+','Q4s+','Q8o+','J5s+','J8o+','T5s+','T8o+','95s+','97o+','85s+','87o+','74s+','76o+','64s+','54s','43s','K6o+','Q7o+','J7o+','T7o+','96o+'];
  for(const h of expandSimple(threeBet)) t.cells[h]='bet3';
  for(const h of expandSimple(call)) if(t.cells[h]==='fold') t.cells[h]='call';
  return t;
}
function winamax5ThreeBetCcUtgSeed(){
  const t=table(
    'w5_3b_utg','CO vs UTG','WINAMAX 5-MAX',
    '3BET / CC · CO vs UTG · open UTG 2.5 BB',
    blankCells(),
    'BASE 7C-1 · CO vs UTG 5-MAX. UTG abre 20.1% en nuestro módulo y CO es la primera posición que responde. Las referencias francesas consultadas sitúan el primer open 5-MAX alrededor del 18-20%, por lo que tratamos este spot como una respuesta frente a un rango relativamente fuerte. Como referencia contextual adicional, una guía reciente de 3BET para NL2-NL10 sitúa las posiciones tempranas alrededor de 4-6% de 3BET. Para LabPok elegimos 58 combos de 3BET (4.37%) y 96 combos de CALL (7.24%), evitando convertir la tabla en una solución GTO universal. Sizing de referencia: UTG 2.5 BB. Estado EXPERIMENTAL; revisar con pool y datos propios.',
    {status:'EXPERIMENTAL',format:'5-MAX',room:'Winamax',position:'CO',opponent:'UTG',phase:'7C',subcategory:'3BET / CC',openSize:'vs 2.5 BB'}
  );
  const threeBet=['QQ+','AKs','AKo','A5s','A4s','A3s','A2s','KQs','KJs'];
  const call=['66','77','88','99','TT','JJ','AQs','AJs','AQo','AJo','A9s','QJs','JTs','T9s','QTs','T8s','98s','87s','76s','65s'];
  for(const h of expandSimple(threeBet)) t.cells[h]='bet3';
  for(const h of expandSimple(call)) if(t.cells[h]==='fold') t.cells[h]='call';
  return t;
}
function winamax5ThreeBetCcCoSeed(){
  const t=table(
    'w5_3b_co','BTN vs CO','WINAMAX 5-MAX',
    '3BET / CC · BTN vs CO · open CO 2.5 BB',
    blankCells(),
    'BASE 7C-5 · BTN vs CO 5-MAX. CO abre 24.9% en nuestro módulo y BTN responde IP. Una referencia de Kill Tilt para NL2 señala que BU vs CO suele usar una estrategia de 3BET relativamente alta, alrededor de 7-10%, y que puede polarizarse más contra un CO que foldea demasiado; también advierte que en NL2 conviene evitar inflar el 3BET sin necesidad. Para LabPok construimos una base EXPERIMENTAL de 110 combos de 3BET (8.30%) y 208 combos de CALL (15.69%), 318 combos de continuación total (23.98%). Sizing de referencia: CO 2.5 BB. El CALL aprovecha la posición de BTN; la 3BET combina valor y bluffs suited/bloqueadores. No se presenta como GTO ni como rango oficial de Winamax; revisar con pool y datos propios.',
    {status:'EXPERIMENTAL',format:'5-MAX',room:'Winamax',position:'BTN',opponent:'CO',phase:'7C',subcategory:'3BET / CC',openSize:'vs 2.5 BB'}
  );
  const threeBet=['QQ+','A2s','A3s','A4s','A5s','A9s+','KTs+','QJs','JTs','AJo+'];
  const call=['22+','A6s','A7s','A8s','K9s','Q9s','J9s','T8s+','97s+','86s+','75s+','64s+','53s+','43s','A9o','ATo','KJo','QJo','JTo','KTo'];
  for(const h of expandSimple(threeBet)) t.cells[h]='bet3';
  for(const h of expandSimple(call)) if(t.cells[h]==='fold') t.cells[h]='call';
  return t;
}
function winamax5ThreeBetCcBtnSeed(){
  const t=table(
    'w5_3b_btn','BTN vs UTG','WINAMAX 5-MAX',
    '3BET / CC · BTN vs UTG · open UTG 2.5 BB',
    blankCells(),
    'BASE 7C-2 · BTN vs UTG 5-MAX. UTG abre 20.1% en nuestro módulo y BTN responde con posición postflop. Las referencias históricas de micro límites 5-MAX muestran que el 3BET IP se usa de forma activa y que el BTN puede continuar más ancho que CO, pero no existe una tabla oficial actual de Winamax NL2 5-MAX que debamos copiar. Para LabPok construimos una base EXPERIMENTAL de 76 combos de 3BET (5.73%) y 160 combos de CALL (12.07%), 236 combos de continuación total (17.80%). Sizing de referencia: UTG 2.5 BB. El CALL prioriza parejas medias, broadways y suited connectors con buena realización IP; la 3BET concentra valor y algunos bluffs suited. Revisar con pool y datos propios.',
    {status:'EXPERIMENTAL',format:'5-MAX',room:'Winamax',position:'BTN',opponent:'UTG',phase:'7C',subcategory:'3BET / CC',openSize:'vs 2.5 BB'}
  );
  const threeBet=['QQ+','AKs','AKo','A5s','A4s','A3s','A2s','KQs','KJs','QJs','JTs','T9s','AJo','KQo'];
  const call=['22+','A6s+','ATo','KTs+','KJo','QTs+','QJo','JTs','T9s','98s','87s','76s','65s','54s','A9s','A8s','A7s','A6s','A9o','KTo','QTo','JTo','T8s','97s','86s','75s','64s'];
  for(const h of expandSimple(threeBet)) t.cells[h]='bet3';
  for(const h of expandSimple(call)) if(t.cells[h]==='fold') t.cells[h]='call';
  return t;
}
function winamax5ThreeBetCcSbSeed(){
  const t=table(
    'w5_3b_sb','SB vs UTG','WINAMAX 5-MAX',
    '3BET / CC · SB vs UTG · open UTG 2.5 BB',
    blankCells(),
    'BASE 7C-3 · SB vs UTG 5-MAX. UTG abre 20.1% y SB responde OOP postflop. Las referencias disponibles distinguen el 3BET IP del 3BET OOP y muestran ejemplos de 5-MAX Winamax donde SB 3BETea frente a aperturas; no existe una tabla oficial actual de Winamax NL2 5-MAX que debamos copiar. Para LabPok usamos una base EXPERIMENTAL de 62 combos de 3BET (4.68%) y 76 combos de CALL (5.73%), 138 combos de continuación total (10.41%). El CALL es deliberadamente más contenido que BTN/CO porque SB juega OOP; la 3BET concentra valor y bluffs suited con buena bloqueabilidad. Sizing de referencia: UTG 2.5 BB. Revisar con pool y datos propios.',
    {status:'EXPERIMENTAL',format:'5-MAX',room:'Winamax',position:'SB',opponent:'UTG',phase:'7C',subcategory:'3BET / CC',openSize:'vs 2.5 BB'}
  );
  const threeBet=['QQ+','AKs','AKo','AQs','A5s','A4s','A3s','A2s','KQs','KJs'];
  const call=['22+','AJs','ATs','KQs','KJs','QJs','JTs','T9s'];
  for(const h of expandSimple(threeBet)) t.cells[h]='bet3';
  for(const h of expandSimple(call)) if(t.cells[h]==='fold') t.cells[h]='call';
  return t;
}
function winamax5ThreeBetCcBbUtgSeed(){
  const t=table(
    'w5_3b_bb_utg','BB vs UTG','WINAMAX 5-MAX',
    '3BET / CC · BB vs UTG · open UTG 2.5 BB',
    blankCells(),
    'BASE 7C-4 · BB vs UTG 5-MAX. Este spot NO sustituye a 7B-1: 7B-1 estudia la defensa total de BB, mientras que 7C-4 separa explícitamente las dos acciones de continuación, 3BET y CALL, frente al mismo open de 2.5 BB. La referencia francesa consultada sobre BB vs UTG (HJ en 5-MAX) compara defensas alrededor de 13% y 23% y destaca que el spot depende del rival y del juego postflop. Para nuestro sistema NL2 Winamax 5-MAX mantenemos la base conservadora de 7B-1: 58 combos de 3BET (4.37%) + 128 combos de CALL (9.65%) = 186 combos de continuación (14.03%). La construcción es lineal/mixta, con low Axs como parte importante de la 3BET y calls selectivos de parejas, broadways suited y conectores suited. No se presenta como GTO ni como rango oficial de Winamax; revisar con pool y datos propios.',
    {status:'EXPERIMENTAL',format:'5-MAX',room:'Winamax',position:'BB',opponent:'UTG',phase:'7C',subcategory:'3BET / CC',openSize:'vs 2.5 BB'}
  );
  const threeBet=['AA','KK','QQ','AKs','AKo','A5s','A4s','A3s','A2s','KQs','AQs'];
  const call=['22','33','44','55','66','77','88','99','TT','JJ','AJs','ATs','KJs','QJs','JTs','T9s','98s','87s','76s','65s','A9s','A8s','A7s','A6s','KTs','QTs','J9s'];
  for(const h of expandSimple(threeBet)) t.cells[h]='bet3';
  for(const h of expandSimple(call)) if(t.cells[h]==='fold') t.cells[h]='call';
  return t;
}

function winamax5ThreeBetCcSbCoSeed(){
  const t=table('w5_3b_sb_co','SB vs CO','WINAMAX 5-MAX','3BET / CC · SB vs CO · open CO 2.5 BB',blankCells(),
    'BASE 7C · SB vs CO 5-MAX. CO abre 24.9% y SB juega OOP postflop. Por la desventaja de posición priorizamos una estrategia tight/agresiva: 92 combos de 3BET (6.94%) y 86 combos de CALL (6.49%), 178 combos de continuación (13.42%). La 3BET concentra valor y bluffs suited/bloqueadores; el CALL queda contenido. Sizing de referencia: CO 2.5 BB. Estado EXPERIMENTAL; revisar con pool y datos propios.',
    {status:'EXPERIMENTAL',format:'5-MAX',room:'Winamax',position:'SB',opponent:'CO',phase:'7C',subcategory:'3BET / CC',openSize:'vs 2.5 BB'});
  const threeBet=['JJ+','AKs','AKo','AQs','A5s','A4s','A3s','A2s','KQs','KJs','QJs','JTs','T9s','AJo'];
  const call=['22','33','44','55','66','77','88','99','TT','AJs','ATs','KQs','KJs','QJs','JTs','T9s','98s'];
  for(const h of expandSimple(threeBet)) t.cells[h]='bet3';
  for(const h of expandSimple(call)) if(t.cells[h]==='fold') t.cells[h]='call';
  return t;
}
function winamax5ThreeBetCcSbBtnSeed(){
  const t=table('w5_3b_sb_btn','SB vs BTN','WINAMAX 5-MAX','3BET / CC · SB vs BTN · open BTN 2.5 BB',blankCells(),
    'BASE 7C · SB vs BTN 5-MAX. BTN abre 46.9% y SB responde OOP. Frente a un steal tan amplio aumentamos la presión de 3BET, manteniendo el CALL relativamente contenido por jugar fuera de posición: 120 combos de 3BET (9.05%) y 70 combos de CALL (5.28%), 190 combos de continuación (14.33%). Sizing de referencia: BTN 2.5 BB. Estado EXPERIMENTAL; revisar con pool y datos propios.',
    {status:'EXPERIMENTAL',format:'5-MAX',room:'Winamax',position:'SB',opponent:'BTN',phase:'7C',subcategory:'3BET / CC',openSize:'vs 2.5 BB'});
  const threeBet=['99+','AKs','AKo','AQs','A5s','A4s','A3s','A2s','KQs','KJs','QJs','JTs','T9s','98s','AJo','KQo'];
  const call=['22','33','44','55','66','77','88','AJs','ATs','KTs','QTs','J9s','T9s','98s'];
  for(const h of expandSimple(threeBet)) t.cells[h]='bet3';
  for(const h of expandSimple(call)) if(t.cells[h]==='fold') t.cells[h]='call';
  return t;
}
function winamax5ThreeBetCcBbCoSeed(){
  const t=winamax5BbCoDefenseSeed(); t.id='w5_3b_bb_co'; t.name='BB vs CO'; t.subtitle='3BET / CC · BB vs CO · open CO 2.5 BB'; t.notes='BASE 7C · BB vs CO 5-MAX. Esta tabla separa las dos acciones de continuación del spot 7B-2: 106 combos de 3BET (7.99%) y 316 combos de CALL (23.83%), 422 combos de continuación total (31.82%). Se mantiene la misma defensa total para conservar coherencia entre módulos. Estado EXPERIMENTAL; revisar con pool y datos propios.'; t.phase='7C'; t.subcategory='3BET / CC'; t.openSize='vs 2.5 BB'; return t;
}
function winamax5ThreeBetCcBbBtnSeed(){
  const t=winamax5BbBtnDefenseSeed(); t.id='w5_3b_bb_btn'; t.name='BB vs BTN'; t.subtitle='3BET / CC · BB vs BTN · open BTN 2.5 BB'; t.notes='BASE 7C · BB vs BTN 5-MAX. Esta tabla separa las dos acciones de continuación del spot 7B-3: 154 combos de 3BET (11.61%) y 364 combos de CALL (27.45%), 518 combos de continuación total (39.06%). Se mantiene la misma defensa total para conservar coherencia entre módulos. Estado EXPERIMENTAL; revisar con pool y datos propios.'; t.phase='7C'; t.subcategory='3BET / CC'; t.openSize='vs 2.5 BB'; return t;
}
function winamax5ThreeBetCcBbSbSeed(){
  const t=winamax5BbSbDefenseSeed(); t.id='w5_3b_bb_sb'; t.name='BB vs SB'; t.subtitle='3BET / CC · BB vs SB · open SB 3 BB'; t.notes='BASE 7C · BB vs SB 5-MAX. Esta tabla separa las dos acciones de continuación del spot 7B-4: 180 combos de 3BET (13.57%) y 554 combos de CALL (41.78%), 734 combos de continuación total (55.35%). Es un spot Blind vs Blind y no debe mezclarse con las defensas BB frente a posiciones IP. Estado EXPERIMENTAL; revisar con pool y datos propios.'; t.phase='7C'; t.subcategory='3BET / CC'; t.openSize='vs 3 BB'; return t;
}

function winamax5Vs3BetSeed(id, name, opener, openSize, value, bluff, call, note){
  const t=table(id,name,'WINAMAX 5-MAX',`VS 3BET · ${name} · open ${opener} ${openSize}`,blankCells(),note,{status:'EXPERIMENTAL',format:'5-MAX',room:'Winamax',position:opener,opponent:'3BET',phase:'7D',subcategory:'VS 3BET',openSize:`${openSize} open`});
  for(const h of expandSimple(value)) t.cells[h]='bet4';
  for(const h of expandSimple(bluff)) if(t.cells[h]==='fold') t.cells[h]='bluff';
  for(const h of expandSimple(call)) if(t.cells[h]==='fold') t.cells[h]='call';
  return t;
}
function winamax5Vs3UtgSeed(){
  return winamax5Vs3BetSeed('w5_vs3_utg','UTG vs 3BET','UTG','2.5 BB',
    ['QQ+','AKs','AKo'],['A5s','A4s','A3s','A2s'],
    ['99','TT','JJ','AQs','AJs','AQo','KQs','KQo','KJs','QJs'],
    'BASE 7D-1 · UTG vs 3BET. UTG abre 20.1%, por lo que su rango inicial es relativamente fuerte. Frente a una 3BET estándar de ~9-10 BB, construimos una defensa simplificada y conservadora: 34 combos de 4BET VALUE, 16 de 4BET BLUFF y 62 de CALL; 112 combos de continuación (8.45% del total). La base prioriza QQ+/AK en 4BET value, A5s-A2s como bloqueadores y parejas/broadways fuertes en CALL. No es GTO ni una tabla oficial de Winamax; es una base EXPERIMENTAL para NL2 5-MAX.' );
}
function winamax5Vs3CoSeed(){
  return winamax5Vs3BetSeed('w5_vs3_co','CO vs 3BET','CO','2.5 BB',
    ['QQ+','AKs','AKo'],['A5s','A4s','A3s','A2s'],
    ['88','99','TT','JJ','AQs','AJs','ATs','AQo','KQs','KJs','QJs','JTs','T9s'],
    'BASE 7D-2 · CO vs 3BET. CO abre 24.9% y puede continuar algo más ancho que UTG, especialmente IP cuando la 3BET procede de BTN. Base: 34 combos de 4BET VALUE, 16 de 4BET BLUFF y 68 de CALL; 118 combos de continuación (8.90%). La 4BET bluff usa A5s-A2s como bloqueadores; el CALL concentra pares medios, broadways suited y algunas manos con buena realización. Estado EXPERIMENTAL.' );
}
function winamax5Vs3BtnSeed(){
  return winamax5Vs3BetSeed('w5_vs3_btn','BTN vs 3BET','BTN','2.5 BB',
    ['JJ+','AKs','AKo'],['A5s','A4s','A3s','A2s','K5s','K4s'],
    ['77','88','99','TT','AQs','AJs','ATs','AQo','AJo','KQs','KJs','KTs','QJs','QTs','JTs','T9s','98s'],
    'BASE 7D-3 · BTN vs 3BET. BTN abre 46.9%, por lo que su rango inicial es mucho más amplio y la defensa frente a 3BET debe ser más amplia que UTG/CO. Base: 40 combos de 4BET VALUE, 24 de 4BET BLUFF y 92 de CALL; 156 combos de continuación (11.76%). La posición postflop favorece un CALL más amplio, mientras que Axs/Kxs aportan candidatos de 4BET bluff. Estado EXPERIMENTAL.' );
}
function winamax5Vs3SbSeed(){
  return winamax5Vs3BetSeed('w5_vs3_sb','SB vs 3BET','SB','3 BB',
    ['QQ+','AKs','AKo'],['A5s','A4s','A3s','A2s','K5s','K4s'],
    ['99','TT','JJ','AQs','AJs','ATs','KQs','KJs','QJs','JTs','T9s','98s'],
    'BASE 7D-4 · SB vs 3BET. SB abre 50.8% y juega OOP postflop, por lo que no queremos defender la amplitud de BTN de forma mecánica. Base: 34 combos de 4BET VALUE, 24 de 4BET BLUFF y 54 de CALL; 112 combos de continuación (8.45%). El rango prioriza 4BET con valor/bloqueadores y calls de manos suited que conservan jugabilidad. Estado EXPERIMENTAL.' );
}

function winamax5FourBetSeed(id,name,opener,openSize,value,bluff,note){
  const t=table(id,name,'WINAMAX 5-MAX',`4BET · ${name} · frente a 3BET`,blankCells(),note,{status:'EXPERIMENTAL',format:'5-MAX',room:'Winamax',position:opener,opponent:'3BET',phase:'7E',subcategory:'4BET',openSize:`${openSize} open`});
  for(const h of expandSimple(value)) t.cells[h]='bet4';
  for(const h of expandSimple(bluff)) if(t.cells[h]==='fold') t.cells[h]='bluff';
  return t;
}
function winamax5FourBetUtgSeed(){
  return winamax5FourBetSeed('w5_4b_utg','UTG vs 3BET','UTG','2.5 BB',
    ['QQ+','AKs','AKo'],['A5s','A4s','A3s','A2s'],
    'BASE 7E-1 · UTG 4BET vs 3BET. Extraemos exclusivamente el núcleo de 4BET del bloque 7D: 34 combos de 4BET VALUE (2.56% del total) + 16 combos de 4BET BLUFF (1.21%) = 50 combos / 3.77%. La 4BET bluff utiliza A5s-A2s como bloqueadores. El CALL y FOLD se estudian en 7D; esta tabla existe para estudiar de forma aislada las manos que convierten el spot en 4BET. Estado EXPERIMENTAL.' );
}
function winamax5FourBetCoSeed(){
  return winamax5FourBetSeed('w5_4b_co','CO vs 3BET','CO','2.5 BB',
    ['QQ+','AKs','AKo'],['A5s','A4s','A3s','A2s'],
    'BASE 7E-2 · CO 4BET vs 3BET. Extraemos exclusivamente el núcleo de 4BET del bloque 7D: 34 combos de 4BET VALUE + 16 combos de 4BET BLUFF = 50 combos / 3.77% del total. CO tiene un rango inicial más amplio que UTG, pero mantenemos una construcción prudente para NL2. El CALL y FOLD permanecen en 7D. Estado EXPERIMENTAL.' );
}
function winamax5FourBetBtnSeed(){
  return winamax5FourBetSeed('w5_4b_btn','BTN vs 3BET','BTN','2.5 BB',
    ['JJ+','AKs','AKo'],['A5s','A4s','A3s','A2s','K5s','K4s'],
    'BASE 7E-3 · BTN 4BET vs 3BET. Extraemos exclusivamente el núcleo de 4BET del bloque 7D: 40 combos de 4BET VALUE (3.02%) + 24 combos de 4BET BLUFF (1.81%) = 64 combos / 4.83%. BTN abre 46.9%, por lo que el rango inicial es amplio y permite más candidatos de 4BET bluff. Estado EXPERIMENTAL; revisar según frecuencia real de 3BET/5BET del pool.' );
}
function winamax5FourBetSbSeed(){
  return winamax5FourBetSeed('w5_4b_sb','SB vs 3BET','SB','3 BB',
    ['QQ+','AKs','AKo'],['A5s','A4s','A3s','A2s','K5s','K4s'],
    'BASE 7E-4 · SB 4BET vs 3BET. Extraemos exclusivamente el núcleo de 4BET del bloque 7D: 34 combos de 4BET VALUE (2.56%) + 24 combos de 4BET BLUFF (1.81%) = 58 combos / 4.37%. SB juega OOP y abre 50.8%, por lo que mantenemos presión mediante 4BET sin convertir el rango en una copia de BTN. Estado EXPERIMENTAL.' );
}


function winamax5IsoSeed(id,name,hero,limper,openSize,tokens,note){
  const t=table(id,name,'WINAMAX 5-MAX',`ISO RAISE · ${name} · 1 limper · ${openSize}`,blankCells(),note,{status:'EXPERIMENTAL',format:'5-MAX',room:'Winamax',position:hero,opponent:limper,phase:'7F',subcategory:'ISO RAISE',openSize});
  for(const h of expandSimple(tokens)) t.cells[h]='open';
  return t;
}
function winamax5IsoCoSeed(){
  return winamax5IsoSeed('w5_iso_utg','CO vs UTG limper','CO','UTG','4.5 BB',
    ['22+','A2s+','A8o+','K9s+','KTo+','Q9s+','QTo+','J9s+','JTo','T8s+','98s','87s','76s','65s','54s'],
    'BASE 7F-1 · CO vs UTG limper · 1 limper. CO acts after UTG and is IP relative to the limper if heads-up postflop. Base EXPERIMENTAL: 334 combos (25.19%). Sizing base: 4.5 BB con 1 limper; +1 BB por cada limper adicional. El rango prioriza pares, Ax, broadways y suited connectors. No es GTO ni una tabla oficial de Winamax; ajustar según limp/fold, tendencia postflop y pool.' );
}
function winamax5IsoBtnSeed(){
  return winamax5IsoSeed('w5_iso_co','BTN vs UTG limper','BTN','UTG','4.5 BB',
    ['22+','A2s+','A2o+','K2s+','K8o+','Q5s+','Q9o+','J7s+','J8o+','T6s+','T8o+','96s+','97o+','86s+','87o+','75s+','76o+','65s','54s'],
    'BASE 7F-2 · BTN vs UTG limper · 1 limper. BTN acts after UTG and has position relative to the limper heads-up. Base EXPERIMENTAL: 614 combos (46.30%). Sizing base: 4.5 BB con 1 limper; +1 BB por cada limper adicional. Amplitud condicionada al limp/fold y a la calidad de las ciegas.' );
}
function winamax5IsoSbSeed(){
  return winamax5IsoSeed('w5_iso_btn','SB vs UTG limper','SB','UTG','5.5 BB',
    ['22+','A2s+','A9o+','K8s+','KJo+','Q9s+','QJo','J9s+','T9s','98s','87s','76s','65s'],
    'BASE 7F-3 CORREGIDA · SB vs UTG limper · 1 limper. SB queda OOP si UTG paga. Rango más selectivo por posición y por el riesgo de multiway. Base EXPERIMENTAL: ~28,4% de la matriz. Sizing OOP: 5.5 BB con 1 limper; +1 BB por limper adicional.' );
}
function winamax5IsoBbSeed(){
  return winamax5IsoSeed('w5_iso_sb','BB vs UTG limper','BB','UTG','5.5 BB',
    ['22+','A2s+','A8o+','K7s+','KJo+','Q8s+','QJo','J8s+','T8s+','98s','87s','76s','65s'],
    'BASE 7F-4 CORREGIDA · BB vs UTG limper · 1 limper. BB queda OOP si UTG paga. Rango más selectivo que un ISO IP. Base EXPERIMENTAL: ~31,4% de la matriz. Sizing OOP: 5.5 BB con 1 limper; +1 BB por limper adicional.' );
}
function winamax5IsoBtnCoSeed(){
  return winamax5IsoSeed('w5_iso_btn_co','BTN vs CO limper','BTN','CO','4.5 BB',
    ['22+','A2s+','A2o+','K2s+','K8o+','Q4s+','Q9o+','J6s+','J8o+','T6s+','T8o+','96s+','97o+','86s+','87o+','75s+','76o+','65s','54s'],
    'BASE 7F-5 · BTN vs CO limper · 1 limper. CO es un limper más tardío y potencialmente más amplio que UTG, por lo que BTN puede ampliar el ISO. Base EXPERIMENTAL: aproximadamente 48% de la matriz. Sizing base 4.5 BB +1 BB por limper adicional.' );
}
function winamax5IsoSbCoSeed(){
  return winamax5IsoSeed('w5_iso_sb_co','SB vs CO limper','SB','CO','5.5 BB',
    ['22+','A2s+','A7o+','K7s+','KTo+','Q8s+','QTo+','J8s+','JTo','T8s+','98s','87s','76s','65s'],
    'BASE 7F-6 CORREGIDA · SB vs CO limper · 1 limper. SB queda OOP si CO paga. CO es más tardío que UTG, pero el rango sigue siendo selectivo por la posición. Base EXPERIMENTAL: ~33,7% de la matriz. Sizing OOP: 5.5 BB con 1 limper; +1 BB por limper adicional.' );
}
function winamax5IsoSbBtnSeed(){
  return winamax5IsoSeed('w5_iso_sb_btn','SB vs BTN limper','SB','BTN','5.5 BB',
    ['22+','A2s+','A5o+','K5s+','K9o+','Q6s+','Q9o+','J7s+','J9o+','T7s+','T9o','98s','87s','76s','65s'],
    'BASE 7F-7 CORREGIDA · SB vs BTN limper · 1 limper. SB queda OOP si BTN paga. BTN puede limpear muy amplio, pero SB mantiene un rango controlado por la desventaja postflop y el riesgo de BB. Base EXPERIMENTAL: ~40,8% de la matriz. Sizing OOP: 5.5 BB con 1 limper; +1 BB por limper adicional.' );
}
function winamax5IsoBbCoSeed(){
  return winamax5IsoSeed('w5_iso_bb_co','BB vs CO limper','BB','CO','5.5 BB',
    ['22+','A2s+','A6o+','K6s+','KTo+','Q7s+','QTo+','J7s+','JTo','T7s+','T9o','98s','87s','76s','65s'],
    'BASE 7F-8 CORREGIDA · BB vs CO limper · 1 limper. BB queda OOP si CO paga. Rango más selectivo que el ISO IP. Base EXPERIMENTAL: ~37,3% de la matriz. Sizing OOP: 5.5 BB con 1 limper; +1 BB por limper adicional.' );
}
function winamax5IsoBbBtnSeed(){
  return winamax5IsoSeed('w5_iso_bb_btn','BB vs BTN limper','BB','BTN','5.5 BB',
    ['22+','A2s+','A4o+','K4s+','K8o+','Q5s+','Q8o+','J6s+','J8o+','T6s+','T8o+','97s+','98o','87s','76s','65s','54s'],
    'BASE 7F-9 CORREGIDA · BB vs BTN limper · 1 limper. BB queda OOP si BTN paga. BTN puede limpear muy amplio, pero el rango se mantiene más fuerte por la desventaja postflop. Base EXPERIMENTAL: ~47,9% de la matriz. Sizing OOP: 5.5 BB con 1 limper; +1 BB por limper adicional.' );
}
function winamax5IsoBbSbSeed(){
  return winamax5IsoSeed('w5_iso_bb_sb','BB vs SB limper','BB','SB','4 BB',
    ['22+','A2s+','A2o+','K2s+','K6o+','Q3s+','Q7o+','J4s+','J7o+','T4s+','T7o+','95s+','96o+','85s+','86o+','74s+','75o+','64s+','65o+','54s','53s'],
    'BASE 7F-10 · BB vs SB limper · 1 limper. Spot blind vs blind: SB limpea y BB responde IP postflop. Base EXPERIMENTAL: aproximadamente 62% de la matriz. Sizing base 4 BB; ampliar según limp/fold y tendencia de SB a pagar.' );
}

function winamax5Templates(){
  const templates=[];
  const add=(id,name,subtitle,meta={})=>templates.push(table(`w5_${id}`,name,'WINAMAX 5-MAX',subtitle,blankCells(),'Plantilla 5-MAX Winamax. PENDIENTE: introducir y validar rango específico antes de usar.',{status:'PENDIENTE',format:'5-MAX',room:'Winamax',subcategory:meta.subcategory||'OTRO',...meta}));
  // 5-max cash positions: UTG, CO, BTN, SB, BB.
  winamax5RfiSeed().forEach(t=>templates.push(t));
  [['bb_utg','BB vs UTG','Defensa BB vs UTG'],['bb_co','BB vs CO','Defensa BB vs CO'],['bb_btn','BB vs BTN','Defensa BB vs BTN'],['bb_sb','BB vs SB','Blind vs Blind · BB vs SB']].forEach(([id,n,sub])=>add(id,n,sub,{position:'BB',opponent:n.replace('BB vs ',''),subcategory:'BB DEFENSE'}));
  [['3b_utg','vs UTG','3BET / CC vs UTG'],['3b_co','vs CO','3BET / CC vs CO'],['3b_btn','vs BTN','3BET / CC vs BTN'],['3b_sb','vs SB','3BET / CC vs SB'],['3b_bb_utg','BB vs UTG','3BET / CC · BB vs UTG'],['3b_sb_co','SB vs CO','3BET / CC · SB vs CO'],['3b_sb_btn','SB vs BTN','3BET / CC · SB vs BTN'],['3b_bb_co','BB vs CO','3BET / CC · BB vs CO'],['3b_bb_btn','BB vs BTN','3BET / CC · BB vs BTN'],['3b_bb_sb','BB vs SB','3BET / CC · BB vs SB']].forEach(([id,n,sub])=>add(id,n,sub,{opponent:n.replace('vs ',''),subcategory:'3BET / CC'}));
  [['vs3_utg','vs UTG','Respuesta a 3BET después de abrir UTG'],['vs3_co','vs CO','Respuesta a 3BET después de abrir CO'],['vs3_btn','vs BTN','Respuesta a 3BET después de abrir BTN'],['vs3_sb','vs SB','Respuesta a 3BET después de abrir SB']].forEach(([id,n,sub])=>add(id,n,sub,{opponent:n.replace('vs ',''),subcategory:'VS 3BET'}));
  [['4b_utg','vs UTG','4BET / CALL / FOLD vs UTG'],['4b_co','vs CO','4BET / CALL / FOLD vs CO'],['4b_btn','vs BTN','4BET / CALL / FOLD vs BTN'],['4b_sb','vs SB','4BET / CALL / FOLD vs SB']].forEach(([id,n,sub])=>add(id,n,sub,{opponent:n.replace('vs ',''),subcategory:'4BET'}));
  [winamax5IsoCoSeed(),winamax5IsoBtnSeed(),winamax5IsoSbSeed(),winamax5IsoBbSeed(),winamax5IsoBtnCoSeed(),winamax5IsoSbCoSeed(),winamax5IsoSbBtnSeed(),winamax5IsoBbCoSeed(),winamax5IsoBbBtnSeed(),winamax5IsoBbSbSeed()].forEach(t=>templates.push(t));
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
  s.winamaxTraining={...(s.winamaxTraining||{}),score:Number(s.winamaxTraining?.score||0),attempts:Number(s.winamaxTraining?.attempts||0),streak:Number(s.winamaxTraining?.streak||0),bestStreak:Number(s.winamaxTraining?.bestStreak||0)};
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
  // Correction audit 7B-1: UTG RFI is 2.5 BB, so BB vs UTG metadata must match 2.5 BB.
  {
    const t=state.tables.find(x=>x.id==='w5_bb_utg');
    if(t){
      if(t.openSize!=='vs 2.5 BB'){t.openSize='vs 2.5 BB';t.subtitle='Defensa BB vs UTG · 14.0% total · open 2.5 BB';changed=true;}
      if(t.notes && t.notes.includes('open de 3 BB')){t.notes=t.notes.replaceAll('open de 3 BB','open de 2.5 BB').replaceAll('Open de referencia: 3 BB','Open de referencia: 2.5 BB');changed=true;}
    }
  }
  const bbCoSeed=winamax5BbCoDefenseSeed();
  const bbCoTable=state.tables.find(x=>x.id===bbCoSeed.id);
  if(bbCoTable){
    const hasDefense=Object.values(bbCoTable.cells||{}).some(v=>v==='call'||v==='bet3');
    const isPending=String(bbCoTable.status||'').toUpperCase()==='PENDIENTE' || !hasDefense;
    if(isPending || bbCoTable.phase!=='7B'){
      bbCoTable.cells=clone(bbCoSeed.cells); bbCoTable.status=bbCoSeed.status; bbCoTable.phase=bbCoSeed.phase; bbCoTable.format=bbCoSeed.format; bbCoTable.room=bbCoSeed.room; bbCoTable.position=bbCoSeed.position; bbCoTable.opponent=bbCoSeed.opponent; bbCoTable.openSize=bbCoSeed.openSize; bbCoTable.name=bbCoSeed.name; bbCoTable.subtitle=bbCoSeed.subtitle; bbCoTable.notes=bbCoSeed.notes; bbCoTable.subcategory='BB DEFENSE'; bbCoTable.version=Math.max(1,Number(bbCoTable.version)||1); bbCoTable.updated=new Date().toISOString(); changed=true;
    }
  }
  const bbBtnSeed=winamax5BbBtnDefenseSeed();
  const bbBtnTable=state.tables.find(x=>x.id===bbBtnSeed.id);
  if(bbBtnTable){
    const hasDefense=Object.values(bbBtnTable.cells||{}).some(v=>v==='call'||v==='bet3');
    const isPending=String(bbBtnTable.status||'').toUpperCase()==='PENDIENTE' || !hasDefense;
    if(isPending || bbBtnTable.phase!=='7B'){
      bbBtnTable.cells=clone(bbBtnSeed.cells); bbBtnTable.status=bbBtnSeed.status; bbBtnTable.phase=bbBtnSeed.phase; bbBtnTable.format=bbBtnSeed.format; bbBtnTable.room=bbBtnSeed.room; bbBtnTable.position=bbBtnSeed.position; bbBtnTable.opponent=bbBtnSeed.opponent; bbBtnTable.openSize=bbBtnSeed.openSize; bbBtnTable.name=bbBtnSeed.name; bbBtnTable.subtitle=bbBtnSeed.subtitle; bbBtnTable.notes=bbBtnSeed.notes; bbBtnTable.subcategory='BB DEFENSE'; bbBtnTable.version=Math.max(1,Number(bbBtnTable.version)||1); bbBtnTable.updated=new Date().toISOString(); changed=true;
    }
  }
  const c3CoSeed=winamax5ThreeBetCcCoSeed();
  const c3CoTable=state.tables.find(x=>x.id===c3CoSeed.id);
  if(c3CoTable){
    const hasResponse=Object.values(c3CoTable.cells||{}).some(v=>v==='call'||v==='bet3');
    const isPending=String(c3CoTable.status||'').toUpperCase()==='PENDIENTE' || !hasResponse;
    if(isPending || c3CoTable.phase!=='7C'){
      c3CoTable.cells=clone(c3CoSeed.cells); c3CoTable.status=c3CoSeed.status; c3CoTable.phase=c3CoSeed.phase; c3CoTable.format=c3CoSeed.format; c3CoTable.room=c3CoSeed.room; c3CoTable.position=c3CoSeed.position; c3CoTable.opponent=c3CoSeed.opponent; c3CoTable.openSize=c3CoSeed.openSize; c3CoTable.name=c3CoSeed.name; c3CoTable.subtitle=c3CoSeed.subtitle; c3CoTable.notes=c3CoSeed.notes; c3CoTable.subcategory='3BET / CC'; c3CoTable.version=Math.max(1,Number(c3CoTable.version)||1); c3CoTable.updated=new Date().toISOString(); changed=true;
    }
  }
  const c3BtnSeed=winamax5ThreeBetCcBtnSeed();
  const c3BtnTable=state.tables.find(x=>x.id===c3BtnSeed.id);
  if(c3BtnTable){
    const hasResponse=Object.values(c3BtnTable.cells||{}).some(v=>v==='call'||v==='bet3');
    const isPending=String(c3BtnTable.status||'').toUpperCase()==='PENDIENTE' || !hasResponse;
    if(isPending || c3BtnTable.phase!=='7C'){
      c3BtnTable.cells=clone(c3BtnSeed.cells); c3BtnTable.status=c3BtnSeed.status; c3BtnTable.phase=c3BtnSeed.phase; c3BtnTable.format=c3BtnSeed.format; c3BtnTable.room=c3BtnSeed.room; c3BtnTable.position=c3BtnSeed.position; c3BtnTable.opponent=c3BtnSeed.opponent; c3BtnTable.openSize=c3BtnSeed.openSize; c3BtnTable.name=c3BtnSeed.name; c3BtnTable.subtitle=c3BtnSeed.subtitle; c3BtnTable.notes=c3BtnSeed.notes; c3BtnTable.subcategory='3BET / CC'; c3BtnTable.version=Math.max(1,Number(c3BtnTable.version)||1); c3BtnTable.updated=new Date().toISOString(); changed=true;
    }
  }
  const c3Seed=winamax5ThreeBetCcUtgSeed();
  const c3Table=state.tables.find(x=>x.id===c3Seed.id);
  if(c3Table){
    const hasResponse=Object.values(c3Table.cells||{}).some(v=>v==='call'||v==='bet3');
    const isPending=String(c3Table.status||'').toUpperCase()==='PENDIENTE' || !hasResponse;
    if(isPending || c3Table.phase!=='7C'){
      c3Table.cells=clone(c3Seed.cells); c3Table.status=c3Seed.status; c3Table.phase=c3Seed.phase; c3Table.format=c3Seed.format; c3Table.room=c3Seed.room; c3Table.position=c3Seed.position; c3Table.opponent=c3Seed.opponent; c3Table.openSize=c3Seed.openSize; c3Table.name=c3Seed.name; c3Table.subtitle=c3Seed.subtitle; c3Table.notes=c3Seed.notes; c3Table.subcategory='3BET / CC'; c3Table.version=Math.max(1,Number(c3Table.version)||1); c3Table.updated=new Date().toISOString(); changed=true;
    }
  }
  const c3SbSeed=winamax5ThreeBetCcSbSeed();
  const c3SbTable=state.tables.find(x=>x.id===c3SbSeed.id);
  if(c3SbTable){
    const hasResponse=Object.values(c3SbTable.cells||{}).some(v=>v==='call'||v==='bet3');
    const isPending=String(c3SbTable.status||'').toUpperCase()==='PENDIENTE' || !hasResponse;
    if(isPending || c3SbTable.phase!=='7C'){
      c3SbTable.cells=clone(c3SbSeed.cells); c3SbTable.status=c3SbSeed.status; c3SbTable.phase=c3SbSeed.phase; c3SbTable.format=c3SbSeed.format; c3SbTable.room=c3SbSeed.room; c3SbTable.position=c3SbSeed.position; c3SbTable.opponent=c3SbSeed.opponent; c3SbTable.openSize=c3SbSeed.openSize; c3SbTable.name=c3SbSeed.name; c3SbTable.subtitle=c3SbSeed.subtitle; c3SbTable.notes=c3SbSeed.notes; c3SbTable.subcategory='3BET / CC'; c3SbTable.version=Math.max(1,Number(c3SbTable.version)||1); c3SbTable.updated=new Date().toISOString(); changed=true;
    }
  }
  const c3BbUtgSeed=winamax5ThreeBetCcBbUtgSeed();
  const c3BbUtgTable=state.tables.find(x=>x.id===c3BbUtgSeed.id);
  if(c3BbUtgTable){
    const hasResponse=Object.values(c3BbUtgTable.cells||{}).some(v=>v==='call'||v==='bet3');
    const isPending=String(c3BbUtgTable.status||'').toUpperCase()==='PENDIENTE' || !hasResponse;
    if(isPending || c3BbUtgTable.phase!=='7C'){
      c3BbUtgTable.cells=clone(c3BbUtgSeed.cells); c3BbUtgTable.status=c3BbUtgSeed.status; c3BbUtgTable.phase=c3BbUtgSeed.phase; c3BbUtgTable.format=c3BbUtgSeed.format; c3BbUtgTable.room=c3BbUtgSeed.room; c3BbUtgTable.position=c3BbUtgSeed.position; c3BbUtgTable.opponent=c3BbUtgSeed.opponent; c3BbUtgTable.openSize=c3BbUtgSeed.openSize; c3BbUtgTable.name=c3BbUtgSeed.name; c3BbUtgTable.subtitle=c3BbUtgSeed.subtitle; c3BbUtgTable.notes=c3BbUtgSeed.notes; c3BbUtgTable.subcategory='3BET / CC'; c3BbUtgTable.version=Math.max(1,Number(c3BbUtgTable.version)||1); c3BbUtgTable.updated=new Date().toISOString(); changed=true;
    }
  }
  const extraSeeds=[winamax5ThreeBetCcSbCoSeed(),winamax5ThreeBetCcSbBtnSeed(),winamax5ThreeBetCcBbCoSeed(),winamax5ThreeBetCcBbBtnSeed(),winamax5ThreeBetCcBbSbSeed()];
  for(const seed of extraSeeds){
    let t=state.tables.find(x=>x.id===seed.id);
    if(!t){ t=clone(seed); state.tables.push(t); changed=true; continue; }
    const hasResponse=Object.values(t.cells||{}).some(v=>v==='call'||v==='bet3');
    const isPending=String(t.status||'').toUpperCase()==='PENDIENTE' || !hasResponse;
    if(isPending || t.phase!=='7C'){
      t.cells=clone(seed.cells); t.status=seed.status; t.phase=seed.phase; t.format=seed.format; t.room=seed.room; t.position=seed.position; t.opponent=seed.opponent; t.openSize=seed.openSize; t.name=seed.name; t.subtitle=seed.subtitle; t.notes=seed.notes; t.subcategory='3BET / CC'; t.version=Math.max(1,Number(t.version)||1); t.updated=new Date().toISOString(); changed=true;
    }
  }
  const vs3Seeds=[winamax5Vs3UtgSeed(),winamax5Vs3CoSeed(),winamax5Vs3BtnSeed(),winamax5Vs3SbSeed()];
  for(const seed of vs3Seeds){
    let t=state.tables.find(x=>x.id===seed.id);
    if(!t){t=clone(seed);state.tables.push(t);changed=true;continue;}
    const hasResponse=Object.values(t.cells||{}).some(v=>v==='call'||v==='bet4'||v==='bluff');
    const isPending=String(t.status||'').toUpperCase()==='PENDIENTE' || !hasResponse;
    if(isPending || t.phase!=='7D'){
      t.cells=clone(seed.cells); t.status=seed.status; t.phase=seed.phase; t.format=seed.format; t.room=seed.room; t.position=seed.position; t.opponent=seed.opponent; t.openSize=seed.openSize; t.name=seed.name; t.subtitle=seed.subtitle; t.notes=seed.notes; t.subcategory='VS 3BET'; t.version=Math.max(1,Number(t.version)||1); t.updated=new Date().toISOString(); changed=true;
    }
  }
  {
    const t=state.tables.find(x=>x.id==='w5_3b_bb_utg');
    if(t && t.openSize!=='vs 2.5 BB'){t.openSize='vs 2.5 BB';t.subtitle='3BET / CC · BB vs UTG · open UTG 2.5 BB';t.notes=String(t.notes||'').replaceAll('open de 3 BB','open de 2.5 BB');changed=true;}
  }
  const fourBetSeeds=[winamax5FourBetUtgSeed(),winamax5FourBetCoSeed(),winamax5FourBetBtnSeed(),winamax5FourBetSbSeed()];
  for(const seed of fourBetSeeds){
    let t=state.tables.find(x=>x.id===seed.id);
    if(!t){t=clone(seed);state.tables.push(t);changed=true;continue;}
    const has4Bet=Object.values(t.cells||{}).some(v=>v==='bet4'||v==='bluff');
    const isPending=String(t.status||'').toUpperCase()==='PENDIENTE' || !has4Bet;
    if(isPending || t.phase!=='7E'){
      t.cells=clone(seed.cells); t.status=seed.status; t.phase=seed.phase; t.format=seed.format; t.room=seed.room; t.position=seed.position; t.opponent=seed.opponent; t.openSize=seed.openSize; t.name=seed.name; t.subtitle=seed.subtitle; t.notes=seed.notes; t.subcategory='4BET'; t.version=Math.max(1,Number(t.version)||1); t.updated=new Date().toISOString(); changed=true;
    }
  }
  const isoSeeds=[winamax5IsoCoSeed(),winamax5IsoBtnSeed(),winamax5IsoSbSeed(),winamax5IsoBbSeed(),winamax5IsoBtnCoSeed(),winamax5IsoSbCoSeed(),winamax5IsoSbBtnSeed(),winamax5IsoBbCoSeed(),winamax5IsoBbBtnSeed(),winamax5IsoBbSbSeed()];
  for(const seed of isoSeeds){
    let t=state.tables.find(x=>x.id===seed.id);
    if(!t){t=clone(seed);state.tables.push(t);changed=true;continue;}
    const hasOpen=Object.values(t.cells||{}).some(v=>v==='open');
    const isPending=String(t.status||'').toUpperCase()==='PENDIENTE' || !hasOpen;
    if(isPending || t.phase!=='7F' || t.openSize!==seed.openSize || t.notes!==seed.notes){
      t.cells=clone(seed.cells); t.status=seed.status; t.phase=seed.phase; t.format=seed.format; t.room=seed.room; t.position=seed.position; t.opponent=seed.opponent; t.openSize=seed.openSize; t.name=seed.name; t.subtitle=seed.subtitle; t.notes=seed.notes; t.subcategory='ISO RAISE'; t.version=Math.max(1,Number(t.version)||1); t.updated=new Date().toISOString(); changed=true;
    }
  }
  // 7D/7E documentation correction: these are base responses versus an unspecified 3BET; adjust by 3BETor position/frequency.
  for(const id of ['w5_vs3_utg','w5_vs3_co','w5_vs3_btn','w5_vs3_sb','w5_4b_utg','w5_4b_co','w5_4b_btn','w5_4b_sb']){
    const t=state.tables.find(x=>x.id===id);
    if(t && t.notes && !t.notes.includes('rango base')){ t.notes += ' Rango base frente a una 3BET no especificada; ajustar según posición/frecuencia del 3BETor. No es una tabla GTO oficial de Winamax.'; t.updated=new Date().toISOString(); changed=true; }
  }
  const subById={
    w5_rfi_utg:'RFI',w5_rfi_co:'RFI',w5_rfi_btn:'RFI',w5_rfi_sb:'RFI',
    w5_bb_utg:'BB DEFENSE',w5_bb_co:'BB DEFENSE',w5_bb_btn:'BB DEFENSE',w5_bb_sb:'BB DEFENSE',
    w5_3b_utg:'3BET / CC',w5_3b_co:'3BET / CC',w5_3b_btn:'3BET / CC',w5_3b_sb:'3BET / CC',w5_3b_bb_utg:'3BET / CC',w5_3b_sb_co:'3BET / CC',w5_3b_sb_btn:'3BET / CC',w5_3b_bb_co:'3BET / CC',w5_3b_bb_btn:'3BET / CC',w5_3b_bb_sb:'3BET / CC',
    w5_vs3_utg:'VS 3BET',w5_vs3_co:'VS 3BET',w5_vs3_btn:'VS 3BET',w5_vs3_sb:'VS 3BET',
    w5_4b_utg:'4BET',w5_4b_co:'4BET',w5_4b_btn:'4BET',w5_4b_sb:'4BET',
    w5_iso_utg:'ISO RAISE',w5_iso_co:'ISO RAISE',w5_iso_btn:'ISO RAISE',w5_iso_sb:'ISO RAISE',w5_iso_btn_co:'ISO RAISE',w5_iso_sb_co:'ISO RAISE',w5_iso_sb_btn:'ISO RAISE',w5_iso_bb_co:'ISO RAISE',w5_iso_bb_btn:'ISO RAISE',w5_iso_bb_sb:'ISO RAISE'
  };
  for(const t of state.tables.filter(x=>x.category==='WINAMAX 5-MAX')){
    const sub=subById[t.id];
    if(sub && t.subcategory!==sub){t.subcategory=sub;changed=true;}
  }
  if(!state.categories.includes('WINAMAX 5-MAX')){state.categories.push('WINAMAX 5-MAX');changed=true;}
  const bbSbSeed=winamax5BbSbDefenseSeed();
  const bbSbTable=state.tables.find(x=>x.id===bbSbSeed.id);
  if(bbSbTable){
    const hasDefense=Object.values(bbSbTable.cells||{}).some(v=>v==='call'||v==='bet3');
    const isPending=String(bbSbTable.status||'').toUpperCase()==='PENDIENTE' || !hasDefense;
    if(isPending || bbSbTable.phase!=='7B'){
      bbSbTable.cells=clone(bbSbSeed.cells); bbSbTable.status=bbSbSeed.status; bbSbTable.phase=bbSbSeed.phase; bbSbTable.format=bbSbSeed.format; bbSbTable.room=bbSbSeed.room; bbSbTable.position=bbSbSeed.position; bbSbTable.opponent=bbSbSeed.opponent; bbSbTable.openSize=bbSbSeed.openSize; bbSbTable.name=bbSbSeed.name; bbSbTable.subtitle=bbSbSeed.subtitle; bbSbTable.notes=bbSbSeed.notes; bbSbTable.subcategory='BB DEFENSE'; bbSbTable.version=Math.max(1,Number(bbSbTable.version)||1); bbSbTable.updated=new Date().toISOString(); changed=true;
    }
  }
  return changed;
}
function render(){renderNav();renderDashboard();renderRanges();renderGuide();renderTraining();renderLeaks();renderPostflop();renderWinamax5()}
function renderNav(){$$('.nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===activeView));$$('.view').forEach(v=>v.classList.toggle('active',v.id===`view-${activeView}`));$('#pageTitle').textContent={dashboard:'Dashboard',ranges:'Rangos',guide:'Guía de póker',training:'Entrenamiento',leaks:'Manos / Leaks',postflop:'Postflop Lab',winamax5:'Winamax 5-MAX',data:'Datos y backups'}[activeView]||'LabPok v1'}
function renderDashboard(){const counts={};state.tables.forEach(t=>counts[t.category]=(counts[t.category]||0)+1);$('#statTables').textContent=state.tables.length;$('#statCategories').textContent=Object.keys(counts).length;$('#statVersions').textContent=state.tables.reduce((n,t)=>n+(t.history?.length||0)+1,0);$('#statStatus').textContent=dirty?'●':'✓';$('#categoryModules').innerHTML=state.categories.map(cat=>`<div class="module"><div class="icon">${iconFor(cat)}</div><h3>${escapeHtml(cat)}</h3><p>${counts[cat]||0} tabla(s) configurada(s).</p><span class="pill">${cat==='OR'?'Rangos base':cat==='ISO RAISE'||cat==='3BET / CC'||cat==='VS 3BET'||cat==='4BET'||cat==='BLIND vs BLIND'?'Fase 2':'Módulo activo'} →</span></div>`).join('')}
function iconFor(cat){return ({'OR':'↗','ISO RAISE':'⚔','3BET / CC':'3B','VS 3BET':'↔','4BET':'4B','BB DEFENSE':'♠','BLIND vs BLIND':'♣'}[cat]||'◆')}
let activeRangeCategory='OR';
window.rangeW5OpenGroups=window.rangeW5OpenGroups||{};
function renderRanges(){
  const groups={}; state.tables.forEach(t=>(groups[t.category]??=[]).push(t));
  const cats=state.categories.filter(c=>groups[c]?.length).concat(Object.keys(groups).filter(c=>!state.categories.includes(c)));
  if(!cats.length){$('#rangeList').innerHTML='<div class="empty">No hay tablas.</div>';return}
  if(!cats.includes(activeRangeCategory)) activeRangeCategory=cats[0];
  const tables=groups[activeRangeCategory]||[];
  let listHtml='';
  if(activeRangeCategory==='WINAMAX 5-MAX'){
    const subGroups={}; tables.forEach(t=>{const k=t.subcategory||'OTRO';(subGroups[k]||(subGroups[k]=[])).push(t)});
    const order=['RFI','BB DEFENSE','3BET / CC','VS 3BET','4BET','ISO RAISE'];
    // Keep the subgroup containing the selected table open; the user can open/close any group independently.
    const selectedSub=tables.find(t=>t.id===selectedTableId)?.subcategory;
    if(selectedSub && window.rangeW5OpenGroups[selectedSub]===undefined) window.rangeW5OpenGroups[selectedSub]=true;
    listHtml=order.filter(k=>subGroups[k]?.length).map(k=>{
      const isOpen=!!window.rangeW5OpenGroups[k];
      const items=subGroups[k].map(t=>`<button class="list-item ${t.id===selectedTableId?'active':''}" data-table="${t.id}"><span>${escapeHtml(t.name)}</span><small>${escapeHtml(t.status||'')}</small></button>`).join('');
      return `<div class="range-subgroup ${isOpen?'open':''}" data-range-subgroup="${escapeAttr(k)}"><button type="button" class="range-subgroup-toggle" data-range-subtoggle="${escapeAttr(k)}" aria-expanded="${isOpen}"><span class="range-subgroup-title-main"><strong>${escapeHtml(k)}</strong><span>${subGroups[k].length} tablas</span></span><span class="range-subgroup-chevron">⌄</span></button><div class="range-subgroup-body">${items}</div></div>`;
    }).join('');
  } else {
    listHtml=`<div class="range-table-list">${tables.map(t=>`<button class="list-item ${t.id===selectedTableId?'active':''}" data-table="${t.id}"><span>${escapeHtml(t.name)}</span><small>${escapeHtml(t.status||'')}</small></button>`).join('')}</div>`;
  }
  $('#rangeList').innerHTML=`<div class="range-cats">${cats.map(cat=>`<button class="range-cat-tab ${cat===activeRangeCategory?'active':''}" data-cat="${escapeAttr(cat)}"><span>${escapeHtml(cat)}</span><small>${groups[cat].length}</small></button>`).join('')}</div>${activeRangeCategory==='WINAMAX 5-MAX'?`<div class="range-w5-head"><strong>WINAMAX 5-MAX</strong><span>Rangos agrupados y desplegables por categoría</span></div>`:''}${listHtml}`;
  $$('.range-cat-tab').forEach(b=>b.onclick=()=>{
    activeRangeCategory=b.dataset.cat;
    const first=(groups[activeRangeCategory]||[])[0];
    if(first){selectedTableId=first.id;if(activeRangeCategory==='WINAMAX 5-MAX'&&first.subcategory)window.rangeW5OpenGroups[first.subcategory]=true;}
    selectedAction='open';renderRanges()
  });
  $$('[data-range-subtoggle]').forEach(b=>b.onclick=()=>{
    const k=b.dataset.rangeSubtoggle;
    window.rangeW5OpenGroups[k]=!window.rangeW5OpenGroups[k];
    renderRanges();
  });
  $$('.list-item').forEach(b=>b.onclick=()=>{
    selectedTableId=b.dataset.table;
    selectedAction='open';
    const t=state.tables.find(x=>x.id===selectedTableId);
    if(activeRangeCategory==='WINAMAX 5-MAX'&&t?.subcategory)window.rangeW5OpenGroups[t.subcategory]=true;
    renderRanges()
  });
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
  const sections=[
    ['01','CÓMO LEER EL SISTEMA','La matriz 13×13 representa las 169 combinaciones de dos cartas. La diagonal son parejas; por encima se encuentran las manos suited y por debajo las offsuit. Una entrada como A5s significa las cuatro combinaciones suited; A5o, las doce offsuit.','En LabPok, OPEN, 3BET, CALL, 4BET VALUE, 4BET BLUFF, MIX y FOLD son acciones de estudio. No memorices una casilla aislada: aprende el patrón del rango y la lógica de la posición.'],
    ['02','WINAMAX 5-MAX: MAPA DE POSICIONES','El módulo 5-MAX se estudia como un sistema independiente: UTG → CO → BTN → SB → BB. No se deben trasladar mecánicamente las tablas 6-MAX.','UTG es la primera posición y recibe más presión de las posiciones posteriores. CO y BTN concentran gran parte del robo. SB abre más ancho, pero juega OOP cuando recibe call. BB tiene la defensa más amplia porque ya tiene dinero invertido y actúa último postflop.'],
    ['03','RFI — OPENING','Las cuatro tablas RFI actuales son UTG, CO, BTN y SB. Son EXPERIMENTALES: sirven como base de trabajo y deben validarse con tus manos reales.','Base actual: UTG 20.1% a 2.5 BB; CO 24.9% a 2.5 BB; BTN 46.9% a 2.5 BB; SB 50.8% a 3 BB. La amplitud debe aumentar al avanzar hacia BTN/SB, pero siempre teniendo en cuenta la capacidad postflop.'],
    ['04','SIZING PREFLOP','El sizing no es decorativo: modifica el precio que das a las defensas y el tamaño del bote.','RFI base: 2.5 BB desde UTG/CO/BTN y 3 BB desde SB. Si la mesa o el perfil justifican una desviación, registra el motivo en Manos/Leaks en lugar de cambiar la tabla sin control.'],
    ['05','BB DEFENSE','La defensa de BB depende del open, posición del agresor, sizing y perfil. No existe una única defensa universal.','Base actual frente a 3 BB: vs UTG 14.03% (58 3BET / 128 CALL); vs CO 31.82% (106 / 316); vs BTN 39.06% (154 / 364); vs SB 55.35% (180 / 554). Todas son EXPERIMENTALES.'],
    ['06','3BET / COLD CALL','El 3BET tiene una función: por valor, por fold equity y por construcción del rango. El cold call debe conservar manos que realicen bien su equity y evitar llenar el rango de manos dominadas.','El módulo 7C contiene 10 spots. En posiciones tempranas se mantiene una construcción más fuerte; contra CO/BTN y en blind-vs-blind aparecen más oportunidades de 3BET. Ajusta por frecuencia y perfil, no por una cifra aislada.'],
    ['07','VS 3BET','Después de abrir, la decisión frente a un 3BET se divide en 4BET VALUE, 4BET BLUFF, CALL o FOLD.','Las tablas 7D son respuestas BASE frente a un 3BET no especificado. UTG 112 combos de continuación; CO 118; BTN 156; SB 112. La frecuencia real del rival puede mover bastante la respuesta.'],
    ['08','4BET','El módulo 7E contiene únicamente el subconjunto de 4BET de las respuestas VS 3BET. No sustituye la tabla completa VS 3BET.','Base: UTG 50 combos (34 value / 16 bluff); CO 50 (34 / 16); BTN 64 (40 / 24); SB 58 (34 / 24). Son referencias EXPERIMENTALES, no una tabla oficial de Winamax.'],
    ['09','ISO RAISE','Contra limpers, el objetivo es aislar al jugador débil y jugar un bote heads-up siempre que sea posible. El sizing aumenta OOP porque concedemos peores condiciones postflop.','Base actual: IP 4.5 BB + 1 BB por limper adicional; OOP 5.5 BB + 1 BB por limper adicional; BB vs SB 4 BB. Las 10 tablas 7F son EXPERIMENTALES y de orientación explotativa frente a limpers.'],
    ['10','PENSAMIENTO PREFLOP','Antes de pulsar una acción, responde: ¿quién abrió?, ¿desde dónde?, ¿qué sizing?, ¿cuántos jugadores quedan?, ¿qué perfiles hay detrás?, ¿qué acción representa mi combo?','La tabla te da el punto de partida. El contexto decide las desviaciones. Si haces una desviación repetible, conviértela en una nota o crea una versión experimental de la tabla.'],
    ['11','POSTFLOP: ORDEN DE LECTURA','Primero rango contra rango; después textura; después posición; después SPR; finalmente sizing y acción. No empieces por “tengo top pair”.','Preguntas rápidas: ¿quién tiene ventaja de rango?, ¿quién tiene nuts advantage?, ¿qué proyectos existen?, ¿qué cartas cambian la equity?, ¿qué manos peores pagan?, ¿qué manos mejores foldean?'],
    ['12','C-BET Y TEXTURAS','La c-bet debe salir de la interacción entre rangos y board. No es una obligación automática por haber sido agresor preflop.','Referencias de estudio actuales: K72r 25–33%; J96 two-tone 50–66%; 987 two-tone 75%+; 772 25–33%; monotone 33–50%. Son sizings de trabajo, no reglas rígidas.'],
    ['13','TURN','El turn cambia la distribución de equity. Las mejores cartas para seguir presionando no son necesariamente las mejores cartas para apostar grande.','Clasifica la carta: favorable para Hero, favorable para Villano, neutral o dinámica. Recalcula qué manos de cada rango continúan. Con aire, pregunta si la carta mejora realmente tu historia o solo tu percepción.'],
    ['14','RIVER','En river ya no existe “protección”: la decisión es principalmente value, bluff, bluff-catch o check.','Antes de apostar, identifica las manos peores que pagan. Antes de bluffear, identifica las manos mejores que pueden foldear. Antes de pagar, compara el rango de valor y bluffs que razonablemente llega a river.'],
    ['15','IP VS OOP','IP permite realizar equity y controlar mejor el tamaño del bote. OOP exige más disciplina con los check/call y check/raise.','No copies una línea IP en OOP. El mismo combo puede cambiar de acción porque cambia la capacidad de realizar equity y la presión de las calles posteriores.'],
    ['16','SRP VS 3BET POT','El tamaño relativo del bote modifica los SPR y la presión de cada apuesta. En un pot 3BET, una secuencia pequeña puede comprometer una parte relevante del stack.','En pots 3BET evita convertir automáticamente una mano marginal en tres barrels. En NL2, los perfiles y las tendencias observadas deben pesar en las decisiones de alto impacto.'],
    ['17','MULTIWAY','En botes multiway disminuye el valor de los bluffs y aumenta el requisito de equity para apostar/callar.','La presencia de un tercer jugador modifica las rangos efectivos y reduce la fold equity de una apuesta. Evita aplicar directamente una estrategia heads-up.'],
    ['18','BLIND VS BLIND','SB vs BB es un entorno diferente: rangos amplios, más boards conectados y mucha interacción postflop.','La tabla BB vs SB actual es 55.35% de defensa frente a 3 BB. La tabla SB RFI abre 50.8% a 3 BB. Ambas son EXPERIMENTALES y deben estudiarse conjuntamente.'],
    ['19','PERFILES DE RIVAL','Usa las tendencias observadas para ajustar frecuencias, no para etiquetar a un rival por unas pocas manos.','Registra ejemplos concretos: fold excesivo, call demasiado amplio, 3BET elevado, overfold river, etc. Cuanto más fiable sea la muestra, más fuerte puede ser el ajuste.'],
    ['20','NL2: DISCIPLINA','La prioridad es ejecutar bien las decisiones repetibles. No persigas resultados de una sesión ni cambies rangos por una mano perdida.','Si una mano genera duda, guárdala en Manos/Leaks. Después revisa rango, acción, sizing, board y resultado por separado. El resultado no valida ni invalida una decisión por sí solo.'],
    ['21','CÓMO ESTUDIAR CON LABPOK','El entrenamiento debe pasar de reconocimiento → explicación → ejecución → revisión.','1) Estudia una categoría. 2) Haz entrenamiento aleatorio. 3) Explica por qué cada combo está ahí. 4) Marca errores. 5) Revisa manos reales. 6) Solo después cambia una tabla.'],
    ['22','EXPERIMENTAL → VALIDADO','VALIDADO debe significar que la tabla ha pasado por revisión y tiene una razón documentada para formar parte del sistema.','No cambies una tabla porque un spot aislado salió mal. Para validar, busca coherencia interna, revisión de spots, resultados agregados y, cuando sea posible, contraste con fuentes de estudio.'],
    ['23','PROTOCOLO DE SESIÓN','La tabla debe ser una herramienta de estudio previa, no una excusa para pensar menos durante la mano.','Antes de jugar: repasa RFI, BB Defense y VS 3BET. Durante la sesión: ejecuta. Después: marca manos dudosas. En revisión: reconstruye rangos y actualiza notas. En CoinPoker, respeta especialmente las restricciones de herramientas durante el cliente.'],
    ['24','OBJETIVO DEL SISTEMA','LabPok no pretende adivinar cada mano. Pretende darte un marco consistente para tomar decisiones y detectar desviaciones.','La progresión correcta es: rango base → ejecución → datos → leak → ajuste → nueva versión → validación. El sistema debe evolucionar con tus datos, no con impulsos de una sesión.']
  ];
  const quick=[
    ['RFI','2.5 BB','UTG / CO / BTN'],['RFI SB','3 BB','SB'],['ISO IP','4.5 BB','+1 BB por limper'],['ISO OOP','5.5 BB','+1 BB por limper'],['ISO BvB','4 BB','BB vs SB'],['C-BET seco','25–33%','K72r'],['C-BET medio','50–66%','J96 two-tone'],['C-BET dinámico','75%+','987 two-tone']
  ];
  const bb=[['UTG','14.03%','58 3BET · 128 CALL'],['CO','31.82%','106 3BET · 316 CALL'],['BTN','39.06%','154 3BET · 364 CALL'],['SB','55.35%','180 3BET · 554 CALL']];
  $('#guideContent').innerHTML=`
  <div class="hero"><div class="card hero-main"><div class="eyebrow">LABPOK V1 / MANUAL WINAMAX 5-MAX</div><h2>Manual de <span class="hero-accent">juego</span>.</h2><p>Guía operativa para estudiar y ejecutar el sistema Winamax NL2 5-MAX construido en LabPok. Las tablas preflop del módulo son la base actual de trabajo y están marcadas como EXPERIMENTAL hasta su validación con datos propios.</p><div class="toolbar"><button class="btn gold" onclick="document.querySelector('.guide-details')?.scrollIntoView({behavior:'smooth'})">Empezar manual</button><button class="btn" onclick="switchView('winamax5')">Ir a rangos Winamax</button></div></div><div class="card quick-grid"><div class="quick"><strong>5-MAX</strong><span>UTG · CO · BTN · SB · BB</span></div><div class="quick"><strong>36</strong><span>tablas preflop</span></div><div class="quick"><strong>EXP</strong><span>base a validar con datos</span></div><div class="quick"><strong>POST</strong><span>rango × board × posición</span></div></div></div>

  <div class="section-title">Hoja rápida de referencia</div>
  <div class="grid cards guide-metrics">${quick.map(x=>`<div class="card"><div class="stat-label">${x[0]}</div><div class="stat-value">${x[1]}</div><div class="stat-foot">${x[2]}</div></div>`).join('')}</div>

  <div class="section-title">BB Defense — referencia actual</div>
  <div class="grid cards guide-metrics">${bb.map(x=>`<div class="card"><div class="stat-label">BB vs ${x[0]}</div><div class="stat-value">${x[1]}</div><div class="stat-foot">${x[2]} · EXPERIMENTAL</div></div>`).join('')}</div>

  <div class="section-title">Manual completo</div>
  <div class="guide-details">${sections.map((s,i)=>`<details class="guide-detail" ${i<4?'open':''}><summary><span class="guide-number">${s[0]}</span><span><strong>${s[1]}</strong><small>${i<10?'PREFLOP':'POSTFLOP / MÉTODO'}</small></span><span class="guide-chevron">⌄</span></summary><div class="guide-detail-body"><p class="guide-lead">${s[2]}</p><p>${s[3]}</p></div></details>`).join('')}</div>

  <div class="section-title">Protocolo de decisión en mesa</div>
  <div class="card process-card"><div class="process-grid">
    <div><span>01</span><strong>POSICIÓN</strong><p>¿Quién abre y quién queda por hablar?</p></div>
    <div><span>02</span><strong>RANGO</strong><p>¿Qué rango representa cada jugador?</p></div>
    <div><span>03</span><strong>SIZING</strong><p>¿Qué precio y qué SPR crea la acción?</p></div>
    <div><span>04</span><strong>BOARD</strong><p>¿Qué manos mejora y qué proyectos crea?</p></div>
    <div><span>05</span><strong>PLAN</strong><p>¿Qué haré ante call, raise y cartas relevantes?</p></div>
    <div><span>06</span><strong>REVISIÓN</strong><p>Si hay duda, guarda la mano y revísala después.</p></div>
  </div></div>

  <div class="section-title">Regla de oro del manual</div>
  <div class="card doctrine-card"><div class="eyebrow">LABPOK METHOD</div><h3>Rango → Board → Posición → Sizing → Acción → Plan</h3><p>No empieces por tu mano. Empieza por la situación completa. Una misma mano puede tener una acción diferente cuando cambia la posición, el rango rival, el sizing o la textura.</p></div>

  <div class="section-title">Fuentes y alcance</div>
  <div class="card source-card"><p>El módulo Winamax 5-MAX se construyó como sistema de estudio propio. Las referencias externas usadas para contrastar la arquitectura proceden principalmente de discusiones francesas de Kill Tilt y Poker Académie sobre NL2/5-MAX, defensa de ciegas, steal, 3BET y juego postflop. No se ha encontrado una tabla oficial de rangos GTO de Winamax para NL2 5-MAX 2026; por eso las tablas del módulo están marcadas EXPERIMENTAL y deben validarse con datos propios.</p><p><strong>Importante:</strong> las referencias de sizing y los porcentajes de este manual son puntos de partida del sistema LabPok, no promesas de EV ni reglas universales.</p></div>

  <div class="section-title">Cuaderno de estudio</div>
  <div class="notes-layout">
    <div class="card note-editor"><div class="eyebrow">STUDY NOTES</div><h3>Añadir apunte</h3><div class="meta-grid"><div class="field"><label>Título</label><input id="noteTitle" placeholder="Ej. BB vs BTN — K4s"></div><div class="field"><label>Categoría</label><select id="noteCategory"><option>Preflop</option><option>Postflop</option><option>Leaks</option><option>Concepto</option><option>Manos</option><option>Zeros</option><option>NL2</option><option>NL5</option><option>Otro</option></select></div><div class="field full"><label>Apunte</label><textarea id="noteBody" placeholder="Escribe aquí lo que has aprendido, dudas, reglas, excepciones o conclusiones..."></textarea></div></div><div class="toolbar"><button class="btn gold" id="saveNoteBtn">+ Guardar apunte</button><button class="btn" id="clearNoteBtn">Limpiar</button></div></div>
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
function winamax7GTables(subcategory='ALL'){
  return state.tables.filter(t=>t.category==='WINAMAX 5-MAX' && String(t.status||'').toUpperCase()!=='PENDIENTE' && (subcategory==='ALL'||(t.subcategory||'OTRO')===subcategory) && Object.keys(normalizeTrainingCells(t)).some(h=>normalizeTrainingCells(t)[h] && state.actions[normalizeTrainingCells(t)[h]]));
}
function renderWinamax7G(){
  const host=$('#w5TrainingArea'); if(!host)return;
  const cats=['ALL','RFI','BB DEFENSE','3BET / CC','VS 3BET','4BET','ISO RAISE'];
  const wt=state.winamaxTraining||{score:0,attempts:0,streak:0,bestStreak:0};
  const current=window.w5TrainingCategory||'ALL';
  const pool=winamax7GTables(current);
  host.innerHTML=`<div class="w5-training-head"><div><div class="eyebrow">7G · ENTRENAMIENTO WINAMAX 5-MAX</div><h3>Entrenamiento conectado a tus rangos</h3><p class="muted">Cada pregunta utiliza directamente una tabla Winamax 5-MAX cargada en LabPok. No es una tabla nueva: es el rango que estás estudiando.</p></div><div class="w5-training-stats"><div><span>PUNTOS</span><b id="w5Score">${wt.score}</b></div><div><span>INTENTOS</span><b id="w5Attempts">${wt.attempts}</b></div><div><span>RACHA</span><b id="w5Streak">${wt.streak}</b></div><div><span>MEJOR</span><b id="w5Best">${wt.bestStreak}</b></div></div></div><div class="toolbar w5-training-toolbar"><select class="training-select" id="w5TrainingCategory">${cats.map(c=>`<option value="${escapeAttr(c)}" ${c===current?'selected':''}>${c==='ALL'?'TODOS LOS BLOQUES':c}</option>`).join('')}</select><button class="btn gold" id="startW5QuizBtn" ${pool.length?'':'disabled'}>Nueva situación →</button><span class="w5-pool-count">${pool.length} tablas entrenables</span></div><div id="w5QuizArea" class="w5-training-quiz"><div class="empty">${pool.length?'Pulsa «Nueva situación» para comenzar.':'No hay tablas entrenables en este bloque.'}</div></div>`;
  $('#w5TrainingCategory').onchange=e=>{window.w5TrainingCategory=e.target.value;renderWinamax7G()};
  $('#startW5QuizBtn')?.addEventListener('click',startWinamaxQuiz);
}
function startWinamaxQuiz(){
  const cat=window.w5TrainingCategory||'ALL';
  const pool=winamax7GTables(cat);
  if(!pool.length){toast('No hay tablas entrenables en este bloque.');return}
  const t=pool[Math.floor(Math.random()*pool.length)];
  const hands=trainingHandsForTable(t); if(!hands.length){toast('La tabla seleccionada no contiene decisiones reconocibles.');return}
  const hand=hands[Math.floor(Math.random()*hands.length)];
  const cells=normalizeTrainingCells(t),correct=cells[hand];
  window.currentW5Quiz={tableId:t.id,hand,correct};
  const actionKeys=Object.keys(state.actions).filter(k=>k!=='fold'||correct==='fold');
  let options=actionKeys.sort(()=>Math.random()-.5).slice(0,5);
  if(!options.includes(correct))options[Math.floor(Math.random()*options.length)]=correct;
  options=[...new Set(options)];
  while(options.length<Math.min(5,actionKeys.length)){
    const next=actionKeys.find(k=>!options.includes(k)); if(!next)break; options.push(next);
  }
  const visual=handVisual(hand),area=$('#w5QuizArea');
  area.innerHTML=`<div class="quiz-head"><div><div class="eyebrow">${escapeHtml(t.subcategory||'WINAMAX 5-MAX')}</div><h3>${escapeHtml(t.name)}</h3><p class="muted">¿Qué acción marca nuestra tabla para esta mano?</p></div><span class="phase-badge">${escapeHtml(t.status||'EXPERIMENTAL')}</span></div><div class="quiz-hand-cards">${visual.cards}</div><div class="hand-notation"><strong>${escapeHtml(visual.label)}</strong><span>${escapeHtml(visual.kind)}</span></div><div class="quiz-options">${options.map(k=>`<button class="quiz-option" data-w5-answer="${escapeAttr(k)}" style="--action-bg:${state.actions[k].color}">${escapeHtml(state.actions[k].label)}</button>`).join('')}</div><div class="quiz-context">${escapeHtml(t.subcategory||'')} · ${escapeHtml(t.name)} · v${t.version||1}</div>`;
  $$('.quiz-option',area).forEach(b=>b.onclick=()=>answerWinamaxQuiz(b.dataset.w5Answer));
}
function answerWinamaxQuiz(answer){
  const q=window.currentW5Quiz;if(!q)return;
  const correct=answer===q.correct,wt=state.winamaxTraining;
  wt.attempts++; if(correct){wt.score++;wt.streak++;wt.bestStreak=Math.max(wt.bestStreak,wt.streak)}else wt.streak=0;
  markDirty();
  const t=state.tables.find(x=>x.id===q.tableId),a=state.actions[q.correct],area=$('#w5QuizArea');
  $$('.quiz-option',area).forEach(b=>b.disabled=true);
  area.insertAdjacentHTML('beforeend',`<div class="quiz-result ${correct?'correct':'wrong'}"><strong>${correct?'✓ CORRECTO':'✕ INCORRECTO'}</strong><span>La tabla <b>${escapeHtml(t.name)}</b> marca <b style="color:${a.color}">${escapeHtml(a.label)}</b> para ${escapeHtml(q.hand)}.</span><button class="btn gold" onclick="startWinamaxQuiz()">Siguiente →</button></div>`);
  $('#w5Score')?.replaceChildren(document.createTextNode(String(wt.score)));
  $('#w5Attempts')?.replaceChildren(document.createTextNode(String(wt.attempts)));
  $('#w5Streak')?.replaceChildren(document.createTextNode(String(wt.streak)));
  $('#w5Best')?.replaceChildren(document.createTextNode(String(wt.bestStreak)));
}
function renderWinamax5(){
  const host=$('#winamax5Content'); if(!host)return;
  const tables=state.tables.filter(t=>t.category==='WINAMAX 5-MAX');
  const groups={
    'RFI':['w5_rfi_utg','w5_rfi_co','w5_rfi_btn','w5_rfi_sb'],
    'BB DEFENSE':['w5_bb_utg','w5_bb_co','w5_bb_btn','w5_bb_sb'],
    '3BET / CC':['w5_3b_utg','w5_3b_btn','w5_3b_co','w5_3b_sb','w5_3b_sb_co','w5_3b_sb_btn','w5_3b_bb_utg','w5_3b_bb_co','w5_3b_bb_btn','w5_3b_bb_sb'],
    'VS 3BET':['w5_vs3_utg','w5_vs3_co','w5_vs3_btn','w5_vs3_sb'],
    '4BET':['w5_4b_utg','w5_4b_co','w5_4b_btn','w5_4b_sb'],
    'ISO RAISE':['w5_iso_utg','w5_iso_co','w5_iso_btn','w5_iso_sb','w5_iso_btn_co','w5_iso_sb_co','w5_iso_sb_btn','w5_iso_bb_co','w5_iso_bb_btn','w5_iso_bb_sb']
  };
  const labels={
    'RFI':'Open Raise por posición',
    'BB DEFENSE':'Defensa de BB frente a cada open',
    '3BET / CC':'3BET y Cold Call frente a open',
    'VS 3BET':'Respuesta después de abrir y recibir 3BET',
    '4BET':'4BET / CALL / FOLD',
    'ISO RAISE':'Aislamiento frente a limpers'
  };
  const active=window.w5ActiveCategory && groups[window.w5ActiveCategory] ? window.w5ActiveCategory : null;
  const count=tables.length;
  const completed=Object.fromEntries(Object.entries(groups).map(([g,ids])=>[g,ids.filter(id=>state.tables.find(t=>t.id===id)?.status==='VALIDADO').length]));
  const cardFor=t=>{
    const vals=Object.values(t.cells||{});
    const openCount=vals.filter(v=>v==='open').length;
    const callCount=vals.filter(v=>v==='call').length;
    const threeBetCount=vals.filter(v=>v==='bet3').length;
    const fourBetCount=vals.filter(v=>v==='bet4').length;
    const bluffCount=vals.filter(v=>v==='bluff').length;
    let rangeInfo=openCount?`${openCount} OPEN`:((threeBetCount||callCount)?`${threeBetCount} 3BET · ${callCount} CALL`:(fourBetCount||bluffCount)?`${fourBetCount} 4BET · ${bluffCount} BLUFF`:'sin rango cargado');
    return `<button class="module w5-table" data-table-id="${t.id}"><div class="icon">${t.status==='VALIDADO'?'✓':t.status==='EXPERIMENTAL'?'◆':'○'}</div><h3>${escapeHtml(t.name)}</h3><p>${escapeHtml(t.subtitle||'')}</p><div class="w5-card-meta"><span class="phase-badge">${escapeHtml(t.status||'PENDIENTE')}</span><span>${rangeInfo}</span></div></button>`;
  };
  const sectionHtml=(g)=>{
    const ids=groups[g];
    const cards=ids.map(id=>{const t=state.tables.find(x=>x.id===id);return t?cardFor(t):''}).join('');
    const isOpen=g===active;
    return `<section class="w5-accordion ${isOpen?'open':''}" data-w5section="${escapeAttr(g)}"><button class="w5-accordion-head" data-w5toggle="${escapeAttr(g)}" aria-expanded="${isOpen}"><span class="w5-accordion-main"><strong>${escapeHtml(g)}</strong><em>${escapeHtml(labels[g])}</em></span><span class="w5-accordion-meta"><b>${completed[g]||0}/${ids.length}</b><span class="w5-chevron">⌄</span></span></button><div class="w5-accordion-body"><div class="module-grid w5-grid">${cards}</div>${g==='RFI'?`<div class="w5-mini-note">7A · RFI — UTG, CO, BTN y SB construidos como base experimental.</div>`:''}${g==='BB DEFENSE'?`<div class="w5-mini-note">7B · BB Defense — UTG, CO, BTN y SB. Defensa total separada de 3BET / CC.</div>`:''}${g==='3BET / CC'?`<div class="w5-mini-note">7C · 3BET / CC — cada tabla separa explícitamente 3BET y CALL según posición.</div>`:''}${g==='VS 3BET'?`<div class="w5-mini-note">7D · VS 3BET — después de abrir: 4BET VALUE, 4BET BLUFF, CALL y FOLD.</div>`:''}${g==='4BET'?`<div class="w5-mini-note">7E · 4BET — vista concentrada de las manos que convierten la defensa frente a 3BET en 4BET VALUE o 4BET BLUFF. CALL/FOLD se estudian en 7D.</div>`:''}${g==='ISO RAISE'?`<div class="w5-mini-note">7F · ISO RAISE — aislar 1 limper con sizing distinto según IP/OOP.</div>`:''}</div></section>`;
  };
  host.innerHTML=`
    <div class="hero"><div class="card hero-main"><div class="eyebrow">LABPOK V1 / WINAMAX 5-MAX</div><h2>Nuevo formato. <span class="hero-accent">Nueva estrategia.</span></h2><p>Perfil independiente para cash 5-MAX de Winamax. Trabajaremos <b>UTG · CO · BTN · SB · BB</b> sin mezclarlo con las tablas 6-MAX.</p><div class="toolbar"><button class="btn gold" id="seedW5Btn">Aplicar / recuperar estructura</button><button class="btn" onclick="switchView('ranges')">Abrir editor de rangos →</button></div></div><div class="card training-score"><div class="stat-label">TABLAS 5-MAX</div><div class="stat-value">${count}</div><div class="stat-foot">6 categorías · ${count} tablas</div></div></div>
    <div class="notice w5-warning"><b>Estado:</b> 7A RFI, 7B BB Defense y 7C 3BET / CC están construidos como bases experimentales. <b>7D VS 3BET</b>, <b>7E 4BET</b>, <b>7F ISO RAISE</b> y <b>7G ENTRENAMIENTO</b> están incorporados en este bloque. Las tablas no se presentan como GTO.</div>
    <div class="section-title">Mapa de posiciones</div><div class="w5-seats"><div>UTG<small>Primera en hablar preflop</small></div><div>CO<small>Cutoff</small></div><div>BTN<small>Botón</small></div><div>SB<small>Ciega pequeña</small></div><div>BB<small>Ciega grande</small></div></div>
    <div class="section-title">Módulos 5-MAX · desplegables</div>
    <div class="w5-accordion-list">${Object.keys(groups).map(sectionHtml).join('')}</div>
    <div class="section-title">7D · VS 3BET</div><div class="card w5-study-box"><div class="eyebrow">7D · VS 3BET</div><h3>Cómo leer este bloque</h3><p class="muted">Aquí ya no estudiamos la defensa frente a un open. Partimos de que Hero abrió y recibió una 3BET. Las decisiones se separan en <b>4BET VALUE</b>, <b>4BET BLUFF</b>, <b>CALL</b> y <b>FOLD</b>. La posición del opener cambia la anchura de la defensa.</p><div class="w5-study-grid"><div><b>UTG</b><span>112 combos de continuación · 8,45%.</span></div><div><b>CO</b><span>118 combos · 8,90%.</span></div><div><b>BTN</b><span>156 combos · 11,76%.</span></div><div><b>SB</b><span>112 combos · 8,45%.</span></div></div><p class="muted">Las referencias consultadas para micro límites recomiendan tratar las tablas frente a 3BET como una base dependiente de posición, rival y frecuencia de 3BET; no existe una tabla oficial actual de Winamax NL2 5-MAX que debamos copiar directamente. citeturn0search6turn0search10</p></div>
    <div class="section-title">7E · 4BET</div><div class="card w5-study-box"><div class="eyebrow">7E · 4BET</div><h3>Cómo leer este bloque</h3><p class="muted">Este bloque es una vista específica de las manos que elegimos para hacer <b>4BET VALUE</b> o <b>4BET BLUFF</b> después de abrir y recibir una 3BET. No sustituye al bloque 7D: allí se estudian conjuntamente 4BET, CALL y FOLD.</p><div class="w5-study-grid"><div><b>UTG</b><span>50 combos de 4BET · 3.77% del total.</span></div><div><b>CO</b><span>50 combos · 3.77%.</span></div><div><b>BTN</b><span>64 combos · 4.83%.</span></div><div><b>SB</b><span>58 combos · 4.37%.</span></div></div><p class="muted">La literatura de micro límites consultada respalda una construcción dependiente de posición y rival: IP suele conservar más defensa en CALL y OOP tiende a utilizar más 4BET, mientras que en micros la frecuencia real de 3BET/4BET del rival debe pesar en los ajustes. citeturn0search14turn0search11</p></div>
    <div class="section-title">7F · ISO RAISE</div><div class="card w5-study-box"><div class="eyebrow">7F · ISO RAISE</div><h3>Cómo leer este bloque</h3><p class="muted">Partimos de <b>1 limper</b> y estudiamos la subida de aislamiento según la posición de Hero. <b>CO y BTN</b> quedan IP si el limper paga; <b>SB y BB</b> juegan OOP. La base usa un sizing de <b>4.5 BB IP</b> y <b>5.5 BB OOP</b> con un limper, añadiendo aproximadamente 1 BB por cada limper adicional. Las frecuencias son EXPERIMENTALES y deben ajustarse según limp/fold y tendencias postflop del rival.</p><div class="w5-study-grid"><div><b>CO vs UTG limp</b><span>334 combos · 25.19% · 4.5 BB.</span></div><div><b>BTN vs UTG limp</b><span>614 combos · 46.30% · 4.5 BB.</span></div><div><b>SB vs UTG limp</b><span>422 combos · 31.83% · 5.5 BB.</span></div><div><b>BB vs UTG limp</b><span>450 combos · 33.94% · 5.5 BB.</span></div></div><p class="muted">Las referencias de micro límites consultadas respaldan aislar más caro que un open normal y aumentar el sizing cuando hay más dead money; también destacan que el rango de iso depende mucho del perfil del limper y de las ciegas. No existe una tabla oficial actual de Winamax NL2 5-MAX que debamos copiar directamente. citeturn0search6turn0search9</p></div>
    <div class="section-title">7G · ENTRENAMIENTO 5-MAX</div><div id="w5TrainingArea" class="card w5-training-box"></div>
    <div class="section-title">Orden de desarrollo</div><div class="card"><ol class="w5-roadmap"><li><b>7A · RFI</b> — construir y validar UTG, CO, BTN y SB.</li><li><b>7B · BB Defense</b> — BB vs UTG / CO / BTN / SB.</li><li><b>7C · 3BET / CC</b> — respuestas por posición.</li><li><b>7D · VS 3BET</b> — continuar, 4BET y fold.</li><li><b>7E · 4BET</b> — vista específica de 4BET VALUE y 4BET BLUFF.</li><li><b>7F · ISO RAISE</b> — ajustes contra limpers.</li><li><b>7G · Entrenamiento</b> — practicar directamente sobre las tablas 5-MAX y medir precisión/racha.</li></ol></div>`;
  renderWinamax7G();
  $('#seedW5Btn').onclick=seedW5Templates;
  $$('.w5-accordion-head',host).forEach(b=>b.onclick=()=>{const g=b.dataset.w5toggle;window.w5ActiveCategory=(window.w5ActiveCategory===g)?null:g;renderWinamax5()});
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
