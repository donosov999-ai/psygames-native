import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/deep/portals.dart';
import 'package:psygames_flutter/games/deep/screen.dart';
import 'package:psygames_flutter/games/deep/tree.dart';
import 'package:psygames_flutter/games/fractal/rules.dart' show conflictsInChild;
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 ПОРТАЛЫ «БЕЗДНЫ» — ПЛАН БИТ В БИТ С ЖИВЫМ TS, И ИМИ МОЖНО ИГРАТЬ.
///
/// Сверка «веб против натива» 138f7818, «Бездна» строки 6 и 33. В вебе порталы включены
/// всегда, в нативе их не было: лист натива имел на одну подсказку больше и другой порог, и
/// снимок веба, продолженный здесь, ставил руку на клетку, которая у натива — подсказка.
/// План порталов — f(зерно, путь родителя, настройка), поэтому сверяется КАЖДОЕ поле плана с
/// выгрузкой живого `fractal-deep.ts` (`tools/export-deep-portals.cjs`), а экран — нажатиями.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const resumeKey = 'psygames_resume_sudoku_fractal_deep_nzt48';

  final data = jsonDecode(File('test/fixtures/deep-portals-reference.json').readAsStringSync())
      as Map<String, Object?>;
  final cases = (data['cases'] as List).cast<Map<String, Object?>>();
  final presets = {
    for (final p in (data['presets'] as List).cast<Map<String, Object?>>()) p['key'] as String: p,
  };
  final ratings = {
    for (final b in (data['bands'] as List).cast<Map<String, Object?>>())
      (b['band'] as num).toInt(): (b['rating'] as num).toDouble(),
  };

  DeepCfg cfgOf(Map<String, Object?> c) {
    final p = presets[c['preset']]!;
    final feed = p['feedCount'];
    return DeepCfg(
      depth: (p['depth'] as num).toInt(),
      rating: ratings[(c['band'] as num).toInt()]!,
      feedCount: feed is num ? feed.toInt() : null,   // 'all' → null
      unlockShare: (p['unlockShare'] as num).toDouble(),
    );
  }

  List<int> ints(Object? v) => (v as List).map((x) => (x as num).toInt()).toList();

  late DeepBank bank;
  setUpAll(() async {
    bank = await DeepBank.load();
    await L.load('ru');
  });

  test('счёт решений: целая доска — 1, противоречие — 0, снятая подсказка — уже не 1', () {
    final node = materializeNode(bank, 'счёт-решений', '', const DeepCfg(depth: 2, rating: 1.2, feedCount: 9, unlockShare: 0.24), 0);
    final flat = [for (final row in node.puzzle) ...row];
    expect(countSolutionsFast(flat), 1, reason: 'доска банка единственна');
    expect(countSolutionsFast([for (final row in node.solution) ...row]), 1);
    // Пустая клетка получает цифру, которая уже стоит подсказкой в той же строке.
    final i = flat.indexOf(0), row = i ~/ deepN;
    final j = [for (var k = row * deepN; k < row * deepN + deepN; k++) k].firstWhere((k) => flat[k] != 0);
    final bad = List<int>.of(flat)..[i] = flat[j];
    expect(countSolutionsFast(bad), 0, reason: 'повтор в строке — противоречие');
    expect(countSolutionsFast(List<int>.filled(81, 0), limit: 5), 5, reason: 'предел соблюдается');
  });

  test('🔴 план порталов КАЖДОГО родителя совпадает с живым TS — поле в поле', () {
    var portals = 0, leaves = 0;
    for (final c in cases) {
      final cfg = cfgOf(c);
      final seed = c['seed'] as String, parentPath = c['parentPath'] as String;
      final parent = materializeChain(bank, seed, parentPath, cfg).last;
      final got = deepPortalsFor(bank, seed, parentPath, cfg, parent.solution);
      final want = (c['portals'] as List).cast<Map<String, Object?>>();
      final where = '${c['preset']}/${c['band']}/«$seed»/«$parentPath»';
      expect(got.length, want.length, reason: '$where: число порталов');
      for (var k = 0; k < want.length; k++) {
        final g = got[k], w = want[k];
        expect([g.aPath, g.bPath], [w['aPath'], w['bPath']], reason: '$where: пара $k');
        expect([g.aCell, g.bCell, g.aDrop, g.bDrop], [ints(w['aCell']), ints(w['bCell']), ints(w['aDrop']), ints(w['bDrop'])],
            reason: '$where: клетки и снятые подсказки пары $k');
        expect(g.digit, w['digit'], reason: '$where: общая цифра пары $k');
        portals++;
      }
      // Лист со своей стороной — как nodeAt экрана веба: та же снятая подсказка, дырки и порог.
      for (final l in (c['leaves'] as List).cast<Map<String, Object?>>()) {
        final path = l['path'] as String;
        final side = portalOfLeaf(got, path)!;
        expect([side.cell, side.drop, side.partnerPath, side.partnerCell, side.digit],
            [ints(l['cell']), ints(l['drop']), l['partnerPath'], ints(l['partnerCell']), l['digit']],
            reason: '$where: сторона листа $path');
        final cell = parentOf(path)!.cell;
        final leaf = withPortalSide(materializeNode(bank, seed, path, cfg, parent.solution[cell[0]][cell[1]]), side, cfg);
        expect(leaf.puzzle[side.drop[0]][side.drop[1]], 0, reason: '$where: подсказка $path снята');
        expect([leaf.blanks, leaf.unlockCells], [l['blanks'], l['unlockCells']], reason: '$where: дырки и порог листа $path');
        leaves++;
      }
    }
    expect(portals, greaterThan(150), reason: 'порталов сверено мало — не сломан ли перебор');
    expect(leaves, portals * 2);
  });

  test('🔴 каждая пара честна: порознь неоднозначна, вместе — ровно одно решение', () {
    var checked = 0;
    for (final c in cases.take(40)) {
      final cfg = cfgOf(c);
      final seed = c['seed'] as String, parentPath = c['parentPath'] as String;
      final parent = materializeChain(bank, seed, parentPath, cfg).last;
      for (final p in deepPortalsFor(bank, seed, parentPath, cfg, parent.solution)) {
        List<int> flat(String path, List<int> drop) {
          final cell = parentOf(path)!.cell;
          final n = materializeNode(bank, seed, path, cfg, parent.solution[cell[0]][cell[1]]);
          final f = [for (final row in n.puzzle) ...row];
          f[drop[0] * deepN + drop[1]] = 0;
          return f;
        }

        final a = flat(p.aPath, p.aDrop), b = flat(p.bPath, p.bDrop);
        expect(countSolutionsFast(a), 2, reason: 'сторона ${p.aPath} порознь неоднозначна');
        expect(countSolutionsFast(b), 2, reason: 'сторона ${p.bPath} порознь неоднозначна');
        var joint = 0;
        for (var v = 1; v <= deepN; v++) {
          final fa = List<int>.of(a)..[p.aCell[0] * deepN + p.aCell[1]] = v;
          final fb = List<int>.of(b)..[p.bCell[0] * deepN + p.bCell[1]] = v;
          joint += countSolutionsFast(fa) * countSolutionsFast(fb);
        }
        expect(joint, 1, reason: 'пара ${p.aPath}↔${p.bPath}: общая цифра даёт ровно одно решение');
        checked++;
      }
    }
    expect(checked, greaterThan(40));
  });

  // ─────────────────────────── экран: нажатиями ───────────────────────────

  // «Разведка», первая ступень: родитель — корень, порталы на листьях.
  final scout = cases.firstWhere((c) => c['preset'] == 'scout' && c['band'] == 0 && (c['portals'] as List).isNotEmpty);
  final leafRef = (scout['leaves'] as List).cast<Map<String, Object?>>().first;
  final seed = scout['seed'] as String;
  final leafPath = leafRef['path'] as String;
  final portalCell = ints(leafRef['cell']), dropCell = ints(leafRef['drop']);
  final partnerPath = leafRef['partnerPath'] as String;
  final partnerCell = ints(leafRef['partnerCell']);
  final portalDigit = (leafRef['digit'] as num).toInt();

  late SharedState state;

  Map<String, Object?> snapshotAt(String path, {Map<String, Object?> grids = const {}, Map<String, Object?> extra = const {}}) => {
        'v': 1,
        'savedAt': 1759400000000,
        'state': {
          'preset': 'scout',
          'band': 0,
          'seed': seed,
          'path': path,
          'grids': grids,
          'history': {'past': <Object?>[], 'future': <Object?>[]},
          ...extra,
        },
      };

  Future<void> boot(WidgetTester tester, Map<String, Object?> snapshot) async {
    SharedPreferences.setMockInitialValues({resumeKey: jsonEncode(snapshot)});
    await tester.runAsync(() async {
      state = await SharedState.open();
      await tester.pumpWidget(MaterialApp(home: DeepScreen(state: state)));
      for (var i = 0; i < 60; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 20));
        if (find.byKey(const Key('cell_0_0')).evaluate().isNotEmpty) break;
        if (find.byKey(const Key('deep-start')).evaluate().isNotEmpty) break;
      }
    });
    await tester.pump();
  }

  int digitAt(WidgetTester tester, int r, int c) {
    final text = find.descendant(of: find.byKey(Key('cell_${r}_$c')), matching: find.byType(Text));
    if (text.evaluate().isEmpty) return 0;
    return int.tryParse(tester.widget<Text>(text.first).data ?? '') ?? 0;
  }

  Future<void> tap(WidgetTester tester, Finder f) async {
    await tester.tap(f, warnIfMissed: false);
    await tester.pump();
  }

  Map<String, Object?> stored() => ((jsonDecode(state.get(resumeKey)!) as Map)['state'] as Map).cast<String, Object?>();

  testWidgets('🔴 лист-портал: подсказка снята, кольцо на портале, подсказка указывает партнёра', (tester) async {
    await boot(tester, snapshotAt(leafPath));
    expect(find.byKey(Key('portal_ring_${portalCell[0]}_${portalCell[1]}')), findsOneWidget, reason: 'кольцо портала на своей клетке');
    expect(find.byWidgetPredicate((w) => w is CustomPaint && w.key is ValueKey<String> && (w.key! as ValueKey<String>).value.startsWith('portal_ring_')),
        findsOneWidget, reason: 'портал на листе один');
    expect(digitAt(tester, dropCell[0], dropCell[1]), 0, reason: 'снятая подсказка пуста — как у веба');

    expect(tester.widget<Text>(find.byKey(const Key('deep-hint'))).data, L.t('deepLeafHint'), reason: 'на дне — подсказка дна');
    await tap(tester, find.byKey(Key('cell_${portalCell[0]}_${portalCell[1]}')));
    final hint = tester.widget<Text>(find.byKey(const Key('deep-hint'))).data!;
    expect(hint, L.f('deepPortalHint', {'cell': '(${partnerCell[0] + 1}·${partnerCell[1] + 1})'}));
    expect(hint, isNot(contains('{cell}')), reason: 'подстановка сделана');
  });

  testWidgets('🔴 рука против руки партнёра портала — ошибка, в полосе и в снимке', (tester) async {
    final partnerGrid = [for (var r = 0; r < deepN; r++) List<int>.filled(deepN, 0)];
    partnerGrid[partnerCell[0]][partnerCell[1]] = portalDigit;
    await boot(tester, snapshotAt(leafPath, grids: {partnerPath: partnerGrid}));

    // Цифра, которая НЕ спорит с доской листа, — значит, ошибка только от портала.
    final visible = [for (var r = 0; r < deepN; r++) [for (var c = 0; c < deepN; c++) digitAt(tester, r, c)]];
    final wrong = [for (var v = 1; v <= deepN; v++) v]
        .firstWhere((v) => v != portalDigit && !conflictsInChild(visible, portalCell[0], portalCell[1], v));
    await tap(tester, find.byKey(Key('cell_${portalCell[0]}_${portalCell[1]}')));
    await tap(tester, find.byKey(Key('digit$wrong')));
    expect(stored()['errors'], 1, reason: 'расхождение с партнёром портала — доказуемая ошибка');

    await tap(tester, find.byKey(Key('digit$portalDigit')));
    expect(stored()['errors'], 1, reason: 'та же цифра, что у партнёра, — не ошибка');
  });

  testWidgets('🔴 цифра, уже стоящая в строке, — ошибка; новая партия обнуляет счёт и чужие поля', (tester) async {
    await boot(tester, snapshotAt('', extra: {'marks': {'': 'чужие пометки'}, 'errors': 2}));
    expect(stored()['errors'], 2, reason: 'ошибки из снимка поднялись');
    late int r0, c0, dup;
    var found = false;
    for (var r = 0; r < deepN && !found; r++) {
      final row = [for (var c = 0; c < deepN; c++) digitAt(tester, r, c)];
      for (var c = 0; c < deepN && !found; c++) {
        final arrow = find.descendant(of: find.byKey(Key('cell_${r}_$c')), matching: find.byIcon(Icons.arrow_downward));
        if (row[c] == 0 && arrow.evaluate().isEmpty && row.any((v) => v != 0)) {
          r0 = r;
          c0 = c;
          dup = row.firstWhere((v) => v != 0);
          found = true;
        }
      }
    }
    expect(found, isTrue);
    await tap(tester, find.byKey(Key('cell_${r0}_$c0')));
    await tap(tester, find.byKey(Key('digit$dup')));
    expect(stored()['errors'], 3, reason: 'повтор в строке — доказуемая ошибка');

    await tester.runAsync(() async {
      await tester.tap(find.byTooltip(L.t('sdkNewGame')));
      for (var i = 0; i < 10; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 10));
      }
      await tester.tap(find.byKey(const Key('deep-start')));
      for (var i = 0; i < 20; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 10));
      }
    });
    await tester.pump();
    expect(stored()['errors'], 0, reason: 'новая партия — счёт с нуля');
    expect(stored()['marks'], isEmpty, reason: 'пометки старой партии не переезжают в новую');
  });

  testWidgets('🔴 снимок с приправой листьев не поднимается — у натива её нет, дерево разошлось бы', (tester) async {
    await boot(tester, snapshotAt(leafPath, extra: {'spice': true}));
    expect(find.byKey(const Key('deep-new')), findsOneWidget, reason: 'вместо чужого дерева — окно новой партии');
  });
}
