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
    version: '2.37.42',
    date: '2026-09-04',
    ru: ['Экран игры перестал вести себя как веб-страница: быстрые касания в играх на реакцию больше не увеличивают её и не сдвигают'],
    en: ['Game screens no longer behave like a web page: fast taps in reaction games can no longer zoom or shift them'],
  },
  {
    version: '2.37.41',
    date: '2026-09-04',
    ru: ['Судоку: подсказка перестала двоиться — счётчик уехал на саму кнопку, а шапка разжалась на одну капсулу'],
    en: ['Sudoku: the hint no longer appears twice — the counter moved onto the button itself, freeing up the header'],
  },
  {
    version: '2.37.40',
    date: '2026-09-04',
    ru: ['Итог зарядки говорит, где сегодня вышло лучше обычного и где просело — по навыкам, а не голыми очками. Свёрнуто: раскрывается касанием'],
    en: ['The warm-up summary now says where you beat your usual and where you dipped — by skill, not raw points. Collapsed by default, one tap to open'],
  },
  {
    version: '2.37.39',
    date: '2026-09-04',
    ru: ['«Пауза» переведена целиком: указания к телу теперь звучат на своём языке на всех двенадцати, а не только заголовки программ'],
    en: ['Pause is fully translated: the body cues now speak your language in all twelve, not just the programme titles'],
  },
  {
    version: '2.37.38',
    date: '2026-09-04',
    ru: ['Судоку: лестница выросла с 80 до 92 уровней — двенадцать готовых ступеней комбо-пояса были недоступны из игры'],
    en: ['Sudoku: the ladder now runs to 92 levels instead of 80 — twelve finished combo-belt steps were unreachable'],
  },
  {
    version: '2.37.37',
    date: '2026-09-04',
    ru: ['Сборки для iPhone снова доезжают до TestFlight: параллельные выпуски отзывали подпись друг у друга'],
    en: ['iPhone builds reach TestFlight again: parallel releases were revoking each other\u2019s signing certificate'],
  },
  {
    version: '2.37.36',
    date: '2026-09-04',
    ru: [
      '«Доска в уме»: спрашиваемая клетка теперь залита цветом, а её имя написано крупно — не приходится выискивать тонкую рамку',
      'Судоку: подсветку строки и столбца можно выключить в настройках',
    ],
    en: [
      'Board in Mind: the asked square is filled with colour and its name is printed large — no more hunting for a thin outline',
      'Sudoku: the row and column highlight can now be switched off in settings',
    ],
  },
  {
    version: '2.37.35',
    date: '2026-09-04',
    ru: [
      'Одиночки разошлись по развилкам: N-back в «Объём памяти», «Навигатор» в «Зрительную память», Story Recall в «Слова»',
      '«Гимнастика глаз» вернулась карточкой в сетку — раньше до неё можно было дойти только через «Паузу»',
    ],
    en: [
      'Stragglers moved into hubs: N-back into Memory Span, Navigator into Visual Memory, Story Recall into Words',
      'Eye Gym is back as its own card — before, the only way in was through Pause',
    ],
  },
  {
    version: '2.37.34',
    date: '2026-09-04',
    ru: [
      'Развилки открыты всем профилям: каталог стал короче, а упражнения — на месте, внутри своей развилки',
      'Внутри развилки видно только то, что открыто твоему профилю',
      'Питомец в шапке стал заметно крупнее',
    ],
    en: [
      'Hubs are now open to every profile: a shorter catalogue with the same exercises, grouped inside',
      'A hub shows only the exercises your profile has access to',
      'The pet in the header is noticeably bigger',
    ],
  },
  {
    version: '2.37.33',
    date: '2026-09-04',
    ru: [
      'Слова в аудио-упражнениях читают живые люди, а не машина: 632 записи носителей на русском, немецком и английском',
      'Кто именно читает — на экране «Источники»: имена чтецов и лицензии',
    ],
    en: [
      'Words in audio exercises are now read by real people, not a machine: 632 native-speaker recordings in Russian, German and English',
      'Who reads them is listed on the Sources screen, with names and licences',
    ],
  },
  {
    version: '2.37.32',
    date: '2026-09-04',
    ru: ['Выход жестом от левого края и «Математическая шкала» без подтверждений — доехали до магазинов'],
    en: ['Edge-swipe exit and the confirm-free Math Slider have finally shipped'],
  },
  {
    version: '2.37.31',
    date: '2026-09-04',
    ru: ['Выход жестом от левого края и «Математическая шкала» без подтверждений — доехали до сборки: два новых гейта роняли проверку типов'],
    en: ['Edge-swipe exit and the confirm-free Math Slider now actually ship — two new gates were breaking the typecheck'],
  },
  {
    version: '2.37.30',
    date: '2026-09-04',
    ru: ['Из любого упражнения теперь можно выйти жестом от левого края экрана — не тянуться к кнопке в дальнем углу'],
    en: ['Swipe in from the left edge to leave any exercise — no more reaching for the far corner button'],
  },
  {
    version: '2.37.29',
    date: '2026-09-04',
    ru: [
      '«Математическая шкала»: выбранное число стоит над шкалой, рядом с примером — палец его больше не закрывает',
      'Подтверждать оценку не нужно: отпусти ползунок, и через три секунды тишины ответ засчитается сам',
    ],
    en: [
      'Math Slider: your estimate now sits above the scale next to the expression — your finger no longer covers it',
      'No confirm tap: let go of the marker and after three seconds of stillness the answer is recorded',
    ],
  },
  {
    version: '2.37.28',
    date: '2026-09-04',
    ru: ['«Операционный охват» переехал из «Объёма памяти» в «Счёт» — там, где ведётся счёт'],
    en: ['Operation Span moved from Memory Span to Counting — where the arithmetic lives'],
  },
  {
    version: '2.37.27',
    date: '2026-09-04',
    ru: ['«Трекер объектов»: последний выбранный шар засчитывает раунд сам — отдельной кнопки подтверждения больше нет'],
    en: ['Object Tracker: the last ball you pick ends the round by itself — no separate confirm button'],
  },
  {
    version: '2.37.26',
    date: '2026-09-04',
    ru: ['Слова в «Слуховом охвате», «Минимальных парах» и «Диктанте» звучат живой записью, а не машинным голосом — 1438 записей на семи языках'],
    en: ['Words in Listening Span, Minimal Pairs and Dictation now play as real recordings instead of the machine voice — 1438 samples across seven languages'],
  },
  {
    version: '2.37.25',
    date: '2026-09-04',
    ru: [
      '«Гибкость» теперь про то, чтобы не залипать на признаке: закономерности, тройка признаков, символ-цифра',
      '«Переключение задач» и Висконсинский тест переехали в «Конфликт внимания», «Следопыт» — в «Маршруты»',
    ],
    en: [
      'Flexibility is now about not getting stuck on a feature: patterns, set, symbol-digit',
      'The Switching Task and the Wisconsin test moved to Attention Conflict, Trail Making to Routes',
    ],
  },
  {
    version: '2.37.24',
    date: '2026-09-04',
    ru: ['Новая развилка «Маршруты»: «Точки» и «Одна линия» — обе про путь, который обязан покрыть всё'],
    en: ['New “Routes” hub: Dots and One Line — both about a path that must cover everything'],
  },
  {
    version: '2.37.23',
    date: '2026-09-04',
    ru: ['«Три сети внимания» и «Устойчивое внимание» переехали в развилку «Конфликт внимания»'],
    en: ['Attention Network Test and Continuous Performance Test moved into the “Attention Conflict” hub'],
  },
  {
    version: '2.37.22',
    date: '2026-09-04',
    ru: ['Маджонг больше не «перескакивает» уровень: пока карточка итога на экране, в шапке стоит пройденный'],
    en: ['Mahjong no longer seems to skip a level: while the result card is up, the header shows the level you cleared'],
  },
  {
    version: '2.37.21',
    date: '2026-09-04',
    ru: [
      '«Ритм и высота» снова звучит на телефоне',
      'В ханойской башне диск больше не пропадает при перетаскивании',
      '«Сортировка товаров» говорит, за что засчитан уровень, если цель была не «убрать всё»',
    ],
    en: [
      'Rhythm & Pitch plays sound on the phone again',
      'In the Tower of Hanoi the disc no longer vanishes while dragging',
      'Goods Sort now says why a level counted when the goal was not “clear everything”',
    ],
  },
  {
    version: '2.37.20',
    date: '2026-09-04',
    ru: [
      'Охват памяти на слух, при чтении и со счётом переехали в развилку «Объём памяти»',
      'Слова в аудио-упражнениях зазвучат живой записью вместо машинного голоса — по мере готовности корпуса',
    ],
    en: [
      'Listening, reading and operation span moved into the “Memory Span” hub',
      'Words in audio exercises will play as real recordings instead of the machine voice, as the corpus fills in',
    ],
  },
  {
    version: '2.37.19',
    date: '2026-09-04',
    ru: [
      'Новая развилка «Башни»: ханойская башня и башня Лондона теперь рядом — обе про план на несколько ходов вперёд',
    ],
    en: [
      'New “Towers” hub: the Tower of Hanoi and the Tower of London side by side — both about planning moves ahead',
    ],
  },
  {
    version: '2.37.18',
    date: '2026-09-04',
    ru: [
      'На карточке-развилке появился значок с числом упражнений внутри — видно сразу, что это меню, а не игра',
      'В каждой категории развилки идут первыми, потом отдельные упражнения',
    ],
    en: [
      'Hub cards now carry a badge with the number of exercises inside — you see at once it is a menu, not a game',
      'In every category hubs come first, then the standalone exercises',
    ],
  },
  {
    version: '2.37.17',
    date: '2026-09-04',
    ru: [
      'Новое упражнение «Диктант»: фраза звучит, вы печатаете её целиком — опечатка не пускает дальше',
      'На итоге видно знаки в минуту, точность и слабые клавиши',
    ],
    en: [
      'New exercise “Dictation”: the phrase is read out and you type it in full — a typo blocks the way',
      'The result shows characters per minute, accuracy and your weak keys',
    ],
  },
  {
    version: '2.37.16',
    date: '2026-09-04',
    ru: [
      'Каталог собрался в развилки: Счёт, Слова, Слух, Поиск глазами, Гибкость, Решения под риском, Зрительная память, Мнемотехники и Языки',
      'Пока это предпросмотр в профиле НЗТ-48 — в остальных профилях каталог прежний',
    ],
    en: [
      'The catalogue folded into hubs: Counting, Words, Hearing, Visual Search, Flexibility, Decisions Under Risk, Visual Memory, Mnemonics and Languages',
      'For now it is a preview in the NZT-48 profile — other profiles keep the catalogue as it was',
    ],
  },
  {
    version: '2.37.15',
    date: '2026-09-04',
    ru: [
      '«Торможение» и «Мишени» переехали внутрь «Конфликта внимания» — каталог короче, а упражнения на месте',
      'Трекер объектов: движение снова идёт само, пошаговый режим стал галочкой в настройке',
    ],
    en: [
      'Inhibition and Targets moved inside Attention Conflict — a shorter catalogue, same exercises',
      'Object tracker: motion runs on its own again; the step-by-step mode is now a checkbox',
    ],
  },
  {
    version: '2.37.14',
    date: '2026-09-04',
    ru: [
      '«Доска в уме»: после ответа фишка переворачивается в настоящую фигуру — сразу видно, попал или промахнулся',
      'Словарь: новый режим «Печатать» — набираете перевод целиком, опечатка не пускает дальше (нужна настоящая клавиатура)',
    ],
    en: [
      'Blind board: after your answer the token flips into the real piece — you see at once whether you were right',
      'Vocabulary: new “Type it” mode — type the translation in full, a typo blocks the way (needs a real keyboard)',
    ],
  },
  {
    version: '2.37.13',
    date: '2026-09-04',
    ru: [
      'Новое упражнение «Тоны китайского»: слышите слог — определяете тон, дальше выбираете слог целиком',
    ],
    en: [
      'New exercise “Chinese Tones”: hear a syllable, name its tone, then pick the whole syllable',
    ],
  },
  {
    version: '2.37.12',
    date: '2026-09-04',
    ru: [
      'У китайских слов появились пиньинь и тоны — 189 слов словаря',
      '«Минимальные пары» заговорили по-китайски: 13 пар на zh/z, ch/c, sh/s и -n/-ng, с пиньинем на кнопке',
      'Новый экран «Источники» в настройках: откуда взяты данные и картинки и на каких условиях',
    ],
    en: [
      'Chinese words now have pinyin and tones — 189 words in the dictionary',
      'Minimal Pairs now speaks Chinese: 13 pairs for zh/z, ch/c, sh/s and -n/-ng, with pinyin on the button',
      'New “Sources” screen in settings: where the data and artwork come from and under what terms',
    ],
  },
  {
    version: '2.37.10',
    date: '2026-09-04',
    ru: [
      'Шапка игры: под счётчиками пропали пустые белые коробки — теперь это один ряд пилюль, а не два',
    ],
    en: [
      'Game header: the empty white boxes under the counters are gone — one row of pills instead of two',
    ],
  },
  {
    version: '2.37.9',
    date: '2026-09-04',
    ru: [
      'Голосовая заметка показывает уровень и на телефонах со старым браузером: видно сразу, слышно вас или нет',
      'Если микрофон отдаёт тишину, приложение говорит об этом во время записи, а не молчит до отправки',
    ],
    en: [
      'Voice notes now show the level on phones with an old browser: you can see at once whether you are heard',
      'If the microphone returns silence, the app says so while recording instead of staying quiet until you send',
    ],
  },
  {
    version: '2.37.7',
    date: '2026-09-04',
    ru: [
      'Судоку: цветные группы больше не пляшут — раньше подсветка строки стирала их цвет, и при каждом нажатии раскраска будто переезжала',
      'Подсветка строки и столбца в судоку стала видимой в светлой теме — до этого она не рисовала ничего',
      'Подсказка дня ведёт туда, где вы пока слабее всего',
    ],
    en: [
      'Sudoku: coloured groups no longer jump around — row highlighting used to erase their colour on every tap',
      'Row and column highlighting in sudoku is now visible in the light theme — before it drew nothing',
      'The daily hint now points to your weakest area',
    ],
  },
  {
    version: '2.37.6',
    date: '2026-09-03',
    ru: [
      'Рекорд теперь у каждого упражнения: на итоге видно свой лучший уровень и лучший среди игроков',
      'Питомец перестал просвечивать, морда больше не обрезается криво',
      'Нажатие на питомца в углу открывает его экран — с любого экрана игры',
      '«Цель дня» спрашивает одной строкой: форма разворачивается, когда её открывают',
    ],
    en: [
      'Every exercise now has a record: the result screen shows your best level and the best among players',
      'The pet is no longer see-through, and its face is not cropped off-centre',
      'Tapping the pet in the corner opens its screen from any game screen',
      'Day goal asks in one line: the form expands when you open it',
    ],
  },
  {
    version: '2.37.5',
    date: '2026-09-03',
    ru: [
      '«Доска в уме»: настоящие шахматные фигуры вместо символов шрифта и светлая классическая доска',
      'Подписи полей a–h и 1–8 теперь по краям доски, а не мелким шрифтом в углах клеток',
      'Счётчики в шапке одного цвета во всех упражнениях: ошибки красные, верные зелёные, очки и серия тёплые',
    ],
    en: [
      'Blind Board: real chess pieces instead of font symbols, and a light classic board',
      'a–h and 1–8 labels now run along the edges of the board instead of tiny corner marks',
      'Header counters share one colour scheme across all exercises: errors red, correct green, points and streak warm',
    ],
  },
  {
    version: '2.37.4',
    date: '2026-09-03',
    ru: [
      'Питомец теперь на каждом экране игры — и в настройке, и в партии, рядом с кнопкой правил',
      '«Доска в уме»: можно включить пустую доску и подписи полей a–h, 1–8, пока учитесь ориентироваться',
      'Блок «Сегодня» больше не растёт без предела: три игры и переход в статистику по нажатию',
      'У ряда с зарядкой и практиками появился заголовок',
    ],
    en: [
      'The pet is now on every game screen — setup and play alike, next to the rules button',
      'Blind Board: you can turn on an empty board and a–h, 1–8 labels while you learn the coordinates',
      'The Today block no longer grows without limit: three games and a tap to open statistics',
      'The warm-up and practices row got a heading',
    ],
  },
  {
    version: '2.37.3',
    date: '2026-09-03',
    ru: [
      'Питомец на своём экране снова виден: портрет схлопывался в ноль и его не было вовсе',
      'Облики питомца теперь обновляются сами — без ожидания новой версии приложения',
      '«Пропущенное слово»: фраз стало 40 на язык вместо 16, и подряд они больше не повторяются',
    ],
    en: [
      'The pet is visible on its own screen again: the portrait collapsed to zero and simply was not there',
      'Pet looks now update on their own — no waiting for a new app version',
      'Missing Word: 40 phrases per language instead of 16, and no more repeats in a row',
    ],
  },
  {
    version: '2.37.2',
    date: '2026-09-03',
    ru: [
      'Питомец встал вплотную к кнопке правил — раньше между ними вклинивалась кнопка самой игры',
    ],
    en: [
      'The pet now sits right next to the rules button — a game button used to wedge between them',
    ],
  },
  {
    version: '2.37.1',
    date: '2026-09-03',
    ru: [
      'Питомец вернулся на экран: в 2.37.0 он оказался под кнопкой правил и был не виден вовсе',
      '«Дворец памяти»: предметы и места теперь помещаются вместе — не надо бегать вверх-вниз, чтобы их сопоставить',
      'Там же добавлена строка о том, ЗАЧЕМ игра: раньше объясняли только, что нажимать',
    ],
    en: [
      'The pet is back on screen: in 2.37.0 it ended up under the rules button and was invisible',
      'Memory Palace: items and places now fit together — no more scrolling up and down to match them',
      'And a line about WHY the game exists: before, only the mechanics were explained',
    ],
  },
  {
    version: '2.37.0',
    date: '2026-09-03',
    ru: [
      'Питомец переехал к кнопке правил и больше не кочует по экрану — он на одном месте и в настройке игры, и в самой игре',
      'В значке видно морду крупным планом: раньше фигурка целиком давала голову размером с пятнышко',
      'Верхний ряд счётчиков перестал дёргаться — цифры больше не меняют ширину пилюли',
      'Громкость звука теперь ползунком, а не только включить-выключить',
    ],
    en: [
      'The pet moved next to the rules button and stopped wandering — same spot in game setup and in the game itself',
      'Its badge now shows a close-up of the face: the full figure made the head a tiny dot',
      'The counter row stopped jumping — digits no longer change the pill width',
      'Sound volume is a slider now, not just on/off',
    ],
  },
  {
    version: '2.36.0',
    date: '2026-09-03',
    ru: [
      'Коллекция: сундук теперь открывается — двенадцать полок, у каждой имя и цена. Видно, что уже собрано и что впереди',
      'После взятого уровня можно крутить колесо: ×1.5, ×2 или ×3 к заработанным звёздам. Рекламы в нём нет',
      '«Сортировка товаров» появилась в стартовом наборе, и товары стали крупнее: одна ниша на четыре больше не ужимает весь шкаф',
      '«Доска в уме»: вопрос называет клетку прямо — «что стоит на g8?», а не «на подсвеченной»',
      'С экрана выбора первой игры теперь есть выход, и служебные кнопки в играх перестали вылезать за край',
    ],
    en: [
      'Collection: the chest opens now — twelve shelves, each with a name and a price. You see what you have and what is ahead',
      'After a cleared level you can spin the wheel: ×1.5, ×2 or ×3 on the stars you earned. No ads in it',
      'Goods Sort joined the starter set, and the goods got bigger: one four-slot niche no longer shrinks the whole shelf',
      'Board in Mind: the question names the square — “what is on g8?” instead of “on the highlighted square”',
      'The first-game picker now has a way out, and in-game buttons stopped running off the edge',
    ],
  },
  {
    version: '2.35.0',
    date: '2026-09-03',
    ru: [
      '«Поворот фигур»: после ошибки игра больше не встаёт — кнопка «дальше» переехала в нижний ряд, откуда она не может уехать за край экрана',
      'Маджонг: слои перестали обманывать. Плитка теперь выглядит доступной ровно тогда, когда она доступна на самом деле',
      'Открывается по уровням: подсказка со 2-го, отмена хода с 3-го, наряды питомца с 8-го. Запертая кнопка не прячется — на ней видно, когда откроется',
      'Сундук коллекции: у игры появилась дальняя цель, которая видна с главной',
    ],
    en: [
      'Mental rotation: the game no longer stalls after a mistake — the “next” button moved to the bottom row, where it cannot slide off screen',
      'Mahjong: layers stopped lying. A tile now looks available exactly when it actually is',
      'Unlocks by level: hints from level 2, undo from 3, pet outfits from 8. A locked button is not hidden — it shows when it opens',
      'Collection chest: a long-term goal that is visible from the home screen',
    ],
  },
  {
    version: '2.34.5',
    date: '2026-09-03',
    ru: [
      'Счётчики в шапке теперь правильно читаются вслух: подпись стоит на самой кнопке',
      'После взятого уровня видно, сколько звёзд стало в копилке, а не только сколько начислено',
    ],
    en: [
      'Header counters are announced correctly by screen readers now',
      'After a cleared level you see the new star balance, not just what was earned',
    ],
  },
  {
    version: '2.34.4',
    date: '2026-09-03',
    ru: [
      'Судоку: границы клеток перестали пропадать и «гулять» — теперь линия ровно в один пиксель, а границы блоков ещё и другого цвета',
      '«Поворот фигур»: варианты ответа встали по центру экрана, а после ошибки до кнопки «дальше» можно дотянуться',
      '«Слежение за объектом»: в щадящем режиме после каждого шага виден след — откуда объект пришёл',
      '«Доска в уме»: фигуры крупнее',
      '«Соедини цепочку»: на поле написано, что линии могут пересекаться',
      'Фрактальная судоку: объяснение красной цифры показывается каждый раз, а не один раз за партию',
    ],
    en: [
      'Sudoku: cell borders stopped vanishing and wandering — the line is exactly one pixel now, and block borders differ in colour too',
      'Mental rotation: the answer options are centred, and the “next” button is reachable after a mistake',
      'Object tracking: in reduced-motion mode each step now leaves a trail showing where the object came from',
      'Blindfold board: bigger pieces',
      'Trail making: the field now says lines may cross',
      'Fractal sudoku: the red-digit explanation shows every time, not once per game',
    ],
  },
  {
    version: '2.34.3',
    date: '2026-09-03',
    ru: [
      'Счётчики в шапке больше не прячутся и не прыгают: вместо слов — значки, время короткое (4:55 вместо 295.3с)',
      'Нажми на любой счётчик — всплывёт, что это за число',
    ],
    en: [
      'Header counters no longer hide or jump: icons instead of words, short time (4:55 instead of 295.3s)',
      'Tap any counter to see what the number means',
    ],
  },
  {
    version: '2.34.2',
    date: '2026-09-02',
    ru: [
      'Техническая версия: приложение выходит на iPhone — на пользователя ничего не влияет',
    ],
    en: [
      'Technical release: the iPhone build now ships — nothing changes for you',
    ],
  },
  {
    version: '2.34.1',
    date: '2026-09-02',
    ru: [
      'Техническая версия: починена выкладка сборки для iPhone — на пользователя ничего не влияет',
    ],
    en: [
      'Technical release: fixed the iPhone build upload — nothing changes for you',
    ],
  },
  {
    version: '2.34.0',
    date: '2026-09-02',
    ru: [
      'Экран больше не ездит под пальцем: в играх, где нужно вести линию или тащить предмет, страница пыталась прокручиваться одновременно с ходом',
      'Верхняя и нижняя панели перестали вылезать за край на узких телефонах — счёт, «Правила» и «Перемешать» больше не срезаются',
      'Маджонг: ряды не прыгают при снятии пары у края доски',
      'Сортировка товаров: перетаскивание доводит ход до конца, а полка при сборке тройки светится золотом вместо белой вспышки',
      'Шкаф выглядит цельным: сплошные участки стали деревом, а не пустыми плитками',
      '«Прикидка на числовой прямой»: выбранное число подняли над ползунком — раньше его закрывал палец',
      '«Ритм и высота»: кнопку «Тап» видно заранее, а без замера задержки теперь можно просто начать игру',
      '«Одна линия»: фигуры перестали быть вариациями одного четырёхугольника',
      'Кнопка «Начать» теперь всегда внизу экрана — не нужно каждый раз мотать настройку до конца',
      'Новая иконка приложения на всех пяти платформах',
    ],
    en: [
      'The screen no longer scrolls under your finger while you drag or draw a line',
      'Top and bottom bars stopped running off the edge on narrow phones',
      'Mahjong: rows no longer jump when you clear a pair at the edge of the board',
      'Goods sort: dragging now completes the move, and a matched shelf glows gold instead of flashing white',
      'The cabinet looks solid: filled sections are wood now, not blank tiles',
      'Number-line estimation: the chosen value moved above the slider, out from under your finger',
      'Rhythm and pitch: the Tap button is visible up front, and you can start without the latency check',
      'One line: figures are no longer variations of a single quadrilateral',
      'The Start button now sits at the bottom of the screen — no more scrolling to the end every time',
      'New app icon on all five platforms',
    ],
  },
  {
    version: '2.33.0',
    date: '2026-09-02',
    ru: [
      'Приложение вышло на iPhone: с этой версии сборка идёт сразу на пять платформ — Android, iPhone, Mac, Windows и Linux',
      'В «Сортировке товаров» замок покрывается трещинами по мере отсчёта — видно, что он вот-вот откроется',
      'Подсказка теперь светится, а не просто обведена рамкой — её видно боковым зрением',
      'Уровень заканчивается разбором сцены: полки разъезжаются, и только потом приходит итог',
    ],
    en: [
      'The app is on iPhone now: from this version every release builds for five platforms at once — Android, iPhone, Mac, Windows and Linux',
      'In Goods Sort the timed lock cracks as it counts down — you can see it is about to open',
      'A hint now glows instead of just being outlined — visible from the corner of your eye',
      'A cleared level takes the scene apart: the shelves slide away, and only then the summary arrives',
    ],
  },
  {
    version: '2.32.0',
    date: '2026-09-02',
    ru: [
      'В «Сортировке товаров» три звезды наконец можно получить: раньше высшая оценка была недостижима почти на всех уровнях — порог стоял ниже, чем доска решается в принципе',
      'Оценка стала честной: сколько ходов нужно на самом деле, игра теперь считает поиском, а не прикидкой',
    ],
    en: [
      'In Goods Sort three stars are finally reachable: the top grade used to be impossible on almost every level — the threshold sat below what the board can be solved in',
      'The grade is honest now: the number of moves a board really needs is computed by search rather than guessed',
    ],
  },
  {
    version: '2.31.0',
    date: '2026-09-02',
    ru: [
      'Судоку: номер уровня и доска больше не расходятся — на 46-м уровне правда начинаются стрелки, а не остаётся термометр',
      'Термометры и стрелки перестали затирать границы клеток — сетка видна везде',
      'Во фрактальной судоку счётчик ошибок подписан словом, а при первой ошибке игра объясняет, что значит красная цифра',
      'В правиле стрелок сказано прямо: цифры на стрелке могут повторяться',
    ],
    en: [
      'Sudoku: the level number and the board no longer disagree — level 46 really starts the arrows instead of keeping thermometers',
      'Thermometers and arrows no longer erase cell borders — the grid stays visible everywhere',
      'In fractal sudoku the mistake counter now has a word, and the first mistake explains what a red digit means',
      'The arrow rule now says it plainly: digits along an arrow may repeat',
    ],
  },
  {
    version: '2.30.1',
    date: '2026-09-02',
    ru: [
      'Технический выпуск: те же правки, что и в 2.30.0 — предыдущий тег не дособрался',
    ],
    en: [
      'Maintenance release: the same changes as 2.30.0 — the previous tag did not finish building',
    ],
  },
  {
    version: '2.30.0',
    date: '2026-09-02',
    ru: [
      'Судоку и «Самурай» получили ту же шапку, что и остальные игры: уровень, ошибки, время и подсказки — плашками, а не строкой',
    ],
    en: [
      'Sudoku and Samurai now share the same header as every other game: level, mistakes, time and hints as badges rather than a text line',
    ],
  },
  {
    version: '2.29.0',
    date: '2026-09-02',
    ru: [
      'Счётчики в шапке стали одинаковыми во всех играх: те же плашки, тот же вид — раньше каждая игра рисовала их по-своему',
      'Счётчик ошибок убран из шапки: в тренажёре с подстройкой сложности ошибки — часть работы, а не провинность',
      'Где было что показать — добавлены серия, рекорд и остаток времени',
    ],
    en: [
      'Header counters now look the same in every game — each game used to draw them its own way',
      'The error counter is gone from the header: in an adaptive trainer mistakes are part of the work, not a failing',
      'Where there was something to show, streaks, personal bests and time left were added',
    ],
  },
  {
    version: '2.28.0',
    date: '2026-09-02',
    ru: [
      'В «Сортировке товаров» сложность наконец растёт вместе с уровнем: раньше шестнадцатый мог оказаться легче первого',
      'Новые правила вводятся не подряд, а по одному раз в несколько уровней — первые двадцать проходятся спокойно',
      'Досок стало больше: одна и та же фигура не повторяется несколько уровней подряд',
      'Плюс всё из 2.27.0: разгон счёта от серии, итог уровня по частям, потолок сложности в программах, товары внахлёст',
    ],
    en: [
      'In Goods Sort difficulty finally grows with the level: level sixteen could previously be easier than level one',
      'New rules now arrive one at a time every few levels — the first twenty play calmly',
      'More boards: the same shape no longer repeats for several levels in a row',
      'Plus everything from 2.27.0: streak-based score, staged level summary, difficulty cap in programmes, overlapping goods',
    ],
  },
  {
    version: '2.27.0',
    date: '2026-09-02',
    ru: [
      'Счёт разгоняется от серии: чем длиннее цепочка верных ходов, тем дороже каждый следующий — множитель виден рядом с прибавкой',
      'Итог уровня приходит по частям — звёзды, серия, награда, рекорд — а не одним кадром',
      'Программы тренировок больше не выдают задание выше освоенного: 14 игр давали новичку сразу трудный уровень',
      'В «Сортировке товаров» товары стоят внахлёст, как на настоящей полке, и стали заметно крупнее',
      'В N-back, «Блоках Корси» и «Пространственном размахе» появился личный рекорд',
    ],
    en: [
      'Score now accelerates with your streak: the longer the chain of correct moves, the more each next one is worth — the multiplier shows next to the gain',
      'The level summary arrives in parts — stars, streak, reward, record — instead of one flat frame',
      'Training programmes no longer hand out tasks above your level: 14 games used to drop beginners straight into hard settings',
      'In Goods Sort the items now overlap like on a real shelf, and became noticeably larger',
      'N-back, Corsi Blocks and Spatial Span now track your personal best',
    ],
  },
  {
    version: '2.26.1',
    date: '2026-09-02',
    ru: [
      'Технический выпуск: те же правки, что и в 2.26.0 — предыдущий тег не дособрался',
    ],
    en: [
      'Maintenance release: the same changes as 2.26.0 — the previous tag did not finish building',
    ],
  },
  {
    version: '2.26.0',
    date: '2026-09-02',
    ru: [
      'В «Сортировке товаров» шкаф занимает поле целиком — раньше треть экрана уходила в пустоту',
      'Особенности уровня (примёрзший ряд, строгая укладка, скрытый товар) стали значками в шапке вместо строки текста',
      'Появилось правило «Скрытая информация»: с шестнадцатого уровня часть товара прячется под «?», и теперь игра об этом предупреждает',
      'Набор «Зверята» назывался служебным кодом — исправлено на всех двенадцати языках',
    ],
    en: [
      'In Goods Sort the cabinet now fills the field — a third of the screen used to go to empty space',
      'Level quirks (frozen row, strict placement, hidden goods) became header icons instead of a line of text',
      'New rule “Hidden information”: from level sixteen some goods hide behind a “?”, and the game now says so',
      'The “Critters” set was showing an internal code as its name — fixed in all twelve languages',
    ],
  },
  {
    version: '2.25.1',
    date: '2026-09-02',
    ru: [
      'Технический выпуск: те же правки, что и в 2.25.0 — предыдущий тег не дособрался',
    ],
    en: [
      'Maintenance release: the same changes as 2.25.0 — the previous tag did not finish building',
    ],
  },
  {
    version: '2.25.0',
    date: '2026-09-02',
    ru: [
      'В «Сортировке товаров» шкаф стал шире, а товары крупнее — особенно заметно на большом экране',
      'Приложение теперь собирается и для Linux, а для iPhone появилась пробная сборка под симулятор',
    ],
    en: [
      'In Goods Sort the cabinet got wider and the goods bigger — most noticeable on a large screen',
      'The app now builds for Linux too, and an iPhone simulator build joined the pipeline',
    ],
  },
  {
    version: '2.24.0',
    date: '2026-09-02',
    ru: [
      'Шапка стала ниже и уже во всех тренажёрах: отступы теперь одни на все игры, поле получило место обратно',
      'В «Сортировке товаров» четыре счётчика вместо шести, а отмена, подсказка и перемешать переехали вниз — под большой палец',
    ],
    en: [
      'The header got shorter and narrower across every exercise: spacing is now shared by all games, and the board got its room back',
      'Goods Sort shows four counters instead of six, and undo, hint and shuffle moved to the bottom — within thumb reach',
    ],
  },
  {
    version: '2.23.0',
    date: '2026-08-31',
    ru: [
      'Сортировка товаров: набор «Микс» больше не завален почти одинаковыми молочными бутылками — их девять уехали в «Молочное», где различать оттенки и есть смысл игры',
      'Незрячим: полка теперь называет своё состояние — «заперта», «откроется через 3 хода», «примёрзла», — а не только товары на ней',
    ],
    en: [
      'Goods Sort: the Mix set is no longer crowded with near-identical milk bottles — nine of them moved to Dairy, where telling shades apart is the point',
      'Screen reader: a shelf now announces its state — “locked”, “opens in 3 moves”, “frozen” — instead of only the goods on it',
    ],
  },
  {
    version: '2.22.1',
    date: '2026-08-30',
    ru: [
      'Технический выпуск: те же правки зарядки, что и в 2.22.0 — предыдущий тег не дособрался',
    ],
    en: [
      'Maintenance release: the same warm-up fixes as 2.22.0 — the previous tag did not finish building',
    ],
  },
  {
    version: '2.22.0',
    date: '2026-08-30',
    ru: [
      'Зарядка: кнопка «Пропустить упражнение» наконец работает — раньше она нажималась и не делала ничего',
      'Зарядка больше не выдаёт задание выше вашего уровня: программа подтягивает на шаг вперёд, а не бросает сразу на двадцать слов',
      'Практика для глаз развернулась на весь экран — точка ходит широко, а не в узкой полосе',
    ],
    en: [
      'Warm-up: the “skip exercise” button finally works — it used to press and do nothing',
      'The warm-up no longer hands you a task above your level: the programme pulls you one step ahead instead of dropping twenty words at once',
      'The eye practice now fills the screen — the dot travels wide instead of along a narrow strip',
    ],
  },
  {
    version: '2.21.0',
    date: '2026-08-30',
    ru: [
      'Игра стала хвалить за серию: с третьего верного хода подряд у места действия всплывает слово, и оно растёт вместе с серией — «Точно!», «Отлично!», «Великолепно!»',
    ],
    en: [
      'Games now praise a streak: from the third correct move in a row a word pops up where you acted, growing with the streak — “Nice!”, “Great!”, “Superb!”',
    ],
  },
  {
    version: '2.20.0',
    date: '2026-08-30',
    ru: [
      'Игра теперь отвечает на ход: звук, серия подряд в шапке и реакция питомца пришли в десятки тренажёров, где раньше верное действие проходило молча',
      'Итог партии появляется по частям — сначала звёзды, потом числа, потом кнопки, — а не вываливается одним кадром',
      'Зарядка: кнопки под практикой собраны в ряд по центру, картинка больше не схлопывается в полосу',
    ],
    en: [
      'Games now answer your move: sound, a running streak in the header and the pet reacting arrived in dozens of exercises where a correct action used to pass in silence',
      'The result screen arrives in parts — stars, then numbers, then buttons — instead of landing all at once',
      'Warm-up: the buttons under the practice are gathered in a centred row, and the picture no longer collapses into a strip',
    ],
  },
  {
    version: '2.19.0',
    date: '2026-08-30',
    ru: [
      'Питомец переехал в шапку ВСЕХ тренажёров, и верхняя панель стала одинаковой везде — раньше она выглядела по-своему почти в каждой игре',
    ],
    en: [
      'The pet now sits in the header of EVERY exercise, and the top bar looks the same everywhere — it used to differ in almost every game',
    ],
  },
  {
    version: '2.18.0',
    date: '2026-08-30',
    ru: [
      'Поле «Матрицы памяти» больше не жмётся в уголок: клетки выросли примерно вдвое и занимают экран целиком',
      'Питомец в шапке сел в рамку-медальон, и рамка меняет цвет вместе с его настроением — видно даже краем глаза',
    ],
    en: [
      'The Memory Matrix board no longer huddles in a corner: cells roughly doubled and now fill the screen',
      'The header pet moved into a medallion frame whose colour follows its mood — visible from the corner of your eye',
    ],
  },
  {
    version: '2.17.1',
    date: '2026-08-30',
    ru: [
      'Технический выпуск: тот же набор правок, что и в 2.17.0 — сборка предыдущего тега не дошла до конца',
    ],
    en: [
      'Maintenance release: same changes as 2.17.0 — the previous tag did not finish building',
    ],
  },
  {
    version: '2.17.0',
    date: '2026-08-30',
    ru: [
      'Четыре игры с сеткой — «Матрица памяти», N-back, «Блоки Корси», «Пространственный размах» — стали живыми: клетки объёмные и загораются, у ответа есть значок, а не только цвет, поле выросло на весь экран',
      'В шапке появился питомец: он радуется верному ходу и грустит на ошибке. Вместо очков и счётчика ошибок — серия подряд и ваш личный рекорд',
    ],
    en: [
      'Four grid games — Memory Matrix, N-back, Corsi Blocks and Spatial Span — came alive: cells have depth and light up, answers carry a shape and not just a colour, and the board finally fills the screen',
      'A pet joined the header: it cheers a correct move and sulks on a miss. Points and the error counter gave way to your current streak and personal best',
    ],
  },
  {
    version: '2.16.0',
    date: '2026-08-30',
    ru: [
      'Лимит ходов в «Сортировке товаров» теперь и правда заканчивает уровень: раньше можно было ходить сколько угодно, а счётчик в шапке предупреждает цветом, когда ходы на исходе',
    ],
    en: [
      'The move limit in Goods Sort now actually ends the level — before, you could keep playing forever — and the counter warns you by colour when moves are running out',
    ],
  },
  {
    version: '2.15.0',
    date: '2026-08-30',
    ru: [
      'Решатель сортировки товаров стал вдвое дешевле на глубоком переборе: подсказка и проверка «доска ещё разбирается» отвечают увереннее там, где раньше сдавались',
    ],
    en: [
      'The Goods Sort solver got twice as cheap on deep search: hints and the “this board is still solvable” check now answer where they used to give up',
    ],
  },
  {
    version: '2.14.0',
    date: '2026-08-30',
    ru: [
      'Сортировка товаров больше не падает при переходе на новый уровень. Ошибка «доска собрана неверно» приходила там, где форма полки меняла число ниш, а размер сетки оставался прежним',
      'Двенадцать новых плюшевых зверят отдельным набором «Зверята»: слонёнок, котёнок, корги, панда, совёнок, тигрёнок, осьминожек, ленивец, ёжик, китёнок, лягушонок и динозаврик',
      'Лисёнок из наборов убран — по просьбе из отзыва',
    ],
    en: [
      'Goods Sort no longer crashes when a new level starts. The “board assembled wrong” error appeared where the shelf shape changed the number of slots while the grid size stayed the same',
      'Twelve new plush critters in their own “Critters” set: baby elephant, kitten, corgi puppy, panda, owlet, tiger cub, octopus, sloth, hedgehog, baby whale, frog and baby dinosaur',
      'The fox is out of the sets — as asked in a report',
    ],
  },
  {
    version: '2.13.1',
    date: '2026-08-30',
    ru: [
      'Приправа Бездны: узел теперь отдаёт цифру наверх ровно на объявленной доле решённого. Раньше порог считался до того, как приправа выкапывала лишние подсказки, и узел открывался чуть раньше обещанного',
    ],
    en: [
      'Spice of the Abyss: a node now floats its digit up at exactly the share it promises. The threshold used to be computed before the spice dug out extra givens, so nodes opened a little early',
    ],
  },
  {
    version: '2.13.0',
    date: '2026-08-30',
    ru: [
      'Лестница уровней стала двусторонней ещё в десяти тренажёрах: раньше они умели только повышать, и после серии неудач человек упирался в уровень, который ему не даётся. Теперь третий провал подряд мягко опускает на ступень ниже — переигровка пройденного при этом не наказывается',
      'У «Фрактала: Бездна» появилась приправа глубины: на нижнем слое включаются термометры и клетки-суммы, а подсказок становится меньше — решение остаётся единственным, это проверяется на каждой доске',
      'У профиля «Языки / Полиглот» теперь свои фон главной и стиль карты уровней — он был единственным без них. Заодно четыре темы карт, которые выглядели почти одинаково, разведены по-настоящему',
    ],
    en: [
      'Ten more trainers got a two-way ladder: they used to only go up, so after a losing streak you were stuck on a level that was too hard. Now a third loss in a row gently steps you down — replaying a cleared level is never punished',
      '“Fractal: The Abyss” gained the spice of the deep: the bottom layer switches on thermometers and sum cages while giving fewer digits — the solution stays unique, and that is verified on every board',
      'The “Languages / Polyglot” profile finally has its own home background and level-map style — it was the only one without them. Four map themes that looked nearly identical are now actually different',
    ],
  },
  {
    version: '2.12.0',
    date: '2026-08-29',
    ru: [
      '«Глаза и дыхание» заговорила на 12 языках: планировщик, каталог и экран практики — на языке приложения, названия всех наборов переведены. Подсказки шагов пока по-английски там, где перевод ещё едет',
    ],
    en: [
      '“Eyes & breathing” now speaks 12 languages: the planner, catalog and practice screen follow the app language, all set names are translated. Step cues stay in English where translation is still on its way',
    ],
  },
  {
    version: '2.11.0',
    date: '2026-08-29',
    ru: [
      'Практика «Глаза и дыхание» стала управляемой: «Пропустить» и «+30 сек» рядом с паузой, в таймере — номер шага «2/36 · 1:36», кнопка старта ныряет при чтении каталога и не закрывает карточки, а на итоге видно, какие практики пройдены',
    ],
    en: [
      'The “Eyes & breathing” practice is now steerable: “Skip” and “+30 sec” next to pause, the timer shows step position “2/36 · 1:36”, the start button dives away while you read the catalog, and the result lists which practices you completed',
    ],
  },
  {
    version: '2.10.0',
    date: '2026-08-29',
    ru: [
      'На экране практики «Глаза и дыхание» — крупный таймер до конца урока прямо у заголовка; в режиме погружения он не исчезает, а лишь приглушается. И блоки планировщика выровнены по верху',
    ],
    en: [
      'The practice screen of “Eyes & breathing” got a large end-of-lesson timer right by the title; in immersive mode it dims instead of vanishing. Planner blocks are top-aligned',
    ],
  },
  {
    version: '2.9.0',
    date: '2026-08-29',
    ru: [
      '«Глаза и дыхание» причёсана: длительность/контекст/подсказка — крупными кнопками по-русски, кнопка старта — компактная капсула со сводкой «что запускаю» и больше не ложится на карточки, у режима «Маршрут» появилось пояснение, служебные надписи убраны',
    ],
    en: [
      '“Eyes & breathing” polished: duration/context/guidance are large localized chips, the start button is a compact capsule with a summary and no longer covers the cards, the “Route” mode got an explanation, service labels removed',
    ],
  },
  {
    version: '2.8.0',
    date: '2026-08-29',
    ru: [
      '«Глаза и дыхание» запоминает твой формат: режим, длительность, обстановку, подсказку и выбранные практики — настроил один раз, дальше страница открывается твоей конфигурацией',
    ],
    en: [
      '“Eyes & breathing” remembers your format: mode, duration, context, guidance and chosen practices — set it once and the page opens with your configuration',
    ],
  },
  {
    version: '2.7.1',
    date: '2026-08-29',
    ru: [
      'Зарядка прокачана: выбор длины 5/10/15 минут вернулся (и запоминается), недельная сетка тренировок снова работает — ядро-снимок теперь по ПН/ЧТ/ВС, в остальные утра тренировка дня',
      'На карточке набора виден полный состав игр до старта, «Мозг сегодня» честно сравнивает снимок со снимком, а застрявшую игру можно пропустить кнопкой в шапке',
      'ИИ-разбор «Мозг сегодня» ожил — после зарядки текст теперь пишет ИИ по твоим цифрам',
    ],
    en: [
      'Warm-up powered up: the 5/10/15-minute choice is back (and remembered), the weekly training grid works again — the snapshot core now runs Mon/Thu/Sun, other mornings are the day’s training',
      'The set card shows the full game list before you start, “Brain today” honestly compares snapshot to snapshot, and a stuck game can be skipped from the header',
      'The AI “Brain today” write-up is live — after a warm-up the text is now written by AI from your numbers',
    ],
  },
  {
    version: '2.6.0',
    date: '2026-08-29',
    ru: [
      'Мишени: после трёх поражений подряд уровень честно опускается на ступень — как в остальных играх с лестницей. Подняться обратно быстрее, чем застрять на непосильном',
    ],
    en: [
      'Targets: after three defeats in a row the level honestly steps down — like other ladder games. Climbing back is faster than being stuck above your head',
    ],
  },
  {
    version: '2.5.0',
    date: '2026-08-29',
    ru: [
      'Отчёты о проблемах стали зорче: каждый теперь несёт последние 20 шагов по приложению и 10 ошибок консоли — починки будут находить причину быстрее',
    ],
    en: [
      'Problem reports got sharper: each now carries your last 20 in-app steps and 10 console errors — fixes will find the cause faster',
    ],
  },
  {
    version: '2.4.0',
    date: '2026-08-29',
    ru: [
      'Бездна прокачана: карандаш для пометок-кандидатов, схема слоёв на выборе похода (видно, сколько пазлов прячется на каждой глубине) и порталы — пары досок одного слоя, связанные общей цифрой: вывод существует только между ними',
    ],
    en: [
      'The Abyss powered up: a pencil for candidate marks, a layer map on trek selection (see how many puzzles hide at each depth) and portals — sibling boards linked by a shared digit: the deduction exists only between them',
    ],
  },
  {
    version: '2.3.0',
    date: '2026-08-29',
    ru: [
      'Судоку выросло до 92 уровня: комбо-пояс! Два правила на одной доске разом — термометры + ход коня (81–84), сэндвич + чёт/нечет (85–88), клетки-суммы + диагонали (89–92). Каждая пара знакома по одиночным уровням — теперь они складываются',
    ],
    en: [
      'Sudoku grows to level 92: the combo belt! Two rules on one board at once — thermometers + knight’s move (81–84), sandwich + parity (85–88), cages + diagonals (89–92). Each pair is familiar from single levels — now they stack',
    ],
  },
  {
    version: '2.2.0',
    date: '2026-08-29',
    ru: [
      'Витрина тем в магазине: наборы рисованных цифр судоку, 11 тем карты уровней, фоны главной и значки профилей — теперь можно купить оформление любого профиля за ⭐ и носить в своём. Свой стиль остаётся бесплатным',
      'Голосовые на старых устройствах: если системный WebView устарел и записывал тишину, теперь запись идёт микрофоном устройства напрямую — голос доезжает',
    ],
    en: [
      'Theme showcase in the shop: hand-drawn sudoku digit sets, 11 level-map themes, home backgrounds and profile badges — you can now buy any profile’s look for ⭐ and wear it in yours. Your own style stays free',
      'Voice notes on older devices: if the system WebView is outdated and used to record silence, recording now goes straight through the device microphone — your voice gets through',
    ],
  },
  {
    version: '2.1.0',
    date: '2026-08-29',
    ru: [
      'Ставка «Всё или ничего» в магазине: поставь 300 ⭐ и заходи 7 дней подряд — заберёшь 600. Пропустишь день — ставка сгорит, и Щит серии её не спасёт. Для тех, кому наград уже некуда девать',
    ],
    en: [
      '“All or Nothing” wager in the shop: stake 300 ⭐ and check in 7 days in a row to take 600. Miss a day and the stake burns — the Streak Shield won\'t save it. For those with nowhere left to spend rewards',
    ],
  },
  {
    version: '2.0.0',
    date: '2026-08-28',
    ru: [
      'PsyGames 2.0! Окно диалогов: в отзывах появилась вкладка «Диалог» — вся переписка с разработчиком как в мессенджере: твои сообщения, наши ответы и починки с версией. Спасибо NZT-48 — он спросил «а где окно диалогов?» раньше, чем мы его построили',
    ],
    en: [
      'PsyGames 2.0! Dialog window: the feedback sheet gained a “Dialog” tab — your whole conversation with the developer like a messenger: your messages, our replies and fixes with versions. Thanks to NZT-48 — he asked “where is the dialog window?” before we built it',
    ],
  },
  {
    version: '1.255.2',
    date: '2026-08-28',
    ru: [
      'Закрыт весь класс «игра открылась не тем, чем ждал»: незаконченные партии теперь всегда сверяются со входом — у самурая метка мега-босса стала свойством партии, а не двери',
    ],
    en: [
      'Closed the whole “game opened as something else” class: unfinished games now always match the entry — the samurai mega-boss badge belongs to the match, not the door',
    ],
  },
  {
    version: '1.255.1',
    date: '2026-08-28',
    ru: [
      'Починено: обычная судоку больше не утаскивает в незаконченные «Небоскрёбы»/«Неравенства» — их партии ждут за своими карточками. Спасибо Валентине за настойчивость!',
    ],
    en: [
      'Fixed: regular sudoku no longer drags you into unfinished Towers/Futoshiki — their games wait behind their own cards. Thanks to Valentina for persisting!',
    ],
  },
  {
    version: '1.255.0',
    date: '2026-08-28',
    ru: [
      'Лестница судоку выросла с 57 до 80 уровней: пояс ALS (58–65), пояс цепей (66–79) и «доска-легенда» на вершине — настоящие экстремальные доски с честными подписями пояса',
    ],
    en: [
      'The sudoku ladder grew from 57 to 80 levels: the ALS belt (58–65), the chains belt (66–79) and the “legend board” at the top — genuinely extreme boards with honest belt labels',
    ],
  },
  {
    version: '1.254.1',
    date: '2026-08-28',
    ru: [
      'Починено: судоку могла открыться «небоскрёбами Ур.45/8» — уровень обычной лестницы протекал в мини-лестницу. Спасибо Валентине за мгновенный сигнал!',
    ],
    en: [
      'Fixed: sudoku could open as “skyscrapers Lv.45/8” — the main ladder level leaked into the mini-ladder. Thanks to Valentina for the instant report!',
    ],
  },
  {
    version: '1.254.0',
    date: '2026-08-28',
    ru: [
      'Лиги выросли вдвое в высоту: над «Вершиной» — четыре новые фазы (Супер, Ультра, Легенда, Предел) с рангами внутри и своими трофеями. Отдельный поклон Валентине — её темп сломал старую лестницу',
      'Жетоны снова имеют вес: способности и косметика подорожали, а в магазине появилась престиж-полка для самых упорных (Оникс, Комета, Бриллиант, Бесконечный)',
    ],
    en: [
      'Leagues doubled in height: above Peak there are four new phases (Super, Ultra, Legend, Limit) with ranks inside and their own trophies. A special bow to Valentina — her pace broke the old ladder',
      'Tokens matter again: abilities and cosmetics cost more, and the shop gained a prestige shelf for the most devoted (Onyx, Comet, Diamond, Infinite)',
    ],
  },
  {
    version: '1.253.1',
    date: '2026-08-28',
    ru: [
      'Подбор игр для новичка — идея Валентины: три вопроса (настроение, время, склонность) — и приложение показывает три игры «под тебя» и твой профиль. Спасибо, Валентина!',
    ],
    en: [
      'Game picker for newcomers — Valentina’s idea: three questions (mood, time, taste) and the app shows three games picked for you plus your profile. Thank you, Valentina!',
    ],
  },
  {
    version: '1.252.1',
    date: '2026-08-28',
    ru: [
      'Новая игра «Фрактал: Бездна» — судоку, вложенная в судоку до трёх слоёв. Проваливайся по пунктирным клеткам до дна, решай — цифры всплывают наверх. Три объёма партии: от Разведки (десяток сеток) до Бездны (~2900 вложенных пазлов, марафон на недели)',
      'Вход — с экрана Фрактальной судоку или из раздела судоку. Партия сохраняется сама: возвращайся в любой момент',
    ],
    en: [
      'New game “Fractal: The Abyss” — a sudoku nested in a sudoku up to three layers deep. Dive through the dashed cells to the bottom, solve — digits float up. Three game sizes: from Scouting (a dozen grids) to The Abyss (~2900 nested puzzles, a weeks-long marathon)',
      'Enter from the Fractal Sudoku screen or the sudoku section. The game saves itself: come back anytime',
    ],
  },
  {
    version: '1.251.2',
    date: '2026-08-28',
    ru: [
      'Фрактальная судоку: инструменты (цифры/пометки/цвет) переехали наверх к «Отменить» — нижняя панель стала вдвое ниже, доска — заметно крупнее',
      'Клавиши цифр компактнее, лишние отступы убраны — поле больше не спорит с клавиатурой за место',
    ],
    en: [
      'Fractal sudoku: the tools (digits/notes/color) moved up next to Undo — the bottom panel is half as tall, the board is noticeably bigger',
      'Digit keys are more compact and extra gaps are gone — the board no longer fights the keypad for space',
    ],
  },
  {
    version: '1.251.0',
    date: '2026-08-28',
    ru: [
      'Починено: небоскрёбы, неравенства и killer после победы показывали пустой экран — теперь у каждого режима есть экран итога',
      'Починено: во фрактальной судоку «назад» переставал работать после захода в нижнюю сетку — из игры было не выйти',
      'Фрактальная судоку: карта стала интерактивной — коснись клетки с номером, и подсветится её нижняя сетка (и наоборот), второе касание открывает сетку',
      'В клетках корня теперь живут «призраки» — миниатюры вложенных сеток: видно, что под клеткой идёт своя судоку и как она продвигается',
    ],
    en: [
      'Fixed: skyscrapers, inequalities and killer showed a blank screen after winning — every mode now has a result screen',
      'Fixed: in fractal sudoku the back button stopped working after visiting a lower grid — you could not leave the game',
      'Fractal sudoku: the map is now interactive — tap a numbered cell and its lower grid lights up (and vice versa), a second tap opens the grid',
      'Root cells now hold “ghosts” — live miniatures of the nested grids: you can see a sudoku going on beneath the cell and how far it got',
    ],
  },
  {
    version: '1.250.0',
    date: '2026-08-28',
    ru: [
      'Фрактальная судоку: панель цифр всегда под рукой (больше не листать вниз), решённая нижняя сетка показывает свою цифру на карте, правила переписаны по шагам. Спасибо Валентине за замечания!',
      'Правила сэндвича — заново и проще, плюс подсказка «нажми на число у края»; пример в справке по центру',
      'Каталог помнит, где ты был: возврат из игры больше не выкидывает наверх списка',
    ],
    en: [
      'Fractal sudoku: the digit pad is always at hand (no more scrolling down), a solved lower grid shows its digit on the map, rules rewritten step by step. Thanks to Valentina for the feedback!',
      'Sandwich rules — rewritten simpler, plus a hint “tap an edge number”; the help example is centered',
      'The catalog remembers where you were: returning from a game no longer throws you to the top',
    ],
  },
  {
    version: '1.249.0',
    date: '2026-08-28',
    ru: [
      'Судоку: каждый 15-й уровень — МЕГА-БОСС: приглашение в самурая (пять сцепленных досок, партия на час с сохранением). Отказ ничего не отнимает — уровень уже засчитан',
    ],
    en: [
      'Sudoku: every 15th level is a MEGA-BOSS — an invitation to Samurai (five interlocked grids, an hour-long run with save & resume). Declining costs nothing — your level is already counted',
    ],
  },
  {
    version: '1.248.1',
    date: '2026-08-28',
    ru: [
      'Голосовые отзывы: если запись выходит немой из-за устаревшего системного WebView, приложение теперь называет настоящую причину и шаг — обновить «Android System WebView» в Play (раньше советовало проверить разрешение, которое и так выдано)',
    ],
    en: [
      'Voice feedback: when a recording comes out silent because of an outdated system WebView, the app now names the real cause and the fix — update “Android System WebView” in Play (it used to suggest checking a permission that was already granted)',
    ],
  },
  {
    version: '1.248.0',
    date: '2026-08-28',
    ru: [
      'Темы профилей: карта уровней в каждой игре получила подложку в духе твоего профиля — один и тот же луг с тропинкой у шахматиста графитовый, у детей витражный, у НЗТ-48 рентгеновский (11 тем)',
    ],
    en: [
      'Profile themes: every game’s level map got an underlay in your profile’s mood — the same meadow path is graphite for chess, stained-glass for kids, X-ray for NZT-48 (11 themes)',
    ],
  },
  {
    version: '1.247.0',
    date: '2026-08-28',
    ru: [
      'Лидерборд вырос до девяти игр: «Иди/стой» (реакция чистой партии), Ханой (время при минимуме ходов) и Счёт (десять раундов без ошибки) — со своими таблицами топа и рекорд-строкой на итоге',
    ],
    en: [
      'Leaderboard grew to nine games: Go/No-Go (clean-run reaction), Hanoi (time at minimum moves) and Counter (ten flawless rounds) — each with its own top list and a record line on the result screen',
    ],
  },
  {
    version: '1.246.0',
    date: '2026-08-28',
    ru: [
      'Рекорды видны везде, где собираются: все шесть игр лидерборда показывают на итоге строку «свой · лучший среди игроков» (реакция, тропинка, спаны, корси — раньше слали рекорды молча)',
      'Без сети строка честно показывает личный рекорд',
    ],
    en: [
      'Records now show where they are collected: all six leaderboard games display “yours · best among players” on the result screen (reaction, trails, spans, corsi used to submit silently)',
      'Offline the line honestly falls back to your personal best',
    ],
  },
  {
    version: '1.245.0',
    date: '2026-08-27',
    ru: [
      'Маджонг: с 10-го уровня каждый третий — «скрытые лица»: под накрытыми плитками «?», планировать приходится под неизвестность',
      'Зарядка: впереди каждый день идёт ядро-снимок из 5 игр в неизменной постановке — утренняя зарядка теперь сама и есть быстрый замер',
      'Полная оценка профиля ужата с 19 до 16 минут: внимание-тест вдвое короче (спад виден ко второй минуте), шарик — без пустых минут',
    ],
    en: [
      'Mahjong: from level 10 every third level has hidden faces — “?” under covered tiles, so you plan under uncertainty',
      'Warm-up: a 5-game snapshot core now leads every day in a fixed setup — your morning warm-up doubles as a quick measurement',
      'Full assessment trimmed from 19 to 16 minutes: the attention test is half as long (the decline shows by minute two), the balloon task loses its idle minutes',
    ],
  },
  {
    version: '1.244.0',
    date: '2026-08-27',
    ru: [
      'Судоку: два новых режима в развилке — «Небоскрёбы» (6×6, подсказки на краях: сколько зданий видно) и «Неравенства» (знаки между клетками, цепочки сравнений). У каждого своя лестница на 8 ступеней',
      'Судоку: решатель выучил цепочки неравенств и нижнюю границу небоскрёбов — сложность обоих режимов посчитана честно, по замеру',
    ],
    en: [
      'Sudoku: two new modes in the hub — Towers (6×6, edge clues: how many buildings you can see) and Futoshiki (signs between cells, chains of comparisons). Each has its own 8-step ladder',
      'Sudoku: the solver learned inequality chains and the towers lower bound — both modes are graded honestly, by measurement',
    ],
  },
  {
    version: '1.243.1',
    date: '2026-08-27',
    ru: [
      'Судоку: сложность больше не проседает на стыках вариантов — обещание уровня не бывает ниже предыдущего',
      'Судоку: джигсо стал вершиной лестницы (54–57), термо-клетки — перед ним; описания правил обновлены на всех языках',
    ],
    en: [
      'Sudoku: difficulty no longer dips at variant seams — a level never promises less than the one before',
      'Sudoku: jigsaw is now the summit (54–57) with thermo-cages before it; rule descriptions updated in every language',
    ],
  },
  {
    version: '1.243.0',
    date: '2026-08-27',
    ru: [
      'Сортировка товаров: с 16-го уровня приходит скрытая информация — под верхними товарами «?», планировать приходится вслепую и пересматривать план по ходу',
      'Судоку: термо-варианты получили честные полосы сложности (недостижимые ступени убраны замером), джигсо и термо-клетки чаще попадают в свою полосу',
      'Оценка: починены пять метрик (переключение, шар, узор, цифровой ряд, символы) и все игры батареи стартуют в фиксированной конфигурации — сравнение с нормами снова осмысленно',
    ],
    en: [
      'Goods sorting: from level 16 hidden information arrives — “?” under top items, so you plan blind and revise as you reveal',
      'Sudoku: thermo variants got honest difficulty bands (unreachable tiers removed by measurement), jigsaw and thermo-cages hit their band more often',
      'Assessment: five metrics fixed (switching, balloon, pattern, digit span, symbols) and every battery game starts in a fixed configuration — norm comparison is meaningful again',
    ],
  },
  {
    version: '1.242.5',
    date: '2026-08-27',
    ru: [
      'Зарядка: рамка времени и стрелки сжатия перекрашены в зелёный — фиолетовые сливались с картинкой тела',
      'Зарядка: окончание практики — стандартный экран результата, как у остальных игр (время, минуты, наборы, «Ещё раз» и «Домой»)',
    ],
    en: [
      'Warm-up: the timing frame and squeeze arrows are now green — purple blended into the body artwork',
      'Warm-up: the session ending is the standard result screen like every other game (time, minutes, sets, Retry and Home)',
    ],
  },
  {
    version: '1.242.4',
    date: '2026-08-27',
    ru: [
      'Служебный выпуск: доставка предыдущих двух версий срезалась проверкой качества на нашей стороне; в самом приложении ничего не менялось',
    ],
    en: [
      'Service release: delivery of the previous two versions was cut by a quality check on our side; nothing changed in the app itself',
    ],
  },
  {
    version: '1.242.3',
    date: '2026-08-27',
    ru: [
      'Зарядка теперь в общем дизайне приложения: те же цвета, карточки и шрифт в светлой и тёмной теме',
      'Светлая тема приложения раньше не доходила до зарядки — экран оставался тёмным; исправлено',
    ],
    en: [
      'The warm-up now follows the app-wide design: same colors, cards and font in light and dark themes',
      'The app light theme previously never reached the warm-up — the screen stayed dark; fixed',
    ],
  },
  {
    version: '1.242.2',
    date: '2026-08-27',
    ru: [
      'Экран зарядки открывается без ошибки при загрузке (гидрация)',
      'Кнопки «Пауза», «Выйти» и «Закрыть» во время практики стали крупнее — 48 пикселей, порог касания',
    ],
    en: [
      'The warm-up screen opens without a load-time error (hydration)',
      'The Pause, Exit and Close buttons during practice are larger now — 48 px, the tap-target threshold',
    ],
  },
  {
    version: '1.242.1',
    date: '2026-08-27',
    ru: [
      'Завершённая зарядка теперь записывается: до этого пройденная до конца сессия уходила в историю как выход без записи',
      'Возврат из фона снова запускает практику — раньше она оставалась на паузе навсегда',
      'После завершения показывается итог и «Ещё раз», а не старый экран выбора',
    ],
    en: [
      'A finished warm-up is now recorded: until now a fully completed session went into history as an exit without recording',
      'Returning from the background resumes the practice again — it used to stay paused forever',
      'After finishing you get the result and “Again”, not the old picker screen',
    ],
  },
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
      'Появилась настоящая фоновая музыка — шесть спокойных инструментальных треков по две минуты: под дыхание, под утро, под вечер, под счёт. Раньше «музыка» была четырьмя аккордами, синтезированными на лету, и в отзывах это честно назвали «3 ноты»',
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
      'Судоку: цифра рядом с кружком или заливкой больше не выглядит выцветшей — она рисуется чёрным поверх любой подложки (по многократным просьбам игроков)',
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
      'Блок «Починили по твоим отзывам» теперь начинается с благодарности, а не заканчивается ею — раньше её было не видно',
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
