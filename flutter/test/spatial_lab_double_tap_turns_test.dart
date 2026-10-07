import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/spatial_lab/deal.dart';
import 'package:psygames_flutter/games/spatial_lab/screen.dart';
import 'package:psygames_flutter/games/spatial_lab/twiddle.dart';
import 'package:psygames_flutter/shell/aux_action.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ДВОЙНОЕ НАЖАТИЕ ПО ТРУБЕ ИЛИ КЛЕТКЕ ПОВОРАЧИВАЕТ ПО ЧАСОВОЙ — И НА FLUTTER ТОЖЕ.
///
/// 📍 Отчёт Дениса 60913453 («Сеть труб»): «по двойному нажатию вращение, чтобы шло тоже».
/// Веб сделал это 17.09.2026 (задача f3fae4e2, `SpatialLab.tsx`, порог `ДВОЙНОЕ_НАЖАТИЕ_МС`).
///
/// 🔴 ПОЧЕМУ ПРОБА ПОЯВИЛАСЬ ТОЛЬКО 30.09. Перенос экрана на Flutter 23.09 (мой) функцию ПОТЕРЯЛ:
/// он переносил правила игры и сверял их с эталоном, а двойное нажатие — это не правило, а
/// способ ввода, и в эталон оно не попадает. С выпуска 2.56.0 «Лаборатория» открывается
/// нативно, и у людей пропало то, что они просили и уже получили. Ни одна проба этого не
/// увидела: пробы правил зелены, потому что правила целы.
///
/// ⚠️ ЧТО ИМЕННО СТОРОЖИТСЯ — ХОД, А НЕ ВЫБОР. Признак хода — кнопка «Отменить»: экран включает
/// её, только когда в истории партии есть ход (`past.isEmpty ? null`). Одиночное нажатие меняет
/// выбор, но хода не делает, — и это тоже проверяется.
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
    await L.load('ru');
  });

  /// Управляемые часы: проба двигает время сама и мерит порог точно, без настоящих пауз.
  var clock = DateTime(2026, 9, 30, 12);

  Future<void> start(WidgetTester tester, LabMode mode) async {
    clock = DateTime(2026, 9, 30, 12);
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(MaterialApp(
      home: SpatialLabScreen(state: state, seed: 42, banks: banks, now: () => clock),
    ));
    await tester.pump();
    await tester.pump();
    if (mode != LabMode.twiddle) {
      await tester.tap(find.byKey(Key('упражнение-${mode.name}')));
      await tester.pump();
    }
    await tester.tap(find.byKey(const Key('свободная-игра')));
    await tester.pump();
  }

  /// Нажать клетку через `ms` миллисекунд после предыдущего нажатия.
  Future<void> tapCell(WidgetTester tester, int cell, {int ms = 0}) async {
    clock = clock.add(Duration(milliseconds: ms));
    await tester.tap(find.byKey(Key('клетка$cell')));
    await tester.pump();
  }

  /// Был ли в партии ход: «Отменить» включена только при непустой истории.
  bool moved(WidgetTester tester) {
    final undo = tester.widget<AuxAction>(
      find.byWidgetPredicate((w) => w is AuxAction && w.label == L.t('btn_undo')),
    );
    return undo.onPressed != null;
  }

  testWidgets('🔴 «Сеть труб»: два быстрых нажатия по трубе — поворот', (tester) async {
    await start(tester, LabMode.net);
    await tapCell(tester, 4);
    expect(moved(tester), isFalse, reason: 'одиночное нажатие только выбирает трубу');
    await tapCell(tester, 4, ms: 200);
    expect(moved(tester), isTrue, reason: 'второе нажатие за 200 мс обязано повернуть');
  });

  testWidgets('🔴 «Поворот чисел»: второе нажатие по ЛЮБОЙ клетке того же блока — поворот', (tester) async {
    await start(tester, LabMode.twiddle);
    /*
     * Блок выбирается ПРИЖИМОМ к краю: нажатая клетка становится левым верхним углом блока, а
     * если это последняя строка или столбец — угол сдвигается внутрь. Поэтому одну цель у двух
     * РАЗНЫХ клеток дают ровно угловые (n−2, n−2) и (n−1, n−1).
     * ⚠️ Первая редакция пробы считала поле 3×3 и брала клетки 4 и 8 — на настоящем поле это
     * РАЗНЫЕ блоки, и красной была проба, а не код. Размер поля теперь считается по клеткам.
     */
    var cells = 0;
    while (find.byKey(Key('клетка$cells')).evaluate().isNotEmpty) {
      cells++;
    }
    final n = _sqrt(cells);
    final inner = (n - 2) * n + (n - 2), corner = (n - 1) * n + (n - 1);
    await tapCell(tester, inner);
    expect(moved(tester), isFalse);
    await tapCell(tester, corner, ms: 150);
    expect(moved(tester), isTrue, reason: 'поле $n×$n: клетки $inner и $corner — один блок 2×2');
  });

  testWidgets('🔴 порог — ЧИСЛО ВЕБА, а не своё: 300 мс ещё поворот', (tester) async {
    /*
     * ⚠️ ПОЧЕМУ ЗДЕСЬ ЛИТЕРАЛ, А НЕ `labDoubleTapMs`. Первая редакция мерила порог самой
     * константой из кода — и мутация «порог 200 вместо 350» НЕ покраснела: проба менялась
     * вместе с кодом. Проба, которая берёт число из проверяемого кода, это число не проверяет
     * (урок «Поиска» 23.09). 300 мс лежит между сломанным и верным порогом.
     */
    await start(tester, LabMode.net);
    await tapCell(tester, 4);
    await tapCell(tester, 4, ms: 300);
    expect(moved(tester), isTrue, reason: 'второе касание через 300 мс — поворот, как в вебе');
  });

  test('🔴 порог совпадает с вебом ЧИСЛОМ: две половины приложения не расходятся', () {
    // Сверка с живым исходником веба: иначе правка порога в одной половине разводит их молча,
    // и ни одна проба этого не видит (урок 23.09 про эталон, замораживающий перенос).
    final web = File('../frontend/src/components/SpatialLab.tsx').readAsStringSync();
    final m = RegExp(r'ДВОЙНОЕ_НАЖАТИЕ_МС\s*=\s*(\d+)').firstMatch(web);
    expect(m, isNotNull, reason: 'в SpatialLab.tsx не нашлась константа ДВОЙНОЕ_НАЖАТИЕ_МС');
    expect(labDoubleTapMs, int.parse(m!.group(1)!));
  });

  testWidgets('🔴 ошибся трубой, потом дважды по нужной — поворот нужной', (tester) async {
    /*
     * Живой сценарий: промахнулся, ткнул соседнюю, потом дважды по своей. Он же — единственное
     * место, где различаются «память запоминает ЦЕЛЬ» и «память запоминает только время»:
     * вторая версия сбрасывает память на касании по другой трубе и потом не узнаёт двойное.
     */
    await start(tester, LabMode.net);
    await tapCell(tester, 3);
    await tapCell(tester, 4, ms: 100);
    expect(moved(tester), isFalse);
    await tapCell(tester, 4, ms: 100);
    expect(moved(tester), isTrue);
  });

  testWidgets('🔴 новая раздача стирает память о касании', (tester) async {
    // В свободной игре начальный выбор раздачи — клетка 0 (`deal.dart`, createDeal).
    await start(tester, LabMode.net);
    await tapCell(tester, 0);
    await tester.tap(find.byTooltip(L.t('spatialLabNew')));
    await tester.pump();
    await tapCell(tester, 0, ms: 100);
    expect(moved(tester), isFalse, reason: 'первое касание по свежему полю обязано только выбрать');
  });

  testWidgets('🔴 медленное второе нажатие — не поворот, а снова выбор', (tester) async {
    await start(tester, LabMode.net);
    await tapCell(tester, 4);
    await tapCell(tester, 4, ms: labDoubleTapMs + 1);
    expect(moved(tester), isFalse, reason: 'порог $labDoubleTapMs мс, как у веба');
  });

  testWidgets('🔴 ровно на пороге — ещё поворот', (tester) async {
    await start(tester, LabMode.net);
    await tapCell(tester, 4);
    await tapCell(tester, 4, ms: labDoubleTapMs);
    expect(moved(tester), isTrue, reason: 'у веба условие «не позже порога», включительно');
  });

  testWidgets('🔴 два быстрых нажатия по РАЗНЫМ клеткам — не поворот', (tester) async {
    await start(tester, LabMode.net);
    await tapCell(tester, 4);
    await tapCell(tester, 5, ms: 100);
    expect(moved(tester), isFalse, reason: 'второе нажатие по другой трубе — это новый выбор');
  });

  testWidgets('🔴 у упражнений сдвига у нажатия нет направления — двойное нажатие не ходит', (tester) async {
    await start(tester, LabMode.sixteen);
    await tapCell(tester, 4);
    await tapCell(tester, 4, ms: 100);
    expect(moved(tester), isFalse, reason: 'строку и столбец двигают только стрелки');
  });
}

/// Целый квадратный корень числа клеток квадратного поля.
int _sqrt(int cells) {
  var n = 0;
  while ((n + 1) * (n + 1) <= cells) {
    n++;
  }
  return n;
}
