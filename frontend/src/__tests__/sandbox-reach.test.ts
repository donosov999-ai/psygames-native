/* psygames-sandbox-reach · VER 1 · 22.08.2026 */
/**
 * ПЕСОЧНИЦА НЕ ПОПАДАЕТ К ЧЕЛОВЕКУ НИ ОДНОЙ ДВЕРЬЮ.
 *
 * 🔴 ЧТО СЛУЧИЛОСЬ. 22.08.2026 песочницу завели — и закрыли ей ОДНУ дверь из
 * четырёх: каталог главного экрана (`filterAllowedGames`). Мимо остались три:
 *   · вызов дня — показывается ВСЕМ и профиль не спрашивает вовсе;
 *   · выбор первой игры в онбординге — это самая первая игра человека;
 *   · шаги зарядки, где четыре сырые игры зашиты прямо в плейлисты
 *     (`memory_palace`, `object_tracker`, `one_line`, `rhythm_pitch`), а главный
 *     экран строит утреннюю зарядку БЕЗ фильтра профиля.
 *
 * Человек получал сырое, не заходя в каталог вовсе. Нашлось это осмотром: на
 * экране питомца совет гласил «сыграй Ритм» — игру, убранную часом ранее.
 *
 * ⚠️ ПОЧЕМУ ГЕЙТ ПРОВЕРЯЕТ ДВЕРИ, А НЕ ФЛАГ. «Поле sandbox расставлено» ничего не
 * значит: расставить его и не спросить нигде — ровно то, что и произошло. Здесь
 * каждая дверь дёргается ИСПОЛНЕНИЕМ и от неё требуется не пустить.
 */
declare const __dirname: string;
declare function require(m: string): any;

import { GAMES, isSandboxGame } from '@/src/constants/games';
import { PROFILES, filterAllowedGames } from '@/src/constants/profiles';
import { getOnboardingGames } from '@/src/services/onboarding';
import * as warmup from '@/src/services/warmup';

const sandboxIds = GAMES.filter((g) => g.sandbox).map((g) => g.id);

describe('двери, которыми игра попадает к человеку', () => {
  it('есть что проверять — иначе гейт зелен вслепую', () => {
    expect(sandboxIds.length).toBeGreaterThanOrEqual(5);
    expect(sandboxIds.every((id) => isSandboxGame(id))).toBe(true);
    expect(isSandboxGame('schulte_table')).toBe(false);
  });

  /**
   * ⚠️ ПЕРВАЯ РЕДАКЦИЯ ЭТОЙ ПРОВЕРКИ БЫЛА СЛЕПА. Она брала «Микро-релакс», а он
   * песочницу не перечисляет вовсе — снятие фильтра ничего в нём не меняло, и
   * поломка оставалась зелёной. Брать надо профили, которые эти игры В СПИСКЕ
   * ИМЕЮТ: их восемь, и именно им фильтр и нужен.
   */
  it('🔴 дверь 1 — каталог: профиль перечисляет сырое, но не видит его', () => {
    const risky = PROFILES.filter((p) => Array.isArray(p.allowed_games)
      && (p.allowed_games as string[]).some((id) => sandboxIds.includes(id))
      && p.allow_sandbox !== true);
    expect(`профилей с сырым в списке: ${risky.length >= 5}`).toBe('профилей с сырым в списке: true');
    const leaks: string[] = [];
    for (const p of risky) {
      const seen = filterAllowedGames(p).map((g) => g.id).filter((id) => sandboxIds.includes(id));
      if (seen.length) leaks.push(`${p.id}: ${seen.join(', ')}`);
    }
    expect(leaks).toEqual([]);
  });

  /**
   * ⚠️ ЗДЕСЬ Я СНАЧАЛА ЗАЩИТИЛ НЕ ТО. Дописал фильтр песочницы внутрь функции — и
   * поломка осталась зелёной, потому что фильтр НИКОГДА не срабатывал: игры
   * берутся из закреплённого списка `ONBOARDING_GAME_IDS`, а не из каталога.
   * Мёртвую защиту убрал; проверяю то, что и правда может сломаться — сам список.
   */
  it('🔴 дверь 2 — в списке первой игры нет ни одной сырой', () => {
    const first = getOnboardingGames(GAMES).map((g) => g.id);
    expect(first.length).toBeGreaterThan(0);
    expect(first.filter((id) => sandboxIds.includes(id))).toEqual([]);
  });

  /**
   * ⚠️ ТРЕТЬЯ СЛЕПАЯ РЕДАКЦИЯ, И САМАЯ ПОУЧИТЕЛЬНАЯ. Сборщики зарядки принимают
   * ОБЪЕКТ (`{ duration, weekday }`), а проверка звала их числом — они молча
   * отдавали пустоту, и поломка «зарядка снова пускает песочницу» оставалась
   * зелёной. Зовём каждый его собственной подписью и по всем дням недели.
   */
  it('🔴 дверь 3 — шаги зарядки, без всякого фильтра профиля', () => {
    const leaks: string[] = [];
    const days = [0, 1, 2, 3, 4, 5, 6] as const;
    for (const weekday of days) {
      const metas = [
        warmup.buildMorningWarmupPlaylist({ duration: 5, weekday: weekday as any }),
        warmup.buildMorningWarmupPlaylist({ duration: 10, weekday: weekday as any }),
        warmup.buildMorningWarmupPlaylist({ duration: 15, weekday: weekday as any }),
        warmup.buildEveningWarmupPlaylist({ weekday: weekday as any }),
        warmup.buildDayPlaylist(weekday as any),
      ];
      for (const meta of metas) {
        for (const step of meta?.steps ?? []) {
          if (sandboxIds.includes(step.game_id)) leaks.push(`день ${weekday}: ${step.game_id}`);
        }
      }
    }
    expect(leaks).toEqual([]);
  });

  /** Проверка обязана видеть НЕПУСТЫЕ наборы, иначе она снова зелена вслепую. */
  it('зарядка вообще что-то отдаёт — иначе дверь 3 проверяет пустоту', () => {
    const total = [0, 1, 2, 3, 4, 5, 6]
      .reduce((n, wd) => n + warmup.buildMorningWarmupPlaylist({ duration: 15, weekday: wd as any }).steps.length, 0);
    expect(total).toBeGreaterThan(10);
  });

  it('🔴 дверь 4 — вызов дня: он показывается всем и профиль не спрашивает', () => {
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '../services/daily-challenge.ts'), 'utf8') as string;
    expect(src.replace(/\s+/g, ' ')).toContain('!g.sandbox');
  });

  /** Владельцу и витрине новинок песочница НУЖНА — иначе полка бесполезна. */
  it('🔴 кто её просит — тот видит, иначе класть туда было бы некуда', () => {
    for (const id of ['odv999', 'whatsnew']) {
      const p = PROFILES.find((x) => x.id === id);
      if (!p) continue;
      const seen = filterAllowedGames(p).map((g) => g.id);
      expect(`${id}: ${seen.some((x) => sandboxIds.includes(x))}`).toBe(`${id}: true`);
    }
  });
});
