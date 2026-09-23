import 'dart:convert';
import 'dart:math';

/// ПРАВИЛА «СЛОВАРЯ SRS» — перенос `frontend/src/services/vocab-srs.ts`
/// и разбора вариантов из `frontend/app/games/vocab-srs.tsx`.
///
/// Упрощённый SM-2 (Anki-стиль). Оценку человек не ставит: она выводится из
/// самого ответа — мимо → `again`, верно → `good`, верно быстрее 2,5 с → `easy`.
///
/// 🔴 КОЛОДА ЖИВЁТ НА ПАРЕ ЯЗЫКОВ, А НЕ НА ИГРЕ. Ключ хранения —
/// `psygames_vocab_srs_<base>_<target>`, и это не украшение: ru→es и es→ru
/// учатся заново, расписание повторов у направлений своё. Ключ совпадает с
/// веб-версией дословно; разойдутся имена — прогресс разъедется МОЛЧА, обе
/// половины будут работать и показывать разные колоды.
///
/// Сверка с живым TS: `flutter/test/fixtures/vocab-srs-reference.json`
/// (прибор `frontend/scripts/flutter-vocab-srs-reference.test.ts`).

/// Оценка карточки. Значения — те же строки, что пишет веб-сторона.
enum Grade { again, good, easy }

/// Верно и быстрее этого — `easy`. Порог из веб-версии (`EASY_RT_MS`).
const int vocabEasyRtMs = 2500;

/// Ошибка возвращает карточку в сессию через столько позиций — один повторный
/// заход в рамках той же партии (веб: `handlePick`, splice на idx+3).
const int vocabRetryOffset = 3;

class CardState {
  CardState({this.reps = 0, this.intervalDays = 0, this.ease = 2.5, this.dueAt = 0, this.lapses = 0});

  /// Успешных повторов подряд. 0 — новая или сброшенная ошибкой.
  int reps;
  int intervalDays;
  double ease;
  /// Когда карточка снова созреет, мс epoch.
  int dueAt;
  int lapses;

  factory CardState.fromJson(Map<String, dynamic> j) => CardState(
        reps: (j['reps'] as num?)?.toInt() ?? 0,
        intervalDays: (j['intervalDays'] as num?)?.toInt() ?? 0,
        ease: (j['ease'] as num?)?.toDouble() ?? 2.5,
        dueAt: (j['dueAt'] as num?)?.toInt() ?? 0,
        lapses: (j['lapses'] as num?)?.toInt() ?? 0,
      );

  Map<String, dynamic> toJson() => {
        'reps': reps,
        'intervalDays': intervalDays,
        'ease': ease,
        'dueAt': dueAt,
        'lapses': lapses,
      };
}

class CustomWord {
  const CustomWord({required this.id, required this.base, required this.target});
  final String id;
  final String base;
  final String target;

  factory CustomWord.fromJson(Map<String, dynamic> j) =>
      CustomWord(id: j['id'] as String, base: j['base'] as String, target: j['target'] as String);

  Map<String, dynamic> toJson() => {'id': id, 'base': base, 'target': target};
}

class CardRef {
  const CardRef({required this.id, required this.base, required this.target, required this.isNew, this.lang});

  final String id;

  /// Слово на языке интерфейса.
  final String base;

  /// Слово на изучаемом языке.
  final String target;
  final bool isNew;

  /// Язык ЭТОЙ карточки. В обычной партии он один на сессию; поле заведено под
  /// билингво, где карточки двух языков идут вперемешку и оценка каждой обязана
  /// уйти в СВОЮ колоду.
  final String? lang;

  CardRef withLang(String l) => CardRef(id: id, base: base, target: target, isNew: isNew, lang: l);
}

class SrsQueue {
  const SrsQueue({required this.due, required this.fresh, required this.pool});

  /// Созревшие, самые просроченные первыми.
  final List<CardRef> due;

  /// Новые, сколько разрешает `newLimit`.
  final List<CardRef> fresh;

  /// Все слова пары — из них берутся отвлекающие варианты.
  final List<({String base, String target})> pool;
}

class SrsStats {
  const SrsStats({
    required this.totalWords,
    required this.learned,
    required this.dueNow,
    required this.customCount,
    required this.nextDueAt,
  });
  final int totalWords;
  final int learned;
  final int dueNow;
  final int customCount;

  /// Ближайший будущий повтор, мс. `null` — впереди ничего не назначено;
  /// нулём это писать нельзя, ноль читался бы как «пора прямо сейчас».
  final int? nextDueAt;
}

/// Хранилище колоды. Отдельным интерфейсом — чтобы пробы шли без устройства,
/// ровно как у [LevelStore] лестницы уровней.
abstract class DeckStore {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
}

class MemoryDeckStore implements DeckStore {
  final Map<String, String> data = {};
  @override
  Future<String?> read(String key) async => data[key];
  @override
  Future<void> write(String key, String value) async => data[key] = value;
}

/// Словарь: запись = слово во всех языках плюс поле `cat` (семантическая
/// категория, игре не нужна, но в данных лежит).
typedef VocabEntry = Map<String, String>;

String deckKeyFor(String baseLang, String targetLang) => 'psygames_vocab_srs_${baseLang}_$targetLang';

class _Deck {
  _Deck(this.states, this.custom);
  final Map<String, CardState> states;
  final List<CustomWord> custom;

  static _Deck empty() => _Deck({}, []);

  static _Deck parse(String? raw) {
    if (raw == null || raw.isEmpty) return _Deck.empty();
    try {
      final j = jsonDecode(raw) as Map<String, dynamic>;
      final states = <String, CardState>{};
      final s = j['states'];
      if (s is Map) {
        s.forEach((k, v) => states['$k'] = CardState.fromJson((v as Map).cast<String, dynamic>()));
      }
      final custom = <CustomWord>[];
      final c = j['custom'];
      if (c is List) {
        for (final e in c) {
          custom.add(CustomWord.fromJson((e as Map).cast<String, dynamic>()));
        }
      }
      return _Deck(states, custom);
    } catch (_) {
      // Порченая запись — начинаем с пустой колоды, как и веб-версия.
      return _Deck.empty();
    }
  }

  String encode() => jsonEncode({
        'states': states.map((k, v) => MapEntry(k, v.toJson())),
        'custom': custom.map((c) => c.toJson()).toList(),
      });
}

/// Движок одной языковой пары. Сам ничего не рисует и не знает про экран.
class VocabSrs {
  VocabSrs({
    required this.vocab,
    required this.baseLang,
    required this.targetLang,
    required DeckStore store,
    int Function()? nowMs,
    double Function()? random,
  })  : _store = store,   // ignore: prefer_initializing_formals — поле приватное, а параметр именованный
        _now = nowMs ?? (() => DateTime.now().millisecondsSinceEpoch),
        _rnd = random ?? Random().nextDouble;

  final List<VocabEntry> vocab;
  final String baseLang;
  final String targetLang;
  final DeckStore _store;
  final int Function() _now;
  final double Function() _rnd;

  String get deckKey => deckKeyFor(baseLang, targetLang);

  Future<_Deck> _load() async => _Deck.parse(await _store.read(deckKey));
  Future<void> _save(_Deck d) => _store.write(deckKey, d.encode());

  /// Все карточки пары: свои слова ПЕРВЫМИ, затем встроенный словарь.
  ///
  /// Порядок не косметический: `fresh` набирается с начала списка, поэтому свои
  /// слова раньше попадают в новые — так и в веб-версии.
  List<CardRef> _allCards(List<CustomWord> custom) {
    final out = <CardRef>[
      for (final c in custom) CardRef(id: c.id, base: c.base, target: c.target, isNew: false),
    ];
    for (final w in vocab) {
      final b = w[baseLang], t = w[targetLang];
      // Слово без колонки одного из языков пропускается целиком, и одинаковые
      // base/target тоже: «перевод» самого себя ничему не учит.
      if (b == null || t == null || b.isEmpty || t.isEmpty || b == t) continue;
      out.add(CardRef(id: 'v:${w['en']}', base: b, target: t, isNew: false));
    }
    return out;
  }

  Future<SrsQueue> buildQueue(int newLimit, {int reviewLimit = 60}) async {
    final deck = await _load();
    final cards = _allCards(deck.custom);
    final now = _now();

    final due = <CardRef>[];
    final fresh = <CardRef>[];
    for (final c in cards) {
      final st = deck.states[c.id];
      if (st != null && st.reps > 0) {
        if (st.dueAt <= now && due.length < reviewLimit) {
          due.add(CardRef(id: c.id, base: c.base, target: c.target, isNew: false));
        }
      } else if (fresh.length < newLimit) {
        fresh.add(CardRef(id: c.id, base: c.base, target: c.target, isNew: true));
      }
    }
    // 🔴 СОРТИРОВКА ОБЯЗАНА БЫТЬ УСТОЙЧИВОЙ, И ЭТО НЕ ПРИДИРКА.
    // `Array.prototype.sort` в JS устойчив с ES2019, а `List.sort` в Dart —
    // НЕТ: при равных `dueAt` (две карточки, оценённые в один заход, — обычное
    // дело) порядок вышел бы другим, и сверка с эталоном краснела бы через раз,
    // причём невоспроизводимо. Поэтому ключ сортировки дополнен исходным местом.
    // (⚠️ имя переменной латиницей: Dart не принимает кириллицу в идентификаторах,
    // в отличие от TS, где такие имена по всему проекту.)
    final slot = {for (var i = 0; i < due.length; i += 1) due[i].id: i};
    due.sort((a, b) {
      final d = (deck.states[a.id]?.dueAt ?? 0).compareTo(deck.states[b.id]?.dueAt ?? 0);
      return d != 0 ? d : slot[a.id]!.compareTo(slot[b.id]!);
    });
    return SrsQueue(
      due: due,
      fresh: fresh,
      pool: [for (final c in cards) (base: c.base, target: c.target)],
    );
  }

  /// Применить оценку. Возвращает новый интервал в днях; 0 — карточка вернётся
  /// в текущую сессию и в график не уходит.
  Future<int> gradeCard(String id, Grade grade) async {
    final deck = await _load();
    final st = deck.states[id] ?? CardState();

    if (grade == Grade.again) {
      // Счёт срывов растёт только у карточки, которая УЖЕ была выучена: провал
      // на первом показе — не срыв, а обычное незнание.
      st.lapses += st.reps > 0 ? 1 : 0;
      st.reps = 0;
      st.intervalDays = 0;
      st.ease = max(1.3, st.ease - 0.2);
    } else if (st.reps == 0) {
      st.reps = 1;
      st.intervalDays = grade == Grade.easy ? 3 : 1;
      if (grade == Grade.easy) st.ease += 0.05;
    } else {
      st.reps += 1;
      st.intervalDays = max(1, _round(st.intervalDays * st.ease * (grade == Grade.easy ? 1.3 : 1)));
      if (grade == Grade.easy) st.ease += 0.05;
    }
    st.dueAt = _now() + st.intervalDays * 86400000;

    deck.states[id] = st;
    await _save(deck);
    return grade == Grade.again ? 0 : st.intervalDays;
  }

  /// Округление как в JS `Math.round`: половина уходит ВВЕРХ, в том числе у
  /// отрицательных. `double.round()` в Dart на .5 уходит от нуля — для наших
  /// положительных интервалов это то же самое, но правило записано явно, чтобы
  /// перенос не зависел от совпадения.
  static int _round(double v) => (v + 0.5).floor();

  Future<SrsStats> getStats() async {
    final deck = await _load();
    final cards = _allCards(deck.custom);
    final now = _now();
    var learned = 0, dueNow = 0;
    int? nextDueAt;
    for (final c in cards) {
      final st = deck.states[c.id];
      if (st != null && st.reps > 0) {
        learned += 1;
        if (st.dueAt <= now) {
          dueNow += 1;
        } else if (nextDueAt == null || st.dueAt < nextDueAt) {
          nextDueAt = st.dueAt;
        }
      }
    }
    return SrsStats(
      totalWords: cards.length,
      learned: learned,
      dueNow: dueNow,
      customCount: deck.custom.length,
      nextDueAt: nextDueAt,
    );
  }

  /// Свои слова строками «слово = перевод». Разделители: `=`, `—`, `–`, таб и ` - `.
  /// Возвращает, сколько добавлено.
  Future<int> addCustomWords(String rawText) async {
    final deck = await _load();
    final existing = <String>{
      for (final c in deck.custom) '${c.base.toLowerCase()}|${c.target.toLowerCase()}',
    };
    final sep = RegExp(r'\s*(?:=|—|–|\t| - )\s*');
    var added = 0;
    for (final line in rawText.split('\n')) {
      final m = line.split(sep);
      if (m.length < 2) continue;
      final base = m[0].trim();
      final target = m.sublist(1).join(' ').trim();
      if (base.isEmpty || target.isEmpty) continue;
      final sig = '${base.toLowerCase()}|${target.toLowerCase()}';
      if (existing.contains(sig)) continue;
      existing.add(sig);
      deck.custom.add(CustomWord(id: 'c:${_now()}_$added', base: base, target: target));
      added += 1;
    }
    if (added > 0) await _save(deck);
    return added;
  }

  /// Варианты ответа: верный плюс до трёх отвлекающих, вперемешку.
  ///
  /// 🔴 ЗДЕСЬ ВЕБ-ВЕРСИЯ ВИСЛА НАМЕРТВО. Прежний код добирал отвлекающие циклом
  /// «пока их меньше, чем кандидатов», но кандидаты считались С ПОВТОРАМИ, а
  /// набор — без них: два одинаковых перевода в словаре (в своём словаре это
  /// обычное дело), и условие выхода не выполнялось НИКОГДА. Цикла нет вовсе:
  /// берём УНИКАЛЬНЫХ кандидатов и перемешиваем, завершение гарантировано
  /// устройством, а не удачей. Проба на это — `vocab-no-hang` в веб-версии.
  ///
  /// ⚠️ Порядок обращений к случайности перенесён дословно: сначала тасуются
  /// кандидаты целиком, потом — четвёрка вариантов. Перепутаешь — эталон
  /// покраснеет, даже если каждый шаг по отдельности верен.
  List<String> buildOptions(String right, List<String> poolWords) {
    final candidates = <String>[];
    final seen = <String>{};
    for (final w in poolWords) {
      if (w.isEmpty || w == right || !seen.add(w)) continue;
      candidates.add(w);
    }
    _shuffle(candidates);
    final opts = <String>[right, ...candidates.take(3)];
    _shuffle(opts);
    return opts;
  }

  void _shuffle(List<String> a) {
    for (var i = a.length - 1; i > 0; i -= 1) {
      final j = (_rnd() * (i + 1)).floor();
      final t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
  }
}

/// Оценка по самому ответу — человек её не ставит.
///
/// Веб-версия (`handlePick`): мимо → again; верно и быстрее 2,5 с → easy; иначе good.
Grade gradeFromAnswer({required bool correct, required int rtMs}) =>
    !correct ? Grade.again : (rtMs < vocabEasyRtMs ? Grade.easy : Grade.good);
