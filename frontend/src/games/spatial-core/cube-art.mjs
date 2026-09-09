/* psygames-spatial-core-cube-art · VER 1 · 09.09.2026 */
/* LOCAL REV spatial-lab/2026-09-09.2 · psygames-codex-mac · not an app release */
/** Deterministic vector artwork. Input is the engine's integer cube coordinates.
 * Projection follows mental-rotation's existing x/right, y/up, z/left convention.
 * No independent rotation math and no hand-drawn substitute for a puzzle shape.
 */
export function cubeFaces(shape,size=240,padding=16){
  if(!shape.length)return [];
  if(!Number.isFinite(size)||size<=2*padding||padding<0)throw new RangeError('size');
  if(shape.some(c=>c.length!==3||c.some(v=>!Number.isSafeInteger(v))))throw new TypeError('integer cubes');
  const occupied=new Set(shape.map(c=>c.join(',')));
  if(occupied.size!==shape.length)throw new TypeError('duplicate cubes');
  const project=([x,y,z])=>[(x-z)*Math.sqrt(3)/2,-y+(x+z)/2];
  const faces=[];
  for(const [x,y,z] of [...shape].sort((a,b)=>a.reduce((s,v)=>s+v,0)-b.reduce((s,v)=>s+v,0))){
    const corners=[[x,y,z],[x+1,y,z],[x+1,y+1,z],[x,y+1,z],[x,y,z+1],[x+1,y,z+1],[x+1,y+1,z+1],[x,y+1,z+1]];
    const visible=[{kind:'top',neighbor:[x,y+1,z],indices:[3,2,6,7]}, {kind:'front',neighbor:[x,y,z+1],indices:[4,5,6,7]}, {kind:'right',neighbor:[x+1,y,z],indices:[1,5,6,2]}];
    for(const f of visible)if(!occupied.has(f.neighbor.join(',')))faces.push({cube:[x,y,z],kind:f.kind,points:f.indices.map(i=>project(corners[i]))});
  }
  const all=faces.flatMap(f=>f.points),xs=all.map(p=>p[0]),ys=all.map(p=>p[1]);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const scale=(size-2*padding)/Math.max(maxX-minX,maxY-minY);
  return faces.map(f=>({...f,points:f.points.map(([x,y])=>[(x-(minX+maxX)/2)*scale+size/2,(y-(minY+maxY)/2)*scale+size/2])}));
}
export function cubeSvg(shape,size=240){
  const colors={top:['#e0d4ff','#b6a0ec'],front:['#b4a0e0','#8c75b8'],right:['#917bbe','#68518f']};
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="Фигура из ${shape.length} кубиков"><defs>${Object.entries(colors).map(([k,c])=>`<linearGradient id="${k}" x2="0.7" y2="1"><stop stop-color="${c[0]}"/><stop offset="1" stop-color="${c[1]}"/></linearGradient>`).join('')}</defs>${cubeFaces(shape,size).map(f=>`<polygon data-cube="${f.cube.join(',')}" points="${f.points.map(p=>p.join(',')).join(' ')}" fill="url(#${f.kind})" stroke="#65517e" stroke-width="1.3" stroke-linejoin="round"/>`).join('')}</svg>`;
}
