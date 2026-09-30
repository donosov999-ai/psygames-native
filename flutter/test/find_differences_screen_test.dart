import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/find_differences/model.dart';
import 'package:psygames_flutter/games/find_differences/screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// РАУНД ЗАКРЫВАЕТСЯ НАЖАТИЯМИ ПО СЦЕНЕ — по координатам, как пальцем.
/// Где отличия, проба знает из той же раздачи по зерну: у экрана и у пробы
/// один генератор и одно зерно, поэтому картинка у них одна.
void main() {
  late SharedState state;
  var opens = 0;

  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    await L.load('ru');
  });

  Future<void> open(WidgetTester tester, {int level = 1, Size? screen, String seed = 'проба'}) async {
    tester.view.devicePixelRatio = 1.0;
    tester.view.physicalSize = screen ?? const Size(390, 844);
    addTearDown(tester.view.reset);
    SharedPreferences.setMockInitialValues({
      if (level != 1) '${SharedState.prefix}find_differences_level_nzt48': '$level',
    });
    state = await SharedState.open();
    await tester.pumpWidget(MaterialApp(
      home: FindDifferencesScreen(key: ValueKey('открытие${opens += 1}'), state: state, rnd: createRng(seed)),
    ));
    await tester.pump();
    await tester.pump();
    await tester.pump();
  }

  /// Размер сцены, который в этой партии дал каркас, — читаем с экрана.
  SceneSize sceneOnScreen(WidgetTester tester) {
    final r = tester.getRect(find.byKey(const Key('сцена-право')));
    return SceneSize(r.width, r.height);
  }

  Future<void> tapShape(WidgetTester tester, Shape s) async {
    final r = tester.getRect(find.byKey(const Key('сцена-право')));
    await tester.tapAt(Offset(r.left + s.x, r.top + s.y));
    await tester.pump();
  }

  testWidgets('🔴 раунды закрываются нажатиями по отличиям, уровень взят', (tester) async {
    await open(tester, seed: 'раунды');
    final p = levelParams(1);
    expect(find.text(L.t('findDiff')), findsOneWidget);

    // Та же раздача, что у экрана: одно зерно, один генератор, один размер сцены.
    final s = sceneOnScreen(tester);
    final rnd = createRng('раунды');
    for (var round = 1; round <= p.rounds; round += 1) {
      expect(find.text('$round/${p.rounds}'), findsOneWidget, reason: 'раунд $round');
      final scene = generateScene(s.width, s.height, p.objectCount, p.spriteAlphabet, rnd);
      final alt = withDifference(scene, p.diffCount, p.spriteAlphabet, rnd);
      expect(find.text('0/${p.diffCount}'), findsOneWidget, reason: 'раунд $round: пока ничего не найдено');
      for (final idx in alt.diffIdx) {
        await tapShape(tester, alt.shapes[idx]);
      }
      await tester.pump(const Duration(milliseconds: 800));
    }
    expect(find.textContaining(L.t('nextLabel')), findsWidgets, reason: 'все три раунда закрыты — уровень взят');
  });

  testWidgets('🔴 нажатие по НЕизменённому объекту не засчитывается', (tester) async {
    await open(tester, seed: 'мимо');
    final p = levelParams(1);
    final s = sceneOnScreen(tester);
    final rnd = createRng('мимо');
    final scene = generateScene(s.width, s.height, p.objectCount, p.spriteAlphabet, rnd);
    final alt = withDifference(scene, p.diffCount, p.spriteAlphabet, rnd);
    final plain = List.generate(alt.shapes.length, (i) => i).firstWhere((i) => !alt.diffIdx.contains(i));
    await tapShape(tester, alt.shapes[plain]);
    expect(find.text('0/${p.diffCount}'), findsOneWidget, reason: 'счётчик найденного не вырос');
    await tapShape(tester, alt.shapes[alt.diffIdx.first]);
    expect(find.text('1/${p.diffCount}'), findsOneWidget, reason: 'а по отличию — вырос');
  });

  testWidgets('🔴 нажатие МИМО всех объектов ничего не засчитывает', (tester) async {
    // ⚠️ Промах прощается до края плюс 16 точек — но не дальше: иначе тап по
    // пустому месту закрывал бы раунд сам собой.
    await open(tester, seed: 'мимо-всех');
    final p = levelParams(1);
    final s = sceneOnScreen(tester);
    final rnd = createRng('мимо-всех');
    final scene = generateScene(s.width, s.height, p.objectCount, p.spriteAlphabet, rnd);
    final alt = withDifference(scene, p.diffCount, p.spriteAlphabet, rnd);

    // Ищем точку, до которой от любого объекта дальше его допуска.
    double? emptyX;
    double? emptyY;
    for (var x = 6.0; x < s.width && emptyX == null; x += 4) {
      for (var y = 6.0; y < s.height; y += 4) {
        if (hitTest(alt.shapes, x, y) == null) {
          emptyX = x;
          emptyY = y;
          break;
        }
      }
    }
    expect(emptyX, isNotNull, reason: 'на сцене есть пустое место');
    final r = tester.getRect(find.byKey(const Key('сцена-право')));
    await tester.tapAt(Offset(r.left + emptyX!, r.top + emptyY!));
    await tester.pump();
    expect(find.text('0/${p.diffCount}'), findsOneWidget, reason: 'промах не засчитан');
  });

  testWidgets('🔴 время вышло — раунд не засчитан, и уровень не берётся', (tester) async {
    await open(tester, level: 20, seed: 'время');
    final p = levelParams(20);
    expect(p.roundTimeSec, 15, reason: 'на двадцатом уровне пятнадцать секунд');
    for (var round = 1; round <= p.rounds; round += 1) {
      await tester.pump(Duration(seconds: p.roundTimeSec + 1));
      await tester.pump(const Duration(milliseconds: 800));
    }
    expect(find.textContaining(L.t('retry')), findsWidgets, reason: 'ни один раунд не закрыт — не взят');
  });

  testWidgets('🔴 РАСКЛАДКА: обе сцены на экране, объекты внутри них — 360×640 и 390×844', (tester) async {
    for (final screen in [const Size(360, 640), const Size(390, 844)]) {
      await open(tester, screen: screen, seed: 'раскладка');
      final top = tester.getRect(find.byKey(const Key('сцена-лево')));
      final bottom = tester.getRect(find.byKey(const Key('сцена-право')));
      expect(top.width, closeTo(bottom.width, 0.01), reason: '$screen сцены одной ширины');
      expect(top.height, closeTo(bottom.height, 0.01), reason: '$screen сцены одной высоты');
      expect(top.top >= 0, isTrue, reason: '$screen верхняя сцена не уехала под шапку: $top');
      expect(bottom.bottom <= screen.height, isTrue, reason: '$screen нижняя сцена на экране: $bottom');
      expect(top.left >= 0 && bottom.right <= screen.width, isTrue, reason: '$screen сцены по ширине');
      // Объекты обязаны лежать ВНУТРИ своей сцены — иначе часть отличий недоступна пальцу.
      final s = sceneOnScreen(tester);
      final p = levelParams(1);
      final rnd = createRng('раскладка');
      final scene = generateScene(s.width, s.height, p.objectCount, p.spriteAlphabet, rnd);
      for (final sh in scene) {
        expect(sh.x - sh.size / 2 >= -1 && sh.x + sh.size / 2 <= s.width + 1, isTrue,
            reason: '$screen объект вылез вбок: ${sh.x} при ширине ${s.width}');
        expect(sh.y - sh.size / 2 >= -1 && sh.y + sh.size / 2 <= s.height + 1, isTrue,
            reason: '$screen объект вылез по высоте: ${sh.y} при высоте ${s.height}');
      }
    }
  });
}
