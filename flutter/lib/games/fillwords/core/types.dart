/// ТИПЫ ФИЛВОРДОВ — перенос `frontend/src/games/fillwords/core/types.ts`.
///
/// Одна мысль на весь модуль: РАСКЛАДКА — ЭТО РАЗБИЕНИЕ ПОЛЯ. В обычном «поиске слов»
/// слова прячут в буквенный шум; в филвордах мусора нет вовсе: каждая клетка принадлежит
/// ровно одному слову, и уровень закрыт, когда поле РАЗОБРАНО ЦЕЛИКОМ.
///
/// ⚠️ ИНВАРИАНТ: пути слов попарно не пересекаются и в объединении дают ВСЕ клетки поля.
/// Нарушь его — и игра нечестна сразу и молча: все слова найдены, а поле не пустеет.
/// Поэтому генератор строит раскладку ОТ РЕШЕНИЯ (режет гамильтонов путь на отрезки).
///
/// ИМЕНА. Как в TS, но латиницей: Dart не берёт не-ASCII в идентификаторах. Кириллические
/// имена веба: `диагонали` → [FillwordsPuzzle.diagonals], `ПорядокСдачи` → [SubmitOrder],
/// `порядок` → [FillwordsSession.order]. Значения порядка в эталоне живого TS
/// ('свободно' | 'поСписку' | 'обратный') экспортёр переводит в [SubmitOrder.code].
library;

/// Индекс клетки: `row * cols + col`.
typedef CellIndex = int;

/// Слово, уложенное в поле: буквы и клетки, по которым оно читается.
class PlantedWord {
  const PlantedWord({required this.word, required this.path});

  /// Слово заглавными — ровно так, как оно написано в клетках.
  final String word;

  /// Клетки слова по порядку букв; соседние в пути — соседи на поле.
  final List<CellIndex> path;
}

/// Готовое поле филвордов: всё, чтобы восстановить партию один в один.
class FillwordsPuzzle {
  const FillwordsPuzzle({
    required this.rows,
    required this.cols,
    required this.locale,
    required this.seed,
    required this.letters,
    required this.words,
    required this.diagonals,
  });

  final int rows;
  final int cols;

  /// Язык слов.
  final String locale;

  /// Зерно ГПСЧ: одно зерно → одно поле.
  final int seed;

  /// Буквы поля, по одной на клетку; длина `rows * cols`.
  final List<String> letters;

  /// Уложенные слова; их пути покрывают поле целиком и не пересекаются.
  final List<PlantedWord> words;

  /// 🔴 Разрешены ли диагонали — В САМОЙ РАСКЛАДКЕ, а не в настройках экрана: правило
  /// обязано быть одним у генератора и у пальца.
  final bool diagonals;
}

/// Почему жест отклонён — кодом, а не булевым «нет»: по коду видно, КАКАЯ проверка сработала.
enum FillwordsRejectReason {
  /// Меньше двух клеток — тап, а не протягивание.
  tooShort('too-short'),

  /// Палец вернулся на пройденную клетку.
  repeat('repeat'),

  /// Соседние в линии клетки не соседи на поле — прыжок.
  notAdjacent('not-adjacent'),

  /// Клетка уже разобрана найденным словом.
  taken('taken'),

  /// Линия ведёт не по слову.
  noMatch('no-match');

  const FillwordsRejectReason(this.code);

  /// Код веба — для сверки с эталоном живого TS.
  final String code;
}

/// Разбор жеста: попадание в слово или причина отказа.
class FillwordsTrace {
  const FillwordsTrace.hit(this.wordIndex) : reason = null;
  const FillwordsTrace.rejected(FillwordsRejectReason this.reason) : wordIndex = -1;

  /// Индекс слова в [FillwordsPuzzle.words]; -1 при отказе.
  final int wordIndex;
  final FillwordsRejectReason? reason;

  bool get ok => reason == null;
}

/// Порядок сдачи слов — шестая ось лестницы (строгость порядка).
///
/// ⚠️ Строгий порядок честен ТОЛЬКО при показанном списке слов: без списка человек не
/// знает, какое слово «следующее». Экран передаёт строгий порядок в партию только при
/// видимом списке — см. [FillwordsLevelCfg.order] и `orderForGame`.
enum SubmitOrder {
  /// Годится любое ненайденное слово.
  free('free'),

  /// Только следующее по списку.
  listed('listed'),

  /// Только последнее из ненайденных.
  reverse('reverse');

  const SubmitOrder(this.code);
  final String code;
}

/// Состояние партии. Чистые данные: действия возвращают НОВЫЙ объект.
class FillwordsSession {
  const FillwordsSession({
    required this.puzzle,
    required this.owner,
    required this.found,
    this.hints = 0,
    this.mistakes = 0,
    this.order = SubmitOrder.free,
  });

  final FillwordsPuzzle puzzle;

  /// Кто занял клетку: индекс слова или -1, если буква ещё на поле. «Поле разобрано»
  /// считается по ЭТОМУ массиву — по буквам, а не по числу найденных слов.
  final List<int> owner;

  /// Индексы найденных слов в порядке нахождения — по нему берётся цвет подсветки.
  final List<int> found;

  /// Сколько раз брали подсказку.
  final int hints;

  /// Сколько раз линия вела в никуда — «ложные тревоги» корректуры.
  final int mistakes;

  final SubmitOrder order;
}

/// Подсказка: какое слово подсвечиваем и с каких клеток оно начинается.
class FillwordsHint {
  const FillwordsHint({required this.wordIndex, required this.cells});
  final int wordIndex;
  final List<CellIndex> cells;
}

/// Настройка уровня — `fillwordsLevel(level)`.
class FillwordsLevelCfg {
  const FillwordsLevelCfg({
    required this.rows,
    required this.cols,
    required this.maxWordLen,
    required this.minWordLen,
    required this.timeLimitSec,
    required this.hints,
    required this.order,
  });

  final int rows;
  final int cols;

  /// Потолок длины слова.
  final int maxWordLen;

  /// Пол длины слова — третья ось лестницы.
  final int minWordLen;

  /// Лимит времени на уровень, секунды.
  final int timeLimitSec;

  /// Подсказок на уровень — пятая ось (цена ошибки).
  final int hints;

  /// Порядок сдачи — ПРЕДЛОЖЕНИЕ уровня, не приказ (см. [SubmitOrder]).
  final SubmitOrder order;
}

/// Запрос к генератору.
class FillwordsRequest {
  const FillwordsRequest({
    required this.rows,
    required this.cols,
    required this.locale,
    required this.seed,
    this.maxWordLen,
    this.minWordLen,
    this.diagonals = true,
  });

  final int rows;
  final int cols;
  final String locale;
  final int seed;

  /// Потолок длины слова; по умолчанию — общий потолок словаря.
  final int? maxWordLen;

  /// Пол длины слова; по умолчанию — пол языка.
  final int? minWordLen;

  /// Разрешить диагонали. По умолчанию да — так режим и работал.
  final bool diagonals;
}

/// Словарь языка для генератора.
///
/// ⚠️ ОТЛИЧИЕ ОТ ВЕБА: в TS словарь собирается синхронно из вшитых JSON
/// (`wordPool(locale)`), во Flutter слова — ассеты, и читаются они асинхронно. Поэтому
/// словарь грузится заранее (`loadWordPool`) и передаётся генератору аргументом.
class FillwordsPool {
  const FillwordsPool({required this.locale, required this.all, required this.byLength});

  final String locale;

  /// Все годные слова ЗАГЛАВНЫМИ, по возрастанию длины и алфавиту.
  final List<String> all;

  /// Слова по длине; ключ — число букв.
  final Map<int, List<String>> byLength;
}

/// Генератор случайных чисел ядра — mulberry32, как в `rng.ts`.
abstract class FillwordsRng {
  /// Дробное в [0, 1).
  double next();
}
