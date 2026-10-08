import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/game_shell.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/level_rules.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 ПРАВИЛО УРОВНЯ ОБЪЯВЛЯЕТСЯ ДО ПАРТИИ — ОДИН РАЗ И НЕ ПОВЕРХ ИДУЩЕЙ ПАРТИИ.
///
/// Задача e371fd3a (30.09.2026): у 16 перенесённых игр 56 механик включались молча.
/// Пробы смотрят поведение каркаса, а не наличие ключей: карточка открывается сама в
/// спокойный момент, молчит во время партии, второй раз не всплывает, а флаг «видел»
/// ложится в тот же ключ, что у веб-версии, — иначе половины показывали бы правило дважды.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('таблица из настоящего ассета', () {
    setUpAll(() async {
      LevelRules.debugSetTable(null);
      await LevelRules.load();
    });

    test('Корси: до 10-го правила нет, с 10-го — обратный порядок, с 15-го — удержание', () {
      expect(LevelRules.activeKey('corsi', 9), isNull);
      expect(LevelRules.activeKey('corsi', 10), 'reverse');
      expect(LevelRules.activeKey('corsi', 14), 'reverse');
      expect(LevelRules.activeKey('corsi', 15), 'hold');
      expect(LevelRules.activeKey('corsi', 399), 'hold', reason: 'последний отрезок открыт');
    });

    test('у всех 16 перенесённых игр с правилами таблица есть, всего 57 правил', () {
      const ported = [
        'goods_sort', 'math_sprint', 'mahjong', 'water_sort', 'memory_matrix', 'cpt',
        'digit_span', 'spatial_span', 'corsi', 'hanoi', 'stroop', 'word_pairs',
        'cake_sort', 'mental_rotation', 'ospan', 'switching_task',
      ];
      final keys = <String>{};
      for (final id in ported) {
        for (var level = 1; level <= 400; level++) {
          final k = LevelRules.activeKey(id, level);
          if (k != null) keys.add('$id/$k');
        }
      }
      // 57 = 56 + «время на доску» маджонга с 29-го (02.10.2026, задача 7f81fbc6).
      expect(keys.length, 57);
    });
  });

  group('карточка в каркасе', () {
    late SharedState state;

    setUp(() async {
      SharedPreferences.setMockInitialValues({});
      state = await SharedState.open();
      L.useForTest('ru', {
        'lr_corsi_reverse_title': 'Обратный порядок',
        'lr_corsi_reverse_rule': 'Повторяй ряд с конца.',
        'lr_corsi_reverse_example': 'Показали 1-2-3 — жми 3-2-1.',
        'ctaGotIt': 'Понятно',
      });
      LevelRules.debugSetTable({
        'corsi': [
          [1, 9, null],
          [10, null, 'reverse'],
        ],
      });
    });
    tearDown(() => LevelRules.debugSetTable(null));

    Widget shell(int level, {required bool calm}) => MaterialApp(
          home: GameShell(
            title: 'Корси',
            field: (_, _) => const SizedBox.expand(),
            levelRule: LevelRuleSpot(gameId: 'corsi', level: level, state: state, calm: calm),
          ),
        );

    testWidgets('🔴 на уровне с правилом в спокойный момент карточка открывается сама — и только раз',
        (tester) async {
      await tester.pumpWidget(shell(10, calm: true));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('level-rule-card')), findsOneWidget);
      expect(find.text('Повторяй ряд с конца.'), findsOneWidget);
      expect(find.text('Показали 1-2-3 — жми 3-2-1.'), findsOneWidget, reason: 'пример — часть объяснения');
      expect(state.get('psygames_rulehint_corsi_reverse'), '1', reason: 'флаг — тот же ключ, что у веба');

      await tester.tap(find.byKey(const Key('level-rule-ok')));
      await tester.pumpAndSettle();
      await tester.pumpWidget(shell(11, calm: true));   // следующий уровень, то же правило
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('level-rule-card')), findsNothing, reason: 'второй раз не всплывает');
    });

    testWidgets('🔴 во время партии карточка молчит и открывается, когда партия кончилась', (tester) async {
      await tester.pumpWidget(shell(10, calm: false));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('level-rule-card')), findsNothing, reason: 'не поверх идущей партии');
      expect(state.get('psygames_rulehint_corsi_reverse'), isNull, reason: 'не показали — не видел');

      await tester.pumpWidget(shell(10, calm: true));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('level-rule-card')), findsOneWidget);
    });

    testWidgets('видел в вебе — во Flutter не всплывает, но значок в шапке открывает', (tester) async {
      await state.set('psygames_rulehint_corsi_reverse', '1');
      await tester.pumpWidget(shell(10, calm: true));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('level-rule-card')), findsNothing);

      await tester.tap(find.byKey(const Key('game-level-rule')));
      await tester.pumpAndSettle();
      expect(find.text('Обратный порядок'), findsWidgets);
    });

    testWidgets('на уровне без правила — ни карточки, ни значка', (tester) async {
      await tester.pumpWidget(shell(5, calm: true));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('level-rule-card')), findsNothing);
      expect(find.byKey(const Key('game-level-rule')), findsNothing);
    });
  });
}
