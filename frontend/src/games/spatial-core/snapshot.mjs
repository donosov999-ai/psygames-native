/* psygames-spatial-core-snapshot · VER 1 · 09.09.2026 */
/* LOCAL REV spatial-lab/2026-09-09.2 · psygames-codex-mac · not an app release */
import {session,commit,replay,scramble} from './core.mjs';
import {netPuzzle} from './net.mjs';
import {netLevel} from './net-levels.mjs';
import {twiddleLevel} from './twiddle-levels.mjs';

export function createDeal(mode,seed,level=0){
  const task=level?(mode==='net'?netLevel(level,seed):{...twiddleLevel(level,seed),locked:[],highlighted:[]}):null;
  const initial=task?.initial??(mode==='net'?netPuzzle(seed):scramble(seed)).initial;
  const guide=task?.guide;
  return {task,state:session(initial),selection:guide?.kind==='block'?guide.row*initial.width+guide.col:task?.highlighted[0]??0};
}
const integer=(x,min,max)=>Number.isSafeInteger(x)&&x>=min&&x<=max;
export function encodeSnapshot({mode,seed,level,selection,state,completed}){
  return JSON.stringify({version:1,mode,seed,level,selection,past:state.past,future:state.future,completed});
}
/** Never trust stored present/targets. Rebuild the deterministic initial board
 * and replay validated legal commands. Invalid data is returned as null, not deleted. */
export function decodeSnapshot(raw){
  try{
    if(typeof raw!=='string'||raw.length>500000)return null;
    const d=JSON.parse(raw);
    if(d?.version!==1||!['net','twiddle'].includes(d.mode)||!integer(d.seed,0,0xffffffff)||!integer(d.level,0,50))return null;
    if(!Array.isArray(d.past)||!Array.isArray(d.future)||d.past.length+d.future.length>4000)return null;
    const deal=createDeal(d.mode,d.seed,d.level),n=deal.state.initial.width;
    if(!integer(d.selection,0,n*n-1)||d.mode==='twiddle'&&(d.selection%n>=n-1||Math.floor(d.selection/n)>=n-1))return null;
    if(deal.task?.locked.includes(d.selection))return null;
    const legal=c=>c&&[-1,1].includes(c.amount)&&(d.mode==='net'
      ?c.kind==='tile'&&integer(c.index,0,n*n-1)&&!deal.task?.locked.includes(c.index)
      :c.kind==='block'&&c.size===2&&!c.orient&&integer(c.row,0,n-2)&&integer(c.col,0,n-2));
    if(![...d.past,...d.future].every(legal))return null;
    for(const c of d.past)deal.state=commit(deal.state,c);
    replay(deal.state.present,d.future); // future must also be executable
    deal.state.future=structuredClone(d.future);
    const completed={net:[],twiddle:[]};
    for(const mode of ['net','twiddle']){
      const values=d.completed?.[mode];
      if(!Array.isArray(values)||values.length>50||!values.every(v=>integer(v,1,50)))return null;
      completed[mode]=[...new Set(values)].sort((a,b)=>a-b);
    }
    return {...deal,mode:d.mode,seed:d.seed,level:d.level,selection:d.selection,completed};
  }catch{return null;}
}
