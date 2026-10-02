import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/spatial_lab/deal.dart';
import 'package:psygames_flutter/games/spatial_lab/screen.dart';
import 'package:psygames_flutter/games/spatial_lab/twiddle.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// У КАЖДОГО УПРАЖНЕНИЯ ЛАБОРАТОРИИ — СВОИ ПРАВИЛА, И НА ЯЗЫКЕ ЧЕЛОВЕКА.
///
/// 📍 Задача 848da95d (аудит справки 26.09.2026): «каждый режим показывает свою справку; тест
/// открывает оба маршрута и различает тексты; generic fallback не маскирует отсутствие ключа».
///
/// 🔴 ЧТО ПРОВЕРЯЕТСЯ ИМЕННО ЗДЕСЬ, А НЕ В ВЕБЕ. С выпуска 2.56.0 «Лаборатория» открывается
/// НАТИВНО: `/games/spatial-lab` и все его `?mode=` перехватывает `hybrid_app.dart`, и веб-оверлей
/// справки для этого маршрута человек больше не видит. Нативные правила уже различали режимы,
/// но были зашиты по-русски — на любом другом из двенадцати языков открывались на русском.
///
/// ⚠️ ЧЕГО ЭТА ПРОБА БОИТСЯ БОЛЬШЕ ВСЕГО — ГОЛОГО КЛЮЧА. `L.t` на промахе возвращает сам ключ,
/// и проба, сверяющая «показано == L.t(ключ)», позеленеет на `spatialLabRulesNet` вместо
/// правил: обе стороны вернут одно и то же. Поэтому текст сверяется с ДОСЛОВНЫМ началом из
/// словаря и отдельно проверяется, что он не похож на ключ.
void main() {
  late SharedState state;
  late LabBanks banks;

  setUpAll(() {
    banks = LabBanks(
      twiddle: BankEntry.parse(
        jsonDecode(File('assets/spatial/twiddle-bank.json').readAsStringSync()) as List,
      ),
      sixteen: BankEntry.parse(
        jsonDecode(File('assets/spatial/sixteen-bank.json').readAsStringSync()) as List,
      ),
    );
  });

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
  });

  /// ⚠️ Словарь грузится через `tester.runAsync`: внутри теста виджетов часы поддельные, а
  /// чтение ассета большого словаря уходит мимо них — голый `L.load('de')` висел, пока прогон
  /// не снимали вручную (первые две редакции пробы, 30.09.2026).
  ///
  /// Открыть партию упражнения и вернуть текст его правил.
  Future<String> rulesOf(WidgetTester tester, LabMode mode) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    /*
     * ⚠️ СНАЧАЛА ПУСТОЕ ДЕРЕВО. Без него второй вызов в том же тесте получал СТАРЫЙ экран:
     * виджет того же типа на том же месте Flutter не пересоздаёт, а переиспользует его
     * состояние, и экран оставался в партии — выбора упражнений на нём уже не было.
     */
    await tester.pumpWidget(const SizedBox());
    await tester.pumpWidget(MaterialApp(
      home: SpatialLabScreen(key: ValueKey(mode), state: state, seed: 42, banks: banks),
    ));
    await tester.pump();
    await tester.pump();
    if (mode != LabMode.twiddle) {
      await tester.tap(find.byKey(Key('упражнение-${mode.name}')));
      await tester.pump();
    }
    await tester.tap(find.byKey(const Key('свободная-игра')));
    await tester.pump();
    await tester.tap(find.byTooltip(L.t('btn_rules')));
    // ⚠️ НЕ `pumpAndSettle`: на экране партии есть анимация, которая не кончается, и ожидание
    // «пока всё успокоится» висит вечно — первая редакция пробы простояла так десять минут.
    // Диалогу хватает ограниченного шага.
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    final text = (find.byKey(const Key('правила-текст')).evaluate().single.widget as Text).data!;
    await tester.tap(find.byType(TextButton).last);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    return text;
  }

  /// Дословное начало правил в словаре на языке пробы — не через тот же `L.t`, что экран.
  const ruStart = {
    LabMode.net: 'Нажми трубу, чтобы выбрать её',
    LabMode.twiddle: 'Нажми клетку — выберется блок 2×2',
    LabMode.sixteen: 'Нажми клетку — выделятся её строка и столбец',
    LabMode.netslide: 'Трубы здесь не поворачиваются',
  };
  const deStart = {
    LabMode.net: 'Tippe auf ein Rohr',
    LabMode.twiddle: 'Tippe auf ein Feld, um den 2×2-Block',
    LabMode.sixteen: 'Tippe auf ein Feld, um seine Zeile und Spalte',
    LabMode.netslide: 'Hier drehen sich die Rohre nicht',
  };

  testWidgets('🔴 по-русски: у каждого упражнения свои правила, и это не голый ключ', (tester) async {
    await tester.runAsync(() => L.load('ru'));
    final seen = <String>{};
    for (final mode in LabMode.values) {
      final text = await rulesOf(tester, mode);
      expect(text, startsWith(ruStart[mode]!), reason: '${mode.name}: не те правила');
      expect(text, isNot(startsWith('spatialLab')), reason: '${mode.name}: показан ключ вместо текста');
      seen.add(text);
    }
    expect(seen.length, LabMode.values.length, reason: 'правила двух упражнений совпали');
  });

  testWidgets('🔴 по-немецки — немецкие правила, а не русские', (tester) async {
    // Ради этой проверки всё и затевалось: до правки текст был зашит, и немец читал по-русски.
    await tester.runAsync(() => L.load('de'));
    for (final mode in LabMode.values) {
      final text = await rulesOf(tester, mode);
      expect(text, startsWith(deStart[mode]!), reason: '${mode.name}: не немецкие правила');
    }
    await tester.runAsync(() => L.load('ru'));
  });

  testWidgets('🔴 правила говорят о двойном нажатии там, где оно есть, и молчат, где его нет', (tester) async {
    // Текст правил обязан совпадать с тем, что экран УМЕЕТ: двойное нажатие вернули 30.09
    // (коммит fa55a8e8), и у сдвигов его нет намеренно.
    await tester.runAsync(() => L.load('ru'));
    expect(await rulesOf(tester, LabMode.net), contains('двойным нажатием'));
    expect(await rulesOf(tester, LabMode.twiddle), contains('двойное нажатие'));
    expect(await rulesOf(tester, LabMode.sixteen), isNot(contains('двойн')));
    expect(await rulesOf(tester, LabMode.netslide), isNot(contains('двойн')));
  });
}
