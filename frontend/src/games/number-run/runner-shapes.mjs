// VER 1 · 2026-09-16 · psygames-search-claude-mac. Построения дороги — общие для забега (runner-campaign) и уровней (runner-level):
// строй, змейка, сетка, стопки за столбом, трамплин над красным, стены, препятствия, черта. Вынесены из makeCampaign VER 4
// без изменения порядка вызовов генератора: то же зерно даёт ту же дорогу (слепок сверен при выносе, проба в runner-level.test.mjs).
// Станции хаба «Счёт» (блиц-арки, ворота «ровно N») живут здесь же: их ряды строятся теми же руками, что и прочие.
import {applyOperation} from './runner-levels.mjs';
export function random(seed){let a=seed>>>0;return ()=>{a=(a+0x6d2b79f5)>>>0;let t=Math.imul(a^(a>>>15),a|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
export function shuffle(a,rng){a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
export const sum=values=>values.reduce((a,v)=>a+v,0);
export const round5=v=>Math.max(5,Math.round(v/5)*5);
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
// Строки ворот «ровно N»: по одному числу на строку, между строками палец успевает на соседнюю полосу.
const EXACT_LINES=[-18,-13.5,-9,-4.5,0];
export function createTrack(rng){
 const track={rows:[],intended:1,columnsSeen:0,wallsSeen:0};
 const add=(stage,entry)=>{const row={...entry,id:track.rows.length,stage,z:24*(track.rows.length+1)};track.rows.push(row);return row;};
 // Единица стопок и сетки растёт с числом, которое к этому месту собирают: разница столбцов — заметная доля числа, а не пыль.
 const unit=k=>Math.max(k,round5(track.intended/80));
 const operation=(stage,options)=>{add(stage,{kind:'operation',options:shuffle(options,rng)});track.intended=Math.max(...options.map(o=>applyOperation(track.intended,o,1e6)));};
 // Штраф стен — доля числа, которое к этому месту собирают: «−100 или −300» при числе в сотни, а не «−3 или −9».
 const share=(k,...parts)=>parts.map(p=>Math.max(k,round5(track.intended*p)));
 Object.assign(track,{add,
  lane:()=>Math.floor(rng()*3)-1,
  line(stage,k,gain,loss){const values=track.rows.length===0?Array(5).fill(gain):shuffle([gain,gain,Math.max(1,Math.floor(gain/2)),Math.max(1,Math.floor(gain/2)),-loss],rng);add(stage,{kind:'pickups',shape:'line',window:3,items:values.map((value,i)=>({x:(i-2)/2,value}))});track.intended+=gain;},
  snake(stage,k,redCount){
   const dzs=[-18,-15,-12,-9,-6,-3,0],mirror=rng()<.5?-1:1,xs=SNAKES[Math.floor(rng()*SNAKES.length)].map(x=>x*mirror||0);
   const small=Math.max(1,Math.floor(k/2)),values=dzs.map((_,i)=>i<3?small:k);
   const items=dzs.map((dz,i)=>({x:xs[i],dz,window:.6,value:values[i]}));
   // Красные — в той же строке, что синее, но не там, где проходит палец (x соседних строк не занимаем).
   const taken=new Set();
   for(let r=0;r<redCount;r++){
    const lines=shuffle([1,2,3,4,5],rng).filter(i=>!taken.has(i));
    for(const i of lines){const free=LANES5.filter(x=>![xs[i-1],xs[i],xs[i+1]].includes(x));if(!free.length)continue;
     items.push({x:free[Math.floor(rng()*free.length)],dz:dzs[i],window:.6,value:-(2+2*r)*k});taken.add(i);break;}
   }
   // Одна дорога на построение: ряд чисел всегда стоит за препятствием или чертой (−24), до первой строки (−19) палец
   // успевает из любого края. Частичные «вход со второй строки» врали: по пути палец задевал пропущенные числа.
   const routes=[{id:'snake',entry:{dz:dzs[0]-1,x:xs[0]},exit:xs.at(-1),gain:sum(values),waypoints:dzs.map((dz,i)=>({dz,x:xs[i]}))}];
   add(stage,{kind:'pickups',shape:'snake',window:1,items,routes});track.intended+=sum(values);
  },
  grid(stage,k){
   const dzs=[-18,-12,-6,0],items=[],blues=[];
   const red3=Math.max(3*k,unit(k));for(const dz of dzs){const red=Math.floor(rng()*3)-1;blues.push([-1,0,1].filter(x=>x!==red));for(const x of [-1,0,1])items.push({x,dz,window:.4,value:x===red?-red3:k});}
   // Путь: в каждой строке синее, ближайшее к тому, где палец уже стоит.
   const walk=(from,x0)=>{let x=x0;return dzs.slice(from).map((dz,i)=>{if(i>0)x=[...blues[from+i]].sort((a,b)=>Math.abs(a-x)-Math.abs(b-x)||a-b)[0];return {dz,x};});};
   const routes=blues[0].map(x0=>({id:`grid${x0<0?'L':x0>0?'R':'C'}`,entry:{dz:dzs[0]-1,x:x0},exit:walk(0,x0).at(-1).x,gain:dzs.length*k,waypoints:walk(0,x0)}));
   add(stage,{kind:'pickups',shape:'grid',window:1,items,routes});track.intended+=dzs.length*k;
  },
  columns(stage,k){
   const [good,bad]=COLUMNS[track.columnsSeen++%COLUMNS.length](unit(k)),leftGood=rng()<.5,left=leftGood?good:bad,right=leftGood?bad:good,dzs=[-14,-10,-6,-2];
   const items=dzs.flatMap((dz,i)=>[{x:-.5,dz,half:.5,window:.6,value:left[i]},{x:.5,dz,half:.5,window:.6,value:right[i]}]);
   const routes=[['left',-.5,left],['right',.5,right]].map(([id,x,values])=>({id,entry:{dz:-17,x},exit:x,gain:sum(values),waypoints:[{dz:-2,x}]}));
   add(stage,{kind:'pickups',shape:'columns',window:1,items,divider:{fromDz:-17,toDz:0,gap:.25},routes});track.intended+=Math.max(sum(left),sum(right));
  },
  ramp(stage,k){
   const lane=rng()<.5?-1:1,red=round5(Math.max(8*k,track.intended/3));
   // Площадка сама зовёт к себе; синие-приманки — в дальнем краю, и после них не успеть на площадку.
   const items=[{x:-lane,dz:-17,window:.6,value:k},{x:-lane,dz:-13,window:.6,value:2*k},{x:-lane,dz:-9,window:.6,value:3*k},{x:0,dz:-5,window:1,half:1.6,value:-red}];
   const routes=[
    {id:'jump',entry:{dz:-15,x:lane},exit:lane,gain:0,waypoints:[{dz:-13,x:lane}]},
    {id:'bait',entry:{dz:-18,x:-lane},exit:-lane,gain:6*k-red,waypoints:[{dz:-17,x:-lane},{dz:-13,x:-lane},{dz:-9,x:-lane}]},
   ];
   add(stage,{kind:'pickups',shape:'ramp',window:1,items,jump:{lane,launchOffset:14,landingOffset:1,height:2.8},routes});
  },
  walls(stage,k){const n=track.wallsSeen++;
   if(n%3===0)operation(stage,share(k,.1,.25,.4).map(v=>`−${v}`));                  // меньший минус, разница видна сразу
   else if(n%3===1)operation(stage,share(k,.1,.13,.16).map(v=>`−${v}`));            // меньший минус из близких чисел
   else operation(stage,[...share(k,.15,.3).map(v=>`−${v}`),`+${2*k}`]);            // среди минусов есть плюс
  },
  // ×2 против +N: выгоднее удвоить, только если твоё число больше N. N — около числа эталонного пути.
  double(stage,k,factor){operation(stage,['×2',`+${round5(track.intended*factor)}`,`−${round5(track.intended*.2)}`]);},
  bridge:(stage,lane)=>add(stage,{kind:'obstacle',terrain:'bridge',span:12,penalties:[-1,0,1].map(l=>l===lane?0:1)}),
  jump:(stage,lane)=>add(stage,{kind:'obstacle',terrain:'jump',span:12,penalties:[1,1,1],jump:{lane,launchOffset:14,landingOffset:1,height:2.8}}),
  block:(stage,k)=>add(stage,{kind:'obstacle',terrain:'block',span:0,penalties:shuffle([2*k,6*k,0],rng)}),
  gap:stage=>add(stage,{kind:'obstacle',terrain:'gap',span:12,penalties:shuffle([1,0,0],rng)}),
  stageLine:stage=>add(stage,{kind:'gate',checkpoint:true,rules:[{min:null,max:null}],stageEnd:true}),
  // ── Станции хаба «Счёт» ──────────────────────────────────────────────────────────────────────────────
  // Блиц-арки (math-sprint): пример над дорогой, три арки с ответами; въехал в верную — прибавка, в неверную — столько же минус.
  blitz(stage,k,problem){
   const answer=problem.answer,near=[1,-1,2,-2,10,-10].map(d=>answer+d).filter(v=>v!==answer&&(answer<0||v>=0));
   const wrong=shuffle(near,rng).slice(0,2),options=shuffle([answer,...wrong],rng),reward=Math.max(2*k,round5(track.intended*.1));
   add(stage,{kind:'answer',station:'blitz',prompt:problem.display,options,correct:options.indexOf(answer),reward,penalty:reward});
   track.intended+=reward;
  },
  // Ряд на арках («Паттерны»): члены ряда на табло, три продолжения на арках; варианты — генератор самой игры.
  pattern(stage,k,seq){
   const options=seq.options.slice(0,3),reward=Math.max(2*k,round5(track.intended*.1));
   add(stage,{kind:'answer',station:'pattern',prompt:`${seq.items.join(' · ')} · ?`,options,correct:options.indexOf(seq.answer),reward,penalty:reward});
   track.intended+=reward;
  },
  // Шкала («Мат. шкала»): поперёк дороги числовая прямая [min, max], над ней выражение; проехать там, где ответ.
  scale(stage,k,question){
   const reward=Math.max(3*k,round5(track.intended*.12)),x=(question.answer-question.min)/(question.max-question.min)*2-1;
   add(stage,{kind:'scale',station:'scale',prompt:question.prompt,min:question.min,max:question.max,answer:question.answer,ticks:question.ticks,tolerance:.1,reward,penalty:reward,
    routes:[{id:'scale',entry:{dz:-8,x},exit:x,gain:reward,waypoints:[{dz:0,x}]}]});
   track.intended+=reward;
  },
  // Ворота «ровно N» (number-bonds): числа-части лежат по строкам, собрать ровно N. Путь строится первым: полоса на строку,
  // соседние строки — не дальше соседней полосы; числа решения — на пути, лишние — только вне пути. Пустая полоса пути
  // пропускает строку. Верно — прибавка; мимо — минус, пропорциональный промаху.
  exact(stage,k,puzzle){
   const solution=subsetFor(puzzle.target,puzzle.chips);if(!solution)throw Error(`Exact puzzle without a solution: ${puzzle.target}`);
   const path=[Math.floor(rng()*3)-1];for(let i=1;i<EXACT_LINES.length;i++){const options=[-1,0,1].filter(l=>Math.abs(l-path[i-1])<=1);path.push(options[Math.floor(rng()*options.length)]);}
   const lines=shuffle(EXACT_LINES.map((_,i)=>i),rng).slice(0,solution.length).sort((a,b)=>a-b),items=[];
   const rest=[...puzzle.chips];for(const v of solution)rest.splice(rest.indexOf(v),1);
   solution.forEach((value,i)=>items.push({x:path[lines[i]],dz:EXACT_LINES[lines[i]],window:.4,value,part:true}));
   const free=shuffle(EXACT_LINES.flatMap((dz,i)=>[-1,0,1].filter(l=>l!==path[i]).map(x=>({x,dz}))),rng);
   rest.slice(0,free.length).forEach((value,i)=>items.push({...free[i],window:.4,value,part:true}));
   const bonus=Math.max(3*k,round5(track.intended*.15));
   const routes=[{id:'exact',entry:{dz:EXACT_LINES[0]-1,x:path[0]},exit:path.at(-1),gain:bonus,waypoints:EXACT_LINES.map((dz,i)=>({dz,x:path[i]}))}];
   add(stage,{kind:'pickups',shape:'exact',station:'exact',window:1,items,exact:{target:puzzle.target,bonus,unit:k},routes});track.intended+=bonus;
  },
 });
 return track;
}
// Первое найденное подмножество чисел с суммой цели — не длиннее числа строк ворот. Пул до 12 чисел: перебор мгновенный.
export function subsetFor(target,chips){
 const n=chips.length;let best=null;
 for(let mask=1;mask<1<<n;mask++){let s=0,c=0;for(let i=0;i<n;i++)if(mask&1<<i){s+=chips[i];c++;}
  if(s===target&&c<=EXACT_LINES.length&&(!best||c<best.length))best=chips.filter((_,i)=>mask&1<<i);}
 return best;
}
