/**
 * whatsNew — история версий для пользователя: модалка «Что нового» после
 * обновления + экран истории в настройках (запрос Дениса 23.07).
 *
 * Поддерживается руками при каждом релизе: короткие человеческие пункты
 * (не коммиты). ru/en — история версий техническая, на остальных языках
 * показывается en (переводить каждый релиз на 12 языков нереально).
 * Держим последние ~10 значимых версий, старое вычищаем.
 */
export interface WhatsNewEntry {
  version: string;        // '1.148.0'
  date: string;           // '2026-07-24'
  ru: string[];
  en: string[];
}

export const WHATS_NEW: WhatsNewEntry[] = [
  {
    version: '1.242.0',
    date: '2026-08-27',
    ru: [
      'Зарядка перенесена из «Умного будильника» целиком: её планировщик, её картинки, её траектория взгляда, её параллельный режим — а не пересобранная копия',
      'Гимнастика глаз снова водит взглядом за движущейся точкой: в пересобранной версии на её месте оказалась фигура дыхания',
      'Пауза приложения останавливает и практику: свернули или вышли — время стоит',
    ],
    en: [
      'The warm-up now comes whole from the Smart Alarm: its planner, its artwork, its gaze path, its parallel mode — not a rebuilt copy',
      'Eye gym leads the gaze along a moving dot again; the rebuilt version had a breathing figure in its place',
      'Pausing the app pauses the practice: minimise or step away and the clock stops',
    ],
  },
  {
    version: '1.241.0',
    date: '2026-08-27',
    ru: [
      'Зарядка получила картинки: тело с подсвеченной зоной, снимки поз, фигура дыхания — раньше на месте картинки стоял один значок',
      'Время шага теперь идёт рамкой вокруг картинки, а у практик со сжатием и отпусканием рамка многоугольная: сторона = фаза',
      'Секунды текущего шага видно прямо у его названия',
    ],
    en: [
      'The warm-up got its artwork: a body with the working zone lit, posture photos, a breathing figure — there used to be a single glyph instead',
      'Step time now runs as a frame around the artwork; for squeeze-and-release practices the frame is a polygon: one side per phase',
      'Seconds left in the current step are shown right next to its name',
    ],
  },
  {
    version: '1.240.3',
    date: '2026-08-27',
    ru: [
      '«Слепые шахматы» стали «Доской в уме»: позиции теперь из настоящих партий, а не случайная россыпь фигур — на случайной расстановке тренировать было нечего',
      'В режиме розыска больше не бывает партий, где вопросов меньше трёх',
    ],
    en: [
      'Blindfold Chess is now Board in Mind: positions come from real games instead of a random scatter of pieces — a random placement had nothing to train',
      'The search mode no longer produces games with fewer than three questions',
    ],
  },
  {
    version: '1.240.2',
    date: '2026-08-27',
    ru: [
      'Ханойская башня: цель по ходам была завышена — на поздних уровнях показывалось 4095 вместо 47, и три звезды давались за любое решение. Теперь минимум считается честно',
      'Ханойская башня стала видна: доска во весь экран, диски разного цвета по размеру и крупнее, стержни читаются как предмет',
    ],
    en: [
      'Tower of Hanoi: the move target was inflated — later levels showed 4095 instead of 47, and three stars were given for any solution. The minimum is now computed honestly',
      'Tower of Hanoi is finally visible: full-height board, discs coloured by size and larger, pegs read as objects',
    ],
  },
  {
    version: '1.240.1',
    date: '2026-08-27',
    ru: [
      'Заставка между уровнями могла уронить игру на некоторых экранах — награда за пройденный уровень больше не пропадает',
    ],
    en: [
      'The between-levels screen could crash the game on some screens — the reward for finishing a level no longer disappears',
    ],
  },
  {
    version: '1.240.0',
    date: '2026-08-26',
    ru: [
      'Экран между уровнями стал наградой: девять новых городов — шахматный, сладкий, книжный, розовый и другие; свой город профиля приходит вехой',
      'Переход держится дольше — успеваешь рассмотреть картину, а не только заметить её',
    ],
    en: [
      'The between-levels screen is now a reward: nine new cities — chess, candy, book, rose and more; your profile city returns as a milestone',
      'The transition lasts longer — enough time to actually look at the artwork',
    ],
  },
  {
    version: '1.239.3',
    date: '2026-08-26',
    ru: [
      'Экран перехода между уровнями: картинка занимала половину экрана и обрывалась — теперь кроет его целиком',
    ],
    en: [
      'Level transition screen: the artwork covered only half the screen and cut off — now it fills it completely',
    ],
  },
  {
    version: '1.239.2',
    date: '2026-08-26',
    ru: [
      'Фон профиля наконец кроет весь экран — раньше он рисовался в натуральную величину и обрывался полосой',
    ],
    en: [
      'The profile background finally covers the whole screen — it used to render at its natural size and cut off as a strip',
    ],
  },
  {
    version: '1.239.1',
    date: '2026-08-26',
    ru: [
      'Фон профиля заливает весь экран, а не полосу сверху — и на телефоне тоже',
      '«Пауза» переименована в «Глаза и дыхание»: главное вынесено в заголовок',
    ],
    en: [
      'The profile background fills the whole screen instead of a strip at the top — on phones too',
      'Pause is now called Eyes & breathing: what matters moved into the title',
    ],
  },
  {
    version: '1.239.0',
    date: '2026-08-26',
    ru: [
      'Фон профиля теперь заливает весь экран, а не полосу сверху — и на телефоне тоже',
      '«Пауза» переименована в «Глаза и дыхание»: главное вынесено в заголовок, а не спрятано в мелкой строке',
    ],
    en: [
      'The profile background now fills the whole screen instead of a strip at the top — on phones too',
      'Pause is now called Eyes & breathing: what matters moved into the title instead of hiding in small print',
    ],
  },
  {
    version: '1.238.0',
    date: '2026-08-26',
    ru: [
      'У каждого профиля свой фон главной: у «Предпринимателей» утренний город, у «Шахматиста» солнечная доска, у «Микро-релакса» шёлк',
      'Значки профилей перерисованы и стали читаемыми в мелком размере; надпись PsyGames больше не тонет в тёмной плашке',
      '«Гимнастика глаз» и «Дыхание» слились в одну кнопку «Пауза» — обе остались практиками внутри неё, а третьей встал «Вызов дня»',
      'Судоку: новый вариант «Небоскрёбы» — цифра это высота здания, подсказка с края говорит, сколько зданий видно',
    ],
    en: [
      'Every profile now has its own home background: a morning city for Entrepreneurs, a sunlit board for the Chess Player, silk for Micro-relax',
      'Profile badges redrawn to stay readable at small sizes, and the PsyGames wordmark no longer sinks into a dark plate',
      'Eye gym and Breathing merged into a single Pause button — both remain practices inside it, and Daily challenge took the third slot',
      'Sudoku: a new Towers variant — a digit is a building height, and the edge clue says how many buildings are visible',
    ],
  },
  {
    version: '1.237.0',
    date: '2026-08-26',
    ru: [
      "Новое упражнение «Пауза»: дыхание, глаза, лицо, расслабление и подвижность — короткий телесный отдых без оценок",
      "Судоку: уровень больше не обещает сложность, которую не может выдать — доска чаще соответствует своей ступени",
      "Судоку: доска с двумя решениями больше не пройдёт — вы не потеряете жизнь за верный ход",
      "«Сортировка слов» перестала повторять слова: раньше одно могло выпасть дважды за партию",
    ],
    en: [
      "New exercise «Pause»: breathing, eyes, face, relaxation and mobility — a short body rest with no scoring",
      "Sudoku: a level no longer promises a difficulty it cannot deliver — boards match their rung far more often",
      "Sudoku: a board with two solutions can no longer slip through — you won't lose a life for a correct move",
      "Word Sort stopped repeating words: one could previously appear twice in a single round",
    ],
  },
  {
    version: '1.236.0',
    date: '2026-08-23',
    ru: [
      "Судоку: классика выдаётся мгновенно — было до трёх секунд ожидания",
      "Судоку с термометрами и джигсо: вдвое меньше ждать, а верхние уровни стали по-настоящему сложными",
      "«Соединение точек»: первые шесть уровней решаются рассуждением, а не перебором",
      "«Чтение с удержанием»: предложения не повторяются, пока не кончится запас",
    ],
    en: [
      "Sudoku: classic boards appear instantly — it used to take up to three seconds",
      "Sudoku with thermometers and jigsaw: half the wait, and top levels are genuinely hard now",
      "Dot Connect: the first six levels are solved by reasoning, not by trying options",
      "Reading Span: sentences no longer repeat until the pool runs out",
    ],
  },
  {
    version: '1.235.0',
    date: '2026-08-23',
    ru: [
      "«Шахматы вслепую» перестали быть памятью на случайные фигуры. Теперь это три задания подряд на ОДНОЙ позиции из настоящей партии: сравнить два поля по цвету, понять, дойдёт ли конь за столько-то ходов, вспомнить, что стояло на поле. Разница во времени между заданиями и показывает, чего вам стоит правило хода и чего — держать позицию в голове",
      "Позиции взяты из базы реальных партий: на случайной расстановке памяти не за что зацепиться, и такая проба меряет только объём",
      "Доски во время вопросов на экране нет — она живёт в голове, иначе это не проверка визуализации",
      "Маджонг: 34 разные раскладки вместо семи, нарисованных формулой. И главное — раздача теперь собирается так, что доска гарантированно разбирается: мёртвых раскладов больше нет по построению, а не по проверке",
    ],
    en: [
      "Blindfold Chess is no longer memory for random pieces. It is now three tasks in a row on ONE position from a real game: compare two squares by colour, tell whether a knight gets there in so many moves, recall what stood on a square. The time difference between tasks is what shows the cost of the move rule and the cost of holding the position in your head",
      "The positions come from a database of real games: on a random placement memory has nothing to grip, and such a test measures only raw capacity",
      "There is no board on screen during the questions — it lives in your head, otherwise it is not a visualization test",
      "Mahjong: 34 different layouts instead of seven drawn by formula. And more importantly, deals are now built so the board is guaranteed to clear: dead boards are gone by construction, not by a check",
    ],
  },
  {
    version: '1.234.0',
    date: '2026-08-23',
    ru: [
      "Шесть упражнений мерили не то, что обещали. Чем выше был уровень, тем меньше становилась величина, ради которой упражнение существует: в Струпе на верхних уровнях почти не оставалось обычных проб, без которых интерференцию не с чем сравнить. Теперь сложность растёт темпом и объёмом, а не подменой состава проб",
      "«Стоп-сигнал» назывался торможением и торможения не измерял: у быстрого человека сигнал успевал остановить его в 14% случаев, у медленного в 99% — то есть игра мерила скорость руки. Теперь задержка подстраивается под вас и сходится к половине удачных торможений у любого",
      "Внимание (CPT): первые три уровня нельзя было пройти в принципе — за отведённое время физически не набиралось нужного числа проб. Исправлено",
      "Внимание (CPT): целей на деле было втрое меньше обещанного, а описание игры говорило про обратную задачу — «жми на всё кроме X», чего игра никогда не делала",
      "Серии Шульте и корректурки появились в «Зарядке» рядом с «Оценкой» и FIN BRAIN. Серию корректурки до этого нельзя было запустить ниоткуда, кроме кнопки внутри самой игры",
    ],
    en: [
      "Six exercises were not measuring what they promised. The higher the level, the smaller the very quantity the exercise exists for: in Stroop the upper levels left almost no ordinary trials, and without them interference has nothing to compare against. Difficulty now grows through pace and volume, not by swapping the mix of trials",
      "Stop-signal was called inhibition and did not measure inhibition: a fast person was stopped in 14% of trials, a slow one in 99% — the game measured hand speed. The delay now adapts to you and converges to half successful stops for anyone",
      "Attention (CPT): the first three levels could not be passed at all — the allotted time physically did not fit the required number of trials. Fixed",
      "Attention (CPT): there were three times fewer targets than stated, and the game description described the opposite task — «tap everything except X», which the game never did",
      "The Schulte and proofreading series now sit in Warm-up next to Assessment and FIN BRAIN. The proofreading series previously could not be started from anywhere but a button inside the game itself",
    ],
  },
  {
    version: '1.233.0',
    date: '2026-08-23',
    ru: [
      "Корректурка пошла серией из трёх режимов на ОДНОМ поле: сперва найти букву, потом найти в той же сетке слова, потом — только слова нужной категории. Разница во времени между режимами показывает, чего вам стоит разбить строку на слова и чего стоит понять их смысл",
      "В режиме «Смысл» на поле лежат и нужные слова, и чужие — причём такой же длины. Иначе достаточно было бы найти любое слово, не думая о смысле",
    ],
    en: [
      "Proofreading now runs as a series of three modes on ONE field: first find a letter, then find words in the same grid, then only words of a given category. The time difference between modes shows what it costs you to split a string into words, and what it costs to grasp their meaning",
      "In the «meaning» mode the grid holds both the wanted words and foreign ones — of the same length. Otherwise finding any word would be enough, with no thinking about meaning",
    ],
  },
  {
    version: '1.232.0',
    date: '2026-08-23',
    ru: [
      "«Оценка» и FIN BRAIN переехали в «Зарядку»: обе — не игра, а набор игр подряд с одним итогом, то есть ровно то, чем зарядка и является. Раньше это были два входа в один и тот же механизм",
      "Шульте научился идти серией: три блока на ОДНОМ поле — сперва по порядку, потом с чередованием двух рядов, потом поиск пары с нужной суммой. Разница во времени между блоками и показывает, чего вам стоит переключение и удержание в уме",
      "«Цифровой ряд»: третий режим — вводить цифры по возрастанию; подача голосом вместо экрана; взятая длина и рекорд видны прямо в партии, а не только в конце; в свободной игре можно менять темп показа",
      "«Ментальная ротация»: два новых задания — угадать вид фигуры сверху и понять, какой куб сложится из выкройки. После промаха фигура сама проворачивается до правильного ответа, шаг за шагом — видно, почему он правильный",
      "«Ментальная ротация»: две фигуры набора оказались поворотами друг друга — то есть «неправильный» вариант иногда был вторым правильным. Фигура заменена",
      "«Соединение точек»: можно посмотреть решение. Партия после этого не засчитывается — подсмотреть можно, купить прогресс нельзя",
      "n-back показывает d′ — величину, которая отделяет настоящее различение от везения. Точность в процентах смешивает попадания с угадыванием: 90% бывает и у отличной игры, и у осторожного молчуна",
      "Струп: кнопки ответа стали просто цветными плашками. Подписи возвращали в ответ чтение слова — то самое, что этот тест как раз и гасит",
    ],
    en: [
      "Assessment and FIN BRAIN moved into Warm-up: neither is a game, both are a run of games with a single result — exactly what the warm-up is. They used to be two doors into the same machine",
      "Schulte can now run as a series: three blocks on ONE field — in order, then alternating two rows, then finding a pair with a given sum. The time difference between blocks is what shows the cost of switching and of holding a number in mind",
      "Digit span: a third mode — enter the digits in ascending order; spoken digits instead of the screen; your span and record are visible during the round, not only at the end; in free play you can change the pace",
      "Mental rotation: two new tasks — pick the top view of a shape, and tell which cube a flat net folds into. After a miss the reference shape rotates itself to the right answer, step by step, so you see why it is right",
      "Mental rotation: two shapes in the set turned out to be rotations of each other — meaning a «wrong» option was sometimes a second right one. The shape was replaced",
      "Dots connect: you can reveal the solution. The round then does not count — looking is allowed, buying progress is not",
      "n-back now shows d′, the number that separates real discrimination from luck. Percent accuracy mixes hits with guessing: 90% fits both a great round and a cautious player who rarely answers",
      "Stroop: the answer buttons are plain colour patches now. The labels put word-reading back into the answer — the very thing this test is meant to suppress",
    ],
  },
  {
    version: '1.231.0',
    date: '2026-08-22',
    ru: [
      "«Одна линия» перестала быть клубком: раньше игра нарочно выбирала самую запутанную раскладку — 196 пересечений линий на доску против одного у рисованных фигур. Теперь рисунок читается, фигур сорок вместо двенадцати, а уровней восемьдесят вместо сорока восьми",
      "«Одна линия»: линия тянется за пальцем, и каждый взятый отрезок отзывается тиком",
      "Маджонг: копий одного рисунка стало четыре, как в настоящем наборе — раньше на верхних уровнях их было двенадцать, и пара находилась взглядом мгновенно",
      "Судоку показывает приём ИМЕННО этой доски, а не ярлык по номеру уровня: слово «extreme» стояло на двадцати четырёх уровнях подряд и на шести разных правилах",
      "«Мишени»: купленная вторая жизнь больше не открывает уровни — доиграть она помогает, а прогресс за неё не покупается",
      "«Спан цифр» останавливался после двух ошибок за всю партию вместо двух на одной длине — из-за этого спан замерялся короче настоящего",
      "Батарея оценки берёт партию, сыгранную в предписанных настройках: раньше «Спан цифр» назад на трудной шёл в отчёт как прямой на средней и сравнивался с чужой нормой",
    ],
    en: [
      "One Line stopped being a tangle: the game used to deliberately pick the most crossed layout — 196 line crossings per board against one in the hand-drawn figures. The drawing is readable now, there are forty figures instead of twelve and eighty levels instead of forty-eight",
      "One Line: the line follows your finger, and every segment you take answers with a click",
      "Mahjong: four copies of each design, as in a real set — the upper levels used to have twelve, and a pair was spotted instantly",
      "Sudoku shows the technique THIS board actually needs instead of a label derived from the level number: the word «extreme» covered twenty-four levels in a row and six different rules",
      "Targets: a purchased second life no longer unlocks levels — it helps you finish the round, it does not buy progress",
      "Digit span used to stop after two errors in the whole game instead of two at the same length, which measured the span shorter than it is",
      "The assessment battery now takes a round played in the prescribed setup: digit span backward on hard used to enter the report as forward on medium and be compared against the wrong norm",
    ],
  },
  {
    version: '1.230.0',
    date: '2026-08-22',
    ru: [
      "Маджонг перестал быть плоским: раньше на втором уровне лежали десять плиток в один слой — это не маджонг, там нечего разбирать. Теперь горка с первого уровня, семь разных силуэтов (черепаха, пирамида, крепость, мост, паук, бабочка, ромб) и полный набор в 144 плитки к сороковому",
      "Маджонг показывает, сколько пар ещё можно собрать: каждая третья партия упиралась в мёртвую доску, и игра об этом никак не сообщала",
      "«Соедини точки» стала настоящей игрой: поле от 5×5 к 10×10, четырнадцать цветов вместо восьми, и уровень засчитывается только когда линии закрыли всю доску",
      "«Одна линия»: двадцать четыре рисованные фигуры вместо двенадцати, и первая — не треугольник из трёх точек, а настоящий узор",
      "Новый режим «Филворды» в «Корректурной пробе»: поле букв, слово выделяется пальцем, уровень закрыт, когда разобрана каждая буква",
      "Судоку выше сорок первого уровня: доска теперь гарантированно берётся логикой без перебора, а двадцать уровней подряд перестали быть неотличимыми друг от друга",
      "Судоку больше не замирает молча на тяжёлых уровнях — пока доска собирается, экран говорит об этом и не отнимает кнопку «назад»",
      "Самурай перестал наказывать вслепую: почти половина неверных цифр отнимала жизнь, не оставляя на доске ни одной пометки",
      "«Вызов дня» больше не играет первый уровень у всех — уровень успевает загрузиться до старта",
      "Тропинка уровней дотягивается до достигнутого: пройденное выше пятнадцатого можно переиграть, раньше его просто не было на карте",
      "Партии перестали теряться: при одновременной записи из двенадцати сохранялась одна",
      "Сортировка товаров: подсказка больше не показывает ход, который игра сама же отвергнет, а доска не приезжает с уже сложенной тройкой",
    ],
    en: [
      "Mahjong stopped being flat: level two used to lay out ten tiles in a single layer — that is not mahjong, there is nothing to dismantle. Now it is a proper pile from level one, with seven silhouettes (turtle, pyramid, fortress, bridge, spider, butterfly, diamond) and the full 144-tile set by level forty",
      "Mahjong shows how many pairs are still available: every third game used to reach a dead board with no word from the game",
      "Dots Connect became a real game: the grid grows from 5×5 to 10×10, fourteen colours instead of eight, and a level counts only when the lines cover the whole board",
      "One Line: twenty-four hand-drawn figures instead of twelve, and the first is a real pattern rather than a three-dot triangle",
      "A new Fillwords mode inside Proofreading: a grid of letters, words traced with a finger, the level cleared when every letter is used",
      "Sudoku above level forty-one: a board is now guaranteed to be solvable by logic without guessing, and twenty levels in a row stopped being indistinguishable",
      "Sudoku no longer freezes silently on hard levels — while the board is being built the screen says so and keeps the back button alive",
      "Samurai stopped punishing blind: nearly half of all wrong digits took a life without leaving a single mark on the board",
      "The Daily Challenge no longer plays level one for everyone — the level now loads before the game starts",
      "The level path reaches what you have achieved: anything cleared above fifteen can be replayed, it simply was not on the map before",
      "Games stopped getting lost: of twelve simultaneous saves only one survived",
      "Goods sort: the hint no longer points at a move the game itself refuses, and the board no longer arrives with a triple already made",
    ],
  },
  {
    version: '1.229.0',
    date: '2026-08-22',
    ru: [
      "«Беглость речи» не работала вообще: счёт всегда выходил нулём, а на десяти языках игра просила слова той письменностью, которую сама же и не принимала",
      "Словарь с интервальным повторением намертво вешал приложение, если у двух слов совпадал перевод",
      "Выбор языка предлагал одиннадцать, а словарей хватало на семь: четыре игры вставали, и в зарядке из такого экрана нельзя было даже выйти",
      "«Мишени»: с 21-го уровня мишень появлялась в каждом раунде — жать всегда было безошибочной стратегией; и экран поздравлял победой после полного проигрыша",
      "Кнопка «Стоп» больше не решает судьбу уровня по-своему в каждой игре: оборванная партия не двигает уровень ни вверх, ни вниз",
      "«Ритм и высота»: один пропущенный удар в середине обнулял партию, тот же пропуск в конце стоил одной шестой — теперь ошибка стоит одинаково, где бы ни случилась",
      "Настройка задержки звука перестала угадывать по неполному набору щелчков: раньше промах по первому щелчку молча отнимал две трети у каждой следующей партии",
      "Судоку-самурай перестал наказывать вслепую: почти половина неверных цифр отнимала жизнь, не оставляя на доске ни одной пометки",
      "«Пересказ»: одно ключевое слово было написано с латинской буквой внутри и не набиралось ни при какой раскладке; и безупречный пересказ мог дать «ошибку» из-за повторов в списке ключей",
      "«Тропинки»: на небольших экранах узлы налезали друг на друга в девяти раскладках из десяти — узел прятался под соседом и не нажимался",
    ],
    en: [
      "Verbal fluency did not work at all: the score always came out zero, and in ten languages the game asked for words in a script it refused to accept",
      "The spaced-repetition vocabulary froze the app outright when two words shared a translation",
      "The language picker offered eleven languages while only seven had dictionaries: four games stalled, and in a warm-up step that screen had no way out",
      "Targets: from level 21 a target appeared in every round, making «always press» a flawless strategy; and the screen congratulated you after a complete loss",
      "The Stop button no longer decides a level's fate differently in every game: an interrupted round moves the level neither up nor down",
      "Rhythm and pitch: one missed beat in the middle zeroed the round while the same miss at the end cost a sixth — a mistake now costs the same wherever it happens",
      "Audio latency calibration no longer guesses from an incomplete set of clicks: missing the first click used to silently cost two thirds of every later round",
      "Samurai sudoku stopped punishing blind: nearly half of all wrong digits took a life without leaving a single mark on the board",
      "Story recall: one keyword was spelled with a Latin letter inside and could not be typed on any keyboard; and a flawless retelling could still register an «error» because of duplicates in the key list",
      "Trails: on smaller screens nodes overlapped in nine layouts out of ten — a node hid under its neighbour and could not be tapped",
    ],
  },
  {
    version: '1.228.0',
    date: '2026-08-22',
    ru: [
      "Судоку больше не отнимает жизнь молча: если цифра не подошла, игра говорит, какое правило её не пускает — а когда доказать нечем, честно пишет, что конфликт не местный",
      "Правило «сэндвича» переписано: «сумма цифр между 1 и 9» читалось как «цифр от 1 до 9» (а их сумма всегда 45), и подсказка выглядела бессмысленной",
      "Маджонг: 4–11% раскладов были неразбираемы, и перетасовка не спасала — теперь расклад пересобирается, а неудачная перетасовка не тратится",
      "Сортировка товаров: 57 уровней из 200 выдавались без единой свободной ниши, перемешивание теряло товар, а доска могла молча встать — всё это починено, и про тупик теперь говорят вслух",
      "«Дворец памяти» отвечает на касание места, а не только предмета — порядок теперь любой",
      "«Одна линия»: линия рисуется пальцем вдоль ребра, появились двойные и односторонние рёбра, двенадцать рисованных фигур и счёт, который сползает к нулю",
    ],
    en: [
      "Sudoku no longer takes a life in silence: when a digit is refused, the game names the rule that blocks it — and when it cannot prove one, it honestly says the conflict is not local",
      "The sandwich rule was rewritten: «sum of digits between 1 and 9» read as «digits 1 through 9» (which always add to 45), making the clue look meaningless",
      "Mahjong: 4–11% of deals were unsolvable and shuffling did not help — deals are now rebuilt, and a failed shuffle is not spent",
      "Goods sort: 57 levels out of 200 shipped without a single free niche, shuffling lost goods, and the board could silently lock — all fixed, and dead ends are now announced",
      "Memory Palace responds to tapping a spot, not only an item — either order works now",
      "One Line: the line follows your finger along the edge, double and one-way edges appeared, twelve hand-drawn shapes, and a score that drains to zero",
    ],
  },
  {
    version: '1.227.0',
    date: '2026-08-22',
    ru: [
      "Сырые игры больше не попадают в зарядку и в вызов дня — вчера их убрали с витрины, но три дороги к ним остались открытыми",
    ],
    en: [
      "Raw games no longer show up in warm-ups or the daily challenge — they left the shelf yesterday, but three paths to them stayed open",
    ],
  },
  {
    version: '1.226.0',
    date: '2026-08-22',
    ru: [
      "Выключенный звук больше не игнорируется речью: упражнение честно скажет, что ему нужен звук, вместо того чтобы молчать",
      "Двойной n-back не включается без речи — раньше немой поток обнулял результат ни за что",
      "«Поиск» считается с дальтонизмом: цвета конъюнкции разведены под все три вида",
    ],
    en: [
      "Sound off is no longer ignored by speech: the exercise says it needs sound instead of going quiet",
      "Dual n-back no longer starts without speech — a mute stream used to zero your result for nothing",
      "Visual Search respects colour blindness: the conjunction colours now separate under all three types",
    ],
  },
  {
    version: '1.225.0',
    date: '2026-08-22',
    ru: [
      "«Соедини точки» наконец про точки: концы пар — кружки, путь — линия, а не залитые квадраты",
      "Струп теперь играется при дальтонизме: раньше два цвета из четырёх сливались, и верный ответ был невозможен",
      "Семь сырых игр убраны с глаз в песочницу — в наборах остаётся только отработанное",
    ],
    en: [
      "Connect the Dots is finally about dots: endpoints are circles and the path is a line, not filled squares",
      "Stroop is now playable with colour blindness: two of the four inks used to merge, making a correct answer impossible",
      "Seven raw games moved into a sandbox — the sets now hold only finished exercises",
    ],
  },
  {
    version: '1.224.0',
    date: '2026-08-21',
    ru: [
      "Судоку вернулось в «Микро-релакс», «Дети» и «Шахматист», а Корси — в «Шахматист»: их убрал с меню наш же вход-развилка",
    ],
    en: [
      "Sudoku is back in Micro-relax, Kids and Chess Player, and Corsi is back in Chess Player: our own hub entry had hidden them from the menu",
    ],
  },
  {
    version: '1.223.0',
    date: '2026-08-21',
    ru: [
      "Заголовок и подпись на экране достижений переведены на все двенадцать языков — раньше десяти из них доставался английский",
    ],
    en: [
      "The achievements screen header and footer are translated into all twelve languages — ten of them used to get English",
    ],
  },
  {
    version: '1.222.0',
    date: '2026-08-21',
    ru: [
      "Экран достижений говорил по-русски со всеми, кроме англичан — теперь на своём языке, и дата открытия по-человечески",
      "В магазине кнопка «Применить» выглядела рабочей, когда применять нечего",
    ],
    en: [
      "The achievements screen spoke Russian to everyone but English speakers — now it uses your language, and the unlock date reads like a date",
      "In the shop, the Use button looked ready when there was nothing to use",
    ],
  },
  {
    version: '1.221.0',
    date: '2026-08-21',
    ru: [
      "Семнадцать карточек показывали снимок меню вместо игры — теперь на обложке видно, во что играешь",
    ],
    en: [
      "Seventeen cards showed a screenshot of a menu instead of the game — the cover now shows what you actually play",
    ],
  },
  {
    version: '1.220.0',
    date: '2026-08-21',
    ru: [
      "Достижения: у «Тормоза стального» вместо имени поля из кода появилось человеческое описание, а длинные названия перестали обрезаться",
    ],
    en: [
      "Achievements: Iron inhibition now reads like a sentence instead of an internal field name, and long titles no longer get clipped",
    ],
  },
  {
    version: '1.219.0',
    date: '2026-08-21',
    ru: [
      "Кнопка отзыва и питомец больше не закрывают текст внизу экрана: в магазине под ними пропадала строка про очки, в лигах — заголовок и название лиги",
    ],
    en: [
      "The feedback button and the pet no longer cover text at the bottom: the shop hid its tokens line, the leagues screen hid a heading and a league name",
    ],
  },
  {
    version: '1.218.0',
    date: '2026-08-21',
    ru: [
      "Лестница между уровнями встала по центру экрана, а строка «запускаю следующий» перестала липнуть к нижней ступени",
    ],
    en: [
      "The between-levels ladder is centred now, and the “starting next level” line no longer crowds the bottom step",
    ],
  },
  {
    version: '1.217.0',
    date: '2026-08-21',
    ru: [
      "В профиле «Скорочтение» появилась мнемоника слов и чисел — по вашему отзыву: быстро прочитать и ничего не удержать не результат",
    ],
    en: [
      "The speed-reading profile now includes mnemonics for words and numbers — from your feedback: reading fast and retaining nothing is not a result",
    ],
  },
  {
    version: '1.216.0',
    date: '2026-08-21',
    ru: [
      "Голосовые отзывы: вторая попытка починить микрофон — разрешение теперь запрашивается раньше, до загрузки страницы",
    ],
    en: [
      "Voice feedback: second attempt at the microphone — the permission bridge is now attached before the page loads",
    ],
  },
  {
    version: '1.215.0',
    date: '2026-08-21',
    ru: [
      "Заставка между уровнями: питомец поднимается по лестнице снизу вверх, и рядом видны пройденные ступени, а не только последний переход",
    ],
    en: [
      "Between-levels screen: the pet now climbs the ladder upward, and the steps you already passed stay in view — not just the last hop",
    ],
  },
  {
    version: '1.214.0',
    date: '2026-08-21',
    ru: [
      "Голосовые отзывы: приложение наконец спрашивает у системы разрешение на микрофон — без него Android три недели молча отдавал тишину вместо записи",
    ],
    en: [
      "Voice feedback: the app finally asks the system for microphone permission — without it Android silently returned silence instead of a recording for three weeks",
    ],
  },
  {
    version: '1.213.0',
    date: '2026-08-21',
    ru: [
      "«Прикидка» больше не теряет партию молча: «назад» спрашивает, а пока пишешь отзыв — партия и её часы стоят",
    ],
    en: [
      "Math Slider no longer loses your game silently: back asks first, and while you write feedback the game and its clock are paused",
    ],
  },
  {
    version: '1.212.0',
    date: '2026-08-21',
    ru: [
      "Сообщения приложения снова видны: подтверждение копирования, итог переноса прогресса и разговор про обновление молчали на всех устройствах",
      "Круг друзей объясняет отказ по-человечески: свой собственный код и переполненный круг больше не выдаются за «такого кода нет»",
    ],
    en: [
      "The app's messages are visible again: copy confirmation, the result of a progress transfer and the whole update conversation were silent on every device",
      "The friends circle explains a refusal honestly: your own code and a full circle are no longer reported as “no such code”",
    ],
  },
  {
    version: '1.211.0',
    date: '2026-08-21',
    ru: [
      "Друзья по коду приглашения: назовите свой код или введите чужой — и сравнивайте рекорды со своим кругом, а не с незнакомцами",
      "Кнопку отзыва теперь можно переставить: зажмите её и ведите, место запомнится",
      "Голосовая заметка больше не пропадает, если сеть моргнула при отправке — заливка повторяется вторым путём",
      "Незаконченная партия возвращается и во фрактальной судоку с самураем — последние две игры из девяти",
    ],
    en: [
      "Friends by invite code: share your code or enter theirs, and compare records with your own circle instead of strangers",
      "The feedback button can be moved now: press and drag it, and it stays where you put it",
      "A voice note is no longer lost when the network blinks while sending — the upload retries by a second route",
      "Your unfinished game now comes back in fractal and samurai sudoku too — the last two of nine",
    ],
  },
  {
    version: '1.210.0',
    date: '2026-08-21',
    ru: [
      "Незаконченная партия снова возвращается: в девяти играх она поднималась только у профиля по умолчанию, у остальных пропадала",
      "Голосовой отзыв записывается напрямую с микрофона — обработка звука на части телефонов отдавала пустую дорожку",
      "Во фрактальной судоку появились порталы: клетка живёт в двух сетках сразу, и вывод существует только между ними",
      "За достигнутую цель дня начисляются очки — если в этот день была хотя бы одна партия",
      "Самый сложный самурай стал по-настоящему сложным: верхняя полоса теперь требует голых пар, а не как повезёт",
      "Наборы товаров открываются по уровню: до шестого они все одинаковы, и раньше открывать нечего",
    ],
    en: [
      "Your unfinished game comes back again: in nine games it was restored only for the default profile and lost for everyone else",
      "Voice feedback now records straight from the microphone — audio processing returned an empty track on some phones",
      "Fractal sudoku gained portals: one cell lives in two grids at once, and the deduction exists only between them",
      "Reaching your daily goal now earns points — provided you actually played that day",
      "The hardest samurai is genuinely hard now: the top band requires naked pairs instead of whatever turned up",
      "Goods sets unlock by level: below level six they are all identical, so there is nothing to unlock earlier",
    ],
  },
  {
    version: '1.209.0',
    date: '2026-08-20',
    ru: [
      "Судоку объясняет свои правила на доске: что такое сумма у края, зачем отмена хода и что даёт подсветка клеток",
      "Голосовой отзыв больше не пропадает молча: видно, слышит ли вас приложение, и запись не отправится немой",
      "Вечером тихо во всех играх набора, а не только в тех, на которые жаловались: у судоку убран секундомер, победный звук молчит",
      "Выбор набора товаров стало видно: миниатюры выросли втрое и перестали налезать друг на друга",
      "Самурай перестал смешивать свои партии с обычной судоку — время и уровни двух игр больше не в одной куче",
      "Шаг зарядки больше не может уронить ваш уровень: два упражнения делали это молча",
    ],
    en: [
      "Sudoku explains its own rules on the board: what the edge sums mean, why undo exists, what cell colouring does",
      "A voice note no longer vanishes silently: you can see whether the app hears you, and a silent recording will not be sent",
      "Evenings are quiet in every game of the set, not only the ones that were complained about: Sudoku drops its stopwatch, the win sound stays off",
      "The goods set picker is legible: thumbnails grew threefold and stopped overlapping",
      "Samurai no longer mixes its rounds with plain Sudoku — times and levels of the two games are separate",
      "A warm-up step can no longer drop your level: two exercises were doing it silently",
    ],
  },
  {
    version: '1.208.0',
    date: '2026-08-20',
    ru: [
      "Судоку: три дороги сложности. Выбираете до партии, у каждой свой прогресс; пройденное на тяжёлой засчитывается и на лёгкой, обратно — нет",
      "Три судоку теперь под одним входом, а не тремя карточками среди семидесяти",
      "Очки наконец есть на что потратить в самой партии: вторая жизнь, пробный заход и щит серии",
      "Белый текст на цветных плашках стал читаемым — в 68 местах он был почти белым по белому",
      "Шесть новых игр встают на паузу, пока вы пишете отзыв, и спрашивают перед выходом",
      "В «Трекере объектов» шары больше не улетают, пока открыто окно отзыва",
      "Фрактальная судоку наконец засчитывается в ветку логики — из-за одного символа в имени её партии не считались нигде",
    ],
    en: [
      "Sudoku: three difficulty roads. You pick before the game, each keeps its own progress; what you cleared on hard counts on easy, never the other way",
      "The three Sudokus now sit behind one entry instead of three cards among seventy",
      "Points are finally worth spending inside a round: second life, practice run and streak shield",
      "White text on coloured panels is readable — in 68 places it was nearly white on white",
      "Six new games now pause while you write feedback, and ask before you leave",
      "In Object Tracker the balls no longer fly on while the feedback window is open",
      "Fractal Sudoku finally counts toward the logic branch — one character in its name kept its rounds out of everything",
    ],
  },
  {
    version: '1.207.0',
    date: '2026-08-20',
    ru: [
      "Цель дня: приложение спрашивает, ради чего вы сегодня заходите, и считает партии к ней",
      "«Рекомендуем сегодня» — три упражнения с причиной у каждого, а не выбор из 71",
      "Чистая партия платит вдвое, и видно, что и сколько принесло сегодня",
      "Вкладка истории: что менялось от раза к разу, а не сколько всего сыграно",
      "Карандашные пометки теперь и в обычной судоку, и в самурае",
      "Новый вариант судоку: термометр и клетки-суммы на одной доске",
      "На тропинке под пройденными узлами — ваше лучшее время",
      "Питомец носит бабочку на шее, а не на пузе и не на хвосте",
      "Самурай больше не молчит, пока собирает доску: видно, что идёт работа",
      "Во фрактальной судоку треть досок «уровня 20» была уровнем 16 с другой надписью — теперь ступени настоящие",
      "На уровнях 26–30 фрактала треть сеток была уже виденной, просто повёрнутой",
    ],
    en: [
      "Goal of the day: the app asks what you came for today and counts rounds toward it",
      "Recommended today — three exercises, each with a reason, instead of picking from 71",
      "A clean round pays double, and you can see what earned what today",
      "History tab: what changed from time to time, not how much you played in total",
      "Pencil marks now in classic Sudoku and Samurai too",
      "A new Sudoku variant: thermometers and sum cages on one board",
      "Your best time now sits under each cleared node on the level path",
      "The pet wears its bow tie on the neck, not on the belly or the tail",
      "Samurai no longer goes silent while it builds a board",
      "In Fractal Sudoku a third of “level 20” boards were level 16 with a different label — the tiers are real now",
      "On fractal levels 26-30 a third of the grids were ones you had already seen, just rotated",
    ],
  },
  {
    version: '1.206.3',
    date: '2026-08-19',
    ru: [
      "Семь новых упражнений — в каталоге стало 71",
      "«Дворец памяти» — метод мест: маршрут, предметы, проверка вперёд и назад",
      "«Ритм и высота» — первое упражнение на слух, без слов и микрофона",
      "На тропинке видно ступень сложности словом, а не голый номер",
      "Отмена, подсказка и перемешать — отдельным рядом; низ экрана только для ответа",
      "Самурай, SET и «Сортировка товаров» спрашивают перед выходом — долгая партия не пропадает",
      "Рекорды теперь в шести играх, а не в двух; без сети видно ваш личный",
      "В «Сортировке товаров» шкаф больше не выглядит дырявым: с 3-го уровня форма вырезает ниши, и на их месте теперь доска, а не пустота",
      "Пять новых игр заговорили на вашем языке: внутри партии они знали только русский и английский",
      "«Числовая шкала»: одно подтверждение вместо двух",
      "Дневной перерыв считается с вашим набором упражнений",
      "Тропинка уровней снова видна. Она не показывалась почти нигде: карточка схлопывалась в полоску, подпись «Уровень 1 / 52» вставала по букве в столбик, питомец и звёзды пропадали. Держалось до поворота экрана — то есть у большинства всегда",
      "«Сортировка товаров» переделана: у каждого уровня своя цель, появились препятствия, товар можно тащить пальцем, есть отмена хода и подсказка. Разных уровней стало 59 вместо 13",
      "Между уровнями теперь короткая передышка с картинкой, и питомец на глазах переходит на следующий уровень",
      "Выход из игры больше не стирает партию. Раньше 20 минут маджонга исчезали от одного промаха по «назад», и вопроса не задавала ни одна из 64 игр",
      "Отмена хода — в маджонге, анаграммах, самурае и фрактальной судоку",
      "Название игры и кнопку «Начать» стало видно на 59 экранах: они были белым по светлому, и на части экранов текст физически не читался",
      "«Фрактальное судоку» было непроходимо вовсе — в корневую сетку нельзя было вводить цифры. Теперь играется целиком, уровней 30 вместо 15",
      "«Судоку-самурай»: ступени сложности стали настоящими (раньше все уровни решались одним приёмом), партия сохраняется при выходе, в клетку можно попасть пальцем",
      "В SET видно, сколько осталось на расклад. С 11-го уровня время режется с 26 секунд до 10, и уровень терялся по часам, которых никто не показывал",
      "Числа в шапках подписаны словами на 51 экране — вместо «A 12», «μ8», «Span 5»",
      "Правила уровней переведены на все 12 языков. Раньше десять языков читали объяснение новой механики по-английски",
      "Вечером и ночью звук глушится на 57 экранах: вечерний набор задуман как успокоение, а писк на каждое действие делал обратное",
      "Появился щадящий режим движения для тех, у кого от анимаций кружится голова",
      "Новый профиль «Новинки» — витрина свежего и существенно обновлённого",
    ],
    en: [
      "Seven new exercises — the catalogue now holds 71",
      "Memory Palace — the method of loci: a route, items, recall both ways",
      "Rhythm and Pitch — the first exercise for the ear, no words, no microphone",
      "The level path names the difficulty tier in words, not a bare number",
      "Undo, hint and shuffle sit in their own row; the bottom is for answering",
      "Samurai, SET and Sort the Goods ask before you leave — a long game is not lost",
      "Leaderboards cover six games now, not two — offline you see your best",
      "Sort the Goods no longer looks broken: from level 3 the shape cuts out niches, and those spots are solid wood now, not a hole",
      "Five new games now speak your language: inside a round they only knew Russian and English",
      "Number Line takes one confirmation instead of two",
      "The midday break respects your own set of exercises",
      "The level path is visible again. It was showing almost nowhere: the card collapsed to a sliver, the “Level 1 / 52” caption stacked one letter per line, and the pet and stars vanished. It lasted until you rotated the screen — for most people, forever",
      "Sort the Goods is rebuilt: every level states its own goal, obstacles appeared, goods can be dragged, and there is undo and a hint. Distinct levels went from 13 to 59",
      "Levels are now separated by a short breather with a picture, and the pet visibly walks on to the next one",
      "Leaving a game no longer wipes your board. Twenty minutes of Mahjong used to disappear from one stray tap on “back”, and none of the 64 games asked first",
      "Undo — in Mahjong, Anagrams, Samurai Sudoku and Fractal Sudoku",
      "Game titles and the Start button are readable on 59 screens: they were white on light, and on some screens the text was physically unreadable",
      "Fractal Sudoku was unwinnable outright — the root grid took no input at all. It is now fully playable, with 30 levels instead of 15",
      "Samurai Sudoku: the difficulty ladder became real (every level used to fall to a single technique), the game saves when you leave, and cells can be hit with a finger",
      "SET now shows how long is left on the current deal. From level 11 the time is cut from 26 seconds to 10, and levels were lost to a clock nobody displayed",
      "Numbers in headers are labelled with words on 51 screens — instead of “A 12”, “μ8”, “Span 5”",
      "Level rules are translated into all 12 languages. Ten languages used to read the explanation of a new mechanic in English",
      "Sound is muted on 57 screens during the evening and night warm-up: that set exists to wind down, and a beep on every action did the opposite",
      "A reduced-motion mode arrived for people who get dizzy from animation",
      "A new “What’s new” profile — a shelf for fresh and substantially reworked exercises",
    ],
  },
  {
    version: '1.204.0',
    date: '2026-08-19',
    ru: [
      'Вечерняя зарядка больше не торопит: в «Отличиях» убран обратный отсчёт, у маджонга скрыт секундомер. Вечерний набор задуман как успокоение перед сном, а таймер делал ровно обратное',
      'Не успели раунд — теряете только его. Раньше просроченный раунд заканчивал весь уровень и съедал оставшиеся попытки',
      'Пока вы пишете отзыв, игра стоит на паузе. Раньше время шло, и партия могла закончиться, пока вы про неё рассказывали',
      'В PRL наконец сказано, что происходит: угадывать не нужно. Стороны молча меняются местами, и две ошибки подряд после удачной серии означают, что правило сменилось',
      'Полки в «Сортировке товаров» больше не обрезаются снизу',
      '⚠️ Приложение всё ещё требует ВПН, и это пока не решено. Отчёты теперь сообщают нам, каким путём они доехали, — без этого разобраться не получалось',
    ],
    en: [
      'The evening warm-up no longer rushes you: Spot the Difference lost its countdown and Mahjong its stopwatch. The evening set exists to wind down, and a timer did the opposite',
      'Running out of time now costs you that round only. Before, one late round ended the whole level and ate the remaining tries',
      'The game pauses while you write feedback. Time used to keep running, so a round could end while you were describing it',
      'PRL finally says what is going on: there is nothing to guess. The sides swap silently, and two errors in a row after a good streak mean the rule has changed',
      'Shelves in Sort the Goods are no longer cut off at the bottom',
      '⚠️ The app still needs a VPN in some networks and that is not solved yet. Reports now tell us which route they took — without that we could not investigate',
    ],
  },
  {
    version: '1.203.0',
    date: '2026-08-14',
    ru: [
      'Голосовая заметка больше не пишется дольше положенного: приехала запись на 5,5 минуты при потолке в три, потому что счётчик останавливался, когда экран гас. Теперь потолок держится независимо от этого',
      '⚠️ Если ваша голосовая заметка приходит немой — это известная беда, мы её ещё ищем. Пока запись получилась без звука, приложение говорит об этом сразу: продублируйте текстом, иначе до нас ничего не дойдёт',
    ],
    en: [
      'A voice note can no longer run past its limit: one arrived at 5.5 minutes against a 3-minute cap because the counter stalled when the screen went dark. The cap now holds regardless',
      '⚠️ If your voice note arrives silent, that is a known problem we are still chasing. When a recording captures no sound the app now says so immediately — please retype it, otherwise nothing reaches us',
    ],
  },
  {
    version: '1.202.0',
    date: '2026-08-14',
    ru: [
      'В карточке профиля было написано «Все 48 тренажёров» — столько их было когда-то. Сейчас их 63, и число теперь считается само, а не вписано руками',
    ],
    en: [
      'The profile card said “All 48 trainers” — that was the count long ago. There are 63 now, and the number is counted automatically instead of being typed in',
    ],
  },
  {
    version: '1.201.0',
    date: '2026-08-14',
    ru: [
      'В магазине появилась «Бабочка» за 300 очков — на шею питомцу. Бантик при этом остаётся заколкой на голове: теперь это два разных предмета',
    ],
    en: [
      'A bow tie has appeared in the shop for 300 points — for your pet’s neck. The bow stays a hair clip on the head: they are two different items now',
    ],
  },
  {
    version: '1.200.0',
    date: '2026-08-14',
    ru: [
      'Пройденный уровень можно переиграть прямо с тропинки: нажмите на любой пройденный узел, и «Начать» запустит именно его. Звёзды хранятся по лучшему результату, так что второй заход может оценку только улучшить',
      'Провал на переигровке не понижает ваш уровень — вы сами вернулись в лёгкое, это не повод считать, что стало трудно. Выше своего рекорда тропинка не пускает',
      'Профиль ребёнка больше не подхватывает уровень взрослого. Достижения раздельные по профилям, а история раундов хранилась общей — новый профиль стартовал с чужой ступени',
    ],
    en: [
      'Any completed level can be replayed straight from the path: tap a completed node and Start will launch that one. Stars keep your best result, so a second run can only improve the rating',
      'Failing a replay does not lower your level — you chose to go back to an easier one, which is no reason to treat it as difficulty. The path will not let you jump above your record',
      'A child profile no longer inherits an adult level. Progress was per profile but round history was shared, so a fresh profile started at someone else’s step',
    ],
  },
  {
    version: '1.199.0',
    date: '2026-08-14',
    ru: [
      'Бант вернулся на голову заколкой и больше не закрывает питомцу морду. Раньше он держался на точке, которая называлась «шея», но лежала выше макушки — когда точки пересчитали честно, бант съехал на лицо',
    ],
    en: [
      'The bow is back on the head as a hair clip and no longer covers the pet’s face. It used to hang off a point called “neck” that actually sat above the skull — once the points were measured honestly, the bow slid down onto the face',
    ],
  },
  {
    version: '1.198.0',
    date: '2026-08-13',
    ru: [
      'Появилась настоящая фоновая музыка — шесть спокойных инструментальных треков по две минуты: под дыхание, под утро, под вечер, под счёт. Раньше «музыка» была четырьмя аккордами, синтезированными на лету, и тестер честно назвал это «3 ноты»',
      'Музыка по-прежнему выключена по умолчанию и включается в настройках. Треки идут вперемешку и тихо — фоном под упражнением, а не вместо него',
    ],
    en: [
      'Real background music at last — six calm instrumental tracks of about two minutes each: for breathing, for mornings, for evenings, for counting. What used to be called music was four chords synthesised on the fly, and a tester fairly called it “3 notes”',
      'Music is still off by default and turns on in settings. Tracks play shuffled and quiet — under the exercise, not instead of it',
    ],
  },
  {
    version: '1.197.0',
    date: '2026-08-13',
    ru: [
      'Все упражнения устроены одинаково: уровень или счётчик прохождений, тропинка с вашим питомцем и общий итог со звёздами. Раньше девять игр шли мимо: у них не копились звёзды и не считалась серия чистых',
      'Прогресс больше не теряется при сбросе или смене профиля. Достигнутые уровни хранились только одним ключом — теперь они восстанавливаются из истории ваших тренировок на этом устройстве',
      'Дыхание тоже считает пройденные подходы и показывает их на тропинке',
    ],
    en: [
      'Every exercise now works the same way: a level or a run counter, a path with your pet on it, and one shared result screen with stars. Nine games used to bypass all of that — no stars collected, no clean-run streak',
      'Progress no longer disappears when a profile is reset or switched. Levels lived behind a single key; they are now rebuilt from your own training history on this device',
      'Breathing counts completed sessions too and shows them on the path',
    ],
  },
  {
    version: '1.196.0',
    date: '2026-08-13',
    ru: [
      'Колпак наконец сидит НА голове, а не висит над ней. Заодно очки съехали на глаза, а бант — под подбородок: точки крепления были задраны к верху картинки у всех трёх обликов',
      'Маджонг стал сложнее по делу: перетасовка теперь ресурс (первые пять уровней без счёта, дальше 3 → 2 → 1 на уровень), а выше 15-го пирамида растёт в четыре и пять слоёв',
      'Итог уровня показывается ПОВЕРХ доски в маджонге, сортировке, парах, судоку, ханойской башне и других — собранное поле остаётся на экране',
      'Уровни появились там, где их не было: гимнастика глаз, пересказ, фрактальная судоку. В Iowa, RMET, словаре и беглости речи вместо уровня счётчик прохождений — это проверенные методики, крутить в них сложность нельзя',
      'Переключатель «Уровни / Свободно» на экране настроек: раньше свободная игра пряталась кнопкой под всеми настройками',
      'Возврат очков за зарядки, сорванные прошлой ошибкой',
    ],
    en: [
      'The party hat finally sits ON the head instead of floating above it. Glasses moved onto the eyes and the bow under the chin too: mount points were skewed toward the top of the frame on all three skins',
      'Mahjong is harder where it counts: the shuffle is a resource now (unlimited for the first five levels, then 3 → 2 → 1 per level), and past level 15 the pyramid grows to four and five layers',
      'The level result now appears OVER the board in Mahjong, Goods Sort, Picture Pairs, Sudoku, Tower of Hanoi and others — the board you just cleared stays on screen',
      'Levels arrived where there were none: Eye Gymnastics, Story Recall, Fractal Sudoku. Iowa, RMET, Vocabulary and Verbal Fluency count completed runs instead — those are validated tests and their difficulty must not be tampered with',
      'A “Levels / Free” switch on the settings screen: free play used to hide behind a button below every setting',
      'Points returned for warm-ups broken by an earlier bug',
    ],
  },
  {
    version: '1.195.0',
    date: '2026-08-13',
    ru: [
      'Тропинка уровней вместо строки с номерами: цепочка нейронов, пройденное горит, впереди пунктир, вехи-боссы крупнее. На текущем узле сидит ваш питомец — видно, где вы сейчас',
      'Зарядка больше не вылетает: игра запускала следующий уровень, пока зарядка уводила на следующее упражнение. Два таймера спорили за один экран',
      'Огоньки серии восстановлены: сбой чтения стирал историю дней. Прошлые дни подняты из ваших же тренировок',
      'Судоку в зарядке: проигрыш больше не запирает на одном шаге — зарядка едет дальше',
      'Гимнастика для глаз получила 15 уровней: с каждым дольше проработка и быстрее точка. Ручные настройки остались — это свободный режим',
    ],
    en: [
      'A level path instead of a row of numbers: a chain of neurons, the road behind lit up, dashes ahead, boss milestones larger. Your pet sits on the current node so you can see where you are',
      'Warm-up no longer drops out: the game started the next level while the warm-up moved on to the next exercise. Two timers fought over one screen',
      'Streak flames restored: a failed read wiped the day history. Past days were rebuilt from your own sessions',
      'Sudoku in warm-up: losing no longer traps you on one step — the warm-up moves on',
      'Eye Gymnastics now has 15 levels: each one runs longer and moves the dot faster. Manual settings stay — that is free mode',
    ],
  },
  {
    version: '1.194.0',
    date: '2026-08-13',
    ru: [
      'Фрактальная судоку: за каждой клеткой верхней сетки спрятана целая судоку. Решаете нижнюю — её цифра встаёт в корневую',
      'Сортировка товаров стала настоящей: на первом уровне пустовали две трети поля, теперь занято больше половины и типов больше',
      'Колпак питомца наконец сидит НА голове, а не висит над ней — точка крепления у кота стояла на кончиках антенн',
      'Карточки игр: на телефоне снова две колонки. Была одна растянутая, и между описанием и «Тренируем» пустовало 218 точек',
      'Описание игры свернулось в строку «Об игре» во всех 56 играх — экран открывается сразу настройками',
      'Кнопка «начать» прибита к низу в 23 играх: раньше до неё приходилось доскроллить',
      'Кнопки по всему приложению доведены до размера, при котором палец попадает: было 123 мелких из 618, стало ноль',
      'Японский переведён полностью — был наполовину. Теперь все 12 языков закрыты',
      'Иконка приложения на Windows и macOS обновлена: настольные сборки собирались из старого файла и выходили со старым логотипом',
    ],
    en: [
      'Fractal Sudoku: behind every cell of the top grid hides a whole sudoku. Solve a lower grid and its digit moves up into the root',
      'Goods Sort is a real puzzle now: level one left two thirds of the board empty; it is over half full and has more types',
      'The pet hat finally sits ON the head instead of floating above it — the cat’s mount point was on the antenna tips',
      'Game cards: two columns again on phones. One stretched column left 218 points of emptiness between the text and the badge',
      'The game description folded into an “About game” row across all 56 games — screens open straight into settings',
      'The Start button is pinned to the bottom in 23 games; you used to have to scroll down to it',
      'Buttons across the app now meet a reliable finger-tap size: 123 of 618 were below it, now none',
      'Japanese is fully translated — it was half done. All 12 languages are complete',
      'The app icon on Windows and macOS is updated: desktop builds were made from an old file and shipped the old logo',
    ],
  },
  {
    version: '1.193.0',
    date: '2026-08-12',
    ru: [
      'Судоку: цифры на клавиатуре стали крупнее, у каждой свой цвет, и сама клавиатура переехала под доску — раньше между ними была пустота почти в пол-экрана',
      'Судоку: подсказка, отмена и цвет переехали наверх, а выбор режима и справка — вниз к кнопке «играть». Игра открывается сразу настройками, описание свернулось в строку «Об игре»',
      'Судоку: цифра рядом с кружком или заливкой больше не выглядит выцветшей — она рисуется чёрным поверх любой подложки (по многократной просьбе тестировщика)',
      'Ханойская башня: диски можно перетаскивать пальцем. Нажатия по стержням продолжают работать',
      'На компьютере играм можно управлять с клавиатуры: цифры ставят, Backspace стирает, стрелки ходят по доске',
      'Судоку-самурай появился в каталоге игр — раньше его можно было найти только внутри обычной судоку',
      'Кнопки по всему приложению стали крупнее: 123 из 440 были меньше размера, при котором палец попадает надёжно',
      'Купленный цвет интерфейса теперь виден на главной, а не только в настройках',
      'Кнопка зарядки на главной честно подписана «Выбрать» — она открывает выбор набора, а не запускает его',
    ],
    en: [
      'Sudoku: bigger, colour-coded number keys, moved right under the board — there used to be half a screen of emptiness between them',
      'Sudoku: hint, undo and colour moved to the top bar; mode and rules moved down next to Play. The game now opens straight into settings, with the description folded into an “About game” row',
      'Sudoku: a digit sitting on a circle or a tint no longer looks washed out — it is drawn in solid black over any backdrop',
      'Tower of Hanoi: drag discs with your finger. Tapping the pegs still works',
      'On desktop you can play with the keyboard: digits enter, Backspace clears, arrows move around the board',
      'Samurai Sudoku is now in the game catalogue — previously reachable only from inside regular Sudoku',
      'Buttons across the app got bigger: 123 of 440 were below a reliable finger-tap size',
      'The interface colour you buy is now visible on the home screen, not just in settings',
      'The workout card now says “Choose” — it opens the set picker rather than starting a set',
    ],
  },
  {
    version: '1.192.0',
    date: '2026-08-12',
    ru: [
      'Приложение больше не падает, если выключить кнопку отзыва в настройках — раньше после этого не открывался ни один экран',
      'Вибрация наконец работает на Android: приложению не хватало системного разрешения, поэтому настройка включалась, а вибрации не было',
      'Судоку: в описании правил были указаны не те уровни — точки Кропки стоят на 34-м, а кривые блоки только на 50-м. Добавлены сэндвич, термометры и стрелки, о которых раньше не говорилось',
      'Режим для дальтоников теперь честно пишет, где именно он работает',
      'Из окна правил судоку снова можно отправить отзыв',
      'Гимнастика для глаз и Дыхание на главной встали ровно — раньше карточки разъезжались по высоте',
      'Названия зарядок и подписи виджета отзыва переведены на все 12 языков — раньше девять языков видели их по-английски',
    ],
    en: [
      'The app no longer crashes if you switch the feedback button off in settings — after that no screen would open at all',
      'Vibration finally works on Android: the app was missing a system permission, so the setting turned on but nothing happened',
      'Sudoku: the rules described the wrong levels — kropki dots start at 34, irregular blocks only at 50. Sandwich, thermometers and arrows were missing from the list entirely',
      'Colorblind mode now says honestly where it applies',
      'You can send feedback from the Sudoku rules window again',
      'Eye Gymnastics and Breathing cards on the home screen line up — they used to sit at different heights',
      'Warm-up names and feedback labels are translated into all 12 languages — nine languages used to see them in English',
    ],
  },
  {
    version: '1.191.0',
    date: '2026-08-12',
    ru: [
      'Вечерняя зарядка больше не вылетает: в сортировке товаров кнопки были вложены друг в друга, и от этого рвались нажатия',
      'Приложение запускается без интернета: раньше оно ждало недоступный адрес — теперь сразу берёт рабочий, а прямой перепроверяет фоном',
      'Маджонг и сортировка в зарядке перестали сбрасывать уровень: партия стартовала раньше, чем прогресс успевал загрузиться',
      'Судоку: незаконченная партия сохраняется — вышли из игры и вернулись, доска на месте. Добавлена отмена хода и раскраска клеток',
      'Судоку: в справке снова есть правила текущего варианта, а на карте уровней видно ступень сложности',
      'Гимнастика для глаз: точка внизу больше не уходит за край экрана',
      'Фонематическая беглость: серия снова запускается — набор букв не подходил под язык профиля',
      'История: буквы в поле для числа больше не прячутся за клавиатурой',
      'Новое: календарь серии тренировок, карточка «Продолжить партию» на главной, выбор первой игры при запуске',
      'На экране итога Шульте и N-back виден лучший результат среди игроков',
      'Отмена хода появилась в Ханойской башне и Башне Лондона',
      'Голосовая заметка: теперь её можно прослушать до отправки — микрофон иногда пишет шум вместо голоса',
      'Настройки: переключатели получили подписи для озвучивания экрана',
    ],
    en: [
      'The evening warm-up no longer crashes: in Goods Sort the buttons were nested inside each other, which broke taps',
      'The app starts without internet: it used to wait for an unreachable address — now it takes the working one at once and rechecks the direct one in the background',
      'Mahjong and Goods Sort stopped resetting your level in the warm-up: the round started before progress had loaded',
      'Sudoku: an unfinished game is saved — leave and come back, the board is still there. Undo and cell colouring added',
      'Sudoku: the help shows the current variant’s rule again, and the level map shows each level’s difficulty',
      'Eye gym: the dot at the bottom no longer slips off the screen',
      'Phonemic fluency: the round starts again — the letter set did not match the profile language',
      'Story recall: the number field no longer hides behind the keyboard',
      'New: a training streak calendar, a “Continue game” card on the home screen, and a first-game picker at launch',
      'Schulte and N-back result screens now show the best score among players',
      'Undo arrived in the Tower of Hanoi and the Tower of London',
      'Voice note: you can now play it back before sending — the microphone sometimes records noise instead of your voice',
      'Settings: the switches now have labels for screen readers',
    ],
  },
  {
    version: '1.190.2',
    date: '2026-08-07',
    ru: [
      'Голосовая заметка: если микрофон не отдал звук, приложение скажет об этом сразу — раньше запись уходила немой, а на экране всё выглядело удачно',
      'Приложение стало легче: из сборки убраны неиспользуемые ресурсы',
    ],
    en: [
      'Voice note: if the microphone gave no sound, the app now says so right away — recordings used to go out silent while the screen looked fine',
      'The app got lighter: unused resources are stripped from the build',
    ],
  },
  {
    version: '1.189.0',
    date: '2026-08-07',
    ru: [
      'Питомец больше не садится на кнопку «Начать» — на экранах с нижней панелью он ходит выше неё',
      'Поиск фигур: образец искомой фигуры было не видно — он рисовался белым по белому',
    ],
    en: [
      'The pet no longer sits on the Start button — on screens with a bottom bar it walks above it',
      'Visual Search: the target shape sample was invisible — it was drawn white on white',
    ],
  },
  {
    version: '1.188.0',
    date: '2026-08-07',
    ru: [
      'Судоку с правилом «соседи не отличаются на единицу» (уровни 22–25) больше не заставляет ждать: доска собиралась полторы минуты, теперь секунду',
      'Сложность по технике решения заработала ещё на трёх правилах — несоседние числа, стрелки и термометры',
    ],
    en: [
      'Sudoku with the “neighbours differ by more than one” rule (levels 22–25) no longer keeps you waiting: the board took a minute and a half to build, now about a second',
      'Technique-based difficulty now also covers three more rules — non-consecutive, arrows and thermometers',
    ],
  },
  {
    version: '1.187.0',
    date: '2026-08-07',
    ru: [
      'Судоку: сложность наконец растёт по уровням. Раньше уровень задавал число пустых клеток, а они могут заполняться совсем механически — поэтому 34-й выходил легче 12-го. Теперь уровень задаёт, какой приём решения понадобится',
      'Судоку: у каждого уровня гарантированно ровно одно решение — это проверяется при каждой сборке для всех 52 уровней, а не на глаз',
    ],
    en: [
      'Sudoku: difficulty finally grows with the level. It used to be set by the number of empty cells, which can be filled purely mechanically — that is why level 34 felt easier than 12. Now the level sets which solving technique you will need',
      'Sudoku: every level is guaranteed to have exactly one solution — checked on every build across all 52 levels, not by eye',
    ],
  },
  {
    version: '1.186.0',
    date: '2026-08-06',
    ru: [
      'Вызов дня снова засчитывает уровни: раньше он запускался как шаг зарядки, а там уровни намеренно не растут — можно было пройти идеально и остаться на первом',
      'Вечерняя зарядка больше не повторяет утреннюю игру: парные картинки заменены маджонгом',
    ],
    en: [
      'The daily challenge counts levels again: it used to launch as a workout step, where levels intentionally do not grow — you could play perfectly and stay on level one',
      'The evening workout no longer repeats a morning game: picture pairs replaced with mahjong',
    ],
  },
  {
    version: '1.185.0',
    date: '2026-08-06',
    ru: [
      'Судоку: на уровнях с кружками и квадратиками введённая цифра больше не «выцветает» — она читается сразу, не дожидаясь снятия выделения',
      'Главный экран стал компактнее: шапка занимает вдвое меньше, игры начинаются выше',
      'Кубок, магазин, статистика и настройки больше не переносятся на отдельную строку',
    ],
    en: [
      'Sudoku: on levels with circles and squares the digit you place no longer looks washed out — it reads right away, without deselecting the cell',
      'The home screen is tighter: the header takes half the space, games start higher',
      'Trophy, shop, stats and settings no longer wrap onto their own row',
    ],
  },
  {
    version: '1.184.0',
    date: '2026-08-06',
    ru: [
      'Зарядка больше не проглатывает игры: если нажать «Далее» самому, следующая игра не пропускается. Из-за этого вечерний набор превращался в одну игру и дыхание',
      'Вечерняя зарядка — четыре упражнения',
      'Зарядка — одна кнопка: утренняя, дневная, вечерняя и ночная выбираются на одном экране',
      'Подпись на главной больше не застревает: утром показывает утреннюю, а не ту, что была при запуске',
      'Игры внутри зарядки запускаются сами — больше не нужно жать «Начать» на каждом шаге',
    ],
    en: [
      'A workout no longer swallows games: tapping Next yourself no longer skips the following game. That is what turned the evening set into one game and breathing',
      'Evening workout now has four exercises',
      'Workout is one button now: morning, daytime, evening and night are picked on a single screen',
      'The label on the home screen no longer gets stuck — in the morning it shows the morning workout',
      'Games inside a workout start on their own — no more tapping Start at every step',
    ],
  },
  {
    version: '1.183.0',
    date: '2026-08-03',
    ru: ['Аксессуары питомца садятся на место на всех трёх обликах — колпак на макушку, бант на шею, очки на глаза'],
    en: ['Pet accessories now sit correctly on all three looks — hat on the head, bow on the neck, glasses on the eyes'],
  },
  {
    version: '1.182.0',
    date: '2026-08-03',
    ru: [
      'Зарядка есть каждый день — по средам она больше не пустует',
      'Среда закрывает рабочую память: n-back, Корси, ряды цифр и анаграммы',
    ],
    en: [
      'A workout every day — Wednesday is no longer empty',
      'Wednesday covers working memory: n-back, Corsi, digit span and anagrams',
    ],
  },
  {
    version: '1.181.0',
    date: '2026-08-03',
    ru: [
      'Экран больше не гаснет посреди дыхательной сессии',
      'Вдох, задержка и выдох звучат по-разному — упражнение можно делать с закрытыми глазами',
      'Перед первым вдохом три секунды на «устройся поудобнее»',
      'Ночью экран дыхания приглушён — яркий свет в три часа не помогает уснуть',
    ],
    en: [
      'The screen no longer sleeps in the middle of a breathing session',
      'Inhale, hold and exhale sound different — you can do the exercise with your eyes closed',
      'Three seconds to get comfortable before the first inhale',
      'At night the breathing screen is dimmed — bright light at 3am does not help you sleep',
    ],
  },
  {
    version: '1.180.0',
    date: '2026-08-03',
    ru: [
      'У каждой техники дыхания своя фигура: квадрат, треугольник или круг — по ней точка и бежит',
      'Вдох теперь идёт вверх, задержка видна как движение по стороне, выдох — вниз',
      'В выборе техники видно её фигуру, настоящее название и ритм отдельной строкой',
    ],
    en: [
      'Each breathing technique has its own shape — square, triangle or circle — and the dot travels along it',
      'The inhale now goes upward, the hold reads as movement along a side, the exhale goes down',
      'The technique list shows the shape, the real name and the rhythm on its own line',
    ],
  },
  {
    version: '1.179.0',
    date: '2026-08-03',
    ru: [
      'Зарядка — одна кнопка вместо двух: подпись меняется по времени суток, а набор выбирается на своём экране',
      'Появились дневной перерыв и ночное «Не спится» — только дыхание, без очков и без стрика',
      'Дыхание вынесено на главную отдельной кнопкой и осталось шагом вечернего набора',
      'В «Числовых парах» справка объясняет, как играть, а не только зачем',
      'На экране питомца подписано, что ряд картинок — это его внешность, а не другие персонажи',
    ],
    en: [
      'One workout button instead of two: the label follows the time of day, the set is chosen on its own screen',
      'Added a daytime break and a night “Can’t sleep” — breathing only, no points, no streak',
      'Breathing is now its own button on the home screen and still a step of the evening set',
      'Number Bonds help explains how to play, not just why',
      'The pet screen now says the row of pictures is how he looks, not other characters',
    ],
  },
  {
    version: '1.178.0',
    date: '2026-08-02',
    ru: [
      'Вечерний комплекс проходится целиком: средний шаг застревал и его приходилось бросать',
      'В дыхании видно, какой это шаг комплекса — раньше экран выглядел как отдельная игра',
      'Поиск предметов: сказано, что фигуру надо искать в любом повороте',
    ],
    en: [
      'The before-sleep set can be completed: the middle step used to get stuck',
      'Breathing shows which step of the set it is — it used to look like a standalone game',
      'Visual Search now says the shape can appear in any rotation',
    ],
  },
  {
    version: '1.177.0',
    date: '2026-08-02',
    ru: ['Написанный отзыв больше не пропадает, если закрыть окно и вернуться'],
    en: ['A feedback draft is no longer lost if you close the window and come back'],
  },
  {
    version: '1.175.0',
    date: '2026-08-02',
    ru: [
      'Вибрация заработала на телефоне — раньше тумблер сохранялся, но ничего не включал',
      'Кнопки отзываются на нажатие короткой вибрацией',
      'Питомец больше не мигает и не пропадает на мгновение',
      'Отправка отзыва не зависает навсегда: если связь не тянет, отзыв уходит без вложения',
      'Сообщить о проблеме можно прямо из окна с правилами',
      'Режим для дальтоников теперь работает и в Струпе, и в SET',
      'Судоку: цифра в кружке или квадрате видна нормально, а не полупрозрачной',
      'Карточки «Вызов дня» и «Гимнастика для глаз» одной высоты',
      'Вечерний комплекс: средний шаг стал 10 раундов вместо 20 — шаги сопоставимы',
      'Очень крупный системный шрифт больше не ломает подписи на кнопках',
    ],
    en: [
      'Vibration works on the phone — the toggle used to save but switch nothing on',
      'Buttons answer a press with a short vibration',
      'The pet no longer blinks or vanishes for a moment',
      'Sending feedback no longer hangs forever: on a weak connection it goes without the attachment',
      'You can report a problem straight from the rules window',
      'Colorblind mode now works in Stroop and SET too',
      'Sudoku: a digit inside a circle or square is properly visible, not half-transparent',
      'The “Daily challenge” and “Eye gym” cards are the same height',
      'Evening set: the middle step is 10 rounds instead of 20 — steps are comparable',
      'A very large system font no longer breaks button labels',
    ],
  },
  {
    version: '1.174.0',
    date: '2026-08-02',
    ru: [
      'Совет Синапса «во что поиграть» открывает игру, а не пустой экран с ошибкой',
      'Подсказка ходячего питомца ломалась так же — тоже починена',
    ],
    en: [
      'Synapse’s “what to play” tip now opens the game instead of an error page',
      'The walking pet’s tip was broken the same way — fixed too',
    ],
  },
  {
    version: '1.173.0',
    date: '2026-08-02',
    ru: [
      'Блок «Починили по твоим репортам» теперь начинается с благодарности, а не заканчивается ею — раньше её было не видно',
      'Профиль FREE называется «Стандарт»: девять тренажёров — это подобранный набор для старта, а не урезанная проба',
    ],
    en: [
      'The “Fixed from your reports” block now opens with a thank-you instead of ending with one — it used to be off-screen',
      'The FREE profile is now “Standard”: nine trainers are a curated starting set, not a cut-down trial',
    ],
  },
  {
    version: '1.172.0',
    date: '2026-08-02',
    ru: [
      'После отправки отзыва видно, дошла ли голосовая запись — раньше «спасибо» выглядело одинаково в обоих случаях',
      'Если связи нет, отзыв сохраняется и уходит сам — вместе с записью, а не без неё',
    ],
    en: [
      'After sending a report you can see whether the voice recording arrived — “thanks” used to look the same either way',
      'With no connection the report is saved and sends itself later — with the recording, not without it',
    ],
  },
  {
    version: '1.171.0',
    date: '2026-08-02',
    ru: [
      'Отзыв можно отправить одним голосом, без текста — раньше кнопка нажималась, а ничего не уходило',
      'Выбор персонажа теперь листается пальцем — четвёртая карточка не влезала на узкие экраны',
    ],
    en: [
      'A voice-only report now sends — the button used to press with nothing happening',
      'The character picker scrolls sideways — the fourth card did not fit narrow screens',
    ],
  },
  {
    version: '1.170.0',
    date: '2026-08-02',
    ru: [
      'Микрофон в отзывах заработал — не хватало разрешения на запись',
      'Отзывы уходят и без VPN, а при обрыве связи не пропадают, а досылаются потом',
      'На экране между играми видно, какая игра уже сыграна, а какая следующая',
      'Синапс подсказывает, во что поиграть, чтобы подтянуть отстающую шкалу',
    ],
    en: [
      'The microphone in feedback works — the recording permission was missing',
      'Feedback now sends without a VPN, and is queued instead of lost when offline',
      'The between-games screen now shows which game is already played',
      'Synapse suggests what to play to pull up your weakest skill',
    ],
  },
  {
    version: '1.169.0',
    date: '2026-08-01',
    ru: [
      'SET: когда время вышло, игра показывает сет, который был на столе — а не меняет доску молча',
      'WCST: видно, сколько верных подряд осталось до смены правила',
    ],
    en: [
      'SET: when time runs out the game shows the SET that was on the table instead of silently redealing',
      'WCST: you can see how many correct answers are left before the rule changes',
    ],
  },
  {
    version: '1.168.0',
    date: '2026-08-01',
    ru: ['Обновлён движок приложения — под капотом, на игры не влияет'],
    en: ['App engine updated — under the hood, games are unaffected'],
  },
  {
    version: '1.167.0',
    date: '2026-08-01',
    ru: [
      'Результаты комплексов снова синхронизируются — раньше они молча не доезжали и тормозили остальную синхронизацию',
    ],
    en: [
      'Warm-up results sync again — they used to fail silently and stall everything else',
    ],
  },
  {
    version: '1.166.0',
    date: '2026-08-01',
    ru: [
      'В отзыв можно записать голос — не нужно надиктовывать текст и бороться с распознаванием',
      'В комплексе видно, какую именно игру пропускает кнопка «Пропустить»',
      'Кнопка «На главную» больше не прячется под «Ещё раз»',
    ],
    en: [
      'You can attach a voice note to feedback — no more fighting with speech-to-text',
      'The skip button now names the game it will skip',
      'The Home button no longer hides under Play again',
    ],
  },
  {
    version: '1.165.0',
    date: '2026-08-01',
    ru: [
      'Теперь видно, что починили именно по твоим сообщениям — прямо в этом окне',
      'Судоку: нижний ряд больше не обрезается на невысоком экране',
    ],
    en: [
      'You can now see what was fixed from your own reports — right in this window',
      'Sudoku: the bottom row is no longer cut off on short screens',
    ],
  },
  {
    version: '1.164.0',
    date: '2026-07-31',
    ru: [
      'Видно, сколько тренировок осталось до следующей стадии питомца',
      'В дыхании 4-7-8 объяснено, зачем выдох длиннее вдоха — и можно перейти на ровный «квадрат»',
      'В WCST понятно, что ошибка сразу после смены правила неизбежна',
      'В SET пример «что такое SET» открыт сразу',
    ],
    en: [
      'You can see how many trainings are left until your pet grows',
      '4-7-8 breathing now explains why the exhale is longer — and you can switch to an even box pattern',
      'WCST makes clear that an error right after a rule change is unavoidable',
      'SET shows the “what is a SET” example right away',
    ],
  },
  {
    version: '1.163.0',
    date: '2026-07-31',
    ru: [
      'В статистике видно, сколько попыток пройдено, а не только сколько начато',
      'Появились самая быстрая и самая долгая игра',
      'Диаграмма подписана: столбик = очки за одну попытку',
      'На карточке каждой программы виден её собственный счёт — очки не теряются при смене',
    ],
    en: [
      'Statistics now show how many attempts you passed, not just how many you started',
      'Fastest and slowest game added',
      'The chart is labelled: each bar = score for one attempt',
      'Each program card shows its own score — switching does not lose your points',
    ],
  },
  {
    version: '1.162.0',
    date: '2026-07-31',
    ru: [
      'На телефонах без «чёлки» шапка больше не уезжает под системные иконки',
      'В альбомной ориентации контент не попадает под вырез экрана',
    ],
    en: [
      'On phones without a notch the header no longer slides under the system icons',
      'In landscape the content no longer falls under the display cutout',
    ],
  },
  {
    version: '1.161.0',
    date: '2026-07-31',
    ru: [
      'Приложение научилось работать с VoiceOver и TalkBack — незрячий человек теперь слышит, что на экране',
      'Игровое поле описывается словами: «Стержень 1: красный, зелёный», «2 зелёных круга»',
      'Итог игры, новый уровень и разблокировки проговариваются вслух',
    ],
    en: [
      'The app now works with VoiceOver and TalkBack — blind users can hear what is on screen',
      'The board is described in words: "Peg 1: red, green", "2 green circles"',
      'Results, new levels and unlocks are spoken out loud',
    ],
  },
  {
    version: '1.160.0',
    date: '2026-07-30',
    ru: [
      'Комплекс перед сном стал спокойным: отличия, поиск предметов и дыхание 4-7-8 прямо в нём',
      'Утренние и вечерние игры больше не повторяют друг друга',
      'Игра встаёт на паузу, пока пишете отзыв',
      'Приложение стало легче — картинки пережаты без потери качества',
    ],
    en: [
      'The evening set is calm now: spot-the-difference, visual search and 4-7-8 breathing built in',
      'Morning and evening games no longer repeat each other',
      'The game pauses while you write feedback',
      'Smaller app — images recompressed with no visible quality loss',
    ],
  },
  {
    version: '1.159.0',
    date: '2026-07-30',
    ru: [
      'Зарядка и комплекс перед сном больше не застревают: видно «Игра N из M» и кнопку «Следующая игра» вместо «Играть снова»',
    ],
    en: [
      'Warm-up and evening sets no longer get stuck: you see "Game N of M" and a "Next game" button instead of "Play again"',
    ],
  },
  {
    version: '1.158.0',
    date: '2026-07-30',
    ru: [
      'Питомец снова разговаривает — и на экранах со списками тоже, никого не перекрывая',
    ],
    en: [
      'The pet talks again — including on list screens, without covering anything',
    ],
  },
  {
    version: '1.157.0',
    date: '2026-07-30',
    ru: [
      'Вечерний комплекс «перед сном» снова из 3 игр — раньше запускалась только одна',
      'Дыхание: на экране видно выбранную технику и её ритм',
    ],
    en: [
      'The evening "before sleep" set is 3 games again — only one used to launch',
      'Breathing: the chosen technique and its rhythm are now shown on screen',
    ],
  },
  {
    version: '1.156.0',
    date: '2026-07-29',
    ru: [
      'Судоку: на уровнях 30+ пазл иногда имел два решения — верный ход мог засчитаться ошибкой. Теперь решение всегда единственное',
      'Питомец: у переименования появилась кнопка сохранения',
    ],
    en: [
      'Sudoku: on levels 30+ a puzzle could have two solutions — a correct move could count as an error. Now the solution is always unique',
      'Pet: renaming now has a save button',
    ],
  },
  {
    version: '1.155.0',
    date: '2026-07-29',
    ru: [
      'Магазин: фильтр по категориям — акценты, звуки, рамки, титулы, аватары, питомец',
      'Питомец больше не перекрывает нижние карточки на экранах со списками',
    ],
    en: [
      'Shop: category filter — accents, sounds, frames, titles, avatars, pet',
      'The pet no longer overlaps bottom cards on list screens',
    ],
  },
  {
    version: '1.154.0',
    date: '2026-07-29',
    ru: [
      'Провал уровня больше не перезапускается сам — сначала спокойно смотришь результат, потом жмёшь «Ещё раз»',
      'Токены за игру больше не уходят в минус',
    ],
    en: [
      'A failed level no longer auto-restarts — review your result first, then tap Retry',
      'Game tokens never go negative anymore',
    ],
  },
  {
    version: '1.153.0',
    date: '2026-07-29',
    ru: [
      'Полная локализация: испанский, португальский, немецкий, китайский и хинди больше не выпадают в английский посреди игры',
    ],
    en: [
      'Full localization: Spanish, Portuguese, German, Chinese and Hindi no longer drop to English mid-game',
    ],
  },
  {
    version: '1.152.0',
    date: '2026-07-29',
    ru: [
      'Судоку: введённая цифра в выделенной ячейке теперь хорошо видна',
      'WCST: справка исправлена — правило меняется после серии верных подряд, а первая ошибка после смены это норма',
    ],
    en: [
      'Sudoku: the digit you enter in the selected cell is now clearly visible',
      'WCST: help fixed — the rule changes after a run of correct answers, and the first error after a change is normal',
    ],
  },
  {
    version: '1.148.0',
    date: '2026-07-24',
    ru: [
      'SET: подсказка 💡, разбор ошибки не исчезает сам, полосатая заливка стала читаемой, советы по логике в справке',
      'Кнопки внизу больше не прячутся под системную навигацию (Samsung и др.)',
      'Тумблеры питомца и чата применяются мгновенно',
      'Питомец: кормление, имя, поглаживание, реакция на рекорды, советы-тренировки, аксессуары в магазине',
      'Ползунок размера питомца в настройках',
      'Проверка обновлений и этот список «Что нового»',
      'Импорт прогресса чинится сам, если код повредился при пересылке',
    ],
    en: [
      'SET: hint button 💡, mistake breakdown stays until you close it, striped fill is readable now, logic tips in help',
      'Bottom buttons no longer hide behind system navigation (Samsung etc.)',
      'Pet and chat toggles apply instantly',
      'Pet: feeding, custom name, petting, record celebrations, training suggestions, shop accessories',
      'Pet size slider in settings',
      'Update check and this "What’s new" list',
      'Progress import now survives codes mangled by messengers',
    ],
  },
  {
    version: '1.145.0',
    date: '2026-07-23',
    ru: [
      'Питомец: три облика на выбор — Нейро-кот, Робот и Нейрон',
      'Все 60 игр переведены на единый каркас: поле по центру, кнопки снизу',
      '12 языков, включая арабский с зеркальным интерфейсом',
    ],
    en: [
      'Pet: three looks to choose from — Neuro Cat, Robot and Neuron',
      'All 60 games moved to a unified layout: field centered, actions at the bottom',
      '12 languages including Arabic with RTL interface',
    ],
  },
  {
    version: '1.131.0',
    date: '2026-07-22',
    ru: [
      'Появился питомец Синапс — гуляет по экрану и растёт от ваших тренировок',
      'Веб-демо на сайте psy-games.pro',
    ],
    en: [
      'Meet Synapse the pet — walks the screen and grows with your training',
      'Web demo on psy-games.pro',
    ],
  },
];
