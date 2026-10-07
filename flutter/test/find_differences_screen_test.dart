import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/find_differences/model.dart';
import 'package:psygames_flutter/games/find_differences/screen.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/level_rules.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/boss_probe.dart';

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

  testWidgets('🔴 веха: победа на 3-м уровне открывает бой «сложи подсвеченные», на 2-м — нет', (tester) async {
    // В вебе этот экран зовёт BossRound каждые три уровня; при переносе бой пропал молча.
    await expectBossAfterWin(tester, won: find.textContaining(L.t('nextLabel')), hudKey: 'bossHudCounting', play: (level) async {
      await open(tester, level: level, seed: 'босс$level');
      final p = levelParams(level);
      final s = sceneOnScreen(tester);
      final rnd = createRng('босс$level');
      for (var round = 1; round <= p.rounds; round += 1) {
        final scene = generateScene(s.width, s.height, p.objectCount, p.spriteAlphabet, rnd);
        final alt = withDifference(scene, p.diffCount, p.spriteAlphabet, rnd);
        for (final idx in alt.diffIdx) {
          await tapShape(tester, alt.shapes[idx]);
        }
        await tester.pump(const Duration(milliseconds: 800));
      }
    });
  });

  testWidgets('🔴 ПОТОЛКА НЕТ: 34-й играется тонкими отличиями, а карточка правила встаёт на итоге', (tester) async {
    // Экран раздаёт отличия с той же тонкостью, что модель: проба повторяет раздачу с subtlety
    // уровня и попадает в каждое отличие. Не передай экран тонкость — нажатия уйдут мимо.
    await tester.runAsync(LevelRules.load);
    await open(tester, level: 34, seed: 'тонко');
    final p = levelParams(34);
    final s = sceneOnScreen(tester);
    final rnd = createRng('тонко');
    // Экран сперва разыгрывает лишние раунды (с 34-го), потом раздаёт сцены — проба повторяет порядок.
    final rounds = p.rounds + fdDrawExtraRounds(34, rnd);
    expect(find.text('1/$rounds'), findsOneWidget, reason: 'в полосе — раундов в этой партии');
    for (var round = 1; round <= rounds; round += 1) {
      final scene = generateScene(s.width, s.height, p.objectCount, p.spriteAlphabet, rnd);
      final alt = withDifference(scene, p.diffCount, p.spriteAlphabet, rnd, subtlety: p.subtlety);
      expect(find.text('0/${p.diffCount}'), findsOneWidget, reason: 'раунд $round: пока ничего не найдено');
      for (final idx in alt.diffIdx) {
        await tapShape(tester, alt.shapes[idx]);
      }
      await tester.pump(const Duration(milliseconds: 800));
    }
    await tester.pump();
    await tester.pump();
    expect(state.get('${SharedState.prefix}find_differences_level_nzt48'), '35', reason: '34-й взят тонкими отличиями');
    expect(find.text(L.t('lr_find_differences_subtle_title')), findsOneWidget,
        reason: 'на экране итога — карточка «Отличия тоньше»: таймер раунда под ней не идёт');
  });

  testWidgets('🔴 ПОТОЛКА НЕТ: с 34-го в партии лишние раунды — взять уровень можно, только закрыв все', (tester) async {
    // На 57-м среднее лишних раундов ровно 3 (по одному каждые 8 уровней) — партия из 6, а не 3.
    await open(tester, level: 33, seed: 'раунды');
    expect(find.text('1/$roundsPerLevel'), findsOneWidget, reason: 'до 34-го партия прежняя — 3 раунда');
    await open(tester, level: 57, seed: 'раунды');
    expect(find.text('1/6'), findsOneWidget, reason: 'на 57-м — 6 раундов');
    // Шаг зарядки — прежние три: пресет лестницу не двигает, а бюджет шага рассчитан на них.
    GamePreset.set({'wu': '1'});
    addTearDown(GamePreset.clear);
    await open(tester, level: 57, seed: 'раунды');
    expect(find.text('1/$roundsPerLevel'), findsOneWidget, reason: 'в шаге зарядки лишних раундов нет');
  });

  testWidgets('🔴 лишние раунды ИГРАЮТСЯ: на 49-м уровень берётся только после 5-го раунда, а не 3-го', (tester) async {
    // На 49-м среднее лишних раундов ровно 2. Проба повторяет раздачу экрана тем же зерном.
    await open(tester, level: 49, seed: 'раунды-игра');
    final p = levelParams(49);
    final s = sceneOnScreen(tester);
    final rnd = createRng('раунды-игра');
    final rounds = p.rounds + fdDrawExtraRounds(49, rnd);
    expect(rounds, 5);
    for (var round = 1; round <= rounds; round += 1) {
      expect(find.byKey(const Key('итог')), findsNothing, reason: 'до конца $round-го раунда итога нет');
      expect(find.text('$round/$rounds'), findsOneWidget, reason: 'идёт раунд $round из $rounds');
      final scene = generateScene(s.width, s.height, p.objectCount, p.spriteAlphabet, rnd);
      final alt = withDifference(scene, p.diffCount, p.spriteAlphabet, rnd, subtlety: p.subtlety);
      for (final idx in alt.diffIdx) {
        await tapShape(tester, alt.shapes[idx]);
      }
      await tester.pump(const Duration(milliseconds: 800));
    }
    await tester.pump();
    await tester.pump();
    expect(state.get('${SharedState.prefix}find_differences_level_nzt48'), '50', reason: 'пять раундов закрыты — уровень взят');
  });

  testWidgets('🔴 лишний раунд не прощается: на 49-м 4 из 5 закрыты, пятый истёк — уровень не взят', (tester) async {
    await open(tester, level: 49, seed: 'раунды-игра');
    final p = levelParams(49);
    final s = sceneOnScreen(tester);
    final rnd = createRng('раунды-игра');
    final rounds = p.rounds + fdDrawExtraRounds(49, rnd);
    for (var round = 1; round < rounds; round += 1) {
      final scene = generateScene(s.width, s.height, p.objectCount, p.spriteAlphabet, rnd);
      final alt = withDifference(scene, p.diffCount, p.spriteAlphabet, rnd, subtlety: p.subtlety);
      for (final idx in alt.diffIdx) {
        await tapShape(tester, alt.shapes[idx]);
      }
      await tester.pump(const Duration(milliseconds: 800));
    }
    expect(find.text('$rounds/$rounds'), findsOneWidget, reason: 'дошли до последнего раунда');
    await tester.pump(Duration(seconds: p.roundTimeSec + 1));
    await tester.pump(const Duration(milliseconds: 800));
    await tester.pump();
    expect(find.byKey(const Key('итог')), findsOneWidget, reason: 'время последнего раунда вышло — итог');
    expect(state.get('${SharedState.prefix}find_differences_level_nzt48'), '49', reason: '4 из 5 — уровень не взят');
  });

  testWidgets('🔴 шаг зарядки задаёт число отличий сам (?diffCount=) — но не выше уровня + 1', (tester) async {
    // Сторож каркаса 44f7e4e0: веб читает diffCount шага (`find-differences.tsx:401`), натив молча
    // играл число уровня. На 10-м по уровню 5 отличий; шаг «Детей» просит 2 — их и играем.
    expect(levelParams(10).diffCount, 5, reason: 'премиса: на 10-м уровне 5 отличий');
    GamePreset.set({'wu': '1', 'diffCount': '2'});
    addTearDown(GamePreset.clear);
    await open(tester, level: 10, seed: 'шаг');
    expect(find.text('0/2'), findsOneWidget, reason: 'шаг просит 2 отличия — их и раздаём');
    // На 1-м по уровню 2; шаг просит 9 — потолок «освоенное + 1» = 3.
    GamePreset.set({'wu': '1', 'diffCount': '9'});
    await open(tester, level: 1, seed: 'шаг');
    expect(find.text('0/3'), findsOneWidget, reason: 'не выше освоенного больше чем на одно');
  });
}
