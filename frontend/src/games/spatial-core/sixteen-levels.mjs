/* psygames-spatial-core-sixteen-levels · VER 1 · 17.09.2026 */
/* psygames-spatial-claude-mac · задача afb6ab5b · not an app release */
import {board,rng,apply,inverse} from './core.mjs';
import {SIXTEEN_3_MOVES} from './sixteen-solver.mjs';
import {SIXTEEN_BANK} from './sixteen-bank.mjs';

/**
 * «Шестнадцать» на ядре Codex: строку или столбец сдвигают циклически на одну клетку,
 * числа надо расставить по порядку.
 *
 * Лестница по замеру полного обхода 3×3 (17.09.2026): достижимы 181 440 позиций, самая
 * дальняя — 8 ходов. Поэтому на 3×3 ровно восемь ступеней с ТОЧНОЙ дистанцией, дальше
 * доска растёт, а сложность задаёт суммарный циклический сдвиг чисел от своих мест.
 *
 * ⚠️ СТЫКИ ПО ЗАМЕРУ, А НЕ ОТ НУЛЯ. Первая версия начинала 4×4 со сдвига 8 — нижняя оценка
 * 2 хода, то есть 9-я ступень была легче 8-й (ровно 8 ходов). Замер сборки 17.09.2026:
 * 4×4 собирается надёжно до сдвига 56 (оценка 14–15), дальше 2 задания из 6; 5×5 — до 92
 * (оценка 19–20), 96 — 1 из 6. Отсюда 4×4: 18…56, 5×5: 50…92.
 */
export const SIXTEEN_LEVELS=[
  ...Array.from({length:8},(_,i)=>({level:i+1,width:3,distance:i+1,guide:i===0})),
  ...Array.from({length:20},(_,i)=>({level:i+9,width:4,displacement:18+i*2,guide:false})),
  ...Array.from({length:22},(_,i)=>({level:i+29,width:5,displacement:50+i*2,guide:false})),
];

/**
 * Суммарный циклический сдвиг и НИЖНЯЯ ОЦЕНКА числа ходов.
 * Сдвиг строки двигает ровно `width` чисел на одну клетку по горизонтали, поэтому сумма
 * горизонтальных расстояний меняется за ход не больше чем на `width`; столбец — так же по
 * вертикали. Отсюда оценка ceil(гориз/width) + ceil(верт/height) — это нижняя граница, а не
 * длина решения.
 */
export function sixteenDisplacement(b){
  let across=0,down=0;
  b.cells.forEach((c,i)=>{
    const col=i%b.width,row=Math.floor(i/b.width),tc=c.id%b.width,tr=Math.floor(c.id/b.width);
    const dc=Math.abs(col-tc),dr=Math.abs(row-tr);
    across+=Math.min(dc,b.width-dc);down+=Math.min(dr,b.height-dr);
  });
  return {total:across+down,lowerBound:Math.ceil(across/b.width)+Math.ceil(down/b.height)};
}

export function sixteenLevel(level,seed){
  const spec=SIXTEEN_LEVELS[level-1];
  if(!Number.isInteger(level)||!spec)throw new RangeError('Sixteen level 1..50');
  const random=rng(seed);
  if(spec.width===3){
    const candidates=SIXTEEN_BANK.filter(t=>t.distance===spec.distance),chosen=candidates[Math.floor(random()*candidates.length)];
    const initial=board(3);initial.cells=Array.from(chosen.key,ch=>({id:Number(ch),turns:0}));
    const solution=chosen.solution.map(i=>({...SIXTEEN_3_MOVES[i]}));
    return {level,seed,spec,initial,solution,minimumMoves:spec.distance,guide:spec.guide?solution[0]:null};
  }
  // Bounded seeded walk toward the target displacement; loop erasure keeps the recovery route finite.
  const lines=spec.width;
  let initial=board(spec.width),route=[],keys=[initial.cells.map(c=>c.id).join(',')];
  for(let step=0;step<40000;step++){
    if(step%2000===0){initial=board(spec.width);route=[];keys=[initial.cells.map(c=>c.id).join(',')];}
    const cmd={kind:random()<.5?'row':'column',index:Math.floor(random()*lines),amount:random()<.5?-1:1};
    if(route.length){const last=route.at(-1);if(last.kind===cmd.kind&&last.index===cmd.index&&last.amount===-cmd.amount)continue;}
    const candidate=apply(initial,cmd);
    if(Math.abs(sixteenDisplacement(candidate).total-spec.displacement)>Math.abs(sixteenDisplacement(initial).total-spec.displacement)&&random()>.1)continue;
    initial=candidate;
    const key=initial.cells.map(c=>c.id).join(','),seen=keys.indexOf(key);
    if(seen>=0){route=route.slice(0,seen);keys=keys.slice(0,seen+1);}
    else{route.push(cmd);keys.push(key);}
    const d=sixteenDisplacement(initial);
    if(d.total===spec.displacement)return {level,seed,spec,initial,solution:route.toReversed().map(inverse),minimumMoves:null,lowerBound:d.lowerBound,guide:null};
  }
  throw new Error(`Sixteen ${level}: bounded generation exhausted`);
}
