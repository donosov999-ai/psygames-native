import 'dart:convert';
import 'dart:math' as math;

import 'asset_json.dart';
import 'l10n.dart';
import 'shared_state.dart';
import 'web_theme.dart';

/// ЛИГИ, РАНГИ, РАМКИ — РАСЧЁТ НА DART (задача d6a60b02, вариант Б, второй экран — «Лиги»).
///
/// Перенос `frontend/src/services/progression.ts` один в один: пороги, ранги и рамки — таблицами веба
/// (`assets/progression.json`, выгрузка `tools/embed-progression.mjs`), функции — те же формулы на тех
/// же числах двойной точности. Эталон сверки — модель веб-экрана с её входами
/// (`fixtures/leagues_model*.json` + `leagues_input.json`), проба `leagues_model_test.dart`.
class Progression {
  Progression(this.leagues, this.ranksPerLeague, this.frames, this.seasonDays);

  factory Progression.fromJson(Map<String, Object?> j) => Progression(
    [
      for (final l in (j['leagues']! as List).cast<Map>())
        (id: l['id'] as String, from: (l['from'] as num).toInt(), nameKey: l['nameKey'] as String),
    ],
    (j['ranksPerLeague']! as num).toInt(),
    [
      for (final f in (j['frames']! as List).cast<Map>())
        (id: f['id'] as String, nameKey: f['nameKey'] as String, league: f['league'] as String),
    ],
    (j['seasonDays']! as num).toInt(),
  );

  final List<({String id, int from, String nameKey})> leagues;
  final int ranksPerLeague;
  final List<({String id, String nameKey, String league})> frames;
  final int seasonDays;

  static Progression? _cache;

  /// Таблицы из сборки (один раз за запуск).
  static Future<Progression> load() async =>
      _cache ??= Progression.fromJson(await loadJsonAsset('assets/progression.json'));

  /// `standingFor` веба: лига, ранг 1..ranksPerLeague, очки до следующего ранга (null — выше некуда).
  ({int league, int rank, int? toNext, double progress}) standingFor(num seasonPoints) {
    final pts = math.max(0, seasonPoints.floor());
    var idx = 0;
    for (var i = 0; i < leagues.length; i++) {
      if (pts >= leagues[i].from) idx = i;
    }
    if (idx + 1 >= leagues.length) return (league: idx, rank: ranksPerLeague, toNext: null, progress: 1.0);
    final from = leagues[idx].from;
    final step = (leagues[idx + 1].from - from) / ranksPerLeague;
    final rank = math.min(ranksPerLeague, ((pts - from) / step).floor() + 1);
    final rankFloor = from + (rank - 1) * step;
    final toNext = math.max(0, (rankFloor + step - pts).ceil());
    return (league: idx, rank: rank, toNext: toNext, progress: math.min(1.0, (pts - rankFloor) / step));
  }

  /// `isLeagueReached` веба.
  bool isLeagueReached(String id, num seasonPoints) {
    for (final l in leagues) {
      if (l.id == id) return seasonPoints >= l.from;
    }
    return false;
  }

  /// `seasonPointsFrom` веба: сумма очков за последние [seasonDays] дней; без времени и из будущего — мимо.
  int seasonPointsFrom(Iterable<Object?> sessions, {required int nowMs}) {
    final from = nowMs - seasonDays * 24 * 60 * 60 * 1000;
    var sum = 0.0;
    for (final s in sessions) {
      if (s is! Map) continue;
      final ts = s['timestamp'];
      if (ts is! String || ts.isEmpty) continue;
      final t = DateTime.tryParse(ts)?.millisecondsSinceEpoch;
      if (t == null || t < from || t > nowMs) continue;
      final raw = s['score'];
      final score = raw is num ? raw.toDouble() : (raw is String ? double.tryParse(raw.trim()) : null);
      if (score != null && score.isFinite && score > 0) sum += score;
    }
    return sum.floor();
  }
}

const _rtl = {'ar', 'he', 'fa', 'ur'};

/// Модель «Лиг» — та же, что `leaguesModel` веба (`frontend/app/leagues.tsx`).
Map<String, Object?> leaguesModel(Progression p, int pts, {required String primary}) {
  final standing = p.standingFor(pts);
  final here = p.leagues[standing.league];
  final rtl = _rtl.contains(L.locale.split('-').first.toLowerCase());
  String locked(int from) => L.t('leaguesLocked').replaceFirst('{n}', '$from');
  return {
    'v': 1,
    'title': L.t('leaguesTitle'),
    'back': L.t('a11yBack'),
    'backIcon': rtl ? 'chevron-forward' : 'chevron-back',
    'primary': primary,
    'card': {
      'label': L.t('leaguesSeasonPoints').replaceFirst('{d}', '${p.seasonDays}'),
      'pts': '$pts',
      'rank': L.t('leaguesRank').replaceFirst('{n}', '${standing.rank}').replaceFirst('{m}', '${p.ranksPerLeague}'),
      'toNext': standing.toNext == null ? L.t('leaguesTop') : L.t('leaguesToNext').replaceFirst('{n}', '${standing.toNext}'),
    },
    'hint': L.t('leaguesSeasonHint'),
    'leagues': [
      for (final l in p.leagues)
        () {
          final reached = p.isLeagueReached(l.id, pts);
          final isHere = l.id == here.id;
          final name = L.t(l.nameKey);
          return {
            'id': l.id,
            'name': name,
            'reached': reached,
            'here': isHere,
            'sub': isHere ? L.t('leaguesCurrent') : locked(l.from),
            'a11y':
                '$name. ${isHere
                    ? L.t('leaguesCurrent')
                    : reached
                    ? ''
                    : locked(l.from)}',
          };
        }(),
    ],
    'framesTitle': L.t('leaguesFrames'),
    'frames': [
      for (final f in p.frames)
        if (p.isLeagueReached(f.league, pts)) {'id': f.id, 'name': L.t(f.nameKey)},
    ],
    'empty': pts == 0 ? L.t('leaguesEmpty') : null,
  };
}

String _hex(int argb) => '#${(argb & 0xFFFFFF).toRadixString(16).padLeft(6, '0')}';

/// Модель «Лиг» этого человека: партии всего устройства (`getSessions` веба), время — сейчас.
Future<Map<String, Object?>> leaguesModelFor(SharedState state, {DateTime? now}) async {
  final p = await Progression.load();
  List<Object?> sessions;
  try {
    sessions = (jsonDecode(state.get('psygames_sessions') ?? '[]') as List).cast<Object?>();
  } catch (_) {
    sessions = const []; // битая запись — как `catch → 0` веба
  }
  final pts = p.seasonPointsFrom(sessions, nowMs: (now ?? DateTime.now()).millisecondsSinceEpoch);
  return leaguesModel(p, pts, primary: _hex(WebTheme.accent(state).toARGB32()));
}
