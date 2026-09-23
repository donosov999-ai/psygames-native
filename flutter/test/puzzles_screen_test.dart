import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/puzzles/engine.dart';
import 'package:psygames_flutter/games/puzzles/frame.dart';
import 'package:psygames_flutter/games/puzzles/ladder.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/games/puzzles/screen.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ЭКРАН ГОЛОВОЛОМОК ИГРАЕТСЯ НАЖАТИЯМИ, И ДВИЖОК ПОД НИМ — НАСТОЯЩИЙ.
///
/// Никаких заглушек: экран поднимает ту же библиотеку C, что поедет на телефон, рисует
/// её кадр и шлёт ей тычки. Проверяется то, что видит человек: доска появилась, тычок и
/// клавиша дают ход, отмена его снимает, решение доводит до победы и двигает ступень.
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
        home: PuzzlesScreen(state: state, mode: mode, libraryPath: libPath),
      ));
      for (var i = 0; i < 40; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 20));
        if (find.byKey(const Key('поле')).evaluate().isNotEmpty) break;
      }
    });
    await tester.pump();
  }

  testWidgets('🔴 доска Solo появляется, а не вечная загрузка', (tester) async {
    await boot(tester, 'Solo');
    expect(find.text(L.t('puzzlesSolo')), findsOneWidget);
    expect(find.byKey(const Key('поле')), findsOneWidget);
    expect(find.byKey(const Key('цифра9')), findsOneWidget, reason: 'девять клавиш у Solo 9×9');
    expect(find.text('1/5'), findsOneWidget, reason: 'первая из пяти ступеней');
  });

  testWidgets('🔴 «Нежить»: клавиши подписаны чудовищами, а не голыми цифрами', (tester) async {
    await boot(tester, 'Undead');
    // Отзыв 17.09: «1 2 3» не говорили, какое чудовище ставят. Порядок — из undead.c.
    expect(find.text('👻'), findsOneWidget);
    expect(find.text('🧛'), findsOneWidget);
    expect(find.text('🧟'), findsOneWidget);
    expect(find.byKey(const Key('цифра4')), findsNothing, reason: 'чудовищ трое');
  });

  testWidgets('🔴 решение доводит партию до победы и двигает ступень', (tester) async {
    await boot(tester, 'Solo');
    expect(find.byKey(const Key('дальше')), findsNothing);

    await tester.tap(find.byTooltip('Показать решение'));
    await tester.pump();

    expect(find.byKey(const Key('дальше')), findsOneWidget, reason: 'победа видна человеку');
    expect(state.get('psygames_puzzles_solo_level_nzt48'), '2',
        reason: 'ступень записана в тот же ключ, что у веб-версии');

    // «Дальше» раздаёт следующую ступень, а не оставляет решённую доску.
    await tester.tap(find.byKey(const Key('дальше')));
    await tester.pump();
    expect(find.byKey(const Key('дальше')), findsNothing);
    expect(find.text('2/5'), findsOneWidget);
  });

  /// ⚠️ СРАВНИВАЕТСЯ СОДЕРЖИМОЕ КАДРА, А НЕ ОБЪЕКТ ХУДОЖНИКА. Первая редакция этой
  /// пробы смотрела `identical(after.painter, before.painter)` — и была зелёной ВСЕГДА:
  /// `setState` создаёт нового художника на каждую перерисовку, даже когда ход не
  /// состоялся. Цифры на доске приходят примитивами текста, поэтому ход виден по ним.
  testWidgets('🔴 тычок и клавиша дают ход, отмена его снимает', (tester) async {
    await boot(tester, 'Solo');

    String digest() {
      final paint = tester.widget<CustomPaint>(
        find.descendant(of: find.byKey(const Key('поле')), matching: find.byType(CustomPaint)).first,
      );
      final painter = paint.painter! as PuzzlePainter;
      return painter.frame.ops.whereType<OpText>().map((t) => '${t.x},${t.y}:${t.text}').join('|');
    }

    final before = digest();
    expect(before.isNotEmpty, isTrue, reason: 'на доске Solo есть напечатанные цифры');

    // Тычки по сетке 9×9 плюс цифра: где-то попадём в пустую клетку.
    final box = tester.getRect(find.byKey(const Key('поле')));
    var changed = false;
    for (var r = 0; r < 9 && !changed; r++) {
      for (var c = 0; c < 9 && !changed; c++) {
        await tester.tapAt(Offset(
          box.left + (c + 0.5) * box.width / 9,
          box.top + (r + 0.5) * box.height / 9,
        ));
        await tester.pump();
        await tester.tap(find.byKey(const Key('цифра1')));
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
      expect(e.value.levelKey, 'puzzles_${e.key.toLowerCase()}',
          reason: 'разойдётся ключ — разойдётся и прогресс, причём молча');
      expect(e.value.titleKey.isNotEmpty, isTrue,
          reason: '${e.key}: без ключа словаря название не переведётся');
      for (final st in e.value.steps) {
        expect(st.params.isNotEmpty, isTrue, reason: '${e.key}: пустые параметры ступени');
      }
    }
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
