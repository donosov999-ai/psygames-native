/* psygames-gate-sudoku-hub · VER 1 · 20.08.2026 */
/**
 * РАЗВИЛКА СУДОКУ: ОДИН ВХОД НА ТРИ ДОСКИ — И НИ ОДНА ПАРТИЯ НЕ ПОТЕРЯНА.
 *
 * 🔴 ЧТО ЛОМАЕТСЯ У ХАБОВ И ПОЧЕМУ ЭТОГО НЕ ВИДНО. Хаб — это меню: своей партии,
 * своего уровня и своей записи в истории у него нет. Из этого следуют три разные
 * беды, и все три молчаливые:
 *
 *   1. ХАБ ПРИНЯЛИ ЗА УПРАЖНЕНИЕ. Счётчик партий у него вечно ноль, поэтому блок
 *      «рекомендуем сегодня» вечно считает его самым заброшенным и зовёт туда под
 *      подписью «этой ветке достаётся меньше всего»; вызов дня выдаёт экран, который
 *      не умеет записать партию, и серия не засчитывается; достижение «весь каталог»
 *      становится недостижимым навсегда. Имена хабов лежали в ПЯТИ местах кода и в
 *      двух гейтах — седьмым списком; забыть одно из семи было делом времени.
 *
 *   2. ПАРТИИ ЧЕРЕЗ ХАБ ПОТЕРЯЛИСЬ ДЛЯ СТАТИСТИКИ. Сессия пишется под `game_type`
 *      конкретной игры, а счётчики ищут её по `id` карточки. У фрактальной судоку
 *      это `sudoku_fractal` против `sudoku-fractal` — разница в одном символе, и
 *      из-за неё её тренировки не попадали в нагрузку ветки ВООБЩЕ.
 *
 *   3. ЖИВОЙ АУДИТ ПОШЁЛ ИСКАТЬ ПОЛЕ ТАМ, ГДЕ ЕГО НЕТ. `scripts/slot-audit.mjs`
 *      заходит в каждую игру и требует нижнюю полосу с ответом игрока. На меню он
 *      отчитается красным про исправный экран.
 *
 * ⚠️ ЧТО ЗДЕСЬ ВЫЗОВОМ, А ЧТО ЧТЕНИЕМ. Отбор рекомендаций, вызов дня, достижения и
 * счёт нагрузки ветки проверяются ПРОГОНОМ на настоящих данных. По исходнику
 * смотрится то, что вызвать нечем — разметка экрана и скрипт живого аудита, — и
 * смотрится по тексту БЕЗ КОММЕНТАРИЕВ: в этом проекте гейт не раз держался зелёным
 * на русском слове в объяснении, а сам экран-развилка объясняет в шапке, почему у
 * него нет каркаса, — и одного слова `GameShell` в объяснении хватило, чтобы другой
 * гейт счёл его игрой на каркасе.
 */
declare const __dirname: string;
declare function require(id: string): any;

const fs = require('fs');
const path = require('path');

import {
  GAMES, HUB_GAME_IDS, isHubGame, sessionTypeOf, GameConfig,
} from '@/src/constants/games';
import { HELP_MAP } from '@/src/constants/helpMap';
import { RECO_GROUP_HUBS, RECO_STARTERS, recommendToday } from '@/src/services/recommend';
import { getTodayChallenge } from '@/src/services/daily-challenge';
import { filterAllowedGames, PROFILES } from '@/src/constants/profiles';
import type { HistorySession } from '@/src/services/trainingHistory';

const ROOT = path.join(__dirname, '../..');
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const stripComments = (s: string): string =>
  s.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

const SCREEN = stripComments(read('app/games/sudoku-hub.tsx'));
const AUDIT = stripComments(read('scripts/slot-audit.mjs'));

const HUB_ID = 'sudoku_group';
const BOARDS = ['sudoku', 'sudoku-samurai', 'sudoku-fractal'];
const byId = new Map<string, GameConfig>(GAMES.map((g) => [g.id, g]));
const widest = () => PROFILES.reduce((a, b) =>
  (filterAllowedGames(a).length >= filterAllowedGames(b).length ? a : b));

describe('развилка судоку заведена в каталоге', () => {
  it('карточка есть, помечена хабом и ведёт на свой экран', () => {
    const g = byId.get(HUB_ID);
    expect(`${g?.route} · hub=${g?.hub} · ${g?.category}`).toBe('/games/sudoku-hub · hub=true · logic');
    expect(fs.existsSync(path.join(ROOT, 'app/games/sudoku-hub.tsx'))).toBe(true);
  });

  /** Ради чего всё затевалось: в каталоге у судоку ОДИН вход, а не три карточки. */
  it('в каталоге видна ровно одна карточка судоку — сама развилка', () => {
    const visible = GAMES.filter((g) => !g.hideFromMenu && /sudoku/.test(g.id)).map((g) => g.id);
    expect(visible).toEqual([HUB_ID]);
  });

  it('все три доски остались в каталоге и открываются с развилки', () => {
    for (const id of BOARDS) {
      const g = byId.get(id);
      expect(`${id}: есть=${!!g} скрыт=${!!g?.hideFromMenu}`).toBe(`${id}: есть=true скрыт=true`);
      expect(SCREEN).toContain(`'${g?.route}'`);
    }
  });

  it('у развилки есть справка, и её ключи живут в словаре', () => {
    const help = HELP_MAP['/games/sudoku-hub'];
    expect(help?.nameKey).toBe('sudokuGroup');
    const dict = read('src/contexts/LanguageContext.tsx');
    for (const k of [help.nameKey, help.skillKey, help.introKey]) {
      expect(`${k}: ${new RegExp(`\\n {2}${k}:\\s*\\{`).test(dict)}`).toBe(`${k}: true`);
    }
  });
});

describe('единый список хабов — один на весь проект', () => {
  it('список выводится из каталога и содержит все три развилки', () => {
    expect([...HUB_GAME_IDS].sort()).toEqual(['attention_conflict', 'span_group', 'sudoku_group']);
    expect(HUB_GAME_IDS.every(isHubGame)).toBe(true);
    expect(isHubGame('sudoku')).toBe(false);
  });

  /**
   * 🔴 РАНЬШЕ ЭТИ ИМЕНА БЫЛИ ВЫПИСАНЫ В ПЯТИ МЕСТАХ. Второго списка остаться не должно.
   *
   * ⚠️ ЛОВИМ СПИСОК, А НЕ УПОМИНАНИЕ. Назвать ОДИН хаб — законно и обычно: профили
   * перечисляют разрешённые игры поимённо, и `attention_conflict` стоит там наравне
   * со Струпом. А вот файл, называющий ДВА и больше хабов, — это почти наверняка их
   * список, и он обязан читать каталог. Первая редакция этой пробы ловила любое
   * упоминание и покраснела на профилях — на законном месте.
   */
  it('второго списка хабов в коде нет', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === 'node_modules' || e.name === '__tests__') continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { walk(p); continue; }
        if (!/\.tsx?$/.test(e.name)) continue;
        if (p.endsWith('constants/games.ts')) continue;          // сам источник
        const src = stripComments(fs.readFileSync(p, 'utf8'));
        const named = HUB_GAME_IDS.filter((id) => src.includes(`'${id}'`));
        if (named.length >= 2) offenders.push(`${p.split('/frontend/')[1]}: ${named.join(', ')}`);
      }
    };
    walk(path.join(ROOT, 'src'));
    walk(path.join(ROOT, 'app'));
    expect(offenders).toEqual([]);
  });

  it('живой аудит слотов читает хабы из каталога, а не из своего списка', () => {
    expect(AUDIT).toContain('hub:');
    expect(AUDIT).not.toMatch(/HUB_ROUTES = new Set\(\[/);
    expect(AUDIT).toMatch(/hubRoutes\(\)/);
  });

  /** Разбор аудита исполняем той же логикой — молчаливый пустой список опаснее всего. */
  it('разбор хабов из каталога находит ровно три маршрута', () => {
    const raw = read('src/constants/games.ts');
    const src = raw.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
    const out = new Set<string>();
    for (const m of src.matchAll(/\n {2}\{\n([\s\S]*?)\n {2}\},/g)) {
      if (!/^\s*hub:\s*true,?\s*$/m.test(m[1])) continue;
      const r = /route:\s*'([^']+)'/.exec(m[1]);
      if (r) out.add(r[1]);
    }
    expect([...out].sort()).toEqual(['/games/attention-conflict', '/games/span', '/games/sudoku-hub']);
  });
});

describe('развилку не предлагают как упражнение', () => {
  it('отсев рекомендаций знает про третью развилку', () => {
    expect([...RECO_GROUP_HUBS].sort()).toEqual(['attention_conflict', 'span_group', 'sudoku_group']);
  });

  /**
   * Прогон: человек играл ВО ВСЁ, кроме хабов. Тогда «самое незанятое в самой
   * обделённой ветке» указывает прямо на развилку — и молчание блока означает
   * именно отсев, а не удачу.
   */
  it('развилка не попадает в блок, даже когда она самый заманчивый кандидат', () => {
    const p = widest();
    expect(filterAllowedGames(p).map((g) => g.id)).toContain(HUB_ID);
    const sessions: HistorySession[] = [];
    const day = 86400000;
    for (const g of GAMES) {
      if (isHubGame(g.id)) continue;
      for (const [ago, score] of [[3, 900], [2, 100]] as const) {
        sessions.push({
          game_type: sessionTypeOf(g), profile_id: p.id, score, time_seconds: 40,
          timestamp: new Date(Date.UTC(2026, 7, 20) - ago * day).toISOString(),
        });
      }
    }
    for (const hh of [8, 13, 21, 2]) {
      const picks = recommendToday({ profile: p, sessions, now: new Date(2026, 7, 22, hh), freshIds: [] });
      expect(picks.length).toBeGreaterThan(0);
      expect(`${hh}: ${picks.map((r) => r.gameId).filter(isHubGame).join(',')}`).toBe(`${hh}: `);
    }
  });

  it('вызов дня никогда не выпадает на развилку', () => {
    const seen = new Set<string>();
    for (let d = 0; d < 400; d++) {
      seen.add(getTodayChallenge(new Date(2026, 0, 1 + d)).game.id);
    }
    expect([...seen].filter(isHubGame)).toEqual([]);
    expect(seen.size).toBeGreaterThan(20);   // ротация живая, а не одна игра
  });

  /**
   * 🔴 ИМЯ В СПИСКЕ «С ЧЕГО НАЧАТЬ» МОЖЕТ УМЕРЕТЬ МОЛЧА. Судоку стояла там и стала
   * `hideFromMenu` в тот же день — имя осталось бы рабочим на вид и не выдавалось бы
   * никогда. Проверяем, что КАЖДОЕ имя списка новичок действительно может получить.
   */
  it('каждое имя списка «с чего начать» новичку доступно', () => {
    const p = widest();
    const reachable = new Set(filterAllowedGames(p).filter((g) => !g.hideFromMenu && !isHubGame(g.id)).map((g) => g.id));
    const dead = RECO_STARTERS.filter((id) => !reachable.has(id));
    expect(`мёртвых имён в списке: ${dead.join(', ') || '—'}`).toBe('мёртвых имён в списке: —');
  });

  it('новичок получает непустой набор — список не выродился в пустоту', () => {
    const p = widest();
    const picks = recommendToday({ profile: p, sessions: [], now: new Date(2026, 7, 22, 10), freshIds: [] });
    expect(picks.length).toBeGreaterThan(0);
    expect(picks.every((x) => x.reason === 'start')).toBe(true);
  });
});

describe('партии через развилку не теряются', () => {
  /**
   * 🔴 КЛЮЧ ЗАПИСИ ПАРТИИ ПРОТИВ `id` КАРТОЧКИ. Сверяем не по памяти, а по коду
   * экранов: какой `game_type` они РЕАЛЬНО пишут.
   */
  it('каталог знает, под каким ключом каждая игра пишет партию', () => {
    const wrong: string[] = [];
    for (const g of GAMES) {
      if (isHubGame(g.id)) continue;
      const file = path.join(ROOT, 'app/games', g.route.replace('/games/', '') + '.tsx');
      if (!fs.existsSync(file)) continue;
      const src = stripComments(fs.readFileSync(file, 'utf8'));
      const lits = new Set<string>([...src.matchAll(/game_type:\s*'([^']+)'/g)].map((m) => m[1]));
      if (/game_type:\s*GAME_ID/.test(src)) {
        const c = /const GAME_ID\s*=\s*'([^']+)'/.exec(src);
        if (c) lits.add(c[1]);
      }
      if (!lits.size) continue;              // экран партий не пишет — не наш случай
      if (!lits.has(sessionTypeOf(g))) wrong.push(`${g.id}: каталог обещает «${sessionTypeOf(g)}», экран пишет «${[...lits].join(', ')}»`);
    }
    expect(wrong).toEqual([]);
  });

  /**
   * ⚠️ У САМУРАЯ ЗДЕСЬ СТОЯЛО `sudoku` — И ЭТО БЫЛА НЕ ОПЕЧАТКА, А ЗАПИСАННАЯ БЕДА:
   * две разные игры делили одну корзину со своими номерами уровней. Разведено
   * 20.08.2026, подробности и проба на старые записи — в `sudoku-buckets.test.ts`.
   * Здесь остаётся то, ради чего раздел вообще есть: у каждой доски своё имя корзины.
   */
  it('у трёх досок ключи записи разные, и ни один не совпадает с чужим', () => {
    expect(sessionTypeOf(byId.get('sudoku-fractal') as GameConfig)).toBe('sudoku_fractal');
    expect(sessionTypeOf(byId.get('sudoku-samurai') as GameConfig)).toBe('sudoku_samurai');
    expect(sessionTypeOf(byId.get('sudoku') as GameConfig)).toBe('sudoku');
    const buckets = BOARDS.map((id) => sessionTypeOf(byId.get(id) as GameConfig));
    expect(new Set(buckets).size).toBe(BOARDS.length);
  });

  /**
   * 🔴 ГЛАВНАЯ ПРОБА РАЗДЕЛА. Человек играет ТОЛЬКО во фрактальную судоку, каждый
   * день. Ветка логики обязана считаться нагруженной — иначе блок будет звать его
   * туда, куда он и так ходит ежедневно. До правки счётчик её партий не видел вовсе.
   */
  it('тренировки через развилку попадают в нагрузку своей ветки', () => {
    const p = widest();
    const day = 86400000;
    const sessions: HistorySession[] = [];
    for (let d = 1; d <= 20; d++) {
      sessions.push({
        game_type: 'sudoku_fractal', profile_id: p.id, score: 500, time_seconds: 600,
        timestamp: new Date(Date.UTC(2026, 7, 22) - d * day).toISOString(),
      });
    }
    // Ещё по одной партии в каждую НЕ логическую игру: без этого «самая обделённая
    // ветка» определялась бы пустотой во всех ветках разом и проба ничего не значила.
    for (const g of GAMES) {
      if (isHubGame(g.id) || g.category === 'logic') continue;
      sessions.push({
        game_type: sessionTypeOf(g), profile_id: p.id, score: 500, time_seconds: 30,
        timestamp: new Date(Date.UTC(2026, 7, 22) - 2 * day).toISOString(),
      });
    }
    const picks = recommendToday({ profile: p, sessions, now: new Date(2026, 7, 22, 10), freshIds: [] });
    const branchCats = picks.filter((x) => x.reason === 'branch')
      .map((x) => byId.get(x.gameId)?.category);
    // Логика натренирована двадцатью партиями подряд — назвать её обделённой нельзя.
    expect(`обделённые ветки: ${branchCats.join(',') || '—'} (логики тут быть не должно)`)
      .toBe(`обделённые ветки: ${branchCats.filter((c) => c !== 'logic').join(',') || '—'} (логики тут быть не должно)`);
  });
});

describe('экран развилки: меню, а не партия', () => {
  it('срез комментариев работает — иначе всё ниже зелено вслепую', () => {
    expect(stripComments("/* GameShell тут только в объяснении */")).not.toContain('GameShell');
    expect(SCREEN.length).toBeGreaterThan(2000);
  });

  /**
   * Каркаса, паузы и вопроса при выходе у меню нет — и это законно: они стерегут
   * НЕЗАКОНЧЕННУЮ партию, а её здесь не бывает. Проверяем, что и партии нет: ни
   * записи сессии, ни таймера, ни уровня. Иначе «меню» окажется игрой без каркаса.
   */
  it('у развилки нет ни партии, ни записи, ни уровня', () => {
    for (const forbidden of ['saveSession', 'GameShell', 'LevelCleared', 'LevelProgressMap', 'setInterval', 'AsyncStorage']) {
      expect(`${forbidden}: ${SCREEN.includes(forbidden)}`).toBe(`${forbidden}: false`);
    }
  });

  it('с развилки только уходят — пять переходов и кнопка назад', () => {
    expect([...SCREEN.matchAll(/router\.push\(/g)].length).toBeGreaterThanOrEqual(1);
    expect(SCREEN).toContain('goBackOrHome()');
    // 27.08.2026 (70b58bbe): к трём доскам добавились карточки режимов классической
    // доски — «Небоскрёбы» и «Неравенства» (?mode=…). Смысл гейта не тронут:
    // отсюда ТОЛЬКО уходят, и каждый уход — в семейство судоку.
    expect([...SCREEN.matchAll(/route:\s*'\/games\//g)].length).toBe(5);
  });

  it('веб-демо уводит сразу на классическую доску и не теряет query', () => {
    expect(SCREEN).toContain('isWebDemo()');
    expect(SCREEN).toMatch(/window\.location\.search/);
    expect(SCREEN).toMatch(/router\.replace\(\('\/games\/sudoku' \+ qs\)/);
  });

  it('все подписи экрана берутся из словаря на двенадцати языках', () => {
    const keys = [...SCREEN.matchAll(/t\('([a-zA-Z0-9_]+)'\)/g)].map((m) => m[1])
      .concat([...SCREEN.matchAll(/(?:nameKey|descKey|typeKey):\s*'([a-zA-Z0-9_]+)'/g)].map((m) => m[1]));
    expect(keys.length).toBeGreaterThan(8);
    const base = read('src/contexts/LanguageContext.tsx');
    const missing = [...new Set(keys)].filter((k) => !new RegExp(`\\n {2}${k}:\\s*\\{`).test(base));
    expect(`нет в базовом словаре: ${missing.join(', ') || '—'}`).toBe('нет в базовом словаре: —');
  });
});

describe('новые подписи переведены на все двенадцать языков', () => {
  const LOCALES = ['de', 'es', 'pt', 'fr', 'it', 'zh', 'ja', 'ko', 'hi', 'ar'];
  const KEYS = ['sudokuGroup', 'sudokuGroupDesc', 'sudokuPickBoard', 'sudokuTypeClassic',
    'sudokuTypeSamurai', 'sudokuTypeFractal', 'sudokuGroupFootnote', 'sudokuGroupIntroDesc',
    // Карточки и правила режимов towers/unequal (70b58bbe): подписи, описания,
    // тексты правил и примеры обязаны существовать на всех двенадцати языках.
    'sudokuTowersTitle', 'sudokuUnequalTitle', 'sudokuTowersHubDesc', 'sudokuUnequalHubDesc',
    'sudokuTypeTowers', 'sudokuTypeUnequal', 'sudokuVariantTowers', 'sudokuVariantUnequal',
    'sudokuRuleTowers', 'sudokuRuleUnequal', 'sudokuEx_towers', 'sudokuEx_unequal'];

  it.each(LOCALES)('в локали %s переведены все подписи развилки', (loc) => {
    const src = read(`src/contexts/translations/${loc}.ts`);
    const miss = KEYS.filter((k) => !new RegExp(`"${k}":\\s*"[^"]+"`).test(src));
    expect(`${loc}: не хватает ${miss.join(', ') || '—'}`).toBe(`${loc}: не хватает —`);
  });
});
