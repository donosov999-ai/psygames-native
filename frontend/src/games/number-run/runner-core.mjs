// VER 5 · Number Run local 0.4 · 2026-09-12. Flight over actual void, no jitter pause in journey.
import {makeCourse,applyOperation,meets,ruleDifference} from './runner-levels.mjs';
export const CORE_VERSION='number-run-core/5', FIXED_DT=1/120;
export function jumpHeight(s){if(!s.jump)return 0;const u=(s.z-s.jump.startZ)/(s.jump.endZ-s.jump.startZ);return u<=0||u>=1?0:4*s.jump.height*u*(1-u);}
// Visual size follows the current positive value; hitboxes stay one lane wide.
export const numberScale=value=>1+Math.min(1.6,Math.log2(1+Math.max(0,value))/7);
export function initial(course=makeCourse()){
 return {version:CORE_VERSION,mode:course.mode??'training',levelId:course.levelId,seed:course.seed,stage:course.stages?.[0]?.id??course.levelId,clearedStages:0,peak:course.start,hits:0,jump:null,collected:[],z:0,x:0,target:0,sum:course.start,gates:0,status:'ready',nextRow:0,elapsed:0,events:[],failure:null,slowFrames:0,discardedTime:0,pauses:0};
}
export function setTarget(s,x){if(!Number.isFinite(x))throw Error('Invalid target');return s.status==='running'?{...s,target:Math.max(-1,Math.min(1,x))}:s;}
export function changeLane(s,delta){return setTarget(s,Math.round(s.target)+delta);}
export function pause(s,reason='manual'){return s.status!=='running'?s:{...s,status:'paused',pauses:s.pauses+1,events:[...s.events,{type:'pause',reason,t:s.elapsed,z:s.z}]};}
export function resume(s){return ['ready','paused'].includes(s.status)?{...s,status:'running',events:[...s.events,{type:'resume',t:s.elapsed,z:s.z}]}:s;}
export function step(s,dt,course){
 if(!Number.isFinite(dt)||dt<0||dt>.1+1e-10)throw Error('dt outside simulation contract');
 if(s.status!=='running'||dt===0)return s;
 if(course.levelId!==s.levelId||course.seed!==s.seed)throw Error('Wrong course');
 const xAt=t=>s.x+Math.sign(s.target-s.x)*Math.min(Math.abs(s.target-s.x),t*course.lateralSpeed),endZ=s.z+dt*course.speed;
 const next={...s,z:endZ,x:xAt(dt),elapsed:s.elapsed+dt,events:[...s.events]};
 const terrain=course.rows[s.nextRow];
 if(terrain?.kind==='pickups'){
  const ta=Math.max(0,(terrain.z-terrain.window-s.z)/course.speed),tb=Math.min(dt,(terrain.z+terrain.window-s.z)/course.speed);
  if(ta<=tb){const xa=xAt(ta),xb=xAt(tb),velocity=Math.sign(s.target-s.x)*course.lateralSpeed,hits=[];
   terrain.items.forEach((item,index)=>{if(s.collected.includes(index))return;const lo=item.x-.18,hi=item.x+.18;
    if(Math.max(xa,xb)<lo||Math.min(xa,xb)>hi)return;
    const t=xa>=lo&&xa<=hi?ta:velocity===0?null:((velocity>0?lo:hi)-s.x)/velocity;
    if(t!==null&&t>=ta-1e-9&&t<=tb+1e-9)hits.push({t:Math.max(ta,t),index,item});
   });
   next.collected=[...s.collected];for(const hit of hits.sort((a,b)=>a.t-b.t||a.index-b.index)){
    const before=next.sum;next.sum+=hit.item.value;next.peak=Math.max(next.peak,next.sum);next.collected.push(hit.index);
    next.events.push({type:'pickup',id:terrain.id,item:hit.index,value:hit.item.value,before,after:next.sum,t:s.elapsed+hit.t,z:s.z+hit.t*course.speed});
   }
  }
 }
 if(next.jump&&endZ>=next.jump.endZ)next.jump=null;
 if(terrain?.jump){const launchZ=terrain.z-terrain.jump.launchOffset;
  if(s.z<launchZ&&endZ>=launchZ){const t=(launchZ-s.z)/course.speed,x=xAt(t);
   if(Math.abs(x-terrain.jump.lane)<.48){next.jump={id:terrain.id,startZ:launchZ,endZ:terrain.z+terrain.jump.landingOffset,height:terrain.jump.height};next.events.push({type:'jump',id:terrain.id,lane:terrain.jump.lane,z:launchZ,t:s.elapsed+t});}
  }
 }
 const airborne=next.jump&&next.jump.id===terrain?.id;
 if(terrain?.kind==='obstacle'&&terrain.span&&!airborne&&endZ>=terrain.z-terrain.span&&s.z<terrain.z){
  const ta=Math.max(0,(terrain.z-terrain.span-s.z)/course.speed),tb=Math.min(dt,(terrain.z-s.z)/course.speed);
  const xa=xAt(ta),xb=xAt(tb),velocity=Math.sign(s.target-s.x)*course.lateralSpeed;
  let impact=null;
  terrain.penalties.forEach((danger,i)=>{if(!danger)return;const lane=i-1,lo=lane-.5,hi=lane+.5;
   if(Math.max(xa,xb)<lo||Math.min(xa,xb)>hi)return;
   const t=xa>=lo&&xa<=hi?ta:velocity===0?null:((velocity>0?lo:hi)-s.x)/velocity;
   if(t!==null&&t>=ta-1e-9&&t<=tb+1e-9&&(impact===null||t<impact))impact=Math.max(ta,t);
  });
  if(impact!==null){
   const z=s.z+impact*course.speed,x=xAt(impact);return {...next,z,x,elapsed:s.elapsed+impact,status:'failed',hits:s.hits+1,nextRow:s.nextRow+1,failure:{kind:'fall',terrain:terrain.terrain},events:[...s.events,{type:'obstacle',id:terrain.id,lane:Math.round(x),damage:0,fall:true,before:s.sum,after:s.sum,z,t:s.elapsed+impact}]};
  }
 }
 while(next.nextRow<course.rows.length&&course.rows[next.nextRow].z+(course.rows[next.nextRow].window??0)<=endZ+1e-9){
  const row=course.rows[next.nextRow],eventZ=row.z+(row.window??0),t=Math.max(0,(eventZ-s.z)/course.speed),x=xAt(t),lane=Math.max(-1,Math.min(1,Math.round(x))),before=next.sum;
  // Every full-width lane is an option; → explicitly skips. No collision gap.
  if(row.kind==='pickups'){
   next.events.push({type:'pickups',id:row.id,lane,items:next.collected,sum:next.sum,t:s.elapsed+t,z:eventZ});next.collected=[];
  }else if(row.kind==='operation'){
   const operation=row.options[lane+1];next.sum=applyOperation(before,operation,course.mode==='journey'?1e6:9999);
   next.events.push({type:'operation',id:row.id,lane,operation,before,after:next.sum,t:s.elapsed+t,z:row.z});
  }else if(row.kind==='obstacle'){
   const damage=row.span?0:row.penalties[lane+1];next.sum-=damage;if(damage)next.hits++;
   next.events.push({type:'obstacle',id:row.id,lane,damage,jumped:!!row.jump,before,after:next.sum,t:s.elapsed+t,z:row.z});
  }else{
   const rule=row.rules.length===1?row.rules[0]:row.rules[lane+1],ok=meets(next.sum,rule);
   next.events.push({type:'gate',id:row.id,lane,sum:next.sum,rule,ok,t:s.elapsed+t,z:row.z});
   if(!ok){next.status='failed';next.failure={rule,sum:next.sum,...ruleDifference(next.sum,rule)};}
   else{next.gates++;if(row.stageEnd)next.clearedStages++;if(next.gates===course.gates)next.status='won';}
  }
  next.nextRow++;
  next.peak=Math.max(next.peak,next.sum);
  if(course.stages)next.stage=course.rows[next.nextRow]?.stage??course.stages.length;
  if(next.status!=='running'){next.z=row.z;next.x=x;next.elapsed=s.elapsed+t;break;}
 }return next;
}
// 100ms jitter no longer pauses a run. At most250ms catch-up, split into120Hz
// substeps; >800ms interruption pauses. Dropped time is logged, not hidden.
export function advanceFrame(s,dt,course){
 if(!Number.isFinite(dt)||dt<0)throw Error('Invalid frame interval');if(s.status!=='running')return s;
 if(dt>.8){if(course.mode!=='journey')return pause(s,'interruption');return {...s,slowFrames:s.slowFrames+1,discardedTime:s.discardedTime+dt};}
 let next={...s,slowFrames:s.slowFrames+(dt>.1?1:0),discardedTime:s.discardedTime+Math.max(0,dt-.25)},remaining=Math.min(dt,.25);
 while(remaining>1e-10&&next.status==='running'){const part=Math.min(remaining,FIXED_DT);next=step(next,part,course);remaining-=part;}return next;
}
export function replay(course,lanes){let sum=course.start;for(let i=0;i<lanes.length;i++){
 if(!course.rows[i]||![-1,-.5,0,.5,1].includes(lanes[i]))throw Error('Invalid replay');const row=course.rows[i],lane=lanes[i];
 if(row.kind==='pickups')sum+=row.items.find(item=>item.x===lane)?.value??0;
 else if(row.kind==='operation')sum=applyOperation(sum,row.options[lane+1],course.mode==='journey'?1e6:9999);else if(row.kind==='obstacle'){if(!row.jump){if(row.span&&row.penalties[lane+1])return {sum,failedAt:i};sum-=row.penalties[lane+1];}}else if(!meets(sum,row.rules.length===1?row.rules[0]:row.rules[lane+1]))return {sum,failedAt:i};
 }return {sum,failedAt:null};}
