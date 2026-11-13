import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/drop_baskets.dart';

/// 🔴 «ПЕРЕТАЩИ В КОРЗИНУ» — ОДИН КОМПОНЕНТ КАРКАСА (`shell/drop_baskets.dart`, задача 2d300f4e).
///
/// Проба держит поведение, которое Денис принял в «Сортировке слов» после #496 и потребовал
/// у остальных игр: карточка берётся сразу (без задержки), корзина под пальцем подсвечивается,
/// отпущенная мимо карточка возвращается, тап — запасной ввод. Играют не модель, а жесты на
/// настоящих виджетах.
class _Harness extends StatefulWidget {
  const _Harness({required this.answers, this.enabled = true, this.implicit});

  final List<(int, String)> answers;
  final bool enabled;
  final int? implicit;

  @override
  State<_Harness> createState() => _HarnessState();
}

class _HarnessState extends State<_Harness> {
  /// Карточка 1 верна для корзины «a», карточка 2 — для «b».
  static const correct = {1: 'a', 2: 'b'};
  final placed = <int>{};

  bool onField(int id) => !placed.contains(id);

  @override
  Widget build(BuildContext context) => DropBasketsScope<int, String>(
    enabled: widget.enabled,
    implicitItem: widget.implicit,
    canDrop: onField,
    isLive: onField,
    isCorrect: (id, cat) => correct[id] == cat,
    onAnswer: (id, cat) {
      widget.answers.add((id, cat));
      if (correct[id] == cat) placed.add(id);
      setState(() {});
    },
    child: Column(
      children: [
        for (final id in correct.keys)
          SizedBox(
            height: 80,
            child: placed.contains(id)
                ? const SizedBox.shrink()
                : DropCard<int>(
                    key: Key('card-$id'),
                    item: id,
                    label: 'card $id',
                    builder: (context, selected) => Container(
                      width: 120,
                      height: 60,
                      color: Colors.amber,
                      child: Text(selected ? 'sel-$id' : 'card-$id'),
                    ),
                  ),
          ),
        const SizedBox(height: 120),
        Row(
          children: [
            for (final cat in ['a', 'b'])
              SizedBox(
                width: 160,
                height: 100,
                child: DropBasket<int, String>(
                  key: Key('basket-$cat'),
                  target: cat,
                  label: 'basket $cat',
                  builder: (context, highlighted) => Center(
                    child: Text(highlighted ? 'over-$cat' : 'basket-$cat'),
                  ),
                ),
              ),
          ],
        ),
      ],
    ),
  );
}

void main() {
  late List<(int, String)> answers;
  setUp(() => answers = []);

  Future<void> boot(
    WidgetTester tester, {
    bool enabled = true,
    int? implicit,
  }) async {
    tester.view.physicalSize = const Size(800, 1000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: _Harness(
            answers: answers,
            enabled: enabled,
            implicit: implicit,
          ),
        ),
      ),
    );
  }

  Offset center(WidgetTester tester, String key) =>
      tester.getCenter(find.byKey(Key(key)));

  /// Тянет карточку к точке без пауз: если бы хват требовал задержки, карточка бы не взялась.
  Future<TestGesture> dragTo(
    WidgetTester tester,
    String card,
    Offset to,
  ) async {
    final g = await tester.startGesture(center(tester, card));
    await g.moveBy(const Offset(0, 24));
    await tester.pump();
    await g.moveTo(to);
    await tester.pump();
    return g;
  }

  Color? basketColor(WidgetTester tester, String cat) {
    final box = tester.widget<AnimatedContainer>(
      find.descendant(
        of: find.byKey(Key('basket-$cat')),
        matching: find.byType(AnimatedContainer),
      ),
    );
    return (box.decoration as BoxDecoration?)?.color;
  }

  testWidgets(
    '🔴 карточка берётся сразу, без задержки, и падает в верную корзину',
    (tester) async {
      await boot(tester);
      final g = await dragTo(tester, 'card-1', center(tester, 'basket-a'));
      await g.up();
      await tester.pumpAndSettle();
      expect(answers, [(1, 'a')]);
      expect(
        find.byKey(const Key('card-1')),
        findsNothing,
        reason: 'разложенная карточка уходит с поля',
      );
    },
  );

  testWidgets('🔴 корзина под пальцем подсвечивается, при уходе гаснет', (
    tester,
  ) async {
    await boot(tester);
    expect(basketColor(tester, 'a'), Colors.transparent);
    final g = await dragTo(tester, 'card-1', center(tester, 'basket-a'));
    expect(
      find.text('over-a'),
      findsOneWidget,
      reason: 'builder получает highlighted',
    );
    expect(basketColor(tester, 'a'), isNot(Colors.transparent));
    expect(
      basketColor(tester, 'b'),
      Colors.transparent,
      reason: 'чужая корзина не светится',
    );
    await g.moveTo(const Offset(700, 500));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 200));
    expect(basketColor(tester, 'a'), Colors.transparent);
    await g.up();
    await tester.pumpAndSettle();
  });

  testWidgets(
    '🔴 неверная корзина: ответ засчитан, карточка встряхнулась и осталась выбранной',
    (tester) async {
      await boot(tester);
      final g = await dragTo(tester, 'card-1', center(tester, 'basket-b'));
      await g.up();
      await tester.pumpAndSettle();
      expect(answers, [(1, 'b')]);
      final host = tester.state<DropBasketsState<int, String>>(
        find.byType(DropBasketsScope<int, String>),
      );
      expect(
        host.selected,
        1,
        reason: 'после ошибки карточка остаётся выбранной',
      );
      expect(host.wrong, 1);
      expect(find.byKey(const Key('card-1')), findsOneWidget);
    },
  );

  testWidgets(
    '🔴 отпустил мимо корзины — не ответ и не ошибка, карточка возвращается',
    (tester) async {
      await boot(tester);
      final home = center(tester, 'card-1');
      final g = await dragTo(tester, 'card-1', const Offset(780, 20));
      await g.up();
      await tester.pumpAndSettle();
      expect(answers, isEmpty);
      expect(center(tester, 'card-1'), home);
      final host = tester.state<DropBasketsState<int, String>>(
        find.byType(DropBasketsScope<int, String>),
      );
      expect(host.dragging, isNull);
    },
  );

  testWidgets(
    '🔴 тап — запасной ввод: тап по карточке выбирает, тап по корзине кладёт',
    (tester) async {
      await boot(tester);
      await tester.tap(find.byKey(const Key('basket-a')));
      await tester.pump();
      expect(
        answers,
        isEmpty,
        reason: 'без выбранной карточки корзина не отвечает',
      );
      await tester.tap(find.byKey(const Key('card-1')));
      await tester.pump();
      expect(find.text('sel-1'), findsOneWidget);
      await tester.tap(find.byKey(const Key('basket-a')));
      await tester.pumpAndSettle();
      expect(answers, [(1, 'a')]);
    },
  );

  testWidgets(
    '🔴 у игры с одной карточкой тап по корзине кладёт её сразу (implicitItem)',
    (tester) async {
      await boot(tester, implicit: 2);
      await tester.tap(find.byKey(const Key('basket-b')));
      await tester.pumpAndSettle();
      expect(answers, [(2, 'b')]);
    },
  );

  testWidgets('два тапа по корзине в одном кадре не засчитываются дважды', (
    tester,
  ) async {
    await boot(tester);
    await tester.tap(find.byKey(const Key('card-1')));
    await tester.pump();
    final basket = find.byKey(const Key('basket-a'));
    await tester.tap(basket);
    await tester.tap(basket); // нарочно без кадра между вводами
    await tester.pumpAndSettle();
    expect(answers, [(1, 'a')]);
  });

  testWidgets(
    'вне партии (enabled: false) карточку не взять и корзина не отвечает',
    (tester) async {
      await boot(tester, enabled: false, implicit: 1);
      final g = await dragTo(tester, 'card-1', center(tester, 'basket-a'));
      await g.up();
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('basket-a')));
      await tester.pumpAndSettle();
      expect(answers, isEmpty);
    },
  );
}
