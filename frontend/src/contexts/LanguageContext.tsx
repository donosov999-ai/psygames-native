import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import esT from './translations/es';
import ptT from './translations/pt';
import hiT from './translations/hi';
import zhT from './translations/zh';
import deT from './translations/de';
import frT from './translations/fr';
import itT from './translations/it';
import jaT from './translations/ja';
import koT from './translations/ko';
import arT from './translations/ar';

type Language = 'ru' | 'en' | 'es' | 'de' | 'zh' | 'hi' | 'pt' | 'fr' | 'it' | 'ja' | 'ko' | 'ar';

/** v1.22.0: 6 базовых языков. Ключи, переведённые только на ru/en, в t()
 *  падают на EN → приложение работает на всех 6, наполнение es/de/zh/hi
 *  доезжает отдельными проходами. */
export const LANGUAGES: { code: Language; name: string }[] = [
  { code: 'en', name: 'English' },   // БАЗА (источник). Остальное — переводы.
  { code: 'es', name: 'Español' },   // крупный рынок
  { code: 'pt', name: 'Português' }, // Бразилия — топ-3 рынок Play по объёму
  { code: 'hi', name: 'हिन्दी' },      // India — #1 рынок Google Play по объёму
  { code: 'zh', name: '中文' },
  { code: 'de', name: 'Deutsch' },
  { code: 'fr', name: 'Français' },
  { code: 'it', name: 'Italiano' },
  { code: 'ja', name: '日本語' },
  { code: 'ko', name: '한국어' },
  { code: 'ar', name: 'العربية' },
  { code: 'ru', name: 'Русский' },
];
const LANG_CODES = LANGUAGES.map((l) => l.code) as string[];

/** Машинные переводы контента (493 ключа на язык), сгенерированы воркфлоу
 *  translate-psygames-i18n. en/ru — инлайн в translations ниже; es/pt/hi/zh/de
 *  — здесь. t() смотрит: инлайн → overlay → EN → RU → key. */
const OVERLAYS: Partial<Record<Language, Record<string, string>>> = {
  es: esT, pt: ptT, hi: hiT, zh: zhT, de: deT,
  // v1.129.0: паритет с сайтом (транскреация с EN-базы; ar готов в translations/, ждёт RTL-заход)
  fr: frT, it: itT, ja: jaT, ko: koT, ar: arT,
};

interface Translations {
  [key: string]: {
    ru: string;
    en: string;
    es?: string;
    de?: string;
    zh?: string;
    hi?: string;
    pt?: string;
    // v1.129.0: инлайн-переводы для этих языков не ведём — живут в OVERLAYS,
    // но тип обязан знать ключи, иначе translation[language] не типизируется.
    fr?: string;
    it?: string;
    ja?: string;
    ko?: string;
    ar?: string;
  };
}

const translations: Translations = {
  // welcomeUnlock — кнопка разблокировки кода в настройках (остальной welcome-блок удалён с WelcomeModal, v1.129.0)
  welcomeUnlock: { ru: 'Разблокировать', en: 'Unlock' },

  // Home — hero cards (complexes) + header
  homeSwitchHint: { ru: 'нажми на чип чтобы сменить профиль', en: 'tap the chip to switch profile' },
  a11ySwitchProfile: { ru: 'Сменить профиль', en: 'Switch profile' },
  a11yAchievements: { ru: 'Достижения', en: 'Achievements' },
  complexWarmup: { ru: 'ЗАРЯДКА', en: 'WARM-UP' },
  complexEvening: { ru: 'ПЕРЕД СНОМ', en: 'BEFORE SLEEP' },
  complexAssessment: { ru: 'ОЦЕНКА', en: 'ASSESSMENT' },
  restDay: { ru: 'Brain Workshop день', en: 'Brain Workshop day' },
  ctaStart: { ru: 'СТАРТ', en: 'START' },
  ctaRepeat: { ru: 'ПОВТОР', en: 'REPEAT' },
  ctaWait: { ru: 'ЖДЁМ', en: 'WAIT' },
  unitGame: { ru: 'игра', en: 'game' },
  unitGames: { ru: 'игр', en: 'games' },
  unitMin: { ru: 'мин', en: 'min' },
  unitDayShort: { ru: 'д', en: 'd' },
  calm: { ru: 'спокойно', en: 'calm' },
  assessmentMeta: { ru: '12 тестов · ~12 мин', en: '12 tests · ~12 min' },
  finBrainMeta: { ru: 'Iowa→BART→PRL · ~25 мин', en: 'Iowa→BART→PRL · ~25 min' },

  // Profiles — display_name + description (consumed via t('profileName_'+id) / t('profileDesc_'+id))
  profileName_odv999: { ru: 'ODV999', en: 'ODV999' },
  profileDesc_odv999: { ru: 'Все 48 игр · Зарядка · Financial · Assessment', en: 'All 48 games · Warm-up · Financial · Assessment' },
  profileName_chess: { ru: 'Шахматист', en: 'Chess Player' },
  profileDesc_chess: { ru: 'Расчёт ходов · spatial · sustained attention', en: 'Move calculation · spatial · sustained attention' },
  profileName_kids: { ru: 'Дети 7-12', en: 'Kids 7-12' },
  profileDesc_kids: { ru: 'Память · счёт · реакция · без сложных абстракций', en: 'Memory · counting · reaction · no complex abstractions' },
  profileName_vasilyeva: { ru: 'Скорочтение PRO', en: 'Speed Reading PRO' },
  profileDesc_vasilyeva: { ru: 'Поле зрения · скорость глаз · удержание текста', en: 'Visual field · eye speed · text retention' },
  profileName_nzt48: { ru: 'NZT-48 (полный)', en: 'NZT-48 (full)' },
  profileDesc_nzt48: { ru: 'Полная батарея префронталки · максимум', en: 'Full prefrontal battery · maximum' },
  profileName_free: { ru: 'FREE', en: 'FREE' },
  profileDesc_free: { ru: '9 тренажёров бесплатно · попробуй и оцени', en: '9 games free · try and evaluate' },
  profileName_drivers: { ru: 'Реакция ПРО', en: 'Reaction PRO' },
  profileDesc_drivers: { ru: 'Решения за секунды · для тех у кого цена ошибки = жизнь', en: 'Split-second decisions · when the cost of error is life' },
  profileName_seniors: { ru: '50+ профилактика', en: '50+ Prevention' },
  profileDesc_seniors: { ru: 'Память · processing speed · замедление старения', en: 'Memory · processing speed · slowing aging' },
  profileName_execs: { ru: 'Предприниматели', en: 'Entrepreneurs' },
  profileDesc_execs: { ru: 'Решения под давлением · risk · WM · flexibility', en: 'Decisions under pressure · risk · WM · flexibility' },
  profileName_students: { ru: 'Студенты PRO', en: 'Students PRO' },
  profileDesc_students: { ru: 'Фокус · память · скорость · ЕГЭ / GMAT / GRE / IELTS', en: 'Focus · memory · speed · SAT / GMAT / GRE / IELTS' },
  profileName_women: { ru: 'Микро-релакс', en: 'Micro-relax' },
  profileDesc_women: { ru: 'Залипательные казуалки для микро-отдыха: парные картинки, отличия, hidden object, судоку', en: 'Addictive casual games for micro-breaks: pairs, spot-the-difference, hidden object, sudoku' },
  profileName_polyglot: { ru: 'Языки / Полиглот', en: 'Languages / Polyglot' },
  profileDesc_polyglot: { ru: 'Под языки: вербальная память · ассоциации · беглость · скрипты', en: 'For languages: verbal memory · associations · fluency · scripts' },
  switcherIntro: { ru: 'У каждого профиля свой набор тренажёров и плейлист зарядки. Тематические открываются кодом доступа — нажми на закрытый профиль, чтобы узнать детали.', en: 'Each profile has its own set of games and warm-up playlist. Themed profiles unlock with an access code — tap a locked profile to see details.' },

  // Navigation
  home: { ru: 'Главная', en: 'Home' },
  statistics: { ru: 'Статистика', en: 'Statistics' },
  settings: { ru: 'Настройки', en: 'Settings' },
  
  // Games - новые описательные названия
  schulteTable: { ru: 'Шульте: внимание', en: 'Schulte: Attention' },
  wordPairs: { ru: 'Пары слов: память', en: 'Word Pairs: Memory' },
  mnemonics: { ru: 'Мнемоника: порядок', en: 'Mnemonics: Sequence' },
  counter: { ru: 'Считалка: счёт', en: 'Counter: Math' },
  proofreading: { ru: 'Корректура: фокус', en: 'Proofread: Focus' },
  targets: { ru: 'Мишени: реакция', en: 'Targets: Reaction' },
  quickCount: { ru: 'Быстрый счёт', en: 'Quick Count' },
  
  // Game descriptions
  schulteTableDesc: { ru: 'Поиск чисел от 1 до N', en: 'Find numbers from 1 to N' },
  wordPairsDesc: { ru: 'Запоминание пар слов', en: 'Memorize word pairs' },
  mnemonicsDesc: { ru: 'Слова и числа в порядке', en: 'Words and numbers in order' },
  counterDesc: { ru: 'Составление сумм X+Y=Z', en: 'Make sums X+Y=Z' },
  proofreadingDesc: { ru: 'Поиск заданных букв', en: 'Find specific letters' },
  targetsDesc: { ru: 'Реакция на цветные объекты', en: 'React to colored objects' },
  quickCountDesc: { ru: 'Сколько точек — без пересчёта', en: 'How many dots — no counting' },
  
  // Skills - что тренируем
  skillAttention: { ru: 'Тренируем: концентрацию', en: 'Training: concentration' },
  skillMemory: { ru: 'Тренируем: память', en: 'Training: memory' },
  skillSequence: { ru: 'Тренируем: запоминание', en: 'Training: memorization' },
  skillMath: { ru: 'Тренируем: устный счёт', en: 'Training: mental math' },
  skillFocus: { ru: 'Тренируем: внимательность', en: 'Training: attentiveness' },
  skillReaction: { ru: 'Тренируем: скорость реакции', en: 'Training: reaction speed' },
  trainingLabel: { ru: 'Что тренируем', en: 'What we train' },
  
  // Game Intro - detailed descriptions
  schulteIntroDesc: {
    ru: 'Находите символы по порядку как можно быстрее. 5 модификаций под уровень нагрузки:\n\n• 🔢 Цифры 1→25 (классика, легче всего)\n• 🔢 Цифры 25→1 (обратный — сложнее)\n• 🔤 Буквы А→Я (тот же принцип на алфавите)\n• 🔤 Буквы Я→А (обратный алфавит — сложнее)\n• 🔀 1-А-2-Б-3-В (Шульте-Горбов: переключение между двумя последовательностями параллельно)\n\nЦветной режим добавляет визуальный шум для повышенной сложности. Упражнение расширяет периферическое зрение, ускоряет сканирование информации и тренирует устойчивое внимание.',
    en: 'Find symbols in order as fast as possible. 5 modifications for different challenge levels:\n\n• 🔢 Numbers 1→25 (classic, easiest)\n• 🔢 Numbers 25→1 (backward — harder)\n• 🔤 Letters A→Z (same principle, alphabet)\n• 🔤 Letters Z→A (backward alphabet — harder)\n• 🔀 1-A-2-B-3-C (Schulte-Gorbov: switching between two sequences in parallel)\n\nColor mode adds visual noise for extra challenge. Expands peripheral vision, speeds up information scanning, and trains sustained attention.'
  },
  wordPairsIntroDesc: { 
    ru: 'Запомните связи между словами, а затем восстановите пары. Тренирует ассоциативную память — способность связывать информацию между собой.', 
    en: 'Memorize connections between words, then restore the pairs. Trains associative memory — the ability to link information together.' 
  },
  mnemonicsIntroDesc: { 
    ru: 'Запомните последовательность слов или чисел в правильном порядке. Развивает рабочую память — способность удерживать информацию в уме.', 
    en: 'Memorize a sequence of words or numbers in the correct order. Develops working memory — the ability to hold information in mind.' 
  },
  counterIntroDesc: { 
    ru: 'Найдите числа, сумма которых равна заданному числу. Тренирует устный счёт и способность быстро анализировать варианты.', 
    en: 'Find numbers that sum to the target. Trains mental arithmetic and the ability to quickly analyze options.' 
  },
  proofreadingIntroDesc: { 
    ru: 'Найдите заданные буквы в большой таблице символов. Развивает избирательное внимание — способность находить нужное среди лишнего.', 
    en: 'Find specific letters in a large grid of characters. Develops selective attention — the ability to find what you need among distractions.' 
  },
  targetsIntroDesc: {
    ru: 'Реагируйте на появление цветных объектов. Тренирует скорость реакции и способность быстро принимать решения.',
    en: 'React to colored objects appearing on screen. Trains reaction speed and the ability to make quick decisions.'
  },
  quickCountIntroDesc: {
    ru: 'На мгновение появятся точки — оцените их количество, не пересчитывая по одной. Тренирует восприятие количества (subitizing) — отдельный от арифметики навык мгновенной оценки числа объектов.',
    en: 'Dots flash briefly — estimate how many without counting one by one. Trains numerosity perception (subitizing) — a skill distinct from arithmetic, the instant sense of quantity.'
  },
  quickCountLookHint: { ru: 'Смотри — не считай!', en: 'Look — don’t count!' },
  quickCountAnswerHint: { ru: 'Сколько было точек?', en: 'How many dots were there?' },
  benefitQuickCount1: { ru: 'Быстро оценивать количество на глаз (очередь, товары, люди)', en: 'Quickly judge quantities by eye (queues, goods, people)' },
  benefitQuickCount2: { ru: 'Развивает мгновенное восприятие, а не подсчёт', en: 'Develops instant perception, not counting' },
  benefitQuickCount3: { ru: 'Отдельный от арифметики навык — оценка, не вычисление', en: 'A skill distinct from arithmetic — estimation, not calculation' },

  // Benefits for each game
  benefitSchulte1: { ru: 'Быстрее читать тексты и документы', en: 'Read texts and documents faster' },
  benefitSchulte2: { ru: 'Лучше замечать детали в окружении', en: 'Notice details in your environment better' },
  benefitSchulte3: { ru: 'Эффективнее искать информацию', en: 'Search for information more efficiently' },
  
  benefitWordPairs1: { ru: 'Легче запоминать имена и лица', en: 'Remember names and faces more easily' },
  benefitWordPairs2: { ru: 'Лучше учить иностранные слова', en: 'Learn foreign words more effectively' },
  benefitWordPairs3: { ru: 'Быстрее находить связи между идеями', en: 'Find connections between ideas faster' },
  
  benefitMnemonics1: { ru: 'Запоминать списки покупок без записей', en: 'Remember shopping lists without notes' },
  benefitMnemonics2: { ru: 'Удерживать в памяти номера телефонов', en: 'Keep phone numbers in memory' },
  benefitMnemonics3: { ru: 'Лучше следить за порядком действий', en: 'Track sequences of actions better' },
  
  benefitCounter1: { ru: 'Быстрее считать в уме при покупках', en: 'Calculate faster when shopping' },
  benefitCounter2: { ru: 'Легче работать с числами и бюджетом', en: 'Work with numbers and budgets easier' },
  benefitCounter3: { ru: 'Принимать решения быстрее', en: 'Make decisions faster' },
  
  benefitProofreading1: { ru: 'Находить ошибки в текстах', en: 'Find errors in texts' },
  benefitProofreading2: { ru: 'Лучше концентрироваться на задачах', en: 'Focus better on tasks' },
  benefitProofreading3: { ru: 'Меньше отвлекаться на лишнее', en: 'Get distracted less by irrelevant things' },
  
  benefitTargets1: { ru: 'Быстрее реагировать за рулём', en: 'React faster while driving' },
  benefitTargets2: { ru: 'Лучше играть в спортивные игры', en: 'Play sports games better' },
  benefitTargets3: { ru: 'Принимать мгновенные решения', en: 'Make instant decisions' },

  // ───── New cognitive games ─────
  // N-back
  nBack: { ru: 'N-back: оперативная память', en: 'N-back: Working memory' },
  nBackDesc: { ru: 'Совпадает ли позиция вспышки с той, что была N шагов назад?', en: 'Does flash position match one from N steps back?' },
  nBackIntroDesc: {
    ru: '🧠 Самый эффективный тренажёр рабочей памяти (Jaeggi et al., 2008 — единственная парадигма с подтверждённым transfer-эффектом на IQ).\n\n📋 КАК ИГРАТЬ:\n• На сетке поочерёдно вспыхивают клетки\n• Запоминай где была вспышка N шагов назад\n• Когда текущая вспышка СОВПАДАЕТ по позиции с той что была N шагов назад → жми MATCH\n• Если не совпадает — ничего не жми, жди следующую\n\n🎯 ПРИМЕР при N=2 (запоминай позиции за 2 шага):\nШаг 1: вспышка слева-вверху  → жди\nШаг 2: вспышка справа        → жди\nШаг 3: вспышка слева-внизу   → СРАВНИ с шагом 1 (слева-вверху). НЕ совпадает → не жми\nШаг 4: вспышка справа        → СРАВНИ с шагом 2 (справа). СОВПАДАЕТ! → MATCH ✓\n\n💡 СТРАТЕГИЯ для новичков:\n• Начни с N=1 (запоминать только предыдущую вспышку) пока не освоишь ритм\n• Потом N=2, потом N=3. Выше N=4 — уже спорт высоких достижений\n• Не пытайся "вспомнить все шаги" — мозг ведёт скользящее окно автоматически\n• 15-20 минут в день, 3-4 недели → заметный прирост рабочей памяти',
    en: '🧠 Most effective working memory trainer (Jaeggi et al., 2008 — the only paradigm with proven IQ transfer effect).\n\n📋 HOW TO PLAY:\n• Cells flash on the grid one at a time\n• Remember the position N steps ago\n• When current flash MATCHES the position from N steps back → press MATCH\n• If it doesn\'t match — don\'t press, wait for next\n\n🎯 EXAMPLE for N=2 (track positions 2 steps back):\nStep 1: flash top-left   → wait\nStep 2: flash right      → wait\nStep 3: flash bottom-left → COMPARE with step 1 (top-left). Doesn\'t match → don\'t press\nStep 4: flash right      → COMPARE with step 2 (right). MATCH! → press ✓\n\n💡 STRATEGY for beginners:\n• Start with N=1 (track just the previous flash) until rhythm clicks\n• Then N=2, then N=3. Above N=4 is elite-level\n• Don\'t try to "remember all steps" — your brain runs a sliding window automatically\n• 15-20 min/day for 3-4 weeks → noticeable WM gains',
  },
  nLevelLabel: { ru: 'Глубина (N)', en: 'Depth (N)' },
  match: { ru: 'СОВПАДЕНИЕ', en: 'MATCH' },
  warmup: { ru: 'Запоминаем…', en: 'Warming up…' },
  nBackHint: { ru: 'Сравните текущую вспышку с той, что была N шагов назад — если совпадает → MATCH', en: 'Compare current flash with one N steps ago — if same position → MATCH' },
  benefitNback1: { ru: 'Быстрее держать в голове несколько мыслей', en: 'Hold multiple thoughts in mind faster' },
  benefitNback2: { ru: 'Лучше учиться сложным навыкам', en: 'Learn complex skills better' },
  benefitNback3: { ru: 'Точнее принимать решения под нагрузкой', en: 'Decide more accurately under load' },

  // Stroop
  stroop: { ru: 'Струп: торможение', en: 'Stroop: Inhibition' },
  stroopDesc: { ru: 'Цвет чернил, а не значение слова', en: 'Ink colour, not the word meaning' },
  stroopIntroDesc: {
    ru: 'Слово «КРАСНЫЙ» написано синим — нажмите «синий». Тренирует когнитивный контроль и торможение автоматических реакций.',
    en: 'The word "RED" is painted blue — tap "blue". Trains cognitive control and inhibition of automatic responses.',
  },
  stroopModeLabel: { ru: 'Что отвечать', en: 'Answer mode' },
  stroopByInk: { ru: 'По цвету чернил', en: 'By ink color' },
  stroopByWord: { ru: 'По значению слова', en: 'By word meaning' },
  stroopHintInk: { ru: 'Нажмите кнопку с цветом ЧЕРНИЛ', en: 'Tap the button with the INK colour' },
  stroopHintWord: { ru: 'Нажмите кнопку со ЗНАЧЕНИЕМ слова', en: 'Tap the button with the word MEANING' },
  benefitStroop1: { ru: 'Меньше отвлекаться на лишнее', en: 'Distract less from irrelevant input' },
  benefitStroop2: { ru: 'Быстрее переключать контекст', en: 'Switch contexts faster' },
  benefitStroop3: { ru: 'Сильнее самоконтроль и фокус', en: 'Stronger self-control and focus' },

  // Digit Span
  digitSpan: { ru: 'Запомни цифры', en: 'Digit Span' },
  digitSpanDesc: { ru: 'Повтори последовательность вперёд или назад', en: 'Repeat sequence forward or backward' },
  digitSpanIntroDesc: {
    ru: 'Цифры показывают одну за другой — введите их в правильном порядке (или в обратном). Классический нейропсихологический тест краткосрочной памяти.',
    en: 'Digits appear one by one — type them in order (or backward). Classic neuropsych short-term memory test.',
  },
  directionLabel: { ru: 'Порядок', en: 'Direction' },
  directionForward: { ru: 'Прямой', en: 'Forward' },
  directionBackward: { ru: 'Обратный', en: 'Backward' },
  startLengthLabel: { ru: 'Стартовая длина', en: 'Start length' },
  typeAsShown: { ru: 'Введите цифры в том же порядке', en: 'Type digits in same order' },
  typeReversed: { ru: 'Введите цифры в обратном порядке', en: 'Type digits in reverse' },
  lengthLabel: { ru: 'Длина', en: 'Length' },
  round: { ru: 'Раунд', en: 'Round' },
  check: { ru: 'Проверить', en: 'Check' },
  benefitDigit1: { ru: 'Запоминать номера телефонов на лету', en: 'Remember phone numbers on the fly' },
  benefitDigit2: { ru: 'Удерживать длинные адреса в голове', en: 'Hold long addresses in mind' },
  benefitDigit3: { ru: 'Развивать аудиальную память', en: 'Develop auditory memory' },

  // Memory Matrix
  memoryMatrix: { ru: 'Матрица памяти', en: 'Memory Matrix' },
  memoryMatrixDesc: { ru: 'Запомни и повтори светящиеся клетки', en: 'Memorise and repeat lit cells' },
  memoryMatrixIntroDesc: {
    ru: 'На пару секунд загораются клетки — потом нажмите на те же. Тренирует пространственную зрительную память.',
    en: 'Cells flash briefly — then tap the same ones. Trains visuospatial memory.',
  },
  gridSize: { ru: 'Размер сетки', en: 'Grid size' },
  matrixMemorize: { ru: 'Запомните клетки!', en: 'Memorise the cells!' },
  matrixRecall: { ru: 'Нажмите на запомненные клетки', en: 'Tap the cells you remembered' },
  matrixGood: { ru: 'Точно!', en: 'Spot on!' },
  matrixMissed: { ru: 'Промах', en: 'Missed' },
  benefitMatrix1: { ru: 'Лучше ориентироваться в пространстве', en: 'Navigate space better' },
  benefitMatrix2: { ru: 'Запоминать расположение вещей', en: 'Remember where things are' },
  benefitMatrix3: { ru: 'Развивать зрительную память', en: 'Develop visual memory' },

  // Trail Making
  trailMaking: { ru: 'Соедини цепочку', en: 'Trail Making' },
  trailMakingDesc: { ru: '1→А→2→Б→3 — переключение внимания', en: '1→A→2→B→3 — attention switching' },
  trailMakingIntroDesc: {
    ru: 'Соединяйте цифры и буквы по порядку как можно быстрее. Версия B (с переключением «цифра-буква-цифра») — стандартный тест когнитивной гибкости.',
    en: 'Connect numbers and letters in order as fast as possible. Version B (number-letter-number switching) is a standard test of cognitive flexibility.',
  },
  trailModeLabel: { ru: 'Версия', en: 'Version' },
  trailA: { ru: 'A: 1→2→3', en: 'A: 1→2→3' },
  trailB: { ru: 'B: 1→А→2→Б', en: 'B: 1→A→2→B' },
  countLabel: { ru: 'Узлов', en: 'Nodes' },
  nextLabel: { ru: 'Следующий', en: 'Next' },
  done: { ru: 'Готово!', en: 'Done!' },
  benefitTrail1: { ru: 'Быстрее переключаться между задачами', en: 'Switch between tasks faster' },
  benefitTrail2: { ru: 'Гибче мыслить и адаптироваться', en: 'Think flexibly and adapt' },
  benefitTrail3: { ru: 'Сохранять остроту мышления с возрастом', en: 'Keep sharp thinking with age' },

  // Skills (new)
  skillWorkingMemory: { ru: 'Тренируем: оперативную память', en: 'Training: working memory' },
  // Тот же «торможение» → «самоконтроль», что и в названии категории (catAction):
  // подпись висит на КАЖДОЙ карточке этой категории, чинить только заголовок бессмысленно.
  skillInhibition: { ru: 'Тренируем: самоконтроль', en: 'Training: self-control' },
  skillShortTermMemory: { ru: 'Тренируем: кратковременную память', en: 'Training: short-term memory' },
  skillVisualMemory: { ru: 'Тренируем: зрительную память', en: 'Training: visual memory' },
  skillSwitching: { ru: 'Тренируем: переключение внимания', en: 'Training: attention switching' },

  // ───── Round 2: 7 more games ─────
  // Tower of Hanoi
  hanoi: { ru: 'Ханойская башня', en: 'Tower of Hanoi' },
  hanoiDesc: { ru: 'Перенеси все диски на правый стержень', en: 'Move all discs to the right peg' },
  hanoiIntroDesc: {
    ru: 'Перенесите башню из дисков с левого стержня на правый. Большой диск нельзя класть на маленький. Тренирует планирование, рекурсивное мышление и решение задач.',
    en: 'Move the tower of discs from the left peg to the right one. A larger disc may never sit on a smaller one. Trains planning, recursion and problem solving.',
  },
  discsCount: { ru: 'Дисков', en: 'Discs' },
  hanoiOptimal: { ru: 'Минимум', en: 'Optimal' },
  movesLabel: { ru: 'ходов', en: 'moves' },
  hanoiHint: { ru: 'Сначала кликни на стержень-источник, потом на стержень-цель', en: 'Tap source peg first, then target peg' },
  benefitHanoi1: { ru: 'Лучше планировать многошаговые задачи', en: 'Better at planning multi-step tasks' },
  benefitHanoi2: { ru: 'Развить рекурсивное мышление', en: 'Develop recursive thinking' },
  benefitHanoi3: { ru: 'Видеть структуру в проблеме', en: 'See structure inside problems' },
  skillProblemSolving: { ru: 'Тренируем: решение задач', en: 'Training: problem solving' },

  // Anagrams
  anagrams: { ru: 'Анаграммы', en: 'Anagrams' },
  anagramsDesc: { ru: 'Составь слово из перемешанных букв', en: 'Reassemble word from shuffled letters' },
  anagramsIntroDesc: {
    ru: 'Из перемешанных букв соберите исходное слово как можно быстрее. Тренирует словарный запас, гибкость мышления и способность видеть структуру в хаосе.',
    en: 'Reassemble the original word from shuffled letters as fast as you can. Trains vocabulary, mental flexibility and pattern recognition.',
  },
  lettersInWord: { ru: 'Букв в слове', en: 'Letters' },
  anagramHint: { ru: 'Нажимайте на буквы по очереди — слово соберётся', en: 'Tap letters in order — the word assembles' },
  clear: { ru: 'Сбросить', en: 'Clear' },
  benefitAnagram1: { ru: 'Активнее владеть языком', en: 'More active vocabulary' },
  benefitAnagram2: { ru: 'Лучше учить иностранные слова', en: 'Learn foreign words better' },
  benefitAnagram3: { ru: 'Гибкое словесное мышление', en: 'Flexible verbal thinking' },
  skillVerbal: { ru: 'Тренируем: вербальную гибкость', en: 'Training: verbal flexibility' },

  // Find Differences
  findDiff: { ru: 'Найди отличия', en: 'Find Differences' },
  findDiffDesc: { ru: 'Сравни две картинки и найди отличия', en: 'Spot what differs between two scenes' },
  findDiffIntroDesc: {
    ru: 'Найдите все отличия между двумя сценами справа и слева. Тренирует детальное внимание и зрительное сравнение.',
    en: 'Find every difference between the two scenes. Trains detail attention and visual comparison.',
  },
  diffsCount: { ru: 'Отличий за раунд', en: 'Differences per round' },
  findHint: { ru: 'Нажимайте на отличия на нижней картинке', en: 'Tap the differences on the lower scene' },
  benefitFind1: { ru: 'Замечать важные детали', en: 'Notice important details' },
  benefitFind2: { ru: 'Лучше вычитывать тексты', en: 'Better at proofreading' },
  benefitFind3: { ru: 'Тренировать наблюдательность', en: 'Sharpen observation skills' },
  skillDetailAttention: { ru: 'Тренируем: детальное внимание', en: 'Training: detail attention' },

  // Eye Gymnastics (гимнастика для глаз)
  eyeGym: { ru: 'Гимнастика для глаз', en: 'Eye Gymnastics' },
  eyeGymDesc: { ru: 'Разминка и разгрузка глаз от экрана', en: 'Warm up and unstrain your eyes from the screen' },
  eyeGymIntroDesc: {
    ru: 'Набор упражнений: слежение за движущейся точкой, перевод фокуса вдаль и сведение взгляда. Снимает усталость глаз от экрана. Следи за точкой глазами, не двигая головой.',
    en: 'A set of exercises: follow the moving dot, shift focus into the distance and converge your gaze. Relieves screen eye-strain. Follow the dot with your eyes, without moving your head.',
  },
  skillEyeRelax: { ru: 'Снимаем: усталость глаз', en: 'Relieving: eye strain' },
  benefitEye1: { ru: 'Меньше усталости и сухости глаз от экрана', en: 'Less eye fatigue and dryness from screens' },
  benefitEye2: { ru: 'Расслабление глазных мышц после долгой работы', en: 'Relaxes eye muscles after long screen time' },
  benefitEye3: { ru: 'Привычка делать перерывы для глаз', en: 'Builds a habit of taking eye breaks' },
  // Breathing (дыхание — режим Восстановление)
  catRecovery: { ru: 'Восстановление', en: 'Recovery' },
  skillRecovery: { ru: 'Восстанавливаем: нервную систему', en: 'Restoring: nervous system' },
  breathing: { ru: 'Дыхание', en: 'Breathing' },
  breathingDesc: { ru: 'Спокойствие за несколько минут', en: 'Calm in a few minutes' },
  breathingIntroDesc: {
    ru: 'Дыхательные техники для расслабления, концентрации и восстановления. Анимированный круг ведёт ритм: круг растёт — вдох, сжимается — выдох. Вибрация подсказывает смену фазы.',
    en: 'Breathing techniques for relaxation, focus and recovery. An animated circle sets the rhythm: it grows on inhale, shrinks on exhale. Vibration cues each phase change.',
  },
  benefitBreath1: { ru: 'Снижает стресс и тревогу', en: 'Lowers stress and anxiety' },
  benefitBreath2: { ru: 'Помогает заснуть и восстановиться', en: 'Helps you fall asleep and recover' },
  benefitBreath3: { ru: 'Балансирует нервную систему', en: 'Balances the nervous system' },
  brTechniqueLabel: { ru: 'Техника', en: 'Technique' },
  brFormatLabel: { ru: 'Формат', en: 'Format' },
  brByCycles: { ru: 'По циклам', en: 'By cycles' },
  brByTime: { ru: 'По времени', en: 'By time' },
  brCyclesUnit: { ru: 'циклов', en: 'cycles' },
  brMinUnit: { ru: 'мин', en: 'min' },
  brTechBox: { ru: 'Квадрат 4-4-4-4', en: 'Box 4-4-4-4' },
  brTechBoxDesc: { ru: 'Концентрация и контроль стресса', en: 'Focus and stress control' },
  brTech478: { ru: '4-7-8', en: '4-7-8' },
  brTech478Desc: { ru: 'Успокоение, помогает заснуть', en: 'Calming, helps you sleep' },
  brTechCoherent: { ru: 'Когерентное ~5.5', en: 'Coherent ~5.5' },
  brTechCoherentDesc: { ru: 'Баланс ВНС, рост HRV', en: 'Autonomic balance, raises HRV' },
  brTechSigh: { ru: 'Физиологический вздох', en: 'Physiological sigh' },
  brTechSighDesc: { ru: 'Двойной вдох + длинный выдох — быстрый сброс', en: 'Double inhale + long exhale — fast reset' },
  brTechExt: { ru: 'Удлинённый выдох', en: 'Extended exhale' },
  brTechExtDesc: { ru: 'Мягкое успокоение для новичка', en: 'Gentle calming for beginners' },
  brTech424: { ru: 'Спокойное 4-2-4', en: 'Calm 4-2-4' },
  brTech424Desc: { ru: 'Простой ритм для старта', en: 'Simple starter rhythm' },
  brTechWim: { ru: 'Вим Хоф', en: 'Wim Hof' },
  brTechWimDesc: { ru: 'Энергия. Только сидя или лёжа', en: 'Energy. Sitting or lying only' },
  brInhale: { ru: 'Вдох', en: 'Inhale' },
  brExhale: { ru: 'Выдох', en: 'Exhale' },
  brHold: { ru: 'Задержка', en: 'Hold' },
  brWimWarnTitle: { ru: 'Сначала безопасность', en: 'Safety first' },
  brWimWarnBody: {
    ru: 'Метод Вима Хофа — это гипервентиляция с задержкой дыхания. Выполняйте ТОЛЬКО сидя или лёжа. НЕ делайте за рулём, в воде, при беременности, эпилепсии или болезнях сердца. При головокружении остановитесь и дышите спокойно.',
    en: 'The Wim Hof method is hyperventilation with breath holds. Do it ONLY while sitting or lying down. NEVER while driving, in water, or if pregnant, epileptic, or with heart conditions. If you feel dizzy, stop and breathe normally.',
  },
  brWimAgree: { ru: 'Понимаю, начать', en: 'I understand, start' },
  brWimRound: { ru: 'Раунд', en: 'Round' },
  brWimBreathe: { ru: 'Дышите глубоко', en: 'Breathe deeply' },
  brWimBreatheHint: { ru: 'Полный вдох — расслабленный выдох', en: 'Full inhale — relaxed exhale' },
  brWimHold: { ru: 'Задержите дыхание', en: 'Hold your breath' },
  brWimHoldHint: { ru: 'Выдохните и держите. Нажмите, когда захотите вдохнуть.', en: 'Exhale and hold. Tap when you need to breathe.' },
  brWimRecover: { ru: 'Глубокий вдох, держите', en: 'Deep breath in, hold' },
  brDoneTitle: { ru: 'Сессия завершена', en: 'Session complete' },
  brStreak: { ru: 'Серия', en: 'Streak' },
  brTotal: { ru: 'Всего', en: 'Total' },
  brHrvNote: {
    ru: 'Когерентное дыхание балансирует вегетативную нервную систему. При регулярной практике растёт вариабельность пульса (HRV) — маркер восстановления и стрессоустойчивости.',
    en: 'Coherent breathing balances your autonomic nervous system. With regular practice your heart rate variability (HRV) rises — a marker of recovery and stress resilience.',
  },
  // Goods Sort (сортировка товаров)
  goodsSort: { ru: 'Сортировка товаров', en: 'Goods Sort' },
  goodsSortDesc: { ru: 'Собери на полке три одинаковых товара', en: 'Group three identical goods on a shelf' },
  goodsSortIntroDesc: {
    ru: 'Перекладывай товары между стопками: тапни стопку (возьмёшь верхний товар), затем другую — положишь сверху. Собери НАВЕРХУ 3 одинаковых подряд — они сгорают, идёт комбо (×2, ×3…). За передним товаром прячутся другие — откроются, когда уберёшь передний. Цель — разобрать все стопки.',
    en: 'Move goods between stacks: tap a stack (you pick up its top good), then another stack to drop it on top. Get 3 identical goods in a row on top — they clear with a combo (×2, ×3…). Other goods hide behind the front one and reveal once you move it. Clear every stack to win.',
  },
  skillPlanningWM: { ru: 'Тренируем: планирование + зрительная память', en: 'Training: planning + visual memory' },
  benefitGoods1: { ru: 'Зрительная рабочая память: что где спрятано', en: 'Visual working memory: what is hidden where' },
  benefitGoods2: { ru: 'Планирование последовательности ходов', en: 'Planning a sequence of moves' },
  benefitGoods3: { ru: 'Концентрация и системность', en: 'Focus and systematic thinking' },
  goodsSortHint: { ru: 'Тапни товар, потом ячейку — переложить. Собери 3 ОДИНАКОВЫХ в одной ячейке — исчезнут. Убери всё.', en: 'Tap a good, then a cell — to move it. Gather 3 IDENTICAL in one cell — they vanish. Clear everything.' },
  goodsLevel: { ru: 'Уровень', en: 'Level' },
  eyeInstrWarmup: { ru: 'Веди взгляд за точкой по направлениям', en: 'Follow the dot in each direction' },
  eyeInstrPursuit: { ru: 'Следи за точкой глазами, голову не двигай', en: 'Follow the dot with your eyes, keep your head still' },
  eyeInstrFocusFar: { ru: 'Оторвись от экрана — посмотри вдаль (в окно, ~6 м)', en: 'Look away — focus far into the distance (a window, ~6 m)' },
  eyeInstrConverge: { ru: 'Сведи взгляд на приближающейся точке', en: 'Keep both eyes on the approaching dot' },
  eyeInstrPalming: { ru: 'Закрой глаза ладонями, расслабься и моргай', en: 'Cover your eyes with your palms, relax and blink' },
  eyeDurationLabel: { ru: 'Длительность', en: 'Duration' },
  eye3min: { ru: '~3 мин', en: '~3 min' },
  eye5min: { ru: '~5 мин', en: '~5 min' },
  eye1min: { ru: '~1 мин', en: '~1 min' },
  eyeSpeedLabel: { ru: 'Скорость точки', en: 'Dot speed' },
  eyeSlow: { ru: 'Медленно', en: 'Slow' },
  eyeNorm: { ru: 'Норма', en: 'Normal' },
  eyeFast: { ru: 'Быстро', en: 'Fast' },
  eyeModeLabel: { ru: 'Режим', en: 'Mode' },
  eyeModeFull: { ru: 'Полный', en: 'Full' },
  eyeModePursuit: { ru: 'Слежение', en: 'Pursuit' },
  eyeModeFocus: { ru: 'Фокус вдаль', en: 'Focus far' },
  eyeModeRelax: { ru: 'Пальминг', en: 'Palming' },
  eyeDisclaimer: { ru: 'Снимает усталость глаз от экрана. Не лечит зрение и не заменяет осмотр офтальмолога.', en: 'Relieves screen eye-strain. It does not cure vision or replace an eye exam.' },
  eyePalmBlink: { ru: 'Расслабь глаза и медленно моргай', en: 'Relax your eyes and blink slowly' },
  eyeFocusSub: { ru: 'Смотри на дальний объект, не на экран', en: 'Look at a distant object, not the screen' },
  eyeDoneTitle: { ru: 'Глаза отдохнули', en: 'Eyes refreshed' },
  eyeDoneSub: { ru: 'Полезно повторять каждые 1–2 часа за экраном', en: 'Worth repeating every 1–2 hours of screen time' },
  secShort: { ru: 'с', en: 's' },

  // Sudoku
  sudoku: { ru: 'Судоку', en: 'Sudoku' },
  sudokuDesc: { ru: 'Цифры без повторов в строке, столбце и блоке (6×6 и 9×9)', en: 'Digits with no repeats in each row, column and box (6×6 and 9×9)' },
  sudokuIntroDesc: {
    ru: 'Заполните сетку так, чтобы цифры встречались ровно один раз в каждой строке, столбце и блоке. Классический логический пазл.\n\n🎚 Уровни — с ростом уровня добавляются правила-варианты:\n• L9 ⟍ диагонали: цифры уникальны и по двум диагоналям\n• L14 ♞ ход коня: равные цифры не на ходу коня\n• L18 ⊞ доп. зоны: ещё 4 квадрата 3×3 без повторов\n• L22 ≠ не подряд: соседи по стороне не отличаются на 1\n• L26 ♚ ход короля: равные не касаются даже по диагонали\n• L30 ◩ чёт/нечёт: □ клетка — чётная цифра, ○ — нечётная\n• L34 ⧉ кривые блоки: блоки неправильной формы\n\n👑 Killer — поле разбито на группы: цифры в группе дают сумму в её углу и не повторяются.\n\n🆓 Свободно — поле 6×6 или 9×9 без вариантов, с выбором сложности.',
    en: 'Fill the grid so digits appear exactly once in every row, column and block. The classic logic puzzle.\n\n🎚 Levels — new variant rules unlock as you climb:\n• L9 ⟍ diagonals: digits are also unique on both diagonals\n• L14 ♞ anti-knight: equal digits cannot be a knight move apart\n• L18 ⊞ hyper: 4 extra 3×3 zones with no repeats\n• L22 ≠ non-consecutive: side-neighbours cannot differ by 1\n• L26 ♚ anti-king: equal digits cannot touch even diagonally\n• L30 ◩ even/odd: □ cell = even digit, ○ = odd\n• L34 ⧉ jigsaw: irregular blocks instead of squares\n\n👑 Killer — the grid splits into cages: digits in a cage add up to the number in its corner and never repeat.\n\n🆓 Free — a 6×6 or 9×9 board with no variants, your choice of difficulty.',
  },
  difficultyLabel: { ru: 'Сложность', en: 'Difficulty' },
  easy: { ru: 'Легко', en: 'Easy' },
  medium: { ru: 'Средне', en: 'Medium' },
  hard: { ru: 'Сложно', en: 'Hard' },
  benefitSudoku1: { ru: 'Лучше структурировать задачи', en: 'Structure problems better' },
  benefitSudoku2: { ru: 'Тренировать дедукцию', en: 'Train deductive logic' },
  benefitSudoku3: { ru: 'Концентрация на одной задаче', en: 'Focus on a single task' },
  skillLogic: { ru: 'Тренируем: логику', en: 'Training: logic' },

  // Go / No-Go
  goNoGo: { ru: 'Go / No-Go: торможение', en: 'Go / No-Go: Inhibition' },
  goNoGoDesc: { ru: 'Жми на зелёный, не жми на красный', en: 'Tap on green, hold on red' },
  goNoGoIntroDesc: {
    ru: 'На зелёный стимул жмите как можно быстрее. На красный — НЕ жмите. Стандартный нейропсихологический тест на тормозящий контроль.',
    en: 'Tap as fast as you can on the green stimulus. Do NOT tap on red. A standard neuropsych test for inhibitory control.',
  },
  goNoGoGoLabel: { ru: 'жми', en: 'tap' },
  goNoGoNoGoLabel: { ru: 'не жми', en: 'hold' },
  goNoGoHint: { ru: 'Только зелёный — нажать. Красный — терпи!', en: 'Tap green. Hold on red!' },
  benefitGoNoGo1: { ru: 'Самоконтроль и удержание импульсов', en: 'Self-control and impulse holding' },
  benefitGoNoGo2: { ru: 'Быстрая, но точная реакция', en: 'Fast yet accurate reactions' },
  benefitGoNoGo3: { ru: 'Меньше ошибок «по инерции»', en: 'Fewer "autopilot" mistakes' },

  // Picture Pairs
  picturePairs: { ru: 'Парные картинки', en: 'Picture Pairs' },
  picturePairsDesc: { ru: 'Открой все одинаковые пары', en: 'Reveal every matching pair' },
  picturePairsIntroDesc: {
    ru: 'Открывайте по две карточки за раз и ищите пары. Чем меньше ходов — тем выше счёт. Тренирует визуальную память и сопоставление.',
    en: 'Flip two cards at a time and find matching pairs. Fewer moves = higher score. Trains visual memory and matching.',
  },
  pairsCount: { ru: 'Пар', en: 'Pairs' },
  movesShort: { ru: 'ход.', en: 'mv' },
  benefitPairs1: { ru: 'Запоминать расположение объектов', en: 'Remember where things are placed' },
  benefitPairs2: { ru: 'Тренировать зрительную память', en: 'Train visual memory' },
  benefitPairs3: { ru: 'Удерживать карты в уме', en: 'Hold cards in mind' },

  // Mahjong (маджонг-солитёр)
  mahjong: { ru: 'Маджонг', en: 'Mahjong' },
  mahjongDesc: { ru: 'Убирай парные свободные тайлы', en: 'Remove matching free tiles' },
  mahjongIntroDesc: {
    ru: 'Классический маджонг-солитёр. Тайлы выложены слоями в виде пирамиды. Тайл СВОБОДЕН, если над ним ничего нет И открыта левая ИЛИ правая сторона. Тапни два свободных тайла с одинаковым символом — пара исчезает. Занятые тайлы притушены и не реагируют. Цель — убрать ВСЕ тайлы. Зашёл в тупик — кнопка «Перемешать» переразложит оставшиеся. Уровни растут: больше тайлов и слоёв.',
    en: 'Classic mahjong solitaire. Tiles are stacked in a pyramid. A tile is FREE when nothing covers it from above AND its left OR right side is open. Tap two free tiles with the same symbol — the pair disappears. Blocked tiles are dimmed and do not respond. Goal — clear EVERY tile. Stuck? The "Shuffle" button reshuffles the remaining tiles. Levels ramp up: more tiles and more layers.',
  },
  mahjongHint: { ru: 'Тапни два СВОБОДНЫХ одинаковых тайла — пара уйдёт. Свободен = сверху пусто и открыт край.', en: 'Tap two FREE matching tiles — the pair clears. Free = nothing on top and a side is open.' },
  skillVisualSearch: { ru: 'Тренируем: зрительный поиск', en: 'Training: visual search' },
  benefitMahjong1: { ru: 'Зрительный поиск пар среди множества тайлов', en: 'Visual search for pairs among many tiles' },
  benefitMahjong2: { ru: 'Планирование: какие тайлы открыть раньше', en: 'Planning which tiles to free up first' },
  benefitMahjong3: { ru: 'Концентрация и внимание к деталям', en: 'Focus and attention to detail' },

  // Math Sprint
  mathSprint: { ru: 'Математический спринт', en: 'Mental Math Sprint' },
  mathSprintDesc: { ru: 'Реши максимум примеров за время', en: 'Solve as many problems as possible in time' },
  mathSprintIntroDesc: {
    ru: 'Решайте арифметические примеры на скорость. Каждое правильное подряд увеличивает бонус-стрик. Развивает устный счёт и быстроту мышления.',
    en: 'Solve arithmetic problems against the clock. Consecutive correct answers grow a streak bonus. Builds mental arithmetic and processing speed.',
  },
  durationLabel: { ru: 'Длительность', en: 'Duration' },
  mathHint: { ru: 'Введите ответ и нажмите ✓', en: 'Type the answer and press ✓' },
  benefitMath1: { ru: 'Считать в уме без калькулятора', en: 'Calculate without a calculator' },
  benefitMath2: { ru: 'Быстрее работать с числами в работе', en: 'Crunch numbers at work faster' },
  benefitMath3: { ru: 'Уверенность с цифрами', en: 'Confidence with numbers' },
  
  // Settings
  darkTheme: { ru: 'Темная тема', en: 'Dark Theme' },
  language: { ru: 'Язык', en: 'Language' },
  russian: { ru: 'Русский', en: 'Russian' },
  english: { ru: 'Английский', en: 'English' },
  
  // Game UI
  start: { ru: 'Начать', en: 'Start' },
  restart: { ru: 'Заново', en: 'Restart' },
  back: { ru: 'Назад', en: 'Back' },
  time: { ru: 'Время', en: 'Time' },
  score: { ru: 'Счёт', en: 'Score' },
  level: { ru: 'Уровень', en: 'Level' },
  size: { ru: 'Размер', en: 'Size' },
  mode: { ru: 'Режим', en: 'Mode' },
  colorMode: { ru: 'Цветной', en: 'Color' },
  bwMode: { ru: 'Чёрно-белый', en: 'B&W' },
  next: { ru: 'Следующий', en: 'Next' },
  memorize: { ru: 'Запомните', en: 'Memorize' },
  recall: { ru: 'Вспомните', en: 'Recall' },
  correct: { ru: 'Правильно', en: 'Correct' },
  incorrect: { ru: 'Неправильно', en: 'Incorrect' },
  complete: { ru: 'Завершено', en: 'Complete' },
  bestTime: { ru: 'Лучшее время', en: 'Best Time' },
  totalGames: { ru: 'Всего игр', en: 'Total Games' },
  averageTime: { ru: 'Среднее время', en: 'Average Time' },
  progress: { ru: 'Прогресс', en: 'Progress' },
  words: { ru: 'слов', en: 'words' },
  numbers: { ru: 'чисел', en: 'numbers' },
  find: { ru: 'Найдите', en: 'Find' },
  field: { ru: 'Поле', en: 'Field' },
  joker: { ru: 'Джокер', en: 'Joker' },
  // v1.27.0 (Полиглот): скрипт-режимы в Корректуре/Шульте
  scriptLabel: { ru: 'Алфавит', en: 'Script' },
  scriptLatin: { ru: 'Латиница', en: 'Latin' },
  scriptCyrillic: { ru: 'Кириллица', en: 'Cyrillic' },
  scriptGreek: { ru: 'Греческий', en: 'Greek' },
  scriptDevanagari: { ru: 'Деванагари', en: 'Devanagari' },
  scriptHiragana: { ru: 'Хирагана', en: 'Hiragana' },
  scriptHanzi: { ru: 'Иероглифы', en: 'Hanzi' },
  scriptDigits: { ru: 'Цифры', en: 'Digits' },
  // v1.28.0 (Полиглот): SRS-словарь
  vocabSrs: { ru: 'Словарь SRS', en: 'Vocab SRS' },
  vocabSrsDesc: { ru: 'Учи слова: интервальные повторы', en: 'Learn words with spaced repetition' },
  vocabSrsIntroDesc: {
    ru: 'Ядро заучивания словаря — интервальные повторы (SM-2, как в Anki). Квиз: слово → 4 варианта перевода. Ошибся — карточка вернётся сегодня же; ответил — уйдёт на 1 → 3 → 7+ дней, точно перед моментом забывания. Оценка автоматическая: быстрый верный ответ двигает интервал сильнее. Свои списки — добавь слова курса в формате «слово = перевод». Прогресс по каждой языковой паре отдельный.',
    en: 'The core of vocabulary learning — spaced repetition (SM-2, Anki-style). A quiz: word → 4 translation options. Miss it and the card returns today; get it and it moves out 1 → 3 → 7+ days, right before you would forget. Grading is automatic: a fast correct answer pushes the interval further. Add your own course words as “word = translation”. Progress is tracked per language pair.',
  },
  benefitVocab1: { ru: 'Словарный запас растёт каждый день', en: 'Vocabulary grows every day' },
  benefitVocab2: { ru: 'Повторы точно перед забыванием', en: 'Reviews right before you forget' },
  benefitVocab3: { ru: 'Свои списки слов под твой курс', en: 'Your own word lists for your course' },
  skillVocabulary: { ru: 'Тренируем: словарный запас', en: 'Training: vocabulary' },
  srsNewPerSession: { ru: 'Новых за сессию', en: 'New per session' },
  srsDirection: { ru: 'Направление', en: 'Direction' },
  srsRecognize: { ru: 'Узнавание', en: 'Recognition' },
  srsRecall: { ru: 'Припоминание', en: 'Recall' },
  srsMyWords: { ru: 'Мои слова', en: 'My words' },
  srsAddWordsHint: { ru: 'По строке на пару: слово = перевод', en: 'One pair per line: word = translation' },
  srsAdded: { ru: 'Добавлено', en: 'Added' },
  srsAddBtn: { ru: 'Добавить', en: 'Add' },
  srsLearnedLabel: { ru: 'Выучено', en: 'Learned' },
  srsDueLabel: { ru: 'К повтору', en: 'Due' },
  srsOwnLabel: { ru: 'Своих', en: 'Own' },
  srsAllDone: { ru: 'На сегодня всё!', en: 'All done for today!' },
  srsNextDue: { ru: 'Следующий повтор', en: 'Next review' },
  srsNew: { ru: 'новое', en: 'new' },
  // v1.105.0 «Слепые шахматы» — держи позицию в голове (идея Дениса, подготовка к слепой игре)
  chessBlind: { ru: 'Слепые шахматы', en: 'Blindfold Chess' },
  chessBlindDesc: { ru: 'Фигуры скрыты — держи позицию в голове', en: 'Pieces are hidden — hold the position in your head' },
  chessBlindIntroDesc: {
    ru: 'Позиция показывается на несколько секунд — запомни, какая фигура где. Потом все фигуры превращаются в одинаковые фишки, а на высоких уровнях ещё и ходят. Отвечай, что стоит на клетке, или находи фигуру вслепую. Так шахматисты тренируют расчёт вариантов и игру вслепую: позиция живёт в голове, а не на доске.',
    en: 'A position is shown for a few seconds — memorize which piece stands where. Then every piece turns into an identical token, and at higher levels they start moving. Answer what stands on a square, or locate a piece blind. This is how chess players train calculation and blindfold play: the position lives in your head, not on the board.',
  },
  benefitChessBlind1: { ru: 'Расчёт вариантов без передвижения фигур', en: 'Calculate lines without moving pieces' },
  benefitChessBlind2: { ru: 'Шаг к игре вслепую', en: 'A step toward blindfold play' },
  benefitChessBlind3: { ru: 'Удержание картинки в уме — в любом деле', en: 'Holding a picture in your mind — in any field' },
  // v1.104.0 (Полиглот TIER 2 — аудио): фонемы, псевдослова, слуховой охват
  skillListening: { ru: 'Тренируем: восприятие на слух', en: 'Training: listening' },
  phonemePairs: { ru: 'Фонемы: минимальные пары', en: 'Phonemes: Minimal Pairs' },
  phonemePairsDesc: { ru: 'Услышь разницу: ship или sheep?', en: 'Hear the difference: ship or sheep?' },
  pseudowordEcho: { ru: 'Эхо: псевдослова', en: 'Echo: Pseudowords' },
  pseudowordEchoDesc: { ru: 'Услышал выдуманное слово — найди его написание', en: 'Hear a made-up word — pick its spelling' },
  listeningSpan: { ru: 'Слуховой охват', en: 'Listening Span' },
  listeningSpanDesc: { ru: 'Слова на слух — повтори порядок', en: 'Hear the words — repeat the order' },
  // v1.29.0 (Полиглот TIER 1 п.2/4/5): лексическое решение, Cloze, сортировка слов
  lexicalDecision: { ru: 'Слово или нет?', en: 'Word or Not?' },
  lexicalDecisionDesc: { ru: 'Реальное слово — или подделка?', en: 'Real word — or a fake?' },
  lexicalDecisionIntroDesc: {
    ru: 'Классический тест лексического решения: на экране строка целевого языка — настоящее слово или правдоподобная подделка (одна-две буквы заменены). Решай как можно быстрее. Скорость и точность отражают, насколько быстро слова достаются из ментального лексикона — главный показатель автоматизации языка. Для китайского «не-слово» = сочетание иероглифов, которого нет в учебном словаре.',
    en: 'The classic lexical decision task: a string in the target language appears — a real word or a plausible fake (one or two letters swapped). Decide as fast as you can. Speed and accuracy reflect how quickly words are retrieved from your mental lexicon — the key marker of language automaticity. For Chinese, a “non-word” is a character combination not present in the training dictionary.',
  },
  benefitLd1: { ru: 'Быстрый доступ к словам', en: 'Faster word retrieval' },
  benefitLd2: { ru: 'Автоматизация лексикона L2', en: 'L2 lexicon automaticity' },
  benefitLd3: { ru: 'Чутьё на орфографию языка', en: 'Feel for the spelling of the language' },
  ldHint: { ru: 'Это настоящее слово?', en: 'Is this a real word?' },
  ldWordBtn: { ru: 'Слово', en: 'Word' },
  ldNonwordBtn: { ru: 'Не слово', en: 'Not a word' },
  cloze: { ru: 'Cloze: фразы', en: 'Cloze' },
  clozeDesc: { ru: 'Какое слово пропущено во фразе?', en: 'Which word is missing?' },
  clozeIntroDesc: {
    ru: 'Фраза на целевом языке с пропуском — выбери слово, которое туда подходит. Грамматика и значение проверяются вместе: дистракторы взяты из той же смысловой категории, поэтому угадать по форме не выйдет. Тренирует извлечение слова в живом контексте — так слова реально используются в речи.',
    en: 'A sentence in the target language with a gap — pick the word that fits. Grammar and meaning are tested together: distractors come from the same semantic category, so you can’t guess by form. Trains word retrieval in real context — the way words are actually used in speech.',
  },
  benefitCloze1: { ru: 'Слова в живом контексте', en: 'Words in real context' },
  benefitCloze2: { ru: 'Грамматика без зубрёжки', en: 'Grammar without drilling' },
  benefitCloze3: { ru: 'Готовые фразы для речи', en: 'Ready-made phrases for speaking' },
  clozeHint: { ru: 'Выбери пропущенное слово', en: 'Pick the missing word' },
  semanticSort: { ru: 'Сортировка слов', en: 'Word Sort' },
  semanticSortDesc: { ru: 'К какой категории относится слово?', en: 'Which category does the word belong to?' },
  semanticSortIntroDesc: {
    ru: 'Слово на целевом языке — отнеси его к правильной категории (еда? животное? действие?). Категоризация без перевода = прямой доступ к значению L2, минуя родной язык. Именно так слова закрепляются «насовсем»: не «perro = собака», а perro → 🐾.',
    en: 'A word in the target language — assign it to the right category (food? animal? action?). Categorising without translating = direct access to L2 meaning, bypassing your native language. That is how words stick for good: not “perro = dog”, but perro → 🐾.',
  },
  benefitSort1: { ru: 'Значения без перевода', en: 'Meaning without translation' },
  benefitSort2: { ru: 'Прочные семантические связи', en: 'Strong semantic links' },
  benefitSort3: { ru: 'Скорость понимания L2', en: 'Faster L2 comprehension' },
  sortHint: { ru: 'К какой категории относится слово?', en: 'Pick the category this word belongs to' },
  sortRounds: { ru: 'Раундов', en: 'Rounds' },
  sortCats: { ru: 'Категорий на раунд', en: 'Categories per round' },
  // Категории словаря (TRANSLATION_VOCAB.cat)
  catVocab_concepts: { ru: 'Понятия', en: 'Concepts' },
  catVocab_numbers: { ru: 'Числа', en: 'Numbers' },
  catVocab_people: { ru: 'Люди и семья', en: 'People & family' },
  catVocab_body: { ru: 'Тело', en: 'Body' },
  catVocab_food: { ru: 'Еда и напитки', en: 'Food & drink' },
  catVocab_animals: { ru: 'Животные', en: 'Animals' },
  catVocab_nature: { ru: 'Природа', en: 'Nature' },
  catVocab_colors: { ru: 'Цвета', en: 'Colors' },
  catVocab_home: { ru: 'Дом и вещи', en: 'Home & things' },
  catVocab_places: { ru: 'Места', en: 'Places' },
  catVocab_time: { ru: 'Время', en: 'Time' },
  catVocab_verbs: { ru: 'Действия', en: 'Actions' },
  catVocab_adjectives: { ru: 'Признаки', en: 'Qualities' },
  catVocab_basics: { ru: 'Базовые слова', en: 'Basic words' },
  cognitiveGames: { ru: 'Когнитивные игры', en: 'Cognitive Games' },
  trainYourBrain: { ru: 'Тренируйте мозг', en: 'Train Your Brain' },

  // Web-demo (публичный /play/ = только демо; полная версия — в приложении)
  demoTitle: { ru: '60+ тренажёров для памяти, внимания и логики', en: '60+ workouts for memory, attention and logic' },
  demoSubtitle: { ru: 'Это демо. Полная версия — в приложении: все игры, уровни и статистика.', en: 'This is a demo. Get the app for all games, levels and stats.' },
  demoDownloadCta: { ru: 'Скачать приложение', en: 'Download the app' },
  demoResultCta: { ru: 'Скачать приложение — все 60+ игр и уровни', en: 'Get the app — all 60+ games & levels' },
  selectGame: { ru: 'Выберите игру', en: 'Select a Game' },
  gameResult: { ru: 'Результат игры', en: 'Game Result' },
  yourTime: { ru: 'Ваше время', en: 'Your Time' },
  yourScore: { ru: 'Ваш счёт', en: 'Your Score' },
  playAgain: { ru: 'Играть снова', en: 'Play Again' },
  goHome: { ru: 'На главную', en: 'Go Home' },
  shareResult: { ru: 'Поделиться', en: 'Share' },
  shareCopied: { ru: 'Результат скопирован ✓', en: 'Result copied ✓' },
  configureGame: { ru: 'Настройка игры', en: 'Configure Game' },
  errors: { ru: 'Ошибки', en: 'Errors' },
  seconds: { ru: 'сек', en: 'sec' },

  // Categories
  // 4 categories (v1.2.0 Lumosity-style)
  catMemory:    { ru: 'Память',                          en: 'Memory' },
  catAttention: { ru: 'Внимание',                        en: 'Attention' },
  catLogic:     { ru: 'Логика и принятие решений',       en: 'Logic & Decisions' },
  // ЗАЧЕМ «самоконтроль» вместо «торможение» (репорт тестировщика: «Торможение?
  // не совсем понятно что это»): «торможение» — калька с inhibition, вне
  // психологии читается как автомобильное. Суть категории (ингибиторный
  // контроль = затормозить готовую реакцию) сохранена: «самоконтроль» — бытовое
  // название ровно этого. Вариант «Скорость и реакция» отброшен — он теряет
  // смысл подавления и превращает категорию в «просто быстро».
  catAction:    { ru: 'Скорость и самоконтроль',         en: 'Speed & Self-Control' },
  catIntuition: { ru: 'Интуиция и риск',                 en: 'Intuition & Risk' },
  // Legacy keys (kept for back-compat with anything that still references them)
  catControl:   { ru: 'Скорость и самоконтроль',         en: 'Speed & Self-Control' },
  catMath:      { ru: 'Скорость и самоконтроль',         en: 'Speed & Self-Control' },
  catSpeed:     { ru: 'Скорость и самоконтроль',         en: 'Speed & Self-Control' },

  // Round-3 games — names
  pattern:    { ru: 'Паттерны: мышление',         en: 'Patterns: Reasoning' },
  choiceRt:   { ru: 'Выбор-реакция: скорость',    en: 'Choice RT: Speed' },
  numberBonds:{ ru: 'Числовые пары: счёт',        en: 'Number Bonds: Math' },
  setGame:    { ru: 'SET: тройки признаков',      en: 'SET: Triples' },
  stopSignal: { ru: 'Стоп-сигнал: торможение',    en: 'Stop-Signal: Inhibition' },

  // Round-3 — descriptions
  patternDesc:    { ru: 'Продолжите числовую последовательность', en: 'Continue the number sequence' },
  choiceRtDesc:   { ru: 'Жмите по направлению стрелки',           en: 'Tap in the arrow direction' },
  numberBondsDesc:{ ru: 'Найдите числа с заданной суммой',        en: 'Find numbers that sum to target' },
  setGameDesc:    { ru: 'Найдите тройку по 4 признакам',           en: 'Find a triple by 4 attributes' },
  stopSignalDesc: { ru: 'Жмите Go, но останавливайтесь по сигналу', en: 'Press Go, but stop on signal' },

  // Round-3 — intro descriptions
  patternIntroDesc: {
    ru: 'Перед вами 4 числа — они подчинены скрытому правилу (арифметическая прогрессия, удвоение, квадраты, Фибоначчи и т.д.). Найдите следующее число. Тренирует абстрактное мышление, выявление закономерностей и математическую интуицию.',
    en: 'You see 4 numbers — they follow a hidden rule (arithmetic, doubling, squares, Fibonacci, etc.). Find the next number. Trains abstract thinking, pattern detection and mathematical intuition.'
  },
  choiceRtIntroDesc: {
    ru: 'На экране появится стрелка ←, → , ↑ или ↓. Нажмите кнопку соответствующего направления как можно быстрее. Тренирует скорость выбора и точность моторных реакций.',
    en: 'An arrow ←, →, ↑ or ↓ appears. Tap the matching direction button as fast as you can. Trains choice speed and motor accuracy.'
  },
  numberBondsIntroDesc: {
    ru: 'Дано целевое число и набор кружков с числами. Выберите кружки, дающие в сумме цель. Тренирует устный счёт, гибкость арифметического мышления и поиск комбинаций.',
    en: 'Given a target and a pool of numbered chips. Pick chips that sum to the target. Trains mental arithmetic, flexible numeracy and combination search.'
  },
  setGameIntroDesc: {
    ru: 'Каждая карточка имеет 4 признака: цвет, форма, штриховка, количество. Найдите тройку, где каждый признак либо одинаков на всех трёх, либо разный на всех трёх. Тренирует визуальную логику.',
    en: 'Each card has 4 attributes: color, shape, shading, count. Find a triple where every attribute is either identical across all three or all different. Trains visual logic.'
  },
  stopSignalIntroDesc: {
    ru: 'Жмите Go при появлении зелёного сигнала. Но если после Go появится красный — резко остановитесь и не нажимайте. Усложнённая версия Go/No-Go: тренирует префронтальный контроль и подавление уже начатого действия.',
    en: 'Press Go on the green signal. But if a red signal follows — stop and do not press. A harder Go/No-Go: trains prefrontal control and suppression of already-initiated actions.'
  },

  // Round-3 — benefits
  benefitPattern1:    { ru: 'Распознавание паттернов', en: 'Pattern recognition' },
  benefitPattern2:    { ru: 'Абстрактное мышление',   en: 'Abstract thinking' },
  benefitPattern3:    { ru: 'Математическая интуиция', en: 'Math intuition' },
  benefitChoiceRt1:   { ru: 'Скорость реакции',       en: 'Reaction speed' },
  benefitChoiceRt2:   { ru: 'Точность выбора',         en: 'Choice accuracy' },
  benefitChoiceRt3:   { ru: 'Моторный контроль',       en: 'Motor control' },
  benefitNumberBonds1:{ ru: 'Устный счёт',             en: 'Mental arithmetic' },
  benefitNumberBonds2:{ ru: 'Гибкость мышления',       en: 'Flexible thinking' },
  benefitNumberBonds3:{ ru: 'Поиск комбинаций',        en: 'Combinatorial search' },
  benefitSet1:        { ru: 'Визуальная логика',       en: 'Visual logic' },
  benefitSet2:        { ru: 'Параллельный анализ',     en: 'Parallel analysis' },
  benefitSet3:        { ru: 'Внимание к признакам',    en: 'Attribute attention' },
  benefitStopSignal1: { ru: 'Префронтальный контроль', en: 'Prefrontal control' },
  benefitStopSignal2: { ru: 'Подавление действия',     en: 'Action suppression' },
  benefitStopSignal3: { ru: 'Импульсный контроль',     en: 'Impulse control' },

  // Shared labels
  trialsLabel: { ru: 'Количество попыток', en: 'Number of trials' },
  patternHint: { ru: 'Какое число продолжает последовательность?', en: 'Which number continues the sequence?' },
  numberBondsHint: { ru: 'Сумма должна быть равна', en: 'Sum must equal' },
  setHint: { ru: 'Выберите три карточки, образующие SET', en: 'Pick three cards that form a SET' },
  stopHint: { ru: 'Зелёный — Go. Появился красный — стоп!', en: 'Green = Go. Red appears = STOP!' },
  goBtn: { ru: 'GO', en: 'GO' },
  validateBtn: { ru: 'Проверить', en: 'Check' },
  clearBtn: { ru: 'Сбросить', en: 'Clear' },
  reaction: { ru: 'Реакция', en: 'Reaction' },
  meanReaction: { ru: 'Средняя реакция', en: 'Mean RT' },
  hits: { ru: 'Попадания', en: 'Hits' },
  misses: { ru: 'Промахи', en: 'Misses' },

  // Round-4 games — names
  mentalRotation: { ru: 'Ментальная ротация',  en: 'Mental Rotation' },
  readingSpan:    { ru: 'Reading Span: память',en: 'Reading Span: Memory' },
  switchingTask:  { ru: 'Переключение задач',  en: 'Task Switching' },
  visualSearch:   { ru: 'Визуальный поиск',    en: 'Visual Search' },
  sdmt:           { ru: 'SDMT: символ→цифра',  en: 'SDMT: Symbol→Digit' },

  // Round-4 — descriptions
  mentalRotationDesc: { ru: 'Найдите повёрнутую копию фигуры',     en: 'Find the rotated copy of a shape' },
  readingSpanDesc:    { ru: 'Оцените смысл и запомните слова',     en: 'Judge sense, recall last words' },
  switchingTaskDesc:  { ru: 'Чередуйте правила числа/буквы',        en: 'Alternate number/letter rules' },
  visualSearchDesc:   { ru: 'Найди все заданные фигуры среди похожих', en: 'Find all the target shapes among similar ones' },
  sdmtDesc:           { ru: 'Кодируйте символы цифрами по таблице', en: 'Encode symbols by lookup table' },

  // Round-4 — intro descriptions
  mentalRotationIntroDesc: {
    ru: 'Слева — эталонная фигура. Справа — варианты, повёрнутые на разные углы. Один из них — это ТА ЖЕ фигура (просто повёрнутая), остальные — её зеркальное отражение или другая фигура. Тренирует пространственное мышление и визуальную ротацию.',
    en: 'On the left — a reference shape. On the right — options rotated at different angles. One is the SAME shape (just rotated); the others are mirror reflections or different shapes. Trains spatial reasoning and visual rotation.'
  },
  readingSpanIntroDesc: {
    ru: 'Читайте предложения по очереди. Для каждого: оцените, есть ли в нём смысл (✓ или ✗), И запомните последнее слово. После N предложений впишите все последние слова в правильном порядке. Это классический тест рабочей памяти Дэйнмана-Карпентера (RWMC).',
    en: 'Read sentences one at a time. For each: judge whether it makes sense (✓ or ✗) AND remember the last word. After N sentences, type all the last words in order. This is the classic Daneman-Carpenter Reading Working Memory test.'
  },
  switchingTaskIntroDesc: {
    ru: 'Видите пару «цифра+буква», например «3A». Цвет/значок наверху подсказывает задачу: NUMBER — нечётная или чётная цифра? LETTER — гласная или согласная буква? Задача меняется случайно. Тренирует когнитивную гибкость и измеряет switch cost.',
    en: 'You see a digit+letter pair, e.g. "3A". A coloured cue tells you the task: NUMBER — is the digit odd or even? LETTER — is the letter a vowel or consonant? The task switches randomly. Trains cognitive flexibility and measures switch cost.'
  },
  visualSearchIntroDesc: {
    ru: 'Поле заполнено похожими фигурами под разными углами. Найди все заданные — образец показан рядом. Искомая фигура меняется каждый раунд, а с уровнями объектов и целей становится больше. Классическая парадигма селективного внимания.',
    en: 'The field is filled with similar shapes at various angles. Find all the target shapes — the reference is shown alongside. The target changes every round, and as levels rise there are more objects and targets. A classic selective-attention paradigm.'
  },
  sdmtIntroDesc: {
    ru: 'В таблице: 9 символов ↔ 9 цифр (привязка случайная для каждой игры). Появляется символ — нажмите соответствующую цифру. За отведённое время делайте максимум правильных ответов. Чувствительный показатель скорости обработки информации.',
    en: 'A table maps 9 symbols ↔ 9 digits (random per game). A symbol appears — press the matching digit. Make as many correct answers as possible in the time limit. A sensitive measure of processing speed.'
  },

  // Round-4 — benefits
  benefitMr1: { ru: 'Пространственное мышление', en: 'Spatial reasoning' },
  benefitMr2: { ru: 'Ментальная ротация',         en: 'Mental rotation' },
  benefitMr3: { ru: 'Визуально-аналитическая работа', en: 'Visuo-analytic work' },
  benefitRs1: { ru: 'Рабочая память',             en: 'Working memory' },
  benefitRs2: { ru: 'Параллельное удержание',     en: 'Parallel maintenance' },
  benefitRs3: { ru: 'Подавление помех',           en: 'Interference control' },
  benefitSw1: { ru: 'Переключение между правилами', en: 'Rule switching' },
  benefitSw2: { ru: 'Когнитивная гибкость',       en: 'Cognitive flexibility' },
  benefitSw3: { ru: 'Снижение switch cost',       en: 'Lower switch cost' },
  benefitVs1: { ru: 'Селективное внимание',       en: 'Selective attention' },
  benefitVs2: { ru: 'Сканирование сцены',          en: 'Scene scanning' },
  benefitVs3: { ru: 'Быстрая фильтрация',          en: 'Fast filtering' },
  benefitSdmt1: { ru: 'Скорость обработки',        en: 'Processing speed' },
  benefitSdmt2: { ru: 'Кодирование информации',    en: 'Information coding' },
  benefitSdmt3: { ru: 'Зрительно-моторная связь',  en: 'Visuo-motor coupling' },

  // New skills
  skillSpatial:         { ru: 'Тренируем: пространственное мышление', en: 'Training: spatial reasoning' },
  skillProcessingSpeed: { ru: 'Тренируем: скорость обработки',         en: 'Training: processing speed' },

  // Shared labels for round-4
  setSize:        { ru: 'Размер набора',           en: 'Set size' },
  duration:       { ru: 'Длительность',            en: 'Duration' },
  rememberLast:   { ru: 'Запомните',               en: 'Remember' },
  makesSense:     { ru: 'Со смыслом',              en: 'Makes sense' },
  nonsense:       { ru: 'Бессмыслица',             en: 'Nonsense' },
  recallNow:      { ru: 'Вспомните слова',         en: 'Recall words' },
  recallHint:     { ru: 'Введите последние слова через пробел в правильном порядке', en: 'Type the last words separated by spaces in the correct order' },
  recallPlaceholder: { ru: 'слово слово слово ...', en: 'word word word ...' },
  readingSpanJudge:  { ru: 'Это предложение имеет смысл?', en: 'Does this sentence make sense?' },
  visualSearchHint:  { ru: 'Найди и нажми букву Т (повёрнута случайно):', en: 'Find and tap the letter T (randomly rotated):' },
  mentalRotationHint:{ ru: 'Какой из вариантов — это та же фигура (просто повёрнутая)?', en: 'Which option is the same shape (just rotated)?' },
  taskNumber:     { ru: 'ЦИФРА', en: 'DIGIT' },
  taskLetter:     { ru: 'БУКВА', en: 'LETTER' },
  odd:            { ru: 'нечёт', en: 'odd' },
  even:           { ru: 'чёт',   en: 'even' },
  vowel:          { ru: 'гласн.', en: 'vowel' },
  consonant:      { ru: 'согл.',  en: 'consonant' },

  // Round-5 games — names
  towerLondon: { ru: 'Башня Лондона',     en: 'Tower of London' },
  corsi:       { ru: 'Кубики Корси',       en: 'Corsi Blocks' },
  wcst:        { ru: 'WCST: правила',      en: 'WCST: Rules' },
  flanker:     { ru: 'Фланкер: стрелки',   en: 'Flanker: Arrows' },
  ospan:       { ru: 'OSpan: счёт+память', en: 'OSpan: Math+Memory' },
  simon:       { ru: 'Simon: цвет vs позиция', en: 'Simon: Color vs Position' },
  simonRule:   { ru: 'Правило',            en: 'Rule' },
  simonLeftBtn:  { ru: 'Левая',            en: 'Left' },
  simonRightBtn: { ru: 'Правая',           en: 'Right' },

  // Round-5 — descriptions
  towerLondonDesc: { ru: 'Переставьте шары за минимум ходов',         en: 'Rearrange balls in minimum moves' },
  corsiDesc:       { ru: 'Повторите последовательность блоков',       en: 'Repeat the block sequence' },
  wcstDesc:        { ru: 'Найдите скрытое правило сортировки',        en: 'Find the hidden sorting rule' },
  flankerDesc:     { ru: 'Реагируйте на центральную стрелку',         en: 'React to the central arrow' },
  ospanDesc:       { ru: 'Решайте уравнения и помните буквы',         en: 'Solve equations, remember letters' },
  simonDesc:       { ru: 'Цвет говорит куда жать, позиция сбивает',   en: 'Color tells which button; position distracts' },

  // Round-5 — intro descriptions
  towerLondonIntroDesc: {
    ru: 'Сверху — целевое расположение шаров. Снизу — текущее. Перемещайте шары между стержнями (тапнуть стержень-источник, потом стержень-цель). Стержни вмещают разное число шаров. Цель — за МИНИМУМ ходов. Тренирует планирование и торможение преждевременных действий.',
    en: 'Top: goal arrangement. Bottom: current arrangement. Move balls between pegs (tap source peg, then target peg). Pegs have different capacities. Solve in MINIMUM moves. Trains planning and inhibition of premature action.'
  },
  corsiIntroDesc: {
    ru: 'На поле — 9 блоков. Они загораются по очереди — запомните порядок. Затем повторите его, нажимая блоки в той же (или обратной) последовательности. Длина растёт пока не ошибётесь дважды. Классический тест зрительно-пространственной рабочей памяти.',
    en: 'A board with 9 blocks. They light up in sequence — memorize the order. Then reproduce it (or in reverse). Length grows until you fail twice. Classic visuospatial working memory test.'
  },
  wcstIntroDesc: {
    ru: 'Внизу — карточка. Сверху — 4 эталона. Сортируйте по СКРЫТОМУ правилу: цвет, форма или количество. Узнаете правило по обратной связи. После 6 правильных подряд правило незаметно меняется — нужно перестроиться. Классический Wisconsin Card Sort.',
    en: 'Bottom: a card. Top: 4 reference cards. Sort by a HIDDEN rule: colour, shape, or count. Discover the rule via feedback. After 6 correct in a row, the rule silently changes — you must adapt. The classic Wisconsin Card Sort.'
  },
  flankerIntroDesc: {
    ru: 'В центре — стрелка ← или →. По бокам — отвлекающие фланкеры (в том же или противоположном направлении). Реагируйте только на ЦЕНТР, игнорируя бока. Измеряет способность подавлять автоматические реакции (Eriksen Flanker, 1974).',
    en: 'Center: an arrow ← or →. Sides: distractor flankers (same or opposite direction). Respond only to the CENTER, ignoring the sides. Measures ability to suppress automatic responses (Eriksen Flanker, 1974).'
  },
  ospanIntroDesc: {
    ru: 'Чередуйте: уравнение «верно?» → запомнить букву → уравнение → буква → ... После N итераций впишите буквы в ПРАВИЛЬНОМ ПОРЯДКЕ. Двойная нагрузка: счёт + хранение. Operation Span — золотой стандарт измерения рабочей памяти под нагрузкой.',
    en: 'Alternate: equation "is it correct?" → remember a letter → equation → letter → ... After N iterations type the letters IN ORDER. Dual load: arithmetic + storage. Operation Span — the gold standard for working memory under load.'
  },
  simonIntroDesc: {
    ru: 'Цветной квадрат появляется СЛЕВА или СПРАВА от центра. Жми ЛЕВУЮ кнопку если СИНИЙ, ПРАВУЮ если КРАСНЫЙ (по ЦВЕТУ, не по позиции). Когда позиция стимула совпадает с правильной стороной ответа — легко. Когда не совпадает (incongruent) — медленнее. Simon Effect = разница RT. Классика измерения inhibitory control (Simon, 1969).',
    en: 'A colored square appears LEFT or RIGHT of center. Press LEFT button if BLUE, RIGHT if RED (by COLOR, not position). When stimulus position matches the correct response side, it\'s easy. When it doesn\'t (incongruent), slower. Simon Effect = RT difference. Classic measure of inhibitory control (Simon, 1969).'
  },

  // Round-5 — benefits
  benefitTol1:   { ru: 'Планирование действий',     en: 'Action planning' },
  benefitTol2:   { ru: 'Прогнозирование',            en: 'Forecasting' },
  benefitTol3:   { ru: 'Торможение импульса',        en: 'Impulse inhibition' },
  benefitCorsi1: { ru: 'Зрительная память',          en: 'Visual memory' },
  benefitCorsi2: { ru: 'Пространственный span',      en: 'Spatial span' },
  benefitCorsi3: { ru: 'Удержание последовательности', en: 'Sequence holding' },
  benefitWcst1:  { ru: 'Когнитивная гибкость',        en: 'Cognitive flexibility' },
  benefitWcst2:  { ru: 'Поиск правил',                en: 'Rule discovery' },
  benefitWcst3:  { ru: 'Перестройка стратегии',       en: 'Strategy shifting' },
  benefitFl1:    { ru: 'Селективное внимание',        en: 'Selective attention' },
  benefitFl2:    { ru: 'Подавление помех',             en: 'Distractor suppression' },
  benefitFl3:    { ru: 'Конфликт-резолюция',           en: 'Conflict resolution' },
  benefitSi1:    { ru: 'Торможение импульса',          en: 'Impulse inhibition' },
  benefitSi2:    { ru: 'Пространственный конфликт',    en: 'Spatial conflict' },
  benefitSi3:    { ru: 'Скорость + точность',          en: 'Speed + accuracy' },
  benefitOs1:    { ru: 'Рабочая память',               en: 'Working memory' },
  benefitOs2:    { ru: 'Многозадачность',              en: 'Multitasking' },
  benefitOs3:    { ru: 'Защита от помех',              en: 'Interference protection' },

  // New skill keys
  skillPlanning: { ru: 'Тренируем: планирование', en: 'Training: planning' },

  // Shared labels
  forward:        { ru: 'Вперёд',           en: 'Forward' },
  backward:       { ru: 'Обратный',         en: 'Backward' },
  startLength:    { ru: 'Начальная длина',  en: 'Start length' },
  watchSequence:  { ru: 'Смотрите и запоминайте', en: 'Watch and remember' },
  reproduceForward:  { ru: 'Повторите в том же порядке',     en: 'Reproduce in same order' },
  reproduceBackward: { ru: 'Повторите в обратном порядке',  en: 'Reproduce in reverse order' },
  goalState:      { ru: 'Цель',              en: 'Goal' },
  currentState:   { ru: 'Сейчас',            en: 'Now' },
  towerHint:      { ru: 'Тапните стержень-источник, затем стержень-цель', en: 'Tap source peg, then target peg' },
  wcstHint:       { ru: 'К какому эталону подходит карточка? (правило скрыто)', en: 'Which reference card matches? (rule is hidden)' },
  ospanEqHint:    { ru: 'Это уравнение верно?',   en: 'Is this equation correct?' },
  ospanRememberLetter: { ru: 'Запомните букву',     en: 'Remember the letter' },
  ospanRecallHint:{ ru: 'Введите буквы через пробел в правильном порядке', en: 'Type the letters separated by spaces in order' },

  // Round-6 — names
  posner:          { ru: 'Posner Cuing: внимание',     en: 'Posner Cuing: Attention' },
  ant:             { ru: 'ANT: 3 сети внимания',        en: 'ANT: Attention Networks' },
  bart:            { ru: 'BART: риск-баллон',           en: 'BART: Risk Balloon' },
  iowa:            { ru: 'Iowa: 4 колоды',              en: 'Iowa: 4 Decks' },
  stroopEmotional: { ru: 'Эмоциональный Stroop',         en: 'Emotional Stroop' },
  spatialSpan:     { ru: 'Spatial Span (обратный)',     en: 'Spatial Span (Backward)' },

  // Round-6 — descriptions
  posnerDesc:          { ru: 'Реагируйте на мишень, cue может обмануть',    en: 'React to target; cue may mislead' },
  antDesc:             { ru: '3 механизма внимания в одном тесте',          en: '3 attention networks in one test' },
  bartDesc:            { ru: 'Надувайте шар или забирайте деньги',           en: 'Pump balloon or cash out' },
  iowaDesc:            { ru: 'Учитесь избегать невыгодных колод',            en: 'Learn to avoid disadvantageous decks' },
  stroopEmotionalDesc: { ru: 'Цвет шрифта vs значение слова',                 en: 'Font color vs word meaning' },
  spatialSpanDesc:     { ru: 'Повторите последовательность в обратном порядке', en: 'Reproduce sequence in reverse' },

  // Round-6 — intro descriptions
  posnerIntroDesc: {
    ru: 'В центре — точка фиксации. Сначала появляется cue (стрелка-подсказка) на одну из сторон, потом мишень. Cue обычно подсказывает правильно (валидный), но иногда обманывает (невалидный) или нейтральный. Реагируйте на сторону мишени. Метрика: validity effect = RT(invalid) − RT(valid) — индикатор orienting attention.',
    en: 'A fixation cross in the center. First a cue (arrow) appears on one side, then a target. The cue is usually valid, but can mislead (invalid) or be neutral. React to the target side. Metric: validity effect = RT(invalid) − RT(valid) — index of orienting attention.'
  },
  antIntroDesc: {
    ru: 'Тест Фана-Познера измеряет 3 сети внимания одновременно: alerting (готовность), orienting (пространственное), executive (конфликт-резолюция через flanker). Один трайл сочетает: cue (none/center/double/spatial) + target (стрелка с конгруэнтными/инконгруэнтными фланкерами). Получаете 3 биомаркера сразу.',
    en: 'Fan-Posner test measures 3 attention networks simultaneously: alerting (readiness), orienting (spatial), executive (conflict resolution via flanker). One trial combines: cue (none/center/double/spatial) + target (arrow with congruent/incongruent flankers). 3 biomarkers in one go.'
  },
  bartIntroDesc: {
    ru: 'Шарик можно надувать кнопкой Pump (+1¢ за каждое нажатие в копилку pending). В любой момент Cash → деньги в банк. Но шар может ЛОПНУТЬ — точка взрыва скрыта. Если лопнет — pending обнуляется. Метрика: avg pumps на не-лопнувших шарах = склонность к риску. Балансируй жадность и осторожность.',
    en: 'Pump button +1¢ to pending. Cash button → bank. But balloon may BURST at hidden point. Burst → pending lost. Metric: adjusted average pumps on non-burst balloons = risk tendency. Balance greed vs caution.'
  },
  iowaIntroDesc: {
    ru: 'Перед вами 4 колоды (A/B/C/D). Каждая карта даёт выигрыш + иногда потерю. Колоды A,B "плохие" (большой выигрыш, ОЧЕНЬ большие потери) — на длинной дистанции минус. C,D "хорошие" (меньший выигрыш, маленькие потери) — на длинной дистанции плюс. Игрок не знает какие — учится по обратной связи. Тест аффективного обучения и интуиции.',
    en: 'Four decks (A/B/C/D). Each card: win + sometimes loss. A,B are "bad" (high win, HUGE losses) — net negative long-term. C,D are "good" (lower win, small losses) — net positive long-term. You don\'t know which — learn from feedback. Tests affective learning and intuition.'
  },
  stroopEmotionalIntroDesc: {
    ru: 'Назовите ЦВЕТ шрифта, игнорируя значение слова. Слова бывают 3 валентностей: угрожающие (боль/страх/война), позитивные (радость/любовь), нейтральные (стол/окно). Угрожающие слова замедляют реакцию (attentional bias). Метрика: interference threat = RT(threat) − RT(neutral). Используется для диагностики тревожности.',
    en: 'Name the FONT COLOR, ignore the word meaning. Words have 3 valences: threat (pain/fear/war), positive (joy/love), neutral (table/window). Threat words slow reactions (attentional bias). Metric: interference threat = RT(threat) − RT(neutral). Used in anxiety research.'
  },
  spatialSpanIntroDesc: {
    ru: 'CANTAB-стиль: сетка квадратов вспыхивает в случайном порядке. Повторите последовательность В ОБРАТНОМ порядке. Длина растёт пока не ошибётесь дважды на одной длине. Backward вариант — более чистый тест visuospatial working memory чем forward (требует ментальной перестановки).',
    en: 'CANTAB-style: a grid where squares light up in random order. Reproduce the sequence IN REVERSE. Length grows until you fail twice at the same length. Backward variant — purer test of visuospatial working memory than forward (requires mental rearrangement).'
  },

  // Round-6 — benefits
  benefitPosner1: { ru: 'Пространственное внимание', en: 'Spatial attention' },
  benefitPosner2: { ru: 'Reorienting',                en: 'Reorienting' },
  benefitPosner3: { ru: 'Скорость реакции',           en: 'Reaction speed' },
  benefitAnt1:    { ru: 'Alerting attention',         en: 'Alerting' },
  benefitAnt2:    { ru: 'Orienting attention',        en: 'Orienting' },
  benefitAnt3:    { ru: 'Executive control',          en: 'Executive control' },
  benefitBart1:   { ru: 'Принятие решений в риске',   en: 'Risk decision-making' },
  benefitBart2:   { ru: 'Калибровка вероятностей',    en: 'Probability calibration' },
  benefitBart3:   { ru: 'Импульс vs осторожность',    en: 'Impulse vs caution' },
  benefitIgt1:    { ru: 'Аффективное обучение',       en: 'Affective learning' },
  benefitIgt2:    { ru: 'Долгосрочная стратегия',     en: 'Long-term strategy' },
  benefitIgt3:    { ru: 'Соматические маркеры',       en: 'Somatic markers' },
  benefitStroop2_1: { ru: 'Подавление эмоций',         en: 'Emotion suppression' },
  benefitStroop2_2: { ru: 'Attentional bias',          en: 'Attentional bias' },
  benefitStroop2_3: { ru: 'Контроль реакции',          en: 'Response control' },
  benefitSs1:     { ru: 'Зрительно-простр. память',   en: 'Visuospatial memory' },
  benefitSs2:     { ru: 'Ментальная перестановка',    en: 'Mental rearrangement' },
  benefitSs3:     { ru: 'Span backward',               en: 'Backward span' },

  // ─── Group games (merged cards): Inhibition + AttentionConflict + Span ──
  // Inhibition (Go/No-Go + Stop-Signal + Mixed)
  inhibition:        { ru: 'Торможение',                          en: 'Inhibition' },
  inhibitionDesc:    { ru: 'Go/No-Go и Стоп-сигнал в одной игре',  en: 'Go/No-Go and Stop-Signal in one game' },
  inhibitionIntroDesc: {
    ru: 'Две парадигмы торможения в одной игре. Go/No-Go = решение ДО движения (action restraint). Стоп-сигнал = отмена УЖЕ начатого движения (action cancellation). Микс — чередование обоих, плюс тренировка переключения между типами торможения. Биомаркеры (% commission errors, SSRT) сохраняются раздельно — совместимы с историей.',
    en: 'Two inhibition paradigms in one game. Go/No-Go = decision BEFORE movement (action restraint). Stop-Signal = cancellation of ALREADY initiated movement (action cancellation). Mixed alternates both, training switching between inhibition types. Biomarkers (% commission errors, SSRT) saved separately — backward-compatible with history.'
  },
  inhibitionModeLabel: { ru: 'Парадигма',  en: 'Paradigm' },
  inhibitionGngHint:   { ru: 'Зелёный круг = жми. Красный = НЕ жми. Решение ДО движения.', en: 'Green = press. Red = DON\'T press. Decide before moving.' },
  inhibitionSsHint:    { ru: 'Жми GO быстро. Если появится ✋ — отмени уже начатое.', en: 'Tap GO fast. If ✋ appears — cancel the initiated motion.' },
  inhibitionMixedHint: { ru: 'Чередование Go/No-Go и Стоп-сигнала — тренировка переключения между типами торможения.', en: 'Alternates Go/No-Go and Stop-Signal — trains switching between inhibition types.' },
  mixedMode:           { ru: 'Микс',  en: 'Mixed' },
  benefitInhibition1:  { ru: 'Подавление импульса',     en: 'Impulse suppression' },
  benefitInhibition2:  { ru: 'Скорость остановки',      en: 'Stopping speed' },
  benefitInhibition3:  { ru: 'Контроль ошибок',         en: 'Error control' },

  // Attention Conflict (Stroop + Stroop-emotional + Flanker)
  attentionConflict:        { ru: 'Конфликт внимания',                en: 'Attention Conflict' },
  attentionConflictDesc:    { ru: 'Подавление автоматического конфликтующего ответа', en: 'Suppress automatic conflicting response' },
  attentionConflictPickMode:{ ru: 'Выбери парадигму',  en: 'Choose paradigm' },
  attentionConflictFootnote:{
    ru: 'Все три тренируют одну способность — interference resolution. Биомаркер (interference effect = RT_inc − RT_con) сохраняется отдельно для каждой парадигмы.',
    en: 'All three train one ability — interference resolution. Biomarker (interference effect = RT_inc − RT_con) saved separately per paradigm.'
  },

  // Span group (Digit Span + Corsi + Spatial Span)
  spanGroup:        { ru: 'Span: память на последовательности',          en: 'Span: Sequence Memory' },
  spanGroupDesc:    { ru: 'Цифры или пространство, прямой или обратный', en: 'Digits or space, forward or backward' },
  spanPickModality: { ru: 'Выбери модальность', en: 'Choose modality' },
  spanFootnote: {
    ru: 'Wechsler / Corsi paradigm. Биомаркер max_span сохраняется отдельно для каждой модальности — можно сравнивать вербальную и пространственную WM на одном экране Statistics.',
    en: 'Wechsler / Corsi paradigm. Biomarker max_span saved separately per modality — verbal vs spatial WM comparable on one Statistics screen.'
  },

  // Round-6 — new skill
  skillRisk:      { ru: 'Тренируем: оценка риска',     en: 'Training: risk assessment' },

  // Shared
  posnerHint:     { ru: 'Где появилась мишень? Не доверяйте cue слепо',     en: 'Where did target appear? Don\'t trust cue blindly' },
  bartHint:       { ru: 'Pump надувает (+1¢) · Cash забирает в банк',         en: 'Pump inflates (+1¢) · Cash banks it' },
  bartPopped:     { ru: '💥 Шар лопнул — деньги потеряны',                  en: '💥 Burst — money lost' },
  bartCashed:     { ru: '✓ Деньги в банке',                                  en: '✓ Cashed in' },
  bartPump:       { ru: 'Pump',                                              en: 'Pump' },
  bartCash:       { ru: 'Cash',                                              en: 'Cash' },
  balloonsCount:  { ru: 'Шаров',                                             en: 'Balloons' },
  iowaHint:       { ru: 'Выберите колоду · Учитесь какие выгодные',          en: 'Pick a deck · Learn which are good' },
  stroop2Hint:    { ru: 'Жмите ЦВЕТ ШРИФТА · игнорируйте значение слова',    en: 'Tap FONT COLOR · ignore word meaning' },
  color_red:      { ru: 'Красный', en: 'Red' },
  color_green:    { ru: 'Зелёный', en: 'Green' },
  color_blue:     { ru: 'Синий',   en: 'Blue' },
  color_yellow:   { ru: 'Жёлтый',  en: 'Yellow' },

  // Round 7 — CPT
  cpt:            { ru: 'CPT: устойчивое внимание', en: 'CPT: Sustained Attention' },
  cptDesc:        { ru: 'Жми на X. На высоких уровнях — только если перед X была A', en: 'Tap X. On higher levels — only when X follows A' },
  cptIntroDesc: {
    ru: 'CPT — измерение устойчивого внимания и импульс-контроля. Примерно раз в секунду появляется буква. Уровни 1-5: жми на КАЖДУЮ X (классический X-CPT). Уровни 6-15: AX-CPT — жми на X ТОЛЬКО если перед ней была A (нагрузка на рабочую память); темп растёт, добавляются похожие на X буквы. Длительность фиксирована ~90 секунд — сложность растёт ТРУДНОСТЬЮ задачи, а не временем. Биомаркеры: пропуски (omission), ложные нажатия (commission), средняя реакция, вариативность реакции (CV-RT — сильный ADHD-маркер), снижение бдительности к концу сессии.',
    en: 'CPT — measures sustained attention and impulse control. About once a second a letter appears. Levels 1-5: tap EVERY X (classic X-CPT). Levels 6-15: AX-CPT — tap X ONLY if it followed an A (working-memory load); pace rises and X-look-alike letters are added. Duration is fixed at ~90 seconds — difficulty grows by TASK difficulty, not by time. Biomarkers: omission errors, commission errors, mean RT, RT variability (CV-RT — strong ADHD marker), vigilance decrement toward the end of the session.'
  },
  cptDuration:    { ru: 'Уровень', en: 'Level' },
  cptStrenuous:   { ru: 'Игра на концентрацию — лучше в спокойной обстановке', en: 'A concentration task — best in a calm setting' },
  cptHint:        { ru: 'Жми на X (на AX-уровнях — только если перед X была A)', en: 'Tap X (on AX levels — only if X followed an A)' },

  benefitCpt1:    { ru: 'Устойчивое внимание (vigilance)',  en: 'Sustained attention (vigilance)' },
  benefitCpt2:    { ru: 'Контроль импульса (X = stop)',      en: 'Impulse control (X = stop)' },
  benefitCpt3:    { ru: 'RT variability (ADHD-маркер)',      en: 'RT variability (ADHD marker)' },

  skillSustainedAttention: { ru: 'Тренируем: устойчивое внимание', en: 'Training: sustained attention' },

  // Round 7 — PRL
  prl:            { ru: 'PRL: смена правил',           en: 'PRL: Reversal Learning' },
  prlDesc:        { ru: 'Один из 2 цветов даёт +10. Когда правило поменяется — переключись', en: 'One of 2 colors pays +10. When rule reverses — switch' },
  prlIntroDesc: {
    ru: 'Probabilistic Reversal Learning (Cools 2002, Hampshire 2008) — классический тест функции орбитофронтальной коры (vmPFC). Перед тобой 2 круга — синий (A) и оранжевый (B). Один даёт +10¢ с вероятностью 80%, второй с 20%. Через несколько правильных подряд правила СКРЫТНО меняются местами — теперь хороший стал плохим. Ты должен заметить по обратной связи и переключиться. Ключевые биомаркеры: reversal_errors (медленность переучивания), perseverative_errors (продолжаешь старое правило несмотря на негатив), win_stay_rate, lose_shift_rate. Прямой коррелят финансовых решений: vmPFC обновляет ценность по обратной связи; PRL мерит насколько быстро. Третья ножка финансового combo (Iowa + BART + PRL).',
    en: 'Probabilistic Reversal Learning (Cools 2002, Hampshire 2008) — classic orbitofrontal/vmPFC test. Two circles: blue (A) and orange (B). One pays +10¢ with 80% probability, the other with 20%. After several correct in a row, rules SILENTLY swap — good became bad. You must detect from feedback and switch. Key biomarkers: reversal_errors (slow relearning), perseverative_errors (sticking to old rule despite punishment), win_stay_rate, lose_shift_rate. Direct correlate of financial decision-making: vmPFC updates value from feedback; PRL measures how fast. Third leg of financial combo (Iowa + BART + PRL).'
  },
  prlHint:        { ru: 'Выбирай круг. Правило может меняться — следи за фидбеком', en: 'Pick a circle. Rule may change — watch feedback' },
  prlNote:        { ru: 'Главное правило: после нескольких правильных подряд правила меняются. Не упрямься со старым выбором.', en: 'Key rule: after several correct in a row, rules swap. Don\'t persist with old choice.' },
  benefitPrl1:    { ru: 'Обучение по обратной связи (vmPFC)', en: 'Feedback-based learning (vmPFC)' },
  benefitPrl2:    { ru: 'Гибкость к смене правил',            en: 'Flexibility to rule changes' },
  benefitPrl3:    { ru: 'Финансовые решения (Iowa+BART+PRL)',  en: 'Financial decisions (Iowa+BART+PRL)' },

  // Round 7 — C2 Phonemic Fluency
  phonemic:        { ru: 'Беглость речи (COWAT)',           en: 'Phonemic Fluency (COWAT)' },
  phonemicDesc:    { ru: 'Назови максимум слов на букву за 60с', en: 'Name max words on a letter in 60s' },
  phonemicIntroDesc: {
    ru: 'COWAT (Controlled Oral Word Association Test) — классический тест беглости речи. За 60 сек называй максимум слов, начинающихся с заданной буквы. Запрещены имена собственные и повторы. Биомаркеры: word_count, mean_inter_word_sec (время между словами — выше = труднее доступ к лексикону), first_half vs second_half (выносливость). Прямая мера лексической доступности под временным давлением — критично для публичных выступлений и переговоров.',
    en: 'COWAT (Controlled Oral Word Association Test) — classic verbal fluency test. In 60s name max words starting with a given letter. No proper names, no repetitions. Biomarkers: word_count, mean_inter_word_sec (time between words — higher = harder lexical access), first_half vs second_half (endurance). Direct measure of lexical access under time pressure — critical for public speaking and negotiations.'
  },
  phonemicLetter:  { ru: 'Буква', en: 'Letter' },
  phonemicAutoPick:{ ru: 'Случайная буква', en: 'Random letter' },
  phonemicRules:   { ru: 'Правила: только нарицательные, длина ≥ 2, без повторов',
                    en: 'Rules: common nouns only, length ≥ 2, no repetitions' },
  phonemicHint:    { ru: 'Слова на букву "{L}". Жми Enter после каждого', en: 'Words starting with "{L}". Press Enter after each' },
  phonemicPlaceholder: { ru: '{L}...', en: '{L}...' },
  phonemicAdd:     { ru: 'добавить', en: 'add' },
  benefitFlu1:     { ru: 'Беглость речи',          en: 'Verbal fluency' },
  benefitFlu2:     { ru: 'Лексический доступ',     en: 'Lexical access' },
  benefitFlu3:     { ru: 'Публичные выступления',  en: 'Public speaking' },

  // Round 7 — C4 Story Recall
  story:           { ru: 'Story Recall: память на детали', en: 'Story Recall: detail memory' },
  storyDesc:       { ru: 'Прочитай рассказ → восстанови сейчас и через 90с',
                    en: 'Read a story → recall now and after 90s' },
  storyIntroDesc: {
    ru: 'Logical Memory subtest (Wechsler Memory Scale) — классическая проба эпизодической памяти. Читаешь короткий рассказ (~30 сек), затем дистрактор-задачи (арифметика 30 сек) — immediate recall (восстанови всё что помнишь). Затем дистрактор 90 сек — delayed recall. Биомаркеры: immediate_recall_pct (% ключевых деталей), delayed_recall_pct, retention_rate (delayed/immediate; ≥0.85 = норма). Critical для бизнеса: помнишь ли детали встречи через 1.5 мин дистрактора.',
    en: 'Logical Memory subtest (Wechsler Memory Scale) — classic episodic memory test. Read a short story (~30 sec), then distractor (arithmetic 30 sec) — immediate recall (write what you remember). Then distractor 90 sec — delayed recall. Biomarkers: immediate_recall_pct, delayed_recall_pct, retention_rate (delayed/immediate; ≥0.85 = normal). Critical for business: do you remember meeting details after 1.5 min of distraction.'
  },
  storyInfo:       { ru: 'Структура теста', en: 'Test structure' },
  storyInfoBody:   { ru: 'Read 30s → Math distractor 30s → Recall 1 → Math distractor 90s → Recall 2',
                    en: 'Read 30s → Math distractor 30s → Recall 1 → Math distractor 90s → Recall 2' },
  storyReadPhase:  { ru: 'ЧИТАЙ И ЗАПОМИНАЙ', en: 'READ AND MEMORIZE' },
  storyReadHint:   { ru: 'Запоминай детали — потом восстановишь', en: 'Remember details — you will recall them' },
  storyDistractor1:{ ru: 'отвлечение 1', en: 'distractor 1' },
  storyDistractor2:{ ru: 'отвлечение 2', en: 'distractor 2' },
  storyDistractorHint: { ru: 'Решай задачи. Это пауза перед recall.', en: 'Solve math. This is the pause before recall.' },
  storyImmediate:  { ru: 'IMMEDIATE RECALL', en: 'IMMEDIATE RECALL' },
  storyDelayed:    { ru: 'DELAYED RECALL', en: 'DELAYED RECALL' },
  storyRecallHint: { ru: 'Напиши всё что помнишь из рассказа', en: 'Write everything you remember from the story' },
  storyRecallPlaceholder: { ru: 'имена, числа, места, действия...', en: 'names, numbers, places, actions...' },
  storyDone:       { ru: 'Готово', en: 'Done' },
  benefitStory1:   { ru: 'Эпизодическая память',     en: 'Episodic memory' },
  benefitStory2:   { ru: 'Удержание под отвлечением', en: 'Retention under distraction' },
  benefitStory3:   { ru: 'Бизнес-встречи / детали',   en: 'Business meetings / details' },

  // Round 7 — C5 RMET
  rmet:            { ru: 'Reading Mind in Eyes',   en: 'Reading the Mind in the Eyes' },
  rmetDesc:        { ru: 'Угадай эмоцию по глазам', en: 'Guess emotion from the eyes' },
  rmetIntroDesc: {
    ru: 'Reading the Mind in the Eyes Test (Baron-Cohen 2001) — классический тест cognitive empathy / Theory of Mind. Видишь выражение глаз и краткое описание, выбираешь одну эмоцию из 4. Норма для оригинального 36-trial: 22-30 правильных. Биомаркер accuracy. Критично для переговоров и публичной коммуникации — мера декодирования эмоционального состояния собеседника.',
    en: 'Reading the Mind in the Eyes Test (Baron-Cohen 2001) — classic cognitive empathy / Theory of Mind test. See eye expression + brief context, pick one emotion from 4. Normal range for original 36-trial: 22-30 correct. Biomarker: accuracy. Critical for negotiations and public communication — measures decoding of partner emotional state.'
  },
  rmetNote:        { ru: 'Замена для оригинала с фотографиями: схематичные рисованные глаза. Психометрически направление верное, точные нормы могут отличаться.',
                    en: 'Substitute for the original photo set: schematic drawn eyes. Psychometric direction valid; exact norms may differ.' },
  rmetHint:        { ru: 'Какая эмоция? Выбери одну', en: 'Which emotion? Pick one' },
  benefitRmet1:    { ru: 'Cognitive empathy',         en: 'Cognitive empathy' },
  benefitRmet2:    { ru: 'Theory of Mind',            en: 'Theory of Mind' },
  benefitRmet3:    { ru: 'Переговоры и коммуникация', en: 'Negotiations and communication' },

  skillSocial:     { ru: 'Тренируем: социальное познание', en: 'Training: social cognition' },

  alert_telegram_open_failed: { ru: 'Не удалось открыть Telegram', en: 'Could not open Telegram' },
  msg_invalid_code: { ru: 'Неверный код. Проверь и попробуй ещё раз.', en: 'Invalid code. Check it and try again.' },
  alert_permission_needed: { ru: 'Нужно разрешение', en: 'Permission needed' },
  msg_allow_notifications: { ru: 'Разреши уведомления в настройках устройства, чтобы получать напоминания.', en: 'Allow notifications in your device settings to receive reminders.' },
  alert_backup_copied: { ru: 'Бэкап скопирован ✓', en: 'Backup copied ✓' },
  alert_backup: { ru: 'Бэкап', en: 'Backup' },
  msg_backup_copied_full: { ru: 'Весь бэкап скопирован в буфер обмена. Вставь его в заметки или файл и сохрани. Для восстановления — скопируй этот текст и нажми «Восстановить из бэкапа».', en: 'The full backup is copied to the clipboard. Paste it into notes or a file and keep it safe. To restore — copy that text and tap “Restore from backup”.' },
  msg_clipboard_copy_failed: { ru: 'Не удалось скопировать в буфер обмена.', en: 'Could not copy to clipboard.' },
  alert_export_error: { ru: 'Ошибка экспорта', en: 'Export error' },
  msg_backup_create_failed: { ru: 'Не удалось создать бэкап', en: 'Failed to create backup' },
  alert_backup_restored: { ru: 'Бэкап восстановлен ✓', en: 'Backup restored ✓' },
  alert_restore_from_clipboard: { ru: 'Восстановление из буфера', en: 'Restore from clipboard' },
  msg_paste_backup_json: { ru: 'Скопируй текст бэкапа (JSON) в буфер обмена и снова нажми «Восстановить из бэкапа».', en: 'Copy the backup text (JSON) to the clipboard, then tap “Restore from backup” again.' },
  alert_import_error: { ru: 'Ошибка импорта', en: 'Import error' },
  msg_restore_failed: { ru: 'Не удалось восстановить', en: 'Failed to restore' },
  label_profile: { ru: 'Профиль', en: 'Profile' },
  desc_profile_section: { ru: 'У каждого профиля свой набор тренажёров, свой плейлист зарядки и своя история.', en: 'Each profile has its own set of exercises, its own warm-up playlist and its own history.' },
  label_personal: { ru: 'Личные', en: 'Personal' },
  label_themed_codes_on: { ru: '🎯 Тематические (9 тренажёров каждый · ODV999 = все 48)', en: '🎯 Themed (9 exercises each · ODV999 = all 48)' },
  label_themed_codes_off: { ru: '🎯 Тематические · 5 открыты бесплатно, остальные скоро', en: '🎯 Themed · 5 free now, the rest coming soon' },
  btn_enter_code: { ru: 'Ввести код', en: 'Enter code' },
  alert_reset_unlocks: { ru: 'Сбросить разблокировки?', en: 'Reset unlocks?' },
  msg_reset_unlocks_confirm: { ru: 'Все ранее введённые коды забудутся. Чтобы вернуть профили — нужно будет снова ввести коды.', en: 'All previously entered codes will be forgotten. To restore the profiles you will need to enter the codes again.' },
  btn_cancel: { ru: 'Отмена', en: 'Cancel' },
  btn_reset: { ru: 'Сбросить', en: 'Reset' },
  label_unlocked: { ru: 'Разблокировано', en: 'Unlocked' },
  title_access_code: { ru: 'Код доступа', en: 'Access code' },
  desc_enter_code: { ru: 'Введите код чтобы разблокировать тематический профиль (ODV999, Шахматист, Дети, Скорочтение, NZT-48, Водители, 50+, Предприниматели, Студенты ЕГЭ, Женщины).', en: 'Enter a code to unlock a themed profile (ODV999, Chess Player, Kids, Speed Reading, NZT-48, Drivers, 50+, Entrepreneurs, Exam Students, Women).' },
  ph_code_example: { ru: 'например, CHESS-NZT-2026', en: 'e.g. CHESS-NZT-2026' },
  badge_morning_warmup: { ru: 'Утренняя Зарядка', en: 'Morning Warm-up' },
  label_all_48_games: { ru: 'Все 48 тренажёров', en: 'All 48 exercises' },
  desc_full_library: { ru: 'Полная библиотека: 12 памяти · 7 внимания · 14 логики · 15 скорости/торможения. Все 48 — без ограничений.', en: 'Full library: 12 memory · 7 attention · 14 logic · 15 speed/inhibition. All 48 — no limits.' },
  label_coming_soon: { ru: 'Скоро', en: 'Coming soon' },
  btn_already_have_code: { ru: 'У меня уже есть код — ввести', en: 'I already have a code — enter it' },
  btn_switch_to_profile: { ru: 'Переключиться на этот профиль', en: 'Switch to this profile' },
  label_current_profile: { ru: 'Это твой текущий профиль', en: 'This is your current profile' },
  label_sound: { ru: 'Звук', en: 'Sound' },
  label_vibration: { ru: 'Вибрация', en: 'Vibration' },
  label_reminders: { ru: 'Напоминания', en: 'Reminders' },
  label_reminder_warmup: { ru: '🧠 Зарядка', en: '🧠 Warm-up' },
  label_reminder_sleep: { ru: '🌙 Перед сном', en: '🌙 Before sleep' },
  btn_replay_tutorial: { ru: 'Показать туториал заново', en: 'Replay the tutorial' },
  btn_save_backup: { ru: 'Сохранить бэкап прогресса', en: 'Save progress backup' },
  btn_restore_backup: { ru: 'Восстановить из бэкапа', en: 'Restore from backup' },
  label_validated_paradigms: { ru: '48 валидированных парадигм', en: '48 validated paradigms' },
  hint_profile_tap_telegram: { ru: 'Клик по профилю → детали + запрос кода в Telegram', en: 'Tap a profile → details + request a code on Telegram' },
  hint_profile_tap_unlock: { ru: 'Клик по профилю → детали и разблокировка кодом', en: 'Tap a profile → details and unlock with a code' },
  btn_hint: { ru: 'Подсказка', en: 'Hint' },
  label_on: { ru: 'Вкл', en: 'On' },
  label_off: { ru: 'Выкл', en: 'Off' },
  label_balloon: { ru: 'Шар', en: 'Balloon' },
  label_burst_risk: { ru: 'Риск взрыва на след. pump', en: 'Burst risk on next pump' },
  desc_counter_rules: { ru: 'Выберите числа, сумма которых равна целевому числу. Если сумма превысит цель - ошибка!', en: 'Select numbers that sum to the target. If sum exceeds target - error!' },
  label_find_sum: { ru: 'НАЙДИТЕ СУММУ', en: 'FIND SUM' },
  label_your_sum: { ru: 'Ваша сумма:', en: 'Your sum:' },
  label_correct_excl: { ru: 'ВЕРНО!', en: 'CORRECT!' },
  btn_stop: { ru: 'СТОП', en: 'STOP' },
  hint_autocheck: { ru: 'авто-проверка после ввода', en: 'auto-check after input' },
  msg_correct_level_up: { ru: 'Правильно! +1 уровень', en: 'Correct! +1 level' },
  label_was: { ru: 'Было', en: 'Was' },
  label_level_short_lower: { ru: 'ур.', en: 'lv' },
  label_mode_static: { ru: '🔲 Static (паттерн)', en: '🔲 Static (pattern)' },
  label_mode_sequential: { ru: '➡️ Sequential (порядок)', en: '➡️ Sequential (order)' },
  label_reference: { ru: 'эталон', en: 'reference' },
  label_mnemonics: { ru: 'Мнемоника', en: 'Mnemonics' },
  desc_mnemonics_short: { ru: 'Запоминание слов или чисел в порядке', en: 'Memorize words or numbers in order' },
  desc_mnemonics_rules: { ru: 'Запомните порядок, затем отмечайте элементы сверху вниз, слева направо. Штраф: 15 сек.', en: 'Memorize the order, then select items top-to-bottom, left-to-right. Penalty: 15 sec.' },
  label_words: { ru: 'Слова', en: 'Words' },
  label_count: { ru: 'Количество', en: 'Count' },
  btn_check: { ru: 'Проверка', en: 'Check' },
  label_selected: { ru: 'Выбрано', en: 'Selected' },
  label_restore_order: { ru: 'Восстановите порядок', en: 'Restore the order' },
  hint_top_to_bottom: { ru: 'Сверху вниз, слева направо', en: 'Top to bottom, left to right' },
  label_photo_memory: { ru: '📸 Фото-память', en: '📸 Photo memory' },
  desc_photo_memory: { ru: 'Все карты на миг откроются — запомни и собери пары', en: 'All cards flash for an instant — memorize them and match the pairs' },
  label_memorize: { ru: '📸 ЗАПОМИНАЙ', en: '📸 MEMORIZE' },
  desc_proofreading: { ru: 'Найдите все вхождения двух заданных символов в таблице', en: 'Find all occurrences of two given symbols in the table' },
  label_rows: { ru: 'Строки', en: 'Rows' },
  label_columns: { ru: 'Столбцы', en: 'Columns' },
  label_type: { ru: 'Тип', en: 'Type' },
  label_digits_numbers: { ru: 'Цифры', en: 'Numbers' },
  label_letters: { ru: 'Буквы', en: 'Letters' },
  label_mixed_1a2b: { ru: '1-А-2-Б', en: '1-A-2-B' },
  hint_backward_harder: { ru: 'Обратный режим сложнее — мозг привычно ищет по возрастанию.', en: 'Backward is harder — brain naturally searches ascending.' },
  label_not_set: { ru: 'Не SET — разбор по признакам:', en: 'Not a SET — attribute breakdown:' },
  label_shape: { ru: 'Форма', en: 'Shape' },
  label_color: { ru: 'Цвет', en: 'Color' },
  label_fill: { ru: 'Штрих', en: 'Fill' },
  label_count_short: { ru: 'Кол-во', en: 'Count' },
  hint_set_rule: { ru: 'Каждый признак должен быть либо ОДИНАКОВ на всех 3, либо РАЗНЫЙ на всех 3', en: 'Each attribute must be either ALL SAME across the 3 or ALL DIFFERENT across the 3' },
  hint_simon_color_rule: { ru: '🔵 → ⬅️ левая  ·  🔴 → ➡️ правая  (по цвету, не по позиции)', en: '🔵 → ⬅️ left  ·  🔴 → ➡️ right  (by color, not by position)' },
  desc_targets: { ru: 'Два объекта одинакового цвета = мишень. Нажмите на кнопку, когда видите мишень.', en: 'Two objects of same color = target. Click when you see a target.' },
  hint_targets_field: { ru: 'Поле: 2 из 3 фигур одного цвета', en: 'Field: 2 of 3 shapes same color' },
  hint_targets_joker: { ru: 'Джокер: цвет предыдущего круга = цвет квадрата', en: 'Joker: prev circle color = square color' },
  label_ready: { ru: 'Готовы?', en: 'Ready?' },
  hint_targets_press: { ru: 'Нажмите МИШЕНЬ!, когда увидите два объекта одинакового цвета', en: 'Click TARGET! when you see two objects of the same color' },
  btn_start_caps: { ru: 'НАЧАТЬ', en: 'START' },
  label_lives: { ru: 'Жизни', en: 'Lives' },
  label_prev_circle: { ru: 'Пред. круг:', en: 'Prev circle:' },
  label_target_excl: { ru: 'МИШЕНЬ!', en: 'TARGET!' },
  hint_targets_tap_if: { ru: 'Нажмите, если видите мишень (2 одинаковых цвета)', en: 'Click if you see a target (2 same colors)' },
  label_level_short: { ru: 'Ур.', en: 'Lvl' },
  desc_word_pairs_rules: { ru: 'Запомните пары слов, затем восстановите связи. Штраф за ошибку: 15 сек.', en: 'Memorize word pairs, then restore connections. Penalty: 15 sec per error.' },
  label_random_pairs: { ru: 'Случайные пары', en: 'Random pairs' },
  label_translation: { ru: 'Перевод', en: 'Translation' },
  label_translate: { ru: 'Перевод', en: 'Translate' },
  label_pairs_count: { ru: 'Количество пар', en: 'Number of pairs' },
  label_memorize_word_pairs: { ru: 'Запомните пары слов', en: 'Memorize word pairs' },
  label_found: { ru: 'Найдено', en: 'Found' },
  label_restore_pairs: { ru: 'Восстановите пары', en: 'Restore pairs' },
  title_about_game: { ru: 'Об игре', en: 'About Game' },
  title_how_it_works: { ru: 'Как это работает', en: 'How it works' },
  title_real_life_benefits: { ru: 'Польза в жизни', en: 'Real-life benefits' },
  title_tip: { ru: 'Совет', en: 'Tip' },
  desc_regular_training_tip: { ru: 'Регулярные тренировки по 5-10 минут в день дают лучший результат, чем редкие длинные сессии.', en: 'Regular 5-10 minute daily sessions give better results than occasional long sessions.' },
  // ЗАЧЕМ «Как играть» вместо «Справка» (репорты по set-game и n-back: «не понимаю
  // как играть, справка где?»): человек ищет глазами свой вопрос, а не служебное
  // слово «справка» — кнопка должна называться его словами.
  btn_help: { ru: 'Как играть', en: 'How to play', es: 'Cómo jugar', pt: 'Como jogar', de: 'Spielanleitung', zh: '怎么玩', hi: 'कैसे खेलें' },
  // Подпись под глобальной «?»-кнопкой (GameHelpOverlay) — голая иконка не читалась.
  btn_rules: { ru: 'Правила', en: 'Rules', es: 'Reglas', pt: 'Regras', de: 'Regeln', zh: '规则', hi: 'नियम' },
  btn_got_it: { ru: 'Понятно', en: 'Got it', es: 'Entendido', pt: 'Entendi', de: 'Verstanden', zh: '明白了', hi: 'समझ गया' },
  // Одноразовое облачко-указатель на «?» при первом заходе в игру.
  helpCoachText: {
    ru: 'Не понимаешь, как играть? Правила игры — здесь',
    en: 'Not sure how to play? The rules are here',
    es: '¿No sabes cómo jugar? Las reglas están aquí',
    pt: 'Não sabe como jogar? As regras estão aqui',
    de: 'Unklar, wie es geht? Hier sind die Regeln',
    zh: '不知道怎么玩？规则在这里',
    hi: 'खेलना समझ नहीं आया? नियम यहाँ हैं',
  },
  toast_new_level_unlocked: { ru: '🎉 Новый уровень разблокирован!', en: '🎉 New level unlocked!' },

  // ── v1.132: вынесенные из инлайн-тернаров `language === 'ru' ? … : …` ──
  // (index/settings/pet/statistics/shop/onboarding + src/components).
  // Плейсхолдеры {n}/{max}/{best}/{avg}/{name}/{emoji}/{tg} подставляются через .replace().

  // Home (index)
  streakLabel: { ru: 'Стрик', en: 'Streak' },   // дневной стрик (brStreak «Серия» — про Brain Workshop, не путать)
  petSynapse: { ru: 'Питомец Синапс', en: 'Synapse pet' },
  petSize: { ru: 'Размер питомца', en: 'Pet size' },
  shop: { ru: 'Магазин', en: 'Shop' },
  dailyChallenge: { ru: 'Вызов дня', en: 'Daily challenge' },

  // Settings — перенос прогресса, коды, тумблеры
  tgRequestCodeMsg: { ru: 'Привет, Денис! Хочу получить код доступа к профилю «{name}» ({emoji}) в PsyGames. Это для меня / для (укажи кому, если в подарок).', en: 'Hi Denis! I\'d like an access code for the "{name}" profile ({emoji}) in PsyGames. It\'s for me / for (specify who, if it\'s a gift).' },
  messageManually: { ru: 'Напиши вручную: @{tg}', en: 'Message manually: @{tg}' },
  copied: { ru: 'Скопировано', en: 'Copied' },
  copyManually: { ru: 'Выдели код и скопируй вручную', en: 'Select and copy manually' },
  importDoneMsg: { ru: 'Перенесено {n} записей. Перезапусти приложение, чтобы увидеть прогресс.', en: 'Imported {n} entries. Restart the app to see your progress.' },
  importFailedTitle: { ru: 'Не вышло', en: 'Failed' },
  importFailedBody: { ru: 'Код повреждён или пустой. Скопируй его целиком.', en: 'Code is invalid or empty. Copy it fully.' },
  backupRestoredMsg: { ru: 'Восстановлено {n} записей. Перезапусти приложение чтобы данные применились.', en: 'Restored {n} records. Restart the app to apply the data.' },
  exercisesInProfile: { ru: '{n} тренажёров в этом профиле', en: '{n} exercises in this profile' },
  comingSoonBody: { ru: 'Этот профиль откроется после запуска. Сейчас бесплатно доступны:\n💊 NZT-48 · 🌸 Микро-релакс · 🧒 Дети · 👴 50+ · 🎓 Студенты\n— выбери любой из них.', en: 'This profile will open after launch. Available free right now:\n💊 NZT-48 · 🌸 Micro-relax · 🧒 Kids · 👴 50+ · 🎓 Students\n— pick any of them.' },
  requestCodeFrom: { ru: 'Запросить код у @{tg}', en: 'Request a code from @{tg}' },
  requestCodeHint: { ru: 'Напиши Денису в Telegram — он выдаст персональный код доступа\nза 5 минут (рабочие часы Мск).', en: 'Message Denis on Telegram — he\'ll issue a personal access code\nwithin 5 minutes (Moscow business hours).' },
  music: { ru: 'Музыка', en: 'Music' },
  colorblindMode: { ru: 'Без цвета (дальтонизм)', en: 'Colorblind mode' },
  devChatToggle: { ru: 'Чат с разработчиками', en: 'Developer chat button' },
  transferProgress: { ru: 'Перенос прогресса', en: 'Transfer progress' },
  transferProgressHint: { ru: 'Достижения и уровни хранятся на устройстве. Экспортируй код здесь, вставь на другом устройстве.', en: 'Achievements and levels live on this device. Export a code here, paste it on another device.' },
  exportGetCode: { ru: 'Экспорт (получить код)', en: 'Export (get code)' },
  importPasteCode: { ru: 'Импорт (вставить код)', en: 'Import (paste code)' },
  progressCodeTitle: { ru: 'Код прогресса', en: 'Progress code' },
  pasteCodeTitle: { ru: 'Вставь код', en: 'Paste code' },
  exportCodeHint: { ru: 'Скопируй этот код и вставь на другом устройстве в «Импорт».', en: 'Copy this code and paste it into "Import" on another device.' },
  copy: { ru: 'Копировать', en: 'Copy' },
  close: { ru: 'Закрыть', en: 'Close' },
  pasteCodePlaceholder: { ru: 'Вставь код сюда…', en: 'Paste code here…' },
  apply: { ru: 'Применить', en: 'Apply' },

  // Pet (Синапс)
  petName: { ru: 'Синапс', en: 'Synapse' },
  petGrowsHint: { ru: 'Растёт после каждой завершённой тренировки', en: 'Grows with every completed training' },
  petSkillLogic: { ru: 'Логика', en: 'Logic' },     // короткая форма (catLogic — длинное название категории)
  petSkillSpeed: { ru: 'Скорость', en: 'Speed' },
  unitTrainingOne: { ru: 'тренировка', en: 'training' },
  unitTrainings: { ru: 'тренировок', en: 'trainings' },

  // Statistics
  unitHourShort: { ru: 'ч', en: 'h' },
  unitMinShort: { ru: 'м', en: 'm' },
  allGames: { ru: 'Все игры', en: 'All games' },
  totalPlayedCompleted: { ru: 'Всего сыграно: {n} игр (завершённых)', en: 'Total played: {n} games (completed)' },
  tokensLabel: { ru: 'Очки', en: 'Tokens' },
  gamesPlayed: { ru: 'игр сыграно', en: 'games played' },
  inGameTime: { ru: 'в игре', en: 'in game' },
  weekInReview: { ru: 'ИТОГ НЕДЕЛИ', en: 'WEEK IN REVIEW' },
  scoreBestAvg: { ru: 'Очки — рекорд {best} · ⌀ {avg}', en: 'Score — best {best} · avg {avg}' },
  trendRecentGames: { ru: 'Динамика — последние игры', en: 'Trend — recent games' },

  // Shop
  ownedBadge: { ru: '✓ Куплено', en: '✓ Owned' },
  equipped: { ru: 'Надето', en: 'Equipped' },
  equip: { ru: 'Надеть', en: 'Equip' },
  buy: { ru: 'Купить', en: 'Buy' },
  needMoreTokens: { ru: 'Мало очков', en: 'Need more' },
  shopAccentSection: { ru: 'Акцентные темы — меняют цвет интерфейса. Купи за очки, надень бесплатно.', en: 'Accent themes — recolor the UI. Buy with tokens, equip for free.' },
  shopSoundSection: { ru: '🎵 Звуковые паки — меняют характер игровых звуков. Тапни «Надеть» — сразу слышно.', en: '🎵 Sound packs — change the game sound character. Tap Equip to hear it.' },
  shopFrameSection: { ru: '🖼️ Рамки — цветной контур вокруг чипа профиля на главном экране.', en: '🖼️ Frames — a colored outline around your profile chip on the home screen.' },
  shopTitleSection: { ru: '🏷️ Титулы — подпись под именем профиля.', en: '🏷️ Titles — a caption under your profile name.' },
  shopAvatarSection: { ru: '👤 Аватары — своя иконка профиля вместо стандартного бейджа.', en: '👤 Avatars — your own profile icon instead of the default badge.' },
  shopEarnHint: { ru: 'Очки копятся за игры, стрики и ачивки.', en: 'Tokens are earned from games, streaks and achievements.' },

  // Onboarding
  onbEnableReminders: { ru: 'ВКЛЮЧИТЬ НАПОМИНАНИЯ', en: 'ENABLE REMINDERS' },
  onbStartFirstWarmup: { ru: 'НАЧАТЬ ПЕРВУЮ ЗАРЯДКУ', en: 'START FIRST WARM-UP' },
  onbPlayDailyChallenge: { ru: 'СЫГРАТЬ ВЫЗОВ ДНЯ', en: 'PLAY TODAY’S CHALLENGE' },
  onbNext: { ru: 'ДАЛЬШЕ', en: 'NEXT' },
  skip: { ru: 'Пропустить', en: 'Skip' },
  onbWarmupReady: { ru: '⚡ 5 минут, программа на сегодня уже собрана', en: '⚡ 5 minutes, today’s program is ready' },
  today: { ru: 'Сегодня', en: 'Today' },
  notNow: { ru: 'Не сейчас', en: 'Not now' },
  justLookAround: { ru: 'Просто осмотреться', en: 'Just look around' },

  // LevelCleared (баннер между уровнями)
  eyeBreakTitle: { ru: 'Передышка для глаз', en: 'Eye break' },
  eyeBreakHint: { ru: 'Посмотри вдаль, поморгай. Дай глазам отдохнуть от азарта — играешь 10-й уровень подряд.', en: 'Look into the distance, blink. Let your eyes rest — you’ve played 10 levels in a row.' },
  levelDone: { ru: 'Уровень {n} пройден!', en: 'Level {n} done!' },
  levelAlmost: { ru: 'Уровень {n} — почти!', en: 'Level {n} — almost!' },
  cleanRunBadge: { ru: '🔥 Серия {n} чистых', en: '🔥 Clean run {n}' },
  levelStarting: { ru: 'Уровень {n} запускается…', en: 'Starting level {n}…' },
  sameLevelRetry: { ru: 'Тот же уровень — ещё раз…', en: 'Same level — retry…' },
  levelsInOrderHint: { ru: 'Дальше — уровни по порядку, сложность растёт', en: 'Next up — levels in order, difficulty grows' },
  nextNow: { ru: 'Дальше сразу', en: 'Next now' },
  retry: { ru: 'Ещё раз', en: 'Retry' },
  stop: { ru: 'Остановиться', en: 'Stop' },

  // GameResult / ResultSparkline
  earnedLabel: { ru: 'заработано', en: 'earned' },
  trendOnAverage: { ru: 'как обычно', en: 'right on your average' },
  trendBetterPct: { ru: 'лучше среднего на {n}%', en: '{n}% better than your average' },
  trendWorsePct: { ru: 'хуже среднего на {n}%', en: '{n}% worse than your average' },

  // FeedbackWidget
  feedbackSendFailed: { ru: 'Не удалось отправить. Проверь интернет и попробуй ещё раз.', en: 'Failed to send. Check your connection and try again.' },
  feedbackFabLabel: { ru: 'Сообщить о проблеме', en: 'Send feedback' },
  feedbackTitle: { ru: '💬 Что не так?', en: '💬 What’s wrong?' },
  feedbackThanks: { ru: 'Спасибо! Отправлено.', en: 'Thanks! Sent.' },
  unitLevelShort: { ru: 'ур.', en: 'lv' },   // строчная инлайн-форма (label_level_short «Ур.» — заголовочная)
  feedbackHint: { ru: 'Пиши как есть, даже коротко', en: 'Write it as is, even briefly' },
  feedbackPlaceholder: { ru: 'Например: открыл игру и не понял, что делать — нужна кнопка со справкой', en: 'E.g.: opened the game and had no idea what to do — need a help button' },
  feedbackAttachShot: { ru: '📷 Приложить скриншот этого экрана', en: '📷 Attach a screenshot of this screen' },
  send: { ru: 'Отправить', en: 'Send' },

  // LeaderboardModal / LevelProgressMap / BossRound
  leaderboardTitle: { ru: '🏆 Топ игроков', en: '🏆 Leaderboard' },
  leaderboardEmpty: { ru: 'Пока пусто — стань первым!', en: 'Empty so far — be the first!' },
  levelOfMax: { ru: 'Уровень {n}/{max}', en: 'Level {n}/{max}' },
  bossTitle: { ru: 'БОСС', en: 'BOSS' },
  bossDefeated: { ru: '🏆 Босс повержен! +⭐', en: '🏆 Boss defeated! +⭐' },
  bossSurvived: { ru: 'Босс устоял — идём дальше', en: 'Boss survived — moving on' },

  // ── вынесенные DATA-driven тернары `ru/en` из структур данных (onboarding SLIDES /
  // BossRound makeTask / KINDS фидбека / COSMETICS / STAGE_NAMES питомца / титулы
  // уровней tokens.ts / reminders / AppErrorBoundary / attention-conflict).
  // Плейсхолдер {n} (onbSlideWelcomeBody) подставляется через .replace() при рендере.

  // Onboarding — слайды (app/onboarding.tsx, SLIDES[].titleKey/bodyKey)
  onbSlideWelcomeTitle: { ru: 'Добро пожаловать в PsyGames', en: 'Welcome to PsyGames' },
  onbSlideWelcomeBody: { ru: '{n} когнитивных игр — память, внимание, логика, контроль, счёт, скорость. Каждая измеряет конкретный психометрический биомаркер.', en: '{n} cognitive games — memory, attention, logic, control, math, speed. Each one measures a specific psychometric biomarker.' },
  onbSlideWarmupTitle: { ru: 'Утренняя Зарядка', en: 'Morning Warm-up' },
  onbSlideWarmupBody: { ru: '5–15 минут утром. Программа подбирается под день недели. ВТ — внимание, СР — отдых, СБ — логика. Стрик считается по дням.', en: '5–15 minutes in the morning. The program adapts to the weekday. Tue — attention, Wed — rest, Sat — logic. Streak is counted by day.' },
  onbSlideChallengeTitle: { ru: 'Ежедневный вызов', en: 'Daily challenge' },
  onbSlideChallengeBody: { ru: 'Каждый день — одна игра из ротации, одинаковая у всех игроков. Пройди раунд до конца — день засчитан, стрик 🔥 растёт. Пропустил день — стрик сгорает.', en: 'Every day — one game from the rotation, the same for all players. Finish a round — the day counts and your 🔥 streak grows. Miss a day — the streak resets.' },
  onbSlideAssessTitle: { ru: 'Оцени свой профиль', en: 'Assess your profile' },
  onbSlideAssessBody: { ru: '12 коротких тестов (≈12 минут) → radar chart твоих сильных и слабых сторон + персональные рекомендации игр. Повторяй раз в 3 месяца чтобы видеть прогресс.', en: '12 short tests (≈12 minutes) → a radar chart of your strengths and weaknesses + personal game recommendations. Repeat every 3 months to track progress.' },
  onbSlideProfilesTitle: { ru: 'Профили под цель', en: 'Goal-based profiles' },
  onbSlideProfilesBody: { ru: 'FREE — попробовать бесплатно, без кода. 11 тематических (Шахматы, Дети, Скорочтение, NZT-48, Водители, 50+, Предприниматели, Студенты ЕГЭ, Женщины, Полиглот, ODV999) — каждый со своим набором игр и плейлистом. Открываются мастер-кодом в Settings.', en: 'FREE — try it free, no code. 11 themed (Chess, Kids, Speed reading, NZT-48, Drivers, 50+, Entrepreneurs, Exam students, Women, Polyglot, ODV999) — each with its own set of games and playlist. Unlock with a master code in Settings.' },
  onbSlideDataTitle: { ru: 'Данные надёжны', en: 'Your data is safe' },
  onbSlideDataBody: { ru: 'Каждая сессия сохраняется и локально, и в облаке. Очистка кэша браузера = не страшно. История за месяцы и годы — твоя.', en: 'Every session is saved both locally and in the cloud. Clearing your browser cache is no problem. Months and years of history are yours.' },
  onbSlideRemindTitle: { ru: 'Напоминания', en: 'Reminders' },
  onbSlideRemindBody: { ru: 'Одно мягкое напоминание утром в 9:00 — и тренировка не потеряется в делах. Время меняется в Settings, отключить можно там же.', en: 'One gentle reminder at 9:00 AM keeps your training on track. Change the time or turn it off anytime in Settings.' },
  onbSlideGoTitle: { ru: 'Поехали!', en: 'Let’s go!' },
  onbSlideGoBody: { ru: 'Лучший способ понять PsyGames — сыграть прямо сейчас. Первый раунд займёт пару минут.', en: 'The best way to get PsyGames is to play right now. Your first round takes a couple of minutes.' },

  // BossRound — интро/HUD задач босса (makeTask → introKey/hudKey)
  bossIntroLightning: { ru: 'Какой цифры НЕ ХВАТАЕТ в ряду?', en: 'Which digit is MISSING?' },
  bossHudLightning: { ru: 'Впиши пропуск', en: 'Fill the gap' },
  bossIntroCompleteline: { ru: 'Дополни ряд до 1–9 — какой цифры нет?', en: 'Complete 1-9 — which digit is missing?' },
  bossHudCompleteline: { ru: 'Недостающая цифра', en: 'Missing digit' },
  bossIntroFinderror: { ru: 'Найди ОШИБКУ — цифра повторяется в строке', en: 'Find the ERROR — a repeat in a row' },
  bossHudFinderror: { ru: 'Тапни повтор', en: 'Tap the repeat' },
  bossIntroOddletter: { ru: 'Найди ЛИШНЮЮ — гласную среди согласных', en: 'Find the ODD letter — the vowel' },
  bossHudOddletter: { ru: 'Тапни гласную', en: 'Tap the vowel' },
  bossIntroGonogo: { ru: 'Тапни только ЗЕЛЁНЫЙ, подави остальные', en: 'Tap only GREEN' },
  bossHudGonogo: { ru: 'Зелёный!', en: 'Green!' },
  bossIntroCounting: { ru: 'Теперь СЛОЖИ подсвеченные числа — не ищи по порядку!', en: 'Now ADD the highlighted numbers!' },
  bossHudCounting: { ru: 'Сумма подсвеченных?', en: 'Sum of highlighted?' },

  // FeedbackWidget — категории репорта (KINDS[].labelKey)
  fbKindConfusion: { ru: 'Непонятно', en: 'Confusing' },
  fbKindBug: { ru: 'Не работает', en: 'Broken' },
  fbKindIdea: { ru: 'Идея', en: 'Idea' },

  // Питомец Синапс — имена стадий (бывший STAGE_NAMES в services/pet.ts, 1:1 с сайта)
  petStage1: { ru: 'Искра', en: 'Spark' },
  petStage2: { ru: 'Импульс', en: 'Impulse' },
  petStage3: { ru: 'Созвездие', en: 'Constellation' },

  // Титулы уровней профиля (бывшие LEVEL_TITLE_RU/EN в services/tokens.ts, t(lvl.titleKey))
  levelTitle0: { ru: 'Новичок', en: 'Rookie' },
  levelTitle1: { ru: 'Ученик', en: 'Student' },
  levelTitle2: { ru: 'Игрок', en: 'Player' },
  levelTitle3: { ru: 'Боец', en: 'Fighter' },
  levelTitle4: { ru: 'Эксперт', en: 'Expert' },
  levelTitle5: { ru: 'Мастер', en: 'Master' },
  levelTitle6: { ru: 'Гроссмейстер', en: 'Grandmaster' },
  levelTitle7: { ru: 'Виртуоз', en: 'Virtuoso' },
  levelTitle8: { ru: 'Гуру', en: 'Guru' },
  levelTitle9: { ru: 'Легенда', en: 'Legend' },
  levelTitle10: { ru: 'Кибермозг', en: 'Cyberbrain' },

  // Конфликт внимания — подписи типа конфликта (SUB_GAMES[].typeKey)
  acTypeStroop: { ru: 'Цвет vs Слово', en: 'Color vs Word' },
  acTypeStroopEmotional: { ru: 'Цвет vs Эмоция', en: 'Color vs Emotion' },
  acTypeFlanker: { ru: 'Центр vs Бока', en: 'Center vs Flankers' },
  acTypeSimon: { ru: 'Цвет vs Позиция', en: 'Color vs Position' },

  // Span-хаб — подписи модальности (games/span.tsx SUB_GAMES[].typeKey;
  // forward/backward — психометрические термины, оставлены латиницей во всех языках)
  spanTypeDigit: { ru: 'Цифры · forward + backward', en: 'Digits · forward + backward' },
  spanTypeSpatialFwd: { ru: 'Пространство · forward', en: 'Spatial · forward' },
  spanTypeSpatialBwd: { ru: 'Пространство · backward', en: 'Spatial · backward' },

  // Напоминания — тексты локальных уведомлений (services/reminders.ts, translateFor)
  remindMorningTitle: { ru: '🧠 Пора на зарядку', en: '🧠 Time to train' },
  remindMorningBody: { ru: 'Утренний когнитивный комплекс готов — 5-10 минут', en: 'Your morning cognitive warm-up is ready — 5-10 min' },
  remindEveningTitle: { ru: '🌙 Перед сном', en: '🌙 Before sleep' },
  remindEveningBody: { ru: 'Спокойный вечерний комплекс — мягко завершить день', en: 'A calm evening session to wind down the day' },

  // Statistics — пустое состояние (был сломанный тернар t('language') === 'ru')
  statsEmptyHint: { ru: 'Сыграйте несколько игр, чтобы увидеть статистику', en: 'Play some games to see statistics' },

  // «Мозг сегодня» — вердикт зарядки (services/warmup.ts brainTodayVerdict, {d} = ±NN процентов)
  brainDeltaUp: { ru: 'Сегодня на {d}% выше среднего — ты в форме.', en: "Today is {d}% above your average — you're in good shape." },
  brainDeltaDown: { ru: 'Сегодня на {d}% ниже среднего — возможно недосып или стресс.', en: 'Today is {d}% below your average — maybe poor sleep or stress.' },
  brainDeltaNorm: { ru: 'Сегодня в твоей норме ({d}%).', en: 'Today is within your normal range ({d}%).' },

  // AppErrorBoundary — крэш-экран (вне провайдеров → translateFor + navigator.language)
  crashTitle: { ru: 'Что-то сломалось', en: 'Something broke' },
  crashHint: { ru: 'Отчёт об ошибке уже отправлен. Твои данные целы — они хранятся локально.', en: 'The error report has been sent. Your data is safe — it is stored locally.' },
  crashRestart: { ru: 'ПЕРЕЗАПУСТИТЬ', en: 'RESTART' },

  // Магазин — имена/описания косметики (COSMETICS[].nameKey/descKey в services/cosmetics.ts)
  cosName_accent_gold: { ru: 'Золото', en: 'Gold' },
  cosName_accent_neon: { ru: 'Неон', en: 'Neon' },
  cosName_accent_ocean: { ru: 'Океан', en: 'Ocean' },
  cosName_accent_rose: { ru: 'Роза', en: 'Rose' },
  cosName_accent_emerald: { ru: 'Изумруд', en: 'Emerald' },
  cosName_accent_lavender: { ru: 'Лаванда', en: 'Lavender' },
  cosName_accent_crimson: { ru: 'Багрянец', en: 'Crimson' },
  cosName_accent_cyan: { ru: 'Бирюза', en: 'Cyan' },
  cosName_accent_tangerine: { ru: 'Мандарин', en: 'Tangerine' },
  cosName_accent_indigo: { ru: 'Индиго', en: 'Indigo' },
  cosName_accent_coral: { ru: 'Коралл', en: 'Coral' },
  cosName_accent_slate: { ru: 'Графит', en: 'Slate' },
  cosName_accent_copper: { ru: 'Медь', en: 'Copper' },
  cosName_accent_mint: { ru: 'Мята', en: 'Mint' },
  cosName_accent_magenta: { ru: 'Маджента', en: 'Magenta' },
  cosDesc_accent_gold: { ru: 'Тёплый янтарный акцент — солидно, премиально', en: 'Warm amber accent — premium feel' },
  cosDesc_accent_neon: { ru: 'Кислотно-зелёный — энергично, киберпанк', en: 'Acid green — energetic, cyberpunk' },
  cosDesc_accent_ocean: { ru: 'Глубокий синий — спокойно и ясно', en: 'Deep blue — calm and clear' },
  cosDesc_accent_rose: { ru: 'Яркая фуксия — живо и тепло', en: 'Bright fuchsia — lively and warm' },
  cosDesc_accent_emerald: { ru: 'Сочный зелёный — свежо и природно', en: 'Lush green — fresh and natural' },
  cosDesc_accent_lavender: { ru: 'Мягкий фиолет — спокойная роскошь', en: 'Soft violet — calm luxury' },
  cosDesc_accent_crimson: { ru: 'Насыщенный красный — уверенно и дерзко', en: 'Deep red — bold and confident' },
  cosDesc_accent_cyan: { ru: 'Прохладный бирюзовый — свежо и технично', en: 'Cool cyan — fresh and technical' },
  cosDesc_accent_tangerine: { ru: 'Сочный оранжевый — бодро и заметно', en: 'Juicy orange — punchy and visible' },
  cosDesc_accent_indigo: { ru: 'Глубокий сине-фиолетовый — ночное небо', en: 'Deep blue-violet — night sky' },
  cosDesc_accent_coral: { ru: 'Тёплый розово-красный — живо и уютно', en: 'Warm pink-red — lively and cosy' },
  cosDesc_accent_slate: { ru: 'Строгий серо-синий — минимализм', en: 'Cool grey-blue — minimalist' },
  cosDesc_accent_copper: { ru: 'Тёплый медный — винтажно и благородно', en: 'Warm copper — vintage and noble' },
  cosDesc_accent_mint: { ru: 'Мятно-бирюзовый — лёгкость и чистота', en: 'Minty teal — light and clean' },
  cosDesc_accent_magenta: { ru: 'Яркая фуксия-2 — смело и заметно', en: 'Bold magenta — loud and visible' },
  cosName_sound_retro: { ru: 'Ретро', en: 'Retro' },
  cosName_sound_soft: { ru: 'Мягкий', en: 'Soft' },
  cosName_sound_arcade: { ru: 'Аркада', en: 'Arcade' },
  cosName_sound_crystal: { ru: 'Хрусталь', en: 'Crystal' },
  cosName_sound_deep: { ru: 'Глубина', en: 'Deep' },
  cosName_sound_chipbass: { ru: 'Чип-бас', en: 'Chip Bass' },
  cosName_sound_buzz: { ru: 'Дрель', en: 'Buzz' },
  cosDesc_sound_retro: { ru: '8-битный квадратный синтез — как старая консоль', en: '8-bit square synth — retro console' },
  cosDesc_sound_soft: { ru: 'Тёплый треугольный тон — мягче дефолта', en: 'Warm triangle tone — softer' },
  cosDesc_sound_arcade: { ru: 'Звонкий пилообразный — ярко, по-аркадному', en: 'Bright sawtooth — punchy arcade' },
  cosDesc_sound_crystal: { ru: 'Высокий чистый тон — звонко и лёгко', en: 'High clean tone — bright and airy' },
  cosDesc_sound_deep: { ru: 'Низкий бархатный тон — солидно и спокойно', en: 'Low velvety tone — calm and solid' },
  cosDesc_sound_chipbass: { ru: 'Низкий квадратный — басовитый 8-бит', en: 'Low square wave — bassy chiptune' },
  cosDesc_sound_buzz: { ru: 'Высокий пилообразный — резко и дерзко', en: 'High sawtooth — sharp and punchy' },
  cosName_frame_gold: { ru: 'Золотая рамка', en: 'Gold frame' },
  cosName_frame_crimson: { ru: 'Багровая рамка', en: 'Crimson frame' },
  cosName_frame_azure: { ru: 'Лазурная рамка', en: 'Azure frame' },
  cosName_frame_emerald: { ru: 'Изумрудная рамка', en: 'Emerald frame' },
  cosName_frame_violet: { ru: 'Фиолетовая рамка', en: 'Violet frame' },
  cosName_frame_silver: { ru: 'Серебряная рамка', en: 'Silver frame' },
  cosDesc_frame_gold: { ru: 'Тёплая янтарная обводка чипа профиля', en: 'Warm amber outline for your profile chip' },
  cosDesc_frame_crimson: { ru: 'Насыщенно-красная обводка — дерзко', en: 'Bold red outline' },
  cosDesc_frame_azure: { ru: 'Ясный голубой контур', en: 'Clear sky-blue outline' },
  cosDesc_frame_emerald: { ru: 'Сочный зелёный контур', en: 'Lush green outline' },
  cosDesc_frame_violet: { ru: 'Мягкий фиолетовый контур', en: 'Soft violet outline' },
  cosDesc_frame_silver: { ru: 'Строгий серебристый контур', en: 'Cool silver outline' },
  cosName_title_focused: { ru: 'Сфокусированный', en: 'Focused' },
  cosName_title_sharp: { ru: 'Острый ум', en: 'Sharp Mind' },
  cosName_title_strategist: { ru: 'Стратег', en: 'Strategist' },
  cosName_title_owl: { ru: 'Сова разума', en: 'Mind Owl' },
  cosName_title_unstoppable: { ru: 'Неудержимый', en: 'Unstoppable' },
  cosName_title_grandmaster: { ru: 'Гроссмейстер', en: 'Grandmaster' },
  cosName_title_legend: { ru: 'Легенда', en: 'Legend' },
  cosName_title_cyberbrain: { ru: 'Кибермозг', en: 'Cyberbrain' },
  cosDesc_title_generic: { ru: 'Титул под именем профиля', en: 'Title shown under your profile name' },
  cosDesc_title_cyberbrain: { ru: 'Тот же титул, что и макс. уровень профиля', en: 'Same title as the max profile level' },
  cosName_avatar_owl: { ru: 'Сова', en: 'Owl' },
  cosName_avatar_fox: { ru: 'Лис', en: 'Fox' },
  cosName_avatar_gem: { ru: 'Кристалл', en: 'Gem' },
  cosName_avatar_lightning: { ru: 'Молния', en: 'Lightning' },
  cosName_avatar_star: { ru: 'Звезда', en: 'Star' },
  cosName_avatar_knight: { ru: 'Конь', en: 'Knight' },
  cosName_avatar_phoenix: { ru: 'Феникс', en: 'Phoenix' },
  cosName_avatar_robot: { ru: 'Робот', en: 'Robot' },
  cosName_avatar_brain: { ru: 'Мозг', en: 'Brain' },
  cosDesc_avatar_generic: { ru: 'Иконка профиля вместо стандартного бейджа', en: 'Profile icon replacing the default badge' },
  cosDesc_avatar_brain: { ru: 'Флагманский аватар — иконка профиля', en: 'Flagship avatar — profile icon' },

  // ── v1.137: хвост инлайн-тернаров `language === 'ru' ? … : …` (warmup-bridge/
  // warmup-complete/assessment-result + конфиг-карточки уровней всех игр).
  // Плейсхолдеры {n}/{w}/{p}/{d}/{r}/{c}/{g}/{o}/{m}/{a}/{b}/{e}/{k}/{l}/{h}/{t}/{max}
  // подставляются через .replace() при рендере.

  // Общие
  msShort: { ru: 'мс', en: 'ms' },
  shuffleBtn: { ru: 'Перемешать', en: 'Shuffle' },
  freePlay: { ru: 'Свободно', en: 'Free play' },
  playLevelN: { ru: 'Уровень {n} — играть', en: 'Play level {n}' },
  lvlTargetBtn: { ru: '🎯 Уровень {n} →', en: '🎯 Level {n} →' },
  leaderboardLabel: { ru: 'Топ игроков', en: 'Leaderboard' },
  timeIsUp: { ru: 'Время вышло', en: 'Time is up' },
  timeLeftLabel: { ru: 'Осталось', en: 'Time left' },
  themeLabel: { ru: 'Тема', en: 'Theme' },
  passCorrect80Window: { ru: 'Проход уровня: ≥80% верных ответов (не успел в окно = ошибка)', en: 'To pass: ≥80% correct answers (missing the window counts as an error)' },
  trialsWindowParams: { ru: '{n} проб · окно ответа {w} с', en: '{n} trials · {w} s response window' },

  // Warmup bridge (между играми зарядки)
  startingInN: { ru: '⏱ Старт через {n}...', en: '⏱ Starting in {n}...' },
  ctaStartNow: { ru: 'СТАРТ СЕЙЧАС', en: 'START NOW' },

  // Warmup complete (итог зарядки)
  sessionNotFound: { ru: 'Сессия не найдена', en: 'Session not found' },
  warmupDoneTitle: { ru: 'ЗАРЯДКА ЗАВЕРШЕНА', en: 'WARM-UP COMPLETE' },
  warmupStoppedTitle: { ru: 'ЗАРЯДКА ОСТАНОВЛЕНА', en: 'WARM-UP STOPPED' },
  personalBest: { ru: 'Личный рекорд', en: 'Personal best' },
  resultsTitle: { ru: 'Результаты', en: 'Results' },
  skippedGamesN: { ru: 'Пропущено: {n} игр', en: 'Skipped: {n} games' },
  totalScoreLabel: { ru: 'Общий счёт', en: 'Total score' },
  bestInCategory: { ru: '👑 Лучший в этой категории', en: '👑 Best in this category' },
  bestScoreN: { ru: 'Лучший: {n}', en: 'Best: {n}' },
  comboLine: { ru: '🔥 Комбо ×1.5! {n} чистых подряд · +{b}', en: '🔥 Combo ×1.5! {n} clean in a row · +{b}' },
  streakDayOne: { ru: '{n} день подряд', en: '{n} day in a row' },
  streakDaysMany: { ru: '{n} дней подряд', en: '{n} days in a row' },
  dontBreakStreak: { ru: 'Не сломай серию', en: "Don't break the streak" },
  brainTodayTitle: { ru: '🧠 МОЗГ СЕГОДНЯ', en: '🧠 BRAIN TODAY' },
  remindTomorrowQ: { ru: 'Напомнить завтра?', en: 'Remind you tomorrow?' },
  remindTomorrowBody: { ru: 'Одно мягкое напоминание утром в 9:00 — и стрик не сгорит. Время меняется в Settings.', en: 'One gentle reminder at 9:00 AM keeps your streak alive. Change the time in Settings.' },
  ctaEnable: { ru: 'ВКЛЮЧИТЬ', en: 'ENABLE' },
  remindSetMorning: { ru: '✓ Напомню утром в 9:00', en: '✓ Will remind you at 9:00 AM' },
  ctaAgain: { ru: 'ЕЩЁ РАЗ', en: 'AGAIN' },

  // Assessment result (когнитивный профиль)
  calcResults: { ru: 'Считаем результаты...', en: 'Calculating results...' },
  cogProfileTitle: { ru: 'ТВОЙ КОГНИТИВНЫЙ ПРОФИЛЬ', en: 'YOUR COGNITIVE PROFILE' },
  domains12: { ru: '12 доменов', en: '12 domains' },
  byDomain: { ru: 'По доменам', en: 'By domain' },
  percentileN: { ru: '{n}-й перцентиль', en: '{n}th percentile' },
  domainWeak: { ru: 'СЛАБО', en: 'WEAK' },
  domainStrong: { ru: 'СИЛЬНО', en: 'STRONG' },
  domainAvg: { ru: 'СРЕД', en: 'AVG' },
  insightTitle: { ru: 'РАЗБОР', en: 'INSIGHT' },
  recommendedGames: { ru: 'Рекомендованные игры (для слабых доменов)', en: 'Recommended games (for weak domains)' },
  saveProfileBtn: { ru: 'СОХРАНИТЬ ПРОФИЛЬ', en: 'SAVE PROFILE' },
  profileSavedBtn: { ru: 'ПРОФИЛЬ СОХРАНЁН ✓', en: 'PROFILE SAVED ✓' },
  assessRepeatNote: { ru: 'Повторный прогон через 3 месяца покажет реальный прогресс по каждому домену.', en: 'A repeat run in 3 months will show real progress in each domain.' },

  // Судоку
  sudokuModeLevels: { ru: 'Уровни', en: 'Levels' },
  sudokuModeFree: { ru: 'Свободно', en: 'Free' },
  samuraiTitle: { ru: 'Самурай', en: 'Samurai' },
  sudokuSamuraiTeaser: { ru: 'Пять сеток 9×9 с общими угловыми блоками.', en: 'Five overlapping 9×9 grids sharing corner blocks.' },
  blanksLabel: { ru: 'пусто', en: 'blanks' },
  hintsLabel: { ru: 'подсказок', en: 'hints' },
  sudokuNextUnlocks: { ru: 'Прошёл — откроется следующий, сложнее.', en: 'Beat it — the next unlocks, harder.' },
  killerCageRule: { ru: 'Цифры в каждой цветной группе в сумме дают число в её углу и не повторяются.', en: 'Digits in each coloured cage add up to the number in its corner and never repeat.' },
  boardSize: { ru: 'Размер поля', en: 'Board size' },
  digitsLabel: { ru: 'Цифры', en: 'Digits' },
  digitsPlain: { ru: 'Обычные', en: 'Plain' },
  digitsDrawn: { ru: 'Рисованные', en: 'Drawn' },
  digitStyle: { ru: 'Стиль цифр', en: 'Digit style' },
  rulesWord: { ru: 'правила', en: 'rules' },
  outOfLives: { ru: 'Жизни закончились', en: 'Out of lives' },
  outOfLivesHint: { ru: '3 ошибки. Сыграй заново — поле новое.', en: '3 mistakes. Play again — fresh board.' },
  timeErrorsLine: { ru: 'Время {t}с · ошибок {n}', en: 'Time {t}s · errors {n}' },
  sudokuMenu: { ru: 'Меню судоку', en: 'Sudoku menu' },
  sudokuBaseRule: { ru: 'Базово: каждая цифра 1–{n} ровно один раз в строке, столбце и блоке.', en: 'Base: each digit 1–{n} exactly once per row, column and box.' },
  sudokuKillerRule: { ru: 'Killer: поле разбито на рамки-группы. Цифры группы дают указанную сумму и не повторяются внутри рамки.', en: 'Killer: the board is split into cages. Digits in a cage sum to its clue and don’t repeat inside it.' },
  // Судоку — варианты правил (services/sudoku-core.ts, variantLabel/variantRule)
  sudokuVariantDiagonal: { ru: '⟍ диагональ', en: '⟍ diagonal' },
  sudokuVariantAntiknight: { ru: '♞ ход коня', en: '♞ anti-knight' },
  sudokuVariantHyper: { ru: '⊞ доп. зоны', en: '⊞ hyper' },
  sudokuVariantNonconsec: { ru: '≠ не подряд', en: '≠ non-consecutive' },
  sudokuVariantJigsaw: { ru: '⧉ кривые блоки', en: '⧉ jigsaw' },
  sudokuVariantAntiking: { ru: '♚ ход короля', en: '♚ anti-king' },
  sudokuVariantEvenodd: { ru: '◩ чёт/нечёт', en: '◩ even/odd' },
  sudokuVariantKropki: { ru: '⦿ точки', en: '⦿ kropki' },
  sudokuVariantSandwich: { ru: '🥪 сэндвич', en: '🥪 sandwich' },
  sudokuVariantThermo: { ru: '🌡 термометр', en: '🌡 thermo' },
  sudokuVariantArrow: { ru: '➳ стрелка', en: '➳ arrow' },
  sudokuRuleDiagonal: { ru: 'Цифры уникальны ещё и по двум диагоналям.', en: 'Digits are also unique along both diagonals.' },
  sudokuRuleAntiknight: { ru: 'Одинаковые цифры не стоят на расстоянии хода коня.', en: 'Equal digits cannot be a knight’s move apart.' },
  sudokuRuleHyper: { ru: 'Четыре доп. зоны 3×3 тоже содержат 1–9 без повторов.', en: 'Four extra 3×3 regions also hold 1–9 with no repeats.' },
  sudokuRuleNonconsec: { ru: 'Соседние по стороне клетки не отличаются на 1.', en: 'Orthogonally adjacent cells cannot differ by 1.' },
  sudokuRuleJigsaw: { ru: 'Блоки кривые, а не квадраты — в каждом тоже 1–9 без повторов.', en: 'Blocks are irregular, not squares — each still holds 1–9.' },
  sudokuRuleAntiking: { ru: 'Одинаковые цифры не касаются даже по диагонали (ход короля).', en: 'Equal digits cannot touch even diagonally (a king’s move).' },
  sudokuRuleEvenodd: { ru: '□ — чётная цифра, ○ — нечётная: форма подсказывает чётность.', en: '□ even, ○ odd — the shape hints each cell’s parity.' },
  sudokuRuleKropki: { ru: 'Белая точка между клетками — соседние ±1, чёрная — одно вдвое больше.', en: 'White dot between cells: consecutive (±1). Black dot: one is double the other.' },
  sudokuRuleSandwich: { ru: 'Число у края — сумма цифр между 1 и 9 в этом ряду/столбце.', en: 'Edge number = sum of digits between the 1 and the 9 in that row/column.' },
  sudokuRuleThermo: { ru: 'Вдоль термометра цифры строго растут от колбы.', en: 'Digits strictly increase along each thermometer from the bulb.' },
  sudokuRuleArrow: { ru: 'Цифры вдоль стрелки в сумме равны числу в кружке.', en: 'Digits along the arrow sum to the number in the circle.' },
  // Судоку — примеры-подписи в модалке правил (exampleCaption)
  sudokuEx_antiknight: { ru: 'Синяя 3 уже стоит. В красные клетки (буква «Г», как ходит конь) вторую 3 ставить нельзя.', en: 'The blue 3 is placed. Red cells (an “L”, like a knight moves) cannot hold another 3.' },
  sudokuEx_antiking: { ru: 'Синяя 3 стоит. В красные клетки по диагонали вплотную вторую 3 ставить нельзя.', en: 'The blue 3 is placed. Diagonally touching red cells cannot hold another 3.' },
  sudokuEx_nonconsec: { ru: 'Рядом с 3 по стороне не может быть 2 или 4 (соседние цифры). Через клетку — можно.', en: 'Cells next to a 3 cannot hold 2 or 4 (consecutive digits).' },
  sudokuEx_diagonal: { ru: 'Жёлтые клетки — две диагонали. Синяя 3 стоит на диагонали — вторая 3 на той же диагонали (красная) запрещена.', en: 'Yellow cells are the two diagonals. A second 3 on the same diagonal (red) is not allowed.' },
  sudokuEx_hyper: { ru: 'Жёлтый квадрат — доп. зона 3×3 (на настоящем поле их четыре). Внутри зоны цифры тоже не повторяются.', en: 'The yellow square is an extra 3×3 zone (the real board has four). Digits cannot repeat inside it.' },
  sudokuEx_evenodd: { ru: 'Пример: в клетке с □ может стоять 2, 4, 6 или 8. В клетке с ○ — 1, 3, 5, 7 или 9.', en: 'Example: a □ cell holds 2, 4, 6 or 8. A ○ cell holds 1, 3, 5, 7 or 9.' },
  sudokuEx_kropki: { ru: 'Пример: 2 ⚫ 4 — чёрная точка, одно вдвое больше. 4 ⚪ 5 — белая точка, разница 1. Нет точки — ни то, ни другое.', en: 'Example: 2 ⚫ 4 — black dot, one is double. 4 ⚪ 5 — white dot, differ by 1. No dot — neither.' },
  sudokuEx_sandwich: { ru: 'Пример: в ряду 1·3·5·9·… число у края = 8, потому что между 1 и 9 стоят 3+5.', en: 'Example: in a row 1·3·5·9·… the edge clue is 8, because 3+5 sit between the 1 and the 9.' },
  sudokuEx_thermo: { ru: 'Пример: по термометру от колбы 2 → 4 → 7 — каждая следующая цифра строго больше.', en: 'Example: along a thermometer 2 → 4 → 7 — each digit is strictly larger than the previous.' },
  sudokuEx_arrow: { ru: 'Пример: в кружке 8, вдоль стрелки 3 и 5 — их сумма равна числу в кружке.', en: 'Example: the circle shows 8, the arrow holds 3 and 5 — they sum to the circle.' },
  sudokuEx_jigsaw: { ru: 'Вместо квадратных блоков — фигурные области. В каждой области цифры 1–9 без повторов.', en: 'Instead of square boxes — irregular regions. Each region holds 1–9 with no repeats.' },
  sudokuEx_killer: { ru: 'Пример: рамка из 2 клеток с меткой «7» — цифры в ней дают в сумме 7 и не повторяются (например 3 и 4).', en: 'Example: a 2-cell cage marked “7” — its digits sum to 7 and don’t repeat (e.g. 3 and 4).' },
  ctaGotIt: { ru: 'ПОНЯТНО', en: 'GOT IT' },

  // Судоку-самурай
  samuraiDesc: { ru: 'Пять сеток 9×9 с общими угловыми блоками. Правила судоку в каждой.', en: 'Five overlapping 9×9 grids sharing corner blocks; standard sudoku in each.' },
  samuraiLvlParams: { ru: 'Закрыто {p}% клеток · лимит {e} ошибок · подсказок {h}', en: '{p}% cells hidden · {e} mistakes limit · {h} hints' },
  samuraiNextUnlocks: { ru: 'Реши, не превысив лимит ошибок — откроется следующий, сложнее.', en: 'Solve within the mistakes limit — the next unlocks, harder.' },
  samuraiHowTo: { ru: 'Поле 21×21 = пять судоку, перекрытых углами. Заполни каждую клетку так, чтобы в каждой сетке 9×9 строки, столбцы и блоки 3×3 содержали 1–9 без повторов. Кнопкой 🔍 переключай масштаб: «вся фигура» или «крупно со скроллом».', en: 'A 21×21 board = five sudoku overlapping at the corners. Fill every cell so each 9×9 grid has 1–9 with no repeats in rows, columns and 3×3 boxes. Use 🔍 to toggle zoom: whole shape or zoomed-in with scroll.' },
  errorsOfMax: { ru: 'Ошибок {n}/{max}', en: 'Errors {n}/{max}' },
  zoomIn: { ru: 'Крупно', en: 'Zoom' },
  zoomFit: { ru: 'Всё поле', en: 'Fit' },

  // Шульте
  schulteFreeHint: { ru: 'или настрой свою таблицу ниже и жми «Свободно»', en: 'or customize your table below and tap “Free play”' },
  schulteLeaderboard: { ru: 'Топ игроков (5×5 классика)', en: 'Leaderboard (5×5 classic)' },
  schulteCenterOut: { ru: 'От центра', en: 'Center-out' },
  schulteDivided: { ru: 'Разделённое внимание', en: 'Divided attention' },
  classicLabel: { ru: 'Классика', en: 'Classic' },
  schulteDividedHint: { ru: 'Несколько своих счётчиков одновременно, различаются цветом — ищи по кругу', en: 'Several independent counters at once, color-coded — find them round-robin' },
  schulteMoving: { ru: 'Убегающая цель', en: 'Moving target' },
  schulteMovingHint: { ru: 'После каждого верного клика сетка перемешивается заново — нельзя запомнить позиции', en: 'The whole grid reshuffles after every correct click — no relying on spatial memory' },
  schulteShare: { ru: 'Прошёл таблицу Шульте {g}×{g} за {t}с в PsyGames — обгони!', en: 'I cleared a {g}×{g} Schulte table in {t}s on PsyGames — beat that!' },

  // Числовые ряды (pattern) — классы и правила прогрессий
  patternClassArithmetic: { ru: 'Арифметическая прогрессия', en: 'Arithmetic' },
  patternClassGeometric: { ru: 'Геометрическая прогрессия', en: 'Geometric' },
  patternClassSquares: { ru: 'Квадраты чисел', en: 'Squares' },
  patternClassCubes: { ru: 'Кубы чисел', en: 'Cubes' },
  patternClassSquaresCubes: { ru: 'Квадраты и кубы', en: 'Squares & cubes' },
  patternClassFibonacci: { ru: 'Похоже на Фибоначчи', en: 'Fibonacci-like' },
  patternClassGrowingDiff: { ru: 'Растущая разность', en: 'Growing difference' },
  patternClassLookSay: { ru: '«Посмотри и скажи»', en: 'Look-and-say' },
  patternClassLookSayHint: { ru: '«Посмотри и скажи» (нужна подсказка)', en: 'Look-and-say (use hint)' },
  patternClassInterleaved: { ru: 'Два переплетённых ряда', en: 'Two interleaved series' },
  patternRuleArithmetic: { ru: 'Каждый член больше на {n}', en: 'Each term +{n}' },
  patternRuleGeometric: { ru: 'Каждый член умножается на {n}', en: 'Each term ×{n}' },
  patternRuleSquares: { ru: 'n²: {a}², {b}², {c}², …', en: 'n²: {a}², {b}², …' },
  patternRuleCubes: { ru: 'n³: {a}³, {b}³, …', en: 'n³: {a}³, {b}³, …' },
  patternRuleFibonacci: { ru: 'Сумма двух предыдущих', en: 'Sum of the previous two' },
  patternRuleGrowingDiff: { ru: 'Разность растёт на 1 каждый шаг ({a}, {b}, …)', en: 'Difference grows by 1 each step' },
  patternRuleLookSay: { ru: 'Читай предыдущий вслух: «один 1» → 11, «два 1 один 2» …', en: 'Read the previous term aloud: "one 1" → 11' },
  patternRuleInterleaved: { ru: 'Позиции 1,3,5… растут на {a}; позиции 2,4… на {b}. Нужна следующая нечётная', en: 'Odd positions +{a}, even +{b}' },
  hintMoreRule: { ru: 'Ещё: правило (−1⭐)', en: 'More: rule (−1⭐)' },
  hintUsed: { ru: 'Подсказка использована', en: 'Hint used' },

  // Конфиг-карточки уровней игр: параметры + критерий прохода
  flankerLvlParams: { ru: 'Конфликтных стрелок {p}% · окно ответа {w} с · 20 попыток', en: '{p}% conflict arrows · {w} s response window · 20 trials' },
  flankerPass: { ru: 'Проход уровня: точность ≥80% (не успел ответить в окно = ошибка)', en: 'To pass: ≥80% accuracy (no answer within the window counts as an error)' },
  stopSignalLvlParams: { ru: '{n} проб · стоп-сигналов ~{p}% · стоп через {d} мс · окно {w} с', en: '{n} trials · ~{p}% stop signals · stop at {d} ms · {w} s window' },
  stopSignalPass: { ru: 'Проход уровня: ≥80% верных проб (нажал при ✋ или пропустил GO = ошибка)', en: 'To pass: ≥80% correct trials (pressing on ✋ or missing GO = error)' },
  findDiffLvlParams: { ru: 'Раундов: {r} · отличий: {d} · объектов: {o} · ⏱ {w} с на раунд', en: '{r} rounds · {d} differences · {o} objects · ⏱ {w} s per round' },
  findDiffPass: { ru: 'Проход уровня: найти все отличия в каждом раунде, пока не вышло время', en: 'To pass: find every difference in each round before the time runs out' },
  clozeLvlParams: { ru: '{n} фраз · ⏱ {w} с на фразу', en: '{n} phrases · ⏱ {w} s per phrase' },
  clozePass: { ru: 'Проход уровня: ≥80% верных ответов (не успел в лимит = ошибка)', en: 'To pass: ≥80% correct answers (running out of time counts as an error)' },
  inhibStopLvlParams: { ru: '{n} проб · окно ответа {w} с · стоп-проб ~{p}% · стоп через {d} мс', en: '{n} trials · {w} s window · ~{p}% stop trials · stop at {d} ms' },
  inhibPass: { ru: 'Проход уровня: ≥80% верных (нажал на NO/стоп или пропустил GO = ошибка)', en: 'To pass: ≥80% correct (pressing on NO/stop or missing GO counts as an error)' },
  goNoGoLvlParams: { ru: '{n} проб · NO ~{p}% · окно ответа {w} с', en: '{n} trials · ~{p}% NO · {w} s response window' },
  goNoGoPass: { ru: 'Проход уровня: ≥80% верных проб (пропуск GO и нажатие на NO = ошибки)', en: 'To pass: ≥80% correct trials (missing GO and tapping NO both count as errors)' },
  choiceRtLvlParams: { ru: '{n} проб · {d} направления · окно ответа {w} с', en: '{n} trials · {d} directions · {w} s response window' },
  simonLvlParams: { ru: '{n} проб · конфликтных ~{p}% · окно ответа {w} с', en: '{n} trials · ~{p}% conflict · {w} s response window' },
  stroopLvlParams: { ru: '{n} проб · окно ответа {w} с · конфликтных {p}%', en: '{n} trials · {w} s response window · {p}% conflict trials' },
  stroopPass: { ru: 'Проход уровня: точность ≥85% (не успел ответить = ошибка)', en: 'To pass: ≥85% accuracy (missing the response window counts as an error)' },
  stroopEmoLvlParams: { ru: '{n} слов · окно ответа {w} с · эмоциональных слов {p}%', en: '{n} words · {w} s to answer · {p}% emotional words' },
  stroopEmoPass: { ru: 'Проход уровня: назвать цвет верно в ≥80% слов (не успел — ошибка)', en: 'To pass: name the ink color correctly on ≥80% of words (timeout counts as an error)' },
  posnerLvlParams: { ru: '{n} проб · подсказка верна ~{p}% · окно ответа {w} с', en: '{n} trials · cue valid ~{p}% · {w} s response window' },
  antLvlParams: { ru: '{n} проб · конфликтных ~{p}% · окно ответа {w} с · паузы всё непредсказуемее', en: '{n} trials · ~{p}% conflict · {w} s response window · less predictable pauses' },
  switchLvlParams: { ru: '{n} проб · переключений ~{p}% · окно ответа {w} с', en: '{n} trials · ~{p}% switches · {w} s response window' },
  counterLvlParams: { ru: 'сетка {g}×{g} · {r} раундов · {w} с на раунд', en: '{g}×{g} grid · {r} rounds · {w}s per round' },
  counterPass: { ru: 'Проход уровня: собрать сумму в ≥{k} из {r} раундов до конца времени', en: 'To pass: hit the target sum in ≥{k} of {r} rounds before time runs out' },
  semanticLvlParams: { ru: '{r} раундов · {c} категории · порог 80%', en: '{r} rounds · {c} categories · pass 80%' },
  wordPairsLvlParams: { ru: '{n} пар · запомнить за {w}с · ошибок ≤ {e}', en: '{n} pairs · memorize in {w}s · errors ≤ {e}' },
  numberBondsLvlParams: { ru: '{n} задач · числа до {m} · фишек {c} · слагаемых {a}–{b} · {w} с на задачу', en: '{n} puzzles · numbers up to {m} · {c} chips · {a}–{b} addends · {w}s per puzzle' },
  numberBondsPass: { ru: 'Проход уровня: не больше 2 ошибок (неверная сумма или не уложился в окно = ошибка)', en: 'To pass: at most 2 errors (a wrong sum or missing the time window counts as an error)' },
  proofLvlParams: { ru: 'Поле {r}×{c} · лимит {w} с', en: '{r}×{c} grid · {w} s limit' },
  proofPass: { ru: 'Проход уровня: найти ≥{p}% целей до конца времени (ложные нажатия и пропуски снижают звёзды)', en: 'To pass: find ≥{p}% of targets before time runs out (false taps and misses cost stars)' },
  anagramsLvlParamsTimed: { ru: '{n} слов · {l} букв · {w} с на слово', en: '{n} words · {l} letters · {w} s per word' },
  anagramsLvlParamsFree: { ru: '{n} слов · {l} букв · без лимита времени', en: '{n} words · {l} letters · no time limit' },
  anagramsPass: { ru: 'Проход уровня: ≥80% слов собрано верно (не успел по времени = ошибка)', en: 'To pass: ≥80% words solved correctly (running out of time counts as an error)' },

  // ── v1.142: конфиг-карточки уровней sdmt/bart/cpt/prl/trail/wcst — из ru/en-тернаров в словарь ──
  sdmtLvlParams: { ru: '{n} символов · раунд {w} с · цель {g} верных', en: '{n} symbols · {w} s round · goal {g} correct' },
  sdmtPass: { ru: 'Проход уровня: ≥{g} верных за раунд и точность ≥80%', en: 'To pass: ≥{g} correct in the round with ≥80% accuracy' },
  bartLvlParams: { ru: '{n} шаров · разброс взрыва 1–{m}', en: '{n} balloons · burst range 1–{m}' },
  bartPass: { ru: 'Проход: разумный средний накач без частых взрывов', en: 'To pass: reasonable avg pumps without frequent bursts' },
  cptLvlParamsX: { ru: 'X-CPT · жми на каждую X · 90 сек', en: 'X-CPT · tap every X · 90 s' },
  cptLvlParamsAX: { ru: 'AX-CPT · жми на X только после A · 90 сек', en: 'AX-CPT · tap X only after A · 90 s' },
  cptLvlParamsAXHard: { ru: 'AX-CPT · X после A · быстрее + похожие буквы · 90 сек', en: 'AX-CPT · X after A · faster + look-alikes · 90 s' },
  cptPass: { ru: 'Проход уровня: поймать ≥70% целей и ложно нажать ≤30% не-целей', en: 'To pass: catch ≥70% of targets with ≤30% false taps on non-targets' },
  prlLvlParams: { ru: '{n} проб · награда {p}% · реверс каждые {a}-{b} верных подряд', en: '{n} trials · reward {p}% · reversal every {a}-{b} correct in a row' },
  prlPass: { ru: 'Проход: ≥{p}% верных выборов после реверсалов', en: 'To pass: ≥{p}% correct choices after reversals' },
  trailLvlParamsA: { ru: 'Trail-A · числа 1→{n}', en: 'Trail-A · numbers 1→{n}' },
  trailLvlParamsB: { ru: 'Trail-B · чередование 1→А→2→Б…', en: 'Trail-B · alternate 1→A→2→B…' },
  trailNodes: { ru: '{n} узлов', en: '{n} nodes' },
  trailPass: { ru: 'Проход уровня: пройти цепочку за ≤{t} с и сделать не больше {e} ошибок', en: 'To pass: finish the trail within {t}s with at most {e} errors' },
  wcstLvlParams: { ru: '{n} проб · смена правила после {s} подряд', en: '{n} trials · rule switches after {s} in a row' },
  wcstPass: { ru: 'Проход уровня: ≤{c} персеверативных ошибок и ≥55% верных', en: 'To pass: ≤{c} perseverative errors and ≥55% correct' },

  // ── v1.142: анлок-подсказки «🔒 Следующий …» тематических профилей (formatUnlockHint
  // в level-unlocks.ts; useLevelGate + schulte). Каркас + контент по (game, level);
  // {n} в unlockHint_* = порог threshold из level-progression, подставляется кодом.
  // Ключ = unlock{Label|Hint}_<game_id>_<levelKey без не-алфанумерики> ──
  unlockNextFmt: { ru: '🔒 Следующий {label}: {hint}', en: '🔒 Next {label}: {hint}' },
  unlockProgressFmt: { ru: ' · прогресс {n}/{m}', en: ' · progress {n}/{m}' },
  unlockLabel_schulte_table_10x10: { ru: '10×10 (мастер)', en: '10×10 (master)' },
  unlockHint_schulte_table_6x6: { ru: 'Пройди Шульте 5×5 за ≤{n} сек', en: 'Complete Schulte 5×5 in ≤{n} s' },
  unlockHint_schulte_table_7x7: { ru: 'Пройди Шульте 6×6 за ≤{n} сек два раза подряд', en: 'Complete Schulte 6×6 in ≤{n} s twice in a row' },
  unlockHint_schulte_table_8x8: { ru: 'Пройди Шульте 7×7 за ≤{n} сек два раза подряд', en: 'Complete Schulte 7×7 in ≤{n} s twice in a row' },
  unlockHint_schulte_table_9x9: { ru: 'Пройди Шульте 8×8 за ≤{n} сек два раза подряд', en: 'Complete Schulte 8×8 in ≤{n} s twice in a row' },
  unlockHint_schulte_table_10x10: { ru: 'Пройди Шульте 9×9 за ≤{n} сек два раза подряд', en: 'Complete Schulte 9×9 in ≤{n} s twice in a row' },
  unlockLabel_n_back_4back: { ru: '4-back (продвинутый)', en: '4-back (advanced)' },
  unlockHint_n_back_2back: { ru: 'Достигни d′ ≥ {n} на 1-back', en: 'Reach d′ ≥ {n} on 1-back' },
  unlockHint_n_back_3back: { ru: 'Достигни d′ ≥ {n} на 2-back два раза подряд', en: 'Reach d′ ≥ {n} on 2-back twice in a row' },
  unlockHint_n_back_4back: { ru: 'Достигни d′ ≥ {n} на 3-back два раза подряд', en: 'Reach d′ ≥ {n} on 3-back twice in a row' },
  unlockLabel_digit_span_backward: { ru: 'Обратный', en: 'Backward' },
  unlockHint_digit_span_backward: { ru: 'Достигни span ≥ {n} на прямом', en: 'Reach span ≥ {n} on forward' },
  unlockLabel_corsi_backward: { ru: 'Обратный', en: 'Backward' },
  unlockHint_corsi_backward: { ru: 'Достигни Corsi span ≥ {n} на прямом', en: 'Reach Corsi span ≥ {n} on forward' },
  unlockHint_memory_matrix_4x4: { ru: '{n} правильных подряд на 3×3', en: '{n} correct in a row on 3×3' },
  unlockHint_memory_matrix_5x5: { ru: '{n} правильных на 4×4 два раза', en: '{n} correct on 4×4 twice' },
  unlockHint_memory_matrix_6x6: { ru: '{n} правильных на 5×5 два раза', en: '{n} correct on 5×5 twice' },
  unlockLabel_picture_pairs_8pairs: { ru: '8 пар', en: '8 pairs' },
  unlockLabel_picture_pairs_10pairs: { ru: '10 пар', en: '10 pairs' },
  unlockLabel_picture_pairs_12pairs: { ru: '12 пар', en: '12 pairs' },
  unlockHint_picture_pairs_8pairs: { ru: 'Пройди 6 пар за ≤{n} сек', en: 'Complete 6 pairs in ≤{n} s' },
  unlockHint_picture_pairs_10pairs: { ru: 'Пройди 8 пар за ≤{n} сек', en: 'Complete 8 pairs in ≤{n} s' },
  unlockHint_picture_pairs_12pairs: { ru: 'Пройди 10 пар за ≤{n} сек два раза подряд', en: 'Complete 10 pairs in ≤{n} s twice in a row' },
  unlockLabel_math_sprint_medium: { ru: 'Средний (×/÷, до 100)', en: 'Medium (×/÷, up to 100)' },
  unlockLabel_math_sprint_hard: { ru: 'Тяжёлый (двузначные)', en: 'Hard (two-digit)' },
  unlockHint_math_sprint_medium: { ru: '{n}+ задач за 30 сек на лёгком', en: '{n}+ problems in 30 s on easy' },
  unlockHint_math_sprint_hard: { ru: '{n}+ за 30 сек на среднем два раза', en: '{n}+ in 30 s on medium twice' },

  // Авто-растущие уровни (одна строка на игру)
  corsiLvlAuto: { ru: 'Ур. {n} — растёт сам (span → скорость → обратный порядок)', en: 'Lv {n} — grows with results (span → speed → reverse)' },
  vsearchLvlAuto: { ru: 'Ур. {n} — растёт сам по результату (объектов и целей больше)', en: 'Lv {n} — grows with results (more items & targets)' },
  ospanLvlAuto: { ru: 'Ур. {n} — растёт сам (набор → сложнее счёт → быстрее показ)', en: 'Lv {n} — grows with results (set size → harder math → faster)' },
  hanoiLvlAuto: { ru: 'Ур. {n} — растёт сам: больше дисков, затем 4 и 5 стержней', en: 'Lv {n} — grows with results: more discs, then 4 and 5 pegs' },
  rspanLvlAuto: { ru: 'Ур. {n} — растёт сам: больше фраз в наборе (держать больше последних слов)', en: 'Lv {n} — grows with results: more sentences per set' },

  // Переключение (switching-task): режимы, метки задач (taskMeta через translateFor)
  stimulusLabel: { ru: 'Что показывать', en: 'Stimulus' },
  switchMode_mix: { ru: 'Цифра+буква', en: 'Digit+letter' },
  switchMode_num2: { ru: 'Двузначные', en: '2-digit' },
  switchMode_num3: { ru: 'Трёхзначные', en: '3-digit' },
  switchMode_letters: { ru: 'Только буквы', en: 'Letters' },
  rulesColon: { ru: 'Правила:', en: 'Rules:' },
  switchTopBadgeHint: { ru: 'Плашка сверху скажет, ЧТО оценивать сейчас. Левая кнопка / правая кнопка.', en: 'The top badge tells WHAT to judge now. Left / right button.' },
  judgeCue: { ru: 'ОЦЕНИ', en: 'JUDGE' },
  cueNumber: { ru: 'ЧИСЛО', en: 'NUMBER' },
  cueLetter: { ru: 'БУКВА', en: 'LETTER' },
  cueParity: { ru: 'ЧЁТНОСТЬ', en: 'PARITY' },
  cueSize: { ru: 'РАЗМЕР', en: 'SIZE' },
  cueVowelQ: { ru: 'ГЛАСНАЯ?', en: 'VOWEL?' },
  cueHalf: { ru: 'ПОЛОВИНА', en: 'HALF' },
  ansOdd: { ru: 'нечёт', en: 'odd' },
  ansEven: { ru: 'чёт', en: 'even' },
  ansVowel: { ru: 'гласная', en: 'vowel' },
  ansConsonant: { ru: 'согласная', en: 'conson.' },

  // Маджонг
  pairsWord: { ru: 'пар', en: 'pairs' },
  layerOne: { ru: 'слой', en: 'layer' },
  layerMany: { ru: 'слоя', en: 'layers' },
  playLevelBtn: { ru: 'Играть — уровень {n}', en: 'Play — level {n}' },

  // Сортировка товаров (goods-sort)
  goodsSetsLabel: { ru: '🛒 Товары', en: '🛒 Goods' },
  goodsSet_drinks: { ru: 'Напитки', en: 'Drinks' },
  goodsSet_food: { ru: 'Еда', en: 'Food' },
  goodsSet_toys: { ru: 'Игрушки', en: 'Toys' },
  goodsSet_mix: { ru: 'Микс', en: 'Mix' },
  tooManyMoves: { ru: '🔁 Слишком много ходов', en: '🔁 Too many moves' },

  // Мнемоника / матрица памяти / n-back / анаграммы
  mnemMemorizeWords: { ru: 'Запомните {n} слов', en: 'Memorize {n} words' },
  mnemMemorizeNumbers: { ru: 'Запомните {n} чисел', en: 'Memorize {n} numbers' },
  mmMemorizeRed: { ru: '🔴 Запомни КРАСНЫЕ', en: '🔴 Memorize RED' },
  mmMemorizePurple: { ru: '🟣 Запомни ФИОЛЕТОВЫЕ', en: '🟣 Memorize PURPLE' },
  mmNowRed: { ru: '🔴 Теперь КРАСНЫЕ', en: '🔴 Now RED' },
  mmPurpleFirst: { ru: '🟣 Сначала ФИОЛЕТОВЫЕ', en: '🟣 Purple first' },
  nBackDualHint: { ru: 'Жми Position если позиция повторяет {n} назад. Жми Sound если буква повторяет {n} назад. Можно жать оба', en: 'Tap Position if the position repeats {n} back. Tap Sound if the letter repeats {n} back. You can tap both' },
  nBackShare: { ru: 'Прошёл {n}-back в PsyGames с точностью {p}% — обгони!', en: 'I reached {n}-back in PsyGames at {p}% accuracy — beat that!' },
  anagramTheme_all: { ru: 'Все', en: 'All' },
  anagramTheme_animals: { ru: 'Животные', en: 'Animals' },
  anagramTheme_food: { ru: 'Еда', en: 'Food' },
  anagramTheme_nature: { ru: 'Природа', en: 'Nature' },
  anagramTheme_home: { ru: 'Предметы', en: 'Objects' },
  anagramTheme_transport: { ru: 'Транспорт', en: 'Transport' },
  // v1.140: подписи выбора скина питомца на /pet
  petSkinCat: { ru: 'Нейро-кот', en: 'Neuro Cat' },
  petSkinRobot: { ru: 'Робот', en: 'Robot' },
  petSkinConstellation: { ru: 'Нейрон', en: 'Neuron' },   // скин ≠ стадия «Созвездие» (коллизия имён, аудит Кодекса)
};

/** Standalone-резолвер для кода вне React-дерева: сервисы (reminders, cosmetics)
 *  и AppErrorBoundary (стоит СНАРУЖИ провайдеров — хук недоступен).
 *  Та же цепочка фолбэков, что у t(): инлайн → overlay → EN → RU → key.
 *  Неизвестный lang безопасно падает на EN. */
export function translateFor(lang: string, key: string): string {
  const L = lang as Language;
  const translation = translations[key];
  if (translation) {
    return translation[L] ?? OVERLAYS[L]?.[key] ?? translation.en ?? translation.ru ?? key;
  }
  return OVERLAYS[L]?.[key] ?? key;
}

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>('en'); // база — English

  useEffect(() => {
    loadLanguage();
  }, []);

  const loadLanguage = async () => {
    try {
      // ?lang=<code> (embed-контракт с promo-сайтом): страница передаёт язык
      // статьи, iframe открывается на нём. Приоритет над стораджем, но БЕЗ
      // записи — выбор пользователя в основном /play не перетираем.
      if (typeof window !== 'undefined') {
        try {
          const urlLang = new URLSearchParams(window.location.search).get('lang');
          if (urlLang && LANG_CODES.includes(urlLang)) {
            setLanguageState(urlLang as Language);
            return;
          }
        } catch {}
      }
      const savedLang = await AsyncStorage.getItem('language');
      if (savedLang && LANG_CODES.includes(savedLang)) {
        setLanguageState(savedLang as Language);
      } else {
        // v1.22.0: нет сохранённого → определяем язык системы (база — EN).
        const sys = (typeof navigator !== 'undefined' && navigator.language
          ? navigator.language : 'en').slice(0, 2).toLowerCase();
        setLanguageState((LANG_CODES.includes(sys) ? sys : 'en') as Language);
      }
    } catch (error) {
      console.error('Error loading language:', error);
    }
  };

  const setLanguage = async (lang: Language) => {
    setLanguageState(lang);
    try {
      await AsyncStorage.setItem('language', lang);
    } catch (error) {
      console.error('Error saving language:', error);
    }
  };

  const t = (key: string): string => translateFor(language, key);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
