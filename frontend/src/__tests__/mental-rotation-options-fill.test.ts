/* psygames-mental-rotation-options-fill · VER 2 · 17.09.2026 */
/* psygames-spatial-claude-mac · задача a2967e6f, отчёт c8903296 */
/**
 * 🔴 ФИГУРА ВАРИАНТА ЗАНИМАЕТ КАРТОЧКУ, А НЕ ТЕРЯЕТСЯ В НЕЙ — И В АЛЬБОМЕ ТОЖЕ.
 *
 * Отчёт c8903296 (932×430, альбом): «картинка чуть ли не на 50 % пустая». Замер 17.09.2026
 * на стенде до правки: карточка 226×62, фигура 27×24 — 4–7 % площади карточки; в портрете
 * 26–47 %. Две причины, и проба стережёт обе:
 *   1. на низком экране рисунок зажимался до 48 px при карточке в полряда (`optionLayout`);
 *   2. неподвижный вариант вписывался по описанной сфере — с запасом под поворот, которого
 *      у него нет (`stillUnit`): рисунок занимал 53–84 % своего квадрата.
 * После правки на стенде: альбом 24–41 % площади карточки, портрет 30–39 %.
 *
 * 🔴 VER 2 — ТРЕТЬЯ ПРИЧИНА, КОТОРУЮ VER 1 САМА И СОЗДАЛА. Проба мерила варианты, а не то,
 * что после них осталось полю. Варианты выросли до 0,24 высоты, эталон остался 104 — и на
 * вышедшей 2.54.15 карточка эталона ушла под полосу вариантов: 844×390 — срез 34 px, 740×360 —
 * 56, прибор `scripts/rotation-landscape-fit.mjs` дал 34 нарушения из 36 замеров. Теперь в альбоме
 * эталон и варианты делят высоту поровну (`LANDSCAPE_FIXED_HEIGHT`), и проба стережёт ДЕЛЁЖ,
 * а не один размер варианта. После правки тот же прибор: 0 нарушений из 56 замеров на 4 окнах.
 */
import { LANDSCAPE_FIXED_HEIGHT, LANDSCAPE_PROMPT_LINE, optionLayout } from '@/src/games/mental-rotation/optionLayout';
import { shapeSurface, stillUnit } from '@/src/games/mental-rotation/core/surface';
import { buildRotationTask, createRng, shapesOfSize } from '@/src/games/mental-rotation/core';
import type { Shape } from '@/src/games/mental-rotation/core';

declare const __dirname: string;
declare function require(id: string): any;
const fs = require('fs');
const path = require('path');

const рамка = (shape: Shape, size: number, unit?: number) => {
  const pts = shapeSurface(shape, size, 'x', 0, [], unit).flatMap((f) => f.points);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
};

describe('раскладка вариантов «Мысленного вращения»', () => {
  /** Альбомные окна живых телефонов: Android 740×360, iPhone SE/mini, 12–15, Plus/Pro Max, планшет-фаблет. */
  const АЛЬБОМ: [number, number][] = [[740, 360], [667, 375], [812, 375], [844, 390], [896, 414], [932, 430], [1024, 500]];

  it('🔴 альбом: один ряд, ряд влезает в ширину, рисунок заполняет карточку', () => {
    for (const [w, h] of АЛЬБОМ) for (const count of [3, 4]) {
      const l = optionLayout({ viewportWidth: w, viewportHeight: h, answerWidth: 480, count, compactReview: false });
      expect(`${w}×${h}/${count}: ${l.oneRow}`).toBe(`${w}×${h}/${count}: true`);
      // не откат к 48 px из 2.54.14: на самом низком окне 62, на 390 — 77
      expect(l.optSize).toBeGreaterThanOrEqual(60);
      expect(count * (l.optSize + 12) + (count - 1) * 10).toBeLessThanOrEqual(w - 48);
      expect(l.optSize + 14).toBeLessThanOrEqual(Math.round(h * 0.3));
    }
  });

  it('🔴 альбом: эталон и варианты влезают в высоту вместе, и эталон не мельче варианта', () => {
    /**
     * Состав высоты — замер 17.09.2026 на экспорт-сборке (7 альбомных окон, задание «Поворот»):
     * поле с 119 px; под полем карточка варианта (рисунок + 14) и ещё 21; в поле отступы 5 + 5,
     * вопрос 16, зазор 6; карточка эталона — рисунок + 33 при полях 6; запас 16 на вторую строку.
     * Поменялось это число — значит поменялась вёрстка: перемерь прибором и перепиши строку здесь.
     */
    expect(LANDSCAPE_FIXED_HEIGHT).toBe(119 + 35 + 32 + 33 + 16);
    for (const [w, h] of АЛЬБОМ) for (const count of [3, 4]) {
      const l = optionLayout({ viewportWidth: w, viewportHeight: h, answerWidth: 480, count, compactReview: false });
      expect(l.refSize).toBeDefined();
      const ref = l.refSize as number;
      expect(`${w}×${h}: эталон ${ref} + вариант ${l.optSize} + ${LANDSCAPE_FIXED_HEIGHT} ≤ ${h}`)
        .toBe(`${w}×${h}: эталон ${ref} + вариант ${l.optSize} + ${LANDSCAPE_FIXED_HEIGHT} ≤ ${ref + l.optSize + LANDSCAPE_FIXED_HEIGHT <= h ? h : 'НЕ ВЛЕЗАЕТ'}`);
      expect(ref).toBeLessThanOrEqual(104);
      // эталон не мельче варианта, пока его не упёр потолок 104
      if (ref < 104) expect(ref).toBeGreaterThanOrEqual(l.optSize);
    }
  });

  it('🔴 длинный вопрос отнимает строку у эталона, а не у вариантов — варианты не прыгают между раундами', () => {
    const две = optionLayout({ viewportWidth: 667, viewportHeight: 375, answerWidth: 480, count: 4, compactReview: false, promptLines: 2 });
    const одна = optionLayout({ viewportWidth: 667, viewportHeight: 375, answerWidth: 480, count: 4, compactReview: false, promptLines: 1 });
    const три = optionLayout({ viewportWidth: 667, viewportHeight: 375, answerWidth: 480, count: 4, compactReview: false, promptLines: 3 });
    expect([одна.optSize, три.optSize]).toEqual([две.optSize, две.optSize]);
    expect(одна.refSize).toBe(две.refSize);                               // две строки уже заложены
    expect((две.refSize as number) - (три.refSize as number)).toBe(LANDSCAPE_PROMPT_LINE);
  });

  it('в разборе на альбоме эталон того же размера, что в задании — не прыгает в момент ответа', () => {
    const задание = optionLayout({ viewportWidth: 844, viewportHeight: 390, answerWidth: 480, count: 4, compactReview: false });
    const разбор = optionLayout({ viewportWidth: 844, viewportHeight: 390, answerWidth: 480, count: 4, compactReview: true });
    expect(разбор.refSize).toBe(задание.refSize);
  });

  it('портрет не изменился: сетка 2×2 и прежние размеры', () => {
    expect(optionLayout({ viewportWidth: 390, viewportHeight: 844, answerWidth: 260, count: 4, compactReview: false })).toEqual({ optSize: 107, oneRow: false });
    expect(optionLayout({ viewportWidth: 403, viewportHeight: 873, answerWidth: 480, count: 4, compactReview: false })).toEqual({ optSize: 110, oneRow: false });
    expect(optionLayout({ viewportWidth: 360, viewportHeight: 640, answerWidth: 240, count: 4, compactReview: false }).oneRow).toBe(false);
    // узкий и низкий экран (не альбом): прежние 48, в ряд не встаём — не влезет
    expect(optionLayout({ viewportWidth: 320, viewportHeight: 540, answerWidth: 240, count: 4, compactReview: false })).toEqual({ optSize: 48, oneRow: false });
  });
});

describe('рисунок неподвижного варианта', () => {
  it('🔴 по контуру фигура занимает квадрат плотнее, чем по сфере, и не вылезает за поля', () => {
    let сфера = 0, контур = 0, n = 0;
    for (const shape of shapesOfSize(4, 13)) {
      const size = 110, unit = stillUnit([shape], size);
      const a = рамка(shape, size), b = рамка(shape, size, unit);
      сфера += Math.max(a.x1 - a.x0, a.y1 - a.y0) / size;
      контур += Math.max(b.x1 - b.x0, b.y1 - b.y0) / size;
      n++;
      expect(b.x0).toBeGreaterThanOrEqual(5.99); expect(b.y0).toBeGreaterThanOrEqual(5.99);
      expect(b.x1).toBeLessThanOrEqual(104.01); expect(b.y1).toBeLessThanOrEqual(104.01);
      // сторона, упёршаяся в поля, заполнена целиком
      expect(Math.max(b.x1 - b.x0, b.y1 - b.y0)).toBeGreaterThan(97.9);
    }
    expect(контур / n).toBeGreaterThan(сфера / n + 0.1);
  });

  it('🔴 у вариантов одного задания один масштаб кубика — пара «фигура + зеркало» не выдаёт себя габаритом', () => {
    for (let i = 0; i < 20; i++) {
      const task = buildRotationTask(8, createRng(`fill-${i}`));
      const shapes = task.options.map((o) => o.shape);
      const u = stillUnit(shapes, 100);
      // одна и та же единица для всех: длина ребра кубика на рисунке одинакова
      const ребро = (s: Shape) => {
        const f = shapeSurface(s, 100, 'x', 0, [], u).find((q) => q.points.length === 4)!;
        return Math.hypot(f.points[1][0] - f.points[0][0], f.points[1][1] - f.points[0][1]);
      };
      const рёбра = shapes.map(ребро).map((v) => v.toFixed(3));
      expect(new Set(рёбра).size).toBe(1);
      for (const s of shapes) { const r = рамка(s, 100, u); expect(r.x0).toBeGreaterThanOrEqual(5.99); expect(r.x1).toBeLessThanOrEqual(94.01); }
    }
  });

  it('без масштаба рисунок прежний — вращение в разборе не «дышит»', () => {
    const shape = shapesOfSize(6, 6)[0];
    const a = shapeSurface(shape, 200).map((f) => f.points.join(';'));
    const b = shapeSurface(shape, 200, 'x', 0, [], undefined).map((f) => f.points.join(';'));
    expect(b).toEqual(a);
  });
});

/** ⚠️ Узкая проверка по исходнику: функции могут быть верны, а экран — звать их мимо. */
describe('экран зовёт раскладку и общий масштаб', () => {
  it('варианты рисуются одним масштабом на задание, размер — из optionLayout', () => {
    const код = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'games', 'mental-rotation.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(код).toMatch(/optionLayout\(\{/);
    // альбомный размер эталона доходит до рисунка, а строки вопроса — до раскладки
    expect(код).toMatch(/const baseSize = refSize \?\?/);
    expect(код).toMatch(/promptLines \}\)/);
    expect(код).toMatch(/setPromptLines\(/);
    expect(код).toMatch(/stillUnit\(task\.options\.map/);
    expect((код.match(/optSize, GRADIENT\[1\], undefined, undefined, optUnit\)/g) ?? []).length).toBe(2);
  });
});
