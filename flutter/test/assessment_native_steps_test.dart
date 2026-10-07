import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/level_ladder.dart';
import 'package:psygames_flutter/shell/session_report.dart';

/// 🔴 «ОЦЕНКА» УЗНАЁТ НАТИВНУЮ ПАРТИЮ СВОЕГО ШАГА И НАХОДИТ В НЕЙ МЕТРИКУ ДОМЕНА (задача 177a13df).
///
/// Веб (`frontend/src/services/assessment.ts`): `scoreSessions` берёт партию шага, только
/// если `difficulty` и `mode` совпадают с шагом дословно (`sessionFitsStep`), и читает
/// метрику домена из `details` (`extractMetric`). Нет партии или нет метрики — домен
/// МОЛЧА «средний, z = 0». Замер раздела «Объём памяти» 30.09.2026: нативные экраны
/// батареи слали `difficulty` = уровень, без `mode` и без `details` — 9 доменов из 12
/// у любого человека выходили средними, а отчёт выглядел как измерение.
///
/// Шаги и домены проба читает из живого `assessment.ts`, а не из копии.
final _assessment = File('../frontend/src/services/assessment.ts');

class _Step {
  _Step(this.gameId, this.route, this.difficulty, this.mode, this.trials);
  final String gameId, route;
  final String? difficulty, mode, trials;
}

List<_Step> _steps(String src) {
  final body = src.substring(src.indexOf('export const ASSESSMENT_PLAYLIST'));
  String? f(String obj, String k) => RegExp("$k:\\s*'([^']*)'").firstMatch(obj)?.group(1);
  return [
    for (final m in RegExp(r"\{\s*game_id:\s*'(\w+)'[^}]*\}").allMatches(body))
      _Step(m.group(1)!, f(m.group(0)!, 'game_route')!, f(m.group(0)!, 'difficulty'), f(m.group(0)!, 'mode'),
          RegExp(r'trials:\s*(\d+)').firstMatch(m.group(0)!)?.group(1)),
  ];
}

/// Домен → метрика, которую `extractMetric` ищет в `details`.
Map<String, String> _metrics(String src) => {
      for (final m in RegExp(r"game_id:\s*'(\w+)',\s*metric:\s*'(\w+)'").allMatches(src)) m.group(1)!: m.group(2)!,
    };

/// 🟡 ДОЛГ МЕТРИК: нативный экран шага ещё НЕ пишет метрику домена в `details`. Каждая
/// строка — владелец экрана и задача. Проба ниже краснеет в ОБЕ стороны: экран без
/// метрики вне списка — и строка списка, чей экран метрику уже пишет (снять строку).
const _metricDebt = {
  'mental_rotation': 'psygames-spatial-claude-mac — angle_response_slope',
};

void main() {
  late List<_Step> steps;
  late Map<String, String> metrics;
  final sent = <Map<String, dynamic>>[];

  setUpAll(() {
    final src = _assessment.readAsStringSync();
    steps = _steps(src);
    metrics = _metrics(src);
  });
  setUp(() {
    sent.clear();
    SessionReport.sink = (j) async => sent.add(jsonDecode(j) as Map<String, dynamic>);
  });
  tearDown(() {
    SessionReport.sink = null;
    GamePreset.clear();
  });

  /// Настройки шага — как их собирает `stepToParams` (`frontend/src/services/warmup.ts`).
  void preset(_Step s) => GamePreset.set({
        'wu': '1',
        if (s.difficulty != null) 'diff': s.difficulty!,
        if (s.mode != null) 'mode': s.mode!,
        if (s.trials != null) 'trials': s.trials!,
      });

  test('шаги батареи прочитаны из живого assessment.ts', () {
    expect(steps.length, greaterThanOrEqualTo(12), reason: 'разбор ASSESSMENT_PLAYLIST сломался');
    expect(steps.where((s) => s.difficulty != null || s.mode != null), isNotEmpty);
  });

  test('🔴 партия шага уходит с ЕГО метками — и победой, и поражением', () async {
    for (final s in steps) {
      preset(s);
      final ladder = LevelLadder(gameId: s.gameId, store: MemoryLevelStore());
      await ladder.load();
      await ladder.win();
      await ladder.fail();
      for (final r in sent) {
        if (s.difficulty != null) expect(r['difficulty'], s.difficulty, reason: '${s.gameId}: difficulty шага');
        if (s.mode != null) expect(r['mode'], s.mode, reason: '${s.gameId}: mode шага');
      }
      sent.clear();
      GamePreset.clear();
    }
  });

  test('экран, передавший метку сам, главнее шага; вне шага — уровень, как раньше', () async {
    GamePreset.set({'wu': '1', 'diff': 'medium', 'mode': 'forward'});
    final ladder = LevelLadder(gameId: 'digit_span', store: MemoryLevelStore());
    await ladder.load();
    await ladder.win(mode: 'backward', difficulty: 'hard');
    expect([sent.last['mode'], sent.last['difficulty']], ['backward', 'hard']);
    GamePreset.clear();
    await ladder.win();
    expect(sent.last['difficulty'], '${ladder.level}', reason: 'вне шага difficulty — уровень, как раньше');
    expect(sent.last['mode'], isNull, reason: 'вне шага метку шага не выдумываем');
  });

  test('🟡 метрика домена: нативный экран её пишет — или он в долге с владельцем', () {
    final hybrid = File('lib/shell/hybrid_app.dart').readAsStringSync();
    final missing = <String>[];
    final paid = <String>[];
    for (final s in steps) {
      final metric = metrics[s.gameId];
      if (metric == null) continue;
      final cls = RegExp("'${RegExp.escape(s.route)}':\\s*\\(s\\)\\s*=>\\s*(\\w+)\\(").firstMatch(hybrid)?.group(1);
      if (cls == null) continue; // экран не перехвачен — партию пишет веб
      final file = Directory('lib/games')
          .listSync(recursive: true)
          .whereType<File>()
          .where((f) => f.path.endsWith('.dart'))
          .firstWhere((f) => f.readAsStringSync().contains('class $cls '));
      final dir = file.parent;
      final writes = dir
          .listSync(recursive: true)
          .whereType<File>()
          .where((f) => f.path.endsWith('.dart'))
          .any((f) => RegExp("'${RegExp.escape(metric)}'\\s*:").hasMatch(f.readAsStringSync()));
      if (!writes && !_metricDebt.containsKey(s.gameId)) missing.add('${s.gameId} ($metric) ← ${file.path}');
      if (writes && _metricDebt.containsKey(s.gameId)) paid.add(s.gameId);
    }
    expect(missing, isEmpty,
        reason: 'Нативный экран шага «Оценки» не пишет метрику домена в details — домен молча «средний». '
            'Пиши её как веб-экран той же игры (saveSession details) или внеси в _metricDebt с владельцем:\n'
            '${missing.join('\n')}');
    expect(paid, isEmpty, reason: 'Метрику уже пишут — сними строки из _metricDebt: $paid');
  });
}
