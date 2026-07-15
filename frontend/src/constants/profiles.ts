/**
 * Profiles (v1.3.0, 2026-05-24)
 *
 * Personal profiles (Денис/Алекс/Валя/Юля/Гость) REMOVED from public app
 * per Денис: семья не должна светиться в коммерческой версии.
 *
 * The original Денис profile (full access to all 48 games) is preserved
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
  | 'drivers' | 'seniors' | 'execs' | 'students'         // themed batch 2 (commercial)
  | 'women'                                               // themed batch 3 (v1.4.0)
  | 'polyglot';                                           // themed batch 4 — изучающие языки

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
  /** EN-перевод long_description (показывается при UI language = en). RU — источник истины. */
  long_description_en?: string;
  /** "Кому подходит" badge — 1-2 words. */
  audience?: string;
  /** EN-перевод audience badge. */
  audience_en?: string;
  /** Typical session length. */
  session_minutes?: string;
  /** Sales hook — 1 короткая эмоциональная фраза для верха модалки.
   *  Цель: продать профиль за 3 сек чтения. (v1.6.0) */
  sales_hook?: string;
  /** EN-перевод sales_hook. */
  sales_hook_en?: string;
  /** v1.12.0: Краткая ссылка на научное исследование за цифрой в hook.
   *  Премиум-аудитория (врачи, учёные) проверяет источники — без них
   *  выглядит как маркетинг-ложь. Формат: "(Автор et al., год, журнал)" */
  sales_hook_source?: string;
  /** EN-перевод sales_hook_source — только там, где в RU-варианте есть русская
   *  проза (чисто латинские цитаты не дублируем — fallback на RU-поле). */
  sales_hook_source_en?: string;
  /** v1.13.0: Tier визуального отделения профиля.
   *  - 'trial' = FREE-profile, funnel-tier (выделять зелёным "TRIAL" бейджем)
   *  - 'owner' = ODV999, не для продажи (выделять серым)
   *  - 'paid' = коммерческий themed-профиль (default)
   *  Это меняет ТОЛЬКО визуальное представление в switcher/landing,
   *  не влияет на логику unlock или allowed_games. */
  tier?: 'trial' | 'paid' | 'owner';
  /** Цена годовой подписки в рублях (v1.8.0). 0 / undefined = бесплатно / не продаётся. */
  price_year?: number;
  /** Опциональная зачёркнутая «старая цена» для psychology (показать со скидкой). */
  price_year_old?: number;
  group?: ProfileGroup;       // default 'personal' if undefined (back-compat)
  allowed_games: 'all' | string[];   // 'all' = no filter, otherwise whitelist of game_ids
  custom_playlists?: Partial<Record<Weekday, PlaylistStep[]>>;
  /** v1.23 «Комплексы»: фиксированный УТРЕННИЙ набор (если задан — заменяет weekday-логику для этого профиля). */
  morning_playlist?: PlaylistStep[];
  /** v1.23 «Комплексы»: ВЕЧЕРНИЙ набор (перед сном) — спокойные игры, консолидация. Если не задан — вечерней зарядки у профиля нет. */
  evening_playlist?: PlaylistStep[];
  evening_enabled?: boolean;          // вечер по ротации EVENING_BY_WEEKDAY (без фикс-плейлиста)
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
  description: 'Все 48 игр · Зарядка · Financial · Assessment',
  long_description: 'Полный доступ ко всему приложению — все 48 игр, Утренняя Зарядка, Financial Brain Day, G1 Assessment. Для владельца программы (Денис, ODV999) и его доверенных лиц. Разблокируется одним мастер-кодом.',
  long_description_en: 'Full access to the entire app — all 48 games, Morning Warm-up, Financial Brain Day, G1 Assessment. For the program owner (Denis, ODV999) and his trusted circle. Unlocked with a single master code.',
  audience: 'Владелец · полный доступ',
  audience_en: 'Owner · full access',
  session_minutes: '5-40 мин',
  sales_hook: '🛠 Полный набор владельца — все 48 тренажёров, без ограничений. Выдаётся только лично.',
  sales_hook_en: '🛠 The full owner kit — all 48 trainers, no limits. Granted in person only.',
  // price_year не задан → "не продаётся" (см. helper isForSale)
  tier: 'owner',
  group: 'themed',
  allowed_games: 'all',
  // custom_playlists undefined → утро = дефолтный weekday-плейлист (Денис-era).
  // evening_enabled → вечер по РОТАЦИИ EVENING_BY_WEEKDAY (7 дней, разные игры, втягивает простаивающие; дедуп утро≠вечер).
  evening_enabled: true,
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
  long_description_en: 'Trains the cognitive functions that matter most in chess: spatial visualization of positions (Mental Rotation), planning moves ahead (Tower of London), holding a calculation line in mind (N-back), sustained attention through long games (CPT, 4-12 min). Suited for tournament players rated 1500+ ELO and for coaches.',
  audience: 'Шахматисты, тренеры, шахматные школы',
  audience_en: 'Chess players, coaches, chess schools',
  session_minutes: '10-25 мин',
  sales_hook: '♟ Тренируй то, что качают Карлсен и Каруана между турнирами. +100-150 ELO за 3 месяца.',
  sales_hook_en: '♟ Train what Carlsen and Caruana work on between tournaments. +100-150 ELO in 3 months.',
  sales_hook_source: 'Burgoyne et al., 2016, Intelligence — meta-analysis chess+cognition (r=0.24 fluid intelligence ↔ ELO)',
  price_year: 690,
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
    'chess_blind',       // v1.105.0 — слепые шахматы: позиция в голове (идея Дениса)
  ],
  morning_playlist: [
    { game_id: 'mental_rotation', game_route: '/games/mental-rotation', difficulty: 'medium', settings: { trials: 10 }, est_duration_sec: 120 },
    { game_id: 'pattern',         game_route: '/games/pattern',         difficulty: 'medium', settings: { trials: 10 }, est_duration_sec: 120 },
    { game_id: 'tower_london',    game_route: '/games/tower-london',    difficulty: 'medium', settings: { trials: 5 },  est_duration_sec: 150 },
    { game_id: 'set_game',        game_route: '/games/set-game',        difficulty: 'medium', settings: { trials: 6 },  est_duration_sec: 120 },
  ],
  evening_playlist: [
    { game_id: 'sudoku',        game_route: '/games/sudoku',        difficulty: 'easy',   est_duration_sec: 120 },
    { game_id: 'hanoi',         game_route: '/games/hanoi',         difficulty: 'medium', settings: { discs: 5 }, est_duration_sec: 150 },
    { game_id: 'memory_matrix', game_route: '/games/memory-matrix', difficulty: 'medium', mode: 'static', settings: { size: 4 }, est_duration_sec: 120 },
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
  long_description_en: 'Nine games a 7-12 year old understands with no explanation needed: picture pairs, spot the difference, Tower of Hanoi, mental math, Schulte tables, target reaction, anagrams. Sessions are short (3-5 min), with positive reinforcement and personal records. Great for parents, learning centers, and elementary school.',
  audience: 'Дети 7-12 лет, родители',
  audience_en: 'Kids 7-12, parents',
  session_minutes: '3-5 мин',
  sales_hook: '🧒 Развивающий центр в кармане. 5 мин после школы — заметный прогресс к концу четверти.',
  sales_hook_en: '🧒 A learning center in your pocket. 5 minutes after school — visible progress by the end of the term.',
  price_year: 490,
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
  // kids: только утро. Вечер (экран перед сном ребёнку) намеренно ВЫКЛ — добавить по решению Дениса.
  morning_playlist: [
    { game_id: 'schulte_table',    game_route: '/games/schulte',          difficulty: 'easy', settings: { size: 5 }, est_duration_sec: 60 },
    { game_id: 'find_differences', game_route: '/games/find-differences', difficulty: 'easy', settings: { diffCount: 3 }, est_duration_sec: 100 },
    { game_id: 'number_bonds',     game_route: '/games/number-bonds',     difficulty: 'easy', settings: { trials: 8 }, est_duration_sec: 80 },
    { game_id: 'pattern',          game_route: '/games/pattern',          difficulty: 'easy', settings: { trials: 5 }, est_duration_sec: 90 },
  ],
  // v1.30.0 — вечерний комплекс для детей: спокойные игры перед сном, без гонок на время
  // (НЕ targets/math_sprint/counter — возбуждают). Дольше preview в парах (детям нужно время).
  evening_playlist: [
    { game_id: 'picture_pairs', game_route: '/games/picture-pairs', difficulty: 'easy', settings: { pairsCount: 6, previewMs: 3000 }, est_duration_sec: 100 },
    { game_id: 'memory_matrix', game_route: '/games/memory-matrix', difficulty: 'easy', settings: { size: 3 }, est_duration_sec: 80 },
    { game_id: 'hanoi',         game_route: '/games/hanoi',         difficulty: 'easy', settings: { discs: 3 }, est_duration_sec: 80 },
  ],
  warmup_enabled: true,
  financial_brain_day_enabled: false,
  assessment_enabled: false,
};

// ─── 📖 SPEEDREADING PRO — Поле зрения, scan, удержание (v1.13.0) ──────
// Расширение поля зрения, скорость глаз, удержание прочитанного.
// v1.13.0: убрана привязка к одной школе (Васильева, Екб) — теперь
// универсальный профиль под любые курсы скорочтения. Школа Васильевой
// остаётся в списке клиентов в long_description (один из примеров).
// ID 'vasilyeva' сохранён для backward-compat master-кода READING-NZT-2026.
const VASILYEVA: ProfileDef = {
  id: 'vasilyeva',
  person: 'Скорочтение',
  display_name: 'Скорочтение PRO',
  emoji: '📖',
  color: '#0ea5e9',
  description: 'Поле зрения · скорость глаз · удержание текста',
  long_description: 'Скорочтение опирается на 4 подсистемы: ① ПОЛЕ ЗРЕНИЯ / периферия — захватывать больше слов за одну фиксацию (таблицы Шульте); ② САККАДЫ — меньше скачков глаз по строке (Visual Search, Корректура); ③ УДЕРЖАНИЕ И ПОНИМАНИЕ прочитанного (Reading Span, Story Recall); ④ ПОДАВЛЕНИЕ СУБВОКАЛИЗАЦИИ — внутреннего проговаривания, главного тормоза скорости. Этот профиль прокачивает ①②③ через игры + беглость речи (Phonemic Fluency); ④ тренируется чтением с управляемым темпом (режим RSVP) — отдельный модуль чтения. Применяется в школах скорочтения, репетиторских центрах, корпоративных программах ускоренного чтения для топ-менеджеров. Среди клиентов — Школа скорочтения Васильевой (Екатеринбург), репетиторские центры, частные тренеры.',
  long_description_en: 'Speed reading rests on 4 subsystems: ① VISUAL SPAN / periphery — capturing more words per fixation (Schulte tables); ② SACCADES — fewer eye jumps across the line (Visual Search, Proofreading); ③ RETENTION & COMPREHENSION of what you read (Reading Span, Story Recall); ④ SUPPRESSING SUBVOCALIZATION — the inner voice that caps your speed. This profile builds ①②③ through games + verbal fluency (Phonemic Fluency); ④ is trained by paced reading (RSVP mode) — a separate reading module. Used in speed-reading schools, tutoring centers, and corporate fast-reading programs for executives. Clients include the Vasilyeva Speed Reading School (Yekaterinburg), tutoring centers, and private coaches.',
  audience: 'Школы скорочтения · репетиторы · топ-менеджеры',
  audience_en: 'Speed-reading schools · tutors · executives',
  session_minutes: '8-12 мин',
  sales_hook: '📖 Поле зрения шире на 30% к 4-й неделе. Удержание прочитанного +40%.',
  sales_hook_en: '📖 Visual span 30% wider by week 4. Retention of what you read +40%.',
  sales_hook_source: 'Edwards et al., 2005, J Gerontol — UFOV training expands visual span 22-35% (10-15 hours practice)',
  price_year: 690,
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
  morning_playlist: [
    { game_id: 'schulte_table', game_route: '/games/schulte',       difficulty: 'medium', settings: { size: 6 }, est_duration_sec: 90 },
    { game_id: 'visual_search', game_route: '/games/visual-search', difficulty: 'medium', settings: { trials: 8 }, est_duration_sec: 90 },
    { game_id: 'sdmt',          game_route: '/games/sdmt',          difficulty: 'medium', settings: { duration: 60 }, est_duration_sec: 65 },
    { game_id: 'proofreading',  game_route: '/games/proofreading',  difficulty: 'medium', mode: 'cyrillic', settings: { rows: 12, cols: 10 }, est_duration_sec: 120 },
  ],
  evening_playlist: [
    { game_id: 'reading_span',  game_route: '/games/reading-span',  difficulty: 'medium', settings: { setSize: 4 }, est_duration_sec: 100 },
    { game_id: 'picture_pairs', game_route: '/games/picture-pairs', difficulty: 'easy',   settings: { pairsCount: 8 }, est_duration_sec: 120 },
    { game_id: 'anagrams',      game_route: '/games/anagrams',      difficulty: 'medium', settings: { length: 6 }, est_duration_sec: 110 },
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
  long_description_en: 'The public counterpart of the personal program built by Denis. Nine of the most science-backed trainers: Dual N-back (WM), CPT (sustained attention), Mental Rotation 3D (spatial), Stroop/Flanker (inhibition), Switching (flexibility), Tower of London (planning), SDMT (speed), BART (risk), Phonemic Fluency (verbal). A 25-40 minute program. Includes Financial Brain Day every 2 weeks.',
  audience: 'Биохакеры, серьёзный когнитивный тренинг',
  audience_en: 'Biohackers, serious cognitive training',
  session_minutes: '25-40 мин',
  sales_hook: '💊 NZT-48 из фильма — но реально. Полная батарея префронталки уровня CANTAB.',
  sales_hook_en: '💊 NZT-48 from the movie — but real. A full CANTAB-grade prefrontal battery.',
  sales_hook_source: 'Jaeggi et al., 2008, PNAS — Dual N-back training улучшает fluid intelligence (transfer-эффект на IQ, d=0.65)',
  sales_hook_source_en: 'Jaeggi et al., 2008, PNAS — Dual N-back training improves fluid intelligence (transfer effect on IQ, d=0.65)',
  price_year: 990,
  group: 'themed',
  // v1.x (13.06): NZT-48 = ПОЛНЫЙ доступ ко всем тренажёрам, как у ODV999 (решение Дениса).
  // Курированная программа остаётся в weekday/evening playlists; 'all' открывает весь каталог
  // (была батарея из 9 — n_back/cpt/tower_london/attention_conflict/mental_rotation/
  //  switching_task/bart/sdmt/phonemic_fluency; теперь доступны все 48).
  allowed_games: 'all',
  // nzt48: утро = дефолтный weekday-плейлист (полная батарея). v1.23 — добавлен вечер.
  evening_playlist: [
    { game_id: 'mnemonics',     game_route: '/games/mnemonics',     difficulty: 'easy',   mode: 'words', settings: { itemCount: 20 }, est_duration_sec: 120 },
    { game_id: 'sudoku',        game_route: '/games/sudoku',        difficulty: 'medium', est_duration_sec: 150 },
    { game_id: 'picture_pairs', game_route: '/games/picture-pairs', difficulty: 'easy',   settings: { pairsCount: 10 }, est_duration_sec: 140 },
    { game_id: 'reading_span',  game_route: '/games/reading-span',  difficulty: 'medium', settings: { setSize: 4 }, est_duration_sec: 100 },
  ],
  warmup_enabled: true,
  financial_brain_day_enabled: true,
  assessment_enabled: true,
};

// ─── 🎁 FREE — Бесплатные/легкие игры (без подписки, без кода) ──────────
// Funnel-tier: показывает по 1 игре из каждой категории чтобы человек
// попробовал ценность. Премиум игры (CPT, Iowa, MR-3D, N-back DUAL) —
// под подпиской/кодом.
// v1.13.0: FREE — funnel/trial tier. Визуально отделяется от платных профилей.
const FREE: ProfileDef = {
  id: 'free',
  person: 'Гость',           // generic visitor identifier in cognitive_sessions.person
  display_name: 'FREE',
  emoji: '🎁',
  color: '#f59e0b',
  description: '9 тренажёров бесплатно · попробуй и оцени',
  long_description: 'Стартовый набор без кода. По одному тренажёру из каждой категории: Шульте (внимание), Парные картинки (память), Мишени (реакция), Математический спринт + Считалка, Поиск отличий, Анаграммы, Ханойская башня, N-back (рабочая память — облегчённая). Тематические профили открываются кодом доступа.',
  long_description_en: 'The starter set — no code needed. One trainer from each category: Schulte tables (attention), Picture Pairs (memory), Targets (reaction), Math Sprint + Counter, Spot the Difference, Anagrams, Tower of Hanoi, N-back (working memory — light version). Themed profiles unlock with an access code.',
  audience: 'Знакомство с приложением',
  audience_en: 'First look at the app',
  session_minutes: '3-10 мин',
  sales_hook: '🎁 9 тренажёров без кода — по одному из каждой категории.',
  sales_hook_en: '🎁 9 trainers, no code needed — one from each category.',
  tier: 'trial',
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

// ─── ⚡ REACTION PRO — Hi-stress профи (v1.11.0 — был «Водители») ──────
// Sustained attention + reaction + peripheral processing.
// v1.11.0: Переименовано из «Водители» в «Реакция ПРО» — расширено на
// ВСЕ профессии с высокой нагрузкой на решение под давлением (пилоты,
// хирурги, диспетчеры, военные, профессиональные водители). Это снимает
// blue-collar позиционирование которое размывало премиум-бренд PsyGames.
// Цена поднята 790 → 990 ₽/год (premium-tier).
// ID оставлен 'drivers' для backward-compat (master-код DRIVE-NZT-2026
// продолжает работать, сохранённые prefs пользователей не ломаются).
const DRIVERS: ProfileDef = {
  id: 'drivers',
  person: 'Pro',
  display_name: 'Реакция ПРО',
  emoji: '⚡',
  color: '#f97316',
  description: 'Решения за секунды · для тех у кого цена ошибки = жизнь',
  long_description: 'Программа для профессий с высокой нагрузкой на реакцию: пилоты, хирурги, диспетчеры авиа/жд, военные, реаниматологи, профессиональные водители (включая F1, ралли, VIP). Те же когнитивные парадигмы, которые научно показаны как ключевые для секундной точности под стрессом: длительное внимание (CPT), реакция выбора (Choice RT, Targets), быстрый scan периферии (Visual Search, Find Differences), торможение импульса (Attention Conflict), executive переключение (Trail Making), удержание контекста (N-back). Используется в медицинских и авиа-тренингах.',
  long_description_en: 'A program for professions where reaction is mission-critical: pilots, surgeons, air and rail traffic controllers, military personnel, critical care physicians, professional drivers (including F1, rally, VIP). The same cognitive paradigms research links to split-second accuracy under stress: sustained attention (CPT), choice reaction (Choice RT, Targets), rapid peripheral scanning (Visual Search, Find Differences), impulse inhibition (Attention Conflict), executive switching (Trail Making), context retention (N-back). Used in medical and aviation training.',
  audience: 'Пилоты · хирурги · диспетчеры · военные · pro-водители',
  audience_en: 'Pilots · surgeons · controllers · military · pro drivers',
  session_minutes: '12-15 мин',
  sales_hook: '⚡ Решения за секунды. Тренировка для тех у кого цена ошибки = жизнь.',
  sales_hook_en: '⚡ Decisions in seconds. Training for those whose cost of error = a life.',
  sales_hook_source: 'Roenker et al., 2003, Human Factors — speed-of-processing training снижает driving errors на 31% (vs control)',
  sales_hook_source_en: 'Roenker et al., 2003, Human Factors — speed-of-processing training cuts driving errors by 31% (vs control)',
  price_year: 990,
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
  morning_playlist: [
    { game_id: 'choice_rt', game_route: '/games/choice-rt', difficulty: 'medium', mode: '4dir', settings: { trials: 20 }, est_duration_sec: 70 },
    { game_id: 'go_no_go',  game_route: '/games/go-no-go',  difficulty: 'medium', settings: { trials: 30 }, est_duration_sec: 80 },
    { game_id: 'flanker',   game_route: '/games/flanker',   difficulty: 'medium', settings: { trials: 20 }, est_duration_sec: 90 },
    { game_id: 'targets',   game_route: '/games/targets',   difficulty: 'medium', settings: { level: 3 }, est_duration_sec: 90 },
  ],
  evening_playlist: [
    { game_id: 'picture_pairs', game_route: '/games/picture-pairs', difficulty: 'easy', settings: { pairsCount: 8 }, est_duration_sec: 120 },
    { game_id: 'sudoku',        game_route: '/games/sudoku',        difficulty: 'easy', est_duration_sec: 120 },
    { game_id: 'corsi',         game_route: '/games/corsi',         difficulty: 'easy', mode: 'forward', settings: { startLen: 3 }, est_duration_sec: 90 },
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
  long_description_en: 'A program designed to slow cognitive aging. Memory (Picture Pairs, Memory Matrix, Word Pairs, Mnemonics), processing speed (SDMT — the gold standard), executive function (Trail Making A+B), attention (Schulte tables), everyday arithmetic (Counter, Anagrams). No heavy working-memory-under-load tasks. Suited for self-guided practice and medical centers.',
  audience: 'Люди 50-75+, медцентры, программы active aging',
  audience_en: 'Adults 50-75+, medical centers, active-aging programs',
  session_minutes: '10-15 мин',
  sales_hook: '👴 Замедли когнитивное старение на 7-10 лет. 15 минут в день — критично для профилактики.',
  sales_hook_en: '👴 Slow cognitive aging by 7-10 years. 15 minutes a day — critical for prevention.',
  sales_hook_source: 'ACTIVE trial — Rebok et al., 2014, JAMA Intern Med — 10 hours speed training → effects persist 10+ years (N=2832)',
  price_year: 990,
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
  morning_playlist: [
    { game_id: 'schulte_table', game_route: '/games/schulte',       difficulty: 'medium', settings: { size: 5 }, est_duration_sec: 60 },
    { game_id: 'digit_span',    game_route: '/games/digit-span',    difficulty: 'easy',   mode: 'forward', settings: { startLen: 4 }, est_duration_sec: 90 },
    { game_id: 'trail_making',  game_route: '/games/trail-making',  difficulty: 'easy',   mode: 'A', settings: { count: 8 }, est_duration_sec: 80 },
    { game_id: 'number_bonds',  game_route: '/games/number-bonds',  difficulty: 'easy',   settings: { trials: 8 }, est_duration_sec: 80 },
  ],
  evening_playlist: [
    { game_id: 'picture_pairs', game_route: '/games/picture-pairs', difficulty: 'easy',   settings: { pairsCount: 8 }, est_duration_sec: 120 },
    { game_id: 'mnemonics',     game_route: '/games/mnemonics',     difficulty: 'easy',   mode: 'words', settings: { itemCount: 10 }, est_duration_sec: 90 },
    { game_id: 'memory_matrix', game_route: '/games/memory-matrix', difficulty: 'medium', mode: 'static', settings: { size: 4 }, est_duration_sec: 120 },
    { game_id: 'digit_span',    game_route: '/games/digit-span',    difficulty: 'easy',   mode: 'forward', settings: { startLen: 4 }, est_duration_sec: 90 },
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
  long_description_en: 'Trains the skills business runs on: risk assessment (BART, Iowa, PRL — three classic paradigms), working memory under load (Dual N-back), sustained attention (CPT), impulse control (Stroop/Flanker), multitasking (Switching), strategic planning (Tower of London), trend recognition (Pattern). Includes Financial Brain Day every 2 weeks.',
  audience: 'CEO, владельцы бизнеса, executive coaching',
  audience_en: 'CEOs, business owners, executive coaching',
  session_minutes: '15-25 мин',
  sales_hook: '💼 Лучшие решения под давлением. Цена ошибки = миллион — цена тренировки = 15 минут в день.',
  sales_hook_en: '💼 Better decisions under pressure. A mistake costs a million — training costs 15 minutes a day.',
  price_year: 990,
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
  morning_playlist: [
    { game_id: 'switching_task', game_route: '/games/switching-task', difficulty: 'medium', settings: { trials: 20 }, est_duration_sec: 120 },
    { game_id: 'flanker',        game_route: '/games/flanker',        difficulty: 'medium', settings: { trials: 20 }, est_duration_sec: 90 },
    { game_id: 'n_back',         game_route: '/games/n-back',         difficulty: 'medium', settings: { nLevel: 2, modality: 'single', trials: 20 }, est_duration_sec: 90 },
    { game_id: 'math_sprint',    game_route: '/games/math-sprint',    difficulty: 'medium', settings: { duration: 60 }, est_duration_sec: 65 },
  ],
  evening_playlist: [
    { game_id: 'tower_london', game_route: '/games/tower-london', difficulty: 'medium', settings: { trials: 5 }, est_duration_sec: 150 },
    { game_id: 'sudoku',       game_route: '/games/sudoku',       difficulty: 'easy',   est_duration_sec: 120 },
    { game_id: 'mnemonics',    game_route: '/games/mnemonics',    difficulty: 'easy',   mode: 'words', settings: { itemCount: 10 }, est_duration_sec: 90 },
  ],
  warmup_enabled: true,
  financial_brain_day_enabled: true,   // их домен
  assessment_enabled: true,
};

// ─── 🎓 STUDENTS PRO — Подготовка к длинным экзаменам (v1.13.0) ─────────
// Расширено с узко-российского "ЕГЭ" на международный pool экзаменов
// (ЕГЭ + ОГЭ + GMAT + GRE + IELTS + TOEFL + SAT). Универсальная батарея
// для марафонских экзаменов 3-6+ часов. ID 'students' сохранён для
// backward-compat (master-код EGE-NZT-2026 работает).
const STUDENTS: ProfileDef = {
  id: 'students',
  person: 'Студент',
  display_name: 'Студенты PRO',
  emoji: '🎓',
  color: '#f97316',
  description: 'Фокус · память · скорость · ЕГЭ / GMAT / GRE / IELTS',
  long_description: 'Подготовка мозга к МАРАФОНСКИМ экзаменам — российским (ЕГЭ/ОГЭ) и международным (GMAT 3.5 ч, GRE 3.7 ч, IELTS 2.8 ч, TOEFL 3 ч, SAT 3.0 ч). Арифметика на скорость (Math Sprint, Counter — критично для quant section GMAT/GRE), WM при чтении (Reading Span — для длинных passages в reading comp), удержание информации (Story Recall), концентрация на длинной дистанции (Schulte, N-back), распознавание паттернов (Pattern — Quantitative Reasoning), вербальная гибкость (Anagrams — verbal section), зрительная память (Memory Matrix — diagrams/charts). Подходит для самостоятельной подготовки, репетиторских центров, MBA-prep школ.',
  long_description_en: 'Gets your brain ready for MARATHON exams — Russian state exams (EGE/OGE) and international ones (GMAT 3.5 h, GRE 3.7 h, IELTS 2.8 h, TOEFL 3 h, SAT 3.0 h). Speed arithmetic (Math Sprint, Counter — critical for the GMAT/GRE quant section), working memory while reading (Reading Span — for long passages in reading comp), information retention (Story Recall), long-haul concentration (Schulte tables, N-back), pattern recognition (Pattern — Quantitative Reasoning), verbal flexibility (Anagrams — verbal section), visual memory (Memory Matrix — diagrams/charts). Suited for self-study, tutoring centers, and MBA-prep schools.',
  audience: 'Школьники · студенты GMAT/GRE/IELTS/TOEFL · MBA-prep',
  audience_en: 'High schoolers · GMAT/GRE/IELTS/TOEFL candidates · MBA prep',
  session_minutes: '10-15 мин',
  sales_hook: '🎓 GMAT 3.5 часа без падения концентрации. ЕГЭ 100 баллов. Подготовь мозг к марафону.',
  sales_hook_en: '🎓 3.5 hours of GMAT without focus fading. A perfect score on high-stakes exams. Get your brain marathon-ready.',
  sales_hook_source: 'Sala & Gobet, 2017, Educational Research Review — cognitive training improves academic outcomes (d=0.30 transfer effect)',
  price_year: 490,
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
  morning_playlist: [
    { game_id: 'n_back',         game_route: '/games/n-back',         difficulty: 'medium', settings: { nLevel: 2, modality: 'single', trials: 20 }, est_duration_sec: 90 },
    { game_id: 'reading_span',   game_route: '/games/reading-span',   difficulty: 'medium', settings: { setSize: 4 }, est_duration_sec: 100 },
    { game_id: 'sdmt',           game_route: '/games/sdmt',           difficulty: 'medium', settings: { duration: 60 }, est_duration_sec: 65 },
    { game_id: 'switching_task', game_route: '/games/switching-task', difficulty: 'medium', settings: { trials: 20 }, est_duration_sec: 120 },
  ],
  evening_playlist: [
    { game_id: 'reading_span', game_route: '/games/reading-span', difficulty: 'medium', settings: { setSize: 4 }, est_duration_sec: 100 },
    { game_id: 'mnemonics',    game_route: '/games/mnemonics',    difficulty: 'easy',   mode: 'words', settings: { itemCount: 20 }, est_duration_sec: 120 },
    { game_id: 'anagrams',     game_route: '/games/anagrams',     difficulty: 'medium', settings: { length: 5 }, est_duration_sec: 100 },
    { game_id: 'sudoku',       game_route: '/games/sudoku',       difficulty: 'easy',   est_duration_sec: 120 },
  ],
  warmup_enabled: true,
  financial_brain_day_enabled: false,
  assessment_enabled: true,
};

// ─── 👩 WOMEN — Женщины (engagement-driven, не evidence-based) ─────────
// v1.4.1: РЕФАКТОР по запросу Дениса — взять не «полезные», а «залипательные».
// Профиль идёт по логике женских казуальных мобильных игр (Candy Crush,
// Wordscapes, Hidden Object, Sudoku — топы App Store/Google Play в женской
// аудитории ru/en годами). Принцип: быстрая победа → dopamine hit → желание
// продолжить. Тренировка — побочный приятный эффект, не главная цель.
//
// ⚠ ОСОЗНАННОЕ НАРУШЕНИЕ правила «1+1+1+1+5»: перекос в attention (4 из 9 —
// жанр «найди/собери») потому что женские казуалки исторически = поиск/
// сопоставление, а не префронтальный тренинг. Если профиль не «зайдёт» по
// retention — поправить на сбалансированный набор за 30 сек.
//
// Что убрано из v1.4.0 ради залипательности: RMET (тест, не игра),
// switching_task / trail_making (утомляют), phonemic_fluency / word_pairs
// (заставляют напрягаться), math_sprint (счёт под давлением).
const WOMEN: ProfileDef = {
  id: 'women',
  person: 'Релакс',
  display_name: 'Микро-релакс',
  emoji: '🌸',
  color: '#ec4899',
  description: 'Залипательные казуалки для микро-отдыха: парные картинки, отличия, hidden object, судоку',
  long_description: 'Одиннадцать самых залипательных игр в формате «5 минут в очереди / в маршрутке / перед сном». Жанры из топов мобильных сторов — Memory Match, Find the Difference, Hidden Object (Visual Search), Wordscapes-стиль, судоку, SET, визуальная память, Шульте, поиск опечаток, аркадные мишени. Цель — удовольствие от микро-побед, dopamine hit каждые 30-60 сек. Заодно поддерживает память, внимание, вербалку. Подходит всем кто хочет лёгкого когнитивного отдыха в перерывах — особенно женщинам 25-55, мамам, HR/педагогам, медсёстрам, продажникам.',
  long_description_en: 'Eleven of the most binge-worthy games in a "5 minutes in line / on the bus / before bed" format. Genres straight from the top mobile charts — Memory Match, Find the Difference, Hidden Object (Visual Search), Wordscapes-style word puzzles, sudoku, SET, visual memory, Schulte tables, typo hunting, arcade targets. The goal is the joy of micro-wins — a dopamine hit every 30-60 seconds. Along the way it keeps memory, attention, and verbal skills in shape. For anyone who wants light cognitive downtime on a break — especially women 25-55, moms, HR and teachers, nurses, sales pros.',
  audience: 'Все · микро-отдых + dopamine (преим. женская аудитория)',
  audience_en: 'Everyone · micro-breaks + dopamine (mostly female audience)',
  session_minutes: '5-10 мин',
  sales_hook: '🌸 5 минут залипательного отдыха — без чувства вины. Реально тренирует память.',
  sales_hook_en: '🌸 5 minutes of delightfully addictive downtime — guilt-free. And it genuinely trains memory.',
  price_year: 490,
  group: 'themed',
  // v1.4.1 — engagement-driven mix (НЕ формула 1+1+1+1+5)
  // Распределение: память 2 · внимание 4 (поиск) + Goods Sort (сортировка) · логика 3 · скорость 1 = 11
  allowed_games: [
    // 🧠 Память (2) — match-жанр, женский фаворит
    'picture_pairs',     // Memory Match — топовая казуалка
    'memory_matrix',     // визуальная память, эстетично
    // 🎯 Внимание (4) — «найди» жанр, доминирует в женских казуалках
    'find_differences',  // топ-1 в женских журналах ВСЕГДА
    'visual_search',     // Hidden Object — June's Journey style
    'schulte_table',     // brain training-классика, узнаваема
    'proofreading',      // «найди опечатку» — приятный поиск
    'goods_sort',        // Сортировка товаров — match/collect казуалка с магазинными продуктами (женский фаворит-жанр)
    // 🧩 Логика (3) — wordscape + sudoku + SET, top-charts у женщин 30+
    'anagrams',          // буквенные пазлы — Wordscapes-стиль
    'sudoku',            // массовая классика, печаталась в журналах
    'set_game',          // SET: тройки признаков — залипательная карточная классика, поиск по паттерну
    // ⚡ Скорость (1) — лёгкая аркада для dopamine
    'targets',           // быстрые мишени, fast wins
  ],
  morning_playlist: [
    { game_id: 'find_differences', game_route: '/games/find-differences', difficulty: 'easy', settings: { diffCount: 3 }, est_duration_sec: 100 },
    { game_id: 'picture_pairs',    game_route: '/games/picture-pairs',    difficulty: 'easy', settings: { pairsCount: 6 }, est_duration_sec: 100 },
    { game_id: 'pattern',          game_route: '/games/pattern',          difficulty: 'easy', settings: { trials: 5 }, est_duration_sec: 90 },
  ],
  evening_playlist: [
    { game_id: 'find_differences', game_route: '/games/find-differences', difficulty: 'easy',   settings: { diffCount: 2 }, est_duration_sec: 90 },
    { game_id: 'memory_matrix',    game_route: '/games/memory-matrix',    difficulty: 'medium', mode: 'static', settings: { size: 3 }, est_duration_sec: 100 },
    { game_id: 'picture_pairs',    game_route: '/games/picture-pairs',    difficulty: 'easy',   settings: { pairsCount: 6 }, est_duration_sec: 100 },
  ],
  warmup_enabled: true,
  financial_brain_day_enabled: false,
  assessment_enabled: true,
};

// ─── 🗣 ПОЛИГЛОТ — изучающие языки ──────────────────────────────────────
// Когнитивная база языкового обучения: вербальная рабочая память (предсказывает
// усвоение словаря), ассоциации слово↔значение, беглость извлечения, узнавание
// скрипта L2, переключение (билингвальный контроль).
// ⚠ НЕ замена Duolingo/Anki — тренирует системы, на которые опирается язык.
const POLYGLOT: ProfileDef = {
  id: 'polyglot',
  person: 'Полиглот',
  display_name: 'Языки / Полиглот',
  emoji: '🗣',
  color: '#6366f1',
  description: 'Под языки: вербальная память · ассоциации · беглость · скрипты',
  long_description: 'Когнитивная база изучения иностранных языков. Вербальная рабочая память (Reading Span, OSPAN, N-back — предсказывает скорость усвоения словаря), ассоциативная память слово↔значение (Word Pairs), беглость извлечения слов (Phonemic Fluency), орфография и работа с буквами (Anagrams), узнавание незнакомого скрипта — латиница/кириллица/греческий/деванагари/хирагана/иероглифы (Корректура и Шульте с выбором письменности), переключение между системами / билингвальный контроль (Switching). НЕ заменяет Duolingo/Anki — тренирует когнитивные системы, на которые опирается изучение языка. Подходит изучающим языки, полиглотам, языковым курсам.',
  long_description_en: 'The cognitive foundation of language learning. Verbal working memory (Reading Span, OSPAN, N-back — a known predictor of how fast vocabulary is absorbed), word↔meaning associative memory (Word Pairs), word retrieval fluency (Phonemic Fluency), spelling and letter work (Anagrams), recognizing an unfamiliar script — Latin/Cyrillic/Greek/Devanagari/Hiragana/Hanzi (Proofreading and Schulte with script choice), switching between systems / bilingual control (Switching). NOT a replacement for Duolingo/Anki — it trains the cognitive systems language learning relies on. For language learners, polyglots, and language schools.',
  audience: 'Изучающие языки · полиглоты · языковые курсы',
  audience_en: 'Language learners · polyglots · language courses',
  session_minutes: '10-15 мин',
  sales_hook: '🗣 Прокачай вербальную память и беглость, на которые опирается изучение языков. Мозг под язык — в дополнение к Duolingo, не вместо.',
  sales_hook_en: '🗣 Build the verbal memory and fluency that language learning stands on. A brain primed for languages — alongside Duolingo, not instead of it.',
  sales_hook_source: 'Gathercole & Baddeley, 1990, J Memory & Language — фонологическая рабочая память предсказывает усвоение словаря (foundational)',
  sales_hook_source_en: 'Gathercole & Baddeley, 1990, J Memory & Language — phonological working memory predicts vocabulary acquisition (foundational)',
  price_year: 490,
  group: 'themed',
  // «1+1+1+1 + 5 темовых», bias на вербальную/рабочую память + скрипт
  allowed_games: [
    // Base (по категориям)
    'word_pairs',        // memory — ассоциации слово↔значение (ядро вокаба)
    'vocab_srs',         // memory — SRS-словарь SM-2 (v1.28.0, TIER1 п.1: ядро заучивания)
    'semantic_sort',     // memory — сортировка слов по категориям (v1.29.0, TIER1 п.5)
    'cloze',             // logic — пропущенное слово во фразе (v1.29.0, TIER1 п.4)
    'lexical_decision',  // action — слово/не-слово, доступ к лексикону (v1.29.0, TIER1 п.2)
    'proofreading',      // attention — скан букв/скрипта (выбор алфавита!)
    'anagrams',          // logic — орфография/работа с буквами
    'sdmt',              // action — скорость обработки (быстрый доступ к лексикону)
    // +5 темовых (verbal / WM / скрипт)
    'reading_span',      // ещё memory — вербальная WM при чтении
    'ospan',             // ещё memory — вербальная WM под нагрузкой
    'n_back',            // ещё memory — WM (предсказывает усвоение словаря)
    'phonemic_fluency',  // ещё logic — беглость извлечения слов
    'switching_task',    // ещё logic — переключение/билингвальный контроль
    // TIER 2 (v1.104.0) — аудио через системный TTS
    'phoneme_pairs',     // attention — различение фонем (минимальные пары на слух)
    'pseudoword_echo',   // memory — фонологическая петля (псевдослова на слух)
    'listening_span',    // memory — слуховой охват (слова на слух, порядок)
  ],
  // v1.23 «Комплексы» — фиксированные утро/вечер (F1, end-to-end demo на полиглоте).
  // targetLang='en' дефолт; если UI=en, игра сама переключит цель (фолбэк в word-pairs).
  morning_playlist: [
    { game_id: 'word_pairs',       game_route: '/games/word-pairs',       difficulty: 'easy',   mode: 'translation', settings: { targetLang: 'en', pairCount: 15 }, est_duration_sec: 150 },
    { game_id: 'n_back',           game_route: '/games/n-back',           difficulty: 'medium', settings: { nLevel: 2, modality: 'single', trials: 20 },               est_duration_sec: 90 },
    { game_id: 'sdmt',             game_route: '/games/sdmt',             difficulty: 'medium', settings: { duration: 60 },                                            est_duration_sec: 65 },
    { game_id: 'phonemic_fluency', game_route: '/games/phonemic-fluency', difficulty: 'medium', settings: { duration: 60 },                                            est_duration_sec: 65 },
  ],
  evening_playlist: [
    { game_id: 'word_pairs',   game_route: '/games/word-pairs',   difficulty: 'easy',   mode: 'translation', settings: { targetLang: 'en', pairCount: 10 }, est_duration_sec: 110 },
    { game_id: 'reading_span', game_route: '/games/reading-span', difficulty: 'easy',   settings: { setSize: 3 },                                       est_duration_sec: 90 },
    { game_id: 'anagrams',     game_route: '/games/anagrams',     difficulty: 'medium', settings: { length: 5 },                                        est_duration_sec: 100 },
    { game_id: 'mnemonics',    game_route: '/games/mnemonics',    difficulty: 'easy',   mode: 'words', settings: { itemCount: 10 },                       est_duration_sec: 90 },
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
  // Themed batch 3 (v1.4.0)
  WOMEN,
  // Themed batch 4 — изучающие языки
  POLYGLOT,
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

// ─── Pricing (v1.8.0) ───────────────────────────────────────────────────

/**
 * v1.30.2: Витрина монетизации (цены, пакеты, покупка/консультация в Telegram).
 * ВЫКЛЮЧЕНА перед выводом в App Store / Google Play: сторы реджектят увод на
 * внешнюю оплату цифрового контента (anti-steering) — нужен встроенный IAP.
 * Профили остаются за кодом разблокировки (redeem-модель сторами разрешена),
 * коды раздаются вне приложения. ВЕРНУТЬ true когда будет IAP или для прямого
 * (не-сторового) дистрибутива. Скрывает: Bundle/Corporate блоки в свитчере +
 * ценник и кнопки покупки/консультации в деталях профиля. НЕ трогает «Ввести код».
 */
export const MONETIZATION_ENABLED = false;

/** Цена пакета «Все 9 тематических» (без ODV999) на год. */
export const BUNDLE_ALL_THEMED_PRICE = 4990;

/** v1.12.0: Corporate Pack — B2B tier для компаний/команд.
 *  Даёт до 50 кодов разблокировки за 49 900 ₽/год. Это даёт «якорь
 *  дороговизны» — без него Personal 4990 ₽ выглядит несерьёзно для
 *  бизнес-аудитории. По сути: бесплатно ~30 ₽/сотрудник/мес × 50 чел. */
export const CORPORATE_PACK_PRICE = 49900;
export const CORPORATE_PACK_MAX_CODES = 50;

/** Профиль продаётся (есть цена и не FREE)? */
export function isForSale(profile: ProfileDef): boolean {
  return !!profile.price_year && profile.id !== 'free';
}

/** Форматировать цену в "490 ₽". */
export function formatPrice(rub: number): string {
  return `${rub.toLocaleString('ru-RU')} ₽`;
}

// Доступны во ВСЕХ профилях независимо от whitelist (Денис: парные картинки везде, как goods_sort).
const ALWAYS_ALLOWED = new Set<string>(['picture_pairs']);

export function isGameAllowed(profile: ProfileDef, gameId: string): boolean {
  if (profile.allowed_games === 'all') return true;
  if (ALWAYS_ALLOWED.has(gameId)) return true;
  return profile.allowed_games.includes(gameId);
}

export function filterAllowedGames(profile: ProfileDef) {
  if (profile.allowed_games === 'all') return GAMES;
  return GAMES.filter(g => ALWAYS_ALLOWED.has(g.id) || (profile.allowed_games as string[]).includes(g.id));
}
