// VER 6 · 2026-09-16: ряд без чисел (показ знаков станции «память») решатель проходит любой полосой.
// VER 5 · 2026-09-16 · psygames-search-claude-mac: решатель и «стоящий на месте» знают станции — арки answer (полоса = ответ)
// и ворота «ровно N» (числа-части не прибавляются, сумма ряда сверяется с целью). Тренировки не тронуты.
// VER 4 · 2026-09-16 · psygames-search-claude-mac, на основе LOCAL 0.4. Решатель забега знает построения маршрута VER 4:
// у ряда с row.routes варианты — пути построения (вход, выход, прибавка), а не отдельные числа; трамплин обязателен
// только у препятствия. Тренировки не тронуты: у их рядов routes нет, ветки совпадают построчно.
// VER 3 · Number Run local 0.4 · 2026-09-12. Ramp entry reachability; training unchanged.
export const GENERATOR_VERSION='number-run/2';
const row=(...options)=>({kind:'operation',options}), gate=(...rules)=>({kind:'gate',rules});
export const LEVELS=[
 {id:1,title:'Число в движении',skill:'Сложение · один порог',start:0,speed:5,gap:15,
  hint:'Ты — число 0. Выбирай прибавления, чтобы получить не меньше 8. Пустая полоса → ничего не добавляет.',
  rows:[row('+4','+1','→'),row('+2','→','+5'),gate('≥8')]},
 {id:2,title:'Собери за три выбора',skill:'Сравнение слагаемых',start:0,speed:5.3,gap:14,
  hint:'До ворот три выбора. Одного большого числа недостаточно: считай всю цепочку.',
  rows:[row('+3','+1','→'),row('+5','+2','→'),row('+4','+1','→'),gate('≥10')]},
 {id:3,title:'Сохрани накопленное',skill:'Двое зависимых ворот',start:0,speed:5.5,gap:14,
  hint:'Сначала ≥6, затем ≥14. Ворота ничего не списывают: твоё число идёт дальше.',
  rows:[row('+4','+1','→'),row('+3','+1','→'),gate('≥6'),row('+5','+1','→'),row('+4','+2','→'),gate('≥14')]},
 {id:4,title:'Минус — тоже выбор',skill:'Вычитание без ускорения',start:10,speed:5.5,gap:14,
  hint:'Начинаешь с 10. Минус уменьшает твоё число. Иногда правильный выбор — пропустить операцию.',
  rows:[row('−3','−8','→'),row('+2','+4','→'),gate('≥11')]},
 {id:5,title:'Больше — не всегда лучше',skill:'Переключение ≥ и ≤',start:0,speed:5.5,gap:14,
  hint:'Сначала набери хотя бы 4. Затем сохрани не больше 7: лишние прибавления могут помешать.',
  rows:[row('+2','+7','→'),row('+3','+8','→'),gate('≥4'),row('+2','+9','→'),gate('≤7')]},
 {id:6,title:'Попади в диапазон',skill:'Нижняя и верхняя границы',start:0,speed:5.8,gap:14,
  hint:'На воротах нужно от 9 до 11 включительно. И недобор, и перебор остановят забег.',
  rows:[row('+3','+7','→'),row('+4','+9','→'),row('+2','+6','→'),gate('9…11')]},
 {id:7,title:'Умножай текущее число',skill:'Умножение',start:2,speed:5.8,gap:14,
  hint:'×3 умножает накопленное число на 3. Сначала выбери прибавление, затем множитель.',
  rows:[row('+3','+1','→'),row('×2','×3','→'),gate('≥12')]},
 {id:8,title:'Порядок решает',skill:'Цепочка + и ×',start:1,speed:6,gap:13,
  hint:'Операции выполняются по дороге. 1 + 4, затем ×3 — это 15, не 13.',
  rows:[row('+4','×2','→'),row('×3','+4','→'),row('+2','×2','→'),gate('17…18')]},
 {id:9,title:'По другую сторону нуля',skill:'Отрицательные числа',start:3,speed:6,gap:13,
  hint:'Число может стать отрицательным. Нужно попасть от −2 до 0. Минус не обрезается до нуля.',
  rows:[row('−5','+2','→'),row('×2','+3','→'),row('+7','−2','→'),gate('−2…0')]},
 {id:10,title:'Выбери свои ворота',skill:'Развилка из трёх условий',start:0,speed:6.2,gap:13,
  hint:'У каждой полосы свои ворота. Выбери условие для своего числа, затем подготовь ≥14 на финише.',
  rows:[row('+3','+7','→'),row('+2','+5','→'),gate('≥10','≤4','6…8'),row('+5','+1','→'),row('×2','−4','→'),gate('≥14')]},
 {id:11,title:'План на три проверки',skill:'Зависимые диапазоны и развилка',start:5,speed:6.5,gap:12,
  hint:'Держи в уме всю цепочку ворот. Число сейчас должно оставлять путь к следующей цели.',
  rows:[row('+4','−3','→'),row('×2','+2','→'),gate('8…10'),row('+8','−2','→'),row('×2','−4','→'),gate('12…14'),row('+3','−5','→'),gate('≤7','15…17','≥25')]},
 {id:12,title:'Числовой маршрут',skill:'Все операции · меньше времени',start:4,speed:7,gap:12,
  hint:'Сложение, вычитание и умножение вместе. Пройди 19…21, затем ≤15 и выбери финальные ворота.',
  rows:[row('+3','−2','→'),row('×3','+5','→'),gate('19…21'),row('−7','+3','→'),row('×2','−5','→'),gate('≤15'),row('+8','−3','→'),row('×2','+6','→'),gate('20…24','28…30','≤9')]},
].map(Object.freeze);
export function parseRule(text){const n=text.replaceAll('−','-');if(n.startsWith('≥'))return {min:Number(n.slice(1)),max:null};if(n.startsWith('≤'))return {min:null,max:Number(n.slice(1))};const [min,max]=n.split('…').map(Number);return {min,max};}
export function ruleText(r){const n=v=>String(v).replace('-','−');return r.min===null?`≤ ${n(r.max)}`:r.max===null?`≥ ${n(r.min)}`:`${n(r.min)}…${n(r.max)}`;}
export function applyOperation(sum,label,limit=9999){
 let value=sum;if(label==='→')return value;
 if(label.startsWith('+'))value+=Number(label.slice(1));else if(label.startsWith('−'))value-=Number(label.slice(1));else if(label.startsWith('×'))value*=Number(label.slice(1));else throw Error(`Unknown operation ${label}`);
 if(!Number.isSafeInteger(value)||Math.abs(value)>limit)throw Error('Arithmetic out of range');return value;
}
// Цена шкалы: ошибка — доля ширины шкалы. В допуске — прибавка; до двух допусков — ноль («близко»); дальше — минус.
export function scaleDelta(row,err){return err<=row.tolerance?row.reward:err<=2*row.tolerance?0:-row.penalty;}
export const scaleValue=(row,x)=>row.min+(Math.max(-1,Math.min(1,x))+1)/2*(row.max-row.min);
// Цена ворот «ровно N» при собранной сумме got: ровно — прибавка; мимо — минус, растущий с промахом, не больше прибавки.
// Живёт с прочими правилами арифметики: её читают ядро, решатель и построитель станций (без кольца импортов).
export function exactDelta(exact,got){
 if(got===exact.target)return exact.bonus;
 const scaled=Math.max(5,Math.round(exact.bonus*Math.abs(got-exact.target)/Math.max(1,exact.target)/5)*5);
 return -Math.min(exact.bonus,Math.max(exact.unit,scaled));
}
export const meets=(sum,r)=>(r.min===null||sum>=r.min)&&(r.max===null||sum<=r.max);
export function ruleDifference(sum,r){if(r.min!==null&&sum<r.min)return {kind:'short',amount:r.min-sum};if(r.max!==null&&sum>r.max)return {kind:'over',amount:sum-r.max};return {kind:'pass',amount:0};}
function random(seed){let a=seed>>>0;return ()=>{a=(a+0x6d2b79f5)>>>0;let t=Math.imul(a^(a>>>15),1|a);t^=t+Math.imul(t^(t>>>7),61|t);return ((t^(t>>>14))>>>0)/4294967296;};}
function shuffled(items,rng){const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
// Стоящий на месте: столб прижимает к своей стороне, трамплин в его полосе уносит над числами.
function stationaryGain(r,lane){const d=r.divider,side=d?Math.sign(lane)||1:0,x=d?(side<0?Math.min(lane,-d.gap):Math.max(lane,d.gap)):lane,flying=r.jump&&r.jump.lane===lane;
 const touched=r.items.filter(i=>{const dz=i.dz??0;if(flying&&dz>-r.jump.launchOffset&&dz<r.jump.landingOffset)return false;if(d&&dz>=d.fromDz&&dz<=d.toDz&&Math.sign(i.x)!==side)return false;return Math.abs(i.x-x)<=(i.half??.18);});
 const plain=touched.filter(i=>!i.part).reduce((a,i)=>a+i.value,0);
 return r.exact?plain+exactDelta(r.exact,touched.filter(i=>i.part).reduce((a,i)=>a+i.value,0)):plain;}
export function stationaryWins(course,lane){let sum=course.start;for(const r of course.rows){if(r.kind==='pickups')sum+=stationaryGain(r,lane);else if(r.kind==='answer')sum+=lane+1===r.correct?r.reward:-r.penalty;else if(r.kind==='scale')sum+=scaleDelta(r,Math.abs(scaleValue(r,lane)-r.answer)/(r.max-r.min));else if(r.kind==='operation')sum=applyOperation(sum,r.options[lane+1],course.mode==='journey'?1e6:9999);else if(r.kind==='obstacle'){if(r.jump){if(lane!==r.jump.lane)return false;}else {if(r.span&&r.penalties[lane+1])return false;sum-=r.penalties[lane+1];}}else if(!meets(sum,r.rules.length===1?r.rules[0]:r.rules[lane+1]))return false;}return true;}
// Full accumulated states and intermediate gates, not a greedy sum of pickups.
export function solveCourse(course){
 let candidates=[{sum:course.start,lane:0,z:0,path:[]}];
 for(const row of course.rows){const next=new Map();for(const c of candidates)for(const option of row.routes??(row.kind==='pickups'&&row.items.length?row.items.map(i=>i.x):[-1,0,1])){
  // A route of a VER 4 shape: reach its entry in time, then its gain and exit are fixed by construction.
  const route=typeof option==='object'?option:null,lane=route?route.exit:option,entryX=route?route.entry.x:lane;
  if(Math.abs(entryX-c.lane)/course.lateralSpeed>((route?row.z+route.entry.dz:row.z-(row.jump?.launchOffset??row.span??0))-c.z)/course.speed+1e-9)continue;
  if(row.kind==='obstacle'&&(row.jump?lane!==row.jump.lane:row.span&&row.penalties[lane+1]))continue;
  let sum;try{sum=route?c.sum+route.gain:row.kind==='answer'?c.sum+(lane+1===row.correct?row.reward:-row.penalty):row.kind==='pickups'?c.sum+(row.items.find(i=>i.x===lane)?.value??0):row.kind==='operation'?applyOperation(c.sum,row.options[lane+1],course.mode==='journey'?1e6:9999):row.kind==='obstacle'&&!row.jump?c.sum-row.penalties[lane+1]:c.sum;}catch{continue;}
  if(row.kind==='gate'&&!meets(sum,row.rules.length===1?row.rules[0]:row.rules[lane+1]))continue;
  const key=`${sum}:${lane}`;if(!next.has(key))next.set(key,{sum,lane,z:row.z+(row.window??0),path:[...c.path,{id:row.id,lane,sum,...(route?{route:route.id}:{})}]});
 }candidates=[...next.values()];if(!candidates.length)return null;
 // Journey stage lines impose no arithmetic threshold; maximize pickups, then route terrain.
 if(course.mode==='journey'){candidates.sort((a,b)=>b.sum-a.sum);candidates=candidates.slice(0,3);}
 }
 return candidates[0]?.path??null;
}
export function makeCourse(levelId=1,seed=20260912){
 if(!Number.isInteger(levelId)||levelId<1||levelId>LEVELS.length)throw Error('Unknown level');
 if(!Number.isInteger(seed)||seed<0||seed>0xffffffff)throw Error('Invalid seed');
 const level=LEVELS[levelId-1],rng=random(seed+levelId*1009);
 for(let attempt=0;attempt<256;attempt++){
  const rows=level.rows.map((r,i)=>({id:i,z:14+i*level.gap,kind:r.kind,...(r.kind==='operation'?{options:shuffled(r.options,rng)}:{rules:shuffled(r.rules,rng).map(parseRule)})}));
  const course={version:GENERATOR_VERSION,levelId,seed,start:level.start,speed:level.speed,lateralSpeed:4,length:rows.at(-1).z,rows,gates:rows.filter(r=>r.kind==='gate').length};
  if([-1,0,1].some(l=>stationaryWins(course,l)))continue;if(solveCourse(course))return course;
 }throw Error(`No validated course for ${levelId}/${seed}`);
}
