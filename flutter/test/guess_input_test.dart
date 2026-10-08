import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/puzzles/engine.dart';
import 'package:psygames_flutter/games/puzzles/frame.dart';
import 'package:psygames_flutter/games/puzzles/ladder.dart';
import 'package:psygames_flutter/games/puzzles/screen.dart';
import 'package:psygames_flutter/shell/aux_action.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 «УГАДАЙ КОД»: СПРАВКА ОПИСЫВАЕТ ТОТ ВВОД, КОТОРЫЙ ЕСТЬ НА ЭКРАНЕ (задача 3dc5edb4, 07.10.2026).
///
/// Режим приехал в «Счёт» из распущенных «Головоломок», и его справка обещала «нажатие ставит
/// цвет, долгое нажатие снимает». Движок устроен иначе (`guess.c:858–913`, справка автора
/// `puzzles.but:1401–1408`): цвет ПЕРЕТАСКИВАЮТ из лотка в ячейку, снимают — утащив фишку с поля,
/// а правая кнопка ставит метку «держать»: фишка сама переходит в следующую попытку. Замер
/// движка `frontend/scripts/puzzle-input-probe.mjs "Guess"` (зерно 777, 25 точек): тычок левой
/// 0/25, правая отличается 20/25.
///
/// Проба гоняет НАСТОЯЩИЙ движок и судит по КАДРУ, а не по ответу движка. Раскладка первой
/// ступени (4 цвета, 3 места) снята с кадра: лоток слева, `x = 31`, текущая попытка — верхний
/// ряд, `y = 32`, ячейки `x = 95 · 130 · 165` (координаты движка).
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final flutterDir = Directory.current.path;
  final libPath = '$flutterDir/build/tatham/${TathamEngine.libraryName}';
  late SharedState state;

  setUpAll(() async {
    await L.load('ru');
    if (File(libPath).existsSync()) return;
    final res = Process.runSync('bash', ['tool/build_tatham.sh'], workingDirectory: flutterDir);
    if (!File(libPath).existsSync()) {
      fail('движок не собран: bash tool/build_tatham.sh\n${res.stdout}\n${res.stderr}');
    }
  });

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
  });

  Future<void> boot(WidgetTester tester) async {
    await tester.runAsync(() async {
      await tester.pumpWidget(MaterialApp(home: PuzzlesScreen(state: state, mode: 'Guess', libraryPath: libPath)));
      for (var i = 0; i < 40; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 20));
        if (find.byKey(const Key('board')).evaluate().isNotEmpty) break;
      }
    });
    await tester.pump();
  }

  PuzzlePainter painterOf(WidgetTester tester) => tester
      .widget<CustomPaint>(find.descendant(of: find.byKey(const Key('board')), matching: find.byType(CustomPaint)).first)
      .painter! as PuzzlePainter;

  Offset at(WidgetTester tester, int x, int y) {
    final eng = painterOf(tester).engineSize;
    final box = tester.getRect(find.byKey(const Key('board')));
    final k = math.min(box.width / eng.w, box.height / eng.h);
    return Offset(box.left + (box.width - eng.w * k) / 2 + x * k, box.top + (box.height - eng.h * k) / 2 + y * k);
  }

  String digest(WidgetTester tester) => painterOf(tester).frame.ops.map((o) => switch (o) {
        OpRect r => 'R${r.x},${r.y},${r.w},${r.h}:${r.colour}',
        OpCircle c => 'C${c.cx},${c.cy}:${c.fill}',
        OpPoly p => 'P${p.points.join(',')}:${p.fill}',
        OpText t => 'T${t.x},${t.y}:${t.text}',
        _ => '',
      }).join('|');

  /// Цвет ячейки текущей попытки по кадру: заливка круга в этой точке.
  int fillAt(WidgetTester tester, int x, int y) =>
      painterOf(tester).frame.ops.whereType<OpCircle>().firstWhere((c) => c.cx == x && c.cy == y).fill;

  const tray = (31, 121), slot = (95, 32), nowhere = (31, 330);

  testWidgets('🔴 цвет ставится протяжкой из лотка, а не тычком; долгое нажатие его НЕ снимает', (tester) async {
    await boot(tester);
    final empty = fillAt(tester, slot.$1, slot.$2);
    final before = digest(tester);
    await tester.tapAt(at(tester, slot.$1, slot.$2));
    await tester.tapAt(at(tester, tray.$1, tray.$2));
    await tester.pump();
    expect(digest(tester), before, reason: 'тычок по ячейке и по лотку цвета не ставит');

    final from = at(tester, tray.$1, tray.$2);
    await tester.dragFrom(from, at(tester, slot.$1, slot.$2) - from);
    await tester.pump();
    final placed = fillAt(tester, slot.$1, slot.$2);
    expect(placed, isNot(empty), reason: 'протяжка из лотка в ячейку ставит цвет');

    await tester.longPressAt(at(tester, slot.$1, slot.$2));
    await tester.pump();
    expect(fillAt(tester, slot.$1, slot.$2), placed, reason: 'долгое нажатие цвет не снимает — справка не должна это обещать');

    final peg = at(tester, slot.$1, slot.$2);
    await tester.dragFrom(peg, at(tester, nowhere.$1, nowhere.$2) - peg);
    await tester.pump();
    expect(fillAt(tester, slot.$1, slot.$2), empty, reason: 'фишка, утащенная с поля, снимается');
  });

  testWidgets('🔴 второе действие называется «Оставить» и ставит метку «держать» на фишку попытки', (tester) async {
    await boot(tester);
    final second = find.byKey(const Key('puzzle-second-action'));
    expect(second, findsOneWidget, reason: 'у «Угадай код» есть второе действие — правая кнопка автора');
    expect(tester.widget<AuxAction>(second).label, L.t('puzzleSecondKeep'),
        reason: 'подпись называет, что кнопка делает здесь, а не общее «Второе действие»');

    final from = at(tester, tray.$1, tray.$2);
    await tester.dragFrom(from, at(tester, slot.$1, slot.$2) - from);
    await tester.pump();
    final placed = digest(tester);

    await tester.tap(second);
    await tester.pump();
    await tester.tapAt(at(tester, slot.$1, slot.$2));
    await tester.pump();
    final held = digest(tester);
    expect(held, isNot(placed), reason: 'метка «держать» видна на кадре');
    expect(fillAt(tester, slot.$1, slot.$2), isNot(fillAt(tester, 130, 32)),
        reason: 'метка не стирает цвет: в ячейке по-прежнему фишка, соседняя пуста');

    await tester.tapAt(at(tester, slot.$1, slot.$2));
    await tester.pump();
    expect(digest(tester), placed, reason: 'второе нажатие снимает метку');
  });

  testWidgets('🔴 цифры под полем ставят цвет по порядку, а ряд засчитывается нажатием на метки справа', (tester) async {
    await boot(tester);
    final empty = fillAt(tester, 95, 32);
    expect(find.byKey(const Key('digit1')), findsOneWidget, reason: 'клавиши цветов под полем есть');
    await tester.tap(find.byKey(const Key('digit1')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('digit2')));
    await tester.pump();
    expect(fillAt(tester, 95, 32), isNot(empty), reason: 'цифра ставит цвет в первую ячейку');
    expect(fillAt(tester, 130, 32), isNot(empty), reason: 'и курсор идёт дальше — вторая цифра во вторую');
    expect(fillAt(tester, 95, 32), isNot(fillAt(tester, 130, 32)), reason: 'цифра 1 и цифра 2 — разные цвета');
    await tester.tap(find.byKey(const Key('digit3')));
    await tester.pump();
    final full = digest(tester);
    // Ряд полон — засчитать его можно нажатием на поле меток справа от ряда (`over_hint`).
    await tester.tapAt(at(tester, 200, 32));
    await tester.pump();
    expect(digest(tester), isNot(full), reason: 'нажатие на метки справа засчитывает ряд');
    final from = at(tester, tray.$1, tray.$2);
    await tester.dragFrom(from, at(tester, 95, 67) - from);
    await tester.pump();
    expect(fillAt(tester, 95, 67), isNot(empty), reason: 'следующая попытка — второй ряд');
  });

  test('🔴 подпись второго действия КАЖДОГО режима есть в словаре КАЖДОГО языка, а не имя ключа', () {
    // 📍 07.10.2026: у Guess, Slant, Black Box и Unruly (`"secondKey": true`) кнопка показывала
    // «puzzleSecondAction» — запасной ключ шёл не литералом в L.t, и сборщик словаря его не брал.
    // Ключ берётся по тем же правилам, что у экрана (ladder.dart: строка — она, true — общая).
    final modes = (jsonDecode(File('assets/puzzles/modes.json').readAsStringSync()) as Map<String, dynamic>);
    final all = (modes['modes'] ?? modes) as Map<String, dynamic>;
    final keys = <String, String>{};
    all.forEach((name, raw) {
      final m = raw as Map<String, dynamic>;
      final second = switch (m['secondKey']) {
        final String k when k.isNotEmpty => k,
        true => puzzleFallbackKeys.first,
        _ => null,
      };
      if (second != null) keys['$name · второе'] = second;
      final pick = m['secondPickKey'];
      if (pick is String && pick.isNotEmpty) keys['$name · выбор 2'] = pick;
    });
    expect(keys.values, contains(puzzleFallbackKeys.first), reason: 'премиса: режимы с общей подписью есть');
    final missing = <String>[];
    for (final f in Directory('assets/l10n').listSync().whereType<File>().where((f) => RegExp(r'/[a-z]{2}\.json$').hasMatch(f.path))) {
      final raw = jsonDecode(f.readAsStringSync()) as Map<String, dynamic>;
      final dict = (raw['strings'] ?? raw) as Map<String, dynamic>;
      keys.forEach((where, key) {
        if (dict[key] is! String) missing.add('${f.uri.pathSegments.last} $where: $key');
      });
    }
    expect(missing, isEmpty);
  });
}
