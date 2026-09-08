/* psygames-gate-warmup-duration · VER 1 · 08.09.2026 */
/**
 * ЗАРЯДКА ДЛИТСЯ СТОЛЬКО, СКОЛЬКО ОБЕЩАНО.
 *
 * 🔴 ЗАЧЕМ. Отчёт тестировщиков `c810938d`: «просишь пять минут — получаешь 2:45».
 * Живой замер по базе оказался хуже жалобы: 35 зарядок с обещанием пять минут дали
 * медиану 2,3 шага и 116 секунд вместе с переходами — 0,39 обещанного.
 *
 * 📍 ЗАМЕР 08.09.2026 (`cognitive_sessions`, 45 дней):
 *   · медианы партий по каждой игре и настройке — снимок в `gameDuration.ts`;
 *   · стоимость перехода между шагами (заставка, правила, итог) — 11,6 с медиана
 *     по 18 зарядкам, p25 = 6,0, p75 = 20,1; в код взято 12.
 *
 * 🔴 ТРИ ПРИЧИНЫ РАЗРЫВА, И ВСЕ ТРИ ЗАКРЫВАЮТСЯ ЗДЕСЬ:
 *   1. план мерил себя ОБЪЯВЛЕННЫМИ числами `est_duration_sec`, завышенными вдвое;
 *   2. песочные игры отсеивались ПОСЛЕ набора — бюджет тратился на выброшенное;
 *   3. добор при недоборе жил в двух ветках из пяти.
 *
 * ⚠️ ПОРОГИ ЗДЕСЬ ЛИТЕРАЛАМИ. Взять их у проверяемого — двигать оба конца сразу.
 */
import { buildMorningWarmupPlaylist } from '@/src/services/warmup';
import { estimateStepSec, measuredStepSec, STEP_OVERHEAD_SEC, MEASURED_SEC } from '@/src/services/gameDuration';
import type { Weekday } from '@/src/services/warmup';

const ДНИ: Weekday[] = [0, 1, 2, 3, 4, 5, 6];
const ДЛИНЫ = [5, 10, 15] as const;

/** Сколько план займёт у человека: партии по замеру плюс переходы. */
const пофакту = (steps: { game_id: string }[]) =>
  (steps as any[]).reduce((s, x) => s + estimateStepSec(x), 0);

describe('🔴 обещанные минуты — это минуты', () => {
  it('каждый план каждого дня укладывается в обещание ±25 %', () => {
    const беда: string[] = [];
    for (const d of ДНИ) {
      for (const dur of ДЛИНЫ) {
        const pl = buildMorningWarmupPlaylist({ duration: dur, weekday: d });
        if (pl.steps.length === 0) continue;              // день отдыха
        const доля = пофакту(pl.steps) / (dur * 60);
        if (доля < 0.75 || доля > 1.25) {
          беда.push(`день ${d}, ${dur} мин → ${доля.toFixed(2)} обещанного (${пофакту(pl.steps)} с)`);
        }
      }
    }
    expect(беда.join(' · ') || 'все планы в допуске').toBe('все планы в допуске');
  });

  it('🔴 пятиминутка больше не выходит двумя с половиной', () => {
    // Ровно жалоба тестировщика: 2:45 из пяти минут — это 0,55.
    for (const d of ДНИ) {
      const pl = buildMorningWarmupPlaylist({ duration: 5, weekday: d });
      if (pl.steps.length === 0) continue;
      expect(`день ${d}: ${пофакту(pl.steps) >= 240} (${пофакту(pl.steps)} с)`)
        .toBe(`день ${d}: true (${пофакту(pl.steps)} с)`);
    }
  });

  it('🔴 КОНТРПРОБА: по объявленным числам планы В ДОПУСК НЕ ПОПАДАЮТ', () => {
    /**
     * Это и есть прежнее поведение — и проба обязана его отвергать, иначе она
     * зелена вслепую. Объявленные числа завышены: план, набранный до 300 по ним,
     * на деле идёт вдвое меньше.
     */
    const мимо: string[] = [];
    for (const d of ДНИ) {
      for (const dur of ДЛИНЫ) {
        const pl = buildMorningWarmupPlaylist({ duration: dur, weekday: d });
        if (pl.steps.length === 0) continue;
        const поОбъявленному = pl.steps.reduce((s, x) => s + x.est_duration_sec, 0) / (dur * 60);
        if (поОбъявленному > 1.25) мимо.push(`день ${d} ${dur}м: ${поОбъявленному.toFixed(2)}`);
      }
    }
    expect(`планов с завышенным объявлением: ${мимо.length > 0}`)
      .toBe('планов с завышенным объявлением: true');
  });
});

describe('снимок замера — не выдумка и не подгонка', () => {
  it('🔴 стоимость перехода взята из замера, а не округлена до красивого', () => {
    expect(STEP_OVERHEAD_SEC).toBe(12);            // медиана 11,6 → 12
    expect(STEP_OVERHEAD_SEC).toBeGreaterThanOrEqual(6);    // p25 замера
    expect(STEP_OVERHEAD_SEC).toBeLessThanOrEqual(21);      // p75 замера
  });

  it('🔴 настройка различается там, где она меняет время', () => {
    // Шульте 5×5 и 7×7 — одна игра, разница втрое: единой цифры на игру мало.
    expect(MEASURED_SEC['schulte_table|5x5']).toBe(26);
    expect(MEASURED_SEC['schulte_table|7x7']).toBe(90);
    expect(MEASURED_SEC['hanoi|3 discs']).toBe(25);
    expect(MEASURED_SEC['hanoi|6 discs']).toBe(409);
  });

  it('оценка шага = замер партии + переход, а без замера — объявленное число', () => {
    expect(estimateStepSec({ game_id: 'schulte_table', game_route: '/games/schulte', difficulty: 'medium', mode: '5x5', est_duration_sec: 60 }))
      .toBe(26 + 12);
    // игры, о которой замера нет, объявленное число не трогаем
    expect(measuredStepSec({ game_id: 'tower_london', difficulty: 'medium' } as any)).toBeNull();
    expect(estimateStepSec({ game_id: 'tower_london', game_route: '/games/tower-london', difficulty: 'medium', est_duration_sec: 150 }))
      .toBe(150);
  });

  it('🔴 КОНТРПРОБА: замер обязан РАСХОДИТЬСЯ с объявлением, иначе он ничего не даёт', () => {
    // Если бы снимок совпадал с объявленными числами, менять единицу было бы незачем.
    const pl = buildMorningWarmupPlaylist({ duration: 5, weekday: 1 });
    const объявлено = pl.steps.reduce((s, x) => s + x.est_duration_sec, 0);
    expect(`объявлено ${объявлено} > замер ${пофакту(pl.steps)}: ${объявлено > пофакту(pl.steps)}`)
      .toBe(`объявлено ${объявлено} > замер ${пофакту(pl.steps)}: true`);
  });
});

describe('🔴 ядро-снимок правка не задела', () => {
  it('пятиминутка замерного дня — ровно пять игр ядра, без довеска', () => {
    // Ряд сравнения держится на неизменной постановке: шестая игра рядом с ядром
    // превращает снимок в «снимок с довеском», и кривая прогресса становится шумом.
    for (const d of [4, 0] as Weekday[]) {
      const pl = buildMorningWarmupPlaylist({ duration: 5, weekday: d });
      expect(`день ${d}: шагов ${pl.steps.length}`).toBe(`день ${d}: шагов 5`);
      expect(pl.steps.map((s) => s.game_id))
        .toEqual(['corsi', 'sdmt', 'flanker', 'mental_rotation', 'switching_task']);
    }
  });

  it('и постановка ядра не изменилась — те же числа проб и режимы', () => {
    const pl = buildMorningWarmupPlaylist({ duration: 5, weekday: 4 });
    expect(pl.steps.map((s) => `${s.game_id}:${s.mode ?? ''}:${s.trials ?? ''}:${s.difficulty}`)).toEqual([
      'corsi:forward::medium', 'sdmt:60s::medium', 'flanker::15:medium',
      'mental_rotation::5:medium', 'switching_task::15:medium',
    ]);
  });
});
