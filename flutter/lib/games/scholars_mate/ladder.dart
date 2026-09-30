/// ЛЕСТНИЦА «ДЕТСКОГО МАТА»: сорок ступеней, темп и узоры.
///
/// Перенос с живого TS (`core/deck.ts`, `core/run.ts`) СО СВЕРКОЙ: эталон снят
/// прогоном самого TS, и проба требует совпадения на всех сорока ступенях.
library;

/// Вид задания.
enum ScholarsKind { mate, fromGames, threat, defend, sacrifice }

const int scholarsLevels = 40;

/// 🔴 СЕКУНДЫ ПАДАЮТ СТРОГО МОНОТОННО: 20 → 4, без единого возврата назад.
///
/// В первой редакции надбавки за участки ОТКАТЫВАЛИ время назад (L20 = 12 с,
/// L21 = 16 с), и обещанные четыре секунды не выдавались никогда — сороковой
/// уровень был ровно так же лёгок, как двадцатый. Теперь одна прямая.
int secondsAt(num level) {
  final l = level.floor().clamp(1, scholarsLevels);
  return (20 - ((l - 1) * 16) / (scholarsLevels - 1)).round();
}

/// Множитель времени ПО ВИДУ задания, а не надбавка к уровню: надбавка ломала
/// монотонность лестницы на стыке участков, множитель — нет.
const Map<ScholarsKind, double> secondsByKind = {
  ScholarsKind.mate: 1,
  ScholarsKind.fromGames: 1,
  ScholarsKind.threat: 1.1,
  ScholarsKind.defend: 1.7,
  ScholarsKind.sacrifice: 2.4,
};

/// Сколько секунд даётся на КОНКРЕТНУЮ позицию этой ступени.
int secondsFor(ScholarsKind kind, num level) {
  final v = (secondsAt(level) * secondsByKind[kind]!).round();
  return v < 3 ? 3 : v;
}

/// Полоса рейтинга: и низ, и верх растут. Кверху полоса шире — задач там
/// физически меньше, и узкое окно оставило бы ступень без набора.
({int min, int max}) ratingBand(num level) {
  final l = level.floor().clamp(1, scholarsLevels);
  final share = (l - 1) / (scholarsLevels - 1);
  return (min: (399 + share * 900).round(), max: (700 + share * 1300).round());
}

/// 🔴 УЗОРЫ ПРИХОДЯТ ПО ЛЕСТНИЦЕ, А НЕ ВСЕ СРАЗУ, и новый ДОБАВЛЯЕТСЯ к
/// прежним: иначе выученное перестаёт встречаться, а игра вся про то, что
/// узнавание держится практикой.
const List<({int from, String motif})> _motifSteps = [
  (from: 1, motif: 'scholar'),
  (from: 6, motif: 'queenKnight'),
  (from: 10, motif: 'bishopF7'),
  (from: 14, motif: 'queenAlone'),
  (from: 18, motif: 'fool'),
  (from: 23, motif: 'knightOpening'),
  (from: 28, motif: 'smothered'),
];

List<String> motifsAt(num level) {
  final l = level.floor().clamp(1, scholarsLevels);
  return [
    for (final s in _motifSteps)
      if (l >= s.from) s.motif,
  ];
}

/// Узор, который открывается ровно на этой ступени. Пусто — новых нет.
String? newMotifAt(num level) {
  final l = level.floor().clamp(1, scholarsLevels);
  for (final s in _motifSteps) {
    if (s.from == l) return s.motif;
  }
  return null;
}

/// Ручки ступени: какие виды заданий, сколько позиций, сколько секунд.
class ScholarsLevel {
  const ScholarsLevel({
    required this.level,
    required this.kinds,
    required this.count,
    required this.seconds,
    required this.minRating,
    required this.maxRating,
    required this.motifs,
  });

  final int level;
  final List<ScholarsKind> kinds;
  final int count;
  final int seconds;
  final int minRating;
  final int maxRating;
  final List<String> motifs;
}

ScholarsLevel levelParams(num level) {
  final l = level.floor().clamp(1, scholarsLevels);
  final seconds = secondsAt(l);
  final band = ratingBand(l);
  final motifs = motifsAt(l);
  // 1…5 — свои дебютные позиции: узор в чистом виде, без чужой обстановки.
  if (l <= 5) {
    return ScholarsLevel(
      level: l,
      kinds: const [ScholarsKind.mate],
      count: 8,
      seconds: seconds,
      minRating: 0,
      maxRating: 0,
      motifs: motifs,
    );
  }
  // 6…18 — те же и соседние узоры в настоящих партиях.
  if (l <= 18) {
    return ScholarsLevel(
      level: l,
      kinds: const [ScholarsKind.mate, ScholarsKind.fromGames],
      count: 10,
      seconds: seconds,
      minRating: band.min,
      maxRating: band.max,
      motifs: motifs,
    );
  }
  // 19…28 — узнать угрозу и защититься: узор с другой стороны доски.
  if (l <= 28) {
    return ScholarsLevel(
      level: l,
      kinds: const [
        ScholarsKind.threat,
        ScholarsKind.defend,
        ScholarsKind.fromGames,
      ],
      count: 10,
      seconds: seconds,
      minRating: band.min,
      maxRating: band.max,
      motifs: motifs,
    );
  }
  // 29…40 — мат с ЖЕРТВОЙ плюс самые трудные позиции из партий.
  return ScholarsLevel(
    level: l,
    kinds: const [ScholarsKind.sacrifice, ScholarsKind.fromGames],
    count: 8,
    seconds: seconds,
    minRating: band.min,
    maxRating: band.max,
    motifs: motifs,
  );
}

/// Ключ подписи вопроса по виду задания.
const Map<ScholarsKind, String> kindLabelKey = {
  ScholarsKind.mate: 'scholarsMateAsk',
  ScholarsKind.fromGames: 'scholarsMateAsk',
  ScholarsKind.defend: 'scholarsDefendAsk',
  ScholarsKind.threat: 'scholarsThreatAsk',
  ScholarsKind.sacrifice: 'scholarsSacrificeAsk',
};

/// Подписи видов без повторов — на карточке ступени их показывают списком.
List<String> kindLabels(List<ScholarsKind> kinds) {
  final out = <String>[];
  for (final k in kinds) {
    final key = kindLabelKey[k]!;
    if (!out.contains(key)) out.add(key);
  }
  return out;
}

/// Сколько промахов прощается на ступени.
int missAllowance(num level) => level <= 18 ? 2 : 1;

/// Доля верных, нужная для подъёма.
double levelThreshold(num level, int positions) {
  if (positions <= 0) return 1;
  final v = (positions - missAllowance(level)) / positions;
  return v < 0 ? 0 : v;
}

/// Объявлять ли вид задания. С 29-й ступени человек должен понять сам.
bool announceKind(num level) => level <= 28;

/// Звёзды за подход по МЕДИАНЕ времени: пороги растут с уровнем.
int starsFor(int medianMs, num level) {
  if (medianMs == 0) return 1;
  final l = level < 1 ? 1 : level;
  final forThree = 1400 + (l - 1) * 20;
  final forTwo = 2400 + (l - 1) * 25;
  if (medianMs <= forThree) return 3;
  if (medianMs <= forTwo) return 2;
  return 1;
}

/// Подсказка стоит звезды: с ней трёх не бывает.
int runStars(int medianMs, num level, int hints) {
  final s = starsFor(medianMs, level);
  return hints > 0 && s > 2 ? 2 : s;
}

int medianMs(List<int> values) {
  if (values.isEmpty) return 0;
  final s = [...values]..sort();
  final m = s.length >> 1;
  return s.length.isOdd ? s[m] : ((s[m - 1] + s[m]) / 2).round();
}

const int boardFrame = 2;

int cellSize(int size) {
  final v = ((size - boardFrame * 2) / 8).floor();
  return v < 1 ? 1 : v;
}

int boardWidth(int size) => cellSize(size) * 8 + boardFrame * 2;
