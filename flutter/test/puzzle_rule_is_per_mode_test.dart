import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/puzzles/engine.dart';
import 'package:psygames_flutter/games/puzzles/screen.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:psygames_flutter/games/puzzles/ladder.dart';
import 'package:psygames_flutter/shell/l10n.dart';

/// 🔴 ПОД ДОСКОЙ — ПРАВИЛО СВОЕГО РЕЖИМА, А НЕ ОДНА ФРАЗА НА ВСЕ СОРОК ДВА.
///
/// 📍 ПОВОД, Денис 24.09.2026, кадр «Мостов» с нативной сборки: над доской пусто,
/// внизу «Тычок отмечает клетку». Для «Мостов» это прямая неправда — ход там
/// протяжкой от острова к острову. Два отзыва ровно про это: dd4cda8a («почему
/// не засчитывает») и d99eae48 («как повернуть — непонятно», а поворота в
/// «Рельсах» нет вовсе).
///
/// ⚠️ И ВТОРОЕ, ЧТО ЭТА ПРОБА СТОРОЖИТ: промах словаря МОЛЧАЛИВ. `L.t` при
/// отсутствии ключа возвращает САМ КЛЮЧ, а не падает, — человек увидел бы на
/// экране `puzzlesBridgesDesc`. Поэтому проверяется не только «строка есть», но и
/// «строка не равна ключу».
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  // ⚠️ `PuzzleModes.all` — СТАТИЧЕСКАЯ карта, а `load()` ничего не возвращает.
  final flutterDir = Directory.current.path;
  final libPath = '$flutterDir/build/tatham/${TathamEngine.libraryName}';

  setUpAll(() async {
    await L.load('ru');
    await PuzzleModes.load();
    if (File(libPath).existsSync()) return;
    final res = Process.runSync('bash', ['tool/build_tatham.sh'], workingDirectory: flutterDir);
    if (!File(libPath).existsSync()) {
      fail('движок не собран: bash tool/build_tatham.sh\n${res.stdout}\n${res.stderr}');
    }
  });

  test('премиса: разобраны все сорок два режима', () {
    expect(PuzzleModes.all.length, 42);
  });

  test('🔴 у КАЖДОГО режима своё правило, и это не ключ словаря', () {
    final silent = <String>[];
    final rawKey = <String>[];
    for (final m in PuzzleModes.all.values) {
      final r = m.rule;
      if (r == null || r.isEmpty) {
        silent.add(m.engineName);
        continue;
      }
      if (r == m.descKey) rawKey.add(m.engineName);
    }
    expect(silent, isEmpty, reason: 'режим остался бы с общей фразой на все сорок два');
    expect(rawKey, isEmpty, reason: 'на экране показался бы сам ключ словаря');
  });

  test('🔴 правила РАЗНЫЕ: общей фразы на всех больше нет', () {
    final texts = PuzzleModes.all.values.map((m) => m.rule).whereType<String>().toSet();
    // Сорок два режима — сорок два разных текста; совпадение означало бы, что
    // два режима снова объясняются одними словами.
    expect(texts.length, PuzzleModes.all.length);
  });

  test('🔴 правило СВОИХ режимов отвечает на «чем ходить», а не только «что собрать»', () {
    // Тот же список глаголов, что сторожит веб-сторона
    // (`frontend/src/__tests__/puzzle-rules-say-where-to-tap.test.ts`).
    //
    // ⚠️ ТОЛЬКО СВОИ ДЕВЯТЬ, А НЕ ВСЕ СОРОК ДВА. В вебе это требование стоит на
    // режимах раздела «Сортировки» — по решению Дениса о приёмке. Накладывать
    // его на 33 чужих режима значило бы завести соседям красный гейт без их
    // ведома: у них своя приёмка и свои сроки. Замер 24.09: у 33 чужих глагола
    // в правиле нет, и это их дело, а не поломка.
    final verbs = RegExp(r'Тапни|Нажми|Тяни|Протяни|стрелк', caseSensitive: false);
    final mine = PuzzleModes.all.values.where((m) => m.owner == 'psygames-sorting-claude-mac').toList();
    expect(mine.length, 9, reason: 'раздел потерял режимы — проверять стало нечего');
    final silent = mine
        .where((m) => !verbs.hasMatch(m.rule ?? ''))
        .map((m) => m.engineName)
        .toList();
    expect(silent, isEmpty);
  });

  test('🔴 правило влезает под доску: не длиннее 138 знаков', () {
    // Порог снят КАДРОМ на веб-стороне 24.09.2026: 136 знаков уложились в три
    // строки, 148 дали четыре, и четвёртая ушла под доску. Строка живёт в той же
    // полосе, поэтому порог тот же.
    final long = PuzzleModes.all.values
        .map((m) => '${m.engineName}: ${(m.rule ?? '').length}')
        .where((x) => int.parse(x.split(': ')[1]) > 138)
        .toList();
    expect(long, isEmpty);
  });

  test('режим без ключа правила не валит экран, а молчит', () {
    const none = PuzzleMode(engineName: 'Выдуманный', titleKey: 'нетТакого', steps: []);
    expect(none.rule, isNull);
    const empty = PuzzleMode(
        engineName: 'Выдуманный', titleKey: 'нетТакого', descKey: '', steps: []);
    expect(empty.rule, isNull);
  });

  test('🔴 ПРОМАХ СЛОВАРЯ отдаётся как «правила нет», а НЕ как ключ на экране', () {
    /*
     * ⚠️ ЭТОТ СЛУЧАЙ ПРИШЛОСЬ ЗАВЕСТИ ОТДЕЛЬНО — мутация показала дыру. Ломал
     * `rule` так, чтобы промах словаря возвращался текстом (`return t`), и проба
     * осталась ЗЕЛЁНОЙ: у всех сорока двух живых режимов ключ есть, и ветка
     * промаха на настоящих данных не срабатывает ни разу.
     * Здесь ключ заведомо несуществующий — ровно та строка, что мутировала.
     */
    const ghost = PuzzleMode(
        engineName: 'Выдуманный', titleKey: 'нетТакого', descKey: 'нетТакогоКлючаВСловаре', steps: []);
    expect(ghost.rule, isNull,
        reason: 'L.t при промахе отдаёт САМ КЛЮЧ — человек увидел бы его на экране');
  });

  test('правило берётся из СЛОВАРЯ каждый раз — человек меняет язык на ходу', () async {
    final bridges = PuzzleModes.all.values.firstWhere((m) => m.engineName == 'Bridges');
    expect(bridges.descKey, 'puzzlesBridgesDesc');
    expect(bridges.rule, contains('остров'));
    await L.load('en');
    expect(bridges.rule, isNot(contains('остров')), reason: 'по-английски текст другой');
    expect(bridges.rule!.toLowerCase(), contains('island'));
    await L.load('ru');
  });

  /*
   * 🔴 И ГЛАВНОЕ: ПРОБА СТОИТ ТАМ, ГДЕ ПРАВИЛО РИСУЕТСЯ, А НЕ ТОЛЬКО В МОДЕЛИ.
   *
   * ⚠️ Проверки выше доказывают, что правило ЕСТЬ у карточки режима. Мутация
   * «вернуть экран к общей фразе» их не красит ни одной: они не смотрят на экран.
   * Ниже — партия целиком, и строка читается с неё.
   */
  testWidgets('🔴 НА ЭКРАНЕ под доской стоит правило СВОЕГО режима', (tester) async {
    SharedPreferences.setMockInitialValues({'psygames_puzzles_bridges_level_nzt48': '1'});
    final state = await SharedState.open();
    tester.view.physicalSize = const Size(780, 1688);
    tester.view.devicePixelRatio = 2;
    addTearDown(tester.view.reset);

    await tester.runAsync(() async {
      await tester.pumpWidget(MaterialApp(
        home: PuzzlesScreen(state: state, mode: 'Bridges', libraryPath: libPath),
      ));
      for (var i = 0; i < 40; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 20));
        if (find.byKey(const Key('board')).evaluate().isNotEmpty) break;
      }
    });
    await tester.pump();

    final bridges = PuzzleModes.all.values.firstWhere((m) => m.engineName == 'Bridges');
    final line = tester.widget<Text>(find.byKey(const Key('puzzle-rule')));
    expect(line.data, bridges.rule,
        reason: 'под доской обязано стоять правило режима, а не общая фраза');
    expect(line.data, isNot('Тычок отмечает клетку'),
        reason: 'для «Мостов» это прямая неправда: ход протяжкой от острова к острову');
  });
}
