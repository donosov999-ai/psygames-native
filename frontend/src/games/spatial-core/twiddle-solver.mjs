/* psygames-spatial-core-twiddle-solver · VER 1 · 09.09.2026 */
/* LOCAL REV spatial-lab/2026-09-09.2 · psygames-codex-mac · not an app release */
/** Exact breadth-first distances for the 3x3 board. One move is one ±90° turn.
 * Build-time use for large tables; do not build the entire state space on mount.
 */
export const TWIDDLE_3_MOVES=Object.freeze([0,1].flatMap(row=>[0,1].flatMap(col=>[1,-1].map(amount=>Object.freeze({kind:'block',row,col,size:2,amount})))));
const permutations=TWIDDLE_3_MOVES.map(({row,col,amount})=>{
  const indices=Array.from({length:9},(_,i)=>i);
  const a=row*3+col,b=a+1,c=a+3,d=c+1;
  if(amount===1){indices[a]=c;indices[b]=a;indices[d]=b;indices[c]=d;}
  else{indices[a]=b;indices[b]=d;indices[d]=c;indices[c]=a;}
  return indices;
});
export function turnKey(key,moveIndex){
  if(typeof key!=='string'||key.length!==9||new Set(key).size!==9||!/^[0-8]+$/.test(key))throw new TypeError('3x3 permutation');
  if(!Number.isInteger(moveIndex)||!permutations[moveIndex])throw new RangeError('move');
  return permutations[moveIndex].map(i=>key[i]).join('');
}
export function twiddleDistances({maxDepth=3,nodeBudget=362880}={}){
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
    while(entry.parent!==null){const command=TWIDDLE_3_MOVES[entry.move];commands.push({...command,amount:-command.amount});entry=entries.get(entry.parent);}
    return commands;
  }};
}
