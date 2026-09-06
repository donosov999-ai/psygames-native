/**
 * 🔴 СТУПЕНЬ В ПЛАНЕ УРОВНЯ — ЭТО НОВАЯ МЕХАНИКА. ЕЁ ОБЯЗАНЫ ОБЪЯСНИТЬ.
 *
 * ЗАЧЕМ. Величина, которая растёт плавно (скорость, длина ряда, число проб), —
 * это сложность: объяснять нечего, человек чувствует её сам. А величина, которая
 * СКАЧЕТ между двумя-тремя значениями, — это переключатель: на каком-то уровне
 * в игре появляется то, чего не было. Если про это нигде не сказано, игрок
 * узнаёт о механике, натыкаясь на неё.
 *
 * Сортировка товаров прожила так полтора месяца со скрытой информацией и
 * четверо суток с двумя целями; `level-rule-threshold` теперь сторожит, чтобы
 * номер в правиле совпадал с порогом в коде. Но он проверяет только те механики,
 * у которых правило УЖЕ есть. Эта проба ищет обратное: ступень, у которой
 * правила нет вовсе.
 *
 * ⚠️ КАК ОТЛИЧАЕТСЯ СТУПЕНЬ ОТ РОСТА — ЧИСЛОМ, А НЕ ГЛАЗОМ. Прогоняем план
 * уровня по L1…L40 и считаем, сколько РАЗНЫХ значений принимает каждое поле.
 * Два-три значения за сорок уровней — переключатель. Двадцать — плавный рост.
 *
 * 🔴 НАЙДЕНО ПРИ ЗАВЕДЕНИИ (06.09.2026), ОБА В ЧУЖИХ ЗОНАХ:
 *   · `memory-matrix`: с L11 показываются ДВЕ серии разного цвета вместо одной
 *     (`seriesCount`), правила нет — есть только `grid6` (L4) и `fast` (L8);
 *   · `cpt`: с L6 задача меняется с «жми на X» на «жми на X после A» (`mode`),
 *     правила нет — есть только `lookalike` (L11) про похожие буквы.
 * Обе внесены в долг поимённо: проба держит линию, чтобы НОВЫХ не появлялось,
 * а эти две чинят владельцы игр.
 */
import { levelParams as corsi } from '@/app/games/corsi';
import { levelParams as digitSpan } from '@/app/games/digit-span';
import { levelParams as hanoi } from '@/app/games/hanoi';
import { levelParams as listening } from '@/app/games/listening-span';
import { levelParams as matrix } from '@/app/games/memory-matrix';
import { levelParams as nback } from '@/app/games/n-back';
import { levelParams as ospan } from '@/app/games/ospan';
import { levelParams as echo } from '@/app/games/pseudoword-echo';
import { levelParams as semantic } from '@/app/games/semantic-sort';
import { levelParams as setGame } from '@/app/games/set-game';
import { levelParams as spatial } from '@/app/games/spatial-span';
import { levelParams as wordPairs } from '@/app/games/word-pairs';
import { levelParams as cpt } from '@/app/games/cpt';
import { levelCfg as pairs } from '@/app/games/picture-pairs';

const ПЛАНЫ: Record<string, (L: number) => Record<string, unknown>> = {
  corsi, 'digit-span': digitSpan, hanoi, 'listening-span': listening, 'memory-matrix': matrix,
  'n-back': nback, ospan, 'pseudoword-echo': echo, 'semantic-sort': semantic, 'set-game': setGame,
  'spatial-span': spatial, 'word-pairs': wordPairs, cpt, 'picture-pairs': pairs,
};

/**
 * Ступени, у которых объяснение ЕСТЬ или которое не нужно. Поимённо и с
 * причиной: «исключение без объяснения» через месяц читается как «тут почему-то
 * нельзя», и его никто не снимает.
 */
interface Ступень { на: number[]; зачем: string }

/**
 * Ступени, у которых объяснение ЕСТЬ или не нужно. Записывается НЕ имя поля, а
 * УРОВНИ, на которых оно скачет, и причина.
 *
 * 🔴 ПОЧЕМУ УРОВНИ, А НЕ ИМЯ. Первая редакция ключевалась именем поля, и две
 * мутации её пережили: `hardMath` с `level >= 6` на `level >= 6 && level < 20`
 * и `gridSize` с двумя значениями на три. Поле то же, имя то же — а в игре
 * появилась НОВАЯ ступень, о которой снова никто не сказал. Список уровней
 * ловит и это.
 */
const ОБЪЯСНЕНО: Record<string, Ступень> = {
  'corsi.reverse': { на: [10], зачем: 'правило `reverse` с L10 — тот же порог' },
  'digit-span.reverse': { на: [11], зачем: 'правило `reverse` с L11 — тот же порог' },
  'hanoi.pegs': { на: [5, 10], зачем: 'правила `pegs4` (L5–L9) и `pegs5` (L10+)' },
  'memory-matrix.gridSize': { на: [2, 3, 4], зачем: 'правило `grid6` с L4; до него сетка растёт 3→4→5, и это рост, а не механика' },
  'n-back.modality': { на: [9], зачем: 'правило `dual` с L9 — с него подключается звуковой канал' },
  'n-back.showMs': { на: [6, 7, 8, 9], зачем: 'скорость показа — сложность, а не новая механика' },
  'n-back.gapMs': { на: [6, 7, 8, 9], зачем: 'пауза между стимулами — та же скорость' },
  'ospan.hardMath': { на: [6], зачем: 'правило `hardmath` с L6' },
  'pseudoword-echo.lenMin': { на: [5, 9], зачем: 'правила `longer6` (L5) и `longer8` (L9)' },
  'pseudoword-echo.lenMax': { на: [5, 9], зачем: 'та же длина слова, второй её конец' },
  'pseudoword-echo.trials': { на: [5, 9], зачем: 'число проб за партию — объём, а не механика' },
  'semantic-sort.catsPerRound': { на: [4, 9], зачем: 'правила `three` (L4) и `four` (L9)' },
  'semantic-sort.roundsCount': { на: [6, 11], зачем: 'число раундов — объём, а не механика' },
  'spatial-span.gridSize': { на: [11], зачем: 'правило `grid5` с L11' },
  'picture-pairs.groupSize': { на: [10, 13], зачем: 'правила `triple` (L10–L12) и `quad` (L13+)' },
};

/**
 * 🔴 ДОЛГ: ступени БЕЗ объяснения, найденные при заведении пробы. Обе в чужих
 * зонах, чинят владельцы игр. Проба держит линию: новых появиться не должно.
 */
const ДОЛГ: Record<string, Ступень> = {
  'memory-matrix.seriesCount': { на: [11], зачем: 'с L11 показываются ДВЕ серии разного цвета вместо одной, правила нет (есть grid6 L4 и fast L8) — механика идёт молча' },
  'cpt.mode': { на: [6], зачем: 'с L6 задача меняется с «жми на X» на «жми на X после A», правила нет (есть только lookalike L11 про похожие буквы) — это смена самой пробы, а не сложности' },
};

const LEVELS = Array.from({ length: 40 }, (_, i) => i + 1);

/**
 * Поля-переключатели: 2–5 разных значений за сорок уровней. Больше — плавный
 * рост. Возвращает и УРОВНИ, на которых значение меняется: имя поля само по
 * себе новую ступень внутри него не покажет.
 */
function ступени(f: (L: number) => Record<string, unknown>): Map<string, number[]> {
  const значения = new Map<string, Set<string>>();
  const скачки = new Map<string, number[]>();
  let пред: Record<string, unknown> | null = null;
  for (const L of LEVELS) {
    const p = f(L) ?? {};
    for (const [k, v] of Object.entries(p)) {
      if (!значения.has(k)) { значения.set(k, new Set()); скачки.set(k, []); }
      (значения.get(k) as Set<string>).add(JSON.stringify(v));
      if (пред && JSON.stringify(пред[k]) !== JSON.stringify(v)) (скачки.get(k) as number[]).push(L);
    }
    пред = p;
  }
  const out = new Map<string, number[]>();
  for (const [k, v] of значения) if (v.size >= 2 && v.size <= 5) out.set(k, скачки.get(k) as number[]);
  return out;
}

describe('ступень в плане уровня объяснена', () => {
  it('есть что проверять — планы читаются и ступени находятся', () => {
    expect(Object.keys(ПЛАНЫ).length).toBeGreaterThanOrEqual(14);
    const всего = Object.values(ПЛАНЫ).reduce((n, f) => n + ступени(f).size, 0);
    expect(всего).toBeGreaterThan(10);
  });

  it('🔴 каждая ступень объяснена или стоит в долге — И НА ТЕХ ЖЕ УРОВНЯХ', () => {
    const молча: string[] = [];
    for (const [игра, f] of Object.entries(ПЛАНЫ)) {
      for (const [поле, уровни] of ступени(f)) {
        const адрес = `${игра}.${поле}`;
        const запись = ОБЪЯСНЕНО[адрес] ?? ДОЛГ[адрес];
        if (!запись) { молча.push(`${адрес}: величина скачет на L${уровни.join(',L')}, а объяснения нет`); continue; }
        // 🔴 Уровни сверяются, а не только имя: новая ступень внутри известного
        // поля — это тоже новая механика, о которой снова никто не сказал.
        if (запись.на.join(',') !== уровни.join(',')) {
          молча.push(`${адрес}: скачет на L${уровни.join(',L')}, а объяснено для L${запись.на.join(',L')}`);
        }
      }
    }
    expect(молча).toEqual([]);
  });

  it('долг не протух: каждая запись всё ещё ступень, а не выдумка', () => {
    const мимо = Object.keys(ДОЛГ).filter((адрес) => {
      const [игра, поле] = адрес.split('.');
      const f = ПЛАНЫ[игра as string];
      return !f || !ступени(f).has(поле as string);
    });
    expect(мимо).toEqual([]);
  });

  /**
   * Причина обязана быть причиной, а не словом. Порог в 12 знаков отсекает
   * «скорость» и «объём» — но именно они и есть настоящие причины для полей,
   * которые меняются плавно. Поэтому короткие принимаются, если названы явно.
   */
  it('причины названы, а не оставлены пустыми', () => {
    const короткие = [...Object.entries(ОБЪЯСНЕНО), ...Object.entries(ДОЛГ)]
      .filter(([, п]) => п.зачем.trim().length < 20)
      .map(([а]) => `${а}: причина короче двадцати знаков`);
    expect(короткие).toEqual([]);
    // У долга требование строже: он про НЕПОЧИНЕННОЕ, и там нужен разбор.
    const слабые = Object.entries(ДОЛГ)
      .filter(([, п]) => п.зачем.trim().length < 60)
      .map(([а]) => `${а}: долг без разбора, одной фразы мало`);
    expect(слабые).toEqual([]);
  });
});
