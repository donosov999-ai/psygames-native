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
import { goBackOrHome } from '@/src/utils/nav';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { useProfile } from '@/src/contexts/ProfileContext';
import { saveSession } from '@/src/services/api';
import GameShell from '@/src/components/GameShell';
import LevelProgressMap from '@/src/components/LevelProgressMap';
import LevelCleared from '@/src/components/LevelCleared';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import { FRACTAL_MAX_LEVEL, fractalLevel } from '@/src/services/fractalLevels';
import GlassButton from '@/src/components/GlassButton';
import { useGameKeyboard, digitKeys } from '@/src/hooks/useGameKeyboard';
import { useScreenWidth } from '@/src/hooks/useScreenWidth';
import { useMoveHistory } from '@/src/hooks/useMoveHistory';
import { saveResume, loadResume, clearResume } from '@/src/services/resume';
import { sndPlace, sndWrong } from '@/src/services/feedback';
import { gameNow } from '@/src/services/gamePause';
import {
  N, FEED_CELL, generateFractal, rootCellForChild, solvedCount, rootEditable, rootSolved,
  startPlayState, playDigit, revertMove,
  type FractalPuzzle, type FractalPlayState, type FractalMove,
} from '@/src/services/fractal-sudoku';

const GRADIENT = ['#5b4d9e', '#7f7fd5'];
const GAME_ID = 'sudoku_fractal';

/**
 * Версия формата незаконченной партии. Поднимать при ЛЮБОМ изменении полей снимка:
 * старая запись тогда не подойдёт под новый код и будет молча выброшена, а не уронит экран.
 */
const RESUME_V = 1;

/** Клетки корня, которые приходят снизу: руками их не трогают. */
const FED_KEYS = new Set(Array.from({ length: 9 }, (_, i) => rootCellForChild(i).join(',')));

type Phase = 'config' | 'map' | 'child' | 'result';

/**
 * Снимок незаконченной партии. Кладём и само задание: генерация не воспроизводима без
 * сида, и без задания доска поднялась бы, а сверять ходы было бы не с чем.
 */
interface FractalResume {
  level: number;
  puzzle: FractalPuzzle;
  play: FractalPlayState;
  errors: number;
  elapsed: number;
  history: ReturnType<ReturnType<typeof useMoveHistory<FractalMove>>['serialize']>;
}

const EMPTY_PLAY: FractalPlayState = { rootGrid: [], children: [] };

export default function FractalSudokuScreen() {
  const { colors, isDark } = useTheme();
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
  const [errors, setErrors] = useState(0);
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
    setElapsed(0);
    setOpenChild(null);
    setSelected(null);
    setRootSel(null);
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
    try {
      await saveSession({
        passed: win,
        game_type: GAME_ID,
        score: win ? Math.max(0, Math.round(4000 - errors * 60 - time)) : 0,
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
  const place = (child: number | null, r: number, c: number, n: number) => {
    if (!puzzle || phase === 'result') return;
    const res = playDigit(play, puzzle, { child, r, c }, n);
    if (!res) return;   // подсказка, кормящая клетка или повтор той же цифры
    const { next, move } = res;

    if (n !== 0) {
      const right = child === null
        ? puzzle.root.solution[r][c] === n
        : puzzle.children[child].solution[r][c] === n;
      if (right) sndPlace(); else { sndWrong(); setErrors((e) => e + 1); }
    }

    hist.push(move);
    setPlay(next);

    // Порог пройден — цифра ушла в корень. Это и есть смысл всей конструкции, поэтому
    // возвращаем на карту: там видно, как заполнилась клетка наверху.
    if (move.unlocked) {
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
    Escape: () => setRootSel(null),
  }, phase === 'map' && openChild === null);

  // ─────────────────────────── незаконченная партия ───────────────────────────

  /** Снимок партии для общего слоя незаконченной игры. */
  const snapshot = (): FractalResume => ({
    level: playedLevel,
    puzzle: puzzle as FractalPuzzle,
    play,
    errors,
    elapsed,
    history: hist.serialize(),
  });

  /** Поднять партию из снимка — доска оживает ровно такой, какой её оставили. */
  const applyResume = (s: FractalResume) => {
    setPlayedLevel(s.level);
    setPuzzle(s.puzzle);
    setPlay(s.play);
    setErrors(s.errors);
    setOpenChild(null);
    setSelected(null);
    setRootSel(null);
    setWon(false);
    hist.restore(s.history);
    // Таймер продолжаем с НАКОПЛЕННОГО: настенные часы между сессиями ушли вперёд, и от
    // прежнего startRef партия «шла» бы всё то время, что телефон лежал в кармане.
    setElapsed(s.elapsed);
    runTimer(s.elapsed);
    setPhase('map');
  };

  // Поднять незаконченную партию при входе на экран — разово.
  const bootRef = useRef(false);
  useEffect(() => {
    if (bootRef.current) return;
    const pid = profile?.id;
    if (!pid) return;
    bootRef.current = true;
    let cancelled = false;
    loadResume<FractalResume>(GAME_ID, pid, RESUME_V)
      .then((saved) => {
        if (cancelled || !saved?.puzzle?.children || saved.puzzle.children.length !== 9) return;
        if (!saved.play?.rootGrid?.length || saved.play.children?.length !== 9) return;
        applyResume(saved);
      })
      .catch(() => { /* нет партии — обычный вход через конфиг */ });
    return () => { cancelled = true; };
  }, [profile?.id]);   // eslint-disable-line react-hooks/exhaustive-deps -- разовый подъём партии

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
  }, [play, errors, liveGame]);   // eslint-disable-line react-hooks/exhaustive-deps

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

          <LevelProgressMap
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
          <Text style={{ fontSize: 24, fontWeight: '800', color: colors.text }}>{n}</Text>
        </TouchableOpacity>
      ))}
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={t('a11yErase')}
        onPress={() => onDigit(0)}
        style={[styles.key, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        <Ionicons name="backspace-outline" size={22} color={colors.text} />
      </TouchableOpacity>
    </View>
  );

  /**
   * Действия наверху — как у самурая и в обычной судоку. Расхождение между играми
   * одного семейства человек читает как поломку, а не как разницу режимов.
   */
  const actions = (
    <View style={styles.headerActionsRow}>
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
  if (puzzle) {
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      if (!rootEditable(puzzle.root.puzzle, r, c)) continue;
      rootMine++;
      if (play.rootGrid[r]?.[c]) rootFilled++;
    }
  }

  const stats = (
    <View style={styles.stats}>
      <Text style={[styles.stat, { color: GRADIENT[1] }]}>{t('fractalOpened')} {openedCount}/9</Text>
      <Text style={[styles.stat, { color: '#f43f5e' }]}>✗{errors}</Text>
      <Text style={[styles.stat, { color: colors.text }]}>{elapsed.toFixed(0)}{t('secShort')}</Text>
    </View>
  );

  // ── КАРТА: корень крупно + плитки дочерних ──
  if (phase === 'map' || openChild === null) {
    const cell = Math.min(34, Math.floor((Math.min(width, 520) - 48) / N));
    return (
      <GameShell
        title={t('fractalTitle')}
        onBack={() => goBackOrHome()}
        stats={stats}
        headerActions={actions}
        scrollableField
        confirmExit={liveGame && hist.canUndo}
        resumable
        onSaveBeforeExit={saveBeforeExit}
      >
        <View style={styles.mapWrap}>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>{t('fractalRoot')}</Text>
          <View style={[styles.grid, { borderColor: colors.text }]}>
            {play.rootGrid.map((row, r) => (
              <View key={r} style={styles.row}>
                {row.map((v, c) => {
                  const fromChild = FED_KEYS.has(`${r},${c}`);
                  const given = (puzzle?.root.puzzle[r]?.[c] ?? 0) !== 0;
                  const mine = !!puzzle && rootEditable(puzzle.root.puzzle, r, c);   // клетка человека
                  const isSel = rootSel?.r === r && rootSel?.c === c;
                  const wrong = mine && v !== 0 && v !== puzzle?.root.solution[r][c];
                  return (
                    <TouchableOpacity
                      key={c}
                      accessibilityRole="button"
                      accessibilityLabel={`${r + 1}·${c + 1}`}
                      testID={`fractal-root-${r}-${c}`}
                      disabled={!mine}
                      onPress={() => setRootSel({ r, c })}
                      style={[styles.cell, {
                        width: cell, height: cell,
                        backgroundColor: isSel ? GRADIENT[1]
                          : fromChild && v === 0 ? (isDark ? '#3a3358' : '#ece9f7')
                            : colors.surface,
                        borderRightWidth: (c + 1) % 3 === 0 ? 2 : 0.5,
                        borderBottomWidth: (r + 1) % 3 === 0 ? 2 : 0.5,
                        borderColor: colors.text,
                      }]}
                    >
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

          <Text style={[styles.sectionLabel, { color: colors.textSecondary, marginTop: 18 }]}>
            {t('fractalChildren')}
          </Text>
          <View style={styles.tiles}>
            {play.children.map((ch, i) => {
              const done = ch.done;
              const got = puzzle
                ? solvedCount(ch.grid, puzzle.children[i].solution, puzzle.children[i].puzzle.map((row) => row.map((v) => v !== 0)))
                : 0;
              return (
                <TouchableOpacity
                  key={i}
                  accessibilityRole="button"
                  accessibilityLabel={`${t('fractalChildN')} ${i + 1}`}
                  testID={`fractal-tile-${i}`}
                  onPress={() => { setOpenChild(i); setSelected(null); setPhase('child'); }}
                  style={[styles.tile, {
                    backgroundColor: done ? GRADIENT[0] : colors.surface,
                    borderColor: done ? GRADIENT[0] : colors.border,
                  }]}
                >
                  <Text style={{ fontSize: 20, fontWeight: '800', color: done ? '#FFF' : colors.text }}>
                    {done ? '✓' : i + 1}
                  </Text>
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
          {rootMine > rootFilled && (
            <>
              <Text style={[styles.feedHint, { color: colors.textSecondary, marginTop: 14 }]}>
                {t('fractalRoot')} {rootFilled}/{rootMine}
              </Text>
              {renderPad(placeRootDigit)}
            </>
          )}
        </View>
      </GameShell>
    );
  }

  // ── СЕТКА: одна дочерняя во весь экран ──
  const ch = play.children[openChild];
  const task = puzzle!.children[openChild];
  const sol = task.solution;
  const got = solvedCount(ch.grid, sol, task.puzzle.map((row) => row.map((v) => v !== 0)));
  const cell = Math.min(38, Math.floor((Math.min(width, 520) - 32) / N));

  return (
    <GameShell
      title={`${t('fractalChildN')} ${openChild + 1}`}
      onBack={() => { setOpenChild(null); setSelected(null); setPhase('map'); }}
      headerActions={actions}
      confirmExit={false}
      stats={
        <View style={styles.stats}>
          <Text style={[styles.stat, { color: GRADIENT[1] }]}>{got}/{task.unlockCells} {t('fractalToUnlock')}</Text>
          <Text style={[styles.stat, { color: '#f43f5e' }]}>✗{errors}</Text>
        </View>
      }
    >
      <View style={styles.playCol}>
        <View style={[styles.grid, { borderColor: colors.text }]}>
          {ch.grid.map((row, r) => (
            <View key={r} style={styles.row}>
              {row.map((v, c) => {
                const isSel = selected?.r === r && selected?.c === c;
                const wrong = v !== 0 && v !== sol[r][c];
                const isFeed = r === FEED_CELL[0] && c === FEED_CELL[1];
                const given = task.puzzle[r][c] !== 0;
                return (
                  <TouchableOpacity
                    key={c}
                    accessibilityRole="button"
                    accessibilityLabel={`${r + 1}·${c + 1}`}
                    testID={`fractal-cell-${r}-${c}`}
                    onPress={() => { if (!given) setSelected({ r, c }); }}
                    style={[styles.cell, {
                      width: cell, height: cell,
                      backgroundColor: isSel ? GRADIENT[1] : isFeed ? (isDark ? '#3a3358' : '#efedfa') : colors.surface,
                      borderRightWidth: (c + 1) % 3 === 0 ? 2 : 0.5,
                      borderBottomWidth: (r + 1) % 3 === 0 ? 2 : 0.5,
                      borderColor: colors.text,
                    }]}
                  >
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

        {renderPad(placeDigit)}
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
  undoBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, borderWidth: 1,
  },
  undoText: { fontSize: 13, fontWeight: '700' },

  mapWrap: { alignItems: 'center', paddingVertical: 10, gap: 6 },
  sectionLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', maxWidth: 320 },
  tile: {
    width: 92, height: 62, borderRadius: 14, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', gap: 2,
  },

  playCol: { alignItems: 'center', gap: 12, marginBottom: 76 },
  grid: { borderWidth: 2, borderRadius: 4, overflow: 'hidden' },
  row: { flexDirection: 'row' },
  cell: { alignItems: 'center', justifyContent: 'center' },
  feedHint: { fontSize: 12, textAlign: 'center', paddingHorizontal: 20 },
  pad: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center', maxWidth: 340 },
  key: { width: 58, height: 58, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
