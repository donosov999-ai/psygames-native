import 'dart:io';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/level_ladder.dart';
import 'package:psygames_flutter/games/puzzles/engine.dart';
import 'package:psygames_flutter/games/puzzles/frame.dart';
import 'package:psygames_flutter/games/puzzles/ladder.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/games/puzzles/screen.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ЭКРАН ГОЛОВОЛОМОК ИГРАЕТСЯ НАЖАТИЯМИ, И ДВИЖОК ПОД НИМ — НАСТОЯЩИЙ.
///
/// Никаких заглушек: экран поднимает ту же библиотеку C, что поедет на телефон, рисует
/// её кадр и шлёт ей тычки. Проверяется то, что видит человек: доска появилась, тычок и
/// клавиша дают ход, отмена его снимает, «Показать решение» показывает ответ, не двигая ступень.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  final flutterDir = Directory.current.path;
  final libPath = '$flutterDir/build/tatham/${TathamEngine.libraryName}';

  setUpAll(() async {
    await L.load('ru');   // подписи берутся из того же словаря, что и в сборке
    if (File(libPath).existsSync()) return;
    final res = Process.runSync('bash', ['tool/build_tatham.sh'], workingDirectory: flutterDir);
    if (!File(libPath).existsSync()) {
      fail('движок не собран: bash tool/build_tatham.sh\n${res.stdout}\n${res.stderr}');
    }
  });

  late SharedState state;

  setUp(() async {
    SharedPreferences.setMockInitialValues({
      'psygames_puzzles_solo_level_nzt48': '1',
      'psygames_puzzles_undead_level_nzt48': '1',
    });
    state = await SharedState.open();
  });

  Future<void> boot(WidgetTester tester, String mode) async {
    await tester.runAsync(() async {
      await tester.pumpWidget(MaterialApp(
        home: PuzzlesScreen(state: state, mode: mode, libraryPath: libPath, seed: 20261011),
      ));
      for (var i = 0; i < 40; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 20));
        if (find.byKey(const Key('board')).evaluate().isNotEmpty) break;
      }
    });
    await tester.pump();
  }

  testWidgets('🔴 доска Solo появляется, а не вечная загрузка', (tester) async {
    await boot(tester, 'Solo');
    expect(find.text(L.t('puzzlesSolo')), findsOneWidget);
    expect(find.byKey(const Key('board')), findsOneWidget);
    expect(find.byKey(const Key('digit9')), findsOneWidget, reason: 'девять клавиш у Solo 9×9');
    expect(find.text('1/5'), findsOneWidget, reason: 'первая из пяти ступеней');
  });

  testWidgets('🔴 «Нежить»: клавиши подписаны чудовищами, а не голыми цифрами', (tester) async {
    await boot(tester, 'Undead');
    // Отзыв 17.09: «1 2 3» не говорили, какое чудовище ставят. Порядок — из undead.c.
    expect(find.text('👻'), findsOneWidget);
    expect(find.text('🧛'), findsOneWidget);
    expect(find.text('🧟'), findsOneWidget);
    expect(find.byKey(const Key('digit4')), findsNothing, reason: 'чудовищ трое');
  });

  Future<void> loseFlood(WidgetTester tester) async {
    final engine = PuzzlesScreen.debugEngine!;
    for (var move = 0; move < 80 && engine.status == 0; move++) {
      final before = engine.statePos;
      final cells = PuzzleFrame.parse(engine.draw()).ops.whereType<OpRect>()
          .where((r) => r.w == r.h && r.w > 5 && r.w < engine.size.w / 3).toList();
      expect(cells, isNotEmpty);
      final box = tester.getRect(find.byKey(const Key('board')));
      for (final cell in cells) {
        await tester.tapAt(Offset(box.left + (cell.x + cell.w / 2) * box.width / engine.size.w,
            box.top + (cell.y + cell.h / 2) * box.height / engine.size.h));
        await tester.pump();
        if (engine.statePos > before) break;
      }
      expect(engine.statePos, greaterThan(before));
    }
    expect(engine.status, -1, reason: 'настоящий C-движок должен проиграть от лимита, не заглушка');
  }

  testWidgets('Заливка: поражение даёт понятный итог и рабочий повтор, не тупик FAILED', (tester) async {
    final reports = <Map<String, dynamic>>[];
    SessionReport.sink = (body) async => reports.add(jsonDecode(body) as Map<String, dynamic>);
    addTearDown(() => SessionReport.sink = null);
    await state.set('psygames_puzzles_flood_level_nzt48', '2');
    await boot(tester, 'Flood');
    await loseFlood(tester);
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('puzzle-loss')), findsOneWidget);
    expect(find.textContaining('FAILED'), findsNothing);
    expect(find.byKey(const Key('puzzle-retry')), findsOneWidget);
    expect(reports.length, 1);
    expect(state.get('psygames_puzzles_flood_level_nzt48'), '2');
    final terminalPosition = PuzzlesScreen.debugEngine!.statePos;
    await tester.tap(find.byKey(const Key('board')));
    await tester.pump();
    expect(PuzzlesScreen.debugEngine!.statePos, terminalPosition,
        reason: 'после поражения поле не продолжает скрыто принимать ходы');
    expect(reports.length, 1);
    await tester.tap(find.byKey(const Key('puzzle-retry')));
    await tester.pumpAndSettle();
    expect(PuzzlesScreen.debugEngine!.status, 0);
    expect(find.byKey(const Key('puzzle-loss')), findsNothing);
    expect(find.text('2/7'), findsOneWidget);
    expect(reports.length, 1, reason: 'повтор не создаёт вторую партию сам по себе');
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('Сапёр: та же общая ветка поражения позволяет начать новую попытку', (tester) async {
    final reports = <Map<String, dynamic>>[];
    SessionReport.sink = (body) async => reports.add(jsonDecode(body) as Map<String, dynamic>);
    addTearDown(() => SessionReport.sink = null);
    await boot(tester, 'Mines');
    final engine = PuzzlesScreen.debugEngine!;
    final box = tester.getRect(find.byKey(const Key('board')));
    // Mines draws tile faces as polygons (including its non-square grids), not
    // Flood's rectangles. Use visible tile coordinates, not an assumed grid.
    final cells = PuzzleFrame.parse(engine.draw()).ops.whereType<OpPoly>()
        .where((p) => p.points.length >= 6).toList();
    expect(cells, isNotEmpty);
    for (final cell in cells) {
      if (engine.status != 0 || engine.statusText.contains('DEAD!')) break;
      var x = 0.0, y = 0.0;
      for (var i = 0; i < cell.points.length; i += 2) {
        x += cell.points[i];
        y += cell.points[i + 1];
      }
      final vertices = cell.points.length / 2;
      await tester.tapAt(Offset(box.left + x / vertices * box.width / engine.size.w,
          box.top + y / vertices * box.height / engine.size.h));
      await tester.pump();
    }
    expect(engine.statusText, contains('DEAD!'), reason: 'настоящее попадание на мину');
    expect(engine.status, 0, reason: 'C-движок намеренно оставляет возможность отмены');
    expect(reports, isEmpty, reason: 'не превращать обратимый тупик в выдуманный проигрыш');
    expect(find.text(L.t('puzzleRoundLost')), findsOneWidget);
    expect(find.byKey(const Key('puzzle-retry')), findsOneWidget);
    await tester.tap(find.byTooltip(L.t('btn_undo')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('puzzle-loss')), findsNothing);
    expect(find.text(L.t('puzzleLossReview')), findsNothing,
        reason: 'отмена обратимого тупика сохраняет исходную самостоятельную попытку');
    expect(reports, isEmpty);
    // Repeat through the persistent shell action after undo.
    await tester.tap(find.byTooltip(L.t('restart')));
    await tester.pumpAndSettle();
    expect(engine.status, 0);
    expect(find.byKey(const Key('puzzle-loss')), findsNothing);
    await tester.pumpWidget(const SizedBox());
  });

  for (final locale in ['ru', 'en']) {
    testWidgets('Заливка: итог и повтор доступны на маленьком экране $locale', (tester) async {
      tester.view.physicalSize = const Size(320, 568);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await L.load(locale);
      addTearDown(() => L.load('ru'));
      await boot(tester, 'Flood');
      await loseFlood(tester);
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull, reason: 'итог не должен переполнять экран');
      expect(find.byKey(const Key('puzzle-retry')).hitTestable(), findsOneWidget);
      final summary = tester.widget<Text>(find.descendant(
          of: find.byKey(const Key('puzzle-loss')), matching: find.byType(Text)).first).data!;
      expect(summary, isNot(contains('FAILED')));
      if (locale == 'en') expect(RegExp(r'[А-Яа-яЁё]').hasMatch(summary), isFalse);
      await tester.tap(find.byKey(const Key('puzzle-retry')));
      await tester.pumpAndSettle();
      expect(PuzzlesScreen.debugEngine!.status, 0);
      await tester.pumpWidget(const SizedBox());
    });
  }

  testWidgets('Заливка: отмена после поражения — разбор, второй исход не записывается', (tester) async {
    final reports = <Map<String, dynamic>>[];
    SessionReport.sink = (body) async => reports.add(jsonDecode(body) as Map<String, dynamic>);
    addTearDown(() => SessionReport.sink = null);
    await boot(tester, 'Flood');
    await loseFlood(tester);
    await tester.pumpAndSettle();
    expect(reports.length, 1);
    final failed = PuzzlesScreen.debugEngine!.statePos;
    await tester.tap(find.byTooltip(L.t('btn_undo')));
    await tester.pumpAndSettle();
    expect(PuzzlesScreen.debugEngine!.statePos, lessThan(failed));
    expect(PuzzlesScreen.debugEngine!.status, 0);
    expect(find.byKey(const Key('puzzle-loss')), findsNothing);
    expect(find.text(L.t('puzzleLossReview')), findsOneWidget);
    await loseFlood(tester);
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('puzzle-loss')), findsOneWidget);
    expect(reports.length, 1, reason: 'одна попытка — один исход, даже после отмены');
    await tester.pumpWidget(const SizedBox());
  });

  /*
   * 🔴 «ПОКАЗАТЬ РЕШЕНИЕ» — РАЗБОР, А НЕ ПОБЕДА (исправлено 30.09.2026, задача 543d853c).
   * До этого проба требовала, чтобы решатель ПОДНИМАЛ ступень, — то есть закрепляла
   * дефект: веб (`frontend/app/games/puzzles.tsx`, «разбор») ступень за просмотр ответа
   * не двигает ни вверх, ни вниз, а отчёты тестировщиков 8a1b20d6 и 67561a7f были ровно
   * про этот исход. Теперь проба держит правильное: ответ показан, «Дальше» есть,
   * ступень прежняя, следующая раздача — на той же ступени.
   */
  testWidgets('🔴 «Показать решение» доводит доску до ответа, но ступень не двигает', (tester) async {
    await boot(tester, 'Solo');
    expect(find.byKey(const Key('next')), findsNothing);

    await tester.tap(find.byTooltip('Показать решение'));
    await tester.pump();

    expect(find.byKey(const Key('next')), findsOneWidget, reason: 'ответ показан — дальше идти можно');
    expect(state.get('psygames_puzzles_solo_level_nzt48'), '1',
        reason: 'ступень за просмотр ответа не растёт — как в вебе');

    // «Дальше» раздаёт новую доску той же ступени, а не оставляет решённую.
    await tester.tap(find.byKey(const Key('next')));
    await tester.pump();
    expect(find.byKey(const Key('next')), findsNothing);
    expect(find.text('1/5'), findsOneWidget);
  });

  /// ⚠️ СРАВНИВАЕТСЯ СОДЕРЖИМОЕ КАДРА, А НЕ ОБЪЕКТ ХУДОЖНИКА. Первая редакция этой
  /// пробы смотрела `identical(after.painter, before.painter)` — и была зелёной ВСЕГДА:
  /// `setState` создаёт нового художника на каждую перерисовку, даже когда ход не
  /// состоялся. Цифры на доске приходят примитивами текста, поэтому ход виден по ним.
  testWidgets('🔴 тычок и клавиша дают ход, отмена его снимает', (tester) async {
    await boot(tester, 'Solo');

    String digest() {
      final paint = tester.widget<CustomPaint>(
        find.descendant(of: find.byKey(const Key('board')), matching: find.byType(CustomPaint)).first,
      );
      final painter = paint.painter! as PuzzlePainter;
      return painter.frame.ops.whereType<OpText>().map((t) => '${t.x},${t.y}:${t.text}').join('|');
    }

    final before = digest();
    expect(before.isNotEmpty, isTrue, reason: 'на доске Solo есть напечатанные цифры');

    // Тычки по сетке 9×9 плюс цифра: где-то попадём в пустую клетку.
    final box = tester.getRect(find.byKey(const Key('board')));
    var changed = false;
    for (var r = 0; r < 9 && !changed; r++) {
      for (var c = 0; c < 9 && !changed; c++) {
        await tester.tapAt(Offset(
          box.left + (c + 0.5) * box.width / 9,
          box.top + (r + 0.5) * box.height / 9,
        ));
        await tester.pump();
        await tester.tap(find.byKey(const Key('digit1')));
        await tester.pump();
        if (digest() != before) changed = true;
      }
    }
    expect(changed, isTrue, reason: 'ни один тычок с цифрой не изменил доску');

    await tester.tap(find.byTooltip('Отменить'));
    await tester.pump();
    expect(digest(), before, reason: 'отмена вернула доску ровно к тому, что было');
  });

  test('🔴 собраны ВСЕ 42 режима, а не только свои семь', () async {
    await PuzzleModes.load();
    expect(PuzzleModes.all.length, 42,
        reason: 'движок умеет 42 игры, и карточка нужна каждой; '
            'семь написанных руками были только у раздела «Судоку»');
  });

  test('🔴 ключ прогресса у каждого режима общий с веб-версией', () async {
    await PuzzleModes.load();
    for (final e in PuzzleModes.all.entries) {
      // Правило ВЕБА (puzzles.tsx: `.toLowerCase().replace(/\s+/g, '_')`), а не натива: проба,
      // сверявшая натив с его же правилом, 02.10 молчала о ключе с пробелом у четырёх режимов.
      expect(e.value.levelKey, 'puzzles_${e.key.toLowerCase().replaceAll(RegExp(r'\s+'), '_')}',
          reason: 'разойдётся ключ — разойдётся и прогресс, причём молча');
      expect(e.value.titleKey.isNotEmpty, isTrue,
          reason: '${e.key}: без ключа словаря название не переведётся');
      for (final st in e.value.steps) {
        expect(st.params.isNotEmpty, isTrue, reason: '${e.key}: пустые параметры ступени');
      }
    }
  });

  test('🔴 режимы с пробелом: ключ как в вебе, набранный нативно уровень переносится — большее из двух', () async {
    await PuzzleModes.load();
    final light = PuzzleModes.all['Light Up']!;
    expect(light.levelKey, 'puzzles_light_up');
    expect(PuzzleModes.all['Same Game']!.levelKey, 'puzzles_same_game');
    expect([for (final m in PuzzleModes.all.values) if (m.legacyLevelKey != null) m.engineName]..sort(),
        ['Black Box', 'Light Up', 'Same Game', 'Train Tracks']);
    // Нативно набрано 5, из веба пришло 3 — остаётся 5; и наоборот, веб 7 больше натива 5 — остаётся 7.
    final store = MemoryLevelStore();
    await store.writeInt('puzzles_light up.level', 5);
    await store.writeInt('puzzles_light_up.level', 3);
    await migrateLegacyLevel(light, store);
    expect(await store.readInt('puzzles_light_up.level'), 5);
    await store.writeInt('puzzles_light_up.level', 7);
    await migrateLegacyLevel(light, store);
    expect(await store.readInt('puzzles_light_up.level'), 7, reason: 'перенос не имеет права понизить уровень');
    // Режим без пробела — переносить нечего.
    expect(PuzzleModes.all['Net']!.legacyLevelKey, isNull);
  });

  test('у каждого режима есть владелец — иначе чинить будет некому', () async {
    await PuzzleModes.load();
    final noOwner = PuzzleModes.all.entries.where((e) => (e.value.owner ?? '').isEmpty);
    expect(noOwner.map((e) => e.key).toList(), isEmpty);
  });

  test('⚠️ у 28 режимов своей лестницы НЕТ, и это записано, а не забыто', () async {
    await PuzzleModes.load();
    final withLadder = PuzzleModes.all.values.where((m) => m.steps.isNotEmpty).length;
    // Трудность меряют исполнением, а не назначают: у кого лестницы нет, тот
    // берёт собственные пресеты движка. Число держим на виду, чтобы рост доли
    // своих лестниц был заметен, а падение — тем более.
    expect(withLadder, greaterThanOrEqualTo(14),
        reason: 'своих лестниц стало меньше — кто-то потерял замер раздела');
  });
}
