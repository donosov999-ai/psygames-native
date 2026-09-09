/* psygames-spatial-core-net · VER 1 · 09.09.2026 */
/* LOCAL REV spatial-lab/2026-09-09.2 · psygames-codex-mac · not an app release */
import {board,apply,rng} from './core.mjs';
// NESW bits, bounded board. Positive quarter turns are clockwise. Canonical source.
const dirs=[[-1,0,1,4],[0,1,2,8],[1,0,4,1],[0,-1,8,2]];
export function maskAt(cell){let m=cell.mask;for(let i=0;i<cell.turns;i++)m=((m<<1)&15)|(m>>3);return m;}
export function network(b){
  let leaks=0;const adjacency=b.cells.map(()=>[]);
  for(let i=0;i<b.cells.length;i++){
    const m=maskAt(b.cells[i]),r=Math.floor(i/b.width),c=i%b.width;
    for(const [dr,dc,bit,opposite] of dirs){if(!(m&bit))continue;const nr=r+dr,nc=c+dc,j=nr*b.width+nc;
      if(nr<0||nr>=b.height||nc<0||nc>=b.width||!(maskAt(b.cells[j])&opposite))leaks++;else adjacency[i].push(j);
    }
  }
  const connected=new Set([0]),stack=[0];
  while(stack.length)for(const j of adjacency[stack.pop()])if(!connected.has(j)){connected.add(j);stack.push(j);}
  return {leaks,connected,won:leaks===0&&connected.size===b.cells.length};
}
/** Original randomized DFS tree generator. Reachable, not certified unique. */
export function netPuzzle(seed,{width=5,cycles=0}={}){
  if(!Number.isInteger(width)||width<2||width>6)throw new RangeError('network width');
  if(!Number.isInteger(cycles)||cycles<0||cycles>(width-1)**2)throw new RangeError('cycles');
  const random=rng(seed),target=board(width);target.cells.forEach(c=>c.mask=0);
  const seen=new Set([0]),stack=[0];
  while(stack.length){const i=stack.at(-1),r=Math.floor(i/width),c=i%width;
    const choices=dirs.filter(([dr,dc])=>r+dr>=0&&r+dr<width&&c+dc>=0&&c+dc<width&&!seen.has((r+dr)*width+c+dc));
    if(!choices.length){stack.pop();continue;}
    const [dr,dc,bit,opposite]=choices[Math.floor(random()*choices.length)],j=(r+dr)*width+c+dc;
    target.cells[i].mask|=bit;target.cells[j].mask|=opposite;seen.add(j);stack.push(j);
  }
  // Add exactly the requested number of independent edges to the spanning tree.
  if(cycles){
    const missing=[];
    for(let i=0;i<target.cells.length;i++){
      if(i%width<width-1&&!(target.cells[i].mask&2))missing.push([i,i+1,2,8]);
      if(i<width*(width-1)&&!(target.cells[i].mask&4))missing.push([i,i+width,4,1]);
    }
    for(let k=0;k<cycles;k++){const j=k+Math.floor(random()*(missing.length-k));[missing[k],missing[j]]=[missing[j],missing[k]];const [a,b,bit,opp]=missing[k];target.cells[a].mask|=bit;target.cells[b].mask|=opp;}
  }
  const commands=target.cells.map((_,index)=>({kind:'tile',index,amount:Math.floor(random()*4)}));
  let initial=commands.reduce(apply,target);
  if(network(initial).won){commands.push({kind:'tile',index:0,amount:1});initial=apply(initial,commands.at(-1));}
  return {initial,target,solution:commands.toReversed().map(c=>({...c,amount:-c.amount}))};
}
