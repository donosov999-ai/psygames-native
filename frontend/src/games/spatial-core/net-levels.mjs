/* psygames-spatial-core-net-levels · VER 1 · 09.09.2026 */
/* LOCAL REV spatial-lab/2026-09-09.2 · psygames-codex-mac · not an app release */
import {netPuzzle,maskAt} from './net.mjs';
import {apply,rng} from './core.mjs';
import {solveNetwork} from './net-solver.mjs';

// Opening tutorial tasks; higher steps use the explicit catalog below.
export const NET_OPENING_LEVELS=[
  {level:1,width:3,repair:'single',highlight:true,lockCorrect:true,change:'Повернуть одну выделенную трубу; остальные закреплены.'},
  {level:2,width:3,repair:'single',highlight:false,lockCorrect:false,change:'Самому найти единственную ошибку без выделения и закрепления.'},
  {level:3,width:3,repair:'adjacent',highlight:false,lockCorrect:false,change:'Исправить две соседние трубы, соединённые друг с другом.'},
  {level:4,width:3,repair:'junction',highlight:false,lockCorrect:false,change:'Исправить Т-развилку и три соседних участка.'},
  {level:5,width:3,repair:'all',highlight:false,lockCorrect:false,change:'Восстановить ориентацию всех поворачиваемых труб поля.'},
];
// [width, connected repair size, cycles, minimum repaired junctions, live colour]
// Each row is a separate specification, not a five-level range with aliases.
const advanced=[
  [4,6,0,1,1],[4,7,0,1,1],[4,8,0,1,1],[4,9,0,1,1],[4,10,0,2,1],
  [4,11,0,2,1],[4,12,0,2,1],[4,13,0,2,1],[4,14,0,2,1],[4,16,0,2,1],
  [5,16,0,2,1],[5,17,0,2,1],[5,18,0,2,1],[5,19,0,2,1],[5,20,0,3,1],
  [5,21,0,3,1],[5,22,0,3,1],[5,23,0,3,1],[5,24,0,3,1],[5,25,0,3,1],
  [5,25,0,3,0],[5,23,1,3,0],[5,24,1,3,0],[5,23,2,4,0],[5,24,2,4,0],
  [6,24,0,4,0],[6,25,0,4,0],[6,26,0,4,0],[6,27,0,4,0],[6,28,0,4,0],
  [6,29,0,4,0],[6,30,0,4,0],[6,31,0,4,0],[6,32,0,4,0],[6,33,0,4,0],
  [6,30,1,5,0],[6,31,1,5,0],[6,32,1,5,0],[6,30,2,5,0],[6,31,2,5,0],
  [6,30,3,5,0],[6,31,3,5,0],[6,30,4,5,0],[6,31,4,5,0],[6,31,4,6,0],
];
export const NET_LEVELS=[...NET_OPENING_LEVELS.map(s=>({...s,liveColour:true})),...advanced.map(([width,affected,cycles,junctions,liveColour],i)=>({
  level:i+6,width,affected,cycles,junctions,liveColour:!!liveColour,repair:'connected',highlight:false,lockCorrect:false,
  change:`${width}×${width}: связанный участок из ${affected} труб, развилок не меньше ${junctions}, циклов ${cycles}; ${liveColour?'с подсветкой связности':'без подсветки связности'}.`,
}))];
const neighbors=(b,i)=>[[-b.width,1],[1,2],[b.width,4],[-1,8]].filter(([,bit])=>maskAt(b.cells[i])&bit).map(([offset])=>i+offset);
const degree=m=>[1,2,4,8].filter(bit=>m&bit).length;
export function openingNetLevel(level,seed){
  const spec=NET_OPENING_LEVELS[level-1];if(!Number.isInteger(level)||!spec)throw new RangeError('opening level 1..5');
  const random=rng(seed);
  for(let attempt=0;attempt<100;attempt++){
    const {target}=netPuzzle((seed+attempt)>>>0,{width:spec.width});
    const movable=target.cells.map((c,i)=>degree(c.mask)!==4?i:-1).filter(i=>i>=0);
    let changed;
    if(spec.repair==='single')changed=[movable[Math.floor(random()*movable.length)]];
    else if(spec.repair==='adjacent'){
      const a=movable.find(i=>neighbors(target,i).some(j=>movable.includes(j)));
      changed=[a,neighbors(target,a).find(j=>movable.includes(j))];
    }else if(spec.repair==='junction'){
      const center=movable.find(i=>degree(target.cells[i].mask)===3&&neighbors(target,i).every(j=>movable.includes(j)));
      if(center===undefined)continue;
      changed=[center,...neighbors(target,center)];
    }else changed=movable;
    let initial=target;const solution=[];
    for(const index of changed){const amount=random()<.5?1:-1;initial=apply(initial,{kind:'tile',index,amount});solution.push({kind:'tile',index,amount:-amount});}
    const locked=spec.lockCorrect?movable.filter(i=>!changed.includes(i)):[];
    const verified=solveNetwork(initial,{locked});
    if(!verified.unique)continue;
    return {level,seed,spec,initial,target,solution,locked,highlighted:spec.highlight?changed:[],metrics:verified.metrics};
  }
  throw new Error('No verified opening task within bounded generation attempts');
}

export function netLevel(level,seed){
  if(!Number.isInteger(level)||level<1||level>50)throw new RangeError('Net level 1..50');
  if(level<=5){const result=openingNetLevel(level,seed);return {...result,spec:NET_LEVELS[level-1]};}
  const spec=NET_LEVELS[level-1],random=rng(seed);
  for(let attempt=0;attempt<2000;attempt++){
    const {target}=netPuzzle((seed+attempt)>>>0,{width:spec.width,cycles:spec.cycles});
    const movable=target.cells.map((c,i)=>degree(c.mask)!==4?i:-1).filter(i=>i>=0);
    if(movable.length<spec.affected)continue;
    // Repair locations form one connected subgraph of actual target pipes.
    const first=movable[Math.floor(random()*movable.length)],chosen=new Set([first]),queue=[first];
    for(let h=0;h<queue.length&&chosen.size<spec.affected;h++)for(const j of neighbors(target,queue[h])){
      if(chosen.size===spec.affected)break;
      if(!chosen.has(j)&&movable.includes(j)){chosen.add(j);queue.push(j);}
    }
    if(chosen.size!==spec.affected||[...chosen].filter(i=>degree(target.cells[i].mask)===3).length<spec.junctions)continue;
    const proof=solveNetwork(target,{nodeBudget:20000});
    if(!proof.unique)continue;
    let initial=target;const solution=[];
    for(const index of chosen){const amount=random()<.5?1:-1;initial=apply(initial,{kind:'tile',index,amount});solution.push({kind:'tile',index,amount:-amount});}
    return {level,seed,spec,initial,target,solution,locked:[],highlighted:[],metrics:{...proof.metrics,attempts:attempt+1,affected:chosen.size,cycles:spec.cycles}};
  }
  throw new Error(`Net ${level}: no verified task within generation budget`);
}
