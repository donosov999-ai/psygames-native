import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/n_back/model.dart';
import 'package:psygames_flutter/games/n_back/screen.dart';
import 'package:psygames_flutter/shell/demo_lesson.dart';
import 'package:psygames_flutter/shell/game_clock.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/level_rules.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:psygames_flutter/shell/voice.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Голос для проб: считает, что сказано, и умеет «не иметь голоса».
class _FakeVoice implements VoiceBackend {
  _FakeVoice({required this.system});
  final bool system;
  final played = <String>[];
  final spoken = <String>[];

  @override
  Future<bool> playUrl(String url, double rate) async {
    played.add(url);
    return true;
  }

  @override
  Future<bool> speakSystem(String text, String bcp47, double rate) async {
    spoken.add(text);
    return system;
  }

  @override
  Future<bool> hasSystemVoice(String bcp47) async => system;

  @override
  Future<void> cancel() async {}
}

/// 🔴 N-BACK ИГРАЕТСЯ НАЖАТИЯМИ, РЯД ЧИТАЕТСЯ С ЭКРАНА.
///
/// Какая клетка горит — считывается с сетки игры, как это видит человек; подсмотреть
/// ряд в модели значило бы пройти пробу и при сломанном показе. Отчёт партии
/// перехватывается: в нём проверяются длительность (039822b3) и метки шага «Оценки»
/// (177a13df) — ровно то, что раньше уходило неверным молча.
void main() {
  late SharedState state;
  final sent = <Map<String, dynamic>>[];
  final strings = NbStrings.fromJson(
      jsonDecode(File('assets/l10n/n_back.json').readAsStringSync()) as Map<String, dynamic>, 'ru');

  // Словарь и таблица правил — до проб, как в приложении: догруженные посреди партии,
  // они перестраивают шапку каркаса в случайный момент поддельного времени.
  setUpAll(() async {
    await L.load('ru');
    await LevelRules.load();
  });

  Future<void> boot(WidgetTester tester, {int level = 2, bool voice = false, bool ruleSeen = true, Map<String, String>? preset}) async {
    // Часы партии идут с поддельным временем пробы, а не с настоящими часами машины.
    gameWallMs = () => tester.binding.clock.now().millisecondsSinceEpoch;
    SharedPreferences.setMockInitialValues({
      'psygames_n_back_level_nzt48': '$level',
      if (ruleSeen) LevelRules.seenKey('n_back', 'dual'): '1',
    });
    state = await SharedState.open();
    sent.clear();
    SessionReport.sink = (json) async => sent.add(jsonDecode(json) as Map<String, dynamic>);
    if (preset != null) GamePreset.set(preset);
    final layer = VoiceLayer(
      backend: _FakeVoice(system: voice),
      soundOn: () => true,
      letters: {for (final l in nbAudioLetters) l: '$l.opus'},
    );
    var x = 0.4242;
    double rng() => x = (x * 9301 + 49297) % 233280 / 233280;
    await tester.pumpWidget(MaterialApp(home: NBackScreen(state: state, voice: layer, strings: strings, rng: rng)));
    for (var i = 0; i < 5; i++) {
      await tester.pump();
    }
  }

  tearDown(() {
    gameWallMs = () => DateTime.now().millisecondsSinceEpoch;
    GamePreset.clear();
    SessionReport.sink = null;
  });

  int? litCell(WidgetTester tester) {
    final grids = find.byType(NbGrid).evaluate().toList();
    if (grids.isEmpty) return null;
    return (grids.first.widget as NbGrid).lit;
  }

  /// Играет партию до конца: жмёт «совпадение», когда горящая клетка равна той, что
  /// горела n проб назад. [wrongEvery] — нарочно жать мимо на каждой такой пробе.
  Future<List<int>> play(WidgetTester tester, {required int n, Key button = const Key('nb-match')}) async {
    final seen = <int>[];
    var dark = true;
    for (var step = 0; step < 4000 && find.byType(NbGrid).evaluate().isNotEmpty; step++) {
      final lit = litCell(tester);
      if (lit == null) {
        dark = true;
      } else if (dark) {
        dark = false;
        seen.add(lit);
        final i = seen.length - 1;
        if (i >= n && seen[i] == seen[i - n]) {
          await tester.tap(find.byKey(button));
        }
      }
      await tester.pump(const Duration(milliseconds: 50));
    }
    await tester.pump(const Duration(seconds: 1));
    return seen;
  }

  bool hud(WidgetTester tester, String label, String value) => find
      .byWidgetPredicate((w) => w is Semantics && w.properties.label == '$label: $value')
      .evaluate()
      .isNotEmpty;

  testWidgets('🔴 партия нажатиями: 2-back, все совпадения взяты — 100 %, уровень поднят', (tester) async {
    await boot(tester, level: 2);
    await tester.tap(find.text(L.t('start')));
    await tester.pump();
    final seen = await play(tester, n: 2);
    expect(seen.length, nbDefaultTrials, reason: 'показано столько проб, сколько в партии');
    expect(find.byKey(const Key('nb-accuracy')), findsOneWidget, reason: 'итог партии на экране');
    expect(tester.widget<Text>(find.byKey(const Key('nb-accuracy'))).data, '100%');
    expect(hud(tester, L.t('level'), '3'), isTrue, reason: '≥ 80 % — уровень растёт');

    final s = sent.single;
    expect(s['game_type'], 'n_back');
    expect('${s['difficulty']} / ${s['mode']}', '2-back / 20t-single', reason: 'метки вне шага — как в вебе');
    final details = s['details'] as Map;
    expect(details['n'], 2);
    expect(details['accuracy'], 100);
    expect(details['d_prime'], isA<num>());
  });

  testWidgets('🔴 время партии — секунды партии, а не отметка Unix (039822b3); вторая подряд не длиннее себя',
      (tester) async {
    await boot(tester, level: 1);
    await tester.tap(find.text(L.t('start')));
    await tester.pump();
    await play(tester, n: 1);
    final first = sent.single['time_seconds'] as int;
    expect(first, inInclusiveRange(20, 120), reason: '20 проб по ~1,8 с, а не 1 789 617 778');

    await tester.tap(find.text(L.t('restart')).last);
    await tester.pump();
    await tester.tap(find.text(L.t('start')));
    await tester.pump();
    await play(tester, n: 2);
    final second = sent.last['time_seconds'] as int;
    expect(second, inInclusiveRange(20, 120), reason: 'вторая партия не тянет за собой время первой');
  });

  testWidgets('🔴 шаг «Оценки»: стартует сам, 2-back из режима шага, метки шага и d′ в отчёте (177a13df)',
      (tester) async {
    await boot(tester, level: 1, preset: {'wu': '1', 'diff': 'medium', 'mode': '2-back', 'trials': '15'});
    expect(find.text(L.t('start')), findsNothing, reason: 'шаг стартует сам');
    final seen = await play(tester, n: 2);
    expect(seen.length, 15, reason: 'проб — из шага (trials=15)');
    final s = sent.single;
    // Правило опознания «Оценки» (sessionFitsStep): difficulty и mode шага дословно.
    expect('${s['difficulty']} / ${s['mode']}', 'medium / 2-back');
    expect((s['details'] as Map)['d_prime'], isA<num>(), reason: 'метрика домена «WM под нагрузкой»');
    expect(hud(tester, L.t('level'), '1'), isTrue, reason: 'шаг зарядки личный уровень не двигает');
  });

  testWidgets('🔴 на 9-м уровне ДО партии — карточка правила «Два потока», не поверх стимулов', (tester) async {
    await boot(tester, level: 9, voice: true, ruleSeen: false);
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.byType(AlertDialog), findsOneWidget, reason: 'правило уровня объявлено в спокойный момент');
    expect(find.text(L.t('lr_n_back_dual_title')), findsWidgets);
    await tester.tap(find.text(L.t('ctaGotIt')));
    await tester.pumpAndSettle();
    expect(find.text(L.t('start')), findsOneWidget, reason: 'после «Понятно» — экран старта, партия не шла');
  });

  testWidgets('двойной поток с голосом: «Position» и «Sound», буква и звучит, и видна', (tester) async {
    await boot(tester, level: 9, voice: true);
    await tester.tap(find.text(L.t('start')));
    await tester.pump(const Duration(milliseconds: 700));
    expect(find.byKey(const Key('nb-position')), findsOneWidget);
    expect(find.byKey(const Key('nb-sound')), findsOneWidget);
    expect(find.byKey(const Key('nb-letter')), findsOneWidget, reason: 'букву видно и глазами');
    await tester.tap(find.byTooltip(L.t('restart')));
    await tester.pump(const Duration(seconds: 3));
  });

  testWidgets('🔴 голоса нет — двойной уровень играется одним потоком (немой поток валил бы уровень)', (tester) async {
    await boot(tester, level: 9, voice: false);
    await tester.tap(find.text(L.t('start')));
    await tester.pump(const Duration(milliseconds: 700));
    expect(find.byKey(const Key('nb-sound')), findsNothing);
    expect(find.byKey(const Key('nb-match')), findsOneWidget);
    await tester.tap(find.byTooltip(L.t('restart')));
    await tester.pump(const Duration(seconds: 3));
  });

  testWidgets('🔴 «Показать решение»: весь блок, совпадения — ровно те, что в ряду; партия не засчитана',
      (tester) async {
    await boot(tester, level: 2);
    await tester.tap(find.text(L.t('start')));
    await tester.pump(const Duration(seconds: 3));
    await tester.tap(find.byTooltip(L.t('puzzleShowSolution')));
    await tester.pump();
    expect(find.byType(NbSolution), findsOneWidget);
    final chips = find.byWidgetPredicate((w) => w is Semantics && (w.properties.label ?? '').startsWith('nb-sol-'));
    final labels = chips.evaluate().map((e) => (e.widget as Semantics).properties.label!).toList();
    expect(labels.length, nbDefaultTrials, reason: 'раскрыт весь блок');
    final solution = tester.widget<NbSolution>(find.byType(NbSolution));
    expect(labels.where((l) => l.endsWith('-match')).length, countMatches(solution.game.visual.items, 2),
        reason: 'отмечено столько совпадений, сколько в ряду партии');
    expect(sent, isEmpty, reason: 'показанное решение в статистику и лестницу не идёт');
  });

  testWidgets('🔴 разбор открывается ДО партии; ответы примеров — по правилу самой игры', (tester) async {
    await boot(tester, level: 2);
    await tester.tap(find.byKey(const Key('game-lesson')));
    await tester.pumpAndSettle();
    expect(find.byType(DemoCard), findsOneWidget);
    expect(find.byType(NbLessonArt), findsOneWidget, reason: 'в разборе сетка самой игры');

    final arts = nBackLessonTrials().map((t) => t.art! as NbLessonArt).toList();
    expect(arts.map((a) => a.isMatch).toList(), [true, true, false],
        reason: 'совпадение 1-back, совпадение 2-back, приманка');
    final lure = arts[2];
    expect(lure.cells.last, lure.cells[lure.cells.length - 2], reason: 'приманка — повтор на лаге n−1');
    for (final a in arts) {
      final g = a.cells;
      expect(countMatches(g, a.n) >= (a.isMatch ? 1 : 0), isTrue);
    }
    await tester.tap(find.byKey(const Key('lesson-close')));
    await tester.pumpAndSettle();
  });
}
