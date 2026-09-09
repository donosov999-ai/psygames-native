/* psygames-mental-rotation-surface · VER 1 · 09.09.2026 */
/* LOCAL REV spatial-lab/2026-09-09.2 · psygames-codex-mac · not an app release */
import type {Axis,Cube,Shape} from './types';

/** Continuous version of the SAME right-handed X/Y/Z quarter turns as geometry.
 * Only rendering uses fractional angles; puzzle state remains integer cubes. */
export function turnPoint([x,y,z]:Cube,axis:Axis,radians:number):Cube {
  const c=Math.cos(radians),s=Math.sin(radians);
  return axis==='x'?[x,y*c-z*s,y*s+z*c]:axis==='y'?[x*c+z*s,y,-x*s+z*c]:[x*c-y*s,x*s+y*c,z];
}
const FACES:{normal:Cube;corners:Cube[]}[]=[
  {normal:[1,0,0],corners:[[1,0,0],[1,1,0],[1,1,1],[1,0,1]]},
  {normal:[-1,0,0],corners:[[0,0,1],[0,1,1],[0,1,0],[0,0,0]]},
  {normal:[0,1,0],corners:[[0,1,0],[0,1,1],[1,1,1],[1,1,0]]},
  {normal:[0,-1,0],corners:[[0,0,1],[0,0,0],[1,0,0],[1,0,1]]},
  {normal:[0,0,1],corners:[[0,0,1],[1,0,1],[1,1,1],[0,1,1]]},
  {normal:[0,0,-1],corners:[[1,0,0],[0,0,0],[0,1,0],[1,1,0]]},
];
export function shapeSurface(shape:Shape,size:number,axis:Axis='x',degrees=0){
  if(!shape.length)return [];
  const center=[0,1,2].map(i=>(Math.min(...shape.map(c=>c[i]))+Math.max(...shape.map(c=>c[i]))+1)/2);
  const occupied=new Set(shape.map(c=>c.join(',')));
  const vertices=shape.flatMap(c=>[0,1].flatMap(x=>[0,1].flatMap(y=>[0,1].map(z=>[c[0]+x-center[0],c[1]+y-center[1],c[2]+z-center[2]] as Cube))));
  // Fixed bounding sphere avoids breathing/zooming as the figure turns.
  const radius=Math.max(...vertices.map(v=>Math.hypot(...v))),scale=(size-12)/(2*radius*Math.sqrt(1.5));
  const faces=[];
  for(const cube of shape)for(let f=0;f<FACES.length;f++){
    const face=FACES[f];
    if(occupied.has(cube.map((v,i)=>v+face.normal[i]).join(',')))continue;
    const normal=turnPoint(face.normal,axis,degrees*Math.PI/180);
    if(normal.reduce((s,v)=>s+v,0)<=1e-7)continue;
    const points3=face.corners.map(p=>turnPoint(p.map((v,i)=>v+cube[i]-center[i]) as Cube,axis,degrees*Math.PI/180));
    const depth=points3.reduce((s,p)=>s+p[0]+p[1]+p[2],0)/4;
    const light=Math.max(0,normal[0]*.3+normal[1]*.8+normal[2]*.5);
    const rgb=[106,79,153].map(v=>Math.round(v+(240-v)*(.12+.55*light)));
    faces.push({id:`${cube.join(',')}:${f}`,depth,fill:`rgb(${rgb.join(',')})`,points:points3.map(([x,y,z])=>[(x-z)*Math.sqrt(3)/2*scale+size/2,(-y+(x+z)/2)*scale+size/2])});
  }
  return faces.sort((a,b)=>a.depth-b.depth);
}
