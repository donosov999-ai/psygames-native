/* psygames-spatial-core-net-solver · VER 1 · 09.09.2026 */
/* LOCAL REV spatial-lab/2026-09-09.2 · psygames-codex-mac · not an app release */
import {maskAt,network} from './net.mjs';
const dirs=[[-1,0,1,4],[0,1,2,8],[1,0,4,1],[0,-1,8,2]];

/** Exact bounded solver. Counts physical orientations, not equivalent rotations
 * of straight/cross tiles. Does not assume the network must be a tree.
 * Budget exhaustion is explicit: never certify uniqueness from a partial search.
 */
export function solveNetwork(board,{locked=[],limit=2,nodeBudget=100000}={}){
  const {width,height,cells}=board;
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||cells.length!==width*height)throw new RangeError('board');
  if(!Number.isSafeInteger(limit)||limit<2||!Number.isSafeInteger(nodeBudget)||nodeBudget<1)throw new RangeError('search bounds');
  if(cells.some(c=>!Number.isInteger(c.mask)||c.mask<0||c.mask>15||!Number.isInteger(c.turns)||c.turns<0||c.turns>3))throw new RangeError('cell');
  const fixed=new Set(locked);
  if(locked.some(i=>!Number.isInteger(i)||i<0||i>=cells.length))throw new RangeError('locked');
  const neighbors=cells.map((_,i)=>dirs.map(([dr,dc,bit,opp])=>{
    const r=Math.floor(i/width)+dr,c=i%width+dc;
    return {index:r<0||r>=height||c<0||c>=width?-1:r*width+c,bit,opp};
  }));
  const domains=cells.map((cell,i)=>[...new Set((fixed.has(i)?[cell.turns]:[0,1,2,3]).map(turns=>maskAt({...cell,turns})))].filter(m=>neighbors[i].every(n=>n.index>=0||!(m&n.bit))));
  let nodes=0,exhausted=false,decisions=0,maxDepth=0,propagationRounds=0;
  const solutions=[];
  function propagate(ds){
    let changed=true;
    while(changed){
      changed=false;propagationRounds++;
      for(let i=0;i<ds.length;i++){
        const valid=ds[i].filter(m=>neighbors[i].every(n=>n.index<0?!(m&n.bit):ds[n.index].some(other=>!!(m&n.bit)===!!(other&n.opp))));
        if(!valid.length)return false;
        if(valid.length!==ds[i].length){ds[i]=valid;changed=true;}
      }
    }
    // If even possible connections cannot reach a cell, no completion exists.
    const seen=new Set([0]),stack=[0];
    while(stack.length){const i=stack.pop();for(const n of neighbors[i])if(n.index>=0&&!seen.has(n.index)&&ds[i].some(m=>m&n.bit)&&ds[n.index].some(m=>m&n.opp)){seen.add(n.index);stack.push(n.index);}}
    return seen.size===cells.length;
  }
  function visit(ds,depth){
    if(solutions.length>=limit)return;
    if(nodes>=nodeBudget){exhausted=true;return;}
    nodes++;maxDepth=Math.max(maxDepth,depth);
    if(!propagate(ds))return;
    let chosen=-1;
    for(let i=0;i<ds.length;i++)if(ds[i].length>1&&(chosen<0||ds[i].length<ds[chosen].length))chosen=i;
    if(chosen<0){
      const result={width,height,cells:cells.map((c,i)=>({...c,mask:ds[i][0],turns:0}))};
      if(network(result).won)solutions.push(result);
      return;
    }
    decisions++;
    for(const m of ds[chosen]){
      const next=ds.map(d=>[...d]);next[chosen]=[m];visit(next,depth+1);
      if(exhausted||solutions.length>=limit)return;
    }
  }
  visit(domains,0);
  return {solutions,count:solutions.length,exhausted,unique:!exhausted&&solutions.length===1,metrics:{nodes,decisions,maxDepth,propagationRounds}};
}
