import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions, ScrollView, Image, ImageBackground } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { goBackOrHome } from '@/src/utils/nav';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { saveSession } from '@/src/services/api';
import GameResult from '@/src/components/GameResult';
import GameAbout from '@/src/components/GameAbout';
import GameShell from '@/src/components/GameShell';
import LevelCleared from '@/src/components/LevelCleared';
import LevelProgressMap from '@/src/components/LevelProgressMap';
import { useAutostart, useGamePreset } from '@/src/hooks/useGamePreset';
import { useGameMode, shouldChainNextLevel } from '@/src/hooks/useGameMode';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import { HudBadge, JuicyButton, ScorePopupLayer, useScorePopups, hapticTap, hapticSuccess } from '@/src/components/juice';
import { sndCombo } from '@/src/services/feedback';
import { useLevelRules, LevelRuleBadge, LevelRuleModal, LevelRule } from '@/src/components/LevelRules';
import { a11yDecor } from '@/src/services/a11y';
import { useProfile } from '@/src/contexts/ProfileContext';

// v1.112.0: правила-по-уровням объясняются явно (аудит «молчаливых механик»)
const GS_RULES: LevelRule[] = [
  {
    key: 'movelimit', fromLevel: 9,
    ru: { title: 'Лимит ходов', rule: 'Теперь на уровень даётся ограниченное число перестановок — трать ходы с умом. Превысил лимит — уровень заново. Счётчик ходов в шапке: сделано/лимит.', example: 'Пример: ⇄ 12/18 — сделано 12 ходов из 18. С каждым уровнем лимит жмёт сильнее.' },
    en: { title: 'Move limit', rule: 'Each level now allows a limited number of moves — spend them wisely. Exceed the limit and the level restarts. The header counter shows used/limit.', example: 'Example: ⇄ 12/18 — 12 of 18 moves used. The limit tightens every level.' },
  },
];

const GRADIENT = ['#f7971e', '#ffd200'];
const GOODS_BENEFITS = [
  { icon: 'eye-outline', textKey: 'benefitGoods1' },
  { icon: 'git-branch-outline', textKey: 'benefitGoods2' },
  { icon: 'albums-outline', textKey: 'benefitGoods3' },
];

// Товары (сгенерены Nano Banana 2, generic-этикетки — НЕ реальные бренды). Прозрачные PNG.
const GOOD_SPRITES = [
  require('../../assets/images/goods/good0.webp'),  // кола
  require('../../assets/images/goods/good1.webp'),  // лимонад
  require('../../assets/images/goods/good2.webp'),  // кефир
  require('../../assets/images/goods/good3.webp'),  // молоко
  require('../../assets/images/goods/good4.webp'),  // сок
  require('../../assets/images/goods/good5.webp'),  // йогурт
  require('../../assets/images/goods/good6.webp'),  // банан
  require('../../assets/images/goods/good7.webp'),  // яблоко
  require('../../assets/images/goods/good8.webp'),  // шоколад
  require('../../assets/images/goods/good9.webp'),  // чипсы
  require('../../assets/images/goods/good10.webp'), // хлеб
  require('../../assets/images/goods/good11.webp'), // зубная паста
  require('../../assets/images/goods/good12.webp'), // виноградный сок
  require('../../assets/images/goods/good13.webp'), // клубничный коктейль
  require('../../assets/images/goods/good14.webp'), // мишка
  require('../../assets/images/goods/good15.webp'), // кактус
  require('../../assets/images/goods/good16.webp'), // цветок
  require('../../assets/images/goods/good17.webp'), // зайка
  require('../../assets/images/goods/good18.webp'), // цыплёнок
  require('../../assets/images/goods/good19.webp'), // коала
  require('../../assets/images/goods/good20.webp'), // растение
  require('../../assets/images/goods/good21.webp'), // пингвин
  require('../../assets/images/goods/good22.webp'), // лиса
];

// Наборы товаров — ВЫБОР В МЕНЮ (как в оригинале). Каждый набор = пул индексов спрайтов.
const GOOD_SETS: { key: string; ru: string; en: string; icon: any; pool: number[] }[] = [
  { key: 'drinks', ru: 'Напитки', en: 'Drinks', icon: 'wine', pool: [0, 1, 4, 12, 13, 2, 5, 3] },
  { key: 'food', ru: 'Еда', en: 'Food', icon: 'fast-food', pool: [6, 7, 8, 9, 10, 11] },
  { key: 'toys', ru: 'Игрушки', en: 'Toys', icon: 'happy', pool: [14, 15, 16, 17, 18, 19, 20, 21, 22] },
  { key: 'mix', ru: 'Микс', en: 'Mix', icon: 'apps', pool: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22] },
];

// Названия товаров для скринридера. Держим локально ru/en (как pieceName в
// chess-blind) вместо 23 ключей × 12 языков: игроку важно РАЗЛИЧАТЬ товары,
// а не читать их на родном — при другом языке падаем на английский.
const GOOD_NAMES_RU = ['кола','лимонад','кефир','молоко','сок','йогурт','банан','яблоко','шоколад','чипсы','хлеб','зубная паста','виноградный сок','клубничный коктейль','мишка','кактус','цветок','зайка','цыплёнок','коала','растение','пингвин','лиса'];
const GOOD_NAMES_EN = ['cola','lemonade','kefir','milk','juice','yogurt','banana','apple','chocolate','chips','bread','toothpaste','grape juice','strawberry shake','teddy bear','cactus','flower','bunny','chick','koala','plant','penguin','fox'];
const goodName = (type: number, ru: boolean) =>
  (ru ? GOOD_NAMES_RU : GOOD_NAMES_EN)[type % GOOD_NAMES_EN.length];

function GoodIcon({ type, width, height }: { type: number; width: number; height: number }) {
  return (
    <Image
      {...a11yDecor}
      source={GOOD_SPRITES[type % GOOD_SPRITES.length]}
      /**
       * Тень ложится на ЗАДНЮЮ СТЕНКУ ниши со сдвигом вниз-влево, а не под
       * предмет: свет в эталоне идёт сверху-справа-спереди. Тень строго снизу
       * читается как наклейка на полу, а не как стоящий предмет.
       */
      style={{ width, height, shadowColor: '#2e1a08', shadowOpacity: 0.5, shadowRadius: 5, shadowOffset: { width: -3, height: 4 } }}
      resizeMode="contain"
    />
  );
}

type GamePhase = 'intro' | 'config' | 'playing' | 'result';
type Sel = { cell: number; idx: number } | null;

function shuffle<T>(arr: T[]): T[] { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

/**
 * ШКАФ — КАРТИНКА, А НЕ ВЁРСТКА.
 *
 * 🔴 ПОЧЕМУ. Денис 19.08.2026 про CSS-вариант: «3д не ощущается, что там
 * глубина — просто закрашенная таблица». Он прав, и у вёрстки здесь потолок:
 * градиентом можно изобразить углубление, но нельзя — текстуру дерева, боковые
 * стенки ниши и настоящий свет. Эталон (Sort Match) рисует шкаф картинкой и
 * кладёт товары поверх; делаем так же.
 *
 * ⚠️ НЕ ЦЕЛЫЙ ШКАФ, А ПЛИТКА ОДНОЙ НИШИ. Целая картинка не годится: доска у
 * нас переменного размера (3×4 … 3×6) и с ДЫРКАМИ (формы уровня), под неё
 * фон не подрежешь. Плитка вырезана из середины сгенерированного шкафа, то
 * есть несёт полурейки по всем четырём краям — состыкованные, они дают целые
 * доски, а дырка формы просто оставляет пустое место.
 *
 * Девять стилей нарисованы одной сеткой 3×3 в kie (2K, 12 кредитов) и
 * нарезаны: assets/images/goods/_styles/. Стиль привязан к профилю — у
 * «Микро-релакса» шкаф не такой, как у «Шахматиста».
 */
const SHELF_TILES = {
  birch:  require('../../assets/images/shelves/niche-birch.webp'),
  pine:   require('../../assets/images/shelves/niche-pine.webp'),
  white:  require('../../assets/images/shelves/niche-white.webp'),
  oak:    require('../../assets/images/shelves/niche-oak.webp'),
  mint:   require('../../assets/images/shelves/niche-mint.webp'),
  pink:   require('../../assets/images/shelves/niche-pink.webp'),
  grey:   require('../../assets/images/shelves/niche-grey.webp'),
  walnut: require('../../assets/images/shelves/niche-walnut.webp'),
  bamboo: require('../../assets/images/shelves/niche-bamboo.webp'),
} as const;

type ShelfStyle = keyof typeof SHELF_TILES;

/** Профиль → стиль шкафа. Незнакомый профиль получает берёзу. */
const SHELF_BY_PROFILE: Record<string, ShelfStyle> = {
  kids: 'mint',            // детям светлое и мягкое
  vasilyeva: 'pink',       // Валин профиль
  women: 'pink',           // «Микро-релакс» — тёплый и спокойный
  nzt48: 'walnut',         // тёмное дерево под серьёзный профиль
  execs: 'grey',           // предприниматели — сдержанное
  students: 'pine',
  chess: 'white',
  polyglot: 'bamboo',
  seniors: 'oak',          // тёплое и контрастное
  drivers: 'grey',
  odv999: 'walnut',
  free: 'birch',
};

const CAP = 3;     // вместимость ячейки — 3 товара ВИДИМЫ (суть оригинала)

// Доска РАСТЁТ с уровнем: L1-7 3×3 (9), L8-11 4×3 (12), L12+ 4×4 (16) → больше типов на верхах.
/**
 * 🔴 НА ТЕЛЕФОНЕ НЕ БОЛЬШЕ ТРЁХ КОЛОНОК.
 *
 * Денис 19.08.2026: «убого смотрится, далеко от оригинала», с ссылкой на
 * Sort Match (1 млн скачиваний). Разбор эталона: густые полки на восемь колонок
 * — это ВИТРИНА в сторе, а игровой экран у них ТРЁХКОЛОНОЧНЫЙ, товар крупный и
 * узнаётся силуэтом.
 *
 * У нас с 8-го уровня стояли четыре колонки, и на 386px это давало товар в
 * 23 пикселя — при том, что сам файл нарисован 384×384. Красивую жестянку
 * показывали цветным пятном. Никакая перерисовка этого не лечит: дело не в
 * рисунке, а в том, сколько ему дали места.
 *
 * Сложность от этого не падает: она держится числом ТИПОВ и теснотой свободных
 * ячеек, а не количеством пикселей. Ряды добавляем вместо колонок — вниз экран
 * тянется, вбок нет.
 */
function gridFor(L: number, narrow = false): { cols: number; rows: number } {
  // ⚠️ На телефоне ряды идут ВМЕСТО колонок: вниз экран тянется, вбок нет.
  // Так шкаф заполняет поле при правильной пропорции ниши, а не растянутыми
  // коробками. У эталона стартовая доска тоже высокая — 3 колонки на 5 рядов.
  if (L <= 7) return narrow ? { cols: 3, rows: 4 } : { cols: 3, rows: 3 };
  if (L <= 11) return narrow ? { cols: 3, rows: 5 } : { cols: 4, rows: 3 };
  return narrow ? { cols: 3, rows: 6 } : { cols: 4, rows: 4 };
}

// Сложность по уровню: больше типов + теснее (меньше пустых ячеек для манёвра) + растущая доска.
/**
 * ФОРМЫ ДОСКИ — не прямоугольник, а фигура из ниш.
 *
 * 🔴 ЗАЧЕМ. Замер генератора 19.08.2026: за первые 60 уровней он даёт ВСЕГО 13
 * разных составов, последний новый появляется на 18-м. Дальше L20, L50, L200 и
 * L1000 одинаковы — 3×5, 13 типов, 2 свободных. Тысяча таких уровней это один
 * уровень тысячу раз. Потолок держат три упора: поле не больше 16 ячеек, типов
 * не больше `slots − 2`, свободных не меньше двух.
 *
 * Форма не упирается ни во что из этого. Одна и та же сетка 3×5 даёт крест,
 * лесенку, песочные часы, рамку — и каждая играется по-своему, потому что
 * меняется, куда вообще можно переложить товар.
 *
 * ⚠️ РЕШАЕМОСТЬ НЕ СТРАДАЕТ. Ход здесь — «взять из любой ячейки, положить в
 * любую», связность фигуры не нужна. Достаточно, чтобы свободных ниш осталось
 * не меньше двух — и это считается по СУЩЕСТВУЮЩИМ ячейкам, а не по габариту.
 *
 * Точка = ниши нет, решётка = есть.
 */
type Shape = string[];

const SHAPES: Record<string, Shape[]> = {
  '3x3': [
    ['###', '###', '###'],          // полная
    ['#.#', '###', '#.#'],          // песочные часы
    ['###', '#.#', '###'],          // рамка
    ['##.', '###', '.##'],          // зигзаг (7 ниш: на 5 играть нечем — поймал гейт)
  ],
  '3x4': [
    ['###', '###', '###', '###'],
    ['.#.', '###', '###', '.#.'],   // крест
    ['###', '#.#', '#.#', '###'],   // рамка
    ['#..', '##.', '.##', '..#'],   // лесенка
    ['###', '.#.', '.#.', '###'],   // катушка
  ],
  '3x5': [
    ['###', '###', '###', '###', '###'],
    ['.#.', '###', '###', '###', '.#.'],
    ['###', '#.#', '#.#', '#.#', '###'],
    ['#..', '##.', '###', '.##', '..#'],
    ['###', '..#', '###', '#..', '###'],
    ['.#.', '.#.', '###', '.#.', '.#.'],
    ['##.', '##.', '###', '.##', '.##'],
    ['###', '#.#', '###', '#.#', '###'],
    ['..#', '.##', '###', '##.', '#..'],
    ['#.#', '###', '.#.', '###', '#.#'],
  ],
  '3x6': [
    ['###', '###', '###', '###', '###', '###'],
    ['.#.', '###', '###', '###', '###', '.#.'],
    ['###', '#.#', '###', '#.#', '###', '#.#'],
    ['#..', '##.', '###', '###', '.##', '..#'],
    ['###', '.#.', '###', '###', '.#.', '###'],
    ['##.', '##.', '###', '###', '.##', '.##'],
    ['#.#', '###', '#.#', '#.#', '###', '#.#'],
    ['###', '#..', '###', '###', '..#', '###'],
    ['.##', '.##', '###', '###', '##.', '##.'],
    ['###', '###', '#.#', '#.#', '###', '###'],
    ['.#.', '###', '#.#', '#.#', '###', '.#.'],
    ['#.#', '#.#', '###', '###', '#.#', '#.#'],
  ],
  '4x3': [
    ['####', '####', '####'],
    ['.##.', '####', '.##.'],
    ['####', '#..#', '####'],
    ['#..#', '####', '#..#'],
  ],
  '4x4': [
    ['####', '####', '####', '####'],
    ['.##.', '####', '####', '.##.'],
    ['####', '#..#', '#..#', '####'],
    ['#...', '##..', '.##.', '...#'],
    ['.##.', '#..#', '#..#', '.##.'],   // ромб
  ],
};

/**
 * Маска ниш для уровня. Первый уровень каждого размера — всегда полная доска:
 * человек должен понять правило на простой фигуре, а не разбираться сразу с
 * дыркой посередине.
 */
function shapeFor(L: number, cols: number, rows: number): boolean[] {
  const list = SHAPES[`${cols}x${rows}`];
  if (!list || !list.length) return Array(cols * rows).fill(true);
  /**
   * ⚠️ ШАГ ОБЯЗАН БЫТЬ ВЗАИМНО ПРОСТ С ДЛИНОЙ СПИСКА, иначе часть форм не
   * используется НИКОГДА. Я на этом споткнулся: поставил шаг 3 при списке из
   * 12 форм — gcd(3,12)=3, обходилась ровно треть, и разных уровней стало
   * МЕНЬШЕ (23 вместо 25), хотя форм я добавил вдвое. Списки у нас длиной
   * 5, 10 и 12; 7 взаимно прост со всеми тремя.
   */
  const idx = L <= 2 ? 0 : ((L - 3) * 7) % list.length;
  const shape = list[idx];
  const mask: boolean[] = [];
  for (let r = 0; r < rows; r++) {
    const line = shape[r] ?? '#'.repeat(cols);
    for (let c = 0; c < cols; c++) mask.push(line[c] === '#');
  }
  return mask;
}

/**
 * ПРЕПЯТСТВИЯ — вторая ось сложности после формы доски.
 *
 * 🔴 ЗАЧЕМ. Замер генератора: формы подняли разнообразие с 13 разных уровней
 * до 30, но цель Дениса — 55. Оси, которые растят ЧИСЛО типов и тесноту,
 * насыщаются к L21 и дальше не дают ничего. Препятствия не насыщаются: они
 * меняют не количество, а то, КУДА можно ходить.
 *
 * ⚠️ ТРИ ИЗ ЧЕТЫРЁХ МЕНЯЮТ ЗАДАЧУ, ОДНО ПРОСТО ДАВИТ. Разделение важное:
 *   · закрытая ниша  — сужает поле манёвра, надо планировать вокруг;
 *   · накрытый товар — неполная информация, надо помнить, что открылось;
 *   · примёрзший ряд — задаёт ПОРЯДОК: сначала нужный тип, потом остальное;
 *   · замок на N ходов — единственное чистое давление, поэтому он самый
 *     мягкий и снимается сам, без действий игрока.
 * Давление у соседей по жанру — не дизайн, а воронка к рекламе; у нас рекламы
 * нет, поэтому давления берём ровно столько, сколько нужно для ритма.
 *
 * 🔴 ПРЕПЯТСТВИЯ НЕ РАНЬШЕ L6. До шестого уровня человек ещё осваивает само
 * правило «три одинаковых в одной нише». Класть поверх него второе правило —
 * это не сложность, а каша.
 */
type Obstacle =
  | { kind: 'blocked' }                        // ниша заперта, снимается тройкой в соседней
  | { kind: 'locked'; movesLeft: number }      // откроется через N ходов, счётчик виден
  | null;

/** Что показывать на уровне. Пустой набор — препятствий нет. */
interface ObstaclePlan {
  blocked: number;      // сколько ниш заперто
  locked: number;       // сколько ниш под замком по ходам
  covered: number;      // сколько товаров накрыто
  frozenRow: boolean;   // примёрзший ряд
}

/**
 * Таблица «уровень → препятствия». Не формула: у формулы препятствия
 * появлялись бы линейно и предсказуемо, а нам нужен ритм — уровень с новым
 * препятствием, потом передышка, потом два вместе.
 *
 * Индекс = (L - 6) по кругу. Первый набор каждого вида идёт ОДИН, чтобы
 * человек понял правило на чистом примере (правило показывается через
 * LevelRules при первом появлении).
 */
const OBSTACLE_PLANS: ObstaclePlan[] = [
  { blocked: 1, locked: 0, covered: 0, frozenRow: false },   // знакомство: одна закрытая ниша
  { blocked: 0, locked: 0, covered: 0, frozenRow: false },   // передышка
  { blocked: 0, locked: 0, covered: 2, frozenRow: false },   // знакомство: накрытые товары
  { blocked: 2, locked: 0, covered: 0, frozenRow: false },
  { blocked: 0, locked: 1, covered: 0, frozenRow: false },   // знакомство: замок по ходам
  { blocked: 1, locked: 0, covered: 2, frozenRow: false },   // два вместе
  { blocked: 0, locked: 0, covered: 0, frozenRow: true },    // знакомство: примёрзший ряд
  { blocked: 2, locked: 1, covered: 0, frozenRow: false },
  { blocked: 0, locked: 0, covered: 3, frozenRow: true },
  { blocked: 1, locked: 1, covered: 2, frozenRow: false },   // всё сразу
];

const NO_OBSTACLES: ObstaclePlan = { blocked: 0, locked: 0, covered: 0, frozenRow: false };

/**
 * Ряды, которые ЕСТЬ СМЫСЛ морозить.
 *
 * Живой ряд = минимум две открытые ниши: маска её не вырезала и замок не занял.
 * На ряде из одной ниши заморозка ничего не меняет (тройку там всё равно не
 * собрать), на ряде из дыр — не запрещает ничего, а на ниши под замком ложится
 * вторым запретом: два значка в одной ячейке. Первый ряд не морозим никогда —
 * он верхний, с него человек читает доску.
 *
 * Вынесено из loadLevel наружу ради гейта: правило решаемости должно
 * проверяться исполнением, а не чтением исходника глазами теста.
 */
/**
 * ЦЕЛЬ УРОВНЯ — ЧТО ИМЕННО ЗНАЧИТ «ПРОШЁЛ».
 *
 * До сих пор цель была одна и неписаная: опустошить доску. Лимит ходов при этом
 * существовал ОТДЕЛЬНО и молча — с девятого уровня он резал прохождение, нигде
 * не назвавшись целью. Человек собирал доску и узнавал о лимите постфактум, из
 * экрана провала. Это не сложность, а подстава.
 *
 * Теперь целей четыре, и каждая написана на экране до старта и в шапке во время:
 *
 *   all    убрать всё          база, ей учат первые четыре уровня
 *   pick   собрать названные   тройки конкретных товаров, остальное можно бросить
 *   moves  уложиться в ходы    лимит становится ЦЕЛЬЮ, а не тихим ограничением
 *   free   освободить ниши     помеченные ниши должны опустеть
 *
 * 🔴 ЛИМИТ ХОДОВ ТЕПЕРЬ ТОЛЬКО НА СВОИХ УРОВНЯХ. Раньше он висел на каждом
 * уровне с девятого. Оставить его везде и заодно назвать целью — значит
 * получить цель, которая ничего не отличает. Давление эффективности никуда не
 * делось: звёзды считаются по ходам ВСЕГДА, на всех уровнях.
 *
 * `pick` даёт настоящую смену задачи, а не косметику: уровень заканчивается,
 * пока на полках ещё лежит товар, и играть надо адресно.
 */
type GoalKind = 'all' | 'pick' | 'moves' | 'free';
interface GoalPlan { kind: GoalKind; count: number }

/** Живая цель уровня: план, разложенный на КОНКРЕТНУЮ доску. */
type Goal =
  | { kind: 'all' }
  | { kind: 'pick'; types: number[] }
  | { kind: 'moves'; limit: number }
  | { kind: 'free'; niches: number[] };

/**
 * Ритм целей. Как и у препятствий — таблица, не формула: каждый новый вид
 * приходит ОДИН, потом передышка на базовой цели, потом связки посложнее.
 *
 * Длина 12 против 10 у препятствий — совместный цикл выходит 60 уровней, ровно
 * столько, сколько мы меряем. Совпадение не случайное: одинаковые длины дали бы
 * жёсткую пару «цель+препятствие» и вдвое меньше разных уровней.
 */
const GOAL_PLANS: GoalPlan[] = [
  { kind: 'pick', count: 2 },    // знакомство: собери названные
  { kind: 'all', count: 0 },     // передышка
  { kind: 'free', count: 1 },    // знакомство: освободи нишу
  { kind: 'all', count: 0 },
  { kind: 'moves', count: 0 },   // знакомство: лимит ходов
  { kind: 'pick', count: 3 },
  { kind: 'all', count: 0 },
  { kind: 'free', count: 2 },
  { kind: 'moves', count: 0 },
  { kind: 'pick', count: 2 },
  { kind: 'all', count: 0 },
  { kind: 'free', count: 2 },
];

/**
 * Первые четыре уровня — только «убрать всё»: пока не усвоено правило «три
 * одинаковых в одной нише», вторая задача поверх него читается как каша (та же
 * причина, по которой препятствий нет до шестого).
 *
 * Лимит ходов раньше девятого не существует (формула `L - 8`), поэтому цель
 * `moves` до L9 подменяется базовой — иначе была бы цель «уложись в ноль ходов».
 */
export function goalPlan(L: number): GoalPlan {
  if (L < 5) return { kind: 'all', count: 0 };
  return clampGoalToLevel(GOAL_PLANS[(L - 5) % GOAL_PLANS.length], L);
}

/**
 * Страховка: цель «уложись в ходы» ниже девятого уровня подменяется базовой.
 *
 * Отдельной функцией, а не строчкой внутри `goalPlan`, намеренно. При текущей
 * раскладке таблицы первый `moves` и так приходится на L9, то есть страховка
 * НЕДОСТИЖИМА — мутация «убрать проверку» проходила мимо гейта 19.08.2026.
 * Строчка, которую нельзя проверить исполнением, ничего не стережёт: таблицу
 * переставят, и она молча пропустит цель «уложись в ноль ходов».
 */
export function clampGoalToLevel(g: GoalPlan, L: number): GoalPlan {
  if (g.kind === 'moves' && L < 9) return { kind: 'all', count: 0 };
  return g;
}

/** Цель достигнута? Единственное место, где решается «уровень пройден». */
export function goalMet(cells: number[][], goal: Goal): boolean {
  if (goal.kind === 'pick') return !cells.some((c) => c.some((t) => goal.types.includes(t)));
  if (goal.kind === 'free') return goal.niches.every((i) => (cells[i]?.length ?? 0) === 0);
  return cells.every((c) => c.length === 0);
}

/** Сколько из цели сделано — для бейджа в шапке. Для 'all'/'moves' считает бейдж товаров. */
export function goalProgress(cells: number[][], goal: Goal): { done: number; total: number } | null {
  if (goal.kind === 'pick') {
    const left = new Set(cells.flat());
    return { done: goal.types.filter((tp) => !left.has(tp)).length, total: goal.types.length };
  }
  if (goal.kind === 'free') {
    return { done: goal.niches.filter((i) => (cells[i]?.length ?? 0) === 0).length, total: goal.niches.length };
  }
  return null;
}

/**
 * Ряд ниши по её НОМЕРУ СРЕДИ СУЩЕСТВУЮЩИХ. Генератор не знает про дырки формы
 * и отдаёт плотный список, а маска задаёт разрежённую сетку — перевод между
 * ними нужен и на отрисовке, и при раскладке цели.
 */
export function rowOfNiche(i: number, mask: boolean[], cols: number): number {
  let seen = -1;
  for (let pos = 0; pos < mask.length; pos++) {
    if (!mask[pos]) continue;
    seen++;
    if (seen === i) return Math.floor(pos / cols);
  }
  return 0;
}

export function liveRowsForFreeze(
  mask: boolean[], obs: (Obstacle | null)[], cols: number, rows: number,
): number[] {
  const out: number[] = [];
  for (let r = 1; r < rows; r++) {
    let free = 0;
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (mask[i] && !obs[i]) free++;
    }
    if (free >= 2) out.push(r);
  }
  return out;
}

function obstaclePlan(L: number): ObstaclePlan {
  if (L < 6) return NO_OBSTACLES;
  return OBSTACLE_PLANS[(L - 6) % OBSTACLE_PLANS.length];
}

export function levelCfg(L: number, poolSize: number, narrow = false) {
  const { cols, rows } = gridFor(L, narrow);
  const mask = shapeFor(L, cols, rows);
  // ⚠️ Всё дальше считается по СУЩЕСТВУЮЩИМ нишам, а не по габариту доски:
  // иначе фигура с дырками получит столько же товаров, сколько полный прямоугольник.
  const slots = mask.filter(Boolean).length;
  const typeCeiling = slots - 2 - obstaclePlan(L).blocked - obstaclePlan(L).locked;                                 // ≥2 пустых ячейки → всегда решаемо
  const types = Math.min(poolSize, typeCeiling, 4 + Math.floor(L / 2));   // 4 → растёт, выше 7 на больших досках
  // ⚠️ ПУСТЫЕ ЯЧЕЙКИ — ДОЛЕЙ ДОСКИ, А НЕ АБСОЛЮТНЫМ ЧИСЛОМ.
  // Было `6 - ...`: на поле 3×3 это оставляло шесть свободных из девяти — занято три
  // ячейки, две трети поля пустуют, и первый уровень решался без единой мысли.
  // Репорт Вали 12.08 дословно: «даже не все слоты заняты, это просто, какой-то позор».
  // Одно и то же число на доске 9 и на доске 16 означает разное: 67% пустоты против 37%.
  const obst = obstaclePlan(L);
  /**
   * 🔴 ЗАПЕРТАЯ НИША НЕ СЧИТАЕТСЯ СВОБОДНОЙ. Решаемость держится на том, что
   * свободных ниш минимум две — но ниша под замком манёвра не даёт. Значит
   * запертые надо ВЫЧЕСТЬ из ёмкости и добавить к запасу, иначе уровень с
   * препятствиями окажется теснее, чем задумано, и может стать нерешаемым.
   */
  const shut = obst.blocked + obst.locked;
  const usable = slots - shut;
  let spares = Math.max(2, Math.ceil(usable * 0.34) - Math.floor((L - 1) / 4));
  spares = Math.max(2, Math.min(spares, usable - types));
  /**
   * ЛИМИТ ХОДОВ — ТОЛЬКО ТАМ, ГДЕ ОН ЦЕЛЬ.
   *
   * Формула прежняя (с L9, тем туже, чем дальше), но включается лишь когда план
   * уровня назвал целью `moves`. Раньше лимит стоял на КАЖДОМ уровне с девятого
   * и нигде не был назван — человек узнавал о нём из экрана провала.
   * `moveLimit > 0` теперь ровно и означает «цель этого уровня — ходы».
   */
  const goal = goalPlan(L);
  const over = Math.max(0, L - 8);
  const moveLimit = goal.kind === 'moves' && over > 0 ? Math.max(types * 2, types * 3 - over) : 0;
  return { types, spares, moveLimit, cols, rows, slots, mask, obst, usable, goal };
}

function threeSame(cell: number[]): boolean { return cell.length === 3 && cell[0] === cell[1] && cell[1] === cell[2]; }
function hasPair(cell: number[]): boolean {
  const c: Record<number, number> = {}; for (const t of cell) { c[t] = (c[t] || 0) + 1; if (c[t] === 2) return true; }
  return false;
}

// Раздать по 3 каждого выбранного типа в (slots−spares) ячеек, ≤3 в ячейке, без готовых троек.
// Всё ВИДИМО — full-information сортировка (не скрытые стопки).
function generate(pool: number[], types: number, spares: number, slots: number): number[][] {
  const chosen = shuffle(pool).slice(0, types);
  const items: number[] = [];
  chosen.forEach((tp) => { for (let k = 0; k < CAP; k++) items.push(tp); });
  const used = Math.max(types, slots - spares);
  let cells: number[][];
  let guard = 0;
  do {
    const sh = shuffle(items);
    cells = Array.from({ length: slots }, () => [] as number[]);
    let ci = 0;
    for (const it of sh) {
      for (let tries = 0; tries < used; tries++) {
        const c = ci % used; ci++;
        if (cells[c].length < CAP) { cells[c].push(it); break; }
      }
    }
    cells = shuffle(cells);
    guard++;
  } while (cells.some(threeSame) && guard < 80);
  return cells;
}

export default function GoodsSortGame() {
  const { colors } = useTheme();
  const { profile } = useProfile();
  /** Стиль шкафа берётся от профиля; незнакомый — берёза. */
  const shelfStyle: ShelfStyle = SHELF_BY_PROFILE[profile?.id ?? 'free'] ?? 'birch';
  const { t, language } = useLanguage();
  const router = useRouter();
  const { width, height } = useWindowDimensions();

  const { isPreset, autostart } = useGamePreset();
  const chainNext = shouldChainNextLevel(useGameMode());
  const lvl = usePersistentLevel('goods_sort');   // персист достигнутого уровня (раньше сбрасывался на 1)
  const [phase, setPhase] = useState<GamePhase>('config')   // описание переехало в сворачиваемый блок «Об игре» (GameAbout);
  const [setKey, setSetKey] = useState('drinks');
  const poolRef = useRef<number[]>(GOOD_SETS[0].pool);
  useEffect(() => { poolRef.current = (GOOD_SETS.find((s) => s.key === setKey) || GOOD_SETS[0]).pool; }, [setKey]);

  const [level, setLevel] = useState(1);
  const [levelBanner, setLevelBanner] = useState<number | null>(null);
  // Сортировка в зарядке тоже двигает общую лесенку: вход через wu=1 не должен
  // подменять уже достигнутый уровень временной единицей.
  useEffect(() => { if (lvl.loaded) setLevel(lvl.level); }, [lvl.loaded, lvl.level]);
  const [cells, setCells] = useState<number[][]>([]);
  const [sel, setSel] = useState<Sel>(null);
  const [cleared, setCleared] = useState(0);
  const [moves, setMoves] = useState(0);
  const [score, setScore] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const scoreRef = useRef(0); const movesRef = useRef(0);
  /** Узкий экран (телефон): сетка ограничивается тремя колонками. 560px — граница,
   *  за которой четвёртая колонка перестаёт душить товар. */
  const narrowRef = useRef(false);
  const gridRef = useRef({ cols: 3, rows: 3, slots: 9 });
  narrowRef.current = width < 560;        // текущая доска — для логики каскада/reshuffle
  const [gridDim, setGridDim] = useState({ cols: 3, rows: 3 });  // для рендера полок
  /** Маска ниш: true — ниша есть, false — в этом месте доски дырка (форма уровня). */
  const [mask, setMask] = useState<boolean[]>(() => Array(9).fill(true));
  /** Препятствие на нише: заперта, под замком по ходам, либо ничего. */
  const [obstacles, setObstacles] = useState<Obstacle[]>([]);
  /** Накрытые товары: ключ «ниша:позиция». Виден силуэт, не видно что это. */
  const [covered, setCovered] = useState<Set<string>>(() => new Set());
  /** Примёрзший ряд: индекс ряда и тип, тройку которого надо собрать, чтобы растопить. */
  const [frozen, setFrozen] = useState<{ row: number; type: number } | null>(null);
  const [goal, setGoal] = useState<Goal>({ kind: 'all' });
  const goalRef = useRef<Goal>({ kind: 'all' });
  const { popups, spawn } = useScorePopups();

  // Справка правил уровня: только в личной игре (в зарядке-пресете бейдж скрыт).
  // level — живой стейт партии (растёт по ходу сессии), а не lvl.level.
  const levelRules = useLevelRules('goods_sort', level, GS_RULES, phase === 'playing' && !isPreset);

  const loadLevel = (L: number) => {
    const cfg = levelCfg(L, poolRef.current.length, narrowRef.current);
    gridRef.current = { cols: cfg.cols, rows: cfg.rows, slots: cfg.slots };
    setGridDim({ cols: cfg.cols, rows: cfg.rows });
    setMask(cfg.mask);
    const built = generate(poolRef.current, cfg.types, cfg.spares, cfg.slots);
    setCells(built);
    /**
     * Препятствия ставим ПОСЛЕ раскладки и только на подходящие ниши:
     * запирать можно лишь ПУСТУЮ нишу, иначе товары внутри окажутся
     * недостижимы и уровень станет нерешаемым.
     */
    const obs: Obstacle[] = Array(cfg.slots).fill(null);
    const empties = built.map((c, i) => (c.length === 0 ? i : -1)).filter((i) => i >= 0);
    const pick = shuffle(empties);
    let at = 0;
    for (let k = 0; k < cfg.obst.blocked && at < pick.length; k++, at++) obs[pick[at]] = { kind: 'blocked' };
    for (let k = 0; k < cfg.obst.locked && at < pick.length; k++, at++) obs[pick[at]] = { kind: 'locked', movesLeft: 5 + k * 3 };
    setObstacles(obs);

    // Накрываем товары: только те, что лежат НЕ последними в нише — иначе
    // человек не сможет даже взять его, не зная, что берёт.
    const cov = new Set<string>();
    const spots: string[] = [];
    built.forEach((c, i) => c.forEach((_, j) => { if (j < c.length - 1) spots.push(`${i}:${j}`); }));
    shuffle(spots).slice(0, cfg.obst.covered).forEach((k) => cov.add(k));
    setCovered(cov);

    let frozenRow = -1;
    /**
     * Примёрзший ряд: тип, тройка которого действительно есть на доске.
     *
     * Ряд берём не любой, а ЖИВОЙ: в нём должно остаться минимум две открытые
     * ниши (маска не вырезала, замок не занял). Иначе заморозка либо ничего не
     * запрещает — ряд и так дыры, — либо ложится поверх замка: два значка в
     * одной нише и двойной запрет там, где хватило бы одного. В таблице планов
     * заморозка сейчас нигде не встречается с замками, но правку планов это
     * переживёт, а без проверки — нет. Видно на форсированной раскладке
     * blocked 2 + locked 1 + frozenRow, 19.08.2026.
     */
    if (cfg.obst.frozenRow) {
      const present = Array.from(new Set(built.flat()));
      const type = present[Math.floor(Math.random() * present.length)] ?? -1;
      const live = liveRowsForFreeze(cfg.mask, obs, cfg.cols, cfg.rows);
      const row = live.length ? live[Math.floor(Math.random() * live.length)] : -1;
      if (type >= 0 && row >= 0) { setFrozen({ row, type }); frozenRow = row; }
      else setFrozen(null);
    } else setFrozen(null);

    /**
     * Цель раскладываем ПОСЛЕДНЕЙ — ей нужно видеть и раздачу, и препятствия.
     *
     * `pick`: называем не все типы, иначе цель вырождается в «убрать всё».
     * `free`: метим только те ниши, из которых МОЖНО выложить — не запертые, не
     * примёрзшие, и не больше, чем есть пустых ниш минус одна. В нише максимум
     * три товара, пустая ниша вмещает ровно три — значит на каждую помеченную
     * заведомо найдётся куда переложить, и одна ниша остаётся на манёвр.
     */
    const plan = cfg.goal;
    let g: Goal = { kind: 'all' };
    if (plan.kind === 'moves' && cfg.moveLimit > 0) {
      g = { kind: 'moves', limit: cfg.moveLimit };
    } else if (plan.kind === 'pick') {
      const present = shuffle(Array.from(new Set(built.flat())));
      const n = Math.max(1, Math.min(plan.count, present.length - 1));
      if (n >= 1 && present.length > n) g = { kind: 'pick', types: present.slice(0, n) };
    } else if (plan.kind === 'free') {
      const movable = built
        .map((c, i) => (c.length > 0 && !obs[i] && rowOfNiche(i, cfg.mask, cfg.cols) !== frozenRow ? i : -1))
        .filter((i) => i >= 0);
      const n = Math.min(plan.count, Math.max(1, cfg.spares - 1), movable.length);
      if (n >= 1) g = { kind: 'free', niches: shuffle(movable).slice(0, n) };
    }
    setGoal(g); goalRef.current = g;

    setSel(null); setMoves(0); movesRef.current = 0;
    setStartTime(Date.now()); setElapsed(0);
  };

  const startGame = () => {
    if (!lvl.loaded) return;
    const startLvl = lvl.level;
    setCleared(0); setScore(0); scoreRef.current = 0; setLevelBanner(null);
    setLevel(startLvl);
    loadLevel(startLvl);
    setPhase('playing');   // спокойный режим — без таймера (как в оригинале «собери всё»)
  };

  // Ждём восстановленный уровень перед auto-start из зарядки.
  useAutostart(autostart && lvl.loaded, startGame);

  const advanceLevel = () => {
    const cfg = levelCfg(level, poolRef.current.length, narrowRef.current);
    if (cfg.moveLimit > 0 && movesRef.current > cfg.moveLimit) {
      // Превысил лимит ходов — уровень не засчитан.
      // ⚠️ В ЗАРЯДКЕ ПЕРЕЗАПУСКАТЬ НЕЛЬЗЯ. Сессия при провале не сохраняется, а зарядка
      // двигается именно по сохранённой сессии — значит человек застрял бы на этом шаге
      // навсегда, переигрывая один уровень. Поэтому в зарядке провал ЗАВЕРШАЕТ шаг:
      // пишем сессию с passed:false, и зарядка уходит к следующей игре.
      setLevelBanner(-1);
      if (!chainNext) {
        saveSession({
          passed: false,
          game_type: 'goods_sort', score: scoreRef.current, time_seconds: (Date.now() - startTime) / 1000,
          difficulty: level < 5 ? 'easy' : level < 10 ? 'medium' : 'hard', mode: `lvl${level}`, errors: 0,
          details: { moves: movesRef.current, level, move_limit_exceeded: true },
        }).catch((e) => console.error(e));
        return;
      }
      // Авто-рестарта на провале нет (канон v1.154): человек сам жмёт «Ещё раз»,
      // успев разобрать, где перебрал ходы. Кнопку рисует общая карточка.
      return;
    }
    hapticSuccess();
    const done = level;
    const finalTime = (Date.now() - startTime) / 1000;
    scoreRef.current += Math.max(50, 300 - movesRef.current * 4);
    setScore(scoreRef.current);
    saveSession({
      passed: true,   // сессия пишется только когда уровень собран
      game_type: 'goods_sort', score: scoreRef.current, time_seconds: finalTime,
      difficulty: done < 5 ? 'easy' : done < 10 ? 'medium' : 'hard', mode: `lvl${done}`, errors: 0,
      details: { moves: movesRef.current, level: done },
    }).catch((e) => console.error(e));
    const next = done + 1;
    setLevel(next);
    // ⚠️ reach, а НЕ setLevel: прямая установка срезала бы потолок, если человек
    // вернулся с тропинки на пройденный уровень. pick следом держит цепочку на
    // переигровке — иначе после уровня 3 при рекорде 20 игра прыгнула бы на 20.
    lvl.reach(next);
    lvl.pick(next);   // выше потолка pick сам обнуляется — прыжка не будет
    // Итог показывает общая карточка ПОВЕРХ полок — разложенный товар остаётся
    // на экране. Она же решает, запускать ли следующий уровень: своего таймера
    // здесь больше нет, он спорил с таймером зарядки (репорт Вали на v1.193.0
    // «Сортировка товаров выдаёт второй уровень и вылетает в вечерней зарядке»).
    setLevelBanner(done);
  };

  // Переместить КОНКРЕТНЫЙ товар (fromCell, fromIdx) в toCell, если там есть место; затем собрать тройки.
/** Ряд, в котором лежит ниша с плотным индексом i (нумерация по существующим). */
  const rowOfCell = (i: number): number => {
    return rowOfNiche(i, mask, gridDim.cols);
  };

  /** Соседи ниши по доске — по ним снимается «закрытая ниша». */
  const neighboursOf = (i: number): number[] => {
    const dense: number[] = [];
    mask.forEach((on, pos) => { if (on) dense.push(pos); });
    const pos = dense[i];
    if (pos === undefined) return [];
    const r = Math.floor(pos / gridDim.cols), c = pos % gridDim.cols;
    const out: number[] = [];
    [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(([dr, dc]) => {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= gridDim.rows || nc >= gridDim.cols) return;
      const np = nr * gridDim.cols + nc;
      const idx = dense.indexOf(np);
      if (idx >= 0) out.push(idx);
    });
    return out;
  };

  /**
   * Можно ли трогать нишу. Одна проверка на всё: и на «взять отсюда», и на
   * «положить сюда». Держать это в одном месте обязательно — иначе однажды
   * запрет поставят только на одну сторону, и препятствие станет полупрозрачным.
   */
  const cellUsable = (i: number): boolean => {
    if (obstacles[i]) return false;
    if (frozen && rowOfCell(i) === frozen.row) return false;
    return true;
  };

  const moveItem = (fromCell: number, fromIdx: number, toCell: number) => {
    if (fromCell === toCell) { setSel(null); return; }
    const src = cells[fromCell];
    if (!src || fromIdx < 0 || fromIdx >= src.length) { setSel(null); return; }
    if (cells[toCell].length >= CAP) { setSel(null); return; }   // нет места
    // Препятствие запрещает и брать, и класть — проверка одна на обе стороны.
    if (!cellUsable(fromCell) || !cellUsable(toCell)) { setSel(null); hapticTap(); return; }
    const ns = cells.map((c) => [...c]);
    const [item] = ns[fromCell].splice(fromIdx, 1);
    ns[toCell].push(item);
    movesRef.current += 1; setMoves(movesRef.current);
    // каскад: любая ячейка с 3 одинаковыми → собрать (+50). Спокойно, без таймед-комбо.
    let clearedNow = 0; let again = true;
    const clearedTypes: number[] = [];
    while (again) {
      again = false;
      for (let i = 0; i < gridRef.current.slots; i++) {
        if (threeSame(ns[i])) { clearedTypes.push(ns[i][0]); ns[i] = []; clearedNow += 1; scoreRef.current += 50; again = true; }
      }
    }
    /**
     * СНЯТИЕ ПРЕПЯТСТВИЙ — после каскада, потому что снимает именно СБОР тройки.
     *   · закрытая ниша открывается, если тройка собралась по соседству;
     *   · замок тикает каждый ход и открывается сам;
     *   · примёрзший ряд оттаивает, когда собрана тройка нужного типа;
     *   · накрытые товары в опустевшей нише больше не прячутся — прятать нечего.
     */
    if (obstacles.length) {
      const next = obstacles.slice();
      let changed = false;
      obstacles.forEach((o, i) => {
        if (!o) return;
        if (o.kind === 'locked') {
          const left = o.movesLeft - 1;
          next[i] = left <= 0 ? null : { kind: 'locked', movesLeft: left };
          changed = true;
        } else if (o.kind === 'blocked' && clearedTypes.length) {
          if (neighboursOf(i).some((n) => ns[n].length === 0 && cells[n].length > 0)) { next[i] = null; changed = true; }
        }
      });
      if (changed) setObstacles(next);
    }
    if (frozen && clearedTypes.includes(frozen.type)) setFrozen(null);
    if (covered.size) {
      const cov = new Set(covered);
      let changed = false;
      ns.forEach((c, i) => { if (c.length === 0) { for (let j = 0; j < CAP; j++) if (cov.delete(`${i}:${j}`)) changed = true; } });
      if (changed) setCovered(cov);
    }

    setCells(ns); setSel(null); setScore(scoreRef.current);
    if (clearedNow > 0) { setCleared((c) => c + clearedNow); hapticSuccess(); if (clearedNow > 1) sndCombo(clearedNow); spawn(width / 2 - 24, 150, '+' + clearedNow * 50, '#fde047'); }
    else hapticTap();
    /**
     * 🔴 УРОВЕНЬ КОНЧАЕТСЯ ПО ЦЕЛИ, А НЕ ПО ПУСТОЙ ДОСКЕ. При цели `pick` на
     * полках ещё лежит товар, и это НЕ незаконченный уровень — это и есть
     * смысл цели: играть адресно, а не выметать всё подряд.
     */
    if (goalMet(ns, goalRef.current)) setTimeout(advanceLevel, 350);
  };

  const handleItemTap = (cellI: number, idx: number) => {
    if (phase !== 'playing') return;
    if (!sel) { setSel({ cell: cellI, idx }); hapticTap(); return; }
    if (sel.cell === cellI) { setSel(sel.idx === idx ? null : { cell: cellI, idx }); return; }   // отмена / перевыбор
    moveItem(sel.cell, sel.idx, cellI);
  };
  const handleCellTap = (cellI: number) => {   // тап по свободному месту ячейки = переложить выбранное сюда
    if (phase !== 'playing' || !sel) return;
    if (sel.cell === cellI) { setSel(null); return; }
    moveItem(sel.cell, sel.idx, cellI);
  };

  // Бустер «перемешать» (как в оригинале) — переразложить оставшиеся товары, подстраховка от тупика.
  /**
   * 🔴 ПЕРЕМЕШАТЬ НЕ ИМЕЕТ ПРАВА КЛАСТЬ ТОВАР ТУДА, ОТКУДА ЕГО НЕ ДОСТАТЬ.
   *
   * Раньше тасовка гоняла товары по ВСЕМ нишам подряд — она была написана
   * задолго до препятствий и про них не знает. С препятствиями это стало
   * тупиком: товар мог улететь в запертую нишу, а тройка примёрзшего типа —
   * в примёрзший ряд, где её не тронуть, пока не соберёшь ту самую тройку.
   * Запертая ниша открывается от тройки ПО СОСЕДСТВУ; если соседям нечем
   * очиститься, уровень встаёт намертво, и кнопка «перемешать» окажется тем,
   * что его сломало.
   *
   * Поэтому раскладываем только по ДОСТУПНЫМ нишам. Их всегда хватает: ёмкость
   * уже посчитана с вычетом запертых (`usable`), а товаров на доске не больше,
   * чем `types * 3 ≤ (usable - 2) * 3`.
   */
  const reshuffle = () => {
    const items = cells.flat();
    if (items.length === 0) return;
    const slots = gridRef.current.slots;
    const open: number[] = [];
    for (let i = 0; i < slots; i++) if (cellUsable(i)) open.push(i);
    const dest = open.length * CAP >= items.length ? open : Array.from({ length: slots }, (_, i) => i);
    const used = Math.min(Math.max(1, dest.length - 2), Math.max(1, Math.ceil(items.length / CAP)));
    let ns: number[][]; let guard = 0;
    do {
      const sh = shuffle(items);
      const bins = shuffle(dest).slice(0, Math.max(used, Math.ceil(items.length / CAP)));
      ns = Array.from({ length: slots }, () => [] as number[]);
      let ci = 0;
      for (const it of sh) {
        for (let tr = 0; tr < bins.length; tr++) {
          const c = bins[ci % bins.length]; ci++;
          if (ns[c].length < CAP) { ns[c].push(it); break; }
        }
      }
      guard++;
    } while (ns.some(threeSame) && guard < 60);
    setCells(ns); setSel(null); hapticTap();
  };

  // ── вёрстка ──────────────────────────────────────────────────────────
  const boardW = Math.min(width - 24, 900);   // шире → товары крупнее на десктопе
  const cellW = Math.floor((boardW - 9 * 2 - 9 * (gridDim.cols - 1)) / gridDim.cols);   // cols ячеек-полок в ряд
  // Размер товара ограничен И шириной (cols в ряд), И доступной высотой (rows полок) — тянемся по высоте экрана.
  /**
   * 🔴 ВЫСОТУ ПОД ПОЛКИ МЕРЯЕМ, А НЕ УГАДЫВАЕМ.
   *
   * Репорт тестировщицы 18.08.2026: «Половина банок обрезана… как объяснить
   * словами, не знаю» (со скриншотом). Причина — вот эта строка в прежнем виде:
   * `height - 360`, где 360 это ЗАШИТЫЙ запас на шапку, счётчики и нижнюю
   * панель. Стоит хроме оказаться выше (другой шрифт системы, вырез экрана,
   * две строки счётчиков, клавиатура) — и полок насчитывается больше, чем
   * влезает: нижний ряд уходит за край и режется ровно пополам.
   *
   * Замер честнее любой константы: сколько места контейнер реально дал,
   * столько и делим. До первого onLayout держим прежнюю оценку — один кадр.
   */
  const [fieldH, setFieldH] = useState(0);
  const availH = Math.max(180, fieldH || height - 360);
  /**
   * 🔴 РАЗМЕР ТОВАРА ПОДЧИНЯЕТСЯ ЯЧЕЙКЕ, А НЕ НАОБОРОТ.
   *
   * Репорт тестировщицы 18.08.2026 со скриншотом: «Половина банок обрезана…
   * как объяснить словами, не знаю». Считаем её случай — уровень 8, сетка 4×3,
   * экран 386px:
   *   полка 362px → ячейка 79px
   *   честно в ячейку влезает товар 23px
   *   но стоял пол `Math.max(40, …)` → бралось 40px
   *   три товара = 3×40 + два зазора по 4 = 128px в ячейке 79px
   *   ряд центрирован → по 24px уходит под обрез с КАЖДОЙ стороны
   * Ровно половина банки слева и справа, как она и написала.
   *
   * ⚠️ Пол был поставлен ради попадания пальцем, и намерение верное — но он
   * игнорировал вопрос «а влезут ли три». Минимальный размер, который ломает
   * раскладку, не помогает попасть: по обрезанному товару всё равно не попасть.
   * Поэтому предел снизу остаётся, но НИЖЕ того, что диктует ячейка, а не выше.
   *
   * ⚠️ И ЭТО НЕ ТА ОСЬ, КОТОРУЮ Я ПОЧИНИЛ ПЕРВОЙ. Не увидев скриншота, я решил,
   * что не хватает ВЫСОТЫ, и заменил зашитый запас на замер. Замер оставлен —
   * он честнее константы, — но резало по ширине, и без картинки я этого знать
   * не мог. Отсюда правило: пока скриншот из отчёта нечитаем, диагноз — догадка.
   */
  const CELL_GAP = 2;                        // зазор между товарами в ячейке (styles.cellRow)
  /**
   * 🔴 ТОВАР УЗКИЙ, А ХОЛСТ КВАДРАТНЫЙ — И В ЭТОМ ТЕРЯЛАСЬ ПОЛОВИНА РАЗМЕРА.
   *
   * Замер спрайтов 19.08.2026: бутылка занимает 204×361 в холсте 384×384, то
   * есть 53% ширины и 94% высоты, пропорция 0.57. Почти половина файла —
   * прозрачные поля. Если положить такой файл в КВАДРАТНУЮ ячейку 36×36 с
   * resizeMode="contain", он впишется по меньшей стороне и нарисуется 20×36:
   * видимый товар вдвое меньше того места, что ему дали.
   *
   * В эталоне (Sort Match) товары высокие и узкие, стоят во всю высоту ниши —
   * ровно потому, что ниша тоже высокая. Даём слоту ту же пропорцию, что у
   * самих рисунков: ширина прежняя (три в ряд по-прежнему влезают), высота
   * в 1.7 раза больше. Товар растёт в площади вдвое, ничего не переезжая.
   */
  const ITEM_ASPECT = 0.6;                   // ширина/высота, снято с самих спрайтов
  const fitsInCell = Math.floor((cellW - CELL_GAP * (CAP - 1)) / CAP);
  const fitsInRow = Math.floor((availH / gridDim.rows - 14) * ITEM_ASPECT);
  const itemSize = Math.max(18, Math.min(112, fitsInCell, fitsInRow));
  const itemH = Math.round(itemSize / ITEM_ASPECT);
  /**
   * 🔴 ШКАФ ЗАНИМАЕТ ВСЁ ПОЛЕ, А НЕ ТРЕТЬ ЭКРАНА.
   *
   * Денис 19.08: «у них полки занимают всё поле, у нас треть экрана пустая
   * сверху и снизу». Проверил числом: товар относительно экрана у нас УЖЕ как
   * в эталоне — 9.3% и там, и там. То есть дело не в размере товара, а в том,
   * что три ряда по 70px занимали 210px из 440 доступных.
   *
   * Ниша тянется по доступной высоте, товар остаётся прежним и стоит на дне —
   * ровно как в эталоне, где над предметами есть воздух. Растить сам товар
   * тут нельзя: его ширину держат три штуки в ряд, а не высота экрана.
   */
  const SHELF_GAP = 9, HINT_H = 44, SHELF_PAD = 9;
  const shelfOuter = Math.floor((availH - HINT_H - SHELF_GAP * (gridDim.rows - 1)) / gridDim.rows);
  // Ниша выше товара примерно на четверть — столько воздуха над предметом в
  // эталоне. Вдвое выше = пустая коробка, экран заполняется НЕ этим, а рядами.
  const nicheH = Math.max(itemH + 8, Math.min(Math.round(itemH * 1.25), shelfOuter - SHELF_PAD * 2 - 7));

  // Полка целиком: «Полка 4: кола, кола, пусто» — по этой строке незрячий
  // игрок понимает, где уже есть пара и куда нести третий товар.
  const ru = language === 'ru';
  const cellLabel = (i: number, cell: number[]) =>
    `${t('a11yShelf')} ${i + 1}: ` +
    (cell.length ? cell.map((tp) => goodName(tp, ru)).join(', ') : t('a11yEmpty'));

  /**
   * 🔴 ТРИ ЗВЕЗДЫ НА ПЕРВЫХ ВОСЬМИ УРОВНЯХ БЫЛИ НЕДОСТИЖИМЫ.
   *
   * Было: `moves <= moveLimit * 0.6 ? 3 : 2`, а `moveLimit` до девятого уровня
   * равен НУЛЮ (лимит ходов включается с L9). Ходов всегда хотя бы один, значит
   * условие не выполнялось никогда: человек проходил идеально и получал две
   * звезды. Найдено разбором кода 19.08.2026.
   *
   * Там, где лимита нет, считаем от того же, из чего он потом и строится —
   * `types * 3`: каждой тройке нужно до трёх перекладываний. Это делает
   * оценку сравнимой по обе стороны девятого уровня, а не разрывной.
   *
   * ⚠️ narrowRef обязателен: на телефоне сетка 3×6 (18 ниш), на десктопе 4×4
   * (16), от этого зависит `types`, а значит и порог. Без него шапка показывала
   * один лимит, а провал считался по другому — тот же баг, что и в счётчике.
   */
  const starsFor = (L: number, moves: number): number => {
    const cfg = levelCfg(L, poolRef.current.length, narrowRef.current);
    const reference = cfg.moveLimit > 0 ? cfg.moveLimit : cfg.types * 3;
    return moves <= reference * 0.6 ? 3 : 2;
  };

  const renderCell = (i: number) => {
    const cell = cells[i] || [];
    const isSelCell = sel?.cell === i;
    const close = hasPair(cell);   // 2 одинаковых → подсказка «положи третий»
    const canDrop = !!sel && sel.cell !== i && cell.length < CAP;
    return (
      <ImageBackground key={i}
        /**
         * Фон ниши — вырезанная плитка нарисованного шкафа. resizeMode="stretch",
         * а не "cover": полурейки обязаны остаться ровно по краям, иначе
         * соседние ниши не состыкуются в целые доски.
         */
        source={SHELF_TILES[shelfStyle]}
        resizeMode="stretch"
        style={[styles.cell, {
          width: cellW, height: nicheH,
          borderColor: canDrop ? '#fbbf24' : close ? '#22c55e' : 'transparent',
          borderWidth: canDrop || close ? 3 : 0,
        }]}>
        {/* Полка и товары — соседние кнопки, а не button внутри button.
            На web вложенные TouchableOpacity давали hydration-error и могли
            проглатывать тап при переходе вечерней зарядки через Goods Sort. */}
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => handleCellTap(i)}
          accessibilityRole="button"
          accessibilityLabel={cellLabel(i, cell)}
          accessibilityState={{ selected: isSelCell }}
          style={styles.cellDropTarget}
        />
        {/* Рисуем ТОЛЬКО реальные товары (по центру) — без пустых боксов; пустое место ячейки = куда класть */}
        <View pointerEvents="box-none" style={styles.cellRow}>
          {cell.map((tp, s) => {
            const selected = isSelCell && sel?.idx === s;
            return (
              <TouchableOpacity key={s} activeOpacity={0.7} onPress={() => handleItemTap(i, s)}
                accessibilityRole="button"
                accessibilityLabel={`${goodName(tp, ru)}, ${t('a11yShelf')} ${i + 1}`}
                accessibilityState={{ selected }}
                style={[styles.itemSlot, { width: itemSize, height: itemH }, selected && styles.itemSel]}>
                {covered.has(`${i}:${s}`) ? (
                  /**
                   * НАКРЫТЫЙ ТОВАР: силуэт есть, что именно — не видно.
                   * Рисуем ту же картинку с нулевой яркостью (tintColor) —
                   * форма сохраняется, а значит человек видит, ЧТО там что-то
                   * стоит и какой оно формы, но не какой это товар. Это и есть
                   * неполная информация: надо запомнить, что открылось.
                   */
                  <Image {...a11yDecor} source={GOOD_SPRITES[tp % GOOD_SPRITES.length]}
                    style={{ width: itemSize, height: itemH - 2, tintColor: 'rgba(35,20,8,0.82)' }}
                    resizeMode="contain" />
                ) : (
                  <GoodIcon type={tp} width={itemSize} height={itemH - 2} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/*
          ПРЕПЯТСТВИЯ ПОВЕРХ НИШИ. Затемнение + значок: значок говорит ЧТО это,
          затемнение — что сюда нельзя. Одного значка мало: на беглый взгляд он
          читается как украшение, а не как запрет.
        */}
        {/* Помеченная ниша цели 'free' — флажок в углу. Без метки цель
            «освободить помеченные» превращается в загадку, какие именно. */}
        {goal.kind === 'free' && goal.niches.includes(i) && (
          <View pointerEvents="none" style={styles.goalMark}>
            <Ionicons name="flag" size={Math.min(15, Math.max(11, itemSize / 3))} color="#f97316" />
          </View>
        )}
        {obstacles[i]?.kind === 'blocked' && (
          <View pointerEvents="none" style={styles.obstacle}>
            <Ionicons name="lock-closed" size={Math.min(26, itemSize)} color="#f8e3c4" />
          </View>
        )}
        {obstacles[i]?.kind === 'locked' && (
          <View pointerEvents="none" style={styles.obstacle}>
            <Ionicons name="time" size={Math.min(22, itemSize)} color="#f8e3c4" />
            <Text style={styles.obstacleNum}>{(obstacles[i] as { movesLeft: number }).movesLeft}</Text>
          </View>
        )}
        {frozen && rowOfCell(i) === frozen.row && (
          <View pointerEvents="none" style={[styles.obstacle, styles.frost]}>
            <Ionicons name="snow" size={Math.min(22, itemSize)} color="#e8f6ff" />
          </View>
        )}
      </ImageBackground>
    );
  };

  const renderConfig = () => (
    <ScrollView style={styles.configScroll} contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={GRADIENT as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.configCard}>
        <Ionicons name="basket" size={48} color="#3f2b00" />
        <Text style={styles.configTitle}>{t('goodsSort')}</Text>
        <Text style={styles.configDesc}>{t('goodsSortDesc')}</Text>
      </LinearGradient>
      <GameAbout descriptionKey="goodsSortIntroDesc" benefits={GOODS_BENEFITS} accent={GRADIENT[0]} />

      {/* ВЫБОР ТОВАРОВ — как в оригинале */}
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('goodsSetsLabel')}</Text>
        <View style={styles.setRow}>
          {GOOD_SETS.map((s) => {
            const on = setKey === s.key;
            return (
              <TouchableOpacity
                accessibilityRole="button" key={s.key} activeOpacity={0.85} onPress={() => { setSetKey(s.key); hapticTap(); }}
                style={[styles.setBtn, { borderColor: on ? GRADIENT[0] : colors.border, backgroundColor: on ? '#fff7e0' : colors.card }]}>
                <Ionicons name={s.icon} size={22} color={on ? '#d97706' : colors.textSecondary} />
                <Text style={[styles.setBtnText, { color: on ? '#92600a' : colors.textSecondary }]}>{t('goodsSet_' + s.key)}</Text>
                <View style={styles.setPreview}>
                  {s.pool.slice(0, 4).map((p) => <GoodIcon key={p} type={p} width={18} height={28} />)}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={[styles.optionCard, { backgroundColor: colors.surface, alignItems: 'center' }]}>
        <Text style={[styles.optionLabel, { color: colors.text, fontSize: 18 }]}>{t('goodsLevel')} {level}</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center' }}>
          🛒 {levelCfg(level, poolRef.current.length, narrowRef.current).types}   ·   📦 {levelCfg(level, poolRef.current.length, narrowRef.current).slots - levelCfg(level, poolRef.current.length, narrowRef.current).spares}
        </Text>
        {level > 1 && (
          <TouchableOpacity
            accessibilityRole="button" accessibilityLabel={t('a11yResetLevel')} onPress={() => { setLevel(1); if (!isPreset) lvl.setLevel(1); }} style={{ marginTop: 6 }}>
            <Text style={{ color: colors.text, fontWeight: '700' }}>↺ 1</Text>
          </TouchableOpacity>
        )}
      </View>
      <LevelProgressMap
        gameId="goods_sort"
        currentLevel={level}
        maxLevel={Math.max(15, level, lvl.best)}
        onPickLevel={lvl.pick}
        colors={colors}
        language={language}
      />

      <JuicyButton label={t('start')} icon="play" colors={GRADIENT as [string, string]} tint="#3f2b00" onPress={startGame} style={{ marginTop: 8 }} />
    </ScrollView>
  );

  // игровая фаза — на едином каркасе GameShell: HUD-бейджи в статс-строке, «перемешать» прибит
  // к низу; модалка правил уровня поверх каркаса (паттерн digit-span)
  if (phase === 'playing') {
    const remaining = cells.reduce((s, c) => s + c.length, 0);
    return (
      <View style={{ flex: 1 }}>
        <GameShell
          title={t('goodsSort')}
          onBack={() => goBackOrHome()}
          stats={
            <View style={styles.statsRow}>
              <HudBadge icon="pricetag" label={t('goodsLevel')} value={level} colors={['#fbbf24', '#d97706']} tint="#3f2b00" />
              <HudBadge icon="star" value={score} colors={['#34d399', '#059669']} pop />
              <HudBadge icon="swap-horizontal" value={(() => { const ml = levelCfg(level, poolRef.current.length, narrowRef.current).moveLimit; return ml > 0 ? `${moves}/${ml}` : String(moves); })()} colors={['#94a3b8', '#475569']} />
              <HudBadge icon="cube" value={remaining} colors={['#60a5fa', '#2563eb']} />
              {/* Прогресс цели показываем только для 'pick'/'free': у 'all' его
                  и так видно по счётчику товаров, у 'moves' — по счётчику ходов. */}
              {(() => {
                const gp = goalProgress(cells, goal);
                return gp ? (
                  <HudBadge icon="flag" label={t('goalLabel')} value={`${gp.done}/${gp.total}`}
                    colors={['#fb923c', '#c2410c']} tint="#3f2b00" />
                ) : null;
              })()}
              {!isPreset && <LevelRuleBadge lr={levelRules} color="#d97706" ru={language === 'ru'} />}
            </View>
          }
          toolbar={
            <TouchableOpacity
              accessibilityRole="button" onPress={reshuffle} activeOpacity={0.8} style={[styles.shuffleBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="shuffle" size={18} color="#d97706" />
              <Text style={[styles.shuffleText, { color: colors.text }]}>{t('shuffleBtn')}</Text>
            </TouchableOpacity>
          }
        >
          <View style={styles.fieldCol}
            onLayout={(e) => {
              const h = Math.round(e.nativeEvent.layout.height);
              // Пересчитываем только на заметное изменение: иначе дрожание в 1px
              // гоняет размер товара туда-сюда каждый кадр.
              setFieldH((prev) => (Math.abs(prev - h) > 8 ? h : prev));
            }}>
            {/*
              ЦЕЛЬ НАПИСАНА НАД ДОСКОЙ, А НЕ СПРЯТАНА В ПРАВИЛАХ. До сих пор
              здесь висела общая подсказка «собери три одинаковых» — на сотом
              уровне она уже ничего не сообщает, а вот ЧТО СЕЙЧАС НАДО СДЕЛАТЬ
              не сообщал никто. Первые четыре уровня цель одна и та же (убрать
              всё), поэтому там оставляем правило игры.
            */}
            {level < 5 ? (
              <Text style={[styles.hintText, { color: colors.textSecondary }]}>{t('goodsSortHint')}</Text>
            ) : (
              <View style={styles.goalLine}>
                <Ionicons name="flag" size={13} color="#d97706" />
                <Text style={[styles.goalText, { color: colors.text }]}>
                  {goal.kind === 'pick' ? t('goalPick')
                    : goal.kind === 'free' ? t('goalFree')
                    : goal.kind === 'moves' ? `${t('goalMoves')} ${goal.limit}`
                    : t('goalAll')}
                </Text>
                {goal.kind === 'pick' && goal.types.map((tp) => (
                  <View key={tp} style={styles.goalGood}>
                    <GoodIcon type={tp} width={16} height={26} />
                  </View>
                ))}
              </View>
            )}
            {/*
              🔴 ОДИН ШКАФ, А НЕ СТОПКА ОТДЕЛЬНЫХ ПОЛОК.
              Денис 19.08: «у них пусто между полками нет, у тебя есть». Верно:
              в эталоне это цельный короб с сеткой ниш — ряды разделяет доска
              толщиной в несколько пикселей, а не пустой фон. Отдельные планки с
              воздухом между ними читаются как таблица, а не как мебель.
              Поэтому теперь одна рама на все ряды, внутри — сетка без зазоров
              по вертикали, разделители рисуются самими нишами.
            */}
            <LinearGradient colors={['#f6e3c6', '#e0b98a']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
              style={[styles.cabinet, { width: boardW }]}>
              {Array.from({ length: gridDim.rows }).map((_, row) => (
                <View key={row} style={styles.shelfRow}>
                  {Array.from({ length: gridDim.cols }).map((_, col) => {
                    const pos = row * gridDim.cols + col;
                    /**
                     * Дырка в форме — не ниша, а пустое место шкафа. Рисуем
                     * распорку той же ширины, иначе ряд съезжает и фигура
                     * перестаёт читаться.
                     */
                    if (!mask[pos]) {
                      return <View key={`gap-${pos}`} style={{ width: cellW, height: nicheH }} />;
                    }
                    // Ячейки нумеруются по СУЩЕСТВУЮЩИМ нишам: генератор не знает
                    // про дырки и отдаёт плотный список.
                    let idx = 0;
                    for (let k = 0; k < pos; k++) if (mask[k]) idx++;
                    return renderCell(idx);
                  })}
                </View>
              ))}
            </LinearGradient>
            <ScorePopupLayer popups={popups} />
            {/* Итог — общей карточкой поверх полок. Своя плашка не сохраняла звёзды,
                не считала серию и не тикала глаз-разрядку; всё это живёт в общей.
                ⚠️ levelBanner === -1 означает ПРОВАЛ (перебрал ходы). Считать по нему
                конфиг уровня нельзя — уровня «минус один» не существует, поэтому всюду
                подставляем текущий level. */}
            {levelBanner !== null && (
              <View style={StyleSheet.absoluteFill as any} pointerEvents="box-none">
                <LevelCleared
                  level={levelBanner === -1 ? level : levelBanner}
                  passed={levelBanner !== -1}
                  stars={starsFor(levelBanner === -1 ? level : levelBanner, movesRef.current)}
                  gradient={GRADIENT}
                  colors={colors}
                  language={language}
                  gameId="goods_sort"
                  variant="overlay"
                  onContinue={() => {
                    const target = levelBanner === -1 ? level : levelBanner + 1;
                    setLevelBanner(null);
                    loadLevel(target);
                  }}
                  onStop={() => { setLevelBanner(null); setPhase('config'); }}
                />
              </View>
            )}
          </View>
        </GameShell>
        <LevelRuleModal lr={levelRules} colors={colors} ru={language === 'ru'} />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityRole="button" accessibilityLabel={t('a11yBack')} style={[styles.backBtn, { backgroundColor: colors.surface }]} onPress={() => goBackOrHome()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('goodsSort')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {phase === 'config' && renderConfig()}
      <LevelRuleModal lr={levelRules} colors={colors} ru={language === 'ru'} />
      {phase === 'result' && (
        <GameResult score={score} time={elapsed} errors={0}
          onPlayAgain={() => setPhase('config')} onGoHome={() => goBackOrHome()}
          gradient={GRADIENT as [string, string]} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, justifyContent: 'space-between' },
  backBtn: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '700' },
  configScroll: { flex: 1 },
  configContainer: { padding: 16, gap: 14 },
  configCard: { padding: 24, borderRadius: 16, alignItems: 'center', gap: 8 },
  configTitle: { fontSize: 22, fontWeight: '700', color: '#3f2b00' },
  configDesc: { fontSize: 13, color: '#3f2b00', opacity: 0.85, textAlign: 'center' },
  optionCard: { padding: 16, borderRadius: 12, gap: 10 },
  optionLabel: { fontSize: 14, fontWeight: '600' },
  setRow: { flexDirection: 'row', gap: 8 },
  setBtn: { minHeight: 48, justifyContent: 'center', flex: 1, borderRadius: 16, borderWidth: 2, paddingVertical: 10, paddingHorizontal: 6, alignItems: 'center', gap: 4 },
  setBtnText: { fontSize: 12, fontWeight: '700' },
  setPreview: { flexDirection: 'row', gap: 1, marginTop: 2 },
  fieldCol: { flex: 1, alignSelf: 'stretch', justifyContent: 'center', gap: 8, alignItems: 'center' },
  statsRow: { flexDirection: 'row', gap: 14, flexWrap: 'wrap', justifyContent: 'center' },
  hintText: { fontSize: 12, textAlign: 'center' },
  shuffleBtn: { minHeight: 48, justifyContent: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 18, borderRadius: 16, borderWidth: 1.5, marginTop: 6 },
  shuffleText: { fontSize: 14, fontWeight: '700' },
  /**
   * 🔴 ПОЛКА — ШКАФ С НИШАМИ, А НЕ КОРИЧНЕВАЯ ПОЛОСА.
   *
   * Денис 19.08.2026 показал эталон (Sort Match, 1 млн скачиваний): там каждая
   * ячейка — УГЛУБЛЕНИЕ в светлом дереве, с задней стенкой, боковыми стойками
   * и тенью под товаром. У нас была плоская тёмная планка с чёрной каймой снизу
   * — отсюда и «убого».
   *
   * Что взято из эталона:
   *   · дерево СВЕТЛОЕ и тёплое, а не тёмно-коричневое — товар на нём читается;
   *   · ниша темнее рамы, а не светлее: так она выглядит углублением, а не
   *     наклейкой. Именно эта инверсия и даёт ощущение объёма;
   *   · товар стоит НА ДНЕ ниши (flex-end), а не висит по центру — предметы
   *     подчиняются тяжести, иначе полка читается как таблица;
   *   · тонкая светлая линия по верхнему краю ниши = блик на кромке доски.
   */
  /** Короб целиком: рама шкафа, внутри ряды ниш без пустот между ними. */
  /**
   * 🔴 ГЛУБИНУ ДЕЛАЮТ ТОЛСТЫЕ ДОСКИ, А НЕ ТОНКИЕ ЛИНИИ.
   *
   * Разбор увеличенного скриншота эталона (Денис, 19.08): между нишами идут
   * ПЛАНКИ заметной толщины — светлые, с освещённой верхней гранью и тёмным
   * передним торцом. Это и читается как мебель. Тонкий зазор в 4-6px читается
   * как разлиновка таблицы, сколько его ни крась.
   *
   * Толщина взята долей от ниши: на маленьком экране пропорции сохраняются.
   */
  /**
   * 🔴 ДОСКИ РИСУЕМ САМИ, А КАРТИНКА ДАЁТ ТОЛЬКО НУТРО НИШИ.
   *
   * Первая попытка резала плитку «от центра доски до центра доски», чтобы
   * половинки состыковались в целую. Не сработало, и Денис это увидел сразу:
   * «две доски и расстояние». Причина — рядом оказывались половины РАЗНЫХ
   * досок, снятых из разных мест картинки, с разным светом и с белыми
   * табличками; вместо одной доски выходили две со швом.
   *
   * Теперь в плитке только углубление с боковыми стенками (они и дают
   * глубину), а доски — это ЗАЗОР между нишами, залитый деревом рамы. Одна
   * доска на стык по построению, ни шва, ни второй доски взяться неоткуда.
   */
  cabinet: {
    borderRadius: 14, padding: 9, gap: 9,
    backgroundColor: '#e6c49a',
    borderBottomWidth: 9, borderBottomColor: '#b98a55',
    shadowColor: '#5a3a18', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
  },
  /** Ряд ниш. Между рядами только толщина доски (gap короба), а не фон экрана. */
  shelfRow: { flexDirection: 'row', justifyContent: 'center', gap: 9 },
  /** Слой препятствия: затемнение на всю нишу плюс значок по центру. */
  goalLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, flexWrap: 'wrap', paddingHorizontal: 12, marginBottom: 2 },
  goalText: { fontSize: 13, fontWeight: '700' },
  goalGood: { backgroundColor: 'rgba(217,119,6,0.14)', borderRadius: 6, paddingHorizontal: 3, paddingVertical: 1 },
  goalMark: { position: 'absolute', top: 3, right: 3, zIndex: 3 },
  obstacle: {
    position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
    alignItems: 'center', justifyContent: 'center', gap: 2,
    backgroundColor: 'rgba(28,16,6,0.62)',
  },
  /** Иней — холодный оттенок вместо тёплого, чтобы не путать с замком. */
  frost: { backgroundColor: 'rgba(120,170,205,0.45)' },
  obstacleNum: { color: '#f8e3c4', fontSize: 13, fontWeight: '800' },
  cell: {
    borderRadius: 4,
    justifyContent: 'flex-end', alignItems: 'center',
    overflow: 'hidden',                          // тень товара не вылезает из ниши
    /**
     * Запасной цвет на время загрузки картинки. Без него первый кадр — дыры
     * цветом экрана на месте ниш; на медленной сети это видно. Тон взят из
     * середины берёзовой плитки, чтобы подмена не бросалась в глаза.
     */
    backgroundColor: '#a9784a',
  },
  cellDropTarget: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderRadius: 7 },
  cellRow: { zIndex: 1, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 2, paddingBottom: 3 },
  itemSlot: { justifyContent: 'flex-end', alignItems: 'center', borderRadius: 6 },
  itemSel: { backgroundColor: '#fff2c2', borderWidth: 2, borderColor: '#f7971e', transform: [{ translateY: -4 }] },
});
