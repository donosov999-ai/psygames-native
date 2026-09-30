/// РАЗБОР ПО ШАГАМ ДЛЯ КЛАССИЧЕСКИХ АНАГРАММ — ПЕРЕНОС `anagrams-teach.ts`.
///
/// Запрос Дениса 17.09.2026: «нужно обучение для каждой игры… чтобы решатель по
/// шагам рисовал решение и писал объяснение шагов по правилам: почему тут ставим,
/// то есть учил логике игры; это сильнее, чем справка».
///
/// 🔴 ПРИЁМЫ ИЗМЕРЕНЫ ПО СЛОВАРЮ САМОЙ ИГРЫ, А НЕ ВЗЯТЫ ИЗ ГОЛОВЫ. «Редкая буква»,
/// «частое начало», «частое окончание» — счёт по тому самому банку, из которого игра
/// и раздаёт слова (`WordBank.classicBank`). Поэтому разбор верен на всех десяти
/// языках, включая те, где я не знаю ни слова: числа считает банк.
///
/// 🔴 ПОРЯДОК ШАГОВ СОВПАДАЕТ С ТЕМ, КАК ЧЕЛОВЕК ВВОДИТ. Буквы ставятся СЛЕВА
/// НАПРАВО, потому что игрок именно так их и нажимает. Совет «начни с окончания» был
/// бы красивее на бумаге и неисполним пальцем. Зато первый шаг — ОСМОТР: он ничего
/// не ставит, а показывает, вокруг какой буквы искать. Это и есть приём.
///
/// ⚠️ Перенос сверяется с эталоном, снятым прогоном живого TS
/// (`test/fixtures/anagrams-teach-reference.json`, 400 случаев: 10 языков × длины
/// 4…8 × по два разных колеса на слово). Порядок колеса меняет ИНДЕКСЫ шагов,
/// поэтому одно слово в эталоне лежит дважды.
library;

/// Приём, которым объясняется шаг.
enum TeachTechnique {
  /// Осмотр: ничего не ставим, ищем опору — самую редкую букву.
  look,

  /// Начало слова.
  start,

  /// Середина, парами.
  middle,

  /// Окончание.
  end,
}

/// Один шаг разбора слова.
class TeachStep {
  const TeachStep({
    required this.technique,
    required this.place,
    required this.built,
    required this.piece,
    required this.words,
    required this.of,
  });

  /// Приём шага.
  final TeachTechnique technique;

  /// Индексы букв КОЛЕСА, которые ставим на этом шаге, по порядку ввода.
  final List<int> place;

  /// Что собрано ПОСЛЕ шага — для клеток ответа.
  final String built;

  /// Кусок, о котором идёт речь: буква у осмотра, слог у остальных.
  final String piece;

  /// Сколько слов банка несут этот кусок — число для объяснения.
  final int words;

  /// Размер банка, с которым сравниваем. Без него «12» ни о чём не говорит.
  final int of;
}

/// ВЕРХНИЙ РЕГИСТР ПО ПРАВИЛАМ JS, А НЕ DART. Единственное расхождение, найденное
/// замером, — `ß`.
///
/// 🔴 ЗАМЕР 30.09.2026, из-за которого эта функция существует. Перенос считал у
/// немецкого «REISE» 294 слова с буквой S, а живой TS — 297. Причина не в данных:
/// банк тот же, 1094 слова. `'ß'.toUpperCase()` в JS даёт `'SS'`, то есть слово с `ß`
/// считается словом с `S`; Dart поднимает регистр ПРОСТЫМ отображением, один знак в
/// один, и `ß` оставляет как есть — три слова из счёта выпали.
///
/// ⚠️ Проверено по всем десяти банкам: из 238 разных знаков полное отображение нужно
/// ровно одному — `ß` (он есть в 53 словах). Поэтому здесь одна замена, а не своя
/// таблица Юникода: таблица была бы шире замера и врала бы уверенностью.
String upJs(String s) => s.replaceAll('\u00df', 'SS').toUpperCase();

List<String> _letters(String s) => s.runes.map(String.fromCharCode).toList();

/// Сколько слов банка содержат эту букву.
int _withLetter(List<String> bank, String letter) {
  var n = 0;
  for (final w in bank) {
    if (w.contains(letter)) n += 1;
  }
  return n;
}

int _withStart(List<String> bank, String piece) =>
    bank.fold(0, (n, w) => w.startsWith(piece) ? n + 1 : n);

int _withEnd(List<String> bank, String piece) =>
    bank.fold(0, (n, w) => w.endsWith(piece) ? n + 1 : n);

/// Индексы букв колеса, собирающие кусок.
///
/// ⚠️ Каждая буква берётся ОДИН раз: у слова «колокол» три «о», и разбор обязан
/// указать три РАЗНЫЕ плитки, иначе подсветка покажет одну и ту же, а нажать её
/// дважды нельзя.
List<int> _indexesFor(List<String> wheel, String piece, Set<int> taken) {
  final out = <int>[];
  for (final ch in _letters(piece)) {
    var found = -1;
    for (var k = 0; k < wheel.length; k++) {
      if (!taken.contains(k) && upJs(wheel[k]) == upJs(ch)) {
        found = k;
        break;
      }
    }
    if (found < 0) return const []; // буквы нет — кусок не из этого колеса
    taken.add(found);
    out.add(found);
  }
  return out;
}

/// Разбор одного слова: осмотр, затем куски слева направо.
///
/// [bankOf] — банк классики ПО ДЛИНЕ (`WordBank.classicBank`), в любом регистре.
///
/// 🔴 ПЕРЕДАЁТСЯ ФУНКЦИЯ, А НЕ ГОТОВЫЙ СПИСОК, И ЭТО НЕ УКРАШЕНИЕ. Длину разбор
/// считает САМ — по слову в верхнем регистре, а она не всегда равна длине набора,
/// из которого слово пришло: немецкое «beißen» лежит среди шестибуквенных, а
/// поднятое в регистр «BEISSEN» — семибуквенное, и объяснять его надо счётом по
/// СЕМИБУКВЕННОМУ банку. Замер 30.09.2026: со списком, переданным по длине набора,
/// у этого слова выходило 150 слов вместо 193 — то есть разбор учил бы неверному
/// числу. Готовый список позволял звать себя не тем банком; функция — не позволяет.
///
/// ⚠️ Пустой список — честный ответ, а не поломка: слово не из этих букв, или банк
/// мал. Экран обязан это учитывать и не показывать кнопку разбора.
List<TeachStep> anagramLesson(
  String target,
  List<String> wheel,
  List<String> Function(int len) bankOf,
) {
  final word = upJs(target);
  final chars = _letters(word);
  final total = chars.length;
  if (total < 3 || wheel.length != total) return const [];

  final up = [for (final w in bankOf(total)) upJs(w)];
  if (up.length < 4) return const [];

  // 1. ОСМОТР: самая редкая буква слова по банку — вокруг неё и искать.
  final unique = <String>[];
  for (final ch in chars) {
    if (!unique.contains(ch)) unique.add(ch);
  }
  var rare = unique.first;
  var rarity = _withLetter(up, rare);
  for (final ch in unique.skip(1)) {
    final n = _withLetter(up, ch);
    if (n < rarity) {
      rare = ch;
      rarity = n;
    }
  }

  final steps = <TeachStep>[
    TeachStep(
      technique: TeachTechnique.look,
      place: const [],
      built: '',
      piece: rare,
      words: rarity,
      of: up.length,
    ),
  ];

  /*
   * 2. КУСКИ. Начало и окончание — по три буквы, если слово длинное, иначе по две:
   * на четырёхбуквенном слове «начало из трёх» съело бы почти всё слово и ничему
   * не научило. Середина идёт парами — столько, сколько человек удерживает разом.
   */
  final edge = total >= 7 ? 3 : 2;
  final taken = <int>{};
  var built = '';
  var broken = false;

  bool add(TeachTechnique technique, String piece, int words) {
    final place = _indexesFor(wheel, piece, taken);
    if (place.isEmpty) return false;
    built += piece;
    steps.add(TeachStep(
      technique: technique,
      place: place,
      built: built,
      piece: piece,
      words: words,
      of: up.length,
    ));
    return true;
  }

  final start = chars.take(edge).join();
  if (!add(TeachTechnique.start, start, _withStart(up, start))) broken = true;

  if (!broken) {
    final end = chars.skip(total - edge).join();
    final middle = chars.sublist(edge, total - edge);
    for (var i = 0; i < middle.length && !broken; i += 2) {
      final piece = middle.sublist(i, i + 2 > middle.length ? middle.length : i + 2).join();
      if (!add(TeachTechnique.middle, piece, 0)) broken = true;
    }
    if (!broken && !add(TeachTechnique.end, end, _withEnd(up, end))) broken = true;
  }

  return broken ? const [] : steps;
}

/// Ключи объяснений — СПИСКОМ, и это не дубль `teachStepKey`.
///
/// 🔴 ЗАЧЕМ. Сборщик словаря (`tools/embed-l10n.mjs`) ищет в исходниках `L.t('литерал')`.
/// Разбор зовёт ключ ПЕРЕМЕННОЙ (`L.t(teachStepKey(...))`), литералов в вызове нет — и
/// первый прогон сборщика оставил четыре объяснения без строк: словарь собрался без них,
/// а человек увидел бы на экране `teachAnagramLook` вместо текста. Ровно та же беда, что
/// у карточек развилок, и решается так же — явным объявлением ключей.
///
/// ⚠️ Список не может отстать от `teachStepKey`: это сторожит проба
/// `anagrams_teach_test.dart` («ключ каждого приёма объявлен и доехал в сборку»).
const teachAnagramKeys = <String>[
  'teachAnagramLook',
  'teachAnagramStart',
  'teachAnagramMiddle',
  'teachAnagramEnd',
];

/// Ключ словаря для приёма. Ключ, а не готовая строка: экран говорит на двенадцати
/// языках, и разбор обязан говорить на том же.
String teachStepKey(TeachTechnique t) => switch (t) {
      TeachTechnique.look => 'teachAnagramLook',
      TeachTechnique.start => 'teachAnagramStart',
      TeachTechnique.middle => 'teachAnagramMiddle',
      TeachTechnique.end => 'teachAnagramEnd',
    };

/// Объяснение шага словами игрока. Перенос `текстШагаАнаграмм`.
///
/// ⚠️ Числа подставляются ВСЕГДА, даже когда они скромные: «встречается в 611 словах
/// из 888» — тоже ответ, и он честнее умолчания. Скрывать неудобное число значило бы
/// учить не логике игры, а вере в подсказку.
String teachStepText(TeachStep step, String Function(String) t) => t(teachStepKey(step.technique))
    .replaceAll('{piece}', step.piece)
    .replaceAll('{n}', '${step.words}')
    .replaceAll('{total}', '${step.of}');
