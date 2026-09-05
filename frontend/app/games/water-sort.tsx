/* psygames-game-water-sort · VER 1 · 05.09.2026 */
/**
 * СОРТИРОВКА ЖИДКОСТЕЙ — переливание по пробиркам, пока каждая не станет одного цвета.
 *
 * Заведена по просьбе Дениса 05.09.2026 (кадры App Store: «Бутылочки Пробирки.
 * Water Sort», SortPuz) в хаб «Башни». Родство с ханойской и лондонской башнями
 * не внешнее: везде стопка, ход разрешён не всякий, и выигрывает тот, кто считает
 * наперёд. Ограничивает ход не размер диска, а цвет верхнего слоя и свободное
 * место — а планирование то же самое.
 *
 * 🔴 ДВА НАЖАТИЯ, А НЕ ПЕРЕТАСКИВАНИЕ. Так сделано в самих играх этого жанра, и
 * не из лени: перетаскивание на телефоне промахивается по узкой пробирке, а на
 * четырнадцати пробирках промах стоит хода. Первое нажатие поднимает столбик,
 * второе выливает; повторное нажатие по той же пробирке отменяет выбор.
 *
 * ⚠️ ОТМЕНА НЕ УМЕНЬШАЕТ СЧЁТЧИК ХОДОВ. Иначе задача решается перебором с
 * бесплатным откатом, и число ходов перестаёт что-либо значить. Решение то же,
 * что у ханойской башни в этом же хабе.
 */
import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { goBackOrHome } from '@/src/utils/nav';
import { onGradientText, onGradientTextMuted } from '@/src/services/onGradientText';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import GameResult from '@/src/components/GameResult';
import GameShell from '@/src/components/GameShell';
import GameSetupBar from '@/src/components/GameSetupBar';
import GameAbout from '@/src/components/GameAbout';
import LevelProgressMap from '@/src/components/LevelProgressMap';
import LevelCleared from '@/src/components/LevelCleared';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import { useGamePreset } from '@/src/hooks/useGamePreset';
import { useCalmHush } from '@/src/hooks/useCalmHush';
import { useMoveHistory } from '@/src/hooks/useMoveHistory';
import { useScreenWidth } from '@/src/hooks/useScreenWidth';
import { gameNow } from '@/src/services/gamePause';
import { hudTime } from '@/src/services/hudTime';
import {
  Field, isDone, isSolved, canPour, pour, legalMoves,
} from '@/src/games/water-sort/core/tubes';
import { generateLevel, levelParams, solve } from '@/src/games/water-sort/core/generate';

const GAME_ID = 'water-sort';
/**
 * ⚠️ КЛЮЧ СЕССИИ — ЭТО id КАТАЛОГА (`water_sort`), А НЕ МАРШРУТ (`water-sort`).
 * Они различаются одним знаком, и партия, записанная под маршрутом, не находится
 * по каталогу: статистика молча пустая при исправной записи. Ловится пробой
 * «каталог знает, под каким ключом каждая игра пишет партию».
 */
const SESSION_TYPE = 'water_sort';
const GRADIENT = ['#00c6ff', '#0072ff'];
const ON_GRAD = onGradientText(GRADIENT[0], GRADIENT[1]);
const ON_GRAD_SOFT = onGradientTextMuted(ON_GRAD);

/**
 * ⚠️ ЦВЕТА РАЗЛИЧИМЫ НЕ ТОЛЬКО ОТТЕНКОМ. Двенадцать заливок на экране — предел, за
 * которым «зелёный» и «салатовый» сливаются у любого зрения, а при дейтеранопии
 * ещё и «красный» с «зелёным». Поэтому у каждой порции есть подпись-символ:
 * различие держится на ФОРМЕ, а цвет остаётся украшением. Это правило аудита
 * доступности, а не вкус.
 */
const ЦВЕТА: { fill: string; mark: string }[] = [
  { fill: '#e74c3c', mark: '▲' },
  { fill: '#3498db', mark: '●' },
  { fill: '#2ecc71', mark: '■' },
  { fill: '#f1c40f', mark: '★' },
  { fill: '#9b59b6', mark: '◆' },
  { fill: '#e67e22', mark: '✚' },
  { fill: '#1abc9c', mark: '✦' },
  { fill: '#e84393', mark: '❤' },
  { fill: '#7f8c8d', mark: '◼' },
  { fill: '#2c3e50', mark: '▼' },
  { fill: '#d35400', mark: '◐' },
  { fill: '#27ae60', mark: '✱' },
];

/**
 * Звёзды за уровень. Мера одна и та же, что в счёте: во сколько раз партия длиннее
 * найденного генератором решения. Второй формулы для «сколько это ходов» здесь
 * нет и не будет — расхождение двух формул уже стоило ханойской башне трёх звёзд
 * на каждом уровне выше пятого.
 */
function звёзды(ходов: number, минимум: number): number {
  if (!минимум) return 3;
  const доля = ходов / минимум;
  if (доля <= 1.2) return 3;
  if (доля <= 1.8) return 2;
  return 1;
}

const БОНУСЫ = [
  { icon: 'map-outline', textKey: 'waterSortBenefitPlan' },
  { icon: 'eye-outline', textKey: 'waterSortBenefitHold' },
  { icon: 'hourglass-outline', textKey: 'waterSortBenefitPatience' },
];

/**
 * 🔴 48 px — НИЖНЯЯ ГРАНИЦА, А НЕ ПОЖЕЛАНИЕ. Первая редакция сужала пробирку до
 * 34 px, когда их больше восьми, — и это ровно то, что ловит аудит целей нажатия
 * в CI. Порогов у него ДВА: 44 по маршрутам и 48 НА ПОЛЕ (`MIN_FIELD` в
 * `scripts/tap-target-audit.mjs`), а пробирка — цель именно на поле. Пробирок
 * бывает до четырнадцати, и они ложатся в два ряда: 48 + 8 отступа = 56, семь
 * штук на 403 px дают 392. Тесноту решает перенос строки, а не уменьшение цели
 * под пальцем.
 */
/**
 * 🔴 48 px — НИЖНЯЯ ГРАНИЦА ЦЕЛИ НАЖАТИЯ, А НЕ РАЗМЕР. Аудит целей в CI держит
 * два порога: 44 по маршрутам и 48 НА ПОЛЕ (`MIN_FIELD` в
 * `scripts/tap-target-audit.mjs`), а пробирка — цель на поле. Первая редакция
 * сужала её до 34 px при девяти и более пробирках и на этом валила сборку.
 *
 * Но 48 — это ПОЛ, а не потолок: на трёх пробирках пол-экрана оставалось пустым.
 * Ширина считается от доступного места, потолок 72 — выше пробирка начинает
 * выглядеть колбой, а два ряда перестают помещаться по высоте.
 */
const ШИРИНА_МИН = 48;
const ШИРИНА_МАКС = 72;
const ОТСТУП = 8;
/**
 * ⚠️ ЗАПАС НА ЧУЖИЕ ПОЛЯ. Ширина экрана — не ширина поля: между ними отступы
 * самого поля (6+6) и внутренние поля каркаса. Замер 05.09.2026: с запасом 16
 * пять пробирок по расчёту помещались в ряд, а на экране пятая уезжала вниз —
 * ряд не влезал в НАСТОЯЩУЮ ширину. 32 покрывает и то и другое.
 */
const ЗАПАС_ПОЛЕЙ = 32;

/**
 * Сколько пробирок в ряду.
 *
 * 🔴 КОЛОНКИ ОГРАНИЧЕНЫ ШИРИНОЙ ЭКРАНА, А НЕ ТОЛЬКО ЧИСЛОМ ПРОБИРОК. Первая
 * редакция считала «до шести — одним рядом, дальше по семь» и не смотрела на
 * экран вовсе. На 403 pt это сходилось случайно, а на 320 pt (маленький Android,
 * старый SE) семь пробирок по 48 требуют 384 pt при 304 доступных — ряд вылезал
 * за край. Уменьшать пробирку нельзя: 48 — норма цели нажатия. Значит уменьшаем
 * ЧИСЛО КОЛОНОК и добавляем ряд.
 */
export function колонокДля(n: number, доступно: number): number {
  const влезаетПоМинимуму = Math.max(1, Math.floor((доступно + ОТСТУП) / (ШИРИНА_МИН + ОТСТУП)));
  const желаемых = n <= 6 ? n : Math.ceil(n / Math.ceil(n / 7));
  return Math.max(1, Math.min(желаемых, влезаетПоМинимуму));
}

/** Ширина пробирки под ширину экрана. Не уже нормы цели и не шире разумного. */
export function ширинаПробирки(n: number, доступно: number): number {
  const колонок = колонокДля(n, доступно);
  const влезает = Math.floor((доступно - ОТСТУП * (колонок - 1)) / колонок);
  return Math.max(ШИРИНА_МИН, Math.min(ШИРИНА_МАКС, влезает));
}

/**
 * СТЕКЛО — КАРТИНКА ПОВЕРХ ЖИДКОСТИ, А НЕ РАМКА ВОКРУГ НЕЁ.
 *
 * Денис 05.09.2026 по первой редакции: «по дизайну пробирки у тебя конечно
 * говно редкое… отрисуй сеткой что ли на кие». Первая редакция рисовала цветные
 * прямоугольники в рамке — ни стекла, ни дна, ни бликов.
 *
 * Стекло нарисовано в kie сеткой 3×3 (девять форм на сплошном #FF7A1A), выбран
 * вариант с прямыми стенками и круглым дном, фон выбит хромакеем — тем же
 * приёмом, что у маскот-паков. ⚠️ Стекло ОБЕСЦВЕЧЕНО: модель рисовала на
 * оранжевом фоне, и блики унесли его подтон — над синей жидкостью это читалось
 * как грязь. Каждый пиксель переведён в свою яркость, цвет стекла стал нулевым.
 *
 * Числа ниже сняты С САМОГО ФАЙЛА (замер по альфа-каналу на середине высоты), а
 * не подобраны на глаз: перерисуют стекло — их надо снять заново, иначе жидкость
 * вылезет за стенки.
 */
const СТЕКЛО = require('../../assets/images/games/water-sort/tube-glass.png');
const СТЕКЛО_ОТНОШЕНИЕ = 577 / 192;     // высота к ширине
const ВНУТРИ_СЛЕВА = 0.182;             // доля ширины: левая стенка
const ВНУТРИ_СПРАВА = 0.818;            // правая стенка
const ВНУТРИ_СВЕРХУ = 0.10;             // низ ободка
const ВНУТРИ_СНИЗУ = 0.955;             // внутренняя точка дна

type GamePhase = 'config' | 'playing' | 'cleared' | 'result';

export default function WaterSortGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const lvl = usePersistentLevel(GAME_ID);
  /**
   * ⚠️ ГОТОВЫЙ ХУК, А НЕ СВОЙ `useWindowDimensions` С ЗАПАСНЫМ ЧИСЛОМ. В проекте
   * уже разобрано, почему: `useWindowDimensions` на первом кадре отдаёт 0, а
   * подставленная константа однажды осталась в вёрстке и дала «390 + 32» вместо
   * настоящей ширины. `useScreenWidth` спрашивает `window.innerWidth` (наши
   * Android и iOS — WebView) и падает на константу только там, где `window` нет.
   */
  const ширинаЭкрана = useScreenWidth();
  const { isCalm } = useGamePreset();
  useCalmHush(isCalm);   // вечерний и ночной шаг зарядки — без писка

  const [phase, setPhase] = useState<GamePhase>('config');
  const [field, setField] = useState<Field | null>(null);
  const [выбрана, setВыбрана] = useState<number | null>(null);
  const [ходов, setХодов] = useState(0);
  const [ошибок, setОшибок] = useState(0);
  const [времени, setВремени] = useState(0);
  const [минимум, setМинимум] = useState(0);
  const [подсказка, setПодсказка] = useState<{ from: number; to: number } | null>(null);
  /**
   * ⚠️ ОБЩИЙ ХУК, А НЕ СВОЙ СТЕК. Проба `undo-honesty` требует именно его: у
   * самодельной ленты нет ни потолка глубины, ни сериализации для продолжения
   * партии, и каждая игра теряла бы их по-своему. Храним ПОЛОЖЕНИЯ, а не ходы:
   * перелив меняет две пробирки разом, и откатывать его обратной операцией
   * дороже и рискованнее, чем вернуть снимок.
   */
  const история = useMoveHistory<Field>();
  const началоRef = useRef(0);
  const таймерRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /**
   * ⚠️ ИМЯ ЛАТИНИЦЕЙ И С ХВОСТОМ `Level` — это контракт с пробой «каждая игра
   * пишет уровень в сессию»: она ищет в исходнике `level: …Level` или
   * `levelRef.current`. С кириллическим именем запись уровня есть, а проба её не
   * видит и объявляет игру потерявшей прогресс.
   */
  const [playedLevel, setPlayedLevel] = useState(1);
  /**
   * 🔴 ТУПИК — ЭТО ПРОВАЛ УРОВНЯ, А НЕ НЕУДОБСТВО. Расклад, из которого нет
   * законного хода, пройден быть не может: человек завёл себя в него сам. Пока
   * есть отмена, провал НЕ засчитывается — из тупика можно выйти назад. Он
   * засчитывается в тот момент, когда человек начинает уровень заново, не
   * распутав тупик: лестница обязана ходить в обе стороны, иначе уровень растёт
   * от одних попыток.
   */
  const тупикБылRef = useRef(false);

  useEffect(() => () => { if (таймерRef.current) clearInterval(таймерRef.current); }, []);

  const пуск = () => {
    if (тупикБылRef.current) { lvl.fail(); тупикБылRef.current = false; }
    const { field: доска, solutionMoves } = generateLevel(lvl.level);
    setPlayedLevel(lvl.level);
    setField(доска);
    setМинимум(solutionMoves);
    setВыбрана(null);
    setПодсказка(null);
    setХодов(0);
    setОшибок(0);
    setВремени(0);
    история.reset();
    началоRef.current = gameNow();
    if (таймерRef.current) clearInterval(таймерRef.current);
    таймерRef.current = setInterval(() => {
      setВремени(Math.floor((gameNow() - началоRef.current) / 1000));
    }, 1000);
    setPhase('playing');
  };

  const завершить = async (доска: Field) => {
    if (таймерRef.current) clearInterval(таймерRef.current);
    const секунд = Math.max(1, Math.floor((gameNow() - началоRef.current) / 1000));
    setВремени(секунд);
    /**
     * Счёт: чем ближе к минимальному числу ходов и чем быстрее — тем выше.
     * ⚠️ Минимум берётся ИЗ ГЕНЕРАТОРА (длина найденного решения), а не считается
     * заново формулой. Формулы для этой задачи нет, а второй расчёт разъехался бы
     * с первым молча — ровно как разъехались минимумы у ханойской башни, где
     * зашитая 2ⁿ−1 показывала 4095 вместо 47.
     */
    const оптимум = Math.max(1, минимум);
    const точность = Math.min(1, оптимум / Math.max(1, ходов + 1));
    const счёт = Math.round(1000 * точность * Math.max(0.3, 1 - секунд / 600));
    const p = levelParams(playedLevel);
    try {
      await saveSession({
        passed: true,
        game_type: SESSION_TYPE,
        score: счёт,
        time_seconds: секунд,
        difficulty: `${p.colors} colors × ${p.cap}`,
        mode: 'classic',
        errors: ошибок,
        details: {
          level: playedLevel,
          moves: ходов + 1,
          optimal: оптимум,
          tubes: доска.tubes.length,
          cap: доска.cap,
        },
      });
    } catch { /* запись сессии не должна ломать конец партии */ }
    lvl.reach(playedLevel + 1);   // уровень взят — потолок поднимается
    setPhase('cleared');
  };

  const нажать = (i: number) => {
    if (!field || phase !== 'playing') return;
    setПодсказка(null);
    if (выбрана === null) {
      if (!field.tubes[i]!.length) return;              // пустую поднимать нечего
      setВыбрана(i);
      return;
    }
    if (выбрана === i) { setВыбрана(null); return; }    // повторное нажатие снимает выбор
    if (!canPour(field, выбрана, i)) {
      setОшибок((n) => n + 1);
      setВыбрана(null);
      return;
    }
    история.push(field);
    const после = pour(field, выбрана, i)!;
    setField(после);
    setВыбрана(null);
    setХодов((n) => n + 1);
    if (isSolved(после)) void завершить(после);
  };

  const отменить = () => {
    const прежнее = история.undo();
    if (!прежнее) return;
    setField(прежнее);
    setВыбрана(null);
    setПодсказка(null);
    /** ⚠️ `ходов` НЕ уменьшается: иначе задача решается перебором с откатом. */
  };

  const показатьХод = () => {
    if (!field) return;
    const r = solve(field, 40000);
    if (r.outcome === 'solved' && r.moves.length) {
      setПодсказка(r.moves[0]!);
      setОшибок((n) => n + 1);   // подсказка — не бесплатная
    }
  };

  const тупик = !!field && phase === 'playing' && legalMoves(field).length === 0 && !isSolved(field);
  /**
   * ⚠️ ОТМЕТКА ТУПИКА — В ЭФФЕКТЕ, А НЕ В ТЕЛЕ ОТРИСОВКИ. Запись в ref во время
   * рендера ломает React в строгом режиме (двойной проход) и ловится линтом
   * правилом `Cannot access refs during render`.
   */
  useEffect(() => { if (тупик) тупикБылRef.current = true; }, [тупик]);

  const рисоватьПробирку = (трубка: readonly number[], i: number) => {
    const ш = ширинаПробирки(field!.tubes.length, ширинаЭкрана - ЗАПАС_ПОЛЕЙ);
    const в = Math.round(ш * СТЕКЛО_ОТНОШЕНИЕ);
    const выбор = выбрана === i;
    const подсвечена = !!подсказка && (подсказка.from === i || подсказка.to === i);

    // внутренний столбик, куда льётся жидкость
    const левo = ш * ВНУТРИ_СЛЕВА;
    const ширинаЖ = ш * (ВНУТРИ_СПРАВА - ВНУТРИ_СЛЕВА);
    const верхЖ = в * ВНУТРИ_СВЕРХУ;
    const высотаСтолба = в * (ВНУТРИ_СНИЗУ - ВНУТРИ_СВЕРХУ);
    const высотаПорции = высотаСтолба / field!.cap;

    return (
      <TouchableOpacity
        key={i}
        accessibilityRole="button"
        accessibilityLabel={трубка.length
          ? трубка.map((c) => ЦВЕТА[c % ЦВЕТА.length]!.mark).join(' ')
          : t('waterSortEmptyTube')}
        accessibilityState={{ selected: выбор }}
        onPress={() => нажать(i)}
        activeOpacity={0.85}
        style={[styles.гнездо, { width: ш, height: в, transform: [{ translateY: выбор ? -14 : 0 }] }]}
      >
        {/* Жидкость: снизу вверх, дно скруглено по форме пробирки. */}
        <View style={[styles.столб, { left: левo, width: ширинаЖ, top: верхЖ, height: высотаСтолба }]}>
          {[...трубка].reverse().map((c, k) => {
            const снизу = трубка.length - 1 - k;                 // индекс порции от дна
            const дно = снизу === 0;
            return (
              <View
                key={k}
                style={[
                  styles.порция,
                  {
                    height: высотаПорции,
                    backgroundColor: ЦВЕТА[c % ЦВЕТА.length]!.fill,
                    borderBottomLeftRadius: дно ? ширинаЖ / 2 : 0,
                    borderBottomRightRadius: дно ? ширинаЖ / 2 : 0,
                  },
                ]}
              >
                <Text style={styles.знак}>{ЦВЕТА[c % ЦВЕТА.length]!.mark}</Text>
              </View>
            );
          })}
        </View>

        {/* Стекло поверх: блики и ободок ложатся НА жидкость, как в настоящей пробирке. */}
        <Image source={СТЕКЛО} style={{ position: 'absolute', width: ш, height: в }} resizeMode="stretch" />

        {/* Обводка выбора и подсказки — вокруг стекла, не поверх него. */}
        {(выбор || подсвечена) ? (
          <View
            pointerEvents="none"
            style={[
              styles.обводка,
              { borderColor: подсвечена ? '#f1c40f' : GRADIENT[1], borderRadius: ш / 2 },
            ]}
          />
        ) : null}
      </TouchableOpacity>
    );
  };

  const renderConfig = () => {
    const p = levelParams(lvl.level);
    return (
      <>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={[styles.heroCard, { backgroundColor: GRADIENT[1] }]}>
            <Ionicons name="flask" size={44} color={ON_GRAD.color} />
            <Text style={[styles.heroTitle, { color: ON_GRAD.color }]}>{t('waterSort')}</Text>
            <Text style={[styles.heroDesc, { color: ON_GRAD_SOFT }]}>{t('waterSortDesc')}</Text>
          </View>
          <GameAbout descriptionKey="waterSortIntroDesc" benefits={БОНУСЫ} accent={GRADIENT[0]} />
          <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.optionLabel, { color: colors.text }]}>{t('level')} {lvl.level}</Text>
            <Text style={[styles.optionHint, { color: colors.textSecondary }]}>
              {t('waterSortLvlParams')
                .replace('{c}', String(p.colors))
                .replace('{h}', String(p.cap))
                .replace('{e}', String(p.empty))}
            </Text>
          </View>
          <LevelProgressMap
            bestLevel={lvl.best}
            gameId={GAME_ID}
            currentLevel={lvl.level}
            onPickLevel={lvl.pick}
            maxLevel={Math.max(15, lvl.level)}
            colors={colors}
            language={language}
          />
        </ScrollView>
        <GameSetupBar label={t('start')} onStart={пуск} colors={GRADIENT as [string, string]} />
      </>
    );
  };

  if (phase === 'playing' && field) {
    const закрыто = field.tubes.filter((_, i) => isDone(field, i) && field.tubes[i]!.length > 0).length;
    return (
      <GameShell
        title={t('waterSort')}
        onBack={() => { if (таймерRef.current) clearInterval(таймерRef.current); goBackOrHome(); }}
        hud={[
          { key: 'moves', icon: 'swap-horizontal', label: t('hud_moves'), value: `${ходов}/${Math.max(1, минимум)}`,
            tone: ходов > минимум ? 'warn' as const : 'good' as const, pop: true },
          { key: 'time', icon: 'time', label: t('time'), value: hudTime(времени, t('secShort')) },
          { key: 'lvl', icon: 'flag', label: t('label_level_short'), value: `${закрыто}/${levelParams(playedLevel).colors}` },
        ]}
      >
        {/**
          * ⚠️ ПОЛЕ ЦЕНТРИРУЕТСЯ ПО ВЫСОТЕ. Кадр 05.09.2026: пробирки жались к
          * верхней кромке, под ними оставалось пол-экрана пустоты, а строка
          * задания уезжала вниз под плавающую кнопку отзыва. Центр решает обе
          * беды разом и держит поле на месте при трёх и при четырнадцати
          * пробирках.
          */}
        <View style={styles.середина}>
          <View style={styles.поле}>
            {field.tubes.map((тр, i) => рисоватьПробирку(тр, i))}
          </View>
          {/* Строка «что делать»: правило партии на виду, а не только в справке. */}
          <Text style={[styles.задание, { color: colors.textSecondary }]}>{t('waterSortHint')}</Text>
        </View>
        {тупик ? (
          <Text style={[styles.тупик, { color: colors.textSecondary }]}>{t('waterSortStuck')}</Text>
        ) : null}
        <View style={styles.кнопки}>
          <TouchableOpacity
            accessibilityRole="button"
            style={[styles.кнопка, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={отменить}
            disabled={!история.canUndo}
          >
            <Ionicons name="arrow-undo" size={18} color={colors.text} />
            <Text style={[styles.кнопкаТекст, { color: colors.text }]}>{t('btn_undo')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            style={[styles.кнопка, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={показатьХод}
          >
            <Ionicons name="bulb-outline" size={18} color={colors.text} />
            <Text style={[styles.кнопкаТекст, { color: colors.text }]}>{t('btn_hint')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            style={[styles.кнопка, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={пуск}
          >
            <Ionicons name="refresh" size={18} color={colors.text} />
            <Text style={[styles.кнопкаТекст, { color: colors.text }]}>{t('restart')}</Text>
          </TouchableOpacity>
        </View>
      </GameShell>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t('a11yBack')}
          style={[styles.backBtn, { backgroundColor: colors.surface }]}
          onPress={() => goBackOrHome()}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('waterSort')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'config' && renderConfig()}
      {phase === 'cleared' && (
        <LevelCleared
          gameId={GAME_ID}
          level={playedLevel}
          stars={звёзды(ходов, минимум)}
          gradient={GRADIENT}
          language={language}
          colors={colors}
          onContinue={() => пуск()}
          onStop={() => setPhase('result')}
        />
      )}
      {phase === 'result' && (
        <GameResult
          score={Math.round(1000 * Math.min(1, Math.max(1, минимум) / Math.max(1, ходов)))}
          time={времени}
          errors={ошибок}
          onPlayAgain={() => setPhase('config')}
          onGoHome={() => goBackOrHome()}
          gradient={GRADIENT as [string, string]}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, justifyContent: 'space-between' },
  backBtn: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '700' },
  scrollContent: { padding: 16, gap: 14, paddingBottom: 120 },
  heroCard: { padding: 24, borderRadius: 16, alignItems: 'center', gap: 8 },
  heroTitle: { fontSize: 22, fontWeight: '800' },
  heroDesc: { fontSize: 14, textAlign: 'center' },
  optionCard: { padding: 16, borderRadius: 14, gap: 6 },
  optionLabel: { fontSize: 16, fontWeight: '700' },
  optionHint: { fontSize: 13 },
  середина: { flex: 1, justifyContent: 'center' },
  поле: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'flex-end', gap: 8, paddingHorizontal: 6, paddingTop: 12 },
  гнездо: { justifyContent: 'flex-end' },
  столб: { position: 'absolute', justifyContent: 'flex-end', overflow: 'hidden' },
  обводка: { position: 'absolute', top: -3, left: -3, right: -3, bottom: -3, borderWidth: 3 },
  порция: { width: '100%', alignItems: 'center', justifyContent: 'center' },
  знак: { fontSize: 11, color: 'rgba(255,255,255,0.85)' },
  задание: { textAlign: 'center', fontSize: 13, paddingHorizontal: 16, paddingTop: 8 },
  тупик: { textAlign: 'center', fontSize: 13, paddingVertical: 6 },
  /**
   * 🔴 ПЕРЕНОС СТРОКИ ОБЯЗАТЕЛЕН. Замер веб-гейтов 05.09.2026 на 360 px: три
   * кнопки в ряд занимают 122 + 126 + 105 плюс отступы = 373 при 344 доступных,
   * и страница начинала прокручиваться вбок на 6 px. Ужимать кнопки нельзя —
   * они и так на нижней границе цели нажатия; значит переносим строку.
   */
  кнопки: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 8 },
  /**
   * 🔴 48, А НЕ 44. У аудита целей нажатия два порога, и на ПОЛЕ он требует 48
   * (`MIN_FIELD` в scripts/tap-target-audit.mjs). Кнопки партии считаются полем —
   * на 44 сборка краснела «мелкие элементы на поле».
   */
  кнопка: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1 },
  кнопкаТекст: { fontSize: 14, fontWeight: '600' },
});
