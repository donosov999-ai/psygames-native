/* psygames-recommend · VER 1 · 20.08.2026 */
/**
 * «РЕКОМЕНДУЕМ СЕГОДНЯ» — ПОВОД ОТКРЫТЬ ПРИЛОЖЕНИЕ И СРАЗУ НАЧАТЬ.
 *
 * 🔴 ЗАЧЕМ. В каталоге 71 упражнение. Человек, открывший главный экран, каждый раз
 * выбирает из семидесяти одного заново — а чаще не выбирает вовсе и запускает то же,
 * что вчера. Блок из трёх карточек снимает выбор: вот три упражнения на сегодня, и у
 * каждого сказано, ПОЧЕМУ именно оно.
 *
 * ⚠️ БЛОК БЕСПОЛЕЗЕН, ЕСЛИ РЕКОМЕНДУЕТ СЛУЧАЙНОЕ. Ротация по дате (как у вызова дня)
 * здесь не годится: она объяснима словом «сегодня», но человеку ничего не говорит о
 * НЁМ. Поэтому все четыре основания ниже опираются на его собственные партии, и у
 * каждого есть подпись в одну строку, которую можно проверить по данным:
 *
 *   comeback — «давно не играли»          : играл ≥2 раза, но последняя партия ≥14 дней назад
 *   growth   — «здесь вы растёте»          : последний результат ЛУЧШЕ предыдущего на той же задаче
 *   branch   — «ветке достаётся меньше»    : у категории самая низкая нагрузка за 30 дней
 *   fresh    — «новое в приложении»        : из реестра свежего, ещё ни разу не сыграно
 *   calm     — «под вечер — без гонки»     : восстановление, только вечером и ночью
 *   start    — «с чего начать»             : истории нет вовсе (новый человек)
 *
 * ⚠️ ТРИ ОГРАНИЧЕНИЯ, КАЖДОЕ ИЗ КОТОРЫХ УЖЕ ЛОМАЛОСЬ ИЛИ ЛОМАЕТСЯ МОЛЧА.
 *
 * 1. ТОЛЬКО РАЗРЕШЁННОЕ ПРОФИЛЕМ. Ровно эта течь была в дневном перерыве: набор
 *    собирался мимо `allowed_games`, и два упражнения из трёх раздавались людям,
 *    у которых их нет (см. `buildDayPlaylist` в warmup.ts — там `allow` был
 *    необязательным параметром, и его забыли передать). Здесь такой возможности нет
 *    ПО УСТРОЙСТВУ: функция принимает не список игр, а сам профиль, и фильтрует сама.
 *    Передать сюда нефильтрованный каталог невозможно — нечем.
 *
 * 2. У НОВОГО ЧЕЛОВЕКА ИСТОРИИ НЕТ, И ЭТО САМЫЙ ЧАСТЫЙ ПЕРВЫЙ ЗАХОД, а не редкий край.
 *    Выдуманных «примерных» данных здесь нет и быть не может: написать новичку «давно
 *    не играли» — значит соврать в первой же строке, которую он от нас прочитал.
 *    Пустая история уходит в отдельную ветку `start` с честной подписью «с чего начать».
 *
 * 3. НАБОР НЕ ДВИГАЕТСЯ В ПРЕДЕЛАХ ДНЯ. Список, который переезжает под рукой, читается
 *    как сбой. Поэтому отбор смотрит ТОЛЬКО на партии, законченные ДО начала сегодняшних
 *    суток: сколько бы человек ни сыграл сегодня, набор тот же. Ничьи (равные основания)
 *    разводит не `Math.random`, а сид от даты и профиля — тот же приём, что у вызова дня.
 *    Сыгранное сегодня всё же видно, но отдельным флагом `doneToday`, который меняет
 *    ПОДПИСЬ и не трогает состав: иначе карточка после партии продолжала бы уверять, что
 *    в эту игру давно не играли.
 *
 * ⚠️ ЕДИНСТВЕННОЕ, ЧТО МЕНЯЕТСЯ ВНУТРИ ДНЯ, — ВЕЧЕРНЯЯ ГРАНИЦА (18:00), и это решение,
 * а не дрожь. В 18:00 из набора вычёркивается бодрящее, а последний слот отдаётся
 * восстановлению. Репорт тестировщицы 18.08.2026 дословно: «это же вечерняя зарядка, а
 * зачем добавили время, когда есть время хочется сразу торопиться». Вечерний набор
 * задуман как успокоение, и рекомендовать в 22:00 стоп-сигнал или Iowa Gambling — то же
 * самое, что вернуть туда таймер.
 *
 * ⚠️ «БОДРЯЩЕЕ» ОПРЕДЕЛЕНО КАТЕГОРИЕЙ КАТАЛОГА, А НЕ СПИСКОМ ИГР ПОИМЁННО. Список из 71
 * строки протух бы на первой же новой игре — молча и в худшую сторону. Категории в
 * каталоге названы своими словами: `action` — «быстро и точно» (реакция, торможение,
 * счёт на время), `intuition` — риск и азарт (BART, Iowa, PRL). Обе поднимают возбуждение
 * по замыслу, обе вычёркиваются вечером. Заведут новую игру — она попадёт в категорию, и
 * правило подхватит её само.
 *
 * ⚠️ ВЕЧЕРНЯЯ КАРТОЧКА ОТКРЫВАЕТ УПРАЖНЕНИЕ В ТИХОМ РЕЖИМЕ (`calm=1`) — тем же флагом,
 * которым это делает вечерний шаг зарядки (`stepToParams`). Категория отсекает азарт, но
 * часы есть и у спокойных упражнений: Шульте вечером законен, а вот его секундомер — нет.
 * Флаг НЕ несёт ни `wu`, ни `auto`: это по-прежнему свободный запуск, уровни растут,
 * intro показывается (контракт точек входа — entry-points-contract.test.ts).
 */
import { GAMES, GameCategory, GameConfig, HUB_GAME_IDS, sessionTypeOf } from '@/src/constants/games';
import { ProfileDef, filterAllowedGames } from '@/src/constants/profiles';
import { freshGameIds, todayISO } from '@/src/constants/freshGames';
import {
  HistorySession, belongsToProfile, buildTrainingHistory,
} from '@/src/services/trainingHistory';
import { WarmupSlot, slotForHour } from '@/src/services/warmup';

/** Сколько карточек в блоке. Три — столько же, сколько в ряду практик рядом. */
export const RECO_COUNT = 3;

/** С какого перерыва упражнение считается заброшенным. */
export const RECO_STALE_DAYS = 14;

/** Окно, по которому меряется нагрузка ветки. */
export const RECO_BRANCH_WINDOW_DAYS = 30;

/**
 * Раз во сколько дней в блок пускается новинка.
 *
 * ⚠️ ПОЧЕМУ НЕ КАЖДЫЙ ДЕНЬ. Блок обещает «рекомендуем ВАМ», и новинка в нём каждый день
 * превращает обещание в рекламу собственной работы. Раз в три дня новое видно (реестр
 * свежего держит запись 90 дней — новинку покажет тридцать раз), а остальные два дня
 * блок говорит только про партии человека.
 */
export const RECO_FRESH_EVERY = 3;

/**
 * Что вечером не предлагаем. Обоснование — в шапке файла.
 * Список из ДВУХ КАТЕГОРИЙ, а не из игр: новая игра подхватится сама.
 */
export const RECO_EVENING_BANNED: readonly GameCategory[] = ['action', 'intuition'];

/**
 * Хабы-группы — меню, а не упражнения: сессию под своим id они не пишут никогда.
 *
 * ⚠️ ЗАЧЕМ ИСКЛЮЧАТЬ. Рекомендация обязана быть проверяемой по данным. У хаба счётчик
 * партий вечно равен нулю — человек играет «Охват», а закончившаяся партия записывается
 * как `digit_span`. Значит «ветке достаётся меньше всего» показывалось бы на хабе вечно и
 * не гасло бы даже после десяти партий. Тот же отсев по той же причине сделан у вызова
 * дня (`eligibleGames` в daily-challenge.ts).
 *
 * ⚠️ СПИСОК ВЫВОДИТСЯ ИЗ КАТАЛОГА, А НЕ ПЕРЕЧИСЛЕН ЗДЕСЬ. Раньше здесь стояли два
 * имени строками, и такой же список лежал ещё в четырёх местах. Третий хаб (судоку,
 * 20.08.2026) обязан был попасть во все пять; забытая копия отдала бы человеку меню
 * под подписью «этой ветке достаётся меньше всего» — и не погасла бы никогда.
 */
export const RECO_GROUP_HUBS: readonly string[] = HUB_GAME_IDS;

/**
 * С чего начинает тот, у кого истории нет. Порядок = порядок показа.
 *
 * ⚠️ ПЕРВЫЕ ДВЕ ДОСТУПНЫ ВСЕГДА. `picture_pairs` и `breathing` входят в ALWAYS_ALLOWED
 * профилей, то есть новичок получит непустой набор в ЛЮБОМ профиле, даже в самом узком.
 * Остальные — обычные игры, каждая отсеивается по `allowed_games` как все.
 *
 * Отбор внутри списка: понятное без объяснений (парные картинки), классика, которую
 * человек ищет по названию (Шульте), и знакомая всем головоломка.
 *
 * ⚠️ ЗДЕСЬ СТОЯЛО `sudoku`, И 20.08.2026 ОНО УМЕРЛО БЫ МОЛЧА. Судоку переехала под
 * карточку-развилку и стала `hideFromMenu`, а набор собирается из пула, откуда
 * скрытое вычеркнуто первой же строкой. Имя осталось бы в списке, выглядело бы
 * рабочим и не выдавалось бы никогда. Головоломку заменила ханойская башня — такая
 * же узнаваемая классика, и она в пуле. Живучесть каждого имени в этом списке теперь
 * проверяется прогоном (sudoku-hub.test.ts), чтобы следующая такая смерть краснела.
 */
export const RECO_STARTERS: readonly string[] = [
  'picture_pairs', 'schulte_table', 'hanoi', 'memory_matrix', 'breathing',
];

/** Почему упражнение попало в блок. */
export type RecoReason = 'comeback' | 'growth' | 'branch' | 'fresh' | 'calm' | 'start';

/** Ключ словаря для подписи каждого основания. */
export const RECO_REASON_KEY: Readonly<Record<RecoReason, string>> = {
  comeback: 'recoWhyComeback',
  growth:   'recoWhyGrowth',
  branch:   'recoWhyBranch',
  fresh:    'recoWhyFresh',
  calm:     'recoWhyCalm',
  start:    'recoWhyStart',
};

export interface RecoPick {
  gameId: string;
  reason: RecoReason;
  /** Ключ подписи — гейт сверяет его со словарём механически, а не по памяти. */
  reasonKey: string;
  /**
   * Сколько дней прошло с последней партии этого упражнения (`null` — не играли вовсе).
   * Разметка это число не рисует: «14 дней» на двенадцати языках — это склонения,
   * которых у нас нет. Поле держит ДОКАЗАТЕЛЬСТВО подписи: гейт проверяет им, что
   * «давно не играли» сказано про реально заброшенное, а не подписано наугад.
   */
  daysSince: number | null;
  /** Сыграно сегодня. На состав НЕ влияет — только на подпись (см. шапку, ограничение 3). */
  doneToday: boolean;
}

export interface RecoInput {
  profile: ProfileDef;
  /** Весь локальный массив партий — фильтрацию по профилю делаем сами. */
  sessions: readonly HistorySession[];
  now?: Date;
  /** Подмена реестра свежего — для гейтов; в приложении не передаётся. */
  freshIds?: readonly string[];
}

/** Начало сегодняшних суток по местным часам — та же нарезка, что у календаря серии. */
function startOfLocalDay(now: Date): number {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

/**
 * Сид дня. От ДАТЫ и ПРОФИЛЯ: набор не должен ни дёргаться внутри дня, ни совпадать
 * у всех профилей на одном устройстве. FNV-1a — чтобы соседние даты не давали соседние
 * числа (иначе «ничьи» разводились бы по кругу и это было бы заметно).
 */
export function recoSeed(dateKey: string, profileId: string): number {
  let h = 2166136261;
  const s = `${dateKey}|${profileId}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const MS_DAY = 86400000;

/** Партии, пригодные для отбора: есть игра, есть разбираемое время, наш профиль. */
function usable(sessions: readonly HistorySession[], profileId: string): { s: HistorySession; t: number }[] {
  const out: { s: HistorySession; t: number }[] = [];
  for (const s of sessions) {
    if (!s.game_type || !belongsToProfile(s, profileId)) continue;
    const t = s.timestamp ? Date.parse(s.timestamp) : NaN;
    if (Number.isFinite(t)) out.push({ s, t });
  }
  return out;
}

/**
 * ГЛАВНАЯ ФУНКЦИЯ. Возвращает до `RECO_COUNT` карточек; меньше — только если профиль
 * разрешает совсем мало игр. Пустой массив означает «показывать нечего», и разметка
 * обязана в этом случае не рисовать блок вовсе (пустая рамка читается как поломка).
 */
export function recommendToday(input: RecoInput): RecoPick[] {
  const now = input.now ?? new Date();
  const { profile } = input;
  const slot = slotForHour(now.getHours());
  const evening = slot === 'evening' || slot === 'night';
  const dayStart = startOfLocalDay(now);
  const seed = recoSeed(
    `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`,
    profile.id,
  );

  // ── 1. ЧТО ВООБЩЕ МОЖНО ПРЕДЛОЖИТЬ ────────────────────────────────────────────
  // Фильтр по профилю стоит ПЕРВЫМ и внутри функции: см. ограничение 1 в шапке.
  const hubs = new Set(RECO_GROUP_HUBS);
  const pool = filterAllowedGames(profile).filter((g) => !g.hideFromMenu && !hubs.has(g.id));
  const byId = new Map<string, GameConfig>(pool.map((g) => [g.id, g]));
  if (pool.length === 0) return [];

  // ── 2. ДАННЫЕ ЧЕЛОВЕКА, ОТСЕЧЁННЫЕ НА НАЧАЛО СУТОК ────────────────────────────
  const mine = usable(input.sessions, profile.id);
  const before = mine.filter((x) => x.t < dayStart);
  const playedToday = new Set(mine.filter((x) => x.t >= dayStart).map((x) => x.s.game_type as string));

  const plays = new Map<string, number>();
  const lastAt = new Map<string, number>();
  for (const { s, t } of before) {
    const id = s.game_type as string;
    plays.set(id, (plays.get(id) ?? 0) + 1);
    if (t > (lastAt.get(id) ?? -Infinity)) lastAt.set(id, t);
  }
  const daysSince = (id: string): number | null => {
    const t = lastAt.get(id);
    return t === undefined ? null : Math.floor((dayStart - t) / MS_DAY);
  };

  // Ничьи разводит сид, а не порядок в каталоге: иначе «самая незанятая ветка» вечно
  // отдавала бы одну и ту же первую игру.
  const shuffled = pool
    .map((g, i) => ({ g, k: recoSeed(g.id, String(seed + i)) }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.g);
  const order = new Map<string, number>(shuffled.map((g, i) => [g.id, i]));
  const tie = (a: string, b: string) => (order.get(a) ?? 0) - (order.get(b) ?? 0);

  const okEvening = (id: string): boolean => {
    const g = byId.get(id);
    return !!g && (!evening || !RECO_EVENING_BANNED.includes(g.category));
  };

  // ── 3. ОСНОВАНИЯ ──────────────────────────────────────────────────────────────

  /** «Давно не играли»: играл ≥2 раза (одна проба — это не привычка) и бросил ≥14 дней. */
  const comeback = pool
    .map((g) => g.id)
    .filter((id) => (plays.get(id) ?? 0) >= 2 && (daysSince(id) ?? 0) >= RECO_STALE_DAYS)
    .sort((a, b) => ((daysSince(b) ?? 0) - (daysSince(a) ?? 0))
      || ((plays.get(b) ?? 0) - (plays.get(a) ?? 0))
      || tie(a, b));

  /**
   * «Здесь вы растёте»: последняя партия оказалась ЛУЧШЕ предыдущей на ТОЙ ЖЕ задаче.
   * Считает это не наш код, а `buildTrainingHistory` — там уже учтено и направление
   * «лучше» у каждой метрики (у Шульте это МЕНЬШЕ секунд), и то, что 5×5 и 6×6 —
   * разные задачи. Дублировать это правило здесь значило бы завести вторую копию,
   * которая разойдётся с первой на следующей же игре.
   *
   * Берётся ПОСЛЕДНЯЯ запись каждого упражнения — дни идут от новых к старым.
   * Рост, случившийся месяц назад и с тех пор не подтверждённый, — не «растёте», а
   * «давно не играли», и туда он и уходит.
   *
   * ⚠️ ЧУЖОЙ РОСТ СЮДА УЖЕ ПОПАДАЛ. Пока самурай писал партии в корзину `sudoku`, его
   * успешная партия приходила отсюда под именем классической судоку — и блок звал
   * человека на обычную доску со словами «здесь вы растёте», хотя рос он на поле
   * 21×21. Чинится не здесь: `buildTrainingHistory` теперь называет игру разбором
   * записи (`entryGame`), а самурая в пуле нет — он скрыт за развилкой.
   */
  const growth: string[] = [];
  {
    const seen = new Set<string>();
    for (const day of buildTrainingHistory(before.map((x) => x.s), { maxDays: 0 })) {
      for (const e of day.entries) {
        if (seen.has(e.gameType)) continue;
        seen.add(e.gameType);
        if (e.verdict !== 'better' || !byId.has(e.gameType)) continue;
        if ((daysSince(e.gameType) ?? Infinity) >= RECO_STALE_DAYS) continue;
        growth.push(e.gameType);
      }
    }
  }

  /**
   * «Этой ветке достаётся меньше всего».
   *
   * ⚠️ НАГРУЗКА ДЕЛИТСЯ НА ЧИСЛО ИГР В ВЕТКЕ. Без деления «самой заброшенной» вечно
   * оказывалось бы восстановление: в нём ОДНА игра против двадцати двух в памяти, и
   * сырой счётчик партий у него ниже всегда, сколько бы человек ни дышал. Делим — и
   * сравнение становится честным: «сколько внимания досталось ветке на одно её
   * упражнение».
   */
  const branch: string[] = [];
  {
    const windowStart = dayStart - RECO_BRANCH_WINDOW_DAYS * MS_DAY;
    const inCat = new Map<GameCategory, string[]>();
    for (const g of shuffled) {
      const list = inCat.get(g.category);
      if (list) list.push(g.id); else inCat.set(g.category, [g.id]);
    }
    /**
     * ⚠️ НАГРУЗКУ СЧИТАЕМ ПО ВСЕМУ КАТАЛОГУ, А ПРЕДЛАГАЕМ — ТОЛЬКО ИЗ ПУЛА. Это разные
     * вопросы, и мерить их одним списком нельзя.
     *
     * Первая редакция считала только партии игр ИЗ ПУЛА — и не видела тренировок,
     * сделанных через хаб: человек заходит в «Охват», играет ряд цифр, а партия пишется
     * как `digit_span`, которого в меню нет (`hideFromMenu`). Для счётчика памяти такой
     * человек — «не тренировал память ни разу», и блок каждый день звал бы его туда,
     * куда он и так ходит ежедневно.
     *
     * Знаменатель при этом остаётся размером ПУЛА: он отвечает на другой вопрос —
     * сколько упражнений этой ветки мы вообще можем предложить.
     */
    /**
     * ⚠️ КЛЮЧ КАРТЫ — ТОТ, ПОД КОТОРЫМ ИГРА ПИШЕТ ПАРТИЮ, А НЕ ЕЁ `id`. У большинства
     * карточек это одно и то же, у двух судоку — нет: обе лежат в каталоге через дефис
     * (`sudoku-fractal`, `sudoku-samurai`), а партии пишут через подчёркивание. У
     * фрактальной из-за одного символа тренировки не попадали в нагрузку ветки ВООБЩЕ
     * — человек, играющий её каждый день, для этого блока логику не тренировал ни разу.
     * Ровно та же беда, что уже чинилась выше для игр, спрятанных за хабом, только тише.
     */
    const catOf = new Map<string, GameCategory>(GAMES.map((g) => [sessionTypeOf(g), g.category]));
    const load = new Map<GameCategory, number>();
    for (const { s, t } of before) {
      if (t < windowStart) continue;
      const c = catOf.get(s.game_type as string);
      if (c === undefined || !inCat.has(c)) continue;   // ветки нет в профиле — сравнивать не с чем
      load.set(c, (load.get(c) ?? 0) + 1);
    }
    const cats = [...inCat.keys()].sort((a, b) => {
      const la = (load.get(a) ?? 0) / (inCat.get(a) as string[]).length;
      const lb = (load.get(b) ?? 0) / (inCat.get(b) as string[]).length;
      return la - lb || tie((inCat.get(a) as string[])[0], (inCat.get(b) as string[])[0]);
    });
    /**
     * ⚠️ ВНУТРИ ВЕТКИ ВЫКЛАДЫВАЕМ ВСЕ ЕЁ УПРАЖНЕНИЯ, А НЕ ОДНО, И ТОЛЬКО ПОТОМ ПЕРЕХОДИМ
     * К СЛЕДУЮЩЕЙ ВЕТКЕ. Первая редакция брала по одному упражнению из каждой ветки — и
     * когда других оснований не находилось (человек играет ровно и помногу), добор
     * вытаскивал вторую и третью карточку из ВТОРОЙ и ТРЕТЬЕЙ по обделённости веток,
     * подписывая их «этой ветке достаётся меньше всего». Для второй это уже неправда.
     * Поймано исполнением: гейт показал `targets` (скорость) под этой подписью при том,
     * что обделена была память.
     *
     * Теперь добор берёт следующие упражнения ТОЙ ЖЕ обделённой ветки, и подпись остаётся
     * верной для каждой карточки. К следующей ветке переходим только когда в этой не
     * осталось непоказанного.
     */
    for (const c of cats) {
      const games = (inCat.get(c) as string[]).slice()
        .sort((a, b) => ((plays.get(a) ?? 0) - (plays.get(b) ?? 0)) || tie(a, b));
      branch.push(...games);
    }
  }

  /** «Новое в приложении» — и только то, во что человек ещё ни разу не играл. */
  const fresh = seed % RECO_FRESH_EVERY === 0
    ? (input.freshIds ?? freshGameIds(todayISO(now)))
      .filter((id) => byId.has(id) && (plays.get(id) ?? 0) === 0)
    : [];

  /** «С чего начать» — только для того, у кого партий нет вовсе. */
  const start = before.length === 0
    ? [...RECO_STARTERS.filter((id) => byId.has(id)), ...branch]
    : [];

  // ── 4. СБОРКА ─────────────────────────────────────────────────────────────────
  // По одному основанию на карточку, в фиксированном порядке — чтобы блок не оказался
  // тремя «ветке достаётся меньше» подряд. Что не добрали — добираем тем же порядком.
  const sources: { reason: RecoReason; ids: string[] }[] = start.length > 0
    ? [{ reason: 'start', ids: start }]
    : [
      { reason: 'comeback', ids: comeback },
      { reason: 'growth',   ids: growth },
      { reason: 'fresh',    ids: fresh },
      { reason: 'branch',   ids: branch },
    ];

  const picks: RecoPick[] = [];
  const taken = new Set<string>();
  // Вечером последний слот занимает восстановление — см. шапку.
  const calmSlot = evening ? 1 : 0;
  const limit = Math.max(0, RECO_COUNT - calmSlot);

  const add = (id: string, reason: RecoReason): boolean => {
    if (taken.has(id) || !byId.has(id) || !okEvening(id)) return false;
    taken.add(id);
    picks.push({
      gameId: id,
      reason,
      reasonKey: RECO_REASON_KEY[reason],
      daysSince: daysSince(id),
      doneToday: playedToday.has(id),
    });
    return true;
  };

  for (const src of sources) {
    if (picks.length >= limit) break;
    for (const id of src.ids) if (add(id, src.reason)) break;
  }
  for (const src of sources) {
    for (const id of src.ids) {
      if (picks.length >= limit) break;
      add(id, src.reason);
    }
  }

  if (calmSlot > 0) {
    // Самая незанятая игра восстановления. Сегодня она одна (дыхание) и разрешена в
    // любом профиле; появится вторая — сид разведёт их между вечерами сам.
    const calm = shuffled
      .filter((g) => g.category === 'recovery' && !taken.has(g.id))
      .sort((a, b) => ((plays.get(a.id) ?? 0) - (plays.get(b.id) ?? 0)) || tie(a.id, b.id))[0];
    // Восстановления в профиле нет — слот не пропадает, его добирает общий список.
    if (!calm || !add(calm.id, 'calm')) {
      for (const src of sources) {
        for (const id of src.ids) {
          if (picks.length >= RECO_COUNT) break;
          add(id, src.reason);
        }
      }
    }
  }

  return picks.slice(0, RECO_COUNT);
}

/**
 * С какими параметрами открывать упражнение из блока.
 *
 * Свободный запуск (ни `wu`, ни `auto`): уровни растут, intro показывается — контракт
 * точек входа. Вечером добавляется `calm=1` — тот же флаг тихого шага, что ставит
 * `stepToParams` вечерней зарядке: он убирает обратный отсчёт и глушит писк.
 */
export function recoParams(now: Date = new Date()): Record<string, string> {
  const slot: WarmupSlot = slotForHour(now.getHours());
  return slot === 'evening' || slot === 'night' ? { calm: '1' } : {};
}

/** Карточки вместе с их описанием из каталога — разметке больше ничего не нужно. */
export function recoCards(input: RecoInput): { pick: RecoPick; game: GameConfig }[] {
  const all = new Map(GAMES.map((g) => [g.id, g]));
  return recommendToday(input)
    .map((pick) => ({ pick, game: all.get(pick.gameId) as GameConfig }))
    .filter((x) => !!x.game);
}
