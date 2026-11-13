import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../shell/drop_baskets.dart';
import 'basket_model.dart';

const _labelStyle = TextStyle(
  fontSize: 14,
  height: 1.05,
  fontWeight: FontWeight.w700,
);
const _wordStyle = TextStyle(
  fontSize: 24,
  fontWeight: FontWeight.w700,
  height: 1.1,
);

double _textHeight(
  BuildContext context,
  String text,
  TextStyle style,
  double width,
) {
  final p = TextPainter(
    text: TextSpan(text: text, style: style),
    textDirection: Directionality.of(context),
    textScaler: MediaQuery.textScalerOf(context),
  )..layout(maxWidth: width);
  final height = p.height;
  p.dispose();
  return height;
}

/// Only the playfield. Header, HUD, pause and service toolbar belong to GameShell.
/// Drag-to-basket behaviour (grab, highlight, return, tap fallback) is the shared
/// `shell/drop_baskets.dart`; this file draws the wicker baskets and paper cards.
class SemanticBasketField extends StatelessWidget {
  const SemanticBasketField({
    super.key,
    required this.party,
    required this.height,
    required this.categoryName,
    required this.onAnswer,
    required this.enabled,
  });

  final SemanticBasketParty party;
  final double height;
  final String Function(String) categoryName;
  final void Function(int id, String category) onAnswer;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final party = this.party;
    if (party.rounds.isEmpty) return const SizedBox.shrink();
    final scale = MediaQuery.textScalerOf(context).scale(16) / 16;
    final cats = party.rounds.first.cats;
    bool onField(int id) => party.visibleIds.contains(id) && !party.placed(id);
    return DropBasketsScope<int, String>(
      enabled: enabled,
      resetKey: party,
      canDrop: onField,
      isLive: onField,
      isCorrect: (id, cat) => party.rounds[id].correctCat == cat,
      onAnswer: onAnswer,
      child: SizedBox(
      height: height,
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 520),
          child: LayoutBuilder(
            builder: (context, c) {
              final columns = cats.length > 2 ? 2 : cats.length;
              final basketWidth =
                  (c.maxWidth - 24 - (columns - 1) * 8) / columns;
              final normalBasketHeight = math.max(
                108.0,
                math.min(basketWidth / 1.18, 152.0),
              );
              final basketRows = (cats.length / columns).ceil();
              final compact =
                  normalBasketHeight * basketRows + 130 * scale > c.maxHeight;
              final labelInset = compact ? 4.0 : basketWidth * .16;
              // Answer targets stay visible; only the card tray can scroll at text ×2.
              final labelHeight =
                  cats
                      .map(
                        (cat) => _textHeight(
                          context,
                          categoryName(cat),
                          _labelStyle,
                          basketWidth - labelInset * 2 - 6,
                        ),
                      )
                      .fold(0.0, math.max) +
                  8;
              final basketHeight = compact
                  ? math.max(48.0, labelHeight + 8)
                  : normalBasketHeight;
              final labelTop = compact ? 0.0 : basketHeight * .47;
              final labelExtra = math.max(
                0.0,
                labelTop + labelHeight - basketHeight,
              );
              final targetsHeight =
                  basketRows * (basketHeight + labelExtra) +
                  (basketRows - 1) * 6;
              final trayHeight = math.max(
                48.0,
                c.maxHeight - targetsHeight - 24,
              );
              final rows = (party.visibleIds.length / 2).ceil();
              final minTextHeight =
                  party.visibleIds
                      .map(
                        (id) => _textHeight(
                          context,
                          party.rounds[id].word,
                          _wordStyle,
                          (c.maxWidth - 44) / 2 - 16,
                        ),
                      )
                      .fold(0.0, math.max) +
                  16;
              final cardHeight = math.max(
                minTextHeight,
                math.max(
                  56.0 * math.min(scale, 2),
                  math.min(
                    (c.maxWidth - 44) / 4.8,
                    (trayHeight - (rows - 1) * 12) / rows,
                  ),
                ),
              );
              return Column(
                children: [
                  Expanded(
                    child: SingleChildScrollView(
                      padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
                      child: ConstrainedBox(
                        constraints: BoxConstraints(minHeight: trayHeight),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            for (var row = 0; row < rows; row++)
                              Padding(
                                padding: const EdgeInsets.only(bottom: 12),
                                child: Row(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    for (var col = 0; col < 2; col++) ...[
                                      if (col > 0) const SizedBox(width: 12),
                                      Expanded(
                                        child:
                                            row * 2 + col >=
                                                party.visibleIds.length
                                            ? SizedBox(height: cardHeight)
                                            : _card(
                                                party.visibleIds[row * 2 + col],
                                                cardHeight,
                                              ),
                                      ),
                                    ],
                                  ],
                                ),
                              ),
                          ],
                        ),
                      ),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
                    child: Wrap(
                      spacing: 8,
                      runSpacing: 6,
                      alignment: WrapAlignment.center,
                      children: [
                        for (final cat in cats)
                          SizedBox(
                            width: basketWidth,
                            height: basketHeight + labelExtra,
                            child: DropBasket<int, String>(
                              key: Key('semantic-basket-$cat'),
                              target: cat,
                              label: categoryName(cat),
                              builder: (context, highlighted) =>
                                    Stack(
                                      fit: StackFit.expand,
                                      children: [
                                        Positioned.fill(
                                          bottom: labelExtra,
                                          child: Image.asset(
                                            'assets/semantic_sort/wicker-basket.png',
                                            fit: BoxFit.fill,
                                            excludeFromSemantics: true,
                                          ),
                                        ),
                                        Positioned(
                                          left: labelInset,
                                          right: labelInset,
                                          top: labelTop,
                                          height: math.max(
                                            basketHeight * .34,
                                            labelHeight,
                                          ),
                                          child: Center(
                                            child: DecoratedBox(
                                              decoration: BoxDecoration(
                                                image: const DecorationImage(
                                                  image: AssetImage(
                                                    'assets/semantic_sort/paper-card.png',
                                                  ),
                                                  fit: BoxFit.fill,
                                                ),
                                                borderRadius:
                                                    BorderRadius.circular(6),
                                              ),
                                              child: Padding(
                                                padding:
                                                    const EdgeInsets.symmetric(
                                                      horizontal: 3,
                                                      vertical: 2,
                                                    ),
                                                child: Text(
                                                  categoryName(cat),
                                                  textAlign: TextAlign.center,
                                                  style: _labelStyle.copyWith(
                                                    color:
                                                        const ColorScheme.light()
                                                            .onSurface,
                                                  ),
                                                ),
                                              ),
                                            ),
                                          ),
                                        ),
                                        if (party.visibleIds.any(
                                          (id) =>
                                              party.placed(id) &&
                                              party.rounds[id].correctCat ==
                                                  cat,
                                        ))
                                          Positioned(
                                            top: 8,
                                            right: 8,
                                            child: Container(
                                              padding:
                                                  const EdgeInsets.symmetric(
                                                    horizontal: 8,
                                                    vertical: 3,
                                                  ),
                                              decoration: BoxDecoration(
                                                color: Theme.of(context)
                                                    .colorScheme
                                                    .surface,
                                                borderRadius:
                                                    BorderRadius.circular(12),
                                              ),
                                              child: Text(
                                                '${party.visibleIds.where((id) => party.placed(id) && party.rounds[id].correctCat == cat).length}',
                                                key: Key(
                                                  'semantic-basket-count-$cat',
                                                ),
                                              ),
                                            ),
                                          ),
                                      ],
                                    ),
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
              );
            },
          ),
        ),
      ),
      ),
    );
  }

  Widget _card(int id, double height) {
    final word = party.rounds[id].word;
    final language = party.rounds.map((r) => r.lang).toSet().length > 1
        ? party.rounds[id].lang.toUpperCase()
        : null;
    return SizedBox(
      height: height,
      child: party.placed(id)
          ? const SizedBox.shrink() // Keep the slot: other cards must not jump after a move.
          // 🔴 12.11.2026, Денис: «плохо цепляются слова». Было LongPressDraggable с
          // задержкой 180 мс; теперь слово берётся сразу касанием (общий DropCard).
          // Прокрутка лотка остаётся по промежуткам между карточками (при крупном шрифте).
          : DropCard<int>(
              key: Key('semantic-card-$id'),
              item: id,
              label: word,
              feedbackWidth: 160,
              builder: (context, selected) => _WordCard(
                word: word,
                selected: selected,
                height: height,
                language: language,
              ),
            ),
    );
  }
}

class _WordCard extends StatelessWidget {
  const _WordCard({
    required this.word,
    required this.selected,
    required this.height,
    this.language,
  });
  final String word;
  final bool selected;
  final double height;
  final String? language;

  @override
  Widget build(BuildContext context) => Container(
    height: height,
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
    decoration: BoxDecoration(
      borderRadius: BorderRadius.circular(14),
      image: const DecorationImage(
        image: AssetImage('assets/semantic_sort/paper-card.png'),
        scale: 8,
        fit: BoxFit.fill,
        // centerSlice is in logical image coordinates, BEFORE scale is applied.
        // The 1942×809 source at scale 8 preserves a 20 logical px border.
        centerSlice: Rect.fromLTRB(20, 20, 222.75, 81.125),
      ),
      border: selected
          ? Border.all(color: Theme.of(context).colorScheme.primary, width: 2)
          : null,
    ),
    child: Stack(
      children: [
        Center(
          child: Text(
            word,
            textAlign: TextAlign.center,
            style: _wordStyle.copyWith(
              color: const ColorScheme.light().onSurface,
            ),
          ),
        ),
        if (language != null)
          Positioned(
            top: 0,
            right: 0,
            child: Text(
              language!,
              style: TextStyle(
                color: const ColorScheme.light().onSurface,
                fontSize: 10,
              ),
            ),
          ),
      ],
    ),
  );
}
