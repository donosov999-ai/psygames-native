/* psygames-test-languages-profile-has-all-language-games · VER 1 · 11.09.2026 */
/**
 * ЯЗЫКОВОЙ ПРОФИЛЬ ОТКРЫВАЕТ ВЕСЬ РАЗДЕЛ «ЯЗЫКИ».
 *
 * 🔴 ПОВОД. 11.09.2026, контактный лист всех экранов раздела: хаб «Слух» открылся
 * замком «в этом профиле раздел пуст». Замок — по замыслу (его ставит гейт
 * `hub-not-empty-in-every-profile`), а вот ЧЕЙ это профиль — оказалось важным.
 *
 * 📍 ЗАМЕР по всем 13 профилям (`filterAllowedGames` + `visibleHubCards`,
 * origin/main 84d8b13a):
 *
 *   odv999, nzt48        — allowed_games:'all'  → 7 из 7 и 4 из 4
 *   chess, kids, women   — перечислены поимённо → 7 из 7 и 4 из 4
 *   🔴 polyglot          —                      → 6 из 7 и ДВА из 4
 *   students/vasilyeva/free/seniors/drivers/execs — «Слух» закрыт (так задумано:
 *   это не языковые профили, у них раздел сведён к одному-трём упражнениям)
 *
 * То есть профиль «Языки / Полиглот» не получил «Тоны», «Диктант» и «Пересказ»,
 * при том что шахматный получил все три. Причина — порядок появления: «Тоны»
 * приехали 04.09.2026 и были вписаны в три списка, полиглота не открывали.
 *
 * ПОЧЕМУ ГЕЙТ НУЖЕН ОТДЕЛЬНЫЙ. `hub-not-empty-in-every-profile` сторожит «развилка
 * видна → внутри не пусто». Он был ЗЕЛЁН всё это время и остался бы зелёным: две
 * карточки из четырёх — это не ноль. Полнота состава — другое утверждение, и
 * ловить её нечем, пока об этом не спросишь.
 */
import { PROFILES, filterAllowedGames } from '@/src/constants/profiles';
import { HUB_CONTENTS, visibleHubCards } from '@/src/constants/hubContents';
import { GAMES } from '@/src/constants/games';

/**
 * ⚠️ ПЕСОЧНИЦА СЧИТАЕТСЯ ОТДЕЛЬНО, И ЭТО НЕ ПОСЛАБЛЕНИЕ. Игра с `sandbox: true`
 * доделана до работающей, но динамика сырая, и профиль без песочницы её не
 * получает НАМЕРЕННО (`filterAllowedGames`). Сравнивать по ней «кто богаче»
 * бессмысленно: профили с `allowed_games: 'all'` всегда будут впереди ровно на
 * число песочниц, сколько бы их ни завезли. Сравниваем по готовому составу.
 */
const ПЕСОЧНИЦА = new Set(
  GAMES.filter((g) => (g as { sandbox?: boolean }).sandbox).map((g) => g.route),
);

/** Развилки, из которых состоит раздел «Языки». */
const РАЗДЕЛ = ['/games/words-hub', '/games/hearing-hub'] as const;

/**
 * ⚠️ ИСКЛЮЧЕНИЯ — ПОИМЁННО И С ПРИЧИНОЙ, иначе гейт превращается в запрет думать.
 * Пусто по состоянию на 11.09.2026: все одиннадцать упражнений раздела языковому
 * профилю уместны. Появится языковое упражнение, которое полиглоту НЕ нужно, —
 * вписать сюда маршрут и причину строкой, а не снимать проверку.
 */
const МОЖНО_НЕ_ДАВАТЬ: Record<string, string> = {
  '/games/rhythm-pitch':
    'пришла в «Слух» 12.09.2026 из каталога, где не входила ни в одну развилку (задача 4332ce4e). ' +
    'У карточки стоит sandbox: true — динамика сырая, и профиль без песочницы её не получает ' +
    'по построению filterAllowedGames, а не по недосмотру. Игра выйдет из песочницы — эту строку снять, ' +
    'и проверка снова потребует её для полиглота.',
};

const ЯЗЫКОВОЙ = 'polyglot';

describe('раздел «Языки» в языковом профиле', () => {
  it('есть что проверять: профиль на месте, развилки непустые', () => {
    expect((PROFILES as any[]).some((p) => p.id === ЯЗЫКОВОЙ)).toBe(true);
    for (const hub of РАЗДЕЛ) expect(HUB_CONTENTS[hub].length).toBeGreaterThan(1);
  });

  it('🔴 «Языки / Полиглот» открывает ВСЕ упражнения раздела', () => {
    const p = (PROFILES as any[]).find((x) => x.id === ЯЗЫКОВОЙ);
    const можно = new Set(filterAllowedGames(p).map((g: any) => g.route));
    const нет: string[] = [];
    for (const hub of РАЗДЕЛ) {
      const открыто = new Set(visibleHubCards(hub, можно, (k: string) => k).map((c: any) => c.route));
      for (const c of HUB_CONTENTS[hub] as any[]) {
        if (!открыто.has(c.route) && !(c.route in МОЖНО_НЕ_ДАВАТЬ)) нет.push(`${hub} → ${c.route}`);
      }
    }
    expect(нет).toEqual([]);
  });

  it('🔴 языковой профиль не беднее неязыковых по своему же разделу', () => {
    const счёт = (p: any) => {
      const можно = new Set(filterAllowedGames(p).map((g: any) => g.route));
      return РАЗДЕЛ.reduce(
        (s, h) =>
          s + visibleHubCards(h, можно, (k: string) => k).filter((c: any) => !ПЕСОЧНИЦА.has(c.route)).length,
        0,
      );
    };
    const свой = счёт((PROFILES as any[]).find((x) => x.id === ЯЗЫКОВОЙ));
    const богаче = (PROFILES as any[])
      .filter((p) => p.id !== ЯЗЫКОВОЙ && счёт(p) > свой)
      .map((p) => `${p.id}: ${счёт(p)} против ${свой}`);
    expect(богаче).toEqual([]);
  });

  it('проба не зелена вслепую: профиль без этих игр ловится', () => {
    const пустой = { id: 'проба', allowed_games: ['vocab_srs'], allow_sandbox: false } as any;
    const можно = new Set(filterAllowedGames(пустой).map((g: any) => g.route));
    const открыто = visibleHubCards('/games/hearing-hub', можно, (k: string) => k).length;
    expect(`слуха у подменного профиля: ${открыто}`).toBe('слуха у подменного профиля: 0');
  });
});
