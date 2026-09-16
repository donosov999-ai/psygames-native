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
/**
 * `ghost` — кубики фигуры, которые рисуются ПУСТЫМИ: контур без заливки. Так режим
 * «Недостающая часть» показывает место отсутствующего куска прямо на фигуре
 * (16.09.2026, задача 5a1b4d25). Грань сплошного кубика, смотрящая в пустоту,
 * рисуется — это стенка, к которой прилегает кусок; грани между пустыми кубиками — нет.
 */
/**
 * `unit` — сколько пикселей на ребро кубика. Не задан — масштаб по описанной сфере фигуры:
 * так рисунок не «дышит», пока фигура крутится. Задан — рисунок центрируется по своему
 * контуру и не тратит место на запас под поворот; так рисуются НЕПОДВИЖНЫЕ варианты
 * ответа (замер 17.09.2026: по сфере рисунок занимал 53–84 % своего квадрата).
 */
export function shapeSurface(shape:Shape,size:number,axis:Axis='x',degrees=0,ghost:Shape=[],unit?:number){
  if(!shape.length)return [];
  const center=[0,1,2].map(i=>(Math.min(...shape.map(c=>c[i]))+Math.max(...shape.map(c=>c[i]))+1)/2);
  const occupied=new Set(shape.map(c=>c.join(',')));
  const empty=new Set(ghost.map(c=>c.join(',')));
  const solid=new Set([...occupied].filter(k=>!empty.has(k)));
  const vertices=shape.flatMap(c=>[0,1].flatMap(x=>[0,1].flatMap(y=>[0,1].map(z=>[c[0]+x-center[0],c[1]+y-center[1],c[2]+z-center[2]] as Cube))));
  // Fixed bounding sphere avoids breathing/zooming as the figure turns.
  const radius=Math.max(...vertices.map(v=>Math.hypot(...v))),scale=(size-12)/(2*radius*Math.sqrt(1.5));
  const faces=[];
  for(const cube of shape)for(let f=0;f<FACES.length;f++){
    const face=FACES[f],isGhost=empty.has(cube.join(','));
    if((isGhost?occupied:solid).has(cube.map((v,i)=>v+face.normal[i]).join(',')))continue;
    const normal=turnPoint(face.normal,axis,degrees*Math.PI/180);
    if(normal.reduce((s,v)=>s+v,0)<=1e-7)continue;
    const points3=face.corners.map(p=>turnPoint(p.map((v,i)=>v+cube[i]-center[i]) as Cube,axis,degrees*Math.PI/180));
    const depth=points3.reduce((s,p)=>s+p[0]+p[1]+p[2],0)/4;
    const light=Math.max(0,normal[0]*.3+normal[1]*.8+normal[2]*.5);
    const rgb=[106,79,153].map(v=>Math.round(v+(240-v)*(.12+.55*light)));
    faces.push({id:`${cube.join(',')}:${f}`,depth,ghost:isGhost,fill:`rgb(${rgb.join(',')})`,points:points3.map(([x,y,z])=>[(x-z)*Math.sqrt(3)/2,(-y+(x+z)/2)])});
  }
  if(unit===undefined){
    for(const face of faces)face.points=face.points.map(([x,y])=>[x*scale+size/2,y*scale+size/2]);
  }else{
    const xs=faces.flatMap(f=>f.points.map(p=>p[0])),ys=faces.flatMap(f=>f.points.map(p=>p[1]));
    const cx=(Math.min(...xs)+Math.max(...xs))/2,cy=(Math.min(...ys)+Math.max(...ys))/2;
    for(const face of faces)face.points=face.points.map(([x,y])=>[(x-cx)*unit+size/2,(y-cy)*unit+size/2]);
  }
  return faces.sort((a,b)=>a.depth-b.depth);
}

/**
 * Общий масштаб для НАБОРА неподвижных фигур: крупнейший, при котором каждая целиком
 * вписывается в квадрат `size` с полями `margin`. Общий, а не свой у каждой: одинаковый
 * размер кубика у двух вариантов выдавал бы пару «верная фигура + её зеркало» — у них
 * один и тот же габарит, а у остальных подделок другой.
 */
export function stillUnit(shapes:Shape[],size:number,margin=6):number{
  let best=Infinity;
  for(const shape of shapes){
    const faces=shapeSurface(shape,size,'x',0,[],1);
    const xs=faces.flatMap(f=>f.points.map(p=>p[0])),ys=faces.flatMap(f=>f.points.map(p=>p[1]));
    const w=Math.max(...xs)-Math.min(...xs),h=Math.max(...ys)-Math.min(...ys);
    if(w>0&&h>0)best=Math.min(best,(size-2*margin)/w,(size-2*margin)/h);
  }
  return Number.isFinite(best)?best:1;
}
