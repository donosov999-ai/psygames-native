// VER 3 · LOCAL 0.4 · 2026-09-12 · Actual bridges, ramps and nonblocking stage lines.
import {applyOperation,solveCourse,stationaryWins} from './runner-levels.mjs';
export const CAMPAIGN_VERSION='number-run-campaign/3',STAGE_COUNT=12;
const cache=new Map();
function random(seed){let a=seed>>>0;return ()=>{a=(a+0x6d2b79f5)>>>0;let t=Math.imul(a^(a>>>15),a|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
function shuffle(a,rng){a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
export function makeCampaign(seed=20260912){
 if(!Number.isInteger(seed)||seed<0||seed>0xffffffff)throw Error('Invalid campaign seed');
 if(cache.has(seed))return cache.get(seed);
 const rng=random(seed),rows=[],stages=[];let intended=1;
 const add=(stage,entry)=>{const row={...entry,id:rows.length,stage,z:24*(rows.length+1)};rows.push(row);return row;};
 for(let stage=1;stage<=STAGE_COUNT;stage++){
  const k=stage+1,startRow=rows.length,startValue=intended;
  const operation=(gain,loss)=>{const values=rows.length===0?Array(5).fill(gain):shuffle([gain,gain,Math.max(1,Math.floor(gain/2)),Math.max(1,Math.floor(gain/2)),-loss],rng);add(stage,{kind:'pickups',window:3,items:values.map((value,i)=>({x:(i-2)/2,value}))});intended+=gain;};
  const bridge=(lane)=>add(stage,{kind:'obstacle',terrain:'bridge',span:12,penalties:[-1,0,1].map(l=>l===lane?0:1)});
  const jump=(lane)=>add(stage,{kind:'obstacle',terrain:'jump',span:12,penalties:[1,1,1],jump:{lane,launchOffset:14,landingOffset:1,height:2.8}});
  const chooseLane=()=>Math.floor(rng()*3)-1;
  // First20seconds already contain blue/red pickups, a real bridge, a jump and damage.
  operation(4*k,2*k);bridge(stage===1?-1:chooseLane());
  operation(4*k,3*k);jump(stage===1?0:chooseLane());
  operation(6*k,4*k);
  add(stage,{kind:'obstacle',terrain:'block',span:0,penalties:shuffle([2*k,6*k,0],rng)});
  operation(5*k,3*k);
  add(stage,{kind:'obstacle',terrain:'gap',span:12,penalties:shuffle([1,0,0],rng)});
  operation(2*k,4*k);jump(chooseLane());
  operation(5*k,2*k);bridge(chooseLane());
  if(stage%4===0){add(stage,{kind:'operation',options:shuffle(['×2',`−${3*k}`,`+${k}`],rng)});intended=applyOperation(intended,'×2');}
  else operation(3*k,2*k);
  add(stage,{kind:'gate',checkpoint:true,rules:[{min:null,max:null}],stageEnd:true});
  stages.push({id:stage,title:stage===1?'Мост, прыжок и красные числа':`Маршрут ${stage}`,startRow,endRow:rows.length-1,startZ:startRow*24,endZ:rows.at(-1).z,startValue,target:intended});
 }
 const course={version:CAMPAIGN_VERSION,mode:'journey',levelId:0,seed,start:1,speed:8,lateralSpeed:4,length:rows.at(-1).z,rows,gates:STAGE_COUNT,stages};
 if(!solveCourse(course))throw Error(`No reachable journey: ${seed}`);
 if([-1,0,1].some(lane=>stationaryWins(course,lane)))throw Error(`Stationary journey winner: ${seed}`);
 cache.set(seed,course);if(cache.size>3)cache.delete(cache.keys().next().value);return course;
}
