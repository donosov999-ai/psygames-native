import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/xiangqi_shogi/mate.dart';
import 'package:psygames_flutter/games/xiangqi_shogi/shogi_rules.dart';

/// «СЯНЦИ И СЁГИ» — ПРОБЫ ПРАВИЛ (задача c33fb91b).
///
/// Выборка оракула зашита файлом `test/fixtures/xiangqi_shogi_oracle.json`: позиции из
/// случайных партий и наборы ходов Fairy-Stockfish (у сёги без мата сбросом пешки —
/// оракул держит его в списке, а правила запрещают). Сам оракул в приложение не идёт;
/// полная сверка по пути — tools/{shogi,xiangqi}_dump.dart + _local/chessgo-tools/xq.
void main() {
  final oracle =
      jsonDecode(File('test/fixtures/xiangqi_shogi_oracle.json').readAsStringSync())
          as Map<String, dynamic>;

  test('🔴 сёги: свой движок совпадает с оракулом на выборке позиций', () {
    final rows = oracle['shogi'] as List;
    expect(rows.length, greaterThan(100));
    for (final r in rows) {
      final fen = (r as List)[0] as String;
      final want = (r[1] as List).cast<String>().toSet();
      final got = ShogiPosition.parse(fen).legalMoves().toSet();
      expect(got, want, reason: fen);
    }
  });

  test('🔴 сянци: bishop совпадает с оракулом на выборке позиций', () {
    final rows = oracle['xiangqi'] as List;
    expect(rows.length, greaterThan(60));
    for (final r in rows) {
      final fen = (r as List)[0] as String;
      final want = (r[1] as List).cast<String>().toSet();
      expect(XiangqiBoard(fen).moves().toSet(), want, reason: fen);
    }
  });

  test('сёги: нифу, мёртвые сбросы, обязательное превращение, мат сбросом пешки', () {
    // Пешка сэнтэ на e-вертикали — вторую туда не сбросить; на 9-ю горизонталь — нельзя.
    final p = ShogiPosition.parse('4k4/9/9/9/9/9/4P4/9/K8[PN] w 0 1');
    final moves = p.legalMoves();
    expect(moves.where((m) => m.startsWith('P@e')), isEmpty, reason: 'нифу');
    expect(moves.where((m) => m.startsWith('P@') && m.endsWith('9')), isEmpty);
    expect(moves.where((m) => m.startsWith('N@') && (m.endsWith('9') || m.endsWith('8'))), isEmpty);
    // Пешка на 8-й горизонтали идёт на 9-ю только с превращением.
    final q = ShogiPosition.parse('k8/4P4/9/9/9/9/9/9/K8[-] w 0 1');
    expect(q.legalMoves(), contains('e8e9+'));
    expect(q.legalMoves(), isNot(contains('e8e9')));
    // Мат сбросом пешки (утифудзумэ) запрещён, а тот же шах ходом пешки — нет.
    final u = ShogiPosition.parse('4k4/3G1G3/4S4/9/9/9/9/9/K8[P] w 0 1');
    expect(u.legalMoves(), isNot(contains('P@e8')));
    expect(u.legalMoves(pawnDropMateRule: false), contains('P@e8'));
  });

  test('сёги: шахи сбросом без хода совпадают с полным перебором', () {
    final rows = oracle['shogi'] as List;
    for (final r in rows) {
      final pos = ShogiPosition.parse((r as List)[0] as String);
      final slow = {
        for (final m in pos.legalMoves())
          if (pos.apply(m).inCheck(1 - pos.toMove)) m,
      };
      expect(pos.checkingMoves().toSet(), slow, reason: pos.fen());
    }
  });
}
