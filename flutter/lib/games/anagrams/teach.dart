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

import 'crossword.dart';
import 'ring.dart';

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

/* ═══════════ «ВСЕ СЛОВА»: СЕМЬИ ПО НАЧАЛУ ═══════════
 *
 * 🔴 ПРИЁМ ВЫБРАН ЗАМЕРОМ ЦЕЛЕЙ, А НЕ БАЗЫ. Первая мысль была «сначала слово из
 * ВСЕХ букв колеса» — оно есть в 100 % наборов. Но база набора в этом режиме НЕ
 * цель: `submitWord` её отклоняет явно. Разбор учил бы сдавать то, что игра не
 * засчитает. Замер 30.09.2026 по самим целям (`pack.words`, ru 2576 наборов,
 * en 2215, de 2295):
 *   · самое длинное из целей единственное лишь в 41–48 % наборов — «начни с
 *     самого длинного» в половине случаев ничего не выбирает;
 *   · у 56–64 % целей первые две буквы совпадают хотя бы с одной другой целью.
 * Отсюда приём: нашёл слово — попробуй то же начало с другим хвостом. Больше
 * половины целей находится семьями, и это навык, который переносится на любое
 * колесо, а не ответ на одно.
 *
 * 🔴 ТОТ ЖЕ ПРИЁМ С ЯКОРЕМ НА КОНЦЕ — КОГДА ОБЩИХ НАЧАЛ НЕТ ВОВСЕ (07.10.2026).
 * 30.09 разбор без семей честно пропускался: по всем наборам таких 0–3 %. Но
 * разбор предлагается только на ступенях 1–3, а мерил я по всем наборам. Когда у
 * анаграмм появился язык слов, перепись разборов покраснела: у английского ПЕРВОЙ
 * ступени семей по началу нет (abuse, aces, base, cause, cease, cubes, sauce,
 * scuba). То же на L1 у de, es, it. Всего 6 ступеней из 30 (10 языков × L1–3).
 * Зато у этих слов общие ОКОНЧАНИЯ: -se ×4, у немецкого -ch ×3.
 * Это не выдумка ради охвата, а та же «семья» с другим якорем: закрепи конец и
 * перебирай начало. Замер по тем же наборам — ступеней 1–3 без разбора стало
 * 1 из 30 (остался es L3); на L1–60: en 1 → 0, de 5 → 0, ru 10 → 4.
 * Окончание берётся ТОЛЬКО при пустых семьях по началу: начало осталось главным
 * приёмом, у него и замер шире.
 *
 * ⚠️ Регистр здесь не поднимается вовсе: цели и буквы колеса лежат в данных в
 * одном регистре, а `upJs` менял бы длину немецких слов с `ß`.
 */

/// Приём шага в режиме «Все слова».
enum AllWordsTechnique {
  /// Осмотр: сколько слов и какая семья самая большая.
  look,

  /// Слово из семьи: начало то же, хвост другой.
  family,

  /// Одиночка: родни по началу нет.
  single,

  /// Осмотр, когда общих начал нет, а общие ОКОНЧАНИЯ есть.
  lookEnd,

  /// Слово из семьи по окончанию: конец тот же, начало другое.
  familyEnd,

  /// Одиночка разбора по окончаниям: родни нет ни по началу, ни по концу.
  singleEnd,
}

/// Шаг разбора «Все слова».
class AllWordsTeachStep {
  const AllWordsTeachStep({
    required this.technique,
    required this.word,
    required this.prefix,
    required this.place,
    required this.n,
    required this.total,
  });

  final AllWordsTechnique technique;

  /// Слово шага (у осмотра пусто).
  final String word;

  /// Кусок семьи — две первые буквы, а у приёмов «по концу» — две последние
  /// (у одиночки — его собственные).
  final String prefix;

  /// Индексы плиток колеса, по порядку ввода.
  final List<int> place;

  /// Число для объяснения: у осмотра — сколько целей в семьях, у семьи — её размер.
  final int n;

  /// Всего целей на колесе.
  final int total;
}

/// Длина начала, по которому слова собираются в семьи.
const allWordsPrefixLength = 2;

String _prefixOf(String w) => w.runes.take(allWordsPrefixLength).map(String.fromCharCode).join();

String _suffixOf(String w) {
  final r = w.runes.toList();
  return String.fromCharCodes(r.length <= allWordsPrefixLength ? r : r.sublist(r.length - allWordsPrefixLength));
}

/// Индексы плиток, собирающих слово. Каждая плитка — один раз НА СЛОВО: слова
/// набираются по отдельности, и одна плитка служит многим словам.
List<int> _tilesFor(String word, List<String> letters) {
  final taken = <int>{};
  final out = <int>[];
  for (final ch in word.runes.map(String.fromCharCode)) {
    var found = -1;
    for (var k = 0; k < letters.length; k++) {
      if (!taken.contains(k) && letters[k] == ch) {
        found = k;
        break;
      }
    }
    if (found < 0) return const [];
    taken.add(found);
    out.add(found);
  }
  return out;
}

/// Разбор колеса «Все слова»: осмотр, семьи от большой к малой, одиночки в конце.
/// Семьи — по началу; общих начал нет вовсе — по окончанию (см. шапку раздела).
///
/// Порядок полностью детерминирован (размер семьи, затем кусок по алфавиту;
/// внутри — от коротких к длинным, затем по алфавиту): один и тот же набор всегда
/// разбирается одинаково, и проба может сверить его число в число.
List<AllWordsTeachStep> allWordsLesson(List<String> targets, List<String> letters) {
  if (targets.length < 2) return const [];
  int byWord(String a, String b) {
    final l = a.runes.length.compareTo(b.runes.length);
    return l != 0 ? l : a.compareTo(b);
  }

  (List<MapEntry<String, List<String>>>, List<String>) familiesBy(String Function(String) pieceOf) {
    final families = <String, List<String>>{};
    for (final w in targets) {
      families.putIfAbsent(pieceOf(w), () => []).add(w);
    }
    final big = families.entries.where((e) => e.value.length > 1).toList()
      ..sort((a, b) {
        final s = b.value.length.compareTo(a.value.length);
        return s != 0 ? s : a.key.compareTo(b.key);
      });
    final singles = [
      for (final e in families.entries)
        if (e.value.length == 1) e.value.single,
    ]..sort(byWord);
    return (big, singles);
  }

  final byStart = familiesBy(_prefixOf);
  final atEnd = byStart.$1.isEmpty;
  final (big, singles) = atEnd ? familiesBy(_suffixOf) : byStart;
  final pieceOf = atEnd ? _suffixOf : _prefixOf;

  // Семей нет ни по началу, ни по концу — приём не к чему приложить, и разбор честно
  // отсутствует (кнопки не будет). Замер 07.10.2026: на ступенях 1–3 так 1 случай
  // из 30 (es L3). Выдумывать третий приём ради охвата значило бы учить наугад.
  if (big.isEmpty) return const [];

  final inFamilies = big.fold<int>(0, (n, e) => n + e.value.length);
  final steps = <AllWordsTeachStep>[
    AllWordsTeachStep(
      technique: atEnd ? AllWordsTechnique.lookEnd : AllWordsTechnique.look,
      word: '',
      prefix: big.first.key,
      place: const [],
      n: inFamilies,
      total: targets.length,
    ),
  ];
  for (final e in big) {
    for (final w in [...e.value]..sort(byWord)) {
      final place = _tilesFor(w, letters);
      if (place.isEmpty) return const []; // слово не из этого колеса — разбор врал бы
      steps.add(AllWordsTeachStep(
        technique: atEnd ? AllWordsTechnique.familyEnd : AllWordsTechnique.family,
        word: w,
        prefix: e.key,
        place: place,
        n: e.value.length,
        total: targets.length,
      ));
    }
  }
  for (final w in singles) {
    final place = _tilesFor(w, letters);
    if (place.isEmpty) return const [];
    steps.add(AllWordsTeachStep(
      technique: atEnd ? AllWordsTechnique.singleEnd : AllWordsTechnique.single,
      word: w,
      prefix: pieceOf(w),
      place: place,
      n: 1,
      total: targets.length,
    ));
  }
  return steps;
}

/// Ключи объяснений «Все слова» — списком, чтобы сборщик словаря их увидел.
const teachAllWordsKeys = <String>[
  'teachAllWordsLook',
  'teachAllWordsFamily',
  'teachAllWordsSingle',
  'teachAllWordsLookEnd',
  'teachAllWordsFamilyEnd',
  'teachAllWordsSingleEnd',
];

String teachAllWordsKey(AllWordsTechnique t) => switch (t) {
      AllWordsTechnique.look => 'teachAllWordsLook',
      AllWordsTechnique.family => 'teachAllWordsFamily',
      AllWordsTechnique.single => 'teachAllWordsSingle',
      AllWordsTechnique.lookEnd => 'teachAllWordsLookEnd',
      AllWordsTechnique.familyEnd => 'teachAllWordsFamilyEnd',
      AllWordsTechnique.singleEnd => 'teachAllWordsSingleEnd',
    };

/// Объяснение шага. Подстановки: {piece} — кусок семьи (начало или конец), {word} —
/// слово, {n}, {total}.
String teachAllWordsText(AllWordsTeachStep s, String Function(String) t) =>
    t(teachAllWordsKey(s.technique))
        .replaceAll('{piece}', s.prefix.toUpperCase())
        .replaceAll('{word}', s.word.toUpperCase())
        .replaceAll('{n}', '${s.n}')
        .replaceAll('{total}', '${s.total}');

/* ═══════════ «СЛОВО-КВАДРАТ»: РЕДКОЕ НАЧАЛО, ПОТОМ УГЛЫ ═══════════
 *
 * 🔴 ПРИЁМ ВЫБРАН ЗАМЕРОМ ПО ВСЕМ КОЛЬЦАМ (30.09.2026, по 1000 колец ru/en/de).
 * Пятибуквенных слов словаря, складывающихся из банка кольца, — медиана 10–14,
 * а сторон четыре. Два сужения, и оба человек может повторить сам:
 *   · РЕДКАЯ ПЕРВАЯ БУКВА. Из этих 10–14 слов на самую редкую начальную букву
 *     истинного слова начинается медиана 1–2 — выбор почти однозначный;
 *   · УГЛЫ. Каждое поставленное слово даёт две угловые буквы соседям. Под шаблон
 *     с известными углами подходит медиана 2–4 слова, ровно одно — в 8–26 %.
 * То есть учим не «вот ответ», а порядок, в котором квадрат решается почти без
 * перебора.
 *
 * ⚠️ Кандидаты считаются по УНИКАЛЬНЫМ словам словаря колец языка: в наборе одно
 * слово стоит во многих кольцах, и повтор раздул бы число «вариантов», которых у
 * человека нет.
 */

/// Приём шага «Слово-квадрат».
enum RingTechnique {
  /// Осмотр: сколько слов складывается из банка и почему углы — ключ.
  look,

  /// Первое слово — на самую редкую начальную букву.
  first,

  /// Следующее — по известным углам.
  corner,
}

/// Шаг разбора квадрата.
class RingTeachStep {
  const RingTeachStep({
    required this.technique,
    required this.side,
    required this.word,
    required this.piece,
    required this.n,
    required this.total,
  });

  final RingTechnique technique;

  /// Сторона: 't', 'r', 'b', 'l' (у осмотра пусто).
  final String side;

  /// Слово стороны (у осмотра пусто).
  final String word;

  /// Опора шага: начальная буква у первого, шаблон углов («Р···А») у угловых.
  final String piece;

  /// Сколько слов банка подходит под опору.
  final int n;

  /// Сколько всего пятибуквенных слов складывается из банка.
  final int total;
}

/// Углы, которые сторона делит с соседями: [первая буква, последняя буква].
const _ringCorners = <String, List<String>>{
  't': ['TL', 'TR'],
  'r': ['TR', 'BR'],
  'b': ['BL', 'BR'],
  'l': ['TL', 'BL'],
};

String _ringWordOf(Ring r, String side) => switch (side) {
      't' => r.top,
      'r' => r.right,
      'b' => r.bottom,
      _ => r.left,
    };

/// Разбор кольца: осмотр, первое слово на редкую букву, остальные по углам.
///
/// [dictionary] — слова колец языка (`RingPacks.dictionary`), в нём бывают повторы.
List<RingTeachStep> ringLesson(Ring ring, List<String> dictionary) {
  final bank = ring.bank;
  final candidates = ({...dictionary}.where((w) => w.length == ringSide && madeOfBank(w, bank)).toList())
    ..sort();
  // Все четыре истинных слова обязаны быть среди кандидатов — иначе счёт врёт.
  for (final w in ring.words) {
    if (!candidates.contains(w)) return const [];
  }
  const order = ['t', 'r', 'b', 'l'];
  final total = candidates.length;
  final steps = <RingTeachStep>[
    RingTeachStep(technique: RingTechnique.look, side: '', word: '', piece: '', n: total, total: total),
  ];

  int startCount(String letter) => candidates.where((w) => w[0] == letter).length;
  var first = order.first;
  var firstN = startCount(_ringWordOf(ring, first)[0]);
  for (final s in order.skip(1)) {
    final n = startCount(_ringWordOf(ring, s)[0]);
    if (n < firstN) {
      first = s;
      firstN = n;
    }
  }
  final corners = <String, String>{};
  void place(String side) {
    final w = _ringWordOf(ring, side);
    corners[_ringCorners[side]![0]] = w[0];
    corners[_ringCorners[side]![1]] = w[ringSide - 1];
  }

  final firstWord = _ringWordOf(ring, first);
  steps.add(RingTeachStep(
    technique: RingTechnique.first,
    side: first,
    word: firstWord,
    piece: firstWord[0],
    n: firstN,
    total: total,
  ));
  place(first);
  final placed = {first};

  while (placed.length < order.length) {
    String? best;
    var bestN = 1 << 30;
    for (final s in order) {
      if (placed.contains(s)) continue;
      final a = corners[_ringCorners[s]![0]];
      final b = corners[_ringCorners[s]![1]];
      final n = candidates
          .where((w) => (a == null || w[0] == a) && (b == null || w[ringSide - 1] == b))
          .length;
      if (n < bestN) {
        best = s;
        bestN = n;
      }
    }
    final s = best!;
    final a = corners[_ringCorners[s]![0]];
    final b = corners[_ringCorners[s]![1]];
    steps.add(RingTeachStep(
      technique: RingTechnique.corner,
      side: s,
      word: _ringWordOf(ring, s),
      piece: '${a ?? '·'}···${b ?? '·'}',
      n: bestN,
      total: total,
    ));
    place(s);
    placed.add(s);
  }
  return steps;
}

/// Ключи объяснений квадрата — списком, чтобы сборщик словаря их увидел.
const teachRingKeys = <String>[
  'teachRingLook',
  'teachRingFirst',
  'teachRingCorner',
];

String teachRingKey(RingTechnique t) => switch (t) {
      RingTechnique.look => 'teachRingLook',
      RingTechnique.first => 'teachRingFirst',
      RingTechnique.corner => 'teachRingCorner',
    };

/// Объяснение шага. Подстановки: {piece}, {word}, {n}, {total}.
String teachRingText(RingTeachStep s, String Function(String) t) => t(teachRingKey(s.technique))
    .replaceAll('{piece}', s.piece.toUpperCase())
    .replaceAll('{word}', s.word.toUpperCase())
    .replaceAll('{n}', '${s.n}')
    .replaceAll('{total}', '${s.total}');

/* ═══════════ КРОССВОРД: САМОЕ ПЕРЕКРЁСТНОЕ, ПОТОМ САМОЕ ОТКРЫТОЕ ═══════════
 *
 * Кроссворд решается не словами, а ПЕРЕСЕЧЕНИЯМИ: найденное слово открывает буквы
 * соседей, и следующее слово угадывается по шаблону. Порядок разбора:
 *   · первым — слово с наибольшим числом пересечений: оно открывает больше всего;
 *   · дальше — слово, в котором уже открыто больше всего букв (меньше всего
 *     вариантов); при равенстве — с большим числом пересечений, затем по порядку
 *     сетки. Замер доли уровней, где выбор однозначен, — в пробе.
 *
 * ⚠️ Слова сетки подняты в регистр ДАРТОВЫМ `toUpperCase` (`crossWordsOfLevel`),
 * буквы колеса — строчные из набора. Плитки ищутся тем же дартовым подъёмом, а не
 * `upJs`: сравнение идёт внутри одной половины, и `ß` в ней одинаков с обеих сторон.
 */

/// Приём шага кроссворда.
enum CrossTechnique {
  /// Осмотр: сколько слов и почему важен порядок.
  look,

  /// Первое слово — самое перекрёстное.
  first,

  /// Следующее — где открыто больше всего букв.
  next,
}

/// Шаг разбора кроссворда.
class CrossTeachStep {
  const CrossTeachStep({
    required this.technique,
    required this.word,
    required this.piece,
    required this.n,
    required this.total,
    required this.place,
  });

  final CrossTechnique technique;

  /// Слово шага, в регистре сетки (у осмотра пусто).
  final String word;

  /// Шаблон открытых букв («С·А··Я»), у первого слова — пусто.
  final String piece;

  /// У осмотра — слов в сетке; у первого — пересечений; у следующих — открыто букв.
  final int n;

  /// У осмотра — слов в сетке; у остальных — длина слова.
  final int total;

  /// Плитки колеса, складывающие слово, по порядку ввода.
  final List<int> place;
}

List<int> _crossCells(Crossword cw, PlacedWord w) {
  final dr = w.d == crossHoriz ? 0 : 1;
  final dc = w.d == crossHoriz ? 1 : 0;
  return [
    for (var i = 0; i < w.word.length; i++) (w.r + dr * i) * cw.cols + (w.c + dc * i),
  ];
}

List<int> _crossTiles(String word, List<String> letters) {
  final taken = <int>{};
  final out = <int>[];
  for (final ch in word.split('')) {
    var found = -1;
    for (var k = 0; k < letters.length; k++) {
      if (!taken.contains(k) && letters[k].toUpperCase() == ch) {
        found = k;
        break;
      }
    }
    if (found < 0) return const [];
    taken.add(found);
    out.add(found);
  }
  return out;
}

/// Разбор кроссворда: осмотр, самое перекрёстное слово, дальше — самое открытое.
List<CrossTeachStep> crosswordLesson(Crossword cw, List<String> letters) {
  if (cw.words.length < 2 || cw.outside.isNotEmpty) return const [];
  final cells = {for (final w in cw.words) w: _crossCells(cw, w)};
  final uses = <int, int>{};
  for (final list in cells.values) {
    for (final k in list) {
      uses[k] = (uses[k] ?? 0) + 1;
    }
  }
  int crossings(PlacedWord w) => cells[w]!.where((k) => uses[k]! > 1).length;

  final steps = <CrossTeachStep>[
    CrossTeachStep(
      technique: CrossTechnique.look,
      word: '',
      piece: '',
      n: cw.words.length,
      total: cw.words.length,
      place: const [],
    ),
  ];
  final open = <int>{};
  final done = <PlacedWord>{};

  bool add(PlacedWord w, CrossTechnique technique) {
    final place = _crossTiles(w.word, letters);
    if (place.isEmpty) return false; // слово не из этого колеса — разбор врал бы
    final c = cells[w]!;
    final opened = c.where(open.contains).length;
    final pattern = [
      for (var i = 0; i < c.length; i++) open.contains(c[i]) ? w.word[i] : '·',
    ].join();
    steps.add(CrossTeachStep(
      technique: technique,
      word: w.word,
      piece: technique == CrossTechnique.first ? '' : pattern,
      n: technique == CrossTechnique.first ? crossings(w) : opened,
      total: w.word.length,
      place: place,
    ));
    open.addAll(c);
    done.add(w);
    return true;
  }

  var first = cw.words.first;
  for (final w in cw.words.skip(1)) {
    if (crossings(w) > crossings(first)) first = w;
  }
  if (!add(first, CrossTechnique.first)) return const [];

  while (done.length < cw.words.length) {
    PlacedWord? best;
    var bestOpen = -1;
    var bestCross = -1;
    for (final w in cw.words) {
      if (done.contains(w)) continue;
      final o = cells[w]!.where(open.contains).length;
      final x = crossings(w);
      if (o > bestOpen || (o == bestOpen && x > bestCross)) {
        best = w;
        bestOpen = o;
        bestCross = x;
      }
    }
    if (!add(best!, CrossTechnique.next)) return const [];
  }
  return steps;
}

/// Ключи объяснений кроссворда — списком, чтобы сборщик словаря их увидел.
const teachCrossKeys = <String>[
  'teachCrossLook',
  'teachCrossFirst',
  'teachCrossNext',
];

String teachCrossKey(CrossTechnique t) => switch (t) {
      CrossTechnique.look => 'teachCrossLook',
      CrossTechnique.first => 'teachCrossFirst',
      CrossTechnique.next => 'teachCrossNext',
    };

/// Объяснение шага. Подстановки: {word}, {piece}, {n}, {total}.
String teachCrossText(CrossTeachStep s, String Function(String) t) => t(teachCrossKey(s.technique))
    .replaceAll('{word}', s.word)
    .replaceAll('{piece}', s.piece)
    .replaceAll('{n}', '${s.n}')
    .replaceAll('{total}', '${s.total}');
