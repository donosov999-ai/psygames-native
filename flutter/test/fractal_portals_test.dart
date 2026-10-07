import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/fractal/screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 ПОРТАЛ «ФРАКТАЛА» ИГРАЕТСЯ: ПРЫЖОК К БЛИЗНЕЦУ И ОБЩИЙ КАРАНДАШ (сверка 138f7818, строки
/// 22–24; 23 и 24 — «высокая»).
///
/// Веб сам называет оба органа условием играбельности: ответ портала — пересечение кандидатов
/// двух досок. Без прыжка путь «на карту, найти плитку, вспомнить клетку» проделывают раз; без
/// общих пометок чужой список держат в голове. Порталы — с 6-й ступени (fractal-boards.json:
/// уровни 1–5 без порталов, 6–10 по одному). Где портал — проба берёт из снимка партии.
void main() {
  setUpAll(() async => L.load('ru'));
  const key = 'psygames_resume_sudoku_fractal_nzt48';
  late SharedState state;

  setUp(() async {
    SharedPreferences.setMockInitialValues({'psygames_sudoku_fractal_level_nzt48': '6'});
    state = await SharedState.open();
  });

  Future<void> boot(WidgetTester tester) async {
    await tester.runAsync(() async {
      await tester.pumpWidget(MaterialApp(home: FractalScreen(state: state)));
      for (var i = 0; i < 80; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 30));
        if (find.byKey(const Key('tile0')).evaluate().isNotEmpty) break;
      }
    });
    await tester.pump();
  }

  Future<void> tap(WidgetTester tester, Finder f) async {
    await tester.tap(f, warnIfMissed: false);
    await tester.pump();
  }

  Map<String, Object?> stored() => ((jsonDecode(state.get(key)!) as Map)['state'] as Map).cast<String, Object?>();

  ({int from, int to, List<int> fromCell, List<int> toCell}) portal() {
    final p = (((stored()['puzzle'] as Map)['portals'] as List).first as Map).cast<String, Object?>();
    List<int> cell(Object? v) => [for (final x in v as List) (x as num).toInt()];
    return (from: (p['from'] as num).toInt(), to: (p['to'] as num).toInt(), fromCell: cell(p['fromCell']), toCell: cell(p['toCell']));
  }

  int markAt(int child, List<int> cell) =>
      ((((stored()['marks'] as Map)['children'] as List)[child] as List)[cell[0]] as List)[cell[1]] as int;

  testWidgets('🔴 на клетке-портале — номер близнеца и подсказка; кнопка ведёт в клетку-близнеца', (tester) async {
    await boot(tester);
    final p = portal();
    await tap(tester, find.byKey(Key('tile${p.from}')));
    final tag = find.byKey(Key('portal_tag_cell_${p.fromCell[0]}_${p.fromCell[1]}'));
    expect(tag, findsOneWidget, reason: 'в углу кольца — номер сетки-близнеца');
    expect(tester.widget<Text>(tag).data, '${p.to + 1}');

    expect(find.byKey(const Key('fractal-portal-hint')), findsNothing, reason: 'длинная подсказка — только на самой клетке');
    await tap(tester, find.byKey(Key('cell_${p.fromCell[0]}_${p.fromCell[1]}')));
    expect(tester.widget<Text>(find.byKey(const Key('fractal-portal-hint'))).data, L.t('fractalPortalHint'));

    await tap(tester, find.byKey(const Key('fractal-portal-jump')));
    final back = find.byKey(Key('portal_tag_cell_${p.toCell[0]}_${p.toCell[1]}'));
    expect(back, findsOneWidget, reason: 'открыта сетка-близнец: кольцо на клетке-близнеце');
    expect(tester.widget<Text>(back).data, '${p.from + 1}', reason: 'и в углу — номер сетки, откуда пришли');
    // Выделена клетка-близнец: пометка без касания доски ложится именно в неё.
    await tap(tester, find.byKey(const Key('pencil')));
    await tap(tester, find.byKey(const Key('digit6')));
    expect(markAt(p.to, p.toCell), 1 << 5, reason: 'после прыжка выбрана клетка-близнец');
  });

  testWidgets('🔴 карандаш на портале — общий: пишется в обе сетки, одна отмена снимает обе', (tester) async {
    await boot(tester);
    final p = portal();
    await tap(tester, find.byKey(Key('tile${p.from}')));
    await tap(tester, find.byKey(Key('cell_${p.fromCell[0]}_${p.fromCell[1]}')));
    await tap(tester, find.byKey(const Key('pencil')));
    await tap(tester, find.byKey(const Key('digit4')));
    await tap(tester, find.byKey(const Key('digit7')));
    const both = (1 << 3) | (1 << 6);
    expect(markAt(p.from, p.fromCell), both);
    expect(markAt(p.to, p.toCell), both, reason: 'клетка одна — пометки видны и там');

    await tap(tester, find.byTooltip(L.t('btn_undo')));
    expect(markAt(p.from, p.fromCell), 1 << 3);
    expect(markAt(p.to, p.toCell), 1 << 3, reason: 'отмена снимает пометку с обеих сторон');

    // И с той стороны — в эту.
    await tap(tester, find.byKey(const Key('fractal-portal-jump')));
    await tap(tester, find.byKey(const Key('digit4')));
    expect(markAt(p.to, p.toCell), 0);
    expect(markAt(p.from, p.fromCell), 0, reason: 'общий карандаш работает в обе стороны');
  });

  testWidgets('🔴 360×640: подсказка и кнопка портала не выталкивают клавиши и не переполняют каркас', (tester) async {
    await tester.binding.setSurfaceSize(const Size(360, 640));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await boot(tester);
    final p = portal();
    await tap(tester, find.byKey(Key('tile${p.from}')));
    await tap(tester, find.byKey(Key('cell_${p.fromCell[0]}_${p.fromCell[1]}')));
    expect(find.byKey(const Key('fractal-portal-hint')), findsOneWidget);
    expect(tester.takeException(), isNull, reason: 'переполнение каркаса');
    for (final k in ['digit1', 'digit9', 'erase', 'fractal-portal-jump', 'cell_8_8']) {
      final rect = tester.getRect(find.byKey(Key(k)));
      expect(rect.bottom, lessThanOrEqualTo(640.0), reason: '$k уехал за низ: $rect');
      expect(rect.top, greaterThanOrEqualTo(0.0), reason: '$k выше экрана: $rect');
    }
  });
}
