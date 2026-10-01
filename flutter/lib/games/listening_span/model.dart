import 'dart:math' as math;

import '../languages/fresh_pool.dart';

/// «ОБЪЁМ НА СЛУХ» — правила, перенесённые с `app/games/listening-span.tsx` ДО ЗНАКА.
///
/// K слов целевого языка звучат по одному (экран слов не показывает), затем сетка из
/// K услышанных и K отвлекающих: нажать услышанные В ТОМ ЖЕ ПОРЯДКЕ. Неверный следующий
/// элемент — ошибка раунда, раунд кончается. Два раунда; уровень взят, если ошибок за
/// партию не больше одной.
///
/// 🔴 СВЕРЯЕТСЯ С ЭТАЛОНОМ ЖИВОГО TS, А НЕ С САМИМ СОБОЙ: `test/fixtures/listening-span-reference.json`
/// снимает `frontend/src/games/listening-span/tools/record-flutter-reference.gen.ts`.
/// Раздача раунда сверяется на ЗАПИСАННОМ потоке случайных чисел: те же слова, та же
/// сетка и столько же съеденных чисел.

/// Уровень, с которого объём и скорость перестают расти — дальше держат задержка и сходство.
const lspanVolumeTop = 9;

/// Раундов в партии.
const lspanRounds = 2;

/// Сколько озвученных записями слов нужно, чтобы играть только ими: партия просит до
/// 8 слов дважды, и запаса «невиданного» должно хватить хотя бы на три партии подряд.
/// Меньше — мешок берётся целиком, и часть слов звучит системным голосом (веб `МИН_ОЗВУЧЕННЫХ`).
const lspanMinVoiced = 8 * lspanRounds * 3;

/// Пауза после верного раунда и после ошибки — как в вебе (`roundDone`).
const lspanAfterWinMs = 600;
const lspanAfterMissMs = 1000;

/// Правила уровня: объём, пауза между словами, задержка перед вводом (ось 3) и доля
/// отвлекающих, подобранных ПОХОЖИМИ на услышанные (ось 7).
class LspanLevelParams {
  const LspanLevelParams({
    required this.span,
    required this.gapMs,
    required this.holdMs,
    required this.similarShare,
  });

  final int span;
  final int gapMs;

  /// Пауза между последним словом и открытием ввода: ряд надо ДЕРЖАТЬ. Потолка нет —
  /// сознательно (закон раздела «потолков нет нигде»).
  final int holdMs;

  /// 0 → 1 за десять уровней после [lspanVolumeTop].
  final double similarShare;

  static LspanLevelParams of(int level) => LspanLevelParams(
        span: math.min(8, 2 + level),
        gapMs: math.max(500, 700 - (level - 1) * 25),
        holdMs: math.max(0, level - lspanVolumeTop) * 700,
        similarShare: math.min(1.0, math.max(0, level - lspanVolumeTop) * 0.1),
      );
}

/// Сходство двух слов по буквам: 1 − расстояние Левенштейна / длина длинного.
///
/// Буквы, а не фонемы: транскрипции у словаря нет, а правка по буквам даёт ровно те
/// пары, что путаются и на слух («casa/cama», «rot/rat»). ⚠️ Сравниваются ЕДИНИЦЫ UTF-16,
/// как `x[i]` в JS, — иначе на словах вне основной плоскости числа разошлись бы с вебом.
double lspanSimilarity(String a, String b) {
  final x = a.toLowerCase(), y = b.toLowerCase();
  if (x == y) return 1;
  final n = x.length, m = y.length;
  if (n == 0 || m == 0) return 0;
  var prev = List<int>.generate(m + 1, (j) => j);
  for (var i = 1; i <= n; i++) {
    final cur = List<int>.filled(m + 1, 0);
    cur[0] = i;
    for (var j = 1; j <= m; j++) {
      final subst = prev[j - 1] + (x.codeUnitAt(i - 1) == y.codeUnitAt(j - 1) ? 0 : 1);
      cur[j] = math.min(math.min(prev[j] + 1, cur[j - 1] + 1), subst);
    }
    prev = cur;
  }
  return 1 - prev[m] / math.max(n, m);
}

/// Фишер–Йетс ровно как веб-`shuffle`: с конца, `floor(rng() * (i + 1))`. Иной порядок
/// обращений к случайности дал бы другую сетку на том же потоке.
List<T> lspanShuffle<T>(List<T> items, double Function() rng) {
  final a = [...items];
  for (var i = a.length - 1; i > 0; i--) {
    final j = (rng() * (i + 1)).floor();
    final t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

/// Отвлекающие: сначала самые похожие на услышанные (сколько просит доля), затем обычные
/// вперемешку. Слово не бывает и услышанным, и отвлекающим — у задачи был бы не один ответ.
///
/// 🔴 СОРТИРОВКА УСТОЙЧИВАЯ, КАК В JS. `List.sort` в Dart неустойчив: слова с равным
/// сходством встали бы в другом порядке, и на одном потоке получилась бы другая сетка.
/// Поэтому равные упорядочены по месту в мешке явно.
List<String> lspanPickDistractors(
  List<String> pool,
  List<String> spoken,
  int need,
  double share,
  double Function() rng,
) {
  final taken = spoken.toSet();
  final free = [for (final w in pool) if (!taken.contains(w)) w];
  final similarCount = math.min(need, (need * share.clamp(0.0, 1.0)).round());
  final score = <String, double>{};
  for (final w in free) {
    var best = 0.0;
    for (final t in spoken) {
      final v = lspanSimilarity(w, t);
      if (v > best) best = v;
    }
    score[w] = best;
  }
  final idx = List<int>.generate(free.length, (i) => i)
    ..sort((a, b) {
      final c = score[free[b]]!.compareTo(score[free[a]]!);
      return c != 0 ? c : a.compareTo(b);
    });
  final ordered = [for (final i in idx) free[i]];
  final head = ordered.take(similarCount).toList();
  final rest = lspanShuffle(ordered.sublist(math.min(similarCount, ordered.length)), rng);
  return [...head, ...rest].take(need).toList();
}

/// Раздача раунда — вся случайность раунда через один [rng] и в веб-порядке: отбор
/// невиданного, тасовка обычных отвлекающих, тасовка сетки (веб `dealRound`).
({List<String> spoken, List<String> grid, List<String> seen}) lspanDealRound(
  List<String> pool,
  List<String> seen,
  int span,
  double similarShare,
  double Function() rng,
) {
  final res = pickFreshWeb<String>(pool, span, seen, (w) => w, rng);
  final words = [...res.picked, ...lspanPickDistractors(pool, res.picked, span, similarShare, rng)];
  return (spoken: words.take(span).toList(), grid: lspanShuffle(words, rng), seen: res.seen);
}

/// Языки, на которых есть словарь: колонка заполнена в КАЖДОЙ записи (веб `vocabLangsOf`).
/// Список — следствие содержимого словаря, вписать его руками нельзя.
List<String> lspanVocabLangs(List<Map<String, Object?>> vocab) {
  if (vocab.isEmpty) return const [];
  final candidates = vocab.first.keys.where((k) => k != 'cat');
  return [
    for (final lang in candidates)
      if (vocab.every((e) => e[lang] is String && (e[lang] as String).isNotEmpty)) lang,
  ];
}

/// Слова целевого языка — мешок партии. Сначала те, у которых есть запись голоса: на
/// системный голос части телефонов нужного языка нет, а межсловный интервал — сам
/// измеряемый параметр. Озвученных меньше [lspanMinVoiced] — мешок целиком (веб `wordPool`).
List<String> lspanWordPool(List<Map<String, Object?>> vocab, String lang, bool Function(String word) voiced) {
  final all = <String>[];
  final seen = <String>{};
  for (final e in vocab) {
    final w = e[lang];
    if (w is String && w.isNotEmpty && seen.add(w)) all.add(w);
  }
  final withVoice = [for (final w in all) if (voiced(w)) w];
  return withVoice.length >= lspanMinVoiced ? withVoice : all;
}

enum LspanTap { progress, roundWon, roundLost, ignored }

/// Партия: два раунда; в раунде — нажать услышанные слова в порядке звучания.
class ListeningSpanGame {
  ListeningSpanGame({required this.level, required this.params});

  final int level;
  final LspanLevelParams params;

  int round = 1;
  int errors = 0;
  List<String> spoken = const [];
  List<String> grid = const [];

  /// Номера клеток сетки в порядке нажатий.
  final List<int> picked = [];
  int? wrongIdx;

  /// Раунд кончился — нажатия не принимаются до следующего.
  bool locked = false;

  void deal(List<String> spokenWords, List<String> gridWords) {
    spoken = List.unmodifiable(spokenWords);
    grid = List.unmodifiable(gridWords);
    picked.clear();
    wrongIdx = null;
    locked = false;
  }

  LspanTap tap(int gridIdx) {
    if (locked || gridIdx < 0 || gridIdx >= grid.length || picked.contains(gridIdx)) return LspanTap.ignored;
    if (grid[gridIdx] == spoken[picked.length]) {
      picked.add(gridIdx);
      if (picked.length >= spoken.length) {
        locked = true;
        return LspanTap.roundWon;
      }
      return LspanTap.progress;
    }
    // Не то слово или не тот порядок — ошибка раунда, раунд кончается.
    wrongIdx = gridIdx;
    errors += 1;
    locked = true;
    return LspanTap.roundLost;
  }

  bool get lastRound => round >= lspanRounds;

  /// Оба раунда, суммарно не больше одной ошибки.
  bool get passed => errors <= 1;

  int get score => math.max(0, params.span * 250 - errors * 50);
}
