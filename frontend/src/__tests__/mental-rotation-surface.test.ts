/* LOCAL REV spatial-lab/2026-09-09.1 · psygames-codex-mac · not an app release */
import {shapeSurface,turnPoint} from '../games/mental-rotation/core/surface';
import {rotateShape,normalizeShape} from '../games/mental-rotation/core/geometry';
import {shapesOfSize} from '../games/mental-rotation/core/shapes';
import type {Axis,Cube} from '../games/mental-rotation/core/types';
const polygonKey=(points:number[][])=>points.map(p=>p.map(v=>v.toFixed(5)).join(',')).sort().join('|');
describe('continuous cube rotation renderer',()=>{
  it('quarter-turn interpolation endpoints agree with integer engine on every axis',()=>{
    for(const axis of ['x','y','z'] as Axis[])for(const point of [[1,2,3],[-2,0,4]] as Cube[]){
      const actual=turnPoint(point,axis,Math.PI/2),expected=rotateShape([point],axis)[0];
      actual.forEach((v,i)=>expect(v).toBeCloseTo(expected[i],10));
    }
    for(let n=4;n<=13;n++)for(const shape of shapesOfSize(n,n))for(const axis of ['x','y','z'] as Axis[]){
      const animated=shapeSurface(shape,240,axis,90).map(f=>polygonKey(f.points)).sort();
      const target=shapeSurface(normalizeShape(rotateShape(shape,axis)),240).map(f=>polygonKey(f.points)).sort();
      expect(animated).toEqual(target);
    }
  });
  it('fractional frames move geometry, remove internal faces, remain in bounds without resizing',()=>{
    const shape=shapesOfSize(13,13)[0];
    const first=shapeSurface(shape,240).map(f=>polygonKey(f.points));
    const halfway=shapeSurface(shape,240,'y',45).map(f=>polygonKey(f.points));
    expect(first).not.toEqual(halfway);
    for(const axis of ['x','y','z'] as Axis[])for(let d=-90;d<=90;d+=5){
      const faces=shapeSurface(shape,240,axis,d);
      expect(faces.length).toBeGreaterThan(0);
      for(const f of faces)for(const p of f.points)for(const v of p){expect(v).toBeGreaterThanOrEqual(5);expect(v).toBeLessThanOrEqual(235);}
    }
    const joined=shapeSurface([[0,0,0],[1,0,0]],240);
    expect(joined).toHaveLength(5);
  });
});
