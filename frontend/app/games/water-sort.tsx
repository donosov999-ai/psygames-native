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
import { useLevelRules, LevelRuleBadge, LevelRuleModal, type LevelRule } from '@/src/components/LevelRules';
import GameSetupBar from '@/src/components/GameSetupBar';
import GameAbout from '@/src/components/GameAbout';
import LevelProgressMap from '@/src/components/LevelProgressMap';
import LevelCleared from '@/src/components/LevelCleared';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import { useBallStyle, ballImage, nearestPieceColor } from '@/src/games/balls/ballChoice';
import { NUT_IMG } from '@/src/games/balls/nutAssets.generated';
import { useGamePreset } from '@/src/hooks/useGamePreset';
import { useCalmHush } from '@/src/hooks/useCalmHush';
import { useMoveHistory } from '@/src/hooks/useMoveHistory';
import { useScreenWidth } from '@/src/hooks/useScreenWidth';
import { gameNow } from '@/src/services/gamePause';
import { hudTime } from '@/src/services/hudTime';
import {
  Field, isDone, isSolved, canPour, pour, legalMoves, capOf, stonesIn, isOpen,
} from '@/src/games/water-sort/core/tubes';
import {
  generateLevel, levelParams, solve, КОРОТКИЕ_С, КАМНИ_С, ОТЛОЖЕННЫЙ_С,
} from '@/src/games/water-sort/core/generate';
import {
  СКРЫТО_С, скрытоНаУровне, скрытыеСлои, слойВиден, звёздыПоХодам,
} from '@/src/games/water-sort/core/hidden';
import { HELP_CORNER_SPACE } from '@/src/components/GameHelpOverlay';

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
function звёзды(ходов: number, минимум: number, уровень: number): number {
  /**
   * 🔴 УСЛОВИЕ 4 СКРЫТОГО СЛОЯ. Под неполной информацией минимума НЕ
   * СУЩЕСТВУЕТ: разведка стоит ходов, которых в минимуме нет, и человек,
   * честно разведавший доску, получил бы одну звезду за то, чего не мог знать.
   * Ровно это и звучит в отзывах на чужие игры как «повезёт — не повезёт».
   * На таких уровнях мера другая: дошёл до конца — три звезды.
   */
  if (!звёздыПоХодам(уровень)) return 3;
  if (!минимум) return 3;
  const доля = ходов / минимум;
  if (доля <= 1.2) return 3;
  if (доля <= 1.8) return 2;
  return 1;
}

/**
 * 🔴 ПРАВИЛО ОБЪЯВЛЯЕТСЯ ДО УРОВНЯ — УСЛОВИЕ 6 СКРЫТОГО СЛОЯ.
 *
 * 📍 ЗАЧЕМ ОТДЕЛЬНАЯ СТРОКА В КОДЕ, А НЕ «И так понятно». В соседней игре ровно
 * эта механика шла МОЛЧА шесть дней: сделана 27.08.2026, правило заведено
 * 02.09.2026 — и всё это время человек натыкался на «?» без объяснения. Долг был
 * записан, повторять его не надо.
 *
 * ⚠️ `fromLevel` равен `СКРЫТО_С` не случайно: разъедутся — правило начнёт
 * показываться не на том уровне, где механика включается. Равенство стережёт
 * гейт.
 */
export const WATER_SORT_RULES: LevelRule[] = [
  { key: 'hidden', fromLevel: СКРЫТО_С },
  /**
   * ⚠️ УРОВНИ БЕРУТСЯ ИЗ ГЕНЕРАТОРА, А НЕ ПИШУТСЯ ЧИСЛАМИ. Правило обязано
   * появиться ровно там, где механика включается: разъедутся — человек прочтёт
   * про камни за четыре уровня до первого камня либо увидит камни без объяснения.
   */
  { key: 'short', fromLevel: КОРОТКИЕ_С },
  { key: 'stones', fromLevel: КАМНИ_С },
  { key: 'sealed', fromLevel: ОТЛОЖЕННЫЙ_С },
];

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

/**
 * 🔴 ТРИ ИГРЫ НА ОДНОМ ДВИЖКЕ — РЕШЕНИЕ ДЕНИСА 06.09.2026, дословно: «шарики и
 * гайки отдельными играми рядом… значит лепим, в хаб сортировка».
 *
 * ⚠️ Я ПРЕДЛАГАЛ ИНАЧЕ И БЫЛ ПЕРЕУБЕЖДЁН — ЭТО ЗАПИСАНО, ЧТОБЫ НЕ ПЕРЕИГРЫВАТЬ.
 * Замер был такой: «Color Ball Sort» и «Сортировка Гаек» механически совпадают с
 * переливалкой до правила — сосуд, слой, класть можно на свой цвет, пока есть
 * место. По этому замеру они скины. Денис решил, что три входа лучше одного с
 * переключателем, и это его решение.
 *
 * ЧТО ИЗ ЭТОГО СЛЕДУЕТ ДЛЯ КОДА. Копии экрана быть не должно: три копии
 * шестисотстрочного файла разъедутся за неделю — в проекте это уже случалось с
 * двумя экранами судоку. Поэтому экран ОДИН, а различаются три вещи: ключ
 * лестницы (у каждой игры своя цифра роста), картинка сосуда и форма слоя.
 *
 * ⚠️ ЦЕНА НАЗВАНА ЧЕСТНО: три игры — это три лестницы, три статистики и три
 * входа в развилке. Уровень 20 в шариках и уровень 20 в переливалке — РАЗНЫЕ
 * достижения, и это придётся объяснять человеку, а не коду.
 */
export type СортировкаШкурка = 'water' | 'balls' | 'nuts';

export interface SortScreenProps {
  /** Ключ лестницы и статистики: у каждой из трёх игр он свой. */
  gameId: string;
  skin: СортировкаШкурка;
  /** Ключ словаря для заголовка экрана. */
  titleKey: string;
}

export function SortGameScreen({ gameId, skin, titleKey }: SortScreenProps) {
  const { colors } = useTheme();
  /**
   * 🔴 ШАРЫ БЕРУТСЯ ГОТОВЫЕ, А НЕ РИСУЮТСЯ КРУЖКАМИ В КОДЕ.
   *
   * 📍 Первая редакция этого экрана лепила шарик скруглением `borderRadius` —
   * то есть я строил заново то, что в проекте уже лежало: 90 картинок,
   * девять фактур × десять цветов, нарисованных листом и нарезанных
   * `scripts/build-ball-styles.mjs`. Поймал Денис вопросом «ты в кие отрисовывал
   * под них шкурки? шарики мы уже рисовали».
   *
   * ⚠️ ФАКТУРА БЕРЁТСЯ ИЗ ВЫБОРА ЧЕЛОВЕКА (`useBallStyle`), а не зашита: он уже
   * выбрал её в другой игре, и своя вторая настройка на то же самое читалась бы
   * как рассинхрон.
   */
  const фактураШара = useBallStyle();
  const { t, language } = useLanguage();
  const lvl = usePersistentLevel(gameId);
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

  /**
   * 🔴 «ЗАНОВО» ВОЗВРАЩАЕТ ТУ ЖЕ ДОСКУ, А НЕ РАЗДАЁТ НОВУЮ.
   *
   * Отчёт Дениса 05.09.2026 (764330da, голосом): «чтобы она не перемешивалась, а
   * просто… заново». Так и было: кнопка звала генератор, и каждый раз приходил
   * НОВЫЙ случайный расклад.
   *
   * Почему это ломает игру, а не просто раздражает. Головоломку перезапускают,
   * когда зашли в тупик и хотят пройти ЭТУ доску иначе; новый расклад лишает
   * такой возможности вовсе — застрявший уровень нельзя переиграть, можно только
   * получить другой. И обратно: кнопка превращается в перебор раздач, пока не
   * выпадет полегче, а лестница сложности при этом считает уровень пройденным.
   *
   * Раздача обновляется там, где ей и место: при входе в уровень и при переходе
   * на следующий. `свежая` разделяет эти два случая.
   */
  const начальнаяRef = useRef<{ level: number; field: Field; minMoves: number } | null>(null);

  /**
   * Полная копия доски — СТРАХОВКА, и это сказано честно.
   *
   * Сегодня она не обязательна: `pour` иммутабелен, возвращает новое поле с
   * новыми массивами пробирок и старое не трогает (`core/tubes.ts`). Замер:
   * убрать копию — проба «Заново возвращает ту же доску» остаётся зелёной, и
   * это правильный зелёный, а не слепой.
   *
   * ⚠️ Оставлена потому, что цена ошибки несимметрична: стоит однажды написать
   * ход на месте — и сохранённая доска поедет вместе с играемой, а «Заново»
   * начнёт возвращать не начало, а место, где человек застрял. Заметить это по
   * поведению почти невозможно: доска-то похожа.
   */
  const копия = (f: Field): Field => ({ cap: f.cap, tubes: f.tubes.map((t) => [...t]) });

  /**
   * 🔴 СКРЫТЫЕ СЛОИ ХРАНЯТСЯ НАБОРОМ ОТ РАЗДАЧИ, А ВИДИМОСТЬ СЧИТАЕТСЯ ОТ ЖИВОГО
   * ПОЛЯ. Это и делает условие 5 бесплатным: отмена возвращает столбик, слой
   * снова оказывается не верхним — и снова закрывается сам, без отдельной
   * истории скрытости. Хранить «что уже открыто» значило бы завести вторую
   * правду о доске, а они расходятся (на этом уже обжигались в сортировке).
   */
  const [скрытые, setСкрытые] = useState<ReadonlySet<number>>(new Set());

  /** Зерно от номера уровня: тот же уровень — то же спрятанное, при любом заходе. */
  const зерноУровня = (L: number) => {
    let a = (L * 7919) >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  const пуск = (свежая = true) => {
    if (тупикБылRef.current) { lvl.fail(); тупикБылRef.current = false; }
    const сохранена = начальнаяRef.current;
    const взять = (!свежая && сохранена && сохранена.level === lvl.level)
      ? { field: копия(сохранена.field), solutionMoves: сохранена.minMoves }
      : generateLevel(lvl.level);
    if (свежая || !сохранена || сохранена.level !== lvl.level) {
      начальнаяRef.current = { level: lvl.level, field: копия(взять.field), minMoves: взять.solutionMoves };
    }
    const { field: доска, solutionMoves } = взять;
    setPlayedLevel(lvl.level);
    setField(доска);
    // Зерно от уровня: «Заново» обязано вернуть ту же доску и то же спрятанное.
    setСкрытые(скрытоНаУровне(lvl.level) ? скрытыеСлои(доска, зерноУровня(lvl.level)) : new Set());
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
  const правилаУровня = useLevelRules(gameId, lvl.level, WATER_SORT_RULES, phase === 'playing');
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
    /**
     * 🔴 ПРИЁМЫ ОБЯЗАНЫ БЫТЬ ВИДНЫ, ИНАЧЕ ИХ НЕТ.
     *
     * Урок того же дня, оплаченный в «Соедини точки»: стены знали генератор,
     * решатель и проверка — а доска их не рисовала, и человек видел поле, где
     * часть клеток молча не пускает. Здесь то же самое стоило бы дороже:
     * короткий сосуд без отметки читается как обычный, и «не льётся» выглядит
     * поломкой игры.
     *
     * Высота ПОРЦИИ одна на все сосуды (по самому высокому), поэтому короткий
     * сосуд выходит визуально коротким — ровно то сообщение, что нужно.
     */
    const высотаПорции = высотаСтолба / field!.cap;
    const своя = capOf(field!, i);
    const камней = stonesIn(field!, i);
    const запечатан = !isOpen(field!, i);
    const высотаСвоего = высотаПорции * своя;
    const верхСвоего = верхЖ + (высотаСтолба - высотаСвоего);

    return (
      <TouchableOpacity
        key={i}
        accessibilityRole="button"
        accessibilityLabel={трубка.length
          ? трубка.map((c, глуб) => (слойВиден(field!, скрытые, i, глуб)
            ? ЦВЕТА[c % ЦВЕТА.length]!.mark : '?')).join(' ')
          : t('waterSortEmptyTube')}
        accessibilityState={{ selected: выбор }}
        onPress={() => нажать(i)}
        activeOpacity={0.85}
        style={[styles.гнездо, {
          width: ш, height: в,
          transform: [{ translateY: выбор ? -14 : 0 }],
          // Запечатанный сосуд гасится: он на поле есть, но в ход не идёт.
          opacity: запечатан ? 0.42 : 1,
        }]}
      >
        {запечатан ? (
          <View style={{ position: 'absolute', top: в * 0.34, left: 0, right: 0, alignItems: 'center', zIndex: 3 }}>
            <Ionicons name="lock-closed" size={Math.max(14, ш * 0.34)} color="#3F444B" />
          </View>
        ) : null}
        {/* Жидкость: снизу вверх, дно скруглено по форме пробирки. */}
        <View style={[styles.столб, { left: левo, width: ширинаЖ, top: верхСвоего, height: высотаСвоего }]}>
          {/* Камни на дне: сосуд-буфер, домом цвета он не станет никогда. */}
          {камней > 0 ? (
            <View style={{
              position: 'absolute', left: 0, right: 0, bottom: 0,
              height: высотаПорции * камней, backgroundColor: '#6B6F76',
              borderTopWidth: 2, borderTopColor: '#4A4E54',
              borderBottomLeftRadius: 8, borderBottomRightRadius: 8,
            }} />
          ) : null}
          {[...трубка].reverse().map((c, k) => {
            const снизу = трубка.length - 1 - k;                 // индекс порции от дна
            const дно = снизу === 0;
            /**
             * ⚠️ СКРЫТЫЙ СЛОЙ РИСУЕТСЯ СЕРЫМ СО ЗНАКОМ ВОПРОСА, А НЕ ЧЁРНЫМ.
             * Чёрная порция читается как «пустое место» или как поломка; знак
             * вопроса говорит «здесь есть цвет, и он неизвестен» — а это разные
             * сообщения. Верхний слой сюда не попадает никогда (условие 1).
             */
            const видно = слойВиден(field!, скрытые, i, снизу);
            /**
             * 🔴 ФОРМА СЛОЯ — ЕДИНСТВЕННОЕ, ЧЕМ ТРИ ИГРЫ РАЗЛИЧАЮТСЯ НА ПОЛЕ.
             * Вода льётся сплошным столбиком, шарики лежат кружками с зазором,
             * гайки — гранёными плитками с отверстием. Правило хода у всех трёх
             * одно, и это честно: скин меняет вид, а не задачу.
             *
             * ⚠️ ЗАЗОР У ШАРИКОВ НЕ УКРАШЕНИЕ. Без него круги слипаются в столбик
             * и читаются как та же вода — то есть отличать игры стало бы нечем,
             * а входов было бы три.
             */
            const круглый = skin === 'balls';
            const гайка = skin === 'nuts';
            /**
             * ⚠️ ЦВЕТ ИГРЫ → БЛИЖАЙШИЙ ИЗ ДЕСЯТИ НАРИСОВАННЫХ, одной картой на
             * обе шкурки. У шаров и гаек намеренно ОДИН набор цветов: разные
             * наборы дали бы разное сопоставление, и синий в шариках оказался бы
             * не тем синим, что в гайках.
             */
            const ближний = nearestPieceColor(ЦВЕТА[c % ЦВЕТА.length]!.fill);
            const шар = видно && круглый ? ballImage(фактураШара, ближний)
              : видно && гайка ? NUT_IMG[ближний] : null;
            const радиус = круглый ? высотаПорции / 2 : гайка ? 6 : 0;
            return (
              <View
                key={k}
                style={[
                  styles.порция,
                  {
                    height: высотаПорции - (круглый ? 3 : гайка ? 2 : 0),
                    marginBottom: круглый ? 3 : гайка ? 2 : 0,
                    borderRadius: радиус,
                    // У нарисованного шара фона нет: картинка сама несёт цвет и блик.
                    backgroundColor: шар ? 'transparent' : (видно ? ЦВЕТА[c % ЦВЕТА.length]!.fill : '#6b7280'),
                    borderBottomLeftRadius: дно && !круглый && !гайка ? ширинаЖ / 2 : радиус,
                    borderBottomRightRadius: дно && !круглый && !гайка ? ширинаЖ / 2 : радиус,
                  },
                ]}
              >
                {/*
                  ⚠️ РАЗМЕР КАРТИНКИ ЗАДАН ЯВНО, А НЕ ЧЕРЕЗ absoluteFill. На
                  react-native-web `absoluteFill` НЕ ограничивает `<Image>`:
                  натуральная ширина перебивает inset, и шар вылезает за трубку.
                  В проекте на это наступали трижды, есть отдельный гейт.
                */}
                {шар ? (
                  <Image
                    source={шар}
                    style={{ width: ширинаЖ, height: высотаПорции - 3 }}
                    resizeMode="contain"
                  />
                ) : null}
                {/* Знак — вторая опора для дальтоника. На картинке шара он лежит поверх. */}
                <Text style={[styles.знак, шар ? { position: 'absolute' } : null]}>
                  {видно ? ЦВЕТА[c % ЦВЕТА.length]!.mark : '?'}
                </Text>
              </View>
            );
          })}
        </View>

        {/*
          Стекло поверх: блики и ободок ложатся НА жидкость, как в настоящей
          пробирке. ⚠️ У гаек стекла НЕТ — они сидят на стержне, а не в сосуде, и
          блик поверх металла читался бы как грязь.
        */}
        {skin === 'nuts' ? (
          <View pointerEvents="none" style={{
            position: 'absolute', alignSelf: 'center', top: в * ВНУТРИ_СВЕРХУ * 0.4,
            width: Math.max(4, ш * 0.09), height: в * 0.94, borderRadius: 4,
            backgroundColor: 'rgba(120,124,131,0.55)',
          }} />
        ) : (
          <Image source={СТЕКЛО} style={{ position: 'absolute', width: ш, height: в }} resizeMode="stretch" />
        )}

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
            gameId={gameId}
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
        title={t(titleKey)}
        onBack={() => { if (таймерRef.current) clearInterval(таймерRef.current); goBackOrHome(); }}
        hud={[
          { key: 'moves', icon: 'swap-horizontal', label: t('hud_moves'), value: `${ходов}/${Math.max(1, минимум)}`,
            tone: ходов > минимум ? 'warn' as const : 'good' as const, pop: true },
          { key: 'time', icon: 'time', label: t('time'), value: hudTime(времени, t('secShort')) },
          { key: 'lvl', icon: 'flag', label: t('label_level_short'), value: `${закрыто}/${levelParams(playedLevel).colors}` },
        ]}
        headerRight={<LevelRuleBadge lr={правилаУровня} color="#0072ff" ru={language === 'ru'} />}
      >
        <LevelRuleModal lr={правилаУровня} colors={colors} ru={language === 'ru'} />
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
            // ⚠️ `false` — та же доска, а не новая раздача (см. шапку `пуск`).
            onPress={() => пуск(false)}
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
        <View style={{ width: HELP_CORNER_SPACE }} />
      </View>
      {phase === 'config' && renderConfig()}
      {phase === 'cleared' && (
        <LevelCleared
          gameId={gameId}
          level={playedLevel}
          stars={звёзды(ходов, минимум, lvl.level)}
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

/** Маршрут «Переливалка» — вода в пробирках. */
export default function WaterSortGame() {
  return <SortGameScreen gameId={GAME_ID} skin="water" titleKey="waterSort" />;
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
