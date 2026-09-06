/**
 * ГЕЙТ БЛОКА «РЕКОМЕНДУЕМ СЕГОДНЯ».
 *
 * 🔴 ЧТО ЗДЕСЬ ПРОВЕРЯЕТСЯ ИСПОЛНЕНИЕМ, А НЕ ЧТЕНИЕМ. Блок, который рекомендует
 * случайное, вреднее отсутствующего: он занимает первый экран и учит человека, что
 * наши подсказки можно не читать. Поэтому ни одно утверждение ниже не доказывается
 * тем, что в исходнике написано нужное слово, — каждое проверяется вызовом
 * `recommendToday` на подставленных партиях и сверкой ответа с ЭТИМИ ЖЕ партиями.
 *
 * Четыре обязательства, каждое из которых уже ломалось в этом приложении:
 *   1. запрещённое профилем не рекомендуется НИКОГДА — ровно эта течь была в дневном
 *      перерыве (`buildDayPlaylist` раздавал flanker и eye_gym людям, у которых их нет);
 *   2. у нового человека блок работает и не врёт — пустой экран читается как поломка,
 *      а выдуманный прогресс вскрывается на первой же настоящей партии;
 *   3. набор не переезжает под рукой в пределах дня;
 *   4. вечером не предлагается бодрящее — вечерний набор задуман как успокоение,
 *      таймеры оттуда убирали по репорту тестировщицы 18.08.2026.
 *
 * ⚠️ ПОДПИСЬ ПРОВЕРЯЕТСЯ ОТДЕЛЬНО ОТ СОСТАВА. Правильно выбрать упражнение и
 * подписать его неверной причиной — это тот же обман, только незаметнее: человек
 * читает «давно не играли» под тем, во что играл вчера, и перестаёт верить блоку
 * целиком. Поэтому у каждой карточки причина пересчитывается здесь заново, из тех же
 * сессий, и обязана сойтись.
 */
import { GAMES, GameConfig } from '@/src/constants/games';
import { PROFILES, PROFILE_BY_ID, ProfileId, filterAllowedGames } from '@/src/constants/profiles';
import { freshGameIds, todayISO } from '@/src/constants/freshGames';
import { HistorySession } from '@/src/services/trainingHistory';
import {
  recommendToday, recoCards, recoParams, recoSeed,
  RECO_COUNT, RECO_STALE_DAYS, RECO_BRANCH_WINDOW_DAYS, RECO_FRESH_EVERY,
  RECO_EVENING_BANNED, RECO_GROUP_HUBS, RECO_STARTERS, RECO_REASON_KEY, RecoPick,
} from '@/src/services/recommend';

declare const __dirname: string;
declare function require(id: string): any;
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8') as string;

const BY_ID = new Map<string, GameConfig>(GAMES.map((g) => [g.id, g]));
const MS_DAY = 86400000;

/** Партия N дней назад в 10 утра — так она заведомо попадает в «до сегодня». */
function ago(days: number, base: Date, extra: Partial<HistorySession> = {}): HistorySession {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 10, 0, 0);
  return {
    game_type: 'x', score: 100, time_seconds: 30, profile_id: 'p',
    timestamp: new Date(d.getTime() - days * MS_DAY).toISOString(),
    ...extra,
  };
}

/** Профиль по id, с проверкой, что он вообще есть — иначе тест зелен вслепую. */
function profile(id: string) {
  const p = PROFILE_BY_ID[id as ProfileId];
  expect(p).toBeTruthy();
  return p;
}

const DAY = new Date(2026, 7, 20, 13, 0, 0);     // четверг, 13:00 — дневной слот
const MORNING = new Date(2026, 7, 20, 8, 0, 0);
const EVENING = new Date(2026, 7, 20, 21, 0, 0);
const NIGHT = new Date(2026, 7, 20, 2, 0, 0);

describe('рекомендации: есть что проверять', () => {
  it('каталог и профили на месте', () => {
    expect(GAMES.length).toBeGreaterThan(60);
    expect(PROFILES.length).toBeGreaterThan(5);
    expect(RECO_COUNT).toBe(3);
  });

  it('хабы-группы из отсева существуют в каталоге — список не протух', () => {
    const missing = RECO_GROUP_HUBS.filter((id) => !BY_ID.has(id));
    expect(missing).toEqual([]);
  });

  it('стартовый набор ссылается на существующие игры', () => {
    expect(RECO_STARTERS.filter((id) => !BY_ID.has(id))).toEqual([]);
  });

  it('вычёркиваемые вечером категории существуют в каталоге', () => {
    const cats = new Set(GAMES.map((g) => g.category));
    expect(RECO_EVENING_BANNED.filter((c) => !cats.has(c))).toEqual([]);

    /**
     * 🔴 И ПОТОЛОК НА САМ СПИСОК. 22.08.2026 мутация «запретить вечером ещё и
     * память» осталась ЗЕЛЁНОЙ: все проверки вечера ВЫВОДЯТ ожидание из этого же
     * списка, поэтому обе стороны уезжают вместе и расхождения не видно. Список
     * может расти молча, пока вечером не останется предлагать нечего.
     *
     * Запрет вечером — про возбуждение перед сном, а не про «поменьше занятий».
     * Поэтому: три опоры вечерней тренировки трогать нельзя, и хотя бы половина
     * каталога обязана оставаться доступной.
     */
    for (const core of ['memory', 'attention', 'recovery'] as const) {
      expect(RECO_EVENING_BANNED).not.toContain(core);
    }
    const evening = GAMES.filter((g) => !RECO_EVENING_BANNED.includes(g.category));
    expect(evening.length).toBeGreaterThanOrEqual(GAMES.length / 2);
  });
});

/**
 * 🔴 ОБЯЗАТЕЛЬСТВО 1. Запрещённое профилем не выходит НИ ПРИ КАКИХ данных.
 *
 * Проверяется по ВСЕМ профилям и на четырёх временах суток: течь в дневном перерыве
 * была именно такой — набор был правильным для «Стандарта» и дырявым для остальных.
 */
describe('🔴 рекомендуется только разрешённое профилем', () => {
  const times = [MORNING, DAY, EVENING, NIGHT];

  it.each(PROFILES.map((p) => [p.id] as const))('профиль %s: пустая история', (id) => {
    const p = profile(id);
    const allowed = new Set(filterAllowedGames(p).map((g) => g.id));
    for (const now of times) {
      const bad = recommendToday({ profile: p, sessions: [], now })
        .filter((r) => !allowed.has(r.gameId));
      expect(`${id}@${now.getHours()}: ${bad.map((b) => b.gameId).join(',')}`)
        .toBe(`${id}@${now.getHours()}: `);
    }
  });

  it.each(PROFILES.map((p) => [p.id] as const))('профиль %s: богатая история по ВСЕМУ каталогу', (id) => {
    const p = profile(id);
    const allowed = new Set(filterAllowedGames(p).map((g) => g.id));
    // Играно во всё подряд, включая запрещённое этим профилем: соблазн предложить
    // «давно не играли» про чужую игру здесь максимальный.
    const sessions: HistorySession[] = [];
    GAMES.forEach((g, i) => {
      sessions.push(ago(40 + i, DAY, { game_type: g.id, profile_id: p.id, score: 50 }));
      sessions.push(ago(30 + i, DAY, { game_type: g.id, profile_id: p.id, score: 90 }));
    });
    for (const now of times) {
      const bad = recommendToday({ profile: p, sessions, now }).filter((r) => !allowed.has(r.gameId));
      expect(`${id}@${now.getHours()}: ${bad.map((b) => b.gameId).join(',')}`)
        .toBe(`${id}@${now.getHours()}: `);
    }
  });

  /**
   * ⚠️ ПЕРВАЯ РЕДАКЦИЯ ЭТОЙ ПРОВЕРКИ БЫЛА ЗЕЛЁНОЙ И ПРИ СНЯТОМ ОТСЕВЕ. Она давала каждой
   * игре по одной партии — при таком раскладе хаб ничем не выделялся и просто не выпадал
   * по жребию. Чтобы проверка что-то доказывала, хаб обязан быть САМЫМ ПРИВЛЕКАТЕЛЬНЫМ
   * кандидатом: во всё остальное играно помногу, в хабы — ни разу. Тогда правило «самое
   * незанятое в самой обделённой ветке» указывает прямо на него, и молчание блока
   * означает именно отсев, а не удачу.
   */
  it('🔴 хаб-группа не попадает в блок, даже когда она самый заманчивый кандидат', () => {
    /**
     * ⚠️ ДВЕ ПРИЧИНЫ, ПО КОТОРЫМ ЭТА ПРОВЕРКА БЫЛА ЗЕЛЕНА ПРИ СНЯТОМ ОТСЕВЕ, — обе
     * найдены исполнением, обе закрыты здесь:
     *   · брался «Стандарт», а он разрешает девять упражнений и НИ ОДНОГО хаба:
     *     предлагать хаб было просто нечем. Отсюда профиль с полным каталогом;
     *   · список хабов брался из той же константы, что и код. Опустошив её, я опустошал
     *     и проверку — она сравнивала пустое с пустым. Отсюда имена ниже написаны
     *     ПРЯМО, а константа сверяется с ними.
     */
    /**
     * ⚠️ Имена написаны ПРЯМО и обновляются руками — это защита от призрака (см.
     * выше). Цена защиты: при заведении новой развилки проверка краснеет и требует
     * дописать её сюда. 04.09.2026 так и вышло дважды: сперва развилок стало
     * двенадцать, затем «Торможение» отделилось от «Конфликта внимания» — пятнадцать.
     * 05.09.2026 добавились «Шахматы» — шестнадцать.
     */
    const HUBS = [
      'span_group', 'attention_conflict', 'sudoku_group',
      'counting_group', 'words_group', 'hearing_group', 'search_group',
      'risk_group', 'visual_memory_group', 'mnemonics_group',
      'languages_group', 'towers_group', 'routes_group', 'flexibility_group',
      'sorting_group',
      'inhibition_group', 'chess_group',
    ];
    expect([...RECO_GROUP_HUBS].sort()).toEqual([...HUBS].sort());
    const p = profile('odv999');
    expect(filterAllowedGames(p).map((g) => g.id)).toEqual(expect.arrayContaining(HUBS));
    const sessions: HistorySession[] = [];
    for (const g of GAMES) {
      if (HUBS.includes(g.id)) continue;   // в хабы не играно ни разу
      // Свежо и по нисходящей: ни «давно не играли», ни «растёте» — остаётся ветка.
      sessions.push(ago(3, DAY, { game_type: g.id, profile_id: p.id, score: 900, time_seconds: 20 }));
      sessions.push(ago(2, DAY, { game_type: g.id, profile_id: p.id, score: 100, time_seconds: 90 }));
    }
    for (let d = 0; d < 8; d++) {
      for (const hh of [8, 13, 21, 2]) {
        const now = new Date(2026, 7, 20 + d, hh, 0, 0);
        const picks = recommendToday({ profile: p, sessions, now, freshIds: [] });
        expect(picks.length).toBeGreaterThan(0);
        expect(`${d}@${hh}: ${picks.map((r) => r.gameId).filter((x) => HUBS.includes(x)).join(',')}`)
          .toBe(`${d}@${hh}: `);
      }
    }
  });

  it('чужой профиль на семейном устройстве не тянет свои партии в наш блок', () => {
    const p = profile('free');
    // Алекс наиграл в мишени 20 раз вчера. Для Дениса это упражнение — нетронутое.
    const alex = Array.from({ length: 20 }, (_, i) => ago(1, DAY, { game_type: 'targets', profile_id: 'kids', score: 10 + i }));
    const denis = recommendToday({ profile: p, sessions: alex, now: MORNING });
    // Истории у нашего профиля нет вовсе → это новичок, а не «растёте в мишенях».
    expect(denis.every((r) => r.reason === 'start')).toBe(true);
  });
});

/**
 * 🔴 ОБЯЗАТЕЛЬСТВО 2. Новый человек. Блок обязан работать и НЕ ВЫДУМЫВАТЬ.
 */
describe('🔴 у нового человека блок осмысленный и честный', () => {
  it.each(PROFILES.map((p) => [p.id] as const))('профиль %s: набор непустой и полный', (id) => {
    const p = profile(id);
    const picks = recommendToday({ profile: p, sessions: [], now: DAY });
    const room = Math.min(RECO_COUNT, filterAllowedGames(p).filter((g) => !g.hideFromMenu).length);
    expect(`${id}: ${picks.length}`).toBe(`${id}: ${room}`);
  });

  it('🔴 ни одна причина не ссылается на несуществующий опыт', () => {
    for (const p of PROFILES) {
      for (const now of [MORNING, DAY, EVENING, NIGHT]) {
        for (const r of recommendToday({ profile: p, sessions: [], now })) {
          // Единственные честные основания без истории: «с чего начать» и «под вечер».
          expect(`${p.id}/${r.gameId}: ${r.reason}`).toMatch(/: (start|calm)$/);
          expect(r.daysSince).toBeNull();
          expect(r.doneToday).toBe(false);
        }
      }
    }
  });

  it('в наборе новичка нет повторов и все игры разные', () => {
    const picks = recommendToday({ profile: profile('free'), sessions: [], now: DAY });
    expect(new Set(picks.map((r) => r.gameId)).size).toBe(picks.length);
  });

  it('партии, сыгранные СЕГОДНЯ, новичка новичком не отменяют — набор дан на утро', () => {
    const p = profile('free');
    const today: HistorySession[] = [{
      game_type: 'sudoku', score: 500, time_seconds: 60, profile_id: p.id,
      timestamp: new Date(2026, 7, 20, 11, 0, 0).toISOString(),
    }];
    const before = recommendToday({ profile: p, sessions: [], now: DAY }).map((r) => r.gameId);
    const after = recommendToday({ profile: p, sessions: today, now: DAY });
    expect(after.map((r) => r.gameId)).toEqual(before);
    // Но отметка «сыграно» обязана появиться — иначе карточка врёт в другую сторону.
    const sud = after.find((r) => r.gameId === 'sudoku');
    if (sud) expect(sud.doneToday).toBe(true);
  });
});

/**
 * 🔴 ОБЯЗАТЕЛЬСТВО 3. Стабильность внутри дня.
 */
describe('🔴 набор не переезжает под рукой', () => {
  const p = () => profile('free');
  const history = (): HistorySession[] => {
    const out: HistorySession[] = [];
    // Заброшенное: играно много, но давно.
    for (let i = 0; i < 6; i++) out.push(ago(30 + i, DAY, { game_type: 'schulte_table', profile_id: 'free', time_seconds: 40 - i }));
    // Свежий рост: две партии подряд, вторая лучше.
    out.push(ago(3, DAY, { game_type: 'n_back', profile_id: 'free', score: 40, details: { level: 2 } }));
    out.push(ago(2, DAY, { game_type: 'n_back', profile_id: 'free', score: 80, details: { level: 2 } }));
    return out;
  };

  /**
   * ⚠️ `freshIds: []` СТОИТ ЗДЕСЬ НАРОЧНО, И ЭТО НЕ УПРОЩЕНИЕ. Без него в наборе этого
   * дня третью карточку занимала новинка — а её порядок задан реестром и не зависит ни
   * от какого жребия. Проверка проходила бы и с `Math.random()` вместо сида: она просто
   * не доходила бы до места, где жребий вообще бросается. Пустой реестр отдаёт третий
   * слот ветке, где кандидаты равны и разводит их только сид, — там дрожь и видна.
   */
  it('🔴 одни и те же данные в разные часы одного слота дают один набор', () => {
    const h = history();
    const at = (hh: number) => recommendToday({ profile: p(), sessions: h, now: new Date(2026, 7, 20, hh, 0, 0), freshIds: [] });
    const base = at(13);
    expect(base.length).toBe(RECO_COUNT);
    for (const hh of [12, 14, 15, 16, 17]) {
      expect(at(hh).map((r) => `${r.gameId}:${r.reason}`)).toEqual(base.map((r) => `${r.gameId}:${r.reason}`));
    }
    // И между вызовами подряд — тоже: жребий не должен бросаться заново на каждый рендер.
    for (let i = 0; i < 5; i++) {
      expect(at(13).map((r) => r.gameId)).toEqual(base.map((r) => r.gameId));
    }
  });

  it('🔴 партии, сыгранные СЕГОДНЯ, состав не двигают — двигают только подпись', () => {
    const h = history();
    const base = recommendToday({ profile: p(), sessions: h, now: DAY });
    expect(base.length).toBeGreaterThan(0);
    // Человек играет ровно то, что ему предложили, десять раз подряд — прямо сейчас.
    const played: HistorySession[] = [...h];
    for (const r of base) {
      for (let i = 0; i < 10; i++) {
        played.push({
          game_type: r.gameId, score: 1000, time_seconds: 5, profile_id: 'free',
          timestamp: new Date(2026, 7, 20, 12, i).toISOString(),
        });
      }
    }
    const after = recommendToday({ profile: p(), sessions: played, now: DAY });
    expect(after.map((r) => `${r.gameId}:${r.reason}`)).toEqual(base.map((r) => `${r.gameId}:${r.reason}`));
    expect(after.every((r) => r.doneToday)).toBe(true);
  });

  it('другой день — другой набор возможен: заморозка на сутки, а не навсегда', () => {
    const h = history();
    // Двадцать дней подряд: если бы отбор был заморожен насмерть, тут был бы один набор.
    const sets = new Set<string>();
    for (let d = 0; d < 20; d++) {
      const now = new Date(2026, 7, 20 + d, 13, 0, 0);
      sets.add(recommendToday({ profile: p(), sessions: h, now }).map((r) => r.gameId).join(','));
    }
    expect(sets.size).toBeGreaterThan(1);
  });

  it('состав не зависит от порядка партий в массиве', () => {
    const h = history();
    const straight = recommendToday({ profile: p(), sessions: h, now: DAY });
    const reversed = recommendToday({ profile: p(), sessions: [...h].reverse(), now: DAY });
    expect(reversed.map((r) => r.gameId)).toEqual(straight.map((r) => r.gameId));
  });

  it('сид детерминирован и разный у разных профилей — иначе набор один на всех', () => {
    expect(recoSeed('2026-8-20', 'free')).toBe(recoSeed('2026-8-20', 'free'));
    expect(recoSeed('2026-8-20', 'free')).not.toBe(recoSeed('2026-8-20', 'kids'));
    expect(recoSeed('2026-8-20', 'free')).not.toBe(recoSeed('2026-8-21', 'free'));
  });
});

/**
 * 🔴 ОБЯЗАТЕЛЬСТВО 4. Вечер не бодрит.
 */
describe('🔴 вечером не предлагается бодрящее', () => {
  /** История, в которой ВСЁ бодрящее заброшено — то есть максимально просится в блок. */
  const bracing = (): HistorySession[] => {
    const out: HistorySession[] = [];
    GAMES.filter((g) => RECO_EVENING_BANNED.includes(g.category)).forEach((g, i) => {
      out.push(ago(60 + i, DAY, { game_type: g.id, profile_id: 'free', score: 10 }));
      out.push(ago(50 + i, DAY, { game_type: g.id, profile_id: 'free', score: 90 }));
    });
    return out;
  };

  it.each(PROFILES.map((p) => [p.id] as const))('профиль %s: вечером и ночью ни одной бодрящей', (id) => {
    const p = profile(id);
    for (const now of [EVENING, NIGHT, new Date(2026, 7, 20, 18, 1), new Date(2026, 7, 20, 23, 30)]) {
      const bad = recommendToday({ profile: p, sessions: bracing(), now })
        .filter((r) => RECO_EVENING_BANNED.includes((BY_ID.get(r.gameId) as GameConfig).category));
      expect(`${id}@${now.getHours()}: ${bad.map((b) => b.gameId).join(',')}`)
        .toBe(`${id}@${now.getHours()}: `);
    }
  });

  it('днём бодрящее предлагать МОЖНО — иначе проверка выше зелена вслепую', () => {
    const picks = recommendToday({ profile: profile('free'), sessions: bracing(), now: DAY });
    const some = picks.some((r) => RECO_EVENING_BANNED.includes((BY_ID.get(r.gameId) as GameConfig).category));
    expect(some).toBe(true);
  });

  it('вечером последняя карточка — восстановление, и подписана «под вечер»', () => {
    for (const now of [EVENING, NIGHT]) {
      const picks = recommendToday({ profile: profile('free'), sessions: bracing(), now });
      const last = picks[picks.length - 1];
      expect((BY_ID.get(last.gameId) as GameConfig).category).toBe('recovery');
      expect(last.reason).toBe('calm');
    }
  });

  it('днём карточки «под вечер» не бывает', () => {
    for (const now of [MORNING, DAY]) {
      const picks = recommendToday({ profile: profile('free'), sessions: bracing(), now });
      expect(picks.filter((r) => r.reason === 'calm')).toEqual([]);
    }
  });

  it('вечерний слот восстановления доступен в КАЖДОМ профиле — иначе он молча пропадёт', () => {
    for (const p of PROFILES) {
      const has = filterAllowedGames(p).some((g) => g.category === 'recovery' && !g.hideFromMenu);
      expect(`${p.id}: ${has}`).toBe(`${p.id}: true`);
    }
  });

  it('вечерняя карточка открывает упражнение в тихом режиме, дневная — как обычно', () => {
    expect(recoParams(EVENING)).toEqual({ calm: '1' });
    expect(recoParams(NIGHT)).toEqual({ calm: '1' });
    expect(recoParams(DAY)).toEqual({});
    expect(recoParams(MORNING)).toEqual({});
  });

  it('🔴 запуск из блока НЕ выдаёт себя за шаг зарядки и за вызов дня', () => {
    // wu=1 отключает рост уровней, auto=1 пропускает intro. Ни того, ни другого
    // свободный запуск делать не должен — контракт точек входа.
    for (const now of [MORNING, DAY, EVENING, NIGHT]) {
      const params = recoParams(now);
      expect(params.wu).toBeUndefined();
      expect(params.auto).toBeUndefined();
    }
  });

  /**
   * 🔴 ВЕЧЕР ТОЛЬКО ВЫЧЁРКИВАЕТ, А НЕ ТАСУЕТ.
   *
   * Граница 18:00 — единственный момент, когда набор внутри дня меняется, и он обязан
   * менять КАК МОЖНО МЕНЬШЕ: карточка, которую человек уже видел утром и которая вечером
   * законна, обязана остаться на своём месте. Иначе вечерний заход выглядит так, будто
   * приложение забыло, что советовало днём.
   *
   * ⚠️ ПЕРВАЯ РЕДАКЦИЯ ЭТОЙ ПРОВЕРКИ СРАВНИВАЛА ДВЕ ПЕРВЫЕ КАРТОЧКИ НА ОДНОЙ ВЫДУМАННОЙ
   * ИСТОРИИ — и покраснела на исправном коде. История была «сыграно во всё, кроме
   * бодрящего», а от этого ветка бодрящего становилась самой обделённой, и дневной набор
   * ЗАКОННО получал в неё карточку, которую вечер так же законно вычёркивал. Проверять
   * надо не совпадение двух списков на одном наборе данных, а инвариант — на многих.
   */
  it('🔴 карточка, законная вечером, не двигается на границе 18:00', () => {
    const history: HistorySession[] = [];
    GAMES.forEach((g, i) => {
      history.push(ago(60 + (i % 50), DAY, { game_type: g.id, profile_id: 'free', score: 10 }));
      history.push(ago(20 + (i % 40), DAY, { game_type: g.id, profile_id: 'free', score: i % 3 ? 90 : 5 }));
    });
    let checked = 0;
    for (let d = 0; d < 12; d++) {
      const p = profile('free');
      const day = recommendToday({ profile: p, sessions: history, now: new Date(2026, 7, 20 + d, 17, 59) });
      const eve = recommendToday({ profile: p, sessions: history, now: new Date(2026, 7, 20 + d, 18, 1) });
      const bracing = (id: string) => RECO_EVENING_BANNED.includes((BY_ID.get(id) as GameConfig).category);
      if (day.length === 0 || bracing(day[0].gameId)) continue;
      checked++;
      expect(`день ${d}: ${eve[0].gameId}:${eve[0].reason}`)
        .toBe(`день ${d}: ${day[0].gameId}:${day[0].reason}`);
    }
    // Инвариант должен был проверяться хоть на чём-то — иначе цикл прокрутился вхолостую.
    expect(checked).toBeGreaterThan(3);
  });
});

/**
 * 🔴 ГЛАВНОЕ. Причина под карточкой пересчитывается из тех же партий и обязана сойтись.
 */
describe('🔴 причина соответствует данным', () => {
  /** Что вообще может быть предложено этому профилю — тем же отсевом, что в сервисе. */
  function branchPool(profileId: string): GameConfig[] {
    const p = PROFILE_BY_ID[profileId as ProfileId];
    return filterAllowedGames(p).filter((g) => !g.hideFromMenu && !RECO_GROUP_HUBS.includes(g.id));
  }

  /**
   * Партий на ветку за окно — сырым счётчиком; на размер ветки делит уже вызывающий.
   * Считается по ВСЕМУ каталогу: партия, сыгранная через хаб, пишется под скрытой из
   * меню игрой, но тренировкой ветки быть не перестаёт.
   */
  function branchLoad(pool: GameConfig[], before: HistorySession[], dayStart: number): Map<string, number> {
    const win = dayStart - RECO_BRANCH_WINDOW_DAYS * MS_DAY;
    const cats = new Set(pool.map((g) => g.category));
    const load = new Map<string, number>();
    for (const s of before) {
      const t = Date.parse(s.timestamp as string);
      const g = BY_ID.get(s.game_type as string);
      if (!g || !cats.has(g.category) || t < win) continue;
      load.set(g.category, (load.get(g.category) ?? 0) + 1);
    }
    return load;
  }

  /**
   * 🔴 ТРЕНИРОВКА ЧЕРЕЗ ХАБ — ТОЖЕ ТРЕНИРОВКА ВЕТКИ.
   *
   * Человек каждый день заходит в «Охват» и играет ряд цифр. Партия пишется под
   * `digit_span`, которого в меню нет (он схлопнут в хаб). Если считать нагрузку только
   * по видимым в меню упражнениям, память у такого человека выглядит нетронутой — и блок
   * годами зовёт его туда, куда он ходит ежедневно. Ровно это и было до правки.
   */
  it('🔴 партии через хаб считаются нагрузкой своей ветки, а не пропадают', () => {
    const p = profile('odv999');
    const hidden = GAMES.find((g) => g.id === 'digit_span') as GameConfig;
    expect(`${hidden.category}/${hidden.hideFromMenu}`).toBe('memory/true');
    const sessions: HistorySession[] = [];
    // Двадцать пять партий ряда цифр за месяц — память тренируется плотнее всего.
    for (let k = 0; k < 25; k++) {
      sessions.push(ago(2 + (k % 27), DAY, {
        game_type: 'digit_span', profile_id: p.id, score: 500 - k * 10, time_seconds: 20 + k,
      }));
    }
    // Всё остальное — по одной партии на игру: ни «давно не играли», ни «растёте».
    for (const g of GAMES) {
      if (g.category === 'memory') continue;
      sessions.push(ago(3, DAY, { game_type: g.id, profile_id: p.id, score: 100 }));
    }
    const branchPicks = recommendToday({ profile: p, sessions, now: MORNING, freshIds: [] })
      .filter((r) => r.reason === 'branch');
    expect(branchPicks.length).toBeGreaterThan(0);
    const cats = branchPicks.map((r) => (BY_ID.get(r.gameId) as GameConfig).category);
    expect(`обделённой названа: ${[...new Set(cats)].join(',')}`).not.toContain('memory');
  });

  /** Пересчёт «с нуля», намеренно другим кодом, чем в сервисе. */
  function audit(picks: RecoPick[], sessions: HistorySession[], profileId: string, now: Date): string[] {
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const mine = sessions.filter((s) => !s.profile_id || s.profile_id === profileId);
    const before = mine.filter((s) => Date.parse(s.timestamp as string) < dayStart);
    const bad: string[] = [];
    for (const r of picks) {
      const own = before.filter((s) => s.game_type === r.gameId)
        .sort((a, b) => Date.parse(a.timestamp as string) - Date.parse(b.timestamp as string));
      const last = own.length ? Date.parse(own[own.length - 1].timestamp as string) : null;
      const gap = last === null ? null : Math.floor((dayStart - last) / MS_DAY);
      if (r.daysSince !== gap) bad.push(`${r.gameId}: daysSince=${r.daysSince}, а по партиям ${gap}`);

      if (r.reason === 'comeback') {
        if (own.length < 2) bad.push(`${r.gameId}: «давно не играли», а партий всего ${own.length}`);
        if ((gap ?? 0) < RECO_STALE_DAYS) bad.push(`${r.gameId}: «давно не играли», а играли ${gap} дн. назад`);
      }
      if (r.reason === 'growth') {
        if (own.length < 2) bad.push(`${r.gameId}: «растёте», а сравнивать не с чем (${own.length} партий)`);
        else {
          const a = own[own.length - 2].score as number;
          const b = own[own.length - 1].score as number;
          if (!(b > a)) bad.push(`${r.gameId}: «растёте», а счёт ${a} → ${b}`);
        }
        if ((gap ?? 99) >= RECO_STALE_DAYS) bad.push(`${r.gameId}: «растёте», а последняя партия ${gap} дн. назад`);
      }
      if (r.reason === 'fresh') {
        if (own.length !== 0) bad.push(`${r.gameId}: «новое», а сыграно ${own.length} раз`);
        if (!freshGameIds(todayISO(now)).includes(r.gameId)) bad.push(`${r.gameId}: «новое», а в реестре свежего его нет`);
      }
      if (r.reason === 'start' && before.length > 0) {
        bad.push(`${r.gameId}: «с чего начать», а партий уже ${before.length}`);
      }
      if (r.reason === 'calm') {
        const cat = (BY_ID.get(r.gameId) as GameConfig).category;
        if (cat !== 'recovery') bad.push(`${r.gameId}: «под вечер», а категория ${cat}`);
        const h = now.getHours();
        if (h >= 5 && h < 18) bad.push(`${r.gameId}: «под вечер» в ${h} часов`);
      }
      if (r.reason === 'branch') {
        /**
         * «Этой ветке достаётся меньше всего» обязано быть правдой у КАЖДОЙ карточки, а
         * не только у первой. Точная формулировка: ветка карточки — самая обделённая
         * среди тех, где ещё осталось непоказанное упражнение. Перескок на следующую
         * ветку законен ровно тогда, когда предыдущая исчерпана внутри этого же блока.
         */
        const pool = branchPool(profileId);
        const load = branchLoad(pool, before, dayStart);
        const size = new Map<string, number>();
        for (const g of pool) size.set(g.category, (size.get(g.category) ?? 0) + 1);
        const norm = (c: string) => (load.get(c) ?? 0) / (size.get(c) as number);
        const shownBefore = new Set(picks.slice(0, picks.indexOf(r)).map((x) => x.gameId));
        const open = [...size.keys()].filter((c) => pool.some((g) => g.category === c && !shownBefore.has(g.id)));
        const min = Math.min(...open.map(norm));
        const mineCat = (BY_ID.get(r.gameId) as GameConfig).category;
        if (norm(mineCat) > min + 1e-9) {
          bad.push(`${r.gameId}: «ветке достаётся меньше всего», а нагрузка ${norm(mineCat)} против минимума ${min}`);
        }
      }
    }
    return bad;
  }

  it('🔴 богатая, разнообразная история: каждая подпись сходится', () => {
    const p = profile('free');
    const sessions: HistorySession[] = [];
    // Заброшенные ветеранские упражнения.
    for (let i = 0; i < 5; i++) sessions.push(ago(40 + i, DAY, { game_type: 'schulte_table', profile_id: p.id, time_seconds: 50 - i }));
    for (let i = 0; i < 4; i++) sessions.push(ago(25 + i, DAY, { game_type: 'corsi', profile_id: p.id, score: 100 + i }));
    // Свежий рост.
    sessions.push(ago(4, DAY, { game_type: 'n_back', profile_id: p.id, score: 30, details: { level: 3 } }));
    sessions.push(ago(1, DAY, { game_type: 'n_back', profile_id: p.id, score: 70, details: { level: 3 } }));
    // Свежий провал — «растёте» про него сказать нельзя.
    sessions.push(ago(4, DAY, { game_type: 'stroop', profile_id: p.id, score: 90 }));
    sessions.push(ago(1, DAY, { game_type: 'stroop', profile_id: p.id, score: 20 }));
    // Плотно занятая ветка логики.
    for (let i = 0; i < 12; i++) sessions.push(ago(2 + (i % 10), DAY, { game_type: 'sudoku', profile_id: p.id, score: 300 + i }));

    for (const now of [MORNING, DAY, EVENING, NIGHT]) {
      const picks = recommendToday({ profile: p, sessions, now });
      expect(picks.length).toBeGreaterThan(0);
      expect(audit(picks, sessions, p.id, now)).toEqual([]);
    }
  });

  it('🔴 подпись сходится на КАЖДОМ профиле и на трёх разных днях', () => {
    const sessions: HistorySession[] = [];
    GAMES.forEach((g, i) => {
      // Разброс: часть заброшена, часть свежая, часть растёт, часть падает.
      sessions.push(ago(3 + (i % 45), DAY, { game_type: g.id, score: 100, time_seconds: 40 }));
      sessions.push(ago(1 + (i % 40), DAY, { game_type: g.id, score: i % 2 ? 200 : 50, time_seconds: i % 2 ? 30 : 60 }));
    });
    for (const p of PROFILES) {
      for (const d of [20, 21, 22]) {
        const now = new Date(2026, 7, d, 13, 0, 0);
        const picks = recommendToday({ profile: p, sessions, now });
        expect(`${p.id}/${d}: ${audit(picks, sessions, p.id, now).join(' | ')}`).toBe(`${p.id}/${d}: `);
      }
    }
  });

  it('🔴 «давно не играли» не выдаётся за одну-единственную пробу', () => {
    const p = profile('free');
    // В каждое упражнение сыграно РОВНО ОДИН раз и давно. Привычки не было — значит
    // и возвращать не к чему: блок обязан говорить что-то другое.
    const sessions = GAMES.map((g, i) => ago(60 + i, DAY, { game_type: g.id, profile_id: p.id, score: 10 }));
    const picks = recommendToday({ profile: p, sessions, now: DAY });
    expect(picks.filter((r) => r.reason === 'comeback')).toEqual([]);
  });

  it('🔴 направление «лучше» у времени обратное — рост по Шульте это МЕНЬШЕ секунд', () => {
    const p = profile('free');
    // Шульте: время растёт, то есть человек ЗАМЕДЛЯЕТСЯ. Назвать это ростом нельзя.
    const worse: HistorySession[] = [
      ago(4, DAY, { game_type: 'schulte_table', profile_id: p.id, time_seconds: 30, score: 25 }),
      ago(1, DAY, { game_type: 'schulte_table', profile_id: p.id, time_seconds: 55, score: 25 }),
    ];
    expect(recommendToday({ profile: p, sessions: worse, now: DAY })
      .filter((r) => r.gameId === 'schulte_table' && r.reason === 'growth')).toEqual([]);
    // А ускорение — рост, и он обязан находиться.
    const better: HistorySession[] = [
      ago(4, DAY, { game_type: 'schulte_table', profile_id: p.id, time_seconds: 55, score: 25 }),
      ago(1, DAY, { game_type: 'schulte_table', profile_id: p.id, time_seconds: 30, score: 25 }),
    ];
    const picks = recommendToday({ profile: p, sessions: better, now: MORNING });
    expect(picks.some((r) => r.gameId === 'schulte_table' && r.reason === 'growth')).toBe(true);
  });

  /**
   * 🔴 НАГРУЗКА ВЕТКИ СЧИТАЕТСЯ НА ОДНО УПРАЖНЕНИЕ, А НЕ СЫРЫМ СЧЁТЧИКОМ ПАРТИЙ.
   *
   * ⚠️ ЭТА ПРОВЕРКА ПОЯВИЛАСЬ ПОТОМУ, ЧТО ГЕЙТ БЫЛ ЗЕЛЁН БЕЗ НЕЁ. Убрал деление на
   * размер ветки — все 95 проверок остались зелёными: остальные наборы данных просто не
   * различали два способа счёта. Правило, которое проверка не умеет отличить от
   * неправильного, не проверяется вовсе.
   *
   * Расклад ниже различает их однозначно. Восстановление — одна игра, и в неё сыграно
   * ВОСЕМЬ раз; память — двадцать с лишним игр, и на всю ветку десять партий. Сырой
   * счётчик назовёт обделённым восстановление (8 < 10) и будет годами звать дышать
   * человека, который дышит каждый день. На одно упражнение: 8,0 против 0,5 — обделена
   * память, и это правда.
   */
  it('🔴 обделена ветка, где мало партий НА УПРАЖНЕНИЕ, а не там, где меньше счётчик', () => {
    // Полный каталог: в узком профиле ветка памяти исчерпывается на двух играх, и добор
    // ЗАКОННО уходит в следующую ветку — расклад перестал бы различать два способа счёта.
    const p = profile('odv999');
    const sessions: HistorySession[] = [];
    /** n партий подряд по НИСХОДЯЩЕЙ: ни «давно не играли», ни «растёте» — остаётся ветка. */
    const push = (id: string, n: number) => {
      for (let k = 0; k < n; k++) {
        sessions.push(ago(2 + (n - 1 - k), DAY, {
          game_type: id, profile_id: p.id, score: 900 - k * 10, time_seconds: 20 + k * 5,
        }));
      }
    };
    /**
     * 🔴 ЧИСЛА ПОДОБРАНЫ ТАК, ЧТОБЫ ДВА СПОСОБА СЧЁТА ДАЛИ РАЗНЫЙ ОТВЕТ. Первая редакция
     * этого не делала: у неё и сырой счётчик, и счёт на упражнение указывали на память,
     * и убранное деление проверку не роняло — я снял его и получил зелёный гейт.
     *
     * Здесь: восстановление — ПЯТЬ партий на одну игру, память — ШЕСТЬ на три игры (и на
     * два десятка в ветке). Сырым счётчиком обделено восстановление (5 < 6), на
     * упражнение — память (0,3 против 5,0). Правильный ответ — память.
     */
    push('breathing', 5);
    for (const id of ['n_back', 'picture_pairs', 'word_pairs']) push(id, 2);
    // Остальные ветки завалены работой — обделённой обязана остаться память.
    for (const g of GAMES) {
      if (g.category === 'memory' || g.category === 'recovery') continue;
      push(g.id, 6);
    }
    const branchPicks = recommendToday({ profile: p, sessions, now: MORNING, freshIds: [] })
      .filter((r) => r.reason === 'branch');
    expect(branchPicks.length).toBeGreaterThan(0);
    for (const r of branchPicks) {
      const cat = (BY_ID.get(r.gameId) as GameConfig).category;
      expect(`${r.gameId}: ${cat}`).toBe(`${r.gameId}: memory`);
    }
  });

  it('🔴 разная сложность — разные задачи: 6×6 после 5×5 это не провал и не рост', () => {
    const p = profile('free');
    const sessions: HistorySession[] = [
      ago(5, DAY, { game_type: 'n_back', profile_id: p.id, score: 90, details: { level: 1 } }),
      ago(4, DAY, { game_type: 'n_back', profile_id: p.id, score: 95, details: { level: 1 } }),
      // Взял следующий уровень — счёт закономерно упал. Это НОВАЯ задача.
      ago(1, DAY, { game_type: 'n_back', profile_id: p.id, score: 20, details: { level: 2 } }),
    ];
    const picks = recommendToday({ profile: p, sessions, now: DAY });
    // Ни «растёте» (последняя партия — первая на этом уровне), ни ложного роста.
    expect(picks.filter((r) => r.gameId === 'n_back' && r.reason === 'growth')).toEqual([]);
  });
});

describe('новинка: видно, но не каждый день', () => {
  const p = () => profile('free');
  /** Сыграно во всё, КРОМЕ новинок: тогда новинка — единственная нетронутая. */
  const played = (): HistorySession[] => {
    const fresh = new Set(freshGameIds(todayISO(DAY)));
    return GAMES.filter((g) => !fresh.has(g.id))
      .flatMap((g, i) => [
        ago(2 + (i % 5), DAY, { game_type: g.id, profile_id: 'free', score: 100 }),
        ago(1, DAY, { game_type: g.id, profile_id: 'free', score: 200 }),
      ]);
  };

  it('за две недели новинка показывается, но не ежедневно', () => {
    const h = played();
    let withFresh = 0;
    const total = 15;
    for (let d = 0; d < total; d++) {
      const now = new Date(2026, 7, 20 + d, 13, 0, 0);
      if (recommendToday({ profile: p(), sessions: h, now }).some((r) => r.reason === 'fresh')) withFresh++;
    }
    expect(withFresh).toBeGreaterThan(0);
    expect(withFresh).toBeLessThan(total);
    // Раз в RECO_FRESH_EVERY дней ±: рекламой блок не становится.
    expect(withFresh).toBeLessThanOrEqual(Math.ceil(total / RECO_FRESH_EVERY) + 1);
  });

  it('🔴 новинка, в которую уже играли, новинкой не подписывается', () => {
    const freshIds = freshGameIds(todayISO(DAY));
    expect(freshIds.length).toBeGreaterThan(0);
    const h = GAMES.flatMap((g, i) => [
      ago(2 + (i % 5), DAY, { game_type: g.id, profile_id: 'free', score: 100 }),
      ago(1, DAY, { game_type: g.id, profile_id: 'free', score: 200 }),
    ]);
    for (let d = 0; d < 15; d++) {
      const now = new Date(2026, 7, 20 + d, 13, 0, 0);
      expect(recommendToday({ profile: p(), sessions: h, now }).filter((r) => r.reason === 'fresh')).toEqual([]);
    }
  });
});

describe('словарь и разметка', () => {
  const LOCALES = ['de', 'es', 'pt', 'fr', 'it', 'zh', 'ja', 'ko', 'hi', 'ar'];
  /** Все ключи, которые блок может показать. */
  const KEYS = [...Object.values(RECO_REASON_KEY), 'recoTitle', 'recoHint', 'recoDoneToday'];

  it('🔴 каждый ключ причины есть в базовом словаре', () => {
    const src = read('src/contexts/LanguageContext.tsx');
    const missing = KEYS.filter((k) => !new RegExp(`^ {2}${k}:\\s*\\{`, 'm').test(src));
    expect(missing).toEqual([]);
  });

  it.each(LOCALES)('🔴 каждый ключ причины переведён в локали %s', (loc) => {
    const src = read(`src/contexts/translations/${loc}.ts`);
    const missing = KEYS.filter((k) => !src.includes(`"${k}":`));
    expect(`${loc}: ${missing.join(', ')}`).toBe(`${loc}: `);
  });

  it('🔴 у каждого основания своя подпись — иначе объяснение не объясняет', () => {
    expect(new Set(Object.values(RECO_REASON_KEY)).size).toBe(Object.keys(RECO_REASON_KEY).length);
  });

  /**
   * ⚠️ Без этой проверки весь файл может быть зелёным при отсутствующем на экране
   * блоке: сервис работает, разметка его не зовёт. Ровно так уже терялся бейдж
   * обратного отсчёта в SET — написан, переведён, проверен и мёртв.
   */
  it('🔴 главный экран действительно зовёт отбор и рисует его причины', () => {
    const home = read('app/index.tsx');
    expect(home).toMatch(/from '@\/src\/services\/recommend'/);
    expect(home).toMatch(/recoCards\(/);
    expect(home).toMatch(/reasonKey/);
    expect(home).toMatch(/recoParams\(/);
  });

  /**
   * 🔴 БЛОК ПОКАЗЫВАЕТСЯ, А НЕ ПРОСТО СУЩЕСТВУЕТ В ФАЙЛЕ.
   *
   * ⚠️ ПРОВЕРКА ВЫШЕ ЭТОГО НЕ ЛОВИТ, И Я В ЭТОМ УБЕДИЛСЯ ИСПОЛНЕНИЕМ: приписал к
   * условию показа `false &&` — вызовы `recoCards` и `recoParams` остались на местах,
   * все ключи на месте, гейт зелёный, а на экране пусто. Ровно этот вид смерти уже
   * случался с бейджем отсчёта в SET (dead-ui-state.test.ts).
   *
   * Поэтому здесь вытаскивается САМО УСЛОВИЕ, под которым рисуется блок, и оно обязано
   * зависеть только от числа карточек. Любая приписка — `false &&`, `IS_WEB_DEMO &&`,
   * закомментированная ветка — меняет условие и роняет проверку.
   */
  it('🔴 условие показа блока зависит только от того, есть ли что показывать', () => {
    const home = read('app/index.tsx');
    const m = /\{([^{}]*?)&&\s*\(\s*\n\s*<View style=\{styles\.recoBlock\}/.exec(home);
    expect(m ? m[1].trim() : 'блок с styles.recoBlock не найден в разметке')
      .toBe('reco.length > 0');
  });

  it('🔴 главный экран отдаёт в отбор ПРОФИЛЬ, а не заранее собранный список игр', () => {
    // Способ, которым течь в дневном перерыве стала возможной, здесь закрыт по типу:
    // если однажды кто-то добавит в сервис приём готового списка — это увидят тут.
    const svc = read('src/services/recommend.ts');
    expect(svc).toMatch(/filterAllowedGames\(profile\)/);
    expect(read('app/index.tsx')).toMatch(/recoCards\(\{\s*profile/);
  });
});

describe('карточки для разметки', () => {
  it('каждая карточка несёт игру из каталога и маршрут', () => {
    const cards = recoCards({ profile: profile('free'), sessions: [], now: DAY });
    expect(cards.length).toBeGreaterThan(0);
    for (const c of cards) {
      expect(c.game.id).toBe(c.pick.gameId);
      expect(c.game.route.startsWith('/games/')).toBe(true);
      expect(typeof c.game.nameKey).toBe('string');
    }
  });
});
