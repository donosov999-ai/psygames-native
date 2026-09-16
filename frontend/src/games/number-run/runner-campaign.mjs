// VER 4 · 2026-09-16 · psygames-search-claude-mac, на основе VER 3 LOCAL 0.4 (psygames-codex-mac).
// Каркас этапа прежний: 14 рядов по 24, те же 72 препятствия, черта без порога, 12×42 с. Меняются семь рядов
// чисел — вместо одного строя из пяти теперь шесть построений (Денис 16.09: «у нас слишком простой»):
//  line    строй из пяти поперёк дороги (как было; первый ряд забега — пять синих 8, 1 → 41);
//  snake   змейка мелких синих по дуге, красные рядом с ней — вести палец, а не стоять;
//  grid    сетка 4×3: в каждой строке одно красное — объехать, не потеряв синие;
//  columns две стопки за столбом: сторону выбираешь до столба, по СУММЕ столбца, перелезть нельзя;
//  walls   стены во всю ширину: «меньший минус» или «×2 против +N» при твоём текущем числе;
//  ramp    трамплин над большим красным: взлетел — пронесло; приманка синих в другом ряду ведёт мимо.
// Числа этапа от зерна НЕ зависят — зерно двигает только геометрию (проба «seeds change lanes, not targets»).
// VER 3 · LOCAL 0.4 · 2026-09-12 · Actual bridges, ramps and nonblocking stage lines.
import {applyOperation,solveCourse,stationaryWins} from './runner-levels.mjs';
export const CAMPAIGN_VERSION='number-run-campaign/4',STAGE_COUNT=12,LADDER_WALLS=10;
const cache=new Map();
function random(seed){let a=seed>>>0;return ()=>{a=(a+0x6d2b79f5)>>>0;let t=Math.imul(a^(a>>>15),a|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
function shuffle(a,rng){a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
const sum=values=>values.reduce((a,v)=>a+v,0);
// Семь рядов чисел на этап. Состав от зерна не зависит: это лестница забега, а не жребий.
export const PLAN=Object.freeze([
 ['line','line','snake','line','grid','columns','line'],
 ['snake','walls','grid','columns','ramp','line','snake'],
 ['grid','columns','ramp','snake','line','grid','walls'],
 ['columns','snake','walls','ramp','grid','line','double'],
 ['snake','ramp','columns','line','grid','snake','walls'],
 ['grid','line','snake','columns','ramp','grid','walls'],
 ['columns','grid','ramp','snake','walls','columns','line'],
 ['snake','columns','line','grid','ramp','snake','double'],
 ['ramp','grid','columns','walls','snake','columns','grid'],
 ['line','snake','grid','ramp','columns','walls','snake'],
 ['columns','ramp','snake','grid','line','columns','walls'],
 ['snake','walls','columns','ramp','grid','columns','double'],
].map(Object.freeze));
// Пары стопок [выгодная, невыгодная]; сторона — от зерна. От явной разницы к близким суммам и приманке первым числом.
const COLUMNS=[
 u=>[[2*u,2*u,2*u,2*u],[-3*u,u,u,u]],
 u=>[[-u,2*u,2*u,3*u],[6*u,-9*u,2*u,-u]],
 u=>[[2*u,2*u,2*u,2*u],[-u,-2*u,-4*u,-8*u]],
 u=>[[-3*u,4*u,3*u,3*u],[5*u,-2*u,4*u,-u]],
 u=>[[-6*u,3*u,5*u,4*u],[10*u,-8*u,6*u,-4*u]],
];
// Дуги змейки (x по строкам); зеркалятся зерном.
const SNAKES=[[0,.5,1,1,.5,0,-.5],[-1,-.5,0,.5,1,.5,0],[-.5,0,.5,0,-.5,0,.5],[1,.5,0,-.5,-.5,0,.5],[0,-.5,-1,-.5,0,.5,1]];
const LANES5=[-1,-.5,0,.5,1];
const round5=v=>Math.max(5,Math.round(v/5)*5);
export function makeCampaign(seed=20260912){
 if(!Number.isInteger(seed)||seed<0||seed>0xffffffff)throw Error('Invalid campaign seed');
 if(cache.has(seed))return cache.get(seed);
 const rng=random(seed),rows=[],stages=[];let intended=1,columnsSeen=0,wallsSeen=0;
 const add=(stage,entry)=>{const row={...entry,id:rows.length,stage,z:24*(rows.length+1)};rows.push(row);return row;};
 for(let stage=1;stage<=STAGE_COUNT;stage++){
  const k=stage+1,startRow=rows.length,startValue=intended,plan=PLAN[stage-1];let slot=0;
  // Единица стопок и сетки растёт с числом, которое к этому месту собирают: разница столбцов ≈ четверть числа, а не пыль.
  const unit=()=>Math.max(k,round5(intended/80));
  const line=(gain,loss)=>{const values=rows.length===0?Array(5).fill(gain):shuffle([gain,gain,Math.max(1,Math.floor(gain/2)),Math.max(1,Math.floor(gain/2)),-loss],rng);add(stage,{kind:'pickups',shape:'line',window:3,items:values.map((value,i)=>({x:(i-2)/2,value}))});intended+=gain;};
  const snake=()=>{
   const dzs=[-18,-15,-12,-9,-6,-3,0],mirror=rng()<.5?-1:1,xs=SNAKES[Math.floor(rng()*SNAKES.length)].map(x=>x*mirror||0);
   const small=Math.max(1,Math.floor(k/2)),values=dzs.map((_,i)=>i<3?small:k);
   const items=dzs.map((dz,i)=>({x:xs[i],dz,window:.6,value:values[i]}));
   // Красные — в той же строке, что синее, но не там, где проходит палец (x соседних строк не занимаем).
   const redCount=stage===1?0:stage<6?1:2,taken=new Set();
   for(let r=0;r<redCount;r++){
    const lines=shuffle([1,2,3,4,5],rng).filter(i=>!taken.has(i));
    for(const i of lines){const free=LANES5.filter(x=>![xs[i-1],xs[i],xs[i+1]].includes(x));if(!free.length)continue;
     items.push({x:free[Math.floor(rng()*free.length)],dz:dzs[i],window:.6,value:-(2+2*r)*k});taken.add(i);break;}
   }
   // Одна дорога на построение: ряд чисел всегда стоит за препятствием или чертой (−24), до первой строки (−19) палец
   // успевает из любого края. Частичные «вход со второй строки» врали: по пути палец задевал пропущенные числа.
   const routes=[{id:'snake',entry:{dz:dzs[0]-1,x:xs[0]},exit:xs.at(-1),gain:sum(values),waypoints:dzs.map((dz,i)=>({dz,x:xs[i]}))}];
   add(stage,{kind:'pickups',shape:'snake',window:1,items,routes});intended+=sum(values);
  };
  const grid=()=>{
   const dzs=[-18,-12,-6,0],items=[],blues=[];
   const red3=Math.max(3*k,unit());for(const dz of dzs){const red=Math.floor(rng()*3)-1;blues.push([-1,0,1].filter(x=>x!==red));for(const x of [-1,0,1])items.push({x,dz,window:.4,value:x===red?-red3:k});}
   // Путь: в каждой строке синее, ближайшее к тому, где палец уже стоит.
   const walk=(from,x0)=>{let x=x0;return dzs.slice(from).map((dz,i)=>{if(i>0)x=[...blues[from+i]].sort((a,b)=>Math.abs(a-x)-Math.abs(b-x)||a-b)[0];return {dz,x};});};
   const routes=blues[0].map(x0=>({id:`grid${x0<0?'L':x0>0?'R':'C'}`,entry:{dz:dzs[0]-1,x:x0},exit:walk(0,x0).at(-1).x,gain:dzs.length*k,waypoints:walk(0,x0)}));
   add(stage,{kind:'pickups',shape:'grid',window:1,items,routes});intended+=dzs.length*k;
  };
  const columns=()=>{
   const [good,bad]=COLUMNS[columnsSeen++%COLUMNS.length](unit()),leftGood=rng()<.5,left=leftGood?good:bad,right=leftGood?bad:good,dzs=[-14,-10,-6,-2];
   const items=dzs.flatMap((dz,i)=>[{x:-.5,dz,half:.5,window:.6,value:left[i]},{x:.5,dz,half:.5,window:.6,value:right[i]}]);
   const routes=[['left',-.5,left],['right',.5,right]].map(([id,x,values])=>({id,entry:{dz:-17,x},exit:x,gain:sum(values),waypoints:[{dz:-2,x}]}));
   add(stage,{kind:'pickups',shape:'columns',window:1,items,divider:{fromDz:-17,toDz:0,gap:.25},routes});intended+=Math.max(sum(left),sum(right));
  };
  const ramp=()=>{
   const lane=rng()<.5?-1:1,red=round5(Math.max(8*k,intended/3));
   // Площадка сама зовёт к себе; синие-приманки — в дальнем краю, и после них не успеть на площадку.
   const items=[{x:-lane,dz:-17,window:.6,value:k},{x:-lane,dz:-13,window:.6,value:2*k},{x:-lane,dz:-9,window:.6,value:3*k},{x:0,dz:-5,window:1,half:1.6,value:-red}];
   const routes=[
    {id:'jump',entry:{dz:-15,x:lane},exit:lane,gain:0,waypoints:[{dz:-13,x:lane}]},
    {id:'bait',entry:{dz:-18,x:-lane},exit:-lane,gain:6*k-red,waypoints:[{dz:-17,x:-lane},{dz:-13,x:-lane},{dz:-9,x:-lane}]},
   ];
   add(stage,{kind:'pickups',shape:'ramp',window:1,items,jump:{lane,launchOffset:14,landingOffset:1,height:2.8},routes});
  };
  const operation=options=>{add(stage,{kind:'operation',options:shuffle(options,rng)});intended=Math.max(...options.map(o=>applyOperation(intended,o,1e6)));};
  // Штраф стен — доля числа, которое к этому месту собирают: «−100 или −300» при числе в сотни, а не «−3 или −9».
  const share=(...parts)=>parts.map(p=>Math.max(k,round5(intended*p)));
  const walls=()=>{const n=wallsSeen++;
   if(n%3===0)operation(share(.1,.25,.4).map(v=>`−${v}`));                          // меньший минус, разница видна сразу
   else if(n%3===1)operation(share(.1,.13,.16).map(v=>`−${v}`));                    // меньший минус из близких чисел
   else operation([...share(.15,.3).map(v=>`−${v}`),`+${2*k}`]);                    // среди минусов есть плюс
  };
  const next=()=>{const shape=plan[slot++];
   if(shape==='line'){const [gain,loss]=[[4,2],[4,3],[6,4],[5,3],[2,4],[5,2],[3,2]][slot-1];line(gain*k,loss*k);}
   // ×2 против +N: выгоднее удвоить, только если твоё число больше N. N — около числа эталонного пути.
   else if(shape==='double')operation(['×2',`+${round5(intended*(stage===8?1.15:.85))}`,`−${round5(intended*.2)}`]);
   else ({snake,grid,columns,ramp,walls})[shape]();
  };
  const bridge=(lane)=>add(stage,{kind:'obstacle',terrain:'bridge',span:12,penalties:[-1,0,1].map(l=>l===lane?0:1)});
  const jump=(lane)=>add(stage,{kind:'obstacle',terrain:'jump',span:12,penalties:[1,1,1],jump:{lane,launchOffset:14,landingOffset:1,height:2.8}});
  const chooseLane=()=>Math.floor(rng()*3)-1;
  // First20seconds already contain blue/red pickups, a real bridge, a jump and damage.
  next();bridge(stage===1?-1:chooseLane());
  next();jump(stage===1?0:chooseLane());
  next();
  add(stage,{kind:'obstacle',terrain:'block',span:0,penalties:shuffle([2*k,6*k,0],rng)});
  next();
  add(stage,{kind:'obstacle',terrain:'gap',span:12,penalties:shuffle([1,0,0],rng)});
  next();jump(chooseLane());
  next();bridge(chooseLane());
  next();
  add(stage,{kind:'gate',checkpoint:true,rules:[{min:null,max:null}],stageEnd:true});
  stages.push({id:stage,title:stage===1?'Мост, прыжок и красные числа':`Маршрут ${stage}`,startRow,endRow:rows.length-1,startZ:startRow*24,endZ:rows.at(-1).z,startValue,target:intended});
 }
 const course={version:CAMPAIGN_VERSION,mode:'journey',levelId:0,seed,start:1,speed:8,lateralSpeed:4,length:rows.at(-1).z,rows,gates:STAGE_COUNT,stages};
 const path=solveCourse(course);
 if(!path)throw Error(`No reachable journey: ${seed}`);
 if([-1,0,1].some(lane=>stationaryWins(course,lane)))throw Error(`Stationary journey winner: ${seed}`);
 course.finale=finaleLadder(path.at(-1).sum);
 cache.set(seed,course);if(cache.size>3)cache.delete(cache.keys().next().value);return course;
}
// Финал после черты 12-го этапа: десять стен, верхняя — число эталонного пути решателя.
// Ступень — круглое число не больше десятой доли, поэтому верхнюю стену эталонный путь пробивает всегда.
// Ряд круглых частый: при шаге «1/2/5» эталон 9 844 давал стены до 5 000 — половина пути ломала всё.
export const NICE_STEPS=Object.freeze([8,7.5,6,5,4,3,2.5,2,1.5,1.2,1]);
export function finaleLadder(reference){
 const raw=Math.max(1,reference/LADDER_WALLS),power=10**Math.floor(Math.log10(raw));
 const step=NICE_STEPS.map(m=>m*power).find(v=>v<=raw+1e-9);
 return {reference,walls:Array.from({length:LADDER_WALLS},(_,i)=>Math.round(step*(i+1)))};
}
export const wallsBroken=(finale,value)=>finale.walls.filter(v=>value>=v).length;
