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
  complexWarmup: { ru: 'ЗАРЯДКА', en: 'WARM-UP' },
  complexEvening: { ru: 'ПЕРЕД СНОМ', en: 'BEFORE SLEEP' },
  complexAssessment: { ru: 'ОЦЕНКА', en: 'ASSESSMENT' },
  seriesGroup: { ru: 'Серии', en: 'Series' },
  seriesBlocksMeta: { ru: 'Три правила подряд на одном поле', en: 'Three rules in a row on one field' },
  seriesBlocksCount: { ru: 'Блоков', en: 'Blocks' },
  seriesGroupNote: { ru: 'Набор упражнений подряд с одним итогом', en: 'A fixed run of exercises with a single result' },
  seriesFixedNote: { ru: 'Состав неизменен — иначе замеры несравнимы', en: 'Fixed set — otherwise measurements can’t be compared' },
  restDay: { ru: 'Сегодня набора нет', en: 'No set today' },
  fractalTitle: { ru: 'Фрактальная судоку', en: 'Fractal Sudoku' },
  fractalDesc: { ru: 'За каждой клеткой верхней сетки спрятана целая судоку', en: 'Behind every cell of the top grid hides a whole sudoku' },
  // ⚠️ ЧИСЛО ЗДЕСЬ НЕ ЗАШИВАТЬ. Порог открытия растёт с уровнем (fractalLevels.ts):
  // было «до 17 верных клеток», и на верхних уровнях описание врало про механику —
  // ровно как правила маджонга объясняли три слоя, когда выкладывалось четыре.
  fractalHowTo: { ru: "Это судоку из судоку: решается снизу вверх, за три шага. 1) Открой любую нижнюю сетку и реши в ней столько клеток, сколько просит счётчик на её плитке. 2) Счётчик набран — сетка отдаёт свою цифру наверх, в корневую сетку (цифра остаётся видна на плитке). 3) Когда все девять сеток отдали цифры, дорешай корень как обычную судоку. Порталы ⇄ связывают две сетки общей цифрой: застрял в одной — зайди в парную.", en: "It is a sudoku made of sudokus: solve it bottom-up, in three steps. 1) Open any lower grid and solve as many cells as its tile counter asks. 2) Counter reached — the grid sends its digit up into the root grid (the digit stays visible on the tile). 3) Once all nine grids have sent their digits, finish the root like a normal sudoku. Portals ⇄ link two grids with a shared digit: stuck in one — enter its twin." },
  fractalRoot: { ru: 'Корневая сетка', en: 'Root grid' },
  fractalChildren: { ru: 'Нижние сетки', en: 'Lower grids' },
  fractalChildN: { ru: 'Сетка', en: 'Grid' },
  fractalOpened: { ru: 'Открыто', en: 'Opened' },
  fractalToUnlock: { ru: 'до открытия', en: 'to unlock' },
  fractalFeedHint: { ru: 'Подсвеченная клетка в центре — та самая цифра, которая уйдёт в корневую сетку', en: 'The highlighted centre cell is the digit that will move up into the root grid' },
  fractalLinkHint: { ru: 'подсвеченная клетка корня: реши эту сетку — её цифра встанет туда. Коснись клетки ещё раз, чтобы открыть сетку', en: 'the highlighted root cell: solve this grid and its digit lands there. Tap the cell again to open the grid' },
  fractalLinkHintDone: { ru: 'эта сетка уже отдала свою цифру в подсвеченную клетку. Коснись клетки ещё раз, чтобы открыть сетку', en: 'this grid has already sent its digit into the highlighted cell. Tap the cell again to open the grid' },
  sudokuFractalDeepIntroDesc: { ru: 'Судоку, вложенная в судоку до трёх слоёв. Проваливайся по пунктирным клеткам до самого дна и решай там: цифры всплывают наверх слой за слоем. Дорешай корневую сетку — победа. Партия сохраняется сама.', en: 'A sudoku nested in a sudoku up to three layers deep. Dive through the dashed cells to the very bottom and solve there: digits float up layer by layer. Finish the root grid to win. The game saves itself.' },
  deepTitle: { ru: 'Фрактал: Бездна', en: 'Fractal: The Abyss' },
  deepDesc: { ru: 'Судоку в судоку в судоку — марафон вглубь', en: 'Sudoku inside sudoku inside sudoku — a marathon into the deep' },
  deepHowTo: { ru: 'Первая сетка — вершина. Под пунктирными клетками спрятаны свои судоку: проваливайся вниз до дна, решай листья — цифры всплывают наверх. Дорешай корневую — победа. Партия длинная и сохраняется сама: возвращайся в любой момент.', en: 'The first grid is the top. Dashed cells hide their own sudokus: dive down to the bottom, solve the leaves — digits float up. Finish the root grid to win. The game is long and saves itself: come back anytime.' },
  deepPreset_scout: { ru: 'Разведка', en: 'Scouting' },
  deepPresetDesc_scout: { ru: '2 слоя, девять нижних сеток — попробовать механику', en: '2 layers, nine lower grids — a taste of the mechanic' },
  deepPreset_trek: { ru: 'Экспедиция', en: 'Expedition' },
  deepPresetDesc_trek: { ru: '3 слоя, по двенадцать сеток под узлом — на несколько вечеров', en: '3 layers, twelve grids per node — several evenings' },
  deepPreset_abyss: { ru: 'Бездна', en: 'The Abyss' },
  deepPresetDesc_abyss: { ru: '3 слоя, пазл под каждой пустой клеткой — марафон на недели', en: '3 layers, a puzzle under every empty cell — a weeks-long marathon' },
  deepPuzzles: { ru: 'пазлов', en: 'puzzles' },
  deepWon: { ru: 'Корень собран!', en: 'The root is complete!' },
  deepLost: { ru: 'Партия закрыта', en: 'Game closed' },
  deepDiveHint: { ru: 'Пунктирная клетка — вход во вложенную судоку: коснись, чтобы провалиться', en: 'A dashed cell is a door into a nested sudoku: tap to dive in' },
  deepLeafHint: { ru: 'Это дно. Реши сетку до порога — центральная цифра всплывёт наверх', en: 'This is the bottom. Solve the grid to its threshold — the centre digit floats up' },
  deepSpice: { ru: 'Приправа глубины', en: 'Spice of the deep' },
  deepSpiceDesc: { ru: 'На нижнем слое появятся термометры и клетки-суммы, а подсказок станет меньше', en: 'The bottom layer gets thermometers and sum cages, and fewer given digits' },
  deepSpiceRuleThermo: { ru: 'Термометр: от колбы цифры растут — каждая следующая больше предыдущей', en: 'Thermometer: digits grow from the bulb — each next one is larger' },
  deepSpiceRuleCage: { ru: 'Термометр растёт от колбы; цифры цветной группы дают её сумму и не повторяются', en: 'Digits grow from the bulb; a coloured cage sums to its clue with no repeats' },
  deepEntryHint: { ru: 'Их масштаб: тысячи вложенных сеток, партия на недели', en: 'Full scale: thousands of nested grids, a weeks-long game' },
  fractalPortal: { ru: 'Портал', en: 'Portal' },
  fractalPortals: { ru: 'Порталы', en: 'Portals' },
  fractalPortalGo: { ru: 'В сетку', en: 'Go to grid' },
  fractalPortalHint: { ru: 'Клетка с кольцом — одна и та же в двух сетках сразу. Порознь ни одна из них цифру не выдаёт: сузьте кандидатов здесь, сузьте там — ответ даст пересечение.', en: 'A ringed cell is one and the same cell in two grids at once. Neither grid names its digit alone: narrow the candidates here, narrow them there, and the answer is what both allow.' },
  fractalRedDigit: { ru: 'Красная цифра — ошибка: такая уже стоит в этой строке, столбце или квадрате. Она остаётся на доске, чтобы было видно, что исправить.', en: 'A red digit is a mistake: the same one already stands in this row, column or box. It stays on the board so you can see what to fix.' },
  fractalUndecided: { ru: 'Здесь задача пока не определена: цифра не нарушает ни одного правила, но и не выводится. Это не ошибка — сначала разрешите портал.', en: 'This cell is not decided yet: the digit breaks no rule, but it does not follow either. That is not a mistake — resolve the portal first.' },
  fractalPortalRule: { ru: 'С шестого уровня появляются порталы: пара клеток из РАЗНЫХ нижних сеток — на деле одна клетка. Ни одна из двух сеток не решается сама по себе; цифру даёт только то, что обе про неё допускают. Это вывод, которого нет ни в одном из пазлов по отдельности.', en: 'From level six portals appear: a pair of cells in DIFFERENT lower grids is really one cell. Neither of the two grids can be solved on its own; the digit comes only from what both of them allow. That is an inference neither puzzle holds by itself.' },
  ctaStart: { ru: 'СТАРТ', en: 'START' },
  // Карточка зарядки ведёт на ВЫБОР набора, а не запускает его. Подпись «СТАРТ»
  // обещала запуск — Валя об этом и писала: «заходишь в „не спится“, а там все
  // зарядки». Обещание кнопки должно совпадать с тем, что произойдёт.
  ctaChoose: { ru: 'ВЫБРАТЬ', en: 'CHOOSE' },
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
  /**
   * ⚠️ Витрина свежего. Ключи заведены НЕ сразу: профиль сперва был скрыт из
   * выбора (`tier: 'owner'`), и его подписи никто не запрашивал. Как только он
   * стал виден, человек увидел на карточке сырые `profileName_whatsnew` —
   * ровно та беда, из-за которой существует гейт битых вызовов словаря.
   */
  profileName_whatsnew: { ru: 'Новинки', en: 'What\'s new' },
  profileDesc_whatsnew: { ru: 'Новое и обновлённое за 3 месяца', en: 'New and reworked over 3 months' },
  profileName_odv999: { ru: 'ODV999', en: 'ODV999' },
  profileDesc_odv999: { ru: 'Все {n} игр · Зарядка · Financial · Assessment', en: 'All {n} games · Warm-up · Financial · Assessment' },
  profileName_chess: { ru: 'Шахматист', en: 'Chess Player' },
  profileDesc_chess: { ru: 'Расчёт ходов · spatial · sustained attention', en: 'Move calculation · spatial · sustained attention' },
  profileName_kids: { ru: 'Дети 7-12', en: 'Kids 7-12' },
  profileDesc_kids: { ru: 'Память · счёт · реакция · без сложных абстракций', en: 'Memory · counting · reaction · no complex abstractions' },
  profileName_vasilyeva: { ru: 'Скорочтение PRO', en: 'Speed Reading PRO' },
  profileDesc_vasilyeva: { ru: 'Поле зрения · скорость глаз · удержание текста', en: 'Visual field · eye speed · text retention' },
  profileName_nzt48: { ru: 'NZT-48 (полный)', en: 'NZT-48 (full)' },
  profileDesc_nzt48: { ru: 'Полная батарея префронталки · максимум', en: 'Full prefrontal battery · maximum' },
  // «FREE» обещало, что где-то есть платное — а платный проект отложен. Ещё
  // хуже, что оно читалось как «урезанная проба»: набор из 9 тренажёров не
  // урезан, он подобран. Вываливать человеку все 60 сразу нельзя — он уйдёт и
  // не вернётся, поэтому 9-10 в профиле это норма, а не ограничение.
  badgeNoCode: { ru: 'без кода', en: 'no code' },
  profileName_free: { ru: 'Стандарт', en: 'Standard' },
  profileDesc_free: { ru: '9 тренажёров · подобранный набор для старта', en: '9 trainers · a curated set to start with' },
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
  hanoiHint: { ru: 'Перетащи диск на другой стержень — или кликни: сначала источник, потом цель', en: 'Drag a disc to another peg — or tap: source first, then target' },
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
  brTechBox: { ru: 'Квадратное дыхание', en: 'Box breathing' },
  brTechBoxDesc: { ru: 'Концентрация и контроль стресса', en: 'Focus and stress control' },
  brTech478: { ru: 'Дыхание 4-7-8', en: '4-7-8 breathing' },
  brTech478Desc: { ru: 'Успокоение, помогает заснуть', en: 'Calming, helps you sleep' },
  brTechCoherent: { ru: 'Когерентное дыхание', en: 'Coherent breathing' },
  brTechCoherentDesc: { ru: 'Баланс ВНС, рост HRV', en: 'Autonomic balance, raises HRV' },
  brTechSigh: { ru: 'Физиологический вздох', en: 'Physiological sigh' },
  brTechSighDesc: { ru: 'Двойной вдох + длинный выдох — быстрый сброс', en: 'Double inhale + long exhale — fast reset' },
  brTechExt: { ru: 'Удлинённый выдох', en: 'Extended exhale' },
  brTechExtDesc: { ru: 'Мягкое успокоение для новичка', en: 'Gentle calming for beginners' },
  brTech424: { ru: 'Спокойный ритм', en: 'Calm rhythm' },
  brTech424Desc: { ru: 'Простой ритм для старта', en: 'Simple starter rhythm' },
  brTechWim: { ru: 'Метод Вима Хофа', en: 'Wim Hof method' },
  brTechWimDesc: { ru: 'Энергия. Только сидя или лёжа', en: 'Energy. Sitting or lying only' },
  brGetReady: { ru: 'Устройся поудобнее', en: 'Get comfortable' },
  brInhale: { ru: 'Вдох', en: 'Inhale' },
  brExhale: { ru: 'Выдох', en: 'Exhale' },
  brHold: { ru: 'Задержка', en: 'Hold' },
  brWimWarnTitle: { ru: 'Сначала безопасность', en: 'Safety first' },
  brWimWarnBody: {
    ru: 'Метод Вима Хофа — это гипервентиляция с задержкой дыхания. Выполняйте ТОЛЬКО сидя или лёжа. НЕ делайте за рулём, в воде, при беременности, эпилепсии или болезнях сердца. При головокружении остановитесь и дышите спокойно.',
    en: 'The Wim Hof method is hyperventilation with breath holds. Do it ONLY while sitting or lying down. NEVER while driving, in water, or if pregnant, epileptic, or with heart conditions. If you feel dizzy, stop and breathe normally.',
  },
  brWimAgree: { ru: 'Понимаю, начать', en: 'I understand, start' },
  brWimBreathe: { ru: 'Дышите глубоко', en: 'Breathe deeply' },
  brWimBreatheHint: { ru: 'Полный вдох — расслабленный выдох', en: 'Full inhale — relaxed exhale' },
  brWimHold: { ru: 'Задержите дыхание', en: 'Hold your breath' },
  brWimHoldHint: { ru: 'Выдохните и держите. Нажмите, когда захотите вдохнуть.', en: 'Exhale and hold. Tap when you need to breathe.' },
  brWimRecover: { ru: 'Глубокий вдох, держите', en: 'Deep breath in, hold' },
  brDoneTitle: { ru: 'Сессия завершена', en: 'Session complete' },
  brTotal: { ru: 'Всего', en: 'Total' },
  brHrvNote: {
    ru: 'Когерентное дыхание балансирует вегетативную нервную систему. При регулярной практике растёт вариабельность пульса (HRV) — маркер восстановления и стрессоустойчивости.',
    en: 'Coherent breathing balances your autonomic nervous system. With regular practice your heart rate variability (HRV) rises — a marker of recovery and stress resilience.',
  },
  // Goods Sort (сортировка товаров)
  goodsSort: { ru: 'Сортировка товаров', en: 'Goods Sort' },
  goodsSortDesc: { ru: 'Собери на полке три одинаковых товара', en: 'Group three identical goods on a shelf' },
  /**
   * ⚠️ ТЕКСТ ОБЯЗАН ОПИСЫВАТЬ ТУ ИГРУ, КОТОРАЯ ЕСТЬ. Прежняя версия
   * обещала стопки, спрятанные за передним товаром предметы и комбо ×2/×3 —
   * ничего из этого в коде нет и не было. Найдено разбором 19.08.2026.
   * Скрытые слои в плане есть; когда появятся, текст дополним — но не
   * раньше, чем они заработают.
   */
  goodsSortIntroDesc: {
    ru: "Перетащи товар в нишу — или тапни его, потом нишу. Три одинаковых в одной нише исчезают. Цель у каждого уровня своя и написана над шкафом: убрать всё, собрать названные товары, уложиться в ходы или освободить помеченные ниши. Дальше появляются препятствия — запертые ниши, замки по ходам, накрытые товары, примёрзший ряд. В нише помещается три, поэтому пара занимает место, пока не найдётся третий: думай, куда класть, а не только что.",
    en: "Drag a good into a niche — or tap it, then the niche. Three identical goods in one niche vanish. Each level states its own goal above the cabinet: clear everything, gather the named goods, stay within the move limit, or free the flagged niches. Later come obstacles — locked niches, timed locks, covered goods, a frozen row. A niche holds three, so a pair blocks it until the third turns up: think about where you put things, not just what.",
  },
  skillPlanningWM: { ru: 'Тренируем: планирование + зрительная память', en: 'Training: planning + visual memory' },
  benefitGoods1: { ru: 'Зрительная рабочая память: что где спрятано', en: 'Visual working memory: what is hidden where' },
  benefitGoods2: { ru: 'Планирование последовательности ходов', en: 'Planning a sequence of moves' },
  benefitGoods3: { ru: 'Концентрация и системность', en: 'Focus and systematic thinking' },
  goalLabel: { ru: "Цель", en: "Goal" },
  goalAll: { ru: "Убрать всё с полок", en: "Clear every shelf" },
  goalPick: { ru: "Собрать тройки:", en: "Gather triples of:" },
  goalMoves: { ru: "Убрать всё. Ходов не больше:", en: "Clear all. Moves at most:" },
  goalFree: { ru: "Освободить помеченные ниши", en: "Free the marked niches" },
  goodsSortHint: { ru: "Перетащи товар в нишу — или тапни его, потом нишу. Собери 3 ОДИНАКОВЫХ в одной нише — исчезнут. Убери всё.", en: "Drag a good into a niche — or tap it, then the niche. Gather 3 IDENTICAL in one niche — they vanish. Clear everything." },
  goodsSortDeadEnd: { ru: "Ходов больше нет: переложить некуда. Отмени несколько ходов или перемешай.", en: "No moves left: nowhere to put anything. Undo a few moves or shuffle." },
  goodsLevel: { ru: 'Уровень', en: 'Level' },
  eyeInstrWarmup: { ru: 'Веди взгляд за точкой по направлениям', en: 'Follow the dot in each direction' },
  eyeInstrSpiral: { ru: 'Точка идёт по спирали — веди её, не срезая путь', en: 'The dot spirals — follow it, do not cut corners' },
  eyeInstrWave: { ru: 'Волна: путь не прямой, не угадывай наперёд', en: 'A wave: the path is not straight, do not predict it' },
  eyeInstrPulse: { ru: 'Точка сжимается и разжимается — держи её резкой', en: 'The dot shrinks and grows — keep it sharp' },
  eyeInstrPursuit: { ru: 'Следи за точкой глазами, голову не двигай', en: 'Follow the dot with your eyes, keep your head still' },
  eyeInstrFocusFar: { ru: 'Оторвись от экрана — посмотри вдаль (в окно, ~6 м)', en: 'Look away — focus far into the distance (a window, ~6 m)' },
  eyeInstrConverge: { ru: 'Сведи взгляд на приближающейся точке', en: 'Keep both eyes on the approaching dot' },
  eyeInstrPalming: { ru: 'Закрой глаза ладонями, расслабься и моргай', en: 'Cover your eyes with your palms, relax and blink' },
  eye3min: { ru: '~3 мин', en: '~3 min' },
  eye5min: { ru: '~5 мин', en: '~5 min' },
  eye1min: { ru: '~1 мин', en: '~1 min' },
  eyeSpeedLabel: { ru: 'Скорость точки', en: 'Dot speed' },
  eyeSlow: { ru: 'Медленно', en: 'Slow' },
  eyeNorm: { ru: 'Норма', en: 'Normal' },
  eyeFast: { ru: 'Быстро', en: 'Fast' },
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
  /**
   * Отчёт 02.09.2026 по «Соедини цепочку»: «линии могут пересекаться или нет? там
   * же какие-то вроде правила». Правило есть и оно простое — пересекаться можно,
   * важен ПОРЯДОК, — но на поле его не было, а в справку за ним не идут посреди
   * партии. Показываем один раз, до первого касания.
   */
  /**
   * Вторая лестница (задача b96bfc4b): что открывается по уровню игрока.
   * Названия приёмов и строка «ближайшая дверь» — их видно ДО открытия, в этом
   * и смысл замка: впереди всегда есть куда идти, и это не стоит денег.
   */
  ladderHint: { ru: 'Подсказка в играх', en: 'In-game hints' },
  ladderUndo: { ru: 'Отмена хода', en: 'Undo a move' },
  ladderRoundStats: { ru: 'Разбор партии', en: 'Round breakdown' },
  ladderPetSkins: { ru: 'Наряды питомца', en: 'Pet outfits' },
  ladderEvening: { ru: 'Вечерний режим', en: 'Evening mode' },
  ladderRecords: { ru: 'Экран рекордов', en: 'Records screen' },
  ladderStreakMap: { ru: 'Карта серии', en: 'Streak map' },
  ladderNext: { ru: 'Ещё {n} — и откроется: {what}', en: '{n} more to unlock: {what}' },
  /**
   * Надпись на ЗАПЕРТОЙ служебной кнопке. Кнопка не исчезает: пропавший приём
   * читается как «в этой игре его нет», а запертый — как «будет». Замок обязан
   * быть виден, иначе это не лестница, а просто отсутствие.
   */
  ladderLockedAt: { ru: 'Откроется на уровне {n}', en: 'Unlocks at level {n}' },
  /**
   * КОРОТКАЯ форма замка — для кнопок в тесной строке.
   *
   * ⚠️ Заведена не для красоты: браузерный гейт на 360 px поймал, что полная
   * фраза на кнопке подсказки судоку вылезает за край на 27 px и обрезается.
   * Обрезание уже один раз спрятало счётчики вместо переноса (регресс 2.34.2),
   * поэтому лечение то же, что и тогда: короче слова, а не откат правки.
   * Полная фраза остаётся в подписи для скринридера — смысл не теряется.
   */
  ladderLockedShort: { ru: 'Ур. {n}', en: 'Lv {n}' },
  /**
   * Сундук — долгая цель (задача 6e564484, шаг 3). Строка называет ОСТАТОК до
   * следующей фигурки, а не общий путь: «ещё 30» зовёт доиграть, «120 из 17000»
   * отговаривает начинать.
   */
  chestToNext: { ru: 'Ещё ⭐{n} — и новая фигурка · собрано {have}/{all}', en: '⭐{n} more for a new figure · {have}/{all} collected' },
  chestFull: { ru: 'Коллекция собрана целиком', en: 'Collection complete' },
  /** Громкость (задача fe7f2020): тумблер отвечает «звучать ли», ползунок — «насколько». */
  volumeLabel: { ru: 'Громкость', en: 'Volume' },
  /** Колесо множителя после уровня (задача ac44fc2d, пункт 5). Рекламы в нём нет. */
  wheelSpin:  { ru: 'Крутить колесо', en: 'Spin the wheel' },
  wheelWon:   { ru: '×{m} — ещё {n} ⭐', en: '×{m} — {n} ⭐ more' },
  /**
   * ВИТРИНА КОЛЛЕКЦИИ (задача 6e564484, шаг 2). Сундук говорил «собрано 3 из 12»,
   * а посмотреть на эти три было негде: цель числовая, а не предметная. Двенадцать
   * имён — чтобы у пустой полки было имя того, что на ней появится: силуэт без
   * названия не тянет, он просто дырка.
   */
  collectionTitle:  { ru: 'Коллекция', en: 'Collection' },
  collectionSub:    { ru: 'Собрано {have} из {all} · ⭐{earned} за всё время', en: '{have} of {all} collected · ⭐{earned} all time' },
  collectionLocked: { ru: 'Откроется на ⭐{n}', en: 'Opens at ⭐{n}' },
  collectionOpen:   { ru: 'Открыть коллекцию', en: 'Open collection' },
  figAcorn:        { ru: 'Жёлудь', en: 'Acorn' },
  figPebble:    { ru: 'Камешек',     en: 'Pebble' },
  figShell:     { ru: 'Ракушка',     en: 'Shell' },
  figFeather:   { ru: 'Пёрышко',     en: 'Feather' },
  figLantern:   { ru: 'Фонарик',     en: 'Lantern' },
  figKey:       { ru: 'Ключик',      en: 'Key' },
  figAnchor:       { ru: 'Якорь', en: 'Anchor' },
  figHourglass: { ru: 'Песочные часы', en: 'Hourglass' },
  figCrystal:   { ru: 'Кристалл',    en: 'Crystal' },
  figHedgehog:     { ru: 'Ёжик', en: 'Hedgehog' },
  figMoon:      { ru: 'Луна',        en: 'Moon' },
  figLighthouse:   { ru: 'Маяк', en: 'Lighthouse' },
  trailCrossOk: { ru: 'Линии могут пересекаться — важен порядок и скорость', en: 'Lines may cross — order and speed are what count' },

  // Sudoku
  sudoku: { ru: 'Судоку', en: 'Sudoku' },
  sudokuDesc: { ru: 'Цифры без повторов в строке, столбце и блоке (6×6 и 9×9)', en: 'Digits with no repeats in each row, column and box (6×6 and 9×9)' },
  sudokuIntroDesc: {
    ru: 'Заполните сетку так, чтобы цифры встречались ровно один раз в каждой строке, столбце и блоке. Классический логический пазл.\n\n🎚 Уровни — с ростом уровня добавляются правила-варианты:\n• L9 ⟍ диагонали: цифры уникальны и по двум диагоналям\n• L14 ♞ ход коня: равные цифры не на ходу коня\n• L18 ⊞ доп. зоны: ещё 4 квадрата 3×3 без повторов\n• L22 ≠ не подряд: соседи по стороне не отличаются на 1\n• L26 ♚ ход короля: равные не касаются даже по диагонали\n• L30 ◩ чёт/нечёт: □ клетка — чётная цифра, ○ — нечётная\n• L34 ● точки Кропки: белая точка — соседи отличаются на 1, чёрная — вдвое\n• L38 ⊐ сэндвич: число у края — сумма цифр между 1 и 9 в этом ряду\n• L42 🌡 термометры: вдоль термометра цифры растут от колбы\n• L46 ↗ стрелки: цифра в кружке — сумма цифр вдоль стрелки\n• L50 🌡+ термометр и суммы: два правила разом — цепочка растёт от колбы, а группа даёт сумму из угла\n• L54 ⧉ кривые блоки: блоки неправильной формы\n\n👑 Killer — поле разбито на группы: цифры в группе дают сумму в её углу и не повторяются.\n\n🆓 Свободно — поле 6×6 или 9×9 без вариантов, с выбором сложности.',
    en: 'Fill the grid so digits appear exactly once in every row, column and block. The classic logic puzzle.\n\n🎚 Levels — new variant rules unlock as you climb:\n• L9 ⟍ diagonals: digits are also unique on both diagonals\n• L14 ♞ anti-knight: equal digits cannot be a knight move apart\n• L18 ⊞ hyper: 4 extra 3×3 zones with no repeats\n• L22 ≠ non-consecutive: side-neighbours cannot differ by 1\n• L26 ♚ anti-king: equal digits cannot touch even diagonally\n• L30 ◩ even/odd: □ cell = even digit, ○ = odd\n• L34 ● kropki: a white dot means neighbours differ by 1, a black one means double\n• L38 ⊐ sandwich: the number at the edge is the sum of digits between 1 and 9 in that line\n• L42 🌡 thermometers: digits increase along the thermometer, from the bulb\n• L46 ↗ arrows: the digit in the circle is the sum of digits along the arrow\n• L50 🌡+ thermo and cages: two rules at once — the chain grows from the bulb, the cage adds up to its corner\n• L54 ⧉ jigsaw: irregular blocks instead of squares\n\n👑 Killer — the grid splits into cages: digits in a cage add up to the number in its corner and never repeat.\n\n🆓 Free — a 6×6 or 9×9 board with no variants, your choice of difficulty.',
  },
  difficultyLabel: { ru: 'Сложность', en: 'Difficulty' },
  sudokuTierBeginner: { ru: 'Начинающий', en: 'Beginner' },
  sudokuTierEasy: { ru: 'Лёгкий', en: 'Easy' },
  sudokuTierMedium: { ru: 'Средний', en: 'Medium' },
  sudokuTierHard: { ru: 'Сложный', en: 'Hard' },
  sudokuTierExpert: { ru: 'Экспертный', en: 'Expert' },
  sudokuTierExtreme: { ru: 'Крайность', en: 'Extreme' },

  // Дороги сложности судоку (services/sudoku-roads): три отдельные лестницы, а не
  // скидка к одной. Число рядом с названием — уровень этой дороги, видимый ДО выбора.
  sudokuRoadLabel:  { ru: 'Дорога сложности', en: 'Difficulty road' },
  sudokuRoadEasy:   { ru: 'Полегче',  en: 'Easier' },
  sudokuRoadNormal: { ru: 'Обычная',  en: 'Standard' },
  sudokuRoadHard:   { ru: 'Пожёстче', en: 'Harder' },
  sudokuRoadHint: {
    ru: 'У каждой дороги свой счёт уровней. Взятое на тяжёлой засчитывается и на лёгких, обратно — нет. Дорогу выбирают до партии.',
    en: 'Each road keeps its own level count. Levels beaten on a harder road count on the easier ones, never the other way round. Pick the road before the game.',
  },

  // Хаб судоку (games/sudoku-hub.tsx): одна карточка каталога на три доски.
  sudokuGroup:     { ru: 'Судоку: три доски',            en: 'Sudoku: three boards' },
  sudokuGroupDesc: { ru: 'Классическая, самурай и фрактальная', en: 'Classic, samurai and fractal' },
  sudokuPickBoard: { ru: 'Выбери доску',                 en: 'Choose a board' },
  sudokuTypeClassic: { ru: 'Одна сетка · 57 ступеней',   en: 'One grid · 57 steps' },
  sudokuTypeSamurai: { ru: 'Пять сеток, сцепленных углами', en: 'Five grids locked at the corners' },
  sudokuTypeFractal: { ru: 'Сетка внутри каждой клетки',  en: 'A grid inside every cell' },
  sudokuGroupFootnote: {
    ru: 'Правило у всех трёх одно: цифра не повторяется в строке, столбце и блоке. Различается доска. У каждой свой счёт уровней и своя история — партии не смешиваются.',
    en: 'All three share one rule: a digit never repeats in a row, a column or a box. What differs is the board. Each keeps its own level count and its own history — games are never mixed.',
  },
  sudokuGroupIntroDesc: {
    ru: 'Это не отдельное упражнение, а развилка: карточка открывает три доски одной головоломки. Правило у всех одно — цифра не повторяется в строке, столбце и блоке.\n\nКлассическая доска растёт лестницей: с уровнями приходят правила-варианты, а дорога сложности задаёт, насколько трудной техникой берётся ступень. Самурай и фрактальная — длинные формы, они живут часами: у самурая пять сеток делят угловые блоки, у фрактальной ответ вложенной сетки становится цифрой в клетке верхней. Выбери доску внутри.',
    en: 'This is not an exercise but a fork: the card opens three boards of one puzzle. The rule is the same in all of them — a digit never repeats in a row, a column or a box.\n\nThe classic board climbs a ladder: levels bring variant rules, and the difficulty road sets how hard a technique each step demands. Samurai and fractal are long forms that live for hours: samurai has five grids sharing corner blocks, while in the fractal one the answer of a nested grid becomes the digit in the cell above. Pick a board inside.',
  },
  easy: { ru: 'Легко', en: 'Easy' },
  medium: { ru: 'Средне', en: 'Medium' },
  hard: { ru: 'Сложно', en: 'Hard' },
  benefitSudoku1: { ru: 'Лучше структурировать задачи', en: 'Structure problems better' },
  benefitSudoku2: { ru: 'Тренировать дедукцию', en: 'Train deductive logic' },
  benefitSudoku3: { ru: 'Концентрация на одной задаче', en: 'Focus on a single task' },
  skillReasoning: { ru: 'Логическое мышление', en: 'Reasoning' },
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
  // Парные картинки: панель «уровни / свободно» и параметры уровня. Раньше эти
  // строки выбирались тернарником по языку прямо в экране — то есть все десять
  // неанглийских локалей получали английский текст.
  pairsModeLevelsHint: { ru: 'Уровни растут: выиграл — дальше, сложнее. Счёт копится.', en: 'Levels ramp: win → next, harder. Score accumulates.' },
  pairsModeFreeHint: { ru: 'Один раунд по своим настройкам.', en: 'One round, your settings.' },
  pairsLvlPairs: { ru: '{n} пар', en: '{n} pairs' },
  pairsLvlFlash: { ru: 'фото-память {s}с', en: 'flash {s}s' },
  pairsPreviewHint: { ru: '{s}с — потом карты закроются', en: '{s}s — then the cards flip back' },
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
  /**
   * СЧЁТЧИК ДОСТУПНЫХ ПАР в шапке маджонга + сообщение о вставшей доске.
   *
   * 🔴 ЗАЧЕМ. Верхний по полезности отзыв к Vita Mahjong (100 млн установок) —
   * жалоба на то, что из игры убрали окошко «сколько пар ещё можно собрать»: без
   * него человек жмёт перетасовку ВСЛЕПУЮ. У нас перетасовок одна-три на уровень,
   * то есть слепое нажатие стоит дороже, чем в образце.
   */
  mahjongPairsOpen: { ru: 'Доступно', en: 'Open' },
  mahjongNoPairs: {
    ru: 'Доступных пар нет — доска встала. Перемешай или отмени ход.',
    en: 'No pairs available — the board is stuck. Shuffle or undo a move.',
  },
  skillVisualSearch: { ru: 'Тренируем: зрительный поиск', en: 'Training: visual search' },
  benefitMahjong1: { ru: 'Зрительный поиск пар среди множества тайлов', en: 'Visual search for pairs among many tiles' },
  benefitMahjong2: { ru: 'Планирование: какие тайлы открыть раньше', en: 'Planning which tiles to free up first' },
  benefitMahjong3: { ru: 'Концентрация и внимание к деталям', en: 'Focus and attention to detail' },

  // Math Sprint
  mathSlider: { ru: 'Математическая шкала', en: 'Math Slider' },
  mathSliderDesc: { ru: 'Прикинь результат и поставь метку на числовой прямой', en: 'Estimate the result and place a marker on the number line' },
  mathSprint: { ru: 'Математический спринт', en: 'Mental Math Sprint' },
  mathSprintDesc: { ru: 'Реши максимум примеров за время', en: 'Solve as many problems as possible in time' },
  mathSliderIntroDesc: {
    ru: 'Прикиньте результат выражения и поставьте метку на числовой прямой. Точный счёт не нужен — важно попасть в правильную область шкалы. Тренирует чувство величины и приблизительный счёт, а с уровнями меняется само выражение: сложение, вычитание, умножение, дроби, проценты, скидки, пропорции.',
    en: 'Estimate the value of the expression and place a marker on the number line. Exact calculation is not the point — landing in the right region of the scale is. Builds number sense and approximation, and the expression family itself changes with the levels: addition, subtraction, multiplication, decimals, percentages, discounts, proportions.',
  },
  mathSprintIntroDesc: {
    ru: 'Решайте арифметические примеры на скорость. Каждое правильное подряд увеличивает бонус-стрик. Развивает устный счёт и быстроту мышления.',
    en: 'Solve arithmetic problems against the clock. Consecutive correct answers grow a streak bonus. Builds mental arithmetic and processing speed.',
  },
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

  // ─── Зарядка по времени суток (v1.179) ───────────────────────────────────
  // Одна кнопка вместо двух: подпись меняется по часам, по тапу открывается
  // выбор, где нужный набор уже выбран, но доступны и остальные. Границы часов
  // согласованы с Денисом: 5-12 · 12-18 · 18-00 · 00-05.
  warmupPickerTitle: { ru: 'Зарядка', en: 'Workout' },
  warmupPickerHint:  { ru: 'Выбрано по времени суток — можно взять любой другой', en: 'Picked by time of day — you can take any other' },
  slotMorning:      { ru: 'Утренняя', en: 'Morning' },
  slotDay:          { ru: 'Дневная', en: 'Daytime' },
  slotEvening:      { ru: 'Вечерняя', en: 'Evening' },
  // 06.08: назад к «Ночной». «Не спится» читалось как отдельная сущность, а не как
  // время суток зарядки — Валя дословно: «непонятно написано не спица… в итоге когда
  // заходишь, там все зарядки». Денис: «это зарядка вечерняя, дневная или ночная».
  // Мягкость смысла осталась в описании и в пометке «не тренировка».
  slotNight:        { ru: 'Ночная', en: 'Night' },
  slotMorningDesc:  { ru: 'Разогнать голову на день', en: 'Get your head going for the day' },
  slotDayDesc:      { ru: 'Короткий перерыв в работе', en: 'A short break from work' },
  slotEveningDesc:  { ru: 'Спокойные игры и дыхание', en: 'Calm games and breathing' },
  slotNightDesc:    { ru: 'Не спится — только дыхание, без счёта', en: 'Can’t sleep — breathing only, no score' },
  slotNightNote:    { ru: 'Это не тренировка: очки не начисляются и стрик не растёт', en: 'Not a workout: no points, no streak' },
  restart: { ru: 'Заново', en: 'Restart' },
  a11yResetLevel: { ru: 'Начать заново с первого уровня', en: 'Restart from level one' },
  back: { ru: 'Назад', en: 'Back' },
  time: { ru: 'Время', en: 'Time' },
  score: { ru: 'Счёт', en: 'Score' },
  level: { ru: 'Уровень', en: 'Level' },
  size: { ru: 'Размер', en: 'Size' },
  mode: { ru: 'Режим', en: 'Mode' },
  colorMode: { ru: 'Цветной', en: 'Color' },
  bwMode: { ru: 'Чёрно-белый', en: 'B&W' },
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
  chessBlind: { ru: 'Доска в уме', en: 'Board in Mind' },
  chessBlindDesc: { ru: 'Тренажёр визуализации доски: поля, конь, память', en: 'Board visualization trainer: squares, knight, memory' },
  chessBlindIntroDesc: {
    ru: 'ДВА РЕЖИМА. Серия из трёх заданий на ОДНОЙ позиции из реальной партии: сперва сравнить два поля по цвету, потом — дойдёт ли конь с одного на другое за N ходов, потом — стояла ли на поле названная фигура. Разница во времени между заданиями показывает, чего вам стоит применить правило хода и чего — удержать позицию в голове. Доски во время вопросов нет: она живёт в голове, иначе это не замер. Второй режим — партия: позицию из реальной задачи показывают на несколько секунд, потом фигуры превращаются в одинаковые фишки и ходят вслепую. ⚠️ Это тренажёр визуализации доски, а не воспроизведение научной методики: позиции взяты из заготовленной офлайн выборки живых задач (Lichess, общественное достояние), а разница во времени — цена одного добавленного правила в этой партии на этой позиции, и ничего сверх того.',
    en: 'TWO MODES. A series of three tasks on ONE position from a real game: first compare two squares by colour, then tell whether a knight gets from one to the other in N moves, then whether a named piece stood on a square. The time difference between tasks shows what it costs you to apply the move rule, and what it costs to hold the position in your head. There is no board on screen during the questions: it lives in your head, otherwise this is not a measurement. The second mode is a game: a position from a real puzzle is shown for a few seconds, then the pieces turn into identical tokens and move blindfolded. ⚠️ This is a board visualization trainer, not a reproduction of a scientific paradigm: positions come from an offline sample of real puzzles (Lichess, public domain), and the time difference is the cost of one added rule in this game on this position, nothing beyond that.',
  },
  benefitChessBlind1: { ru: 'Координаты доски без пересчёта по клеткам', en: 'Board coordinates without counting squares' },
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
  goHome: { ru: 'На главную', en: 'Go Home' },
  shareResult: { ru: 'Поделиться', en: 'Share' },
  shareCopied: { ru: 'Результат скопирован ✓', en: 'Result copied ✓' },
  configureGame: { ru: 'Настройка игры', en: 'Configure Game' },
  errors: { ru: 'Ошибки', en: 'Errors' },
  seconds: { ru: 'сек', en: 'sec' },

  // Categories
  // 4 categories (v1.2.0 Lumosity-style)
  areaBalanceTitle: { ru: 'Баланс тренировок', en: 'Training balance' },
  areaBalanceHint: { ru: 'Доля ваших тренировок по областям. Это не оценка способностей — мы не меряем их и не обещаем: это то, что вы на самом деле качаете, а что обходите стороной.', en: 'How your training is split across areas. Not a rating of ability — we do not measure that and do not claim to: this is what you actually train and what you skip.' },
  areaBalanceWeak: { ru: 'Реже всего вы тренируете: {area}', en: 'You train this the least: {area}' },
  areaBalanceEmpty: { ru: 'Сыграйте несколько партий — и здесь появится картина.', en: 'Play a few rounds and the picture will appear here.' },
  areaTrendUp: { ru: 'результат вырос на {n}%', en: 'score up {n}%' },
  areaTrendDown: { ru: 'результат снизился на {n}%', en: 'score down {n}%' },
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
  // Справка описывала ЦЕЛЬ, но не механику: сколько кружков брать, как снять
  // ошибочный выбор, надо ли что-то нажимать в конце и что за счётчик сверху —
  // ничего этого не было. Репорт Вали с этого экрана: «слишком сложно».
  // Игра нормальная, непонятны были правила. Числа сверены с levelParams.
  numberBondsIntroDesc: {
    ru: 'Сверху — целевое число. Нажимайте кружки, чтобы набрать из них ровно эту сумму: на первых уровнях хватает двух-трёх, дальше слагаемых больше. Нажали лишний — тапните по нему ещё раз, он снимется; «Сбросить» очищает всё. Набрали — жмите «Проверить». На каждую задачу есть время, счётчик идёт сверху: не уложились или ошиблись с суммой — это ошибка, на уровень их допускается две. Тренирует устный счёт и поиск комбинаций.',
    en: 'The target number is at the top. Tap chips to make exactly that sum: two or three are enough at first, more later on. Tapped a wrong one — tap it again to remove it; “Reset” clears everything. Once the sum is right, press “Check”. Each puzzle is timed — the counter runs at the top: running out or getting the sum wrong counts as an error, and two are allowed per level. Trains mental arithmetic and combination search.'
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
    ru: 'Внизу — карточка. Сверху — 4 эталона. Сортируйте по СКРЫТОМУ правилу: цвет, форма или количество. Правило узнаётся только по обратной связи ✓/✗. Правило незаметно меняется после серии верных подряд — текущий порог виден в счётчике 🔥 наверху (сколько подряд из скольких нужно). ⚠️ Первый выбор после смены угадать нельзя — ошибка здесь это НОРМА: именно так ты и находишь новое правило. Классический Wisconsin Card Sort.',
    en: 'Bottom: a card. Top: 4 reference cards. Sort by a HIDDEN rule: colour, shape, or count. The rule is learned only from ✓/✗ feedback. After a run of correct answers the rule silently changes. ⚠️ The first pick after a change can\'t be guessed — an error here is NORMAL: that\'s exactly how you find the new rule. The classic Wisconsin Card Sort.'
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

  /**
   * НАБОРЫ (`src/constants/gameSuites.ts`) — несколько парадигм под одной
   * карточкой, режим выбирается плашками внутри. Подписи режимов называют НЕ
   * игру, а спор: человек выбирает не «фланкер», а «что мешает — бока».
   */
  suiteStroop:        { ru: 'Струп',                     en: 'Stroop' },
  suiteStroopDesc:    { ru: 'Цвет спорит со смыслом: чернила против слова и против эмоции', en: 'Colour argues with meaning: ink vs word, ink vs emotion' },
  suiteArrows:        { ru: 'Стрелки',                   en: 'Arrows' },
  suiteArrowsDesc:    { ru: 'Одна стрелка и две кнопки: мешают бока, позиция, число вариантов или подсказка', en: 'One arrow, two buttons: flankers, position, number of choices or a cue' },
  suiteStream:        { ru: 'Долгий поток',              en: 'Long stream' },
  suitePositions:     { ru: 'Позиции',                   en: 'Positions' },

  /** Сортировка жидкостей — игра в хабе «Башни», заведена 05.09.2026. */
  /**
   * ⚠️ КОРОТКОЕ ИМЯ. «Пробирки: переливание» не помещалось в шапку партии: её
   * правый край занят мини-питомцем и кнопкой правил, и на 403 px заголовок
   * обрезался на «Пробирки: переливан». Подробность ушла в описание.
   */
  waterSort:            { ru: 'Пробирки',                en: 'Test Tubes' },
  waterSortDesc:        { ru: 'Слей цвета так, чтобы в каждой пробирке остался один', en: 'Pour the colours until each tube holds just one' },
  waterSortIntroDesc:   { ru: 'Нажми пробирку, чтобы поднять верхний столбик, и вторую — чтобы вылить. Лить можно только на свой цвет или в пустую пробирку, и только пока есть место. Уровень взят, когда каждая пробирка пуста или полна одним цветом. Заранее считай, куда денется цвет, который сейчас мешает: свободных пробирок всего две.', en: 'Tap a tube to lift its top run, tap another to pour. You may only pour onto the same colour or into an empty tube, and only while there is room. The level is done when every tube is empty or full of one colour. Think ahead about where the colour in your way will go: there are only two free tubes.' },
  waterSortLvlParams:   { ru: '{c} цветов · по {h} порций · {e} свободные пробирки', en: '{c} colours · {h} portions each · {e} free tubes' },
  waterSortStuck:       { ru: 'Ходов больше нет — отмени или начни уровень заново', en: 'No moves left — undo or restart the level' },
  waterSortHint:        { ru: "Нажми пробирку, потом вторую — верхний столбик перельётся", en: "Tap one tube, then another — the top run pours across" },
  waterSortEmptyTube:   { ru: "Пустая пробирка", en: "Empty tube" },
  waterSortBenefitPlan: { ru: 'Считать наперёд: ход, освобождающий пробирку сейчас, может закрыть выход потом', en: 'Planning ahead: a move that frees a tube now can block the way out later' },
  waterSortBenefitHold: { ru: 'Держать в уме, какие цвета где спрятаны под верхним слоем', en: 'Holding in mind which colours are hidden under the top layer' },
  waterSortBenefitPatience: { ru: 'Терпение: тупик здесь дешевле предотвратить, чем разобрать', en: 'Patience: a dead end is cheaper to avoid than to unpick' },
  suitePositionsDesc: { ru: 'Запомнить, ГДЕ загорелось: узор целиком, цепочка блоков, цепочка наоборот', en: 'Remember WHERE it lit: a whole pattern, a chain of blocks, a chain in reverse' },
  /**
   * ⚠️ «Матрица» — четвёртый заход, три предыдущих отбила проба
   * suite-labels-dont-shadow-settings, и каждый раз по делу:
   *   «Сетка»  — лежит внутри своей же настройки «Размер сетки»
   *   «Клетки» — внутри подсказок партии «Запомните клетки!»
   *   «Узор»   — внутри СОБСТВЕННОГО переключателя игры «Static (pattern)»
   * Последнее и есть случай Струпа: у матрицы памяти уже есть свой выбор режима
   * (узор разом / по одной клетке), и плашка набора не смеет его повторять.
   */
  suiteModeGrid:      { ru: 'Матрица',                   en: 'Matrix' },
  suiteModeCorsi:     { ru: 'Блоки Корси',               en: 'Corsi blocks' },
  suiteModeBackward:  { ru: 'Наоборот',                  en: 'Backward' },
  suiteStreamDesc:    { ru: 'Поток проб без пауз: держать редкую цель и держать правило, которое меняется', en: 'A stream with no breaks: hold a rare target, hold a rule that keeps changing' },
  suiteModeEmotion:   { ru: 'Эмоциональный',             en: 'Emotional' },
  suiteModeFlanker:   { ru: 'Бока',                      en: 'Flankers' },
  suiteModeSimon:     { ru: 'Позиция',                   en: 'Position' },
  suiteModeChoice:    { ru: 'Выбор',                     en: 'Choice' },
  suiteModeAnt:       { ru: 'Подсказка',                 en: 'Cue' },
  suiteModeVigilance: { ru: 'Редкая цель',               en: 'Rare target' },
  suiteModeSwitch:    { ru: 'Смена правил',              en: 'Rule switch' },
  /**
   * ⚠️ БЕЗ ЧИСЛА РЕЖИМОВ. Стояло «Все три» — с тех пор парадигм стало десять, и
   * подпись полгода врала на экране. Счёт в тексте устаревает молча при каждом
   * добавлении и каждом переезде в соседний хаб; формулировка без числа — нет.
   */
  attentionConflictFootnote:{
    ru: 'Все парадигмы хаба тренируют одну способность — interference resolution. Биомаркер (interference effect = RT_inc − RT_con) сохраняется отдельно для каждой парадигмы.',
    en: 'Every paradigm here trains one ability — interference resolution. Biomarker (interference effect = RT_inc − RT_con) saved separately per paradigm.'
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

  /**
   * СТРОКА «ЧТО ДЕЛАТЬ» ВО ВРЕМЯ ПАРТИИ (аудит 19.08.2026, п. 37).
   *
   * Правило игры жило только в справке «?», а в справку посреди раунда никто не
   * ходит — там счёт идёт на секунды. В 47 играх такая строка была, в этих —
   * нет, и человек догадывался о правиле по последствиям.
   *
   * `hint_center_arrow` НАМЕРЕННО ОБЩИЙ для ANT и «Фланкера»: правило про
   * центральную стрелку у них дословно одно. Отдельные antHint/flankerHint были
   * бы ровно тем дублем, который схлопывали 19.08 (см. dictionary-duplicates).
   */
  hint_center_arrow: { ru: 'Отвечай по ЦЕНТРАЛЬНОЙ стрелке — боковые сбивают', en: 'Answer by the CENTRE arrow — the side ones mislead' },
  choiceRtHint:     { ru: 'Появилась стрелка — жми кнопку той же стороны',      en: 'When an arrow appears, press the button on the same side' },
  counterHint:      { ru: 'Тапай числа, пока не наберётся нужная сумма',        en: 'Tap numbers until they add up to the target' },
  picturePairsHint: { ru: 'Открывай по две карточки и запоминай, где что',      en: 'Flip two cards at a time and remember what is where' },
  schulteHint:      { ru: 'Тапай числа по порядку — какое искать, написано сверху', en: 'Tap the numbers in order — the one to find is shown above' },
  sdmtHint:         { ru: 'Смотри на ключ сверху: под каждым знаком своя цифра', en: 'Use the key above: every symbol has its own digit' },
  vocabSrsHint:     { ru: 'Выбери перевод показанного слова',                   en: 'Pick the translation of the word above' },

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
  phonemicScriptFallback: { ru: 'Задание идёт на латинице: беглость «на букву» в вашей письменности ставится иначе. Называйте слова латиницей.', en: 'The task runs in the Latin alphabet: letter-based fluency works differently in your script. Type words in Latin letters.' },
  phonemicIntroDesc: {
    ru: 'COWAT (Controlled Oral Word Association Test) — классический тест беглости речи. За 60 сек называй максимум слов, начинающихся с заданной буквы. Запрещены имена собственные и повторы. Биомаркеры: word_count, mean_inter_word_sec (время между словами — выше = труднее доступ к лексикону), first_half vs second_half (выносливость). Прямая мера лексической доступности под временным давлением — критично для публичных выступлений и переговоров.',
    en: 'COWAT (Controlled Oral Word Association Test) — classic verbal fluency test. In 60s name max words starting with a given letter. No proper names, no repetitions. Biomarkers: word_count, mean_inter_word_sec (time between words — higher = harder lexical access), first_half vs second_half (endurance). Direct measure of lexical access under time pressure — critical for public speaking and negotiations.'
  },
  phonemicAutoPick:{ ru: 'Случайная буква', en: 'Random letter' },
  phonemicRules:   { ru: 'Правила: только нарицательные, длина ≥ 2, без повторов',
                    en: 'Rules: common nouns only, length ≥ 2, no repetitions' },
  voiceSilent:     { ru: 'Запись получилась немой — микрофон не отдал звук. Проверьте разрешение для приложения и запишите ещё раз, иначе мы услышим тишину.', en: 'The recording came out silent — the microphone gave no sound. Check the app’s permission and record again, otherwise we will just hear silence.' },
  voicePlay:       { ru: 'Прослушать запись', en: 'Play the recording' },
  voiceCheckHint:  { ru: 'Послушайте себя перед отправкой: бывает, что микрофон пишет шум вместо голоса.', en: 'Listen to yourself before sending: sometimes the microphone records noise instead of your voice.' },
  // Живой уровень во время записи: до v1.209 тишина и речь выглядели одинаково —
  // бегущие секунды и красный кружок. 13 голосовых из 16 с одного устройства уехали
  // немыми, и человек узнавал об этом никогда.
  voiceLevelLabel:   { ru: 'Уровень микрофона', en: 'Microphone level' },
  voiceLevelHearing: { ru: 'Слышим вас', en: 'We can hear you' },
  voiceLevelSilence: { ru: 'Тишина — микрофон не отдаёт звук', en: 'Silence — the microphone is giving no sound' },
  voiceCeilingReached: { ru: 'Запись остановилась сама — дошла до потолка длины. Отправьте как есть или запишите ещё одну.', en: 'The recording stopped on its own — it hit the length limit. Send it as is or record another one.' },
  // Развилка вместо молчаливой отправки немой записи. Запрета нет: могли говорить
  // шёпотом или в шумном месте — порог отличает тишину от звука, но не голос от шума.
  voiceStaleWebView: { ru: "Похоже, на этом устройстве устарел системный WebView (Chrome {v}) — из-за этого запись выходит немой, хотя доступ к микрофону выдан. Обновите приложение «Android System WebView» в Google Play и запишите ещё раз.", en: "This device seems to run an outdated system WebView (Chrome {v}) — recordings come out silent even though microphone access is granted. Update the “Android System WebView” app in Google Play and record again." },
  voiceSilentTitle:  { ru: 'Мы вас не слышим', en: 'We cannot hear you' },
  voiceSendAnyway:   { ru: 'Всё равно отправить', en: 'Send anyway' },
  feedbackShortTitle: { ru: "Это всё?", en: "Is that all?" },
  feedbackShortBody: { ru: "Похоже, диктовка не дописала — в сообщении одно-два слова. Допишите или отправьте как есть.", en: "It looks like dictation stopped early — the message is one or two words. Add to it, or send as is." },
  feedbackShortEdit: { ru: "Дописать", en: "Add more" },
  voiceWriteInstead: { ru: 'Напишу текстом', en: 'I’ll type it instead' },
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
  rmet:            { ru: 'Прочти эмоцию',   en: 'Read the emotion' },
  rmetDesc:        { ru: 'Угадай, что человек чувствует', en: 'Guess what the person feels' },
  rmetIntroDesc: {
    ru: 'Упражнение ПО МОТИВАМ парадигмы распознавания эмоций по глазам (Baron-Cohen, 2001) — это не сам тест. Там фотографии глаз и 36 пунктов; здесь свой материал и 18. Значит нормы оригинала сюда НЕ переносятся, и сравнивать себя с ними нельзя. Показываем выражение и короткий контекст, ты выбираешь одну эмоцию из четырёх. Мерка — точность. Полезно там, где надо считывать состояние собеседника: переговоры, публичная речь.',
    en: 'An exercise INSPIRED BY the eyes-based emotion recognition paradigm (Baron-Cohen, 2001) — it is not that test. The original uses photographs of eyes and 36 items; this one uses its own material and 18. So the original norms do NOT carry over here and you should not compare yourself against them. You see an expression and a short context, and pick one emotion out of four. The measure is accuracy. Useful wherever you must read another person’s state: negotiation, public speaking.',
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
  label_all_48_games: { ru: 'Все {n} тренажёров', en: 'All {n} exercises' },
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
  /**
   * 🔴 БЫЛО 48. Стало 47, потому что одна игра парадигмой НЕ была: упражнение на
   * распознавание эмоций числилось как тест Reading the Mind in the Eyes
   * (Baron-Cohen, 2001), хотя в оригинале фотографии глаз и 36 пунктов, а у нас
   * свой материал и 18. Нормы оригинала к нему неприменимы, значит и в счёт
   * валидированных он не входит. Переименовано и переписано во всех 12 языках.
   * ⚠️ Оставшиеся 47 УНАСЛЕДОВАНЫ и поштучно не проверены — это отдельная
   * задача про 24 неописанные игры. Цифра должна быть правдой, а не круглой.
   */
  label_validated_paradigms: { ru: '47 валидированных парадигм', en: '47 validated paradigms' },
  hint_profile_tap_telegram: { ru: 'Клик по профилю → детали + запрос кода в Telegram', en: 'Tap a profile → details + request a code on Telegram' },
  hint_profile_tap_unlock: { ru: 'Клик по профилю → детали и разблокировка кодом', en: 'Tap a profile → details and unlock with a code' },
  btn_hint: { ru: 'Подсказка', en: 'Hint' },
  btn_undo: { ru: 'Отменить', en: 'Undo' },
  label_on: { ru: 'Вкл', en: 'On' },
  label_off: { ru: 'Выкл', en: 'Off' },
  sudokuLineHighlight:    { ru: 'Подсветка строки и столбца', en: 'Row and column highlight' },
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
  label_mode_static: { ru: '🔲 Static (паттерн)', en: '🔲 Static (pattern)' },
  label_mode_sequential: { ru: '➡️ Sequential (порядок)', en: '➡️ Sequential (order)' },
  label_reference: { ru: 'эталон', en: 'reference' },
  label_mnemonics: { ru: 'Мнемоника', en: 'Mnemonics' },
  desc_mnemonics_short: { ru: 'Запоминание слов или чисел в порядке', en: 'Memorize words or numbers in order' },
  desc_mnemonics_rules: { ru: 'Запомните порядок, затем отмечайте элементы сверху вниз, слева направо. Штраф: 15 сек.', en: 'Memorize the order, then select items top-to-bottom, left-to-right. Penalty: 15 sec.' },
  label_words: { ru: 'Слова', en: 'Words' },
  label_count: { ru: 'Количество', en: 'Count' },
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
  streakCalendarTitle: { ru: 'Календарь серии', en: 'Streak calendar' },
  streakCurrent: { ru: 'Текущая серия', en: 'Current streak' },
  streakTrainingDays: { ru: 'Дней тренировок', en: 'Training days' },
  streakBestCaption: { ru: 'Это твоя самая длинная серия за всё время', en: 'This is your longest streak of all time' },
  streakEmpty: { ru: 'Заверши Зарядку — и первый огонёк появится в календаре.', en: 'Finish a Warm-up and your first flame will appear on the calendar.' },
  streakPreviousMonth: { ru: 'Предыдущий месяц', en: 'Previous month' },
  streakNextMonth: { ru: 'Следующий месяц', en: 'Next month' },
  streakTrainingDay: { ru: 'Тренировка завершена', en: 'Training completed' },
  streakNoTraining: { ru: 'Без тренировки', en: 'No training' },
  resumeGameTitle: { ru: 'Продолжить: {game}', en: 'Continue: {game}' },
  petSynapse: { ru: 'Питомец Синапс', en: 'Synapse pet' },
  petSize: { ru: 'Размер питомца', en: 'Pet size' },
  gamePaused: { ru: '⏸ Пауза — пишете отзыв', en: '⏸ Paused — writing feedback' },
  // --- выход из живой партии: вопрос вместо молчаливой потери доски, v1.205 ---
  exitConfirmTitle: { ru: 'Выйти из игры?', en: 'Leave the game?' },
  exitConfirmSaved: { ru: 'Партия сохранится — вернётесь и продолжите с этого места.', en: 'Your game will be saved — come back and pick up where you left off.' },
  exitConfirmLost: { ru: 'Партия не сохранится: доска и прогресс пропадут.', en: 'This game will not be saved: the board and your progress will be lost.' },
  exitConfirmStay: { ru: 'Продолжить игру', en: 'Keep playing' },
  exitConfirmLeave: { ru: 'Выйти', en: 'Leave' },
  // --- a11y: подписи для скринридеров (VoiceOver/TalkBack), v1.161 ---
  a11yBack:        { ru: 'Назад', en: 'Back' },
  a11yHelp:        { ru: 'Правила игры', en: 'Game rules' },
  a11yNewTable:    { ru: 'Новая таблица', en: 'New table' },
  a11yErase:       { ru: 'Стереть', en: 'Erase' },
  a11yLeft:        { ru: 'Влево', en: 'Left' },
  a11yRight:       { ru: 'Вправо', en: 'Right' },
  a11yUp:          { ru: 'Вверх', en: 'Up' },
  a11yDown:        { ru: 'Вниз', en: 'Down' },
  a11yDigitStyle:  { ru: 'Стиль цифр', en: 'Digit style' },
  a11yShelf:       { ru: 'Полка', en: 'Shelf' },
  /**
   * Препятствия для скринридера. Замок, цепь и лёд нарисованы поверх ниши —
   * зрячий видит их сразу, незрячему до 31.08.2026 не сообщалось НИЧЕГО:
   * подпись говорила только «Полка 6: пусто», и человек пытался туда положить.
   */
  a11yShelfBlocked: { ru: 'заперта', en: 'locked' },
  a11yShelfOpensIn: { ru: 'откроется через', en: 'opens in' },
  a11yShelfFrozen:  { ru: 'примёрзла', en: 'frozen' },
  a11yPeg:         { ru: 'Стержень', en: 'Peg' },
  a11yBalls:       { ru: 'шариков', en: 'balls' },
  a11yEmpty:       { ru: 'пусто', en: 'empty' },
  a11ySelected:    { ru: 'выбрано', en: 'selected' },
  a11yFound:       { ru: 'найдено', en: 'found' },
  a11yCell:        { ru: 'Ячейка', en: 'Cell' },
  // Состояния клетки в играх семейства «сетка со вспышкой» (матрица, N-back,
  // Корси, размах): без них скринридер называл только координаты, и незрячему
  // было неизвестно, горит клетка или уже отвечена.
  a11yLit:         { ru: 'горит', en: 'lit' },
  a11yCorrect:     { ru: 'верно', en: 'correct' },
  a11yMissed:      { ru: 'пропущена', en: 'missed' },
  a11yRow:         { ru: 'Строка', en: 'Row' },
  a11yCol:         { ru: 'Колонка', en: 'Column' },
  a11yRefresh:     { ru: 'Обновить', en: 'Refresh' },
  a11yCatAll:      { ru: 'Все разделы', en: 'All sections' },
  a11yCatAccent:   { ru: 'Акцентные темы', en: 'Accent themes' },
  a11yCatSound:    { ru: 'Звуковые паки', en: 'Sound packs' },
  a11yCatFrame:    { ru: 'Рамки', en: 'Frames' },
  a11yCatTitle:    { ru: 'Титулы', en: 'Titles' },
  a11yCatAvatar:   { ru: 'Аватары', en: 'Avatars' },
  a11yCatPet:      { ru: 'Для питомца', en: 'For the pet' },
  a11yEyesPhoto:   { ru: 'Фотография глаз', en: 'Photo of eyes' },
  statPassedOfPlayed:    { ru: 'Пройдено / сыграно', en: 'Passed / played' },
  statFastest:           { ru: 'Самая быстрая', en: 'Fastest' },
  statSlowest:           { ru: 'Самая долгая', en: 'Slowest' },
  statScoreBars:         { ru: 'Столбик = очки за попытку, последние {n}', en: 'Each bar = score for one attempt, last {n}' },
  statOlder:             { ru: 'раньше', en: 'older' },
  statNewer:             { ru: 'свежее', en: 'newer' },
  // Вкладки экрана статистики: итоги против движения. Итог одинаков вчера и сегодня,
  // повод вернуться даёт вторая вкладка — «неделю назад ряд был 5, сегодня 7».
  statsTabSummary:       { ru: 'Сводка', en: 'Summary' },
  statsTabHistory:       { ru: 'История', en: 'History' },
  historyYesterday:      { ru: 'Вчера', en: 'Yesterday' },
  // {n} — насколько именно изменился результат; единицы подставляет экран (очки/секунды).
  historyBetter:         { ru: 'лучше на {n}', en: '{n} better' },
  historyWorse:          { ru: 'хуже на {n}', en: '{n} worse' },
  historySame:           { ru: 'как в прошлый раз', en: 'same as last time' },
  // Первая партия упражнения: сравнивать не с чем, и это честнее любого «рост».
  historyFirstRun:       { ru: 'первый раз', en: 'first time' },
  // Упражнение знакомо, но сложность новая (уровень 2 Шульте — сетка 6×6, а не 5×5).
  // Сказать «хуже» тому, кто ТОЛЬКО ЧТО взял следующий уровень, — прямая ложь.
  historyNewTask:        { ru: 'новая сложность', en: 'new difficulty' },
  historyLevelShort:     { ru: 'ур. {n}', en: 'lv {n}' },
  historyTailHint:       { ru: 'Показаны последние {n} дней с тренировками', en: 'Showing your last {n} days with training' },
  // Пустая история у нового человека — обычное дело, а не поломка. Никаких выдуманных
  // «примерных» результатов: показать чужой прогресс под видом своего нельзя.
  historyEmptyTitle:     { ru: 'История начнётся с первой партии', en: 'Your history starts with the first round' },
  historyEmptyHint:      { ru: 'Здесь будет видно, что вы играли по дням и как менялся результат — лучше или хуже прошлого раза.', en: 'Here you will see what you played day by day and how each result moved — better or worse than last time.' },
  historyEmptyCta:       { ru: 'Выбрать упражнение', en: 'Pick an exercise' },
  historyScopedTitle:    { ru: 'В этом профиле партий пока нет', en: 'Nothing in this profile yet' },
  historyScopedHint:     { ru: 'Сыгранное есть, но за другими упражнениями или другим профилем. Откройте все игры.', en: 'You do have rounds, but under other exercises or another profile. Open all games.' },
  // --- «Рекомендуем сегодня»: три упражнения с причиной, почему именно они (recommend.ts) ---
  recoTitle:        { ru: 'Рекомендуем сегодня', en: 'Recommended today' },
  recoHint:         { ru: 'Три упражнения на сегодня — набор не меняется до завтра', en: 'Three exercises for today — the set stays until tomorrow' },
  recoDoneToday:    { ru: 'Сегодня сыграно', en: 'Played today' },
  recoWhyComeback:  { ru: 'Давно не играли', en: 'Not played in a while' },
  recoWhyGrowth:    { ru: 'Здесь вы растёте', en: 'You are growing here' },
  recoWhyWeakspot: { ru: 'здесь пока слабее всего', en: 'your weakest spot right now' },
  sourcesTitle:     { ru: 'Источники', en: 'Sources' },
  sourcesIntro:     { ru: 'Данные и графика, взятые из открытых источников, — и условия, на которых они используются.', en: 'Data and artwork taken from open sources, and the terms they are used under.' },
  sourceHsk30:      { ru: 'Пиньинь, тоны и уровни для китайских слов. Первоисточник — список Министерства образования КНР.', en: 'Pinyin, tones and levels for Chinese words. Original source: the PRC Ministry of Education word list.' },
  sourceWiktionaryVoice: { ru: 'Живые записи произношения слов: 632 записи на русском, немецком и английском. Читают носители языка — участники Викисловаря и проекта Lingua Libre.', en: 'Real human pronunciation recordings: 632 samples in Russian, German and English, read by native speakers from Wiktionary and the Lingua Libre project.' },
  voiceCreditsTitle: { ru: 'Кто читает слова', en: 'Who reads the words' },
  sourceCburnett:   { ru: 'Векторные шахматные фигуры на доске в упражнении «Доска в уме».', en: 'Vector chess pieces on the board in the “Blind board” exercise.' },
  acTypeInhibition:       { ru: 'Удержать руку', en: 'Hold the hand' },
  acTypeTargets:          { ru: 'Мишень или нет', en: 'Target or not' },
  hubPickExercise:        { ru: 'Выбери упражнение', en: 'Pick an exercise' },
  flexibilityGroup:       { ru: 'Гибкость', en: 'Flexibility' },
  flexibilityGroupDesc:   { ru: 'Не залипать на одном признаке', en: 'Do not get stuck on one feature' },
  flexibilityGroupFootnote: { ru: 'Во всех трёх переключаться приходится самому: сигнала «правило сменилось» здесь никто не подаёт.', en: 'In all three you must switch on your own: nobody signals that the rule has changed.' },
  flexibilityGroupIntroDesc: { ru: 'Три пробы, где переключаться надо САМОМУ. В «Закономерностях» ряд объясняется гипотезой, и в какой-то момент она перестаёт работать — надо бросить её, а не подпирать. В «Тройке признаков» карточки различаются по четырём свойствам, и на каждом ходу ищешь по другому. В «Символ-цифре» держишь ключ и раз за разом переходишь между его строками.\n\nЭто не то же самое, что «Переключение задач» и Висконсинский тест: там смену правила задают извне — сигналом или молчанием. Здесь никто ничего не подаёт, и залипание на удобном признаке видно по времени, а не по ошибке.', en: 'Three paradigms where the switching is on you. In Patterns a hypothesis explains the row until it stops working — you must drop it rather than prop it up. In Set the cards differ along four features and each move asks a different one. In Symbol-Digit you hold a key and keep moving between its rows.\n\nThis is not the same as the Switching Task or the Wisconsin test: there the rule change comes from outside, by cue or by silence. Here nobody signals anything, and getting stuck on a convenient feature shows up in your time rather than in an error.' },
  routesGroup:            { ru: 'Маршруты', en: 'Routes' },
  routesGroupDesc:        { ru: 'Проложить путь, который обязан покрыть всё', en: 'Draw a path that must cover everything' },
  routesGroupFootnote:    { ru: 'Обе пробы про одно: почти каждый ход законен сам по себе и заводит в тупик. Выигрывает не тот, кто быстрее тянет линию, а тот, кто просчитал покрытие заранее.', en: 'Both are about the same thing: almost every move is legal on its own and leads to a dead end. It is not the fastest line that wins, but the one who worked out the coverage first.' },
  routesGroupIntroDesc:   { ru: 'Две головоломки на покрытие. В «Точках» пары соединяются линиями, которые не пересекаются и вместе занимают всю сетку. В «Одной линии» надо обойти все рёбра фигуры, ни по одному не пройдя дважды.\n\nМеряется в обеих не аккуратность руки, а расчёт наперёд. Почти любой ход выглядит допустимым в момент, когда его делаешь, и запирает решение через три хода — увидеть это можно только до того, как повёл линию. Тем же занята развилка «Башни», только там переносят предметы, а здесь ведут путь.', en: 'Two coverage puzzles. In Dots you join pairs with lines that never cross and together fill the grid. In One Line you must walk every edge of a figure without repeating one.\n\nNeither measures a steady hand — both measure looking ahead. Almost any move looks legal at the moment you make it and locks the solution three moves later; you can only see that before the line is drawn. The Towers hub does the same job, only there you move objects and here you draw a path.' },
  goalDonePick:           { ru: 'Названные товары убраны — цель взята, остальное можно было оставить', en: 'The named goods are gone — goal met; the rest could stay' },
  goalDoneFree:           { ru: 'Ниша освобождена — цель взята, полки убирать было не нужно', en: 'The niche is free — goal met; the shelves did not need clearing' },
  goalDoneMoves:          { ru: 'Уложились в лимит ходов', en: 'Within the move limit' },
  acTypeChoice:           { ru: 'Выбор из нескольких', en: 'Choice among several' },
  acTypePosner:           { ru: 'Подсказка верная и ложная', en: 'Valid and invalid cue' },
  acTypeAnt:              { ru: 'Три сети внимания разом', en: 'Three attention networks at once' },
  acTypeCpt:              { ru: 'Долгий поток · жать не на всё', en: 'A long stream · do not press on everything' },
  acTypeSwitch:           { ru: 'Правило меняется по сигналу', en: 'The rule changes on a cue' },
  acTypeWcst:             { ru: 'Правило меняется молча', en: 'The rule changes silently' },
  spanTypeListening:      { ru: 'Слова на слух · порядок', en: 'Words by ear · order' },
  spanTypeReading:        { ru: 'Чтение + удержание', en: 'Reading + holding' },
  spanTypeNBack:          { ru: 'Ряд без конца · N шагов назад', en: 'Endless stream · N steps back' },
  spanTypeOperation:      { ru: 'Счёт + удержание', en: 'Arithmetic + holding' },
  chessGroup:             { ru: 'Шахматы', en: 'Chess' },
  chessGroupDesc:         { ru: 'Доска, поля и фигуры: держать позицию в голове и узнавать узор', en: 'Board, squares and pieces: hold the position in your head and recognise the pattern' },
  chessGroupIntroDesc:    { ru: 'Два шахматных упражнения, и тренируют они РАЗНОЕ — поэтому их два, а не одно с переключателем.\n\n«Доска в уме» убирает позицию из виду: цвет полей, маршрут коня, память о расстановке и партия вслепую. Меряется, сколько вы удержали без доски перед глазами.\n\n«Детский мат» оставляет позицию на виду и засекает секундомер. Узор один и тот же — ферзь и слон на f7, — он ЗАУЧЕН, и вопрос не «сможете ли», а «за сколько увидите». Время на позицию сокращается с уровнем с 20 секунд до 4, а с 31-го уровня приходит мат с жертвой в два-три хода.\n\nПозиции взяты из двух источников: свой генератор классических дебютных ловушек и база задач Lichess (CC0) — настоящие детские маты из сыгранных партий, отобранные по рейтингу.', en: 'Two chess exercises, and they train DIFFERENT things — which is why there are two of them rather than one with a toggle.\n\nBoard in Mind takes the position out of sight: square colours, knight routes, position recall and a blindfold game. What is measured is how much you held without a board in front of you.\n\nScholar’s Mate leaves the position in plain sight and starts a stopwatch. The pattern is always the same — queen and bishop on f7 — you already KNOW it, and the question is not whether you can but how fast you see it. Time per position shrinks from 20 seconds to 4, and from level 31 on comes mate with a SACRIFICE in two or three moves.\n\nPositions come from two sources: an in-house generator of classic opening traps and the Lichess puzzle database (CC0) — real scholar’s mates from played games, picked by rating.' },
  chessGroupFootnote:     { ru: 'Доска одна, а навыка два. «Доска в уме» убирает позицию из виду и меряет, что вы удержали. «Детский мат» оставляет её на виду и меряет, за сколько секунд вы увидели знакомый узор.', en: 'One board, two skills. Board in Mind takes the position out of sight and measures what you held. Scholar’s Mate leaves it in plain sight and measures how many seconds it takes you to spot a familiar pattern.' },
  towersGroup:            { ru: 'Башни', en: 'Towers' },
  inhibitionGroup: { ru: "Торможение", en: "Response inhibition" },
  inhibitionGroupDesc: { ru: "Удержать руку, когда она уже пошла", en: "Hold your hand back once it has already started" },
  inhibitionGroupFootnote: { ru: "Здесь нет спора двух признаков — есть готовое движение, которое надо отменить. «Торможение» держит две пробы режимами: не жать на запретное и остановить уже начатое.", en: "There is no clash of two cues here — there is a movement already under way that must be cancelled. Inhibition holds two paradigms as modes: withholding a response, and stopping one already started." },
  towersGroupDesc:        { ru: 'Переложить по правилам, продумав ходы вперёд', en: 'Restack by the rules, planning moves ahead' },
  towersGroupFootnote:    { ru: 'Обе пробы меряют одно: сколько ходов вы удерживаете в голове, прежде чем взяться за первый.', en: 'Both measure the same thing: how many moves you hold in your head before making the first one.' },
  inhibitionGroupIntroDesc: { ru: "Две пробы на одно и то же умение — отменить движение, которое уже пошло. В «Торможении» два режима: не жать на запретный знак и остановить нажатие, когда сигнал «стоп» приходит УЖЕ ПОСЛЕ старта. В пробе Познера подсказка направляет взгляд, и иногда направляет неверно — цена в том, что внимание надо снять с неправильного места и перевести.\n\nЭто не то же, что «Конфликт внимания». Там спорят два признака сразу, и выигрывает тот, кто сузил внимание. Здесь спора нет: есть готовое действие и необходимость его отменить, а помогает обратное — не торопиться с ответом. Поэтому пробы и разведены по разным развилкам.", en: "Two paradigms for one skill: cancelling a movement already under way. Inhibition has two modes — withholding a press on the forbidden sign, and stopping a press when the “stop” signal arrives AFTER you have started. In the Posner task a cue directs your gaze, and sometimes directs it wrongly — the cost is having to pull attention off the wrong place and move it.\n\nThis is not the same as Attention Conflict. There, two cues clash at once and narrowing attention wins. Here there is no clash: an action is already launched and must be cancelled, and the opposite helps — not rushing the answer. That is why the two live in separate hubs." },
  towersGroupIntroDesc:   { ru: 'Две классические пробы на планирование. В ханойской башне диски переносят между стержнями, и больший нельзя класть на меньший. В башне Лондона шарики переставляют между колышками разной высоты, чтобы получить заданную картинку за отведённое число ходов.\n\nМеряется в обеих одно: сколько ходов человек удерживает в голове ДО первого движения. Тот, кто хватается за первый попавшийся ход, упирается в тупик и теряет ходы на возврат; тот, кто просчитал цепочку, идёт напрямую. Это и есть планирование в чистом виде — без языка, без памяти на факты, без скорости.', en: 'Two classic planning paradigms. In the Tower of Hanoi you move disks between pegs, and a larger one may never sit on a smaller. In the Tower of London you rearrange balls across pegs of different heights to match a target picture within a move limit.\n\nBoth measure the same thing: how many moves you hold in your head BEFORE the first one. Grab the nearest move and you hit a dead end and spend moves undoing it; work out the chain and you go straight there. That is planning in its pure form — no language, no memory for facts, no speed.' },
  languagesGroup:         { ru: 'Языки', en: 'Languages' },
  languagesGroupDesc:     { ru: 'Память на слово и память на его звучание', en: 'Memory for a word and memory for how it sounds' },
  languagesGroupFootnote: { ru: 'Две стороны чужого языка тренируются по-разному: словарь — глазами, произношение — ухом. Поэтому здесь два входа, а не общий список.', en: 'The two sides of a foreign language train differently: vocabulary by eye, pronunciation by ear. Hence two doors rather than one flat list.' },
  languagesGroupIntroDesc: { ru: 'Чужой язык держится на двух разных памятях. Первая — на слово: узнать его, вспомнить без подсказки, достать из головы за секунду. Вторая — на звучание: услышать разницу между близкими звуками, удержать её и повторить.\n\nОни не заменяют друг друга. Можно знать тысячу слов и не разобрать беглую речь; можно ставить произношение и не иметь чем говорить. Поэтому здесь два входа: «Слова» и «Слух».', en: 'A foreign language rests on two different memories. One is for the word: recognising it, recalling it unaided, pulling it out in a second. The other is for sound: hearing the difference between close phonemes, holding it, reproducing it.\n\nNeither replaces the other. You can know a thousand words and not follow fluent speech; you can polish pronunciation and have nothing to say. Hence two doors: Words and Hearing.' },
  visualMemoryGroup: { ru: 'Зрительная память', en: 'Visual Memory' },
  visualMemoryGroupDesc: { ru: 'Запомнить увиденное и воспроизвести', en: 'Hold what you saw and put it back' },
  visualMemoryGroupFootnote: { ru: 'Порядок по весу: матрица и пары — короткие заходы, «Доска в уме» заметно тяжелее и требует держать расстановку целиком.', en: 'Ordered by weight: matrix and pairs are short runs; the blind board is markedly heavier and asks you to hold a whole position.' },
  visualMemoryGroupIntroDesc: {
    ru: 'Три пробы на одно: увидеть, удержать и вернуть увиденное. Матрица памяти показывает вспышку клеток и просит повторить рисунок; парные картинки требуют помнить, что где лежало; «Доска в уме» держит целую шахматную позицию, которая скрылась под одинаковыми фишками.\n\nЗрительная память короткая и ёмкая: картинку можно «сфотографировать» целиком, но она тает за секунды, если её не проговорить или не связать со смыслом. Отсюда порядок внутри развилки — от коротких заходов к тяжёлому.',
    en: 'Three takes on one thing: see it, hold it, put it back. Memory matrix flashes cells and asks for the pattern; picture pairs require remembering what lay where; the blind board holds a whole chess position that vanished under identical tokens.\n\nVisual memory is short and capacious: a picture can be "photographed" whole, yet it melts within seconds unless named or tied to meaning. Hence the order inside the hub — from short runs to the heavy one.',
  },
  mnemonicsGroup: { ru: 'Мнемотехники', en: 'Mnemonics' },
  mnemonicsGroupDesc: { ru: 'Привязать новое к тому, что уже помнишь', en: 'Tie the new to what you already know' },
  mnemonicsGroupFootnote: { ru: 'Все четыре про один приём: новое запоминается не само по себе, а сцепкой с уже известным — местом, лицом, словом, образом.', en: 'All four rest on one trick: the new is remembered not on its own but hooked to the known — a place, a face, a word, an image.' },
  mnemonicsGroupIntroDesc: {
    ru: 'Четыре техники одного приёма: новое цепляется к уже известному. «Мнемотехники» учат превращать список в образы; «Дворец памяти» раскладывает их по знакомому маршруту; «Лица и имена» привязывают имя к черте лица; «Пары слов» связывают два слова так, чтобы одно вытягивало другое.\n\nПамять плохо держит одиночное и хорошо — связанное. Поэтому запоминают не усилием, а сцепкой: место, лицо, слово, образ. Все четыре тренируют именно её.',
    en: 'Four techniques of one trick: the new gets hooked to the known. Mnemonics turn a list into images; the Memory Palace lays them along a familiar route; Faces and Names ties a name to a feature; Word Pairs link two words so one pulls the other.\n\nMemory holds isolated things badly and connected things well. So you remember not by effort but by hook: a place, a face, a word, an image. All four train exactly that.',
  },
  countingGroup: { ru: 'Счёт', en: 'Counting' },
  countingGroupDesc: { ru: 'Числа в уме: пересчёт, прикидка, скорость', en: 'Numbers in the head: counting, estimating, speed' },
  countingGroupFootnote: { ru: 'Четыре подхода к одному навыку: удержать число, прикинуть, посчитать быстро, разложить на слагаемые.', en: 'Four takes on one skill: hold a number, estimate, count fast, split into parts.' },
  wordsGroup: { ru: 'Слова', en: 'Words' },
  wordsGroupDesc: { ru: 'Словарь и извлечение слова из памяти', en: 'Vocabulary and pulling a word out of memory' },
  wordsGroupFootnote: { ru: 'От узнавания слова до извлечения его из памяти без подсказки — по нарастанию усилия.', en: 'From recognising a word to pulling it out unaided — in order of effort.' },
  hearingGroup: { ru: 'Слух', en: 'Hearing' },
  hearingGroupDesc: { ru: 'Задание звучит: различить, повторить, назвать тон', en: 'The task is heard: tell apart, repeat, name the tone' },
  hearingGroupFootnote: { ru: 'Всем троим нужен голос в системе: без него упражнение честно говорит об этом и не притворяется.', en: 'All three need a system voice: without one the exercise says so instead of pretending.' },
  searchGroup: { ru: 'Поиск глазами', en: 'Visual Search' },
  searchGroupDesc: { ru: 'Найти нужное среди похожего', en: 'Find the one among the many' },
  searchGroupFootnote: { ru: 'Корректурная проба здесь не случайно: вычёркивать знаки в тексте — тот же поиск, только по буквам.', en: 'The proofreading test belongs here: crossing out letters is the same search, done on text.' },
  riskGroup: { ru: 'Решения под риском', en: 'Decisions Under Risk' },
  riskGroupDesc: { ru: 'Выбор, когда исход неизвестен', en: 'Choosing when the outcome is unknown' },
  riskGroupFootnote: { ru: 'Три классические пробы: рискнуть ещё раз, распознать невыгодную колоду, заметить смену правила.', en: 'Three classic paradigms: push your luck, spot the bad deck, notice the rule change.' },
  trackerStepwise:        { ru: 'Двигать шагами по кнопке', en: 'Move step by step, by button' },
  // Вид шаров в трекере объектов (05.09.2026). Названия короткие: под ними стоит
  // сама картинка шара, и подпись здесь — опора для голосового доступа, а не
  // объяснение. Фактуру выбирают глазами.
  ballStyleTitle: { ru: 'Вид шаров', en: 'Ball look' },
  // «Детский мат» — этюды на скорость (просьба Дениса 05.09.2026).
  scholarsMate:        { ru: 'Детский мат', en: 'Scholar’s mate' },
  scholarsMateDesc:    { ru: 'Заученный узор на скорость: меряется не «сможешь ли», а за сколько увидишь. Начинается с детского мата, дальше приходят соседние — ферзь при коне, мат слоном, удушающий, мат дурака. Время на позицию падает с 20 секунд до 4.', en: 'A memorised pattern against the clock: what is measured is not whether you can, but how fast you see it. It starts with the scholar’s mate, then neighbouring ones arrive — queen with a knight, bishop mate, smothered mate, fool’s mate. Time per position drops from 20 seconds to 4.' },
  scholarsMateIntroDesc: { ru: "Один и тот же узор: ферзь и слон бьют на f7 — у чёрных на f2. Тапни фигуру, потом клетку; ход один, время на него идёт полосой сверху. Дальше по лестнице времени меньше, а позиции приходят из настоящих партий; под конец — маты с жертвой: сначала отдаёшь фигуру, потом ставишь мат. Звёзды идут за СКОРОСТЬ, а не за число решённых: узор вы и так знаете.", en: "One and the same pattern: queen and bishop strike f7 — f2 for Black. Tap a piece, then a square; one move, and the bar on top is your time. Higher up the ladder there is less time and the positions come from real games; at the end come mates with a sacrifice: give up a piece first, then mate. Stars are for SPEED, not for how many you solved — you know the pattern already." },
  scholarsMateAsk:     { ru: 'Поставь мат в один ход', en: 'Mate in one' },
  scholarsDefendAsk:   { ru: 'Грозит мат — защитись', en: 'Mate is threatened — defend' },
  scholarsThreatAsk:   { ru: 'Грозит ли мат следующим ходом?', en: 'Is mate threatened next move?' },
  scholarsSacrificeAsk:{ ru: 'Мат с жертвой — начни', en: 'Mate with a sacrifice — begin' },
  scholarsMotifQueenKnight: { ru: 'Ферзь при коне', en: 'Queen with a knight' },
  scholarsMotifBishopF7:  { ru: 'Матует слон', en: 'Bishop mates' },
  scholarsMotifQueenAlone: { ru: 'Ферзь без поддержки', en: 'Queen unsupported' },
  scholarsMotifFool:      { ru: 'Мат дурака', en: 'Fool’s mate' },
  scholarsMotifKnight:    { ru: 'Мат конём в дебюте', en: 'Knight mate in the opening' },
  scholarsMotifSmothered: { ru: 'Удушающий мат', en: 'Smothered mate' },
  scholarsNewMotif:       { ru: 'Новый узор', en: 'New pattern' },
  scholarsMotif_backRankMate: { ru: 'Мат по последней горизонтали', en: 'Back-rank mate' },
  scholarsMotif_pillsburysMate: { ru: 'Мат Пильсбери', en: 'Pillsbury’s mate' },
  scholarsMotif_operaMate: { ru: 'Оперный мат', en: 'Opera mate' },
  scholarsMotif_epauletteMate: { ru: 'Эполетный мат', en: 'Epaulette mate' },
  scholarsMotif_cornerMate: { ru: 'Угловой мат', en: 'Corner mate' },
  scholarsMotif_hookMate: { ru: 'Мат крюком', en: 'Hook mate' },
  scholarsMotif_swallowstailMate: { ru: 'Ласточкин хвост', en: 'Swallow’s tail mate' },
  scholarsMotif_arabianMate: { ru: 'Арабский мат', en: 'Arabian mate' },
  scholarsMotif_anastasiaMate: { ru: 'Мат Анастасии', en: 'Anastasia’s mate' },
  scholarsMotif_morphysMate: { ru: 'Мат Морфи', en: 'Morphy’s mate' },
  scholarsMotif_bodenMate: { ru: 'Мат Бодена', en: 'Boden’s mate' },
  scholarsMotif_doubleBishopMate: { ru: 'Мат двух слонов', en: 'Double bishop mate' },
  scholarsMotif_dovetailMate: { ru: 'Голубиный хвост', en: 'Dovetail mate' },
  scholarsMotif_killBoxMate: { ru: 'Мат «коробка»', en: 'Kill box mate' },
  scholarsMotif_vukovicMate: { ru: 'Мат Вуковича', en: 'Vukovic mate' },
  scholarsMotif_balestraMate: { ru: 'Балестра', en: 'Balestra mate' },
  scholarsMotif_triangleMate: { ru: 'Треугольный мат', en: 'Triangle mate' },
  scholarsMotif_blindSwineMate: { ru: 'Мат «слепые свиньи»', en: 'Blind swine mate' },
  scholarsPickMotif:      { ru: 'Отработать один узор', en: 'Drill a single pattern' },
  scholarsPickMotifHint:  { ru: 'Выбери мат — и он пойдёт подряд, без лестницы и без примеси других', en: 'Pick a mate and it comes one after another, with no ladder and nothing else mixed in' },
  scholarsSacrificeMode:  { ru: 'Мат с жертвой', en: 'Mate with a sacrifice' },
  scholarsSacrificeModeHint: { ru: 'Отдать фигуру, вскрыть поле и доиграть до мата — в два-три хода', en: 'Give up a piece, open the square and play it out to mate — in two or three moves' },
  scholarsFlow:           { ru: 'Поток · 10 мин', en: 'Flow · 10 min' },
  scholarsFlowHint:       { ru: 'Без перерывов и уровней: позиции идут подряд, пока не кончится время', en: 'No breaks, no levels: positions keep coming until time runs out' },
  scholarsBank:        { ru: 'Позиций в наборе: {n}', en: 'Positions in the set: {n}' },
  scholarsMedian:      { ru: 'Медиана', en: 'Median' },
  scholarsUsually:     { ru: 'за {n} подходов', en: 'over {n} runs' },
  scholarsBest:        { ru: 'Верно было', en: 'Correct was' },
  // Да/нет для вопроса «грозит ли мат»: общих ключей в словаре нет.
  // ⚠️ `с` и `Время вышло` НЕ заводим — они уже есть как secShort и timeIsUp;
  // гейт дублей это ловит, и правильно: два ключа с одним текстом расходятся
  // при переводе, и в одном месте останется старая формулировка.
  scholarsYes:         { ru: 'Да', en: 'Yes' },
  scholarsNo:          { ru: 'Нет', en: 'No' },
  ballGlossy:     { ru: 'Глянцевые',      en: 'Glossy' },
  ballGlass:      { ru: 'Стеклянные',     en: 'Glass' },
  ballFluffy:     { ru: 'Пушистые',       en: 'Fluffy' },
  ballMatte:      { ru: 'Матовые',        en: 'Matte' },
  ballChrome:     { ru: 'Хромовые',       en: 'Chrome' },
  ballJelly:      { ru: 'Желейные',       en: 'Jelly' },
  ballNeon:       { ru: 'Неоновые',       en: 'Neon' },
  ballStone:      { ru: 'Каменные',       en: 'Stone' },
  ballBubble:     { ru: 'Мыльный пузырь', en: 'Soap bubble' },
  trackerStepwiseOffered: { ru: 'В системе включено «уменьшить движение». Здесь движение — само упражнение, поэтому оно идёт как обычно; пошаговый режим можно включить галочкой выше.', en: 'Your system has “reduce motion” on. Here motion is the exercise itself, so it runs as usual; the step-by-step mode is the checkbox above.' },
  srsTyping:              { ru: 'Печатать', en: 'Type it' },
  srsTypingHint:          { ru: 'Опечатка не пускает дальше — исправьте её', en: 'A typo blocks the way — fix it to go on' },
  srsTypingTask:          { ru: 'Напечатайте перевод целиком', en: 'Type the translation in full' },
  srsTypingNeedsKeyboard: { ru: 'Режим «Печатать» доступен там, где есть настоящая клавиатура: он тренирует извлечение из памяти вместе с набором вслепую, а на экранной клавиатуре это было бы другое упражнение.', en: '“Type it” needs a real keyboard: it trains recall together with touch typing, and on an on-screen keyboard that would be a different exercise.' },
  dictation:          { ru: 'Диктант', en: 'Dictation' },
  dictationDesc:      { ru: 'Фраза звучит — вы печатаете её целиком', en: 'A phrase is read out — you type it in full' },
  dictationConfigDesc:{ ru: 'Фраза звучит, но на экране её нет. Печатайте по памяти на слух: опечатка не пускает дальше, прослушать можно сколько угодно раз.', en: 'The phrase is spoken but not shown. Type it by ear: a typo blocks the way, and you may replay as often as you like.' },
  dictationTask:      { ru: 'Наберите то, что услышали', en: 'Type what you heard' },
  dictationHint:      { ru: 'Ненабранное скрыто точками — это диктант, а не списывание', en: 'Untyped characters stay dotted — this is dictation, not copying' },
  dictationNeedsKeyboard: { ru: 'Нужна настоящая клавиатура: упражнение сводит скорость слуха и набора, а на экранной клавиатуре это другая задача.', en: 'A real keyboard is required: the exercise matches listening speed to typing speed, and on an on-screen keyboard that is a different task.' },
  chineseTones:      { ru: 'Тоны китайского', en: 'Chinese Tones' },
  chineseTonesShort: { ru: 'Тоны', en: 'Tones' },
  chineseTonesDesc:  { ru: 'Слышите слог — определяете тон', en: 'Hear a syllable, name its tone' },
  ctConfigDesc:      { ru: 'В китайском тон — это смысл: mā «мама», mà «ругать». Звучит слог — вы отвечаете, какой в нём тон. Дальше — слог целиком.', en: 'In Chinese the tone is the meaning: mā “mother”, mà “to scold”. A syllable is played — you name its tone. Later, the whole syllable.' },
  ctPickTone:        { ru: 'Какой тон прозвучал?', en: 'Which tone did you hear?' },
  ctPickPinyin:      { ru: 'Какой слог прозвучал?', en: 'Which syllable did you hear?' },
  ctTone:            { ru: 'тон', en: 'tone' },
  recoWhyBranch:    { ru: 'Этой ветке достаётся меньше всего', en: 'This branch gets the least practice' },
  recoWhyFresh:     { ru: 'Новое в приложении', en: 'New in the app' },
  recoWhyCalm:      { ru: 'Под вечер — без гонки', en: 'For the evening — no rush' },
  recoWhyStart:     { ru: 'С чего начать', en: 'A good place to start' },
  brLongExhaleWhy:     { ru: 'Так и задумано: выдох длиннее вдоха — именно это замедляет пульс', en: 'By design: the exhale is longer than the inhale — that is what slows your pulse' },
  brSwitchToBox:       { ru: 'Хочу поровну — квадрат 4-4-4-4', en: 'Prefer even — box 4-4-4-4' },
  wcstRuleShifted: { ru: '↻ Правило только что сменилось — эту ошибку угадать было нельзя, так и находят новое', en: '↻ The rule just changed — this error was unavoidable, that is how you find the new one' },
  petTrainingsDone:    { ru: 'Тренировок: {n}', en: 'Trainings: {n}' },
  petUntilNextStage:   { ru: 'до стадии «{stage}» ещё {n}', en: '{n} more to reach “{stage}”' },
  petUntilNextLevel:   { ru: 'до нового уровня ещё {n}', en: '{n} more to the next level' },
  // ⚠️ Публичный тон (Денис 28.08): в текстах для игрока — «отзывы», не «репорты».
  fixedByYourReport:     { ru: 'Починили по твоим отзывам', en: 'Fixed from your reports' },
  // Благодарность стоит ПЕРВОЙ строкой блока. Раньше она была последней — и на
  // телефоне уезжала за край экрана: человек видел свою цитату и сухое «сделали
  // то-то», а «спасибо» не видел вообще (скрин от Вали, v1.170).
  thanksForReports:      { ru: 'Благодарим за твои сообщения — вот что мы по ним сделали', en: 'Thank you for your messages — here is what we did about them' },
  andMoreFixed: { ru: '…и ещё {n} по твоим прошлым отзывам', en: '…and {n} more from your earlier reports' },
  voiceRecord:     { ru: '🎤 Записать голосом', en: '🎤 Record a voice note' },
  voiceStop:       { ru: 'Стоп', en: 'Stop' },
  voiceAttached:   { ru: 'Запись прикреплена', en: 'Voice note attached' },
  voiceDenied:     { ru: 'Микрофон недоступен — напиши текстом, это тоже работает', en: 'No microphone access — just type it, that works too' },
  skipGameNamed:     { ru: 'Пропустить:', en: 'Skip:' },
  skipStep:          { ru: 'Пропустить игру', en: 'Skip this game' },
  stopComplex:       { ru: 'Остановить', en: 'Stop the set' },
  skippedNamed:      { ru: 'Пропущено', en: 'Skipped' },
  setTimeUpTitle: { ru: '⏱ Время вышло — сет тут был', en: '⏱ Time is up — there was a SET' },
  setTimeUpBody: { ru: 'Подсвечен один из сетов, которые были на столе. Сет есть на КАЖДОЙ доске — игра не раздаёт поля без решения', en: 'One of the SETs that was on the table is highlighted. Every board has at least one — the game never deals an unsolvable table' },
  bridgeJustPlayed: { ru: '✓ Сыграно', en: '✓ Played' },
  petAdviceTitle: { ru: 'Совет Синапса', en: 'Synapse suggests' },
  petAdviceBody: { ru: 'Слабее всего — {skill}. Поиграй в «{game}», чтобы подтянуть эту шкалу', en: 'Your weakest is {skill}. Play “{game}” to pull that bar up' },
  a11yCard:        { ru: 'Карточка', en: 'Card' },
  a11yWrong:       { ru: 'Неверно', en: 'Wrong' },
  a11yPet:         { ru: 'Питомец Синапс', en: 'Synapse the pet' },
  a11yMenu:        { ru: 'Меню', en: 'Menu' },
  shape_circle:    { ru: 'круг', en: 'circle' },
  shape_square:    { ru: 'квадрат', en: 'square' },
  shape_triangle:  { ru: 'треугольник', en: 'triangle' },
  shape_star:      { ru: 'звезда', en: 'star' },
  shape_cross:     { ru: 'крест', en: 'cross' },
  fill_solid:      { ru: 'сплошная', en: 'solid' },
  fill_striped:    { ru: 'штриховка', en: 'striped' },
  fill_open:       { ru: 'контур', en: 'outline' },
  color_purple:    { ru: 'Фиолетовый', en: 'Purple' },

  brDimHint: { ru: '💡 Перед сном убавьте яркость экрана — так проще заснуть', en: '💡 Before sleep, dim your screen — it helps you fall asleep' },
  warmupStepOf: { ru: 'Игра {n} из {m}', en: 'Game {n} of {m}' },
  warmupNextGame: { ru: 'Следующая игра', en: 'Next game' },
  warmupFinish: { ru: 'Завершить комплекс', en: 'Finish the set' },
  setGotIt: { ru: 'Понятно', en: 'Got it' },
  setHintBtn: { ru: 'Подсказка', en: 'Hint' },
  // SET: разбор примера «что такое SET». Длинный методический текст, который до
  // 19.08.2026 существовал только на двух языках прямо в разметке экрана.
  setExampleTitle: { ru: 'Пример: что такое SET', en: 'Example: what is a SET' },
  setExampleValid: { ru: '✓ SET: форма и заливка одинаковые у всех, цвет и число — у всех разные', en: '✓ SET: shape and fill are the same on all, color and count all differ' },
  setExampleInvalid: { ru: '✗ Не SET: цвет совпал только у двух (два красных и фиолетовый)', en: '✗ Not a SET: color matches on only two cards (two red, one purple)' },
  setExampleNote: { ru: 'Каждый из 4 признаков (форма, цвет, заливка, число) должен быть либо одинаковым у всех трёх карт, либо разным у всех трёх.', en: 'Each of the 4 features (shape, color, fill, count) must be either the same on all three cards or different on all three.' },
  setTipsTitle: { ru: 'Как искать SET', en: 'How to hunt for a SET' },
  setTip1: { ru: 'Возьми любые две карты — они всегда начало сета. Пойми, какая третья их завершает (одинаковые признаки → такой же, разные → третий вариант), и поищи её на поле.', en: 'Pick any two cards — they always start a SET. Work out which third card completes them (same features → the same, different → the third option) and look for it.' },
  setTip2: { ru: 'Если какой-то признак совпал ровно у двух карт из трёх — это точно не SET.', en: 'If any feature matches on exactly two of the three cards — it is never a SET.' },
  setTip3: { ru: 'Начни с редкого: мало квадратов или полосок на поле — проверь тройки с ними первыми.', en: 'Start with what is rare: few squares or striped cards on the board — test triples with them first.' },
  whatsNewTitle: { ru: 'Что нового', en: 'What’s new' },
  versionHistory: { ru: 'Что нового · история версий', en: 'What’s new · version history' },
  updCheckBtn: { ru: 'Проверить обновления', en: 'Check for updates' },
  updLatest: { ru: 'У тебя последняя версия', en: 'You are on the latest version' },
  updAvailable: { ru: 'Доступно обновление', en: 'Update available' },
  updAvailableBody: { ru: 'Вышла новая версия — скачать сейчас?', en: 'A new version is out — download now?' },
  updDownload: { ru: 'Скачать', en: 'Download' },
  updLater: { ru: 'Позже', en: 'Later' },
  updCheckFailed: { ru: 'Не удалось проверить (нет сети?)', en: 'Check failed (offline?)' },
  petFeed: { ru: 'Угостить', en: 'Feed' },
  petFedToday: { ru: 'Сыт и доволен', en: 'Fed and happy' },
  petRename: { ru: 'Переименовать питомца', en: 'Rename pet' },
  petSkinAuto: { ru: 'Авто', en: 'Auto' },
  shopPetSection: { ru: '🐾 Для питомца — аксессуары Синапса (надеваются глобально)', en: '🐾 For the pet — Synapse accessories (equipped globally)' },
  cosName_pet_bow: { ru: 'Бантик', en: 'Bow' },
  // Отдельный предмет на шею — бантик остался заколкой на голове.
  cosName_pet_bow_tie: { ru: 'Бабочка', en: 'Bow tie' },
  cosName_pet_party_hat: { ru: 'Праздничный колпак', en: 'Party hat' },
  cosName_pet_glasses: { ru: 'Умные очки', en: 'Smart glasses' },
  cosDesc_pet_generic: { ru: 'Аксессуар гуляющего питомца — виден на всех экранах', en: 'Accessory for the walking pet — visible on every screen' },
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
  colorblindWhere: { ru: 'Действует там, где цвет несёт смысл: судоку, SET, Струп, Висконсинский тест, Башня Лондона', en: 'Applies where colour carries meaning: Sudoku, SET, Stroop, Wisconsin test, Tower of London' },
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
  // Ряд скинов стоял вообще без подписи: четыре карточки с чужими именами
  // («Нейро-кот», «Нейрон», «Робот») и никакой связи с самим питомцем.
  // Репорт Вали: «не могу понять, кто такой Синапс — в списке он называется
  // по-другому». Заголовок называет ряд тем, что он есть: это ВНЕШНОСТЬ, а не
  // другие существа. {name} — имя питомца, его можно переименовать.
  petSkinSectionTitle: { ru: 'Как выглядит {name}', en: 'How {name} looks' },
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

  // ── Расходуемые способности (src/services/abilities.ts). Штучный товар за те же
  //    очки, что и косметика: не подсказка, а возврат партии/серии. ──────────
  shopAbilitySection: { ru: '⚡ Способности — расходуются штуками. Они не решают задачу за тебя: возвращают партию и серию.', en: '⚡ Abilities — consumable, one at a time. They never solve the task for you: they give a round or a streak back.' },
  shopAbilityHint: { ru: 'Способность стоит дороже, чем может принести партия, — купить её ради заработка нельзя.', en: 'Every ability costs more than a round can ever pay out — you can never buy one to earn.' },
  a11yCatAbility: { ru: 'Способности', en: 'Abilities' },
  abName_second_life: { ru: 'Вторая жизнь', en: 'Second life' },
  abDesc_second_life: { ru: '«Мишени»: партия не обрывается на последней жизни. Одна на партию, и уровень за такую партию не растёт.', en: 'Targets: the round does not end on your last life. One per round, and that round will not raise your level.' },
  abName_practice_run: { ru: 'Пробный заход', en: 'Practice run' },
  abDesc_practice_run: { ru: 'Замерные игры: партия не записывается никуда — ни очков, ни уровня, ни статистики. Пробуй без последствий.', en: 'Measured games: the round is recorded nowhere — no tokens, no level, no stats. Experiment without consequences.' },
  abName_streak_shield: { ru: 'Щит серии', en: 'Streak shield' },
  abDesc_streak_shield: { ru: 'Вернуть серию дней, оборванную пропуском. Работает только в тот день, когда серия оборвалась.', en: 'Bring back a day streak broken by one missed day. Works only on the day the streak broke.' },
  abilityInWallet: { ru: 'в кошельке: {n}', en: 'in your wallet: {n}' },
  abilityFull: { ru: 'Полный запас', en: 'Wallet full' },
  abilityUse: { ru: 'Применить', en: 'Use' },
  // Экран достижений: заголовок и подпись жили строками прямо в экране и знали
  // два языка из двенадцати. Данные (имена и описания достижений) всё ещё на
  // двух — это отдельный долг, он под учётом в ci-i18n-hardcode-guard.
  // Одно слово на три места: заголовок экрана, подпись в настройках и метка
  // для скринридера. Раньше жило под именем `a11yAchievements` — имя врало,
  // потому что строка была видимой в двух местах из трёх.
  achievementsTitle: { ru: 'Достижения', en: 'Achievements' },
  achievementsFooter: { ru: 'Достижения проверяются после каждой игры. {n} осталось.', en: 'Achievements are checked after each game. {n} left.' },
  abilitySpentNote: { ru: 'Списано {n} ⭐', en: '{n} ⭐ spent' },
  abilityStreakIntact: { ru: 'Серия цела — восстанавливать нечего. Щит остался в кошельке.', en: 'Your streak is intact — nothing to restore. The shield stays in your wallet.' },
  abilityStreakRestored: { ru: 'Серия восстановлена: {n} дней подряд', en: 'Streak restored: {n} days in a row' },
  abilityStreakStale: { ru: 'Щит чинит серию только в день обрыва — этот уже прошёл.', en: 'The shield only mends a streak on the day it broke — that day has passed.' },
  abilityNoneLeft: { ru: 'В кошельке ничего не осталось', en: 'Nothing left in your wallet' },
  abilityLifeOffer: { ru: 'Жизни кончились. Продолжить партию?', en: 'Out of lives. Continue the round?' },
  abilityLifeTake: { ru: 'Потратить одну', en: 'Spend one' },
  abilityLifeDecline: { ru: 'Закончить партию', en: 'End the round' },
  abilityLifeSpentNote: { ru: 'Вторая жизнь потрачена — уровень за эту партию не растёт', en: 'Second life spent — this round will not raise your level' },
  abilityPracticeOn: { ru: 'Включён: партия не в зачёт', en: 'On: this round will not count' },
  abilityPracticeNote: { ru: 'Ни очков, ни уровня, ни статистики', en: 'No tokens, no level, no stats' },
  abilityPracticeSpent: { ru: 'Пробный заход — партия никуда не записана', en: 'Practice run — this round was recorded nowhere' },

  // Onboarding
  onbQuizTitle: { ru: 'Подобрать под меня', en: 'Pick for me' },
  onbQuizMood: { ru: 'Чего хочется?', en: 'What are you in the mood for?' },
  onbQuizMood0: { ru: 'Расслабиться', en: 'Unwind' },
  onbQuizMood1: { ru: 'Прокачать мозг', en: 'Train my brain' },
  onbQuizMood2: { ru: 'Азарт и скорость', en: 'Thrill and speed' },
  onbQuizTime: { ru: 'Сколько времени есть?', en: 'How much time do you have?' },
  onbQuizTime0: { ru: 'Минут пять', en: 'About five minutes' },
  onbQuizTime1: { ru: 'Десять–пятнадцать', en: 'Ten to fifteen' },
  onbQuizTime2: { ru: 'Час и больше', en: 'An hour or more' },
  onbQuizTaste: { ru: 'Что ближе?', en: 'What feels closer?' },
  onbQuizTaste1: { ru: 'Числа и логика', en: 'Numbers and logic' },
  onbQuizTaste2: { ru: 'Картинки и память', en: 'Pictures and memory' },
  onbQuizYours: { ru: 'Твои игры', en: 'Your games' },
  onbQuizProfile: { ru: 'Похоже, твой профиль — {p}', en: 'Looks like your profile is {p}' },
  onbQuizOr: { ru: '…или выбери сам', en: '…or pick one yourself' },
  onbPickGameTitle: { ru: 'Выбери первую игру', en: 'Choose your first game' },
  onbPickGameBody: { ru: 'Не будем начинать с лекции. Выбери, что хочется попробовать прямо сейчас.', en: 'No lecture first. Pick what you want to try right now.' },
  onbPickGameHint: { ru: 'Память ∨ внимание ∨ логика — остальное всегда доступно на главной.', en: 'Memory ∨ attention ∨ logic — everything else stays available on Home.' },
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

  // Заработок за партию: множитель ×2 и блок «Сегодня» на главной (src/services/earn.ts)
  earnWhyClean: { ru: 'чисто — вдвое', en: 'clean run — double' },
  earnWhyStreak: { ru: 'серия дней — вдвое', en: 'day streak — double' },
  earnWhyRepeat: { ru: 'повтор сегодня — без удвоения', en: 'repeat today — no doubling' },
  earnWhyWarmup: { ru: 'шаг зарядки — бонус в конце комплекса', en: 'warm-up step — bonus at the end' },
  todayEarnedTitle: { ru: 'Заработано за сегодня', en: 'Earned so far today' },
  todayEmptyHint: { ru: 'Партий сегодня ещё не было. Сыграй — здесь появится, что и сколько принесло.', en: 'No rounds today yet. Play one — this is where you’ll see what it earned.' },
  todayRoundsLabel: { ru: 'партий: {n}', en: 'rounds: {n}' },
  chessAssistTitle: { ru: 'Подсказки', en: 'Assists' },
  chessAssistBoard: { ru: 'Показывать пустую доску во время вопросов', en: 'Show an empty board during questions' },
  chessAssistCoords: { ru: 'Подписи полей по краям (a–h, 1–8)', en: 'Coordinate labels along the edges (a–h, 1–8)' },
  chessAssistNote: { ru: 'С доской это уже не работа в уме: цвет и место поля видно глазами. Включайте, пока учитесь ориентироваться.', en: 'With the board this is no longer mental work: colour and position are visible. Use it while you are still learning the coordinates.' },
  todayMore: { ru: 'и ещё {n} — весь список в статистике', en: 'and {n} more — full list in statistics' },
  practicesTitle: { ru: 'Практики дня', en: 'Practices of the day' },
  todayStreakNote: { ru: 'Серия {n} дней подряд — за партию вдвое', en: '{n} days in a row — double per round' },

  // GameResult / ResultSparkline
  earnedLabel: { ru: 'заработано', en: 'earned' },
  trendOnAverage: { ru: 'как обычно', en: 'right on your average' },
  trendBetterPct: { ru: 'лучше среднего на {n}%', en: '{n}% better than your average' },
  trendWorsePct: { ru: 'хуже среднего на {n}%', en: '{n}% worse than your average' },

  // FeedbackWidget
  feedbackSendFailed: { ru: 'Не удалось отправить. Проверь интернет и попробуй ещё раз.', en: 'Failed to send. Check your connection and try again.' },
  feedbackFabLabel: { ru: 'Сообщить о проблеме', en: 'Send feedback' },
  feedbackTabWrite: { ru: 'Написать', en: 'Write' },
  feedbackTabDialog: { ru: 'Диалог', en: 'Dialog' },
  dialogEmpty: { ru: 'Здесь появится переписка: твои сообщения и наши ответы. Напиши первым!', en: 'Your messages and our replies will appear here. Write first!' },
  dialogFixedIn: { ru: 'Починено в {v}', en: 'Fixed in {v}' },
  dialogVoiceNote: { ru: 'Голосовое сообщение', en: 'Voice message' },
  feedbackTitle: { ru: '💬 Что не так?', en: '💬 What’s wrong?' },
  feedbackThanks: { ru: 'Спасибо! Отправлено.', en: 'Thanks! Sent.' },
  // Исход отправки словами: «спасибо» одинаково выглядело и когда запись дошла,
  // и когда потерялась, поэтому про голос говорим отдельной строкой.
  feedbackQueued: { ru: 'Сохранено. Уйдёт, как появится связь.', en: 'Saved. It will send once you’re online.' },
  feedbackAudioSent: { ru: 'запись получена', en: 'recording received' },
  feedbackAudioLost: { ru: 'Запись не загрузилась — дошёл только текст', en: 'The recording did not upload — only the text arrived' },
  unitLevelShort: { ru: 'ур.', en: 'lv' },   // строчная инлайн-форма (label_level_short «Ур.» — заголовочная)
  feedbackHint: { ru: 'Пиши как есть, даже коротко', en: 'Write it as is, even briefly' },
  feedbackPlaceholder: { ru: 'Например: открыл игру и не понял, что делать — нужна кнопка со справкой', en: 'E.g.: opened the game and had no idea what to do — need a help button' },
  feedbackAttachShot: { ru: '📷 Приложить скриншот этого экрана', en: '📷 Attach a screenshot of this screen' },
  send: { ru: 'Отправить', en: 'Send' },

  // LeaderboardModal / LevelProgressMap / BossRound
  leagueSeed:  { ru: 'Росток', en: 'Seed' },
  leagueSpark: { ru: 'Искра', en: 'Spark' },
  leagueFocus: { ru: 'Фокус', en: 'Focus' },
  leagueFlow:  { ru: 'Поток', en: 'Flow' },
  leagueEdge:  { ru: 'Грань', en: 'Edge' },
  sudokuBeltAls: { ru: 'Пояс ALS', en: 'ALS belt' },
  sudokuBeltChains: { ru: 'Пояс цепей', en: 'Chains belt' },
  sudokuBeltLegend: { ru: 'Доска-легенда', en: 'Legend board' },
  leaguePeak:  { ru: 'Вершина', en: 'Peak' },
  leagueSuper: { ru: 'Супер', en: 'Super' },
  leagueUltra: { ru: 'Ультра', en: 'Ultra' },
  leagueLegend: { ru: 'Легенда', en: 'Legend' },
  leagueLimit: { ru: 'Предел', en: 'Limit' },
  frameSprout:  { ru: 'Побег', en: 'Sprout' },
  frameSpark:   { ru: 'Искра', en: 'Spark' },
  frameCompass: { ru: 'Компас', en: 'Compass' },
  frameCurrent: { ru: 'Течение', en: 'Current' },
  frameBlade:   { ru: 'Лезвие', en: 'Blade' },
  frameSummit:  { ru: 'Вершина', en: 'Summit' },
  frameSurge: { ru: 'Заряд', en: 'Surge' },
  // Ставка «всё или ничего» (С3 экономики): недельный риск-контракт на жетоны
  wagerTitle: { ru: 'Всё или ничего', en: 'All or Nothing' },
  wagerDesc: { ru: 'Поставь {stake} ⭐ и заходи 7 дней подряд — заберёшь {prize} ⭐. Пропустишь день — ставка сгорит, и Щит серии её не спасёт.', en: 'Stake {stake} ⭐ and check in 7 days in a row to take {prize} ⭐. Miss a day and the stake burns — the Streak Shield won\'t save it.' },
  wagerPlace: { ru: 'Поставить {n} ⭐', en: 'Stake {n} ⭐' },
  wagerDay: { ru: 'День {d} из {t}', en: 'Day {d} of {t}' },
  wagerLostMsg: { ru: 'Ставка сгорела — день пропущен. Можно поставить снова.', en: 'The stake burned — a day was missed. You can stake again.' },
  wagerWonToast: { ru: 'Ставка сыграла! +{n} ⭐', en: 'The wager paid off! +{n} ⭐' },
  wagerLostToast: { ru: 'Ставка сгорела: −{n} ⭐', en: 'The wager burned: −{n} ⭐' },
  // Витрина тем (Т4+Т5): наборы цифр, темы карты, фоны, значки — кросс-профильно
  shopDigitsSection: { ru: 'Наборы цифр судоку', en: 'Sudoku digit sets' },
  shopThemeSection: { ru: 'Темы карты уровней', en: 'Level map themes' },
  shopBackgroundSection: { ru: 'Фоны главной', en: 'Home backgrounds' },
  shopBadgeSection: { ru: 'Значки профиля', en: 'Profile badges' },
  cosName_digits_rainbow: { ru: 'Радуга', en: 'Rainbow' },
  cosName_digits_pastel: { ru: 'Пастель', en: 'Pastel' },
  cosName_digits_neon: { ru: 'Техно-неон', en: 'Techno Neon' },
  cosName_digits_elegant: { ru: 'Элегант', en: 'Elegant' },
  cosName_profile_item: { ru: 'Стиль профиля', en: 'Profile style' },
  cosDesc_digits_generic: { ru: 'Рисованные цифры для судоку — выбор в настройках партии', en: 'Hand-drawn sudoku digits — pick them in match settings' },
  cosDesc_theme_generic: { ru: 'Подложка карты уровней в стиле другого профиля', en: 'Level map backdrop in another profile’s style' },
  cosDesc_background_generic: { ru: 'Фон главного экрана в стиле другого профиля', en: 'Home screen background in another profile’s style' },
  cosDesc_badge_generic: { ru: 'Значок другого профиля в твоём чипе на главной', en: 'Another profile’s badge on your home chip' },
  digitsLockedShop: { ru: 'Этот набор цифр продаётся в магазине', en: 'This digit set is sold in the shop' },
  voiceRecordingNative: { ru: 'Идёт запись микрофоном устройства (без индикатора уровня)', en: 'Recording with the device microphone (no level meter here)' },
  pencilMode: { ru: 'Карандаш: пометки-кандидаты', en: 'Pencil: candidate marks' },
  deepPortalHint: { ru: 'Портал: здесь стоит та же цифра, что в клетке {cell} соседней доски этого слоя', en: 'Portal: this cell holds the same digit as cell {cell} of a sibling board on this layer' },
  a11yCatDigits: { ru: 'Категория: наборы цифр', en: 'Category: digit sets' },
  a11yCatTheme: { ru: 'Категория: темы карты', en: 'Category: map themes' },
  a11yCatBackground: { ru: 'Категория: фоны', en: 'Category: backgrounds' },
  a11yCatBadge: { ru: 'Категория: значки', en: 'Category: badges' },
  frameAurora: { ru: 'Аврора', en: 'Aurora' },
  frameCrown: { ru: 'Корона', en: 'Crown' },
  frameInfinity: { ru: 'Бесконечность', en: 'Infinity' },
  leaguesTitle: { ru: 'Лиги', en: 'Leagues' },
  leaguesSeasonHint: { ru: 'Лига считается по очкам за последние 30 дней — это ваш текущий темп, а не весь путь. Пропустили неделю — лига опустится, и это нормально.', en: 'Your league comes from points earned over the last 30 days — your current pace, not your whole journey. Skip a week and it drops, and that is fine.' },
  leaguesCurrent: { ru: 'Сейчас вы здесь', en: 'You are here' },
  leaguesRank: { ru: 'Ранг {n} из {m}', en: 'Rank {n} of {m}' },
  leaguesToNext: { ru: 'До следующего ранга: {n}', en: 'To the next rank: {n}' },
  leaguesTop: { ru: 'Верхняя лига — выше некуда', en: 'Top league — nothing above' },
  leaguesLocked: { ru: 'Откроется на {n} очках за сезон', en: 'Opens at {n} points this season' },
  leaguesFrames: { ru: 'Заработанные рамки', en: 'Frames earned' },
  leaguesSeasonPoints: { ru: 'Очки за {d} дней', en: 'Points in {d} days' },
  leaguesEmpty: { ru: 'Сыграйте что-нибудь — и лига появится.', en: 'Play something and your league will appear.' },
  leaderboardTitle: { ru: '🏆 Топ игроков', en: '🏆 Leaderboard' },
  leaderboardEmpty: { ru: 'Пока пусто — стань первым!', en: 'Empty so far — be the first!' },
  // Показывается вместо пустой таблицы: чужих результатов не пришло (нет сети, домен
  // режется, таблица новой игры ещё пуста), но свой рекорд есть — и пустота вместо него
  // читалась бы как поломка приложения.
  leaderboardPersonalOnly: { ru: 'Чужих результатов пока нет. Твой рекорд:', en: 'No other results yet. Your record:' },
  // Друзья по коду приглашения (app/friends.tsx). Круг — это ВИД на уже
  // опубликованные очки: новых личных данных не заводится ни одного поля, и
  // тексты обязаны обещать ровно это, а не «друг тренировался сегодня».
  friendsTitle: { ru: 'Друзья', en: 'Friends' },
  friendsMyCode: { ru: 'Ваш код приглашения', en: 'Your invite code' },
  friendsMyCodeHint: { ru: 'Продиктуйте или покажите этот код. Кто введёт его у себя — окажется в вашем круге, а вы в его: связь всегда взаимна.', en: 'Read this code out or show it. Whoever enters it lands in your circle, and you land in theirs: the link always goes both ways.' },
  // Кода нет на экране — человек решит, что его не выдали. Говорим про связь.
  friendsCodeOffline: { ru: 'Код не пришёл — сервер не ответил. Он никуда не делся: загляните сюда, когда будет связь.', en: 'The code did not arrive — the server did not answer. It is not lost: look again when you have a connection.' },
  friendsAddTitle: { ru: 'Код друга', en: 'A friend\'s code' },
  friendsCodePlaceholder: { ru: 'Шесть знаков', en: 'Six characters' },
  friendsAddBtn: { ru: 'Добавить в круг', en: 'Add to circle' },
  friendsAdded: { ru: '{name} теперь в вашем круге — и вы в его.', en: '{name} is in your circle now — and you are in theirs.' },
  // 🔴 «Кода нет» и «нет связи» — РАЗНЫЕ беды: в первом случае ищут опечатку,
  // во втором ждать нечего. Один текст на оба заставил бы искать опечатку в
  // правильном коде.
  friendsNotFound: { ru: 'Такого кода нет. Проверьте знаки: их шесть, и похожих друг на друга 0, O, 1, I, L в коде не бывает.', en: 'No such code. Check the characters: there are six, and the look-alikes 0, O, 1, I and L never appear in a code.' },
  // ⚠️ Свой код и полный круг РАНЬШЕ говорили «такого кода нет» — сервер возвращал
  // пусто одинаково во всех случаях. Это была неправда в двух случаях из трёх.
  friendsSelfCode: { ru: 'Это ваш собственный код — им зовут вас. Дайте его тому, кого приглашаете, а сюда впишите код, который он назовёт вам.', en: 'That is your own code — it is how others invite you. Share it with the person you are inviting, and type the code they give you here.' },
  friendsCircleFull: { ru: 'В круге уже {n} человек — это предел. Уберите кого-то, чтобы добавить нового.', en: 'Your circle already holds {n} — that is the limit. Remove someone to make room.' },
  friendsAddOffline: { ru: 'Сервер не ответил — код мы даже не проверили. Это не «кода нет»: повторите, когда будет связь.', en: 'The server did not answer — the code was never even checked. This is not “no such code”: try again when you have a connection.' },
  friendsTableTitle: { ru: 'Круг в одной игре', en: 'Your circle in one game' },
  friendsViewOffline: { ru: 'Спросить сервер не вышло. Это не значит, что круг пуст — просто сейчас нет связи.', en: 'We could not ask the server. That does not mean the circle is empty — there is simply no connection now.' },
  friendsViewNoFriends: { ru: 'В круге пока никого. Дайте свой код тому, с кем хотите сравнивать результаты.', en: 'Nobody in your circle yet. Give your code to whoever you want to compare results with.' },
  friendsViewNobodyPlayed: { ru: 'В «{game}» из круга ещё никто не играл. Выберите другую игру или позовите их сыграть.', en: 'Nobody in your circle has played “{game}” yet. Pick another game, or invite them to play it.' },
  friendsMe: { ru: 'вы', en: 'you' },
  friendsScoresOnly: { ru: 'Здесь только очки зачётных партий — те, что вы сами отправили в таблицу рекордов. Дни тренировок и их история остаются на устройстве и на сервер не уходят.', en: 'Only scores from qualifying runs are shown here — the ones you sent to the record table yourself. Training days and their history stay on your device and never leave it.' },
  friendsCircle: { ru: 'Ваш круг · {n}', en: 'Your circle · {n}' },
  friendsRemove: { ru: 'Убрать из круга', en: 'Remove from circle' },
  // Разрыв взаимен — так устроен сервер. Не сказать об этом значит дать человеку
  // убрать себя из чужого круга, думая, что он правит только свой.
  friendsRemoveMutual: { ru: 'Разорвать связь с {name}? Связь взаимна: вы исчезнете и из его круга тоже.', en: 'Break the link with {name}? The link is mutual: you will disappear from their circle as well.' },
  friendsRemoveConfirm: { ru: 'Разорвать', en: 'Break the link' },
  friendsRemoveFailed: { ru: 'Разорвать не вышло — сервер не ответил. Связь осталась как была.', en: 'The link could not be broken — the server did not answer. It stayed as it was.' },
  bestAmongPlayers: { ru: 'Лучший среди игроков', en: 'Best among players' },
  levelOfMax: { ru: 'Уровень {n}/{max}', en: 'Level {n}/{max}' },
  // Для проверенных методик (Iowa, RMET, охват) уровень НИЧЕГО не усложняет — он
  // считает успешные прохождения. Называть это «уровнем» значило бы обещать рост
  // сложности, которого там нет и быть не должно: методики держатся на нормах.
  runsCompleted: { ru: 'Пройдено: {n}', en: 'Completed: {n}' },
  // Переигровка пройденного уровня с тропинки. Обещаем звёзды, а не «повторение»:
  // saveLevelStars хранит лучший результат, поэтому второй заход может только улучшить.
  tapNodeToReplay: { ru: 'Нажми на пройденный узел — переиграть и добрать звёзды', en: 'Tap a completed node to replay it and earn more stars' },
  replayingLevel: { ru: 'Переигрываешь уровень {n} · рекорд {best}', en: 'Replaying level {n} · best {best}' },
  bossTitle: { ru: 'БОСС', en: 'BOSS' },
  megaBossTitle: { ru: "Мега-босс: Самурай", en: "Mega-boss: Samurai" },
  megaBossOffer: { ru: "Пять сцепленных досок 9×9 — партия на час, с сохранением: можно уйти и вернуться. Уровень уже засчитан, отказ ничего не отнимает.", en: "Five interlocked 9×9 grids — an hour-long run with save & resume. Your level is already counted; declining costs nothing." },
  megaBossGo: { ru: "В бой", en: "Fight" },
  megaBossBadge: { ru: "Мега-босс", en: "Mega-boss" },
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
  remindMorningTitle: { ru: '💜 Синапс ждёт тебя', en: '💜 Synapse is waiting' },
  remindMorningBody: { ru: 'Доброе утро! Утренний комплекс готов — 5-10 минут, и я подрасту', en: 'Good morning! Your warm-up is ready — 5-10 min and I grow a little' },
  remindEveningTitle: { ru: '🌙 Синапс зевает', en: '🌙 Synapse is yawning' },
  remindEveningBody: { ru: 'Спокойный вечерний комплекс — завершим день вместе?', en: 'A calm evening session — shall we wind down the day together?' },

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
  cosName_frame_onyx: { ru: 'Оникс', en: 'Onyx' },
  cosDesc_frame_onyx: { ru: 'Глубокая чёрная рамка — статус без крика', en: 'A deep black frame — quiet status' },
  cosName_title_comet: { ru: 'Комета', en: 'Comet' },
  cosName_title_diamond: { ru: 'Бриллиант', en: 'Diamond' },
  cosName_title_infinity: { ru: 'Бесконечный', en: 'Infinite' },
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
  // Подпись кнопки в играх с лестницей уровней: в рекорд идёт только партия первого
  // уровня (единственная конфигурация, одинаковая у всех), и подпись обязана это
  // сказать — иначе человек сыграет десятый и не поймёт, почему его нет в таблице.
  leaderboardLevel1: { ru: 'Топ игроков (уровень 1)', en: 'Leaderboard (level 1)' },
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
  warmupBreakdownTitle: { ru: "Разбор по навыкам", en: "Skill breakdown" },
  warmupBreakdownUp: { ru: "Сегодня лучше обычного: {skill}, +{pct}%", en: "Better than usual today: {skill}, +{pct}%" },
  warmupBreakdownDown: { ru: "Просело против обычного: {skill}, −{pct}%", en: "Below your usual: {skill}, −{pct}%" },
  warmupBreakdownFlat: { ru: "Сегодня всё в привычных пределах", en: "Everything is within your usual range today" },
  warmupBreakdownAdvice: { ru: "Стоит вернуться к этому: {skill}", en: "Worth coming back to this: {skill}" },
  warmupBreakdownNoHistory: { ru: "Игр без истории: {n} — их пока не с чем сравнить", en: "Games with no history: {n} — nothing to compare them with yet" },
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
  sudokuColorMode: { ru: 'Цвет', en: 'Color' },
  sudokuColorHint: { ru: 'Коснись клетки; повторный тап снимает цвет.', en: 'Tap a cell; tap it again to remove the color.' },
  // Названия приёмов решения — подпись НАСТОЯЩЕЙ сложности сетки во фрактале.
  // Не объявленной уровнем, а измеренной решателем: с уровня 21 сетки берутся из
  // библиотеки заготовок, и «что задумано» с «что вышло» расходятся по построению.
  fracTechSingle: { ru: 'Голый одиночка', en: 'Naked single' },
  fracTechHidden: { ru: 'Скрытый одиночка', en: 'Hidden single' },
  fracTechLocked: { ru: 'Связанные кандидаты', en: 'Locked candidates' },
  fracTechPair: { ru: 'Голая пара', en: 'Naked pair' },
  fracTechHiddenPair: { ru: 'Скрытая пара', en: 'Hidden pair' },
  fracTechXwing: { ru: 'X-wing', en: 'X-wing' },
  sudokuPencilMode: { ru: 'Пометки', en: 'Notes' },
  sudokuPencilHint: { ru: 'Выбери клетку и жми цифры — они встанут в угол мелким. Повторный тап снимает пометку.', en: 'Pick a cell and tap digits — they go into the corner as small marks. Tap again to remove one.' },
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
  sudokuVariantThermocage: { ru: '🌡+ сумма', en: '🌡+ cage' },
  sudokuVariantTowers: { ru: '🏙 небоскрёбы', en: '🏙 towers' },
  // Комбо-пояс 81–92 (X4): имя говорит обе оси
  sudokuVariantSandparity: { ru: '🥪+ чёт/нечет', en: '🥪+ parity' },
  sudokuVariantThermoknight: { ru: '🌡+ конь', en: '🌡+ knight' },
  sudokuVariantKillerdiag: { ru: '➕ суммы + диагонали', en: '➕ cages + diagonals' },
  sudokuBeltCombo: { ru: 'комбо: два правила разом', en: 'combo: two rules at once' },
  sudokuRuleThermoknight: { ru: 'Два правила разом: вдоль термометра цифры строго растут от колбы, и одинаковые цифры не стоят на расстоянии хода шахматного коня.', en: 'Two rules at once: digits strictly increase along each thermometer from the bulb, and equal digits never sit a chess knight’s move apart.' },
  sudokuRuleSandparity: { ru: 'Два правила разом: число у края — сумма цифр между 1 и 9 в этом ряду, а метки в клетках задают чётность (квадрат — чётная, круг — нечётная).', en: 'Two rules at once: an edge number is the sum of digits between 1 and 9 in that line, and cell marks fix parity (square — even, circle — odd).' },
  sudokuRuleKillerdiag: { ru: 'Два правила разом: в цветной группе цифры дают сумму из угла и не повторяются, и на обеих диагоналях каждая цифра встречается один раз.', en: 'Two rules at once: inside a tinted cage digits add up to its corner number without repeating, and each digit appears once on both main diagonals.' },
  sudokuVariantUnequal: { ru: '≶ неравенства', en: '≶ futoshiki' },
  sudokuTowersTitle: { ru: "Небоскрёбы", en: "Towers" },
  sudokuUnequalTitle: { ru: "Неравенства", en: "Futoshiki" },
  sudokuTowersHubDesc: { ru: "Подсказки на краях: сколько зданий видно", en: "Edge clues: how many buildings you can see" },
  sudokuUnequalHubDesc: { ru: "Знаки между клетками, цепочки сравнений", en: "Signs between cells, chains of comparisons" },
  sudokuTypeTowers: { ru: "6×6 · 8 ступеней", en: "6×6 · 8 steps" },
  sudokuTypeUnequal: { ru: "9×9 · 8 ступеней", en: "9×9 · 8 steps" },
  sudokuRuleDiagonal: { ru: 'Цифры уникальны ещё и по двум диагоналям.', en: 'Digits are also unique along both diagonals.' },
  sudokuRuleAntiknight: { ru: 'Одинаковые цифры не стоят на расстоянии хода коня.', en: 'Equal digits cannot be a knight’s move apart.' },
  sudokuRuleHyper: { ru: 'Четыре доп. зоны 3×3 тоже содержат 1–9 без повторов.', en: 'Four extra 3×3 regions also hold 1–9 with no repeats.' },
  sudokuRuleNonconsec: { ru: 'Соседние по стороне клетки не отличаются на 1.', en: 'Orthogonally adjacent cells cannot differ by 1.' },
  sudokuRuleJigsaw: { ru: 'Блоки кривые, а не квадраты — в каждом тоже 1–9 без повторов.', en: 'Blocks are irregular, not squares — each still holds 1–9.' },
  sudokuRuleAntiking: { ru: 'Одинаковые цифры не касаются даже по диагонали (ход короля).', en: 'Equal digits cannot touch even diagonally (a king’s move).' },
  sudokuRuleEvenodd: { ru: '□ — чётная цифра, ○ — нечётная: форма подсказывает чётность.', en: '□ even, ○ odd — the shape hints each cell’s parity.' },
  sudokuRuleKropki: { ru: 'Белая точка между клетками — соседние ±1, чёрная — одно вдвое больше.', en: 'White dot between cells: consecutive (±1). Black dot: one is double the other.' },
  sudokuRuleSandwich: { ru: "Найди в ряду 1 и 9. Сложи цифры, зажатые МЕЖДУ ними, — это и есть число у края. Сами 1 и 9 не считаются. Ноль у края значит, что 1 и 9 стоят вплотную. Нажми на число у края — объясню именно его.", en: "Find the 1 and the 9 in the line. Add up the digits squeezed BETWEEN them — that is the edge number. The 1 and 9 themselves do not count. A zero means the 1 and 9 sit side by side. Tap an edge number and I will explain that exact one." },
  sudokuWhyNotLocal: { ru: 'Эта цифра не спорит с соседями напрямую — но в этой клетке стоит другая. Смотри строку, столбец и квадрат целиком.', en: 'This digit does not clash with its neighbours directly — but another one belongs here. Look at the whole row, column and box.' },
  sudokuRuleThermo: { ru: 'Вдоль термометра цифры строго растут от колбы.', en: 'Digits strictly increase along each thermometer from the bulb.' },
  /**
   * ⚠️ Про ПОВТОР сказано прямо, и вот почему. Сообщение из чата обратной связи
   * 01.09.2026 (уровень 48, стрелки): «единица повторяется два раза — в чём ошибка
   * или это нормально? До этого десятки попыток, и ни разу не было, чтобы цифра
   * повторялась». Правило было верным, но неполным: человек достроил недостающее
   * из опыта других вариантов — и решил, что видит поломку.
   */
  sudokuRuleArrow: { ru: 'Цифры вдоль стрелки в сумме равны числу в кружке. Повторяться они могут: стрелка складывает, но не запрещает одинаковые цифры — запрет остаётся только внутри строки, столбца и квадрата.', en: 'Digits along the arrow sum to the number in the circle. They may repeat: an arrow adds up, it does not forbid equal digits — the ban still applies only within a row, column and box.' },
  sudokuRuleThermocage: { ru: 'Два правила разом: вдоль термометра цифры строго растут от колбы, а в цветной группе они дают сумму из угла и не повторяются.', en: 'Two rules at once: digits strictly increase along each thermometer from the bulb, and inside a tinted cage they add up to its corner number without repeating.' },
  sudokuRuleTowers: { ru: 'Цифра — высота здания. Число у края говорит, сколько зданий видно с этой стороны: здание видно, если оно выше всех перед ним.', en: 'Each digit is a building height. An edge number says how many buildings are visible from that side: a building is visible when it is taller than everything before it.' },
  sudokuRuleUnequal: { ru: 'Знак между клетками сравнивает цифры: остриё указывает на меньшую. Знаки складываются в цепочки — цепочка говорит о клетках больше, чем один знак.', en: 'A sign between two cells compares their digits: the point aims at the smaller one. Signs join into chains — a chain tells you more than a single pair.' },
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
  sudokuEx_thermocage: { ru: 'Пример: термометр 2 → 4 → 7 растёт от колбы, а группа с меткой «9» из двух клеток даёт 9 разными цифрами (4 и 5). Клетка может быть и на термометре, и в группе — тогда работают оба правила сразу, и именно это сужает выбор до одной цифры.', en: 'Example: a thermometer runs 2 → 4 → 7 from the bulb, while a 2-cell cage marked “9” holds two different digits summing to 9 (4 and 5). A cell can sit on a thermometer and inside a cage at once — then both rules apply together, and that is what narrows it to a single digit.' },
  sudokuEx_towers: { ru: 'Пример: «1» у края — первое здание самое высокое, оно заслоняет остальные. «6» у края — ряд строго растёт: 1·2·3·4·5·6.', en: 'Example: a “1” at the edge — the first building is the tallest and hides the rest. A “6” — the row strictly rises: 1·2·3·4·5·6.' },
  sudokuEx_unequal: { ru: 'Пример: цепочка a < b < c в ряду. В a не может стоять 8 или 9: за ней должны поместиться две цифры побольше. Цепочка режет варианты ещё до первой заполненной клетки.', en: 'Example: a chain a < b < c in a row. Cell a cannot hold 8 or 9 — two larger digits must fit after it. The chain cuts options before any cell is filled.' },
  sudokuEx_jigsaw: { ru: 'Вместо квадратных блоков — фигурные области. В каждой области цифры 1–9 без повторов.', en: 'Instead of square boxes — irregular regions. Each region holds 1–9 with no repeats.' },
  sudokuEx_killer: { ru: 'Пример: рамка из 2 клеток с меткой «7» — цифры в ней дают в сумме 7 и не повторяются (например 3 и 4).', en: 'Example: a 2-cell cage marked “7” — its digits sum to 7 and don’t repeat (e.g. 3 and 4).' },
  // Судоку — строка-объяснение над доской (services/sudoku-board-hint).
  // Отвечает там, где спрашивают: на доске, а не в окне правил, которое уже закрыли.
  sudokuSandwichZeroNote: { ru: 'Ноль у края — между 1 и 9 нет ни одной клетки: они стоят вплотную.', en: 'A zero at the edge means no cell sits between the 1 and the 9 — they are adjacent.' },
  sudokuSandwichClueRow: { ru: '{n} у края строки — столько в сумме дают цифры, стоящие между 1 и 9 в этой строке.', en: '{n} beside the row — that is the sum of the digits sitting between the 1 and the 9 in this row.' },
  sudokuSandwichClueCol: { ru: '{n} над столбцом — столько в сумме дают цифры, стоящие между 1 и 9 в этом столбце.', en: '{n} above the column — that is the sum of the digits sitting between the 1 and the 9 in this column.' },
  sudokuSandwichClueZero: { ru: 'Ноль — это не сумма: между 1 и 9 здесь нет ни одной клетки, они стоят вплотную.', en: 'A zero is not a sum: no cell sits between the 1 and the 9 here — they are adjacent.' },
  sudokuColorWhy: { ru: 'Цвет ничего не решает — это твоя пометка: помечай клетки, между которыми видишь связь.', en: 'Color decides nothing — it is your own marker: tint the cells you see a link between.' },
  sudokuUndoWhy: { ru: 'Отмена возвращает клетку как было: и перезаписанную цифру, и погашенные ею пометки. Потраченную ошибку не вернёт.', en: 'Undo puts the cell back as it was: the digit you typed over and the marks it hid. It does not give back a spent mistake.' },
  ctaGotIt: { ru: 'ПОНЯТНО', en: 'GOT IT' },

  // Судоку-самурай
  samuraiDesc: { ru: 'Пять сеток 9×9 с общими угловыми блоками. Правила судоку в каждой.', en: 'Five overlapping 9×9 grids sharing corner blocks; standard sudoku in each.' },
  samuraiLvlParams: { ru: 'Закрыто {p}% клеток · лимит {e} ошибок · подсказок {h}', en: '{p}% cells hidden · {e} mistakes limit · {h} hints' },
  // Самурай: экран исчерпанного лимита ошибок.
  samuraiOverTitle: { ru: 'Ошибок слишком много', en: 'Too many mistakes' },
  samuraiOverSub: { ru: 'Лимит {n} ошибок на уровне. Сыграй заново — поле новое.', en: 'Limit of {n} mistakes. Play again — fresh board.' },
  samuraiNextUnlocks: { ru: 'Реши, не превысив лимит ошибок — откроется следующий, сложнее.', en: 'Solve within the mistakes limit — the next unlocks, harder.' },
  samuraiHowTo: { ru: 'Поле 21×21 = пять судоку, перекрытых углами. Заполни каждую клетку так, чтобы в каждой сетке 9×9 строки, столбцы и блоки 3×3 содержали 1–9 без повторов. Кнопкой 🔍 переключай масштаб: «вся фигура» или «крупно со скроллом».', en: 'A 21×21 board = five sudoku overlapping at the corners. Fill every cell so each 9×9 grid has 1–9 with no repeats in rows, columns and 3×3 boxes. Use 🔍 to toggle zoom: whole shape or zoomed-in with scroll.' },
  // --- Ожидание сборки доски (components/BoardBuilding). Общее на все игры, где партию
  // --- собирает решатель. Замер 20.08.2026 в браузере, самурай, уровень 12: 0.4–0.8 с на
  // --- маке и 1.9–4.5 с с тротлингом ×6 (примерно средний телефон).
  boardBuilding: { ru: 'Собираем доску', en: 'Building the board' },
  boardBuildingSlow: { ru: 'Уровень сложный: доска подбирается такой, чтобы её нельзя было взять простым перебором. Это несколько секунд.', en: 'This level is hard: we are picking a board that plain scanning will not crack. It takes a few seconds.' },
  boardBuildingStep: { ru: 'Шаг {n} из {max}', en: 'Step {n} of {max}' },
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
  stroopEmoLangFallback: { ru: "Заряженные слова есть пока только по-русски и по-английски — проба пойдёт на английских. Если язык вам незнаком, это будет обычный Струп.", en: "Charged words exist only in Russian and English for now — the run will use English. If you do not read it, this becomes a plain Stroop." },
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
  goodsSet_pets: { ru: 'Зверята', en: 'Critters' },
  goodsSet_dairy: { ru: 'Молочное', en: 'Dairy' },
  goodsSet_mix: { ru: 'Микс', en: 'Mix' },
  // Пометка на «Молочном»: набор намеренно собран из неразличимых бутылок, и
  // человек имеет право узнать это ДО старта, а не на третьем уровне.
  goodsSetAlike: { ru: 'похожи', en: 'look-alike' },
  // Срок открытия набора. Порог не назначен вкусом — он выведен из размера пула
  // (см. setUnlockLevel в app/games/goods-sort.tsx). Обещание без срока
  // раздражает сильнее, чем отсутствие набора, поэтому {n} обязателен.
  goodsSetFromLevel: { ru: 'с {n}-го уровня', en: 'from level {n}' },
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

  // Справка для семи игр, у которых раньше открывалось пустое окно «как играть».
  countingGroupIntroDesc: {
    ru: 'Четыре подхода к одному навыку. «Счётчик» держит число в уме, пока прибавляются новые; «Ползунок» просит прикинуть величину без вычисления; «Спринт» гонит простые примеры на скорость; «Связки» раскладывают число на слагаемые.\n\nСчёт в уме — не про арифметику как таковую. Он держится на рабочей памяти: промежуточный результат надо удержать, пока считаешь следующий шаг. Поэтому счёт проседает от усталости раньше, чем чтение или речь, и по нему заметно, в какой ты форме.',
    en: 'Four takes on one skill. Counter holds a number while new ones are added; Slider asks you to estimate without computing; Sprint pushes simple sums for speed; Bonds split a number into parts.\n\nMental arithmetic is not really about arithmetic. It rests on working memory: you must hold an intermediate result while computing the next step. That is why counting degrades with fatigue earlier than reading or speech — and why it shows what shape you are in.',
  },
  wordsGroupIntroDesc: {
    ru: 'Шесть упражнений на словарь, от узнавания к извлечению. Узнать слово в списке легко: правильный ответ лежит перед глазами. Вспомнить его без подсказки — другая работа, и именно она держит живую речь.\n\nПорядок внутри развилки по нарастанию усилия: словарь с интервальными повторами, сортировка по смыслу, пропущенное слово в фразе, «слово это или не слово», анаграммы и, наконец, беглость — назвать как можно больше слов на букву за минуту.',
    en: 'Six vocabulary exercises, from recognition to retrieval. Spotting a word in a list is easy: the answer is in front of you. Recalling it unaided is different work — and that is what carries fluent speech.\n\nInside the hub they run in order of effort: spaced repetition, sorting by meaning, the missing word in a phrase, word-or-not decisions, anagrams, and finally fluency — as many words with one letter as you can in a minute.',
  },
  hearingGroupIntroDesc: {
    ru: 'Три упражнения, где задание ЗВУЧИТ, а не написано. Минимальные пары учат слышать разницу между близкими звуками чужого языка; тоны китайского — различать мелодию слога, от которой зависит смысл; эхо псевдослов проверяет, сколько звучания вы удерживаете в голове.\n\nРодной язык глушит чужие звуки: тех, которых в нём нет, мозг подгоняет под привычные и со временем перестаёт различать вовсе. Все три возвращают слух к этой разнице.',
    en: 'Three exercises where the task is HEARD, not written. Minimal pairs teach you to hear the difference between close foreign sounds; Chinese tones train the melody of a syllable that carries the meaning; pseudoword echo measures how much sound you can hold in your head.\n\nYour native language mutes foreign sounds: the ones it lacks get bent into familiar shapes until you stop hearing the difference. All three bring that difference back.',
  },
  searchGroupIntroDesc: {
    ru: 'Найти нужное среди похожего — один навык в шести обличьях. Зрительный поиск и корректурная проба ищут заданный знак среди отвлекающих; «Найди отличия» сравнивает две картинки; маджонг ищет пару среди свободных плиток; таблицы Шульте гонят взгляд по сетке чисел; быстрый счёт просит назвать количество без пересчёта.\n\nКорректурная проба здесь не случайно: вычёркивать буквы в тексте — тот же поиск, просто цель задана знаком, а не формой.',
    en: 'Finding the one among the many — one skill in six guises. Visual search and the proofreading test hunt a given symbol among distractors; Spot the Difference compares two pictures; mahjong looks for a pair among free tiles; Schulte tables drive the gaze across a grid; quick count asks for a quantity without counting.\n\nThe proofreading test belongs here: crossing out letters is the same search, with the target set by a symbol rather than a shape.',
  },
  riskGroupIntroDesc: {
    ru: 'Три классические пробы на решения, когда исход неизвестен. В BART надуваешь шар: каждый насос добавляет выигрыш и приближает взрыв. В Iowa четыре колоды, две из которых выгодны только на вид, и понять это можно лишь по опыту. В PRL правило меняется посреди игры, и надо заметить, что выгодный выбор стал невыгодным.\n\nВместе они показывают три разные ошибки: слишком рано остановиться, слишком долго держаться за привычное и слишком поздно заметить перемену.',
    en: 'Three classic paradigms for choosing when the outcome is unknown. In BART you inflate a balloon: each pump adds winnings and brings the burst closer. In Iowa four decks, two of them profitable only in appearance — experience is the only way to tell. In PRL the rule flips mid-game and you must notice that the good choice went bad.\n\nTogether they expose three different errors: stopping too early, clinging to the familiar too long, and noticing the change too late.',
  },
  dictationIntroDesc: {
    ru: 'Фраза звучит, но на экране её нет — ненабранные знаки стоят точками. Вы печатаете услышанное целиком, и опечатка держит курсор на месте, пока не нажата верная клавиша. Прослушать можно сколько угодно раз: это подача задания, а не подсказка.\n\nСмысл не в скорости печати. Чтение и набор идут у человека с разной скоростью, и быстрый канал обгоняет медленный — глаз убегает вперёд, рука отстаёт, внимание рвётся. Диктант сводит их, ПРИТОРМАЖИВАЯ быстрый: голос задаёт темп, и рука обязана успеть, ничего не пропустив. На итоге видно знаки в минуту, точность и слабые клавиши — буквы, на которых вы сбиваетесь чаще всего.',
    en: 'The phrase is spoken but not shown — untyped characters stay dotted. You type what you heard in full, and a typo holds the cursor until the right key is pressed. Replay as often as you like: that is the task being delivered, not a hint.\n\nThe point is not typing speed. Reading and typing run at different speeds, and the fast channel outruns the slow one — the eye races ahead, the hand lags, attention tears. Dictation brings them together by SLOWING the fast one: the voice sets the pace and the hand must keep up without dropping anything. The result shows characters per minute, accuracy, and your weak keys — the letters you stumble on most.',
  },
  chineseTonesIntroDesc: {
    ru: 'Звучит один китайский слог. Ты отвечаешь, каким тоном он произнесён: ровным, восходящим, падающе-восходящим или падающим. Дальше — выбираешь и сам слог из четырёх написаний.\n\nВ китайском тон не украшение, а часть слова: mā — «мама», mà — «ругать», один и тот же слог. Для уха, выросшего на русском, это самая непривычная часть языка: у нас высота голоса несёт интонацию фразы, а не смысл слова, и мозг поначалу просто не слышит разницу. Здесь она разбирается по одному слогу, пока не станет слышна сама.',
    en: 'One Chinese syllable is played. You answer which tone it carried: level, rising, dipping, or falling. Later you also pick the syllable itself from four spellings.\n\nIn Chinese the tone is not decoration but part of the word: mā is “mother”, mà is “to scold” — the same syllable. For an ear raised on a non-tonal language this is the most alien part of the language: pitch there carries the melody of a sentence, not the meaning of a word, and at first the brain simply does not hear the difference. Here it is taken apart one syllable at a time, until it becomes audible on its own.',
  },
  phonemePairsIntroDesc: {
    ru: 'Два слова звучат почти одинаково и различаются одним-единственным звуком: ship или sheep, bad или bed. Слушаешь запись и выбираешь, что прозвучало.\n\nРодной язык глушит чужие звуки: тех, которых в нём нет, мозг подгоняет под привычные и со временем перестаёт их различать вообще. Упражнение возвращает слух к этой разнице — с неё начинается и понимание беглой речи, и собственное произношение.',
    en: 'Two words sound nearly identical and differ by a single sound: ship or sheep, bad or bed. You listen and pick which one was said.\n\nYour native language mutes foreign sounds: the ones it lacks get bent into familiar shapes until you stop hearing the difference at all. This brings that distinction back — and both understanding fast speech and your own pronunciation start there.',
  },
  pseudowordEchoIntroDesc: {
    ru: 'Звучит выдуманное слово — такого нет ни в одном языке. Твоя задача выбрать, как оно пишется.\n\nПочему именно несуществующее: настоящее слово узнаётся целиком, по памяти, и разбирать его на звуки не приходится. С выдуманным этот путь закрыт — надо удержать звучание в голове и разложить на части. Это чистая проверка фонологической памяти, на которой держится запоминание новых слов чужого языка.',
    en: 'You hear an invented word — one that exists in no language. Your task is to pick how it is spelled.\n\nWhy invented: a real word is recognised whole, from memory, and never has to be broken into sounds. An invented one closes that shortcut — you must hold the sound in your head and take it apart. That is a clean measure of phonological memory, the thing new foreign vocabulary rests on.',
  },
  listeningSpanIntroDesc: {
    ru: 'Слушаешь ряд слов и повторяешь их в том же порядке. С каждым уровнем ряд длиннее.\n\nЭто слуховая версия охвата памяти, и она труднее зрительной: картинку можно мысленно «сфотографировать», а звук исчезает в тот же миг, как прозвучал. Тренирует рабочую память в том виде, в каком она работает на совещании, на лекции и в разговоре на чужом языке.',
    en: 'You hear a list of words and repeat it in the same order. Each level makes the list longer.\n\nThis is the auditory version of memory span, and it is harder than the visual one: a picture can be "photographed" in the mind, sound is gone the instant it ends. It trains working memory in the form it actually works in — in meetings, in lectures, in a conversation in a foreign language.',
  },
  spanGroupIntroDesc: {
    ru: 'Это не отдельное упражнение, а развилка: карточка открывает группу тестов на охват памяти. Внутри — цифры и пространство, прямой порядок и обратный.\n\nПрямой порядок показывает, сколько элементов удаётся удержать. Обратный требует ещё и вертеть их в уме, ничего не потеряв, — потому и даётся заметно хуже. Выбери нужный вариант внутри.',
    en: 'This is not an exercise but a fork: the card opens a group of memory-span tests. Inside — digits and space, forward order and backward.\n\nForward order shows how many items you can hold. Backward also demands turning them over in your mind without dropping any — which is why it comes out noticeably worse. Pick the variant you want inside.',
  },
  samuraiTitleIntroDesc: {
    ru: 'Пять сеток 9×9, сцепленных углами: каждый угловой блок принадлежит сразу двум сеткам. Правила обычной судоку действуют в каждой сетке отдельно.\n\nВся трудность в общих блоках. Цифра, поставленная в углу, меняет расклад сразу в двух сетках, поэтому решать их по очереди не выйдет — приходится держать в голове обе.',
    en: 'Five 9×9 grids locked together at the corners: every corner block belongs to two grids at once. Ordinary sudoku rules apply within each grid separately.\n\nAll the difficulty lives in the shared blocks. A digit placed in a corner changes the picture in two grids at once, so solving them one after another does not work — you have to hold both in your head.',
  },
  fractalTitleIntroDesc: {
    ru: 'За каждой клеткой верхней сетки спрятана целая судоку. Решаешь вложенную — её ответ становится цифрой в клетке верхней.\n\nРешение идёт на двух уровнях сразу. Верхняя сетка говорит, какая цифра нужна внизу, а вложенная — можно ли её там вообще получить. Когда эти два ответа расходятся, придётся возвращаться и переигрывать нижнюю.',
    en: 'Behind every cell of the top grid hides a whole sudoku. Solve the nested one and its answer becomes the digit in that cell above.\n\nYou are solving on two levels at once. The top grid tells you which digit is needed below; the nested one tells you whether that digit can be reached there at all. When those two answers disagree, you go back and redo the lower grid.',
  },
  attentionConflictIntroDesc: {
    ru: 'Это не отдельное упражнение, а развилка: карточка открывает группу тестов на подавление автоматической реакции.\n\nОбщее у них одно — правильный ответ спорит с тем, который просится сам. Прочитать слово легче, чем назвать цвет, которым оно написано. Нажать на всё подряд легче, чем вовремя удержаться. Тренируется именно этот зазор между «хочется» и «надо». Выбери нужный тест внутри.',
    en: 'This is not an exercise but a fork: the card opens a group of tests on suppressing an automatic response.\n\nThey share one thing — the correct answer competes with the one that suggests itself. Reading a word is easier than naming the colour it is printed in. Pressing everything is easier than holding back at the right moment. What gets trained is exactly that gap between the easy move and the right one. Pick the test you want inside.',
  },

  // ── Подписи чисел в шапке игры (v1.176). Каждая цифра в HUD обязана иметь
  // рядом СЛОВО: «✗c3» и «VE 34» человек не расшифровывает, а по этим числам
  // его судят. Слова короткие — шапка обязана влезать в телефон 390 pt.
  hud_correct: { ru: 'Верно', en: 'Correct' },
  hud_errors: { ru: 'Ошибок', en: 'Errors' },
  hud_missed: { ru: 'Пропуск', en: 'Missed' },
  hud_false: { ru: 'Ложных', en: 'False' },
  hud_held: { ru: 'Удержано', en: 'Held' },
  hud_trials: { ru: 'Проб', en: 'Trials' },
  hud_span: { ru: 'Охват', en: 'Span' },
  hud_entered: { ru: 'Введено', en: 'Entered' },
  hud_bank: { ru: 'Банк', en: 'Bank' },
  hud_atRisk: { ru: 'В игре', en: 'At risk' },
  hud_pops: { ru: 'Взрывов', en: 'Pops' },
  hud_avgPumps: { ru: 'Ср. накачек', en: 'Avg pumps' },
  hud_cueGain: { ru: 'Подсказка', en: 'Cue gain' },
  hud_interference: { ru: 'Помеха', en: 'Interference' },
  hud_reversals: { ru: 'Смен', en: 'Switches' },
  hud_inBlock: { ru: 'В блоке', en: 'In block' },
  hud_goodDecks: { ru: 'Выгодных', en: 'Good decks' },
  hud_badDecks: { ru: 'Рисковых', en: 'Risky decks' },
  hud_card: { ru: 'Карта', en: 'Card' },
  hud_moves: { ru: 'Ходов', en: 'Moves' },
  hud_streak: { ru: 'Серия', en: 'Streak' },
  /**
   * Слово похвалы у места действия. Три ступени по длине серии: короткая —
   * сдержанно, длинная — громко. Одно слово на всё обесценивается к третьему
   * разу, поэтому их три (приём снят с эталона жанра, §30.3 карты геймификации).
   */
  praise_good:    { ru: 'Точно!', en: 'Nice!' },
  praise_great:   { ru: 'Отлично!', en: 'Great!' },
  praise_perfect: { ru: 'Великолепно!', en: 'Superb!' },
  // Личный рекорд серии — самореферентная цель вместо абсолютного счёта
  // (решение Дениса 30.08.2026, обоснование в `services/streak.ts`).
  hud_best: { ru: 'Рекорд', en: 'Best' },
  hud_repeats: { ru: 'Повторов', en: 'Repeats' },
  hud_words: { ru: 'Слов', en: 'Words' },
  hud_solved: { ru: 'Решено', en: 'Solved' },
  hud_step: { ru: 'Шаг', en: 'Step' },
  hud_point: { ru: 'Точка', en: 'Point' },
  hud_letter: { ru: 'Буква', en: 'Letter' },
  hud_netAlerting: { ru: 'Бдительность', en: 'Alerting' },
  hud_netOrienting: { ru: 'Ориентир', en: 'Orienting' },
  hud_netExecutive: { ru: 'Контроль', en: 'Executive' },
  hud_cycle: { ru: 'Цикл', en: 'Cycle' },
  // <<< LEVEL_RULES

  // ── ПРАВИЛА УРОВНЯ (v1.130.0). Текст всплывашки «что изменилось на этом уровне».
  // Раньше жил инлайном в играх на ДВУХ языках (`ru ? .ru : .en`) — десять локалей
  // читали объяснение механики по-английски. Ключ собирается кодом:
  // levelRuleKey(gameId, rule.key, field) → lr_<игра>_<правило>_<title|rule|example>.
  // ⚠️ Правило без ключей здесь = правило без перевода: гейт level-rules-i18n красный.
  lr_chess_blind_moves_title: { ru: 'Фигуры начали ходить', en: 'The pieces start moving' },
  lr_chess_blind_moves_rule: { ru: 'До пятого уровня позиция замирала, и достаточно было запомнить картинку. С шестого после показа фигуры делают ходы вслепую — и держать надо не картинку, а то, как она изменилась.', en: 'Up to level 5 the position froze and remembering the picture was enough. From level 6 the pieces make blind moves after the display — and what you must hold is not the picture but how it changed.' },
  lr_chess_blind_moves_example: { ru: 'Пример: «конь b1 — c3». Двигай его в голове и запоминай новое место, старое больше не считается.', en: 'Example: "knight b1 to c3". Move it in your head and remember the new square; the old one no longer counts.' },
  lr_chess_blind_locate_title: { ru: 'Вопрос перевернулся', en: 'The question flips' },
  lr_chess_blind_locate_rule: { ru: 'Раньше спрашивали «что стоит на этой клетке» — ты проверял одно место. Теперь спрашивают «где стоит эта фигура», и искать приходится по всей доске.', en: 'It used to ask "what stands on this square" — you checked one place. Now it asks "where does this piece stand", and you have to search the whole board.' },
  lr_chess_blind_locate_example: { ru: 'Держать позицию списком «клетка → фигура» больше не выйдет. Нужен обратный список: «фигура → клетка».', en: 'Holding the position as "square → piece" stops working. You need the reverse list: "piece → square".' },
  lr_corsi_reverse_title: { ru: 'Обратный порядок', en: 'Reverse order' },
  lr_corsi_reverse_rule: { ru: 'С этого уровня повторяй последовательность В ОБРАТНОМ порядке — от последнего блока к первому.', en: 'From this level on, reproduce the sequence in REVERSE — from the last block back to the first.' },
  lr_corsi_reverse_example: { ru: 'Пример: загорелись блоки 1 → 2 → 3 — нажимай 3, 2, 1.', en: 'Example: blocks flash 1 → 2 → 3 — tap 3, 2, 1.' },
  lr_cpt_lookalike_title: { ru: 'Буквы-ловушки', en: 'Look-alike traps' },
  lr_cpt_lookalike_rule: { ru: 'Среди букв всё чаще попадаются похожие на X: K, Y, V, W, N, M. Не жми на них — жди настоящую X (после A).', en: 'Letters that resemble X now appear more often: K, Y, V, W, N, M. Don\'t tap them — wait for a real X (after A).' },
  lr_cpt_lookalike_example: { ru: 'Пример: мелькнула K — руки прочь, это не X.', en: 'Example: a K flashes by — hands off, it\'s not an X.' },
  lr_digit_span_reverse_title: { ru: 'Ввод с конца', en: 'Type backwards' },
  lr_digit_span_reverse_rule: { ru: 'С этого уровня вводи цифры В ОБРАТНОМ порядке — от последней к первой.', en: 'From this level on, enter the digits in REVERSE order — last digit first.' },
  lr_digit_span_reverse_example: { ru: 'Пример: показано 4 9 2 — вводи 294.', en: 'Example: shown 4 9 2 — type 294.' },
  lr_goods_sort_goalpick_title: { ru: 'Цель: собрать названные', en: 'Goal: gather the named' },
  lr_goods_sort_goalpick_rule: { ru: 'Теперь у уровня бывает своя цель, и она написана над шкафом. «Собрать тройки» — значит убрать именно те товары, что показаны картинками; остальное можно оставить на полках.', en: 'Levels now carry their own goal, written above the cabinet. “Gather triples” means clearing exactly the goods shown — the rest may stay on the shelves.' },
  lr_goods_sort_goalpick_example: { ru: 'Пример: 🚩 Собрать тройки: молоко, кола. Собрал обе — уровень пройден, даже если кефир ещё стоит.', en: 'Example: 🚩 Gather triples of: milk, cola. Clear both and the level is done, even with kefir still there.' },
  lr_goods_sort_strict_title: { ru: "Строгая укладка", en: "Strict placing" },
  lr_goods_sort_strict_rule: { ru: "На этом уровне товар можно класть только в ПУСТУЮ нишу или поверх ТАКОГО ЖЕ. Положить что попало куда попало больше нельзя — думай на ход вперёд, иначе перекроешь себе дорогу.", en: "On this level a good goes only into an EMPTY niche or on top of the SAME good. No more dropping anything anywhere — think a move ahead or you will block your own way." },
  lr_goods_sort_strict_example: { ru: "Пример: в нише стоит кола — сверху можно только колу. Кефир туда не встанет, ему нужна пустая ниша или другой кефир.", en: "Example: a niche holds cola — only cola goes on top. Kefir will not fit there; it needs an empty niche or another kefir." },
  lr_goods_sort_blocked_title: { ru: 'Запертая ниша', en: 'Locked niche' },
  lr_goods_sort_blocked_rule: { ru: 'Ниша с замком закрыта: класть в неё нельзя. Откроется сама, когда рядом соберётся тройка — освобождай соседей.', en: 'A niche with a padlock is shut — nothing goes in. It opens by itself once a triple clears next to it, so free the neighbours.' },
  lr_goods_sort_blocked_example: { ru: 'Пример: 🔒 в углу. Собери тройку в соседней нише — замок спадёт.', en: 'Example: 🔒 in the corner. Clear a triple in the adjacent niche and the lock falls off.' },
  lr_goods_sort_goalfree_title: { ru: 'Цель: освободить ниши', en: 'Goal: free the niches' },
  lr_goods_sort_goalfree_rule: { ru: 'Ниши с флажком должны опустеть — выложи из них всё. Что лежит в остальных, для этой цели неважно.', en: 'Flagged niches must end up empty — move everything out of them. Whatever sits elsewhere does not matter for this goal.' },
  lr_goods_sort_goalfree_example: { ru: 'Пример: 🚩 два флажка. Опустошил обе ниши — уровень пройден.', en: 'Example: 🚩 two flags. Empty both niches and the level is done.' },
  lr_goods_sort_covered_title: { ru: 'Накрытый товар', en: 'Covered good' },
  lr_goods_sort_covered_rule: { ru: 'Тёмный силуэт — товар, который не видно. Он всегда лежит НЕ первым: сними тот, что перед ним, и узнаешь, что это.', en: 'A dark silhouette is a good you cannot see yet. It is never the front one: take the item in front of it and you will find out what it is.' },
  lr_goods_sort_covered_example: { ru: 'Пример: за колой чёрный силуэт. Убрал колу — стало видно кефир.', en: 'Example: a black shape behind the cola. Move the cola and kefir appears.' },
  lr_goods_sort_movelimit_title: { ru: 'Лимит ходов', en: 'Move limit' },
  lr_goods_sort_movelimit_rule: { ru: 'Теперь на уровень даётся ограниченное число перестановок — трать ходы с умом. Превысил лимит — уровень заново. Счётчик ходов в шапке: сделано/лимит.', en: 'Each level now allows a limited number of moves — spend them wisely. Exceed the limit and the level restarts. The header counter shows used/limit.' },
  lr_goods_sort_movelimit_example: { ru: 'Пример: ⇄ 12/18 — сделано 12 ходов из 18. С каждым уровнем лимит жмёт сильнее.', en: 'Example: ⇄ 12/18 — 12 of 18 moves used. The limit tightens every level.' },
  lr_goods_sort_locked_title: { ru: 'Замок по ходам', en: 'Timed lock' },
  lr_goods_sort_locked_rule: { ru: 'Ниша с часами откроется сама через столько ходов, сколько показывает счётчик. Ждать не обязательно — просто считай её занятой, пока идёт отсчёт.', en: 'A niche with a clock opens by itself after as many moves as the counter shows. No need to wait for it — just treat it as taken while it counts down.' },
  lr_goods_sort_locked_example: { ru: 'Пример: ⏱ 5 — откроется через пять твоих ходов. Каждый ход счётчик убывает.', en: 'Example: ⏱ 5 — opens in five of your moves. Every move takes one off.' },
  lr_goods_sort_hidden_title: { ru: 'Скрытая информация', en: 'Hidden information' },
  lr_goods_sort_hidden_rule: { ru: 'Что в глубине ниши — не видно: там стоит «?». Товар открывается, когда перед ним никого не останется. Минимума ходов у такого уровня нет, счёт ходов ни с чем не сравнивается — вскрывай, узнавай и перестраивай план.', en: 'What sits deep in a niche is unknown — it shows as “?”. A good opens up once nothing stands in front of it. No move minimum exists here, so the move count is not judged — uncover, learn, replan.' },
  lr_goods_sort_hidden_example: { ru: 'Пример: в нише «?» и кола. Убрал колу — «?» открылся: там кефир.', en: 'Example: a niche holds “?” and a cola. Move the cola and the “?” opens: it was kefir.' },
  lr_goods_sort_frozen_title: { ru: 'Примёрзший ряд', en: 'Frozen row' },
  lr_goods_sort_frozen_rule: { ru: 'Синий ряд не работает: ни взять, ни положить. Оттает, когда ты соберёшь тройку того товара, что примёрз — он показан снежинкой.', en: 'A blue row is out of action — nothing in, nothing out. It thaws when you clear a triple of the frozen good, shown by the snowflake.' },
  lr_goods_sort_frozen_example: { ru: 'Пример: ❄ ряд внизу примёрз на соке. Собери тройку сока где угодно — ряд оттает.', en: 'Example: ❄ the bottom row is frozen on juice. Clear a triple of juice anywhere and it thaws.' },
  lr_hanoi_pegs4_title: { ru: '4 стержня', en: '4 pegs' },
  lr_hanoi_pegs4_rule: { ru: 'Теперь стержней четыре. Больше простора для манёвра — но оптимальный путь другой, старые привычки трёх стержней не работают. Цель прежняя: собрать башню на последнем (правом) стержне.', en: 'There are now four pegs. More room to maneuver — but the optimal path is different, old 3-peg habits won\'t work. The goal stays the same: rebuild the tower on the last (rightmost) peg.' },
  lr_hanoi_pegs4_example: { ru: 'Пример: лишний стержень = два «буфера» для мелких дисков.', en: 'Example: the extra peg gives you two "buffers" for small discs.' },
  lr_hanoi_pegs5_title: { ru: '5 стержней', en: '5 pegs' },
  lr_hanoi_pegs5_rule: { ru: 'Стержней уже пять — ещё больше простора для манёвра, но и дисков больше, а оптимальный путь снова другой. Цель прежняя: вся башня на последнем (правом) стержне.', en: 'Five pegs now — even more room to maneuver, but more discs too, and the optimal path changes again. The goal stays the same: the whole tower on the last (rightmost) peg.' },
  lr_hanoi_pegs5_example: { ru: 'Пример: три «буфера» — раскладывай мелкие диски параллельно.', en: 'Example: three "buffers" — park small discs in parallel.' },
  lr_listening_span_span8_title: { ru: 'Восемь слов — предел ряда', en: 'Eight words is the ceiling' },
  lr_listening_span_span8_rule: { ru: 'Длиннее ряд не станет: восемь это потолок слуховой памяти почти у всех. Дальше сокращается пауза между словами — с 0,7 секунды до 0,5.', en: 'The list stops growing here: eight is the limit of auditory span for almost everyone. What shrinks from now on is the gap between words — from 0.7 seconds down to 0.5.' },
  lr_listening_span_span8_example: { ru: 'Меньше паузы — меньше времени повторить услышанное про себя, а именно повтор и держит ряд.', en: 'A shorter gap means less time to repeat what you heard in your head — and that repetition is what holds the list.' },
  lr_mahjong_layers2_title: { ru: 'Два слоя', en: 'Two layers' },
  lr_mahjong_layers2_rule: { ru: 'Плитки теперь лежат в 2 слоя. Брать можно только СВОБОДНУЮ плитку: на ней никто не лежит И у неё открыт левый или правый край. Тусклые плитки заблокированы.', en: 'Tiles now stack in 2 layers. You can only pick a FREE tile: nothing lies on it AND its left or right side is open. Dimmed tiles are blocked.' },
  lr_mahjong_layers2_example: { ru: 'Пример: плитка под другой плиткой или зажатая соседями с обоих боков — не нажимается, сначала освободи её.', en: 'Example: a tile under another tile, or squeezed by neighbors on both sides, cannot be tapped — free it first.' },
  lr_mahjong_layers3_title: { ru: 'Три слоя', en: 'Three layers' },
  lr_mahjong_layers3_rule: { ru: 'Пирамида теперь в 3 слоя. Правило то же: свободна плитка, на которой НИЧЕГО не лежит и у которой открыт левый ИЛИ правый край. Разбирай пирамиду сверху вниз.', en: 'The pyramid now has 3 layers. Same rule: a tile is free when NOTHING lies on it and its left OR right side is open. Dismantle the pyramid top-down.' },
  lr_mahjong_layers3_example: { ru: 'Пример: нижняя плитка станет доступна, когда снимешь всё, что её накрывает, и один её бок открыт.', en: 'Example: a bottom tile becomes available once everything covering it is removed and one of its sides is open.' },
  lr_mahjong_layers4_title: { ru: 'Четыре слоя', en: 'Four layers' },
  lr_mahjong_layers4_rule: { ru: 'Слоёв стало 4, и перетасовка теперь одна на уровень. Правило свободной плитки не меняется — меняется цена ошибки: снимать надо сверху и с краёв, иначе запрёшь низ.', en: 'Four layers now, and you get one shuffle per level. The free-tile rule is unchanged — what changes is the cost of a mistake: clear from the top and the edges, or you will lock the bottom.' },
  lr_mahjong_layers4_example: { ru: 'Пример: пара в самом низу может стать недоступной, если разобрать середину не с того края. Смотри на два хода вперёд.', en: 'Example: a bottom pair can become unreachable if you open the middle from the wrong side. Think two moves ahead.' },
  lr_mahjong_hidden_title: { ru: "Скрытые лица", en: "Hidden faces" },
  lr_mahjong_hidden_rule: { ru: "На этом уровне лица накрытых плиток скрыты — вместо рисунка «?». Что лежит ниже, узнаёшь, только сняв то, что сверху. План приходится строить под неизвестность и пересматривать по ходу. Такой уровень будет попадаться каждый третий.", en: "On this level the faces of covered tiles are hidden — a “?” instead of the picture. You learn what lies below only by removing what is on top. You have to plan under uncertainty and revise as you go. Every third level will be like this." },
  lr_mahjong_hidden_example: { ru: "Пример: под верхней плиткой стоит «?» — там может оказаться и нужная тебе пара, и плитка, которая запрёт низ. Реши, вскрывать или зайти с другого края.", en: "Example: a “?” sits under a top tile — it may hide the pair you need, or a tile that locks the bottom. Decide: reveal it, or approach from another edge." },
  lr_mahjong_layers5_title: { ru: 'Пять слоёв', en: 'Five layers' },
  lr_mahjong_layers5_rule: { ru: 'Пять слоёв — верх пирамиды узкий, низ широкий. Перетасовка одна. Здесь уже нельзя брать любую доступную пару: почти каждый снятый тайл открывает или запирает что-то ниже.', en: 'Five layers — a narrow top over a wide base. One shuffle. You can no longer take just any available pair: almost every tile you remove opens or locks something below.' },
  lr_mahjong_layers5_example: { ru: 'Пример: две одинаковые плитки свободны, но одна из них держит крышку над последней парой — бери ту, что не держит.', en: 'Example: two identical tiles are free, but one of them caps the last pair — take the other one.' },
  lr_math_sprint_mult_title: { ru: 'Умножение', en: 'Multiplication' },
  lr_math_sprint_mult_rule: { ru: 'К сложению и вычитанию добавляется умножение (×).', en: 'Multiplication (×) joins addition and subtraction.' },
  lr_math_sprint_mult_example: { ru: 'Пример: 7 × 6 = 42.', en: 'Example: 7 × 6 = 42.' },
  lr_math_sprint_div_title: { ru: 'Деление', en: 'Division' },
  lr_math_sprint_div_rule: { ru: 'Теперь встречается и деление (÷) — всегда нацело, без остатка. Умножение (×) тоже остаётся.', en: 'Division (÷) now appears — always exact, no remainder. Multiplication (×) stays too.' },
  lr_math_sprint_div_example: { ru: 'Пример: 42 ÷ 6 = 7.', en: 'Example: 42 ÷ 6 = 7.' },
  lr_memory_matrix_grid6_title: { ru: 'Сетка дошла до предела', en: 'The grid has hit its limit' },
  lr_memory_matrix_grid6_rule: { ru: 'Поле выросло до 6×6 и больше расти не будет. Дальше добавляются клетки, которые надо запомнить, и укорачивается показ.', en: 'The board has grown to 6×6 and stops there. What grows from now on is the number of cells to remember, and the display gets shorter.' },
  lr_memory_matrix_grid6_example: { ru: 'На большом поле клетки удобнее запоминать не поштучно, а фигурой: «уголок слева», «диагональ».', en: 'On a big board it is easier to remember cells as a shape — "corner on the left", "diagonal" — than one by one.' },
  lr_memory_matrix_fast_title: { ru: 'Показ короче секунды', en: 'The flash is under a second' },
  lr_memory_matrix_fast_rule: { ru: 'Времени на разглядывание почти не осталось: вспышка длится меньше секунды. Успевает не тот, кто смотрит внимательнее, а тот, кто смотрит в центр и берёт поле целиком.', en: 'There is almost no time to look: the flash lasts less than a second. It is not the closer look that works but the wider one — centre your gaze and take the board in at once.' },
  lr_memory_matrix_fast_example: { ru: 'Не води взглядом по клеткам — не успеешь. Смотри в середину и лови рисунок боковым зрением.', en: 'Do not scan cell by cell, you will not make it. Look at the middle and catch the pattern with peripheral vision.' },
  lr_mental_rotation_axes2_title: { ru: 'Две оси вращения', en: 'Two rotation axes' },
  lr_mental_rotation_axes2_rule: { ru: 'Фигуру теперь крутят по ДВУМ осям (X и Y): она может быть наклонена вперёд/назад и вбок, а не просто повёрнута в плоскости экрана.', en: 'The shape is now rotated around TWO axes (X and Y): it can be tilted forward/back and sideways, not just spun flat in the screen plane.' },
  lr_mental_rotation_axes2_example: { ru: 'Пример: та же фигура, но «завалена» на бок — мысленно наклони её обратно и сравни с эталоном.', en: 'Example: the same shape but "tipped over" — mentally tilt it back and compare with the reference.' },
  lr_mental_rotation_axes3_title: { ru: 'Три оси и составные повороты', en: 'Three axes & compound turns' },
  lr_mental_rotation_axes3_rule: { ru: 'Вращение идёт по всем ТРЁМ осям (X+Y+Z), а с 13-го уровня повороты складываются в косые ракурсы. Зеркальная копия по-прежнему НЕ считается поворотом.', en: 'Rotation now uses all THREE axes (X+Y+Z), and from level 13 turns combine into oblique views. A mirrored copy still does NOT count as a rotation.' },
  lr_mental_rotation_axes3_example: { ru: 'Пример: фигура повёрнута сразу по X, Y и Z — прокручивай её в голове пошагово, ось за осью.', en: 'Example: the shape is turned around X, Y and Z at once — rotate it in your head step by step, axis by axis.' },
  lr_mnemonics_method_title: { ru: 'Повтор в уме перестал справляться', en: 'Repeating in your head stops working' },
  lr_mnemonics_method_rule: { ru: 'С семи-восьми элементов простое проговаривание ряд уже не держит — это предел, он у всех примерно одинаковый. Дальше работает только метод.', en: 'From seven or eight items, plain repetition no longer holds the list — that is the limit, and it is about the same for everyone. Past it, only a method works.' },
  lr_mnemonics_method_example: { ru: 'Два рабочих: цепочка — связать каждое слово со следующим нелепой картинкой; комната — расставить слова по знакомым местам и потом пройти по ним взглядом.', en: 'Two that work: the chain — link each word to the next with an absurd image; the room — place the words around a familiar space and walk it in your mind.' },
  lr_n_back_dual_title: { ru: 'Два потока', en: 'Two streams' },
  lr_n_back_dual_rule: { ru: 'Теперь ДВА потока сразу: позиция на поле и буква (звук). Совпадение позиции отмечай кнопкой «👁 Position», совпадение буквы — «🔊 Sound». Можно нажать обе.', en: 'Now TWO streams at once: the position on the grid and a letter (sound). Mark a position match with the "👁 Position" button, a letter match with "🔊 Sound". You can tap both.' },
  lr_n_back_dual_example: { ru: 'Пример (2-back): позиция как 2 шага назад → Position; буква как 2 шага назад → Sound.', en: 'Example (2-back): position same as 2 steps ago → Position; letter same as 2 steps ago → Sound.' },
  lr_ospan_hardmath_title: { ru: 'Счёт сложнее', en: 'Harder math' },
  lr_ospan_hardmath_rule: { ru: 'В уравнениях появляется умножение и числа крупнее. Считай внимательно — это отвлекающая задача, буквы между уравнениями всё равно запоминай.', en: 'Equations now include multiplication and bigger numbers. Solve carefully — it is the distractor task; keep memorizing the letters in between.' },
  lr_ospan_hardmath_example: { ru: 'Пример: 7 × 12 = 84 — верно.', en: 'Example: 7 × 12 = 84 — correct.' },
  lr_picture_pairs_triple_title: { ru: 'Тройки', en: 'Triples' },
  lr_picture_pairs_triple_rule: { ru: 'С этого уровня совпадение — не пара, а ТРИ одинаковые картинки. Открывай три подряд: две одинаковые — ещё не матч.', en: 'From this level a match is not a pair but THREE identical pictures. Open three in a row: two of a kind is not a match yet.' },
  lr_picture_pairs_triple_example: { ru: 'Пример: 🐱🐱 — мало, группа снимется только с третьей 🐱.', en: 'Example: 🐱🐱 is not enough — the group clears only with a third 🐱.' },
  lr_picture_pairs_quad_title: { ru: 'Четвёрки', en: 'Quads' },
  lr_picture_pairs_quad_rule: { ru: 'Теперь совпадение — ЧЕТЫРЕ одинаковые картинки. Открой все четыре подряд, чтобы снять группу.', en: 'Now a match is FOUR identical pictures. Open all four in a row to clear the group.' },
  lr_picture_pairs_quad_example: { ru: 'Пример: 🐱🐱🐱 — мало, нужна четвёртая 🐱.', en: 'Example: 🐱🐱🐱 is not enough — you need a fourth 🐱.' },
  lr_prl_reversal_title: { ru: 'Угадывать не нужно — нужно замечать', en: 'Not a guessing game — a noticing game' },
  lr_prl_reversal_rule: { ru: 'Один из двух кругов чаще приносит выигрыш. Какой именно — в начале неизвестно, это выясняется пробами. Через несколько верных выборов подряд стороны МОЛЧА меняются местами: тот, что был хорошим, становится плохим. Никакого сигнала об этом не будет.', en: 'One of the two circles pays off more often. Which one is unknown at first — you find out by trying. After a few correct choices in a row the sides SILENTLY swap: the good one becomes the bad one. You will get no warning.' },
  lr_prl_reversal_example: { ru: 'Поэтому две ошибки подряд после долгой удачной серии — это почти наверняка не невезение, а смена правила. Меняйте выбор. Одна ошибка ещё ничего не значит: даже хороший круг иногда обманывает.', en: 'So two errors in a row after a long good streak is almost never bad luck — it is the rule changing. Switch. A single error means nothing: even the good circle misleads sometimes.' },
  lr_prl_noisy_title: { ru: 'Обратная связь стала обманчивее', en: 'The feedback got trickier' },
  lr_prl_noisy_rule: { ru: 'Хороший круг перестал быть надёжным: раньше он выигрывал почти всегда, теперь — заметно реже. И смена сторон происходит чаще.', en: 'The good circle is no longer reliable: it used to win almost always, now noticeably less often. And the sides swap more frequently.' },
  lr_prl_noisy_example: { ru: 'На таком шуме решать по одному ответу нельзя вообще. Держите в голове последние три-четыре: если проигрышей стало больше, чем выигрышей, — правило сменилось.', en: 'At this noise level a single answer tells you nothing. Hold the last three or four in mind: once losses outnumber wins, the rule has flipped.' },
  lr_pseudoword_echo_longer6_title: { ru: 'Слова стали длиннее', en: 'Longer words now' },
  lr_pseudoword_echo_longer6_rule: { ru: 'Было четыре-пять букв, стало шесть-семь. Целиком такое слово в голове уже не удержать — его придётся разбить на слоги.', en: 'It was four or five letters, now it is six or seven. A word this long no longer fits whole — you have to break it into syllables.' },
  lr_pseudoword_echo_longer6_example: { ru: 'Пример: было «нолап», стало «вирунтек». Второе держится только по частям.', en: 'Example: it was "nolap", now it is "viruntek". The second one only holds in pieces.' },
  lr_pseudoword_echo_longer8_title: { ru: 'Восемь-девять букв', en: 'Eight or nine letters' },
  lr_pseudoword_echo_longer8_rule: { ru: 'Предельная длина. На таком слове решает не память, а то, насколько точно ты расслышал каждый звук.', en: 'Maximum length. At this size it is not memory that decides but how precisely you heard every sound.' },
  lr_pseudoword_echo_longer8_example: { ru: 'Варианты ответа теперь различаются одной буквой в середине — там, где слух подводит чаще всего.', en: 'The answer options now differ by one letter in the middle — exactly where hearing fails most often.' },
  lr_reading_span_load_title: { ru: 'Предложений больше, чем удержишь подряд', en: 'More sentences than you can hold in a row' },
  lr_reading_span_load_rule: { ru: 'С этого уровня набор длиннее, чем помещается в голове списком. Смысл теста в этом и есть: проверить предложение и НЕ потерять слова из предыдущих.', en: 'From this level the set is longer than fits in your head as a list. That is exactly what the test measures: judge the sentence and do NOT lose the words from the previous ones.' },
  lr_reading_span_load_example: { ru: 'Не повторяй слова по кругу — на проверке следующего предложения повтор собьётся. Связывай слова в одну фразу, пусть нелепую.', en: 'Do not loop the words in your head — judging the next sentence will break the loop. Tie the words into one phrase, however absurd.' },
  lr_semantic_sort_three_title: { ru: 'Категорий стало три', en: 'Three categories now' },
  lr_semantic_sort_three_rule: { ru: 'До этого выбор был из двух корзин, теперь из трёх. Угадать наугад стало втрое труднее, и слово придётся действительно понять.', en: 'Until now you chose between two baskets, now there are three. Guessing blindly got three times harder — you actually have to know the word.' },
  lr_semantic_sort_three_example: { ru: 'Пример: было «еда или животное», стало «фрукт, овощ или животное».', en: 'Example: it was "food or animal", now it is "fruit, vegetable or animal".' },
  lr_semantic_sort_four_title: { ru: 'Категорий стало четыре', en: 'Four categories now' },
  lr_semantic_sort_four_rule: { ru: 'Четвёртая корзина. Здесь уже не хватит общего смысла — нужен точный признак слова.', en: 'A fourth basket. General meaning is no longer enough — you need the precise feature of the word.' },
  lr_semantic_sort_four_example: { ru: 'Разница между «фруктом» и «ягодой» на этом уровне решает.', en: 'The difference between "fruit" and "berry" starts to matter here.' },
  lr_set_game_timelimit_title: { ru: 'Лимит времени', en: 'Time limit' },
  lr_set_game_timelimit_rule: { ru: 'Теперь на поиск SET даётся ограниченное время. Не успел — штраф ✗ и новая раскладка. С каждым уровнем лимит жмёт сильнее.', en: 'You now have limited time to find a SET. Run out — penalty ✗ and a fresh board. The limit tightens every level.' },
  lr_set_game_timelimit_example: { ru: 'Пример: L11 — 26 с на SET, дальше −4 с за уровень (минимум 8 с).', en: 'Example: L11 — 26 s per SET, then −4 s per level (8 s minimum).' },
  lr_spatial_span_grid5_title: { ru: 'Сетка 5×5', en: '5×5 grid' },
  lr_spatial_span_grid5_rule: { ru: 'Поле выросло до 5×5 — клеток больше, а сами они мельче. Порядок по-прежнему обратный.', en: 'The board grew to 5×5 — more cells, each one smaller. The order is still reversed.' },
  lr_visual_search_multi_title: { ru: 'Несколько целей', en: 'Multiple targets' },
  lr_visual_search_multi_rule: { ru: 'Теперь в раунде может быть несколько целей — найди ВСЕ, счётчик 🎯 покажет прогресс.', en: 'A round can now hold several targets — find ALL of them, the 🎯 counter shows progress.' },
  lr_visual_search_multi_example: { ru: 'Пример: 🎯 1/3 — найдена одна цель из трёх.', en: 'Example: 🎯 1/3 — one of three targets found.' },
  lr_visual_search_conj_title: { ru: 'Цвет + форма', en: 'Color + shape' },
  lr_visual_search_conj_rule: { ru: 'Цель теперь задаётся ДВУМЯ признаками: нужная форма нужного цвета. Та же форма другого цвета — НЕ цель.', en: 'The target is now defined by TWO features: the right shape in the right color. Same shape in another color is NOT a target.' },
  lr_visual_search_conj_example: { ru: 'Пример: ищем синюю T. Жёлтая T и синяя L — ловушки.', en: 'Example: find the blue T. A yellow T and a blue L are decoys.' },
  lr_word_pairs_faster_title: { ru: 'Времени на пару меньше', en: 'Less time per pair' },
  lr_word_pairs_faster_rule: { ru: 'Пар с каждым уровнем больше, а секунд на каждую — меньше. На первом уровне пара висит 7 секунд, к десятому около 4, дальше 2,5.', en: 'Every level adds pairs and takes away seconds. A pair is shown for 7 seconds at level 1, about 4 by level 10, then 2.5.' },
  lr_word_pairs_faster_example: { ru: 'Проговаривать вслух перестаёт хватать примерно с восьмого уровня — связывай пару образом, это быстрее.', en: 'Saying them out loud stops fitting around level 8 — link the pair with an image instead, it is faster.' },
  lr_word_pairs_fifteen_title: { ru: 'Пятнадцать пар', en: 'Fifteen pairs' },
  lr_word_pairs_fifteen_rule: { ru: 'Список дорос до предела — пятнадцать пар. Дальше растёт только скорость показа.', en: 'The list has hit its ceiling — fifteen pairs. From here only the pace keeps rising.' },
  lr_word_pairs_fifteen_example: { ru: 'На таком объёме держать пары по отдельности уже нельзя: собирай их в цепочку, где каждая тянет следующую.', en: 'At this size you cannot hold pairs separately: chain them so each one pulls the next.' },
  // >>> LEVEL_RULES
  // <<< SCREEN_STRINGS

  // ── Экраны игр, снятые с `language === 'ru' ? … : …` (v1.130.0). Строка, выбранная
  // тернарником прямо в экране, знает два языка из двенадцати — остальным десяти
  // доставался английский. Гейт ci-i18n-hardcode-guard держит остаток долга.
  sspanLvlAuto: { ru: 'Ур. {n} — растёт сам (span → скорость показа → сетка 5×5)', en: 'Lv {n} — grows with results (span → show speed → 5×5 grid)' },
  cptTapAX: { ru: 'Жми только на X, если ПЕРЕД ней была A', en: 'Tap X only if it followed A' },
  cptTapX: { ru: 'Жми на каждую X. Не пропускай!', en: 'Tap every X. Don\'t miss!' },
  prlModeLevels: { ru: 'Уровни — прогрессия', en: 'Levels — progression' },
  prlModeClassic: { ru: 'Классический — диагностика', en: 'Classic — diagnostic' },
  modeLevels: { ru: 'Уровни', en: 'Levels' },
  modeClassic: { ru: 'Классический', en: 'Classic' },
  wcstModeClassicDesc: { ru: 'Стандартные параметры: правило меняется после 10 подряд. Для чистой метрики.', en: 'Standard params: rule switches after 10 in a row. For a clean metric.' },
  wcstModeLevelsDesc: { ru: 'Правило меняется всё чаще с уровнем. Держи персеверативные ошибки низкими.', en: 'Rule switches more often each level. Keep perseverative errors low.' },
  mrAxisZ: { ru: 'ось Z (плоско)', en: 'Z axis' },
  mrAxisXY: { ru: 'оси X+Y (наклоны)', en: 'X+Y axes' },
  mrAxisXYZ: { ru: 'оси X+Y+Z (3D)', en: 'X+Y+Z axes' },
  mrCubes: { ru: 'кубиков', en: 'cubes' },
  mrOblique: { ru: 'косые ракурсы', en: 'oblique' },
  bartClassicTitle: { ru: 'Классический замер (диагностика)', en: 'Classic run (diagnostic)' },
  bartClassicDesc: { ru: 'Фиксированные параметры — чистая метрика склонности к риску.', en: 'Fixed parameters — a clean risk-propensity metric.' },
  bartClassicBtn: { ru: 'Классический замер', en: 'Classic run' },
  bartRiskSafe: { ru: '🟢 Безопасно — копи дальше', en: '🟢 Safe — keep banking' },
  bartRiskCaution: { ru: '🟡 Внимание — pending растёт', en: '🟡 Caution — pending is growing' },
  bartRiskRisky: { ru: '🟠 Рискованно — может стоит cash?', en: '🟠 Risky — maybe cash out?' },
  bartRiskDanger: { ru: '🔴 Очень опасно — почти гарантированный взрыв', en: '🔴 Very dangerous — burst almost guaranteed' },
  chessPcWK: { ru: 'белый король', en: 'white king' },
  chessPcWQ: { ru: 'белый ферзь', en: 'white queen' },
  chessPcWR: { ru: 'белая ладья', en: 'white rook' },
  chessPcWB: { ru: 'белый слон', en: 'white bishop' },
  chessPcWN: { ru: 'белый конь', en: 'white knight' },
  chessPcWP: { ru: 'белая пешка', en: 'white pawn' },
  chessPcBK: { ru: 'чёрный король', en: 'black king' },
  chessPcBQ: { ru: 'чёрный ферзь', en: 'black queen' },
  chessPcBR: { ru: 'чёрная ладья', en: 'black rook' },
  chessPcBB: { ru: 'чёрный слон', en: 'black bishop' },
  chessPcBN: { ru: 'чёрный конь', en: 'black knight' },
  chessPcBP: { ru: 'чёрная пешка', en: 'black pawn' },
  chessStageFlash: { ru: 'Вспышка', en: 'Flash' },
  chessStageBlind: { ru: 'Слепые ходы', en: 'Blind moves' },
  chessStageLocate: { ru: 'Розыск', en: 'Locate' },
  chessQuestionShort: { ru: 'Вопрос', en: 'Q' },
  chessHintMemorize: { ru: 'Запомни позицию', en: 'Memorize the position' },
  chessHintBlindMoves: { ru: 'Фигуры ходят вслепую', en: 'Blind moves' },
  chessHintHidden: { ru: 'Фигуры скрыты…', en: 'Pieces are hidden…' },
  chessHintWhatSquare: { ru: 'Что стоит на подсвеченной клетке?', en: 'What is on the highlighted square?' },
  /**
   * Вопрос с ИМЕНЕМ поля. Подсветка остаётся, но вопрос на неё больше не
   * опирается: на скриншоте Дениса 03.09.2026 рамки не было ни одной, и понять,
   * про какую клетку спрашивают, было нельзя. Поле дописывается кодом сразу за
   * строкой, поэтому она кончается пробелом.
   */
  chessHintWhatSquareAt: { ru: 'Что стоит на клетке ', en: 'What is on square ' },
  chessHintWhereIs: { ru: 'Где {piece} {glyph}? Тапни клетку', en: 'Where is the {piece} {glyph}? Tap the square' },
  chessCfgPieces: { ru: 'фигур', en: 'pieces' },
  chessCfgExpose: { ru: 'показ', en: 'expose' },
  chessCfgBlindMoves: { ru: 'ходов вслепую', en: 'blind moves' },
  chessCfgQuizPick: { ru: 'вопрос «что здесь?»', en: '“what is here?” quiz' },
  chessCfgQuizLocate: { ru: 'вопрос «где фигура?»', en: '“where is it?” quiz' },
  chessBlindConfigDesc: { ru: 'Запомни позицию из реальной партии — фигуры замаскируются одинаковыми фишками. Держи в голове, какая фишка что, даже когда они ходят.', en: 'Memorize a position from a real game — the pieces get masked as identical tokens. Keep track of what each token is, even as they move.' },
  lspanConfigDesc: { ru: 'Слушай слова на изучаемом языке и повторяй их порядок по памяти. Слух + рабочая память.', en: 'Listen to words in your target language and recall them in order. Ear training + working memory.' },
  lspanLvlAuto: { ru: 'Ур. {n} — {s} слов на слух, растёт сам (больше слов → быстрее темп)', en: 'Lv {n} — {s} words by ear, grows with results (more words → faster pace)' },
  langToTrain: { ru: 'Какой язык учим', en: 'Language to train' },
  voiceMissing: { ru: 'Голос для этого языка не найден на устройстве — озвучка не сработает. Выбери другой язык.', en: 'No voice for this language found on the device — audio will not play. Pick another language.' },
  // ⚠️ Отдельно от voiceMissing нарочно: «нет голоса в системе» и «звук выключен»
  // лечатся по-разному, и одно сообщение на оба случая отправляет половину людей
  // ставить голос вместо того, чтобы тронуть тумблер.
  voiceSoundOff: { ru: 'Звук выключен, а это упражнение говорит. Включите звук в настройках.', en: 'Sound is off, and this exercise speaks. Turn sound on in settings.' },
  voiceMissingLang: { ru: 'Голос для языка «{lang}» не найден на устройстве. Выбери другой язык.', en: 'No voice for “{lang}” found on this device. Pick another language.' },
  lspanListening: { ru: 'Слушай...', en: 'Listen...' },
  lspanWord: { ru: 'Слово', en: 'Word' },
  lspanMemorizeHint: { ru: 'Запоминай слова и их порядок — экран их не покажет', en: 'Memorize the words and their order — the screen will not show them' },
  lspanRecallTitle: { ru: 'Что ты услышал?', en: 'What did you hear?' },
  lspanRecallHint: { ru: 'Тапай услышанные слова В ТОМ ЖЕ ПОРЯДКЕ ({i}-е из {n})', en: 'Tap the words you heard IN THE SAME ORDER ({i} of {n})' },
  pwEchoConfigDesc: { ru: 'Слушай выдуманное слово и выбери, как оно пишется. Тренирует фонологическую петлю — ключ к росту словаря.', en: 'Listen to a made-up word and pick its correct spelling. Trains the phonological loop — the key to vocabulary growth.' },
  pwEchoLvlAuto: { ru: 'Ур. {n} — растёт сам (длиннее слова → больше раундов)', en: 'Lv {n} — grows with results (longer words → more rounds)' },
  pwEchoUnsupportedNote: { ru: '中文 и हिन्दी пока не поддерживаются: для них нельзя честно собрать похожие варианты написания на слух.', en: '中文 and हिन्दी are not supported yet: sound-alike spelling options can’t be built fairly for those scripts.' },
  pwEchoPickSpelling: { ru: 'Выбери написание того, что услышал', en: 'Pick the spelling of what you heard' },
  replaySound: { ru: 'Ещё раз', en: 'Play again' },   // повтор ОЗВУЧКИ (playAgain уже занят перезапуском игры)
  phPairsConfigDesc: { ru: 'Слушай слово и выбери, что прозвучало — ship или sheep? Тренировка фонематического слуха.', en: 'Listen to the word and pick what you heard — ship or sheep? Trains phonemic hearing.' },
  phPairsLvlAuto: { ru: 'Ур. {n} — растёт сам: больше проб → все пары → без подсказок', en: 'Lv {n} — grows with results: more trials → all pairs → no visual hints' },
  phonemePairsShort: { ru: 'Фонемы: пары', en: 'Phoneme pairs' },
  phPairsPickHint: { ru: 'Что прозвучало? Выбери слово.', en: 'What did you hear? Pick the word.' },
  phPairsPlayed: { ru: 'Прозвучало: {w}', en: 'Played: {w}' },

  /**
   * СЕМЬ ИГР ИЗ ЛАБОРАТОРИИ, 19.08.2026. Ключи нужны КАРТОЧКЕ каталога и СПРАВКЕ «?»,
   * а не самим экранам: партию каждая из семи рисует своим словарём модуля
   * (`src/games/<игра>/core/i18n.ts`, ru+en). Исключение — «Одна линия»: её гейт
   * требует перевести шапку и подпись на `t()`, как только ключи заведены.
   *
   * ⚠️ Заводить ключ здесь — значит завести его И в десяти локалях
   * (`src/contexts/translations/*.ts`), иначе `i18n-coverage` роняет прогон.
   */
  pause: { ru: 'Глаза и дыхание', en: 'Eyes & breathing' },
  pauseDesc: { ru: 'Плюс лицо, осанка, расслабление и подвижность — короткая телесная пауза без оценок', en: 'Plus face, posture, relaxation and mobility — a short body pause with no scoring' },
  pauseIntroDesc: { ru: 'Выберите обстановку, минуты и что делать — приложение проведёт по шагам. Здесь ничего не измеряется и не оценивается: это отдых, а не проба.', en: 'Choose the setting, the minutes and what to practise — the app guides you step by step. Nothing here is measured or scored: this is rest, not a test.' },
  dotsConnect: { ru: 'Соедини точки', en: 'Dots Connect' },
  dotsConnectDesc: { ru: 'Соединяйте одинаковые точки непересекающимися путями и заполните всю сетку', en: 'Connect matching dots with non-crossing paths and fill the whole grid' },
  dotsConnectIntroDesc: {
    ru: 'Тренирует пространственное планирование: проложите для каждой пары свой путь без пересечений и пустых клеток.',
    en: 'Trains spatial planning: give every pair its own path without crossings or empty cells.',
  },

  oneLine: { ru: 'Одна линия', en: 'One Line' },
  oneLineDesc: { ru: 'Проведите одну непрерывную линию по всем рёбрам, не проходя ни одно дважды', en: 'Draw one continuous line across every edge without using any edge twice' },
  oneLineIntroDesc: {
    ru: 'Проведите одну непрерывную линию по каждому ребру графа ровно один раз. В вершины можно возвращаться, а вот пройденное ребро использовать второй раз нельзя. Место, где линии пересеклись на экране, вершиной не является — повернуть там не получится. Тренирует планирование маршрута: почти каждый ход законен сам по себе, но заводит в тупик, из которого остаток рёбер уже не собрать. С уровнями растёт не скорость, а сам граф: больше вершин, треугольники-развилки, запутаннее раскладка, а подсказка допустимого старта исчезает после третьего уровня.',
    en: 'Draw one continuous line across every edge of the graph exactly once. You may revisit vertices, but an edge you have already used is spent. A place where two lines cross on screen is not a vertex — you cannot turn there. Trains route planning: nearly every move is legal on its own, yet many lead to a dead end from which the remaining edges cannot be collected. Levels grow the graph rather than the speed: more vertices, triangle branches, more tangled layouts, and the hint that marks a legal start disappears after level three.',
  },

  // ⚠️ facesNamesDesc короткое НАМЕРЕННО: оно стоит подписью на карточке каталога,
  // где длинный текст обрезается. Развёрнутое — в facesNamesIntroDesc.
  facesNames: { ru: 'Лица и имена', en: 'Faces & Names' },
  facesNamesDesc: { ru: 'Свяжи лицо с именем и фактом', en: 'Link a face to a name and a fact' },
  facesNamesIntroDesc: {
    ru: 'Ассоциативная память: запомните процедурный портрет, точное имя и факт о человеке, а потом восстановите каждую часть отдельно. Это тот самый бытовой провал «лицо помню, а как зовут — нет»: узнать лицо и достать привязанное к нему слово — разные способности, и вторая проседает первой.',
    en: 'Associative memory: remember a procedural portrait, an exact name, and a fact about the person, then recall each part separately. This is the everyday failure “I know the face but not the name”: recognising a face and retrieving the word attached to it are different abilities, and the second one goes first.',
  },

  objectTracker: { ru: 'Трекер объектов', en: 'Object Tracker' },
  objectTrackerDesc: { ru: 'Следите за отмеченными объектами в движущейся группе и найдите их после остановки', en: 'Track marked objects in a moving group and identify them after motion stops' },
  objectTrackerIntroDesc: {
    ru: 'Тренирует динамическое внимание: запомните цели, удерживайте их в поле внимания во время движения и выберите после остановки.',
    en: 'Trains dynamic attention: memorize the targets, keep track of them during motion, and select them after they stop.',
  },

  navigator: { ru: 'Навигатор', en: 'Navigator' },
  navigatorDesc: { ru: 'Запоминайте маршруты, последовательности поворотов и направление к старту', en: 'Remember routes, turn sequences, and the direction back to the start' },
  navigatorIntroDesc: {
    ru: 'Тренирует пространственную память: изучите маршрут, мысленно удерживайте карту и восстановите путь или направление домой.',
    en: 'Trains spatial memory: study a route, maintain the mental map, and reconstruct the path or direction home.',
  },

  rhythmPitch: { ru: 'Ритм и высота', en: 'Rhythm & Pitch' },
  rhythmPitchDesc: { ru: 'Повторяйте ритмы и запоминайте последовательности высот — на слух, без микрофона', en: 'Echo rhythms and remember pitch sequences — by ear, no microphone' },
  rhythmPitchIntroDesc: {
    ru: 'Сначала короткая калибровка: четыре сигнала, по которым игра узнаёт задержку вашего устройства и громкость. Дальше уровни чередуются: в «эхе ритма» нужно повторить услышанный рисунок ударов в том же времени, в «пути высоты» — определить, выше или ниже второй звук, а затем восстановить последовательность из низких, средних и высоких тонов. Слов в задании нет вовсе, поэтому язык не влияет на сложность. Тренирует слуховую рабочую память и чувство времени. Нужен звук: наушники или колонка.',
    en: 'A short calibration comes first: four pulses let the game learn your device latency and volume. Then levels alternate: Rhythm Echo asks you to repeat the beat pattern you heard at the same timing, Pitch Path asks whether the second tone was higher or lower and later to rebuild a sequence of low, mid and high tones. There are no words at all, so language does not change the difficulty. Trains auditory working memory and a sense of timing. Sound is required: headphones or a speaker.',
  },

  memoryPalace: { ru: 'Дворец памяти', en: 'Memory Palace' },
  memoryPalaceDesc: { ru: 'Разложите предметы по маршруту и вспомните их вперёд и в обратном порядке', en: 'Place items along a route and recall them forward and in reverse' },
  memoryPalaceIntroDesc: {
    ru: 'Тренирует метод мест: изучите маршрут, свяжите каждый предмет с местом и восстановите их по местам в обе стороны.',
    en: 'Trains the method of loci: study a route, tie each item to a place, and recall them by location in both directions.',
  },

  // ── ЦЕЛЬ ДНЯ (карточка на главном экране) ──────────────────────────────────
  // Своими словами человека, а не наши цитаты: замысел — в шапке
  // src/services/dailyGoal.ts, показ — src/components/DailyGoalCard.tsx.
  // ⚠️ dayGoalTodayLine намеренно БЕЗ прошедшего времени («сегодня ты хотел»):
  // по-русски оно склоняется по роду, а приложение семейное — Валя прочитала бы
  // мужской род о себе. Именительный оборот работает у всех.
  dayGoalTitle: { ru: 'Цель дня', en: 'Goal for today' },
  dayGoalAsk: { ru: 'Ради чего сегодня?', en: 'What is today for?' },
  dayGoalAskHint: { ru: 'Одна строка своими словами — зачем тебе сегодняшняя тренировка. Её видишь только ты.', en: 'One line in your own words: what today’s training is for. Only you see it.' },
  dayGoalPlaceholder: { ru: 'Своими словами', en: 'In your own words' },
  dayGoalSave: { ru: 'Запомнить', en: 'Keep it' },
  dayGoalExamplesTitle: { ru: 'Так это может звучать:', en: 'It can sound like this:' },
  dayGoalExample1: { ru: 'не путать имена на встрече', en: 'not mixing up names at the meeting' },
  dayGoalExample2: { ru: 'держать счёт в уме на кассе', en: 'doing the sums in my head at the till' },
  dayGoalExample3: { ru: 'не терять мысль на середине фразы', en: 'not losing the thread mid-sentence' },
  dayGoalTodayLine: { ru: 'Твоя цель на сегодня:', en: 'Your goal for today:' },
  dayGoalRounds: { ru: 'Партий к ней сегодня: {n}', en: 'Rounds toward it today: {n}' },
  dayGoalRoundsNone: { ru: 'Партий сегодня пока нет', en: 'No rounds yet today' },
  dayGoalReview: { ru: 'Как вышло?', en: 'How did it go?' },
  dayGoalYes: { ru: 'Получилось', en: 'Did it' },
  dayGoalNo: { ru: 'Не сегодня', en: 'Not today' },
  dayGoalDoneNote: { ru: 'Отмечено. Завтра спросим снова.', en: 'Noted. We’ll ask again tomorrow.' },
  dayGoalMissedNote: { ru: 'Бывает. Цель никуда не делась — завтра тоже день.', en: 'That happens. The goal is still there — tomorrow is a day too.' },
  // ⚠️ Награда показывается ПОСЛЕ ответа и только у достигнутой цели: суммы на кнопках
  // исхода нет намеренно (запрет 4 в шапке DailyGoalCard.tsx). У «не сегодня» разговора
  // о деньгах нет вовсе — упоминание упущенного и было бы штрафом за честность.
  dayGoalRewardNote: { ru: '+{n} ⭐ за достигнутую цель', en: '+{n} ⭐ for the goal you reached' },
  dayGoalRewardNeedsRound: { ru: 'Очки за цель начисляют в день, когда были партии.', en: 'Goal points come on a day with rounds played.' },
  dayGoalCloseA11y: { ru: 'Убрать карточку цели на сегодня', en: 'Hide the goal card for today' },

  /**
   * ДОСКА ВСТАЛА — И СТРОКА НАЗЫВАЕТ ТОЛЬКО ТО, ЧТО ДЕЙСТВИТЕЛЬНО ВОЗМОЖНО.
   *
   * 🔴 `mahjongNoPairs` (выше) звал в две кнопки сразу и оставался единственным
   * текстом на все случаи. На 15+ уровне перетасовка одна, отмен три, а лента
   * отмены обнуляется самой перетасовкой — то есть обе названные кнопки могли
   * быть погашены. Замер 05.09.2026 (200 партий на уровень, случайный разбор):
   * без единого выхода заканчиваются 2 % партий на 20 уровне, 12 % на 25-м,
   * 26 % на 40-м. Какой из четырёх текстов показать, решает `mahjongStuckKey`
   * (`src/games/mahjong/stuck.ts`) — тем же кодом, что и набор кнопок.
   */
  mahjongStuckShuffle: {
    ru: 'Доступных пар нет — доска встала. Перемешай.',
    en: 'No pairs available — the board is stuck. Shuffle.',
  },
  mahjongStuckUndo: {
    ru: 'Доступных пар нет — доска встала. Отмени ход.',
    en: 'No pairs available — the board is stuck. Undo a move.',
  },
  mahjongStuckRestart: {
    ru: 'Доступных пар нет, перемешать и отменить нечем. Уровень придётся начать заново.',
    en: 'No pairs left, nothing to shuffle or undo. This level has to be restarted.',
  },
  mahjongRestartLevel: { ru: 'Начать уровень заново', en: 'Restart the level' },
  // >>> SCREEN_STRINGS
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
  /** AsyncStorage/URL language has been resolved; autostart games must wait for this. */
  ready: boolean;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>('en'); // база — English
  const [ready, setReady] = useState(false);

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
    } finally {
      setReady(true);
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
    <LanguageContext.Provider value={{ language, ready, setLanguage, t }}>
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
