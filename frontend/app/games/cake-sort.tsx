/* psygames-game-cake-sort · VER 5 · 09.09.2026 */
/**
 * ТОРТЫ — собрать круг из ШЕСТИ секторов.
 *
 * Отдельная игра, а не режим сортировки товаров (решение Дениса). Вся правда о
 * столе живёт в ядре `src/games/cake-sort/core/**`: правила круга, решатель,
 * лестница, геометрия. Экран не считает НИЧЕГО сам — он рисует и передаёт ходы.
 *
 * 🔴 ПОЧЕМУ ЭКРАН НЕ ПОВТОРЯЕТ АРИФМЕТИКУ. В сортировке товаров ровно это
 * стоило боевого краха: экран считал ёмкости по размеру сетки, а число ниш
 * задавала маска формы, и `makeBoard` честно ронял игру. Здесь любое число —
 * из ядра, а не из соседнего ref.
 *
 * ⚠️ ТАРЕЛКИ РИСУЮТСЯ ВЕКТОРОМ, а начинка — спрайтом поверх сектора. Клин
 * нельзя нарисовать растром: он часть круга, и при любом числе тарелок его
 * размер разный. Геометрия считается в `core/layout.ts` ДО отрисовки — там же
 * лежит замер, при какой ширине сколько столбцов ещё читаемо.
 */
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView, useWindowDimensions } from 'react-native';
import Svg, { Path, Circle as SvgCircle, ClipPath, Defs, Image as SvgImage } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { goBackOrHome } from '@/src/utils/nav';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { useProfile } from '@/src/contexts/ProfileContext';
import { useCalmHush } from '@/src/hooks/useCalmHush';
import { useScreenWidth } from '@/src/hooks/useScreenWidth';
import { useGamePreset } from '@/src/hooks/useGamePreset';
import { saveSession } from '@/src/services/api';
import GameShell from '@/src/components/GameShell';
import { GameAuxAction, GameAuxBar } from '@/src/components/GameAuxAction';
import GameSetupBar from '@/src/components/GameSetupBar';
import LevelProgressMap from '@/src/components/LevelProgressMap';
import LevelCleared from '@/src/components/LevelCleared';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import { useMoveHistory } from '@/src/hooks/useMoveHistory';
import { hapticSuccess, hapticTap, useScorePopups, ScorePopupLayer } from '@/src/components/juice';
import { sndPlace, sndMatch, sndCombo, sndWrong } from '@/src/services/feedback';
import { saveResume, clearResume } from '@/src/services/resume';
import { useResumeBoot } from '@/src/hooks/useResumeBoot';
import { useLevelRules, LevelRuleBadge, LevelRuleModal, LevelRule } from '@/src/components/LevelRules';
import { CIRCLE, Board, canPlace, moveTop, isCleared, hasAnyMove, makeBoard } from '@/src/games/cake-sort/core/plate';
import { deal, levelCfg } from '@/src/games/cake-sort/core/level';
import { referenceFor, starsFor } from '@/src/games/cake-sort/core/stars';
import { prebuilt, prebuiltMin } from '@/src/games/cake-sort/core/prebuilt';
import { solvePath, minMoves } from '@/src/games/cake-sort/core/solver';
import { topFor, boardsFor, type КруглаяШкурка } from '@/src/constants/cakeTops';
import { plateAtPoint, plateForGrab, PLATE_GAP, SECTOR_MIN, tableFit, cakeRadius } from '@/src/games/cake-sort/core/layout';
import { cakeThemeForProfile } from '@/src/constants/cakeThemes';

export const CS_GAME_ID = 'cake_sort';

/** Версия снимка партии. Меняется, когда меняется форма состояния. */
export const CS_RESUME_VERSION = 1;

/** Подсказок на уровень. Столько же, сколько в сортировке товаров: три. */
export const HINTS_PER_LEVEL = 3;

/**
 * Правила уровня. Пока одно: очередь входящих — механика, которой нет ни в одной
 * другой нашей игре, и она обязана быть объяснена. `fromLevel` равен `QUEUE_FROM`
 * из ядра; равенство сторожит гейт, а не память.
 */
export const CS_RULES: LevelRule[] = [
  { key: 'queue', fromLevel: 7 },   // = QUEUE_FROM
];

const GRADIENT = ['#f472b6', '#f59e0b'];

/** Путь одного сектора круга: клин от центра, шестая часть. */
function wedgePath(cx: number, cy: number, r: number, index: number): string {
  const шаг = (Math.PI * 2) / CIRCLE;
  const a0 = index * шаг - Math.PI / 2;
  const a1 = a0 + шаг;
  const x0 = cx + r * Math.cos(a0); const y0 = cy + r * Math.sin(a0);
  const x1 = cx + r * Math.cos(a1); const y1 = cy + r * Math.sin(a1);
  return `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1} Z`;
}

/**
 * 🔴 ОДИН ЭКРАН — ДВЕ ИГРЫ, КАК У ПЕРЕЛИВАЛКИ С ШАРИКАМИ И ГАЙКАМИ.
 *
 * Денис 07.09.2026: «ещё сделать режим пиццы, смысл тот же, картинки разные».
 * Правило хода, круг из шести, очередь входящих и доказуемость — общие; своя у
 * шкурки только КАРТИНКА куска и своя лестница уровней (у каждой игры свой
 * `gameId`, а значит свой сохранённый уровень и своя недоигранная партия).
 *
 * ⚠️ Разводить их двумя экранами было бы дороже вдвое и разъехалось бы на первой
 * же правке правил: у соседней семьи (переливалка/шарики/гайки) это уже решено
 * ровно так, и повторять чужое решение дешевле, чем изобретать своё.
 */
export interface CakeScreenProps {
  /** Своя лестница и свой сохранённый уровень: `cake_sort` либо `pizza_sort`. */
  gameId: string;
  /** Что рисуется на куске: торт или пицца. */
  skin: КруглаяШкурка;
  /** Ключ заголовка в словаре. */
  titleKey: string;
}

export function CakeSortScreen({ gameId, skin, titleKey }: CakeScreenProps) {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const { profile } = useProfile();
  /**
    * ⚠️ ШИРИНА МОЖЕТ ПРИЙТИ НУЛЁМ. На первом кадре и при повороте экрана
    * `useWindowDimensions` отдаёт 0, и вся геометрия стола схлопывается в точку —
    * тарелки рисуются нулевого диаметра, а деление на них даёт NaN.
    */
  const width = useScreenWidth();
  /** Высота окна — только как оценка поля на первый кадр, до `onLayout`. */
  const { height: окноH } = useWindowDimensions();
  /** Вечерний и ночной шаг зарядки — без писка. Признак берётся из пресета, как у всех. */
  const { isCalm } = useGamePreset();
  useCalmHush(isCalm);
  const lvl = usePersistentLevel(gameId);
  const [начали, setНачали] = useState(false);
  const level = lvl.level;

  const тема = useMemo(() => cakeThemeForProfile(profile?.id), [profile?.id]);
  /*
   * Посуда: у тортов — тарелки темы профиля, у пиццы своя (дерево, металл,
   * керамика). Тема профиля к пицце отношения не имеет, ей нужен материал.
   */
  const посуда = useMemo(() => boardsFor(skin, тема.plates), [skin, тема]);
  const cfg = useMemo(() => levelCfg(level), [level]);
  /**
   * Кругов на уровне: те, что лежат на столе, плюс те, что придут из очереди.
   *
   * ⚠️ Именно по этому числу считается эталон ходов, а не по числу ВИДОВ. С
   * очередью кругов больше видов (на L60 — восемнадцать против одиннадцати), и
   * эталон по видам занизился бы в полтора раза: три звезды стали бы
   * недостижимы на каждом столе.
   */
  const кругов = cfg.types + cfg.queue;

  const [board, setBoard] = useState<Board | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [moves, setMoves] = useState(0);
  const [done, setDone] = useState(false);
  /**
   * 🔴 ОТМЕНА — СНИМОК ЦЕЛИКОМ, А НЕ «ОТКУДА-КУДА». Ход запускает каскад:
   * круг замыкается, тарелка уходит, на её место приезжает очередь. Обратный
   * ход этого не восстановит — вернуть можно только состояние.
   *
   * ⚠️ И отмена БЕСПЛАТНА, как в сортировке товаров, по той же причине: стол
   * полностью на виду, исход хода считается заранее, перебором «сделал —
   * посмотрел — откатил» ничего не разведаешь. Платит она только ходами: снятый
   * ход возвращается в счётчик, иначе звёзды давались бы за перебор.
   */
  const история = useMoveHistory<{ b: Board; moves: number }>();
  const [hints, setHints] = useState(HINTS_PER_LEVEL);
  const [hint, setHint] = useState<{ from: number; to: number } | null>(null);
  /**
   * 🔴 ПУТЬ ПОДСКАЗОК ПОМНИТСЯ, А НЕ ИЩЕТСЯ ЗАНОВО КАЖДЫЙ РАЗ.
   *
   * Замер поймал это гейтом: обход в глубину при каждом вызове находит ДРУГОЙ
   * путь, и две подсказки подряд отменяли друг друга — по четыреста советов на
   * стол, и стол не разобран. Каждый совет при этом законен и ведёт к решению;
   * ломается именно их последовательность. Помним путь и идём по нему, пока
   * игрок ходит как советовали; свернул — путь сбрасывается и ищется заново.
   */
  const [путь, setПуть] = useState<{ from: number; to: number }[] | null>(null);
  /** Точный минимум, если фоновый расчёт успел. Иначе звёзды идут от калибровки. */
  const [точныйМин, setТочныйМин] = useState<number | null>(null);
  /**
   * 🔴 «УРОВЕНЬ ПРОВЕРЕН» — ОБЕЩАНИЕ, А НЕ УКРАШЕНИЕ. Значок ставится ТОЛЬКО
   * когда решатель нашёл решение этой самой доски. «Не доказано, что нельзя» —
   * не то же самое, и показывать его как проверку значит врать ровно там, где
   * у конкурента 454 отзыва про непроходимые уровни.
   */
  const [доказан, setДоказан] = useState(false);
  const { popups, spawn } = useScorePopups();

  const rulesHere = CS_RULES;
  const levelRules = useLevelRules(gameId, level, rulesHere, !done);

  /**
   * ⚠️ СБРОС ИСТОРИИ ЗДЕСЬ НЕ ЗОВЁТСЯ. Хук отмены отдаёт новый объект на каждом
   * рендере, и держать его в зависимостях значит пересоздавать раздачу каждый
   * кадр. Историю чистит тот, кто меняет уровень, — ниже, в правке состояния.
   */
  const раздать = useCallback(() => {
    /**
     * 🔴 ВШИТУЮ ДОСКУ БЕРЁМ ГОТОВОЙ, А НЕ ПЕРЕСЧИТЫВАЕМ. Это требование ТЗ
     * раздела дословно: «на 30–40 нишах перестаёт доказываться решаемость —
     * значит уровни генерировать офлайн и ВШИВАТЬ, а не считать на устройстве».
     * Файл с досками лежал с 06.09.2026, а экран всё это время звал раздачу
     * живьём и читал оттуда только минимум ходов.
     *
     * ⚠️ ЦЕНА БЫЛА НЕ ТЕОРЕТИЧЕСКОЙ. `deal` — это ДВА полных прогона решателя
     * (заслон `dealRejected` и подтверждение `provenSolvable`), и они шли
     * СИНХРОННО В РЕНДЕРЕ. Замер 07.09.2026 на маке: 36 мс на L20, 117 мс на
     * L60, 188 мс на L120; на телефоне вчетверо. Столько экран стоял на месте
     * при каждой смене уровня.
     *
     * ⚠️ Значок «проверен» берётся из ПОЛЯ файла, а не из «раз лежит, значит
     * доказан»: обещание игроку должно опираться на факт, записанный тем, кто
     * доказывал. За пределами вшитого (L121 и дальше) раздаём как раньше.
     */
    const в = prebuilt(level);
    const d = в
      ? { board: makeBoard(в.plates, в.queue), proven: в.proven === true }
      : deal(level);
    setBoard(d.board); setДоказан(d.proven);
    setSel(null); setDone(false); setHint(null);
    setHints(HINTS_PER_LEVEL); setТочныйМин(null);
    setПуть(null);
    setMoves(0);
  }, [level]);

  /**
   * ⚠️ РАЗДАЧА — ПРАВКА СОСТОЯНИЯ ПРИ СМЕНЕ УРОВНЯ, А НЕ ЭФФЕКТ.
   *
   * Прямой `setState` в теле эффекта даёт каскад перерисовок, и линт на это
   * ругается по делу. React для этого случая предлагает свой приём — поправить
   * состояние ПРЯМО В РЕНДЕРЕ, когда изменилось то, от чего оно зависит: React
   * перезапускает рендер до отрисовки, лишнего кадра не будет.
   */
  const [роздан, setРоздан] = useState<number | null>(null);
  if (роздан !== level) {
    setРоздан(level);
    раздать();
    история.reset();
  }

  /**
   * 🔴 ТОЧНЫЙ МИНИМУМ СЧИТАЕТСЯ ФОНОМ, А НЕ НА ГЛАЗАХ У ЧЕЛОВЕКА.
   *
   * Замер: A* доходит до дна на малых столах за миллисекунды, а с шестого
   * уровня не укладывается и в 60 000 узлов (1,0–1,7 с). Держать на этом старт
   * уровня нельзя, поэтому: успел — звёзды считаются по НАСТОЯЩЕМУ минимуму,
   * не успел — по калиброванному эталону, и это честнее, чем ждать.
   */
  useEffect(() => {
    if (!board) return;
    /**
     * 🔴 СНАЧАЛА СМОТРИМ ВШИТОЕ, И ТОЛЬКО ПОТОМ СЧИТАЕМ. Минимум посчитан
     * офлайн с бюджетом в тринадцать раз больше здешнего — если он есть, считать
     * заново незачем и нечем: на устройстве тот же поиск до дна не дойдёт.
     */
    let живо = true;
    /**
     * ⚠️ ДАЖЕ ГОТОВОЕ ЧИСЛО СТАВИМ ЧЕРЕЗ ОТЛОЖЕННЫЙ ВЫЗОВ. Прямой `setState` в
     * теле эффекта даёт каскад перерисовок — линт ругается на это по делу, и
     * «у нас же значение уже есть» тут не оправдание: кадр всё равно лишний.
     */
    const t = setTimeout(() => {
      if (!живо) return;
      const готовый = prebuiltMin(level);
      if (готовый !== null) { setТочныйМин(готовый); return; }
      const r = minMoves(board, 30000);
      if (живо && r.moves !== null) setТочныйМин(r.moves);
    }, 0);
    return () => { живо = false; clearTimeout(t); };
  }, [level, board]);

  /** Снимок партии: стол, ходы, подсказки. Уровень персистится сам. */
  useEffect(() => {
    if (!board || done || moves === 0) return;
    saveResume(gameId, profile?.id ?? 'free', CS_RESUME_VERSION, { board, moves, hints, level }).catch(() => {});
  }, [gameId, board, moves, hints, done, level, profile?.id]);

  useResumeBoot<{ board: Board; moves: number; hints: number; level: number }>(
    gameId, CS_RESUME_VERSION,
    (saved) => {
      if (!saved || saved.level !== level) return;
      setBoard(saved.board); setMoves(saved.moves);
      setHints(saved.hints); история.reset();
    },
    false,
  );

  /**
   * Геометрия стола. Столбцов — не больше, чем читаемо влезает: число берётся
   * из `maxCols`, а не назначается вёрсткой. Строк — сколько нужно под тарелки.
   */
  /**
   * Высота поля под стол. Меряется, а не назначается: над столом шапка с HUD и
   * строкой правила, под ним — кнопки, и всё это разной высоты на разных языках.
   * До первого `onLayout` берём оценку от окна — она нужна ровно на один кадр.
   */
  const [полеH, setПолеH] = useState(0);

  /**
   * Геометрия стола. Столбцы подбираются под ШИРИНУ И ВЫСОТУ поля: разбор и
   * правило выбора — в шапке `tableFit`. Прежняя редакция брала только ширину и
   * при честном замере клина оставляла нижний ряд тарелок под обрезом.
   */
  const стол = useMemo(() => {
    const доступно = Math.min(width, 520) - 16;
    const поле = полеH > 0 ? полеH : Math.max(240, Math.round((окноH || 640) * 0.62));
    return { ...tableFit(доступно, поле, cfg.plates), boardW: доступно };
  }, [width, окноH, полеH, cfg.plates]);

  const тронуть = (i: number) => {
    if (!board || done) return;
    const тарелка = board.plates[i] ?? [];
    if (sel === null) {
      if (!тарелка.length) { hapticTap(); return; }
      setSel(i); hapticTap(); return;
    }
    if (sel === i) { setSel(null); return; }
    переложить(sel, i);
  };

  /**
   * 🔴 ХОД С ЯВНО НАЗВАННЫМИ «ОТКУДА» И «КУДА» — И ПОЧЕМУ ЭТО НЕ ПРИДИРКА.
   *
   * 📍 Поймано собственным гейтом 09.09.2026. Отпускание жеста делало
   * `setSel(f); тронуть(t);` — то есть рассчитывало, что состояние обновится
   * МЕЖДУ двумя строками. Оно так не работает: `тронуть` в том же такте видит
   * `sel === null` и вместо хода ВЫБИРАЕТ цель. Кусок оставался поднятым, ход не
   * происходил.
   *
   * ⚠️ В браузере беда пряталась: если выбор уже был сделан тапом раньше, ход
   * проходил — и жест выглядел рабочим через раз. Ровно поэтому проверять надо
   * пробой с чистого состояния, а не «у меня получилось».
   *
   * Теперь и тап, и жест зовут ОДИН ход с явными концами. Тап по-прежнему
   * отвечает за выбор, жест выбора не касается.
   */
  const переложить = (откуда: number, куда: number) => {
    if (!board || done || откуда === куда) { setSel(null); return; }
    const src = board.plates[откуда] ?? [];
    if (!src.length) { setSel(null); return; }
    const тип = src[src.length - 1] as number;
    if (!canPlace(board, куда, тип)) { setSel(null); пометитьОтказ(куда); hapticTap(); sndWrong(); return; }
    const после = moveTop(board, откуда, куда);
    if (!после) { setSel(null); return; }
    история.push({ b: board, moves });
    // Пошёл как советовали — снимаем шаг с пути; свернул — путь больше не наш.
    const шаг = путь?.[0];
    setПуть(шаг && шаг.from === откуда && шаг.to === куда ? путь!.slice(1) : null);
    setMoves(moves + 1);
    setSel(null); setHint(null);
    /**
     * Сколько кругов замкнулось этим ходом. Считаем по ПУСТЫМ тарелкам, а не по
     * «стало меньше секторов»: очередь тут же занимает освободившееся место, и
     * разница в числе секторов соврала бы.
     */
    const i = куда;
    const пустыхДо = board.plates.filter((p) => p.length === 0).length;
    const пустыхПосле = после.plates.filter((p) => p.length === 0).length;
    const собрано = Math.max(0, пустыхПосле - пустыхДо + (board.queue.length - после.queue.length));
    if (собрано > 0) {
      hapticSuccess();
      if (собрано > 1) sndCombo(собрано); else sndMatch();
      spawn(width / 2 - 24, 140, (собрано > 1 ? `×${собрано}  ` : '') + '+' + собрано * 100, '#fde047');
    } else { hapticTap(); sndPlace(); }
    setBoard(после);
    if (isCleared(после)) {
      setDone(true); hapticSuccess();
      clearResume(gameId, profile?.id ?? 'free').catch(() => {});
      /**
       * Запись партии — та же форма, что у всех: `passed` пишется всегда, иначе
       * «пройдено» нельзя отличить от «бросил на середине» ни в одном отчёте.
       */
      saveSession({
        game_type: gameId, score: moves, time_seconds: 0, passed: true,
        details: { level, moves, types: cfg.types, stars: starsFor(moves, кругов, точныйМин) },
      }).catch(() => {});
    }
  };

  /** Отмена: возвращаем снимок и СНИМАЕМ ход со счётчика — иначе перебор бесплатен. */
  const отменить = () => {
    const last = история.undo();
    if (!last) { hapticTap(); return; }
    setBoard(last.b); setMoves(last.moves);
    setПуть(null);   // откат меняет стол — прежний путь к нему не относится
    setSel(null); setHint(null); hapticTap(); sndPlace();
  };

  /**
   * Подсказка — ПЕРВЫЙ ХОД настоящего решения. Не нашли за бюджет — счётчик не
   * тратим: подсказка, которой нет, не должна стоить как подсказка.
   */
  const подсказать = () => {
    if (!board || hints <= 0 || done) { hapticTap(); return; }
    const текущий = путь && путь.length ? путь : solvePath(board, 20000);
    if (текущий !== путь) setПуть(текущий);
    const h = текущий?.[0] ?? null;
    if (!h) { hapticTap(); sndWrong(); return; }
    setHints((n) => n - 1); setHint(h); setSel(null); hapticTap(); sndPlace();
  };

  /**
   * 🔴 ЗВЁЗДЫ ОТ НАСТОЯЩЕГО МИНИМУМА, ЕСЛИ ОН ПОСЧИТАН. Калибровка 5,6 —
   * оценка по видам; точный минимум этой раздачи лучше, и когда фон успел, берём
   * его. Разница не косметическая: на просторном столе минимум заметно меньше.
   */
  /* ─────────────── ПЕРЕТАСКИВАНИЕ ───────────────
   *
   * 🔴 ПРЯМЫЕ RESPONDER-ПРОПСЫ, А НЕ `PanResponder`. Разница не в стиле.
   * `PanResponder` создаётся ОДИН раз и замыкает первый рендер намертво — чтобы
   * он видел живую партию, состояние приходится дублировать в ссылки, а React
   * запрещает трогать ссылки во время рендера (линт ловит это ошибкой). Пропсы
   * же пересоздаются каждый рендер и замыкают СВЕЖЕЕ состояние: ни ссылок, ни
   * зеркал, ни грабли «жест считает по геометрии первого уровня», на которой
   * стоит предупреждение в сортировке товаров и в ханойской башне.
   *
   * ⚠️ КАСАНИЕ НЕ ПЕРЕХВАТЫВАЕМ. Короткий тап обязан достаться кнопке тарелки —
   * это путь, которым игру ведёт скринридер. Жест забираем только после порога
   * сдвига, иначе один тап обработался бы дважды и ход посчитался бы за два.
   */
  const СДВИГ = 6;
  const [тащим, setТащим] = useState<number | null>(null);
  const [цель, setЦель] = useState<number | null>(null);
  /**
   * 🔴 ЧТО В РУКЕ И КУДА ЦЕЛИМСЯ — ЕЩЁ И В ССЫЛКАХ, А НЕ ТОЛЬКО В СОСТОЯНИИ.
   *
   * 📍 Найдено 09.09.2026 живым замером: `onStartShouldSetResponderCapture` и
   * `onResponderGrant` срабатывают, а перенос всё равно ничем не кончается.
   * Причина — устаревшее замыкание: система ответчика запоминает обработчики В
   * МОМЕНТ ЗАХВАТА, и `onResponderMove` с `onResponderRelease` читают состояние
   * ТОГО рендера, где `тащим` ещё `null`. Движение молча выходит по первой
   * строке, `цель` не обновляется, отпускание видит пустую руку — и ход не
   * делается ни разу.
   *
   * ⚠️ Шапка этого файла утверждала обратное: «пропсы пересоздаются каждый
   * рендер и замыкают свежее состояние». Для ПРОПСОВ это правда, но ответчику
   * их к тому времени уже отдали. Сосед (сортировка товаров) держит ровно эти
   * две величины в ссылках, и его перетаскивание работает — теперь понятно,
   * почему.
   *
   * Пишутся только из обработчиков событий: запрет React на ссылки во время
   * рендера не нарушается.
   */
  const тащимRef = useRef<number | null>(null);
  const цельRef = useRef<number | null>(null);
  /**
   * 🔴 ОТКАЗ ОБЯЗАН БЫТЬ ВИДЕН, А НЕ ТОЛЬКО СЛЫШЕН.
   *
   * 📍 Решение Дениса 09.09.2026: «тапы — главный путь, как в жанре и как в
   * остальных наших сортировках; довести их до того же качества: отказ должен
   * быть виден, а не только слышен».
   *
   * Так и было: `переложить` на запрещённом ходе звало `hapticTap()` и
   * `sndWrong()` — и всё. В нашей сборке (Tauri = вебвью) вибрации НЕТ вовсе, а
   * звук человек выключает первым делом, поэтому запрещённый ход выглядел ровно
   * как «не нажалось». Ровно та же дыра, что нашлась сегодня в сортировке
   * товаров, и лечится так же: тарелка на треть секунды обводится алым.
   */
  const [отказал, setОтказал] = useState<number | null>(null);
  const ОТКАЗ_МС = 380;
  const пометитьОтказ = (i: number) => {
    setОтказал(i);
    setTimeout(() => setОтказал((c) => (c === i ? null : c)), ОТКАЗ_МС);
  };
  const столRef = useRef<View | null>(null);
  /**
   * 🔴 УГОЛ СТОЛА И ТОЧКА КАСАНИЯ ЖИВУТ В ССЫЛКАХ, А НЕ В СОСТОЯНИИ.
   *
   * Обе величины нужны В ТОМ ЖЕ обработчике, где снимаются. `useState` отдаёт
   * новое значение только СЛЕДУЮЩЕМУ рендеру, поэтому прежний код мерил угол
   * стола и тут же считал попадание по ещё нулевому `бокс` — первое касание
   * всегда попадало не в ту тарелку (а при столе у левого края экрана — «мимо
   * стола»). Запись идёт из обработчика события, не из рендера, так что запрет
   * React на ссылки во время рендера здесь ни при чём.
   */
  const боксRef = useRef({ x: 0, y: 0 });
  const стартRef = useRef<{ x: number; y: number } | null>(null);

  const снятьБокс = () => {
    const n: any = столRef.current;
    if (!n) return;
    if (typeof n.getBoundingClientRect === 'function') {
      const r = n.getBoundingClientRect();
      боксRef.current = { x: r.left, y: r.top };
      return;
    }
    n.measureInWindow?.((x: number, y: number) => { боксRef.current = { x, y }; });
  };

  /** Тарелка под точкой экрана. Вся арифметика — в `plateAtPoint`. */
  const тарелкаПод = (pageX: number, pageY: number) =>
    (стол.plate
      ? plateAtPoint(pageX - боксRef.current.x, pageY - боксRef.current.y, стол.cols, стол.plate, cfg.plates, стол.boardW)
      : null);

  /**
   * 🔴 ЖЕСТ ЗАБИРАЕТСЯ ТОЛЬКО ЕСЛИ ЕСТЬ ЧТО НЕСТИ.
   *
   * 📍 Денис 09.09.2026: «не работает ни драг-энд-дроп, ни ПО КЛИКУ». Второе —
   * следствие первого. Стол забирал ответчика у тарелки на любом сдвиге дальше
   * порога, а мышью и тачпадом «клик» почти всегда едет на несколько точек.
   * Ответчик уходил к столу, `onPress` тарелки отменялся — и тап пропадал. При
   * этом сам жест ничем не кончался: тарелка под точкой касания вычислялась по
   * сбитой сетке (см. `rowLeft`), `тащим` оставался пустым.
   *
   * Теперь стол спрашивает СЕБЯ, есть ли под точкой касания непустая тарелка.
   * Нечего нести — жест не забираем, и тап достаётся тарелке, как и задумано.
   */
  const естьЧтоНести = () => {
    const с = стартRef.current;
    if (!с || !board || done) return false;
    const i = тарелкаДляХвата(с.x, с.y);
    return i !== null && !!(board.plates[i]?.length);
  };

  const далеко = (e: any) => {
    const с = стартRef.current;
    if (!с) return false;
    const { pageX, pageY } = e.nativeEvent;
    if (Math.abs(pageX - с.x) + Math.abs(pageY - с.y) <= СДВИГ) return false;
    return естьЧтоНести();
  };

  /**
   * Тарелка, С КОТОРОЙ берут: по всей клетке, а не по кругу (`54748daf`).
   * Разбор, почему у хвата и сброса разная строгость, — в `plateForGrab`.
   */
  const тарелкаДляХвата = (pageX: number, pageY: number) =>
    (стол.plate ? plateForGrab(pageX - боксRef.current.x, pageY - боксRef.current.y, стол.cols, стол.plate, cfg.plates, стол.boardW) : null);

  const жест = {
    /**
     * 🔴 БЕЗ CAPTURE ПЕРЕТАСКИВАНИЯ НЕТ ВОВСЕ — И ЭТО БЫЛ ЖИВОЙ ДЕФЕКТ.
     *
     * 📍 Денис 09.09.2026: «режим драг и дроп не работает, перетаскивание».
     * Разбор: каждая тарелка — `TouchableOpacity`, он забирает ответчика НА
     * КАСАНИИ и держит его до отпускания. Система спрашивает родителя только
     * пока ответчика ни у кого нет, поэтому `onMoveShouldSetResponder` на столе
     * не вызывался НИ РАЗУ, `onResponderGrant` не срабатывал, и жест выглядел
     * как «тащу, а ничего не происходит». Тот же разбор дословно записан в
     * сортировке товаров — там Capture стоит с самого начала.
     *
     * ⚠️ ВТОРАЯ ПОЛОВИНА ДЕФЕКТА БЫЛА В САМОМ ПОРОГЕ. Условие читало
     * `locationX/locationY` как будто это СМЕЩЕНИЕ, а это координата пальца
     * ВНУТРИ элемента: у любой тарелки крупнее шести точек сумма превышала порог
     * всегда. То есть даже получи стол вопрос — он отвечал бы «да» на первое же
     * касание и съедал бы тап. Смещение считается от запомненной точки касания.
     *
     * Capture-вариант старта вызывается ДО детей и на КАЖДОМ касании, отвечает
     * `false` — тап по-прежнему достаётся тарелке, а мы лишь запоминаем, где
     * палец лёг, и меряем угол стола, пока он заведомо на месте.
     */
    onStartShouldSetResponderCapture: (e: any) => {
      const { pageX, pageY } = e.nativeEvent;
      стартRef.current = { x: pageX, y: pageY };
      снятьБокс();
      return false;
    },
    onStartShouldSetResponder: () => false,
    onMoveShouldSetResponder: (e: any) => далеко(e),
    onMoveShouldSetResponderCapture: (e: any) => далеко(e),
    onResponderGrant: () => {
      if (!board || done) return;
      /*
       * Тарелку берём ОТТУДА, ГДЕ ПАЛЕЦ ЛЁГ, а не оттуда, где он оказался к
       * моменту признания жеста: между касанием и порогом сдвига палец уже ушёл
       * с тарелки, и на резком движении жест начинался бы с соседней.
       */
      const с = стартRef.current;
      if (!с) return;
      // Хват — со ВСЕЙ тарелки (3c085b4d, отчёт 54748daf: «плохо хватался с тарелок»), а не с её середины.
      const i = тарелкаДляХвата(с.x, с.y);
      // С пустой тарелки брать нечего: начать жест, который заведомо ничем не
      // кончится, хуже, чем не начать — сектор «поднимется» и упадёт назад.
      if (i === null || !(board.plates[i]?.length)) return;
      тащимRef.current = i; цельRef.current = i;
      setТащим(i); setЦель(i); hapticTap();
    },
    onResponderMove: (e: any) => {
      if (тащимRef.current === null) return;
      const i = тарелкаПод(e.nativeEvent.pageX, e.nativeEvent.pageY);
      if (i !== цельRef.current) { цельRef.current = i; setЦель(i); }
    },
    onResponderRelease: () => {
      const f = тащимRef.current; const t = цельRef.current;
      тащимRef.current = null; цельRef.current = null;
      setТащим(null); setЦель(null);
      if (f !== null && t !== null && f !== t) переложить(f, t);
    },
    onResponderTerminate: () => { тащимRef.current = null; цельRef.current = null; setТащим(null); setЦель(null); },
  };

  const эталон = referenceFor(кругов, точныйМин);
  const звёзды = starsFor(moves, кругов, точныйМин);
  const встал = board ? !isCleared(board) && !hasAnyMove(board) : false;

  const тарелка = (i: number) => {
    const cells = board?.plates[i] ?? [];
    const r = стол.plate / 2;
    /**
     * 🔴 РАДИУС ТОРТА СЧИТАЕТ ГЕОМЕТРИЯ, А НЕ РАЗМЕТКА. Здесь стояло `(r−3)·0,72`
     * прямо в двух местах — и ровно эта доля НЕ УЧАСТВОВАЛА в замере читаемости:
     * `sectorWidth` мерила тарелку целиком и завышала клин в 1,23 раза. Пока
     * число живёт в разметке, замер и отрисовка расходятся молча. Разбор и
     * происхождение 0,90 — в шапке `CAKE_FILL`.
     */
    const рад = cakeRadius(стол.plate);
    const выбрана = sel === i || тащим === i;
    /**
     * 🔴 ПОДСВЕТКА ОБЯЗАНА ГОВОРИТЬ ПРАВДУ, А НЕ «ты целишься сюда».
     *
     * 📍 Денис 09.09.2026: «нихуя не тащится на другие тарелки нормально».
     * Замер разобрал жалобу надвое. Механизм переноса ЖИВОЙ: на свежей доске
     * 2→4 и 3→5 через ряд проходят. Не проходит ровно то, что ЗАПРЕЩЕНО
     * правилом — класть можно на пустую или на свой цвет. А игра об этом
     * молчала: вибрации в вебе нет, звук человек выключает, и при этом цель
     * подсвечивалась ГОЛУБЫМ независимо от того, ляжет кусок или нет.
     * То есть подсветка обещала ход, которого не будет, — и «не тащится».
     *
     * Теперь во время переноса видно ДО отпускания: голубым — куда ляжет,
     * алым — куда не примут. Тот же размен, что у соседа: отказ обязан быть
     * виден, а не только слышен.
     */
    /*
     * ⚠️ «В РУКЕ» — ЭТО И ТАЩИМОЕ, И ВЫБРАННОЕ ТАПОМ. Тап — главный путь игры
     * (решение Дениса 09.09.2026 по разбору жанра: во всех водных сортировках
     * управление двумя тапами, перетаскивания нет вовсе). Значит подсказки
     * «куда можно» обязаны гореть и после первого ТАПА, а не только под пальцем.
     */
    const вРукеИндекс = тащим ?? sel;
    const вРуке = вРукеИндекс !== null ? (board?.plates[вРукеИндекс] ?? []) : [];
    const типВРуке = вРуке.length ? (вРуке[вРуке.length - 1] as number) : null;
    const приму = вРукеИндекс !== null && вРукеИндекс !== i && board !== null && типВРуке !== null
      && canPlace(board, i, типВРуке);
    const подЦелью = тащим !== null && цель === i && цель !== тащим && приму;
    /** Целятся сюда, но не примут — про это надо сказать, а не промолчать. */
    const неПриму = тащим !== null && цель === i && цель !== тащим && !приму;
    /** Тап по запрещённой тарелке: ход не прошёл, и это ВИДНО, а не только слышно. */
    const отказНаМне = отказал === i;
    /** Куда вообще можно положить то, что в руке: видно на всём столе сразу. */
    const можноСюда = приму && цель !== i;
    return (
      <TouchableOpacity
        key={i}
        activeOpacity={0.85}
        onPress={() => тронуть(i)}
        accessibilityRole="button"
        accessibilityLabel={`${t('cakePlate')} ${i + 1}: ${cells.length}/${CIRCLE}`}
        style={[styles.plateBox, { width: стол.plate, height: стол.plate, margin: PLATE_GAP / 2 }]}
      >
        {/*
          🔴 ТАРЕЛКА — КАРТИНКА, КЛИНЬЯ — ВЕКТОР. Замер: сектор при пяти
          столбцах 15,5 точки, спрайт поверх него был бы 10,8 — ниже пола
          читаемости. Тарелка же 59–104 точки и видна всегда, поэтому картинка
          тратится на неё. Вариант оправы берётся от номера тарелки, чтобы стол
          из двадцати не выглядел обоями.
        */}
        <Image
          source={посуда[i % посуда.length]}
          style={{ position: 'absolute', width: стол.plate, height: стол.plate }}
          resizeMode="contain"
        />
        {/*
          🔴 SVG ПОДНЯТ НАД КАРТИНКОЙ ЯВНО, И БЕЗ ЭТОГО ИГРЫ НЕ БЫЛО.
          Отчёт NZT-48 06.09.2026 «А где тортики ?»: на тарелках не было НИ
          ОДНОГО куска. В DOM они были — по шесть путей на тарелку, с верной
          геометрией и цветами, — но картинка тарелки красилась поверх.
          В родном RN порядок отрисовки задаёт порядок в разметке, и картинка,
          объявленная ПЕРВОЙ, ушла бы вниз. На вебе (а Tauri iOS — это вебвью)
          правило другое: позиционированный элемент красится выше статичного
          независимо от порядка. `Image` у react-native-web позиционирован,
          `svg` — нет, и клинья оказались под посудой.
          Замер: скрыл картинки в живом DOM — куски появились; вернул картинки
          и поднял svg — куски остались. Это и есть починка.
        */}
        <Svg width={стол.plate} height={стол.plate} style={{ position: 'relative', zIndex: 1 }}>
          {/*
            🔴 КЛИН — ЭТО КАРТИНКА ТОРТА, ОБРЕЗАННАЯ ТЕМ ЖЕ ПУТЁМ, ЧТО РИСОВАЛ
            ЗАЛИВКУ. Целый круглый торт лежит под маской сектора, поэтому шесть
            кусков сходятся без щели по построению, а не по удаче генератора.

            ⚠️ ЗАЛИВКА ПОД КАРТИНКОЙ ОСТАЁТСЯ. Цвет вида — единственный канал, по
            которому игрок различает начинки; рисунок добавляет второй, но не
            заменяет первый. Не доехал ассет — стол по-прежнему играбелен.

            ⚠️ Имя маски несёт номер тарелки И номер сектора: `id` в SVG живёт в
            одном пространстве на весь документ, а тарелок на столе до двадцати.
            Совпади имена — все куски обрезались бы одной маской.
          */}
          <Defs>
            {cells.map((_, k) => (
              <ClipPath key={`c${k}`} id={`cake-${i}-${k}`}>
                <Path d={wedgePath(r, r, рад, k)} />
              </ClipPath>
            ))}
          </Defs>
          {cells.map((тип, k) => {
            return (
              <React.Fragment key={k}>
                <Path d={wedgePath(r, r, рад, k)} fill={тема.colors[тип % тема.colors.length]} stroke="#00000022" strokeWidth={1} />
                <SvgImage
                  href={topFor(skin, тип)}
                  x={r - рад} y={r - рад} width={рад * 2} height={рад * 2}
                  preserveAspectRatio="xMidYMid slice"
                  clipPath={`url(#cake-${i}-${k})`}
                />
                <Path d={wedgePath(r, r, рад, k)} fill="none" stroke="#00000033" strokeWidth={1} />
              </React.Fragment>
            );
          })}
          {выбрана && <SvgCircle cx={r} cy={r} r={r - 2} fill="none" stroke="#f59e0b" strokeWidth={3} />}
          {можноСюда && <SvgCircle cx={r} cy={r} r={r - 2} fill="none" stroke="#38bdf8" strokeWidth={2} strokeDasharray="5 5" />}
          {подЦелью && <SvgCircle cx={r} cy={r} r={r - 2} fill="none" stroke="#38bdf8" strokeWidth={4} />}
          {(неПриму || отказНаМне) && <SvgCircle cx={r} cy={r} r={r - 2} fill="none" stroke="#f43f5e" strokeWidth={4} />}
          {(hint?.from === i || hint?.to === i) && (
            <SvgCircle cx={r} cy={r} r={r - 2} fill="none" stroke={hint?.to === i ? '#38bdf8' : '#a3e635'} strokeWidth={3} strokeDasharray="6 5" />
          )}
        </Svg>
      </TouchableOpacity>
    );
  };

  /**
   * 🔴 ЭКРАН НАСТРОЕК С ТРОПИНКОЙ — СТАНДАРТ, А НЕ УКРАШЕНИЕ. Игра стартовала
   * сразу с раздачи, и вернуться на пройденный уровень было НЕЛЬЗЯ: тропинка
   * (`LevelProgressMap`) — единственная дверь к уже взятым ступеням во всём
   * приложении. Заведено 06.09.2026 при сборке выпуска 2.47.0; гейт
   * `game-standard` поймал это первым полным прогоном.
   */
  if (!начали) {
    return (
      <GameShell title={t(titleKey)} onBack={() => goBackOrHome()}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 96 }}>
          <View style={[styles.setupCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.setupLabel, { color: colors.text }]}>{t('level')} {level}</Text>
            <Text style={[styles.setupHint, { color: colors.textSecondary }]}>{t('cakeSortDesc')}</Text>
          </View>
          <LevelProgressMap
            bestLevel={lvl.best}
            gameId={CS_GAME_ID}
            currentLevel={level}
            onPickLevel={lvl.pick}
            maxLevel={Math.max(15, level)}
            colors={colors}
            language={language}
          />
        </ScrollView>
        <GameSetupBar label={t('start')} onStart={() => { setНачали(true); раздать(); }} colors={GRADIENT as [string, string]} />
      </GameShell>
    );
  }

  return (
    <GameShell
      /**
       * Служебный ряд ВНИЗУ, а не над полем — правило каркаса (GameShell:276): «низ
       * принадлежит ОТВЕТУ; там, где ответа кнопками нет, низ отдаётся служебному».
       * Здесь ответ даётся тапом по полю. Без объявления ряд стоял НАД полем и опускал
       * его: замер 11.09.2026 — верх поля 173 вместо 119, центр 509/516 вместо 482.
       */
      bottom="actions"
      title={t(titleKey)}
      onBack={() => goBackOrHome()}
      /**
       * 🔴 ИГРА, КОТОРАЯ СОХРАНЯЕТ ПАРТИЮ, ОБЯЗАНА СПРОСИТЬ ПЕРЕД ВЫХОДОМ.
       * Гейт `exit-guard` поймал это первым же полным прогоном: снимок в
       * хранилище был, а уход — молча. Человек выходит, думая, что бросил
       * партию, а она ждёт его — и наоборот, уходит случайно и теряет ход.
       * Спрашиваем только когда есть что терять: до первого хода тревожить незачем.
       */
      confirmExit={moves > 0 && !done}
      resumable
      onSaveBeforeExit={() => saveResume(CS_GAME_ID, profile?.id ?? 'free', CS_RESUME_VERSION,
        { board, moves, hints, level }).catch(() => {})}
      hud={[
        { key: 'lvl', icon: 'flag', label: t('label_level_short'), value: level },
        { key: 'moves', icon: 'swap-horizontal', label: t('hud_moves'), value: `${moves}/${эталон}`, tone: moves > эталон ? 'warn' as const : 'good' as const, pop: true },
        { key: 'left', icon: 'albums', label: t('cakeQueue'), value: board?.queue.length ?? 0 },
        ...(доказан ? [{ key: 'proven', icon: 'shield-checkmark' as const, label: t('cakeProven'), value: '✓', tone: 'good' as const }] : []),
      ]}
      /*
        🔴 СЛУЖЕБНЫЕ ДЕЙСТВИЯ — ОДНИМ РЯДОМ В ШАПКЕ, КАК В СОРТИРОВКЕ ТОВАРОВ.
        Денис 09.09.2026: «интерфейс выровняй по всем приложениям сортировки —
        верхний и нижний тулбары». До правки отмена и подсказка стояли внизу
        экрана СВОИМИ круглыми кнопками, нарисованными здесь же: другой размер,
        другой цвет, без подписи и без остатка подсказок на кнопке. Три
        сортировки выглядели тремя разными приложениями.
        Теперь ряд один и тот же тип на все игры (`GameAuxBar`/`GameAuxAction`):
        и вид, и цель нажатия 48×48, и лестница замков приходят оттуда.
      */
      headerActions={
        <GameAuxBar>
          <GameAuxAction
            icon="arrow-undo" tint="#d97706" ladder="undo" label={t('btn_undo')}
            disabled={!история.canUndo} onPress={отменить}
          />
          {/* Остаток подсказок прямо на кнопке: цена видна ДО нажатия, а не после. */}
          <GameAuxAction
            icon="bulb" tint="#0284c7" ladder="hint" label={t('btn_hint')} count={hints}
            disabled={hints <= 0} onPress={подсказать}
          />
          <LevelRuleBadge lr={levelRules} color={colors.text} />
        </GameAuxBar>
      }
    >
      <LevelRuleModal lr={levelRules} colors={colors} />
      <ScorePopupLayer popups={popups} />
      <View style={styles.field} onLayout={(e) => {
        const h = Math.round(e.nativeEvent.layout.height);
        setПолеH((п) => (Math.abs(п - h) > 2 ? h : п));
      }}>
      <View
        ref={столRef}
        {...жест}
        /**
         * ⚠️ `touchAction: 'none'` — лечение дефекта «перетаскивание лагает»
         * (четыре отчёта за 02.09). В вебе браузер иначе толкует протаскивание
         * как прокрутку и забирает жест себе. Работает только потому, что поле
         * НЕ прокручивается: появится прокрутка — дефект вернётся.
         */
        style={[styles.table, { width: стол.boardW }, { touchAction: 'none' } as any]}
      >
        {Array.from({ length: cfg.plates }).map((_, i) => тарелка(i))}
      </View>
      </View>
      {встал && (
        <View style={styles.stuck}>
          <Ionicons name="alert-circle" size={18} color="#fb923c" />
          <Text style={{ color: '#fb923c', marginLeft: 6 }}>{t('cakeStuck')}</Text>
          <TouchableOpacity onPress={() => { lvl.fail(); раздать(); }} style={styles.again}>
            <Text style={{ color: '#fff' }}>{t('restart')}</Text>
          </TouchableOpacity>
        </View>
      )}
      {done && (
        <LevelCleared
          level={level}
          stars={звёзды}
          gradient={GRADIENT}
          language={language}
          colors={colors}
          gameId={CS_GAME_ID}
          onContinue={() => { lvl.reach(level + 1); }}
          stopKind="exit"
          onStop={() => goBackOrHome()}
        />
      )}
    </GameShell>
  );
}

const styles = StyleSheet.create({
  setupCard: { borderRadius: 16, padding: 16, marginBottom: 16 },
  setupLabel: { fontSize: 18, fontWeight: '700', marginBottom: 6 },
  setupHint: { fontSize: 14, lineHeight: 20 },
  field: { flex: 1, justifyContent: 'center' },
  table: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignSelf: 'center', paddingVertical: 8 },
  plateBox: { alignItems: 'center', justifyContent: 'center' },
  tools: { flexDirection: 'row', justifyContent: 'center', gap: 14, paddingTop: 4 },
  /**
   * 🔴 48 px — НИЖНЯЯ ГРАНИЦА ЦЕЛИ НАЖАТИЯ НА ПОЛЕ, А НЕ 44.
   *
   * Было 48×39 и 60×39: ширина проходила, высота нет. Поймала это сборка
   * выпуска 2.47.0 — аудит добрался до поля тортов только после того, как игра
   * появилась в каталоге, то есть дефект существовал с самого начала, но был
   * НЕДОСТУПЕН проверке.
   *
   * ⚠️ И ПЕРВАЯ ПОПРАВКА БЫЛА НЕ ТОЙ: я поднял высоту до 44, взяв число из
   * ШАПКИ лога («порог 44×44»), а она от первого прохода — по маршрутам. НА
   * ПОЛЕ порог другой, `MIN_FIELD = 48` в `scripts/tap-target-audit.mjs`:
   * палец по доске бьёт вслепую, там цель обязана быть крупнее. Второй заход
   * сборки покраснел на «48×44» — числом из своего же отчёта.
   *
   * `minHeight`/`minWidth` вместо увеличенного отступа: отступ раздул бы обе
   * стороны и сдвинул раскладку доски.
   */
  tool: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: '#00000055', paddingHorizontal: 14, paddingVertical: 8, minHeight: 48, minWidth: 48, borderRadius: 12 },
  toolOff: { opacity: 0.45 },
  toolNum: { color: '#fff', fontSize: 13 },
  stuck: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10 },
  again: { marginLeft: 10, backgroundColor: '#f59e0b', paddingHorizontal: 12, paddingVertical: 6, minHeight: 48, minWidth: 48, justifyContent: 'center', alignItems: 'center', borderRadius: 8 },
});

/** Пол читаемости сектора — вынесен, чтобы гейт мерил ту же величину, что экран. */
export { SECTOR_MIN };

/** «Торты» — шкурка по умолчанию. Отдельным маршрутом, как и «Пицца». */
export default function CakeSortGame() {
  return <CakeSortScreen gameId={CS_GAME_ID} skin="cake" titleKey="cakeSort" />;
}
