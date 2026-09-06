/* psygames-game-cake-sort · VER 1 · 06.09.2026 */
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
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import Svg, { Path, Circle as SvgCircle } from 'react-native-svg';
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
import LevelCleared from '@/src/components/LevelCleared';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import { useMoveHistory } from '@/src/hooks/useMoveHistory';
import { hapticSuccess, hapticTap, useScorePopups, ScorePopupLayer } from '@/src/components/juice';
import { sndPlace, sndMatch, sndCombo, sndWrong } from '@/src/services/feedback';
import { saveResume, clearResume } from '@/src/services/resume';
import { useResumeBoot } from '@/src/hooks/useResumeBoot';
import { useLevelRules, LevelRuleBadge, LevelRuleModal, LevelRule } from '@/src/components/LevelRules';
import { CIRCLE, Board, canPlace, moveTop, isCleared, hasAnyMove } from '@/src/games/cake-sort/core/plate';
import { deal, levelCfg } from '@/src/games/cake-sort/core/level';
import { referenceFor, starsFor } from '@/src/games/cake-sort/core/stars';
import { prebuiltMin } from '@/src/games/cake-sort/core/prebuilt';
import { solvePath, minMoves } from '@/src/games/cake-sort/core/solver';
import { tableLayout, maxCols, plateAtPoint, PLATE_GAP, SECTOR_MIN } from '@/src/games/cake-sort/core/layout';
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

export default function CakeSortGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const { profile } = useProfile();
  /**
    * ⚠️ ШИРИНА МОЖЕТ ПРИЙТИ НУЛЁМ. На первом кадре и при повороте экрана
    * `useWindowDimensions` отдаёт 0, и вся геометрия стола схлопывается в точку —
    * тарелки рисуются нулевого диаметра, а деление на них даёт NaN.
    */
  const width = useScreenWidth();
  /** Вечерний и ночной шаг зарядки — без писка. Признак берётся из пресета, как у всех. */
  const { isCalm } = useGamePreset();
  useCalmHush(isCalm);
  const lvl = usePersistentLevel(CS_GAME_ID);
  const level = lvl.level;

  const тема = useMemo(() => cakeThemeForProfile(profile?.id), [profile?.id]);
  const cfg = useMemo(() => levelCfg(level), [level]);

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
  const { popups, spawn } = useScorePopups();

  const rulesHere = CS_RULES;
  const levelRules = useLevelRules(CS_GAME_ID, level, rulesHere, !done);

  /**
   * ⚠️ СБРОС ИСТОРИИ ЗДЕСЬ НЕ ЗОВЁТСЯ. Хук отмены отдаёт новый объект на каждом
   * рендере, и держать его в зависимостях значит пересоздавать раздачу каждый
   * кадр. Историю чистит тот, кто меняет уровень, — ниже, в правке состояния.
   */
  const раздать = useCallback(() => {
    const d = deal(level);
    setBoard(d.board);
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
    saveResume(CS_GAME_ID, profile?.id ?? 'free', CS_RESUME_VERSION, { board, moves, hints, level }).catch(() => {});
  }, [board, moves, hints, done, level, profile?.id]);

  useResumeBoot<{ board: Board; moves: number; hints: number; level: number }>(
    CS_GAME_ID, CS_RESUME_VERSION,
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
  const стол = useMemo(() => {
    const доступно = Math.min(width, 520) - 16;
    const cols = Math.min(maxCols(доступно), Math.max(3, Math.ceil(Math.sqrt(cfg.plates))));
    const l = tableLayout(доступно, cols);
    return { ...l, rows: Math.ceil(cfg.plates / cols), boardW: доступно };
  }, [width, cfg.plates]);

  const тронуть = (i: number) => {
    if (!board || done) return;
    const тарелка = board.plates[i] ?? [];
    if (sel === null) {
      if (!тарелка.length) { hapticTap(); return; }
      setSel(i); hapticTap(); return;
    }
    if (sel === i) { setSel(null); return; }
    const src = board.plates[sel] ?? [];
    const тип = src[src.length - 1] as number;
    if (!canPlace(board, i, тип)) { setSel(null); hapticTap(); sndWrong(); return; }
    const после = moveTop(board, sel, i);
    if (!после) { setSel(null); return; }
    история.push({ b: board, moves });
    // Пошёл как советовали — снимаем шаг с пути; свернул — путь больше не наш.
    const шаг = путь?.[0];
    setПуть(шаг && шаг.from === sel && шаг.to === i ? путь!.slice(1) : null);
    setMoves(moves + 1);
    setSel(null); setHint(null);
    /**
     * Сколько кругов замкнулось этим ходом. Считаем по ПУСТЫМ тарелкам, а не по
     * «стало меньше секторов»: очередь тут же занимает освободившееся место, и
     * разница в числе секторов соврала бы.
     */
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
      clearResume(CS_GAME_ID, profile?.id ?? 'free').catch(() => {});
      /**
       * Запись партии — та же форма, что у всех: `passed` пишется всегда, иначе
       * «пройдено» нельзя отличить от «бросил на середине» ни в одном отчёте.
       */
      saveSession({
        game_type: CS_GAME_ID, score: moves, time_seconds: 0, passed: true,
        details: { level, moves, types: cfg.types, stars: starsFor(moves, cfg.types, точныйМин) },
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
  const [бокс, setБокс] = useState({ x: 0, y: 0 });
  const столRef = useRef<View | null>(null);

  const снятьБокс = () => {
    const n: any = столRef.current;
    if (!n) return;
    if (typeof n.getBoundingClientRect === 'function') {
      const r = n.getBoundingClientRect();
      setБокс({ x: r.left, y: r.top });
      return;
    }
    n.measureInWindow?.((x: number, y: number) => setБокс({ x, y }));
  };

  /** Тарелка под точкой экрана. Вся арифметика — в `plateAtPoint`. */
  const тарелкаПод = (pageX: number, pageY: number) =>
    (стол.plate ? plateAtPoint(pageX - бокс.x, pageY - бокс.y, стол.cols, стол.plate, cfg.plates) : null);

  const жест = {
    onStartShouldSetResponder: () => false,
    onMoveShouldSetResponder: (e: any) => {
      const { dx, dy } = { dx: e.nativeEvent.locationX ?? 0, dy: e.nativeEvent.locationY ?? 0 };
      return Math.abs(dx) + Math.abs(dy) > СДВИГ;
    },
    onResponderGrant: (e: any) => {
      if (!board || done) return;
      снятьБокс();
      const i = тарелкаПод(e.nativeEvent.pageX, e.nativeEvent.pageY);
      // С пустой тарелки брать нечего: начать жест, который заведомо ничем не
      // кончится, хуже, чем не начать — сектор «поднимется» и упадёт назад.
      if (i === null || !(board.plates[i]?.length)) return;
      setТащим(i); setЦель(i); hapticTap();
    },
    onResponderMove: (e: any) => {
      if (тащим === null) return;
      const i = тарелкаПод(e.nativeEvent.pageX, e.nativeEvent.pageY);
      if (i !== цель) setЦель(i);
    },
    onResponderRelease: () => {
      const f = тащим; const t = цель;
      setТащим(null); setЦель(null);
      if (f !== null && t !== null && f !== t) { setSel(f); тронуть(t); }
    },
    onResponderTerminate: () => { setТащим(null); setЦель(null); },
  };

  const эталон = referenceFor(cfg.types, точныйМин);
  const звёзды = starsFor(moves, cfg.types, точныйМин);
  const встал = board ? !isCleared(board) && !hasAnyMove(board) : false;

  const тарелка = (i: number) => {
    const cells = board?.plates[i] ?? [];
    const r = стол.plate / 2;
    const выбрана = sel === i || тащим === i;
    const подЦелью = тащим !== null && цель === i && цель !== тащим;
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
          source={тема.plates[i % тема.plates.length]}
          style={{ position: 'absolute', width: стол.plate, height: стол.plate }}
          resizeMode="contain"
        />
        <Svg width={стол.plate} height={стол.plate}>
          {cells.map((тип, k) => (
            <Path key={k} d={wedgePath(r, r, (r - 3) * 0.72, k)} fill={тема.colors[тип % тема.colors.length]} stroke="#00000022" strokeWidth={1} />
          ))}
          {выбрана && <SvgCircle cx={r} cy={r} r={r - 2} fill="none" stroke="#f59e0b" strokeWidth={3} />}
          {подЦелью && <SvgCircle cx={r} cy={r} r={r - 2} fill="none" stroke="#38bdf8" strokeWidth={3} />}
          {(hint?.from === i || hint?.to === i) && (
            <SvgCircle cx={r} cy={r} r={r - 2} fill="none" stroke={hint?.to === i ? '#38bdf8' : '#a3e635'} strokeWidth={3} strokeDasharray="6 5" />
          )}
        </Svg>
      </TouchableOpacity>
    );
  };

  return (
    <GameShell
      title={t('cakeSort')}
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
      ]}
      headerActions={<LevelRuleBadge lr={levelRules} color={colors.text} />}
    >
      <LevelRuleModal lr={levelRules} colors={colors} />
      <ScorePopupLayer popups={popups} />
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
      <View style={styles.tools}>
        <TouchableOpacity onPress={отменить} disabled={!история.canUndo} style={[styles.tool, !история.canUndo && styles.toolOff]}
          accessibilityRole="button" accessibilityLabel={t('btn_undo')}>
          <Ionicons name="arrow-undo" size={20} color={история.canUndo ? '#fff' : '#ffffff66'} />
        </TouchableOpacity>
        <TouchableOpacity onPress={подсказать} disabled={hints <= 0} style={[styles.tool, hints <= 0 && styles.toolOff]}
          accessibilityRole="button" accessibilityLabel={t('btn_hint')}>
          <Ionicons name="bulb" size={20} color={hints > 0 ? '#fff' : '#ffffff66'} />
          <Text style={styles.toolNum}>{hints}</Text>
        </TouchableOpacity>
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
  table: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignSelf: 'center', paddingVertical: 8 },
  plateBox: { alignItems: 'center', justifyContent: 'center' },
  tools: { flexDirection: 'row', justifyContent: 'center', gap: 14, paddingTop: 4 },
  tool: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#00000055', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
  toolOff: { opacity: 0.45 },
  toolNum: { color: '#fff', fontSize: 13 },
  stuck: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10 },
  again: { marginLeft: 10, backgroundColor: '#f59e0b', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
});

/** Пол читаемости сектора — вынесен, чтобы гейт мерил ту же величину, что экран. */
export { SECTOR_MIN };
