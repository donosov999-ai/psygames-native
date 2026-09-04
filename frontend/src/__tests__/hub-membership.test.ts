/* psygames-hub-membership · VER 1 · 21.08.2026 */
/**
 * ИГРА, УБРАННАЯ С МЕНЮ РАДИ РАЗВИЛКИ, ОБЯЗАНА ОСТАТЬСЯ ДОСТУПНОЙ ЧЕРЕЗ НЕЁ.
 *
 * 🔴 ЧТО СЛУЧИЛОСЬ 21.08.2026. Три судоку свели в один вход и пометили
 * `hideFromMenu`. Принадлежность к развилке осталась КОММЕНТАРИЕМ
 * («merged into 'sudoku_group'»), а отбор по профилю читает данные, а не надписи.
 * Профили «Микро-релакс», «Дети» и «Шахматист» перечисляют в разрешённом `sudoku`,
 * самой развилки в их списках нет — и судоку пропало у всех троих. У «Шахматиста»
 * так же пропал Корси: он перечислен, а развилки «размах» в списке нет.
 *
 * Заметил это ЧЕЛОВЕК, открыв приложение, а не гейт. Каждая половина по
 * отдельности была верна: карточку скрыли правильно, список профиля правильный.
 * Неверной была связь между ними — а её никто не проверял.
 *
 * ⚠️ ПОЧЕМУ НЕ «ДОПИСАТЬ РАЗВИЛКУ В ТРИ СПИСКА». Профиль перечисляет УПРАЖНЕНИЯ,
 * а не то, как они сгруппированы в меню. Дописать вручную значит ждать того же от
 * следующей развилки. Правило: развилка открыта, если открыта хоть одна игра за
 * ней, — и списки профилей менять не нужно вовсе.
 */
import { GAMES, isHubGame } from '@/src/constants/games';
import { PROFILES, filterAllowedGames } from '@/src/constants/profiles';

/** Скрытые из меню, но НЕ спрятанные за развилку. У каждого — причина. */
const HIDDEN_WITHOUT_HUB: Record<string, string> = {
  eye_gym: 'разминка для глаз: живёт в плейлистах зарядки и в «дневном перерыве», отдельной карточки в меню у неё не было никогда — прятать её не за что',
};

describe('игры за развилками', () => {
  const hidden = GAMES.filter((g) => g.hideFromMenu);

  it('есть что проверять — иначе гейт зелен вслепую', () => {
    expect(hidden.length).toBeGreaterThanOrEqual(10);
    expect(PROFILES.length).toBeGreaterThanOrEqual(10);
  });

  it('🔴 у каждой скрытой игры принадлежность — ДАННЫЕ, а не комментарий', () => {
    const silent = hidden
      .filter((g) => !g.mergedInto && !(g.id in HIDDEN_WITHOUT_HUB))
      .map((g) => `${g.id}: убрана с меню и не сказано, за какой развилкой`);
    expect(silent).toEqual([]);
  });

  it('🔴 развилка, на которую ссылаются, существует и правда развилка', () => {
    const broken: string[] = [];
    for (const g of hidden) {
      if (!g.mergedInto) continue;
      const hub = GAMES.find((x) => x.id === g.mergedInto);
      if (!hub) { broken.push(`${g.id} → ${g.mergedInto}: такой карточки нет`); continue; }
      if (!isHubGame(hub.id)) broken.push(`${g.id} → ${g.mergedInto}: это не развилка`);
    }
    expect(broken).toEqual([]);
  });

  it('в списке исключений нет записей про игры, которые уже за развилкой', () => {
    const stale = Object.keys(HIDDEN_WITHOUT_HUB)
      .filter((id) => GAMES.find((g) => g.id === id)?.mergedInto)
      .map((id) => `${id}: принадлежность есть — запись убрать`);
    expect(stale).toEqual([]);
  });

  it('у каждого исключения причина, а не отметка', () => {
    for (const [id, why] of Object.entries(HIDDEN_WITHOUT_HUB)) {
      expect(`${id}: ${why.length > 60}`).toBe(`${id}: true`);
    }
  });

  /**
   * 🔴 ГЛАВНАЯ ПРОВЕРКА. Не «поле заполнено», а «человек это увидит»: профиль,
   * которому упражнение разрешено, обязан получить к нему дорогу — саму карточку
   * или развилку, за которой она живёт.
   */
  it('🔴 разрешённое упражнение достижимо: сама карточка или его развилка', () => {
    const lost: string[] = [];
    for (const p of PROFILES) {
      if (p.allowed_games === 'all') continue;
      const visible = new Set(filterAllowedGames(p).map((g) => g.id));
      for (const id of p.allowed_games as string[]) {
        const g = GAMES.find((x) => x.id === id);
        if (!g) continue;                       // чужие имена разбирает соседний гейт
        if (!g.hideFromMenu) continue;
        const reachable = visible.has(g.id) && (!g.mergedInto || visible.has(g.mergedInto));
        if (!reachable) lost.push(`${p.id}: ${id} разрешён, но с меню не достать`);
      }
    }
    expect(lost).toEqual([]);
  });

  /** Тот самый случай, ради которого гейт и написан. */
  it('🔴 «Микро-релакс» видит судоку, «Шахматист» — судоку и размах', () => {
    const seen = (pid: string) => new Set(filterAllowedGames(PROFILES.find((p) => p.id === pid)!).map((g) => g.id));
    expect(seen('women').has('sudoku_group')).toBe(true);
    expect(seen('kids').has('sudoku_group')).toBe(true);
    expect(seen('chess').has('sudoku_group')).toBe(true);
    expect(seen('chess').has('span_group')).toBe(true);
  });

  /**
   * ⚠️ ПРАВИЛО, А НЕ ПАРА. Здесь стояло «у профиля women нет attention_conflict» —
   * проверка конкретного состава, и она протухла в тот же день, когда «Мишени»
   * переехали внутрь этой развилки (04.09.2026): игра профилю открыта, значит и
   * развилка обязана показаться. Проверяем то, ради чего гейт заводился: развилка
   * видна ТОГДА И ТОЛЬКО ТОГДА, когда за ней открыта хоть одна игра.
   */
  it('развилка видна ровно тогда, когда за ней открыта хоть одна игра', () => {
    const расхождения: string[] = [];
    for (const p of PROFILES) {
      const открыты = new Set(filterAllowedGames(p).map((g) => g.id));
      for (const хаб of GAMES.filter((g) => isHubGame(g.id))) {
        const состав = GAMES.filter((g) => g.mergedInto === хаб.id);
        if (!состав.length) continue;                     // состав задан экраном, не полем — не судим
        /**
         * Развилку можно открыть профилю ДВУМЯ способами, и оба законны: перечислив
         * игры внутри неё либо назвав саму развилку (так сделано у «Руководителя» —
         * ему открыт `attention_conflict` целиком, а отдельные парадигмы не названы).
         */
        const названаПрямо = p.allowed_games === 'all' || (p.allowed_games as string[]).includes(хаб.id);
        const естьОткрытая = названаПрямо || состав.some((g) => открыты.has(g.id));
        const виден = открыты.has(хаб.id);
        if (естьОткрытая !== виден) {
          расхождения.push(`${p.id}/${хаб.id}: открытых внутри ${состав.filter((g) => открыты.has(g.id)).length}, развилка ${виден ? 'видна' : 'скрыта'}`);
        }
      }
    }
    expect(расхождения).toEqual([]);
  });
});
