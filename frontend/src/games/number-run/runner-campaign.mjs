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
// 16.09: сами построения вынесены в runner-shapes.mjs (их делят забег и уровни); дорога та же — слепок 7 зёрен совпал.
// VER 3 · LOCAL 0.4 · 2026-09-12 · Actual bridges, ramps and nonblocking stage lines.
import {solveCourse,stationaryWins} from './runner-levels.mjs';
import {random,createTrack} from './runner-shapes.mjs';
export const CAMPAIGN_VERSION='number-run-campaign/4',STAGE_COUNT=12,LADDER_WALLS=10;
const cache=new Map();
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
// Прибавка и потеря строя по месту ряда в этапе (как в VER 3 автора), в долях k.
const LINE_GAINS=[[4,2],[4,3],[6,4],[5,3],[2,4],[5,2],[3,2]];
export function makeCampaign(seed=20260912){
 if(!Number.isInteger(seed)||seed<0||seed>0xffffffff)throw Error('Invalid campaign seed');
 if(cache.has(seed))return cache.get(seed);
 const track=createTrack(random(seed)),stages=[];
 for(let stage=1;stage<=STAGE_COUNT;stage++){
  const k=stage+1,startRow=track.rows.length,startValue=track.intended,plan=PLAN[stage-1];let slot=0;
  const next=()=>{const shape=plan[slot++];
   if(shape==='line'){const [gain,loss]=LINE_GAINS[slot-1];track.line(stage,k,gain*k,loss*k);}
   else if(shape==='double')track.double(stage,k,stage===8?1.15:.85);
   else if(shape==='snake')track.snake(stage,k,stage===1?0:stage<6?1:2);
   else track[shape](stage,k);
  };
  // First20seconds already contain blue/red pickups, a real bridge, a jump and damage.
  next();track.bridge(stage,stage===1?-1:track.lane());
  next();track.jump(stage,stage===1?0:track.lane());
  next();track.block(stage,k);
  next();track.gap(stage);
  next();track.jump(stage,track.lane());
  next();track.bridge(stage,track.lane());
  next();track.stageLine(stage);
  stages.push({id:stage,title:stage===1?'Мост, прыжок и красные числа':`Маршрут ${stage}`,startRow,endRow:track.rows.length-1,startZ:startRow*24,endZ:track.rows.at(-1).z,startValue,target:track.intended});
 }
 const rows=track.rows,course={version:CAMPAIGN_VERSION,mode:'journey',levelId:0,seed,start:1,speed:8,lateralSpeed:4,length:rows.at(-1).z,rows,gates:STAGE_COUNT,stages};
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
