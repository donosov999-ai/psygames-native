/**
 * 4 categories (v1.2.0, Lumosity-style).
 * Was 6 (memory/attention/logic/control/math/speed); collapsed to 4 for
 * simpler discovery + more balanced category sizes (12/7/14/14 instead of
 * lopsided 12/7/8/14/3/3).
 *
 * - 'memory'    — все memory games (12) — без изменений
 * - 'attention' — только pure attention (7) — без изменений
 * - 'logic'     — обдумать перед действием: logic + switching + risk (14)
 *                  was 'logic' (8) + Trail/Switching/WCST (3) + BART/Iowa/PRL (3)
 * - 'action'    — быстро и точно: inhibition + speed + math + social (14)
 *                  was 'control' inhibition (7) + 'speed' (3) + 'math' (3) + RMET (1)
 *
 * Legacy categories 'control', 'math', 'speed' are removed; their games
 * have been re-categorised to 'logic' or 'action' below.
 */
export type GameCategory =
  | 'memory'
  | 'attention'
  | 'logic'
  | 'intuition'
  | 'action'
  | 'recovery';

export interface GameConfig {
  id: string;
  nameKey: string;
  descKey: string;
  skillKey: string;
  gradient: string[];
  icon: string;
  route: string;
  category: GameCategory;
  /** Hide from main menu (still accessible by route via warmup/playlists/group cards) */
  hideFromMenu?: boolean;
  /**
   * ПЕСОЧНИЦА: игра доделана до работающей, но игровая динамика слабая.
   *
   * 🔴 ЗАЧЕМ ОТДЕЛЬНОЕ ПОНЯТИЕ. Денис 22.08.2026 прошёл восемь новых игр:
   * «почти все не соответствуют тому, что должно было быть… им пока место в
   * песочнице». Такие игры нельзя ни выбрасывать (работа сделана, дорабатывать
   * есть с чего), ни держать вперемешку с отработанными: человек открывает
   * приложение и получает сырое наравне с готовым, а мы получаем отзывы про
   * недоделки вместо отзывов про суть.
   *
   * Песочница — не свалка, а полка: игра доступна тому, кто хочет пробовать, но
   * не идёт ни в профили обычных людей, ни в счёт «сколько у нас упражнений».
   * Обещать в магазине то, что сами считаем сырым, нельзя.
   */
  sandbox?: boolean;
  /**
   * ЗА КАКОЙ РАЗВИЛКОЙ ЖИВЁТ ЭТА ИГРА, если её убрали из меню.
   *
   * 🔴 ЗАЧЕМ ПОЛЕМ, А НЕ КОММЕНТАРИЕМ. 21.08.2026 три судоку свели в один вход и
   * пометили `hideFromMenu`, а принадлежность к развилке осталась НАДПИСЬЮ
   * «merged into 'sudoku_group'». Отбор по профилю читает данные, а не надписи:
   * профили «Микро-релакс», «Дети» и «Шахматист» перечисляют в разрешённом
   * `sudoku`, самой развилки в их списках нет — и судоку пропало у всех троих.
   * Ни один гейт этого не заметил: каждая половина по отдельности была верна.
   *
   * Теперь принадлежность — данные, и `filterAllowedGames` показывает развилку,
   * если профилю разрешена ХОТЬ ОДНА игра за ней. Списки профилей править не
   * надо: они говорят про упражнения, а не про то, как те сгруппированы в меню.
   */
  mergedInto?: string;
  /**
   * КАРТОЧКА-ХАБ: не упражнение, а развилка на соседние игры.
   *
   * 🔴 ЗАЧЕМ ПРИЗНАК, А НЕ СПИСОК ИМЁН. Список хабов был выписан ПЯТЬ раз — в
   * рекомендациях, в вызове дня, в достижениях, на онбординге и в живом аудите
   * слотов. Пока хабов было два, пять копий совпадали; третий хаб (судоку) должен
   * был попасть в каждую, и любая забытая копия ломалась бы МОЛЧА и по-своему:
   * рекомендация звала бы в меню под подписью «этой ветке достаётся меньше», вызов
   * дня выдал бы экран, который не умеет записать партию, а достижение «весь
   * каталог» стало бы недостижимым навсегда. Теперь признак живёт при карточке, а
   * все пятеро читают `HUB_GAME_IDS`.
   */
  hub?: boolean;
  /**
   * Под каким `game_type` эта игра ПИШЕТ ПАРТИИ, если он не совпадает с `id`.
   *
   * ⚠️ ЗАЧЕМ. Счётчики нагрузки, достижения и история узнают игру по `game_type`
   * записанной партии, а каталог — по `id`. У 69 игр из 71 это одна и та же строка,
   * и расхождение двух оставшихся не видно ничем: код собирается, экран работает.
   * Фрактальная судоку пишет `sudoku_fractal`, а в каталоге лежит под
   * `sudoku-fractal` — через дефис. Из-за одного символа её партии не попадали в
   * нагрузку ветки логики ВООБЩЕ: человек, играющий её каждый день, для блока
   * «рекомендуем сегодня» логику не тренировал ни разу.
   *
   * Самурай писал в ЧУЖУЮ корзину `sudoku` — со своей лестницей уровней, своей
   * формулой очков (база 4000 против 1500) и своим полем 21×21. Уровни двух разных
   * игр лежали вперемешку, и вреда от этого было три: «лучшее время уровня 5» у
   * классической судоку было отчасти про самурая (из-за чего обе игры вообще не
   * попали в список игр с показом времени), сводка `getStats('sudoku')` мешала партии
   * на 81 клетке с партиями на 369, а достижение «весь каталог» засчитывало самурая
   * тому, кто в него не заходил ни разу. С 20.08.2026 корзина у самурая своя —
   * `sudoku_samurai`, тот же ключ, под которым он и так хранит незаконченную партию,
   * уровень и звёзды.
   */
  sessionType?: string;
}

export const CATEGORY_ORDER: GameCategory[] = [
  'memory',
  'attention',
  'logic',
  'intuition',
  'action',
  'recovery',
];

/** Видимые названия категорий живут в переводах (titleKey → LanguageContext),
 *  здесь только ключ/иконка/цвет. 'action' подписана «Скорость и самоконтроль»:
 *  прежнее «Скорость и торможение» тестировщики не понимали (см. коммент у catAction). */
export const CATEGORY_META: Record<GameCategory, { titleKey: string; icon: string; color: string }> = {
  memory:    { titleKey: 'catMemory',    icon: 'library-outline',         color: '#f093fb' },
  attention: { titleKey: 'catAttention', icon: 'eye-outline',             color: '#667eea' },
  logic:     { titleKey: 'catLogic',     icon: 'extension-puzzle-outline',color: '#a8c0ff' },
  intuition: { titleKey: 'catIntuition', icon: 'sparkles-outline',        color: '#a855f7' },
  action:    { titleKey: 'catAction',    icon: 'flash-outline',           color: '#fc466b' },
  recovery:  { titleKey: 'catRecovery',  icon: 'flower-outline',          color: '#36d1dc' },
};

export const GAMES: GameConfig[] = [
  // ATTENTION
  {
    id: 'schulte_table',
    nameKey: 'schulteTable',
    descKey: 'schulteTableDesc',
    skillKey: 'skillAttention',
    gradient: ['#667eea', '#764ba2'],
    icon: 'grid',
    route: '/games/schulte',
    category: 'attention',
  },
  {
    id: 'proofreading',
    nameKey: 'proofreading',
    descKey: 'proofreadingDesc',
    skillKey: 'skillFocus',
    gradient: ['#a8edea', '#fed6e3'],
    icon: 'search',
    route: '/games/proofreading',
    category: 'attention',
  },
  {
    id: 'find_differences',
    nameKey: 'findDiff',
    descKey: 'findDiffDesc',
    skillKey: 'skillDetailAttention',
    gradient: ['#34e89e', '#0f3443'],
    icon: 'search',
    route: '/games/find-differences',
    category: 'attention',
  },
  // ⚠️ Градиент зашит и в экране (GRADIENT в app/games/object-tracker.tsx): меняешь
  // здесь — меняй и там, иначе снаружи карточка одного цвета, а внутри игра другого.
  {
    id: 'object_tracker',
    sandbox: true,   // сырая динамика, см. поле `sandbox`
    nameKey: 'objectTracker',
    descKey: 'objectTrackerDesc',
    skillKey: 'skillAttention',
    gradient: ['#f59e0b', '#7c3aed'],
    icon: 'radio-button-on',
    route: '/games/object-tracker',
    category: 'attention',
  },
  {
    id: 'eye_gym',
    nameKey: 'eyeGym',
    descKey: 'eyeGymDesc',
    skillKey: 'skillEyeRelax',
    gradient: ['#43cea2', '#185a9d'],
    icon: 'eye',
    route: '/games/eye-gym',
    category: 'attention',
    hideFromMenu: true,   // вход — заметная карточка вверху главной (во ВСЕХ профилях); в сетке не дублируем
  },
  {
    id: 'goods_sort',
    nameKey: 'goodsSort',
    descKey: 'goodsSortDesc',
    skillKey: 'skillPlanningWM',
    gradient: ['#f7971e', '#ffd200'],
    icon: 'basket',
    route: '/games/goods-sort',
    category: 'logic',
  },

  // MEMORY
  {
    id: 'word_pairs',
    nameKey: 'wordPairs',
    descKey: 'wordPairsDesc',
    skillKey: 'skillMemory',
    gradient: ['#f093fb', '#f5576c'],
    icon: 'link',
    route: '/games/word-pairs',
    category: 'memory',
  },
  // v1.28.0 (Полиглот TIER 1 п.1): SRS-словарь — интервальные повторы SM-2
  {
    id: 'vocab_srs',
    nameKey: 'vocabSrs',
    descKey: 'vocabSrsDesc',
    skillKey: 'skillVocabulary',
    gradient: ['#6366f1', '#8b5cf6'],
    icon: 'school',
    route: '/games/vocab-srs',
    category: 'memory',
  },
  // v1.29.0 (Полиглот TIER 1 п.5): семантическая сортировка слов по категориям
  {
    id: 'semantic_sort',
    nameKey: 'semanticSort',
    descKey: 'semanticSortDesc',
    skillKey: 'skillVocabulary',
    gradient: ['#10b981', '#6366f1'],
    icon: 'albums',
    route: '/games/semantic-sort',
    category: 'memory',
  },
  // v1.29.0 (Полиглот TIER 1 п.4): Cloze — пропущенное слово во фразе
  {
    id: 'cloze',
    nameKey: 'cloze',
    descKey: 'clozeDesc',
    skillKey: 'skillVocabulary',
    gradient: ['#f59e0b', '#ef4444'],
    icon: 'create',
    route: '/games/cloze',
    category: 'logic',
  },
  // v1.29.0 (Полиглот TIER 1 п.2): лексическое решение — слово/не-слово
  {
    id: 'lexical_decision',
    nameKey: 'lexicalDecision',
    descKey: 'lexicalDecisionDesc',
    skillKey: 'skillVocabulary',
    gradient: ['#0ea5e9', '#6366f1'],
    icon: 'flash',
    route: '/games/lexical-decision',
    category: 'action',
  },
  // v1.104.0 (Полиглот TIER 2 — аудио, системный TTS): фонемы / псевдослова / слуховой охват
  {
    id: 'phoneme_pairs',
    nameKey: 'phonemePairs',
    descKey: 'phonemePairsDesc',
    skillKey: 'skillListening',
    gradient: ['#06b6d4', '#3b82f6'],
    icon: 'ear',
    route: '/games/phoneme-pairs',
    category: 'attention',
  },
  {
    /**
     * Тоны китайского (04.09.2026). Первое упражнение, где zh звучит и требует
     * ответа: до него китайский жил в приложении только иероглифами, и различать
     * тоны человеку было негде.
     */
    id: 'chinese_tones',
    nameKey: 'chineseTones',
    descKey: 'chineseTonesDesc',
    skillKey: 'skillListening',
    gradient: ['#b91c1c', '#c2410c'],
    icon: 'musical-note',
    route: '/games/chinese-tones',
    category: 'attention',
  },
  {
    id: 'pseudoword_echo',
    nameKey: 'pseudowordEcho',
    descKey: 'pseudowordEchoDesc',
    skillKey: 'skillListening',
    gradient: ['#8b5cf6', '#d946ef'],
    icon: 'mic',
    route: '/games/pseudoword-echo',
    category: 'memory',
  },
  // Индиго → бирюза. Предложенный лабораторией #7c3aed→#ec4899 ЗАНЯТ хабом
  // «Конфликт внимания» — две карточки читались бы близнецами.
  {
    id: 'rhythm_pitch',
    sandbox: true,   // сырая динамика, см. поле `sandbox`
    nameKey: 'rhythmPitch',
    descKey: 'rhythmPitchDesc',
    skillKey: 'skillListening',
    gradient: ['#4338ca', '#22d3ee'],
    icon: 'musical-notes',
    route: '/games/rhythm-pitch',
    category: 'memory',
  },
  {
    id: 'listening_span',
    nameKey: 'listeningSpan',
    descKey: 'listeningSpanDesc',
    skillKey: 'skillWorkingMemory',
    gradient: ['#0d9488', '#22c55e'],
    icon: 'headset',
    route: '/games/listening-span',
    category: 'memory',
  },
  // v1.105.0 «Слепые шахматы» — идея Дениса: маскированные фигуры, позиция в голове
  {
    id: 'chess_blind',
    nameKey: 'chessBlind',
    descKey: 'chessBlindDesc',
    skillKey: 'skillVisualMemory',
    gradient: ['#334155', '#0f172a'],
    icon: 'grid',
    route: '/games/chess-blind',
    category: 'memory',
  },
  {
    id: 'mnemonics',
    nameKey: 'mnemonics',
    descKey: 'mnemonicsDesc',
    skillKey: 'skillSequence',
    gradient: ['#4facfe', '#00f2fe'],
    icon: 'bulb',
    route: '/games/mnemonics',
    category: 'memory',
  },
  // ⚠️ id менять нельзя: этим ключом уже записаны уровень, звёзды, незаконченная
  // партия и game_type в истории сессий — переименование стирает весь прогресс.
  // Градиент под вуалью GradientSurface: сплошным цветом белый берёт на фиолетовом
  // только 4.23, до AA не хватает.
  {
    id: 'memory_palace',
    sandbox: true,   // сырая динамика, см. поле `sandbox`
    nameKey: 'memoryPalace',
    descKey: 'memoryPalaceDesc',
    skillKey: 'skillSequence',
    gradient: ['#8b5cf6', '#0f766e'],
    icon: 'map',
    route: '/games/memory-palace',
    category: 'memory',
  },
  {
    id: 'n_back',
    nameKey: 'nBack',
    descKey: 'nBackDesc',
    skillKey: 'skillWorkingMemory',
    gradient: ['#5b86e5', '#36d1dc'],
    icon: 'analytics',
    route: '/games/n-back',
    category: 'memory',
  },
  {
    id: 'digit_span',
    nameKey: 'digitSpan',
    descKey: 'digitSpanDesc',
    skillKey: 'skillShortTermMemory',
    gradient: ['#11998e', '#38ef7d'],
    icon: 'call',
    route: '/games/digit-span',
    category: 'memory',
    hideFromMenu: true,
    mergedInto: 'span_group', // merged into 'span_group'
  },
  {
    id: 'memory_matrix',
    nameKey: 'memoryMatrix',
    descKey: 'memoryMatrixDesc',
    skillKey: 'skillVisualMemory',
    gradient: ['#8e2de2', '#4a00e0'],
    icon: 'grid',
    route: '/games/memory-matrix',
    category: 'memory',
  },
  {
    id: 'picture_pairs',
    nameKey: 'picturePairs',
    descKey: 'picturePairsDesc',
    skillKey: 'skillVisualMemory',
    gradient: ['#f857a6', '#ff5858'],
    icon: 'heart',
    route: '/games/picture-pairs',
    category: 'memory',
  },
  // ⚠️ Градиент менять только с пересчётом: onGradientText считает по ОБОИМ концам,
  // и тот же цвет уходит внутрь партии подписью на кнопках ответа.
  {
    id: 'faces_names',
    sandbox: true,   // сырая динамика, см. поле `sandbox`
    nameKey: 'facesNames',
    descKey: 'facesNamesDesc',
    skillKey: 'skillMemory',
    gradient: ['#7c3f58', '#256f68'],
    icon: 'people',
    route: '/games/faces-names',
    category: 'memory',
  },
  // Маджонг-солитёр: ищи парные СВОБОДНЫЕ тайлы в псевдо-3D пирамиде, убирай всё.
  {
    id: 'mahjong',
    nameKey: 'mahjong',
    descKey: 'mahjongDesc',
    skillKey: 'skillVisualSearch',
    gradient: ['#2d6a4f', '#95d5b2'],
    icon: 'grid',
    route: '/games/mahjong',
    category: 'memory',
  },
  {
    id: 'reading_span',
    nameKey: 'readingSpan',
    descKey: 'readingSpanDesc',
    skillKey: 'skillWorkingMemory',
    gradient: ['#1f4037', '#99f2c8'],
    icon: 'book',
    route: '/games/reading-span',
    category: 'memory',
  },
  {
    id: 'corsi',
    nameKey: 'corsi',
    descKey: 'corsiDesc',
    skillKey: 'skillVisualMemory',
    gradient: ['#0083B0', '#00B4DB'],
    icon: 'grid',
    route: '/games/corsi',
    category: 'memory',
    hideFromMenu: true,
    mergedInto: 'span_group', // merged into 'span_group'
  },
  {
    id: 'ospan',
    nameKey: 'ospan',
    descKey: 'ospanDesc',
    skillKey: 'skillWorkingMemory',
    gradient: ['#cb356b', '#bdfff3'],
    icon: 'calculator',
    route: '/games/ospan',
    category: 'memory',
  },
  {
    id: 'spatial_span',
    nameKey: 'spatialSpan',
    descKey: 'spatialSpanDesc',
    skillKey: 'skillVisualMemory',
    gradient: ['#1A2980', '#26D0CE'],
    icon: 'apps',
    route: '/games/spatial-span',
    category: 'memory',
    hideFromMenu: true,
    mergedInto: 'span_group', // merged into 'span_group'
  },
  // ⚠️ Тот же градиент зашит в экране (GRADIENT в app/games/navigator.tsx).
  {
    id: 'navigator',
    sandbox: true,   // сырая динамика, см. поле `sandbox`
    nameKey: 'navigator',
    descKey: 'navigatorDesc',
    skillKey: 'skillSpatial',
    gradient: ['#2563eb', '#14b8a6'],
    icon: 'compass',
    route: '/games/navigator',
    category: 'memory',
  },
  // Group card combining digit_span + corsi + spatial_span
  {
    id: 'span_group',
    nameKey: 'spanGroup',
    descKey: 'spanGroupDesc',
    skillKey: 'skillShortTermMemory',
    gradient: ['#0ea5e9', '#10b981'],
    icon: 'albums',
    route: '/games/span',
    category: 'memory',
    hub: true,
  },

  // LOGIC / REASONING
  {
    id: 'hanoi',
    nameKey: 'hanoi',
    descKey: 'hanoiDesc',
    skillKey: 'skillProblemSolving',
    gradient: ['#a8c0ff', '#3f2b96'],
    icon: 'extension-puzzle',
    route: '/games/hanoi',
    category: 'logic',
  },
  // Карточка-развилка на три доски судоку. Стоит первой из четырёх записей судоку:
  // это единственный вход, остальные три скрыты и открываются отсюда.
  {
    id: 'sudoku_group',
    nameKey: 'sudokuGroup',
    descKey: 'sudokuGroupDesc',
    skillKey: 'skillLogic',
    // Тёмная пара семейства судоку: сплошной цвет текста берёт AA (7.00), вуаль не
    // нужна. Светлая пара #5b4d9e→#86a8e7 давала 3.00 — поймано гейтом контраста.
    gradient: ['#3b2f7a', '#5b4d9e'],
    icon: 'apps',
    route: '/games/sudoku-hub',
    category: 'logic',
    hub: true,
  },
  {
    id: 'sudoku',
    nameKey: 'sudoku',
    descKey: 'sudokuDesc',
    skillKey: 'skillLogic',
    gradient: ['#7f7fd5', '#86a8e7'],
    icon: 'apps',
    route: '/games/sudoku',
    category: 'logic',
    hideFromMenu: true,
    mergedInto: 'sudoku_group',
  },
  // Самурай стоит сразу за судоку намеренно: это её длинная форма, и человек находит
  // её в тот момент, когда обычная 9×9 уже даётся легко.
  //
  // ⚠️ Экран существует с v1.186.0, но в КАТАЛОГЕ его не было: среди шести десятков
  // карточек самурай не показывался. Найти его можно было только одним путём — зайти
  // в обычную судоку и заметить ссылку на экране настроек. То есть игра на 539 строк,
  // с девятью уровнями и проверкой единственности решения, доставалась лишь тем, кто
  // уже открыл другую игру и долистал до конца её настроек.
  {
    id: 'sudoku-samurai',
    nameKey: 'samuraiTitle',
    descKey: 'samuraiDesc',
    skillKey: 'skillLogic',
    gradient: ['#5b4d9e', '#7f7fd5'],
    icon: 'grid',
    route: '/games/sudoku-samurai',
    category: 'logic',
    hideFromMenu: true,
    mergedInto: 'sudoku_group',
    sessionType: 'sudoku_samurai',   // id через дефис, а партия пишется через подчёркивание
  },
  // Фрактальная судоку — вторая длинная форма после самурая. Стоит рядом с ними
  // намеренно: обе живут часами, и человек находит их там, где ищет «что-то
  // подольше обычной партии».
  {
    id: 'sudoku-fractal',
    nameKey: 'fractalTitle',
    descKey: 'fractalDesc',
    skillKey: 'skillLogic',
    gradient: ['#5b4d9e', '#7f7fd5'],
    icon: 'git-network',
    route: '/games/sudoku-fractal',
    category: 'logic',
    hideFromMenu: true,
    mergedInto: 'sudoku_group',
    sessionType: 'sudoku_fractal',   // id через дефис, а партия пишется через подчёркивание
  },
  // Бездна — марафонская форма фрактала («их масштаб», Денис 28.08): дерево
  // глубиной до трёх слоёв, тысячи вложенных сеток. Живёт в групп-карте судоку
  // рядом с фракталом-«боссом»; вход есть и с его экрана настройки.
  {
    id: 'sudoku-fractal-deep',
    nameKey: 'deepTitle',
    descKey: 'deepDesc',
    skillKey: 'skillLogic',
    gradient: ['#312e63', '#5b4d9e'],
    icon: 'layers',
    route: '/games/sudoku-fractal-deep',
    category: 'logic',
    hideFromMenu: true,
    mergedInto: 'sudoku_group',
    sessionType: 'sudoku_fractal_deep',   // id через дефис, а партия пишется через подчёркивание
  },
  {
    id: 'anagrams',
    nameKey: 'anagrams',
    descKey: 'anagramsDesc',
    skillKey: 'skillVerbal',
    gradient: ['#ee9ca7', '#ffdde1'],
    icon: 'language',
    route: '/games/anagrams',
    category: 'logic',
  },
  {
    id: 'pattern',
    nameKey: 'pattern',
    descKey: 'patternDesc',
    skillKey: 'skillReasoning',
    gradient: ['#7028e4', '#e5b2ca'],
    icon: 'analytics',
    route: '/games/pattern',
    category: 'logic',
  },
  {
    id: 'set_game',
    nameKey: 'setGame',
    descKey: 'setGameDesc',
    skillKey: 'skillReasoning',
    gradient: ['#43cea2', '#185a9d'],
    icon: 'shapes',
    route: '/games/set-game',
    category: 'logic',
  },
  {
    id: 'mental_rotation',
    nameKey: 'mentalRotation',
    descKey: 'mentalRotationDesc',
    skillKey: 'skillSpatial',
    gradient: ['#5614b0', '#dbd65c'],
    icon: 'cube',
    route: '/games/mental-rotation',
    category: 'logic',
  },
  {
    id: 'tower_london',
    nameKey: 'towerLondon',
    descKey: 'towerLondonDesc',
    skillKey: 'skillPlanning',
    gradient: ['#3a1c71', '#d76d77'],
    icon: 'git-branch',
    route: '/games/tower-london',
    category: 'logic',
  },
  // ⚠️ Градиент зашит в экране и по нему посчитан цвет текста на плашке: оба конца
  // берут AA белым (5.17 и 5.47), вуаль не нужна. Меняешь — пересчитывай.
  /**
   * «Пауза» — хаб телесных практик из лаборатории (10 карточек, 42 программы,
   * 156 шагов). Стоит РЯДОМ с «Дыханием» и «Гимнастикой для глаз», а не вместо:
   * у тех есть история сессий и достижения живых игроков, слияние — отдельное
   * решение с миграцией. Категория `recovery`, а не `logic`: здесь ничего не
   * измеряется и не оценивается, это не когнитивная проба.
   */
  {
    id: 'pause',
    nameKey: 'pause',
    descKey: 'pauseDesc',
    skillKey: 'skillRecovery',
    gradient: ['#0f766e', '#134e4a'],
    icon: 'body',
    route: '/games/pause',
    category: 'recovery',
  },
  {
    id: 'dots_connect',
    sandbox: true,   // сырая динамика, см. поле `sandbox`
    nameKey: 'dotsConnect',
    descKey: 'dotsConnectDesc',
    skillKey: 'skillPlanning',
    gradient: ['#2563eb', '#0f766e'],
    icon: 'share-social',
    route: '/games/dots-connect',
    category: 'logic',
  },
  // ⚠️ Тот же градиент зашит в экране. Левый конец сдвинут с #7c3aed нарочно:
  // тот совпадал с хабом «Конфликт внимания». Белый даёт 7.90 и 4.60 — вуаль не нужна.
  {
    id: 'one_line',
    sandbox: true,   // сырая динамика, см. поле `sandbox`
    nameKey: 'oneLine',
    descKey: 'oneLineDesc',
    skillKey: 'skillPlanning',
    gradient: ['#4338ca', '#db2777'],
    icon: 'share-social',
    route: '/games/one-line',
    category: 'logic',
  },

  // CONTROL / INHIBITION
  // Group card: Stroop + Stroop-emotional + Flanker (interference resolution)
  {
    id: 'attention_conflict',
    nameKey: 'attentionConflict',
    descKey: 'attentionConflictDesc',
    skillKey: 'skillInhibition',
    gradient: ['#7c3aed', '#ec4899'],
    icon: 'layers',
    route: '/games/attention-conflict',
    category: 'action',
    hub: true,
  },
  // Group card: Go/No-Go + Stop-Signal (action restraint vs cancellation)
  // 04.09.2026: переехала ВНУТРЬ хаба «Конфликт внимания» (решение Дениса). Обе
  // подпробы уже были помечены mergedInto: 'attention_conflict', а карточка
  // висела отдельно — набор жил в двух местах сразу.
  {
    id: 'inhibition',
    nameKey: 'inhibition',
    descKey: 'inhibitionDesc',
    skillKey: 'skillInhibition',
    gradient: ['#11998e', '#ee0979'],
    icon: 'hand-left',
    route: '/games/inhibition',
    category: 'action',
    hideFromMenu: true,
    mergedInto: 'attention_conflict',
  },
  {
    id: 'stroop',
    nameKey: 'stroop',
    descKey: 'stroopDesc',
    skillKey: 'skillInhibition',
    gradient: ['#fc466b', '#3f5efb'],
    icon: 'eye',
    route: '/games/stroop',
    category: 'action',
    hideFromMenu: true,
    mergedInto: 'attention_conflict', // merged into 'attention_conflict'
  },
  {
    id: 'go_no_go',
    nameKey: 'goNoGo',
    descKey: 'goNoGoDesc',
    skillKey: 'skillInhibition',
    gradient: ['#11998e', '#38ef7d'],
    icon: 'pause-circle',
    route: '/games/go-no-go',
    category: 'action',
    hideFromMenu: true,
    mergedInto: 'attention_conflict', // через групповую карточку «Торможение»
  },
  {
    id: 'stop_signal',
    nameKey: 'stopSignal',
    descKey: 'stopSignalDesc',
    skillKey: 'skillInhibition',
    gradient: ['#ee0979', '#ff6a00'],
    icon: 'hand-left',
    route: '/games/stop-signal',
    category: 'action',
    hideFromMenu: true,
    mergedInto: 'attention_conflict', // через групповую карточку «Торможение»
  },
  {
    id: 'trail_making',
    nameKey: 'trailMaking',
    descKey: 'trailMakingDesc',
    skillKey: 'skillSwitching',
    gradient: ['#fc6076', '#ff9a44'],
    icon: 'swap-horizontal',
    route: '/games/trail-making',
    category: 'logic',
  },
  {
    id: 'switching_task',
    nameKey: 'switchingTask',
    descKey: 'switchingTaskDesc',
    skillKey: 'skillSwitching',
    gradient: ['#7873f5', '#ff6ec4'],
    icon: 'swap-horizontal',
    route: '/games/switching-task',
    category: 'logic',
  },
  {
    id: 'wcst',
    nameKey: 'wcst',
    descKey: 'wcstDesc',
    skillKey: 'skillSwitching',
    gradient: ['#834d9b', '#d04ed6'],
    icon: 'shuffle',
    route: '/games/wcst',
    category: 'intuition',
  },
  {
    id: 'flanker',
    nameKey: 'flanker',
    descKey: 'flankerDesc',
    skillKey: 'skillInhibition',
    gradient: ['#16222a', '#3a6073'],
    icon: 'flash',
    route: '/games/flanker',
    category: 'action',
    hideFromMenu: true,
    mergedInto: 'attention_conflict', // merged into 'attention_conflict'
  },
  {
    id: 'stroop_emotional',
    nameKey: 'stroopEmotional',
    descKey: 'stroopEmotionalDesc',
    skillKey: 'skillInhibition',
    gradient: ['#8E2DE2', '#4A00E0'],
    icon: 'heart-dislike',
    route: '/games/stroop-emotional',
    category: 'action',
    hideFromMenu: true,
    mergedInto: 'attention_conflict', // merged into 'attention_conflict'
  },
  {
    id: 'bart',
    nameKey: 'bart',
    descKey: 'bartDesc',
    skillKey: 'skillRisk',
    gradient: ['#ff5e62', '#ff9966'],
    icon: 'warning',
    route: '/games/bart',
    category: 'intuition',
  },
  {
    id: 'iowa',
    nameKey: 'iowa',
    descKey: 'iowaDesc',
    skillKey: 'skillRisk',
    gradient: ['#0F2027', '#2C5364'],
    icon: 'cash',
    route: '/games/iowa',
    category: 'intuition',
  },
  {
    id: 'prl',
    nameKey: 'prl',
    descKey: 'prlDesc',
    skillKey: 'skillRisk',
    gradient: ['#1e3c72', '#2a5298'],
    icon: 'trending-up',
    route: '/games/prl',
    category: 'intuition',
  },

  // MATH
  {
    id: 'counter',
    nameKey: 'counter',
    descKey: 'counterDesc',
    skillKey: 'skillMath',
    gradient: ['#fa709a', '#fee140'],
    icon: 'add-circle',
    route: '/games/counter',
    category: 'action',
  },
  {
    id: 'math_slider',
    nameKey: 'mathSlider',
    descKey: 'mathSliderDesc',
    skillKey: 'skillMath',
    gradient: ['#5b4ee8', '#12a594'],
    icon: 'options',
    route: '/games/math-slider',
    category: 'action',
  },
  {
    id: 'math_sprint',
    nameKey: 'mathSprint',
    descKey: 'mathSprintDesc',
    skillKey: 'skillMath',
    gradient: ['#fc4a1a', '#f7b733'],
    icon: 'calculator',
    route: '/games/math-sprint',
    category: 'action',
  },
  {
    id: 'number_bonds',
    nameKey: 'numberBonds',
    descKey: 'numberBondsDesc',
    skillKey: 'skillMath',
    gradient: ['#36d1dc', '#5b86e5'],
    icon: 'git-merge',
    route: '/games/number-bonds',
    category: 'action',
  },

  // SPEED / REACTION
  {
    id: 'targets',
    nameKey: 'targets',
    descKey: 'targetsDesc',
    skillKey: 'skillReaction',
    gradient: ['#ff0844', '#ffb199'],
    icon: 'disc',
    route: '/games/targets',
    category: 'action',
    // 04.09.2026: переехала внутрь хаба «Конфликт внимания» (решение Дениса) —
    // ось та же, что у Go/No-Go: жать на мишень, держать руку на остальном.
    hideFromMenu: true,
    mergedInto: 'attention_conflict',
  },
  {
    id: 'choice_rt',
    nameKey: 'choiceRt',
    descKey: 'choiceRtDesc',
    skillKey: 'skillReaction',
    gradient: ['#fdc830', '#f37335'],
    icon: 'arrow-forward-circle',
    route: '/games/choice-rt',
    category: 'action',
  },
  {
    id: 'visual_search',
    nameKey: 'visualSearch',
    descKey: 'visualSearchDesc',
    skillKey: 'skillFocus',
    gradient: ['#536976', '#292e49'],
    icon: 'scan',
    route: '/games/visual-search',
    category: 'attention',
  },
  {
    id: 'sdmt',
    nameKey: 'sdmt',
    descKey: 'sdmtDesc',
    skillKey: 'skillProcessingSpeed',
    gradient: ['#0f2027', '#2c5364'],
    icon: 'apps',
    route: '/games/sdmt',
    category: 'action',
  },
  {
    id: 'posner',
    nameKey: 'posner',
    descKey: 'posnerDesc',
    skillKey: 'skillFocus',
    gradient: ['#3a6186', '#89253e'],
    icon: 'navigate',
    route: '/games/posner',
    category: 'attention',
  },
  {
    id: 'ant',
    nameKey: 'ant',
    descKey: 'antDesc',
    skillKey: 'skillFocus',
    gradient: ['#005C97', '#363795'],
    icon: 'git-network',
    route: '/games/ant',
    category: 'attention',
  },
  {
    id: 'quick_count',
    nameKey: 'quickCount',
    descKey: 'quickCountDesc',
    skillKey: 'skillAttention',
    gradient: ['#f7971e', '#ffd200'],
    icon: 'flash',
    route: '/games/quick-count',
    category: 'attention',
  },
  {
    id: 'cpt',
    nameKey: 'cpt',
    descKey: 'cptDesc',
    skillKey: 'skillSustainedAttention',
    gradient: ['#0f4c75', '#3282b8'],
    icon: 'time',
    route: '/games/cpt',
    category: 'attention',
  },
  {
    id: 'phonemic_fluency',
    nameKey: 'phonemic',
    descKey: 'phonemicDesc',
    skillKey: 'skillVerbal',
    gradient: ['#16a085', '#f4d03f'],
    icon: 'chatbubbles',
    route: '/games/phonemic-fluency',
    category: 'logic',
  },
  {
    id: 'story_recall',
    nameKey: 'story',
    descKey: 'storyDesc',
    skillKey: 'skillMemory',
    gradient: ['#654ea3', '#eaafc8'],
    icon: 'book',
    route: '/games/story-recall',
    category: 'memory',
  },
  {
    id: 'rmet',
    nameKey: 'rmet',
    descKey: 'rmetDesc',
    skillKey: 'skillSocial',
    gradient: ['#fc466b', '#a445b2'],
    icon: 'eye',
    route: '/games/rmet',
    category: 'action',
  },
  // ─── 48-я игра (v1.9.0): Simon Task ─────────────────────────────────
  // Классика inhibitory control: цветной квадрат появляется слева/справа,
  // правильная сторона ответа определяется ЦВЕТОМ (синий→левая, красный→
  // правая), но позиция стимула сбивает реакцию. Simon Effect = разница
  // RT incongruent − congruent.
  {
    id: 'simon',
    nameKey: 'simon',
    descKey: 'simonDesc',
    skillKey: 'skillInhibition',
    gradient: ['#1e3a8a', '#7f1d1d'],
    icon: 'flash',
    route: '/games/simon',
    category: 'action',
    hideFromMenu: true,
    mergedInto: 'attention_conflict', // v1.9.1 — merged into 'attention_conflict' (4-я парадигма
                        // interference resolution рядом со Stroop/Flanker)
  },
  // RECOVERY (восстановление — не-когнитивные передышки)
  {
    id: 'breathing',
    nameKey: 'breathing',
    descKey: 'breathingDesc',
    skillKey: 'skillRecovery',
    gradient: ['#5b86e5', '#36d1dc'],
    icon: 'flower-outline',
    route: '/games/breathing',
    category: 'recovery',
  },
];

/**
 * ЕДИНЫЙ СПИСОК КАРТОЧЕК-ХАБОВ. Выводится из самого каталога — второго списка имён
 * в проекте больше нет.
 *
 * 🔴 ЗАЧЕМ. Отдельным списком хабы были выписаны пять раз (рекомендации, вызов дня,
 * достижения, онбординг, живой аудит слотов). Пока их было два, копии совпадали;
 * третий обязан попасть во все пять, и забытая копия ломается молча — разбор в
 * комментарии к полю `hub` выше.
 */
export const HUB_GAME_IDS: readonly string[] = GAMES.filter((g) => g.hub).map((g) => g.id);

/** Хаб ли это — меню, а не упражнение. */
/**
 * ЛЕЖИТ ЛИ ИГРА В ПЕСОЧНИЦЕ — один вопрос для всех, кто подсовывает игру человеку.
 *
 * 🔴 ЗАЧЕМ ФУНКЦИЕЙ. 22.08.2026 песочницу завели и закрыли ей ОДНУ дверь из
 * четырёх — каталог главного экрана. Мимо остались вызов дня, выбор первой игры
 * в онбординге и шаги зарядки, где четыре сырые игры зашиты прямо в плейлисты.
 * Человек получал сырое, не заходя в каталог вовсе.
 *
 * Проверять поле руками в каждом сервисе — тот же способ пропустить пятую дверь.
 */
export function isSandboxGame(id: string): boolean {
  return GAMES.some((g) => g.id === id && g.sandbox === true);
}

export function isHubGame(id: string): boolean {
  return HUB_GAME_IDS.includes(id);
}

/**
 * Под каким `game_type` игра пишет партии. Совпадает с `id` у 69 карточек из 72 и
 * НЕ совпадает у двух судоку — разбор в комментарии к полю `sessionType` выше.
 * Всё, что считает партии человека, обязано спрашивать игру этой функцией, а не
 * брать `id` напрямую.
 */
export function sessionTypeOf(g: GameConfig): string {
  return g.sessionType ?? g.id;
}

/**
 * ОБРАТНАЯ СТОРОНА `sessionTypeOf`: под какую игру ЗАПИСАНА уже сохранённая партия.
 *
 * 🔴 ЗАЧЕМ ОТДЕЛЬНАЯ ФУНКЦИЯ, А НЕ ПРОСТО `s.game_type`. До 20.08.2026 самурай писал
 * в корзину `sudoku`, и на устройствах людей эти партии так и лежат — вперемешку с
 * классическими, со своей лестницей уровней. Разводить корзины только «с сегодняшнего
 * дня» значило бы оставить историю классической судоку с примесью навсегда: у неё
 * появилось бы «лучшее время уровня 5», отчасти взятое из чужой игры, и оно бы
 * НИКОГДА не исправилось — рекорд по определению не вытесняется новыми партиями.
 *
 * ⚠️ ПРИЗНАК ДЛЯ РАЗДЕЛЕНИЯ ЗАДНИМ ЧИСЛОМ ЕСТЬ, И ОН НЕ ВЫДУМАН. Экран самурая пишет
 * `details.samurai: true` с ПЕРВОГО СВОЕГО КОММИТА (d7a703c2, «feat(sudoku): Samurai
 * mode»), где строка `details: { errors, completed: true, samurai: true }` появилась
 * вместе с `game_type: 'sudoku'`. Проверено по истории репозитория, а не по памяти:
 * версии экрана без этого поля не существовало. Значит ни одной неразличимой партии
 * самурая на свете нет, и списывать старые записи («не считать в сравнениях») не за
 * что — их можно просто вернуть владельцу.
 *
 * Правило одностороннее и повторяемое сколько угодно раз: классическая судоку этого
 * поля не пишет вовсе, а запись, уже названная `sudoku_samurai`, возвращает саму себя.
 */
export function sessionGameType(s: { game_type?: string; details?: Record<string, any> | null }): string {
  const t = s.game_type ?? '';
  if (t === 'sudoku' && s.details && (s.details as any).samurai === true) return 'sudoku_samurai';
  return t;
}

// Russian words for word games
export const RUSSIAN_WORDS = [
  'дом', 'кот', 'солнце', 'книга', 'река', 'лес', 'окно', 'стол', 'дверь', 'дорога',
  'мама', 'папа', 'брат', 'сестра', 'дедушка', 'бабушка', 'друг', 'школа', 'город', 'страна',
  'вода', 'огонь', 'земля', 'воздух', 'небо', 'звезда', 'луна', 'море', 'гора', 'поле',
  'машина', 'поезд', 'самолет', 'корабль', 'велосипед', 'автобус', 'трамвай', 'метро', 'такси', 'ракета',
  'яблоко', 'банан', 'апельсин', 'виноград', 'арбуз', 'дыня', 'персик', 'слива', 'груша', 'вишня',
];

// English words for word games
export const ENGLISH_WORDS = [
  'house', 'cat', 'sun', 'book', 'river', 'forest', 'window', 'table', 'door', 'road',
  'mother', 'father', 'brother', 'sister', 'grandpa', 'grandma', 'friend', 'school', 'city', 'country',
  'water', 'fire', 'earth', 'air', 'sky', 'star', 'moon', 'sea', 'mountain', 'field',
  'car', 'train', 'plane', 'ship', 'bike', 'bus', 'tram', 'metro', 'taxi', 'rocket',
  'apple', 'banana', 'orange', 'grape', 'melon', 'peach', 'plum', 'pear', 'cherry', 'mango',
];

// Russian alphabet for proofreading
export const RUSSIAN_ALPHABET = 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЭЮЯ';

// English alphabet for proofreading
export const ENGLISH_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
