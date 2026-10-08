import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/mental_rotation/screen.dart';
import 'package:psygames_flutter/games/mental_rotation/words.dart';
import 'package:psygames_flutter/games/spatial_lab/board.dart';
import 'package:psygames_flutter/games/spatial_lab/deal.dart';
import 'package:psygames_flutter/games/spatial_lab/screen.dart';
import 'package:psygames_flutter/games/spatial_lab/twiddle.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/hybrid_app.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// «ПРОСТРАНСТВО» ИСПОЛНЯЕТ АДРЕС, А НЕ ТОЛЬКО ЧИТАЕТ ЕГО (задачи c39ac01c и 2b335bf6).
///
/// Сторож `web_params_reach_native_test.dart` видит строку `GamePreset.num('x'` в папке экрана,
/// но не то, что экран с ней делает. Здесь смотрится поведение, и смотрится там, где адрес
/// реально приходит: `_openNative` кладёт хвост адреса в [GamePreset] и строит экран из
/// [HybridApp.native]. До 08.10.2026 оба экрана хвост не читали:
///   · карточка развилки «Сеть труб» (`/games/spatial-lab?mode=net`) открывала «Поворот чисел»;
///   · шаг зарядки «Лаборатории» стоял на экране настройки, без своей ступени и своего зерна;
///   · шаг «Вращения» (`trials=5`, `warmup.ts`) играл десять проб вместо пяти.
void main() {
  late SharedState state;
  late LabBanks banks;

  setUpAll(() {
    banks = LabBanks(
      twiddle: BankEntry.parse(
        jsonDecode(File('assets/spatial/twiddle-bank.json').readAsStringSync())
            as List,
      ),
      sixteen: BankEntry.parse(
        jsonDecode(File('assets/spatial/sixteen-bank.json').readAsStringSync())
            as List,
      ),
    );
  });

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
  });

  tearDown(GamePreset.clear);

  Future<void> sized(WidgetTester tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
  }

  /// Открыть маршрут так, как его открывает оболочка: хвост адреса — в [GamePreset], экран — из
  /// карты нативных. Банки и словари экран грузит сам, поэтому ждём настоящим временем.
  Future<void> openRoute(
    WidgetTester tester,
    String route,
    Map<String, String> query,
  ) async {
    await sized(tester);
    GamePreset.set(query);
    await tester.runAsync(() async {
      await tester.pumpWidget(
        MaterialApp(home: HybridApp.native[route]!(state)),
      );
      for (var i = 0; i < 20; i++) {
        await tester.pump(const Duration(milliseconds: 30));
        await Future<void>.delayed(const Duration(milliseconds: 10));
      }
    });
    await tester.pump();
  }

  LabMode? selectedMode(WidgetTester tester) {
    for (final m in LabMode.values) {
      final chip = find.byKey(Key('упражнение-${m.name}'));
      if (tester.widget<ChoiceChip>(chip).selected) return m;
    }
    return null;
  }

  testWidgets(
    '🔴 карточка развилки открывает СВОЁ упражнение «Лаборатории», а не «Поворот чисел»',
    (tester) async {
      await L.load('en');
      for (final m in LabMode.values) {
        await openRoute(tester, '/games/spatial-lab', {'mode': m.name});
        expect(
          find.byKey(const Key('начать-ступень')),
          findsOneWidget,
          reason: '${m.name}: без wu=1 — настройка',
        );
        expect(
          selectedMode(tester),
          m,
          reason: '/games/spatial-lab?mode=${m.name}',
        );
        await tester.pumpWidget(const SizedBox());
        GamePreset.clear();
      }
      // Незнакомое упражнение — «Поворот чисел», как у веба (`ИЗ_АДРЕСА`).
      await openRoute(tester, '/games/spatial-lab', {'mode': 'cube'});
      expect(selectedMode(tester), LabMode.twiddle);
    },
  );

  /// Сыграть ход решения: выбрать клетку и нажать кнопку (тот же разбор, что в
  /// `spatial_lab_screen_test.dart`).
  Future<void> play(WidgetTester tester, Command c, int n) async {
    final cell = switch (c.kind) {
      CommandKind.tile => c.index,
      CommandKind.block => c.row * n + c.col,
      CommandKind.row => c.index * n,
      CommandKind.column => c.index,
    };
    await tester.tap(find.byKey(Key('клетка$cell')));
    await tester.pump();
    final button = switch (c.kind) {
      CommandKind.row => c.amount > 0 ? 'shift-row-right' : 'shift-row-left',
      CommandKind.column => c.amount > 0 ? 'shift-col-down' : 'shift-col-up',
      _ => c.amount > 0 ? 'вправо' : 'влево',
    };
    await tester.tap(find.byKey(Key(button)));
    await tester.pump();
  }

  testWidgets(
    '🔴 шаг зарядки «Лаборатории»: сразу партия — того упражнения, той ступени и того зерна',
    (tester) async {
      await L.load('ru');
      await sized(tester);
      // Проба знает раздачу заранее и собирает её решением ядра. Не то зерно, не та ступень или не
      // то упражнение — решение чужой раздачи поле не соберёт.
      for (final (mode, level, seed) in [
        (LabMode.sixteen, 7, 123),
        (LabMode.net, 12, 9001),
      ]) {
        GamePreset.set({
          'wu': '1',
          'mode': mode.name,
          'level': '$level',
          'seed': '$seed',
        });
        await tester.pumpWidget(
          MaterialApp(
            home: SpatialLabScreen(state: state, banks: banks),
          ),
        );
        await tester.pump();
        await tester.pump();
        expect(
          find.byKey(const Key('начать-ступень')),
          findsNothing,
          reason: '${mode.name}: шаг без настройки',
        );
        expect(
          find.byKey(const Key('состояние')),
          findsOneWidget,
          reason: '${mode.name}: партия началась сама',
        );
        final deal = createDeal(mode, seed, level: level, banks: banks);
        for (final c in deal.task!.solution) {
          await play(tester, c, deal.state.initial.width);
        }
        expect(
          find.text(L.t('spatialLabSolved')),
          findsOneWidget,
          reason:
              '${mode.name}: решение раздачи (${mode.name}, ступень $level, зерно $seed) собрало поле',
        );
        await tester.pumpWidget(const SizedBox());
        GamePreset.clear();
      }
    },
  );

  testWidgets(
    '🔴 «Вращение»: длина партии — из адреса, и шаг играет ровно столько проб',
    (tester) async {
      await L.load('ru');
      await loadMentalRotationWords();

      // Личная игра со ссылкой: настройка уже стоит на длине из адреса.
      await openRoute(tester, '/games/mental-rotation', {'trials': '15'});
      expect(
        tester.widget<ChoiceChip>(find.byKey(const Key('заданий15'))).selected,
        isTrue,
      );
      await tester.pumpWidget(const SizedBox());
      GamePreset.clear();

      // Шаг зарядки: `trials=5` — пять проб и итог, а не десять.
      await sized(tester);
      GamePreset.set({'wu': '1', 'trials': '5'});
      await tester.pumpWidget(
        MaterialApp(home: MentalRotationScreen(state: state)),
      );
      await tester.pump();
      await tester.pump();
      for (var round = 1; round <= 5; round++) {
        expect(
          find.text('$round/5'),
          findsOneWidget,
          reason: 'шаг идёт пятью пробами',
        );
        await tester.tap(find.byKey(const Key('вариант0')));
        await tester.pump();
        if (find.byKey(const Key('следующий-раунд')).evaluate().isNotEmpty) {
          await tester.tap(find.byKey(const Key('следующий-раунд')));
        }
        await tester.pump(const Duration(milliseconds: 900));
        await tester.pump();
      }
      expect(
        find.byKey(const Key('итог-партии')),
        findsOneWidget,
        reason: 'после пятой пробы — итог',
      );
    },
  );
}
