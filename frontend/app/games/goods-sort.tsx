/* psygames-game-goods-sort · VER 2 · 27.08.2026 */
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, useWindowDimensions, ScrollView, Image, ImageBackground, Animated, Easing, PanResponder, DimensionValue,
} from 'react-native';
import {
  SafeAreaView,
} from 'react-native-safe-area-context';
import {
  useRouter,
} from 'expo-router';
import {
  goBackOrHome,
} from '@/src/utils/nav';
import {
  Ionicons,
} from '@expo/vector-icons';
import {
  LinearGradient,
} from 'expo-linear-gradient';
import {
  useTheme,
} from '@/src/contexts/ThemeContext';
import {
  useLanguage,
} from '@/src/contexts/LanguageContext';
import {
  saveSession,
} from '@/src/services/api';
import GameResult from '@/src/components/GameResult';
import GameAbout from '@/src/components/GameAbout';
import GameShell, { type HudItem, type ModItem } from '@/src/components/GameShell';
import GameSetupBar, { SETUP_BAR_SPACE } from '@/src/components/GameSetupBar';
import {
  minMoves,
} from '@/src/services/goodsSortMinMoves';
import {
  dropPoint,
} from '@/src/services/dragDrop';
import Cracks from '@/src/components/juice/Cracks';
import {
  GameAuxAction, GameAuxBar,
} from '@/src/components/GameAuxAction';
import LevelCleared from '@/src/components/LevelCleared';
import LevelProgressMap from '@/src/components/LevelProgressMap';
import {
  useGamePreset, useAutostartWhenReady,
} from '@/src/hooks/useGamePreset';
import {
  useGameMode, shouldChainNextLevel,
} from '@/src/hooks/useGameMode';
import {
  usePersistentLevel,
} from '@/src/hooks/usePersistentLevel';
import {
  ScorePopupLayer, useScorePopups, hapticTap, hapticSuccess,
} from '@/src/components/juice';
import {
  sndCombo, sndPlace, sndMatch, sndWrong,
} from '@/src/services/feedback';
import {
  useCalmHush,
} from '@/src/hooks/useCalmHush';
import {
  useMoveHistory,
} from '@/src/hooks/useMoveHistory';
import {
  useReducedMotion,
} from '@/src/hooks/useReducedMotion';
import {
  useLevelRules, LevelRuleBadge, LevelRuleModal, levelRuleText,
} from '@/src/components/LevelRules';
import {
  a11yDecor,
} from '@/src/services/a11y';
import {
  useProfile,
} from '@/src/contexts/ProfileContext';
import {
  gameNow,
} from '@/src/services/gamePause';
import {
  saveResume, clearResume,
} from '@/src/services/resume';
import {
  useResumeBoot,
} from '@/src/hooks/useResumeBoot';
import {
  HELP_CORNER_SPACE,
} from '@/src/components/GameHelpOverlay';

// v1.112.0: правила-по-уровням объясняются явно (аудит «молчаливых механик»)
/**
 * 🔴 ПРАВИЛА, РАЗДАЧА, ЦЕЛИ И РАСКЛАДКА ЖИВУТ В ЛИСТЕ `core/level`, НЕ ЗДЕСЬ.
 *
 * Замер 06.09.2026: `require` этого экрана в пробе — 3298 мс и 845 модулей
 * react-native/expo, `require` листа — 14 мс и ни одного. Тридцать четыре гейта
 * платили первую цену ради второй, потому что вся арифметика уровня лежала в
 * одном файле с вёрсткой, картинками и звуком.
 *
 * Имена ре-экспортируются НАМЕРЕННО: гейты звали их отсюда, и обрывать всех
 * разом значило бы переписать тридцать четыре файла одним коммитом. Новым
 * пробам брать из `@/src/games/goods-sort/core/level` — там нет экрана.
 */
import {
  CAP, CAP_MAX, CAP_MIN, CAP_ONE, CLEAR_SCORE, EMPTY_HIDDEN_STATS, GOODS_BENEFITS, GOOD_ONBOARD_H, GOOD_ONBOARD_W, GOOD_SETS, GOOD_SETS_KEYS, GOOD_SET_POOL_SIZE, GRADIENT, GS_GAME_ID, GS_RESUME_DEBOUNCE_MS, GS_RESUME_V, GS_RULES, HIDDEN_FROM, HINTS_PER_LEVEL, JOKER_FROM, MIXED_CAP_FROM, MONO_FROM, MOVE_SHIFT_EVERY, MOVING_FROM, PAIR_HINT_UNTIL, REF_PER_TYPE, SET_COLS, SHAPES, SHUFFLES_PER_LEVEL, SINGLE_CAP_FROM, THUMBS_PER_CARD, TYPES_ON_BOARD_MAX, WARM_FAMILY, WIDEST_POOL, capsFor, capsForBoard, clampGoalToLevel, clampGoalToRule, findHint, goalMet, goalPlan, goalProgress, goodName, goodSetForProfile, goodsHasSomethingToLose, gridFor, gsLayout, gsRulesForLevel, hasPair, hiddenInfo, isNarrow, hideDeepSpots, itemAtX, jokerNiches, jokersForBoard, levelCfg, liveRowsForFreeze, monochromeLevel, moveReference, movesExhausted, movingNiches, nicheAtPoint, nicheRect, nicheShift, pairHintVisible, placementOk, poolBitesAt, poolForLevel, provenUnsolvable, removeTriple, revealUncovered, rowOfNiche, scoreForClears, sessionDetails, setAvailable, setThumbBox, shelfForProfile, setUnlockLevel, shapeFor, shiftCoveredAfterTake, solvableStrict, starsForMoves, strictPlacement, targetSlots, tripleIn, typeBudget, dealBoard, generate, permuteCells, restoreGoodsParty, setRows, shuffle, snapshotGoodsParty,
} from '@/src/games/goods-sort/core/level';
import type {
  GoodsLiveParty, GoodsRestored, GoodsResume, ShelfStyle, BoardGeom, GamePhase, Goal, GsLayout, HiddenRunStats, HintMove, Obstacle, Sel, Snapshot,
} from '@/src/games/goods-sort/core/level';

export {
  CAP_MAX, CAP_MIN, CAP_ONE, CLEAR_SCORE, EMPTY_HIDDEN_STATS, GOOD_ONBOARD_H, GOOD_ONBOARD_W,
  GOOD_SETS, GOOD_SETS_KEYS, GOOD_SET_POOL_SIZE, GS_GAME_ID, GS_RESUME_V, GS_RULES,
  HIDDEN_FROM, JOKER_FROM, MIXED_CAP_FROM, MONO_FROM, MOVE_SHIFT_EVERY, MOVING_FROM,
  PAIR_HINT_UNTIL, REF_PER_TYPE, SET_COLS, SHAPES, SINGLE_CAP_FROM, THUMBS_PER_CARD,
  TYPES_ON_BOARD_MAX, WARM_FAMILY, WIDEST_POOL, capsFor, capsForBoard, clampGoalToLevel,
  clampGoalToRule, findHint, goalMet, goalPlan, goalProgress, goodSetForProfile,
  goodsHasSomethingToLose, gridFor, gsLayout, gsRulesForLevel, hiddenInfo, hideDeepSpots,
  itemAtX, jokerNiches, jokersForBoard, levelCfg, liveRowsForFreeze, monochromeLevel,
  moveReference, movesExhausted, movingNiches, nicheAtPoint, nicheRect, nicheShift,
  pairHintVisible, placementOk, poolBitesAt, poolForLevel, provenUnsolvable, removeTriple,
  revealUncovered, rowOfNiche, scoreForClears, sessionDetails, setAvailable, setThumbBox,
  setUnlockLevel, shapeFor, shiftCoveredAfterTake, solvableStrict, starsForMoves,
  strictPlacement, targetSlots, tripleIn, typeBudget,
  dealBoard, generate, permuteCells, restoreGoodsParty, setRows, snapshotGoodsParty,
};
export type { BoardGeom, GamePhase, Goal, GsLayout, HiddenRunStats, HintMove, Obstacle, Snapshot, GoodsLiveParty, GoodsRestored, GoodsResume };

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
  require('../../assets/images/goods/good23.webp'),  // похожие: молоко синее
  require('../../assets/images/goods/good24.webp'),  // похожие: молоко бледное
  require('../../assets/images/goods/good25.webp'),  // похожие: кефир
  require('../../assets/images/goods/good26.webp'),  // похожие: ряженка
  require('../../assets/images/goods/good27.webp'),  // похожие: питьевой йогурт
  require('../../assets/images/goods/good28.webp'),  // похожие: топлёное
  require('../../assets/images/goods/good29.webp'),  // похожие: сметана
  require('../../assets/images/goods/good30.webp'),  // похожие: сливки
  require('../../assets/images/goods/good31.webp'),  // похожие: простокваша
  /**
   * ДВЕНАДЦАТЬ НОВЫХ ЗВЕРЯТ (30.08.2026, просьба Дениса: «Валя не любит лисят»).
   * Лиса (good22) из пулов ВЫВЕДЕНА, но файл и индекс оставлены на месте:
   * индексы — это идентификаторы товара в снимке незаконченной партии, и
   * сдвиг ряда превратил бы чужие сохранённые доски в кашу из других предметов.
   * Отрисованы одной сеткой 4×3 (kie, 12 кредитов, лист в _orig/), нарезаны и
   * обрезаны по границе непрозрачного — как остальные спрайты набора.
   */
  require('../../assets/images/goods/good32.webp'), // слонёнок
  require('../../assets/images/goods/good33.webp'), // котёнок
  require('../../assets/images/goods/good34.webp'), // корги
  require('../../assets/images/goods/good35.webp'), // панда
  require('../../assets/images/goods/good36.webp'), // совёнок
  require('../../assets/images/goods/good37.webp'), // тигрёнок
  require('../../assets/images/goods/good38.webp'), // осьминожек
  require('../../assets/images/goods/good39.webp'), // ленивец
  require('../../assets/images/goods/good40.webp'), // ёжик
  require('../../assets/images/goods/good41.webp'), // китёнок
  require('../../assets/images/goods/good42.webp'), // лягушонок
  require('../../assets/images/goods/good43.webp'), // динозаврик
];

/* ───────────────── когда набор ОТКРЫВАЕТСЯ (вывод, а не назначение) ─────────────────
 *
 * Решение Дениса 20.08.2026: наборы открываются по прогрессу. Порог не назначен
 * вкусом — он ВЫВЕДЕН из замера самой игры.
 *
 * ЗАМЕР. Число видов товара в партии считается как
 *     types = min(размер пула, потолок доски, typeBudget(L))
 * то есть пул упирается в игру только тогда, когда бюджет уровня его перерастёт.
 * До этого набор из шести видов и набор из тридцати двух дают на доске ОДНО И ТО
 * ЖЕ число видов — они механически неразличимы, разница только в картинках.
 *
 * Отсюда порог: набор открывается на первом уровне, где его пул начинает
 * упираться, — `poolBitesAt(размер пула)`:
 *     «Еда» (6 видов) → уровень 6 · «Напитки» (8) → 10 · «Игрушки» и
 *     «Молочное» (9) → 12.
 * Самый широкий набор («Микс», 32) не упирается никогда: он и ЕСТЬ «сколько
 * уровень позволит», точка отсчёта для всех остальных. Поэтому он открыт с
 * первого уровня — иначе играть было бы нечем.
 *
 * ⚠️ Порог НЕ хранится в наборе числом. Поменяется пул — порог переедет сам,
 * и это ровно то свойство, которое держит гейт: связь «пул → уровень» нельзя
 * разорвать, не уронив проверку.
 *
 * ПОРЯДОК КАРТОЧЕК — по возрастанию порога: открытое сверху, замки ниже.
 */

/* ───────────────── раскладка выбора набора (чистая арифметика) ─────────────────
 *
 * 🔴 ЧТО ЛОМАЛОСЬ (репорт Вали 19.08.2026, сборка 1.206.3): «это что за уродливое
 * перечисление товаров кровь из глаз просто».
 *
 * Замер живой сборки подтвердил дословно. Пять наборов стояли одним рядом, и на
 * телефоне карточка набора получалась 58.8px шириной (390px экран) и 52.8px
 * (360px). Внутрь неё верстался ряд из четырёх миниатюр 18×28 — то есть 75px
 * содержимого в 53-59px карточке. Ряд не ужимался и не обрезался, он ВЫЛЕЗАЛ:
 * на 360px — по 11.1px за каждый край, из-за чего полоска соседней карточки
 * НАКЛАДЫВАЛАСЬ на эту на 14.2px. Пять наборов читались как одна смазанная лента.
 * Названия туда тоже не влезали: «Напитки» 53.5px, «Игрушки» 56px, «Молочное»
 * 63.5px против 52.8px карточки — три подписи из пяти шире своего места.
 *
 * ⚠️ ПОЧЕМУ НЕ «ПРОСТО УМЕНЬШИТЬ ЧИСЛО МИНИАТЮР». Потому что подписи не влезали
 * ТОЖЕ, а слово «Молочное» на 52.8px не ужать: перенести его негде (одно слово),
 * а кегль пришлось бы ронять до нечитаемого. Ряд из пяти на телефоне нежизнеспособен
 * по ширине сам по себе — считать надо было не миниатюры, а карточку.
 *
 * СКОЛЬКО НАДО. Порог взят не на глаз, а замером САМОЙ ИГРЫ: на доске первого
 * уровня при экране 360px товар рисуется в коробке 32×51px — это размер, при
 * котором игра САМА требует различать товары. Витрина набора не имеет права быть
 * мельче: иначе выбирать просят по картинке хуже той, по которой потом играть.
 * Отсюда GOOD_ONBOARD_W/H — пол для миниатюры в выборе.
 *
 * ⚠️ Сравнивать надо КОРОБКИ, а не ширину картинки: спрайты разной пропорции
 * (кола 208×365 = 0.57, мишка 201×251 = 0.80, кефир 140×365 = 0.38), а
 * resizeMode="contain" вписывает картинку в коробку. Если коробка витрины не
 * меньше игровой ПО ОБЕИМ сторонам, то для ЛЮБОЙ пропорции нарисованный размер
 * min(w, h·r) тоже не меньше игрового. Поэтому гейт проверяет коробку — этого
 * достаточно, и не надо разбирать webp-заголовки.
 */

// Названия товаров для скринридера. Держим локально ru/en (как pieceName в
// chess-blind) вместо 23 ключей × 12 языков: игроку важно РАЗЛИЧАТЬ товары,
// а не читать их на родном — при другом языке падаем на английский.

function GoodIcon({ type, width, height }: { type: number; width: DimensionValue; height: DimensionValue }) {
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

/**
 * «?» скрытого товара (§20). Тон коробки — та же глубинная темень, что у
 * силуэта накрытого (rgba(35,20,8,…)): «скрытое» читается одним цветом во всех
 * механиках; знак — сливочный, как значки препятствий (#f8e3c4). Кегль знака
 * считается от коробки, а не зашит: товар на телефоне бывает 18 пикселей, и
 * постоянный кегль вылезал бы за нишу. a11yDecor обязателен — подпись несёт
 * кнопка товара («?», полка N), а не внутренности коробки.
 */
function UnknownGood({ width, height }: { width: number; height: number }) {
  return (
    <View {...a11yDecor} style={[styles.unknownBox, { width, height }]}>
      <Text style={[styles.unknownMark, { fontSize: Math.max(13, Math.round(Math.min(width * 0.62, height * 0.5))) }]}>?</Text>
    </View>
  );
}

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

/*
 * ⚠️ Тип и таблица «профиль → стиль» переехали в лист `core/level` 06.09.2026:
 * это данные, и проверять их надо без загрузки экрана. Здесь остались только
 * сами плитки — они `require` ассетов и уехать не могут.
 */

import {
  makeBoard,
} from '@/src/games/goods-sort/core/board';
import {
  isDeadEnd, hintMove,
} from '@/src/games/goods-sort/core/solver';

// Доска РАСТЁТ с уровнем: L1-7 3×3 (9), L8-11 4×3 (12), L12+ 4×4 (16) → больше типов на верхах.

// Сложность по уровню: больше типов + теснее (меньше пустых ячеек для манёвра) + растущая доска.

/**
 * Маска ниш для уровня. Первый уровень каждого размера — всегда полная доска:
 * человек должен понять правило на простой фигуре, а не разбираться сразу с
 * дыркой посередине.
 */

/**
 * СТРОГАЯ УКЛАДКА — ПРАВИЛО, КОТОРОЕ МЕНЯЕТ МЫШЛЕНИЕ, А НЕ ДАВИТ.
 *
 * 🔴 ЗАЧЕМ. Разбор жанра (19.08.2026) делит механики на две кучи: одни меняют
 * САМО ДЕРЕВО РЕШЕНИЙ, другие лишь повышают цену ошибки. Из нашего набора
 * замок и заморозка — давление: они запрещают ход, но не меняют, о чём думать.
 * А вот правило «класть можно только к ТАКОМУ ЖЕ товару или в ПУСТУЮ нишу» —
 * ровно то, из-за чего сортировка по контейнерам вообще является трудной
 * задачей: появляются тупики, и приходится считать на два-три хода вперёд.
 *
 * ⚠️ НЕ НА ВСЕХ УРОВНЯХ, И ЭТО ГЛАВНОЕ. Под строгой укладкой доска МОЖЕТ зайти
 * в тупик — это её смысл. Поставь правило везде, и половина партий будет
 * кончаться не победой и не честным проигрышем, а «ходов нет». Поэтому оно
 * приходит через уровень по своей таблице, объявляется правилом уровня заранее,
 * а тупик всегда разбирается отменой хода (она бесплатна) или перемешиванием.
 *
 * ⚠️ И ОБЯЗАТЕЛЬНО С ПРОВЕРКОЙ РЕШАЕМОСТИ. Расклад, выданный под строгой
 * укладкой, обязан иметь решение — гейт перебирает его целиком. Перебор здесь
 * посилен именно потому, что правило режет ветвление: почти все ходы незаконны.
 */

/**
 * Уровень с подвижными нишами. Фаза «раз в три, остаток 2» — строгая укладка
 * занимает остаток 0, скрытая информация 1, и три режима не пересекаются ни на
 * одном уровне. Проверяется исполнением в `goods-sort-moving-niche`, а не
 * арифметикой в уме: именно так этот файл уже ошибался с порогами.
 */

/* ───────────────── СКРЫТАЯ ИНФОРМАЦИЯ — шестая механика (§20 плана слияния) ─────────────────
 *
 * Источник: разбор конкурента «Ханойская башня Сорта» (mobirix), §20
 * PSYGAMES_MERGE_PLAN.md. Под верхними товарами ниши стоит «?»: что в глубине —
 * видно только когда снимешь то, что спереди.
 *
 * 🔴 ПОЧЕМУ ЭТО ОТДЕЛЬНАЯ МЕХАНИКА, А НЕ ДЕКОРАЦИЯ. Обычная сортировка
 * ПОЛНОСТЬЮ наблюдаема — весь файл выше на это опирается дословно (см. довод у
 * бесплатной отмены: «все товары на виду, исход хода считается заранее»).
 * Со скрытыми товарами оптимальный план построить нельзя: приходится
 * вскрывать → узнавать → перестраивать. Природа нагрузки меняется с «выполни
 * оптимальный план» на «планируй под неопределённостью и пересматривай» —
 * такого нет ни в одной из шести осей сложности этой игры.
 *
 * ⚠️ РАЗДАЧУ РЕЖИМ НЕ МЕНЯЕТ. §20.5 меряет «цену неопределённости» как
 * разность результата при полной и при скрытой информации на СОПОСТАВИМЫХ
 * досках — доска обязана оставаться той же, меняется только видимость.
 */

/**
 * 🔴 КАКИЕ ПРАВИЛА ДЕЙСТВУЮТ НА ЭТОМ УРОВНЕ.
 *
 * Две механики включаются НЕ подряд: «строгая укладка» и «скрытая информация»
 * идут прореженным ритмом (см. `strictPlacement` и `hiddenInfo`), поэтому мало
 * сравнить номер уровня с `fromLevel` — иначе игра пообещала бы правило там,
 * где механики нет, а значок в шапке горел бы вхолостую.
 *
 * Функция экспортируется РАДИ ГЕЙТА: проверять надо сам отбор, а не наличие
 * нужных слов в исходнике. `goods-sort-hidden-rule.test.ts` гоняет её по
 * уровням и сверяет с самими механиками.
 */

/**
 * Сбор тройки при смешанной ёмкости: ниша на четыре может держать тройку И
 * лишний товар, поэтому проверяем не «в нише ровно три одинаковых», а «в нише
 * ЕСТЬ три одинаковых». Иначе на четырёхместной нише тройка не собиралась бы
 * никогда — самый обидный вид тихой поломки.
 *
 * Возвращает тип, которого набралось три, или null.
 */

/**
 * ЕСТЬ ЛИ У РАСКЛАДА РЕШЕНИЕ ПОД СТРОГОЙ УКЛАДКОЙ.
 *
 * 🔴 ЗАЧЕМ ВООБЩЕ. Обычная гарантия «две свободные ниши» под строгим правилом
 * не работает: свободная ниша не спасает, если положить в неё нужный товар —
 * значит запереть следующий ход. Расклад может быть непроходим, и выдать такой
 * человеку нельзя.
 *
 * ⚠️ ИЩЕМ ЛЮБОЕ РЕШЕНИЕ, А НЕ КРАТЧАЙШЕЕ. Обход в ширину даёт кратчайшее, но
 * замер 19.08.2026 показал: доска на 14 ниш требует больше полумиллиона
 * состояний, и «не нашлось» означало бы «кончился бюджет», а не «нерешаемо».
 * Поиск в глубину с разумным порядком ходов находит решение за сотни узлов —
 * нам нужен именно факт существования.
 *
 * Порядок ходов и есть весь фокус: сначала то, что собирает тройку, потом к
 * такому же товару, потом в пустую нишу. Жадность здесь безопасна — она лишь
 * ускоряет нахождение, а полный откат оставлен.
 */

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
 * Ниша под точкой (x, y), заданной ОТНОСИТЕЛЬНО левого верхнего угла шкафа.
 * Отдаёт ПЛОТНЫЙ индекс — тот самый, которым пронумерованы `cells`, а не
 * позицию в сетке: дырки формы ниш не занимают (см. «Дырка в форме — не ниша»).
 * null — мимо доски или в дырку.
 *
 * ⚠️ Зазор между нишами достаётся ЛЕВОЙ/ВЕРХНЕЙ соседке намеренно. Шов шириной
 * 9px — не промах: человек целил в нишу, а не между ними, и отменять из-за
 * этого весь жест значит наказывать за точность пальца, а не за ошибку в игре.
 */

// Раздать по 3 каждого выбранного типа в (slots−spares) ячеек, ≤3 в ячейке, без готовых троек.

/* ─────────────────────── незаконченная партия ───────────────────────
 *
 * 🔴 ЧТО ЛОМАЛОСЬ (замер 19.08.2026). Склад здесь живёт ВЕСЬ УРОВЕНЬ, а уровней
 * шестьдесят: расклад случайный, препятствия садятся на случайные ниши, цель
 * раскладывается на КОНКРЕТНУЮ доску — по номеру уровня всё это не
 * воспроизвести. С 14-го идёт строгая укладка, с 18-го ниши разной
 * вместимости, на уровнях цели «ходы» партия ещё и ограничена лимитом. Это
 * минуты работы над одной доской. Выход с экрана — промах пальцем по «назад» в
 * шапке или аппаратная «назад» — уводил МОЛЧА и стирал всё: расклад,
 * потраченные ходы, очки, остатки подсказок и перетасовок, ленту отмены. Ни
 * вопроса, ни хранения.
 *
 * ⚠️ ПОЧЕМУ СНИМОК И ПОДЪЁМ — ОБЫЧНЫЕ ФУНКЦИИ, А НЕ КУСОК КОМПОНЕНТА. Рендерера
 * компонентов в зависимостях проекта нет (`testMatch` — только `*.test.ts`), а
 * ломкая здесь АРИФМЕТИКА ОСТАТКОВ: ходов при лимите, подсказок, перетасовок.
 * Ошибись знаком — и выход с экрана превратится в способ получить их бесплатно
 * (вышел, вернулся, лимит целый), причём в исходнике это выглядит совершенно
 * правильно. Вынесено сюда → гоняется исполнением в
 * `src/__tests__/goods-sort-resume.test.ts`.
 *
 * ⚠️ ЧАСЫ ИГРОВЫЕ (`gameNow`), а не настенные: на паузе — окно отзыва, вопрос о
 * выходе — отсчёт стоит. Момент `now` приходит аргументом, поэтому обе стороны,
 * и снимок, и подъём, меряют одними часами.
 */

export default function GoodsSortGame() {
  const { colors } = useTheme();
  const { profile } = useProfile();
  /** Стиль шкафа берётся от профиля; незнакомый — берёза. */
  const shelfStyle: ShelfStyle = shelfForProfile(profile?.id);
  const { t, language } = useLanguage();
  const router = useRouter();
  const { width, height } = useWindowDimensions();

  const { isPreset, autostart, isCalm } = useGamePreset();
  /**
   * Тихий вечер. Вечерний и ночной шаг зарядки задуман как успокоение перед
   * сном; писк на каждое перекладывание делает ровно то же, что делал убранный
   * оттуда отсчёт. Глушение снимается при уходе с экрана само.
   */
  useCalmHush(isCalm);
  const chainNext = shouldChainNextLevel(useGameMode());
  const lvl = usePersistentLevel('goods_sort');   // персист достигнутого уровня (раньше сбрасывался на 1)
  const [phase, setPhase] = useState<GamePhase>('config')   // описание переехало в сворачиваемый блок «Об игре» (GameAbout);
  /**
   * Набор по умолчанию — ПЕРВЫЙ в списке, и он же самый широкий: только он
   * открыт с первого уровня (см. setUnlockLevel). Ставить сюда тематический
   * набор нельзя — на первом уровне он закрыт, и человек упёрся бы в замок,
   * который сам себе и выбрал.
   */
  // Стартовый набор — под профиль: см. `goodSetForProfile`. Игрок волен сменить.
  const [setKey, setSetKey] = useState(() => goodSetForProfile(profile?.id, lvl.best));
  /**
   * Набор поднятой партии. Его не отбирают: пока идёт начатое, карточка своего
   * набора остаётся выбранной и живой, даже если по нынешнему потолку она уже
   * закрыта.
   */
  const [grantedSet, setGrantedSet] = useState<string | null>(null);
  const poolRef = useRef<number[]>(GOOD_SETS[0].pool);
  useEffect(() => { poolRef.current = (GOOD_SETS.find((s) => s.key === setKey) || GOOD_SETS[0]).pool; }, [setKey]);

  const [level, setLevel] = useState(1);
  const [levelBanner, setLevelBanner] = useState<number | null>(null);
  /**
   * ЛИМИТ ХОДОВ ЭТОГО УРОВНЯ — ОДНО ЗНАЧЕНИЕ, ЗАФИКСИРОВАННОЕ ПРИ РАЗДАЧЕ.
   *
   * Раньше его пересчитывали в трёх местах — заново спрашивая `levelCfg` при
   * ЖИВОЙ ширине экрана. Доска при этом раздана один раз: поверни
   * телефон посреди уровня — сетка на экране прежняя, а лимит в шапке другой.
   * Та же дыра открывалась и подъёмом партии: ушёл с телефона, вернулся на
   * планшете — и получил бесплатные ходы. Поэтому лимит теперь берётся оттуда
   * же, откуда доска: из раздачи (`loadLevel`) или из снимка партии.
   */
  const moveLimitRef = useRef(0);
  /** Партия поднята из хранилища — уровень взят из неё, а не из сохранённого потолка. */
  const resumedRef = useRef(false);
  // Сортировка в зарядке тоже двигает общую лесенку: вход через wu=1 не должен
  // подменять уже достигнутый уровень временной единицей.
  /**
   * ⚠️ `resumedRef` ОБЯЗАТЕЛЕН. Хранилище уровня грузится асинхронно, партия —
   * тоже, и порядок не гарантирован. Без флага сохранённый потолок (скажем, 12)
   * приезжал бы ПОВЕРХ поднятого уровня партии (7): доска остаётся седьмого
   * уровня, а строгая укладка, ёмкости ниш и бейдж в шапке считаются по
   * двенадцатому. Молча и наискось.
   */
  useEffect(() => { if (lvl.loaded && !resumedRef.current) setLevel(lvl.level); }, [lvl.loaded, lvl.level]);
  const [cells, setCells] = useState<number[][]>([]);
  const [sel, setSel] = useState<Sel>(null);
  const [cleared, setCleared] = useState(0);
  const [moves, setMoves] = useState(0);
  const [score, setScore] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const scoreRef = useRef(0); const movesRef = useRef(0);
  /**
   * 🔴 ТОЧНЫЙ МИНИМУМ ХОДОВ ЭТОЙ ДОСКИ — СЧИТАЕТСЯ В ФОНЕ, НЕ ДЕРЖИТ ПАРТИЮ.
   *
   * Замер 02.09.2026: поиск A* находит минимум за 20 мс на первом уровне, но уже с
   * пятнадцатого упирается в бюджет через 6–10 секунд. Считать при раздаче нельзя —
   * человек смотрел бы на пустой экран; отказаться совсем тоже нельзя — от эталона
   * зависят звёзды.
   *
   * Поэтому расчёт уходит в фон сразу после раздачи: партия начинается мгновенно, а
   * к её концу (звёзды считаются на итоге) число обычно уже есть. Не успел или не
   * уложился в бюджет — `null`, и звёзды берут калиброванную оценку.
   */
  const exactMinRef = useRef<number | null>(null);
  /**
   * 🔴 РАЗБОР СЦЕНЫ: ПОЛКИ РАЗЪЕЗЖАЮТСЯ, КОГДА УРОВЕНЬ ВЗЯТ (пункт 2.6 карты дорог).
   *
   * У эталона жанра партия заканчивается физически: сцена разбирается, полки уходят
   * за экран — и только потом приходит итог. У нас карточка итога появлялась поверх
   * неподвижной доски, и конец партии читался как «всплыло окно», а не как событие.
   *
   * ⚠️ Щадящий режим и вечерний набор пропускают разъезд: движение — украшение, а
   * итог — содержание. `settle` уже умеет обе проверки (см. `juice/motion`).
   */
  const scatter = useRef(new Animated.Value(0)).current;
  /**
   * Замеры §20.4 — в ref, а не в состоянии: рендеру они не нужны, а нужны
   * обработчику хода В МОМЕНТ события — к концу уровня «когда был первый ход»
   * уже не восстановить. lastMove — служебная память для ловли возврата (тот
   * же товар поехал обратно тем же ребром); замером не является и в снимок
   * партии не пишется.
   *
   * ⚠️ ОТМЕНА ХОДА ЗАМЕРЫ НЕ ОТКАТЫВАЕТ. Пересмотр плана — свершившийся факт
   * партии, и именно его мы считаем; откатывайся счётчик вместе с доской —
   * каждая отмена стирала бы сама себя из статистики.
   */
  const hiddenStatsRef = useRef<HiddenRunStats & { lastMove: { from: number; to: number; type: number } | null }>(
    { ...EMPTY_HIDDEN_STATS, lastMove: null },
  );
  /** Узкий экран (телефон): сетка ограничивается тремя колонками. 560px — граница,
   *  за которой четвёртая колонка перестаёт душить товар. */
  const narrowRef = useRef(false);
  const gridRef = useRef({ cols: 3, rows: 3, slots: 9 });
  narrowRef.current = isNarrow(width);        // текущая доска — для логики каскада/reshuffle
  const [gridDim, setGridDim] = useState({ cols: 3, rows: 3 });  // для рендера полок
  /** Маска ниш: true — ниша есть, false — в этом месте доски дырка (форма уровня). */
  const [mask, setMask] = useState<boolean[]>(() => Array(9).fill(true));
  /** Препятствие на нише: заперта, под замком по ходам, либо ничего. */
  const [obstacles, setObstacles] = useState<Obstacle[]>([]);
  /** Накрытые товары: ключ «ниша:позиция». Виден силуэт, не видно что это. */
  const [covered, setCovered] = useState<Set<string>>(() => new Set());
  /** Примёрзший ряд: индекс ряда и тип, тройку которого надо собрать, чтобы растопить. */
  const [frozen, setFrozen] = useState<{ row: number; type: number } | null>(null);
  /**
   * ВСПЫШКА И ДРОЖАНИЕ — ОДНО ЗНАЧЕНИЕ НА ВСЮ ДОСКУ, А НЕ ПО ЗНАЧЕНИЮ НА НИШУ.
   *
   * Ниш до восемнадцати, и заводить каждой свой `Animated.Value` значит держать
   * восемнадцать живых анимаций ради двух, которые сейчас идут. Здесь одно
   * значение и список ниш, которых оно касается: анимация всегда ровно одна, а
   * какие ниши мигают — обычное состояние.
   */
  const flash = useRef(new Animated.Value(0)).current;
  const [flashCells, setFlashCells] = useState<number[]>([]);
  const shake = useRef(new Animated.Value(0)).current;
  const [shakeCell, setShakeCell] = useState<number | null>(null);
  const reduced = useReducedMotion();

  /**
   * ОТМЕНА ХОДА — БЕСПЛАТНАЯ И БЕЗ СЧЁТЧИКА, И ЭТО ОСОЗНАННО.
   *
   * Соблазн был сделать её платной, как перемешивание: там бесплатная кнопка
   * обесценила всё планирование. Но случай другой. Сортировка — игра с ПОЛНОЙ
   * информацией: все товары на виду, скрытых стопок нет, исход хода считается
   * заранее. Значит перебором «сделал — посмотрел — откатил» ничего не
   * разведаешь: то же самое можно вычислить, не трогая доску.
   *
   * Перемешивание — другое дело: оно МЕНЯЕТ расклад, то есть даёт новый шанс.
   * Отмена возвращает ровно то, что было. Платить за исправление промаха
   * пальцем — наказывать за неточность рук, а не за неточность мысли.
   */
  const history = useMoveHistory<Snapshot>();

  const [shuffles, setShuffles] = useState(SHUFFLES_PER_LEVEL);
  const [hints, setHints] = useState(HINTS_PER_LEVEL);
  /** Показанный ход: подсвечен товар и ниша. Гаснет сам — подсказка не должна висеть. */
  const [hint, setHint] = useState<HintMove | null>(null);

  /**
   * ПОЛЁТ ТОВАРА ПРИ ПЕРЕКЛАДЫВАНИИ.
   *
   * 🔴 ЗАЧЕМ. Раньше доска менялась мгновенно: товар пропадал в одной нише и
   * возникал в другой. Прочитать ход глазом было нельзя — особенно чужой ход
   * после подсказки или отмены. Мгновенная смена читается как сбой отрисовки, а
   * не как «я это сделал».
   *
   * ⚠️ ЛЕТИТ КОПИЯ, А НАСТОЯЩИЙ ТОВАР НА ВРЕМЯ ПОЛЁТА СПРЯТАН. Иначе на экране
   * два одинаковых товара сразу — тот же приём, что уже сделан у перетаскивания
   * (`inHand`), и по той же причине.
   *
   * В щадящем режиме полёта нет вовсе: проезд по экрану — ровно то движение,
   * от которого там отказываются. Ход остаётся мгновенным, как и был.
   */
  const flyAt = useRef(new Animated.Value(0)).current;
  const [fly, setFly] = useState<{ type: number; toCell: number; covered: boolean; ax: number; ay: number; bx: number; by: number } | null>(null);

  /** Центр ниши в координатах экрана — общий и для полёта, и для чего угодно ещё. */
  const nicheCenter = (i: number): { x: number; y: number } | null => {
    const L = liveRef.current;
    if (!L.geom.cellW || !L.geom.nicheH) return null;
    const r = nicheRect(i, L.geom, L.mask);
    if (!r) return null;
    return {
      x: boardBox.current.x + r.x + L.geom.cellW / 2,
      y: boardBox.current.y + r.y + L.geom.nicheH / 2,
    };
  };

  const flyItem = (type: number, covered: boolean, fromCell: number, toCell: number) => {
    if (reduced) return;
    /**
     * ⚠️ РАМКУ ДОСКИ МЕРЯЕМ ЗДЕСЬ, А НЕ НАДЕЕМСЯ НА ЧУЖОЙ ЗАМЕР. `syncBoardBox`
     * до сих пор звался ровно в одном месте — в начале жеста перетаскивания.
     * При ходе ДВУМЯ ТАПАМИ этого не происходит, рамка остаётся нулевой, и
     * копия улетала к заголовку экрана вместо соседней ниши. Видно на снимке
     * 19.08.2026: товар в шапке над названием игры.
     */
    syncBoardBox();
    const a = nicheCenter(fromCell), b = nicheCenter(toCell);
    if (!a || !b) return;
    setFly({ type, toCell, covered, ax: a.x, ay: a.y, bx: b.x, by: b.y });
    flyAt.setValue(0);
    Animated.timing(flyAt, { toValue: 1, duration: 190, easing: Easing.out(Easing.quad), useNativeDriver: true })
      .start(() => setFly(null));
  };

  /** Ниши вспыхивают на сборе тройки. В щадящем режиме — короткий показ без плавности. */
  const flashNiches = (cellsHit: number[]) => {
    if (!cellsHit.length) return;
    setFlashCells(cellsHit);
    flash.setValue(1);
    if (reduced) { setTimeout(() => { flash.setValue(0); setFlashCells([]); }, 160); return; }
    Animated.timing(flash, { toValue: 0, duration: 420, easing: Easing.out(Easing.quad), useNativeDriver: true })
      .start(() => setFlashCells([]));
  };

  /**
   * Ниша дрожит на недопустимом ходе.
   *
   * 🔴 ЗАЧЕМ. Раньше отказ был виден только по тому, что НИЧЕГО НЕ ПРОИЗОШЛО, —
   * а это неотличимо от «не нажалось». Человек жмёт второй раз, и всё повторяется.
   * В щадящем режиме дрожания нет: тряска — худший вид движения для
   * вестибулярной чувствительности. Там остаётся звук и тычок.
   */
  const shakeNiche = (cell: number) => {
    if (reduced) return;
    setShakeCell(cell);
    shake.setValue(0);
    Animated.sequence([
      Animated.timing(shake, { toValue: 1, duration: 55, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -1, duration: 55, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0.6, duration: 50, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start(() => setShakeCell(null));
  };
  const [goal, setGoal] = useState<Goal>({ kind: 'all' });
  const goalRef = useRef<Goal>({ kind: 'all' });
  const { popups, spawn } = useScorePopups();

  // Справка правил уровня: только в личной игре (в зарядке-пресете бейдж скрыт).
  // level — живой стейт партии (растёт по ходу сессии), а не lvl.level.
  /**
   * 🔴 ПРАВИЛО СТРОГОЙ УКЛАДКИ ПОКАЗЫВАЕМ ТОЛЬКО ТАМ, ГДЕ ОНО ДЕЙСТВУЕТ.
   *
   * `LevelRule` умеет диапазон «с уровня N», а строгая укладка идёт ЧЕРЕЗ ДВА
   * НА ТРЕТИЙ — такой формы у диапазона нет. Пока правило просто лежало в
   * списке с `fromLevel: 14`, бейдж «Строгая укладка» висел на КАЖДОМ уровне с
   * четырнадцатого и на двух из трёх обещал запрет, которого там нет.
   *
   * Найдено живой прокаткой 19.08.2026: L18 и L25 показывали правило, работая
   * по обычным правилам. Ни один гейт этого не видел — все проверяли, что
   * правило существует и переведено, а не что оно ПРАВДА на этом уровне.
   */
  const rulesHere = useMemo(() => gsRulesForLevel(level), [level]);
  const levelRules = useLevelRules('goods_sort', level, rulesHere, phase === 'playing' && !isPreset);

  /**
   * 🔴 МОДИФИКАТОРЫ УРОВНЯ — ЗНАЧКАМИ, А НЕ СТРОКОЙ СЛОВ.
   *
   * «Примёрзший ряд», «Строгая укладка» и «Скрытая информация» занимали в шапке
   * целую текстовую строку. На кадре Вали 01.09.2026 эта строка стоит четвёртой
   * сверху — а всё, что она сообщает, умещается в кружок со снежинкой.
   *
   * ⚠️ ПОДПИСЬ БЕРЁМ ИЗ СЛОВАРЯ ТЕМ ЖЕ ВЫЗОВОМ, ЧТО И ОКНО ПРАВИЛ. Название
   * модификатора живёт в одном месте: значок в шапке и карточка правила не могут
   * разъехаться, и обе умеют двенадцать языков, а не два.
   */
  const modsHere = useMemo<ModItem[]>(() => {
    const ICON: Record<string, { icon: keyof typeof Ionicons.glyphMap; tone: ModItem['tone'] }> = {
      frozen: { icon: 'snow', tone: 'accent' },
      strict: { icon: 'albums', tone: 'warn' },
      hidden: { icon: 'help-circle', tone: 'neutral' },
    };
    return rulesHere
      .filter((r) => ICON[r.key] && level >= r.fromLevel)
      .map((r) => ({
        key: r.key,
        icon: ICON[r.key].icon,
        label: levelRuleText(language, GS_GAME_ID, r).title,
        tone: ICON[r.key].tone,
      }));
  }, [rulesHere, level, language]);

  const loadLevel = (L: number) => {
    // Пул считаем один раз: он же уходит в раздачу ниже. Заодно вызов `levelCfg`
    // остаётся без вложенной скобки — проба `goods-sort-honest` разбирает его
    // регуляркой и на вложенности спотыкается.
    const пул = poolForLevel(L, poolRef.current);
    const cfg = levelCfg(L, пул.length, narrowRef.current);
    gridRef.current = { cols: cfg.cols, rows: cfg.rows, slots: cfg.slots };
    setGridDim({ cols: cfg.cols, rows: cfg.rows });
    setMask(cfg.mask);
    /**
     * Под строгой укладкой расклад может оказаться непроходимым — это её
     * природа, а не дефект. Гейт показывает, что генератор такие почти не
     * выдаёт, но «почти» человеку не объяснишь: переспрашиваем, пока не выйдет
     * решаемый. Пятая попытка — предел; если и она не дала, отдаём как есть,
     * потому что зависший экран хуже трудного уровня, а отмена и перемешивание
     * у человека на руках.
     */
    moveLimitRef.current = cfg.moveLimit;   // лимит уровня фиксируется вместе с доской
    /**
     * Раздача и препятствия — одним вызовом (`dealBoard`). Это не косметика:
     * гарантия «свободных ниш минимум две» держится на том, что запас под
     * препятствия и сами препятствия считаются В ОДНОМ месте. Пока они стояли
     * порознь, они молча вычитали из одного и того же — 57 уровней из 200
     * оставались вовсе без свободной ниши.
     */
    const deal = dealBoard(L, пул, narrowRef.current);
    const built = deal.cells;
    setCells(built);
    /**
     * Фоновый расчёт точного минимума для ЭТОЙ доски (см. `exactMinRef`).
     * ⚠️ `setTimeout(0)` обязателен: без него поиск съел бы первый кадр партии.
     * Бюджет держим маленьким — на трудных досках проще честно не знать.
     */
    exactMinRef.current = null;
    scatter.setValue(0);   // новая доска приезжает собранной, а не разъехавшейся
    const доскаДляРасчёта = built.map((c) => [...c]);
    const capsДляРасчёта = capsForBoard(L, built);
    setTimeout(() => {
      try {
        const r = minMoves(доскаДляРасчёта, capsДляРасчёта, 12000);
        if (r.moves !== null) exactMinRef.current = r.moves;
      } catch { /* расчёт — удобство, а не условие партии */ }
    }, 0);
    const obs = deal.obstacles;
    setObstacles(obs);

    // Накрываем товары: только те, что лежат НЕ последними в нише — иначе
    // человек не сможет даже взять его, не зная, что берёт.
    /**
     * Режим скрытой информации (§20): в глубине скрыто ВСЁ, а не выборка из
     * плана препятствий — covered-план на таких уровнях поглощён режимом
     * (его 2–3 накрытия — подмножество «всей глубины», добавлять нечего).
     * Раздача при этом ТА ЖЕ, что у обычного уровня: §20.5 сравнивает результат
     * при полной и при скрытой информации на сопоставимых досках, менять
     * генерацию под режим значило бы сравнивать несравнимое.
     */
    const spots = hideDeepSpots(built);
    const cov = new Set<string>(hiddenInfo(L) ? spots : shuffle(spots).slice(0, cfg.obst.covered));
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

    setSel(null); setMoves(0); movesRef.current = 0; setShuffles(SHUFFLES_PER_LEVEL);
    setHints(HINTS_PER_LEVEL); setHint(null);
    history.reset();   // лента отмены не переживает уровень: чужая доска в неё не годится
    // Замеры §20.4 начинаются заново вместе с уровнем — чужая партия в них не годится тем более.
    hiddenStatsRef.current = { ...EMPTY_HIDDEN_STATS, lastMove: null };
    setStartTime(gameNow()); setElapsed(0);
  };

  const startGame = () => {
    if (!lvl.loaded) return;
    // Новая партия заменяет незаконченную: старый склад продолжать уже нечем.
    const pidStart = profile?.id;
    if (pidStart) clearResume(GS_GAME_ID, pidStart).catch(() => {});
    resumedRef.current = false;
    const startLvl = lvl.level;
    setCleared(0); setScore(0); scoreRef.current = 0; setLevelBanner(null);
    setLevel(startLvl);
    loadLevel(startLvl);
    setPhase('playing');   // спокойный режим — без таймера (как в оригинале «собери всё»)
  };

  // Ждём восстановленный уровень перед auto-start из зарядки.
    // ⚠️ Ждём загрузки уровня. Без этого автостарт («Вызов дня», онбординг) играл
  // ПЕРВЫЙ уровень человеку с двенадцатым: уровень приезжает асинхронно, а
  // эффект монтирования всегда раньше промиса. См. useAutostartWhenReady.
  useAutostartWhenReady(() => autostart && lvl.loaded, () => startGame());

  /**
   * Поднять партию из снимка — склад оживает ровно таким, каким его оставили:
   * ниши и их содержимое, препятствия, накрытия, заморозка, цель, счётчики и
   * лента отмены. Отдельно от `loadLevel`: тот РАЗДАЁТ новый уровень, а здесь
   * ничего раздавать нельзя — расклад случайный и повторить его нечем.
   */
  const applyResume = (r: GoodsRestored) => {
    resumedRef.current = true;
    setSetKey(r.setKey);
    // 🔴 Про открытость здесь НЕ спрашиваем — начатую партию не отбирают.
    setGrantedSet(r.setKey);
    // Пул ставим сразу, не дожидаясь эффекта на setKey: по нему считается
    // следующий уровень, а эффект приедет только в следующем рендере.
    poolRef.current = (GOOD_SETS.find((s) => s.key === r.setKey) || GOOD_SETS[0]).pool;
    setLevel(r.level);
    gridRef.current = { cols: r.cols, rows: r.rows, slots: r.slots };
    setGridDim({ cols: r.cols, rows: r.rows });
    setMask(r.mask);
    setCells(r.cells);
    setObstacles(r.obstacles);
    setCovered(new Set(r.covered));
    setFrozen(r.frozen);
    setGoal(r.goal); goalRef.current = r.goal;
    // ⚠️ Лимит берём ИЗ СНИМКА, а не пересчитываем по уровню: пересчёт на
    // другой ширине экрана вернул бы человеку ходы, которые он потратил.
    moveLimitRef.current = r.moveLimit;
    movesRef.current = r.moves; setMoves(r.moves);
    scoreRef.current = r.score; setScore(r.score);
    setCleared(r.cleared);
    setShuffles(r.shuffles); setHints(r.hints); setHint(null);
    history.restore(r.history);
    // Замеры §20.4 поднимаются, какими их оставили; lastMove не хранится —
    // сравнивать «возврат» через границу выхода из приложения не с чем.
    hiddenStatsRef.current = { ...r.hiddenStats, lastMove: null };
    setSel(null); setLevelBanner(null);
    setStartTime(r.startedAt); setElapsed(0);
    setPhase('playing');
  };

  /** Есть что терять → «назад» спросит, а не выбросит молча (см. goodsHasSomethingToLose). */
  const armed = goodsHasSomethingToLose({
    phase, bannerUp: levelBanner !== null, canUndo: history.canUndo, hints, shuffles,
  });

  /**
   * Живая партия для записи. Читаем через ref, а не из замыкания: снимок обязан
   * быть свежим на МОМЕНТ ухода, иначе допишем доску прошлого хода — со всеми
   * товарами, которые уже переложены.
   */
  const partyRef = useRef<{ pid?: string; snap: () => GoodsResume | null }>({ snap: () => null });
  partyRef.current = {
    pid: profile?.id,
    snap: () => snapshotGoodsParty({
      phase, bannerUp: levelBanner !== null,
      level, setKey,
      cols: gridDim.cols, rows: gridDim.rows,
      mask, cells, obstacles,
      covered: Array.from(covered),
      frozen, goal,
      moves, moveLimit: moveLimitRef.current,
      score, cleared, shuffles, hints,
      canUndo: history.canUndo,
      history: history.serialize(),
      startedAt: startTime,
      // lastMove отрезаем: это служебная память обработчика, а не замер.
      hiddenStats: {
        firstMoveMs: hiddenStatsRef.current.firstMoveMs,
        planRevisions: hiddenStatsRef.current.planRevisions,
        movesBeforeFirstReveal: hiddenStatsRef.current.movesBeforeFirstReveal,
      },
    }, gameNow()),
  };

  /**
   * Дописать партию. Зовётся из двух мест: ПЕРЕД вопросом при выходе
   * (`onSaveBeforeExit` у каркаса) и отложенно по ходу партии. Первое
   * обязательно: человек видит «партия сохранится» — обещание должно быть уже
   * выполнено, а не зависеть от того, доживёт ли экран до размонтажа.
   */
  const saveParty = useCallback(() => {
    const { pid, snap } = partyRef.current;
    if (!pid) return;
    const s = snap();
    if (!s) return;
    saveResume<GoodsResume>(GS_GAME_ID, pid, GS_RESUME_V, s).catch(() => {});
  }, []);

  /**
   * Отложенная запись по ходу партии — страховка на случай, когда экран сносят
   * мимо всех кнопок (система убила приложение). Пишет ЖИВОЕ состояние в момент
   * срабатывания, поэтому задержка стоит максимум 400 мс свежести, а не целый ход.
   */
  useEffect(() => {
    if (!armed) return;
    const tm = setTimeout(saveParty, GS_RESUME_DEBOUNCE_MS);
    return () => clearTimeout(tm);
  }, [armed, cells, obstacles, covered, frozen, moves, score, hints, shuffles, saveParty]);

  /**
   * Подъём партии при входе. Путь зарядки (autostart) не трогаем: там человек
   * явно запустил свежий шаг, и поднятая партия подменила бы заданный уровень.
   */
  useResumeBoot<GoodsResume>(GS_GAME_ID, GS_RESUME_V, (saved) => {
    const live = restoreGoodsParty(saved, gameNow());
    if (live) applyResume(live);
  }, autostart);

  /**
   * Ходы кончились? Зовётся ПОСЛЕ инкремента счётчика в каждом месте, где ход
   * тратится (обычный ход и перемешивание — оба списывают). Возвращает true,
   * когда партия закончена провалом, чтобы вызывающий не делал вид, что игра
   * продолжается.
   */
  const outOfMoves = (board: number[][]): boolean => {
    if (!movesExhausted(movesRef.current, moveLimitRef.current, board, goalRef.current)) return false;
    setTimeout(() => advanceLevel(true), 350);
    return true;
  };

  const advanceLevel = (failedByMoves = false) => {
    /**
     * Уровень закончился — пройден или провален, доска в обоих случаях будет
     * новой. Незаконченную партию выбрасываем здесь же, иначе возвращение
     * поднимет склад уровня, который человек уже закрыл.
     */
    const pidDone = profile?.id;
    if (pidDone) clearResume(GS_GAME_ID, pidDone).catch(() => {});
    const moveLimit = moveLimitRef.current;
    /**
     * 🔴 ЛИМИТ СРАБАТЫВАЕТ В МОМЕНТ, КОГДА ХОДЫ КОНЧИЛИСЬ, А НЕ КОГДА ДОСКА СОБРАНА.
     *
     * До 30.08.2026 `advanceLevel` звался из ОДНОГО места — по достижении цели.
     * Значит эта ветка проверяла лимит только у того, кто уже собрал доску, а тот,
     * кто ходы исчерпал и не собрал, продолжал играть бесконечно: замер дал 160
     * ходов при лимите 23. Справка обещала лимит с девятого уровня — механики не
     * существовало. Теперь вызов приходит и из хода, и из перемешивания, с
     * `failedByMoves`, потому что на последнем разрешённом ходу `movesRef.current`
     * ЕЩЁ РАВЕН лимиту, а не больше него.
     */
    if (moveLimit > 0 && (failedByMoves || movesRef.current > moveLimit)) {
      // Ходы кончились, цель не достигнута — уровень не засчитан.
      // ⚠️ В ЗАРЯДКЕ ПЕРЕЗАПУСКАТЬ НЕЛЬЗЯ. Сессия при провале не сохраняется, а зарядка
      // двигается именно по сохранённой сессии — значит человек застрял бы на этом шаге
      // навсегда, переигрывая один уровень. Поэтому в зарядке провал ЗАВЕРШАЕТ шаг:
      // пишем сессию с passed:false, и зарядка уходит к следующей игре.
      setLevelBanner(-1);
      if (!chainNext) {
        saveSession({
          passed: false,
          game_type: 'goods_sort', score: scoreRef.current, time_seconds: (gameNow() - startTime) / 1000,
          difficulty: level < 5 ? 'easy' : level < 10 ? 'medium' : 'hard', mode: `lvl${level}`, errors: 0,
          /**
           * details — тем же sessionDetails, что и у победы: два места сборки
           * однажды разъехались бы. Скрытый уровень сюда не попадает ПО
           * ПОСТРОЕНИЮ (лимит бывает только у цели «ходы», а hiddenInfo её
           * исключает) — hiddenInfo(level) здесь структурная страховка на
           * случай перестройки таблиц, а не живая ветка.
           */
          details: {
            ...sessionDetails(
              level, movesRef.current, hiddenInfo(level),
              moveReference(levelCfg(level, poolRef.current.length, narrowRef.current)),
              hiddenStatsRef.current,
            ),
            move_limit_exceeded: true,
          },
        }).catch((e) => console.error(e));
        return;
      }
      // Авто-рестарта на провале нет (канон v1.154): человек сам жмёт «Ещё раз»,
      // успев разобрать, где перебрал ходы. Кнопку рисует общая карточка.
      return;
    }
    hapticSuccess();
    const done = level;
    const finalTime = (gameNow() - startTime) / 1000;
    const hiddenDone = hiddenInfo(done);
    /**
     * §20.4: бонус за уровень не судит ходы там, где минимума не существует.
     * «300 − 4·ходы» — суждение о ходах против невидимого бюджета; на скрытом
     * уровне разведочный ход — работа режима, а не расточительность, и штраф
     * за него был бы счётом ходов сверх минимума через задний двор. Вместо
     * формулы — середина той же вилки [50…300], одна на всех.
     */
    scoreRef.current += hiddenDone ? 150 : Math.max(50, 300 - movesRef.current * 4);
    setScore(scoreRef.current);
    saveSession({
      passed: true,   // сессия пишется только когда уровень собран
      game_type: 'goods_sort', score: scoreRef.current, time_seconds: finalTime,
      difficulty: done < 5 ? 'easy' : done < 10 ? 'medium' : 'hard', mode: `lvl${done}`, errors: 0,
      // На скрытом уровне вместо moves_over_min уходят три замера §20.4 —
      // весь выбор полей живёт в sessionDetails, см. разбор там.
      details: sessionDetails(
        done, movesRef.current, hiddenDone,
        moveReference(levelCfg(done, poolRef.current.length, narrowRef.current)),
        hiddenStatsRef.current,
      ),
    }).catch((e) => console.error(e));
    const next = done + 1;
    setLevel(next);
    // ⚠️ reach, а НЕ setLevel: прямая установка срезала бы потолок, если человек
    // вернулся с тропинки на пройденный уровень. pick следом держит цепочку на
    // переигровке — иначе после уровня 3 при рекорде 20 игра прыгнула бы на 20.
    // ⚠️ ЛЕСТНИЦА ОДНОСТОРОННЯЯ, и это не забытый `fail()`. У сортировки уровни
    // авторские: 60 разных раскладов с формой доски, препятствиями и целью, а не
    // ступени сложности одного и того же. Провал здесь значит «этот расклад не
    // сложился», и лечится он повтором ТОГО ЖЕ уровня — понижение отобрало бы
    // пройденное и заставило переигрывать то, что человек уже собрал.
    // Калибровочные лестницы (span, matrix, n-back) устроены иначе и понижаются.
    lvl.reach(next);
    lvl.pick(next);   // выше потолка pick сам обнуляется — прыжка не будет
    // Итог показывает общая карточка ПОВЕРХ полок — разложенный товар остаётся
    // на экране. Она же решает, запускать ли следующий уровень: своего таймера
    // здесь больше нет, он спорил с таймером зарядки (репорт Вали на v1.193.0
    // «Сортировка товаров выдаёт второй уровень и вылетает в вечерней зарядке»).
    /**
     * Сцена разбирается ПЕРЕД итогом: ряды разъезжаются в стороны и уходят за край,
     * и только потом приходит карточка. Задержка ровно на длительность разъезда —
     * дольше человек ждёт пустой экран, короче не успевает увидеть.
     */
    if (reduced) {
      setLevelBanner(done);
    } else {
      Animated.timing(scatter, { toValue: 1, duration: 420, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start();
      setTimeout(() => setLevelBanner(done), 380);
    }
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

  /**
   * Ляжет ли то, что в руке, в нишу `toCell`. ОДНА проверка на оба способа
   * хода — и на сам ход, и на подсветку цели, и на тап, и на перетаскивание.
   *
   * ⚠️ Раньше подсветка `canDrop` в `renderCell` считала своё («не та ниша и
   * есть место») и про препятствия не знала: запертая ниша обводилась жёлтым
   * как доступная, а ход в неё `moveItem` отвергал. Тапом это читалось как
   * проглоченное нажатие, а перетаскиванием читалось бы куда хуже — товар
   * летит в подсвеченную нишу и отскакивает. Поэтому предикат один.
   */
  /** Идёт ли на этом уровне строгая укладка. Одно место, откуда это узнают все. */
  const strict = strictPlacement(level);
  /** Идёт ли режим скрытой информации (§20). Тоже одно место — по образцу strict. */
  const hiddenHere = hiddenInfo(level);
  /** Уровень с подвижными нишами: раз в `MOVE_SHIFT_EVERY` ходов ниши меняются местами. */
  const movingHere = movingNiches(level);
  /** Ёмкости ниш этого уровня. Одинаковые до 18-го, дальше вперемешку. */
  // Ёмкости — от живой доски (см. capsForBoard): маска формы меняет число ниш
  // при неизменной сетке, и зависимость от cols/rows этого не видит.
  const caps = useMemo(() => capsForBoard(level, cells), [level, cells.length]);
  const capOf = (i: number) => caps[i] ?? CAP;
  /**
   * Ниши-джокеры этого уровня. Считаются от ЖИВОЙ доски по той же причине, что и
   * ёмкости: число ниш задаёт маска формы, а не размер сетки.
   */
  const jokers = useMemo(() => jokersForBoard(level, cells), [level, cells.length]);
  const isJokerNiche = (i: number) => jokers[i] === true;

  /**
   * 🔴 ДОСКА ВСТАЛА — И ОБ ЭТОМ НАДО СКАЗАТЬ. Проверки тупика в игре не было
   * ВООБЩЕ: под строгой укладкой доска может встать, и человек тыкал в мёртвую
   * доску, не понимая, что произошло. Тот же симптом, что 22.08.2026 нашёлся в
   * маджонге и в «Дворце памяти» — игра не отвечает и не объясняет.
   *
   * Считаем на живой доске: ниши под замком и вырезанные маской в расчёт не
   * идут, потому что ходить в них нельзя.
   */
  const deadEnd = useMemo(() => {
    if (cells.length === 0) return false;
    const board = makeBoard(cells, caps, jokers);
    return isDeadEnd(board, cells.map((_, i) => cellUsable(i)), strict);
  }, [cells, caps, jokers, obstacles, strict, frozen]);
  /** Есть ли на этом уровне разные ёмкости — от этого зависит показ насечек. */
  const mixedCaps = new Set(caps).size > 1;

  const canPlaceInto = (fromCell: number, toCell: number): boolean => {
    if (fromCell === toCell) return false;
    if (!cellUsable(fromCell) || !cellUsable(toCell)) return false;
    const src = cells[fromCell];
    if (!src?.length) return false;
    return placementOk(cells[toCell] ?? [], src[src.length - 1], strict, capOf(toCell), isJokerNiche(toCell));
  };

  const moveItem = (fromCell: number, fromIdx: number, toCell: number) => {
    const src = cells[fromCell];
    if (!src || fromIdx < 0 || fromIdx >= src.length) { setSel(null); return; }
    if (!canPlaceInto(fromCell, toCell)) {
      setSel(null);
      // Отказ ПО ПРЕПЯТСТВИЮ отзывается тычком: «нельзя» должно ощущаться.
      // Полная ниша и та же самая ниша молчат — там и так видно, почему не вышло.
      // Отказ ПО ПРЕПЯТСТВИЮ отзывается тычком, звуком и дрожанием ниши: «нельзя»
      // должно ощущаться, иначе оно неотличимо от «не нажалось».
      // Полная ниша и та же самая ниша молчат — там и так видно, почему не вышло.
      if (fromCell !== toCell && (!cellUsable(fromCell) || !cellUsable(toCell))) {
        hapticTap(); sndWrong(); shakeNiche(toCell);
      }
      return;
    }
    // Снимок ДО хода: каскад ниже необратим по частям, вернуть можно только всё разом.
    history.push({
      cells: cells.map((c) => [...c]),
      obstacles: obstacles.slice(),
      covered: Array.from(covered),
      frozen,
      moves: movesRef.current,
      score: scoreRef.current,
      cleared,
    });
    const ns = cells.map((c) => [...c]);
    const [item] = ns[fromCell].splice(fromIdx, 1);
    ns[toCell].push(item);
    // Копия летит из ниши в нишу. Запускаем ДО смены доски: геометрия та же,
    // а настоящий товар на время полёта спрячется в нише-цели.
    flyItem(item, covered.has(`${fromCell}:${fromIdx}`), fromCell, toCell);
    movesRef.current += 1; setMoves(movesRef.current);
    setHint(null);   // сходил — подсказка больше не про эту доску
    /**
     * Замеры §20.4 снимаются В МОМЕНТ события. Время до первого хода — сколько
     * человек планировал, зная, что информации не хватает; часы игровые
     * (gameNow), те же, что меряют уровень. Возврат — тот же товар едет
     * обратно по тому же ребру: план пересмотрен руками, без кнопки отмены.
     */
    if (hiddenHere) {
      const st = hiddenStatsRef.current;
      if (st.firstMoveMs === null) st.firstMoveMs = Math.max(0, Math.round(gameNow() - startTime));
      if (st.lastMove && st.lastMove.to === fromCell && st.lastMove.from === toCell && st.lastMove.type === item) {
        st.planRevisions += 1;
      }
      st.lastMove = { from: fromCell, to: toCell, type: item };
    }
    // каскад: любая ячейка с 3 одинаковыми → собрать (+50). Спокойно, без таймед-комбо.
    let clearedNow = 0; let gained = 0; let again = true;
    const clearedTypes: number[] = [];
    const clearedCells: number[] = [];   // какие ниши вспыхнут
    while (again) {
      again = false;
      for (let i = 0; i < gridRef.current.slots; i++) {
        const tri = tripleIn(ns[i]);
        if (tri !== null) {
          clearedTypes.push(tri); clearedCells.push(i); ns[i] = removeTriple(ns[i], tri); clearedNow += 1; again = true;
          /**
           * 🔴 КОМБО-МНОЖИТЕЛЬ. Раньше каждая тройка давала ровно 50, сколько бы
           * их ни ссыпалось разом, — при том что звук `sndCombo` играл, а справка
           * обещала «×2, ×3». То есть игра поощряла звуком то, за что не платила.
           * Вторая тройка в одном ходу даёт ×2, третья ×3 и дальше: цепочка
           * стоит дороже той же работы вразбивку, и её есть смысл выстраивать.
           */
          // Цена цепочки считается ОДНОЙ функцией (`scoreForClears`) — она же
          // проверяется гейтом исполнением, а не совпадением строки.
          gained = scoreForClears(clearedNow);
        }
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
    /**
     * ⚠️ КЛЮЧИ СКРЫТОСТИ ПИШУТСЯ ОДИН РАЗ, В КОНЦЕ. Раньше `setCovered` стоял
     * прямо здесь; когда ниже появился сдвиг ниш, второй `setCovered` затирал бы
     * первый — React берёт последний вызов, и вскрытие, посчитанное выше, молча
     * пропадало бы каждый пятый ход.
     */
    let nextCov: string[] | null = null;
    if (covered.size) {
      /**
       * Ключи скрытости едут вслед за товарами: сдвиг позиций после изъятия,
       * затем вскрытие всех, перед кем никого (пустые ниши то же условие
       * чистит само). Прежняя чистка «только когда ниша опустела» держала
       * силуэт на товаре, давно вставшем спереди, — расходясь со справкой
       * накрытого товара; вскрытие по фронту чинит и её, и «?» режима §20.
       */
      nextCov = revealUncovered(shiftCoveredAfterTake(covered, fromCell, fromIdx), ns);
      // Первое вскрытие: ключи в этом переходе только умирают, поэтому
      // «стало меньше» = «что-то вскрылось». Вскрывший ход входит в счёт.
      if (hiddenHere && hiddenStatsRef.current.movesBeforeFirstReveal === null && nextCov.length < covered.size) {
        hiddenStatsRef.current.movesBeforeFirstReveal = movesRef.current;
      }
    }

    /**
     * 🔴 ПОДВИЖНЫЕ НИШИ. Сдвиг делается ПОСЛЕ каскада и снятия препятствий: он
     * меняет адреса, а не содержимое, и не должен мешать тройке собраться на
     * том месте, где её собрали.
     *
     * Едут ВМЕСТЕ: содержимое, препятствия и ключи скрытости. Разъедься хоть
     * одно — и замок остался бы висеть на пустом месте, а силуэт «?» показывал
     * бы товар из другой ниши. Ёмкости не едут намеренно: переставляются только
     * равные по ёмкости, поэтому ёмкость остаётся при МЕСТЕ и `capsForBoard`
     * не врёт.
     */
    let итог = ns;
    if (movingHere && movesRef.current % MOVE_SHIFT_EVERY === 0) {
      const perm = nicheShift(caps, Math.floor(movesRef.current / MOVE_SHIFT_EVERY));
      итог = permuteCells(ns, perm);
      if (obstacles.length) setObstacles(permuteCells(obstacles, perm));
      const ключи = nextCov ?? [...covered];
      if (ключи.length) {
        nextCov = ключи.map((k) => {
          const [c, i] = k.split(':');
          return `${perm[Number(c)]}:${i}`;
        });
      }
      setHint(null);
      hapticTap();
    }
    if (nextCov !== null) {
      // Сравниваем состав, а не размер: сдвиг переименовывает ключи, не меняя их числа.
      const н = nextCov;
      if (н.length !== covered.size || н.some((k) => !covered.has(k))) setCovered(new Set(н));
    }
    setCells(итог); setSel(null); setScore(scoreRef.current);
    scoreRef.current += gained;
    if (clearedNow > 0) {
      setCleared((c) => c + clearedNow); hapticSuccess();
      flashNiches(clearedCells);
      // Одна тройка — короткий подтверждающий звук; цепочка — восходящее комбо.
      if (clearedNow > 1) sndCombo(clearedNow); else sndMatch();
      // Цифра во всплывашке — НАСТОЯЩАЯ прибавка, включая множитель.
      spawn(width / 2 - 24, 150, (clearedNow > 1 ? `×${clearedNow}  ` : '') + '+' + gained, '#fde047');
    }
    else { hapticTap(); sndPlace(); }   // обычный ход — мягкий тик, чтобы было слышно, что он засчитан
    /**
     * 🔴 УРОВЕНЬ КОНЧАЕТСЯ ПО ЦЕЛИ, А НЕ ПО ПУСТОЙ ДОСКЕ. При цели `pick` на
     * полках ещё лежит товар, и это НЕ незаконченный уровень — это и есть
     * смысл цели: играть адресно, а не выметать всё подряд.
     */
    if (goalMet(итог, goalRef.current)) setTimeout(advanceLevel, 350);
    else outOfMoves(итог);
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

  // ── перетаскивание ───────────────────────────────────────────────────
  /**
   * ПЕРЕТАСКИВАНИЕ — ВТОРОЙ СПОСОБ ХОДА, А НЕ ЗАМЕНА ПЕРВОГО.
   *
   * ⚠️ Тапы остаются навсегда. Со скринридером перетащить нельзя в принципе:
   * озвучка забирает жест себе, а игрок «видит» экран по одной кнопке за раз и
   * физически не может вести палец по дуге между двумя нишами, которых не
   * видит. Игра сейчас доступна (`accessibilityRole`/`accessibilityLabel` на
   * каждой нише и каждом товаре) — отнять единственный доступный ввод ради
   * нового было бы регрессом, а не улучшением.
   *
   * ПОЧЕМУ PanResponder, А НЕ gesture-handler И НЕ Reanimated (оба в зависимостях,
   * GestureHandlerRootView уже стоит в app/_layout.tsx — то есть выбор реальный):
   *   · Главный довод против Reanimated: его выигрыш — двигать картинку в UI-потоке
   *     БЕЗ ре-рендера React. Здесь это не работает: подсветка ниши под пальцем
   *     считается через `canPlaceInto`, а он читает `cells`/`obstacles`/`frozen`,
   *     то есть обычный React-стейт. Ре-рендер на каждом движении всё равно будет,
   *     и платить за него воркл'етами и вторым рантаймом не за что.
   *   · Главный довод против gesture-handler: его выигрыш — арбитраж с ScrollView.
   *     Поле здесь НЕ скроллится (`GameShell` без `scrollableField`), спорить не с
   *     кем. Зато он добавил бы в приложение ВТОРОЙ движок перетаскивания: в
   *     hanoi.tsx уже живёт PanResponder, и два разных движка — это две разных
   *     реакции на веб-мышь, на слоп, на прерывание жеста, которые придётся
   *     держать в согласии руками.
   *   · За PanResponder: он даёт pageX/pageY в той же системе координат, что и
   *     `getBoundingClientRect` в вебе, — а Android-сборка это WebView, и попадание
   *     считается именно там.
   */
  const DRAG_SLOP = 8;
  const boardRef = useRef<View>(null);
  const boardBox = useRef({ x: 0, y: 0 });
  const dragPos = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const [drag, setDrag] = useState<{ cell: number; idx: number; type: number } | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  /**
   * PanResponder создаётся ОДИН раз и замыкает первый рендер намертво. Всё, что
   * ему нужно знать про текущую партию, кладём в ref и обновляем каждый рендер —
   * иначе жест считал бы попадание по геометрии первого уровня. Та же грабля, что
   * описана в hanoi.tsx.
   */
  const dragRef = useRef<{ cell: number; idx: number; type: number } | null>(null);
  /** Последняя точка пальца: событие отпускания координат не несёт (см. onPanResponderRelease). */
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  /** Подсвеченная ниша — зеркало состояния, чтобы не перерисовывать доску на каждое движение. */
  const hoverRef = useRef<number | null>(null);
  const liveRef = useRef({
    geom: { cols: 3, rows: 3, cellW: 0, nicheH: 0, pad: 9, gap: 9, boardW: 0 } as BoardGeom,
    itemSize: 0, overlap: 0, mask: [] as boolean[], cells: [] as number[][],
    itemSizeOf: (_i: number): number => 0,
    covered: new Set<string>(),
    usable: (_i: number): boolean => false,
    live: false,
    move: (_f: number, _i: number, _t: number): void => {},
  });

  /**
   * Где шкаф на экране. Меряем в момент захвата, а не в onLayout: в вебе
   * onLayout отдаёт размеры относительно родителя, а жест — координаты окна, и
   * складывать их нельзя. К первому касанию доска заведомо на месте.
   */
  const syncBoardBox = () => {
    const node: any = boardRef.current;
    if (!node) return;
    if (typeof node.getBoundingClientRect === 'function') {
      const r = node.getBoundingClientRect();
      boardBox.current = { x: r.left, y: r.top };
      return;
    }
    node.measureInWindow?.((x: number, y: number) => { boardBox.current = { x, y } });
  };

  /** Ниша под точкой экрана. Вся арифметика — в `nicheAtPoint`, здесь только перевод координат. */
  const nicheAt = (pageX: number, pageY: number): number | null => {
    const L = liveRef.current;
    if (!L.geom.cellW || !L.geom.nicheH) return null;
    return nicheAtPoint(pageX - boardBox.current.x, pageY - boardBox.current.y, L.geom, L.mask);
  };

  const pan = useRef(
    PanResponder.create({
      // Касание НЕ перехватываем: короткий тап обязан достаться кнопке ниши или
      // товара — это же путь, которым игру ведёт скринридер. Иначе один тап
      // обработался бы дважды и ход посчитался бы за два.
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > DRAG_SLOP || Math.abs(g.dy) > DRAG_SLOP,
      // ⚠️ Без Capture перетаскивания не будет вовсе: TouchableOpacity товара забирает
      // жест на касании и держит, а родителя система уже не спрашивает. Capture задаёт
      // вопрос ДО детей — но только после DRAG_SLOP, поэтому тап по-прежнему их.
      onMoveShouldSetPanResponderCapture: (_e, g) => Math.abs(g.dx) > DRAG_SLOP || Math.abs(g.dy) > DRAG_SLOP,

      onPanResponderGrant: (e) => {
        const L = liveRef.current;
        if (!L.live) return;
        syncBoardBox();
        const { pageX, pageY } = e.nativeEvent;
        const cell = nicheAt(pageX, pageY);
        if (cell === null) return;
        const stack = L.cells[cell] || [];
        // Из пустой и из запертой ниши брать нечего. Начать жест, который заведомо
        // ничем не кончится, хуже, чем не начать: товар «поднимется» и упадёт назад.
        if (!stack.length || !L.usable(cell)) return;
        const xInCell = pageX - boardBox.current.x - (nicheRect(cell, L.geom, L.mask)?.x ?? 0);
        const idx = itemAtX(xInCell, stack.length, L.geom.cellW, L.itemSizeOf(cell) || L.itemSize, 2, L.overlap);
        if (idx === null) return;
        const held = { cell, idx, type: stack[idx] };
        dragRef.current = held;
        setDrag(held);
        setHover(cell);
        setSel(null);   // перетаскивание — свой режим, старый тап-выбор сбрасываем
        dragPos.setValue({ x: pageX, y: pageY });
        lastPointRef.current = { x: pageX, y: pageY };
        hoverRef.current = cell;
        hapticTap();
      },

      onPanResponderMove: (e) => {
        if (!dragRef.current) return;
        const { pageX, pageY } = e.nativeEvent;
        lastPointRef.current = { x: pageX, y: pageY };
        dragPos.setValue({ x: pageX, y: pageY });
        /**
         * 🔴 ПОДСВЕТКУ ПЕРЕРИСОВЫВАЕМ ТОЛЬКО КОГДА ОНА МЕНЯЕТСЯ.
         *
         * Денис 02.09.2026: «драг энд дроп тоже лагает в сорт геймс». Здесь стоял
         * безусловный `setHover(...)` — то есть НА КАЖДОЕ движение пальца шло
         * обновление состояния экрана, а с ним перерисовка всей доски: до 14 ниш,
         * в каждой стопка картинок товаров. Палец за секунду даёт шестьдесят
         * событий, значит шестьдесят полных перерисовок в секунду поверх анимации
         * призрака — отсюда рывки.
         *
         * Ниша под пальцем меняется в разы реже, чем приходят события. Сравнение с
         * прошлым значением убирает лишние перерисовки, ничего не меняя на вид.
         */
        const n = nicheAt(pageX, pageY);
        if (n !== hoverRef.current) { hoverRef.current = n; setHover(n); }
      },

      onPanResponderRelease: (e) => {
        const held = dragRef.current;
        dragRef.current = null;
        setDrag(null); setHover(null); hoverRef.current = null;
        if (!held) return;
        /**
         * 🔴 КУДА ПОЛОЖИЛИ — БЕРЁМ ИЗ ПОСЛЕДНЕГО ДВИЖЕНИЯ, А НЕ ИЗ СОБЫТИЯ ОТПУСКАНИЯ.
         *
         * Денис 02.09.2026: «тащишь, если не кликнул товар — он вроде тащится, но
         * не ставится». Товар поднимался (значит захват отрабатывал), а ход не
         * происходил — то есть падало именно определение ниши на отпускании.
         *
         * Причина: событие отпускания (`touchend`/`mouseup`) списка касаний уже не
         * несёт — палец снят. React Native подставляет координаты не везде
         * одинаково: на вебе в `pageX/pageY` приходит ноль. Ноль — это точка за
         * пределами шкафа, `nicheAt` честно отвечает «мимо доски», и ход молча не
         * делается. Через тап то же самое работало, потому что тап не ходит этой
         * веткой вовсе — оттого дефект и выглядел как «перетаскивание не работает,
         * а нажатие работает».
         *
         * Последняя точка движения — то место, где палец был за миг до отрыва, то
         * есть ровно то, куда целился человек. Событие отпускания остаётся
         * запасным: если жест был совсем без движения, точка возьмётся из него.
         */
        const точка = dropPoint(e.nativeEvent, lastPointRef.current);
        const target = точка ? nicheAt(точка.x, точка.y) : null;
        // Мимо доски или в ту же нишу — товар просто возвращается, ход НЕ тратится.
        if (target === null || target === held.cell) return;
        /**
         * 🔴 ХОД ДЕЛАЕТ `moveItem`, И ТОЛЬКО ОН. Своей проверки «а можно ли сюда»
         * здесь нет намеренно: в `moveItem` сидят и препятствия (`cellUsable`), и
         * вместимость, и каскад, и счётчик ходов, и снятие замков, и проверка цели.
         * Заведи копию правил — и однажды перетаскиванием пройдёт то, что тапом не
         * проходит; со стороны это выглядит не как разные проверки, а как жульничество.
         */
        liveRef.current.move(held.cell, held.idx, target);
      },

      onPanResponderTerminate: () => { dragRef.current = null; setDrag(null); setHover(null); hoverRef.current = null; },
    }),
  ).current;

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
  /**
   * Откат к предыдущему снимку. Возвращает ВСЁ: доску, препятствия, накрытия,
   * заморозку и числа. Частичный откат хуже отсутствия отката — он оставил бы
   * доску и счётчики в состояниях, которых в игре никогда не было.
   */
  const undoMove = () => {
    const snap = history.undo();
    if (!snap) return;
    setCells(snap.cells.map((c) => [...c]));
    setObstacles(snap.obstacles.slice());
    setCovered(new Set(snap.covered));
    setFrozen(snap.frozen);
    movesRef.current = snap.moves; setMoves(snap.moves);
    scoreRef.current = snap.score; setScore(snap.score);
    setCleared(snap.cleared);
    setSel(null);
    /**
     * §20.4: отмена = пересмотр плана. Снимок вернул и скрытость — вскрытое
     * отменённым ходом снова «?». К ДОСКЕ это честно (частичный откат хуже
     * отсутствия отката: ключи скрытости позиционные и обязаны совпадать с
     * той доской, которую вернули), а довод «отмена бесплатна, потому что
     * перебором ничего не разведаешь» на скрытом уровне не работает — здесь
     * разведка «сходил-посмотрел-отменил» реальна. Прятать её не надо: она
     * и есть пересмотр плана, и счётчик её считает.
     */
    if (hiddenHere) {
      hiddenStatsRef.current.planRevisions += 1;
      hiddenStatsRef.current.lastMove = null;   // сравнивать возврат через отмену не с чем
    }
    hapticTap(); sndPlace();
  };

  /**
   * Показать один ход. Подсказка НЕ ходит за человека: она подсвечивает товар и
   * нишу, а перекладывает он сам. Иначе это не подсказка, а автоигра.
   *
   * Ход не тратится: подсказка ничего не меняет на доске. Тратится счётчик
   * подсказок — их три, и это и есть цена.
   */
  const showHint = () => {
    if (hints <= 0 || phase !== 'playing') { hapticTap(); return; }
    /**
     * 🔴 ПОДСКАЗКА ЗОВЁТ РЕШАТЕЛЬ, А НЕ СВОЮ ФОРМУЛУ. Прежний `findHint` не знал ни
     * про строгую укладку, ни про настоящие ёмкости ниш: он звался с ёмкостью по
     * умолчанию (три) и предлагал ход в нишу на две. Человек тратил одну из трёх
     * подсказок, тащил товар туда, куда показали, — и не происходило ничего.
     *
     * ⚠️ И ПРОВЕРЯЕМ ХОД ТЕМ ЖЕ, ЧЕМ ИГРА ЕГО ПРИНИМАЕТ. Решатель считает доску по
     * своим правилам (в частности, схлопывает тройки по ходу), и расхождение с
     * экраном возможно. Пропускаем подсказку через `canPlaceInto` — ту самую
     * функцию, которая решает, случится ли перекладывание. Так «подсказка, которую
     * игра отвергает» невозможна по построению, а не по надежде.
     */
    const solved = hintMove(makeBoard(cells, capsForBoard(level, cells), jokersForBoard(level, cells)));
    const fromSolver: HintMove | null = solved && cellUsable(solved.from) && cellUsable(solved.to)
      && canPlaceInto(solved.from, solved.to)
      ? { fromCell: solved.from, fromIdx: (cells[solved.from]?.length ?? 1) - 1, toCell: solved.to }
      : null;
    const found = fromSolver ?? findHint(cells, cellUsable);
    if (!found || !canPlaceInto(found.fromCell, found.toCell)) { hapticTap(); return; }
    setHints((n) => n - 1);
    setHint(found);
    setSel(null);
    hapticTap(); sndPlace();
    // Гаснет сама: висящая подсказка перестаёт быть подсказкой и становится разметкой.
    setTimeout(() => setHint(null), 2600);
  };

  const reshuffle = () => {
    const items = cells.flat();
    if (items.length === 0) return;
    /**
     * 🔴 ПЕРЕМЕШАТЬ СТОИТ ХОД И ВЫДАЁТСЯ ТРИЖДЫ ЗА УРОВЕНЬ.
     *
     * Раньше кнопка была бесплатной и бесконечной. Вместе с гарантией «всегда
     * минимум две свободные ниши» это значило, что ПЛАНИРОВАТЬ НЕ ОБЯЗАТЕЛЬНО
     * НИ НА ОДНОМ УРОВНЕ: жадная стратегия «собирай пары» не может завести в
     * тупик, а если бы могла — есть бесплатный выход. Все препятствия и цели
     * обесценивались одной кнопкой.
     *
     * Три раза — не жадность: тупика по построению нет, значит перемешивание
     * это удобство, а не спасение. Ход списывается, чтобы на уровнях с целью
     * «уложись в ходы» цена была настоящей.
     */
    if (shuffles <= 0) { hapticTap(); return; }
    /**
     * Перемешивание кладёт снимок, как обычный ход: иначе отмена после него
     * вернула бы доску на ход НАЗАД от перемешивания — состояние, которого в
     * партии не было.
     *
     * 🔴 НО СЧЁТЧИК ПЕРЕМЕШИВАНИЙ ОТМЕНА НЕ ВОЗВРАЩАЕТ, и это главное. Верни
     * его — и выйдет «перемешал, не понравилось, отменил, перемешал заново»:
     * бесконечная перетасовка в обход трёх попыток. Отмена честна там, где
     * возвращает ровно то, что было (расклад открыт, перебором ничего не
     * разведаешь), и нечестна там, где даёт НОВЫЙ расклад. Потраченное
     * перемешивание потрачено.
     */
    history.push({
      cells: cells.map((c) => [...c]), obstacles: obstacles.slice(), covered: Array.from(covered),
      frozen, moves: movesRef.current, score: scoreRef.current, cleared,
    });
    setShuffles((n) => n - 1);
    movesRef.current += 1; setMoves(movesRef.current);
    // §20.4: перетасовка тоже трата хода — и тоже может оказаться первым
    // действием раздумья; а «возврат» после неё сравнивать не с чем.
    if (hiddenHere) {
      const st = hiddenStatsRef.current;
      if (st.firstMoveMs === null) st.firstMoveMs = Math.max(0, Math.round(gameNow() - startTime));
      st.lastMove = null;
    }
    const slots = gridRef.current.slots;
    const open: number[] = [];
    for (let i = 0; i < slots; i++) if (cellUsable(i)) open.push(i);
    const roomOpen = open.reduce((sum, i) => sum + capOf(i), 0);
    const dest = roomOpen >= items.length ? open : Array.from({ length: slots }, (_, i) => i);
    /**
     * 🔴 ЗДЕСЬ ПЕРЕМЕШИВАНИЕ ТЕРЯЛО ТОВАР, И ТЕРЯЛО МОЛЧА.
     *
     * Число корзин считалось как `items.length / CAP`, то есть «все ниши по
     * три». С 18-го уровня ниши бывают на ДВА (`capsFor`, `CAP_MIN`), и корзин
     * выходило меньше, чем нужно: товар, которому не нашлось места, не клался
     * НИКУДА — внутренний цикл просто заканчивался.
     *
     * Замер разбора 22.08.2026: 14–48 % нажатий теряли одну-две штуки. И это не
     * косметика: у типа оставалось две копии, тройка не собиралась НИКОГДА, и на
     * целях «убрать всё» уровень становился непроходимым — 47 % партий на 27-м
     * уровне, 48 % на 42-м, 44 % на 54-м. Человек видит две одинаковые банки,
     * которые ничем не убрать, и счётчик товаров, который вдруг стал меньше.
     *
     * Теперь корзины набираются по СОВОКУПНОЙ ёмкости, а не по числу, и в конце
     * стоит прямая сверка: не сошлось — берём все ниши и раскладываем заново.
     * Потерять товар молча нельзя.
     */
    const pickBins = (pool: number[]): number[] => {
      const order = shuffle(pool);
      const bins: number[] = [];
      let room = 0;
      for (const i of order) {
        if (room >= items.length) break;
        bins.push(i);
        room += capOf(i);
      }
      return bins;
    };
    let ns: number[][] = []; let guard = 0;
    do {
      const sh = shuffle(items);
      // Со второй половины попыток берём ВСЕ ниши: значит выборкой не сошлось.
      const bins = guard < 30 ? pickBins(dest) : Array.from({ length: slots }, (_, i) => i);
      ns = Array.from({ length: slots }, () => [] as number[]);
      let ci = 0;
      let lost = 0;
      for (const it of sh) {
        let placed = false;
        for (let tr = 0; tr < bins.length && !placed; tr++) {
          const c = bins[ci % bins.length]; ci++;
          if (ns[c].length < capOf(c)) { ns[c].push(it); placed = true; }
        }
        if (!placed) lost++;
      }
      guard++;
      if (lost === 0 && !ns.some((c) => tripleIn(c) !== null)) break;
    } while (guard < 60);
    /**
     * Последняя защита: если и за шестьдесят заходов расклад не сошёлся —
     * раскладываем подряд по всем нишам. Доска может выйти скучнее, но НИ ОДИН
     * товар не пропадёт, а пропажа хуже скуки: она делает уровень непроходимым.
     */
    if (ns.flat().length !== items.length) {
      ns = Array.from({ length: slots }, () => [] as number[]);
      let at = 0;
      for (const it of shuffle(items)) {
        while (at < slots && ns[at].length >= capOf(at)) at++;
        if (at >= slots) break;
        ns[at].push(it);
      }
    }
    /**
     * §20: тасовка перемешала и вскрытое — где теперь что лежит, неизвестно
     * заново, поэтому прячется вся глубина, как при раздаче. Это честно:
     * скрытость привязана к МЕСТУ, а не к товару, и после переезда знание
     * «в третьей нише под колой кефир» больше ничего не значит.
     * (Выборочные накрытия обычных уровней тасовка исторически не трогает —
     * их ключи после переезда глядят в случайные места; отдельный долг,
     * который эта правка не решает, чтобы не менять два режима разом.)
     */
    if (hiddenHere) setCovered(new Set(hideDeepSpots(ns)));
    setCells(ns); setSel(null); hapticTap();
    // Перемешивание списывает ход наравне с обычным — значит им тоже можно
    // израсходовать последний. Проверка здесь, а не выше: считать надо по
    // ГОТОВОЙ доске, иначе цель будет проверена по раскладу, которого уже нет.
    outOfMoves(ns);
  };

  // ── вёрстка ──────────────────────────────────────────────────────────
  /**
   * 🔴 ПОТОЛОК ШИРИНЫ ШКАФА ДЕРЖАЛ ТОВАРЫ МЕЛКИМИ НА БОЛЬШОМ ЭКРАНЕ.
   *
   * Было 900 px. На мониторе шириной 1900 шкаф занимал меньше половины ширины,
   * а размер товара считается от ширины НИШИ (три штуки в ряд) — значит и товар
   * упирался в этот же потолок. Репорт Вали 01.09.2026 «ужасно товары мелкие»
   * пришёл с телефона, но на десктопе беда та же и по другой причине.
   *
   * Ограничение всё же нужно: шкаф во всю ширину монитора растянул бы ниши в
   * коробки, а ряды по высоте за ним не поспевают. 1200 — вдвое больше высоты
   * типового окна, дальше пропорция ниши ломается.
   */
  // Замер поля вместо зашитого запаса: сколько контейнер реально дал (см. ниже).
  const [fieldH, setFieldH] = useState(0);
  /** Высота строки цели/подсказки — меряется, потому что она не постоянна (см. gsLayout). */
  const [hintH, setHintH] = useState(0);
  // Числа раскладки — из `gsLayout`: одна формула на игру и на гейт (см. её комментарий).
  const capWideHere = Math.max(...caps, CAP);
  const availH = Math.max(180, fieldH || height - 360);
  const LAY = gsLayout(width, availH, gridDim.cols, gridDim.rows, capWideHere, hintH || undefined);
  const boardW = LAY.boardW;
  const cellW = LAY.cellW;
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
  /**
   * ⚠️ РАЗМЕР ТОВАРА СЧИТАЕМ ПО САМОЙ ВМЕСТИТЕЛЬНОЙ НИШЕ УРОВНЯ, а не по CAP.
   * Со смешанной ёмкостью на доске есть ниши на четыре, и товар, посчитанный
   * под три, в них не поместится — четвёртый уедет за край.
   */
  const itemSize = LAY.itemSize;
  const itemH = LAY.itemH;
  const overlap = LAY.overlap;   // товары стоят внахлёст — см. `gsLayout`
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
  const SHELF_GAP = 9, SHELF_PAD = 9;
  /**
   * 🔴 ВЫСОТА НИШИ БЕРЁТСЯ ИЗ `gsLayout`, А НЕ СЧИТАЕТСЯ ЗДЕСЬ ЗАНОВО.
   *
   * 📍 Тут стояла ВТОРАЯ копия формулы — со своим потолком 1,9 (в `gsLayout`
   * 2,2), своим вычитанием отступов и своими зашитыми 44 px на строку цели.
   * Рисовала экран по этой копии, а гейт вписывания мерил `gsLayout`: гейт
   * шесть недель проверял формулу, которой на экране нет. Отчёт Вали
   * 05.09.2026 со скриншотом обрезанного нижнего ряда: «кошмар просто кошмар»,
   * и все пробы при этом зелёные — потому что мерили не то.
   *
   * Копия формулы расходится с оригиналом молча. В этом файле такое уже
   * случалось дважды: `height - 360` вместо замера поля и своя ширина ряда в
   * самом гейте. Формула теперь одна, и гейт меряет ту, что рисует.
   */
  const nicheH = LAY.nicheH;

  /**
   * Снимок партии для жеста. PanResponder создан один раз и замкнул первый
   * рендер — сюда кладём то, что он обязан видеть СЕЙЧАС: геометрию (иначе
   * попадание считалось бы по сетке первого уровня), доску, маску и сам ход.
   *
   * ⚠️ Числа берём ТЕ ЖЕ, что уходят в стиль ниши парой строк ниже (`cellW`,
   * `nicheH`) и в `styles.cabinet` (padding/gap = 9). Отсюда `SHELF_PAD` и
   * `SHELF_GAP`, а не свои константы: разъедутся — перетаскивание начнёт
   * промахиваться мимо ниши тем сильнее, чем дальше от левого верхнего угла.
   */
  liveRef.current = {
    geom: { cols: gridDim.cols, rows: gridDim.rows, cellW, nicheH, pad: SHELF_PAD, gap: SHELF_GAP, boardW },
    itemSize, overlap, mask, cells,
    /**
     * ⚠️ Размер товара для КОНКРЕТНОЙ ниши. С тех пор как он считается по её
     * собственной вместимости, единого числа на доску не существует, а
     * `itemAtX` делит нишу по шагу ряда — подставь чужой размер, и палец
     * попадёт не в тот товар, причём ошибка будет расти к правому краю.
     */
    itemSizeOf: (i: number) => LAY.itemBox(capOf(i)).w,
    covered,
    usable: cellUsable,
    // Жест обязан звать СВЕЖИЙ moveItem: старый замкнул прошлую доску и переложил бы
    // товар по позапрошлому состоянию.
    move: moveItem,
    // Пока не идёт партия или висит карточка итога — жест выключен целиком.
    live: phase === 'playing' && levelBanner === null,
  };

  // Полка целиком: «Полка 4: кола, кола, пусто» — по этой строке незрячий
  // игрок понимает, где уже есть пара и куда нести третий товар.
  const ru = language === 'ru';
  /**
   * Имя товара для скринридера. Скрытый и накрытый НЕ называются: назвать —
   * значит выдать незрячему то, что зрячему не показано, и вся механика
   * неполной информации для него исчезнет. «?» язык-нейтрален (озвучивается
   * самим скринридером на языке системы), словаря не требует.
   */
  const spokenGood = (i: number, s: number, tp: number): string =>
    covered.has(`${i}:${s}`) ? '?' : goodName(tp, ru);
  /**
   * 🔴 ПОДПИСЬ НИШИ НАЗЫВАЕТ И ПРЕПЯТСТВИЕ, А НЕ ТОЛЬКО ТОВАР.
   *
   * Замок, цепь со счётчиком и примёрзший ряд нарисованы поверх ниши — зрячий
   * видит их сразу. Незрячему до 31.08.2026 не сообщалось НИЧЕГО: подпись
   * говорила «Полка 6: пусто», человек выбирал её и получал отказ без причины.
   * Пустая и запертая звучали одинаково, хотя вести себя обязаны по-разному.
   *
   * ⚠️ Порядок частей неслучаен: сначала место, потом СОСТОЯНИЕ, потом
   * содержимое. Скринридер читают на бегу и часто обрывают — важное вперёд.
   */
  const obstacleWord = (i: number): string | null => {
    const o = obstacles[i];
    if (o?.kind === 'blocked') return t('a11yShelfBlocked');
    if (o?.kind === 'locked') return `${t('a11yShelfOpensIn')} ${o.movesLeft} ${t('movesLabel')}`;
    if (frozen && rowOfCell(i) === frozen.row) return t('a11yShelfFrozen');
    return null;
  };
  const cellLabel = (i: number, cell: number[]) => {
    const where = `${t('a11yShelf')} ${i + 1}`;
    const state = obstacleWord(i);
    const what = cell.length ? cell.map((tp, s) => spokenGood(i, s, tp)).join(', ') : t('a11yEmpty');
    return state ? `${where}, ${state}: ${what}` : `${where}: ${what}`;
  };

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
    /**
     * 🔴 §20.4: на уровне скрытой информации звёзды НЕ считаются от ходов.
     * Эталона нет, а «недодать звезду за лишние ходы» — это и есть посчитать
     * ходы сверх минимума, только через чёрный ход: любая формула от moves
     * была бы тем самым запрещённым сравнением. Поэтому константа — полный
     * зачёт за пройденный уровень; две звезды константой читались бы как
     * «где-то недожал» без единого способа дожать.
     */
    if (hiddenInfo(L)) return 3;
    const пулУр = poolForLevel(L, poolRef.current);
    const cfg = levelCfg(L, пулУр.length, narrowRef.current);
    /**
     * 🔴 ПОРОГИ СЧИТАЮТСЯ ОТ МИНИМУМА, А НЕ ОТ ДОЛИ ЭТАЛОНА.
     *
     * Было «три звезды за ходов ≤ 0,6 × эталон». Замер 02.09.2026 поиском A*:
     * такой порог ниже реального минимума, и высшая оценка была **недостижима на
     * 95 % досок** (21 из 22) — сколько угодно хорошая игра давала две звезды.
     *
     * Теперь эталон — это сам минимум (точный, если фоновый расчёт успел, иначе
     * калиброванный по замеру), а звёзды меряют, насколько игрок к нему близок:
     *   до +15 % сверх минимума — три · до +60 % — две · дальше — одна.
     * Эти доли и есть «сыграл почти идеально / хорошо / прошёл».
     */
    const точный = exactMinRef.current;
    return starsForMoves(moves, точный ?? moveReference(cfg));
  };

  /**
   * Смещение дрожащей ниши. Отдельной функцией, чтобы `renderCell` не оброс
   * ещё одним тернарником: дрожит всегда максимум одна ниша.
   */
  const shakeStyle = (i: number) =>
    shakeCell === i
      ? { transform: [{ translateX: shake.interpolate({ inputRange: [-1, 1], outputRange: [-7, 7] }) }] }
      : null;

  const renderCell = (i: number) => {
    const cell = cells[i] || [];
    const isSelCell = sel?.cell === i;
    /**
     * Подсветка ниши с парой — ОБУЧАЮЩАЯ, а не постоянная. Она честно
     * показывает «сюда третий», и на первых уровнях это ровно то, что надо
     * объяснить. Но дальше она снимает половину зрительного поиска: искать
     * глазами уже не нужно, достаточно идти по зелёным рамкам. В тренажёре это
     * убирает как раз ту работу, ради которой сюда приходят. С шестого уровня
     * гаснет — там же, где начинаются препятствия.
     */
    const close = hasPair(cell) && pairHintVisible(level);
    /**
     * «Что в руке» — общее для обоих способов хода: поднятый пальцем товар или
     * выбранный тапом. Дальше вопрос один и тот же, и отвечает на него один и
     * тот же `canPlaceInto`, а не две похожие формулы.
     */
    const held = drag ?? sel;
    /** Подсветка «сюда можно» — одна на оба способа хода: `held` уже покрывает и тап, и палец. */
    const canDrop = !!held && canPlaceInto(held.cell, i);
    /** Ниша прямо под пальцем и туда МОЖНО — самая яркая рамка: сюда и ляжет. */
    const aimed = !!drag && hover === i && canDrop;
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
          borderColor: hint?.toCell === i ? '#38bdf8'
            : aimed ? '#f97316' : canDrop ? '#fbbf24' : close ? '#22c55e' : 'transparent',
          borderWidth: hint?.toCell === i ? 4 : aimed ? 4 : canDrop || close ? 3 : 0,
          /**
           * 🔴 СВЕЧЕНИЕ, А НЕ ТОЛЬКО РАМКА (пункт 1.7 карты дорог).
           *
           * У эталона жанра нужное место светится, и это видно боковым зрением —
           * рамка требует смотреть прямо на неё. Разница заметнее всего на подсказке:
           * человек её попросил, то есть уже не понимает, куда смотреть.
           *
           * ⚠️ Свечение НЕ добавляет нового смысла: у него тот же цвет, что у рамки.
           * Иначе оно стало бы вторым каналом, который надо расшифровывать.
           */
          ...(hint?.toCell === i || aimed
            ? { shadowColor: hint?.toCell === i ? '#38bdf8' : '#f97316', shadowOpacity: 0.85, shadowRadius: 12, shadowOffset: { width: 0, height: 0 }, elevation: 10 }
            : null),
        }, shakeStyle(i)]}>
        {/*
          🔴 СКОЛЬКО ВЛЕЗЕТ — ДОЛЖНО БЫТЬ ВИДНО ДО ХОДА.
          Со смешанной ёмкостью ниши выглядят одинаково, и человек узнавал бы о
          вместимости, только не сумев положить, — то есть механика превращалась
          бы в угадайку. Насечки по низу ниши показывают число мест. Рисуем их
          только на уровнях со смешанной ёмкостью: там, где все ниши одинаковы,
          это лишний шум.
        */}
        {mixedCaps && (
          <View pointerEvents="none" style={styles.slots}>
            {Array.from({ length: capOf(i) }).map((_, k) => (
              <View key={k} style={[styles.slotMark, k < cell.length && styles.slotTaken]} />
            ))}
          </View>
        )}
        {/*
          🔴 ДЖОКЕР ОБЯЗАН БЫТЬ ВИДЕН ДО ХОДА, А НЕ ПОСЛЕ.
          Он снимает правило укладки, и без метки об этом можно узнать
          единственным способом — попробовать положить чужой товар и увидеть,
          что вышло. Это ровно та угадайка, из-за которой рядом рисуются насечки
          ёмкости. Звезда стоит в углу ниши и повторяется в тексте правила.
        */}
        {isJokerNiche(i) && (
          <View pointerEvents="none" style={styles.jokerMark}>
            <Text style={styles.jokerStar}>★</Text>
          </View>
        )}
        {/* Свечение на сборе тройки: тёплая золотая волна, которая гаснет. Рисуется
            поверх уже опустевшей ниши, поэтому объясняет, ЧТО именно исчезло и откуда.
            Было белым в 85 % непрозрачности — Денис 02.09.2026: «полка мигает белым,
            когда 3 сходятся»; на тёмном шкафу это читалось как сбой отрисовки. */}
        {flashCells.includes(i) && (
          <Animated.View pointerEvents="none"
            style={[styles.flash, { opacity: flash.interpolate({ inputRange: [0, 1], outputRange: [0, 0.42] }) }]} />
        )}
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
          {/* Размер товара — по вместимости ЭТОЙ ниши (см. `itemBox` в `gsLayout`):
              одна ниша на четыре не имеет права ужимать весь шкаф. */}
          {cell.map((tp, s) => {
            const { w: iS, h: iH } = LAY.itemBox(capOf(i));
            const selected = isSelCell && sel?.idx === s;
            /** Товар, который советует подсказка: подсвечен вместе со своей нишей-целью. */
            const hinted = hint?.fromCell === i && hint?.fromIdx === s;
            // Товар, который сейчас в руке, на полке гаснет: он нарисован под
            // пальцем, и две копии одного товара читаются как сбой отрисовки.
            const inHand = drag?.cell === i && drag?.idx === s;
            /** Товар в полёте: настоящий скрыт, пока летит копия — иначе на экране две штуки. */
            const arriving = fly?.toCell === i && s === cell.length - 1;
            return (
              <TouchableOpacity key={s} activeOpacity={0.7} onPress={() => handleItemTap(i, s)}
                accessibilityRole="button"
                accessibilityLabel={`${spokenGood(i, s, tp)}, ${t('a11yShelf')} ${i + 1}`}
                accessibilityState={{ selected }}
                style={[styles.itemSlot, {
                  width: iS, height: iH,
                  /**
                   * 🔴 ВНАХЛЁСТ, А НЕ ВСТЫК — И ПЕРЕДНИЙ ПОВЕРХ ЗАДНЕГО.
                   *
                   * Отрицательный отступ сдвигает каждый следующий товар под
                   * предыдущий; за счёт этого товар помещается КРУПНЕЕ (см.
                   * `OVERLAP` в `gsLayout`). Порядок наложения обязателен: без
                   * убывающего `zIndex` следующий товар накрывал бы предыдущий,
                   * и получилась бы полка, растущая «из экрана к зрителю» —
                   * читается как ошибка отрисовки, а не как глубина.
                   *
                   * ⚠️ Выбранный и подсказанный поднимаются НАД всеми: их рамку
                   * нельзя прятать под соседним товаром, иначе подсветка теряется
                   * ровно в тот момент, когда она нужна.
                   */
                  marginLeft: s === 0 ? 0 : -Math.round(iS * overlap),
                  zIndex: (selected || hinted) ? 20 : Math.max(1, 10 - s),
                },
                selected && styles.itemSel, hinted && styles.itemHint, inHand && { opacity: 0.2 }, arriving && { opacity: 0 }]}>
                {covered.has(`${i}:${s}`) ? (
                  hiddenHere ? (
                    /**
                     * «?» РЕЖИМА СКРЫТОЙ ИНФОРМАЦИИ (§20) — не силуэт. Силуэт
                     * оставляет форму, то есть половину ответа (бутылку от
                     * мишки отличит и тень); здесь неизвестен даже контур.
                     * Рисовать скрытое силуэтом значило бы тихо ослабить режим
                     * до «накрытого товара» с восьмого уровня.
                     */
                    <UnknownGood width={iS} height={iH - 2} />
                  ) : (
                  /**
                   * НАКРЫТЫЙ ТОВАР: силуэт есть, что именно — не видно.
                   * Рисуем ту же картинку с нулевой яркостью (tintColor) —
                   * форма сохраняется, а значит человек видит, ЧТО там что-то
                   * стоит и какой оно формы, но не какой это товар. Это и есть
                   * неполная информация: надо запомнить, что открылось.
                   */
                  <Image {...a11yDecor} source={GOOD_SPRITES[tp % GOOD_SPRITES.length]}
                    style={{ width: iS, height: iH - 2, tintColor: 'rgba(35,20,8,0.82)' }}
                    resizeMode="contain" />
                  )
                ) : (
                  <GoodIcon type={tp} width={iS} height={iH - 2} />
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
        {obstacles[i]?.kind === 'locked' && (() => {
          const осталось = (obstacles[i] as { movesLeft: number }).movesLeft;
          /**
           * Трещины растут по мере отсчёта (пункт 1.8). Полного числа ходов замок
           * не помнит — берём отсчёт от пяти: столько стоит замок в планах уровня,
           * а если досталось больше, первые ходы просто не дают трещин.
           */
          const разрушено = Math.max(0, Math.min(1, (5 - осталось) / 5));
          return (
            <>
              <View pointerEvents="none" style={styles.obstacle}>
                <Ionicons name="time" size={Math.min(22, itemSize)} color="#f8e3c4" />
                <Text style={styles.obstacleNum}>{осталось}</Text>
              </View>
              <Cracks size={Math.min(cellW, nicheH)} progress={разрушено} cellKey={i} />
            </>
          );
        })()}
        {frozen && rowOfCell(i) === frozen.row && (
          <View pointerEvents="none" style={[styles.obstacle, styles.frost]}>
            <Ionicons name="snow" size={Math.min(22, itemSize)} color="#e8f6ff" />
          </View>
        )}
      </ImageBackground>
    );
  };

  /**
   * ПО КАКОМУ УРОВНЮ СЧИТАТЬ ОТКРЫТОЕ. Берём ДОСТИГНУТЫЙ потолок (`lvl.best`),
   * а не тот, на котором сейчас играют: `lvl.level` отдаёт выбранный на тропинке
   * уровень, и переигровка третьего после честной двенадцатки отобрала бы все
   * наборы разом. Второго счётчика прогресса тут нет и не заводится — только
   * usePersistentLevel('goods_sort'), тот же, что двигает саму игру.
   */
  const reachedLevel = Math.max(lvl.best, level);

  const renderConfig = () => (
    <>
    <ScrollView style={styles.configScroll} contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={GRADIENT as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.configCard}>
        <Ionicons name="basket" size={48} color="#3f2b00" />
        <Text style={styles.configTitle}>{t('goodsSort')}</Text>
        <Text style={styles.configDesc}>{t('goodsSortDesc')}</Text>
      </LinearGradient>
      <GameAbout descriptionKey="goodsSortIntroDesc" benefits={GOODS_BENEFITS} accent={GRADIENT[0]} />

      {/*
        ВЫБОР ТОВАРОВ. Рядами по два, а не пятёркой в строку: на телефоне пятёрка
        даёт карточку в 53-59px, куда не влезают ни узнаваемая миниатюра, ни слово
        «Молочное» (разбор с замерами — у setThumbBox). Размеров в пикселях здесь
        нет намеренно: ширину миниатюры даёт flex, высоту — aspectRatio.
      */}
      <View style={[styles.optionCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{t('goodsSetsLabel')}</Text>
        {setRows(GOOD_SETS).map((row, ri) => (
          <View key={`setrow${ri}`} style={styles.setRow}>
            {row.map((s, ci) => {
              if (!s) return <View key={`gap${ci}`} pointerEvents="none" style={[styles.setBtn, styles.setBtnGhost]} />;
              const on = setKey === s.key;
              const open = setAvailable(s.key, reachedLevel, grantedSet);
              const when = t('goodsSetFromLevel').replace('{n}', String(setUnlockLevel(s.key)));
              const sub = `🛒 ${s.pool.length}${s.alike ? ` · ${t('goodsSetAlike')}` : ''}`;
              return (
                <TouchableOpacity
                  accessibilityRole="button" accessibilityState={{ selected: on, disabled: !open }}
                  accessibilityLabel={`${t('goodsSet_' + s.key)} — ${sub}${open ? '' : ` · ${when}`}`}
                  disabled={!open}
                  key={s.key} activeOpacity={0.85} onPress={() => { setSetKey(s.key); hapticTap(); }}
                  style={[styles.setBtn, { borderColor: on ? GRADIENT[0] : colors.border, backgroundColor: on ? '#fff7e0' : colors.card }]}>
                  <View style={styles.setPreview}>
                    {s.preview.slice(0, THUMBS_PER_CARD).map((p) => (
                      <View key={p} style={[styles.setThumb, open ? null : styles.setThumbLocked]}><GoodIcon type={p} width="100%" height="100%" /></View>
                    ))}
                  </View>
                  <View style={styles.setNameRow}>
                    <Ionicons name={open ? s.icon : 'lock-closed'} size={15} color={on ? '#d97706' : colors.textSecondary} />
                    <Text style={[styles.setBtnText, { color: on ? '#92600a' : colors.textSecondary }]}>{t('goodsSet_' + s.key)}</Text>
                  </View>
                  <Text style={[styles.setBtnSub, { color: on ? '#a97a1f' : colors.textSecondary }]}>{sub}</Text>
                  {/*
                    🔴 ЗАКРЫТАЯ КАРТОЧКА ГОВОРИТ СРОК, А НЕ ПРОСТО СЕРЕЕТ. Что
                    откроется — видно по витрине, имени и числу видов (строка
                    выше, она остаётся у всех). Когда — вот эта строка. Обещание
                    без срока раздражает сильнее, чем отсутствие набора.
                  */}
                  {!open && (
                    <Text style={[styles.setBtnWhen, { color: colors.textSecondary }]}>{when}</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
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
      <LevelProgressMap bestLevel={lvl.best}
        gameId="goods_sort"
        currentLevel={level}
        maxLevel={Math.max(15, level, lvl.best)}
        onPickLevel={lvl.pick}
        colors={colors}
        language={language}
      />

    </ScrollView>
    {/* Полоса прибита книзу: «Начать» видно сразу, без прокрутки до конца.
        Отчёт Дениса 02.09.2026 — «не мотать экран вниз, чтобы запустить». */}
    <GameSetupBar label={t('start')} onStart={startGame}
      colors={GRADIENT as [string, string]} tint="#3f2b00" />
    </>
  );

  // игровая фаза — на едином каркасе GameShell: HUD-бейджи в статс-строке, служебные
  // действия (отмена/подсказка/перемешать) — в шапке; модалка правил уровня поверх
  // каркаса (паттерн digit-span)
  if (phase === 'playing') {
    return (
      <View style={{ flex: 1 }}>
        <GameShell
          title={t('goodsSort')}
          onBack={() => goBackOrHome()}
          /**
           * Выход из живой партии больше не молчит. Спрашиваем только когда терять
           * действительно есть что: на свежем, ещё не тронутом складе вопрос был бы
           * шумом (см. goodsHasSomethingToLose). `resumable` здесь правда — потому
           * текст и обещает продолжение: партия ложится в хранилище ещё до вопроса,
           * а не после ответа.
           */
          confirmExit={armed}
          resumable
          onSaveBeforeExit={saveParty}
          /**
           * 🔴 СЛУЖЕБНЫЕ КНОПКИ ВНИЗУ: ОТВЕТ ЗДЕСЬ ДАЮТ ПАЛЬЦЕМ ПО ПОЛЮ.
           *
           * Правило каркаса «низ = ответ игрока» уточнено 02.09.2026: низ
           * принадлежит ответу, а там, где ответа кнопками нет, он достаётся
           * служебному. В сортировке отвечают перетаскиванием товара, нижняя
           * полоса пустовала — и три кнопки жили сверху, отнимая у поля целую
           * строку (репорт Вали 01.09.2026: «товары мелкие, текст сверху очень
           * крупно»).
           *
           * Смешения в одной игре не возникает: ответа-кнопок здесь нет вовсе,
           * поэтому рефлекс «низ — это мой ответ» тут не за что зацепиться.
           */
          bottom="actions"
          /**
           * 🔴 МОДИФИКАТОРЫ УРОВНЯ — ЗНАЧКАМИ, А НЕ СТРОКОЙ ТЕКСТА.
           *
           * Раньше «Примёрзший ряд», «Строгая укладка» и «Скрытый товар»
           * занимали в шапке целую строку словами. На кадре Вали 01.09.2026 эта
           * строка стоит четвёртой сверху — а всё, что она сообщает, умещается
           * в один кружок со снежинкой.
           *
           * Слово никуда не делось: оно в подписи для скринридера и в кнопке
           * правил уровня, которая стоит рядом со служебными. Значок отвечает
           * на вопрос «что тут необычного», подробности — по нажатию.
           */
          mods={modsHere}
          /**
           * 🔴 ЧЕТЫРЕ СЧЁТЧИКА ВМЕСТО ШЕСТИ — И ЭТО ДАННЫЕ, А НЕ ВЁРСТКА.
           *
           * Репорт Вали 01.09.2026: «ужасно товары мелкие, при этом текст сверху
           * очень крупно». На кадре шесть бейджей ломались во второй ряд, и поле
           * оставалось на трети экрана.
           *
           * Что убрано и почему:
           * · счётчик ОСТАВШИХСЯ ТОВАРОВ — он дублирует само поле: сколько их,
           *   видно глазами, а цифра занимает место, которое нужно товарам;
           * · бейдж правила уровня уехал к служебным кнопкам: он их родня —
           *   открывает справку, а не сообщает число.
           *
           * Что осталось: уровень · счёт · ходы (только когда есть лимит) · цель
           * (только когда она измерима). Больше четырёх каркас и не покажет.
           */
          hud={(() => {
            const ml = moveLimitRef.current;
            const left = ml > 0 ? Math.max(0, ml - moves) : null;
            const hot = left !== null && (left <= 3 || left <= ml * 0.2);
            const warm = left !== null && !hot && left <= ml * 0.35;
            const gp = goalProgress(cells, goal);
            const items: HudItem[] = [
              { key: 'level', icon: 'pricetag', label: t('goodsLevel'), value: level },
              { key: 'score', icon: 'star', label: t('score'), value: score, pop: true },
            ];
            // Ходы показываем ТОЛЬКО там, где есть лимит: без лимита это
            // справка «сделано столько-то», ради которой место не тратят.
            if (ml > 0) items.push({
              key: 'moves', icon: 'swap-horizontal', label: t('hud_moves'),
              value: `${moves}/${ml}`, tone: hot ? 'bad' : warm ? 'warn' : 'neutral',
            });
            if (gp) items.push({
              key: 'goal', icon: 'flag', label: t('goalLabel'),
              value: `${gp.done}/${gp.total}`, tone: 'warn',
            });
            return items;
          })()}
          /*
            🔴 ВСЕ ТРИ СЛУЖЕБНЫЕ КНОПКИ СОБРАНЫ В ОДНО МЕСТО. Отмена и подсказка
            и раньше стояли в шапке — но ВНУТРИ строки счётчиков, вперемешку с
            бейджами уровня и очков: кнопка среди табло не читается как кнопка.
            «Перемешать» при этом жило внизу с обоснованием «низ свободен».

            Оба решения сняты одним правилом: низ каркаса означает ОТВЕТ игрока,
            а отвечают здесь на поле — перетаскивая товар. Перетасовка, отмена и
            подсказка тратят лимит и перекладывают доску, то есть трогают игру,
            и все трое — служебные. Теперь они в одном ряду, счётчики отдельно,
            нижней полосы у сортировки нет.
          */
          headerActions={
            <GameAuxBar>
              <GameAuxAction
                icon="arrow-undo" tint="#d97706" ladder="undo" label={t('btn_undo')}
                disabled={!history.canUndo} onPress={undoMove}
              />
              {/* Остаток подсказок на кнопке: цена видна ДО нажатия, а не после. */}
              <GameAuxAction
                icon="bulb" tint="#0284c7" ladder="hint" label={t('btn_hint')} count={hints}
                disabled={hints <= 0} onPress={showHint}
              />
              <GameAuxAction
                icon="shuffle" tint="#d97706" label={t('shuffleBtn')} count={shuffles}
                disabled={shuffles <= 0} onPress={reshuffle}
              />
              {/* Правило уровня переехало из строки счётчиков сюда: оно
                  открывает справку, то есть родня служебным кнопкам, а не
                  число среди чисел. */}
              {!isPreset && <LevelRuleBadge lr={levelRules} color="#d97706" ru={language === 'ru'} />}
            </GameAuxBar>
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
            {/*
              🔴 ТУПИК НАЗЫВАЕТСЯ ВСЛУХ И ВЫТЕСНЯЕТ ВСЁ ОСТАЛЬНОЕ. Проверки тупика
              в игре не было вовсе: доска могла встать, и человек тыкал в мёртвую
              доску, не понимая, что произошло. Сообщение важнее и цели, и правила
              игры — они отвечают на вопрос, которого сейчас нет.
            */}
            {/* Высота этой строки уходит в `gsLayout`: она не постоянна — цель
                «собрать тройки» несёт значки товаров и умеет переноситься. */}
            <View onLayout={(e) => {
              const h = Math.round(e.nativeEvent.layout.height);
              setHintH((prev) => (Math.abs(prev - h) > 4 ? h : prev));
            }}>
            {deadEnd ? (
              <Text style={[styles.hintText, { color: colors.error, fontWeight: '700' }]}>
                {t('goodsSortDeadEnd')}
              </Text>
            ) : level < 5 ? (
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
            </View>
            {/*
              🔴 ОДИН ШКАФ, А НЕ СТОПКА ОТДЕЛЬНЫХ ПОЛОК.
              Денис 19.08: «у них пусто между полками нет, у тебя есть». Верно:
              в эталоне это цельный короб с сеткой ниш — ряды разделяет доска
              толщиной в несколько пикселей, а не пустой фон. Отдельные планки с
              воздухом между ними читаются как таблица, а не как мебель.
              Поэтому теперь одна рама на все ряды, внутри — сетка без зазоров
              по вертикали, разделители рисуются самими нишами.
            */}
            {/*
              Жест висит на ОБЁРТКЕ, а не на самом шкафу: замер положения идёт
              через `getBoundingClientRect`, а это метод DOM-узла. Обычный View в
              вебе отдаёт узел ссылкой, LinearGradient — свой компонент, и на нём
              такой гарантии нет. Обёртка ужимается по шкафу (fieldCol центрирует),
              так что её прямоугольник и есть прямоугольник доски.
            */}
            <View ref={boardRef} {...pan.panHandlers}>
            <LinearGradient colors={['#f6e3c6', '#e0b98a']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
              style={[styles.cabinet, { width: boardW }]}>
              {Array.from({ length: gridDim.rows }).map((_, row) => (
                /**
                 * Ряд уезжает в свою сторону: чётные влево, нечётные вправо — так
                 * доска раскрывается, а не сползает одним куском. Сдвиг считаем от
                 * ширины поля, чтобы на любом экране ряды ушли ЗА край, а не
                 * остановились посередине.
                 */
                <Animated.View
                  key={row}
                  style={[styles.shelfRow, {
                    opacity: scatter.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
                    transform: [{
                      translateX: scatter.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, (row % 2 === 0 ? -1 : 1) * (boardW + 60)],
                      }),
                    }],
                  }]}>
                  {Array.from({ length: gridDim.cols }).map((_, col) => {
                    const pos = row * gridDim.cols + col;
                    /**
                     * Вырезанная форма — не дырка, а СПЛОШНАЯ ДОСКА шкафа.
                     *
                     * ⚠️ Раньше здесь стояла прозрачная распорка, и сквозь неё
                     * светил фон короба. Отзыв Дениса дословно: «шкаф старый с
                     * дырами», «хули с ним случилось» — и он прав: с третьего
                     * уровня форма вырезает ниши (крест, рамка, лесенка,
                     * катушка), и на их месте зияли пустые бежевые пятна.
                     * Читалось это не как «шкаф такой формы», а как «шкаф
                     * недорисован».
                     *
                     * Ширину распорки сохраняем — ряд не должен съезжать, иначе
                     * фигура перестанет читаться, — но заливаем деревом с
                     * бликом сверху и тенью снизу, как у настоящей доски.
                     */
                    if (!mask[pos]) {
                      return (
                        <LinearGradient key={`gap-${pos}`}
                          colors={['#e9cda6', '#d3a878']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
                          style={[styles.plank, { width: cellW, height: nicheH }]}>
                          {/* Две линии волокна на четверти высоты — ровно столько, чтобы
                              дерево читалось деревом и не начало спорить с товарами. */}
                          <View pointerEvents="none" style={[styles.plankGrain, { top: nicheH * 0.28 }]} />
                          <View pointerEvents="none" style={[styles.plankGrain, { top: nicheH * 0.66 }]} />
                        </LinearGradient>
                      );
                    }
                    // Ячейки нумеруются по СУЩЕСТВУЮЩИМ нишам: генератор не знает
                    // про дырки и отдаёт плотный список.
                    let idx = 0;
                    for (let k = 0; k < pos; k++) if (mask[k]) idx++;
                    return renderCell(idx);
                  })}
                </Animated.View>
              ))}
            </LinearGradient>
            </View>
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
                  /* За что засчитали: на целях «убрать названные» и «освободи нишу»
                     доска остаётся частично полной, и без этой строки победа
                     читается как преждевременный конец (отчёт Дениса 04.09). */
                  reasonLine={(() => {
                    const ц = levelBanner > 0 ? goalPlan(levelBanner) : null;
                    if (!ц || ц.kind === 'all' || levelBanner === -1) return undefined;
                    return ц.kind === 'pick' ? t('goalDonePick')
                      : ц.kind === 'free' ? t('goalDoneFree')
                      : t('goalDoneMoves');
                  })()}
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
        {/*
          ТОВАР В РУКЕ. Слой лежит рядом с GameShell, а не внутри поля, потому
          что жест отдаёт координаты ОКНА (pageX/pageY): корневой View занимает
          весь экран, и `left:0/top:0` в нём совпадает с началом этих координат.
          Положи слой внутрь поля — товар уехал бы на высоту шапки.
          Сдвиг вверх и влево ставит товар НАД пальцем: под пальцем его не видно,
          а видеть надо — по нему и целятся. pointerEvents='none' обязателен,
          иначе слой перехватывает собственный жест у доски под ним.
        */}
        {/* Летящая копия. Тот же слой, что и у товара под пальцем, и та же причина:
            рисовать поверх доски, не влезая в её вёрстку. */}
        {fly && (
          <Animated.View pointerEvents="none" style={[styles.dragLayer, {
            transform: [
              { translateX: flyAt.interpolate({ inputRange: [0, 1], outputRange: [fly.ax, fly.bx] }) },
              { translateY: flyAt.interpolate({ inputRange: [0, 1], outputRange: [fly.ay, fly.by] }) },
            ],
          }]}>
            {/* Летящий товар меряется нишей, КУДА он летит: иначе он приземлится
                другого размера, чем стал бы на полке, и посадка дёрнется. */}
            <View style={{ transform: [{ translateX: -LAY.itemBox(capOf(fly.toCell)).w / 2 }, { translateY: -LAY.itemBox(capOf(fly.toCell)).h / 2 }] }}>
              {/* Скрытый летит «?», а не силуэтом: тип вскрывается ПРИБЫТИЕМ на
                  фронт ниши-цели, и показать его в полёте значило бы вскрыть
                  на 200 мс раньше — а на скорости полёта это уже подглядка. */}
              {fly.covered ? (
                hiddenHere ? (
                  <UnknownGood width={itemSize} height={itemH - 2} />
                ) : (
                <Image {...a11yDecor} source={GOOD_SPRITES[fly.type % GOOD_SPRITES.length]}
                  style={{ width: itemSize, height: itemH - 2, tintColor: 'rgba(35,20,8,0.82)' }} resizeMode="contain" />
                )
              ) : (
                <GoodIcon type={fly.type} width={itemSize} height={itemH - 2} />
              )}
            </View>
          </Animated.View>
        )}
        {drag && (
          <Animated.View pointerEvents="none"
            style={[styles.dragLayer, { transform: [{ translateX: dragPos.x }, { translateY: dragPos.y }] }]}>
            {/* Призрак под пальцем — размера той ниши, ОТКУДА товар взяли. */}
            <View style={[styles.dragGhost, { width: LAY.itemBox(capOf(drag.cell)).w, height: LAY.itemBox(capOf(drag.cell)).h, marginLeft: -LAY.itemBox(capOf(drag.cell)).w / 2, marginTop: -LAY.itemBox(capOf(drag.cell)).h - 10 }]}>
              {/* Под пальцем скрытый — тоже «?»: поднять товар ещё не значит
                  вскрыть, вскрывает только укладка (см. полёт выше). */}
              {covered.has(`${drag.cell}:${drag.idx}`) ? (
                hiddenHere ? (
                  <UnknownGood width={itemSize} height={itemH - 2} />
                ) : (
                <Image {...a11yDecor} source={GOOD_SPRITES[drag.type % GOOD_SPRITES.length]}
                  style={{ width: itemSize, height: itemH - 2, tintColor: 'rgba(35,20,8,0.82)' }}
                  resizeMode="contain" />
                )
              ) : (
                <GoodIcon type={drag.type} width={itemSize} height={itemH - 2} />
              )}
            </View>
          </Animated.View>
        )}
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
        <View style={{ width: HELP_CORNER_SPACE }} />
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
  configContainer: { padding: 16, gap: 14, paddingBottom: 16 + SETUP_BAR_SPACE },
  configCard: { padding: 24, borderRadius: 16, alignItems: 'center', gap: 8 },
  configTitle: { fontSize: 22, fontWeight: '700', color: '#3f2b00' },
  configDesc: { fontSize: 13, color: '#3f2b00', opacity: 0.85, textAlign: 'center' },
  optionCard: { padding: 16, borderRadius: 12, gap: 10 },
  optionLabel: { fontSize: 14, fontWeight: '600' },
  setRow: { flexDirection: 'row', gap: 8 },
  /**
   * ⚠️ paddingHorizontal и borderWidth здесь ОБЯЗАНЫ совпадать с BTN_EDGE, а
   * gap в setPreview — с THUMB_GAP: по этим числам считается размер миниатюры.
   * Разойдутся — витрина снова вылезет за карточку, и молча.
   */
  setBtn: { minHeight: 48, flex: 1, borderRadius: 16, borderWidth: 2, paddingVertical: 10, paddingHorizontal: 8, alignItems: 'center', gap: 4, overflow: 'hidden' },
  /**
   * Пустое место вместо пятого набора. 🔴 Это ТОТ ЖЕ setBtn, только прозрачный,
   * а не пустой View с flex:1. Замер живой сборки: у flex-элемента с basis 0
   * пол ширины — его padding+border, и голый View был на 20px «легче» карточки.
   * Ряд делился 169/149, «Микс» получал миниатюры 47px против 43.7px у соседей —
   * то есть наборы опять становилось не с чем сравнивать глазом.
   */
  setBtnGhost: { borderColor: 'transparent', backgroundColor: 'transparent' },
  setNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  setBtnText: { fontSize: 13, fontWeight: '700' },
  setBtnSub: { fontSize: 11, fontWeight: '600' },
  /** Срок открытия закрытого набора — строка обязана быть читаемой, а не «серой». */
  setBtnWhen: { fontSize: 11, fontWeight: '700' },
  setPreview: { flexDirection: 'row', gap: 4, alignSelf: 'stretch' },
  /** Ширину даёт flex, высоту — пропорция игрового товара. Пикселей здесь нет. */
  setThumb: { flex: 1, aspectRatio: GOOD_ONBOARD_W / GOOD_ONBOARD_H, minHeight: GOOD_ONBOARD_H },
  /**
   * Витрина закрытого набора приглушена, но НЕ спрятана: человек обязан видеть,
   * ЧТО ему откроется. Размер миниатюры тот же — иначе карточки в ряду поедут.
   */
  setThumbLocked: { opacity: 0.45 },
  fieldCol: { flex: 1, alignSelf: 'stretch', justifyContent: 'center', gap: 8, alignItems: 'center' },
  statsRow: { flexDirection: 'row', gap: 14, flexWrap: 'wrap', justifyContent: 'center', maxWidth: '100%' },
  hintText: { fontSize: 12, textAlign: 'center' },
  // ⚠️ Осиротело после разводки слотов: все три служебные кнопки уехали в шапку (GameAuxAction).
  // Больше никем не берутся четыре записи — shuffleBtn и shuffleText здесь, undoBtn и
  // hintCount ниже по файлу; оставлены намеренно: удаление чужого кода — только с разрешения.
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
  /**
   * Место вырезанной ниши: сплошная доска, а не пустота. Цвет взят между двумя
   * остановками градиента короба (#f6e3c6 → #e0b98a) и на пару тонов темнее —
   * доска в глубине шкафа не может быть светлее его лицевой рамы. Блик сверху и
   * тень снизу дают ту же толщину, что у полок между нишами.
   */
  /**
   * 🔴 ДОСКА ФЛЮШЕМ, БЕЗ СКРУГЛЕНИЯ. Денис 02.09.2026: «шкаф сделаешь нормальным,
   * его отображение».
   *
   * Скруглённые углы и подложка своим цветом превращали сплошной участок шкафа в
   * отдельную ПЛИТКУ — на кадре она читается как незаполненное место, хотя по
   * замыслу это цельное дерево. Прошлая правка («не дырка, а доска») вернула
   * заливку, но форму оставила карточной, и половина дефекта осталась: шкаф
   * выглядел собранным из квадратиков, часть которых забыли нарисовать.
   *
   * Убираем радиус — доска стыкуется с соседями встык, как доска и должна.
   * Заливку отдаём градиенту (`plankFill` ниже): плоский цвет рядом с объёмными
   * нишами сам по себе выглядит дырой, сколько его ни подбирай.
   */
  plank: { overflow: 'hidden' },
  /** Тонкая линия волокна: без неё сплошная доска остаётся пятном, а не деревом. */
  plankGrain: {
    position: 'absolute', left: '12%', right: '12%', height: 1,
    backgroundColor: 'rgba(122,80,38,0.13)',
  },
  /** Слой препятствия: затемнение на всю нишу плюс значок по центру. */
  /**
   * 🔴 СВЕЧЕНИЕ ЗОЛОТОМ, А НЕ БЕЛАЯ ВСПЫШКА. Денис 02.09.2026: «в сорт геймс полка
   * мигает белым когда 3 сходятся».
   *
   * Белая пелена на 85 % непрозрачности гасила всю нишу разом — на тёмном ореховом
   * шкафу это читается как сбой отрисовки, а не как награда: глаз видит дырку в
   * доске. Плюс она била по глазам в вечернем режиме, ради которого весь набор
   * приглушён.
   *
   * Тёплое золото того же семейства, что и остальные награды (серия, звёзды), и
   * вдвое слабее: событие видно, а доска остаётся доской.
   */
  flash: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: '#ffd76a', borderRadius: 8, zIndex: 4 },
  /**
   * Форма — как у бейджей рядом (таблетка), а не отдельная квадратная кнопка:
   * при нехватке ширины строка переносится, и одинокий квадрат во второй
   * строке читается как сбой вёрстки, а не как продолжение шапки.
   * Размер держим 48 — это общий минимум попадания пальцем.
   */
  /** Подсказанный товар — голубой, тем же цветом, что и его ниша-цель: пара читается как одно. */
  itemHint: { backgroundColor: '#e0f2fe', borderWidth: 2, borderColor: '#38bdf8', borderRadius: 8 },
  hintCount: { fontSize: 13, fontWeight: '800' },
  undoBtn: { minWidth: 56, minHeight: 48, borderRadius: 999, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, flexDirection: 'row', gap: 4 },
  /** Насечки вместимости: сколько мест в нише и сколько занято. */
  slots: { position: 'absolute', left: 0, right: 0, bottom: 3, flexDirection: 'row', justifyContent: 'center', gap: 3, zIndex: 3 },
  /** Метка ниши-джокера: угол ниши, поверх фона, но под товарами. */
  jokerMark: { position: 'absolute', top: 2, right: 4, zIndex: 2 },
  jokerStar: { fontSize: 11, lineHeight: 12, color: '#fbbf24', opacity: 0.9 },
  slotMark: { width: 7, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.30)' },
  slotTaken: { backgroundColor: 'rgba(255,236,190,0.85)' },
  goalLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, flexWrap: 'wrap', paddingHorizontal: 12, marginBottom: 2, maxWidth: '100%' },
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
  /** Слой товара в руке — в координатах ОКНА, поэтому от угла корневого View. */
  dragLayer: { position: 'absolute', left: 0, top: 0, zIndex: 60 },
  dragGhost: {
    justifyContent: 'flex-end', alignItems: 'center',
    transform: [{ scale: 1.12 }],   // чуть крупнее полочного — видно, что предмет поднят
    shadowColor: '#3a2408', shadowOpacity: 0.45, shadowRadius: 9, shadowOffset: { width: 0, height: 5 }, elevation: 9,
  },
  cellRow: { zIndex: 1, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 2, paddingBottom: 3 },
  itemSlot: { justifyContent: 'flex-end', alignItems: 'center', borderRadius: 6 },
  itemSel: { backgroundColor: '#fff2c2', borderWidth: 2, borderColor: '#f7971e', transform: [{ translateY: -4 }] },
  /**
   * Коробка «?» (§20): темень без контура товара, только знак. Светлая обводка
   * в четверть силы отделяет коробку от тёмной глубины ниши — иначе на
   * ореховом шкафу «?» сливался бы с задней стенкой.
   */
  unknownBox: {
    justifyContent: 'center', alignItems: 'center', borderRadius: 6,
    backgroundColor: 'rgba(35,20,8,0.82)',
    borderWidth: 1.5, borderColor: 'rgba(248,227,196,0.35)',
  },
  unknownMark: { color: '#f8e3c4', fontWeight: '800' },
});
