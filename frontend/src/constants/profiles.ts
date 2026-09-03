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

import { Platform } from 'react-native';
import { GAMES, isHubGame } from '@/src/constants/games';
import type { PlaylistStep, Weekday } from '@/src/services/warmup';
import { freshGameIds, freshEntries } from '@/src/constants/freshGames';

export type ProfileId =
  | 'odv999'                                              // owner (Денис, full access, locked by master code)
  | 'chess' | 'kids' | 'vasilyeva' | 'nzt48' | 'free'    // themed batch 1 (commercial)
  | 'drivers' | 'seniors' | 'execs' | 'students'         // themed batch 2 (commercial)
  | 'women'                                               // themed batch 3 (v1.4.0)
  | 'polyglot'                                            // themed batch 4 — изучающие языки
  | 'whatsnew';                                          // витрина нового и обновлённого (не продаётся)

/** UI grouping for Settings screen. All profiles are 'themed' since v1.3.0. */
export type ProfileGroup = 'personal' | 'themed';

export interface ProfileDef {
  /**
   * Пускать ли этот профиль в песочницу — к играм со слабой динамикой.
   *
   * По умолчанию НЕТ: человек, открывший приложение, обязан видеть только
   * отработанное. Просят её явно те, кто пробует новое — владелец и профиль
   * «Новинки».
   */
  allow_sandbox?: boolean;
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
  /**
   * ⚠️ `owner` ЗНАЧИТ «СКРЫТ ИЗ ВЫБОРА», а не «не продаётся». Свитчер прячет
   * такие профили фильтром, и это правильно для ODV999 — он открывается
   * мастер-кодом. Но «Новинки» я по ошибке пометил так же, желая сказать «не
   * продаётся», и витрина свежей работы стала невидимой: заведена, переведена,
   * считает состав по датам — и не показывается никому. Отсюда `showcase`:
   * виден всем, но не продаётся и не имеет цены.
   */
  tier?: 'trial' | 'paid' | 'owner' | 'showcase';
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


// v1.154 (аудит): публичное число игр — ВЫЧИСЛЯЕМОЕ из каталога, а не «48»
// хардкодом (реально в каталоге больше, число дрейфовало). Единый источник.
//
// ⚠️ РАЗВИЛКИ НЕ СЧИТАЮТСЯ. `GAMES.length` включает три экрана-развилки
// (охват памяти, конфликт внимания, судоку) — они не упражнения, а выбор из
// соседних, и содержимое каждой уже посчитано отдельными записями. Считать их
// значит обещать одно и то же дважды: 20.08.2026 профиль владельца и свитчер
// говорили «72 тренажёра» при 69 настоящих.
//
// Правило то же, что на первом экране приложения (`app/onboarding.tsx`), и
// теперь оно ОДНО: два разных числа в одном приложении — это не округление,
// а разные обещания в разных местах.
/**
 * СКОЛЬКО У НАС УПРАЖНЕНИЙ — СЧИТАЕМ ТОЛЬКО ОТРАБОТАННЫЕ.
 *
 * Развилки (`hub`) не упражнения, а меню — их не считали и раньше. С 22.08.2026
 * не считаем и песочницу: игру, которую сами держим сырой, нельзя обещать в
 * магазине и в описании профиля. Число падает честно, а не остаётся красивым.
 */
export const PUBLIC_GAME_COUNT = GAMES.filter((g) => !isHubGame(g.id) && !g.sandbox).length;

/** Сколько лежит в песочнице — чтобы это было видно числом, а не на глаз. */
export const SANDBOX_GAME_COUNT = GAMES.filter((g) => g.sandbox).length;

// ─── 🛠 ODV999 — Денис, locked by master code ────────────────────────────
// Все игры разблокированы. Master code = тот же что для NZT staticrypt.
// Раньше был personal profile "Денис"; в v1.3.0 переименован + переведён
// в themed (требует код) чтобы личные данные не светились публично.

const ODV999: ProfileDef = {
  allow_sandbox: true,
  id: 'odv999',
  person: 'ODV999',
  display_name: 'ODV999',
  emoji: '🛠',
  color: '#fbbf24',
  description: `Все ${PUBLIC_GAME_COUNT} игр · Зарядка · Financial · Assessment`,
  long_description: `Полный доступ ко всему приложению — все ${PUBLIC_GAME_COUNT} игр, Утренняя Зарядка, Financial Brain Day, G1 Assessment. Для владельца программы (Денис, ODV999) и его доверенных лиц. Разблокируется одним мастер-кодом.`,
  long_description_en: `Full access to the entire app — all ${PUBLIC_GAME_COUNT} games, Morning Warm-up, Financial Brain Day, G1 Assessment. For the program owner (Denis, ODV999) and his trusted circle. Unlocked with a single master code.`,
  audience: 'Владелец · полный доступ',
  audience_en: 'Owner · full access',
  session_minutes: '5-40 мин',
  sales_hook: `🛠 Полный набор владельца — все ${PUBLIC_GAME_COUNT} тренажёров, без ограничений. Выдаётся только лично.`,
  sales_hook_en: `🛠 The full owner kit — all ${PUBLIC_GAME_COUNT} trainers, no limits. Granted in person only.`,
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
  // Ядро v1.2.0 «1+1+1+1 + 5 темовых» (covers all 4 categories, bias on logic) + chess_blind
  // (v1.105.0) + четыре игры лаборатории 19.08.2026. Формула описывает ЯДРО, а не длину
  // списка: набор рос дважды, и сверять его с «девяткой» больше нельзя.
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
    'chess_blind',
    // +4 из лаборатории 19.08.2026 — все про расчёт наперёд, то есть предмет профиля.
    'dots_connect',      // logic — жадный первый ход запирает четвёртую пару
    'one_line',          // logic — ошибка не видна сразу, выстреливает через десять ходов
    'navigator',         // memory — позиция без доски = маршрут без карты
    'object_tracker',    // attention — удержать несколько фигур, пока позиция меняется       // v1.105.0 — слепые шахматы: позиция в голове (идея Дениса)
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
  long_description: 'Десять игр, которые ребёнок 7-12 лет понимает без объяснений: парные картинки, поиск отличий, Ханойская башня, устный счёт, Шульте, реакция на мишени, анаграммы, судоку 6×6. Сессии короткие (3-5 мин), с позитивным подкреплением и рекордами. Подходит для родителей, развивающих центров, начальной школы.',
  long_description_en: 'Ten games a 7-12 year old understands with no explanation needed: picture pairs, spot the difference, Tower of Hanoi, mental math, Schulte tables, target reaction, anagrams, 6×6 sudoku. Sessions are short (3-5 min), with positive reinforcement and personal records. Great for parents, learning centers, and elementary school.',
  audience: 'Дети 7-12 лет, родители',
  audience_en: 'Kids 7-12, parents',
  session_minutes: '3-5 мин',
  sales_hook: '🧒 Развивающий центр в кармане. 5 мин после школы — заметный прогресс к концу четверти.',
  sales_hook_en: '🧒 A learning center in your pocket. 5 minutes after school — visible progress by the end of the term.',
  price_year: 490,
  group: 'themed',
  // Ядро v1.2.0 «1+1+1+1 + 5 темовых» (all 4 cats, bias on action — speed/math for fun);
  // + судоку и три игры лаборатории 19.08.2026. Формула про ЯДРО, а не про длину списка.
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
    'sudoku',
    // 19.08.2026: правила всех трёх объясняются картинкой, читать не нужно.
    // ⚠️ Дальняя часть лесенки взрослая (8×8 у точек, 12 вершин у линии, три цели у
    // трекера); потолка уровня в профиле нет, но тропинка не пускает вперёд без
    // прохождения — до взрослой части ребёнок доходит своим ходом, а не сразу.
    'dots_connect',
    'one_line',
    'object_tracker',    // «следи за помеченными шариками» — понятно без объяснений            // v1.124.0: логика-головоломка (6×6 выбирается в игре) — по запросу Дениса
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
  long_description: 'Скорочтение опирается на 4 подсистемы: ① ПОЛЕ ЗРЕНИЯ / периферия — захватывать больше слов за одну фиксацию (таблицы Шульте); ② САККАДЫ — меньше скачков глаз по строке (Visual Search, Корректура); ③ УДЕРЖАНИЕ И ПОНИМАНИЕ прочитанного (Reading Span, Story Recall); ④ ПОДАВЛЕНИЕ СУБВОКАЛИЗАЦИИ — внутреннего проговаривания, главного тормоза скорости. Этот профиль прокачивает ①②③ через игры + беглость речи (Phonemic Fluency); ④ тренируется чтением с управляемым темпом (режим RSVP) — отдельный модуль чтения. Применяется в школах скорочтения, репетиторских центрах, корпоративных программах ускоренного чтения для топ-менеджеров.',
  long_description_en: 'Speed reading rests on 4 subsystems: ① VISUAL SPAN / periphery — capturing more words per fixation (Schulte tables); ② SACCADES — fewer eye jumps across the line (Visual Search, Proofreading); ③ RETENTION & COMPREHENSION of what you read (Reading Span, Story Recall); ④ SUPPRESSING SUBVOCALIZATION — the inner voice that caps your speed. This profile builds ①②③ through games + verbal fluency (Phonemic Fluency); ④ is trained by paced reading (RSVP mode) — a separate reading module. Used in speed-reading schools, tutoring centers, and corporate fast-reading programs for executives.',
  audience: 'Школы скорочтения · репетиторы · топ-менеджеры',
  audience_en: 'Speed-reading schools · tutors · executives',
  session_minutes: '8-12 мин',
  sales_hook: '📖 Поле зрения шире на 30% к 4-й неделе. Удержание прочитанного +40%.',
  sales_hook_en: '📖 Visual span 30% wider by week 4. Retention of what you read +40%.',
  sales_hook_source: 'Edwards et al., 2005, J Gerontol — UFOV training expands visual span 22-35% (10-15 hours practice)',
  price_year: 690,
  group: 'themed',
  // Ядро v1.2.0 «1+1+1+1 + 5 темовых»: bias on attention/speed для скорочтения; +трекер 19.08.2026
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
    'phonemic_fluency',
    // 19.08.2026: удержать 3-4 цели можно только периферией — центральным не успеть.
    // Прямая мишень скорочтения, логично рядом с Шульте.
    'object_tracker',  // ещё логика — беглость речи
    /**
     * 21.08.2026 — по репорту человека ИЗ ЭТОГО ЖЕ ПРОФИЛЯ (19.07.2026, месяц без
     * ответа): «в профиле скорочтения нет мнемоники слов и чисел». Упражнение
     * существует и умеет ровно оба режима, которые он назвал (`words`/`numbers`), —
     * его просто не было в составе.
     *
     * 🔴 ЭТО НЕ «ПОПРОСИЛИ — ДОБАВИЛИ». Профиль описан четырьмя подсистемами, и
     * мнемоника попадает в третью — УДЕРЖАНИЕ прочитанного, туда же, где уже стоят
     * reading_span и story_recall. В курсах скорочтения (описание профиля прямо
     * ссылается на школу Васильевой) техники запоминания слов и чисел — штатная
     * часть программы, а не смежная тема: быстро прочитать и ничего не удержать
     * — не результат.
     */
    'mnemonics',       // ещё память — удержание прочитанного (подсистема ③)
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
  display_name: 'Стандарт',
  emoji: '🎁',
  color: '#f59e0b',
  description: '10 тренажёров · подобранный набор для старта',
  long_description: 'Набор для старта, без кода. По одному тренажёру из каждой категории: Шульте (внимание), Парные картинки (память), Мишени (реакция), Математический спринт + Считалка, Поиск отличий, Анаграммы, Ханойская башня, Сортировка товаров, N-back (рабочая память — облегчённая). Десять — это осознанный размер: полный каталог в первый день не помогает, а отпугивает. Остальные профили — такие же подборки под конкретную задачу, открываются кодом.',
  long_description_en: 'The starter set — no code needed. One trainer from each category: Schulte tables (attention), Picture Pairs (memory), Targets (reaction), Math Sprint + Counter, Spot the Difference, Anagrams, Tower of Hanoi, Goods Sort, N-back (working memory — light version). Themed profiles unlock with an access code.',
  audience: 'Знакомство с приложением',
  audience_en: 'First look at the app',
  session_minutes: '3-10 мин',
  sales_hook: '🎁 10 тренажёров без кода — по одному из каждой категории.',
  sales_hook_en: '🎁 10 trainers, no code needed — one from each category.',
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
    /**
     * Решение Дениса 03.09.2026: «Сортировка товаров» — в «Стандарт».
     *
     * Её не было в стартовом наборе, и её видели только те, кто нашёл
     * «Микро-релакс». А это самая длинная по удержанию игра каталога: сорок
     * уровней с растущими механиками, а не одна проба на три минуты. Прятать
     * такую за выбором профиля — терять её у всех, кто не полез в список.
     */
    'goods_sort',        // logic — длинная лестница уровней, лучший крючок каталога
  ],
  // v1.204.0, решение Дениса 16.08.2026: зарядка есть у ВСЕХ профилей.
  // Была выключена как «hook на подписку», но спрятанное не продаёт: блок просто
  // отсутствовал, и это читалось как отсутствие функции, а не как замок — Денис
  // сам принёс это как поломку. Набор игр внутри зарядки остаётся по профилю
  // (`allow` в src/services/warmup.ts), поэтому платный каталог не утекает.
  warmup_enabled: true,
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
  // Ядро v1.2.0 «1+1+1+1 + 5 темовых»: bias on attention + reaction; +«Навигатор» 19.08.2026
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
    'attention_conflict',
    // 19.08.2026. ⚠️ Оговорка честная: весь остальной набор про скорость реакции, а
    // «Навигатор» без гонки вовсе. Взят потому, что ориентация на маршруте —
    // профессиональная задача этой аудитории, а не потому что подходит по темпу.
    'navigator', // ещё action — тормозим импульс (опасность)
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
  // Ядро v1.2.0 «1+1+1+1 + 5 темовых»: bias on memory (профилактика деменции);
  // + четыре игры лаборатории 19.08.2026. Формула описывает ЯДРО, а не длину списка.
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
    'anagrams',
    // +4 из лаборатории 19.08.2026. Все четыре без часов и без проигрыша по времени —
    // думать можно сколько нужно. ⚠️ «Ритм и высота» сюда НЕ взята намеренно: верх её
    // диапазона 880 Гц, а возрастная потеря высоких частот реальна — сначала проверка
    // на человеке 60+, потом набор.
    'faces_names',       // ГЛАВНАЯ бытовая жалоба стареющей памяти, и её никто здесь не тренировал
    'navigator',         // топографическая дезориентация — ранний и самый пугающий признак
    'memory_palace',     // нагрузка растёт содержанием, а не скоростью
    'dots_connect',      // ошибка обратима «протянуть назад», проигрыша по времени нет          // ещё logic — vocab (когда много читали)
  ],
  morning_playlist: [
    { game_id: 'schulte_table', game_route: '/games/schulte',       difficulty: 'medium', settings: { size: 5 }, est_duration_sec: 60 },
    { game_id: 'digit_span',    game_route: '/games/digit-span',    difficulty: 'easy',   mode: 'forward', settings: { startLen: 4 }, est_duration_sec: 90 },
    { game_id: 'trail_making',  game_route: '/games/trail-making',  difficulty: 'easy',   mode: 'A', settings: { count: 8 }, est_duration_sec: 80 },
    { game_id: 'number_bonds',  game_route: '/games/number-bonds',  difficulty: 'easy',   settings: { trials: 8 }, est_duration_sec: 80 },
  ],
  evening_playlist: [
    // 19.08.2026: вечер — её слот. Задержку между изучением и проверкой даёт число
    // примеров, а не секундомер, поэтому правило «вечером таймеров нет» соблюдено.
    // Уровень 6: три человека, две помехи, два варианта ответа, фактов ещё нет.
    { game_id: 'faces_names',   game_route: '/games/faces-names',   difficulty: 'easy',   settings: { level: 6 }, est_duration_sec: 110 },
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
  // Ядро v1.2.0 «1+1+1+1 + 5 темовых»: bias on logic (decisions + risk);
  // + четыре игры лаборатории 19.08.2026. Формула описывает ЯДРО, а не длину списка.
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
    'math_sprint',
    // +4 из лаборатории 19.08.2026 — дешёвый локальный ход против дорогого глобального.
    'dots_connect',      // планирование под ограничением ресурса
    'one_line',          // цена ошибки видна не сразу, а через десять ходов
    'faces_names',       // имена на переговорах — прикладной навык, а не абстрактная память
    'memory_palace',     // повестка и порядок пунктов без записи       // ещё action — быстро считать в уме
  ],
  morning_playlist: [
    { game_id: 'switching_task', game_route: '/games/switching-task', difficulty: 'medium', settings: { trials: 20 }, est_duration_sec: 120 },
    { game_id: 'flanker',        game_route: '/games/flanker',        difficulty: 'medium', settings: { trials: 20 }, est_duration_sec: 90 },
    { game_id: 'n_back',         game_route: '/games/n-back',         difficulty: 'medium', settings: { nLevel: 2, modality: 'single', trials: 20 }, est_duration_sec: 90 },
    { game_id: 'math_sprint',    game_route: '/games/math-sprint',    difficulty: 'medium', settings: { duration: 60 }, est_duration_sec: 65 },
  ],
  evening_playlist: [
    // 19.08.2026: имена на переговорах — прикладной навык этой аудитории. Уровень 12:
    // четыре человека, три помехи, факт уже в деле. Отсчёта в игре нет — вечеру не мешает.
    { game_id: 'faces_names',  game_route: '/games/faces-names',  difficulty: 'medium', settings: { level: 12 }, est_duration_sec: 170 },
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
  // Ядро v1.2.0 «1+1+1+1 + 5 темовых»: bias on memory + action (скорость на экзамене);
  // + четыре игры лаборатории 19.08.2026. Формула описывает ЯДРО, а не длину списка.
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
    'counter',
    // +4 из лаборатории 19.08.2026.
    'memory_palace',     // метод мест — учебная техника в чистом виде: списки, определения, порядок
    'faces_names',       // имена авторов и терминов — то же связывание образа со словом
    'dots_connect',      // тихая головоломка без таймера, разгрузка между фокус-блоками
    'one_line',          // логика без языка и без счёта — годится любому факультету           // ещё action — устный счёт
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
  // v1.160 (репорты Вали): утро БОДРИТ, вечер УСПОКАИВАЕТ, и наборы больше не
  // пересекаются («зачем перед сном и с утра одни и те же игры»).
  // Матрица памяти уехала в утро — она на скорость («если быстро не успел, всё забыл»).
  morning_playlist: [
    { game_id: 'memory_matrix',    game_route: '/games/memory-matrix',    difficulty: 'easy', settings: { size: 3 }, est_duration_sec: 100 },
    { game_id: 'picture_pairs',    game_route: '/games/picture-pairs',    difficulty: 'easy', settings: { pairsCount: 6 }, est_duration_sec: 100 },
    { game_id: 'pattern',          game_route: '/games/pattern',          difficulty: 'easy', settings: { trials: 5 }, est_duration_sec: 90 },
  ],
  // Вечер: только затормаживающее. «Найди отличие» Валя хвалит («действительно
  // затормаживает»), «Поиск предметов» — спокойный hidden-object, финал — дыхание
  // 4-7-8 («успокоение, помогает заснуть») прямо в комплексе.
  evening_playlist: [
    { game_id: 'find_differences', game_route: '/games/find-differences', difficulty: 'easy', settings: { diffCount: 2 }, est_duration_sec: 90 },
    // Здесь стоял «Поиск предметов», и он был ошибкой в трёх шагах подряд.
    // v1.170: шаг заявлял 90 с, отрабатывал за 21 → поднял раунды 8 → 20.
    // v1.171: «первая игра три раза, а вторая двадцать — странно» → снизил до 10.
    // v1.173: «одна игра, потом сразу дыхание» — и вот это оказалось правдой:
    // шаг не проходился ВООБЩЕ. Причина в самой игре: цели и дистракторы
    // получают случайный поворот, а образец нарисован в одном положении, и
    // раунд не закрывается, пока не найдены все цели. За 14 дней — ни одной
    // сохранённой сессии по visual_search ни у кого.
    //
    // Подсказку в игре починили («в любом повороте»), но в ВЕЧЕРНЕМ наборе ей
    // не место и после этого: конъюнктивный поиск — нагрузка на внимание, а не
    // успокоение. Ставим парные картинки: тот же жанр, что и отличия в первом
    // шаге, из её же профиля, и заведомо проходятся.
    // Было picture_pairs — но она же лежит в утреннем пуле, и Валя получала одну игру
    // дважды за день: «Эта игра в утренней зарядке!!!!! Она не подходит на ночь!!!!!»
    // (репорт на v1.185.0). Маджонг того же спокойного жанра, но в утро не попадает.
    { game_id: 'mahjong',          game_route: '/games/mahjong',          difficulty: 'easy', est_duration_sec: 90 },
    // Четвёртый шаг добавлен 06.08 по требованию Дениса: «сделай 4 тогда, раз не
    // получается с тремя». Сортировка товаров — тот же казуальный жанр, что
    // отличия и парные картинки, из её же профиля, спокойная и заведомо проходится.
    { game_id: 'goods_sort',       game_route: '/games/goods-sort',       difficulty: 'easy', est_duration_sec: 90 },
    { game_id: 'breathing',        game_route: '/games/breathing',        difficulty: 'easy', settings: { tech: 'calm478' }, est_duration_sec: 120 },
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
    'listening_span',
    // memory — невербальный слух: ритм и высота (просодия, тоновые языки). 19.08.2026.
    // Три слуховые игры профиля работают через СЛОВО; здесь слух, не опирающийся на язык.
    'rhythm_pitch',    // memory — слуховой охват (слова на слух, порядок)
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

// C3a v1.122.1: порядок в свитчере по массовости аудитории (репорт Ребёнка:
// «женский сверху, дальше по частоте, влезть в один экран»). WOMEN первым,
// затем FREE (воронка), далее по убыванию массовости. ODV999 (owner) идёт
// первым в массиве, но скрыт из свитчера фильтром tier!=='owner'.
// ─── 🆕 НОВИНКИ — витрина свежего, не для продажи ───────────────────────
/**
 * ЗАЧЕМ ОТДЕЛЬНЫЙ ПРОФИЛЬ. Заказ Дениса: «сделать профиль (новое) и вгонять всё,
 * что обновлено существенно и сделаны новые упражнения». В каталоге 64 игры, и
 * свежая работа в нём тонет: человек не находит её и играет то же, что вчера.
 *
 * 🔴 СОСТАВ НЕ ЗАШИТ, А СЧИТАЕТСЯ ПО ДАТАМ. Список игр берётся из реестра
 * `freshGames.ts` по свежести. Зашитый руками список — это «новинки», которые
 * через три месяца показывают полугодовой давности работу и врут названием.
 * Здесь запись уходит из профиля сама, удалять её не надо.
 *
 * ⚠️ НЕ ПРОДАЁТСЯ. `tier: 'owner'` и нет цены: это витрина, а не набор под
 * задачу. Продавать «то, что мы недавно трогали» нечестно — состав меняется
 * каждый релиз, и купивший получил бы каждый месяц другое.
 */
const WHATSNEW: ProfileDef = {
  id: 'whatsnew',
  allow_sandbox: true,   // витрина нового — единственное место, где песочница уместна людям
  person: 'ODV999',            // тот же человек в сессиях: это не отдельная аудитория, а витрина
  display_name: 'Новинки',
  emoji: '🆕',
  color: '#22c55e',
  description: 'Новое и существенно обновлённое — за последние 3 месяца',
  long_description: 'Витрина свежей работы: сюда попадают новые упражнения и те, что переделаны существенно — новая механика, новые уровни, переделанный вид. Починки багов сюда не идут, для них есть «Что нового». Состав считается по датам и обновляется сам: игра уходит отсюда через три месяца после правки.',
  long_description_en: 'A shelf for fresh work: new exercises and those substantially reworked — new mechanics, new levels, a new look. Bug fixes do not go here; they live in “What’s new”. The list is computed from dates and refreshes itself: a game leaves three months after the change.',
  audience: 'Посмотреть, что нового',
  audience_en: 'See what changed',
  session_minutes: '5-15 мин',
  tier: 'showcase',   // виден в выборе, но не продаётся
  group: 'personal',
  /**
   * ⚠️ Считается ОДИН раз при загрузке модуля, а не на каждый показ. Состав
   * меняется по календарю, то есть не чаще раза в сутки — пересчитывать его на
   * каждый кадр незачем, а стабильность внутри сессии важнее: список,
   * меняющийся под рукой, читается как сбой.
   */
  allowed_games: freshGameIds(),
  warmup_enabled: true,
  financial_brain_day_enabled: false,
  assessment_enabled: false,
};

/** Что именно свежего — для показа на карточке профиля и в «Что нового». */
export const WHATSNEW_ENTRIES = freshEntries;

export const PROFILES: ProfileDef[] = [
  // Owner (Денис, full access, locked by master code) — скрыт из свитчера
  ODV999,
  // Витрина свежего — не продаётся, состав считается по датам
  WHATSNEW,
  // Themed — порядок по массовости аудитории (женский → массовые → нишевые)
  WOMEN,      // самая массовая казуальная аудитория
  FREE,       // бесплатный вход-воронка
  KIDS,       // родители/дети — массовый сегмент
  SENIORS,    // 50+ профилактика — массовый
  CHESS,      // шахматисты
  DRIVERS,    // Реакция ПРО — pro-профессии
  EXECS,      // предприниматели
  STUDENTS,   // студенты/экзамены
  NZT48,      // биохакеры — ниша
  VASILYEVA,  // скорочтение — ниша
  POLYGLOT,   // изучающие языки — ниша
];

export const PROFILE_BY_ID: Record<ProfileId, ProfileDef> = PROFILES.reduce((acc, p) => {
  acc[p.id] = p;
  return acc;
}, {} as Record<ProfileId, ProfileDef>);

/** Profiles grouped for Settings UI */
/**
 * ПОКАЗЫВАТЬ ЛИ ПРОФИЛЬ В ВЫБОРЕ. Одно правило на приложение, а не условие,
 * переписанное в разметке экрана.
 *
 * 🔴 Раньше фильтр жил прямо в свитчере строкой `p.tier !== 'owner'`, и проверить
 * его было нечем: профиль пропадал из выбора молча, будучи полностью заведённым.
 * Ровно так исчезли «Новинки» — заведены, переведены, состав считается по датам,
 * а в списке их нет. Теперь правило вынесено и проверяется исполнением.
 */
export function isSwitchable(p: ProfileDef): boolean {
  return p.tier !== 'owner';
}

/** Профили, скрытые из выбора НАМЕРЕННО, с причиной. Список закрыт. */
export const HIDDEN_FROM_SWITCHER: Record<string, string> = {
  odv999: 'полный доступ владельца, открывается мастер-кодом — в общем списке ему не место',
};

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

/** App Store guideline 3.1.1: разблокировка контента кодами, полученными вне
 *  Apple, запрещена (у Google Play redeem-код ок). На iOS прячем ВЕСЬ ввод
 *  кода доступа (онбординг, свитчер, настройки), пока не появится IAP.
 *  Тематические профили на iOS показываются как «Скоро». */
export const CODE_ENTRY_ENABLED = Platform.OS !== 'ios';

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
// v1.124.0: breathing видимо во ВСЕХ профилях (репорт «Дыхание не вижу в приложении»).
// Релакс/дыхание уместно в любом профиле, поэтому глобально, а не по whitelist каждого.
const ALWAYS_ALLOWED = new Set<string>(['picture_pairs', 'breathing']);

export function isGameAllowed(profile: ProfileDef, gameId: string): boolean {
  if (profile.allowed_games === 'all') return true;
  if (ALWAYS_ALLOWED.has(gameId)) return true;
  return profile.allowed_games.includes(gameId);
}

export function filterAllowedGames(profile: ProfileDef) {
  if (profile.allowed_games === 'all') return GAMES;
  const allowed = new Set(profile.allowed_games as string[]);
  /**
   * 🔴 РАЗВИЛКА ОТКРЫТА, ЕСЛИ ОТКРЫТА ХОТЬ ОДНА ИГРА ЗА НЕЙ.
   *
   * Профиль перечисляет УПРАЖНЕНИЯ, а не то, как они сгруппированы в меню. Когда
   * три судоку свели в один вход (21.08.2026), профили «Микро-релакс», «Дети» и
   * «Шахматист» продолжали разрешать `sudoku` — но карточку с меню убрали, а
   * развилки в их списках не было, и судоку пропало у всех троих. Дописать
   * развилку в три списка значит ждать того же от следующей: правило надёжнее.
   */
  const openHubs = new Set(
    GAMES.filter(g => g.mergedInto && allowed.has(g.id)).map(g => g.mergedInto as string),
  );
  /**
   * 🔴 ПЕСОЧНИЦА НЕ ПОПАДАЕТ К ЧЕЛОВЕКУ САМА. Профили перечисляли эти игры ещё
   * до того, как их признали сырыми (24 упоминания в списках). Вычищать списки
   * руками значило бы потерять эту работу и не суметь вернуть игру одним словом,
   * когда её доведут. Поэтому фильтр: в песочницу пускает только профиль, который
   * СПЕЦИАЛЬНО её просит — `allow_sandbox`.
   */
  const wantsSandbox = profile.allow_sandbox === true;
  return GAMES.filter(g => {
    if (g.sandbox && !wantsSandbox) return false;
    return ALWAYS_ALLOWED.has(g.id) || allowed.has(g.id) || openHubs.has(g.id);
  });
}
