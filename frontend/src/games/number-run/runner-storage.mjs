// VER 3 · LOCAL 0.4 · 2026-09-12 · Flight checkpoint, preserve older training results.
import {LEVELS,makeCourse,applyOperation} from './runner-levels.mjs';
import {makeCampaign} from './runner-campaign.mjs';
import {CORE_VERSION,replay} from './runner-core.mjs';
export const STORAGE_KEY='psygames:number-run:local-v3', LEGACY_KEY='psygames:number-run:local-v2';
export const emptyProgress=()=>({version:3,mode:'journey',bestNumber:1,bestStage:0,journeys:0,completed:[],selected:1,seed:20260912,checkpoint:null});
function validJourneyJournal(course,s){
 let sum=course.start,peak=sum,hits=0,index=0,items=[];
 for(const e of s.events){if(['pause','resume','jump'].includes(e.type))continue;
  const r=course.rows[index];if(!r||e.id!==index)return false;
  if(e.type==='pickup'){
   const item=r.items?.[e.item];if(!item||items.includes(e.item)||item.value!==e.value||e.before!==sum)return false;
   sum+=item.value;items.push(e.item);if(e.after!==sum)return false;peak=Math.max(peak,sum);continue;
  }
  if(e.type!==r.kind)return false;
  if(r.kind==='pickups'){if(JSON.stringify(e.items)!==JSON.stringify(items)||e.sum!==sum)return false;items=[];}
  else if(r.kind==='operation'){if(e.before!==sum||e.operation!==r.options[e.lane+1])return false;sum=applyOperation(sum,e.operation,1e6);if(e.after!==sum)return false;}
  else if(r.kind==='obstacle'){const damage=r.span?0:r.penalties[e.lane+1];if(e.fall||e.damage!==damage||e.before!==sum)return false;sum-=damage;if(e.after!==sum)return false;if(damage)hits++;}
  else if(e.sum!==sum||!e.ok)return false;
  peak=Math.max(peak,sum);index++;
 }
 return index===s.nextRow&&sum===s.sum&&peak===s.peak&&hits===s.hits&&JSON.stringify(items)===JSON.stringify(s.collected);
}
export function decodeProgress(raw){
 try{
  if(typeof raw!=='string'||raw.length>600000)return emptyProgress();const p=JSON.parse(raw);
  if(![2,3].includes(p.version))return emptyProgress();
  const validLevel=n=>Number.isInteger(n)&&n>=1&&n<=LEVELS.length;
  const result={...emptyProgress(),completed:[...new Set((Array.isArray(p.completed)?p.completed:[]).filter(validLevel))],selected:validLevel(p.selected)?p.selected:1,seed:Number.isInteger(p.seed)&&p.seed>=0&&p.seed<=0xffffffff?p.seed:20260912};
  if(p.version===2)return result; // Old sums/rules must not become a new journey checkpoint.
  result.mode=p.mode==='training'?'training':'journey';
  for(const [key,max] of [['bestNumber',1000000],['bestStage',12],['journeys',1000000]])if(Number.isInteger(p[key])&&p[key]>=0&&p[key]<=max)result[key]=p[key];
  const s=p.checkpoint;
  if(!s||s.version!==CORE_VERSION||!['journey','training'].includes(s.mode)||!['running','paused'].includes(s.status))return result;
  if(s.mode==='journey'?s.levelId!==0:!validLevel(s.levelId))return result;
  const course=s.mode==='journey'?makeCampaign(s.seed):makeCourse(s.levelId,s.seed);
  if(!Number.isInteger(s.nextRow)||s.nextRow<0||s.nextRow>=course.rows.length)return result;
  if(![s.z,s.x,s.target,s.elapsed,s.sum,s.gates,s.slowFrames,s.discardedTime,s.pauses].every(Number.isFinite))return result;
  if(Math.abs(s.x)>1||Math.abs(s.target)>1||s.z<0||s.z>=course.rows[s.nextRow].z+(course.rows[s.nextRow].window??0)||s.z<(course.rows[s.nextRow-1]?.z??0)-1e-8)return result;
  if(Math.abs(s.elapsed-s.z/course.speed)>.01||s.failure!==null)return result;
  if(!Array.isArray(s.events)||s.events.length>3000||!Array.isArray(s.collected))return result;
  const events=s.events.filter(e=>['operation','gate','obstacle','pickups'].includes(e.type));
  if(events.length!==s.nextRow||events.some((e,i)=>e.id!==i))return result;
  if(s.mode==='journey'){if(!validJourneyJournal(course,s))return result;}
  else{const r=replay(course,events.map(e=>e.lane));if(r.failedAt!==null||r.sum!==s.sum)return result;}
  if(s.gates!==course.rows.slice(0,s.nextRow).filter(r=>r.kind==='gate').length)return result;
  const previousRows=course.rows.slice(0,s.nextRow);
  if(s.stage!==(course.rows[s.nextRow].stage??course.levelId)||s.clearedStages!==previousRows.filter(r=>r.stageEnd).length)return result;
  const jumps=s.events.filter(e=>e.type==='jump');
  if(jumps.some(e=>{const row=course.rows[e.id];return !row?.jump||e.lane!==row.jump.lane||e.z!==row.z-row.jump.launchOffset||e.z>s.z;}))return result;
  if(new Set(jumps.map(e=>e.id)).size!==jumps.length)return result;
  if(previousRows.some(row=>row.jump&&!jumps.some(e=>e.id===row.id)))return result;
  const lastJump=jumps.at(-1),jr=lastJump&&course.rows[lastJump.id];
  const expectedJump=jr&&s.z<jr.z+jr.jump.landingOffset?{id:jr.id,startZ:jr.z-jr.jump.launchOffset,endZ:jr.z+jr.jump.landingOffset,height:jr.jump.height}:null;
  if(JSON.stringify(s.jump)!==JSON.stringify(expectedJump))return result;
  if(s.mode!=='journey'){const sums=events.flatMap(e=>e.type==='gate'?[e.sum]:[e.before,e.after]);
   if(!sums.every(Number.isFinite)||s.peak!==Math.max(course.start,...sums)||s.hits!==events.filter(e=>e.type==='obstacle'&&e.damage>0).length)return result;}
  result.checkpoint={...s,status:'paused'};result.mode=s.mode;if(s.mode==='training')result.selected=s.levelId;result.seed=s.seed;return result;
 }catch{return emptyProgress();}
}
