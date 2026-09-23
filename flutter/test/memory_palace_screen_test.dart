/// ПАРТИЯ «ДВОРЦА ПАМЯТИ» ИГРАЕТСЯ НАЖАТИЯМИ.
///
/// 🔴 ЧЕГО НЕ ЗНАЕТ СВЕРКА ЯДРА. `memory_palace_test` доказывает, что правила
/// повторяют веб до знака, и остаётся зелёной, даже если по экрану пройти
/// нельзя: предметы не нажимаются, ряд пуст, круг не доходит до итога. Здесь
/// проверяется ровно это — и две починки по отчётам, которые легко потерять при
/// переезде: лента предметов видна ВМЕСТЕ со сценой мест, а предмет на первых
/// трёх уровнях подписан именем.
library;

import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/memory_palace/model.dart';
import 'package:psygames_flutter/games/memory_palace/screen.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  late SharedState state;
  late MemoryPalaceContent content;

  setUpAll(() {
    content = MemoryPalaceContent.fromJsonString(
        File('assets/memory-palace.json').readAsStringSync());
  });

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
  });

  Future<void> boot(WidgetTester tester) async {
    await tester.pumpWidget(MaterialApp(home: MemoryPalaceScreen(state: state, content: content)));
    await tester.pump();
    await tester.pump();
  }

  List<ValueKey<String>> keysStarting(WidgetTester tester, String prefix) {
    final found = <ValueKey<String>>[];
    for (final widget in tester.allWidgets) {
      final key = widget.key;
      if (key is ValueKey<String> && key.value.startsWith(prefix) && !found.contains(key)) {
        found.add(key);
      }
    }
    return found;
  }

  testWidgets('🔴 круг проходится пальцем: маршрут → раскладка → изучение → опрос в обе стороны',
      (tester) async {
    await boot(tester);

    await tester.tap(find.byKey(const ValueKey('mp-start')));
    await tester.pump();
    expect(keysStarting(tester, 'locus-'), isNotEmpty, reason: 'маршрут обязан показать места');

    await tester.tap(find.byKey(const ValueKey('mp-to-place')));
    await tester.pump();

    // Раскладка: берём предмет из ленты и кладём на место.
    final items = keysStarting(tester, 'item-');
    expect(items, isNotEmpty, reason: 'лента предметов обязана быть на экране');
    final loci = keysStarting(tester, 'locus-');
    for (var i = 0; i < loci.length; i += 1) {
      await tester.tap(find.byKey(items[i]));
      await tester.pump();
      await tester.tap(find.byKey(loci[i]));
      await tester.pump();
    }

    await tester.tap(find.byKey(const ValueKey('mp-confirm')));
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('mp-to-recall')));
    await tester.pump();

    /*
     * Опрос вперёд. ⚠️ Названный предмет ГАСНЕТ и больше не нажимается — иначе
     * один и тот же ответ пошёл бы на все места. Поэтому идём по списку
     * кандидатов индексом, а не «первым попавшимся»: первый уже отвечен.
     */
    final candidates = keysStarting(tester, 'candidate-');
    expect(candidates.length, greaterThan(loci.length), reason: 'кандидатов больше, чем мест: есть чужие');
    for (var i = 0; i < loci.length; i += 1) {
      await tester.tap(find.byKey(candidates[i]));
      await tester.pump();
    }
    expect(find.byKey(const ValueKey('mp-to-reverse')), findsOneWidget,
        reason: 'после последнего места — переход к обратному порядку');
    await tester.tap(find.byKey(const ValueKey('mp-to-reverse')));
    await tester.pump();

    for (var i = 0; i < loci.length; i += 1) {
      await tester.tap(find.byKey(candidates[i]));
      await tester.pump();
    }
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('mp-again')), findsOneWidget, reason: 'круг обязан дойти до итога');
    expect(find.textContaining('score'), findsOneWidget);
  });

  testWidgets('🔴 лента предметов и сцена мест видны ОДНОВРЕМЕННО', (tester) async {
    // Жалоба afa77c5a: «бегаешь между двумя страницами целую игру».
    await tester.binding.setSurfaceSize(const Size(360, 640));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await boot(tester);
    await tester.tap(find.byKey(const ValueKey('mp-start')));
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('mp-to-place')));
    await tester.pump();

    final item = keysStarting(tester, 'item-').first;
    final locus = keysStarting(tester, 'locus-').first;
    final itemBox = tester.getRect(find.byKey(item));
    final locusBox = tester.getRect(find.byKey(locus));
    expect(itemBox.bottom, lessThanOrEqualTo(640), reason: 'лента на экране');
    expect(locusBox.bottom, lessThanOrEqualTo(640), reason: 'и место, куда класть, — тоже');
    expect(locusBox.top, greaterThan(itemBox.top), reason: 'сцена под лентой, а не на другой странице');
  });

  testWidgets('🔴 на первых уровнях предмет подписан ИМЕНЕМ, а не только фигурой', (tester) async {
    // Два отчёта NZT-48: связывал «оранжевый ромб», а спрашивали словом.
    await boot(tester);
    await tester.tap(find.byKey(const ValueKey('mp-start')));
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('mp-to-place')));
    await tester.pump();
    final session = MemoryPalaceSession.create(content, 'memory-palace-1', 1);
    final firstName = session.round.targetItems.first.title('ru');
    expect(palaceShowsItemNames(1), isTrue);
    expect(find.text(firstName), findsWidgets, reason: 'имя предмета обязано быть видно');
  });
}
