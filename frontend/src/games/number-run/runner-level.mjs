// VER 1 · 2026-09-16 · psygames-search-claude-mac. Режим уровней «Числового забега» по схеме
// ~/dev/psygames/counting-chat/SPEC_RUNNER_HUB_STATIONS.md (Денис 16.09: «соединить все упражнения хаба по счёту»).
// Уровень ≈ 90 с: 15 рядов содержимого между 14 препятствиями и черта финиша. Финал — лестница 10 стен (пройден при ≥ 5)
// или «Страж» на уровне-боссе (пройден, если число не меньше стража). Главы вводят станции хаба по одной:
// 1–3 дорога VER 4 · 4–6 + блиц-арки (math-sprint) · 7–9 + ворота «ровно N» (number-bonds) · 10–12 + ряд на арках (pattern)
// · 13–15 + шкала (math-slider) · 16+ смесь. VER 2: главы ряда и шкалы.
// Задачи станций приходят снаружи (tasks): планировщик и ядро — чистые .mjs, а арифметику считает тот же код, что в упражнениях.
// Уровень — тот же непрерывный забег (mode 'journey' для ядра: без модалок, лимит чисел 1e6), отличает его format 'level'.
import {solveCourse,stationaryWins} from './runner-levels.mjs';
import {random,createTrack,round5} from './runner-shapes.mjs';
import {finaleLadder,wallsBroken} from './runner-campaign.mjs';
export const LEVEL_VERSION='number-run-level/2',LEVEL_SLOTS=15,PASS_WALLS=5,BOSS_SHARE=.6;
// С какого уровня входит станция. Уровень главы, кратный трём, — страж (признак босса даёт экран из constants/bosses.ts).
export const CHAPTERS=Object.freeze([
 Object.freeze({from:4,station:'blitz'}),
 Object.freeze({from:7,station:'exact'}),
 Object.freeze({from:10,station:'pattern'}),
 Object.freeze({from:13,station:'scale'}),
]);
// С какого уровня все введённые станции идут вперемешку: через главу после последней.
export const MIX_FROM=CHAPTERS.at(-1).from+3;
const SHAPES=['snake','grid','columns','ramp','line','walls'];
const OBSTACLES=['bridge','jump','block','gap','jump','bridge','bridge','jump','block','gap','jump','bridge','jump','bridge'];
// Уровень станции от уровня забега: первая встреча со станцией — первый уровень её упражнения.
export const stationLevel=(station,level)=>Math.max(1,level-(CHAPTERS.find(c=>c.station===station).from-1));
// Станции уровня по порядку. Первый уровень главы — три новых; второй — четыре новых и одна прежняя;
// страж и уровни смеси (MIX_FROM+) — шесть вперемешку из всех введённых.
export function stationPlan(level,boss){
 const known=CHAPTERS.filter(c=>level>=c.from).map(c=>c.station);
 if(!known.length)return [];
 if(boss||level>=MIX_FROM)return Array.from({length:6},(_,i)=>known[(i+level)%known.length]);
 const chapter=CHAPTERS.filter(c=>level>=c.from).at(-1),older=known.filter(s=>s!==chapter.station);
 if(level===chapter.from)return Array(3).fill(chapter.station);
 return older.length?[chapter.station,chapter.station,older[0],chapter.station,chapter.station]:Array(4).fill(chapter.station);
}
// Места станций среди 15 рядов: равномерно, не первым рядом (он всегда строй) и не последним (он стены).
const spread=n=>Array.from({length:n},(_,i)=>1+Math.round((i+1)*(LEVEL_SLOTS-2)/(n+1)));
export function makeLevel(level,seed,tasks,{boss=false}={}){
 if(!Number.isInteger(level)||level<1)throw Error('Invalid level');
 if(!Number.isInteger(seed)||seed<0||seed>0xffffffff)throw Error('Invalid level seed');
 // Четырнадцать препятствий на уровень — мало: полосы мостов и трамплинов изредка совпадают, и стоящий на месте
 // проходит уровень (замер 16.09: уровень 17, зерно 13 — всё на средней полосе). Такую раздачу перебрасываем
 // солью; выбор по-прежнему однозначен для пары (уровень, зерно).
 for(let salt=0;salt<16;salt++){const course=buildLevel(level,seed,salt,tasks,boss);if(course)return course;}
 throw Error(`No playable level: ${level}/${seed}`);
}
function buildLevel(level,seed,salt,tasks,boss){
 const rng=random((seed^Math.imul(level,0x9e3779b1)^Math.imul(salt,0x85ebca6b))>>>0),track=createTrack(rng),k=level+1,stations=stationPlan(level,boss);
 const stationAt=new Map(spread(stations.length).map((slot,i)=>[slot,stations[i]]));
 let shape=level%SHAPES.length;
 for(let i=0;i<LEVEL_SLOTS;i++){
  const station=stationAt.get(i);
  if(i===0)track.line(1,k,4*k,2*k);
  else if(station==='blitz')track.blitz(1,k,tasks.blitz(stationLevel('blitz',level),rng));
  else if(station==='exact')track.exact(1,k,tasks.exact(stationLevel('exact',level),rng));
  else if(station==='pattern')track.pattern(1,k,tasks.pattern(stationLevel('pattern',level),rng));
  else if(station==='scale')track.scale(1,k,tasks.scale(stationLevel('scale',level),rng));
  else if(i===LEVEL_SLOTS-1){if(boss)track.double(1,k,.85);else track.walls(1,k);}
  else{const next=SHAPES[shape++%SHAPES.length];
   if(next==='snake')track.snake(1,k,level===1?0:level<6?1:2);else if(next==='line')track.line(1,k,5*k,3*k);else track[next](1,k);}
  if(i<LEVEL_SLOTS-1){const o=OBSTACLES[i];
   if(o==='block')track.block(1,k);else if(o==='gap')track.gap(1);
   else track[o](1,level===1&&i<2?(o==='bridge'?-1:0):track.lane());}
 }
 track.stageLine(1);
 const rows=track.rows;
 const course={version:LEVEL_VERSION,mode:'journey',format:'level',levelId:level,seed,boss,start:1,speed:8,lateralSpeed:4,length:rows.at(-1).z,rows,gates:1,
  stages:[{id:1,title:`Уровень ${level}`,startRow:0,endRow:rows.length-1,startZ:0,endZ:rows.at(-1).z,startValue:1,target:track.intended}]};
 const path=solveCourse(course);
 if(!path||[-1,0,1].some(lane=>stationaryWins(course,lane)))return null;
 const reference=path.at(-1).sum;
 course.finale=boss?{reference,boss:Math.max(10,round5(reference*BOSS_SHARE))}:finaleLadder(reference);
 return course;
}
// Пройден ли уровень: у обычного — пробито не меньше PASS_WALLS стен из десяти; у стража — число не меньше стража.
export const levelPassed=(course,value)=>course.finale.boss!==undefined?value>=course.finale.boss:wallsBroken(course.finale,value)>=PASS_WALLS;
