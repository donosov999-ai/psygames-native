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
};
const isBoss=L=>L%3===0;   // constants/bosses.ts: BOSS_EVERY = 3
const level=(L,seed)=>makeLevel(L,seed,tasks,{boss:isBoss(L)});
function aim(course,path,s){const p=path[s.nextRow];if(!p?.route)return p.lane;const row=course.rows[p.id],w=row.routes.find(r=>r.id===p.route).waypoints.find(w=>row.z+w.dz>=s.z-1e-9);return w?w.x:p.lane;}
function run(course,path,dt=.05){let s=resume(initial(course));for(let n=0;n<40000&&s.status==='running';n++)s=step(setTarget(s,aim(course,path,s)),dt,course);return s;}
function through(course,row,x0,waypoints,dt=1/120){
 const previous=course.rows[row.id-1];let s={...resume(initial(course)),z:previous.z+(previous.window??0),nextRow:row.id,sum:1000,peak:1000,x:x0,target:x0};
 while(s.nextRow===row.id&&s.status==='running'){const w=waypoints?.find(w=>row.z+w.dz>=s.z-1e-9);s=step(setTarget(s,w?w.x:s.target),dt,course);}
 return s;
}
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
 assert.deepEqual([...kinds(18)].sort(),['blitz','exact','pattern','scale']);
 for(const L of [9,12,15,16,24])assert.equal(level(L,3).rows.filter(r=>r.station).length,6);
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
 let rows=0;for(let seed=0;seed<10;seed++)for(const r of level(11,seed).rows.filter(r=>r.station==='pattern')){rows++;
  assert.equal(new Set(r.options).size,3);assert.ok(/ · \?$/.test(r.prompt));const items=r.prompt.replace(/ · \?$/,'').split(' · ').map(Number);assert.ok(items.length>=3&&items.every(Number.isFinite));
  assert.ok(r.correct>=0);const c=level(11,seed);for(const lane of [-1,0,1]){const s=through(c,r,lane);assert.equal(s.sum,1000+(lane+1===r.correct?r.reward:-r.penalty));}
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
