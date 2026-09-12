// VER 2 · 2026-09-12. Numeric rules, all12 curricula, 1200 seeds, real simulation.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initial,step,resume,pause,setTarget,advanceFrame,replay} from './runner-core.mjs';
import {LEVELS,makeCourse,solveCourse,stationaryWins,applyOperation,parseRule,meets,ruleDifference} from './runner-levels.mjs';
import {decodeProgress,emptyProgress} from './runner-storage.mjs';
function run(course,path,dt=1/60){
 let s=resume(initial(course));for(let n=0;n<30000&&s.status==='running';n++)s=step(setTarget(s,path[s.nextRow].lane),dt,course);return s;
}
for(const level of LEVELS)test(`L${level.id}: 100 seeds reachable and all stationary lanes fail`,()=>{
 for(let seed=0;seed<100;seed++){
  const c=makeCourse(level.id,seed),path=solveCourse(c);assert.ok(path);assert.ok([-1,0,1].every(l=>!stationaryWins(c,l)));
  const s=run(c,path);assert.equal(s.status,'won',`${level.id}/${seed}`);assert.equal(s.gates,c.gates);
  assert.equal(s.sum,replay(c,path.map(p=>p.lane)).sum);
  assert.equal(new Set(s.events.filter(e=>'id' in e).map(e=>e.id)).size,c.rows.length);
 }
});
test('seed and restart determinism',()=>assert.deepEqual(makeCourse(12,1234),makeCourse(12,1234)));
test('seed variants alter lane layout without changing numeric curriculum',()=>assert.notDeepEqual(makeCourse(1,1).rows,makeCourse(1,2).rows));
test('each level has a distinct authored profile',()=>assert.equal(new Set(LEVELS.map(l=>JSON.stringify([l.start,l.speed,l.gap,l.rows]))).size,12));
test('inclusive inequalities, ranges and negative numbers',()=>{
 for(const [text,yes,no] of [['≥8',8,7],['≤7',7,8],['−2…0',-2,-3],['−2…0',0,1]]){const r=parseRule(text);assert.ok(meets(yes,r));assert.ok(!meets(no,r));}
 assert.deepEqual(ruleDifference(8,parseRule('≤7')),{kind:'over',amount:1});
 assert.deepEqual(ruleDifference(3,parseRule('≥8')),{kind:'short',amount:5});
});
test('ordered arithmetic, explicit skip, no clamp to zero',()=>{
 assert.equal(applyOperation(applyOperation(1,'+4'),'×3'),15);assert.equal(applyOperation(applyOperation(1,'×3'),'+4'),7);
 assert.equal(applyOperation(3,'−5'),-2);assert.equal(applyOperation(-2,'×2'),-4);assert.equal(applyOperation(-4,'→'),-4);
 assert.throws(()=>applyOperation(9999,'×3'));assert.throws(()=>applyOperation(2,'?'));
});
test('invalid configuration and invalid timing rejected',()=>{
 assert.throws(()=>makeCourse(0));assert.throws(()=>makeCourse(1,-2));const c=makeCourse();
 for(const dt of [1,-1,NaN,Infinity])assert.throws(()=>step(resume(initial(c)),dt,c));
 assert.throws(()=>setTarget(resume(initial(c)),NaN));
});
test('ordinary 100/200ms frame stalls advance, long absence pauses',()=>{
 const c=makeCourse();let s=resume(initial(c));s=advanceFrame(s,.2,c);assert.equal(s.status,'running');assert.ok(Math.abs(s.z-1)<1e-8);
 const p=advanceFrame(s,2,c);assert.equal(p.status,'paused');assert.equal(p.z,s.z);
});
test('catch-up is bounded and dropped time is recorded',()=>{
 const c=makeCourse(),s=advanceFrame(resume(initial(c)),.6,c);assert.ok(Math.abs(s.z-1.25)<1e-8);assert.ok(Math.abs(s.discardedTime-.35)<1e-8);
});
test('pause and resume preserve sum, course position and elapsed',()=>{
 const c=makeCourse(),s=pause(step(resume(initial(c)),.05,c));assert.equal(step(s,.1,c),s);
 assert.equal(advanceFrame(s,50,c),s);assert.equal(resume(s).elapsed,s.elapsed);
});
test('60Hz and 120Hz paths reach same numeric decisions',()=>{
 for(const l of LEVELS){const c=makeCourse(l.id),p=solveCourse(c),a=run(c,p,1/60),b=run(c,p,1/120);assert.equal(a.status,b.status);assert.equal(a.sum,b.sum);assert.ok(Math.abs(a.elapsed-b.elapsed)<1e-7);}
});
test('no-input run fails in actual simulation, not only lane solver',()=>{
 const c=makeCourse();let s=resume(initial(c));while(s.status==='running')s=step(s,.05,c);assert.equal(s.status,'failed');assert.ok(s.failure.amount>0);
 const stopped=step(s,.05,c);assert.equal(stopped,s);
});
test('crossing event once at an in-between frame; gate does not spend sum',()=>{
 const c=makeCourse(),p=solveCourse(c);let s=resume(initial(c));s={...s,z:c.rows[0].z-.01,x:p[0].lane,target:p[0].lane};
 s=step(s,.1,c);assert.equal(s.nextRow,1);const count=s.events.length;s=step(s,.1,c);assert.equal(s.events.length,count);
 const won=run(c,p);assert.equal(won.events.at(-1).sum,won.sum);
});
test('checkpoint restoration is paused and numeric state validated',()=>{
 const c=makeCourse(3),p=solveCourse(c);let s=resume(initial(c));while(s.nextRow<2)s=step(setTarget(s,p[s.nextRow].lane),.05,c);
 const raw=JSON.stringify({...emptyProgress(),checkpoint:s,completed:[1,1,100]});const saved=decodeProgress(raw);
 assert.equal(saved.checkpoint.status,'paused');assert.equal(saved.checkpoint.sum,s.sum);assert.deepEqual(saved.completed,[1]);
 const corrupt={...s,sum:s.sum+1};assert.equal(decodeProgress(JSON.stringify({...emptyProgress(),checkpoint:corrupt})).checkpoint,null);
 assert.deepEqual(decodeProgress('{bad'),emptyProgress());
});
