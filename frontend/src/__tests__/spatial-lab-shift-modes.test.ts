/* psygames-spatial-lab-shift-modes · VER 2 · 17.09.2026 */
/* psygames-spatial-claude-mac · задача afb6ab5b */
/**
 * 🔴 «СДВИГ ЧИСЕЛ» И «СЕТЬ СО СДВИГОМ» — ВКЛАДКАМИ ЛАБОРАТОРИИ, НА ЯДРЕ CODEX.
 *
 * Денис 16.09.2026: «движок кодекс надо использовать». Ступени обоих упражнений собраны и
 * проверены пробой spatial-sixteen-netslide-core; здесь — то, что их довозит до игрока:
 *   · раздача, сохранение и восстановление партии (`snapshot.mjs`) знают четыре упражнения;
 *   · в сохранении принимаются ТОЛЬКО ходы своего упражнения — сдвиг не пролезет в «Поворот
 *     чисел», поворот плитки не пролезет в «Сдвиг чисел»;
 *   · сохранение до 17.09, где упражнений было два, читается, а не выбрасывается;
 *   · подсказанная линия первой ступени выбрана при раздаче;
 *   · описание ступени говорит числа задачи на 12 языках, а «Сеть со сдвигом» не выдаёт
 *     число перемешивания за длину решения;
 *   · экран и маршрут действительно ведут к ним: вкладки, стрелки, лестницы.
 *
 * ⚠️ Ядро — модули `.mjs`, jest их не преобразует: данные берём у настоящего node.
 */
import { translateFor, LANGUAGES } from '@/src/contexts/LanguageContext';
import { levelNote } from '@/src/components/spatialLabLevelNote';

declare const __dirname: string;
declare function require(id: string): any;
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const CORE = path.join(__dirname, '..', 'games', 'spatial-core');
const SCRIPT = `
const core = await import(${JSON.stringify(path.join(CORE, 'core.mjs'))});
const snap = await import(${JSON.stringify(path.join(CORE, 'snapshot.mjs'))});
const ns = await import(${JSON.stringify(path.join(CORE, 'netslide-levels.mjs'))});
const выиграно = (mode, b) => mode === 'netslide' ? ns.netslideWon(b) : core.solved(b);
const уровни = [], отказы = [], свободные = [];
for (const mode of ['sixteen', 'netslide']) for (let level = 1; level <= 50; level++) for (const seed of [5, 77]) {
  const deal = snap.createDeal(mode, seed, level), t = deal.task, n = deal.state.initial.width;
  const half = t.solution.slice(0, Math.floor(t.solution.length / 2));
  let s = deal.state; for (const c of half) s = core.commit(s, c);
  const raw = snap.encodeSnapshot({ mode, seed, level, selection: deal.selection, state: s, completed: { twiddle: [], net: [], sixteen: [level], netslide: [] } });
  const back = snap.decodeSnapshot(raw);
  уровни.push({ mode, level, seed, n,
    нерешено: !выиграно(mode, deal.state.initial), решается: выиграно(mode, core.replay(deal.state.initial, t.solution)),
    сохранилось: !!back && back.mode === mode && back.level === level && back.selection === deal.selection
      && JSON.stringify(back.state.present) === JSON.stringify(s.present) && back.completed.sixteen[0] === level,
    подсказка: t.guide, выбор: deal.selection,
    задача: { level: t.level, spec: t.spec, minimumMoves: t.minimumMoves ?? null, lowerBound: t.lowerBound ?? null, shifts: t.shifts } });
  if (level === 12 && seed === 5) {
    const чужие = [
      ['плитка', { kind: 'tile', index: 0, amount: 1 }], ['блок', { kind: 'block', row: 0, col: 0, size: 2, amount: 1 }],
      ['строка за полем', { kind: 'row', index: n, amount: 1 }], ['шаг 2', { kind: 'column', index: 0, amount: 2 }],
    ];
    for (const [имя, c] of чужие) {
      const r = JSON.parse(raw); r.past = [...r.past, c];
      отказы.push({ mode, имя, принято: !!snap.decodeSnapshot(JSON.stringify(r)) });
    }
  }
}
for (const mode of ['sixteen', 'netslide']) for (const seed of [1, 2, 3]) {
  const d = snap.createDeal(mode, seed, 0);
  свободные.push({ mode, n: d.state.initial.width, выиграно: выиграно(mode, d.state.initial), задача: d.task });
}
// в «Поворот чисел» сдвиг не пролезает
const tw = snap.createDeal('twiddle', 42, 3);
const twRaw = JSON.parse(snap.encodeSnapshot({ mode: 'twiddle', seed: 42, level: 3, selection: 0, state: tw.state, completed: { twiddle: [], net: [] } }));
twRaw.past = [{ kind: 'row', index: 0, amount: 1 }];
const сдвигВПовороте = !!snap.decodeSnapshot(JSON.stringify(twRaw));
// сохранение до 17.09: два упражнения
const старое = snap.decodeSnapshot(JSON.stringify({ version: 1, mode: 'net', seed: 42, level: 0, selection: 0, past: [], future: [], completed: { net: [1, 2], twiddle: [3] } }));
const порча = snap.decodeSnapshot(JSON.stringify({ version: 1, mode: 'net', seed: 42, level: 0, selection: 0, past: [], future: [], completed: { net: [], twiddle: [], sixteen: 'x' } }));
process.stdout.write(JSON.stringify({ режимы: snap.SPATIAL_MODES, уровни, отказы, свободные, сдвигВПовороте, старое: старое && старое.completed, порча: !!порча }));
`;
const DATA = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', SCRIPT], { encoding: 'utf8', timeout: 180000 }));

describe('«Сдвиг чисел» и «Сеть со сдвигом» в лаборатории', () => {
  it('прибор жив: 4 упражнения, 200 раздач, 8 чужих ходов на проверку', () => {
    expect(DATA.режимы).toEqual(['twiddle', 'net', 'sixteen', 'netslide']);
    expect(DATA.уровни.length).toBe(200);
    expect(DATA.отказы.length).toBe(8);
  });

  it('🔴 каждая ступень выдаётся нерешённой, решается своим маршрутом и переживает сохранение с полпути', () => {
    const плохо = DATA.уровни.filter((u: any) => !u.нерешено || !u.решается || !u.сохранилось)
      .map((u: any) => `${u.mode} L${u.level} seed ${u.seed}: нерешено ${u.нерешено}, решается ${u.решается}, сохранилось ${u.сохранилось}`);
    expect(плохо.slice(0, 5)).toEqual([]);
  });

  it('🔴 в сохранение не пролезает чужой ход — ни в сдвиг, ни в «Поворот чисел»', () => {
    expect(DATA.отказы.filter((o: any) => o.принято).map((o: any) => `${o.mode}: ${o.имя}`)).toEqual([]);
    expect(DATA.сдвигВПовороте).toBe(false);
  });

  it('🔴 сохранение до 17.09 (два упражнения) читается, а испорченное — нет', () => {
    expect(DATA.старое).toEqual({ twiddle: [3], net: [1, 2], sixteen: [], netslide: [] });
    expect(DATA.порча).toBe(false);
  });

  it('подсказанная линия первой ступени выбрана при раздаче', () => {
    const первые = DATA.уровни.filter((u: any) => u.level === 1);
    expect(первые.length).toBe(4);
    for (const u of первые) {
      expect(u.подсказка).not.toBeNull();
      const линия = u.подсказка.kind === 'row' ? Math.floor(u.выбор / u.n) : u.выбор % u.n;
      expect(`${u.mode} ${u.подсказка.kind}: ${линия}`).toBe(`${u.mode} ${u.подсказка.kind}: ${u.подсказка.index}`);
    }
  });

  it('свободная игра — поле 4×4, перемешанное, без ступени', () => {
    for (const с of DATA.свободные) expect(`${с.mode}: ${с.n} ${с.выиграно} ${с.задача}`).toBe(`${с.mode}: 4 false null`);
  });

  it('🔴 описание ступени: числа задачи, 12 языков, без чужих букв и пустых мест', () => {
    const плохо: string[] = [];
    for (const u of DATA.уровни.filter((x: any) => x.seed === 5)) for (const { code } of LANGUAGES) {
      const t = (k: string) => translateFor(code, k);
      const текст = levelNote(u.задача, t, u.mode);
      const где = `${u.mode} L${u.level} ${code}`;
      if (!текст.trim()) { плохо.push(`${где}: пусто`); continue; }
      if (/[{}]/.test(текст)) плохо.push(`${где}: несъеденная подстановка «${текст}»`);
      if (code !== 'ru' && /[а-яё]/i.test(текст)) плохо.push(`${где}: кириллица «${текст}»`);
      if (u.level === 1) { if (текст !== t('spatialLabShiftL1')) плохо.push(`${где}: первая ступень не про подсказанную линию`); continue; }
      if (u.mode === 'netslide') {
        if (!текст.includes(String(u.задача.shifts))) плохо.push(`${где}: нет числа сдвигов ${u.задача.shifts}`);
        if (текст === t('spatialLabTwiddleExact').replace(/\{w\}/g, String(u.n)).replace('{n}', String(u.задача.shifts))) плохо.push(`${где}: перемешивание выдано за кратчайшее решение`);
      } else if (u.задача.minimumMoves !== null) {
        if (!текст.includes(String(u.задача.minimumMoves))) плохо.push(`${где}: нет точного числа ходов`);
      } else if (!текст.includes(String(u.задача.lowerBound))) плохо.push(`${где}: нет нижней оценки`);
    }
    expect(плохо.slice(0, 6)).toEqual([]);
  });

  it('словарь: 15 новых ключей на 12 языках, имена вкладок не совпадают с головоломками Тэтхэма', () => {
    const ключи = ['spatialSixteen', 'spatialNetslide', 'spatialLabSixteenGoal', 'spatialLabNetslideGoal', 'spatialLabShiftRowLeft', 'spatialLabShiftRowRight',
      'spatialLabShiftColUp', 'spatialLabShiftColDown', 'spatialLabLinePos', 'spatialLabGuideRowLeft', 'spatialLabGuideRowRight', 'spatialLabGuideColUp',
      'spatialLabGuideColDown', 'spatialLabShiftL1', 'spatialLabNetslideShifts'];
    const плохо: string[] = [];
    for (const { code } of LANGUAGES) {
      for (const к of ключи) if (translateFor(code, к) === к || !translateFor(code, к).trim()) плохо.push(`${code}: нет ${к}`);
      if (translateFor(code, 'spatialSixteen') === translateFor(code, 'puzzlesSixteen')) плохо.push(`${code}: «Сдвиг чисел» назван как «Шестнадцать»`);
      if (translateFor(code, 'spatialNetslide') === translateFor(code, 'puzzlesNetslide')) плохо.push(`${code}: «Сеть со сдвигом» названа как «Трубы со сдвигом»`);
    }
    expect(плохо).toEqual([]);
  });

  it('экран и маршрут ведут к ним: вкладки из списка упражнений, четыре стрелки, ход — сдвиг выбранной линии с анимацией, своя лестница', () => {
    const экран = fs.readFileSync(path.join(__dirname, '..', 'components', 'SpatialLab.tsx'), 'utf8');
    expect(экран).toMatch(/SPATIAL_MODES\.map\(m=>/);
    for (const к of ['spatialLabShiftRowLeft', 'spatialLabShiftRowRight', 'spatialLabShiftColUp', 'spatialLabShiftColDown']) expect(экран).toContain(`'${к}'`);
    expect(экран).toMatch(/accessibilityLabel=\{t\(key\)\}[^\n]*onPress=\{\(\)=>shift\(kind,amount\)\}/);
    // VER 2: сдвиг едет, а не перескакивает — ход засчитывается в конце анимации, линия уходит за край доски
    expect(экран).toMatch(/const index=kind==='row'\?Math\.floor\(selection\/n\):selection%n;[\s\S]{0,900}?setSliding\(\{kind,index\}\);\s*animateTurn\(amount,\(\)=>setState\(s=>commit\(s,\{kind,index,amount\}\)\)\)/);
    expect(экран).toMatch(/testID="spatial-board" style=\{\{width:side,gap:4,overflow:sliding\?'hidden':'visible'\}\}/);
    expect(экран).toMatch(/testID="spatial-slide-wrap"/);
    expect(экран).toMatch(/if\(cmd\.kind==='row'\|\|cmd\.kind==='column'\)setSliding\(/);
    const маршрут = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'games', 'spatial-lab.tsx'), 'utf8');
    expect(маршрут).toMatch(/ИЗ_АДРЕСА:readonly Mode\[\]=\['net','sixteen','netslide'\]/);
    for (const id of ['spatial_lab_net', 'spatial_lab_twiddle', 'spatial_lab_sixteen', 'spatial_lab_netslide']) expect(маршрут).toContain(`usePersistentLevel('${id}')`);
  });
});
