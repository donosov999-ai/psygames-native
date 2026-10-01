/// ДОСКА И ФИГУРЫ — ОДНИ НА ВЕСЬ РАЗДЕЛ «ШАХМАТЫ».
///
/// 🔴 ФИГУРЫ НАСТОЯЩИЕ, А НЕ ЗНАКИ ШРИФТА. Слова Дениса 03.09.2026 по кадру
/// «Доски в уме»: «найди нормальную доску и нормальные фигуры, убогие пиздец
/// эти». Веб тогда же перешёл на набор Cburnett (`frontend/src/games/
/// chess-blind/core/pieces.ts`, BSD-3), а перенос на Flutter снова рисовал
/// ♔♕♖ текстом — перенесли правила и раскладку, а фигуры нет.
///
/// ⚠️ ЗНАКИ ЮНИКОДА ОПАСНЫ НЕ ТОЛЬКО ВИДОМ. На iOS система подставляет к ним
/// свой глиф, и цвет, заданный стилем, может не примениться вовсе — обе
/// стороны выходят одного цвета. Такое уже ловилось в соседнем продукте на
/// доске тафла. Здесь цвет несёт сам рисунок, а не стиль текста.
///
/// Набор тот же, что в вебе: двенадцать SVG в `assets/chess/`, ключ — цвет и
/// тип («WK», «BQ»). Обязательная по BSD-3 строка авторства — в [piecesNotice].
library;

import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

/// Строка авторства для экрана «О приложении».
const String piecesNotice =
    'Chess piece images © Colin M.L. Burnett, BSD 3-Clause (via Wikimedia Commons)';

/// Одна фигура.
class ChessPieceImage extends StatelessWidget {
  const ChessPieceImage({
    super.key,
    required this.type,
    required this.white,
    required this.size,
  });

  /// Тип фигуры заглавной буквой: K Q R B N P.
  final String type;
  final bool white;
  final double size;

  @override
  Widget build(BuildContext context) {
    return SvgPicture.asset(
      'assets/chess/${white ? 'W' : 'B'}${type.toUpperCase()}.svg',
      width: size,
      height: size,
      fit: BoxFit.contain,
    );
  }
}

/// Что стоит на клетке доски.
class BoardPiece {
  const BoardPiece(this.type, {required this.white});

  final String type;
  final bool white;
}

/// Доска 8×8. Клетка 0 — a8 (левый верхний), как в записи FEN.
class ChessBoardView extends StatelessWidget {
  const ChessBoardView({
    super.key,
    required this.pieces,
    required this.side,
    this.onTapSquare,
    this.selected,
    this.targets = const <int>{},
    this.masked = false,
    this.keyPrefix = 'sq',
    this.hinted,
    this.outlines = const <int, Color>{},
    this.strong,
    this.revealed = const <int>{},
    this.sideDiscs = false,
    this.cornerCoords = false,
  });

  /// Клетка → фигура. Пустые клетки просто отсутствуют.
  final Map<int, BoardPiece> pieces;

  /// Сторона доски в точках — считается от высоты поля каркаса, не от окна.
  final double side;

  final void Function(int square)? onTapSquare;

  /// Выбранная клетка и куда с неё можно пойти.
  final int? selected;
  final Set<int> targets;

  /// Маска «Доски в уме»: вместо фигур одинаковые фишки.
  final bool masked;

  /// Приставка к ключам клеток: у каждой игры свои пробы.
  final String keyPrefix;

  /// Клетка, которую показала подсказка («Детский мат»): янтарь, отличный от
  /// рамки выбора, — иначе человек не отличит «ты выбрал» от «начни отсюда».
  final int? hinted;

  /// Рамки клеток цветом: подсветка хода, ждущие ответа клетки, итог ответа.
  final Map<int, Color> outlines;

  /// 🔴 СПРАШИВАЕМАЯ КЛЕТКА — ЗАЛИВКОЙ И ТОЛСТОЙ РАМКОЙ, А НЕ ВОЛОСКОМ (отчёт
  /// a4cc1a7d 04.09.2026: «подсветка, не видно, какую фигуру выделять» — линия
  /// в 7 % клетки терялась под фишкой на охристой доске).
  final int? strong;

  /// Клетки, где фишка маски после ответа ПЕРЕВЁРНУТА в настоящую фигуру
  /// (просьба Дениса трижды: «ответил вслепую — и не знаешь, ошибся ли»).
  final Set<int> revealed;

  /// Фишка маски в цвет СТОРОНЫ: тип скрыт, сторона видна — как в вебе.
  /// Одинаково серые фишки делали задачу другой: вопрос «чья фигура» тоже
  /// приходилось держать в памяти.
  final bool sideDiscs;

  /// Мелкие подписи полей в угловых клетках (a–h снизу, 1–8 слева).
  final bool cornerCoords;

  static const _light = Color(0xFFE8C48A);
  static const _dark = Color(0xFFC8A06A);

  @override
  Widget build(BuildContext context) {
    final step = side / 8;
    final mark = Theme.of(context).colorScheme.primary;
    return SizedBox(
      width: side,
      height: side,
      child: Column(
        children: [
          for (var row = 0; row < 8; row++)
            Row(
              children: [
                for (var col = 0; col < 8; col++)
                  _Square(
                    index: row * 8 + col,
                    step: step,
                    light: (row + col) % 2 == 0,
                    lightColor: _light,
                    darkColor: _dark,
                    mark: mark,
                    piece: pieces[row * 8 + col],
                    selected: selected == row * 8 + col,
                    target: targets.contains(row * 8 + col),
                    masked: masked,
                    keyPrefix: keyPrefix,
                    onTap: onTapSquare,
                    hinted: hinted == row * 8 + col,
                    outline: outlines[row * 8 + col],
                    strong: strong == row * 8 + col,
                    revealed: revealed.contains(row * 8 + col),
                    sideDiscs: sideDiscs,
                    rankLabel: cornerCoords && col == 0 ? '${8 - row}' : null,
                    fileLabel: cornerCoords && row == 7
                        ? 'abcdefgh'[col]
                        : null,
                  ),
              ],
            ),
        ],
      ),
    );
  }
}

class _Square extends StatelessWidget {
  const _Square({
    required this.index,
    required this.step,
    required this.light,
    required this.lightColor,
    required this.darkColor,
    required this.mark,
    required this.piece,
    required this.selected,
    required this.target,
    required this.masked,
    required this.keyPrefix,
    required this.onTap,
    this.hinted = false,
    this.outline,
    this.strong = false,
    this.revealed = false,
    this.sideDiscs = false,
    this.rankLabel,
    this.fileLabel,
  });

  final int index;
  final double step;
  final bool light;
  final Color lightColor;
  final Color darkColor;
  final Color mark;
  final BoardPiece? piece;
  final bool selected;
  final bool target;
  final bool masked;
  final String keyPrefix;
  final void Function(int square)? onTap;
  final bool hinted;
  final Color? outline;
  final bool strong;
  final bool revealed;
  final bool sideDiscs;
  final String? rankLabel;
  final String? fileLabel;

  @override
  Widget build(BuildContext context) {
    final p = piece;
    return GestureDetector(
      key: Key('$keyPrefix-$index'),
      onTap: onTap == null ? null : () => onTap!(index),
      child: Container(
        width: step,
        height: step,
        decoration: BoxDecoration(
          color: hinted
              ? const Color(0xFFF3B95F)
              : light
              ? lightColor
              : darkColor,
          border: outline != null
              ? Border.all(color: outline!, width: step * (strong ? 0.1 : 0.06))
              : selected
              ? Border.all(color: mark, width: step * 0.06)
              : null,
        ),
        alignment: Alignment.center,
        child: Stack(
          alignment: Alignment.center,
          children: [
            // Куда можно пойти — точкой под фигурой, а не вместо неё: иначе
            // взятие выглядит как пустая клетка.
            if (target)
              Container(
                width: step * (p == null ? 0.3 : 0.86),
                height: step * (p == null ? 0.3 : 0.86),
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: p == null ? mark.withValues(alpha: 0.55) : null,
                  border: p == null
                      ? null
                      : Border.all(color: mark, width: step * 0.07),
                ),
              ),
            if (strong)
              Positioned.fill(
                child: ColoredBox(color: const Color(0x5538BDF8)),
              ),
            if (rankLabel != null)
              Positioned(
                top: 1,
                left: 2,
                child: Text(
                  rankLabel!,
                  style: TextStyle(
                    fontSize: step * 0.22,
                    color: light
                        ? const Color(0xFF5D4433)
                        : const Color(0xFFC9B29A),
                  ),
                ),
              ),
            if (fileLabel != null)
              Positioned(
                bottom: 1,
                right: 2,
                child: Text(
                  fileLabel!,
                  style: TextStyle(
                    fontSize: step * 0.22,
                    color: light
                        ? const Color(0xFF5D4433)
                        : const Color(0xFFC9B29A),
                  ),
                ),
              ),
            if (p != null)
              masked && !revealed
                  ? sideDiscs
                        ? Container(
                            key: Key(
                              '$keyPrefix-disc-$index-${p.white ? 'w' : 'b'}',
                            ),
                            width: step * 0.62,
                            height: step * 0.62,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: p.white
                                  ? const Color(0xFFCBD5E1)
                                  : const Color(0xFF475569),
                              border: Border.all(
                                color: p.white
                                    ? const Color(0xFF94A3B8)
                                    : const Color(0xFF1E293B),
                                width: 2,
                              ),
                            ),
                          )
                        : Icon(
                            Icons.circle,
                            size: step * 0.42,
                            color: const Color(0xFF5B5B5B),
                          )
                  : ChessPieceImage(
                      type: p.type,
                      white: p.white,
                      size: step * 0.92,
                    ),
          ],
        ),
      ),
    );
  }
}
