import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

type Language = 'ru' | 'en';

interface Translations {
  [key: string]: {
    ru: string;
    en: string;
  };
}

const translations: Translations = {
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
  
  // Game descriptions
  schulteTableDesc: { ru: 'Поиск чисел от 1 до N', en: 'Find numbers from 1 to N' },
  wordPairsDesc: { ru: 'Запоминание пар слов', en: 'Memorize word pairs' },
  mnemonicsDesc: { ru: 'Слова и числа в порядке', en: 'Words and numbers in order' },
  counterDesc: { ru: 'Составление сумм X+Y=Z', en: 'Make sums X+Y=Z' },
  proofreadingDesc: { ru: 'Поиск заданных букв', en: 'Find specific letters' },
  targetsDesc: { ru: 'Реакция на цветные объекты', en: 'React to colored objects' },
  
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
    ru: 'Находите числа или буквы по порядку как можно быстрее. Это упражнение расширяет периферическое зрение и учит глаза быстро сканировать информацию.', 
    en: 'Find numbers or letters in order as fast as possible. This exercise expands peripheral vision and trains your eyes to quickly scan information.' 
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
  nBackDesc: { ru: 'Совпадает ли стимул с N шагов назад?', en: 'Does the stimulus match N steps back?' },
  nBackIntroDesc: {
    ru: 'Запоминайте последовательность вспышек на сетке. Когда текущая вспышка совпадает с той, что была N шагов назад, нажмите MATCH. Единственный научно валидированный тренажёр оперативной памяти.',
    en: 'Watch the flashing grid. When the current flash matches one N steps back, press MATCH. The only scientifically validated working-memory trainer.',
  },
  nLevelLabel: { ru: 'Глубина (N)', en: 'Depth (N)' },
  trialsLabel: { ru: 'Количество', en: 'Trials' },
  match: { ru: 'СОВПАДЕНИЕ', en: 'MATCH' },
  warmup: { ru: 'Запоминаем…', en: 'Warming up…' },
  nBackHint: { ru: 'Сравнивайте текущую вспышку с той, что была N шагов назад', en: 'Compare current flash with one N steps ago' },
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
  skillInhibition: { ru: 'Тренируем: торможение', en: 'Training: inhibition' },
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
  findHint: { ru: 'Нажимайте на отличия в правой картинке', en: 'Tap the differences on the right scene' },
  benefitFind1: { ru: 'Замечать важные детали', en: 'Notice important details' },
  benefitFind2: { ru: 'Лучше вычитывать тексты', en: 'Better at proofreading' },
  benefitFind3: { ru: 'Тренировать наблюдательность', en: 'Sharpen observation skills' },
  skillDetailAttention: { ru: 'Тренируем: детальное внимание', en: 'Training: detail attention' },

  // Sudoku
  sudoku: { ru: 'Судоку 6×6', en: 'Sudoku 6×6' },
  sudokuDesc: { ru: 'Цифры 1–6 в каждой строке, столбце и блоке', en: 'Digits 1–6 in each row, column and block' },
  sudokuIntroDesc: {
    ru: 'Заполните сетку так, чтобы цифры 1–6 встречались ровно один раз в каждой строке, каждом столбце и каждом блоке 2×3. Классический логический пазл.',
    en: 'Fill the grid so digits 1–6 appear exactly once in every row, column and 2×3 block. The classic logic puzzle.',
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
  cognitiveGames: { ru: 'Когнитивные игры', en: 'Cognitive Games' },
  trainYourBrain: { ru: 'Тренируйте мозг', en: 'Train Your Brain' },
  selectGame: { ru: 'Выберите игру', en: 'Select a Game' },
  gameResult: { ru: 'Результат игры', en: 'Game Result' },
  yourTime: { ru: 'Ваше время', en: 'Your Time' },
  yourScore: { ru: 'Ваш счёт', en: 'Your Score' },
  playAgain: { ru: 'Играть снова', en: 'Play Again' },
  goHome: { ru: 'На главную', en: 'Go Home' },
  configureGame: { ru: 'Настройка игры', en: 'Configure Game' },
  errors: { ru: 'Ошибки', en: 'Errors' },
  seconds: { ru: 'сек', en: 'sec' },

  // Categories
  catMemory:    { ru: 'Память',                en: 'Memory' },
  catAttention: { ru: 'Внимание',              en: 'Attention' },
  catLogic:     { ru: 'Логика и мышление',     en: 'Logic & Reasoning' },
  catControl:   { ru: 'Контроль и торможение', en: 'Control & Inhibition' },
  catMath:      { ru: 'Счёт',                  en: 'Mental Math' },
  catSpeed:     { ru: 'Скорость и реакция',    en: 'Speed & Reaction' },

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
  visualSearchDesc:   { ru: 'Найдите T среди множества L',          en: 'Find T among many Ls' },
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
    ru: 'На поле много букв L под разными углами. Спрятана одна буква T — нажмите на неё. Чем больше дистракторов, тем дольше поиск. Классическая парадигма селективного внимания.',
    en: 'A field is filled with rotated Ls. A single T is hidden — tap it. The more distractors, the longer the search. A classic selective-attention paradigm.'
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
  visualSearchHint:  { ru: 'Найдите букву T среди L и нажмите её', en: 'Find the T among Ls and tap it' },
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

  // Round-5 — descriptions
  towerLondonDesc: { ru: 'Переставьте шары за минимум ходов',         en: 'Rearrange balls in minimum moves' },
  corsiDesc:       { ru: 'Повторите последовательность блоков',       en: 'Repeat the block sequence' },
  wcstDesc:        { ru: 'Найдите скрытое правило сортировки',        en: 'Find the hidden sorting rule' },
  flankerDesc:     { ru: 'Реагируйте на центральную стрелку',         en: 'React to the central arrow' },
  ospanDesc:       { ru: 'Решайте уравнения и помните буквы',         en: 'Solve equations, remember letters' },

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
  gridSize:       { ru: 'Размер сетки', en: 'Grid size' },

  // Round 7 — CPT
  cpt:            { ru: 'CPT: устойчивое внимание', en: 'CPT: Sustained Attention' },
  cptDesc:        { ru: 'Реагируй на все буквы, кроме X', en: 'Respond to all letters except X' },
  cptIntroDesc: {
    ru: 'Conners CPT — золотой стандарт измерения устойчивого внимания (sustained attention) и импульс-контроля. Каждые 1-2 секунды появляется буква. Тапни на ЛЮБУЮ букву кроме X (X = не реагировать). 4-12 минут непрерывной работы. Получаешь 5 биомаркеров: omission errors (внимание), commission errors (импульсивность), mean RT, RT variability (CV-RT — самый сильный ADHD-маркер), vigilance decrement (slope RT по квартилям — падает ли внимание к концу). Это критически важная игра для оценки выносливости в NZT-режиме 4-6ч.',
    en: 'Conners CPT — gold standard for sustained attention and impulse control. Every 1-2 seconds a letter appears. Tap ANY letter except X (X = withhold response). 4-12 minutes continuous. 5 biomarkers: omission errors (attention), commission errors (impulsivity), mean RT, RT variability (CV-RT — strongest ADHD marker), vigilance decrement (slope of RT across quartiles — does attention drop?). Critical for measuring endurance in NZT 4-6h regime.'
  },
  cptDuration:    { ru: 'Длительность', en: 'Duration' },
  cptStrenuous:   { ru: 'Это утомительная задача — оптимально с утра, не вечером', en: 'This is a strenuous task — best in the morning, not evening' },
  cptHint:        { ru: 'Тапни по экрану на ЛЮБОЙ букве, кроме X', en: 'Tap the screen on ANY letter except X' },

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
  rmetNote:        { ru: 'Замена для оригинала с фотографиями: emoji + микро-контекст. Психометрически направление верное, точные нормы могут отличаться.',
                    en: 'Substitute for original photo set: emoji + micro-context. Psychometric direction valid; exact norms may differ.' },
  rmetHint:        { ru: 'Какая эмоция? Выбери одну', en: 'Which emotion? Pick one' },
  benefitRmet1:    { ru: 'Cognitive empathy',         en: 'Cognitive empathy' },
  benefitRmet2:    { ru: 'Theory of Mind',            en: 'Theory of Mind' },
  benefitRmet3:    { ru: 'Переговоры и коммуникация', en: 'Negotiations and communication' },

  skillSocial:     { ru: 'Тренируем: социальное познание', en: 'Training: social cognition' },
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>('ru');

  useEffect(() => {
    loadLanguage();
  }, []);

  const loadLanguage = async () => {
    try {
      const savedLang = await AsyncStorage.getItem('language');
      if (savedLang === 'ru' || savedLang === 'en') {
        setLanguageState(savedLang);
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

  const t = (key: string): string => {
    const translation = translations[key];
    if (translation) {
      return translation[language];
    }
    return key;
  };

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
