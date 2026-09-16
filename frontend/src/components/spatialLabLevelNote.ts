/* psygames-spatial-lab-level-note · VER 2 · 17.09.2026 */
/* psygames-spatial-claude-mac · приёмка 50b87961 */
import type {SpatialMode,SpatialTask} from '../games/spatial-core/snapshot.mjs';

const TWIDDLE_OPENING=['spatialLabTwiddleL1','spatialLabTwiddleL2','spatialLabTwiddleL3','spatialLabTwiddleL4','spatialLabTwiddleL5'];
const NET_OPENING=['spatialLabNetL1','spatialLabNetL2','spatialLabNetL3','spatialLabNetL4','spatialLabNetL5'];

/**
 * 🔴 ОПИСАНИЕ УРОВНЯ — ИЗ ЧИСЕЛ ЗАДАЧИ, НА ЯЗЫКЕ ИГРОКА (16.09.2026).
 *
 * Экран показывал `spec.change` из ядра как есть, а это русская заметка разработчика.
 * Замер на английском экране: уровень 1 — «Один поворот указанного блока; направление
 * показано.», уровень 15 — «суммарное смещение 42 клеток, нижняя оценка 11 ходов».
 * Кириллица на любом языке и слова, которые игроку ничего не говорят.
 *
 * Числа берутся у самой задачи (`minimumMoves`, `lowerBound`) и у её спецификации —
 * те же, по которым ядро её собрало, поэтому текст не разойдётся с генератором.
 * Ядро не трогаем: `change` остаётся его рабочей заметкой.
 *
 * ⚠️ Число стоит после двоеточия, как в «Открытых концов: {n}»: склонять его
 * в двенадцати языках нечем, а «42 клеток» — ровно то, что было на экране.
 */
/**
 * Предложения склеиваются пробелом — но не после «。»: в китайском и японском его там не ставят.
 * Живой замер 16.09.2026 на японском экране дал «6か所以上。 ネットワーク内の閉じた輪».
 */
const склеить=(части:string[])=>части.filter(Boolean).reduce((всё,часть)=>!всё?часть:/[。！？]$/.test(всё)?всё+часть:`${всё} ${часть}`,'');

/**
 * Упражнения сдвига (17.09.2026, задача afb6ab5b).
 * «Сдвиг чисел» говорит те же числа, что «Поворот чисел»: ход здесь — сдвиг линии, а подписи
 * «Ходов в самом коротком решении» и «Ходов — не меньше» про ход вообще. Своя только первая
 * ступень: там выделен не блок, а линия.
 * «Сеть со сдвигом» минимума не знает — победа любая связная раскладка, а не одна. Поэтому
 * ступень называет, СКОЛЬКИМИ сдвигами поле перемешано, и не выдаёт это за длину решения.
 */
function shiftNote(task:SpatialTask,mode:'sixteen'|'netslide',t:(key:string)=>string,w:(s:string)=>string):string{
  if(task.level===1)return t('spatialLabShiftL1');
  if(mode==='netslide')return w(t('spatialLabNetslideShifts')).replace('{s}',String('shifts' in task?task.shifts:''));
  if(!('minimumMoves' in task))return '';
  return task.minimumMoves!==null
    ?w(t('spatialLabTwiddleExact')).replace('{n}',String(task.minimumMoves))
    :w(t('spatialLabTwiddleBound')).replace('{d}',String(task.spec.displacement)).replace('{m}',String(task.lowerBound));
}

export function levelNote(task:SpatialTask,t:(key:string)=>string,mode?:SpatialMode):string{
  const w=(s:string)=>s.replace(/\{w\}/g,String(task.spec.width));
  if(mode==='sixteen'||mode==='netslide')return shiftNote(task,mode,t,w);
  if('minimumMoves' in task&&'liveColour' in task.spec){
    if(task.level<=TWIDDLE_OPENING.length)return t(TWIDDLE_OPENING[task.level-1]);
    const main=task.minimumMoves!==null
      ?w(t('spatialLabTwiddleExact')).replace('{n}',String(task.minimumMoves))
      :w(t('spatialLabTwiddleBound')).replace('{d}',String(task.spec.displacement)).replace('{m}',String(task.lowerBound));
    return склеить([main,task.spec.liveColour?'':t('spatialLabTwiddleNoColour')]);
  }
  if(!('repair' in task.spec))return '';
  if(task.level<=NET_OPENING.length)return t(NET_OPENING[task.level-1]);
  const {affected,junctions,cycles,liveColour}=task.spec;
  return склеить([
    w(t('spatialLabNetPatch')).replace('{a}',String(affected)).replace('{j}',String(junctions)),
    cycles?t('spatialLabNetLoops').replace('{c}',String(cycles)):'',
    liveColour?'':t('spatialLabNetNoColour'),
  ]);
}
