/* psygames-spatial-core-netslide-levels · VER 1 · 17.09.2026 */
/* psygames-spatial-claude-mac · задача afb6ab5b · not an app release */
import {apply,inverse,rng} from './core.mjs';
import {netPuzzle,network} from './net.mjs';

/**
 * «Сеть со сдвигом» на ядре Codex: трубы не поворачиваются, а ездят целыми строками и
 * столбцами по кругу. Цель та же, что у «Сети труб»: вода от источника доходит до каждой
 * трубы, открытых концов нет.
 *
 * ⚠️ ИСТОЧНИК ЕЗДИТ ВМЕСТЕ СО СТРОКОЙ. Это плитка с номером 0, а не клетка в углу:
 * `network(b, start)` считает связность от того места, где плитка сейчас стоит.
 *
 * ⚠️ ОЦЕНКИ «МИНИМУМ ХОДОВ» ЗДЕСЬ НЕТ, И ЭТО ЧЕСТНО. Победа — любая раскладка, где сеть
 * связна, а не одна целевая; поэтому ступень называет число сдвигов, которыми поле
 * перемешано, а не длину кратчайшего решения.
 */
export const NETSLIDE_LEVELS=[
  ...Array.from({length:6},(_,i)=>({level:i+1,width:3,shifts:i+1,guide:i===0})),
  ...Array.from({length:20},(_,i)=>({level:i+7,width:4,shifts:4+i,guide:false})),
  ...Array.from({length:16},(_,i)=>({level:i+27,width:5,shifts:8+i,guide:false})),
  ...Array.from({length:8},(_,i)=>({level:i+43,width:6,shifts:12+i,guide:false})),
];

/** Позиция источника — плитки с номером 0. */
export const sourceAt=b=>b.cells.findIndex(c=>c.id===0);
export const netslideWon=b=>network(b,sourceAt(b)).won;

export function netslideLevel(level,seed){
  const spec=NETSLIDE_LEVELS[level-1];
  if(!Number.isInteger(level)||!spec)throw new RangeError('Netslide level 1..50');
  const random=rng(seed);
  for(let attempt=0;attempt<200;attempt++){
    const {target}=netPuzzle((seed+attempt)>>>0,{width:spec.width});
    let initial=target;const commands=[];
    for(let k=0;commands.length<spec.shifts&&k<spec.shifts*20;k++){
      const cmd={kind:random()<.5?'row':'column',index:Math.floor(random()*spec.width),amount:random()<.5?-1:1};
      const last=commands.at(-1);
      if(last&&last.kind===cmd.kind&&last.index===cmd.index&&last.amount===-cmd.amount)continue;
      // полный оборот одной линией — пустой ход: сдвиг той же линией в ту же сторону не повторяем до длины линии
      const run=commands.slice(-(spec.width-1));
      if(run.length===spec.width-1&&run.every(c=>c.kind===cmd.kind&&c.index===cmd.index&&c.amount===cmd.amount))continue;
      initial=apply(initial,cmd);commands.push(cmd);
    }
    if(commands.length!==spec.shifts||netslideWon(initial))continue;
    const solution=commands.toReversed().map(inverse);
    return {level,seed,spec,initial,target,solution,shifts:spec.shifts,guide:spec.guide?solution[0]:null};
  }
  throw new Error(`Netslide ${level}: no scrambled board within bounded attempts`);
}
