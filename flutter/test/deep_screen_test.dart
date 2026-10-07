import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/deep/screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// «БЕЗДНА» ИГРАЕТСЯ НАЖАТИЯМИ — И ГЛАВНОЕ, ПЕРЕЖИВАЕТ ВЫХОД.
///
/// Партия здесь идёт неделями, поэтому проверяются два свойства, без которых она
/// бессмысленна: ПРОДОЛЖЕНИЕ (снимок пишется в тот же ключ и в том же виде, что у
/// веб-версии) и ПОДЪЁМ НАВЕРХ (провалился вниз — вернись).
void main() {
  // Пробы ищут русские подписи — словарь грузится явно (без него L.t вернёт ключ).
  setUpAll(() async => L.load('ru'));
  late SharedState state;

  const resumeKey = 'psygames_resume_sudoku_fractal_deep_nzt48';

  /// Открыть «Бездну»; без снимка первый вход — окно настройки, «Начать» берёт по умолчанию.
  Future<void> boot(WidgetTester tester) async {
    await tester.runAsync(() async {
      await tester.pumpWidget(MaterialApp(home: DeepScreen(state: state)));
      var started = false;
      for (var i = 0; i < 60; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 20));
        final start = find.byKey(const Key('deep-start'));
        if (!started && start.evaluate().isNotEmpty) {
          await tester.tap(start);
          started = true;
        }
        if (find.byKey(const Key('cell_0_0')).evaluate().isNotEmpty) break;
      }
    });
    await tester.pumpAndSettle();
  }

  Future<void> tap(WidgetTester tester, Finder f) async {
    await tester.tap(f, warnIfMissed: false);
    await tester.pump();
  }

  int digitAt(WidgetTester tester, int r, int c) {
    final cell = find.byKey(Key('cell_${r}_$c'));
    final text = find.descendant(of: cell, matching: find.byType(Text));
    if (text.evaluate().isEmpty) return 0;
    final s = tester.widget<Text>(text.first).data ?? '';
    return s.isEmpty ? 0 : int.parse(s);
  }

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
  });

  /// 🔴 ПЕРВЫЙ ВХОД — «КАК ИГРАТЬ» ДО ДОСКИ (сверка 138f7818, строка 393; задача b5df5096 п.10).
  /// Веб без снимка открывает экран настройки с карточкой `deepHowTo`; натив раздавал доску
  /// молча, и правило «проваливайся в пунктирные клетки» с доски было не угадать.
  testWidgets('🔴 первый вход: сначала «как играть» и выбор, доска — только после «Начать»', (tester) async {
    await tester.runAsync(() async {
      await tester.pumpWidget(MaterialApp(home: DeepScreen(state: state)));
      for (var i = 0; i < 60; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 20));
        if (find.byKey(const Key('deep-howto')).evaluate().isNotEmpty) break;
      }
    });
    await tester.pumpAndSettle();
    final howTo = find.byKey(const Key('deep-howto'));
    expect(howTo, findsOneWidget, reason: 'без снимка экран открывается настройкой с карточкой правила');
    expect(tester.widget<Text>(howTo).data, L.t('deepHowTo'));
    expect(L.t('deepHowTo'), contains('пунктирн'), reason: 'карточка — текст веба, а не сырой ключ');
    expect(find.byKey(const Key('deep-preset-abyss')), findsOneWidget, reason: 'объём выбирается тут же');
    expect(find.byKey(const Key('cell_0_0')), findsNothing, reason: 'доска не раздаётся молча до выбора');
    expect(state.get(resumeKey), isNull, reason: 'партии ещё нет');

    await tester.runAsync(() async {
      await tester.tap(find.byKey(const Key('deep-start')));
      for (var i = 0; i < 40; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 10));
        if (find.byKey(const Key('cell_0_0')).evaluate().isNotEmpty) break;
      }
    });
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('cell_8_8')), findsOneWidget, reason: '«Начать» раздаёт доску');
    expect(state.get(resumeKey), isNotNull, reason: 'и партия сразу пишется в снимок');
  });

  testWidgets('🔴 «Отмена» на первом входе — уход с экрана, партия не заводится', (tester) async {
    await tester.runAsync(() async {
      await tester.pumpWidget(MaterialApp(
        home: Builder(
          builder: (c) => Scaffold(
            body: ElevatedButton(
              key: const Key('hub'),
              onPressed: () => Navigator.of(c).push(MaterialPageRoute<void>(builder: (_) => DeepScreen(state: state))),
              child: const Text('hub'),
            ),
          ),
        ),
      ));
      await tester.tap(find.byKey(const Key('hub')));
      for (var i = 0; i < 60; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 20));
        if (find.byKey(const Key('deep-cancel')).evaluate().isNotEmpty) break;
      }
    });
    await tester.pumpAndSettle();
    // Окно открыто из настоящего асинхронного хода загрузки — его продолжение ждёт
    // настоящего цикла событий (как «Начать» в пробе двери), поэтому и «Отмена» — здесь.
    await tester.runAsync(() async {
      await tester.tap(find.byKey(const Key('deep-cancel')));
      for (var i = 0; i < 40; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 10));
        if (find.byType(DeepScreen).evaluate().isEmpty) break;
      }
    });
    await tester.pumpAndSettle();
    expect(find.byType(DeepScreen), findsNothing, reason: '«Отмена» на настройке — назад, как «назад» с экрана настройки веба');
    expect(find.byKey(const Key('hub')), findsOneWidget);
    expect(state.get(resumeKey), isNull, reason: 'ушёл, не начав, — снимка нет');
  });

  testWidgets('🔴 «?» показывает правило «Бездны» — тот же текст, что «?» веба', (tester) async {
    await boot(tester);
    final help = find.byTooltip(L.t('btn_rules'));
    expect(help, findsOneWidget, reason: 'по адресу каркас правила не найдёт — экран даёт его сам');
    await tester.tap(help);
    await tester.pumpAndSettle();
    // Ключ — из helpMap веба (introKey маршрута), сверка с исходником, а не с памятью.
    final helpMap = File('../frontend/src/constants/helpMap.ts').readAsStringSync();
    final entry = RegExp(r'"/games/sudoku-fractal-deep":\s*\{[^}]*"introKey":\s*"(\w+)"').firstMatch(helpMap);
    expect(entry, isNotNull, reason: 'у веба есть справка «Бездны»');
    final text = tester.widget<Text>(find.byKey(const Key('game-rules-text'))).data;
    expect(text, L.t(entry!.group(1)!));
    expect(text, isNot(entry.group(1)), reason: 'текст из словаря, а не сырой ключ');
  });

  testWidgets('🔴 кормимые клетки обведены пунктиром — на него ссылается карточка «как играть»', (tester) async {
    await boot(tester);
    final rings = tester
        .widgetList<CustomPaint>(find.byWidgetPredicate((w) => w is CustomPaint && w.painter is FedRingPainter))
        .map((w) => w.painter as FedRingPainter)
        .toList();
    expect(rings, isNotEmpty, reason: 'у кормимых клеток нет кольца');
    expect(rings.length, find.byIcon(Icons.arrow_downward).evaluate().length,
        reason: 'кольцо — у каждой кормимой клетки, и только у них');
    expect(rings.every((p) => p.dashed), isTrue, reason: 'свежая партия: снизу ничего не пришло — все кольца пунктиром');
  });

  testWidgets('🔴 доска появляется, и партия сразу записана в снимок', (tester) async {
    await boot(tester);
    expect(find.text('Бездна'), findsOneWidget);
    expect(find.byKey(const Key('cell_8_8')), findsOneWidget);
    expect(find.text('1/2'), findsOneWidget, reason: 'глубина: корень из двух слоёв');

    final raw = state.get('psygames_resume_sudoku_fractal_deep_nzt48');
    expect(raw, isNotNull, reason: 'снимок пишется сразу, а не при выходе');
    final env = jsonDecode(raw!) as Map<String, Object?>;
    expect(env['v'], 1, reason: 'версия снимка та же, что у веб-версии');
    final s = (env['state'] as Map).cast<String, Object?>();
    expect(s['preset'], 'scout');
    expect((s['seed'] as String).isNotEmpty, isTrue);
    expect(s['path'], '');
    expect((s['history'] as Map).containsKey('past'), isTrue,
        reason: 'лента ходов в том же виде, что у веб-версии');
  });

  /// 🔴 ПРОВАЛ ВНИЗ И ПОДЪЁМ ОБРАТНО — то, без чего дерево становится ловушкой.
  testWidgets('🔴 тычок в кормимую клетку уводит вниз, «Наверх» возвращает', (tester) async {
    await boot(tester);
    expect(find.byTooltip('Наверх'), findsNothing, reason: 'на корне подниматься некуда');

    // Кормимая клетка помечена стрелкой вниз — туда и тычем.
    final arrow = find.byIcon(Icons.arrow_downward);
    expect(arrow, findsWidgets, reason: 'кормимые клетки видны человеку');
    await tap(tester, arrow.first);

    expect(find.text('2/2'), findsOneWidget, reason: 'ушли на слой ниже');
    expect(find.byTooltip('Наверх'), findsOneWidget);

    await tap(tester, find.byTooltip('Наверх'));
    expect(find.text('1/2'), findsOneWidget, reason: 'вернулись на слой выше');
    expect(find.byTooltip('Наверх'), findsNothing);
  });

  testWidgets('🔴 цифра встаёт, отмена снимает, и всё это попадает в снимок', (tester) async {
    await boot(tester);
    // Первая пустая клетка, не кормимая (у кормимых стоит стрелка).
    late int er, ec;
    var found = false;
    for (var r = 0; r < 9 && !found; r++) {
      for (var c = 0; c < 9 && !found; c++) {
        final cell = find.byKey(Key('cell_${r}_$c'));
        final hasArrow = find.descendant(of: cell, matching: find.byIcon(Icons.arrow_downward));
        if (digitAt(tester, r, c) == 0 && hasArrow.evaluate().isEmpty) {
          er = r; ec = c; found = true;
        }
      }
    }
    expect(found, isTrue, reason: 'нашлась пустая клетка для хода');

    await tap(tester, find.byKey(Key('cell_${er}_$ec')));
    await tap(tester, find.byKey(const Key('digit7')));
    expect(digitAt(tester, er, ec), 7);

    final saved = jsonDecode(state.get('psygames_resume_sudoku_fractal_deep_nzt48')!)
        as Map<String, Object?>;
    final past = (((saved['state'] as Map)['history'] as Map)['past'] as List);
    expect(past.length, 1, reason: 'ход записан в ленту снимка');

    await tap(tester, find.byTooltip('Отменить'));
    expect(digitAt(tester, er, ec), 0, reason: 'отмена вернула клетку');
  });

  /// Первая пустая клетка корня, не кормимая (у кормимых стрелка вниз).
  ({int r, int c}) freeCell(WidgetTester tester, {({int r, int c})? skip}) {
    for (var r = 0; r < 9; r++) {
      for (var c = 0; c < 9; c++) {
        if (skip != null && skip.r == r && skip.c == c) continue;
        final arrow = find.descendant(of: find.byKey(Key('cell_${r}_$c')), matching: find.byIcon(Icons.arrow_downward));
        if (digitAt(tester, r, c) == 0 && arrow.evaluate().isEmpty) return (r: r, c: c);
      }
    }
    fail('свободной клетки нет');
  }

  List<List<int>> savedMarks(String path) {
    final s = ((jsonDecode(state.get(resumeKey)!) as Map)['state'] as Map);
    final m = (s['marks'] as Map)[path] as List;
    return [for (final row in m) [for (final v in row as List) (v as num).toInt()]];
  }

  /// 🔴 КАРАНДАШ (сверка 138f7818, «Бездна» строка 17, «высокая»): без пометок многие доски
  /// верхних полос «в голове» не решаются. Формат — веба: битмаска на клетку, по узлам.
  testWidgets('🔴 карандаш: пометки ставятся, пишутся в снимок, ластик чистит клетку, цифра гасит', (tester) async {
    await boot(tester);
    final d = freeCell(tester);
    await tap(tester, find.byKey(Key('cell_${d.r}_${d.c}')));
    await tap(tester, find.byKey(const Key('pencil')));
    await tap(tester, find.byKey(const Key('digit3')));
    await tap(tester, find.byKey(const Key('digit7')));
    expect(find.byKey(Key('marks_${d.r}_${d.c}')), findsOneWidget, reason: 'пометки видны на клетке');
    expect(digitAt(tester, d.r, d.c), 0, reason: 'карандаш не ставит цифру');
    expect(savedMarks('')[d.r][d.c], (1 << 2) | (1 << 6), reason: 'битмаска веба: бит n−1 = цифра n');

    await tap(tester, find.byKey(const Key('digit7')));
    expect(savedMarks('')[d.r][d.c], 1 << 2, reason: 'повторная цифра снимает пометку');
    await tap(tester, find.byKey(const Key('erase')));
    expect(savedMarks('')[d.r][d.c], 0, reason: 'ластик в карандаше чистит клетку целиком');

    await tap(tester, find.byKey(const Key('digit5')));
    await tap(tester, find.byKey(const Key('pencil')));   // карандаш выключен
    await tap(tester, find.byKey(const Key('digit4')));
    expect(digitAt(tester, d.r, d.c), 4);
    expect(savedMarks('')[d.r][d.c], 0, reason: 'рука закрыла клетку — пометки под ней стёрты');
    expect(find.byKey(Key('marks_${d.r}_${d.c}')), findsNothing);

    await tap(tester, find.byKey(const Key('pencil')));
    await tap(tester, find.byKey(const Key('digit2')));
    expect(savedMarks('')[d.r][d.c], 0, reason: 'по клетке с рукой карандаш не работает — как у веба');
  });

  testWidgets('🔴 пометки из снимка веба поднимаются на свою клетку', (tester) async {
    await boot(tester);   // партия «Разведки»: свободная клетка своей доски
    final d = freeCell(tester);
    await tester.pumpWidget(const SizedBox());
    final env = (jsonDecode(state.get(resumeKey)!) as Map).cast<String, Object?>();
    final st = (env['state'] as Map).cast<String, Object?>();
    final marks = [for (var r = 0; r < 9; r++) List<int>.filled(9, 0)];
    marks[d.r][d.c] = 1 | (1 << 8);
    st['marks'] = {'': marks};   // как пишет веб: узел → битмаски
    env['state'] = st;
    state.set(resumeKey, jsonEncode(env));
    await boot(tester);
    expect(find.byKey(Key('marks_${d.r}_${d.c}')), findsOneWidget, reason: 'пометки веба поднялись');
    expect(savedMarks('')[d.r][d.c], 1 | (1 << 8));
  });

  /// 🔴 ПРОДОЛЖЕНИЕ: партия поднимается из снимка ровно той же.
  testWidgets('🔴 снимок веб-версии продолжается: то же зерно, тот же узел, те же цифры',
      (tester) async {
    const seed = 'бездна-проверка-продолжения';
    SharedPreferences.setMockInitialValues({
      'psygames_resume_sudoku_fractal_deep_nzt48': jsonEncode({
        'v': 1,
        'savedAt': 1758600000000,
        'state': {
          'preset': 'trek',
          'band': 2,
          'rating': 2.6,
          'seed': seed,
          'path': '',
          'grids': <String, Object?>{},
          'marks': <String, Object?>{},
          'history': {'past': <Object?>[], 'future': <Object?>[]},
        },
      }),
    });
    state = await SharedState.open();
    await boot(tester);

    expect(find.byKey(const Key('deep-new')), findsNothing, reason: 'снимок есть — окна настройки нет, партия сразу');
    expect(find.text('1/3'), findsOneWidget, reason: 'пресет «Поход» — три слоя');
    expect(find.text('3/6'), findsOneWidget, reason: 'ступень из снимка, а не по умолчанию');

    // ⚠️ ПРОВЕРЯТЬ НАДО ТО, ЧТО ЗАПИСЫВАЕТ ЭКРАН, А НЕ ТО, ЧТО ПОЛОЖИЛА ПРОБА.
    // Первая редакция читала снимок сразу после загрузки — то есть свой же исходный
    // текст, и мутация «затирать чужие поля» прошла мимо. Поэтому сначала делаем
    // действие, которое заставляет экран ПЕРЕЗАПИСАТЬ снимок.
    await tap(tester, find.byIcon(Icons.arrow_downward).first);
    expect(find.text('2/3'), findsOneWidget, reason: 'ушли вниз — снимок перезаписан');

    final saved = jsonDecode(state.get('psygames_resume_sudoku_fractal_deep_nzt48')!)
        as Map<String, Object?>;
    final s = (saved['state'] as Map).cast<String, Object?>();
    expect(s['seed'], seed, reason: 'зерно то же — иначе дерево пересоберётся другим');
    expect(s.containsKey('marks'), isTrue, reason: 'поля, которых мы не умеем, не затираются');
  });
}
