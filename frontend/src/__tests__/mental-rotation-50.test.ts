/* LOCAL REV spatial-lab/2026-09-09.1 · psygames-codex-mac · not an app release */
import {ROTATION_LEVELS} from '../games/mental-rotation/core/levels';
import {buildTask,createRng,isValidRotation,rotateShape,sameShape,shapeKey,normalizeShape,shapesOfSize} from '../games/mental-rotation/core';
import type {Shape} from '../games/mental-rotation/core';

function connected(shape:Shape):boolean {
  const seen=new Set([0]),queue=[0];
  for(let p=0;p<queue.length;p++)for(let i=0;i<shape.length;i++){
    if(!seen.has(i)&&shape[i].reduce((d,v,a)=>d+Math.abs(v-shape[queue[p]][a]),0)===1){seen.add(i);queue.push(i);}
  }
  return seen.size===shape.length;
}
function bestOverlap(a:Shape,b:Shape):number {
  const occupied=new Set(a.map(c=>c.join(',')));let best=0;
  for(const ac of a)for(const bc of b){
    const offset=ac.map((v,i)=>v-bc[i]);
    best=Math.max(best,b.filter(c=>occupied.has(c.map((v,i)=>v+offset[i]).join(','))).length);
  }
  return best;
}
describe('mental rotation: 50 enforced specifications',()=>{
  it('50 distinct records, no plateau after 15',()=>{
    expect(ROTATION_LEVELS).toHaveLength(50);
    expect(new Set(ROTATION_LEVELS.map(({level,change,...s})=>JSON.stringify(s))).size).toBe(50);
  });
  it('new 9..13 cube pools are connected, unique, compact and returned defensively',()=>{
    for(let n=9;n<=13;n++){
      const pool=shapesOfSize(n,n);expect(pool.length).toBeGreaterThanOrEqual(3);
      for(const s of pool){expect(s).toHaveLength(n);expect(connected(s)).toBe(true);expect(new Set(s.map(c=>c.join(','))).size).toBe(n);}
      const before=JSON.stringify(pool);pool[0][0][0]=999;
      expect(JSON.stringify(shapesOfSize(n,n))).toBe(before);
    }
  });
  it('all 50 ×20 seeds: exact cubes/options, one valid answer, actual recorded rotation and angle variety',()=>{
    for(const spec of ROTATION_LEVELS){
      const angles=new Set<number>();
      for(let i=0;i<20;i++){
        const seed=`fifty-${spec.level}-${i}`,task=buildTask('rotation',spec.level,createRng(seed));
        if(task.kind!=='rotation')throw new Error('wrong task');
        expect(task).toEqual(buildTask('rotation',spec.level,createRng(seed)));
        expect(task.base).toHaveLength(spec.cubes);expect(task.options).toHaveLength(spec.optionCount);
        expect(task.steps.slice(0,spec.path.length).map(s=>s.axis)).toEqual(spec.path);
        expect(task.angleSum).toBe(task.steps.length*90);angles.add(task.angleSum);
        const target=task.steps.reduce((s,step)=>rotateShape(s,step.axis,1),task.base);
        expect(sameShape(target,task.options[task.correctIdx].shape)).toBe(true);
        expect(sameShape(task.base,target)).toBe(false);
        expect(new Set(task.options.map(o=>shapeKey(normalizeShape(o.shape)))).size).toBe(spec.optionCount);
        for(const option of task.options){
          expect(connected(option.shape)).toBe(true);expect(option.shape).toHaveLength(spec.cubes);
          expect(isValidRotation(task.base,option.shape)).toBe(option.isMatch);
          if(spec.foil==='one-cube'&&!option.isMatch){
            const back=[...task.steps].reverse().reduce((s,step)=>rotateShape(s,step.axis,-1),option.shape);
            expect(bestOverlap(task.base,back)).toBe(spec.cubes-1);
          }
        }
      }
      expect(angles.size).toBeGreaterThan(1);
    }
  },30000);
  it('projection and net still generate at all 50 levels',()=>{
    for(let level=1;level<=50;level++)for(const kind of ['projection','net'] as const){
      const task=buildTask(kind,level,createRng(`extra-${level}-${kind}`));
      expect(task.options).toHaveLength(ROTATION_LEVELS[level-1].optionCount);
      expect(task.options.filter(o=>o.isMatch)).toHaveLength(1);
    }
  });
});
