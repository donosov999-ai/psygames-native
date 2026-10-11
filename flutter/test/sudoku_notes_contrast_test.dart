import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/sudoku/highlight.dart';
import 'package:psygames_flutter/games/sudoku/levels.dart';
import 'package:psygames_flutter/games/sudoku/marks.dart';
import 'package:psygames_flutter/games/sudoku/mode_board.dart';
import 'package:psygames_flutter/games/sudoku/modes.dart';
import 'package:psygames_flutter/games/sudoku/rules.dart';
import 'package:psygames_flutter/games/sudoku/screen.dart';

import 'support/real_fonts.dart';

void main() {
  for (final brightness in Brightness.values) {
    for (final mode in <SideMode?>[null, SideMode.towers, SideMode.unequal]) {
      testWidgets('${mode?.name ?? 'classic'} selected notes readable in ${brightness.name}', (t) async {
        await loadRoboto();
        t.view.physicalSize = const Size(390, 640);
        t.view.devicePixelRatio = 1;
        addTearDown(t.view.resetPhysicalSize);
        addTearDown(t.view.resetDevicePixelRatio);
        final n = mode == SideMode.towers ? 6 : 9;
        final grid = List.generate(n, (_) => List.filled(n, 0));
        final marks = emptyPencilMarks(n);
        marks[0][0] = 0x1ff;
        marks[1][1] = 0x1ff;
        final given = List.generate(n, (_) => List.filled(n, false));
        final colors = List.generate(n, (_) => List.filled(n, noSudokuColor));
        final scheme = ColorScheme.fromSeed(seedColor: Colors.purple, brightness: brightness);
        final boundary = GlobalKey();
        final Widget board = mode == null
            ? SudokuBoardView(
                board: SudokuBoard(level: 77, n: n, br: 3, bc: 3,
                  variant: 'classic', puzzle: grid, solution: grid,
                  geometry: const BoardGeometry()),
                grid: grid, given: given, marks: marks, colors: colors,
                selected: (r: 0, c: 0), height: 390, onTap: (_, _) {},
              )
            : ModeBoard(
                board: SideBoard(step: 1, n: n, br: n == 6 ? 2 : 3, bc: 3,
                  puzzle: grid, solution: grid, geometry: const BoardGeometry()),
                mode: mode, grid: grid, given: given, marks: marks, colors: colors,
                selected: (r: 0, c: 0), height: 390, onTap: (_, _) {},
              );
        await t.pumpWidget(MaterialApp(
          theme: ThemeData(colorScheme: scheme),
          home: MediaQuery(
            data: const MediaQueryData(size: Size(390, 640), textScaler: TextScaler.linear(1.5)),
            child: Scaffold(body: RepaintBoundary(key: boundary, child: board)),
          ),
        ));
        await t.pumpAndSettle();
        final selected = t.widget<PencilMarksLayer>(find.byKey(const Key('marks_0_0')));
        final normal = t.widget<PencilMarksLayer>(find.byKey(const Key('marks_1_1')));
        expect(selected.color, Colors.white);
        expect(normal.color, scheme.onSurfaceVariant);
        expect((selected.color.computeLuminance() + 0.05) /
            (sudokuSelectedFill.computeLuminance() + 0.05), greaterThan(4.5));
        final cell = find.byKey(const Key('cell_0_0'));
        final glyphs = find.descendant(of: cell, matching: find.byType(Text));
        expect(glyphs, findsNWidgets(9));
        for (final glyph in glyphs.evaluate()) {
          final text = glyph.widget as Text;
          expect(text.style!.color, Colors.white);
          final rect = t.getRect(find.byWidget(text));
          expect(t.getRect(cell).inflate(1).contains(rect.topLeft), true);
          expect(t.getRect(cell).inflate(1).contains(rect.bottomRight), true);
        }
        expect(t.takeException(), isNull);

        // Optional local visual evidence; ordinary CI does not write artifacts.
        const output = String.fromEnvironment('SUDOKU_EVIDENCE_DIR');
        if (output.isNotEmpty) {
          await t.runAsync(() async {
            final image = await (boundary.currentContext!.findRenderObject() as RenderRepaintBoundary)
                .toImage(pixelRatio: 2);
            final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
            await Directory(output).create(recursive: true);
            await File('$output/notes-${mode?.name ?? 'classic'}-${brightness.name}.png')
                .writeAsBytes(bytes!.buffer.asUint8List());
            image.dispose();
          });
        }
      });
    }
  }
}
