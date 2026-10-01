import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/mahjong/screen.dart';
import 'package:psygames_flutter/games/math_slider/screen.dart';
import 'package:psygames_flutter/games/math_sprint/screen.dart';
import 'package:psygames_flutter/games/number_bonds/screen.dart';
import 'package:psygames_flutter/games/object_tracker/screen.dart';
import 'package:psygames_flutter/games/ospan/screen.dart';
import 'package:psygames_flutter/games/pattern/screen.dart';
import 'package:psygames_flutter/games/quick_count/screen.dart';
import 'package:psygames_flutter/games/schulte/screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 НА АНГЛИЙСКОМ ТЕЛЕФОНЕ ЭКРАНЫ «ПОИСКА» И «СЧЁТА» ГОВОРЯТ ПО-АНГЛИЙСКИ (задача 4b6f863e).
///
/// Решение Дениса 01.10.2026: основной язык — английский. До перевода эти девять экранов
/// показывали англоязычному человеку русские подписи. Храповик `ui_text_debt` считает
/// литералы в исходнике, а эта проба смотрит на ЭКРАН: открывает каждый с английским
/// словарём и английским языком профиля и ищет кириллицу во всех надписях и во всех
/// подписях для экранного диктора. Так ловится и то, чего счёт литералов не видит:
/// русский набор букв, который игра выбрала не по языку, и текст, собранный из данных.
void main() {
  final cyrillic = RegExp('[А-Яа-яЁё]');
  final decimalComma = RegExp(r'\d,\d');

  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    await L.load('en');
  });

  final screens = <String, Widget Function(SharedState)>{
    'math_sprint': (s) => MathSprintScreen(state: s),
    'quick_count': (s) => QuickCountScreen(state: s),
    'number_bonds': (s) => NumberBondsScreen(state: s),
    'mahjong': (s) => MahjongScreen(state: s),
    'ospan': (s) => OspanScreen(state: s),
    'object_tracker': (s) => ObjectTrackerScreen(state: s),
    'schulte': (s) => SchulteScreen(state: s),
    'math_slider': (s) => MathSliderScreen(state: s),
    'pattern': (s) => PatternScreen(state: s),
  };

  for (final entry in screens.entries) {
    testWidgets('🔴 ${entry.key}: на английском ни одной кириллической буквы', (tester) async {
      SharedPreferences.setMockInitialValues({'${SharedState.prefix}language': 'en'});
      final state = await SharedState.open();
      // Маджонг читает раскладки с диска — ждём по-настоящему, как в его собственной пробе.
      await tester.runAsync(() async {
        await tester.pumpWidget(MaterialApp(home: entry.value(state)));
        for (var i = 0; i < 40; i += 1) {
          await tester.pump(const Duration(milliseconds: 50));
          await Future<void>.delayed(const Duration(milliseconds: 20));
          if (find.byType(CircularProgressIndicator).evaluate().isEmpty) break;
        }
      });
      await tester.pump();
      expect(find.byType(CircularProgressIndicator), findsNothing, reason: 'экран не поднялся');

      final shown = <String>[
        for (final t in tester.widgetList<Text>(find.byType(Text)))
          t.data ?? t.textSpan?.toPlainText() ?? '',
        for (final s in tester.widgetList<Semantics>(find.byType(Semantics)))
          if (s.properties.label != null) s.properties.label!,
      ];
      expect(shown, isNotEmpty, reason: 'на экране нечего читать — проба смотрит не туда');
      final russian = shown.where(cyrillic.hasMatch).toSet().toList();
      expect(russian, isEmpty,
          reason: '${entry.key} на английском показывает русский текст: $russian');
      // Русская запятая в дроби — тоже русский текст, только кириллицы в ней нет. Снимок эмулятора
      // 02.10.2026: шкала «Математической шкалы» шла «6,25 · 12,5 · 18,75» при английском языке.
      final commaFractions = shown.where(decimalComma.hasMatch).toSet().toList();
      expect(commaFractions, isEmpty,
          reason: '${entry.key} на английском пишет дроби через запятую: $commaFractions');
    });
  }
}
