// VER 3 · LOCAL 0.4 · 2026-09-12 · Continuous journey, terrain sweep and 3D numerals.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeCampaign,STAGE_COUNT} from './runner-campaign.mjs';
import {solveCourse,stationaryWins} from './runner-levels.mjs';
import {initial,step,resume,pause,setTarget,numberScale,replay,jumpHeight,advanceFrame} from './runner-core.mjs';
import {decodeProgress,emptyProgress} from './runner-storage.mjs';
import {createNumerals} from './runner-numerals.mjs';
function run(course,path,dt=.05,until=course.rows.length){
 let s=resume(initial(course));
 for(let n=0;n<70000&&s.status==='running'&&s.nextRow<until;n++)s=step(setTarget(s,path[s.nextRow].lane),dt,course);
 return s;
}
test('journey is 504 seconds: twelve42-second stages and72 obstacle rows',()=>{
 const c=makeCampaign();assert.equal(c.length/c.speed,504);assert.equal(c.stages.length,STAGE_COUNT);assert.equal(c.rows.length,168);
 assert.ok(c.stages.every(s=>(s.endZ-s.startZ)/c.speed===42));assert.equal(c.rows.filter(r=>r.kind==='obstacle').length,72);
 for(const r of c.rows.filter(r=>r.kind==='obstacle')){assert.ok(r.jump||r.penalties.some(p=>p===0));assert.ok(r.penalties.some(p=>p>0));}
});
test('100 seeds: all12 stages reachable in actual simulation, no idle lane wins',()=>{
 for(let seed=0;seed<100;seed++){
  const c=makeCampaign(seed),path=solveCourse(c),s=run(c,path);
  assert.equal(s.status,'won',`seed ${seed}`);assert.equal(s.clearedStages,12);assert.equal(s.gates,12);
  assert.ok(Math.abs(s.elapsed-504)<1e-6);assert.ok(s.sum>2000);assert.ok([-1,0,1].every(lane=>!stationaryWins(c,lane)));
  assert.equal(s.events.filter(e=>e.type==='resume').length,1);assert.equal(s.events.filter(e=>e.type==='pause').length,0);
  assert.equal(s.sum,replay(c,path.map(p=>p.lane)).sum);assert.equal(s.events.filter(e=>['operation','gate','obstacle','pickups'].includes(e.type)).length,168);
 }
});
test('first stage passes directly into second: no won/ready/reset, same sum and x',()=>{
 const c=makeCampaign(),path=solveCourse(c);let s=resume(initial(c));
 while(s.nextRow<13)s=step(setTarget(s,path[s.nextRow].lane),.05,c);
 const sum=s.sum;while(s.nextRow<14)s=step(setTarget(s,path[s.nextRow].lane),.05,c);
 assert.equal(s.stage,2);assert.equal(s.status,'running');assert.equal(s.sum,sum);assert.equal(s.clearedStages,1);assert.ok(s.z>=c.stages[0].endZ-1e-7);
 const old=s;s=step(s,.05,c);assert.ok(s.z>old.z);assert.equal(s.sum,old.sum);assert.equal(s.target,old.target);assert.equal(s.elapsed,old.elapsed+.05);
});
test('barrier charges exact visible damage once, clear lane charges nothing',()=>{
 const c=makeCampaign(),row=c.rows.find(r=>r.terrain==='block'),hit=row.penalties.findIndex(p=>p>0)-1,clear=row.penalties.indexOf(0)-1;
 const base={...resume(initial(c)),z:row.z-.01,nextRow:row.id,sum:20};
 let s=step({...base,x:hit,target:hit},.1,c);assert.equal(s.sum,20-row.penalties[hit+1]);assert.equal(s.hits,1);
 assert.equal(step(s,.1,c).sum,s.sum);assert.equal(s.events.at(-1).damage,row.penalties[hit+1]);
 s=step({...base,x:clear,target:clear},.1,c);assert.equal(s.sum,20);assert.equal(s.hits,0);
});
test('barrier hit is recoverable arithmetic, not instant game over or hidden zero clamp',()=>{
 const c=makeCampaign(),row=c.rows.find(r=>r.terrain==='block'),hit=row.penalties.findIndex(p=>p>0)-1;
 const s=step({...resume(initial(c)),z:row.z-.01,nextRow:row.id,x:hit,target:hit,sum:1},.05,c);
 assert.equal(s.status,'running');assert.equal(s.sum,1-row.penalties[hit+1]);assert.ok(s.sum<0);
});
test('size follows current number, grows across milestones and shrinks on damage',()=>{
 const sizes=[1,10,100,1000,2348].map(numberScale);assert.ok(sizes.every((n,i)=>i===0||n>sizes[i-1]));
 assert.ok(numberScale(20)>numberScale(16));assert.equal(numberScale(-4),numberScale(0));assert.ok(numberScale(9999)<=2.6);
});
test('deep checkpoint resumes same stage/value/position and rejects stage tampering',()=>{
 const c=makeCampaign(),s=pause(run(c,solveCourse(c),.05,40));
 const saved=decodeProgress(JSON.stringify({...emptyProgress(),checkpoint:s}));
 assert.ok(saved.checkpoint);assert.equal(saved.mode,'journey');assert.equal(saved.checkpoint.stage,s.stage);assert.equal(saved.checkpoint.z,s.z);assert.equal(saved.checkpoint.sum,s.sum);assert.equal(saved.checkpoint.status,'paused');
 assert.equal(decodeProgress(JSON.stringify({...emptyProgress(),checkpoint:{...s,stage:12}})).checkpoint,null);
});
test('v2 training completions survive upgrade but do not load old short checkpoint',()=>{
 const p=decodeProgress(JSON.stringify({version:2,completed:[1,3,12],selected:3,seed:10,checkpoint:{version:'number-run-core/2'}}));
 assert.deepEqual(p.completed,[1,3,12]);assert.equal(p.mode,'journey');assert.equal(p.checkpoint,null);
});
test('journey deterministic; different seeds change lanes not length/numeric targets',()=>{
 const a=makeCampaign(22),b=makeCampaign(23);assert.deepEqual(a,makeCampaign(22));assert.notDeepEqual(a.rows,b.rows);assert.deepEqual(a.stages,b.stages);
});
test('60/120Hz full journey has same arithmetic and finish time',()=>{
 const c=makeCampaign(77),p=solveCourse(c),a=run(c,p,1/60),b=run(c,p,1/120);
 assert.equal(a.status,'won');assert.equal(b.status,'won');assert.equal(a.sum,b.sum);assert.equal(a.hits,b.hits);assert.ok(Math.abs(a.elapsed-b.elapsed)<1e-6);
});
test('gaps are swept over their whole length; entering midway also falls',()=>{
 const c=makeCampaign(),r=c.rows.find(r=>r.terrain==='gap'),bad=r.penalties.findIndex(p=>p>0)-1,good=r.penalties.indexOf(0)-1;
 const base={...resume(initial(c)),z:r.z-r.span-.1,nextRow:r.id,sum:14};
 const fall=step({...base,x:bad,target:bad},.1,c);assert.equal(fall.status,'failed');assert.equal(fall.failure.kind,'fall');assert.equal(fall.sum,14);assert.ok(Math.abs(fall.z-(r.z-r.span))<1e-7);
 const safe=step({...base,x:good,target:good},.1,c);assert.equal(safe.status,'running');
 let moving={...safe,z:r.z-r.span/2,target:bad};for(let i=0;i<10&&moving.status==='running';i++)moving=step(moving,.05,c);assert.equal(moving.status,'failed');
});
test('bridge has exactly one complete lane; solver allows time to reach its entrance',()=>{
 const c=makeCampaign();for(const r of c.rows.filter(r=>r.terrain==='bridge'))assert.equal(r.penalties.filter(p=>p===0).length,1);
 const r=c.rows.find(r=>r.terrain==='bridge'),previous=c.rows[r.id-1];
 const impossible={...c,start:0,lateralSpeed:.01,rows:[{...previous,kind:'gate',rules:[{min:0,max:0},{min:2,max:2},{min:2,max:2}],span:0}, {...r,penalties:[2,2,0]}]};
 assert.equal(solveCourse(impossible),null);
});
test('digits are real extruded meshes and reuse a bounded glyph pool',()=>{
 const pool=createNumerals(),a=pool.make('142'),b=pool.make('142');assert.equal(pool.glyphCount,13);assert.equal(a.children.length,3);assert.ok(a.userData.extruded);
 for(let i=0;i<3;i++){assert.equal(a.children[i].geometry,b.children[i].geometry);const box=a.children[i].geometry.boundingBox;assert.ok(box.max.z-box.min.z>.2);assert.ok(a.children[i].isMesh);}
 assert.equal(pool.make('−20').children.length,3);assert.equal(pool.make('×2').children.length,2);pool.destroy();
});
test('one horizontal row: sweep collects all FIVE blue numbers exactly once, no lane rounding',()=>{
 const c=makeCampaign();let s=resume(initial(c));
 while(s.nextRow===0)s=step(setTarget(s,s.z<c.rows[0].z-c.rows[0].window?-1:1),1/120,c);
 const pickups=s.events.filter(e=>e.type==='pickup');assert.equal(pickups.length,5);assert.equal(new Set(pickups.map(e=>e.item)).size,5);assert.equal(s.sum,41);
 assert.equal(s.events.find(e=>e.type==='pickups').items.length,5);assert.equal(step(s,.05,c).sum,41);
});
test('red pickup subtracts its value, blue adds; no contact means no forced pickup',()=>{
 const c=makeCampaign(),r=c.rows.find(r=>r.items?.some(i=>i.value<0));
 for(const item of r.items){let s={...resume(initial(c)),z:r.z-r.window-.1,nextRow:r.id,sum:100,x:item.x,target:item.x};s=step(s,.05,c);assert.equal(s.sum,100+item.value);assert.equal(s.events.filter(e=>e.type==='pickup').length,1);}
 const untouched=step({...resume(initial(c)),z:r.z-r.window-.1,nextRow:r.id,sum:100,x:.25,target:.25},.05,c);assert.equal(untouched.sum,100);
});
test('tрамплин launches, reaches an apex and lands past the whole physical gap',()=>{
 const c=makeCampaign(),r=c.rows.find(r=>r.jump);let s={...resume(initial(c)),z:r.z-r.jump.launchOffset-.1,nextRow:r.id,x:r.jump.lane,target:r.jump.lane};let peak=0;
 while(s.z<r.z+r.jump.landingOffset+.5&&s.status==='running'){s=step(s,.05,c);peak=Math.max(peak,jumpHeight(s));}
 assert.equal(s.status,'running');assert.ok(peak>2.7);assert.equal(jumpHeight(s),0);assert.equal(s.events.filter(e=>e.type==='jump').length,1);assert.ok(s.events.some(e=>e.type==='obstacle'&&e.jumped));
});
test('missing the ramp is not a free teleport across the void',()=>{
 const c=makeCampaign(),r=c.rows.find(r=>r.jump),lane=r.jump.lane===1?-1:1;let s={...resume(initial(c)),z:r.z-r.jump.launchOffset-.1,nextRow:r.id,x:lane,target:lane};
 while(s.status==='running'&&s.z<r.z)s=step(s,.05,c);assert.equal(s.status,'failed');assert.equal(s.failure.kind,'fall');assert.equal(s.events.filter(e=>e.type==='jump').length,0);
});
test('stage lines never stop a journey for too little or too much power',()=>{
 const c=makeCampaign(),r=c.rows.find(r=>r.checkpoint);for(const sum of [-100,0,99999]){const s=step({...resume(initial(c)),z:r.z-.1,nextRow:r.id,sum},.05,c);assert.equal(s.status,'running');assert.equal(s.sum,sum);assert.equal(s.stage,2);}
});
test('visible long frame does not open pause and does not teleport journey',()=>{
 const c=makeCampaign(),s=resume(initial(c));for(const dt of [.2,.9,5]){const next=advanceFrame(s,dt,c);assert.equal(next.status,'running');assert.equal(next.pauses,0);assert.ok(next.z<=2);}
 assert.equal(advanceFrame(pause(s),5,c).status,'paused');
});
test('reload during collection and flight preserves exact state; duplicate pickup rejected',()=>{
 const c=makeCampaign();let s=resume(initial(c));while(s.collected.length===0)s=step(setTarget(s,-1),1/120,c);
 let saved=decodeProgress(JSON.stringify({...emptyProgress(),checkpoint:s}));assert.ok(saved.checkpoint);assert.deepEqual(saved.checkpoint.collected,s.collected);assert.equal(saved.checkpoint.sum,s.sum);
 const p=solveCourse(c);s=resume(initial(c));while(!s.jump)s=step(setTarget(s,p[s.nextRow].lane),1/120,c);
 saved=decodeProgress(JSON.stringify({...emptyProgress(),checkpoint:s}));assert.ok(saved.checkpoint);assert.deepEqual(saved.checkpoint.jump,s.jump);
 const item=s.events.find(e=>e.type==='pickup');assert.equal(decodeProgress(JSON.stringify({...emptyProgress(),checkpoint:{...s,events:[...s.events,item]}})).checkpoint,null);
});
