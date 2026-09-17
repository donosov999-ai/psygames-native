/* psygames-warmup-measure-only-full-core · VER 1 · 17.09.2026 */
/**
 * ГОТОВОЕ УТРО ЧЕТВЕРГА И ВОСКРЕСЕНЬЯ — ЗАМЕР, ТОЛЬКО ЕСЛИ В НЁМ ЕСТЬ ЯДРО-СНИМОК ЦЕЛИКОМ.
 *
 * Решение Дениса 17.09.2026: «замер только у набора с полным составом замера, остальное —
 * тренировка». До правки дорожку готового утра брали по дню недели: четверг — `measure-peak`,
 * воскресенье — `measure-baseline`, что бы в наборе ни лежало. Партии уходили в ряд замеров
 * меткой `peak` / `baseline`, а правило уровня молчало.
 * 📍 17.09.2026, defaultPlaylists.json: у 13 профилей ни в одном утре ЧТ/ВС нет пяти игр ядра —
 * больше всего 4 из 5 по игре и 2 из 5 по настройке.
 *
 *   · четверг и воскресенье без полного ядра — `training`;
 *   · ядро целиком (с хвостом) — замер, как раньше;
 *   · те же пять игр, но одна на другой трудности — не замер;
 *   · по настоящему файлу: дорожка каждого готового утра ЧТ/ВС совпадает с наличием ядра.
 */
import {
  buildMorningWarmupPlaylist, установитьСеткуИзФайла, естьЯдроСнимок, SNAPSHOT_CORE,
  type PlaylistStep, type Weekday, type Длительность,
} from '@/src/services/warmup';

declare function require(id: string): any;

const ФАЙЛ = require('@/src/constants/defaultPlaylists.json') as {
  профили: Record<string, { сетка?: Record<string, Record<string, Record<string, PlaylistStep[]>>> }>;
};
const шаг = (id: string, over: Partial<PlaylistStep> = {}): PlaylistStep =>
  ({ game_id: id, game_route: `/games/${id}`, est_duration_sec: 60, ...over });
/** Ядро так, как его кладёт файл состава: без пометки `is_fixed_baseline`. */
const ядро = (): PlaylistStep[] => SNAPSHOT_CORE.map(({ is_fixed_baseline: _пометка, ...s }) => ({ ...s }));

function утро(weekday: Weekday, steps: PlaylistStep[], duration: Длительность = 5) {
  установитьСеткуИзФайла({ [weekday]: { morning: { [duration]: steps } } });
  return buildMorningWarmupPlaylist({ duration, weekday });
}

afterEach(() => { установитьСеткуИзФайла(null); });

describe('готовое утро ЧТ/ВС: замер только с полным ядром', () => {
  it('🔴 четверг с четырьмя играми ядра из пяти — тренировка', () => {
    const meta = утро(4, ['corsi', 'sdmt', 'flanker', 'mental_rotation', 'n_back', 'digit_span'].map((id) => шаг(id)));
    expect(`${meta.track} · ${meta.track_label}`).toBe('training · тренировка');
  });

  it('🔴 воскресенье без ядра — тренировка', () => {
    expect(утро(0, ['n_back', 'digit_span', 'corsi'].map((id) => шаг(id))).track).toBe('training');
  });

  it('ядро целиком и хвост — замер: четверг peak, воскресенье baseline', () => {
    const набор = [...ядро(), шаг('n_back')];
    expect(`${утро(4, набор).track} · ${утро(0, набор).track}`).toBe('measure-peak · measure-baseline');
  });

  it('🔴 те же пять игр, но corsi на другой трудности — уже не замер', () => {
    const набор = ядро().map((s) => (s.game_id === 'corsi' ? { ...s, difficulty: 'easy' as const } : s));
    expect(утро(4, набор).track).toBe('training');
  });

  it('обычный день с ядром целиком — тренировка, как и была', () => {
    expect(утро(2, ядро()).track).toBe('training');
  });

  it('по настоящему файлу состава: дорожка утра ЧТ/ВС = есть ли в наборе ядро целиком', () => {
    const профили = Object.keys(ФАЙЛ.профили);
    const расхождения: string[] = [];
    let проверено = 0;
    for (const id of профили) {
      for (const день of [4, 0] as const) {
        for (const длина of [5, 10, 15] as const) {
          const шаги = ФАЙЛ.профили[id]?.сетка?.[String(день)]?.['утро']?.[String(длина)];
          if (!шаги?.length) continue;
          проверено += 1;
          // 17.09.2026 ядра целиком нет ни в одном — все утра ЧТ/ВС из файла ждём тренировкой.
          const ждём = естьЯдроСнимок(шаги) ? (день === 4 ? 'measure-peak' : 'measure-baseline') : 'training';
          const вышло = утро(день, шаги, длина).track;
          if (вышло !== ждём) расхождения.push(`${id} · день ${день} · ${длина} мин: ${вышло}, ждём ${ждём}`);
        }
      }
    }
    expect(`проверено ${проверено} из ${профили.length * 6}`).toBe(`проверено ${профили.length * 6} из ${профили.length * 6}`);
    expect(расхождения).toEqual([]);
  });
});
