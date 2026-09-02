/* psygames-game-sudoku-fractal · VER 4 · 28.08.2026 */
/**
 * Фрактальная судоку — сетка, вложенная сама в себя.
 *
 * ЗАЧЕМ. Разобрано по фото карточки, которые прислал Денис 12.08. Идея: за клеткой
 * верхней сетки спрятана целая судоку. Решаешь снизу вверх, слой за слоем, пока не
 * вскроешь корневую. Как мега-босс — событие на несколько часов, а не на десять минут.
 *
 * ⚠️ ГЛАВНОЕ ОТЛИЧИЕ ОТ ОБЫЧНОЙ СУДОКУ — ЗАЧЕМ ВООБЩЕ РЕШАТЬ НИЖНИЕ. Девять дочерних
 * сеток не декорация: центр каждой — это цифра, которой не хватает в корне. Пока не
 * решишь дочернюю хотя бы до порога, соответствующая клетка корня остаётся пустой и
 * закрыть корень нельзя. Если эту связь не показать явно, человек решает девять
 * отдельных судоку и не понимает, зачем их девять (см. fractal-sudoku.ts).
 *
 * ЭКРАН УСТРОЕН ДВУМЯ ВИДАМИ, а не одним полем: десять сеток 9×9 на телефоне
 * одновременно нечитаемы — клетка вышла бы меньше трёх миллиметров.
 *   • КАРТА  — корень крупно (его тоже решают руками) + девять плиток дочерних;
 *   • СЕТКА  — одна дочерняя во весь экран, с обычным вводом цифр.
 * Возврат на карту происходит сам, как только дочерняя дошла до порога: это момент,
 * ради которого всё и затевалось, и его надо показать, а не спрятать.
 *
 * ⚠️ КОРЕНЬ ОБЯЗАН БЫТЬ ИГРАБЕЛЬНЫМ. До 19.08 ввода в корень не было вовсе: снизу
 * приходили девять цифр, а остальные полсотни клеток не заполнял никто — и победа,
 * которая проверяет полное совпадение корня с решением, не наступала НИКОГДА, ни на
 * одном уровне (замер: 0 побед из 30 партий). Поэтому клетки корня здесь такие же
 * кликабельные, как в дочерней, и цифровая клавиатура на карте — не украшение.
 * Девять «кормящих» клеток руками не заполняются: их приносят снизу, в этом вся игра.
 *
 * ⚠️ ПОРТАЛЫ — ОДНА КЛЕТКА НА ДВА ПАЗЛА (правка 20.08.2026). С шестого уровня пара
 * клеток из РАЗНЫХ дочерних сеток объявляется одной и той же клеткой. В задании она
 * выколота с обеих сторон, и КАЖДАЯ из двух досок порознь неоднозначна: цифру не даёт
 * ни одна, её даёт пересечение того, что допускают обе. Экран обязан показать это тремя
 * вещами разом, иначе человек просто упрётся в две нерешаемые сетки: кольцо на самой
 * клетке с номером сетки-близнеца, кнопка перехода к ней и общий слой карандаша —
 * пометки, написанные здесь, видны там, потому что клетка одна.
 *
 * ⚠️ ОТМЕНА ХОДА И НЕЗАКОНЧЕННАЯ ПАРТИЯ (правка 19.08.2026). Не было ни того, ни
 * другого — в самой длинной партии приложения. Час работы стирался одним неточным
 * касанием или одним звонком. Оба слоя общие и уже написаны (`hooks/useMoveHistory`,
 * `services/resume`, тот же набор, что у самурая и обычной судоку), а правило «что
 * именно откатывает отмена» живёт в движке: ход, добравший дочернюю до порога,
 * открывает её и отправляет цифру наверх, и отмена обязана снять всё три вещи разом
 * (fractal-sudoku.ts, playDigit/revertMove).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { goBackOrHome } from '@/src/utils/nav';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { useProfile } from '@/src/contexts/ProfileContext';
import { saveSession } from '@/src/services/api';
import GameShell, { type HudItem } from '@/src/components/GameShell';
import LevelProgressMap from '@/src/components/LevelProgressMap';
import LevelCleared from '@/src/components/LevelCleared';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import { FRACTAL_MAX_LEVEL, fractalLevel, fractalTechniqueKey } from '@/src/services/fractalLevels';
import GlassButton from '@/src/components/GlassButton';
import { useGameKeyboard, digitKeys } from '@/src/hooks/useGameKeyboard';
import { useScreenWidth } from '@/src/hooks/useScreenWidth';
import { useMoveHistory } from '@/src/hooks/useMoveHistory';
import {
  emptySudokuCellColors, normalizeSudokuCellColors, toggleSudokuCellColor,
  SUDOKU_COLOR_COUNT, type SudokuCellColors,
} from '@/src/services/sudoku-coloring';
import {
  emptyPencilMarks, normalizePencilMarks, togglePencilMark, clearPencilMarks, pencilDigits, countPencilMarks,
  type PencilMarks,
} from '@/src/services/pencilMarks';
import { saveResume, clearResume } from '@/src/services/resume';
import { useResumeBoot } from '@/src/hooks/useResumeBoot';
import { sndPlace, sndWrong } from '@/src/services/feedback';
import { gameNow } from '@/src/services/gamePause';
import {
  N, FEED_CELL, conflictsInChild, generateFractal, rootCellForChild, solvedCount, rootEditable, rootSolved,
  startPlayState, playDigit, revertMove, portalOf,
  type FractalPuzzle, type FractalPlayState, type FractalMove,
} from '@/src/services/fractal-sudoku';

const GRADIENT = ['#5b4d9e', '#7f7fd5'];
const GAME_ID = 'sudoku_fractal';

/**
 * Версия формата незаконченной партии. Поднимать при ЛЮБОМ изменении полей снимка:
 * старая запись тогда не подойдёт под новый код и будет молча выброшена, а не уронит экран.
 */
const RESUME_V = 3;

/**
 * Палитра раскраски. Значения те же, что в обычной судоку, — это ОДИН инструмент, и
 * «фиолетовый» в двух судоку обязан быть одним фиолетовым.
 *
 * ⚠️ Продублировано, а не импортировано, потому что живёт константой ВНУТРИ
 * `app/games/sudoku.tsx`, который сейчас правит другой заход. Когда файл освободится,
 * обе копии переезжают в `services/sudoku-coloring` — там их место.
 */
const CELL_COLORS = ['#8B5CF6', '#0EA5E9', '#22C55E', '#F59E0B', '#EC4899'] as const;
/** Та же палитра для дальтоников (Okabe–Ito): различима при любом типе дальтонизма. */
const CELL_COLORS_CB = ['#0072B2', '#E69F00', '#009E73', '#D55E00', '#CC79A7'] as const;

/**
 * Цвет портала — один на обе его клетки и НЕ из палитры раскраски: цвет здесь означает
 * не «я так пометил», а свойство самой доски, и путать эти два языка нельзя.
 */
/** Потолок штрафа за время: дальше партия просто длинная, а не медленная. */
const TIME_CAP = 1800;
/** Пол победы: добитая партия не может стоить столько же, сколько брошенная. */
const WIN_FLOOR = 300;

/** Сколько висит строка «здесь пока не определить». */
const UNDECIDED_MS = 2600;

const PORTAL_COLOR = '#06b6d4';

/** Цвет подписи ступени: от спокойного к тревожному, шесть ступеней лестницы. */
const TIER_COLORS = ['#64748b', '#0ea5e9', '#22c55e', '#f59e0b', '#f43f5e', '#a855f7'] as const;

/** Смешать два цвета — метка не закрашивает клетку, а подкрашивает её. */
function blendHex(base: string, over: string, k: number): string {
  const hx = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  try {
    const [r1, g1, b1] = hx(base), [r2, g2, b2] = hx(over);
    const mix = (a: number, b: number) => Math.round(a + (b - a) * k);
    return `rgb(${mix(r1, r2)}, ${mix(g1, g2)}, ${mix(b1, b2)})`;
  } catch { return base; }
}

/**
 * Клетки корня, которые приходят снизу: руками их не трогают. Ключ «r,c» → номер
 * дочерней сетки, которая эту клетку кормит. Номер нужен рендеру: связь
 * «клетка ⇄ нижняя сетка» с 28.08 показывается прямо на карте, а не держится в голове.
 */
const FED_CHILD = new Map<string, number>(Array.from({ length: 9 }, (_, i) => [rootCellForChild(i).join(','), i]));

type Phase = 'config' | 'map' | 'child' | 'result';

/**
 * Снимок незаконченной партии. Кладём и само задание: генерация не воспроизводима без
 * сида, и без задания доска поднялась бы, а сверять ходы было бы не с чем.
 */
interface FractalResume {
  level: number;
  puzzle: FractalPuzzle;
  play: FractalPlayState;
  /** Пометки и раскраска — по одной сетке на корень и по одной на каждую дочернюю. */
  marks: { root: PencilMarks; children: PencilMarks[] };
  paint: { root: SudokuCellColors; children: SudokuCellColors[] };
  errors: number;
  elapsed: number;
  history: ReturnType<ReturnType<typeof useMoveHistory<FractalMove>>['serialize']>;
}

const EMPTY_PLAY: FractalPlayState = { rootGrid: [], children: [] };

/**
 * Чем сейчас пишет палец: цифрой в клетку, карандашной пометкой или цветом.
 * Один переключатель на три способа — иначе на маленьком экране три кнопки-режима,
 * и человек не понимает, какой из них включён.
 */
type Tool = 'digit' | 'pencil' | 'paint';

const freshMarks = () => ({ root: emptyPencilMarks(N), children: Array.from({ length: 9 }, () => emptyPencilMarks(N)) });
const freshPaint = () => ({ root: emptySudokuCellColors(N), children: Array.from({ length: 9 }, () => emptySudokuCellColors(N)) });
const EMPTY_MARKS = freshMarks();
const EMPTY_PAINT = freshPaint();

export default function FractalSudokuScreen() {
  const { colors, isDark, colorblind } = useTheme();
  const { t, language } = useLanguage();
  const { profile } = useProfile();
  /**
   * Уровень настоящий: растёт ступень техники, число сеток, которым верхняя техника
   * действительно нужна, и порог открытия корневой. Игра вышла вообще без уровней —
   * сразу «hard» и всегда одинаково; это была моя же дыра, новая игра мимо формата,
   * на который я сам жалуюсь.
   */
  const lvl = usePersistentLevel(GAME_ID);
  const cfg = fractalLevel(lvl.level);
  /**
   * ⚠️ НЕ ГОЛЫЙ useWindowDimensions. В веб-сборке (а Android у нас WebView, то есть это
   * и телефон) он на первом кадре отдаёт 0, а обновляется только по `resize`, которого
   * при обычной загрузке не бывает. От ширины здесь считается РАЗМЕР КЛЕТКИ:
   * `Math.min(34, Math.floor((Math.min(0, 520) - 48) / 9))` = −6, то есть доска
   * запекается в клетки отрицательного размера — до поворота экрана, то есть насовсем.
   */
  const width = useScreenWidth();

  // Лента ходов для отмены. Хранит, ЧТО было в клетке до хода — назад отыгрывает движок.
  // Партия здесь самая длинная в приложении: один промах пальцем не должен стоить часа.
  const hist = useMoveHistory<FractalMove>();
  /**
   * Уровень ТЕКУЩЕЙ партии — состоянием, а не ref: поднятая из сохранения партия может
   * быть старше текущего уровня профиля, а читает это значение РЕНДЕР (экран итога).
   * Ref, прочитанный в рендере, — не ложное срабатывание правила, а настоящая ошибка.
   */
  const [playedLevel, setPlayedLevel] = useState(1);

  const [phase, setPhase] = useState<Phase>('config');
  const [puzzle, setPuzzle] = useState<FractalPuzzle | null>(null);
  // Всё, что человек наиграл, — одним объектом: корень и девять дочерних. Задание
  // (подсказки, решения, пороги) лежит отдельно, в puzzle, и не меняется за партию.
  const [play, setPlay] = useState<FractalPlayState>(EMPTY_PLAY);
  const [openChild, setOpenChild] = useState<number | null>(null);
  const [selected, setSelected] = useState<{ r: number; c: number } | null>(null);
  const [rootSel, setRootSel] = useState<{ r: number; c: number } | null>(null);
  /**
   * Выбранная связь «кормящая клетка ⇄ нижняя сетка» (просьба Дениса 28.08: по карте
   * не видно, какая нижняя сетка что кормит). Первое касание кормящей клетки или её
   * плитки подсвечивает ПАРУ и меняет подсказку под полем; второе касание клетки
   * открывает саму сетку — как в референсе Fractal Sudoku, где пунктирная клетка и
   * есть вход во вложенный пазл. Не сохраняется в снимок партии: это внимание, не ход.
   */
  const [linkSel, setLinkSel] = useState<number | null>(null);
  const [errors, setErrors] = useState(0);
  /**
   * 🔴 ПЕРВАЯ ОШИБКА ОБЪЯСНЯЕТСЯ СЛОВАМИ, А НЕ ТОЛЬКО ЦВЕТОМ.
   *
   * Два сообщения из чата обратной связи 28.08.2026 с этого самого экрана: «Что за
   * красные цифры???» и «Зачем 5, почему они появились???» — на кадрах уже двенадцать
   * ошибок. Красный цвет ничего не объясняет тому, кто его видит впервые: человек
   * решил, что цифры появились сами.
   *
   * Рядом уже есть образец: ход, который НЕ ошибка, игра честно объясняет плашкой
   * (`fractalUndecided`). Ошибка молчала — теперь говорит тем же способом.
   *
   * ⚠️ Один раз за партию: повтор на каждой ошибке превратился бы в упрёк, а ошибки
   * в тренажёре — рабочий материал (§12.4 карты геймификации).
   */
  const [redHint, setRedHint] = useState(false);
  const redHintShownRef = useRef(false);
  /**
   * Клетка, которую задача ещё не определяет. Не ошибка — неопределённость, и
   * говорить о ней надо словами: цвет тут соврал бы про правило.
   */
  const [undecided, setUndecided] = useState(false);
  const undecidedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * ИНСТРУМЕНТЫ СТРАТЕГИИ. На десяти сетках 9×9 держать кандидатов в голове невозможно —
   * это не украшение, а то, без чего верхние ступени лестницы техник не решаются вовсе.
   *
   * Режим ввода один на все три способа: цифра / пометка / цвет. Три отдельных
   * переключателя человек путает, а тут ещё и два вида (карта и дочерняя).
   */
  const [tool, setTool] = useState<Tool>('digit');
  const [paintColor, setPaintColor] = useState(0);
  const [marks, setMarks] = useState<{ root: PencilMarks; children: PencilMarks[] }>(EMPTY_MARKS);
  const [paint, setPaint] = useState<{ root: SudokuCellColors; children: SudokuCellColors[] }>(EMPTY_PAINT);
  // Итог партии нужен и в рендере результата — держим в состоянии, а не только в аргументе finish().
  const [won, setWon] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  /**
   * Таймер глушится ЭФФЕКТОМ по приходу в итог, а не изнутри finish().
   *
   * ⚠️ Не косметика. finish() зовётся из обработчика цифры; трогай он timerRef, и вся
   * цепочка «нажали цифру» стала бы читающей ref — а её экран передаёт в вызов во время
   * рендера (`renderPad(placeDigit)`), на что правило react-hooks/refs ругается по делу.
   * Здесь чтение ref на своём месте: в эффекте.
   */
  useEffect(() => {
    if (phase !== 'result') return;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, [phase]);

  const runTimer = (from: number) => {
    startRef.current = gameNow() - Math.max(0, from) * 1000;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setElapsed((gameNow() - startRef.current) / 1000), 200);
  };

  const start = useCallback(() => {
    // Новая партия заменяет незаконченную: старую доску продолжать уже нечем.
    const pid = profile?.id;
    if (pid) clearResume(GAME_ID, pid).catch(() => {});
    hist.reset();
    setPlayedLevel(lvl.level);
    // Порог открытия у каждой дочерней СВОЙ: он считается от реального числа её дырок
    // (fractal-sudoku.ts), потому что число дырок задаёт логика, а не таблица уровней.
    // Фиксированный порог мог бы оказаться выше числа дырок — сетка не открылась бы никогда.
    const p = generateFractal(lvl.level);
    setPuzzle(p);
    setPlay(startPlayState(p));
    setErrors(0);
    redHintShownRef.current = false; setRedHint(false);
    setElapsed(0);
    setOpenChild(null);
    setSelected(null);
    setRootSel(null);
    setLinkSel(null);
    setMarks(freshMarks());
    setPaint(freshPaint());
    setTool('digit');
    runTimer(0);
    setPhase('map');
  }, [lvl.level, profile?.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  /** Сколько дочерних уже отдали цифру наверх. */
  const openedCount = play.children.filter((c) => c.done).length;

  const finish = useCallback(async (win: boolean) => {
    setWon(win);
    const pid = profile?.id;
    if (pid) clearResume(GAME_ID, pid).catch(() => {});   // доиграна — продолжать нечего
    // Время берём из состояния, а не из startRef: тикает оно раз в 200 мс, и на партии
    // в несколько часов эта погрешность значит ровно ничего — зато обработчик цифры
    // остаётся чистым от чтения refs (см. эффект остановки таймера выше).
    const time = elapsed;
    setPhase('result');
    // Уровень засчитан только за ВЫИГРАННУЮ партию: здесь можно и не собрать.
    if (win && playedLevel >= lvl.level && lvl.level < FRACTAL_MAX_LEVEL) lvl.reach(lvl.level + 1);
    // Провал считаем только на СВОЁМ уровне: партия на пройденном — переигровка, за неё не наказываем.
    else if (!win && playedLevel >= lvl.level) lvl.fail();
    try {
      await saveSession({
        passed: win,
        game_type: GAME_ID,
        /**
         * 🔴 СЧЁТ ДЛИННОЙ ПАРТИИ СХЛОПЫВАЛСЯ В НОЛЬ. Вычиталась СЕКУНДА ЗА СЕКУНДУ
         * без предела: 4000 секунд — это 66,7 минуты, и дальше победа стоила ровно
         * столько же, сколько брошенная партия. А фрактал в собственной шапке
         * назван «событием на несколько часов»: время здесь не признак спешки.
         *
         * Штраф за время НАСЫЩАЕТСЯ, и у победы есть пол. Честно добитая партия
         * обязана отличаться от невыигранной — иначе счёт перестаёт быть счётом.
         */
        score: win ? Math.max(WIN_FLOOR, Math.round(4000 - errors * 60 - Math.min(time, TIME_CAP))) : 0,
        time_seconds: time,
        difficulty: `lvl${playedLevel}`,
        mode: 'fractal',
        errors,
        details: {
          level: playedLevel, opened: openedCount, of: 9,
          tier: cfg.tier, top_tier_count: cfg.topTierCount, unlock_share: cfg.unlockShare,
        },
      });
    } catch (e) { console.error(e); }
  }, [errors, openedCount, elapsed, playedLevel]);   // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Один ход — и в дочернюю, и в корень. Правило «что можно, что нельзя и что при этом
   * открывается» целиком в движке: экран только озвучивает и считает ошибки.
   */
  /** Клетка задания — в неё не пишут ни цифру, ни пометку. */
  const isGiven = (child: number | null, r: number, c: number): boolean =>
    !puzzle ? true : child === null ? !rootEditable(puzzle.root.puzzle, r, c) : puzzle.children[child].puzzle[r][c] !== 0;

  /**
   * Карандашная пометка. Пишется В ТУ ЖЕ клетку, что и цифра, но живёт отдельным слоем:
   * поставленная цифра пометки НЕ СТИРАЕТ, она их лишь перекрывает.
   *
   * ⚠️ Так сделано ради отмены. Стирай цифра пометки — откат хода вернул бы клетку, но не
   * вернул бы стёртое, и «отмена» опять оказалась бы половинчатой. Ровно та ошибка, за
   * которую тут уже расплачивались: откат обязан возвращать ВСЁ, что ход изменил, — а
   * проще всего этого добиться, ничего лишнего ходом не меняя.
   */
  const mark = (child: number | null, r: number, c: number, digit: number) => {
    if (!puzzle || phase === 'result' || isGiven(child, r, c)) return;
    // Стирающая клавиша в режиме карандаша чистит ВСЮ клетку: снимать девять пометок
    // по одной — это девять нажатий там, где на бумаге одно движение ластиком.
    const apply = (m: PencilMarks, rr: number, cc: number) =>
      (digit === 0 ? clearPencilMarks(m, N, rr, cc) : togglePencilMark(m, N, rr, cc, digit));
    /**
     * ⚠️ У ПОРТАЛА КАРАНДАШ ОБЩИЙ — и без этого механика не играется. Ответ там даёт
     * ПЕРЕСЕЧЕНИЕ кандидатов двух досок; держать в голове чужой список, переключая
     * экраны, человек не станет. Пометки, написанные здесь, обязаны быть видны там —
     * клетка-то одна. Заодно это и держит два слоя в согласии: пишем всегда в оба.
     */
    const link = child === null ? null : portalOf(puzzle.portals ?? [], child);
    const twin = link && link.at[0] === r && link.at[1] === c ? link : null;
    setMarks((prev) => {
      if (child === null) return { ...prev, root: apply(prev.root, r, c) };
      return {
        ...prev,
        children: prev.children.map((m, i) => {
          if (i === child) return apply(m, r, c);
          if (twin && i === twin.other) return apply(m, twin.otherAt[0], twin.otherAt[1]);
          return m;
        }),
      };
    });
  };

  /** Раскраска клетки. Работает и по подсказкам задания: цепочку рассуждений ведут по ним тоже. */
  const painting = (child: number | null, r: number, c: number) => {
    if (!puzzle || phase === 'result') return;
    setPaint((prev) => {
      if (child === null) return { ...prev, root: toggleSudokuCellColor(prev.root, N, r, c, paintColor) };
      const children = prev.children.map((m, i) => (i === child ? toggleSudokuCellColor(m, N, r, c, paintColor) : m));
      return { ...prev, children };
    });
  };

  const place = (child: number | null, r: number, c: number, n: number) => {
    if (!puzzle || phase === 'result') return;
    if (tool === 'pencil') { mark(child, r, c, n); return; }
    const res = playDigit(play, puzzle, { child, r, c }, n);
    if (!res) return;   // подсказка, кормящая клетка или повтор той же цифры
    const { next, move } = res;

    if (n !== 0) {
      /**
       * 🔴 ОШИБКА — ТОЛЬКО ДОКАЗУЕМАЯ. Дочерняя сетка ПОРОЗНЬ неоднозначна нарочно:
       * ответ там даёт пересечение допустимых наборов двух досок, и до разрешения
       * портала клетка честно не определена. А игра сверяла цифру с хранимым
       * решением и наказывала за ЛЮБОЕ расхождение. Замер на 25-м уровне: 838
       * пустых клеток из 1140 (73,5 %) принимают цифру, отличную от решения, не
       * нарушая ни одного правила — три четверти доски карали за законный ход.
       *
       * Теперь ошибка засчитывается, когда цифра нарушает видимое правило: уже
       * стоит в строке, столбце или блоке. Неопределённость задачи объясняется
       * словами (строка про портал), а не красным цветом и не отнятой звездой.
       */
      const right = child === null
        ? puzzle.root.solution[r][c] === n
        : puzzle.children[child].solution[r][c] === n;
      const provable = child === null
        ? !right
        : conflictsInChild(play.children[child].grid, r, c, n);
      if (right) sndPlace();
      else if (provable) {
        sndWrong(); setErrors((e) => e + 1);
        if (!redHintShownRef.current) {
          redHintShownRef.current = true;
          setRedHint(true);
          setTimeout(() => setRedHint(false), 7000);   // прочитать успевают, мешать не успевает
        }
      }
      else {
        // Не ошибка: задача здесь ещё не определена. Говорим об этом прямо.
        sndPlace();
        setUndecided(true);
        if (undecidedTimerRef.current) clearTimeout(undecidedTimerRef.current);
        undecidedTimerRef.current = setTimeout(() => setUndecided(false), UNDECIDED_MS);
      }
    }

    hist.push(move);
    setPlay(next);

    // Порог пройден — цифра ушла в корень. Это и есть смысл всей конструкции, поэтому
    // возвращаем на карту: там видно, как заполнилась клетка наверху.
    // ⚠️ И ТО ЖЕ САМОЕ, ЕСЛИ ОТКРЫЛАСЬ СЕТКА-БЛИЗНЕЦ. Ход в портальную клетку способен
    // добрать до порога ЧУЖУЮ доску — на своей при этом не изменится ничего, и событие
    // прошло бы мимо человека совсем: цифра в корне появилась, а он этого не видел.
    if (move.unlocked || move.mirror?.unlocked) {
      setOpenChild(null);
      setSelected(null);
      setPhase('map');
    }
    // Девятая цифра снизу может оказаться последней пустой клеткой корня — тогда партия
    // закончилась прямо здесь. Обычно же корень ещё предстоит добить руками.
    if (rootSolved(next.rootGrid, puzzle.root.solution)) void finish(true);
  };

  const placeDigit = (n: number) => { if (openChild !== null && selected) place(openChild, selected.r, selected.c, n); };
  const placeRootDigit = (n: number) => { if (rootSel) place(null, rootSel.r, rootSel.c, n); };

  /**
   * Отмена хода. Возвращает КЛЕТКУ, но НЕ возвращает потраченную ошибку: иначе счётчик
   * ошибок превращается в фикцию и звёзды за партию перестают что-либо значить. Промах
   * пальцем чинится, счёт ошибок — нет (то же правило, что у самурая и в судоку 9×9).
   *
   * Открытую дочернюю отмена ЗАКРЫВАЕТ обратно и убирает цифру из корня — см. движок.
   * Экран при этом сам возвращает человека туда, где ход был сделан: иначе он смотрит
   * на карту и не понимает, что откатилось.
   */
  const handleUndo = () => {
    if (!puzzle || phase === 'result') return;
    const m = hist.undo();
    if (!m) return;
    setPlay(revertMove(play, puzzle, m));
    if (m.child === null) {
      setOpenChild(null);
      setRootSel({ r: m.r, c: m.c });
      setPhase('map');
    } else {
      setOpenChild(m.child);
      setSelected({ r: m.r, c: m.c });
      setPhase('child');
    }
  };

  const moveRootSel = (dr: number, dc: number) => {
    let { r, c } = rootSel ?? { r: dr < 0 ? N : -1, c: dc < 0 ? N : -1 };
    for (let s = 0; s < N * N; s++) {
      r += dr; c += dc;
      if (r < 0 || r >= N || c < 0 || c >= N) return;
      if (puzzle && rootEditable(puzzle.root.puzzle, r, c)) { setRootSel({ r, c }); return; }
    }
  };

  const moveSel = (dr: number, dc: number) => {
    if (openChild === null || !puzzle) return;
    const given = puzzle.children[openChild].puzzle;
    let { r, c } = selected ?? { r: dr < 0 ? N : -1, c: dc < 0 ? N : -1 };
    for (let s = 0; s < N * N; s++) {
      r += dr; c += dc;
      if (r < 0 || r >= N || c < 0 || c >= N) return;
      if (given[r][c] === 0) { setSelected({ r, c }); return; }
    }
  };

  useGameKeyboard({
    ...digitKeys((n) => placeDigit(n)),
    ArrowUp: () => moveSel(-1, 0),
    ArrowDown: () => moveSel(1, 0),
    ArrowLeft: () => moveSel(0, -1),
    ArrowRight: () => moveSel(0, 1),
    Escape: () => { setOpenChild(null); setSelected(null); },
  }, phase === 'child');

  // На карте те же клавиши работают по корню: он такое же поле, а не картинка.
  useGameKeyboard({
    ...digitKeys((n) => placeRootDigit(n)),
    ArrowUp: () => moveRootSel(-1, 0),
    ArrowDown: () => moveRootSel(1, 0),
    ArrowLeft: () => moveRootSel(0, -1),
    ArrowRight: () => moveRootSel(0, 1),
    Escape: () => { setRootSel(null); setLinkSel(null); },
  }, phase === 'map' && openChild === null);

  // ─────────────────────────── незаконченная партия ───────────────────────────

  /** Снимок партии для общего слоя незаконченной игры. */
  const snapshot = (): FractalResume => ({
    level: playedLevel,
    puzzle: puzzle as FractalPuzzle,
    play,
    marks,
    paint,
    errors,
    elapsed,
    history: hist.serialize(),
  });

  /** Поднять партию из снимка — доска оживает ровно такой, какой её оставили. */
  const applyResume = (s: FractalResume) => {
    setPlayedLevel(s.level);
    setPuzzle(s.puzzle);
    setPlay(s.play);
    // ⚠️ Пометки и раскраску прогоняем через normalize: запись лежит на устройстве месяц
    // и переживает обновления. Битая маска нарисовала бы несуществующие цифры, чужой
    // формат уронил бы экран — потерять пометки не страшно, уронить партию страшно.
    setMarks({
      root: normalizePencilMarks(s.marks?.root, N),
      children: Array.from({ length: 9 }, (_, i) => normalizePencilMarks(s.marks?.children?.[i], N)),
    });
    setPaint({
      root: normalizeSudokuCellColors(s.paint?.root, N),
      children: Array.from({ length: 9 }, (_, i) => normalizeSudokuCellColors(s.paint?.children?.[i], N)),
    });
    setTool('digit');
    setErrors(s.errors);
    setOpenChild(null);
    setSelected(null);
    setRootSel(null);
    setLinkSel(null);
    setWon(false);
    hist.restore(s.history);
    // Таймер продолжаем с НАКОПЛЕННОГО: настенные часы между сессиями ушли вперёд, и от
    // прежнего startRef партия «шла» бы всё то время, что телефон лежал в кармане.
    setElapsed(s.elapsed);
    runTimer(s.elapsed);
    setPhase('map');
  };

  // Поднять незаконченную партию при входе на экран — разово.
  // Фрактал в зарядку не попадает — своего пути `autostart` у него нет.
  useResumeBoot<FractalResume>(GAME_ID, RESUME_V, (saved) => {
    if (!saved?.puzzle?.children || saved.puzzle.children.length !== 9) return;
    if (!saved.play?.rootGrid?.length || saved.play.children?.length !== 9) return;
    applyResume(saved);
  }, false);

  const liveGame = phase !== 'config' && phase !== 'result' && !!puzzle;

  // Автосохранение по ходу партии. Пишем с задержкой: подряд идущие касания не должны
  // бить по хранилищу каждым нажатием.
  useEffect(() => {
    if (!liveGame) return;
    const pid = profile?.id;
    if (!pid) return;
    const snap = snapshot();
    const tm = setTimeout(() => { saveResume(GAME_ID, pid, RESUME_V, snap).catch(() => {}); }, 400);
    return () => clearTimeout(tm);
  }, [play, marks, paint, errors, liveGame]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Уход с экрана. Отложенная запись выше на этом моменте отменяется своим clearTimeout,
  // поэтому сохраняем ещё раз здесь — и с ЖИВЫМ временем, а не с тем, что было на прошлом ходу.
  const liveRef = useRef<{ ok: boolean; pid?: string; snap: () => FractalResume }>({ ok: false, snap: () => ({} as FractalResume) });
  // Пишем в ref ЭФФЕКТОМ, а не во время рендера: запись `liveRef.current = ...` прямо в
  // теле компонента — настоящее (а не ложное) срабатывание правила react-hooks/refs.
  // Эффект без списка зависимостей идёт после каждого коммита, то есть ref всегда свеж.
  useEffect(() => { liveRef.current = { ok: liveGame, pid: profile?.id, snap: snapshot }; });
  const saveBeforeExit = () => {
    const l = liveRef.current;
    if (l.ok && l.pid) saveResume(GAME_ID, l.pid, RESUME_V, l.snap()).catch(() => {});
  };
  // Снимок берётся из liveRef, который освежается эффектом выше, — поэтому пустой
  // список зависимостей здесь не «забыли дописать», а единственно верный: эффект
  // обязан отработать РОВНО ОДИН раз, при сносе экрана.
  useEffect(() => () => { saveBeforeExit(); }, []);

  // ─────────────────────────── экраны ───────────────────────────

  if (phase === 'config') {
    return (
      <GameShell title={t('fractalTitle')} onBack={() => goBackOrHome()}>
        <ScrollView contentContainerStyle={styles.configWrap} showsVerticalScrollIndicator={false}>
          <LinearGradient colors={GRADIENT as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
            <Ionicons name="git-network" size={44} color="#FFF" />
            <Text style={styles.heroTitle}>{t('fractalTitle')}</Text>
            <Text style={styles.heroSub}>{t('fractalDesc')}</Text>
          </LinearGradient>

          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.cardText, { color: colors.text }]}>{t('fractalHowTo')}</Text>
          </View>

          {/* Дверь в «их масштаб» (Денис 28.08): глубокий фрактал — отдельный
              марафонский режим со своим экраном; этот, «боссовый», остаётся как есть. */}
          <TouchableOpacity
            accessibilityRole="button"
            testID="fractal-deep-link"
            onPress={() => router.push('/games/sudoku-fractal-deep' as never)}
            style={[styles.card, { backgroundColor: colors.surface, borderColor: GRADIENT[0], flexDirection: 'row', alignItems: 'center', gap: 10 }]}
          >
            <Ionicons name="layers" size={22} color={GRADIENT[1]} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardText, { color: colors.text, fontWeight: '800' }]}>{t('deepTitle')}</Text>
              <Text style={{ fontSize: 12, color: colors.textSecondary }}>{t('deepEntryHint')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </TouchableOpacity>

          {/* ⚠️ Правило показываем ТОЛЬКО там, где порталы есть. На первой ступени их нет,
              и рассказ про механику, которой на доске не будет, — это не обучение, а шум. */}
          {cfg.portals > 0 && (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: PORTAL_COLOR }]}>
              <Text style={[styles.cardText, { color: colors.text }]}>{t('fractalPortalRule')}</Text>
            </View>
          )}

          <LevelProgressMap bestLevel={lvl.best}
            gameId={GAME_ID}
            currentLevel={lvl.level} onPickLevel={lvl.pick}
            maxLevel={FRACTAL_MAX_LEVEL}
            colors={colors}
            language={language}
          />
          <GlassButton label={t('start')} tone="accent" onPress={start} style={{ marginTop: 4 }} />
        </ScrollView>
      </GameShell>
    );
  }

  if (phase === 'result') {
    // Итог — общим экраном «уровень пройден»: только он пишет звёзды по уровням,
    // считает серию чистых и тикает глаз-разрядку. Звёзды по ошибкам — настоящая
    // оценка: в судоку ошибка это поставленная не та цифра, а не «медленно».
    return (
      <LevelCleared
        gameId={GAME_ID}
        level={playedLevel}
        passed={won}
        stars={errors === 0 ? 3 : errors <= 3 ? 2 : 1}
        gradient={GRADIENT}
        language={language}
        colors={colors}
        onContinue={start}
        onStop={() => goBackOrHome()}
      />
    );
  }

  const palette = colorblind ? CELL_COLORS_CB : CELL_COLORS;

  /**
   * Общий вид клетки для обоих полей: раскраска фоном, карандашные пометки мелким.
   * Одна функция на корень и на дочернюю — две копии разъехались бы на первой же правке.
   */
  const cellSkin = (which: 'root' | number, r: number, c: number, base: string) => {
    const layer = which === 'root' ? paint.root : paint.children[which as number];
    const idx = layer?.[r]?.[c] ?? -1;
    return idx >= 0 && idx < palette.length ? blendHex(base, palette[idx], isDark ? 0.34 : 0.24) : base;
  };

  /** Пометки клетки — три ряда по три, как в углу бумажной клетки. */
  const renderMarks = (which: 'root' | number, r: number, c: number, size: number, value: number) => {
    if (value !== 0) return null;   // цифра перекрывает пометки, но НЕ стирает их
    const layer = which === 'root' ? marks.root : marks.children[which as number];
    const digits = pencilDigits(layer?.[r]?.[c] ?? 0);
    if (!digits.length) return null;
    return (
      <View style={styles.markGrid} pointerEvents="none">
        {Array.from({ length: 9 }, (_, k) => k + 1).map((d) => (
          <Text
            key={d}
            style={{
              width: size / 3, height: size / 3, lineHeight: size / 3,
              fontSize: Math.max(6, size * 0.235), textAlign: 'center',
              color: digits.includes(d) ? colors.textSecondary : 'transparent',
            }}
          >
            {d}
          </Text>
        ))}
      </View>
    );
  };

  /**
   * Палитра раскраски — у клавиатуры, где ею пользуются.
   *
   * ⚠️ Палитра СВОИМ рядом, а не в хвосте инструментов: восемь кнопок по 48 в один
   * ряд телефона не влезают и переносятся вразнобой (поймано глазами 19.08).
   */
  const paintPalette = tool === 'paint' ? (
    <View style={styles.paintRow}>
      {Array.from({ length: SUDOKU_COLOR_COUNT }, (_, i) => i).map((i) => (
        <TouchableOpacity
          key={i}
          accessibilityRole="button"
          accessibilityState={{ selected: paintColor === i }}
          accessibilityLabel={`${t('sudokuColorMode')} ${i + 1}`}
          testID={`fractal-swatch-${i}`}
          onPress={() => setPaintColor(i)}
          style={[styles.swatch, {
            backgroundColor: blendHex(colors.surface, palette[i], isDark ? 0.62 : 0.44),
            borderColor: paintColor === i ? colors.text : colors.border,
          }]}
        >
          {paintColor === i && <Ionicons name="checkmark" size={14} color={colors.text} />}
        </TouchableOpacity>
      ))}
    </View>
  ) : null;

  /** Подсказка под полем — что делает выбранный инструмент. */
  const toolHint = tool === 'pencil' ? t('sudokuPencilHint') : tool === 'paint' ? t('sudokuColorHint') : null;

  /** Цифровая клавиатура. Одна и та же и для дочерней, и для корня — иначе две копии разъедутся. */
  const renderPad = (onDigit: (n: number) => void) => (
    <View style={styles.pad}>
      {Array.from({ length: N }, (_, i) => i + 1).map((n) => (
        <TouchableOpacity
          key={n}
          accessibilityRole="button"
          onPress={() => onDigit(n)}
          style={[styles.key, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text }}>{n}</Text>
        </TouchableOpacity>
      ))}
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={t('a11yErase')}
        onPress={() => onDigit(0)}
        style={[styles.key, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        <Ionicons name="backspace-outline" size={19} color={colors.text} />
      </TouchableOpacity>
    </View>
  );

  /**
   * Действия наверху — как у самурая и в обычной судоку. Расхождение между играми
   * одного семейства человек читает как поломку, а не как разницу режимов.
   *
   * 🔴 ИНСТРУМЕНТЫ (цифры/пометки/цвет) — ЗДЕСЬ, а не в нижнем тулбаре. Денис 28.08
   * с мака: нижняя панель в три полосы съедала высоту — «квадрат судоку очень узкий
   * стал». Внизу осталась только клавиатура (и палитра в режиме цвета); переключатель
   * ужат до иконок 48×48 — подписи несут accessibilityLabel и подсказка под полем.
   * Счётчик пометок, живший подписью, стал цифрой-бейджем на иконке карандаша.
   */
  const written = countPencilMarks(openChild !== null ? marks.children[openChild] : marks.root);
  const actions = (
    <View style={styles.headerActionsRow}>
      {([
        ['digit', 'create-outline', t('digitsLabel')],
        ['pencil', 'pencil-outline', t('sudokuPencilMode')],
        ['paint', 'color-palette-outline', t('sudokuColorMode')],
      ] as [Tool, string, string][]).map(([id, icon, label]) => (
        <TouchableOpacity
          key={id}
          accessibilityRole="button"
          accessibilityState={{ selected: tool === id }}
          accessibilityLabel={id === 'pencil' && written ? `${label} ${written}` : label}
          testID={`fractal-tool-${id}`}
          onPress={() => setTool(id)}
          style={[styles.toolIconBtn, {
            backgroundColor: tool === id ? GRADIENT[1] : colors.surface,
            borderColor: tool === id ? GRADIENT[1] : colors.border,
          }]}
        >
          <Ionicons name={icon as never} size={18} color={tool === id ? '#FFF' : colors.text} />
          {id === 'pencil' && written > 0 && (
            <View style={[styles.toolBadge, { backgroundColor: tool === id ? '#FFF' : GRADIENT[1] }]} pointerEvents="none">
              <Text style={{ fontSize: 9, fontWeight: '800', color: tool === id ? GRADIENT[1] : '#FFF' }}>{written}</Text>
            </View>
          )}
        </TouchableOpacity>
      ))}
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={t('btn_undo')}
        testID="fractal-undo"
        onPress={handleUndo}
        disabled={!hist.canUndo}
        style={[styles.undoBtn, {
          backgroundColor: colors.surface, borderColor: colors.border,
          opacity: hist.canUndo ? 1 : 0.4,
        }]}
      >
        <Ionicons name="arrow-undo" size={16} color={colors.text} />
        <Text style={[styles.undoText, { color: colors.text }]}>{t('btn_undo')}</Text>
      </TouchableOpacity>
    </View>
  );

  // Прогресс по корню: сколько его клеток человек уже закрыл из тех, что вообще его.
  // Подсказки задания и девять кормящих клеток не в счёт — они не его работа.
  let rootMine = 0, rootFilled = 0;
  // Корень сошёлся — это и есть победа; до тех пор клавиатура нужна.
  const rootDone = puzzle ? rootSolved(play.rootGrid, puzzle.root.solution) : false;
  if (puzzle) {
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      if (!rootEditable(puzzle.root.puzzle, r, c)) continue;
      rootMine++;
      if (play.rootGrid[r]?.[c]) rootFilled++;
    }
  }

  /**
   * 🔴 СЧЁТЧИК ОШИБОК ПОДПИСАН СЛОВОМ, А НЕ ЗНАЧКОМ «✗».
   *
   * Два сообщения из чата обратной связи 28.08.2026: «Что за красные цифры???» и
   * «Зачем 5, почему они появились???». На обоих кадрах — этот экран, и в шапке
   * стоит «✗12»: двенадцать ошибок, о которых человек не догадывается, потому что
   * ни значок, ни красный цвет цифры нигде не названы.
   *
   * Крестик экономит место, но объясняет только тому, кто уже знает. Слово стоит
   * тех же пикселей в бейдже и снимает вопрос целиком.
   */
  const hud: HudItem[] = [
    { key: 'opened', icon: 'grid', label: t('fractalOpened'), value: `${openedCount}/9`, tone: 'accent', pop: true },
    { key: 'err', icon: 'close-circle', label: t('errors'), value: errors, tone: 'bad' },
    { key: 'time', icon: 'time', label: t('time'), value: `${elapsed.toFixed(0)}${t('secShort')}` },
  ];

  /**
   * ПРИЗРАК ДОЧЕРНЕЙ СЕТКИ внутри кормящей клетки — живой снимок её 9×9. Метод подачи
   * из референса Fractal Sudoku (Денис, 28.08): видно, что ПОД клеткой идёт вложенная
   * судоку и как она продвигается. Точка = клетка дочерней: яркая — поставил человек,
   * тусклая — подсказка задания, пусто — ещё не решена. Это разом и подсказка
   * прогресса, и отличительный интерфейс вложенной клетки — без единой надписи.
   */
  const ghost = (i: number, cellSize: number) => {
    const g = play.children[i]?.grid;
    const given = puzzle?.children[i]?.puzzle;
    // Точка подстраивается под клетку: на узком экране клетка меньше 34 и жёсткие
    // 3px вылезали бы за рамку. Меньше 1px точку web всё равно не нарисует.
    const dot = Math.max(1, Math.floor((cellSize - 6) / N));
    if (!g || !given || dot < 2) return null;
    return (
      <View pointerEvents="none" style={styles.ghostWrap}>
        <View style={{ width: dot * N, height: dot * N, flexDirection: 'row', flexWrap: 'wrap' }}>
          {g.flatMap((row, rr) => row.map((vv, cc) => (
            <View
              key={rr * N + cc}
              style={{
                width: dot, height: dot,
                backgroundColor: vv === 0 ? 'transparent'
                  : given[rr][cc] !== 0
                    ? (isDark ? 'rgba(163,153,224,0.45)' : 'rgba(91,77,158,0.30)')
                    : GRADIENT[1],
              }}
            />
          )))}
        </View>
      </View>
    );
  };

  // ── КАРТА: корень крупно + плитки дочерних ──
  if (phase === 'map' || openChild === null) {
    // Потолок 42, не 34: на маке и планшете доска в 34 выглядела «очень узкой»
    // (Денис 28.08) — телефон всё равно ограничен шириной, ему потолок не важен.
    const cell = Math.min(42, Math.floor((Math.min(width, 520) - 48) / N));
    return (
      <GameShell
        title={t('fractalTitle')}
        onBack={() => goBackOrHome()}
        hud={hud}
        headerActions={actions}
        scrollableField
        confirmExit={liveGame && hist.canUndo}
        resumable
        onSaveBeforeExit={saveBeforeExit}
        /**
         * Панель цифр — В ЛИПКОМ НИЗУ, а не в конце прокрутки. Репорты Вали 21.08
         * и 23.08 (двумя заходами!): «чтобы поставить цифру, каждый раз листать
         * экран вниз». На высокой карте панель жила под полем — каждый ход стоил
         * скролла туда-обратно. Слот `toolbar` каркаса и означает «ответ игрока
         * на текущее задание» — панель принадлежит ему по смыслу.
         */
        toolbar={!rootDone ? (
          <View>
            {paintPalette}
            {toolHint && <Text style={[styles.feedHint, { color: colors.textSecondary }]}>{toolHint}</Text>}
            {renderPad(placeRootDigit)}
          </View>
        ) : undefined}
      >
        <View style={styles.mapWrap}>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>{t('fractalRoot')}</Text>
          <View style={[styles.grid, { borderColor: colors.text }]}>
            {play.rootGrid.map((row, r) => (
              <View key={r} style={styles.row}>
                {row.map((v, c) => {
                  const fedChild = FED_CHILD.get(`${r},${c}`);   // номер кормящей сетки или undefined
                  const linked = fedChild !== undefined && linkSel === fedChild;
                  const given = (puzzle?.root.puzzle[r]?.[c] ?? 0) !== 0;
                  const mine = !!puzzle && rootEditable(puzzle.root.puzzle, r, c);   // клетка человека
                  const isSel = rootSel?.r === r && rootSel?.c === c;
                  const wrong = mine && v !== 0 && v !== puzzle?.root.solution[r][c];
                  return (
                    <TouchableOpacity
                      key={c}
                      accessibilityRole="button"
                      accessibilityLabel={fedChild !== undefined
                        ? `${r + 1}·${c + 1} · ${t('fractalChildN')} ${fedChild + 1}`
                        : `${r + 1}·${c + 1}`}
                      testID={`fractal-root-${r}-${c}`}
                      // ⚠️ В режиме цвета кликабельна ЛЮБАЯ клетка, включая подсказки
                      // задания: цепочку рассуждений ведут и по ним, а не только по пустым.
                      // Кормящая клетка кликабельна ВСЕГДА: касание показывает её пару.
                      disabled={!mine && fedChild === undefined && tool !== 'paint'}
                      onPress={() => {
                        if (tool === 'paint') { painting(null, r, c); return; }
                        if (fedChild !== undefined) {
                          // Первое касание — подсветить пару «клетка ⇄ сетка», второе —
                          // нырнуть в сетку (в референсе вложенная клетка и есть вход).
                          if (linkSel === fedChild) { setOpenChild(fedChild); setSelected(null); setPhase('child'); }
                          else { setLinkSel(fedChild); setRootSel(null); }
                          return;
                        }
                        setLinkSel(null);
                        setRootSel({ r, c });
                      }}
                      style={[styles.cell, {
                        width: cell, height: cell,
                        backgroundColor: isSel ? GRADIENT[1]
                          : linked ? blendHex(colors.surface, GRADIENT[1], isDark ? 0.42 : 0.28)
                          : cellSkin('root', r, c,
                            fedChild !== undefined && v === 0 ? (isDark ? '#3a3358' : '#ece9f7') : colors.surface),
                        borderRightWidth: (c + 1) % 3 === 0 ? 2 : 0.5,
                        borderBottomWidth: (r + 1) % 3 === 0 ? 2 : 0.5,
                        borderColor: colors.text,
                      }]}
                    >
                      {/* Вложенная клетка — как в референсе: пунктирная рамка, номер
                          сетки в углу и призрак-миниатюра того, что под ней идёт.
                          Рамка становится сплошной, когда цифра уже пришла снизу. */}
                      {fedChild !== undefined && (
                        <>
                          <View
                            pointerEvents="none"
                            testID={`fractal-fed-ring-${fedChild}`}
                            style={[styles.fedRing, {
                              borderColor: linked ? GRADIENT[1] : isDark ? '#6f66a8' : '#a89fdb',
                              borderStyle: v === 0 ? 'dashed' : 'solid',
                              borderWidth: linked ? 2 : 1,
                              opacity: v === 0 || linked ? 1 : 0.45,
                            }]}
                          />
                          <Text
                            pointerEvents="none"
                            style={[styles.fedTag, {
                              color: linked ? GRADIENT[1] : isDark ? '#8d84c2' : '#7f76b8',
                              fontSize: Math.max(7, cell * 0.24),
                              opacity: v === 0 || linked ? 1 : 0.6,
                            }]}
                          >
                            {fedChild + 1}
                          </Text>
                          {v === 0 && ghost(fedChild, cell)}
                        </>
                      )}
                      {renderMarks('root', r, c, cell, v)}
                      <Text style={{
                        fontSize: cell * 0.5,
                        fontWeight: given ? '800' : '600',
                        color: isSel ? '#FFF' : wrong ? '#b91c1c' : colors.text,
                      }}>
                        {v !== 0 ? v : ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>

          {/* Подсказка меняется от касания: у выбранной пары она называет связь словами.
              Живая область — чтец экрана услышит смену без повторного фокуса. */}
          {linkSel !== null && (
            <Text
              style={[styles.feedHint, { color: GRADIENT[1], fontWeight: '600', marginTop: 8 }]}
              accessibilityLiveRegion="polite"
              testID="fractal-link-hint"
            >
              {/* Решённая сетка «реши её» уже не просит — подсказка честно меняется. */}
              {`${t('fractalChildN')} ${linkSel + 1} ⇄ ${t(play.children[linkSel]?.done ? 'fractalLinkHintDone' : 'fractalLinkHint')}`}
            </Text>
          )}

          <Text style={[styles.sectionLabel, { color: colors.textSecondary, marginTop: 10 }]}>
            {t('fractalChildren')}
            {(puzzle?.portals?.length ?? 0) > 0 ? `  ·  ${t('fractalPortals')} ${puzzle?.portals.length}` : ''}
          </Text>
          <View style={styles.tiles}>
            {play.children.map((ch, i) => {
              const done = ch.done;
              const got = puzzle
                ? solvedCount(ch.grid, puzzle.children[i].solution, puzzle.children[i].puzzle.map((row) => row.map((v) => v !== 0)))
                : 0;
              const tier = puzzle?.children[i].tier ?? 1;
              // Портал видно ещё с карты: иначе человек заходит в сетку, упирается в
              // неразрешимую доску и не понимает, что она в паре с соседней.
              const link = puzzle ? portalOf(puzzle.portals ?? [], i) : null;
              /**
               * Цифра, которую эта сетка отдала наверх. Репорт Вали 21.08: «на
               * верхней сетке цифра должна быть видна, а ты забываешь, где какая».
               * Решённая плитка показывала «✓» — факт без содержания; теперь она
               * показывает СВОЮ цифру, и держать её в голове больше не надо.
               */
              const fed = puzzle ? puzzle.root.solution[puzzle.children[i].feedsCell[0]][puzzle.children[i].feedsCell[1]] : 0;
              return (
                <TouchableOpacity
                  key={i}
                  accessibilityRole="button"
                  accessibilityLabel={`${t('fractalChildN')} ${i + 1} · ${t(fractalTechniqueKey(tier) as never)}`
                    + (done && fed ? ` · ${fed}` : '')
                    + (link ? ` · ${t('fractalPortal')} ${link.other + 1}` : '')}
                  testID={`fractal-tile-${i}`}
                  // Плитка запоминает себя как выбранную связь: вернёшься из сетки —
                  // её клетка в корне подсвечена, и видно, куда пришла (или придёт) цифра.
                  onPress={() => { setLinkSel(i); setOpenChild(i); setSelected(null); setPhase('child'); }}
                  style={[styles.tile, {
                    backgroundColor: done ? GRADIENT[0] : colors.surface,
                    borderColor: linkSel === i ? GRADIENT[1] : done ? GRADIENT[0] : colors.border,
                    borderWidth: linkSel === i ? 2 : 1,
                  }]}
                >
                  <View style={styles.tileHead}>
                    <Text style={{ fontSize: 20, fontWeight: '800', color: done ? '#FFF' : colors.text }}>
                      {done && fed ? `${fed} ✓` : done ? '✓' : i + 1}
                    </Text>
                    {/* ⚠️ Ступень НАСТОЯЩАЯ, а не объявленная уровнем. С 21-го уровня часть
                        сеток берётся из библиотеки заготовок, часть копается на месте, и
                        внутри одной партии они РАЗНЫЕ по построению (fractalLevels, вторая
                        ось). Плитка, показывающая «что задумано», врала бы каждую партию. */}
                    <View style={[styles.tierDot, { backgroundColor: TIER_COLORS[Math.min(5, Math.max(0, tier - 1))] }]}>
                      <Text style={styles.tierDotText}>{tier}</Text>
                    </View>
                    {link && (
                      <View style={[styles.tierDot, { backgroundColor: PORTAL_COLOR }]} testID={`fractal-tile-portal-${i}`}>
                        <Text style={styles.tierDotText}>⇄{link.other + 1}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={{ fontSize: 11, color: done ? 'rgba(255,255,255,0.85)' : colors.textSecondary }}>
                    {Math.min(got, puzzle?.children[i].unlockCells ?? 0)}/{puzzle?.children[i].unlockCells ?? 0}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Клавиатура корня. Пока в корне есть что заполнять, поле живое: девять цифр
              приходят снизу, остальное — руками. Без этого блока партия не выигрывается
              в принципе, что и случилось с игрой до 19.08. */}
          {/*
            🔴 КЛАВИАТУРА ИСЧЕЗАЛА ПО ЧИСЛУ ЗАПОЛНЕННЫХ, А НЕ ВЕРНЫХ. `rootFilled`
            считает ЛЮБУЮ ненулевую цифру, включая неверную. Ошибся в последней своей
            клетке корня — цифра красная, а клавиатура и ластик пропали: исправить
            нечем, выход только «Отменить» с отмоткой всей ленты ходов.

            Правильное условие одно: корень ещё не сошёлся — значит поле живое.
          */}
          {!rootDone && (
            <Text style={[styles.feedHint, { color: colors.textSecondary, marginTop: 8 }]}>
              {t('fractalRoot')} {rootFilled}/{rootMine}
            </Text>
          )}
        </View>
      </GameShell>
    );
  }

  /**
   * МИНИ-КАРТА КОРНЯ 9×9 — «где я сейчас».
   *
   * ⚠️ ЗАЧЕМ. Партия идёт по девяти дочерним, и, сидя в одной из них, человек терял
   * связь с целым: чтобы понять, какие уже отданы наверх и какую он решает, надо было
   * ВЫЙТИ на карту, то есть прервать работу. Здесь корень нарисован целиком, а каждый
   * его блок покрашен состоянием СВОЕЙ дочерней: решённая, текущая, нетронутая. Связь
   * «блок корня ↔ дочерняя» тут не метафора, а само устройство игры (rootCellForChild).
   */
  const miniMap = (active: number) => (
    <View style={[styles.mini, { borderColor: colors.border }]} testID="fractal-minimap">
      {Array.from({ length: N }, (_, r) => (
        <View key={r} style={styles.miniRow}>
          {Array.from({ length: N }, (_, c) => {
            const block = Math.floor(r / 3) * 3 + Math.floor(c / 3);
            const done = play.children[block]?.done;
            const here = block === active;
            const filled = (play.rootGrid[r]?.[c] ?? 0) !== 0;
            return (
              <View
                key={c}
                testID={`fractal-mini-${r}-${c}`}
                style={[styles.miniCell, {
                  width: 7, height: 7,
                  backgroundColor: here ? GRADIENT[1] : done ? GRADIENT[0] : colors.surface,
                  opacity: here || done ? (filled ? 1 : 0.75) : filled ? 0.9 : 0.35,
                  borderRightWidth: (c + 1) % 3 === 0 ? 1 : 0,
                  borderBottomWidth: (r + 1) % 3 === 0 ? 1 : 0,
                  borderColor: colors.border,
                }]}
              />
            );
          })}
        </View>
      ))}
    </View>
  );

  // ── СЕТКА: одна дочерняя во весь экран ──
  const ch = play.children[openChild];
  const task = puzzle!.children[openChild];
  const sol = task.solution;
  const got = solvedCount(ch.grid, sol, task.puzzle.map((row) => row.map((v) => v !== 0)));
  // Потолок 44 — по той же причине, что 42 у карты: широкий экран заслужил доску крупнее.
  const cell = Math.min(44, Math.floor((Math.min(width, 520) - 32) / N));
  /** Конец портала этой сетки — или null, если её порталы не задели. */
  // ⚠️ `?? []` не перестраховка: снимок незаконченной партии лежит на устройстве
  // месяцами, и запись без порталов уронила бы экран на ровном месте.
  const link = portalOf(puzzle!.portals ?? [], openChild);

  return (
    <GameShell
      title={`${t('fractalChildN')} ${openChild + 1}`}
      onBack={() => { setOpenChild(null); setSelected(null); setPhase('map'); }}
      headerActions={actions}
      confirmExit={false}
      // Панель цифр в липком низу — как на карте (репорт Вали про скролл к цифрам).
      toolbar={(
        <View>
          {paintPalette}
          {toolHint && <Text style={[styles.feedHint, { color: colors.textSecondary }]}>{toolHint}</Text>}
          {/* Первая ошибка партии: объясняем красный цвет словами (см. `redHint`). */}
          {redHint && (
            <Text style={[styles.feedHint, { color: '#f43f5e' }]} accessibilityLiveRegion="polite">
              {t('fractalRedDigit')}
            </Text>
          )}
          {renderPad(placeDigit)}
        </View>
      )}
      stats={
        <View style={styles.miniWrap}>
          {miniMap(openChild)}
          <View style={styles.stats}>
            <Text style={[styles.stat, { color: GRADIENT[1] }]}>{got}/{task.unlockCells} {t('fractalToUnlock')}</Text>
            {/* Настоящий приём ИМЕННО ЭТОЙ сетки: соседние в той же партии бывают легче. */}
            <Text style={[styles.stat, { color: TIER_COLORS[Math.min(5, Math.max(0, task.tier - 1))] }]}>
              {t(fractalTechniqueKey(task.tier) as never)}
            </Text>
            <Text style={[styles.stat, { color: '#f43f5e' }]}>✗{errors}</Text>
          </View>
        </View>
      }
    >
      <View style={styles.playCol}>
        <View style={[styles.grid, { borderColor: colors.text }]}>
          {ch.grid.map((row, r) => (
            <View key={r} style={styles.row}>
              {row.map((v, c) => {
                const isSel = selected?.r === r && selected?.c === c;
                /**
                 * 🔴 КРАСНЫМ — ТОЛЬКО ДОКАЗУЕМО НЕВЕРНОЕ. Сверка с хранимым решением
                 * красила три четверти доски: дочерняя сетка порознь неоднозначна
                 * нарочно, и цифра, не нарушающая ни одного правила, ошибкой не
                 * является. Красим то же, за что считается ошибка, — иначе цвет и
                 * счётчик говорили бы разное.
                 */
                const wrong = v !== 0 && conflictsInChild(ch.grid, r, c, v);
                const isFeed = r === FEED_CELL[0] && c === FEED_CELL[1];
                const given = task.puzzle[r][c] !== 0;
                const isPortal = !!link && link.at[0] === r && link.at[1] === c;
                return (
                  <TouchableOpacity
                    key={c}
                    accessibilityRole="button"
                    accessibilityLabel={isPortal
                      ? `${r + 1}·${c + 1} · ${t('fractalPortal')} ${link!.other + 1}`
                      : `${r + 1}·${c + 1}`}
                    testID={`fractal-cell-${r}-${c}`}
                    onPress={() => {
                      if (tool === 'paint') { painting(openChild, r, c); return; }
                      if (!given) setSelected({ r, c });
                    }}
                    style={[styles.cell, {
                      width: cell, height: cell,
                      backgroundColor: isSel ? GRADIENT[1]
                        : cellSkin(openChild, r, c, isFeed ? (isDark ? '#3a3358' : '#efedfa') : colors.surface),
                      borderRightWidth: (c + 1) % 3 === 0 ? 2 : 0.5,
                      borderBottomWidth: (r + 1) % 3 === 0 ? 2 : 0.5,
                      borderColor: colors.text,
                    }]}
                  >
                    {/* Кольцо — метка САМОЙ ДОСКИ, а не пометка человека, поэтому цвет
                        свой и не из палитры раскраски. Цифра в углу — номер сетки, где
                        живёт вторая половина этой же клетки. */}
                    {isPortal && (
                      <>
                        <View pointerEvents="none" style={[styles.portalRing, { borderColor: PORTAL_COLOR }]} />
                        <Text pointerEvents="none" style={[styles.portalTag, { color: PORTAL_COLOR, fontSize: Math.max(8, cell * 0.26) }]}>
                          {link!.other + 1}
                        </Text>
                      </>
                    )}
                    {renderMarks(openChild, r, c, cell, v)}
                    <Text style={{
                      fontSize: cell * 0.5,
                      fontWeight: given ? '800' : '600',
                      color: isSel ? '#FFF' : wrong ? '#b91c1c' : colors.text,
                    }}>
                      {v !== 0 ? v : ''}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>

        {/* Центр подсвечен всегда: именно его цифра уйдёт наверх, и человек должен
            видеть, ЧТО он добывает, а не просто закрывать клетки. */}
        <Text style={[styles.feedHint, { color: colors.textSecondary }]}>{t('fractalFeedHint')}</Text>

        {/* ⚠️ ПЕРЕХОД К БЛИЗНЕЦУ — НЕ УДОБСТВО, А УСЛОВИЕ ИГРАБЕЛЬНОСТИ. Вывод здесь
            делается сравнением двух списков кандидатов, и путь «назад на карту, найти
            нужную плитку, войти, вспомнить клетку» человек проделает один раз, а на
            второй бросит. Кнопка ведёт сразу в клетку-близнеца и выделяет её. */}
        {link && (
          <>
            <Text style={[styles.feedHint, { color: PORTAL_COLOR }]}>{t('fractalPortalHint')}</Text>
            {undecided && (
              <Text style={[styles.feedHint, { color: PORTAL_COLOR }]} accessibilityLiveRegion="polite">
                {t('fractalUndecided')}
              </Text>
            )}
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={`${t('fractalPortalGo')} ${link.other + 1}`}
              testID="fractal-portal-jump"
              onPress={() => {
                setOpenChild(link.other);
                setSelected({ r: link.otherAt[0], c: link.otherAt[1] });
                setPhase('child');
              }}
              style={[styles.portalBtn, { backgroundColor: colors.surface, borderColor: PORTAL_COLOR }]}
            >
              <Ionicons name="git-compare-outline" size={16} color={PORTAL_COLOR} />
              <Text style={[styles.portalBtnText, { color: PORTAL_COLOR }]}>
                {`${t('fractalPortalGo')} ${link.other + 1}`}
              </Text>
            </TouchableOpacity>
          </>
        )}

      </View>
    </GameShell>
  );
}

const styles = StyleSheet.create({
  configWrap: { padding: 16, gap: 12 },
  hero: { borderRadius: 18, padding: 22, alignItems: 'center', gap: 6 },
  heroTitle: { color: '#FFF', fontSize: 22, fontWeight: '800' },
  heroSub: { color: 'rgba(255,255,255,0.9)', fontSize: 13, textAlign: 'center' },
  card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 14 },
  cardText: { fontSize: 14, lineHeight: 20 },

  stats: { flexDirection: 'row', gap: 14, justifyContent: 'center' },
  stat: { fontSize: 13, fontWeight: '700' },
  headerActionsRow: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  // ⚠️ 48 — НЕ КРАСОТА, А ПОРОГ ПОПАДАНИЯ ПАЛЬЦЕМ (норма Material, гейт
  // scripts/tap-target-audit.mjs, проход «на поле»). Промах по мелкой кнопке — это не
  // «не нажалось», а тап по тому, что под ней: здесь под «Отменить» лежит доска, и
  // промах ставит цифру не туда. justifyContent обязателен: без него содержимое ляжет
  // к верху коробки и кнопка станет высокой, но пустой снизу.
  undoBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    minHeight: 48, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, borderWidth: 1,
  },
  undoText: { fontSize: 13, fontWeight: '700' },

  // Клиренс снизу = высота липкой клавиатуры: без него плитки нижних сеток прячутся
  // под тулбаром (скрин Дениса 28.08, 1.250.0 — «тулбар съел всё»).
  mapWrap: { alignItems: 'center', paddingTop: 4, paddingBottom: 150, gap: 4 },
  sectionLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', maxWidth: 320 },
  tile: {
    width: 92, height: 62, borderRadius: 14, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', gap: 2,
  },
  tileHead: { flexDirection: 'row', alignItems: 'center', gap: 5 },

  playCol: { alignItems: 'center', gap: 10, marginBottom: 150 },
  // Пометки: три ряда по три, поверх клетки и БЕЗ перехвата касаний —
  // палец должен попадать в саму клетку, а не в слой с цифрами.
  markGrid: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center',
  },
  paintRow: { flexDirection: 'row', gap: 8, justifyContent: 'center', marginBottom: 6 },
  // Иконка-инструмент в шапке: тот же порог 48 (frontend/scripts/tap-target-audit.mjs).
  toolIconBtn: { width: 48, height: 48, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  // Бейдж счётчика пометок на иконке карандаша — подпись с числом переехала сюда.
  toolBadge: {
    position: 'absolute', top: 3, right: 3, minWidth: 14, height: 14, borderRadius: 7,
    paddingHorizontal: 2, alignItems: 'center', justifyContent: 'center',
  },
  // Образцы цвета стоят в один ряд с инструментами: тот же порог 48, иначе выбор
  // цвета — самая мелкая мишень на экране, а тыкают в неё десятки раз за партию.
  swatch: { width: 48, height: 48, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  // Мини-карта: девять блоков корня, каждый — одна дочерняя сетка.
  miniWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mini: { borderWidth: 1, borderRadius: 3, overflow: 'hidden' },
  miniRow: { flexDirection: 'row' },
  miniCell: { alignItems: 'center', justifyContent: 'center' },
  tierDot: {
    minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 3,
    alignItems: 'center', justifyContent: 'center',
  },
  // Кольцо портала: не заливка, а обводка — цифра в клетке обязана остаться читаемой.
  portalRing: { position: 'absolute', top: 2, left: 2, right: 2, bottom: 2, borderRadius: 999, borderWidth: 2 },
  // Рамка вложенной клетки — квадратная и пунктирная, нарочно НЕ как круглое кольцо
  // портала: это два разных свойства доски, и рисоваться они обязаны по-разному.
  fedRing: { position: 'absolute', top: 1.5, left: 1.5, right: 1.5, bottom: 1.5, borderRadius: 3 },
  fedTag: { position: 'absolute', top: -0.5, left: 2.5, fontWeight: '800' },
  // Призрак дочерней сетки: слой на всю клетку, миниатюра 9×9 отцентрована в нём.
  ghostWrap: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  portalTag: { position: 'absolute', top: -1, right: 2, fontWeight: '800' },
  // Тот же порог 48, что у остальных кнопок «на поле»: под ней лежит доска, и промах
  // мимо перехода поставит цифру не туда (scripts/tap-target-audit.mjs).
  portalBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    minHeight: 48, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1,
  },
  portalBtnText: { fontSize: 13, fontWeight: '700' },
  tierDotText: { fontSize: 10, fontWeight: '800', color: '#FFF' },
  grid: { borderWidth: 2, borderRadius: 4, overflow: 'hidden' },
  row: { flexDirection: 'row' },
  cell: { alignItems: 'center', justifyContent: 'center' },
  feedHint: { fontSize: 12, textAlign: 'center', paddingHorizontal: 20 },
  // Клавиши 48 — ровно порог попадания, на пятую часть меньше прежних 58: панель
  // перестаёт спорить с доской за высоту (Денис 28.08), а промахи не растут.
  pad: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, justifyContent: 'center', maxWidth: 280 },
  key: { width: 48, height: 48, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
