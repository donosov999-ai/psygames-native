/* psygames-attention-ladder-per-mode · VER 1 · 06.09.2026 · [Claude·MAC] */
/**
 * У КАЖДОЙ ИЗ ПЯТИ ПРОБ — СВОЯ ЛЕСТНИЦА, И ОНА ПРОГОНЯЕТСЯ ЦЕЛИКОМ.
 *
 * 🔴 ЗАЧЕМ. Пять методик меряют разное. Одна общая мерка объявит часть режимов
 * пустыми — не потому что они пустые, а потому что мерка не про них; соседний
 * раздел на этом обжёгся 06.09.2026 (три режима из пяти). Поэтому проба ниже
 * НЕ сравнивает пробы между собой: у каждой своя величина из `load.ts`, и
 * требование к ней предъявляется внутри её собственной полосы уровней.
 *
 * ⚠️ ПОЧЕМУ ГЕЙТ СЧИТАЕТ ВЕЛИЧИНУ, А НЕ ЧИТАЕТ ПАРАМЕТРЫ ГЛАЗАМИ. «Окно стало
 * меньше» — не то же самое, что «уровень стал труднее»: у CPT на стыке L5→L6 ISI
 * РАСТЁТ с 900 до 1100 мс (подача замедляется), и трудность держится только тем,
 * что там же включается режим AX. Проверять надо итоговую величину, иначе стык
 * читается как откат там, где отката нет, и наоборот.
 *
 * 🔴 ЛОМАЕТСЯ НА СТЫКЕ УЧАСТКОВ — так находили трижды за неделю. Поэтому уровни
 * гоняются ВСЕ подряд, а границы полос (L5→L6, L10→L11) проверяются отдельной
 * пробой: именно там формула меняет ветку.
 */
import {
  ATTENTION_MODES, AttentionMode, LADDER_RANGE, SESSION_MEASURE,
  attentionLoad, flankerCongruentTrials,
} from '@/src/games/attention/load';
import { levelParams as stroopParams } from '@/app/games/stroop';
import { levelParams as flankerParams, flankerRowWidthPx } from '@/app/games/flanker';
import { levelParams as cptParams } from '@/app/games/cpt';
import { levelParams as targetsParams } from '@/app/games/targets';
import { levelParams as wcstParams } from '@/app/games/wcst';

const levels = (m: AttentionMode) => Array.from({ length: LADDER_RANGE[m] }, (_, i) => i + 1);

/** Полный набор параметров уровня — по нему опознаётся уровень-дубль. */
const fingerprint: Record<AttentionMode, (l: number) => string> = {
  stroop:  (l) => JSON.stringify(stroopParams(l)),
  flanker: (l) => JSON.stringify(flankerParams(l)),
  cpt:     (l) => JSON.stringify(cptParams(l)),
  targets: (l) => JSON.stringify(targetsParams(l)),
  wcst:    (l) => JSON.stringify(wcstParams(l)),
};

/**
 * Сколько уровней подряд ДОПУСКАЕТСЯ иметь одинаковые параметры.
 *
 * У четырёх проб — 1: каждый уровень обязан чем-то отличаться от предыдущего,
 * иначе человек «берёт» ступень, за которой не стоит ни одного нового условия.
 *
 * ⚠️ У WCST — 2, и это записанное послабление, а не забытый угол. Там лестница
 * идёт парами: `trials` меняется раз в четыре уровня, `ruleChangeStreak` — раз в
 * два, и пары (L1,L2), (L3,L4), (L5,L6), (L7,L8), (L9,L10) совпадают полностью.
 * Ужать это до 1 значит перекроить темп клинической методики — решение Дениса,
 * оно вынесено вопросом в PROJECT_REF §0, а не принято молча здесь. Тройка
 * одинаковых уровней не пройдёт и тут: послабление ровно на один шаг.
 */
const MAX_FLAT_RUN: Record<AttentionMode, number> = {
  stroop: 1, flanker: 1, cpt: 1, targets: 1, wcst: 2,
};

/**
 * Границы полос — У КАЖДОЙ ПРОБЫ СВОИ, взяты из её собственной формулы.
 *
 * 🔴 СНАЧАЛА ЗДЕСЬ СТОЯЛО ЖЁСТКОЕ [5, 10] НА ВСЕ ПЯТЬ, И ГЕЙТ ПОКРАСНЕЛ НА
 * ИСПРАВНОМ WCST. У Струпа, фланкера и CPT полосы правда идут по 5 и 10
 * (`levelParams` каждого делит 1-5 / 6-10 / 11-15), а у WCST `trials` меняется
 * на 24→32→40, то есть границы — 4 и 8, и L5→L6 внутри полосы совпадает ПО
 * УСТРОЙСТВУ. Проба спрашивала игру про стык, которого у неё нет. Константа,
 * верная для трёх проб из пяти, — это та же общая мерка, от которой файл и
 * заведён.
 */
const BAND_EDGES: Record<AttentionMode, number[]> = {
  stroop: [5, 10],    // stroop.tsx:156  — 1-5 / 6-10 / 11-15
  flanker: [5, 10],   // flanker.tsx:57  — 1-5 / 6-10 / 11-15
  cpt: [5, 10],       // cpt.tsx:126     — 1-5 / 6-10 / 11-15
  targets: [4, 8, 12],// targets.tsx     — numSquares шагает каждые 4 уровня
  wcst: [4, 8],       // wcst.tsx:112    — trials 24 / 32 / 40
};

describe('конфликт внимания: у каждой пробы своя лестница и она не откатывается', () => {
  it.each(ATTENTION_MODES)('%s — величина не откатывается ни на одном уровне', (mode) => {
    const rollbacks: string[] = [];
    const ls = levels(mode);
    for (let i = 1; i < ls.length; i++) {
      const prev = attentionLoad(mode, ls[i - 1]);
      const cur = attentionLoad(mode, ls[i]);
      if (cur < prev) rollbacks.push(`L${ls[i - 1]}→L${ls[i]}: ${prev.toFixed(3)} → ${cur.toFixed(3)}`);
    }
    expect(rollbacks).toEqual([]);
  });

  /**
   * 🔴 БЕЗ ЭТОЙ ПРОБЫ ПРЕДЫДУЩАЯ НИЧЕГО НЕ СТОИТ. «Не откатывается» — правда и для
   * лестницы, которая стои́т на месте все пятнадцать уровней. Здесь требуется, чтобы
   * она ВЫРОСЛА, и числом: верх не меньше чем вдвое тяжелее низа.
   */
  it.each(ATTENTION_MODES)('%s — лестница выросла, а не постояла', (mode) => {
    const ls = levels(mode);
    const bottom = attentionLoad(mode, ls[0]);
    const top = attentionLoad(mode, ls[ls.length - 1]);
    expect(`${mode}: ${(top / bottom).toFixed(2)}× ≥ 2`).toBe(`${mode}: ${(top / bottom).toFixed(2)}× ≥ 2`);
    expect(top / bottom).toBeGreaterThanOrEqual(2);
  });

  it.each(ATTENTION_MODES)('%s — нет уровней-дублей (ступень без нового условия)', (mode) => {
    const ls = levels(mode);
    const dups: string[] = [];
    let run = 1;
    for (let i = 1; i < ls.length; i++) {
      if (fingerprint[mode](ls[i]) === fingerprint[mode](ls[i - 1])) {
        run += 1;
        if (run > MAX_FLAT_RUN[mode]) dups.push(`L${ls[i]} = L${ls[i - 1]} (подряд ${run})`);
      } else run = 1;
    }
    expect(dups).toEqual([]);
  });

  /** Стыки полос — там формула меняет ветку, и там ломалось трижды за неделю. */
  it.each(ATTENTION_MODES)('%s — на стыках полос величина не проседает', (mode) => {
    const bad: string[] = [];
    for (const b of BAND_EDGES[mode]) {
      if (b + 1 > LADDER_RANGE[mode]) continue;
      const before = attentionLoad(mode, b);
      const after = attentionLoad(mode, b + 1);
      if (after <= before) bad.push(`L${b}→L${b + 1}: ${before.toFixed(3)} → ${after.toFixed(3)}`);
    }
    expect(bad).toEqual([]);
  });

  /**
   * 🔴 ЗЕЛЁНОЕ ВСЛЕПУЮ ЗДЕСЬ ОСОБЕННО ДЁШЕВО. Все пробы выше остались бы зелёными,
   * если бы `attentionLoad` вернул одну и ту же константу на всё, а `LADDER_RANGE`
   * съёжился до одного уровня. Поэтому: полоса у каждой пробы непуста и содержит
   * больше одного уровня, а величины по уровням действительно РАЗНЫЕ.
   */
  it.each(ATTENTION_MODES)('%s — и это не зелёное вслепую: величина реально меняется', (mode) => {
    const ls = levels(mode);
    expect(ls.length).toBeGreaterThan(1);
    const distinct = new Set(ls.map((l) => attentionLoad(mode, l).toFixed(6)));
    expect(`${mode}: разных значений ${distinct.size} из ${ls.length}`)
      .toBe(`${mode}: разных значений ${distinct.size} из ${ls.length}`);
    expect(distinct.size).toBeGreaterThan(ls.length / 2);
  });

  /** Валюты у пяти проб разные — складывать нельзя, и это фиксируется явно. */
  it('у каждой из пяти названа своя мера прохода', () => {
    for (const m of ATTENTION_MODES) {
      expect(SESSION_MEASURE[m].field.length).toBeGreaterThan(0);
      expect(SESSION_MEASURE[m].norm.length).toBeGreaterThan(0);
    }
    const fields = ATTENTION_MODES.map((m) => SESSION_MEASURE[m].field);
    expect(new Set(fields).size).toBe(ATTENTION_MODES.length);   // пять разных, не одна общая
  });
});

/**
 * ФЛАНКЕР: КОНГРУЭНТНЫХ ПРОБ ОБЯЗАНО ХВАТАТЬ НА СРЕДНЕЕ.
 *
 * `flanker_effect_ms` = RT(конфликт) − RT(согласованные). Вторая половина разности
 * считается по конгруэнтным пробам, и если их горстка — показатель превращается в
 * шум. Ровно этот довод записан у Струпа (stroop.tsx:120-126), где долю поэтому и
 * заморозили. Здесь доля растёт с уровнем (0,50 → 0,30), и на верхней полосе
 * конгруэнтных остаётся 6 из 20.
 *
 * ⚠️ Порог 6 — это НЕ «столько достаточно», а «столько сейчас». Проба сторожит
 * ухудшение, а не объявляет текущее состояние хорошим: разбор и три числа ущерба —
 * PROJECT_REF §0, ДЕФЕКТ 1, решение по нему за Денисом (вопрос 1).
 */
describe('фланкер: измеряемая величина не должна вырождаться от лестницы', () => {
  it('конгруэнтных проб на каждом уровне не меньше, чем сейчас на верхнем', () => {
    const thin = Array.from({ length: LADDER_RANGE.flanker }, (_, i) => i + 1)
      .map((l) => ({ l, n: flankerCongruentTrials(l) }))
      .filter((x) => x.n < 6);
    expect(thin).toEqual([]);
  });

  /**
   * 🔴 ГЛАВНЫЙ ЗАСЛОН ЭТОЙ ПРОБЫ: ДОЛЯ КОНФЛИКТНЫХ БОЛЬШЕ НЕ РУЧКА СЛОЖНОСТИ.
   *
   * Ровно такой же заслон стоит у Струпа (`conflict-ratio-is-not-difficulty`), и
   * ровно его во фланкере не было — из-за чего лестница росла долей и уменьшала
   * `flanker_effect_ms`, ради которого проба существует. Спрашиваем игру, что она
   * даёт на первом и на пятнадцатом, а не читаем строчку в исходнике.
   */
  /**
   * 🔴 РЯД СТИМУЛОВ ПОМЕЩАЕТСЯ В УЗКИЙ ТЕЛЕФОН НА ВСЕХ УРОВНЯХ.
   *
   * Разнос — ось сложности, и растить её вверх соблазнительно. Но ряд = 4 фланга
   * по 36 + центр 56 + 4 зазора, и при разносе 34 px это 336 px: на телефоне
   * 360 px ряд вылезает за экран. Тестировщик NZT-48 04.09.2026 жаловался ровно
   * на это («экран разъезжается»), поэтому ось ограничена сверху пробой, а не
   * обещанием в комментарии. Порог 328 = 360 минус отступы каркаса.
   */
  it('🔴 ряд стимулов фланкера помещается в 360 px на каждом уровне', () => {
    const широкие = Array.from({ length: LADDER_RANGE.flanker }, (_, i) => i + 1)
      .map((l) => ({ l, w: flankerRowWidthPx(flankerParams(l).gapPx) }))
      .filter((x) => x.w > 328);
    expect(широкие).toEqual([]);
  });

  it('🔴 доли согласованных и конфликтных НЕ зависят от уровня', () => {
    const ls = Array.from({ length: LADDER_RANGE.flanker }, (_, i) => i + 1);
    const доли = ls.map((l) => { const p = flankerParams(l); return `${p.pCong}/${p.pIncong}`; });
    expect(new Set(доли).size).toBe(1);
  });

  /**
   * И встречная половина: если доля заморожена, лестница обязана расти ЧЕМ-ТО ЕЩЁ.
   * Иначе «доля не растёт» достигается заодно с «ничего не растёт», и проба выше
   * останется зелёной на мёртвой лестнице.
   */
  it('🔴 разнос цель↔фланги сокращается на КАЖДОМ уровне — ось Эриксена жива', () => {
    const ls = Array.from({ length: LADDER_RANGE.flanker }, (_, i) => i + 1);
    const gaps = ls.map((l) => flankerParams(l).gapPx);
    const плохие: string[] = [];
    for (let i = 1; i < gaps.length; i++) {
      if (gaps[i] >= gaps[i - 1]) плохие.push(`L${ls[i - 1]}→L${ls[i]}: ${gaps[i - 1]} → ${gaps[i]}`);
    }
    expect(плохие).toEqual([]);
    // и путь пройден, а не потоптался: верх теснее низа не меньше чем впятеро
    expect(gaps[0] / gaps[gaps.length - 1]).toBeGreaterThanOrEqual(5);
  });

  it('🔴 доля конфликтных не доведена до вырождения нейтральных проб в ноль', () => {
    const zeroNeutral = Array.from({ length: LADDER_RANGE.flanker }, (_, i) => i + 1)
      .map((l) => { const p = flankerParams(l); return { l, n: Math.round(p.trials * (1 - p.pCong - p.pIncong)) }; })
      .filter((x) => x.n < 1);
    expect(zeroNeutral).toEqual([]);
  });
});
