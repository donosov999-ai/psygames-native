/* psygames-spatial-core-snapshot · VER 2 · 17.09.2026 */
/* LOCAL REV spatial-lab/2026-09-09.2 · psygames-codex-mac · not an app release */
/* VER 2 — psygames-spatial-claude-mac, задача afb6ab5b: «Сдвиг чисел» и «Сеть со сдвигом». */
import {session,commit,replay,scramble} from './core.mjs';
import {netPuzzle} from './net.mjs';
import {netLevel} from './net-levels.mjs';
import {twiddleLevel} from './twiddle-levels.mjs';
import {sixteenLevel} from './sixteen-levels.mjs';
import {netslideLevel} from './netslide-levels.mjs';

/** Четыре упражнения лаборатории. Порядок — порядок вкладок на экране. */
export const SPATIAL_MODES=['twiddle','net','sixteen','netslide'];
/** Упражнения сдвига: ход — строка или столбец по кругу, а не поворот плитки или блока. */
export const shifts=mode=>mode==='sixteen'||mode==='netslide';
/**
 * Свободная игра упражнений сдвига — поле ступени 15 (4×4), как у «Поворота чисел» и «Сети
 * труб», где свободная раздача тоже 4×4. Своего генератора «без уровня» у них нет и не нужно:
 * ступень уже гарантирует, что поле перемешано и решаемо.
 */
const FREE_LEVEL=15;

function levelTask(mode,level,seed){
  if(mode==='net')return netLevel(level,seed);
  const make=mode==='twiddle'?twiddleLevel:mode==='sixteen'?sixteenLevel:netslideLevel;
  return {...make(level,seed),locked:[],highlighted:[]};
}
function freeBoard(mode,seed){
  if(mode==='net')return netPuzzle(seed).initial;
  if(mode==='twiddle')return scramble(seed).initial;
  return (mode==='sixteen'?sixteenLevel:netslideLevel)(FREE_LEVEL,seed).initial;
}
/**
 * Выбор при раздаче. У блока — его левая верхняя клетка; у подсказанного сдвига — клетка на
 * подсказанной линии: строка index → клетка (index, 0), столбец index → клетка (0, index).
 * Экран выделяет строку И столбец выбранной клетки, так что подсказанная линия видна.
 */
export function createDeal(mode,seed,level=0){
  const task=level?levelTask(mode,level,seed):null;
  const initial=task?.initial??freeBoard(mode,seed);
  const guide=task?.guide,n=initial.width;
  const selection=guide?.kind==='block'?guide.row*n+guide.col
    :guide?.kind==='row'?guide.index*n
    :guide?.kind==='column'?guide.index
    :task?.highlighted[0]??0;
  return {task,state:session(initial),selection};
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
    if(d?.version!==1||!SPATIAL_MODES.includes(d.mode)||!integer(d.seed,0,0xffffffff)||!integer(d.level,0,50))return null;
    if(!Array.isArray(d.past)||!Array.isArray(d.future)||d.past.length+d.future.length>4000)return null;
    const deal=createDeal(d.mode,d.seed,d.level),n=deal.state.initial.width;
    if(!integer(d.selection,0,n*n-1)||d.mode==='twiddle'&&(d.selection%n>=n-1||Math.floor(d.selection/n)>=n-1))return null;
    if(deal.task?.locked.includes(d.selection))return null;
    const legal=c=>c&&[-1,1].includes(c.amount)&&(d.mode==='net'
      ?c.kind==='tile'&&integer(c.index,0,n*n-1)&&!deal.task?.locked.includes(c.index)
      :d.mode==='twiddle'
        ?c.kind==='block'&&c.size===2&&!c.orient&&integer(c.row,0,n-2)&&integer(c.col,0,n-2)
        :(c.kind==='row'||c.kind==='column')&&integer(c.index,0,n-1));
    if(![...d.past,...d.future].every(legal))return null;
    for(const c of d.past)deal.state=commit(deal.state,c);
    replay(deal.state.present,d.future); // future must also be executable
    deal.state.future=structuredClone(d.future);
    const completed={net:[],twiddle:[],sixteen:[],netslide:[]};
    for(const mode of SPATIAL_MODES){
      const values=d.completed?.[mode];
      // Сохранение до 17.09.2026 знает только два упражнения: у сдвигов ключа нет — это не порча.
      if(values===undefined&&shifts(mode))continue;
      if(!Array.isArray(values)||values.length>50||!values.every(v=>integer(v,1,50)))return null;
      completed[mode]=[...new Set(values)].sort((a,b)=>a-b);
    }
    return {...deal,mode:d.mode,seed:d.seed,level:d.level,selection:d.selection,completed};
  }catch{return null;}
}
