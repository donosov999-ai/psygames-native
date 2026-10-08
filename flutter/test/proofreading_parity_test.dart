import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/proofreading/model.dart';
import 'package:psygames_flutter/games/proofreading/screen.dart';
import 'package:psygames_flutter/shell/aux_action.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/hud_time.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// «КОРРЕКТУРА» (БУКВЫ) ПРОТИВ ВЕБА — ПО ЖИВОМУ ПУТИ, 07.10.2026.
///
/// Замер до правки, маршрут как в hybrid_app (`ProofreadingScreen(state: s)`), язык en:
/// «Find: Л  К» — английский игрок видел кириллицу. Плюс шаг зарядки шёл с лимитом
/// уровня вместо своего размера без лимита, подсказки не было, партия уходила без полей.
/// Пробы смотрят на ЭКРАН и на отправленную партию, а не на модель.
void main() {
  late SharedState state;
  late Map<String, String> scripts;
  late String digits;
  final sent = <Map<String, dynamic>>[];

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
    await L.load('ru');
    // Алфавиты — из эталона, снятого с живого TS: ассет в пробе не читаем.
    final ref = jsonDecode(File('test/fixtures/proofreading-reference.json').readAsStringSync())
        as Map<String, dynamic>;
    scripts = (ref['scripts'] as Map).map((k, v) => MapEntry('$k', '$v'));
    digits = '${ref['digits']}';
    ProofScripts.useForTest(scripts, digits);
    sent.clear();
    SessionReport.sink = (j) async => sent.add(jsonDecode(j) as Map<String, dynamic>);
  });
  tearDown(() {
    GamePreset.clear();
    SessionReport.sink = null;
  });

  int Function() fakeClock(WidgetTester tester) => () => tester.binding.clock.now().millisecondsSinceEpoch;

  List<String> targetsOnScreen(WidgetTester tester) {
    final t = tester.widget<Text>(find.byKey(const Key('proof-targets')));
    return t.data!.split(': ').last.split('  ').where((s) => s.isNotEmpty).toList();
  }

  List<String> lettersOnScreen(WidgetTester tester) {
    final out = <String>[];
    for (var i = 0;; i++) {
      final cell = find.byKey(Key('proof-cell-$i'));
      if (cell.evaluate().isEmpty) return out;
      out.add((find.descendant(of: cell, matching: find.byType(Text)).evaluate().first.widget as Text).data!);
    }
  }

  Color? cellColor(WidgetTester tester, int i) =>
      (tester.widget<Container>(find.byKey(Key('proof-cell-$i'))).decoration as BoxDecoration).color;

  /// Открыть экран маршрутом hybrid_app и дождаться партии (сам — у шага, кнопкой — иначе).
  Future<void> openAndStart(WidgetTester tester, {Random? rnd}) async {
    await tester.pumpWidget(MaterialApp(home: ProofreadingScreen(state: state, rnd: rnd, clock: fakeClock(tester))));
    for (var i = 0; i < 20 && find.byKey(const Key('proof-targets')).evaluate().isEmpty; i++) {
      await tester.pump(const Duration(milliseconds: 50));
      final start = find.text(L.t('start'));
      if (!GamePreset.autostart && start.evaluate().isNotEmpty) {
        await tester.tap(start);
        await tester.pump();
      }
    }
    expect(find.byKey(const Key('proof-targets')), findsOneWidget, reason: 'партия не началась');
  }

  /// Нажать все цели — партия кончается досрочно.
  Future<void> findAll(WidgetTester tester) async {
    final targets = targetsOnScreen(tester);
    final letters = lettersOnScreen(tester);
    for (var i = 0; i < letters.length; i++) {
      if (targets.contains(letters[i])) {
        await tester.tap(find.byKey(Key('proof-cell-$i')));
        await tester.pump();
      }
    }
  }

  bool allIn(Iterable<String> chars, String alphabet) => chars.every(alphabet.contains);

  group('письменность', () {
    for (final (lang, script) in const [('en', 'latin'), ('ru', 'cyrillic'), ('de', 'latin'), ('hi', 'latin')]) {
      testWidgets('🔴 по языку: $lang — $script, как у веба', (tester) async {
        await L.load(lang);
        await openAndStart(tester, rnd: Random(5));
        expect(allIn(targetsOnScreen(tester), scripts[script]!), isTrue, reason: '$lang: цели ${targetsOnScreen(tester)}');
        expect(allIn(lettersOnScreen(tester), scripts[script]!), isTrue, reason: '$lang: поле не $script');
        await tester.pumpWidget(const SizedBox());
      });
    }

    test('адрес шага зарядки — не письменность: 144 шага шлют mode «11x8»', () {
      // Живые отправители: шаги «Корректуры» в наборах по умолчанию. Их mode — размер поля,
      // и экран обязан откатиться к языку, а не уронить поле или взять что попало.
      final raw = File('../frontend/src/constants/defaultPlaylists.json').readAsStringSync();
      final modes = <String>[];
      void walk(Object? o) {
        if (o is Map) {
          if (o['game_id'] == 'proofreading' && o['mode'] is String) modes.add(o['mode'] as String);
          o.values.forEach(walk);
        } else if (o is List) {
          o.forEach(walk);
        }
      }

      walk(jsonDecode(raw));
      expect(modes, isNotEmpty, reason: 'шаги «Корректуры» с mode пропали — сверить пробу');
      for (final m in modes.toSet()) {
        expect(proofScriptFor(param: m, locale: 'en', known: scripts.keys), anyOf('latin', m),
            reason: 'mode «$m» из шага: неизвестное имя обязано откатиться к языку');
      }
      expect(proofScriptFor(param: '11x8', locale: 'ru', known: scripts.keys), 'cyrillic');
    });

    for (final (param, check) in const [('greek', 'greek'), ('digits', 'digits'), ('11x8', 'latin')]) {
      testWidgets('🔴 из адреса: mode=$param → $check', (tester) async {
        await L.load('en');
        GamePreset.set({'mode': param});
        await openAndStart(tester, rnd: Random(6));
        final alphabet = check == 'digits' ? digits : scripts[check]!;
        expect(allIn(lettersOnScreen(tester), alphabet), isTrue, reason: 'mode=$param: поле не $check');
        await tester.pumpWidget(const SizedBox());
      });
    }

    testWidgets('🔴 выбор на настройке: «Хирагана» — поле хираганой, уровень тот же', (tester) async {
      await L.load('en');
      await tester.pumpWidget(MaterialApp(home: ProofreadingScreen(state: state, rnd: Random(7), clock: fakeClock(tester))));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('proof-script')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('proof-script-hiragana')).last);
      await tester.pumpAndSettle();
      expect(find.text(L.t('scriptHiragana')), findsOneWidget, reason: 'выбор не показан');
      expect(find.text('${L.t('level')} 1'), findsOneWidget, reason: 'смена письменности не двигает лестницу');
      await tester.tap(find.text(L.t('start')));
      await tester.pump();
      expect(allIn(lettersOnScreen(tester), scripts['hiragana']!), isTrue, reason: 'поле не хираганой');
      // Посреди партии выбора нет.
      expect(find.byKey(const Key('proof-script')), findsNothing);
      await tester.pumpWidget(const SizedBox());
    });
  });

  testWidgets('🔴 шаг зарядки: размер из шага с потолком уровня, без лимита, уровень не засчитан', (tester) async {
    await L.load('en');
    GamePreset.set({'wu': '1', 'rows': '14', 'cols': '12', 'mode': '11x8', 'diff': 'easy'});
    await openAndStart(tester, rnd: Random(8));
    // L1 — поле 8×8; шаг просит 14×12, потолок — освоенное + 1: 9×9 (веб `capPresetByLevel`).
    expect(lettersOnScreen(tester).length, 81, reason: 'поле шага не 9×9');
    // Подпись счётчика шапки — в Semantics (на экране значок и число).
    Finder hud(String label) =>
        find.byWidgetPredicate((w) => w is Semantics && (w.properties.label ?? '').startsWith('$label: '));
    expect(hud(L.t('time')), findsOneWidget, reason: 'в шапке не прошедшее время');
    expect(hud(L.t('timeLeftLabel')), findsNothing, reason: 'у шага нет лимита — нет и остатка');
    // Лимит L1 — 64 с. Шаг идёт дольше и не кончается по времени.
    await tester.pump(const Duration(seconds: 200));
    expect(find.byKey(const Key('proof-targets')), findsOneWidget, reason: 'шаг кончился по времени');
    expect(find.text('3:20'), findsOneWidget, reason: 'время в шапке — по правилу веба `hudTime`');
    await findAll(tester);
    await tester.pump();
    expect(find.text(L.t('done')), findsOneWidget, reason: 'итог шага — «Готово», а не вердикт уровня');
    final d = sent.single['details'] as Map<String, dynamic>;
    expect(d['time_limit_sec'], 0);
    expect([d['rows'], d['cols']], [9, 9]);
    expect(sent.single['difficulty'], '9x9');
    expect(state.get('${SharedState.prefix}proofreading_level_nzt48'), isNull, reason: 'шаг зарядки двинул лестницу');
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('🔴 подсказка: первая ненайденная цель по полю, 3 на партию, гаснет нажатием', (tester) async {
    await openAndStart(tester, rnd: Random(9));
    final targets = targetsOnScreen(tester);
    final letters = lettersOnScreen(tester);
    final order = [for (var i = 0; i < letters.length; i++) if (targets.contains(letters[i])) i];
    AuxAction hint() => tester.widget<AuxAction>(find.byKey(const Key('proof-hint')));
    expect(hint().count, 3);

    await tester.tap(find.byKey(const Key('proof-hint')));
    await tester.pump();
    expect(cellColor(tester, order[0]), proofHintColor, reason: 'показана не первая цель по полю');
    expect(hint().count, 2);
    await tester.tap(find.byKey(Key('proof-cell-${order[0]}')));
    await tester.pump();
    expect(cellColor(tester, order[0]), isNot(proofHintColor), reason: 'подсказка не погасла нажатием');

    await tester.tap(find.byKey(const Key('proof-hint')));
    await tester.pump();
    expect(cellColor(tester, order[1]), proofHintColor, reason: 'вторая подсказка — следующая ненайденная');
    await tester.tap(find.byKey(const Key('proof-hint')));
    await tester.pump();
    expect(hint().count, 0);
    expect(hint().onPressed, isNull, reason: 'четвёртой подсказки быть не должно');

    await findAll(tester);
    await tester.pump();
    final d = sent.single['details'] as Map<String, dynamic>;
    expect(d['hints'], 3);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('🔴 партия уходит с полями веба: доля пропусков, задание, поле, условие уровня', (tester) async {
    await openAndStart(tester, rnd: Random(10));
    await findAll(tester);
    await tester.pump();
    final r = sent.single;
    expect(r['difficulty'], '8x8');
    expect(r['mode'], 'lvl1');
    final d = r['details'] as Map<String, dynamic>;
    final total = d['n_targets'] as int;
    expect(total, greaterThan(0));
    expect(d, containsPair('hits', total));
    expect(d, containsPair('missed', 0));
    expect(d, containsPair('proof_omission_pct', 0));
    expect(d, containsPair('accuracy', 100));
    expect(d, containsPair('task_mode', 'letters'));
    expect(d, containsPair('time_limit_sec', ProofLevel.of(1).timeLimitSec));
    for (final k in ['level', 'rows', 'cols', 'timeLimitSec', 'minFoundPct', 'errors', 'hints', 'letters_left']) {
      expect(d.containsKey(k), isTrue, reason: 'нет поля $k');
    }
    await tester.pumpWidget(const SizedBox());
  });

  test('время в шапке — правило веба hudTime', () {
    expect(hudTime(0, 's'), '0s');
    expect(hudTime(59.9, 's'), '59s');
    expect(hudTime(60, 's'), '1:00');
    expect(hudTime(3599, 's'), '59:59');
    expect(hudTime(3600, 's'), '1:00:00');
    expect(hudTime(double.nan, 's'), '0s');
    expect(hudTime(-5, 's'), '0s');
  });

  group('настройка на малых экранах', () {
    for (final lang in ['ru', 'en', 'de', 'hi', 'ar']) {
      for (final size in const [Size(320, 568), Size(360, 640), Size(390, 844)]) {
        testWidgets('$lang ${size.width.toInt()}×${size.height.toInt()}', (tester) async {
          await L.load(lang);
          tester.view.physicalSize = size * 3;
          tester.view.devicePixelRatio = 3;
          addTearDown(tester.view.reset);
          await tester.pumpWidget(MaterialApp(home: ProofreadingScreen(state: state)));
          await tester.pumpAndSettle();
          final start = tester.getRect(find.text(L.t('start')));
          expect(start.bottom, lessThanOrEqualTo(size.height), reason: '«Начать» ушла за край');
          final pick = tester.getRect(find.byKey(const Key('proof-script')));
          expect(pick.top >= 0 && pick.bottom <= start.top && pick.right <= size.width, isTrue,
              reason: 'выбор письменности за краем или под «Начать»: $pick');
        });
      }
    }
  });
}
