/**
 * ЗАРЯДКА НЕ ЗАПУСКАЕТ ИГРЫ, КОТОРЫХ НЕТ В ПРОФИЛЕ.
 *
 * ЗАЧЕМ. 16.08.2026 Денис открыл зарядку всем профилям — раньше её не было у
 * «Стандарта» (`warmup_enabled: false` с пометкой «hook на подписку»). Правка
 * выглядела как один булев флаг, но за ним стояла ловушка:
 *
 *   плейлисты зарядки тянут 33 игры, у «Стандарта» разрешено 9,
 *   и главный экран это правило СОБЛЮДАЕТ (`filterAllowedGames`).
 *
 * То есть без фильтра зарядка стала бы чёрным ходом: в каталоге девять игр, а
 * по кнопке «Старт» играются любые — платный каталог утёк бы целиком, причём
 * молча, никакой ошибки в логах.
 *
 * ⚠️ ПРОВЕРЯЕМ ВСЕ ПРОФИЛИ И ВСЕ ДНИ НЕДЕЛИ. Наборы разные по дням, и профиль
 * может задать свой фикс-набор (`morning_playlist`/`evening_playlist`) — дыра
 * появилась бы ровно в том дне, который не посмотрели руками.
 */
import { PROFILES, isGameAllowed, ProfileDef } from '@/src/constants/profiles';
import {
  buildMorningWarmupPlaylist,
  buildEveningWarmupPlaylist,
  buildFixedPlaylist,
  Weekday,
} from '@/src/services/warmup';

const DAYS: Weekday[] = [0, 1, 2, 3, 4, 5, 6];
const list: ProfileDef[] = Object.values(PROFILES);
const allowOf = (p: ProfileDef) => (g: string) => isGameAllowed(p, g);

describe('зарядка собирается из игр профиля', () => {
  it('есть что проверять — иначе тест зелен вслепую', () => {
    expect(list.length).toBeGreaterThan(5);
    expect(DAYS.length).toBe(7);
  });

  it('утро: ни одной чужой игры ни в одном профиле и дне', () => {
    const bad: string[] = [];
    for (const p of list) {
      for (const wd of DAYS) {
        const meta = p.morning_playlist?.length
          ? buildFixedPlaylist(p.morning_playlist, 'morning', wd, allowOf(p))
          : buildMorningWarmupPlaylist({
              duration: 15,                       // самый длинный набор — больше шансов зацепить лишнее
              weekday: wd,
              profilePlaylists: p.custom_playlists,
              allow: allowOf(p),
            });
        for (const s of meta.steps) {
          if (!isGameAllowed(p, s.game_id)) bad.push(`${p.id}/день ${wd}: ${s.game_id} не входит в профиль`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('вечер: ни одной чужой игры ни в одном профиле и дне', () => {
    const bad: string[] = [];
    for (const p of list) {
      for (const wd of DAYS) {
        const meta = buildEveningWarmupPlaylist({
          weekday: wd,
          profileEvening: p.evening_playlist,
          allow: allowOf(p),
        });
        for (const s of meta.steps) {
          if (!isGameAllowed(p, s.game_id)) bad.push(`${p.id}/день ${wd}: ${s.game_id} не входит в профиль`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  /**
   * Фильтр не должен обнулить зарядку: карточка на главной обещает тренировку,
   * и пустой плейлист — это кнопка, которая ничего не запускает.
   */
  it('после отсева зарядка не пустая ни у одного профиля', () => {
    const bad: string[] = [];
    for (const p of list) {
      for (const wd of DAYS) {
        const meta = p.morning_playlist?.length
          ? buildFixedPlaylist(p.morning_playlist, 'morning', wd, allowOf(p))
          : buildMorningWarmupPlaylist({
              duration: 5, weekday: wd, profilePlaylists: p.custom_playlists, allow: allowOf(p),
            });
        if (meta.steps.length === 0) bad.push(`${p.id}/день ${wd}: пустое утро`);

        const ev = buildEveningWarmupPlaylist({ weekday: wd, profileEvening: p.evening_playlist, allow: allowOf(p) });
        if (ev.steps.length === 0) bad.push(`${p.id}/день ${wd}: пустой вечер`);
      }
    }
    expect(bad).toEqual([]);
  });

  /**
   * Урезанный замер хуже отсутствующего: FIXED_BATTERY существует ради «тот же
   * набор всегда», и если часть игр профилю недоступна, сравнивать результат
   * будет не с чем. В такой день профиль обязан получить тренировку.
   */
  it('замер либо полный, либо его нет — половинчатого не бывает', () => {
    const bad: string[] = [];
    for (const p of list) {
      for (const wd of DAYS) {
        const meta = buildMorningWarmupPlaylist({
          duration: 10, weekday: wd, profilePlaylists: p.custom_playlists, allow: allowOf(p),
        });
        if (!meta.track.startsWith('measure')) continue;
        const baseline = meta.steps.filter((s) => s.is_fixed_baseline).length;
        if (baseline > 0 && baseline < 6) bad.push(`${p.id}/день ${wd}: замер из ${baseline} игр вместо 6`);
      }
    }
    expect(bad).toEqual([]);
  });

  /** Решение Дениса 16.08.2026 — зарядка есть у всех. */
  it('зарядка включена во всех профилях', () => {
    const off = list.filter((p) => !p.warmup_enabled).map((p) => p.id);
    expect(off).toEqual([]);
  });
});
