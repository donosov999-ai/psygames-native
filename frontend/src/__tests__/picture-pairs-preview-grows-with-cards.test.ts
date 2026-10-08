/**
 * 🔴 ПОКАЗ «ПАРНЫХ КАРТИНОК» РАСТЁТ С ЧИСЛОМ КАРТ, А ВРЕМЯ НА КАРТУ НЕ СХЛОПЫВАЕТСЯ.
 *
 * ОТЧЁТ: app_feedback 7d506dbe, 08.09.2026, «Релакс», из онбординга: «Для запоминания
 * слишком мало времени». Задача 0d6d8b28. Разбор и выбор кривой — в комментарии к
 * `previewMsPerCard` (`app/games/picture-pairs.tsx`).
 *
 * ЗАМЕР ДО (01.10.2026, прогон levelCfg): показ `max(250, 800 − 40·L)` укорачивался, пока
 * карт становилось больше: L1 8 карт 760 мс (95 мс на карту) · L9 24 карты 440 мс (18) ·
 * L21 48 карт 250 мс (5). Взгляд на карту — одна фиксация глаза, около 250–300 мс. Онбординг
 * открывает экран на уровне новичка, то есть на L1.
 *
 * ⚠️ ЧЕГО ПРОБА НЕ ДОКАЗЫВАЕТ. Она читает ОБЪЯВЛЕНИЕ. Что показ ИСПОЛНЯЕТСЯ столько, сколько
 * объявлен, стерегут пробы экрана: `picture-pairs-rule-before-preview` (веб) и
 * `picture_pairs_screen_test.dart` (Flutter) — они ждут ровно `levelCfg(L).previewMs`.
 */
import {
  levelCfg, PAIRS_VOLUME_TOP, previewMsPerCard, PREVIEW_PER_CARD_FLOOR_MS, PREVIEW_PER_CARD_START_MS,
} from '@/app/games/picture-pairs';

const cards = (L: number) => levelCfg(L).pairs * levelCfg(L).groupSize;

describe('picture-pairs: показ растёт с числом карт', () => {
  it('🔴 новичок на L1: 400 мс на карту — вдвое больше, чем было в жалобе (188 мс)', () => {
    expect(`L1: ${cards(1)} карт, ${previewMsPerCard(1)} мс на карту, показ ${levelCfg(1).previewMs} мс`)
      .toBe(`L1: 8 карт, ${PREVIEW_PER_CARD_START_MS} мс на карту, показ 3200 мс`);
  });

  it('🔴 внутри пар, троек и четвёрок: больше карт — дольше показ', () => {
    const broken: string[] = [];
    for (let L = 2; L <= PAIRS_VOLUME_TOP; L++) {
      const a = levelCfg(L - 1);
      const b = levelCfg(L);
      if (a.groupSize !== b.groupSize || cards(L) <= cards(L - 1)) continue;
      if (b.previewMs <= a.previewMs) broken.push(`L${L} ${cards(L)} карт ${b.previewMs} мс ≤ L${L - 1} ${cards(L - 1)} карт ${a.previewMs} мс`);
    }
    expect(`нарушений: ${broken.length}${broken.length ? ' — ' + broken.join('; ') : ''}`).toBe('нарушений: 0');
  });

  it('🔴 время на карту убывает до верха объёма, там встаёт на пол и ниже не падает', () => {
    const notFalling: string[] = [];
    for (let L = 2; L <= PAIRS_VOLUME_TOP; L++) {
      if (previewMsPerCard(L) >= previewMsPerCard(L - 1)) notFalling.push(`L${L}`);
    }
    expect(`не убывает на: ${notFalling.join(', ') || '—'}`).toBe('не убывает на: —');
    const off: string[] = [];
    for (let L = PAIRS_VOLUME_TOP; L <= 60; L++) {
      if (previewMsPerCard(L) !== PREVIEW_PER_CARD_FLOOR_MS) off.push(`L${L}=${previewMsPerCard(L)}`);
    }
    expect(`с L${PAIRS_VOLUME_TOP} не на полу: ${off.join(', ') || '—'}`).toBe(`с L${PAIRS_VOLUME_TOP} не на полу: —`);
  });

  it('показ — ровно карт × время на карту, на всех 60 уровнях', () => {
    const off: string[] = [];
    for (let L = 1; L <= 60; L++) {
      if (levelCfg(L).previewMs !== cards(L) * previewMsPerCard(L)) off.push(`L${L}`);
    }
    expect(`расходится на: ${off.join(', ') || '—'}`).toBe('расходится на: —');
  });

  it('ряд записан числами: правка кривой — только осознанно, вместе с эталоном Flutter', () => {
    expect([1, 5, 9, 10, 13, 17, 21, 60].map((L) => `L${L} ${cards(L)}×${previewMsPerCard(L)}=${levelCfg(L).previewMs}`).join(' · '))
      .toBe('L1 8×400=3200 · L5 16×303=4848 · L9 24×230=5520 · L10 12×214=2568 · L13 16×174=2784 · L17 32×132=4224 · L21 48×100=4800 · L60 48×100=4800');
  });
});
