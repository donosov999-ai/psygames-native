/* psygames-spatial-core-sixteen-solver · VER 1 · 17.09.2026 */
/* psygames-spatial-claude-mac · задача afb6ab5b · not an app release */
/** Exact breadth-first distances for the 3x3 Sixteen board. One move is one cyclic
 * shift of a row or a column by ±1. Only even permutations are reachable: every
 * shift is a 3-cycle, so the reachable space is 9!/2 = 181440 states and the
 * farthest position is 8 moves away (full BFS, 17.09.2026).
 * Build-time use for large tables; do not build the entire state space on mount.
 */
export const SIXTEEN_3_MOVES=Object.freeze(['row','column'].flatMap(kind=>[0,1,2].flatMap(index=>[1,-1].map(amount=>Object.freeze({kind,index,amount})))));
const permutations=SIXTEEN_3_MOVES.map(({kind,index,amount})=>{
  // permutation[to] = from, the same convention as core.mjs apply()
  const indices=Array.from({length:9},(_,i)=>i);
  for(let i=0;i<3;i++){
    const j=((i+amount)%3+3)%3;
    const from=kind==='row'?index*3+i:i*3+index,to=kind==='row'?index*3+j:j*3+index;
    indices[to]=from;
  }
  return indices;
});
export function slideKey(key,moveIndex){
  if(typeof key!=='string'||key.length!==9||new Set(key).size!==9||!/^[0-8]+$/.test(key))throw new TypeError('3x3 permutation');
  if(!Number.isInteger(moveIndex)||!permutations[moveIndex])throw new RangeError('move');
  return permutations[moveIndex].map(i=>key[i]).join('');
}
export function sixteenDistances({maxDepth=3,nodeBudget=181440}={}){
  if(!Number.isInteger(maxDepth)||maxDepth<0||!Number.isInteger(nodeBudget)||nodeBudget<1)throw new RangeError('bounds');
  const entries=new Map([['012345678',{distance:0,parent:null,move:null}]]),queue=['012345678'];
  let exhausted=false;
  outer:for(let head=0;head<queue.length;head++){
    const key=queue[head],entry=entries.get(key);
    if(entry.distance>=maxDepth)continue;
    for(let move=0;move<permutations.length;move++){
      const next=permutations[move].map(i=>key[i]).join('');
      if(entries.has(next))continue;
      if(entries.size>=nodeBudget){exhausted=true;break outer;}
      entries.set(next,{distance:entry.distance+1,parent:key,move});queue.push(next);
    }
  }
  return {entries,exhausted,maxDepth,solution(key){
    if(!entries.has(key))return null;
    const commands=[];let entry=entries.get(key);
    while(entry.parent!==null){const command=SIXTEEN_3_MOVES[entry.move];commands.push({...command,amount:-command.amount});entry=entries.get(entry.parent);}
    return commands;
  }};
}
