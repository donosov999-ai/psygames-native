/* psygames-warmup-snapshot-core-gate · VER 1 · 27.08.2026 */
/**
 * ЯДРО ЗАРЯДКИ = БЫСТРЫЙ СНИМОК (bed1249e) — гейт неизменности.
 *
 * Весь смысл ядра в одном: ОДИНАКОВАЯ конфигурация каждый день. Изменится
 * размер, число проб или порядок — замеры разных дней станут несравнимы, и
 * кривая прогресса превратится в шум. Поэтому сторожим не «ядро есть», а
 * «ядро всегда ОДНО И ТО ЖЕ»: сборка двух разных дней даёт байт-в-байт
 * одинаковую голову плейлиста.
 */
import { SNAPSHOT_CORE, CORE_DAYS, buildMorningWarmupPlaylist, trainingSetFor, type Weekday } from '@/src/services/warmup';

describe('ядро-снимок зарядки', () => {
  it('пять доменов, каждый шаг полностью определён и помечен замерным', () => {
    expect(SNAPSHOT_CORE.map((s) => s.game_id)).toEqual([
      'corsi', 'sdmt', 'flanker', 'mental_rotation', 'switching_task',
    ]);
    for (const s of SNAPSHOT_CORE) {
      expect(`${s.game_id}: baseline=${s.is_fixed_baseline}`).toBe(`${s.game_id}: baseline=true`);
      expect(s.difficulty).toBe('medium');
      // Конфигурация обязана быть явной: шаг без mode И без trials взял бы
      // сохранённое состояние игрока — у каждого своё, сравнивать нечего.
      expect(`${s.game_id}: задан`).toBe(`${s.game_id}: ${s.mode || s.trials ? 'задан' : 'НЕ ЗАДАН'}`);
    }
  });

  it('est-сумма ядра — 380 с (числа честные, по шагам батареи, не «5×60»)', () => {
    const total = SNAPSHOT_CORE.reduce((a, s) => a + s.est_duration_sec, 0);
    expect(`${total} с = ${(total / 60).toFixed(1)} мин`).toBe('380 с = 6.3 мин');
  });

  /**
   * З2 (29.08.2026, решение Дениса по чек-листу зарядок): ядро идёт НЕ каждый
   * день — только ПН/ЧТ/ВС. Ежедневный снимок надоедал и портил сравнимость
   * (тренировался сам тест), а тренировочная сетка недели была недостижима.
   */
  it('дни ядра — ровно ПН/ЧТ/ВС', () => {
    expect([...CORE_DAYS].sort()).toEqual([0, 1, 4]);
  });

  it('🔴 ядровые дни начинаются ОДНИМ И ТЕМ ЖЕ ядром — конфигурация неизменна', () => {
    const heads: string[] = [];
    for (const wd of [...CORE_DAYS] as Weekday[]) {
      const meta = buildMorningWarmupPlaylist({ duration: 10, weekday: wd });
      const head = meta.steps.slice(0, SNAPSHOT_CORE.length);
      heads.push(JSON.stringify(head.map((s) => [s.game_id, s.difficulty, s.mode ?? null, s.trials ?? null])));
    }
    expect(new Set(heads).size).toBe(1);
    // И это ядро — именно SNAPSHOT_CORE, а не случайно совпавшие головы.
    expect(heads[0]).toBe(JSON.stringify(SNAPSHOT_CORE.map((s) => [s.game_id, s.difficulty, s.mode ?? null, s.trials ?? null])));
  });

  it('🔴 неядровый день — тренировка дня, сетка недели достижима с кнопки (З1+З2)', () => {
    for (const wd of [2, 3, 5, 6] as Weekday[]) {
      const meta = buildMorningWarmupPlaylist({ duration: 5, weekday: wd });
      const ids = meta.steps.map((s) => s.game_id);
      // Ядра нет…
      expect(`день ${wd}: baseline=${meta.steps.some((s) => s.is_fixed_baseline)}`).toBe(`день ${wd}: baseline=false`);
      // …а шаги — из сетки ЭТОГО дня (духа недели: ВТ фокус, СР память, …).
      const daySet = new Set(trainingSetFor(wd).map((s) => s.game_id));
      for (const id of ids) expect(`день ${wd}: ${id} из сетки ${daySet.has(id)}`).toBe(`день ${wd}: ${id} из сетки true`);
      expect(ids.length).toBeGreaterThan(0);
    }
  });

  it('замерные дни (ЧТ/ВС) несут то же ядро — канон замера один', () => {
    for (const wd of [0, 4] as Weekday[]) {
      const meta = buildMorningWarmupPlaylist({ duration: 10, weekday: wd });
      expect(meta.track.startsWith('measure')).toBe(true);
      const head = meta.steps.slice(0, SNAPSHOT_CORE.length).map((s) => s.game_id);
      expect(head).toEqual(SNAPSHOT_CORE.map((s) => s.game_id));
    }
  });

  it('хвост не повторяет игры ядра — иначе flanker игрался бы дважды за утро', () => {
    for (const wd of [...CORE_DAYS] as Weekday[]) {
      const meta = buildMorningWarmupPlaylist({ duration: 15, weekday: wd });
      const tail = meta.steps.slice(SNAPSHOT_CORE.length);
      const dup = tail.filter((s) => SNAPSHOT_CORE.some((c) => c.game_id === s.game_id)).map((s) => s.game_id);
      expect(`день ${wd}: ${dup.join(',') || '—'}`).toBe(`день ${wd}: —`);
    }
  });

  it('кнопка «5 минут» в ядровый день отдаёт ядро ЦЕЛИКОМ — половина снимка не снимок', () => {
    const meta = buildMorningWarmupPlaylist({ duration: 5, weekday: 1 });
    expect(meta.steps.slice(0, SNAPSHOT_CORE.length).map((s) => s.game_id))
      .toEqual(SNAPSHOT_CORE.map((s) => s.game_id));
  });
});
