/**
 * E1 — Profile gating × 5
 *
 * 5 user profiles each with their own:
 *   - allowed_games (whitelist) — каталог фильтруется на главной
 *   - morning playlists (per weekday) — Утренняя Зарядка под профиль
 *   - color/avatar — для UI
 *   - assessment/streak/history isolated by `person` field in cognitive_sessions
 *
 * Person identifier is used in localStorage namespacing AND Supabase rows
 * (column `person`).
 */

import { GAMES } from '@/src/constants/games';
import type { PlaylistStep, Weekday } from '@/src/services/warmup';

export type ProfileId =
  | 'denis' | 'alex' | 'valya' | 'yulya' | 'guest'       // personal (existing)
  | 'chess' | 'kids' | 'vasilyeva' | 'nzt48' | 'free'    // themed (2026-05-17 commercial, batch 1)
  | 'drivers' | 'seniors' | 'execs' | 'students';        // themed batch 2 (commercial)

/** UI grouping for Settings screen */
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

// ─── Денис: full access (default) ────────────────────────────────────────

const DENIS: ProfileDef = {
  id: 'denis',
  person: 'Денис',
  display_name: 'Денис',
  emoji: '👨‍💼',
  color: '#fbbf24',
  description: 'Бизнес/инжиниринг · 44 игры · 3 спец-режима',
  allowed_games: 'all',
  warmup_enabled: true,
  financial_brain_day_enabled: true,
  assessment_enabled: true,
  // custom_playlists: undefined → use default morning playlists
};

// ─── Алекс (7 лет): kid-safe ────────────────────────────────────────────

const ALEX_SAFE_GAMES = [
  'picture_pairs', 'find_differences', 'word_pairs',
  'memory_matrix', 'corsi', 'digit_span',
  'schulte_table', 'pattern',
  'hanoi', 'math_sprint', 'choice_rt', 'targets',
];

const ALEX: ProfileDef = {
  id: 'alex',
  person: 'Алекс',
  display_name: 'Алекс',
  emoji: '👦',
  color: '#22c55e',
  description: '7 лет · 12 безопасных игр · 3-4 мин зарядка',
  allowed_games: ALEX_SAFE_GAMES,
  warmup_enabled: true,
  financial_brain_day_enabled: false,
  assessment_enabled: false,    // assessment battery has CPT/N-back/BART — not for kid
  custom_playlists: {
    1: [   // ПН
      { game_id: 'schulte_table',  game_route: '/games/schulte',         difficulty: 'easy', mode: '4x4',          est_duration_sec: 50 },
      { game_id: 'picture_pairs',  game_route: '/games/picture-pairs',   difficulty: 'easy', mode: '6 pairs',      est_duration_sec: 70 },
      { game_id: 'word_pairs',     game_route: '/games/word-pairs',      difficulty: 'easy', mode: '4 pairs',      est_duration_sec: 60 },
      { game_id: 'math_sprint',    game_route: '/games/math-sprint',     difficulty: 'easy', mode: '30s',          est_duration_sec: 35 },
    ],
    2: [   // ВТ
      { game_id: 'find_differences',game_route: '/games/find-differences',difficulty: 'easy', mode: '4 diffs',      est_duration_sec: 90 },
      { game_id: 'digit_span',     game_route: '/games/digit-span',      difficulty: 'easy', mode: 'forward',      est_duration_sec: 60 },
      { game_id: 'pattern',        game_route: '/games/pattern',         difficulty: 'easy', trials: 5,            est_duration_sec: 70 },
      { game_id: 'choice_rt',      game_route: '/games/choice-rt',       difficulty: 'easy', trials: 10, mode: '2dir', est_duration_sec: 40 },
    ],
    3: [],    // СР rest
    4: [   // ЧТ
      { game_id: 'corsi',          game_route: '/games/corsi',           difficulty: 'easy', mode: 'forward',      est_duration_sec: 60 },
      { game_id: 'memory_matrix',  game_route: '/games/memory-matrix',   difficulty: 'easy', mode: '3x3',          est_duration_sec: 60 },
      { game_id: 'hanoi',          game_route: '/games/hanoi',           difficulty: 'easy', mode: '3 disks',      est_duration_sec: 90 },
      { game_id: 'math_sprint',    game_route: '/games/math-sprint',     difficulty: 'easy', mode: '30s',          est_duration_sec: 35 },
    ],
    5: [   // ПТ
      { game_id: 'pattern',        game_route: '/games/pattern',         difficulty: 'easy', trials: 5,            est_duration_sec: 70 },
      { game_id: 'schulte_table',  game_route: '/games/schulte',         difficulty: 'easy', mode: '4x4',          est_duration_sec: 50 },
      { game_id: 'picture_pairs',  game_route: '/games/picture-pairs',   difficulty: 'easy', mode: '6 pairs',      est_duration_sec: 70 },
      { game_id: 'targets',        game_route: '/games/targets',         difficulty: 'easy', mode: '30s',          est_duration_sec: 35 },
    ],
    6: [   // СБ
      { game_id: 'hanoi',          game_route: '/games/hanoi',           difficulty: 'easy', mode: '3 disks',      est_duration_sec: 90 },
      { game_id: 'pattern',        game_route: '/games/pattern',         difficulty: 'easy', trials: 5,            est_duration_sec: 70 },
      { game_id: 'corsi',          game_route: '/games/corsi',           difficulty: 'easy', mode: 'forward',      est_duration_sec: 60 },
      { game_id: 'word_pairs',     game_route: '/games/word-pairs',      difficulty: 'easy', mode: '4 pairs',      est_duration_sec: 60 },
    ],
    0: [],    // ВС rest (играет с папой в Go)
  },
};

// ─── Валя: курс/тексты/память ───────────────────────────────────────────

const VALYA_GAMES = [
  // memory + verbal — её приоритет (писала курс)
  'word_pairs', 'mnemonics', 'reading_span', 'story_recall', 'phonemic_fluency', 'anagrams',
  // attention для собранности
  'schulte_table', 'find_differences', 'visual_search',
  // social для отношений и преподавания
  'rmet', 'stroop_emotional',
  // logic общая
  'pattern', 'set_game', 'mental_rotation', 'sudoku',
  // workout
  'memory_matrix', 'picture_pairs', 'corsi', 'digit_span',
  // light control
  'stroop', 'go_no_go', 'flanker',
  // math/speed light
  'math_sprint', 'number_bonds', 'choice_rt', 'targets',
];

const VALYA: ProfileDef = {
  id: 'valya',
  person: 'Валя',
  display_name: 'Валя',
  emoji: '💃',
  color: '#ec4899',
  description: 'Курс/тексты/отношения · акцент memory + verbal + social',
  allowed_games: VALYA_GAMES,
  warmup_enabled: true,
  financial_brain_day_enabled: false,   // не её домен
  assessment_enabled: true,
  custom_playlists: {
    1: [   // ПН — мягкий вход
      { game_id: 'schulte_table',  game_route: '/games/schulte',         difficulty: 'easy',   mode: '5x5',          est_duration_sec: 60 },
      { game_id: 'word_pairs',     game_route: '/games/word-pairs',      difficulty: 'easy',   mode: '6 pairs',      est_duration_sec: 90 },
      { game_id: 'math_sprint',    game_route: '/games/math-sprint',     difficulty: 'easy',   mode: '30s',          est_duration_sec: 35 },
    ],
    2: [   // ВТ — память
      { game_id: 'mnemonics',      game_route: '/games/mnemonics',       difficulty: 'medium', mode: 'words',        est_duration_sec: 120 },
      { game_id: 'corsi',          game_route: '/games/corsi',           difficulty: 'medium', mode: 'forward',      est_duration_sec: 80 },
      { game_id: 'phonemic_fluency',game_route: '/games/phonemic-fluency',difficulty: 'medium', mode: '60s',          est_duration_sec: 70 },
    ],
    3: [],   // СР rest
    4: [   // ЧТ — verbal/social
      { game_id: 'reading_span',   game_route: '/games/reading-span',    difficulty: 'medium', mode: '3-set',        est_duration_sec: 120 },
      { game_id: 'rmet',           game_route: '/games/rmet',            difficulty: 'medium', mode: '9t',           est_duration_sec: 90 },
      { game_id: 'find_differences',game_route: '/games/find-differences',difficulty: 'easy',   mode: '4 diffs',      est_duration_sec: 90 },
    ],
    5: [   // ПТ — внимание + control
      { game_id: 'visual_search',  game_route: '/games/visual-search',   difficulty: 'easy',   trials: 5,            est_duration_sec: 80 },
      { game_id: 'stroop_emotional',game_route: '/games/stroop-emotional',difficulty: 'medium', trials: 18,           est_duration_sec: 100 },
      { game_id: 'pattern',        game_route: '/games/pattern',         difficulty: 'easy',   trials: 5,            est_duration_sec: 70 },
    ],
    6: [   // СБ — logic
      { game_id: 'sudoku',         game_route: '/games/sudoku',          difficulty: 'easy',   mode: '6x6',          est_duration_sec: 240 },
      { game_id: 'set_game',       game_route: '/games/set-game',        difficulty: 'medium', trials: 6,            est_duration_sec: 120 },
      { game_id: 'story_recall',   game_route: '/games/story-recall',    difficulty: 'medium', mode: 'standard',     est_duration_sec: 240 },
    ],
    0: [],   // ВС rest
  },
};

// ─── Юля: гибкий default (без специфической стратегии — общая поддержка) ─

const YULYA_GAMES = [
  'word_pairs', 'mnemonics', 'memory_matrix', 'picture_pairs', 'corsi', 'digit_span',
  'schulte_table', 'proofreading', 'find_differences', 'visual_search',
  'pattern', 'set_game', 'mental_rotation', 'sudoku', 'anagrams',
  'stroop', 'go_no_go', 'flanker', 'switching_task',
  'math_sprint', 'number_bonds', 'counter',
  'choice_rt', 'targets', 'sdmt',
  'phonemic_fluency', 'rmet', 'story_recall',
];

const YULYA: ProfileDef = {
  id: 'yulya',
  person: 'Юля',
  display_name: 'Юля',
  emoji: '🌸',
  color: '#a855f7',
  description: 'Общий тренинг мозга · сбалансированная программа',
  allowed_games: YULYA_GAMES,
  warmup_enabled: true,
  financial_brain_day_enabled: false,
  assessment_enabled: true,
  // custom_playlists: undefined → uses default Денис's playlists (но с фильтром по allowed_games)
};

// ─── Гость: minimal demo ────────────────────────────────────────────────

const GUEST: ProfileDef = {
  id: 'guest',
  person: 'Гость',
  display_name: 'Гость',
  emoji: '👤',
  color: '#94a3b8',
  description: 'Demo · только базовые игры из каталога',
  allowed_games: [
    'schulte_table', 'word_pairs', 'mnemonics', 'counter', 'proofreading', 'targets',
    'picture_pairs', 'find_differences', 'pattern',
  ],
  warmup_enabled: false,
  financial_brain_day_enabled: false,
  assessment_enabled: false,
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
  allowed_games: [
    'mental_rotation',   // spatial представление позиций
    'n_back',            // удержание варианта расчёта (DUAL mode внутри)
    'tower_london',      // планирование 5+ ходов
    'pattern',           // тактические паттерны
    'set_game',          // многомерные признаки
    'sudoku',            // логическая дедукция
    'schulte_table',     // сканирование доски (Schulte-Gorbov mixed внутри)
    'corsi',             // spatial WM forward
    'cpt',               // sustained attention 4-12 мин = партия без блюндеров
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
  allowed_games: [
    'picture_pairs',     // классика памяти для детей
    'memory_matrix',     // зрительная память
    'schulte_table',     // рекорды мотивируют
    'find_differences',  // внимание, весело
    'hanoi',             // логика наглядно
    'counter',           // устный счёт
    'math_sprint',       // арифметика-гонка
    'targets',           // реакция
    'anagrams',          // буквенные пазлы
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
  allowed_games: [
    'schulte_table',     // классика школ скорочтения
    'visual_search',     // быстрый scan
    'reading_span',      // WM при чтении
    'proofreading',      // внимание к буквам
    'story_recall',      // понимание + удержание контекста
    'word_pairs',        // вербальная ассоциативная память
    'phonemic_fluency',  // беглость речи
    'find_differences',  // визуальная различительность
    'anagrams',          // быстрая работа с буквами
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
  allowed_games: [
    'n_back',                // working memory (DUAL внутри)
    'cpt',                   // sustained attention
    'mental_rotation',       // spatial
    'attention_conflict',    // Stroop/Flanker (group card)
    'switching_task',        // cognitive flexibility
    'tower_london',          // planning
    'sdmt',                  // processing speed
    'bart',                  // risk/decision
    'phonemic_fluency',      // verbal fluency
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
  person: 'Гость',           // shared with GUEST для совместимости со statistics
  display_name: 'Free (без подписки)',
  emoji: '🎁',
  color: '#f59e0b',
  description: '9 базовых игр бесплатно · попробуй и реши',
  long_description: 'Стартовый набор без подписки и кода. По одной игре из каждой категории: Шульте (внимание), Парные картинки (память), Мишени (реакция), Математический спринт + Считалка, Поиск отличий, Анаграммы, Ханойская башня, N-back (рабочая память — облегчённая). Если зайдёт — попроси код у владельца программы для тематического профиля.',
  audience: 'Все · знакомство с приложением',
  session_minutes: '3-10 мин',
  group: 'themed',
  allowed_games: [
    'schulte_table',     // attention (классика)
    'picture_pairs',     // memory visual (узнаваемая)
    'targets',           // speed/reaction (fun)
    'math_sprint',       // math (интуитивна)
    'find_differences',  // attention (простая)
    'counter',           // math basic
    'anagrams',          // verbal/logic
    'hanoi',             // logic classic
    'n_back',            // WM teaser → DUAL premium
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
  allowed_games: [
    'cpt',                // sustained attention (vigilance на длинном маршруте)
    'schulte_table',      // сканирование дороги
    'trail_making',       // переключение внимания между объектами
    'visual_search',      // быстрый scan
    'targets',            // реакция
    'choice_rt',          // выбор направления реакции
    'attention_conflict', // Flanker/Stroop (тормозим импульс)
    'n_back',             // удержание контекста (что в зеркалах)
    'find_differences',   // микро-различия на дороге
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
  allowed_games: [
    'picture_pairs',     // память на образы
    'memory_matrix',     // зрительная память
    'sdmt',              // processing speed (золотой стандарт для возраста)
    'trail_making',      // executive + speed
    'schulte_table',     // attention
    'word_pairs',        // вербальная память
    'mnemonics',         // sequence memory
    'counter',           // устный счёт (бытовой)
    'anagrams',          // буквы (когда читали — vocab остаётся)
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
  allowed_games: [
    'bart',              // risk decision-making
    'iowa',              // long-term strategy под неопределённостью
    'prl',               // reversal learning (когда правила меняются)
    'n_back',            // WM под нагрузкой (DUAL внутри)
    'cpt',               // sustained attention на длинных созвонах
    'attention_conflict',// inhibition (тормозить импульсивные решения)
    'switching_task',    // multitasking
    'tower_london',      // strategic planning
    'pattern',           // распознавание трендов
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
  allowed_games: [
    'math_sprint',       // арифметика
    'reading_span',      // WM при чтении (понимание текста)
    'story_recall',      // удержание информации
    'schulte_table',     // концентрация
    'n_back',            // WM (формулы в голове)
    'pattern',           // паттерны в задачах
    'counter',           // устный счёт
    'anagrams',          // вербальная гибкость
    'memory_matrix',     // зрительная память (карты, схемы)
  ],
  warmup_enabled: true,
  financial_brain_day_enabled: false,
  assessment_enabled: true,
};

// ─── Export ─────────────────────────────────────────────────────────────

export const PROFILES: ProfileDef[] = [
  // Personal (existing)
  DENIS, ALEX, VALYA, YULYA, GUEST,
  // Themed batch 1 (commercial, 2026-05-17)
  CHESS, KIDS, VASILYEVA, NZT48, FREE,
  // Themed batch 2 (commercial, 2026-05-17)
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
