// VER 5 · 2026-09-17 · psygames-search-claude-mac: прямой ряд — «берёт середина, вбок через ряд — несколько», как обещают правила.
// VER 4 · 2026-09-17 · psygames-search-claude-mac: ряд на арках проверяется и на L30 («знак меняется»): «•» и типографский минус.
// VER 3 · 2026-09-16 · psygames-search-claude-mac: + «память в пути» (setSize — лестница OSpan из ospanLadder).
// VER 2 · 2026-09-16 · psygames-search-claude-mac: + станции «ряд на арках» (patternSequences) и «шкала» (math-slider core).
// VER 1 · 2026-09-16 · psygames-search-claude-mac. Режим уровней: станции хаба «Счёт» (блиц-арки, ворота «ровно N»),
// главы, страж, правило прохождения. Задачи — настоящие генераторы упражнений (mathSprintCore, numberBondsLadder), не заглушки.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {makeLevel,stationPlan,stationLevel,levelPassed,LEVEL_SLOTS,PASS_WALLS} from './runner-level.mjs';
import {makeCampaign,wallsBroken} from './runner-campaign.mjs';
import {solveCourse,stationaryWins,exactDelta} from './runner-levels.mjs';
import {initial,step,resume,setTarget,replay} from './runner-core.mjs';
import {generateSprintProblem} from '../counting/mathSprintCore.ts';
import {levelParams,makePuzzle} from '../counting/numberBondsLadder.ts';
import {makeSequence,makeOptions} from '../counting/patternSequences.ts';
import {levelParams as ospanLevel} from '../counting/ospanLadder.ts';
import {registerHooks} from 'node:module';
// Ядро «Мат. шкалы» импортирует соседей без расширения (./work) — так пишет Metro. Node такие пути не находит; крючок
// дописывает .ts только им, и шкала в пробах — настоящий генератор упражнения, а не заглушка.
registerHooks({resolve(specifier,context,next){try{return next(specifier,context);}catch(e){if(specifier.startsWith('.')&&!/\.[cm]?[jt]sx?$/.test(specifier))return next(specifier+'.ts',context);throw e;}}});
const {generateMathSliderQuestions}=await import('../math-slider/core/generator.ts');
const {formatExpression}=await import('../math-slider/core/expression.ts');
const tasks={
 blitz:(L,rnd)=>generateSprintProblem(L,rnd),
 exact:(L,rnd)=>makePuzzle(levelParams(L),rnd),
 pattern:(L,rnd)=>{const seq=makeSequence(L,rnd);return {...seq,options:makeOptions(seq.answer,3,rnd)};},
 scale:(L,rnd)=>{const q=generateMathSliderQuestions(`run-${Math.floor(rnd()*1e9)}`,Math.min(52,L),1)[0];return {prompt:formatExpression(q.expression,'en'),min:q.scale.min,max:q.scale.max,answer:q.answer,ticks:q.scale.ticks};},
 memory:L=>ospanLevel(L),
};
const isBoss=L=>L%3===0;   // constants/bosses.ts: BOSS_EVERY = 3
const level=(L,seed)=>makeLevel(L,seed,tasks,{boss:isBoss(L)});
function aim(course,path,s){const p=path[s.nextRow];if(!p?.route)return p.lane;const row=course.rows[p.id],w=row.routes.find(r=>r.id===p.route).waypoints.find(w=>row.z+w.dz>=s.z-1e-9);return w?w.x:p.lane;}
function run(course,path,dt=.05){let s=resume(initial(course));for(let n=0;n<40000&&s.status==='running';n++)s=step(setTarget(s,aim(course,path,s)),dt,course);return s;}
function through(course,row,x0,waypoints,dt=1/120){
 const previous=course.rows[row.id-1];let s={...resume(initial(course)),z:previous?previous.z+(previous.window??0):0,nextRow:row.id,sum:1000,peak:1000,x:x0,target:x0};
 while(s.nextRow===row.id&&s.status==='running'){const w=waypoints?.find(w=>row.z+w.dz>=s.z-1e-9);s=step(setTarget(s,w?w.x:s.target),dt,course);}
 return s;
}
// Правила (numberRunIntroDesc, 12 языков) обещают игроку: «берёт середина числа, а не края; чтобы взять из ряда несколько,
// проведи число вбок прямо через них». Отзыв 3aaa1b75 (ребёнок, 2.54.6): «не могу забрать сразу несколько чисел, забираю вместо
// 5 и 2» — способ был, но о нём не говорилось. Поменяется сбор в ядре — эта проба покраснеет: текст правил менять вместе с ним.
test('straight row: the middle takes — standing takes one, sliding sideways through two takes both, across the row takes five',()=>{
 const c=makeCampaign(20260912),lines=c.rows.filter(r=>r.kind==='pickups'&&r.shape==='line');
 const taken=(row,x0,x1)=>through(c,row,x0,x1===undefined?[]:[{dz:-2.5,x:x0},{dz:1e9,x:x1}]).events.filter(e=>e.type==='pickup'&&e.id===row.id).length;
 for(const row of lines){
  assert.equal(taken(row,0),1,`ряд ${row.id}: стоя — одно число`);
  assert.equal(taken(row,0,.5),2,`ряд ${row.id}: вбок через соседнее — оба`);
  assert.equal(taken(row,-1,1),5,`ряд ${row.id}: вбок через весь ряд — все пять`);
 }
 assert.ok(lines.length>=10&&lines[0].id===0,`прямых рядов ${lines.length}, первый — ряд ${lines[0]?.id}`);
});
test('marathon is unchanged by moving shapes into runner-shapes: seven seeds hash the same as before the move',()=>{
 const h=createHash('sha256');for(const seed of [0,1,2,7,20260912,445293,118929])h.update(JSON.stringify(makeCampaign(seed)));
 assert.equal(h.digest('hex'),'c34600e05c63547b010404ad533445293e432429257ba41896bcb65174d14516');
});
test('levels 1–30 × 20 seeds: 30 rows, 90 seconds, 14 obstacles, finish line, finale by kind, no idle lane wins',()=>{
 for(let L=1;L<=30;L++)for(let seed=0;seed<20;seed++){const c=level(L,seed);
  assert.equal(c.rows.length,2*LEVEL_SLOTS);assert.equal(c.length/c.speed,90);assert.equal(c.rows.filter(r=>r.kind==='obstacle').length,LEVEL_SLOTS-1);
  assert.ok(c.rows.at(-1).stageEnd);assert.ok([-1,0,1].every(lane=>!stationaryWins(c,lane)));
  if(isBoss(L)){assert.ok(c.finale.boss>=c.finale.reference*.5&&c.finale.boss<=c.finale.reference*.7,`${L}/${seed}`);}else{assert.equal(c.finale.walls.length,10);assert.ok(c.finale.walls[9]<=c.finale.reference);}
 }
});
test('chapters: L1–3 none, 4 blitz, 7 exact, 10 pattern, 13 scale — each first alone; bosses and 16+ mix six',()=>{
 const kinds=L=>new Set(level(L,3).rows.map(r=>r.station).filter(Boolean));
 for(const L of [1,2,3])assert.equal(kinds(L).size,0);
 for(const L of [4,5,6])assert.deepEqual([...kinds(L)],['blitz']);
 assert.deepEqual([...kinds(7)],['exact']);assert.deepEqual([...kinds(8)].sort(),['blitz','exact']);
 assert.deepEqual([...kinds(10)],['pattern']);assert.deepEqual([...kinds(13)],['scale']);assert.ok(kinds(14).has('scale')&&kinds(14).size===2);
 assert.deepEqual([...kinds(16)],['memory']);assert.deepEqual([...kinds(21)].sort(),['blitz','exact','memory','pattern','scale']);
 for(const L of [9,12,15,19,24])assert.equal(new Set(level(L,3).rows.filter(r=>r.station).map(r=>r.id)).size>=6,true);
 assert.deepEqual(stationPlan(4,false),['blitz','blitz','blitz']);assert.equal(stationLevel('blitz',4),1);assert.equal(stationLevel('exact',7),1);assert.equal(stationLevel('blitz',30),27);
});
test('solver route wins every level in simulation and passes it: walls 10/10 or the boss beaten; replay agrees',()=>{
 for(let L=1;L<=24;L++)for(const seed of [0,5,11]){const c=level(L,seed),path=solveCourse(c),s=run(c,path);
  assert.equal(s.status,'won',`${L}/${seed}`);assert.equal(s.sum,replay(c,path.map(p=>p.route??p.lane)).sum,`${L}/${seed}`);assert.equal(s.mistakes,0);
  assert.ok(levelPassed(c,s.sum),`${L}/${seed}: ${s.sum}`);if(!isBoss(L))assert.equal(wallsBroken(c.finale,s.sum),10);
 }
});
test('blitz arch: one correct answer among three distinct options; correct lane adds, each wrong lane subtracts and counts a mistake',()=>{
 let rows=0;for(const seed of [1,2,3,4])for(const r of level(5,seed).rows.filter(r=>r.kind==='answer')){rows++;const c=level(5,seed);
  assert.equal(new Set(r.options).size,3);assert.equal(r.options.filter(o=>o===r.options[r.correct]).length,1);
  for(const lane of [-1,0,1]){const s=through(c,r,lane);const e=s.events.find(e=>e.type==='answer');
   assert.equal(e.ok,lane+1===r.correct);assert.equal(s.sum,1000+(e.ok?r.reward:-r.penalty));assert.equal(s.mistakes,e.ok?0:1);}
 }
 assert.ok(rows>=12);
 const probe=level(30,1).rows.find(r=>r.station==='blitz');assert.ok(/=/.test(probe.prompt));
});
test('exact gate: the route takes exactly N at 60 and 120 Hz; a miss costs by its size; ≤5 numbers per line; parts never change the number on touch',()=>{
 let checked=0;for(const L of [7,8,12,20,28])for(let seed=0;seed<8;seed++){const c=level(L,seed);
  for(const r of c.rows.filter(r=>r.exact)){const route=r.routes[0];
   const lines=new Map();for(const i of r.items)lines.set(i.dz,(lines.get(i.dz)??0)+1);assert.ok(Math.max(...lines.values())<=3);
   assert.ok(r.items.every(i=>i.part));
   for(const dt of [1/60,1/120]){const s=through(c,r,route.entry.x,route.waypoints,dt),e=s.events.find(e=>e.type==='pickups');
    assert.equal(e.exact.got,r.exact.target,`${L}/${seed} row ${r.id} dt ${dt}`);assert.equal(s.sum,1000+r.exact.bonus);assert.equal(s.mistakes,0);
    assert.ok(s.events.filter(e=>e.type==='pickup').every(e=>e.before===e.after));checked++;}
  }
 }
 assert.ok(checked>=100);
 const gate={target:21,bonus:40,unit:8};assert.equal(exactDelta(gate,21),40);assert.ok(exactDelta(gate,20)<0);assert.ok(exactDelta(gate,20)>exactDelta(gate,10));assert.equal(exactDelta(gate,0),-40);assert.ok(exactDelta(gate,60)>=-40);
});
test('level passes at five walls and not at four; a boss passes at its value and not one below',()=>{
 const c=level(4,2),walls=c.finale.walls;assert.equal(levelPassed(c,walls[PASS_WALLS-1]),true);assert.equal(levelPassed(c,walls[PASS_WALLS-1]-1),false);
 const b=level(6,2);assert.equal(levelPassed(b,b.finale.boss),true);assert.equal(levelPassed(b,b.finale.boss-1),false);
});
test('deterministic per level and seed; seeds change the road, not the level plan',()=>{
 assert.deepEqual(level(8,40),level(8,40));assert.notDeepEqual(level(8,40).rows,level(8,41).rows);
 const kinds=c=>c.rows.map(r=>r.kind+':'+(r.station??''));assert.deepEqual(kinds(level(8,40)),kinds(level(8,41)));
});

test('pattern arches: sequence on the board, three distinct continuations from the game itself, one correct',()=>{
 let rows=0;for(let seed=0;seed<10;seed++)for(const L of [11,30])for(const r of level(L,seed).rows.filter(r=>r.station==='pattern')){rows++;
  assert.equal(new Set(r.options).size,3);assert.ok(/ • \?$/.test(r.prompt));
  // L30 — «знак меняется»: минус на табло типографский, иначе издали он сливается с разделителем.
  assert.ok(!r.prompt.includes('-'),`дефис на табло: ${r.prompt}`);
  const items=r.prompt.replace(/ • \?$/,'').split(' • ').map(s=>Number(s.replace('−','-')));assert.ok(items.length>=3&&items.every(Number.isFinite));
  if(L===30)assert.ok(items.some(v=>v<0),`на L30 ждём отрицательные: ${r.prompt}`);
  assert.ok(r.correct>=0);const c=level(L,seed);for(const lane of [-1,0,1]){const s=through(c,r,lane);assert.equal(s.sum,1000+(lane+1===r.correct?r.reward:-r.penalty));}
 }
 assert.ok(rows>=30);
});
test('scale: x reads as a number on the line; the route lands in tolerance, far lanes cost, near is free',()=>{
 let rows=0;for(let seed=0;seed<10;seed++){const c=level(14,seed);for(const r of c.rows.filter(r=>r.kind==='scale')){rows++;
  assert.ok(r.min<=r.answer&&r.answer<=r.max,`${r.min}…${r.max} ${r.answer}`);
  const route=r.routes[0];for(const dt of [1/60,1/120]){const s=through(c,r,route.entry.x,route.waypoints,dt),e=s.events.find(e=>e.type==='scale');
   assert.ok(e.err<=r.tolerance+1e-9,`err ${e.err}`);assert.equal(s.sum,1000+r.reward);assert.equal(s.mistakes,0);}
  for(const lane of [-1,0,1]){const s=through(c,r,lane),e=s.events.find(e=>e.type==='scale');
   assert.equal(e.delta,e.err<=r.tolerance?r.reward:e.err<=2*r.tolerance?0:-r.penalty);assert.equal(s.mistakes,e.delta<0?1:0);}
 }}
 assert.ok(rows>=20);
});

test('memory: symbols shown over the road, recalled two rows later in the same order; the route takes all and only the right ones',()=>{
 let pairs=0;for(let seed=0;seed<12;seed++)for(const L of [16,17,20]){const c=level(L,seed),shows=c.rows.filter(r=>r.shape==='memory-show');
  for(const show of shows){const recall=c.rows[show.id+4];pairs++;
   assert.equal(recall?.shape,'memory-recall',`${L}/${seed} row ${show.id}`);
   const n=show.show.symbols.length;assert.ok(n>=3&&n<=5);assert.equal(new Set(show.show.symbols).size,n);
   const right=recall.items.filter(i=>i.value===1).sort((a,b)=>a.dz-b.dz).map(i=>i.symbol);assert.deepEqual(right,show.show.symbols);
   const lines=new Map();for(const i of recall.items)lines.set(i.dz,(lines.get(i.dz)??[]).concat(i));
   for(const line of lines.values()){assert.equal(line.length,3);assert.equal(new Set(line.map(i=>i.symbol)).size,3);assert.equal(line.filter(i=>i.value===1).length,1);}
   const route=recall.routes[0];for(const dt of [1/60,1/120]){const s=through(c,recall,route.entry.x,route.waypoints,dt),e=s.events.find(e=>e.type==='pickups');
    assert.equal(e.exact.got,n);assert.equal(s.sum,1000+recall.exact.bonus);assert.equal(s.mistakes,0);}
   // Одна чужая строка вместо своей — промах и минус.
   const wrong=route.waypoints.map((w,i)=>i===0?{...w,x:recall.items.find(it=>it.dz===w.dz&&it.value===-1&&Math.abs(it.x-route.waypoints[1].x)<=1).x}:w);
   const s=through(c,recall,wrong[0].x,wrong);assert.ok(s.events.find(e=>e.type==='pickups').exact.got<n);assert.ok(s.sum<1000);
  }}
 assert.ok(pairs>=40);
});
