/// РЕЖИМ БИЛИНГВО — перенос `frontend/src/services/bilingualMode.ts` и узора из
/// `frontend/src/services/languageFlow.ts`.
///
/// Два иностранных языка вперемешку В ОДНОЙ ПАРТИИ; родной остаётся опорой.
/// Файл общий для раздела «Языки»: им пользуются словарь, cloze, сортировка слов,
/// «Слово или нет?» и анаграммы — поэтому он лежит у раздела, а не в экране.
///
/// Сверка с живым TS: раздел `билингво` в `flutter/test/fixtures/vocab-srs-reference.json`.
library;

/// Языки потока. Узор записан в терминах первого и второго, а не имён: у
/// английского интерфейса пара другая, узор тот же.
const List<String> flowLangs = ['en', 'es'];

/// 🔴 ПОСЛЕДОВАТЕЛЬНОСТЬ — С ПОВТОРАМИ, И ЭТО ГЛАВНОЕ В ФАЙЛЕ.
///
/// Чистое чередование «en → es → en → es» даёт одни переключения и ноль повторов,
/// и цена переключения перестаёт считаться. Доля повторов около трети. Ряд НЕ
/// перемешивается: узор и есть измеряемая величина, случайный порядок сделал бы
/// партии несравнимыми.
const List<String> flowSequence = ['en', 'es', 'en', 'en', 'es', 'es'];

/// Запасной язык — только когда родной совпал с одним из языков потока.
const String flowSpare = 'de';

/// Ключ параметра шага зарядки: `?bilingual=1`.
const String bilingualKey = 'bilingual';

/// Пара языков чередования для этого интерфейса.
List<String> pairFor(String interfaceLang) {
  final own = [for (final l in flowLangs) if (l != interfaceLang) l];
  if (own.length == 2) return own;
  return [own.isNotEmpty ? own.first : flowLangs.first, flowSpare];
}

/// Ряд языков на ЯВНОЙ паре: `rowForPair(10, 'en', 'de')`.
///
/// 🔴 Явная пара, а не пара от интерфейса: первая редакция веба считала пару от
/// языка интерфейса и молча отменяла выбор человека (отчёт `2aa5892c`).
List<String> rowForPair(int count, String first, String second) => [
      for (var i = 0; i < (count < 0 ? 0 : count); i += 1)
        flowSequence[i % flowSequence.length] == flowLangs.first ? first : second,
    ];

class Spread<T> {
  const Spread(this.items, this.switches);

  /// Элементы в порядке ряда, каждый со своим языком.
  final List<({T item, String lang})> items;

  /// Сколько раз язык НА САМОМ ДЕЛЕ сменился.
  ///
  /// 🔴 Экран обязан знать, была ли партия двуязычной, а не судить по включённому
  /// флагу: кончился материал одного языка — добор идёт из второго, и к концу
  /// партия молча становится одноязычной.
  final int switches;
}

/// Разложить элементы двух языков по ряду чередования.
///
/// Когда у языка элементы кончились, берётся элемент другого — партия не
/// обрывается на полпути. Кончилось всё — партия короче, а не пустая.
Spread<T> spreadByRow<T>(Map<String, List<T>> byLang, int count, List<String> pair) {
  final row = rowForPair(count, pair[0], pair[1]);
  final left = <String, List<T>>{for (final e in byLang.entries) e.key: [...e.value]};
  final out = <({T item, String lang})>[];
  for (final want in row) {
    var lang = want;
    if ((left[lang] ?? const []).isEmpty) {
      // Порядок перебора — порядок вставки ключей, как у Object.keys в JS.
      final other = left.keys.where((k) => left[k]!.isNotEmpty);
      if (other.isEmpty) break;
      lang = other.first;
    }
    out.add((item: left[lang]!.removeAt(0), lang: lang));
  }
  var switches = 0;
  for (var i = 1; i < out.length; i += 1) {
    if (out[i].lang != out[i - 1].lang) switches += 1;
  }
  return Spread(out, switches);
}

/// Подпись языка в шапке: «EN·es» — текущий прописными, второй строчными.
///
/// Одной буквы мало: пилюля обязана показывать, что языков ДВА, с первого кадра.
String pairPill(String current, List<String> pair) {
  final cur = current.toUpperCase();
  if (pair.length < 2) return cur;
  for (final l in pair) {
    if (l.toLowerCase() != current.toLowerCase()) return '$cur·${l.toLowerCase()}';
  }
  return cur;
}

/// Второй язык, гарантированно отличный и от первого, и от родного.
///
/// 🔴 Та же мина, что взорвалась в анаграммах 10.09.2026: выбрал человек первым тот
/// же язык, что стоял вторым по умолчанию, — пара вырождается в один язык, и
/// «два языка сразу» честно выдаёт один.
String secondNotFirst(String native, String first, String wanted) {
  if (wanted != first && wanted != native) return wanted;
  final pair = pairFor(native);
  for (final l in pair) {
    if (l != first && l != native) return l;
  }
  return pair[1];
}
