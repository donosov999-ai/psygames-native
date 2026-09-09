/* psygames-spatial-core-twiddle-levels · VER 1 · 09.09.2026 */
/* LOCAL REV spatial-lab/2026-09-09.2 · psygames-codex-mac · not an app release */
import {board,rng,apply,inverse} from './core.mjs';
import {twiddleDistances,TWIDDLE_3_MOVES} from './twiddle-solver.mjs';
import {TWIDDLE_BANK} from './twiddle-bank.mjs';
export const TWIDDLE_OPENING_LEVELS=[
  {level:1,width:3,distance:1,guide:true,distinctBlocks:1,change:'Один поворот указанного блока; направление показано.'},
  {level:2,width:3,distance:1,guide:false,distinctBlocks:1,change:'Самостоятельно найти блок и направление поворота.'},
  {level:3,width:3,distance:2,guide:false,distinctBlocks:1,change:'Два четверть-поворота одного блока: увидеть разворот на 180°.'},
  {level:4,width:3,distance:2,guide:false,distinctBlocks:2,change:'Два поворота разных пересекающихся блоков.'},
  {level:5,width:3,distance:3,guide:false,distinctBlocks:2,change:'Цепочка минимум из трёх ходов с взаимодействием блоков.'},
];
let table;
export function openingTwiddleLevel(level,seed){
  const spec=TWIDDLE_OPENING_LEVELS[level-1];if(!Number.isInteger(level)||!spec)throw new RangeError('opening level 1..5');
  const random=rng(seed);table??=twiddleDistances({maxDepth:3});
  const candidates=[];
  for(const [key,entry] of table.entries){
    if(entry.distance!==spec.distance)continue;
    const solution=table.solution(key),distinct=new Set(solution.map(c=>`${c.row},${c.col}`)).size;
    if(level===3?distinct!==1:distinct<spec.distinctBlocks)continue;
    candidates.push({key,solution});
  }
  const chosen=candidates[Math.floor(random()*candidates.length)];
  if(!chosen)throw new Error('No exact-distance task for this specification');
  const initial=board(3);initial.cells=Array.from(chosen.key,ch=>({id:Number(ch),turns:0}));
  return {level,seed,spec,initial,solution:chosen.solution,minimumMoves:spec.distance,guide:spec.guide?chosen.solution[0]:null};
}

export const TWIDDLE_LEVELS=[
  ...TWIDDLE_OPENING_LEVELS.map(s=>({...s,liveColour:true})),
  ...Array.from({length:8},(_,i)=>({level:i+6,width:3,distance:i+4,guide:false,liveColour:true,change:`Минимум ${i+4} четверть-поворотов на поле 3×3; точная дистанция.`})),
  {level:14,width:3,distance:11,guide:false,liveColour:false,change:'Точные 11 ходов без цветового выделения чисел на своих местах.'},
  ...Array.from({length:36},(_,i)=>{
    const width=i<10?4:5,displacement=i<10?42+i*2:62+(i-10)*2;
    return {level:i+15,width,displacement,guide:false,liveColour:false,change:`Поле ${width}×${width}; суммарное смещение ${displacement} клеток, нижняя оценка ${Math.ceil(displacement/4)} ходов. Без цветовой помощи.`};
  }),
];

/** Each legal 2x2 quarter turn moves four tiles by one grid edge, so it can
 * reduce the total Manhattan displacement by at most four. This is a lower
 * bound, NOT an exact solution distance and NOT the scramble length.
 */
export function twiddleDisplacement(b){
  return b.cells.reduce((sum,c,i)=>sum+Math.abs(i%b.width-c.id%b.width)+Math.abs(Math.floor(i/b.width)-Math.floor(c.id/b.width)),0);
}
export function twiddleLevel(level,seed){
  const spec=TWIDDLE_LEVELS[level-1];
  if(!Number.isInteger(level)||!spec)throw new RangeError('Twiddle level 1..50');
  if(level<=5)return {...openingTwiddleLevel(level,seed),spec};
  const random=rng(seed);
  if(spec.width===3){
    const candidates=TWIDDLE_BANK.filter(t=>t.distance===spec.distance),chosen=candidates[Math.floor(random()*candidates.length)];
    const initial=board(3);initial.cells=Array.from(chosen.key,ch=>({id:Number(ch),turns:0}));
    return {level,seed,spec,initial,solution:chosen.solution.map(i=>({...TWIDDLE_3_MOVES[i]})),minimumMoves:spec.distance,guide:null};
  }
  // Bounded seeded walk. Acceptance uses board displacement, never walk length.
  // Loop erasure keeps the supplied recovery route finite and removes cycling.
  let initial=board(spec.width),route=[],keys=[initial.cells.map(c=>c.id).join(',')];
  for(let step=0;step<20000;step++){
    if(step%1000===0){initial=board(spec.width);route=[];keys=[initial.cells.map(c=>c.id).join(',')];}
    const cmd={kind:'block',row:Math.floor(random()*(spec.width-1)),col:Math.floor(random()*(spec.width-1)),size:2,amount:random()<.5?-1:1};
    if(route.length){const last=route.at(-1);if(last.row===cmd.row&&last.col===cmd.col&&last.amount===-cmd.amount)continue;}
    const candidate=apply(initial,cmd);
    if(Math.abs(twiddleDisplacement(candidate)-spec.displacement)>Math.abs(twiddleDisplacement(initial)-spec.displacement)&&random()>.08)continue;
    initial=candidate;
    const key=initial.cells.map(c=>c.id).join(','),seen=keys.indexOf(key);
    if(seen>=0){route=route.slice(0,seen);keys=keys.slice(0,seen+1);}
    else{route.push(cmd);keys.push(key);}
    if(twiddleDisplacement(initial)===spec.displacement)return {level,seed,spec,initial,solution:route.toReversed().map(inverse),minimumMoves:null,lowerBound:Math.ceil(spec.displacement/4),guide:null};
  }
  throw new Error(`Twiddle ${level}: bounded generation exhausted`);
}
