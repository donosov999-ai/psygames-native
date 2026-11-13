import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/kids_sort/model.dart';
import 'package:psygames_flutter/games/kids_sort/screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/lesson.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 «ЦВЕТА И ФОРМЫ»: КАРТОЧКУ ПЕРЕТАСКИВАЮТ В КОРОБКУ — РЕЖИМ ПО УМОЛЧАНИЮ (задача 2d300f4e).
///
/// Решение Дениса 13.11.2026: в «Сортировке слов» перетаскивание в корзины работает хорошо, а
/// похожая игра сделана тапами. Теперь «Цвета и формы» берут общий `shell/drop_baskets.dart`;
/// «Нажимать» остаётся вторым режимом, выбор в паузе запоминается. Играют жестами на экране.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async => L.load('ru'));
  tearDown(LessonUsed.reset);

  const seed = 11;
  const profile = 'kids';

  Future<SharedState> freshState({Map<String, Object> extra = const {}}) async {
    SharedPreferences.setMockInitialValues({
      'psygames_active_profile': profile,
      'psygames_rulehint_kids_sort_switches': '1',
      ...extra,
    });
    return SharedState.open();
  }

  Future<void> settle(WidgetTester tester) async {
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
  }

  Future<void> boot(WidgetTester tester, SharedState state) async {
    tester.view.physicalSize = const Size(780, 1688);
    tester.view.devicePixelRatio = 2;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      MaterialApp(
        home: KidsSortScreen(state: state, seed: seed),
      ),
    );
    await settle(tester);
  }

  /// Первая карточка той же раздачи, что у экрана (то же зерно): ответ по цвету — первая фаза.
  KidsCard firstCard() => KidsSortSession(
    Random(seed),
    nCards: kidsCardsFor(1),
    phases: kidsPhasesFor(1),
  ).phases.first.cards.first;
  int rightBox() => kidsTargets.indexWhere((t) => t.color == firstCard().color);

  Future<TestGesture> dragCardTo(WidgetTester tester, Offset to) async {
    final g = await tester.startGesture(
      tester.getCenter(find.byKey(const ValueKey('ks-card'))),
    );
    await g.moveBy(const Offset(0, 24));
    await tester.pump();
    await g.moveTo(to);
    await tester.pump();
    return g;
  }

  Offset box(WidgetTester tester, int i) =>
      tester.getCenter(find.byKey(ValueKey('ks-box-$i')));

  testWidgets(
    '🔴 по умолчанию — перетаскивание: карточку можно взять без всякого выбора режима',
    (tester) async {
      final state = await freshState();
      expect(kidsDragMode(state), isTrue, reason: 'умолчание — перетаскивать');
      await boot(tester, state);
      expect(find.byType(Draggable<int>), findsOneWidget);
      expect(
        state.get(kidsInputKey(state)),
        isNull,
        reason: 'умолчание не пишется в память без выбора человека',
      );
    },
  );

  testWidgets('🔴 перетащил в верную коробку — ✓, в неверную — ✗', (
    tester,
  ) async {
    final state = await freshState();
    await boot(tester, state);
    var g = await dragCardTo(tester, box(tester, rightBox()));
    await g.up();
    await tester.pump();
    expect(find.byKey(const ValueKey('ks-feedback-ok')), findsOneWidget);
    await tester.pump(const Duration(seconds: 1));

    // Вторая карточка: кладём в заведомо неверную коробку. Ответ по цвету первой фазы.
    final second = KidsSortSession(
      Random(seed),
      nCards: kidsCardsFor(1),
      phases: kidsPhasesFor(1),
    ).phases.first.cards[1];
    final wrong = 1 - kidsTargets.indexWhere((t) => t.color == second.color);
    g = await dragCardTo(tester, box(tester, wrong));
    await g.up();
    await tester.pump();
    expect(find.byKey(const ValueKey('ks-feedback-no')), findsOneWidget);
    await tester.pump(const Duration(seconds: 1));
  });

  testWidgets(
    '🔴 отпустил мимо коробок — не ответ: счёт карточек тот же, карточка на месте',
    (tester) async {
      final state = await freshState();
      await boot(tester, state);
      final home = tester.getCenter(find.byKey(const ValueKey('ks-card')));
      final g = await dragCardTo(tester, const Offset(40, 40));
      await g.up();
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('ks-feedback-ok')), findsNothing);
      expect(find.byKey(const ValueKey('ks-feedback-no')), findsNothing);
      expect(tester.getCenter(find.byKey(const ValueKey('ks-card'))), home);
    },
  );

  testWidgets(
    '🔴 тап по коробке в режиме перетаскивания — запасной ввод, карточка кладётся сразу',
    (tester) async {
      final state = await freshState();
      await boot(tester, state);
      await tester.tap(find.byKey(ValueKey('ks-box-${rightBox()}')));
      await tester.pump();
      expect(find.byKey(const ValueKey('ks-feedback-ok')), findsOneWidget);
      await tester.pump(const Duration(seconds: 1));
    },
  );

  testWidgets(
    '🔴 пауза: «Нажимать» убирает перетаскивание и запоминается, «Перетаскивать» возвращает',
    (tester) async {
      final state = await freshState();
      await boot(tester, state);
      await tester.tap(find.byIcon(Icons.pause).first);
      await tester.pumpAndSettle();
      expect(find.text(L.t('dropModeDrag')), findsOneWidget);
      await tester.tap(find.text(L.t('dropModeTap')));
      await tester.pumpAndSettle();
      expect(state.get(kidsInputKey(state)), 'tap');
      expect(
        find.byType(Draggable<int>),
        findsNothing,
        reason: 'в режиме «Нажимать» карточка не тянется',
      );
      // Тап по коробке отвечает и в этом режиме.
      await tester.tap(find.byKey(ValueKey('ks-box-${rightBox()}')));
      await tester.pump();
      expect(find.byKey(const ValueKey('ks-feedback-ok')), findsOneWidget);
      await tester.pump(const Duration(seconds: 1));

      // Новый экран с той же памятью открывается в выбранном режиме.
      await tester.pumpWidget(const SizedBox.shrink());
      await boot(tester, state);
      expect(find.byType(Draggable<int>), findsNothing);

      await tester.tap(find.byIcon(Icons.pause).first);
      await tester.pumpAndSettle();
      await tester.tap(find.text(L.t('dropModeDrag')));
      await tester.pumpAndSettle();
      expect(state.get(kidsInputKey(state)), 'drag');
      expect(find.byType(Draggable<int>), findsOneWidget);
    },
  );

  testWidgets('выбор режима у каждого профиля свой', (tester) async {
    final state = await freshState(
      extra: {'psygames_kids_sort_input_kids': 'tap'},
    );
    expect(kidsDragMode(state), isFalse);
    await state.set('${SharedState.prefix}active_profile', 'nzt48');
    expect(
      kidsDragMode(state),
      isTrue,
      reason: 'другой профиль остаётся на умолчании',
    );
  });
}
