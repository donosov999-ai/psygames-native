import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/sort_tubes/board.dart';
import 'package:psygames_flutter/games/sort_tubes/layout.dart';
import 'package:psygames_flutter/games/sort_tubes/screen.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ПРОБА ИГРАЕТ ПАРТИЮ ПАЛЬЦЕМ, а не зовёт правила.
///
/// Правила и раскладка сверены с живым TS отдельно (`sort_tubes_test.dart`).
/// Здесь то, чего та сверка не видит: доходит ли экран до поля, засчитывается ли
/// ход ТАПОМ и ПЕРЕТАСКИВАНИЕМ, называется ли причина отказа, совпадает ли
/// нарисованный сосуд с посчитанным, работают ли все три шкурки.
///
/// 📍 ПОВОД ДЛЯ ДВУХ ДОРОГ ХОДА — отчёты тестировщицы: «не даёт перетащить нижнюю
/// левую гайку на верхний ряд… гайка не двигается» (17.09.2026) и «не могу со
/// второго шурупа снять гайки, никуда не хотят сходить, и так и сяк кликаю»
/// (10.09.2026). Первый — про перетаскивание, второй — про молчащий отказ.
Future<void> _boot(WidgetTester tester, SharedState state, TubeSkin skin, String gameId) async {
  tester.view.physicalSize = const Size(780, 1688);   // телефон 390×844
  tester.view.devicePixelRatio = 2;
  addTearDown(tester.view.reset);
  await tester.runAsync(() async {
    await tester.pumpWidget(MaterialApp(
      home: SortTubesScreen(state: state, gameId: gameId, title: 'Проба', skin: skin),
    ));
    for (var i = 0; i < 40; i++) {
      await tester.pump(const Duration(milliseconds: 50));
      await Future<void>.delayed(const Duration(milliseconds: 50));
      if (find.byType(TubesField).evaluate().isNotEmpty) break;
    }
  });
  await tester.pump();
}

Future<void> _tapPour(WidgetTester tester, int from, int to) async {
  await tester.tap(find.byKey(ValueKey('tube-$from')));
  await tester.pump();
  await tester.tap(find.byKey(ValueKey('tube-$to')));
  await tester.pump();
}

void main() {
  late SharedState state;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
  });

  /* L1 выгруженной раздачи (`assets/levels/sort_tubes.json`, зерно 20260923):
     cap 4, пять сосудов — [2,0,2,1] [0,1,1,2] [2,1,0,0] [] []
     Отсюда все номера ниже: они взяты из файла, а не выдуманы. */

  testWidgets('экран доходит до поля, а не висит на загрузке', (tester) async {
    await _boot(tester, state, TubeSkin.water, 'water_sort');
    expect(find.byType(CircularProgressIndicator), findsNothing);
    expect(find.byType(TubesField), findsOneWidget);
    expect(find.byKey(const ValueKey('tube-4')), findsOneWidget, reason: 'пять сосудов');
    expect(find.byKey(const ValueKey('tube-5')), findsNothing);
  });

  testWidgets('🔴 ход засчитывается ТАПОМ: верхний слой уезжает в пустой сосуд', (tester) async {
    /*
     * ⚠️ ПРОВЕРЯЕТСЯ ДОСКА, А НЕ ЦИФРА НА ЭКРАНЕ. Первая редакция смотрела
     * `find.text('1')` — и была ЛОЖНО ЗЕЛЁНОЙ: единица есть в шапке (номер
     * уровня) независимо от хода. Мутация «перетаскивание не переливает» прошла
     * мимо неё незамеченной; поймана мутационным прогоном, а не глазами.
     */
    await _boot(tester, state, TubeSkin.water, 'water_sort');
    expect(tester.widget<TubesField>(find.byType(TubesField)).field.tubes[3], isEmpty);
    await _tapPour(tester, 0, 3);            // верхняя «1» из первого в пустой
    final f = tester.widget<TubesField>(find.byType(TubesField)).field;
    expect(f.tubes[3], [1], reason: 'товар обязан оказаться в сосуде-цели');
    expect(f.tubes[0], [2, 0, 2], reason: 'и уйти из источника');
  });

  testWidgets('🔴 ход засчитывается ПЕРЕТАСКИВАНИЕМ — жалоба «гайка не двигается»', (tester) async {
    await _boot(tester, state, TubeSkin.nuts, 'nut_sort');
    final from = tester.getCenter(find.byKey(const ValueKey('tube-0')));
    final to = tester.getCenter(find.byKey(const ValueKey('tube-3')));
    final g = await tester.startGesture(from);
    await tester.pump(const Duration(milliseconds: 60));
    // Тащим с промежуточными точками: рывок в одну точку распознаётся не всегда.
    await g.moveTo(Offset((from.dx + to.dx) / 2, (from.dy + to.dy) / 2));
    await tester.pump(const Duration(milliseconds: 60));
    await g.moveTo(to);
    await tester.pump(const Duration(milliseconds: 60));
    await g.up();
    await tester.pumpAndSettle();
    final f = tester.widget<TubesField>(find.byType(TubesField)).field;
    expect(f.tubes[3], isNotEmpty,
        reason: 'перетаскивание обязано давать тот же ход, что и тап');
    expect(f.tubes[0].length, lessThan(4), reason: 'и забирать порцию из источника');
  });

  testWidgets('🔴 ПЕРЕЛИВАЕТСЯ ВЕСЬ ОДНОЦВЕТНЫЙ СТОЛБИК, а не одна порция', (tester) async {
    // Решение Дениса 23.09.2026 про гайки и шарики: «если несколько одинаковых
    // подряд — переносятся вместе, а не по одной». В третьем сосуде [2,1,0,0]
    // наверху ДВЕ нуля: после перелива в пустой там обязаны оказаться обе.
    await _boot(tester, state, TubeSkin.balls, 'ball_sort');
    await _tapPour(tester, 2, 4);
    final field = tester.widget<TubesField>(find.byType(TubesField)).field;
    expect(field.tubes[4].length, 2, reason: 'уехал весь столбик, а не одна порция');
    expect(field.tubes[2], [2, 1], reason: 'и ровно его не стало в источнике');
  });

  testWidgets('🔴 ОТКАЗ НАЗЫВАЕТ ПРИЧИНУ ВИДИМЫМ ТЕКСТОМ, а не молчит', (tester) async {
    /*
     * 🔴 ПРОВЕРЯЕТСЯ ИМЕННО ВИДИМЫЙ ТЕКСТ. Первая редакция клала причину в
     * подпись служебной кнопки, а та рисуется подсказкой при наведении — то есть
     * на телефоне её НЕ ВИДНО ВООБЩЕ, и дефект «молчащий отказ» остался бы на
     * месте при зелёной пробе на `bySemanticsLabel`.
     *
     * ⚠️ Причина взята ТА, ЧТО ДОСТИЖИМА на первом уровне: все три цветных сосуда
     * там полные (cap 4), поэтому первым срабатывает «полон», а не «другой цвет».
     * Придумывать случай, которого на доске нет, значило бы проверять свою
     * фантазию.
     */
    await _boot(tester, state, TubeSkin.nuts, 'nut_sort');
    await _tapPour(tester, 0, 1);
    await tester.pump();
    final caption = tester.widget<Text>(find.byKey(const ValueKey('tubes-caption')));
    expect(caption.data, contains('полон'), reason: 'причина обязана быть названа');
    expect(caption.style?.color, isNot(const Color(0xFF8A8F98)), reason: 'и выделена, а не слита с подсказкой');

    // Вторая причина — «пусто»: взять из пустого сосуда нечего.
    await tester.tap(find.byKey(const ValueKey('tube-3')));
    await tester.pump();
    expect(tester.widget<Text>(find.byKey(const ValueKey('tubes-caption'))).data, contains('пуст'));
  });

  testWidgets('🔴 НАРИСОВАНО ТО ЖЕ, ЧТО ПОСЧИТАНО: сосуд совпадает с раскладкой', (tester) async {
    /*
     * Сверка `ширинаПробирки` меряет ФОРМУЛУ, а жалобы приходят на РИСУНОК.
     * Между ними код поля, и без этой пробы мутация «рисуй сосуд от окна, а не
     * от поля» прошла бы мимо всех зелёных проб — ровно так в вебе шесть недель
     * зеленел гейт, меривший не ту формулу.
     */
    await _boot(tester, state, TubeSkin.water, 'water_sort');
    final f = tester.widget<TubesField>(find.byType(TubesField));
    final box = tester.getSize(find.byType(TubesField));
    final want = tubeWidth(f.field.length, box.width, f.fieldHeight);
    final got = tester.getSize(find.byKey(const ValueKey('tube-0')));
    expect(got.width, want, reason: 'ширина сосуда — из раскладки');
    expect(got.height, tubeHeight(want), reason: 'высота — пропорция стекла');
    expect(got.height, lessThanOrEqualTo(f.fieldHeight),
        reason: 'сосуд не имеет права быть выше поля, которое дал каркас');
  });

  testWidgets('отмена возвращает поле и счётчик ходов', (tester) async {
    await _boot(tester, state, TubeSkin.water, 'water_sort');
    final before = tester.widget<TubesField>(find.byType(TubesField)).field.tubes[0].length;
    await _tapPour(tester, 0, 3);
    await tester.tap(find.bySemanticsLabel('Отменить'));
    await tester.pump();
    final after = tester.widget<TubesField>(find.byType(TubesField)).field.tubes[0].length;
    expect(after, before, reason: 'содержимое обязано вернуться');
    expect(tester.widget<TubesField>(find.byType(TubesField)).field.tubes[3], isEmpty,
        reason: 'и сосуд-цель снова пуст');
  });

  testWidgets('все три шкурки доходят до поля со своим видом порции', (tester) async {
    for (final (skin, game) in [
      (TubeSkin.water, 'water_sort'),
      (TubeSkin.balls, 'ball_sort'),
      (TubeSkin.nuts, 'nut_sort'),
    ]) {
      SharedPreferences.setMockInitialValues({});
      final s = await SharedState.open();
      await _boot(tester, s, skin, game);
      expect(find.byType(TubesField), findsOneWidget, reason: 'шкурка $skin');
      expect(tester.widget<TubesField>(find.byType(TubesField)).skin, skin);
      // У гаек стекла нет, у воды и шариков — есть; это единственное, чем
      // шкурки различаются на поле, помимо формы порции.
      final glass = find.byWidgetPredicate((w) =>
          w is Image && w.image is AssetImage && (w.image as AssetImage).assetName.contains('tube-glass'));
      if (skin == TubeSkin.nuts) {
        expect(glass, findsNothing, reason: 'у гаек стекла нет — блик поверх металла читался бы как грязь');
      } else {
        expect(glass, findsWidgets, reason: 'стекло поверх содержимого');
      }
    }
  });
}
