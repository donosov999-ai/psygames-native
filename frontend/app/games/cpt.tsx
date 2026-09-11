/* psygames-game-cpt · VER 2 · 23.08.2026 */
/**
 * CPT — Continuous Performance Test (Conners Not-X variant)
 *
 * Парадигма: каждые 1-2 секунды появляется буква. Тапнуть надо на X (в AX-режиме —
 * на X, которой предшествовала A), на все прочие буквы ответ подавляется.
 * Цель РЕДКА — 20 % проб, см. блок над TARGET_RATE.
 *
 * ⚠️ VER 2: прежняя шапка описывала обратную задачу («тапнуть на любую букву
 * КРОМЕ X, 80 % targets») — экран так не работал ни одного дня: подпись игроку
 * `cptTapX` говорит «жми на каждую X», и `isTarget` в коде стоит на X.
 *
 * Биомаркеры (классика ADHD-диагностики, Conners CPT-3):
 *   - omission_errors    — пропущенные targets (внимание упало)
 *   - commission_errors  — реакции на X (impulse control failure)
 *   - mean_rt            — средняя RT на correct hits
 *   - rt_variability     — CV-RT = std/mean (один из самых валидных ADHD-маркеров)
 *   - vigilance_decrement — slope RT по квартилям (мс/quartile) = ЗАМЕДЛЕНИЕ, не точность
 *   - vigilance_accuracy_slope — slope доли пойманных целей по квартилям = ПАДЕНИЕ ТОЧНОСТИ
 *
 * Длительность 4/8/12 мин — достаточно чтобы поймать decrement.
 */

import { onGradientText, onGradientTextMuted, textOn } from '@/src/services/onGradientText';
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { goBackOrHome } from '@/src/utils/nav';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import GradientSurface from '@/src/components/GradientSurface';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { stimBox, answerButton, STIM_BOX } from '@/src/games/attention/layout';
import { useScreenSize } from '@/src/hooks/useScreenWidth';
import { AnswerBar } from '@/src/games/attention/AnswerBar';
import { vigilanceAccuracySlope } from '@/src/games/attention/measures';
import { saveSession } from '@/src/services/api';
import GameResult from '@/src/components/GameResult';
import GameAbout from '@/src/components/GameAbout';
import GameShell from '@/src/components/GameShell';
import GameSetupBar, { SETUP_BAR_SPACE } from '@/src/components/GameSetupBar';
import { GameAuxAction, GameAuxBar } from '@/src/components/GameAuxAction';
import { usePersistentLevel } from '@/src/hooks/usePersistentLevel';
import LevelCleared from '@/src/components/LevelCleared';
import LevelProgressMap from '@/src/components/LevelProgressMap';
import BossRound from '@/src/components/BossRound';
import { useLevelRules, LevelRuleBadge, LevelRuleModal, LevelRule } from '@/src/components/LevelRules';
import { hapticSuccess, hapticError } from '@/src/components/juice';
import GameSuiteSwitch from '@/src/components/GameSuiteSwitch';
import { useGamePreset, useAutostartWhenReady } from '@/src/hooks/useGamePreset';
import { levelOutcome } from '@/src/services/levelOutcome';
import { useCalmHush } from '@/src/hooks/useCalmHush';
import { gameNow } from '@/src/services/gamePause';
import { HELP_CORNER_SPACE } from '@/src/components/GameHelpOverlay';

// v1.112.0: правила-по-уровням объясняются явно (аудит «молчаливых механик»)
/** Экспортирован для гейта `level-rule-threshold`: пороги сверяются с механикой исполнением, а не разбором исходника. */
export const CPT_RULES: LevelRule[] = [
  /**
   * ⚠️ `toLevel: 8` — НЕ произвол. Текст этой карточки на всех двенадцати языках
   * называет X поимённо («жди настоящую X», «мелькнула K — это не X»). С L9
   * мишень уже не X, и та же карточка стала бы говорить прямо противоположное
   * правилу партии. Ограничение уровнями, где мишень ещё X, оставляет её текст
   * верным во всех локалях, не переписывая двенадцать переводов.
   * `fromLevel: 3` — потому что двойники теперь включаются с L3, а не с L11.
   */
  { key: 'lookalike', fromLevel: 3, toLevel: 8 },   // lr_cpt_lookalike_*
  { key: 'newtarget', fromLevel: 9, toLevel: 12 },  // мишень уже не X
  { key: 'colorrule', fromLevel: 13 },              // засчитывается только КРАСНАЯ
];

const GRADIENT = ['#0f4c75', '#3282b8'];
// Цвет текста поверх плашки считает onGradientText по ОБОИМ концам градиента.
// Было зашито '#FFF' — контраст 4.18 (норма AA 4.5), стало 4.53.
// Сплошным цветом этот градиент AA не берёт ни при каком цвете текста — GradientSurface
// кладёт поверх вуаль #061e2f @0.06 цветом самого градиента. Подробности — в шапке сервиса.
const ON_GRAD = onGradientText(GRADIENT[0], GRADIENT[1]);
const ON_GRAD_SOFT = onGradientTextMuted(ON_GRAD);
const CPT_BENEFITS = [
  { icon: 'time-outline',           textKey: 'benefitCpt1' },
  { icon: 'eye-outline',            textKey: 'benefitCpt2' },
  { icon: 'shield-checkmark-outline', textKey: 'benefitCpt3' },
];

type GamePhase = 'intro' | 'config' | 'playing' | 'boss' | 'cleared' | 'result';
// Синергия (пилот): каждые BOSS_EVERY уровней прошёл раунд → битва с боссом (резкая смена правила).
const BOSS_EVERY = 3;

const LETTERS_NON_X = ['A','B','C','D','E','F','G','H','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','Y','Z'];  // без X
/** Алфавит потока. Буквы I нет намеренно: читается как единица. */
const ALPHABET = [...LETTERS_NON_X, 'X'];

/**
 * 🔴 МИШЕНЬ НЕ ВСЕГДА X — ОСЬ, ЗАВЕДЕННАЯ 10.09.2026 ПО СЛОВУ ДЕНИСА.
 *
 * 📌 Дословно: «можно менять правила, чтобы искал не Х, а другую букву; или
 * показывать похожее на Х; или задать, что Х должен быть определённого цвета —
 * например, красный».
 *
 * ПОВОД. Я принёс развилку: чтобы растить трудность, надо двигать доли к канону
 * AX-CPT 70/10/10/10 — но тогда цель перестаёт быть РЕДКОЙ, а на редкости
 * держится вся логика «пропуск = падение внимания». Развилка была ложной: я
 * перебрал ОДНУ ось и на ней объявил тупик. Три оси ниже растят трудность и
 * доли целей не трогают вовсе.
 *
 * Что растит эта: нельзя играть на автомате, выученном за прошлые партии. Буква
 * известна заранее (видна на карточке уровня и в подсказке) — трудность не в
 * угадывании, а в удержании ПРАВИЛА ЭТОЙ партии поверх привычки жать на X.
 */
export const TARGETS = ['X', 'K', 'T', 'H'];

/**
 * ⚠️ ДВОЙНИКИ У КАЖДОЙ МИШЕНИ СВОИ — И ЭТО НЕ АККУРАТНОСТЬ, А НЕОБХОДИМОСТЬ.
 *
 * Прежний список был один: `['K','Y','V','W','N','M']` — угловатые, похожие на X
 * при беглом взгляде. Смените мишень на K, оставив список общим, и K окажется
 * в списке СОБСТВЕННЫХ двойников: генератор начнёт выдавать мишень под видом
 * дистрактора. Ось «похожести», привязанная к конкретной букве, обязана
 * пересчитываться вместе с ней.
 */
export const CONFUSABLES: Record<string, string[]> = {
  X: ['K', 'Y', 'V', 'W', 'N', 'M'],
  K: ['X', 'R', 'H', 'N', 'M'],
  T: ['Y', 'L', 'F', 'J', 'V'],
  H: ['N', 'M', 'K', 'U', 'B'],
};

/**
 * 🔴 ТРЕТЬЯ ИДЕЯ ДЕНИСА: МИШЕНЬ ОПРЕДЕЛЁННОГО ЦВЕТА. Правило становится
 * СОСТАВНЫМ — не «X», а «КРАСНАЯ X». В таблице десяти осей раздела такого не
 * было; строка добавлена одиннадцатой (CHATS_RULES.md §4а).
 *
 * Что проверяет: нажатие на мишень НЕ того цвета — это не «не разглядел», а
 * «не удержал конъюнкцию», то есть отдельный вид сбоя внимания.
 */
export type StimColor = 'red' | 'blue' | 'green' | 'ink';
const COLOR_HEX: Record<StimColor, string> = {
  red: '#e11d48', blue: '#2563eb', green: '#15803d', ink: '#1f2937',
};
const NON_RED: StimColor[] = ['blue', 'green', 'ink'];
const ALL_COLORS: StimColor[] = ['red', ...NON_RED];

/**
 * 🔴 ДОЛЯ ЦВЕТОВЫХ ЛУРОВ ЗАМОРОЖЕНА, И БЕРЁТСЯ ОНА ИЗ БЮДЖЕТА ДИСТРАКТОРОВ.
 *
 * Лур — мишенная буква не того цвета. Подменяется только НЕ-цель, поэтому доля
 * целей остаётся ровно TARGET_RATE: цвет не отнимает у мишени её редкость.
 * Растить долю луров с уровнем нельзя по той же причине, по которой заморожены
 * доли конфликтных проб во всём разделе: игрок станет осторожнее, ложных
 * нажатий станет меньше, и ручка уровня начнёт двигать саму измеряемую величину.
 * Растёт ПОХОЖЕСТЬ и СОСТАВНОСТЬ правила, доли стоят.
 */
export const COLOR_LURE_RATE = 0.10;
const STIM_DURATION = 250;          // буква видна 250мс

/**
 * РЕДКОСТЬ ЦЕЛИ — КОНСТАНТА ПАРАДИГМЫ, А НЕ РУЧКА СЛОЖНОСТИ.
 *
 * 🔴 БЫЛО: `targetRate` 0.28 на L1-5 и 0.32 дальше — то есть с уровнем цель
 * становилась ЧАЩЕ. Проба бдительности держится ровно на обратном: ответ обязан
 * быть исключением, а не фоном. Пропуск (omission) означает падение внимания
 * только тогда, когда нажатие редкое и требует его удерживать; при трети целей
 * это уже обычная скоростная задача, и `vigilance_decrement` меряет усталость
 * пальца, а не внимания.
 *
 * То же правило записано в `iowa.tsx`: методика с популяционными нормами
 * осмысленна только потому, что условие у всех одинаковое.
 *
 * Канон — 10-20 % целей; взято 20 %, верх диапазона: партия длится 90 секунд, за
 * неё выходит 30-90 проб, и на 10 % целей осталось бы 3-9 попаданий, а по ним
 * считаются и `mean_rt`, и `rt_variability` (домен attention_sustained в
 * `assessment.ts`, норма 0.20±0.08). Сторожит `conflict-ratio-is-not-difficulty.test.ts`.
 */
export const TARGET_RATE = 0.2;
/** Доля подсказок A, которые замыкаются целью X. Остальные — ловушка AY. */
const AX_COMPLETION = 0.7;
/**
 * Как часто ставить подсказку A, чтобы доля целей осталась ровно TARGET_RATE.
 * Вывод: A идёт только после «не-A», значит доля букв A равна a = A_CUE·(1−a),
 * то есть a = A_CUE/(1+A_CUE); доля целей = a·AX_COMPLETION. Приравняли к
 * TARGET_RATE → A_CUE = T/(C−T).
 *
 * ⚠️ Прежняя редакция брала одну и ту же вероятность и на подсказку, и на её
 * замыкание, поэтому в AX-режиме реальная доля целей была p²/(1+p) ≈ 8 % при
 * заявленных 32 %: на верхних уровнях за партию выходило 4-5 целей, и CV-RT
 * считался по четырём числам.
 */
const A_CUE_RATE = TARGET_RATE / (AX_COMPLETION - TARGET_RATE);
/** X без предшествующей A — ловушка на commission (доля от «прочих» проб). */
const BX_LURE = 0.18;

// Сложность РАСТЁТ НЕ ВРЕМЕНЕМ (длительность фикс ~90с — короткие сессии не скучают)
// и НЕ долей целей, а ТРУДНОСТЬЮ задачи:
//   L1-5  — классический X-CPT (жми на X), ISI 1500→900 (темп растёт)
//   L6-10 — AX-CPT (жми на X ТОЛЬКО если перед ней была A — нагрузка на рабочую память), ISI 1100→850
//   L11-15— AX-CPT + ISI 800→500 + растущая доля похожих на X дистракторов (перцептивная нагрузка)
export function levelParams(level: number): {
  durationSec: number; isiMs: number; mode: 'X' | 'AX'; confusableRatio: number;
  target: string; colorRule: boolean;
} {
  const durationSec = 90;
  const mode: 'X' | 'AX' = level <= 5 ? 'X' : 'AX';
  const isiMs =
    level <= 5  ? Math.max(900, 1500 - (level - 1) * 150) :
    level <= 10 ? Math.max(850, 1100 - (level - 6) * 60)  :
                  Math.max(500,  800 - (level - 11) * 75);

  /**
   * 🔴 ДВОЙНИКИ ВКЛЮЧАЮТСЯ С L3, А НЕ С L11.
   *
   * Было: ноль на L1–L10 и рост только на верхней трети. То есть механизм был
   * написан и до двух третей лестницы НЕ ДОЕЗЖАЛ — отдельный вид потолка,
   * который выглядит как готовая ось. Замечено при разборе 10.09.2026, когда
   * Денис назвал «показывать похожее на X» как новую идею, а она уже была в
   * коде — просто выключенная почти везде.
   * L1–L2 оставлены чистыми намеренно: на первых двух ступенях человек учится
   * правилу, а не различению.
   */
  const confusableRatio = level <= 2 ? 0
    : Math.min(0.5, Math.round((0.10 + (level - 3) * 0.035) * 1000) / 1000);

  /**
   * Мишень: до L8 канонная X, с L9 — уже НЕ X никогда. Привычка жать на X
   * складывается за прошлые партии, и именно её здесь и приходится держать.
   */
  /**
   * ⚠️ БЛОКАМИ ПО ТРИ УРОВНЯ, А НЕ КАЖДЫЙ УРОВЕНЬ. Первая редакция крутила букву
   * на каждой ступени — игрок не успевал к ней привыкнуть, и «удержать правило
   * поверх привычки» превращалось в «привычки нет вовсе», то есть ось меряла бы
   * не то. Плюс это заметил гейт `level-step-explained`: величина скакала на
   * тридцати двух уровнях подряд, а объяснить такое карточкой невозможно.
   * Выше L15 лестницы нет (LADDER_RANGE.cpt = 15) — там мишень замирает, как
   * замирают и полы ISI.
   */
  const блок = Math.min(2, Math.max(0, Math.floor((Math.min(level, 15) - 9) / 3)));
  const target = level <= 8 ? 'X' : TARGETS[1 + блок];   // L9–11 K · L12–14 T · L15+ H

  /**
   * Составное правило (буква И цвет). L13, а не L12: на L12 уже меняется мишень,
   * и два новых правила на одной ступени человек прочитает как одно.
   */
  const colorRule = level >= 13;

  return { durationSec, isiMs, mode, confusableRatio, target, colorRule };
}

/**
 * УСЛОВИЕ, ПРИ КОТОРОМ СНЯТ ПОКАЗАТЕЛЬ, — РЯДОМ С САМИМ ПОКАЗАТЕЛЕМ.
 *
 * 🔴 Заведено 09.09.2026, после того как решение Дениса («меряем прогресс
 * человека») увело зарядку и оценку на ЛИЧНЫЙ уровень (коммит 8f0bfc47 снял
 * фикс-ступень тира). Показатель этой пробы сверяется с ЖЁСТКОЙ нормой батареи,
 * а условие теперь едет вместе с уровнем игрока — значит два одинаковых на вид
 * числа могут быть сняты в разных задачах.
 *
 * Восстановить условие «через levelParams(level)» технически можно, но это
 * привязывает разбор старых партий к сегодняшнему коду: поменяется формула — и
 * накопленное молча станет нечитаемым.
 *
 * Стережёт `src/__tests__/attention-condition-recorded.test.ts`: он сам
 * прогоняет levelParams по уровням и требует, чтобы КАЖДОЕ меняющееся поле сюда
 * попало. Руками список не пишется — разойдётся.
 */
export function levelCondition(level: number): {
  isiMs: number; mode: 'X' | 'AX'; confusableRatio: number; target: string; colorRule: boolean;
} {
  const { isiMs, mode, confusableRatio, target, colorRule } = levelParams(level);
  return { isiMs, mode, confusableRatio, target, colorRule };
}

/**
 * Сколько проб надо сыграть, чтобы партия считалась партией.
 *
 * 🔴 ЗДЕСЬ БЫЛА АРИФМЕТИЧЕСКАЯ ОШИБКА, ИЗ-ЗА КОТОРОЙ ТРИ УРОВНЯ НЕ БРАЛИСЬ
 * НИКОГДА. Прежний комментарий считал, что при самом медленном темпе за
 * девяносто секунд выходит «около шестидесяти проб», и ставил порог 40.
 * Но ПРОБА СТОИТ ДВА ISI, а не один: сперва пауза до буквы (`isi`), потом окно
 * ответа той же длины (`trialWindow = isiRef.current`, см. `scheduleNextStimulus`).
 * Настоящий счёт за 90 секунд: L1 — 30 проб, L2 — 33, L3 — 37, и все три ниже
 * порога 40. Значит `aborted` взводился ВСЕГДА, уровень не рос, и подняться с
 * первого уровня было физически нельзя — только перепрыгнуть через тропинку.
 * Найдено 23.08.2026 при правке долей проб.
 *
 * Порог взят от РЕАЛЬНОГО минимума: самая короткая полная партия даёт 30 проб,
 * порог 24 — это её четыре пятых. Смысл прежнего решения сохранён: 24 заведомо
 * больше, чем «дождался первой цели и вышел», и человек, у которого сел телефон
 * на восьмидесятой секунде, свой уровень по-прежнему получит.
 * Стережёт `cpt-levels-are-winnable` — он считает пробы по тем же формулам, что
 * и экран, и требует запас на КАЖДОМ уровне.
 */
export const MIN_TRIALS_FOR_LEVEL = 24;

/**
 * Сколько проб физически влезает в партию уровня. Одна проба = ДВА ISI
 * (пауза до буквы + окно ответа). Считается здесь, а не на глаз в комментарии:
 * ровно из-за счёта на глаз три уровня и оказались непроходимыми.
 */
export function trialsThatFit(level: number): number {
  const p = levelParams(level);
  return Math.floor((p.durationSec * 1000) / (p.isiMs * 2));
}

/**
 * 🔴 ШАГ ЗАРЯДКИ/ОЦЕНКИ ИГРАЕТ ФИКСИРОВАННЫЙ ПРЕСЕТ, А НЕ ЛИЧНЫЙ УРОВЕНЬ.
 * Было `levelParams(lvl.level)` и в пресете: игрок 1-го уровня сдавал замер на
 * X-CPT c ISI 1500мс, игрок 15-го — на AX с ISI 500мс и половиной похожих на X
 * дистракторов, а норма (rt_variability 0.20±0.08, assessment.ts) одна на всех.
 * Паттерн — flanker.tsx:144: тир шага → середина полосы своей difficulty-раскладки
 * (≤5 easy=X · ≤10 medium=AX · ≥11 hard). medium=8: AX, ISI 980мс — партия
 * запишется с difficulty 'medium', как предписывает шаг батареи.
 *
 * Длительность — отдельная ручка шага: оба пресета в проекте объявляют mode
 * '4min' (ASSESSMENT_PLAYLIST и CPT_STEP в warmup.ts), а levelParams всегда даёт
 * 90с. presetDurationSec честно разбирает '<N>min'; незнакомый режим → 90с
 * уровня, а НЕ тихий NaN. При ISI 980мс в 4 минуты влезает ~122 пробы против
 * ~45 за 90с — CV-RT по сотне откликов, а не по горстке.
 */
export function presetDurationSec(modeParam: string, fallbackSec: number): number {
  const m = /^(\d+)min$/.exec(modeParam);
  return m ? parseInt(m[1], 10) * 60 : fallbackSec;
}

// В AX-режиме A — это подсказка, а не наполнитель: случайная A из общего банка
// заводила бы незапланированную пару и ломала долю целей, поэтому её исключаем.
/** Банк наполнителя: всё, кроме самой мишени (и подсказки A в AX-режиме). */
function bankFor(target: string, avoidA: boolean): string[] {
  return ALPHABET.filter((l) => l !== target && !(avoidA && l === 'A'));
}

function pickDistractor(target: string, confusableRatio: number, avoidA = false): string {
  const двойники = CONFUSABLES[target] ?? [];
  if (confusableRatio > 0 && двойники.length && Math.random() < confusableRatio) {
    return двойники[Math.floor(Math.random() * двойники.length)];
  }
  const bank = bankFor(target, avoidA);
  return bank[Math.floor(Math.random() * bank.length)];
}
// Continuous-AX: target X строится через предшествующую A; редкая X-без-A = ловушка (commission).
function pickNextLetter(mode: 'X' | 'AX', target: string, confusableRatio: number, prev: string): string {
  if (mode === 'X') return Math.random() < TARGET_RATE ? target : pickDistractor(target, confusableRatio);
  // подсказка и её замыкание разведены — только так доля целей равна TARGET_RATE
  if (prev === 'A') return Math.random() < AX_COMPLETION ? target : pickDistractor(target, confusableRatio, true);
  if (Math.random() < A_CUE_RATE) return 'A';                              // ставим подсказку
  if (Math.random() < BX_LURE) return target;                              // мишень без A = ловушка-commission
  return pickDistractor(target, confusableRatio, true);
}

/**
 * Проба уровня: буква и «надо ли на неё жать». Уровень входит целиком — гейт
 * спрашивает игру по уровням и считает РЕАЛЬНУЮ долю целей по сгенерированному
 * потоку, а не читает константу глазами.
 */
export function makeTrial(level: number, prev: string): { letter: string; color: StimColor; isTarget: boolean } {
  const { mode, confusableRatio, target, colorRule } = levelParams(level);
  let letter = pickNextLetter(mode, target, confusableRatio, prev);
  const isTarget = mode === 'X' ? letter === target : letter === target && prev === 'A';

  if (!colorRule) return { letter, color: 'ink', isTarget };

  // 🔴 Истинная мишень ВСЕГДА красная: цвет не отнимает у неё редкость.
  if (isTarget) return { letter, color: 'red', isTarget: true };

  /**
   * Цветовой лур подменяет только НЕ-цель — поэтому TARGET_RATE не меняется.
   * ⚠️ Подсказку A не трогаем: подменив её, мы уничтожили бы будущую пару A→мишень
   * и тихо понизили долю целей. Ровно так ошибка и выглядела бы — «доля почти та».
   */
  if (letter !== 'A' && Math.random() < COLOR_LURE_RATE) {
    letter = target;
    return { letter, color: NON_RED[Math.floor(Math.random() * NON_RED.length)], isTarget: false };
  }
  /**
   * Дистракторы тоже бывают КРАСНЫМИ — иначе цвет один решал бы задачу, и
   * составное правило выродилось бы в «жми на красное», то есть в другую пробу.
   */
  return { letter, color: ALL_COLORS[Math.floor(Math.random() * ALL_COLORS.length)], isTarget: false };
}

interface TrialRecord {
  letter: string;
  color: StimColor;
  /** Мишенная буква НЕ того цвета: жать нельзя. Считается отдельно от прочих не-целей. */
  isColorLure: boolean;
  isTarget: boolean;
  responded: boolean;
  rt: number | null;        // ms from stim onset to tap
  correct: boolean;         // (target & responded) OR (non-target & not_responded)
  trialIndex: number;       // position in sequence
}

export default function CPTGame() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const router = useRouter();
  // Стимул-окно во весь экран: привязка к размеру вьюпорта — на телефоне буква
  // занимает бо́льшую площадь (раньше был жёсткий квадрат 240px, мелко на 6"+).
  // 07.09.2026: размер берём защищённым хуком — голый useWindowDimensions()
  // на первом кадре веб-сборки отдаёт 0, и ноль запекается в размеры.
  const { w: winW, h: winH } = useScreenSize();
  // Размер окна — общий для раздела (src/games/attention/layout.ts), а не своя формула:
  // раньше здесь стояло min(ширина−32, высота·0.5, 460) и давало 358×358, тогда как у
  // соседних проб окно было 120…320. Из-за разных правил коробка дышала между пробами.
  const ОКНО = stimBox(winW, winH);
  const КНОПКА = answerButton('single', winW);
  const stimSide = ОКНО.side;
  const stimFont = stimSide * 0.6;                          // символ ~60% окна (было 120px в боксе 240px)

  const lvl = usePersistentLevel('cpt');
  const { isPreset, autostart, str, isCalm } = useGamePreset();   // зарядка передаёт ?wu=1 → intro/config пропускаем
  useCalmHush(isCalm);   // вечерний и ночной шаг зарядки — без писка
  const [phase, setPhase] = useState<GamePhase>('config')   // описание переехало в сворачиваемый блок «Об игре» (GameAbout);
  const [clearedPassed, setClearedPassed] = useState(true);   // память результата для баннера LevelCleared

  const [currentLetter, setCurrentLetter] = useState<string>('');
  const [currentColor, setCurrentColor] = useState<StimColor>('ink');
  /**
   * ⚠️ Правило партии держим СОСТОЯНИЕМ, а не только рефом. Рефы нужны таймерам
   * (там иначе застревает старое замыкание), но читать их во время отрисовки
   * нельзя: экран не перерисуется, когда реф поменяется, и подсказка отстанет
   * на кадр — назовёт прошлую мишень. Отдельный урок раздела: «флаг готовности
   * отстаёт на кадр».
   */
  const [rule, setRule] = useState<{ target: string; colorRule: boolean; mode: 'X' | 'AX' }>(
    { target: 'X', colorRule: false, mode: 'X' });
  const [letterVisible, setLetterVisible] = useState(false);
  const [feedback, setFeedback] = useState<'right' | 'wrong' | null>(null);

  // running counters for HUD
  const [hits, setHits] = useState(0);
  const [omissions, setOmissions] = useState(0);
  const [commissions, setCommissions] = useState(0);
  const [trialIdx, setTrialIdx] = useState(0);
  const [remaining, setRemaining] = useState(0);

  // refs to avoid closure staleness in long-running timers
  const trialsRef = useRef<TrialRecord[]>([]);
  /**
   * ЧЕМ ОТВЕТИЛИ: по коробке или по кнопке внизу.
   *
   * 🔴 ЗАЧЕМ СЧИТАТЬ. Полоса ответа добавлена ради единой геометрии раздела (в
   * «Зарядке» пробы идут вперемешку, и у CPT её не было вовсе). Но перенос ответа
   * вниз удлиняет движение: палец идёт от коробки, где уже стоит взгляд, к полосе.
   * Это ложится во ВРЕМЯ РЕАКЦИИ, а `rt_variability` — маркер с нормой 0.20±0.08
   * (assessment.ts). Поэтому коробка ОСТАЁТСЯ нажимаемой, а сюда пишем, чем
   * пользовались: если в данных окажется, что кнопкой отвечают часто и RT растёт,
   * это будет видно числом, а не догадкой.
   */
  const targetRef = useRef<string>('X');
  const colorRuleRef = useRef(false);
  const viaBoxRef = useRef(0);
  const viaBarRef = useRef(0);
  const currentTrialRef = useRef<TrialRecord | null>(null);
  const startTimeRef = useRef(0);
  const stimOnsetRef = useRef(0);
  const respondedRef = useRef(false);

  const isiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stimTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const offTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fbTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remainingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stoppedRef = useRef(false);

  // параметры текущего уровня (в рефах — таймеры живут вне ре-рендера)
  const levelRef = useRef(1);
  const isiRef = useRef(1500);
  const modeRef = useRef<'X' | 'AX'>('X');
  const durationSecRef = useRef(90);
  // mode-строка шага пресета ('4min'): в пресете партия ЗАПИСЫВАЕТСЯ под ней —
  // sessionFitsStep в assessment.ts сверяет session.mode со step.mode дословно,
  // `lvl8` там не опознался бы и домен внимания молча получал бы z=0.
  const presetModeRef = useRef('');
  const prevLetterRef = useRef('');

  const clearAllTimers = () => {
    [isiTimerRef, stimTimerRef, offTimerRef, fbTimerRef].forEach(r => { if (r.current) clearTimeout(r.current); });
    if (remainingTimerRef.current) clearInterval(remainingTimerRef.current);
  };

  useEffect(() => () => { stoppedRef.current = true; clearAllTimers(); }, []);

  // Справка правил уровня (в CPT пресета-зарядки нет — всегда личная игра)
  const levelRules = useLevelRules('cpt', lvl.level, CPT_RULES, phase === 'playing');

  const scheduleNextStimulus = () => {
    if (stoppedRef.current) return;
    const elapsedSec = (gameNow() - startTimeRef.current) / 1000;
    if (elapsedSec >= durationSecRef.current) {
      finish();
      return;
    }
    const isi = isiRef.current * (0.85 + Math.random() * 0.3);   // ISI уровня ±15% дрожание
    isiTimerRef.current = setTimeout(() => {
      if (stoppedRef.current) return;
      // выбрать стимул по режиму уровня; isTarget = «нужно ли жать»
      const prev = prevLetterRef.current;
      const { letter, color, isTarget: isTgt } = makeTrial(levelRef.current, prev);
      prevLetterRef.current = letter;
      const trial: TrialRecord = {
        letter,
        color,
        isColorLure: colorRuleRef.current && !isTgt && letter === targetRef.current,
        isTarget: isTgt,
        responded: false,
        rt: null,
        correct: false,
        trialIndex: trialsRef.current.length,
      };
      currentTrialRef.current = trial;
      respondedRef.current = false;
      stimOnsetRef.current = gameNow();
      setCurrentLetter(letter);
      setCurrentColor(color);
      setLetterVisible(true);
      // hide after STIM_DURATION
      offTimerRef.current = setTimeout(() => {
        if (stoppedRef.current) return;
        setLetterVisible(false);
      }, STIM_DURATION);
      // close trial window after one full ISI from onset
      const trialWindow = isiRef.current; // окно ответа = один ISI уровня
      stimTimerRef.current = setTimeout(() => {
        if (stoppedRef.current) return;
        // close trial: if not responded and target = omission; if not responded and non-target = correct rejection
        const t = currentTrialRef.current;
        if (t && !t.responded) {
          if (t.isTarget) {
            t.correct = false;
            setOmissions(o => o + 1);
            flashFeedback('wrong');
          } else {
            t.correct = true;
            // correct rejection — silent
          }
        }
        if (t) {
          trialsRef.current.push(t);
          setTrialIdx(trialsRef.current.length);
        }
        currentTrialRef.current = null;
        scheduleNextStimulus();
      }, trialWindow);
    }, isi);
  };

  const flashFeedback = (kind: 'right' | 'wrong') => {
    setFeedback(kind);
    if (fbTimerRef.current) clearTimeout(fbTimerRef.current);
    fbTimerRef.current = setTimeout(() => setFeedback(null), 200);
  };

  const handleTap = (источник: 'box' | 'bar' = 'box') => {
    if (источник === 'bar') viaBarRef.current += 1; else viaBoxRef.current += 1;
    const t = currentTrialRef.current;
    if (!t || respondedRef.current) return;
    respondedRef.current = true;
    t.responded = true;
    t.rt = gameNow() - stimOnsetRef.current;
    if (t.isTarget) {
      t.correct = true;
      setHits(h => h + 1);
      flashFeedback('right');
      hapticSuccess();
    } else {
      // commission: tapped on X
      t.correct = false;
      setCommissions(c => c + 1);
      flashFeedback('wrong');
      hapticError();
    }
  };

  const startGame = () => {
    // личная игра → уровень рулит; пресет (зарядка/оценка) → фикс-уровень тира +
    // длительность из mode-параметра шага ('4min' → 240с). Паттерн flanker.tsx:144.
    // Зарядка и оценка идут с ЛИЧНОГО уровня (решение Дениса 09.09.2026: «мы меряем прогресс человека», фикс-ступень тира снята во всей игре).
    const effLevel = lvl.level;
    const p = levelParams(effLevel);
    levelRef.current = effLevel;
    presetModeRef.current = isPreset ? str('mode', '') : '';
    isiRef.current = p.isiMs;
    modeRef.current = p.mode;
    targetRef.current = p.target;
    colorRuleRef.current = p.colorRule;
    setRule({ target: p.target, colorRule: p.colorRule, mode: p.mode });
    durationSecRef.current = isPreset ? presetDurationSec(presetModeRef.current, p.durationSec) : p.durationSec;
    prevLetterRef.current = '';
    stoppedRef.current = false;
    viaBoxRef.current = 0; viaBarRef.current = 0;
    trialsRef.current = [];
    currentTrialRef.current = null;
    setHits(0); setOmissions(0); setCommissions(0); setTrialIdx(0);
    setFeedback(null);
    setLetterVisible(false);
    setCurrentLetter('');
    setRemaining(durationSecRef.current);   // пресет может удлинить партию ('4min'), не p.durationSec
    setPhase('playing');
    startTimeRef.current = gameNow();
    remainingTimerRef.current = setInterval(() => {
      const left = durationSecRef.current - Math.floor((gameNow() - startTimeRef.current) / 1000);
      setRemaining(Math.max(0, left));
    }, 200);
    scheduleNextStimulus();
  };
    // ⚠️ Ждём загрузки уровня. Без этого автостарт («Вызов дня», онбординг) играл
  // ПЕРВЫЙ уровень человеку с двенадцатым: уровень приезжает асинхронно, а
  // эффект монтирования всегда раньше промиса. См. useAutostartWhenReady.
  useAutostartWhenReady(() => autostart && lvl.loaded, () => startGame());

  const finish = async (stoppedEarly = false) => {
    stoppedRef.current = true;
    clearAllTimers();
    setLetterVisible(false);

    const trials = trialsRef.current;
    const targets = trials.filter(t => t.isTarget);
    const nonTargets = trials.filter(t => !t.isTarget);
    const totalHits = targets.filter(t => t.responded).length;
    const totalOmissions = targets.filter(t => !t.responded).length;
    const totalCommissions = nonTargets.filter(t => t.responded).length;

    // RT stats on hits only
    const hitRts = targets.filter(t => t.responded && t.rt !== null).map(t => t.rt as number);
    const meanRt = hitRts.length ? hitRts.reduce((a, b) => a + b, 0) / hitRts.length : 0;
    const rtVar = hitRts.length > 1
      ? hitRts.reduce((s, rt) => s + Math.pow(rt - meanRt, 2), 0) / hitRts.length
      : 0;
    const rtStd = Math.sqrt(rtVar);
    const cvRt = meanRt > 0 ? rtStd / meanRt : 0;  // coefficient of variation

    // Vigilance decrement: split hits into 4 quartiles, compute mean RT per quartile,
    // linear regression slope (ms per quartile). Positive slope = attention dropping.
    let vigilanceSlope = 0;
    if (hitRts.length >= 8) {
      const q = 4;
      const perQ = Math.floor(hitRts.length / q);
      const meansByQuartile: number[] = [];
      for (let i = 0; i < q; i++) {
        const slice = hitRts.slice(i * perQ, (i + 1) * perQ);
        meansByQuartile.push(slice.reduce((a, b) => a + b, 0) / slice.length);
      }
      // simple linear regression: x = [1,2,3,4], y = means
      const xs = [1, 2, 3, 4];
      const meanX = 2.5;
      const meanY = meansByQuartile.reduce((a, b) => a + b, 0) / 4;
      const num = xs.reduce((s, x, i) => s + (x - meanX) * (meansByQuartile[i] - meanY), 0);
      const den = xs.reduce((s, x) => s + Math.pow(x - meanX, 2), 0);
      vigilanceSlope = den > 0 ? num / den : 0;
    }

    /**
     * ПАДЕНИЕ ТОЧНОСТИ К КОНЦУ ПАРТИИ — ОТДЕЛЬНАЯ ВЕЛИЧИНА, А НЕ ТА, ЧТО ВЫШЕ.
     *
     * `vigilanceSlope` считает наклон ВРЕМЕНИ РЕАКЦИИ (мс/квартиль) — это
     * замедление. Классический vigilance decrement — падение ДОЛИ ОБНАРУЖЕНИЙ со
     * временем на задаче, и это не одно и то же: человек может отвечать так же
     * быстро и при этом пропускать всё больше целей. Обе величины нужны, поэтому
     * старая остаётся как есть (её имя зафиксировано схемой api.ts и трогать его
     * не мне), а точность считается рядом своим полем.
     *
     * Делим ЦЕЛИ по порядку предъявления на четыре четверти и берём долю пойманных
     * в каждой; наклон по МНК. Отрицательный = внимание падает к концу.
     * Порог 8 целей — тот же, что у RT-версии: по одной-двум целям на четверть
     * доля не считается, вышел бы шум под видом биомаркера.
     */
    const { slope: accuracySlope, byQuartile: hitRateByQuartile } = vigilanceAccuracySlope(targets);

    const totalTime = (gameNow() - startTimeRef.current) / 1000;
    // прохождение уровня: высокая доля hits + мало commission → следующий уровень
    const accuracy = targets.length ? totalHits / targets.length : 0;
    const commissionRate = nonTargets.length ? totalCommissions / nonTargets.length : 0;
    /**
     * ⚠️ ШАГ ЗАРЯДКИ УРОВЕНЬ НЕ ТРОГАЕТ — ни вверх, ни вниз. `isPreset` здесь доставали
     * из хука и не использовали нигде, кроме авто-старта: партия из плейлиста двигала
     * персональный уровень, то есть он менялся не от результата человека, а от того,
     * попалась ли ему эта игра в наборе.
     *
     * «Партия та же» оправданием не работает: доску по `levelParams(lvl.level)` играют и
     * Симон, и Познер, и стоп-сигнал — вся ближайшая родня по механике, — и все они
     * уровень в пресете замораживают. Одна CPT была исключением, и это не решение, а
     * пропуск. Понижение — половина беды похуже: шаг CPT стоит в КОНЦЕ длинной серии,
     * намеренно на утомлении (см. CPT_STEP в `services/warmup.ts`), поэтому промахи там
     * системно чаще — три таких набора подряд роняли ступень, взятую на тропинке.
     *
     * Фаза идёт в комплекте: с выключенным `passed` баннер уровня сказал бы «почти,
     * ещё раз» там, где человек ничего не провалил. В пресете — экран итога; на
     * следующий шаг зарядка уводит сама (таймер в WarmupContext после записи сессии).
     * Босс отпадает там же: веха висит на подъёме уровня, а его в зарядке нет.
     */
    /**
     * 🔴 «СТОП» БЫЛ БЕСПЛАТНЫМ ЛЕВЕЛ-АПОМ. Партия длится девяносто секунд, а
     * зачёт считался по накопленному: дождался первой цели, тапнул, нажал
     * «СТОП» — точность 1/1, ложных тревог ноль, уровень взят за десять секунд.
     * Замер: в 100 % прогонов.
     *
     * ⚠️ И ПРОВАЛОМ ЭТО ТОЖЕ НЕ ЯВЛЯЕТСЯ. В «вероятностном выборе» та же кнопка
     * означала провал — противоположный перекос той же природы. Человек, которому
     * позвонили, ничего не сделал неправильно.
     *
     * Правило: оборванная партия уровень НЕ ДВИГАЕТ — ни вверх, ни вниз.
     * Досчитать пробы за него нельзя, а гадать нечестно.
     */
    const played = trialsRef.current.length;
    /**
     * 🔴 «СТОП» БЫЛ БЕСПЛАТНЫМ ЛЕВЕЛ-АПОМ. Партия длится девяносто секунд, а
     * зачёт считался по накопленному: дождался первой цели, тапнул, нажал
     * «СТОП» — точность 1/1, ложных тревог ноль, уровень взят за десять секунд.
     * Замер: в 100 % прогонов. Правило «обрыв уровень не двигает» живёт в
     * `levelOutcome`, а не здесь: иначе следующая игра решит по-своему.
     */
    const aborted = stoppedEarly || played < MIN_TRIALS_FOR_LEVEL;
    const out = levelOutcome({ isPreset, aborted, cleared: accuracy >= 0.7 && commissionRate <= 0.3 });
    const passed = out.passed;
    if (out.raiseLevel) lvl.reach(levelRef.current + 1);
    if (out.lowerLevel) lvl.fail();   // гистерезис: 3 провала подряд → уровень -1
    // непрерывный поток: и проход, и провал → баннер LevelCleared (passed=false = «почти, ещё раз» + рестарт того же уровня), без тупика GameResult
    if (out.raiseLevel && levelRef.current % BOSS_EVERY === 0) {
      // веха: уровень засчитан (reach выше), прерываемся коротким боссом → потом баннер cleared
      setClearedPassed(true);
      setPhase('boss');
    } else {
      setClearedPassed(passed);
      setPhase(out.phase);   // личная партия — баннер уровня, шаг зарядки — итог
    }

    try {
      await saveSession({
        passed,
        game_type: 'cpt',
        score: Math.max(0, Math.round(totalHits * 5 - totalCommissions * 20 - totalOmissions * 10)),
        time_seconds: totalTime,
        difficulty: levelRef.current <= 5 ? 'easy' : levelRef.current <= 10 ? 'medium' : 'hard',
        // пресет пишет mode шага ('4min') — иначе sessionFitsStep не сопоставит партию батарее
        mode: isPreset && presetModeRef.current ? presetModeRef.current : `lvl${levelRef.current}`,
        errors: totalOmissions + totalCommissions,
        details: {
          level: levelRef.current,
          paradigm: modeRef.current,
          // Условие уровня — рядом с показателем (см. шапку levelCondition).
          ...levelCondition(levelRef.current),
          hits: totalHits,
          omission_errors: totalOmissions,
          commission_errors: totalCommissions,
          n_targets: targets.length,
          n_nontargets: nonTargets.length,
          /**
           * Цветовые луры — мишенная буква не того цвета. Пишем и сколько их
           * показали, и на скольких игрок сорвался: доля без знаменателя в
           * короткой партии врёт, а нажатие на лур — не «не разглядел», а
           * «не удержал составное правило», то есть отдельный вид сбоя.
           */
          color_lures_shown: trials.filter((t) => t.isColorLure).length,
          color_lure_commissions: trials.filter((t) => t.isColorLure && t.responded).length,
          mean_rt: Math.round(meanRt),
          rt_std: Math.round(rtStd),
          rt_variability: Number(cvRt.toFixed(3)),    // CV-RT
          vigilance_decrement: Math.round(vigilanceSlope),  // ЗАМЕДЛЕНИЕ: мс на квартиль
          /**
           * Падение ТОЧНОСТИ: доля пойманных целей на квартиль (отрицательный
           * наклон = внимание падает) и сами четыре доли, чтобы наклон можно было
           * проверить, а не принять на веру. null при <8 целях за партию.
           */
          /** Чем отвечали: по коробке (палец уже там) или по полосе внизу. */
          answers_via_box: viaBoxRef.current,
          answers_via_bar: viaBarRef.current,
          vigilance_accuracy_slope: accuracySlope,
          hit_rate_by_quartile: hitRateByQuartile,
        },
      });
    } catch (e) { console.error(e); }
  };

  const stop = () => {
    if (phase !== 'playing') return;
    finish(true);   // оборвали руками — уровень по такой партии не двигается
  };

  // ─── render ──────────────────────────────────────────────────────────

  const renderConfig = () => (
    <>
    <ScrollView style={styles.configScroll} contentContainerStyle={styles.configContainer} showsVerticalScrollIndicator={false}>
      <GradientSurface colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.configCard}>
        <Ionicons name="time" size={48} color={ON_GRAD.color} />
        <Text style={styles.configTitle}>{t('cpt')}</Text>
        <Text style={styles.configDesc}>{t('cptDesc')}</Text>
      </GradientSurface>
      <GameAbout descriptionKey="cptIntroDesc" benefits={CPT_BENEFITS} accent={GRADIENT[0]} />
      <LevelProgressMap bestLevel={lvl.best} gameId="cpt" currentLevel={lvl.level} onPickLevel={lvl.pick} colors={colors} language={language} />
      <View style={[styles.optionCard, { backgroundColor: colors.surface, alignItems: 'center' }]}>
        <Text style={[styles.optionLabel, { color: colors.text, fontSize: 18 }]}>
          {t('level')} {lvl.level}
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center' }}>
          {(() => {
            // Карточка называет ТЕКУЩЕЕ правило: с L9 мишень уже не X, с L12
            // она ещё и красная. Человек обязан знать условие ДО партии —
            // иначе первый провал будет не про внимание, а про незнание правил.
            const p = levelParams(lvl.level);
            if (p.colorRule) return t('cptLvlParamsColor').replace('{letter}', p.target);
            if (p.target !== 'X') return t('cptLvlParamsLetter').replace('{letter}', p.target);
            if (lvl.level <= 5) return t('cptLvlParamsX');
            return lvl.level <= 10 ? t('cptLvlParamsAX') : t('cptLvlParamsAXHard');
          })()}
        </Text>
        {/* v1.112.0: критерий прохождения уровня виден игроку (раньше был скрыт в коде finish()) */}
        <Text style={{ color: colors.textSecondary, fontSize: 12, textAlign: 'center' }}>
          {t('cptPass')}
        </Text>
        {lvl.level > 1 && (
          <TouchableOpacity
            accessibilityRole="button" accessibilityLabel={t('a11yResetLevel')} onPress={() => lvl.setLevel(1)} style={{ marginTop: 4 }}>
            <Text style={{ color: colors.text, fontWeight: '700' }}>↺ 1</Text>
          </TouchableOpacity>
        )}
      </View>
      <Text style={[styles.warning, { color: colors.textSecondary }]}>
        ⚠ {t('cptStrenuous')}
      </Text>
    </ScrollView>
    {/* Полоса прибита книзу: «Начать» видно без прокрутки до конца (отчёт 02.09.2026: «не мотать экран вниз, чтобы запустить»). */}
    <GameSetupBar label={t('start')} onStart={startGame} colors={GRADIENT as [string, string]} />
    </>
  );

  // игровая фаза — на едином каркасе GameShell (СТОП — служебное, значит в шапке);
  // модалка правил уровня — поверх каркаса (паттерн digit-span)
  if (phase === 'playing') {
    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    const fbColor = feedback === 'right' ? '#22c55e' : feedback === 'wrong' ? '#f43f5e' : null;
    return (
      <View style={{ flex: 1 }}>
        <GameShell
          title={t('cpt')}
          onBack={() => { stoppedRef.current = true; clearAllTimers(); goBackOrHome(); }}
          /**
           * Счётчики данными (см. `HudItem`).
           *
           * ⚠️ Из четырёх прежних чисел оставлены три: пропуски и ложные нажатия
           * убраны из шапки. В пробе на устойчивое внимание и то, и другое —
           * рабочий материал упражнения; висящий по ходу счётчик промахов
           * наказывает ровно за то, чем измеряется задача (§12.4).
           */
          hud={[
            { key: 'time', icon: 'time', label: t('timeLeftLabel'), value: `${mins}:${secs.toString().padStart(2, '0')}`, tone: 'accent' as const },
            { key: 'correct', icon: 'checkmark-circle', label: t('hud_correct'), value: hits, tone: 'good' as const, pop: true },
            { key: 'trials', icon: 'repeat', label: t('hud_trials'), value: trialIdx },
          ]}
          /* 🔴 САМЫЙ ОСТРЫЙ СЛУЧАЙ ПРАВИЛА СЛОТОВ. Ответ в CPT — тап по окну
             стимула в ПОЛЕ, и бьют по нему полторы минуты на скорость. Раньше
             прямо под этим окном, в нижней полосе — той самой, которая во
             «Фланкере» и «Саймоне» означает ответ, — стоял «СТОП»,
             заканчивающий сеанс. Промах вниз стоил всей пробы.
             Теперь «СТОП» в шапке, как и у остальных упражнений с сеансом. */
          /**
           * 🔴 10.09.2026 ДВЕ ПОЛОСЫ НАД ПОЛЕМ ВМЕСТО ТРЁХ. Бейдж правил жил в
           * отдельном слоте `stats`, и над полем стояло три ряда: счётчики,
           * бейдж, «СТОП». Замер гейтом: коробка CPT на 438 против 387…411 у
           * соседей — окно «плясало» именно из-за лишнего ряда, а не из-за
           * коробки. Бейдж переехал в тот же ряд, что и «СТОП».
           */
          headerActions={
            <GameAuxBar>
              <LevelRuleBadge lr={levelRules} color={GRADIENT[1]} ru={language === 'ru'} />
              <GameAuxAction icon="stop-circle" label={t('btn_stop')} danger onPress={stop} />
            </GameAuxBar>
          }
          toolbar={
            /**
             * Полоса ответа появилась ради единой геометрии раздела: без неё поле CPT
             * тянулось до низа экрана, коробка центрировалась в более высоком поле и
             * стояла на 354 против 237…261 у соседей (замер 07.09).
             * ⚠️ Коробка при этом ОСТАЛАСЬ нажимаемой — см. viaBoxRef/viaBarRef.
             */
            <AnswerBar>
              <TouchableOpacity accessibilityRole="button" activeOpacity={0.8}
                onPress={() => handleTap('bar')}
                style={{ width: КНОПКА.w, height: КНОПКА.h, borderRadius: КНОПКА.radius,
                         backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' }}>
                {/* Короткая подпись: полное правило стоит в подсказке над полем. */}
                <Text style={{ color: textOn(colors.primary), fontSize: 18, fontWeight: '800' }}>{t('cptTapBtn')}</Text>
              </TouchableOpacity>
            </AnswerBar>
          }
        >
          <View style={styles.fieldCol}>
            <TouchableOpacity
              accessibilityRole="button"
              activeOpacity={0.7}
              onPress={() => handleTap('box')}
              style={[styles.stimBox, {
                width: ОКНО.w, height: ОКНО.h,   // общая коробка раздела
                backgroundColor: fbColor ? fbColor + '33' : colors.surface,
                /**
                 * 🔴 10.09.2026 УБРАНА ПОДСВЕТКА МИШЕНИ. Здесь стояло
                 * `currentLetter === 'X' ? '#fbbf24' : ...` — и рамка, и сама
                 * буква становились янтарными на каждой X. То есть мишень была
                 * ПОМЕЧЕНА цветом: пробу можно было проходить, не читая букв,
                 * а `commission_errors` и `omissions` снимались с задачи, где
                 * цель выскакивает сама. Нашлось при заведении цветового
                 * правила — с подсветкой оно было бы бессмысленным вдвойне.
                 */
                /**
                 * ⚠️ Толщина рамки БОЛЬШЕ НЕ МЕНЯЕТСЯ (было `letterVisible ? 3 : 1`).
                 * Она росла ровно в тот момент, когда буква уже видна, и внутренняя
                 * область прыгала на 4 px ПОД стимулом — то есть стимул съезжал
                 * в момент ответа. Постоянная 2 приходит из STIM_BOX; видимость
                 * показываем цветом, а не толщиной.
                 */
                borderColor: fbColor || (letterVisible ? colors.text : colors.border),
              }]}
            >
              {letterVisible && (
                <Text style={[styles.stimText, {
                  fontSize: stimFont,   // символ ~60% окна вместо жёстких 120px
                  // Цвет буквы — свойство ПРОБЫ, а не «это мишень». Без правила
                  // цвета все буквы идут цветом темы, как и раньше на L1–L11.
                  color: rule.colorRule
                    ? (currentColor === 'ink' ? colors.text : COLOR_HEX[currentColor])
                    : colors.text,
                }]}>
                  {currentLetter}
                </Text>
              )}
              {!letterVisible && <Text style={[styles.fixCross, { color: colors.textSecondary }]}>+</Text>}
            </TouchableOpacity>
            {/*
              🔴 ПОДСКАЗКА ПОД КОРОБКОЙ И В ПОТОКЕ, 10.09.2026. Стояла НАД полем
              и вне потока (`position: absolute; top: 0`) — так её когда-то
              вынесли, чтобы она не сдвигала коробку вниз. Побочный итог: поле
              CPT оказывалось выше соседского, и коробка садилась ниже всех
              (замер: 422 против медианы 381, отклонение 41).
              Теперь как у остальных девяти: под коробкой, в потоке.
              ⚠️ `minHeight: 40` — резерв на две строки 13 pt. Без него длина
              текста двигала бы коробку: у CPT подсказка меняется по уровням
              («жми на K» / «только КРАСНАЯ T после A»), и её высота гуляет.
            */}
            <Text style={[styles.hintText, { color: colors.textSecondary, minHeight: 40 }]}>
              {(rule.colorRule
                ? t('cptTapColor')
                : t(rule.mode === 'AX' ? 'cptTapAXLetter' : 'cptTapLetter')
              ).replace('{letter}', rule.target)}
            </Text>
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
          accessibilityRole="button" accessibilityLabel={t('a11yBack')} style={[styles.backBtn, { backgroundColor: colors.surface }]}
          onPress={() => { stoppedRef.current = true; clearAllTimers(); goBackOrHome(); }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('cpt')}</Text>
        <View style={{ width: HELP_CORNER_SPACE }} />
      </View>
      <GameSuiteSwitch />
      {phase === 'config' && renderConfig()}
      {phase === 'boss' && (
        <BossRound
          config={{ type: 'oddletter', gradient: GRADIENT as [string, string] }}
          language={language}
          colors={colors}
          onComplete={() => { setClearedPassed(true); setPhase('cleared'); }}
        />
      )}
      <LevelRuleModal lr={levelRules} colors={colors} ru={language === 'ru'} />
      {phase === 'cleared' && (
        <LevelCleared gameId="cpt" level={levelRef.current} passed={clearedPassed} stars={(omissions + commissions) === 0 ? 3 : (omissions + commissions) <= 2 ? 2 : 1}
          gradient={GRADIENT} language={language} colors={colors}
          onContinue={() => startGame()} onStop={() => setPhase('config')} />
      )}
      {phase === 'result' && (
        <GameResult
          score={Math.max(0, hits * 5 - commissions * 20 - omissions * 10)}
          time={durationSecRef.current} errors={omissions + commissions}
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
  configContainer: { padding: 16, gap: 14 , paddingBottom: SETUP_BAR_SPACE },
  configCard: { padding: 24, borderRadius: 16, alignItems: 'center', gap: 8 },
  configTitle: { fontSize: 22, fontWeight: '700', color: ON_GRAD.color },
  configDesc: { fontSize: 13, color: ON_GRAD_SOFT, textAlign: 'center' },
  optionCard: { padding: 16, borderRadius: 12, gap: 10 },
  optionLabel: { fontSize: 14, fontWeight: '600' },
  optionButtons: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', maxWidth: '100%' },
  modeButton: { minHeight: 48, justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 18, borderRadius: 16 },
  modeButtonText: { fontSize: 13, fontWeight: '600' },
  warning: { fontSize: 12, textAlign: 'center', fontStyle: 'italic', paddingHorizontal: 16 },
  startBtn: { minHeight: 48, justifyContent: 'center', borderRadius: 16, overflow: 'hidden', marginTop: 8 },
  startBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  startBtnText: { color: ON_GRAD.color, fontSize: 16, fontWeight: '700' },
  // flex+center: коробка встаёт по центру ПОЛЯ, а подписи над ней
  // и под ней больше не сдвигают её вниз (замер 07.09: центр гулял 387…504).
  fieldCol: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 22 },
  statsRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', maxWidth: '100%' },
  statText: { fontSize: 14, fontWeight: '700' },
  hintText: { fontSize: 13, textAlign: 'center', maxWidth: 360, width: '100%' },
  stimBox: { ...STIM_BOX },   // размеры задаются инлайном от защищённого useScreenSize()
  stimText: { fontWeight: '900' },                                                // fontSize задаётся инлайном (масштаб окна)
  fixCross: { fontSize: 48, opacity: 0.4 },
  // ⚠️ Осиротело после разводки слотов: СТОП уехал в шапку (GameAuxAction).
  // Стили ниже (stopBtn, stopBtnText) больше никем не берутся; оставлены
  // намеренно — удаление чужого кода в этом проекте только с разрешения.
  stopBtn: { minHeight: 48, justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 30, borderRadius: 16, borderWidth: 1 },
  stopBtnText: { fontSize: 14, fontWeight: '700' },
});
