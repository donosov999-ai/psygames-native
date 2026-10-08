import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/pattern/model.dart' as pat;
import 'package:psygames_flutter/games/pattern/screen.dart';
import 'package:psygames_flutter/games/sdmt/model.dart' as sdmt;
import 'package:psygames_flutter/games/sdmt/screen.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/js_compat.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 ШАГ «ОЦЕНКИ» НЕСЁТ МЕТРИКУ ДОМЕНА (задача 0bba1aa5, родитель 177a13df).
///
/// «Оценка» (`frontend/src/services/assessment.ts`, `extractMetric`) берёт метрику из
/// `details` партии. Нативные sdmt и «Паттерны» её не писали, и домен молча получал
/// z = 0, то есть «средний» при любой игре. Проба играет партию НА ШАГЕ (`GamePreset`
/// с `wu=1`, как ставит `_openNative`) по обоим исходам — взял и не взял — и сверяет
/// число с формулой веба: sdmt — `rate_per_min` (`sdmt.tsx:262`), «Паттерны» —
/// `hit_rate` (`pattern.tsx:177`).
void main() {
  late List<Map<String, dynamic>> reports;
  var opens = 0;

  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    await L.load('ru');
  });

  setUp(() {
    reports = [];
    SessionReport.sink = (json) async => reports.add(jsonDecode(json) as Map<String, dynamic>);
    SharedPreferences.setMockInitialValues({});
  });

  tearDown(() {
    SessionReport.sink = null;
    GamePreset.clear();
  });

  group('sdmt — rate_per_min', () {
    const seconds = 10;

    /// Шаг зарядки у SDMT — классический тест, как в вебе (`sdmt.tsx:203–207`): 9 символов и
    /// без цели по попаданиям. Решение 09.09: у SDMT трудность — настройка шага, а не уровень
    /// (задача 50139f1d). Нормы домена «Оценки» посчитаны как раз под классический тест.
    const presetSymbols = 9;

    Future<void> open(WidgetTester tester, String seed) async {
      GamePreset.set({'wu': '1'});
      final state = await SharedState.open();
      await tester.pumpWidget(MaterialApp(
        home: SdmtScreen(
          key: ValueKey('sdmt${opens += 1}'),
          state: state,
          rnd: createRng(seed),
          seconds: seconds,
        ),
      ));
      await tester.pump();
      await tester.pump();
    }

    /// Цифра верного ответа — по легенде С ЭКРАНА, как у человека.
    int rightDigit(WidgetTester tester, int count) {
      final stim = tester
          .widget<Icon>(find.descendant(of: find.byKey(const Key('стимул')), matching: find.byType(Icon)))
          .icon;
      for (var i = 0; i < count; i += 1) {
        final cell = find.byKey(Key('легенда$i'));
        final icon = tester.widget<Icon>(find.descendant(of: cell, matching: find.byType(Icon))).icon;
        if (icon == stim) {
          return int.parse(tester.widget<Text>(find.descendant(of: cell, matching: find.byType(Text))).data!);
        }
      }
      throw StateError('стимула нет в легенде');
    }

    Future<Map<String, dynamic>> play(WidgetTester tester, {required int right, required int wrong}) async {
      for (var i = 0; i < right; i += 1) {
        await tester.tap(find.byKey(Key('цифра${rightDigit(tester, presetSymbols)}')));
        await tester.pump();
      }
      for (var i = 0; i < wrong; i += 1) {
        final r = rightDigit(tester, presetSymbols);
        await tester.tap(find.byKey(Key('цифра${r == 1 ? 2 : 1}')));
        await tester.pump();
      }
      // Время шага кончается само: тикер по 100 мс.
      await tester.pump(const Duration(seconds: seconds + 1));
      await tester.pump();
      expect(reports, hasLength(1), reason: 'партия шага не ушла в отчёт');
      expect(reports.single['game_type'], 'sdmt');
      return (reports.single['details'] as Map).cast<String, dynamic>();
    }

    testWidgets('🔴 взял шаг — в details rate_per_min по формуле веба', (tester) async {
      await open(tester, 'метрика-взял');
      const right = 6;
      final d = await play(tester, right: right, wrong: 0);
      expect(d['rate_per_min'], (right / seconds * 60).round(),
          reason: 'верных в минуту = верные / секунды шага × 60');
      expect(d['hits'], right);
      expect(d['accuracy'], 100);
      expect(d['target_hits'], 0, reason: 'у шага зарядки цели нет — как веб');
      expect(d['n_symbols'], presetSymbols, reason: 'шаг — классический тест на 9 символов');
      expect(presetSymbols, isNot(sdmt.levelParams(1).symbolCount),
          reason: 'иначе проба не отличила бы шаг от первого уровня');
    });

    testWidgets('🔴 не взял шаг — метрика уходит и с провалом', (tester) async {
      await open(tester, 'метрика-мимо');
      final d = await play(tester, right: 3, wrong: 1);
      expect(d['rate_per_min'], (3 / seconds * 60).round());
      expect(d['hits'], 3);
      expect(d['accuracy'], 75);
    });
  });

  group('«Паттерны» — hit_rate', () {
    const trials = 5;

    Future<void> open(WidgetTester tester, String seed) async {
      GamePreset.set({'wu': '1', 'trials': '$trials'});
      final state = await SharedState.open();
      await tester.pumpWidget(MaterialApp(
        home: PatternScreen(key: ValueKey('pattern${opens += 1}'), state: state, rnd: createRng(seed)),
      ));
      await tester.pump();
      await tester.pump();
    }

    /// Играет [trials] проб: первые [right] — верно, остальные — мимо. Ряд и кнопки —
    /// тем же генератором и зерном, что у экрана.
    Future<Map<String, dynamic>> play(WidgetTester tester, String seed, {required int right}) async {
      final rng = createRng(seed);
      for (var i = 0; i < trials; i += 1) {
        final seq = pat.makeSequence(1, rng);
        final opts = pat.makeOptions(seq.answer, rng);
        final pick = i < right ? seq.answer : opts.firstWhere((o) => o != seq.answer);
        await tester.tap(find.byKey(Key('ответ$pick')));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 800));
      }
      await tester.pump();
      expect(reports, hasLength(1), reason: 'партия шага не ушла в отчёт');
      expect(reports.single['game_type'], 'pattern');
      return (reports.single['details'] as Map).cast<String, dynamic>();
    }

    testWidgets('🔴 взял шаг — в details hit_rate = доля верных', (tester) async {
      await open(tester, 'паттерн-взял');
      final d = await play(tester, 'паттерн-взял', right: 4);
      expect(4 / trials >= pat.passHitRate, isTrue, reason: 'проба задумана как взятый шаг');
      expect(d['hit_rate'], 0.8, reason: 'доля, а не сырые попадания: 4 из 5');
      expect(d['hits'], 4);
      expect(d['trials'], trials);
      expect(d['errors'], 1);
    });

    testWidgets('🔴 не взял шаг — метрика уходит и с провалом', (tester) async {
      await open(tester, 'паттерн-мимо');
      final d = await play(tester, 'паттерн-мимо', right: 2);
      expect(d['hit_rate'], 0.4);
      expect(d['hits'], 2);
      expect(d['hint_used'], false);
    });
  });
}
