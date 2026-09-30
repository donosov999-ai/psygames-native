/// ПАРТИЯ «ЛИЦ И ИМЁН» ИГРАЕТСЯ НАЖАТИЯМИ, А НЕ ВЫЗОВОМ ПРАВИЛ.
///
/// 🔴 ПОЧЕМУ ЭТОГО НЕ ЗАМЕНЯЕТ СВЕРКА ЯДРА. `faces_names_test` доказывает, что
/// правила повторяют веб до знака, — и остаётся зелёной, даже если экран не
/// показывает ни одного варианта, кладёт ответ мимо ряда или не доводит круг до
/// итога. Здесь проверяется ровно то, чего ядро не знает: что круг ПРОХОДИМ
/// пальцем от первого нажатия до счёта.
library;

import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/faces_names/model.dart';
import 'package:psygames_flutter/games/faces_names/screen.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  late SharedState state;
  late FacesNamesLibrary lib;

  setUpAll(() {
    lib = FacesNamesLibrary.fromJsonString(File('assets/faces-names.json').readAsStringSync());
  });

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
  });

  Future<void> boot(WidgetTester tester) async {
    await tester.pumpWidget(MaterialApp(home: FacesNamesScreen(state: state, library: lib)));
    await tester.pump();
    await tester.pump();
  }

  /// Первый уровень: двое людей, одна помеха, факты ещё не спрашиваются.
  testWidgets('🔴 круг проходится пальцем: показ → помеха → лицо → имя → счёт', (tester) async {
    await boot(tester);
    expect(find.text('Лица и имена'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('fn-start')));
    await tester.pump();

    // Показ: у каждого человека своя карточка, дальше двигает кнопка ряда.
    var guard = 0;
    while (find.byKey(const ValueKey('fn-next')).evaluate().isNotEmpty && guard < 20) {
      guard += 1;
      await tester.tap(find.byKey(const ValueKey('fn-next')));
      await tester.pump();
    }
    expect(guard, greaterThan(1), reason: 'на первом уровне запоминают двоих');

    // Помеха: счёт стоит между показом и вопросом не для красоты.
    expect(find.textContaining('+'), findsWidgets, reason: 'помеха обязана быть показана');
    guard = 0;
    while (find.byKey(const ValueKey('sum-3')).evaluate().isNotEmpty ||
        _anySum(tester) != null) {
      guard += 1;
      if (guard > 20) break;
      final key = _anySum(tester);
      if (key == null) break;
      await tester.tap(find.byKey(key));
      await tester.pump();
    }

    // Вопросы: лицо в поле, имя — в ряду под полем.
    guard = 0;
    while (find.byKey(const ValueKey('fn-again')).evaluate().isEmpty && guard < 40) {
      guard += 1;
      final face = _anyKeyStarting(tester, 'face-');
      if (face != null) {
        await tester.tap(find.byKey(face));
        await tester.pump();
        continue;
      }
      final name = _anyKeyStarting(tester, 'name-');
      if (name != null) {
        await tester.tap(find.byKey(name));
        await tester.pump();
        continue;
      }
      final fact = _anyKeyStarting(tester, 'fact-');
      if (fact != null) {
        await tester.tap(find.byKey(fact));
        await tester.pump();
        continue;
      }
      break;
    }

    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('fn-again')), findsOneWidget, reason: 'круг обязан дойти до итога');
    /*
     * ⚠️ ИТОГ ПРОВЕРЯЕТСЯ ПО ЧИСЛАМ, А НЕ ПО РУССКОМУ СЛОВУ. Подписи приходят из
     * словаря игры, а в пробе словарь не загружен: `L.t` отдаёт сам ключ. Ждать
     * здесь «Счёт:» значит проверять язык, а не то, что итог показан.
     */
    expect(find.textContaining('/'), findsWidgets, reason: 'итог показывает счёт по каждой части');
    expect(find.textContaining('score'), findsOneWidget, reason: 'и общий счёт');
  });

  testWidgets('🔴 на вопросе про лицо вариантов НЕ МЕНЬШЕ двух', (tester) async {
    await boot(tester);
    await tester.tap(find.byKey(const ValueKey('fn-start')));
    await tester.pump();
    while (find.byKey(const ValueKey('fn-next')).evaluate().isNotEmpty) {
      await tester.tap(find.byKey(const ValueKey('fn-next')));
      await tester.pump();
    }
    var guard = 0;
    while (_anySum(tester) != null && guard < 20) {
      guard += 1;
      await tester.tap(find.byKey(_anySum(tester)!));
      await tester.pump();
    }
    final faces = _keysStarting(tester, 'face-');
    expect(faces.length, greaterThanOrEqualTo(2),
        reason: 'выбор из одного варианта — не задание на узнавание');
  });
}

/// Любая кнопка помехи, какой бы ни выпала сумма.
ValueKey<String>? _anySum(WidgetTester tester) => _anyKeyStarting(tester, 'sum-');

/// ⚠️ `find.byType(Widget)` не перечисляет дерево: Widget — абстрактный тип, и
/// поиск по нему отдаёт пусто. Живое дерево даёт `tester.allWidgets`.
List<ValueKey<String>> _keysStarting(WidgetTester tester, String prefix) {
  final found = <ValueKey<String>>[];
  for (final widget in tester.allWidgets) {
    final key = widget.key;
    if (key is ValueKey<String> && key.value.startsWith(prefix) && !found.contains(key)) {
      found.add(key);
    }
  }
  return found;
}

ValueKey<String>? _anyKeyStarting(WidgetTester tester, String prefix) {
  final keys = _keysStarting(tester, prefix);
  return keys.isEmpty ? null : keys.first;
}
