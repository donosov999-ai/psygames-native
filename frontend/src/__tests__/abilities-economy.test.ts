/**
 * РАСХОДУЕМЫЕ СПОСОБНОСТИ: цена, кошелёк и граница «возврат, а не подсказка».
 *
 * ЗАЧЕМ ГЕЙТ. Способности стоят на пересечении двух вещей, которые ломаются молча:
 * экономики (очки) и замера (уровни, спан, статистика). Ошибиться можно пятью
 * способами, и ни один не виден глазами за один заход:
 *
 *   1. способность окупается — купил за 60, отыграл 100, и покупка перестала быть
 *      решением: это станок, а не выбор;
 *   2. способность решает задачу — подсказала, добавила времени, сняла лимит ходов;
 *      результат обесценен, а замер начинает мерить кошелёк;
 *   3. кошелёк течёт — двойное нажатие тратит одну штуку дважды, две покупки
 *      уходят по цене одной, чужой профиль тратит купленное;
 *   4. косметика обесценена — расходник дешевле вечной вещи, и вечную перестают брать;
 *   5. всё написано, переведено на 12 языков и НЕ ПОКАЗЫВАЕТСЯ. На этом в проекте
 *      уже обжигались: в SET бейдж отсчёта был написан, переведён и покрыт гейтом,
 *      а состояние, от которого он зависел, не присваивалось нигде.
 *
 * ⚠️ ЧТО ИМЕННО ПРОВЕРЯЕТСЯ. Кошелёк — ИСПОЛНЕНИЕМ: тесты реально покупают, тратят
 * и пробуют потратить дважды. Цены — ЖИВЫМИ функциями (`TOKEN_DELTA_CAP`,
 * `MULTIPLIER`, `checkInStreakMaxLoss`), а не числами из комментария: поднимут
 * потолок начисления — цены обязаны подняться следом, и гейт об этом скажет.
 * Показ — по исходнику, но не по наличию слова: ищется, что условие показа
 * ПРИСВАИВАЕТСЯ, а обработчик кнопки реально доходит до списания.
 *
 * ⚠️ КОММЕНТАРИИ СРЕЗАЮТСЯ ПЕРЕД ПОИСКОМ. Гейт, который ловит собственные
 * объяснения, зеленеет на пустом месте: достаточно упомянуть `useAbility` в
 * комментарии, и «способность подключена».
 */
declare const __dirname: string;
declare function require(id: string): any;

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ABILITIES,
  AbilityId,
  MAX_ROUND_EARNING,
  __resetAbilitiesMemory,
  abilityById,
  buyAbility,
  getAbilityCount,
  getAbilityCounts,
  useAbility,
} from '@/src/services/abilities';
import { COSMETICS } from '@/src/services/cosmetics';
import { MULTIPLIER } from '@/src/services/earn';
import * as tokensModule from '@/src/services/tokens';
import {
  TOKEN_DELTA_CAP,
  addTokens,
  checkInAward,
  checkInStreakMaxLoss,
  checkInStreakRepairable,
  dailyCheckIn,
  getTokens,
  repairCheckInStreak,
} from '@/src/services/tokens';

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8') as string;

/** Исходник без комментариев — иначе гейт ловит собственные объяснения. */
function code(rel: string): string {
  const src = read(rel);
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')          // блочные, включая JSX-обёртки {/* … */}
    .split('\n')
    .map((l: string) => l.replace(/\/\/.*$/, ''))
    .join('\n');
}

const GAMES_DIR = path.join(ROOT, 'app/games');
const GAME_FILES: string[] = fs.readdirSync(GAMES_DIR)
  .filter((f: string) => f.endsWith('.tsx')).sort();

/**
 * РЕЕСТР: где способность тратится в партии и ПОЧЕМУ именно там.
 *
 * Смысл реестра тот же, что у реестра отмены хода: молчаливых подключений быть не
 * должно. Экран, который начнёт звать `useAbility`, обязан появиться здесь — иначе
 * решение «честна ли тут способность» никто не примет.
 */
const SPENT_IN: Record<string, AbilityId> = {
  // Единственная аркада каталога с жизнями: они выдаются пачкой на старте и
  // ДОБАВЛЯЮТСЯ на переходе уровня, а в сессию уходят mean_rt/std_rt/hits — то есть
  // жизнь здесь игровая условность, а не измеряемая величина.
  'targets.tsx': 'second_life',
  // Замерные игры: лимит ошибок И ЕСТЬ измерение (спан = докуда дошёл до двух
  // ошибок). Второй жизни тут нет и не будет; продаётся обратное — право сыграть
  // так, чтобы партия не записалась никуда.
  'digit-span.tsx': 'practice_run',
  'corsi.tsx': 'practice_run',
  'spatial-span.tsx': 'practice_run',
};

/**
 * 🔴 ГДЕ СПОСОБНОСТЬ ЗАПРЕЩЕНА — поимённо и с причиной. Список так же важен, как
 * первый: каждая строка означает, что человек посмотрел и решил, а не забыл.
 */
const FORBIDDEN: Record<string, string> = {
  'goods-sort.tsx': 'лимит ходов — сама головоломка; лишние ходы это продажа сложности',
  'mahjong.tsx': 'бюджет перетасовок на уровень — часть правила; тупик там следствие своего же плана',
  'anagrams.tsx': 'подсказка уже есть и уже платная — режет точность; продавать «ещё» значит продавать буквы',
  'set-game.tsx': 'лимит времени на раздачу с 11 уровня И ЕСТЬ сложность; продление = продажа сложности',
  'find-differences.tsx': 'таймер раунда и есть сложность',
  'one-line.tsx': 'отмена платная точностью — снимать её цену значит убирать планирование',
  'dots-connect.tsx': 'то же: каждая отмена растит errors, в этом и смысл',
};

describe('способности: экономика', () => {
  it('есть что проверять — набор заведён и он небольшой', () => {
    expect(ABILITIES.length).toBeGreaterThanOrEqual(3);
    expect(ABILITIES.length).toBeLessThanOrEqual(5);   // задание Дениса: 3–5, не больше
    expect(new Set(ABILITIES.map((a) => a.id)).size).toBe(ABILITIES.length);
  });

  it('потолок партии считается из живых констант, а не вписан числом', () => {
    expect(MAX_ROUND_EARNING).toBe(TOKEN_DELTA_CAP * MULTIPLIER);
  });

  /**
   * ГЛАВНЫЙ ЭКОНОМИЧЕСКИЙ ИНВАРИАНТ. Способность не может окупиться: цена строго
   * выше потолка того, что эта способность способна вернуть очками.
   */
  it.each(ABILITIES.map((a) => [a.id, a] as const))('%s не окупается: цена > потолка возврата', (_id, a) => {
    expect(`${a.id}: ${a.cost} > ${a.maxReturn}`).toBe(`${a.id}: ${a.cost} > ${a.maxReturn}`);
    expect(a.cost).toBeGreaterThan(a.maxReturn);
  });

  it('потолки возврата взяты из механики, а не назначены', () => {
    expect(abilityById('second_life')!.maxReturn).toBe(MAX_ROUND_EARNING);
    // Пробный заход не записывается никуда — значит не приносит ничего по построению.
    expect(abilityById('practice_run')!.maxReturn).toBe(0);
    // Щит возвращает не деньги, а серию: его потолок — разница бонусов за 7 дней отрастания.
    expect(abilityById('streak_shield')!.maxReturn).toBe(checkInStreakMaxLoss());
    expect(checkInStreakMaxLoss()).toBe(
      [1, 2, 3, 4, 5, 6, 7].reduce((s, d) => s + (checkInAward(7) - checkInAward(d)), 0),
    );
  });

  /**
   * ⚠️ КОСМЕТИКА НЕ ДОЛЖНА ОБЕСЦЕНИТЬСЯ. Расходник дешевле вечной вещи — иначе его
   * не купят; но не НАСТОЛЬКО дешевле, чтобы покупка стала рефлексом и косметику
   * перестали брать вовсе.
   */
  it('цены соотнесены с косметикой: доступнее, но не даром', () => {
    const cheapCos = Math.min(...COSMETICS.map((c) => c.cost));
    const dearCos = Math.max(...COSMETICS.map((c) => c.cost));
    const cheapAb = Math.min(...ABILITIES.map((a) => a.cost));
    const dearAb = Math.max(...ABILITIES.map((a) => a.cost));
    expect(cheapAb).toBeLessThan(cheapCos);        // самая дешёвая способность доступнее самой дешёвой косметики
    expect(dearAb).toBeLessThanOrEqual(dearCos);   // расходник не дороже самой дорогой вечной вещи
    // Не рефлекс: даже самая дешёвая стоит дороже, чем МАКСИМУМ базы за одну партию.
    expect(cheapAb).toBeGreaterThan(TOKEN_DELTA_CAP);
    // Косметика остаётся заметной целью: самая дешёвая вещь дороже трёх дешёвых способностей.
    expect(cheapCos).toBeGreaterThanOrEqual(cheapAb * 3);
  });

  it('запас ограничен — расходник не копится мешками', () => {
    for (const a of ABILITIES) {
      expect(a.max).toBeGreaterThan(0);
      expect(a.max).toBeLessThanOrEqual(10);
    }
  });

  it('у каждой способности ключи словаря, а не готовый текст', () => {
    const dict = read('src/contexts/LanguageContext.tsx');
    for (const a of ABILITIES) {
      expect(`${a.id}/name:${dict.includes(`  ${a.nameKey}: {`)}`).toBe(`${a.id}/name:true`);
      expect(`${a.id}/desc:${dict.includes(`  ${a.descKey}: {`)}`).toBe(`${a.id}/desc:true`);
    }
  });
});

describe('способности: кошелёк', () => {
  beforeEach(() => { __resetAbilitiesMemory(); });

  it('купил → списалось ровно столько → в кошельке штука', async () => {
    const pid = 'wallet-buy';
    await addTokens(pid, 1000);
    const before = await getTokens(pid);
    const a = abilityById('second_life')!;
    const r = await buyAbility(pid, 'second_life');
    expect(r.ok).toBe(true);
    expect(r.count).toBe(1);
    expect(await getTokens(pid)).toBe(before - a.cost);
    expect(await getAbilityCount(pid, 'second_life')).toBe(1);
  });

  it('нельзя купить в минус: не хватило — ни штуки, ни списания', async () => {
    const pid = 'wallet-poor';
    await addTokens(pid, 10);
    const r = await buyAbility(pid, 'streak_shield');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('poor');
    expect(await getTokens(pid)).toBe(10);
    expect(await getAbilityCount(pid, 'streak_shield')).toBe(0);
  });

  it('потратил → штуки нет → второй раз не тратится', async () => {
    const pid = 'wallet-spend';
    await addTokens(pid, 1000);
    await buyAbility(pid, 'second_life');
    expect(await useAbility(pid, 'second_life')).toBe(true);
    expect(await getAbilityCount(pid, 'second_life')).toBe(0);
    expect(await useAbility(pid, 'second_life')).toBe(false);
  });

  /**
   * ⚠️ ДВОЙНОЕ НАЖАТИЕ. Два `useAbility` в полёте одновременно — ровно то, что даёт
   * палец на кнопке и лаг хранилища. Без общей очереди оба читают «есть штука».
   */
  it('двойное нажатие тратит ровно одну штуку', async () => {
    const pid = 'wallet-double';
    await addTokens(pid, 1000);
    await buyAbility(pid, 'second_life');
    const [a, b] = await Promise.all([
      useAbility(pid, 'second_life'),
      useAbility(pid, 'second_life'),
    ]);
    expect([a, b].filter(Boolean).length).toBe(1);
    expect(await getAbilityCount(pid, 'second_life')).toBe(0);
  });

  it('две покупки внахлёст при деньгах на одну — куплена одна', async () => {
    const pid = 'wallet-race-buy';
    const cost = abilityById('practice_run')!.cost;
    await addTokens(pid, cost);
    const [x, y] = await Promise.all([
      buyAbility(pid, 'practice_run'),
      buyAbility(pid, 'practice_run'),
    ]);
    expect([x.ok, y.ok].filter(Boolean).length).toBe(1);
    expect(await getAbilityCount(pid, 'practice_run')).toBe(1);
    expect(await getTokens(pid)).toBe(0);
  });

  it('чужую покупку потратить нельзя — кошельки по профилям', async () => {
    const mine = 'wallet-valya';
    const other = 'wallet-alex';
    await addTokens(mine, 1000);
    await buyAbility(mine, 'second_life');
    expect(await useAbility(other, 'second_life')).toBe(false);
    expect(await getAbilityCount(mine, 'second_life')).toBe(1);
    expect(await getAbilityCounts(other)).toEqual({});
  });

  it('запас не переполняется — сверх потолка не продаётся и деньги не берутся', async () => {
    const pid = 'wallet-cap';
    const a = abilityById('streak_shield')!;
    await addTokens(pid, a.cost * (a.max + 2));
    for (let i = 0; i < a.max; i++) expect((await buyAbility(pid, 'streak_shield')).ok).toBe(true);
    const balance = await getTokens(pid);
    const over = await buyAbility(pid, 'streak_shield');
    expect(over.ok).toBe(false);
    expect(over.reason).toBe('full');
    expect(await getTokens(pid)).toBe(balance);
    expect(await getAbilityCount(pid, 'streak_shield')).toBe(a.max);
  });

  /**
   * 🔴 НАЙДЕНО ПОЛОМКОЙ ГЕЙТА. Первая версия этой проверки ловила только «денег не
   * хватило» — а между «хватило по балансу» и «списание прошло» есть зазор: очки
   * могут уйти на косметику, пока покупка способности в полёте. С вырезанным
   * отказом по `!paid` штука выдавалась даром, и гейт оставался зелёным.
   */
  it('списание не прошло — штуки не появляется и деньги на месте', async () => {
    const pid = 'wallet-payfail';
    await addTokens(pid, 1000);
    const before = await getTokens(pid);
    const spy = jest.spyOn(tokensModule, 'spendTokens').mockResolvedValue(false);
    const r = await buyAbility(pid, 'second_life');
    spy.mockRestore();
    expect(r.ok).toBe(false);
    expect(await getAbilityCount(pid, 'second_life')).toBe(0);
    expect(await getTokens(pid)).toBe(before);
  });

  it('несуществующая способность не продаётся и не тратится', async () => {
    const pid = 'wallet-ghost';
    await addTokens(pid, 1000);
    const before = await getTokens(pid);
    expect((await buyAbility(pid, 'nope' as AbilityId)).ok).toBe(false);
    expect(await useAbility(pid, 'nope' as AbilityId)).toBe(false);
    expect(await getTokens(pid)).toBe(before);
  });
});

describe('щит серии: чинит серию, а не кошелёк', () => {
  const dayStr = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

  /** Разложить в хранилище оборванную серию: заход был `len` дней и оборвался `gap` дней назад. */
  async function seedBroken(pid: string, len: number, gapDays: number): Promise<void> {
    const last = new Date();
    last.setDate(last.getDate() - gapDays);
    const raw = await AsyncStorage.getItem('psygames_streak_v1');
    const data = raw ? JSON.parse(raw) : {};
    data[pid] = { last: dayStr(last), streak: len };
    await AsyncStorage.setItem('psygames_streak_v1', JSON.stringify(data));
  }

  it('обрыв запоминается на отметке дня — иначе чинить нечего', async () => {
    const pid = 'shield-detect';
    await seedBroken(pid, 9, 3);
    const res = await dailyCheckIn(pid);
    expect(res.streak).toBe(1);                       // серия сброшена, как и была
    const broken = await checkInStreakRepairable(pid);
    expect(broken).not.toBeNull();
    expect(broken!.len).toBe(9);
  });

  it('щит возвращает серию и не возвращает её дважды', async () => {
    const pid = 'shield-restore';
    await seedBroken(pid, 9, 3);
    await dailyCheckIn(pid);
    const r = await repairCheckInStreak(pid);
    expect(r.ok).toBe(true);
    expect(r.restoredFrom).toBe(9);
    expect(r.streak).toBe(10);                        // девять дней + сегодняшний
    const again = await repairCheckInStreak(pid);
    expect(again.ok).toBe(false);
    expect(again.streak).toBe(10);                    // повтор ничего не дорисовывает
  });

  it('щит не печатает очки — баланс от починки не растёт', async () => {
    const pid = 'shield-nomoney';
    await seedBroken(pid, 9, 3);
    await dailyCheckIn(pid);
    const before = await getTokens(pid);
    await repairCheckInStreak(pid);
    expect(await getTokens(pid)).toBe(before);
  });

  it('целую серию чинить нечего — щит нечего тратить', async () => {
    const pid = 'shield-intact';
    await seedBroken(pid, 4, 1);                      // вчера играл — серия продолжится
    const res = await dailyCheckIn(pid);
    expect(res.streak).toBe(5);
    expect(await checkInStreakRepairable(pid)).toBeNull();
    expect((await repairCheckInStreak(pid)).ok).toBe(false);
  });

  it('серия из одного дня — не потеря, чинить нечего', async () => {
    const pid = 'shield-tiny';
    await seedBroken(pid, 1, 4);
    await dailyCheckIn(pid);
    expect(await checkInStreakRepairable(pid)).toBeNull();
  });

  it('не в день обрыва щит не работает', async () => {
    const pid = 'shield-stale';
    await seedBroken(pid, 9, 3);
    await dailyCheckIn(pid);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    // Обрыв обнаружен СЕГОДНЯ, а чинить пробуем «завтрашним» днём — поздно.
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const r = await repairCheckInStreak(pid, tomorrow);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('stale');
    expect(await checkInStreakRepairable(pid, tomorrow)).toBeNull();
  });
});

describe('способности не решают задачу: реестр экранов', () => {
  it('есть что проверять — каталог игр на месте', () => {
    expect(GAME_FILES.length).toBeGreaterThan(50);
  });

  it('способность тратится ТОЛЬКО там, где записана в реестре', () => {
    const wired = GAME_FILES.filter((f) => /\buseAbility\s*\(/.test(code(`app/games/${f}`)));
    expect(wired.sort()).toEqual(Object.keys(SPENT_IN).sort());
  });

  it('реестр не ссылается на удалённые экраны', () => {
    const ghosts = [...Object.keys(SPENT_IN), ...Object.keys(FORBIDDEN)].filter((f) => !GAME_FILES.includes(f));
    expect(ghosts).toEqual([]);
  });

  it('экран не числится и подключённым, и запрещённым сразу', () => {
    expect(Object.keys(SPENT_IN).filter((f) => f in FORBIDDEN)).toEqual([]);
  });

  it('в каждом подключённом экране тратится ИМЕННО та способность, что записана', () => {
    for (const [file, id] of Object.entries(SPENT_IN)) {
      const src = code(`app/games/${file}`);
      expect(`${file}:${src.includes(`'${id}'`)}`).toBe(`${file}:true`);
    }
  });

  /** Судоку — чужой заход и отдельный разговор: способности туда не заходят вовсе. */
  it('судоку способностей не касается', () => {
    const sudoku = GAME_FILES.filter((f) => f.startsWith('sudoku'));
    expect(sudoku.length).toBeGreaterThan(0);
    for (const f of sudoku) expect(`${f}:${/abilities/.test(code(`app/games/${f}`))}`).toBe(`${f}:false`);
  });

  /**
   * ⚠️ ЗАМЕР НЕ ПОКУПАЕТСЯ. В замерных играх «вторая жизнь» запрещена: лишняя
   * попытка врёт прямо в спан. Проверяется поимённо, а не «нигде кроме мишеней».
   */
  it('второй жизни нет ни в одной замерной игре', () => {
    for (const f of ['digit-span.tsx', 'corsi.tsx', 'spatial-span.tsx']) {
      expect(`${f}:${code(`app/games/${f}`).includes("'second_life'")}`).toBe(`${f}:false`);
    }
  });

  it('вторая жизнь не двигает лестницу уровней', () => {
    const src = code('app/games/targets.tsx');
    // Подъём уровня закрыт признаком «в этой партии куплена жизнь».
    expect(/lvl\.reach\([^)]*\)/.test(src)).toBe(true);
    const reachLine = src.split('\n').find((l: string) => l.includes('lvl.reach(')) || '';
    expect(`заморозка в строке подъёма: ${reachLine.includes('ladderFrozenRef')}`).toBe('заморозка в строке подъёма: true');
    // И сам признак где-то ВЗВОДИТСЯ — иначе заморозка мертва.
    expect(/ladderFrozenRef\.current\s*=\s*true/.test(src)).toBe(true);
  });

  /**
   * ⚠️ ПРОБНЫЙ ЗАХОД ОБЯЗАН ЗАКРЫВАТЬ ЗАПИСЬ. Разбор идёт ДО записи сессии, и между
   * ними стоит развилка: без неё «партия не в зачёт» осталась бы надписью.
   */
  it.each(['digit-span.tsx', 'corsi.tsx', 'spatial-span.tsx'])('%s: пробный заход закрывает запись партии', (f) => {
    const src = code(`app/games/${f}`);
    const at = src.indexOf('await settlePracticeRun()');
    expect(`${f}: разбор есть`).toBe(at >= 0 ? `${f}: разбор есть` : `${f}: разбора нет`);
    const save = src.indexOf('saveSession(', at);
    expect(save).toBeGreaterThan(at);
    const between = src.slice(at, save);
    expect(`${f}: развилка между разбором и записью`).toBe(
      /if\s*\(\s*practice\s*\)/.test(between) ? `${f}: развилка между разбором и записью` : `${f}: развилки нет`,
    );
    // Решение принимается ДО партии и не в шаге зарядки.
    expect(/practiceRef\.current\s*=\s*!isPreset\s*&&/.test(src)).toBe(true);
  });
});

describe('способности видно: показ не выключен', () => {
  /**
   * 🔴 ЗАЧЕМ ЭТОТ БЛОК. Всё может быть написано, переведено и вызвано — и не
   * показываться, если условие показа константно ложно либо состояние не
   * присваивается. Обычные гейты такое пропускают по построению.
   */
  it('в магазине секция способностей рисуется и не выключена константой', () => {
    const shop = code('app/shop.tsx');
    expect(/ABILITIES\.map\(/.test(shop)).toBe(true);
    expect(/\{\s*false\s*&&/.test(shop)).toBe(false);
    // Условие показа секции опирается на фильтр категорий, а не на «никогда».
    expect(/\(!cat \|\| cat === 'ability'\)/.test(shop)).toBe(true);
    // Категория 'ability' есть в самом переключателе разделов — иначе фильтр не выбрать.
    expect(/\['ability',/.test(shop)).toBe(true);
  });

  it('остаток в магазине показывается всегда, включая ноль', () => {
    const shop = code('app/shop.tsx');
    const line = shop.split('\n').find((l: string) => l.includes("t('abilityInWallet')")) || '';
    expect(`строка остатка найдена: ${line.length > 0}`).toBe('строка остатка найдена: true');
    expect(`остаток не спрятан за условием: ${!/have\s*>\s*0\s*&&/.test(line)}`).toBe('остаток не спрятан за условием: true');
  });

  it('покупка в магазине доходит до кошелька, а не только до звука', () => {
    const shop = code('app/shop.tsx');
    expect(/buyAbility\(/.test(shop)).toBe(true);
    expect(/useAbility\(/.test(shop)).toBe(true);
    expect(/repairCheckInStreak\(/.test(shop)).toBe(true);
    // Списание проговаривается словами — молча очки уходить не должны.
    expect(/setNote\(/.test(shop)).toBe(true);
    expect(/t\('abilitySpentNote'\)/.test(shop)).toBe(true);
  });

  it('в мишенях предложение второй жизни и включается, и доходит до списания', () => {
    const src = code('app/games/targets.tsx');
    // Показ висит на состоянии, и это состояние где-то ВЗВОДИТСЯ.
    expect(/\{deathOffer \?/.test(src)).toBe(true);
    expect(/setDeathOffer\(true\)/.test(src)).toBe(true);
    // Кнопка позвана на обработчик, а обработчик доходит до траты.
    const btn = src.slice(src.indexOf("t('abilityLifeTake')") - 420, src.indexOf("t('abilityLifeTake')"));
    const handler = (btn.match(/onPress=\{(\w+)\}/) || [])[1] || '';
    expect(`обработчик кнопки: ${handler}`).toBe('обработчик кнопки: takeSecondLife');
    const body = src.slice(src.indexOf('const takeSecondLife'), src.indexOf('const declineSecondLife'));
    expect(`списание в теле обработчика: ${/useAbility\(/.test(body)}`).toBe('списание в теле обработчика: true');
    // Остаток виден ДО траты: строка кошелька рисуется без условия.
    const wallet = src.split('\n').find((l: string) => l.includes("t('abilityInWallet')")) || '';
    expect(`строка кошелька есть: ${wallet.length > 0}`).toBe('строка кошелька есть: true');
    expect(/\{\s*false\s*&&/.test(src)).toBe(false);
  });

  it.each(['digit-span.tsx', 'corsi.tsx', 'spatial-span.tsx'])('%s: переключатель пробного захода живой', (f) => {
    const src = code(`app/games/${f}`);
    expect(/setPracticeArmed\(/.test(src)).toBe(true);
    expect(/practiceArmed \? t\('abilityPracticeOn'\)/.test(src)).toBe(true);
    expect(/\{\s*false\s*&&/.test(src)).toBe(false);
    const wallet = src.split('\n').find((l: string) => l.includes("t('abilityInWallet')")) || '';
    expect(`${f}: остаток показан`).toBe(wallet.length > 0 ? `${f}: остаток показан` : `${f}: остатка нет`);
  });
});
