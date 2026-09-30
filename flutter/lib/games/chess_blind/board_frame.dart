import 'dart:math';

import 'package:flutter/material.dart';

/// ПОДПИСИ ПОЛЕЙ ПО КРАЯМ ДОСКИ — a–h снизу и 1–8 слева.
///
/// Просьба Дениса 03.09.2026: «как опция показывать разметку a, b и т. д. по
/// краям доски». Одна рамка на обе доски «Доски в уме» — партии и серии, как в
/// вебе (`renderBoardWithCoords`): правило одно, копий у него нет.
///
/// 🔴 Доска канонически слева направо: при арабском языке a — всё равно слева.
class ChessBoardFrame extends StatelessWidget {
  const ChessBoardFrame({
    super.key,
    required this.board,
    required this.side,
    required this.coords,
  });

  /// Ширина полосы подписей.
  static const double labels = 18;

  final Widget board;
  final double side;
  final bool coords;

  @override
  Widget build(BuildContext context) {
    if (!coords) return Directionality(textDirection: TextDirection.ltr, child: board);
    final step = side / 8;
    final style = TextStyle(
      fontSize: max(10, step * 0.28),
      fontWeight: FontWeight.w600,
      color: Theme.of(context).colorScheme.onSurfaceVariant,
    );
    return Directionality(
      textDirection: TextDirection.ltr,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: labels,
            height: side,
            child: Column(
              children: [
                for (var r = 0; r < 8; r++)
                  SizedBox(
                    height: step,
                    child: Center(child: Text('${8 - r}', style: style)),
                  ),
              ],
            ),
          ),
          Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              board,
              SizedBox(
                width: side,
                height: labels,
                child: Row(
                  children: [
                    for (var c = 0; c < 8; c++)
                      SizedBox(
                        width: step,
                        child: Center(child: Text('abcdefgh'[c], style: style)),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
