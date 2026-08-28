/**
 * progression — ЛИГИ И РАНГИ поверх уже существующего уровня.
 *
 * ЗАЧЕМ. Над играми у нас пусто: уровни живут внутри каждой игры отдельно, а общего
 * «куда я расту» нет. У конкурента (Octothink) это главный крючок — 22 ранга, шесть лиг,
 * 500+ наград, и именно он держит человека месяцами.
 *
 * ⚠️ ЧЕГО ЗДЕСЬ НАМЕРЕННО НЕТ — СОРЕВНОВАНИЯ. У них лига это турнирная таблица: попал в
 * двадцатку — поднялся. У нас в лидерборде СЕМЬ игроков (замер `psygames_leaderboard`
 * 10.08.2026). Турнирная таблица на семерых — витрина, которая врёт про масштаб, и
 * человек это видит с первого экрана. Поэтому лига здесь — СЕЗОННАЯ ЛИЧНАЯ ЦЕЛЬ: сколько
 * очков ты набрал за последние 30 дней. Это работает и в одиночку, и не станет ложью,
 * когда игроков будет тысяча — тогда рядом добавится и таблица.
 *
 * ⚠️ И ЛИГА НЕ ДУБЛИРУЕТ УРОВЕНЬ. Уровень (`services/tokens`, `levelInfo`) — это ВСЁ
 * накопленное за всё время, он только растёт и показывает пройденный путь. Лига — это
 * ТЕМП за последний месяц, она может и опуститься. Две разные вещи: «сколько я всего
 * прошёл» и «в какой я форме сейчас». Если бы лига считалась от тех же общих очков,
 * получились бы две одинаковые лестницы под разными именами.
 */

export type LeagueId =
  | 'seed' | 'spark' | 'focus' | 'flow' | 'edge' | 'peak'
  | 'super' | 'ultra' | 'legend' | 'limit';

export interface League {
  id: LeagueId;
  /** Очки за последние 30 дней, с которых начинается лига. */
  from: number;
  /** Ключ названия в словаре — переводится, как и всё остальное. */
  nameKey: string;
}

/**
 * Десять ступеней в двух поясах. Нижние шесть подобраны от реального темпа: одна
 * зарядка даёт порядка 60-120 очков, «Искра» — раз в неделю, «Поток» — почти каждый
 * день; они НЕ экспоненциальные, чтобы показать разницу «иногда/регулярно».
 *
 * 🔴 ВЕРХНИЕ ЧЕТЫРЕ ФАЗЫ — «саянские» (Денис 28.08): замер показал, что ядро-игрок
 * пробивает старый потолок в 14 раз (Валентина: 126 488 очков за 30 дней при
 * «Вершине» с 9 000) и лестница переставала что-либо мерить. Фазы растут
 * ЭКСПОНЕНЦИАЛЬНО нарочно — это пояс для тех, кому обычные ступени уже малы;
 * с рангами ×3 внутри каждой движение видно и там.
 */
export const LEAGUES: readonly League[] = [
  { id: 'seed',   from: 0,      nameKey: 'leagueSeed' },
  { id: 'spark',  from: 400,    nameKey: 'leagueSpark' },
  { id: 'focus',  from: 1200,   nameKey: 'leagueFocus' },
  { id: 'flow',   from: 2600,   nameKey: 'leagueFlow' },
  { id: 'edge',   from: 5000,   nameKey: 'leagueEdge' },
  { id: 'peak',   from: 9000,   nameKey: 'leaguePeak' },
  { id: 'super',  from: 15000,  nameKey: 'leagueSuper' },
  { id: 'ultra',  from: 40000,  nameKey: 'leagueUltra' },
  { id: 'legend', from: 100000, nameKey: 'leagueLegend' },
  { id: 'limit',  from: 250000, nameKey: 'leagueLimit' },
];

/** Сколько рангов внутри одной лиги. Ранг — дробление, чтобы движение было видно каждый день. */
export const RANKS_PER_LEAGUE = 3;

export interface Standing {
  league: League;
  /** 1..RANKS_PER_LEAGUE, где 1 — вход в лигу. */
  rank: number;
  /** Очки до следующего ранга. null — выше некуда. */
  toNext: number | null;
  /** 0..1 — заполнение до следующего ранга; для верхней ступени всегда 1. */
  progress: number;
}

/**
 * Положение по очкам за период. Чистая функция: ничего не читает и не пишет,
 * поэтому проверяется тестом напрямую и одинаково работает на любом экране.
 */
export function standingFor(seasonPoints: number): Standing {
  const pts = Math.max(0, Math.floor(seasonPoints));

  let idx = 0;
  for (let i = 0; i < LEAGUES.length; i++) if (pts >= LEAGUES[i].from) idx = i;
  const league = LEAGUES[idx];

  const next = LEAGUES[idx + 1];
  if (!next) return { league, rank: RANKS_PER_LEAGUE, toNext: null, progress: 1 };

  const span = next.from - league.from;
  const step = span / RANKS_PER_LEAGUE;
  const into = pts - league.from;
  const rank = Math.min(RANKS_PER_LEAGUE, Math.floor(into / step) + 1);
  const rankFloor = league.from + (rank - 1) * step;
  const toNext = Math.max(0, Math.ceil(rankFloor + step - pts));

  return { league, rank, toNext, progress: Math.min(1, (pts - rankFloor) / step) };
}

/** Открыта ли лига: показываем все, но недостигнутые — с замком, чтобы было видно, куда идти. */
export function isLeagueReached(id: LeagueId, seasonPoints: number): boolean {
  const l = LEAGUES.find((x) => x.id === id);
  return !!l && seasonPoints >= l.from;
}

/**
 * Именованные рамки-трофеи. Косметика с ИМЕНЕМ читается как трофей, безымянная — как
 * украшение: у конкурента рамки называются Triumph, Valor, Glory, и это работает
 * сильнее, чем «рамка №4». Выдаются за лигу — то есть за темп, а не за общий стаж.
 */
export interface Frame { id: string; nameKey: string; league: LeagueId }

export const FRAMES: readonly Frame[] = [
  { id: 'sprout',  nameKey: 'frameSprout',  league: 'seed' },
  { id: 'spark',   nameKey: 'frameSpark',   league: 'spark' },
  { id: 'compass', nameKey: 'frameCompass', league: 'focus' },
  { id: 'current', nameKey: 'frameCurrent', league: 'flow' },
  { id: 'blade',   nameKey: 'frameBlade',   league: 'edge' },
  { id: 'summit',  nameKey: 'frameSummit',  league: 'peak' },
  // Трофеи саянских фаз — по одному на форму, как и у нижнего пояса.
  { id: 'surge',    nameKey: 'frameSurge',    league: 'super' },
  { id: 'aurora',   nameKey: 'frameAurora',   league: 'ultra' },
  { id: 'crown',    nameKey: 'frameCrown',    league: 'legend' },
  { id: 'infinity', nameKey: 'frameInfinity', league: 'limit' },
];

/** Какие рамки заработаны при таком темпе. */
export function earnedFrames(seasonPoints: number): Frame[] {
  return FRAMES.filter((f) => isLeagueReached(f.league, seasonPoints));
}

/** Длина сезона. Месяц — достаточно, чтобы пропуск пары дней не обвалил лигу. */
export const SEASON_DAYS = 30;

export interface ScoredSession { score?: number; timestamp?: string }

/**
 * Очки сезона — сумма за последние SEASON_DAYS дней.
 *
 * Отдельно от чтения хранилища, чтобы проверялось тестом напрямую: расчёт «за период»
 * это ровно то место, где легко ошибиться на границе суток и не заметить.
 *
 * Записи без времени НЕ учитываем. Соблазн «считать их свежими» велик — так сезон
 * выглядит бодрее, — но это накрутка: старая партия без отметки времени подняла бы лигу
 * на пустом месте, и человек получил бы ступень, которую не проходил.
 */
export function seasonPointsFrom(sessions: readonly ScoredSession[], now: number = Date.now()): number {
  const from = now - SEASON_DAYS * 24 * 60 * 60 * 1000;
  let sum = 0;
  for (const s of sessions) {
    if (!s?.timestamp) continue;
    const t = Date.parse(s.timestamp);
    if (!Number.isFinite(t) || t < from || t > now) continue;   // будущее тоже мимо: часы устройства врут
    const score = Number(s.score);
    if (Number.isFinite(score) && score > 0) sum += score;
  }
  return Math.floor(sum);
}
