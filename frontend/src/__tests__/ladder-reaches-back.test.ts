/* psygames-ladder-reaches-back · VER 1 · 22.08.2026 */
/**
 * ДОРОГА НАЗАД ЕСТЬ ВСЕГДА.
 *
 * 🔴 ЧТО НАШЛОСЬ. Тропинка обрывалась на пятнадцатом уровне у сорока шести экранов
 * из шестидесяти девяти: `maxLevel` они не передавали, а по умолчанию стояло 15.
 * Всё, что человек прошёл выше, на карте просто отсутствовало — переиграть нельзя,
 * потому что узла нет. Вторая половина той же беды: `currentLevel` — это ВЫБРАННЫЙ
 * уровень, и стоило вернуться на пройденный, карта схлопывалась до него, отрезая
 * дорогу обратно вверх.
 *
 * ⚠️ И ЧТО ПРОВЕРКОЙ НЕ ПОДТВЕРДИЛОСЬ. Вторая часть жалобы — «22 игры не умеют
 * понижать, оба пути назад отрезаны» — в такой формулировке неверна. Понижения
 * действительно нет у двадцати двух, но восемнадцать из них дают переиграть
 * пройденное прямо по карте (`onPickLevel`), а оставшиеся четыре считают ЗАХОДЫ,
 * а не сложность (`countsRuns`): понижать там нечего. Путь назад резала именно
 * обрезанная карта — и вместе с ней он и чинится.
 *
 * Здесь закрепляются оба правила: карта дотягивается до достигнутого, и ни одна
 * игра не остаётся без пути назад.
 */
jest.mock('@/src/contexts/ProfileContext', () => ({
  useProfile: () => ({ profile: { id: 'odv999' } }),
}));

jest.mock('@/src/contexts/LanguageContext', () => ({
  useLanguage: () => ({
    t: (k: string) => k,
    language: 'ru',
  }),
}));

import { ladderCap, LADDER_MIN } from '@/src/components/LevelProgressMap';

declare const __dirname: string;
declare function require(id: string): any;
const fs = require('fs');
const path = require('path');
const DIR = path.resolve(__dirname, '../../app/games');
const FILES: string[] = fs.readdirSync(DIR).filter((f: string) => f.endsWith('.tsx'));
const read = (f: string): string => fs.readFileSync(path.join(DIR, f), 'utf8') as string;
const strip = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

describe('потолок тропинки', () => {
  it('🔴 карта дотягивается до достигнутого, даже если игра потолка не объявила', () => {
    expect(ladderCap(undefined, 1, 40)).toBe(40);
    expect(ladderCap(undefined, 1, 1)).toBe(LADDER_MIN);
    expect(ladderCap(undefined, 1, undefined)).toBe(LADDER_MIN);
  });

  it('🔴 возврат на пройденный уровень не срезает карту', () => {
    // человек с рекордом 40 выбрал переиграть третий
    expect(ladderCap(undefined, 3, 40)).toBe(40);
    expect(ladderCap(12, 3, 40)).toBe(40);
  });

  it('🔴 объявленный потолок игры уважается, но не обрезает достигнутое', () => {
    expect(ladderCap(60, 5, 5)).toBe(60);
    expect(ladderCap(12, 12, 12)).toBe(12);
    // Питомец не должен оказаться за краем карты — даже если достигнутое НИЖЕ, чем
    // текущий выбор (так бывает сразу после подъёма, до записи потолка).
    expect(ladderCap(12, 20, 5)).toBe(20);
    expect(ladderCap(undefined, 40, 5)).toBe(40);
  });

  it('🔴 карта не короче обещанных программой пятнадцати', () => {
    for (const best of [0, 1, 5, 14]) expect(ladderCap(undefined, 1, best)).toBe(LADDER_MIN);
  });
});

describe('экраны', () => {
  const withMap = FILES.filter((f) => strip(read(f)).includes('LevelProgressMap'));

  it('есть что проверять', () => {
    expect(withMap.length).toBeGreaterThan(50);
  });

  it('🔴 каждый экран сообщает карте достигнутый потолок', () => {
    const bad = withMap.filter((f) => !/bestLevel=\{/.test(strip(read(f))));
    expect(bad).toEqual([]);
  });

  /**
   * Дорога назад — одна из трёх: понижение по гистерезису, выбор пройденного узла на
   * карте, либо у игры вовсе нет сложности (счётчик заходов). Ни одной без всех трёх.
   */
  it('🔴 ни одна игра не остаётся без пути назад', () => {
    const stuck: string[] = [];
    for (const f of FILES) {
      const src = strip(read(f));
      const m = /const\s+([A-Za-z_$][\w$]*)\s*=\s*usePersistentLevel\(/.exec(src);
      if (!m) continue;
      const lvl = m[1] as string;
      const canDemote = src.includes(`${lvl}.fail()`);
      const canPick = /\bonPickLevel\b/.test(src);
      const countsRuns = src.includes('countsRuns');
      if (!canDemote && !canPick && !countsRuns) stuck.push(f);
    }
    expect(stuck).toEqual([]);
  });

  it('🔴 счётчик заходов не притворяется сложностью', () => {
    // Если экран объявил countsRuns, он не должен ещё и понижать «уровень»:
    // это значило бы, что число заходов у человека отнимают за плохую партию.
    const bad: string[] = [];
    for (const f of FILES) {
      const src = strip(read(f));
      const m = /const\s+([A-Za-z_$][\w$]*)\s*=\s*usePersistentLevel\(/.exec(src);
      if (!m || !src.includes('countsRuns')) continue;
      if (src.includes(`${m[1]}.fail()`)) bad.push(f);
    }
    expect(bad).toEqual([]);
  });
});

/**
 * 🔴 И САМА КАРТА РИСУЕТСЯ ПО ЭТОМУ ПРАВИЛУ. Правило можно починить и не подключить:
 * тогда `ladderCap` зелен, а на экране всё та же обрезанная тропинка. Рендерим
 * настоящий компонент и считаем узлы.
 */
describe('карта — настоящим рендером', () => {
  function nodeCount(props: Record<string, unknown>): number {
    const React = require('react');
    const TestRenderer = require('react-test-renderer');
    const Map = require('@/src/components/LevelProgressMap').default;
    let tree: any;
    TestRenderer.act(() => {
      tree = TestRenderer.create(React.createElement(Map, {
        gameId: 'digit_span',
        colors: { surface: '#fff', text: '#000', textSecondary: '#666', primary: '#07f', card: '#eee', border: '#ccc' },
        ...props,
      }));
    });
    // узлы уровней помечены testID вида `ladder-node-<N>` либо считаются по кружкам
    const json = JSON.stringify(tree.toJSON());
    // ⚠️ Снимаем дерево сразу: компонент дочитывает рекорды времени асинхронно, и
    // недосмонтированный экземпляр шумит уже после конца проверки.
    TestRenderer.act(() => { tree.unmount(); });
    const ids = new Set([...json.matchAll(/ladder-node-(\d+)/g)].map((m) => Number(m[1])));
    return ids.size ? Math.max(...ids) : (json.match(/Circle/g) || []).length;
  }

  it('🔴 карта тянется до достигнутого, а не до пятнадцатого', () => {
    const short = nodeCount({ currentLevel: 3, bestLevel: 3 });
    const long = nodeCount({ currentLevel: 3, bestLevel: 40 });
    expect(`узлов при рекорде 3: ${short}, при рекорде 40: ${long} — длиннее: ${long > short}`)
      .toBe(`узлов при рекорде 3: ${short}, при рекорде 40: ${long} — длиннее: true`);
  });
});
