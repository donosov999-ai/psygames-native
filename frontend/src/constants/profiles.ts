/**
 * Profiles (v1.3.0, 2026-05-24)
 *
 * Personal profiles (Денис/Алекс/Валя/Юля/Гость) REMOVED from public app
 * per Денис: семья не должна светиться в коммерческой версии.
 *
 * The original Денис profile (full access to all 47 games) is preserved
 * as a themed profile under the alias **ODV999** — unlocked with a
 * master code (same one as NZT staticrypt: `963Alex963!@#$%^&*()`).
 *
 * All other public profiles are themed and require their own master codes
 * (chess/kids/vasilyeva/nzt48/drivers/seniors/execs/students). FREE is
 * the only no-code profile.
 */

import { GAMES } from '@/src/constants/games';
import type { PlaylistStep, Weekday } from '@/src/services/warmup';

export type ProfileId =
  | 'odv999'                                              // owner (Денис, full access, locked by master code)
  | 'chess' | 'kids' | 'vasilyeva' | 'nzt48' | 'free'    // themed batch 1 (commercial)
  | 'drivers' | 'seniors' | 'execs' | 'students';        // themed batch 2 (commercial)

/** UI grouping for Settings screen. All profiles are 'themed' since v1.3.0. */
export type ProfileGroup = 'personal' | 'themed';

export interface ProfileDef {
  id: ProfileId;
  person: string;             // exactly the value stored in cognitive_sessions.person
  display_name: string;
  emoji: string;
  color: string;
  /** One-line description for the profile card (visible in Settings). */
  description: string;
  /** Full description shown in Welcome modal and profile detail. Optional. */
  long_description?: string;
  /** "Кому подходит" badge — 1-2 words. */
  audience?: string;
  /** Typical session length. */
  session_minutes?: string;
  group?: ProfileGroup;       // default 'personal' if undefined (back-compat)
  allowed_games: 'all' | string[];   // 'all' = no filter, otherwise whitelist of game_ids
  custom_playlists?: Partial<Record<Weekday, PlaylistStep[]>>;
  warmup_enabled: boolean;
  financial_brain_day_enabled: boolean;
  assessment_enabled: boolean;
}


// ─── 🛠 ODV999 — Денис, locked by master code ────────────────────────────
// All 47 games unlocked. Master code = тот же что для NZT staticrypt.
// Раньше был personal profile "Денис"; в v1.3.0 переименован + переведён
// в themed (требует код) чтобы личные данные не светились публично.

const ODV999: ProfileDef = {
  id: 'odv999',
  person: 'ODV999',
  display_name: 'ODV999',
  emoji: '🛠',
  color: '#fbbf24',
  description: 'Все 47 игр · Зарядка · Financial · Assessment',
  long_description: 'Полный доступ ко всему приложению — все 47 игр, Утренняя Зарядка, Financial Brain Day, G1 Assessment. Для владельца программы (Денис, ODV999) и его доверенных лиц. Разблокируется одним мастер-кодом.',
  audience: 'Владелец · полный доступ',
  session_minutes: '5-40 мин',
  group: 'themed',
  allowed_games: 'all',
  warmup_enabled: true,
  financial_brain_day_enabled: true,
  assessment_enabled: true,
  // custom_playlists: undefined → use default Денис-era morning playlists
};

// ─── THEMED COMMERCIAL PROFILES (2026-05-17) ────────────────────────────
// Каждый = 9 игр под целевую аудиторию. По правилу: ровно 9 чтобы интерфейс
// не перегружал. Доступны под флагом group='themed' (UI группирует отдельно
// от личных Денис/Алекс/Валя/Юля).

// ─── 🏆 CHESS — Шахматисты ──────────────────────────────────────────────
// Расчёт ходов, spatial reasoning, sustained attention на длинных партиях.
const CHESS: ProfileDef = {
  id: 'chess',
  person: 'Шахматист',
  display_name: 'Шахматист',
  emoji: '♟',
  color: '#1f2937',
  description: 'Расчёт ходов · spatial · sustained attention',
  long_description: 'Тренировка ключевых для шахмат когнитивных функций: пространственное представление позиций (Mental Rotation), планирование ходов вперёд (Tower of London), удержание варианта расчёта (N-back), внимание на длинных партиях (CPT 4-12 мин). Подходит для турнирных шахматистов от 1500 ELO и тренеров.',
  audience: 'Шахматисты, тренеры, шахматные школы',
  session_minutes: '10-25 мин',
  group: 'themed',
  // v1.2.0 «1+1+1+1 + 5 темовых»: covers all 4 categories with 5-game bias on logic
  allowed_games: [
    // Base (1 per category)
    'corsi',             // memory — spatial WM forward (точнее для шахмат чем N-back)
    'cpt',               // attention — sustained на длинной партии
    'tower_london',      // logic — планирование 5+ ходов
    'choice_rt',         // action — скорость выбора между альтернативами
    // +5 темовых (bias на reasoning/spatial)
    'mental_rotation',   // spatial представление позиций
    'pattern',           // тактические паттерны
    'set_game',          // многомерные признаки
    'sudoku',            // логическая дедукция
    'schulte_table',     // сканирование доски
  ],
  warmup_enabled: true,
  financial_brain_day_enabled: false,
  assessment_enabled: true,
};

// ─── 👶 KIDS — Дети 7-12 лет ────────────────────────────────────────────
// Короткие сессии 3-5 мин, позитивное подкрепление, без сложных абстракций.
const KIDS: ProfileDef = {
  id: 'kids',
  person: 'Ребёнок',
  display_name: 'Дети 7-12',
  emoji: '🧒',
  color: '#10b981',
  description: 'Память · счёт · реакция · без сложных абстракций',
  long_description: 'Девять игр, которые ребёнок 7-12 лет понимает без объяснений: парные картинки, поиск отличий, Ханойская башня, устный счёт, Шульте, реакция на мишени, анаграммы. Сессии короткие (3-5 мин), с позитивным подкреплением и рекордами. Подходит для родителей, развивающих центров, начальной школы.',
  audience: 'Дети 7-12 лет, родители',
  session_minutes: '3-5 мин',
  group: 'themed',
  // v1.2.0 «1+1+1+1 + 5 темовых»: covers all 4 cats with 5-game bias on action (speed/math) for fun
  allowed_games: [
    // Base
    'picture_pairs',     // memory — классика
    'find_differences',  // attention — весело
    'hanoi',             // logic — наглядно
    'targets',           // action — реакция
    // +5 темовых (bias на счёт/реакцию — игровое)
    'memory_matrix',     // ещё память (visual)
    'schulte_table',     // ещё внимание (рекорды!)
    'anagrams',          // ещё логика (буквенные пазлы)
    'math_sprint',       // ещё action — счёт-гонка
    'counter',           // ещё action — устный счёт
  ],
  warmup_enabled: true,
  financial_brain_day_enabled: false,
  assessment_enabled: false,
};

// ─── 📖 VASILYEVA — Школа скорочтения Васильевой (Екб) ──────────────────
// Расширение поля зрения, скорость глаз, удержание прочитанного.
const VASILYEVA: ProfileDef = {
  id: 'vasilyeva',
  person: 'Скорочтение',
  display_name: 'Скорочтение',
  emoji: '📖',
  color: '#0ea5e9',
  description: 'Поле зрения · скорость глаз · удержание текста',
  long_description: 'Игры под методику школы скорочтения Васильевой (Екатеринбург). Расширение поля зрения (таблицы Шульте), быстрый scan (Visual Search), внимание к буквам (Proofreading, Anagrams), удержание прочитанного (Reading Span, Story Recall), беглость речи (Phonemic Fluency). Дополнение к курсу — не замена.',
  audience: 'Ученики курсов скорочтения, репетиторы',
  session_minutes: '8-12 мин',
  group: 'themed',
  // v1.2.0 «1+1+1+1 + 5 темовых»: bias on attention/speed для скорочтения
  allowed_games: [
    // Base
    'reading_span',      // memory — WM при чтении
    'schulte_table',     // attention — классика школ скорочтения
    'anagrams',          // logic — работа с буквами
    'sdmt',              // action — скорость обработки (символ→цифра)
    // +5 темовых (bias на attention + verbal)
    'visual_search',     // ещё внимание — быстрый scan
    'proofreading',      // ещё внимание — фокус на буквы
    'find_differences',  // ещё внимание — визуальная различительность
    'story_recall',      // ещё память — понимание текста
    'phonemic_fluency',  // ещё логика — беглость речи
  ],
  warmup_enabled: true,
  financial_brain_day_enabled: false,
  assessment_enabled: true,
};

// ─── 💊 NZT-48 — Полный когнитивный режим ────────────────────────────────
// Публичный аналог личной программы Дениса. Префронтальная батарея.
const NZT48: ProfileDef = {
  id: 'nzt48',
  person: 'NZT-48',
  display_name: 'NZT-48 (полный)',
  emoji: '💊',
  color: '#a855f7',
  description: 'Полная батарея префронталки · максимум',
  long_description: 'Публичный аналог личной программы Дениса. Девять самых научно-обоснованных тренажёров: Dual N-back (WM), CPT (sustained attention), Mental Rotation 3D (spatial), Stroop/Flanker (inhibition), Switching (flexibility), Tower of London (planning), SDMT (speed), BART (risk), Phonemic Fluency (verbal). Программа на 25-40 мин. Включает Financial Brain Day каждые 2 недели.',
  audience: 'Биохакеры, серьёзный когнитивный тренинг',
  session_minutes: '25-40 мин',
  group: 'themed',
  // v1.2.0 «1+1+1+1 + 5 темовых»: balanced full battery
  allowed_games: [
    // Base
    'n_back',                // memory — working memory (DUAL внутри)
    'cpt',                   // attention — sustained
    'tower_london',          // logic — planning
    'attention_conflict',    // action — inhibition (Stroop+Flanker hub)
    // +5 темовых (full prefrontal cortex battery)
    'mental_rotation',       // ещё logic — spatial
    'switching_task',        // ещё logic — cognitive flexibility
    'bart',                  // ещё logic — risk/decision
    'sdmt',                  // ещё action — processing speed
    'phonemic_fluency',      // ещё logic — verbal fluency
  ],
  warmup_enabled: true,
  financial_brain_day_enabled: true,
  assessment_enabled: true,
};

// ─── 🎁 FREE — Бесплатные/легкие игры (без подписки, без кода) ──────────
// Funnel-tier: показывает по 1 игре из каждой категории чтобы человек
// попробовал ценность. Премиум игры (CPT, Iowa, MR-3D, N-back DUAL) —
// под подпиской/кодом.
const FREE: ProfileDef = {
  id: 'free',
  person: 'Гость',           // generic visitor identifier in cognitive_sessions.person
  display_name: 'Free (без подписки)',
  emoji: '🎁',
  color: '#f59e0b',
  description: '9 базовых игр бесплатно · попробуй и реши',
  long_description: 'Стартовый набор без подписки и кода. По одной игре из каждой категории: Шульте (внимание), Парные картинки (память), Мишени (реакция), Математический спринт + Считалка, Поиск отличий, Анаграммы, Ханойская башня, N-back (рабочая память — облегчённая). Если зайдёт — попроси код у владельца программы для тематического профиля.',
  audience: 'Все · знакомство с приложением',
  session_minutes: '3-10 мин',
  group: 'themed',
  // v1.2.0 «1+1+1+1 + 5 темовых»: one game per category + funnel teasers
  allowed_games: [
    // Base
    'picture_pairs',     // memory — узнаваемая визуально
    'schulte_table',     // attention — классика
    'hanoi',             // logic — наглядная
    'math_sprint',       // action — счёт интуитивный
    // +5 темовых (по 1 ещё в каждой категории + 1 attention)
    'n_back',            // ещё memory — teaser для DUAL premium
    'find_differences',  // ещё attention — простая
    'anagrams',          // ещё logic — буквенные пазлы
    'counter',           // ещё action — устный счёт
    'targets',           // ещё action — реакция
  ],
  warmup_enabled: false,           // без зарядки в FREE — это hook на подписку
  financial_brain_day_enabled: false,
  assessment_enabled: false,
};

// ─── 🚗 DRIVERS — Водители / таксопарки ────────────────────────────────
// Sustained attention + reaction + peripheral processing.
const DRIVERS: ProfileDef = {
  id: 'drivers',
  person: 'Водитель',
  display_name: 'Водители',
  emoji: '🚗',
  color: '#3b82f6',
  description: 'Внимание · реакция · peripheral · скан',
  long_description: 'Тренировка ключевых для вождения функций: длительное внимание (CPT), быстрый scan (Visual Search, Find Differences), реакция выбора (Choice RT, Targets), торможение импульса (Attention Conflict), переключение между объектами (Trail Making), удержание контекста (N-back). Для автошкол, корпоративных программ для водителей, таксопарков.',
  audience: 'Автошколы, корпоративные программы, таксопарки',
  session_minutes: '12-15 мин',
  group: 'themed',
  // v1.2.0 «1+1+1+1 + 5 темовых»: bias on attention + reaction
  allowed_games: [
    // Base
    'n_back',             // memory — удержание контекста (зеркала, скорость)
    'cpt',                // attention — sustained на длинном маршруте
    'trail_making',       // logic — переключение между объектами
    'choice_rt',          // action — выбор направления реакции
    // +5 темовых (bias на attention + reaction = езда)
    'schulte_table',      // ещё attention — сканирование
    'visual_search',      // ещё attention — быстрый scan
    'find_differences',   // ещё attention — микро-различия
    'targets',            // ещё action — реакция на объекты
    'attention_conflict', // ещё action — тормозим импульс (опасность)
  ],
  warmup_enabled: true,
  financial_brain_day_enabled: false,
  assessment_enabled: true,
};

// ─── 👴 SENIORS — 50+ / профилактика деменции ──────────────────────────
// Память + processing speed + active aging. Без сложных WM-под-нагрузкой.
const SENIORS: ProfileDef = {
  id: 'seniors',
  person: '50+',
  display_name: '50+ профилактика',
  emoji: '👴',
  color: '#8b5cf6',
  description: 'Память · processing speed · замедление старения',
  long_description: 'Программа замедления когнитивного старения. Память (Picture Pairs, Memory Matrix, Word Pairs, Mnemonics), скорость обработки (SDMT — золотой стандарт), executive function (Trail Making A+B), внимание (Schulte), счёт в быту (Counter, Anagrams). Без сложных WM-под-нагрузкой. Подходит для самостоятельных занятий и медцентров.',
  audience: 'Люди 50-75+, медцентры, программы active aging',
  session_minutes: '10-15 мин',
  group: 'themed',
  // v1.2.0 «1+1+1+1 + 5 темовых»: bias on memory (профилактика деменции)
  allowed_games: [
    // Base
    'picture_pairs',     // memory — образная
    'schulte_table',     // attention — концентрация
    'mnemonics',         // logic — sequence memory (мнемоника = logic+memory)
    'sdmt',              // action — processing speed (золотой стандарт возраста)
    // +5 темовых (bias на память + executive — критично для 50+)
    'memory_matrix',     // ещё memory — visual
    'word_pairs',        // ещё memory — вербальная
    'trail_making',      // ещё logic — executive function
    'counter',           // ещё action — устный счёт (бытовой)
    'anagrams',          // ещё logic — vocab (когда много читали)
  ],
  warmup_enabled: true,
  financial_brain_day_enabled: false,
  assessment_enabled: true,
};

// ─── 💼 EXECS — Предприниматели / решения под давлением ────────────────
// Risk + multitasking + executive function под давлением.
const EXECS: ProfileDef = {
  id: 'execs',
  person: 'Предприниматель',
  display_name: 'Предприниматели',
  emoji: '💼',
  color: '#0f766e',
  description: 'Решения под давлением · risk · WM · flexibility',
  long_description: 'Тренировка качеств для бизнеса: оценка риска (BART, Iowa, PRL — три классические парадигмы), WM под нагрузкой (N-back DUAL), длительное внимание (CPT), торможение импульсов (Stroop/Flanker), multitasking (Switching), стратегическое планирование (Tower of London), распознавание трендов (Pattern). Включает Financial Brain Day каждые 2 недели.',
  audience: 'CEO, владельцы бизнеса, executive coaching',
  session_minutes: '15-25 мин',
  group: 'themed',
  // v1.2.0 «1+1+1+1 + 5 темовых»: bias on logic (decisions + risk)
  allowed_games: [
    // Base
    'n_back',            // memory — WM под нагрузкой (DUAL внутри)
    'cpt',               // attention — sustained на длинных созвонах
    'tower_london',      // logic — strategic planning
    'attention_conflict',// action — тормозить импульсивные решения
    // +5 темовых (bias на risk/decisions + flexibility)
    'bart',              // ещё logic — risk decision-making
    'iowa',              // ещё logic — long-term strategy
    'prl',               // ещё logic — reversal learning (меняющиеся правила)
    'switching_task',    // ещё logic — multitasking
    'math_sprint',       // ещё action — быстро считать в уме
  ],
  warmup_enabled: true,
  financial_brain_day_enabled: true,   // их домен
  assessment_enabled: true,
};

// ─── 🎓 STUDENTS — Студенты ЕГЭ/ОГЭ ────────────────────────────────────
// Фокус + память + скорость. Под подготовку к долгим экзаменам.
const STUDENTS: ProfileDef = {
  id: 'students',
  person: 'Студент',
  display_name: 'Студенты ЕГЭ',
  emoji: '🎓',
  color: '#f97316',
  description: 'Фокус · память · скорость · ЕГЭ/ОГЭ',
  long_description: 'Подготовка мозга к долгим экзаменам. Арифметика на скорость (Math Sprint, Counter), WM при чтении (Reading Span), удержание информации (Story Recall), концентрация (Schulte, N-back), распознавание паттернов (Pattern), вербальная гибкость (Anagrams), зрительная память (Memory Matrix). Подходит для самостоятельной подготовки и репетиторских центров.',
  audience: 'Школьники 10-11 классов, репетиторы',
  session_minutes: '10-15 мин',
  group: 'themed',
  // v1.2.0 «1+1+1+1 + 5 темовых»: bias on memory + action (скорость на экзамене)
  allowed_games: [
    // Base
    'reading_span',      // memory — WM при чтении (понимание текста)
    'schulte_table',     // attention — концентрация на длинном экзамене
    'pattern',           // logic — распознавание паттернов в задачах
    'math_sprint',       // action — быстрая арифметика
    // +5 темовых (bias на учебу: память + счёт)
    'n_back',            // ещё memory — WM формулы в голове
    'story_recall',      // ещё memory — удержание прочитанного
    'memory_matrix',     // ещё memory — зрительная (карты, схемы)
    'anagrams',          // ещё logic — вербальная гибкость
    'counter',           // ещё action — устный счёт
  ],
  warmup_enabled: true,
  financial_brain_day_enabled: false,
  assessment_enabled: true,
};

// ─── Export ─────────────────────────────────────────────────────────────

export const PROFILES: ProfileDef[] = [
  // Owner (Денис, full access, locked by master code)
  ODV999,
  // Themed batch 1 (commercial)
  CHESS, KIDS, VASILYEVA, NZT48, FREE,
  // Themed batch 2 (commercial)
  DRIVERS, SENIORS, EXECS, STUDENTS,
];

export const PROFILE_BY_ID: Record<ProfileId, ProfileDef> = PROFILES.reduce((acc, p) => {
  acc[p.id] = p;
  return acc;
}, {} as Record<ProfileId, ProfileDef>);

/** Profiles grouped for Settings UI */
export const PROFILES_BY_GROUP = {
  personal: PROFILES.filter(p => !p.group || p.group === 'personal'),
  themed:   PROFILES.filter(p => p.group === 'themed'),
};

export function isGameAllowed(profile: ProfileDef, gameId: string): boolean {
  if (profile.allowed_games === 'all') return true;
  return profile.allowed_games.includes(gameId);
}

export function filterAllowedGames(profile: ProfileDef) {
  if (profile.allowed_games === 'all') return GAMES;
  return GAMES.filter(g => (profile.allowed_games as string[]).includes(g.id));
}
