import { mahjongExtent } from '@/src/games/mahjong/extent';
import { tilePlacement, overlaps, layerOffsetFor, tileScaleFor } from '@/src/games/mahjong/board';
import { layoutForLevel } from '@/src/games/mahjong/layouts';
// Тот же источник параметров уровня, что у экрана (`app/games/mahjong.tsx:230`).
import { mahjongLevel as levelParams } from '@/src/services/mahjongLevels';

/**
 * 🔴 КАРТИНКА НЕ ИМЕЕТ ПРАВА ВРАТЬ О ДОСТУПНОСТИ (отчёт 03.09.2026: «слои криво
 * доступны и скачут»).
 *
 * Доступность считается по СЕТКЕ (`overlaps`: |Δx| < 2 и |Δy| < 2 полуклетки), а
 * рисуется плитка со сдвигом слоя, который о сетке ничего не знает и НАКАПЛИВАЕТСЯ.
 * Когда набегает больше полуклетки, игрок видит одно, а правило считает другое.
 *
 * Проба сверяет ДВЕ стороны расхождения на всех сорока уровнях:
 *   · плитка ВЫГЛЯДИТ накрытой (прямоугольники перекрылись), а по правилу свободна;
 *   · плитка накрыта по правилу, а по виду свободна.
 * Замер до правки: 4283 и 369. После: 0 и 0.
 *
 * ⚠️ Проба берёт ТУ ЖЕ `tilePlacement` и ТУ ЖЕ `overlaps`, что и экран, — иначе
 * сверялись бы две мои выдумки, а не игра.
 */
const ДОПУСК = 4;   // px: перекрытие тоньше считаем за «не видно»

/**
 * ⚠️ НЕ КОПИЯ ФОРМУЛЫ, А ОНА САМА. Своя копия здесь означала бы проверку собственной
 * выдумки: экран поменяют — гейт останется зелёным.
 */
const сдвиг = layerOffsetFor;

/**
 * ⚠️ И МАСШТАБ СЛОЯ — ТОЖЕ ОНА САМА, А НЕ КОПИЯ. С 05.09.2026 глубина рисуется
 * размером: верхний слой меньше и стоит по центру клетки. Если проба продолжит
 * мерить квадраты одного размера, она будет проверять НЕ ТУ картинку, которую
 * видит человек, — и на этом гейт становится призраком.
 */
const масштаб = tileScaleFor;

function расхождения(level: number, ширинаЭкрана: number) {
  const lay = layoutForLevel(level) as { places?: { x: number; y: number; layer: number }[] } | undefined;
  const places = lay?.places ?? [];
  if (places.length === 0) return null;
  const край = mahjongExtent(level);
  const boardW = Math.min(ширинаЭкрана - 36, 460);
  const half = Math.max(10, Math.floor(boardW / Math.max(8, край.x + 2)));
  const maxLayer = levelParams(level).layers - 1;
  const off = сдвиг(maxLayer);
  const tw = half * 2 - 2;
  const кор = places.map((p) => {
    const { left, top } = tilePlacement(p, maxLayer, half, off);
    const м = масштаб(p.layer, maxLayer);
    const ш = Math.round(tw * м);
    const д = Math.round((tw - ш) / 2);
    return { ...p, left: left + д, top: top + д, right: left + д + ш, bottom: top + д + ш };
  });
  let лже = 0, невид = 0;
  for (let i = 0; i < кор.length; i += 1) for (let j = 0; j < кор.length; j += 1) {
    if (i === j) continue;
    const a = кор[i], b = кор[j];
    const пиксельно = a.left < b.right - ДОПУСК && b.left < a.right - ДОПУСК
      && a.top < b.bottom - ДОПУСК && b.top < a.bottom - ДОПУСК;
    const поПравилу = b.layer > a.layer && overlaps(b, a);
    if (пиксельно && b.layer > a.layer && !поПравилу) лже += 1;
    if (!пиксельно && поПравилу) невид += 1;
  }
  return { лже, невид, half, off, maxLayer, плиток: places.length };
}

describe('маджонг: сдвиг слоёв не врёт о доступности', () => {
  it('🔴 на всех 40 уровнях картинка совпадает с правилом', () => {
    const вранья: string[] = [];
    let проверено = 0;
    for (let level = 1; level <= 40; level += 1) {
      const r = расхождения(level, 390);
      if (!r) continue;
      проверено += 1;
      if (r.лже > 0 || r.невид > 0) {
        вранья.push(`ур.${level}: выглядит-накрытой-но-свободна ${r.лже}, накрыта-но-не-видно ${r.невид} (half ${r.half}, off ${r.off})`);
      }
    }
    expect(проверено).toBeGreaterThanOrEqual(30);   // проба вправду прошла по уровням
    expect(вранья).toEqual([]);
  });

  it('🔴 на узком экране 360 тоже: там полуклетка мельче, а сдвиг тот же', () => {
    const вранья: string[] = [];
    for (let level = 1; level <= 40; level += 1) {
      const r = расхождения(level, 360);
      if (r && (r.лже > 0 || r.невид > 0)) вранья.push(`ур.${level}: ${r.лже}/${r.невид}`);
    }
    expect(вранья).toEqual([]);
  });

  it('сдвиг постоянен внутри уровня: съехать посреди партии нечему', () => {
    // Он считается от параметров УРОВНЯ, а не от живых плиток — снятая пара его не меняет.
    for (const level of [1, 9, 20, 40]) {
      const ml = levelParams(level).layers - 1;
      expect(сдвиг(ml)).toBe(сдвиг(ml));
      expect(сдвиг(ml)).toBeGreaterThanOrEqual(1);
    }
  });

  it('🔴 прежняя формула здесь бы покраснела — проба не зеленеет на чём угодно', () => {
    const старая = (half: number) => Math.max(3, Math.round(half * 0.35));
    let плохо = 0;
    for (let level = 1; level <= 40; level += 1) {
      const lay = layoutForLevel(level) as { places?: { x: number; y: number; layer: number }[] } | undefined;
      const places = lay?.places ?? [];
      if (places.length === 0) continue;
      const край = mahjongExtent(level);
      const half = Math.max(10, Math.floor(Math.min(390 - 36, 460) / Math.max(8, край.x + 2)));
      const maxLayer = levelParams(level).layers - 1;
      const off = старая(half);
      const tw = half * 2 - 2;
      const кор = places.map((p) => {
        const { left, top } = tilePlacement(p, maxLayer, half, off);
        return { ...p, left, top, right: left + tw, bottom: top + tw };
      });
      for (let i = 0; i < кор.length; i += 1) for (let j = 0; j < кор.length; j += 1) {
        if (i === j) continue;
        const a = кор[i], b = кор[j];
        const пикс = a.left < b.right - ДОПУСК && b.left < a.right - ДОПУСК
          && a.top < b.bottom - ДОПУСК && b.top < a.bottom - ДОПУСК;
        const прав = b.layer > a.layer && overlaps(b, a);
        if ((пикс && b.layer > a.layer && !прав) || (!пикс && прав)) плохо += 1;
      }
    }
    expect(плохо).toBeGreaterThan(1000);   // дефект был массовым, а не единичным
  });
});
