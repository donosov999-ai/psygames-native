import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/spatial_lab/board.dart';
import 'package:psygames_flutter/games/spatial_lab/deal.dart';
import 'package:psygames_flutter/games/spatial_lab/screen.dart';
import 'package:psygames_flutter/games/spatial_lab/twiddle.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ПАРТИЯ СОБИРАЕТСЯ ТЫЧКАМИ — ПО РЕШЕНИЮ, КОТОРОЕ ПОСЧИТАЛО ЯДРО.
///
/// 🔴 Проба знает ход ЗАРАНЕЕ: она строит ту же раздачу тем же семенем и играет её решение
/// клетка за клеткой. Поэтому она проверяет не «экран согласен сам с собой», а то, что тычок по
/// клетке и кнопка поворота дают РОВНО тот ход, который ядро назвало верным. Сломай знак
/// четверти или выбор блока — поле не соберётся, и проба назовёт ступень и упражнение.
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

  Future<void> boot(WidgetTester tester, {int seed = 42, Size size = const Size(390, 844)}) async {
    tester.view.physicalSize = size;
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      MaterialApp(home: SpatialLabScreen(state: state, seed: seed, banks: banks)),
    );
    await tester.pump();
    await tester.pump();
  }

  /// Сыграть один ход решения: выбрать клетку и нажать кнопку.
  Future<void> play(WidgetTester tester, LabMode mode, Command c, int n) async {
    final cell = switch (c.kind) {
      CommandKind.tile => c.index,
      CommandKind.block => c.row * n + c.col,
      CommandKind.row => c.index * n,
      CommandKind.column => c.index,
    };
    await tester.tap(find.byKey(Key('клетка$cell')));
    await tester.pump();
    final button = switch (c.kind) {
      CommandKind.row => c.amount > 0 ? 'строка-вправо' : 'строка-влево',
      CommandKind.column => c.amount > 0 ? 'столбец-вниз' : 'столбец-вверх',
      _ => c.amount > 0 ? 'вправо' : 'влево',
    };
    await tester.tap(find.byKey(Key(button)));
    await tester.pump();
  }

  /// Пройти ступень упражнения решением ядра.
  Future<void> solve(WidgetTester tester, LabMode mode, int level, {int seed = 42}) async {
    await boot(tester, seed: seed);
    if (mode != LabMode.twiddle) {
      await tester.tap(find.byKey(Key('упражнение-${mode.name}')));
      await tester.pump();
    }
    for (var i = 1; i < level; i++) {
      // Ступени идут по порядку: выше достигнутого экран не пускает, и это правило проверяется
      // здесь же — кнопка «Сложнее» гаснет.
      if (find.byKey(const Key('сложнее')).evaluate().isEmpty) break;
    }
    await tester.tap(find.byKey(const Key('начать-ступень')));
    await tester.pump();

    final deal = createDeal(mode, seed, level: level, banks: banks);
    final n = deal.state.initial.width;
    expect(find.byKey(const Key('состояние')), findsOneWidget, reason: 'партия началась');
    for (final c in deal.task!.solution) {
      await play(tester, mode, c, n);
    }
  }

  testWidgets('🔴 «Поворот чисел»: ступень собирается решением ядра', (tester) async {
    await solve(tester, LabMode.twiddle, 1);
    expect(find.text('Собрано!'), findsOneWidget);
    expect(find.byKey(const Key('дальше')), findsOneWidget);
    // Односторонняя лестница: победа поднимает ступень.
    expect(find.text('2'), findsWidgets, reason: 'уровень вырос до второго');
  });

  testWidgets('🔴 «Сеть труб»: ступень собирается решением ядра', (tester) async {
    await solve(tester, LabMode.net, 1);
    expect(find.text('Собрано!'), findsOneWidget);
    expect(find.text('Открытых концов: 0'), findsNothing, reason: 'после победы строка про победу');
  });

  testWidgets('🔴 «Сдвиг чисел»: строка и столбец ездят по кругу', (tester) async {
    await solve(tester, LabMode.sixteen, 1);
    expect(find.text('Собрано!'), findsOneWidget);
  });

  testWidgets('🔴 «Сеть со сдвигом»: источник едет вместе со строкой', (tester) async {
    await solve(tester, LabMode.netslide, 1);
    expect(find.text('Собрано!'), findsOneWidget);
  });

  testWidgets('🔴 отмена возвращает поле, а свободная игра не двигает лестницу', (tester) async {
    await boot(tester);
    await tester.tap(find.byKey(const Key('свободная-игра')));
    await tester.pump();
    expect(find.text('свободно'), findsOneWidget);

    await tester.tap(find.byKey(const Key('клетка0')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('вправо')));
    await tester.pump();
    expect(find.byTooltip('Отменить'), findsOneWidget);
    await tester.tap(find.byTooltip('Отменить'));
    await tester.pump();

    // Свободная раздача лестницу не трогает ни при каком исходе.
    await tester.tap(find.byTooltip('Настройка'));
    await tester.pump();
    expect(find.text('1'), findsWidgets, reason: 'уровень остался первым');
  });

  testWidgets('🔴 доска берёт сторону у поля: на 360×640 всё в кадре', (tester) async {
    await boot(tester, size: const Size(360, 640));
    await tester.tap(find.byKey(const Key('упражнение-netslide')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('начать-ступень')));
    await tester.pump();
    expect(tester.takeException(), isNull);
    final r = tester.getRect(find.byKey(const Key('клетка8')));
    expect(r.bottom, lessThanOrEqualTo(640));
    expect(r.right, lessThanOrEqualTo(360));
  });
}
