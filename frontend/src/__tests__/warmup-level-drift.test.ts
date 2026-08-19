/* psygames-warmup-level-drift · VER 1 · 19.08.2026 */
/**
 * ШАГ ЗАРЯДКИ НЕ ДВИГАЕТ ПЕРСОНАЛЬНЫЙ УРОВЕНЬ.
 *
 * 🔴 ЧТО НАШЛОСЬ. В «Спан по клеткам» потерялся `!isPreset`: партия из плейлиста
 * зарядки поднимала уровень через `lvl.reach` и роняла через `lvl.fail`. У обоих
 * близнецов (корси, ряд цифр) защита стоит. Значит уровень менялся не от
 * результата человека, а от того, попалась ли ему эта игра в наборе.
 *
 * ⚠️ ПРАВИЛО НЕ УНИВЕРСАЛЬНО, И ЭТО НАРОЧНО. Маджонг и сортировка играют в
 * зарядке РОВНО ТУ ЖЕ доску, что и в личной партии (`loadLevel(lvl.level)`), и
 * сохраняют прогресс намеренно — на это есть свой гейт
 * (`warmup-persistent-level.test.ts`). Поэтому здесь проверяется не «у всех
 * стоит !isPreset», а две вещи: правило-помощник ведёт себя правильно, и круг
 * экранов, которые роняют уровень в зарядке, НЕ РАСТЁТ.
 *
 * ⚠️ ПРО КОММЕНТАРИИ. Исходник просматривается со срезанными комментариями:
 * упоминание `lvl.fail()` в пояснении рядом — не механизм.
 */
import { levelOutcome } from '@/src/services/levelOutcome';

declare const __dirname: string;
declare function require(id: string): any;
const fs = require('fs');
const path = require('path');

const DIR = path.resolve(__dirname, '../../app/games');
const FILES: string[] = fs.readdirSync(DIR).filter((f: string) => f.endsWith('.tsx'));
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const read = (f: string) => code(fs.readFileSync(path.join(DIR, f), 'utf8') as string);

/**
 * ДОЛГ: экраны, где провал партии роняет уровень и в шаге зарядки тоже.
 * Список закрыт — он может только уменьшаться. Каждый переезд отсюда должен
 * быть осознанной правкой, а не побочным эффектом.
 */
const DEMOTES_IN_WARMUP = [
  'anagrams.tsx', 'bart.tsx', 'cloze.tsx', 'counter.tsx', 'cpt.tsx', 'go-no-go.tsx',
  'inhibition.tsx', 'lexical-decision.tsx', 'mnemonics.tsx', 'number-bonds.tsx',
  'ospan.tsx', 'posner.tsx', 'prl.tsx', 'proofreading.tsx', 'reading-span.tsx',
  'semantic-sort.tsx', 'simon.tsx', 'stop-signal.tsx', 'stroop-emotional.tsx',
  'switching-task.tsx', 'wcst.tsx', 'word-pairs.tsx',
];

/** Экран роняет уровень без оглядки на то, что это шаг зарядки. */
function demotesUnguarded(src: string): boolean {
  if (!/lvl\.fail\(\)/.test(src)) return false;
  const guarded = /!isPreset[^\n]*lvl\.fail\(\)|lvl\.fail\(\)[^\n]*!isPreset/.test(src)
    || /out\.lowerLevel/.test(src);
  return !guarded;
}

describe('правило исхода уровня — поведением', () => {
  it('шаг зарядки не двигает уровень ни вверх, ни вниз', () => {
    for (const cleared of [true, false]) {
      const out = levelOutcome({ isPreset: true, cleared });
      expect(`cleared=${cleared}: ${out.raiseLevel}/${out.lowerLevel}`).toBe(`cleared=${cleared}: false/false`);
    }
  });

  it('личная партия: взял планку → вверх, не взял → вниз', () => {
    expect(levelOutcome({ isPreset: false, cleared: true })).toEqual(
      { passed: true, raiseLevel: true, lowerLevel: false, phase: 'cleared' });
    expect(levelOutcome({ isPreset: false, cleared: false })).toEqual(
      { passed: false, raiseLevel: false, lowerLevel: true, phase: 'cleared' });
  });

  /**
   * 🔴 СЦЕПКА, РАДИ КОТОРОЙ ПРАВИЛО ЖИВЁТ ОДНИМ КУСКОМ. Выключить прохождение в
   * зарядке и оставить баннер уровня — значит показать «почти, ещё раз» человеку,
   * который ничего не провалил. Такое расхождение читается как поломка игры.
   */
  it('🔴 нигде не бывает «не прошёл» вместе с баннером уровня в зарядке', () => {
    const bad: string[] = [];
    for (const isPreset of [true, false]) {
      for (const cleared of [true, false]) {
        const o = levelOutcome({ isPreset, cleared });
        if (isPreset && o.phase === 'cleared') bad.push(`isPreset+${cleared}: баннер уровня в зарядке`);
        if (!o.passed && o.raiseLevel) bad.push(`${isPreset}/${cleared}: не прошёл, но уровень вверх`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('кто ещё роняет уровень в зарядке', () => {
  it('есть что проверять — иначе тест зелен вслепую', () => {
    expect(FILES.length).toBeGreaterThan(50);
  });

  it('🔴 «Спан по клеткам» больше не двигает уровень из зарядки', () => {
    const src = read('spatial-span.tsx');
    expect(demotesUnguarded(src)).toBe(false);
    // и вверх тоже: подъём идёт через решение помощника, а не напрямую
    expect(/if \(out\.raiseLevel\) lvl\.reach\(/.test(src)).toBe(true);
  });

  it('🔴 круг таких экранов не растёт', () => {
    const now = FILES.filter((f) => demotesUnguarded(read(f))).sort();
    const added = now.filter((f) => !DEMOTES_IN_WARMUP.includes(f));
    expect(added).toEqual([]);
  });

  it('в списке долга нет записей про экраны, которые уже починили', () => {
    const now = FILES.filter((f) => demotesUnguarded(read(f)));
    const stale = DEMOTES_IN_WARMUP.filter((f) => !now.includes(f))
      .map((f) => `${f}: уровень в зарядке уже не роняется — убрать из списка`);
    expect(stale).toEqual([]);
  });
});
