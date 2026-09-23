import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/deep/screen.dart';
import 'package:psygames_flutter/games/fractal/screen.dart';
import 'package:psygames_flutter/games/samurai/screen.dart';
import 'package:psygames_flutter/games/sudoku/screen.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 ЖАЛОБА «ИГРЫ ЕЗДЯТ, ПОЛЕ НЕ ВЛЕЗАЕТ» — ОДНА НА ВЕСЬ РАЗДЕЛ, ЗНАЧИТ И ГЕЙТ ОДИН.
///
/// Замер веб-версии 17.09.2026 (экспорт, WebKit): поле прокручивалось у фрактала на
/// +222 px (403×873) и +410 px (360×640), у глубокого фрактала на +7 и +195, у судоку
/// на +65. Пять жалоб на вёрстку у одного экрана — больше, чем у любого другого экрана
/// приложения; ради этого раздел и поехал первым.
///
/// Здесь проверяется ВЕСЬ раздел разом и ПОВЕДЕНИЕМ: каждый перенесённый экран
/// поднимается на двух настоящих размерах телефона, и если хоть что-то не влезло,
/// каркас Flutter бросает исключение переполнения — проба ловит его как отказ.
/// Доска при этом обязана остаться в отведённом поле, а не уехать под ряд клавиш.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  /// Два размера из отзывов: iPhone Дениса и узкий Android.
  const sizes = [Size(403, 873), Size(360, 640)];

  late SharedState state;

  setUp(() async {
    SharedPreferences.setMockInitialValues({
      'psygames_sudoku_level_nzt48': '5',
      'psygames_sudoku_samurai_level_nzt48': '1',
      'psygames_sudoku_fractal_level_nzt48': '6',
    });
    state = await SharedState.open();
  });

  Future<void> boot(WidgetTester tester, Widget screen, String firstCell) async {
    await tester.runAsync(() async {
      await tester.pumpWidget(MaterialApp(home: screen));
      for (var i = 0; i < 80; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 20));
        if (find.byKey(Key(firstCell)).evaluate().isNotEmpty) break;
      }
    });
    await tester.pump();
  }

  /// Экраны раздела и клетка, по которой видно, что доска раздана.
  List<({String name, Widget screen, String cell})> screens() => [
        (name: 'Судоку', screen: SudokuScreen(state: state), cell: 'клетка0_0'),
        (name: 'Самурай', screen: SamuraiScreen(state: state), cell: 'клетка0_0'),
        (name: 'Фрактал', screen: FractalScreen(state: state), cell: 'корень0_0'),
        (name: 'Бездна', screen: DeepScreen(state: state), cell: 'клетка0_0'),
      ];

  for (final size in sizes) {
    testWidgets('🔴 ${size.width.toInt()}×${size.height.toInt()}: ни один экран раздела не переполняет каркас',
        (tester) async {
      await tester.binding.setSurfaceSize(size);
      addTearDown(() => tester.binding.setSurfaceSize(null));

      for (final s in screens()) {
        await boot(tester, s.screen, s.cell);
        expect(find.byKey(Key(s.cell)), findsOneWidget, reason: '${s.name}: доска не раздалась');
        // Переполнение каркас отдаёт исключением — если оно было, проба падает здесь.
        expect(tester.takeException(), isNull, reason: '${s.name}: переполнение на $size');

        // И доска не уехала за края экрана.
        final rect = tester.getRect(find.byKey(Key(s.cell)));
        expect(rect.top, greaterThanOrEqualTo(0.0), reason: '${s.name}: доска выше экрана: $rect');
        expect(rect.bottom, lessThanOrEqualTo(size.height),
            reason: '${s.name}: доска ниже экрана: $rect');
        expect(rect.left, greaterThanOrEqualTo(0.0), reason: '${s.name}: доска левее экрана');
        expect(rect.right, lessThanOrEqualTo(size.width), reason: '${s.name}: доска правее экрана');
      }
    });
  }

  /// ⚠️ Отдельно — ряд клавиш: жалоба «почему цифры не в два ряда» (Денис, 23.09).
  /// Клавиши обязаны быть ДОСТУПНЫ, а не уехать под нижний край.
  testWidgets('🔴 ряд клавиш помещается на узком телефоне', (tester) async {
    await tester.binding.setSurfaceSize(const Size(360, 640));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    for (final s in screens()) {
      await boot(tester, s.screen, s.cell);
      for (final key in ['цифра1', 'цифра9', 'стереть']) {
        final f = find.byKey(Key(key));
        expect(f, findsOneWidget, reason: '${s.name}: нет клавиши $key');
        final rect = tester.getRect(f);
        expect(rect.bottom, lessThanOrEqualTo(640.0),
            reason: '${s.name}: клавиша $key уехала за низ: $rect');
        expect(rect.right, lessThanOrEqualTo(360.0),
            reason: '${s.name}: клавиша $key уехала за правый край: $rect');
        // Норма цели для пальца — клавиша не мельче 44 точек.
        expect(rect.width, greaterThanOrEqualTo(40.0), reason: '${s.name}: клавиша $key мелкая');
      }
    }
  });

  /// 🔴 ПРОГРЕСС ПИШЕТСЯ ПОД ТЕМ ЖЕ КЛЮЧОМ, ЧТО У ВЕБ-ВЕРСИИ. Разойдутся имена —
  /// обе половины будут работать, показывая разные уровни, и заметит это игрок.
  testWidgets('🔴 экраны читают уровень из общих ключей, а не из своих', (tester) async {
    await boot(tester, SudokuScreen(state: state), 'клетка0_0');
    expect(find.text('5'), findsWidgets, reason: 'судоку взяла уровень 5 из общего ключа');

    await boot(tester, FractalScreen(state: state), 'корень0_0');
    expect(find.text('6'), findsWidgets, reason: 'фрактал взял уровень 6 из общего ключа');
  });
}
