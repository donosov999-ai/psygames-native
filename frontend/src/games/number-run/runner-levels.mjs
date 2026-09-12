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
export const meets=(sum,r)=>(r.min===null||sum>=r.min)&&(r.max===null||sum<=r.max);
export function ruleDifference(sum,r){if(r.min!==null&&sum<r.min)return {kind:'short',amount:r.min-sum};if(r.max!==null&&sum>r.max)return {kind:'over',amount:sum-r.max};return {kind:'pass',amount:0};}
function random(seed){let a=seed>>>0;return ()=>{a=(a+0x6d2b79f5)>>>0;let t=Math.imul(a^(a>>>15),1|a);t^=t+Math.imul(t^(t>>>7),61|t);return ((t^(t>>>14))>>>0)/4294967296;};}
function shuffled(items,rng){const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
export function stationaryWins(course,lane){let sum=course.start;for(const r of course.rows){if(r.kind==='pickups')sum+=r.items.filter(i=>Math.abs(i.x-lane)<=.18).reduce((a,i)=>a+i.value,0);else if(r.kind==='operation')sum=applyOperation(sum,r.options[lane+1],course.mode==='journey'?1e6:9999);else if(r.kind==='obstacle'){if(r.jump){if(lane!==r.jump.lane)return false;}else {if(r.span&&r.penalties[lane+1])return false;sum-=r.penalties[lane+1];}}else if(!meets(sum,r.rules.length===1?r.rules[0]:r.rules[lane+1]))return false;}return true;}
// Full accumulated states and intermediate gates, not a greedy sum of pickups.
export function solveCourse(course){
 let candidates=[{sum:course.start,lane:0,z:0,path:[]}];
 for(const row of course.rows){const next=new Map();for(const c of candidates)for(const lane of row.kind==='pickups'?row.items.map(i=>i.x):[-1,0,1]){
  if(Math.abs(lane-c.lane)/course.lateralSpeed>(row.z-(row.jump?.launchOffset??row.span??0)-c.z)/course.speed+1e-9)continue;
  if(row.jump?lane!==row.jump.lane:row.kind==='obstacle'&&row.span&&row.penalties[lane+1])continue;
  let sum;try{sum=row.kind==='pickups'?c.sum+row.items.find(i=>i.x===lane).value:row.kind==='operation'?applyOperation(c.sum,row.options[lane+1],course.mode==='journey'?1e6:9999):row.kind==='obstacle'&&!row.jump?c.sum-row.penalties[lane+1]:c.sum;}catch{continue;}
  if(row.kind==='gate'&&!meets(sum,row.rules.length===1?row.rules[0]:row.rules[lane+1]))continue;
  const key=`${sum}:${lane}`;if(!next.has(key))next.set(key,{sum,lane,z:row.z+(row.window??0),path:[...c.path,{id:row.id,lane,sum}]});
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
