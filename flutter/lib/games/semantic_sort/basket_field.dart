import 'dart:math' as math;

import 'package:flutter/material.dart';

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
class SemanticBasketField extends StatefulWidget {
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
  State<SemanticBasketField> createState() => _SemanticBasketFieldState();
}

class _SemanticBasketFieldState extends State<SemanticBasketField> {
  int? _selected;
  int? _dragging;
  int? _wrong;
  int _wrongSerial = 0;

  @override
  void didUpdateWidget(SemanticBasketField oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.party != widget.party ||
        (_selected != null &&
            (!widget.party.visibleIds.contains(_selected) ||
                widget.party.placed(_selected!)))) {
      _selected = null;
      _dragging = null;
      _wrong = null;
    }
  }

  void _answer(int id, String cat) {
    if (!widget.enabled || widget.party.placed(id)) return;
    final wrong = widget.party.rounds[id].correctCat != cat;
    widget.onAnswer(id, cat);
    if (!mounted) return;
    setState(() {
      _selected = wrong ? id : null;
      _dragging = null;
      _wrong = wrong ? id : null;
      _wrongSerial++;
    });
  }

  @override
  Widget build(BuildContext context) {
    final party = widget.party;
    if (party.rounds.isEmpty) return const SizedBox.shrink();
    final reduced = MediaQuery.disableAnimationsOf(context);
    final scale = MediaQuery.textScalerOf(context).scale(16) / 16;
    final cats = party.rounds.first.cats;
    return SizedBox(
      height: widget.height,
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
                          widget.categoryName(cat),
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
                                                reduced,
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
                            child: DragTarget<int>(
                              onWillAcceptWithDetails: (d) =>
                                  widget.enabled &&
                                  party.visibleIds.contains(d.data) &&
                                  !party.placed(d.data),
                              onAcceptWithDetails: (d) => _answer(d.data, cat),
                              builder: (context, candidates, rejected) => Semantics(
                                button: true,
                                enabled: widget.enabled && _selected != null,
                                label: widget.categoryName(cat),
                                child: InkWell(
                                  key: Key('semantic-basket-$cat'),
                                  borderRadius: BorderRadius.circular(20),
                                  onTap: widget.enabled && _selected != null
                                      ? () {
                                          final selected = _selected;
                                          if (selected != null) {
                                            _answer(selected, cat);
                                          }
                                        }
                                      : null,
                                  child: AnimatedContainer(
                                    duration: reduced
                                        ? Duration.zero
                                        : const Duration(milliseconds: 140),
                                    decoration: BoxDecoration(
                                      borderRadius: BorderRadius.circular(20),
                                      color: candidates.isEmpty
                                          ? Colors.transparent
                                          : Theme.of(context)
                                                .colorScheme
                                                .primary
                                                .withValues(alpha: .16),
                                    ),
                                    child: Stack(
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
                                                  widget.categoryName(cat),
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
    );
  }

  Widget _card(int id, double height, bool reduced) {
    final party = widget.party;
    final placed = party.placed(id);
    final word = party.rounds[id].word;
    final selected = _selected == id;
    final language = party.rounds.map((r) => r.lang).toSet().length > 1
        ? party.rounds[id].lang.toUpperCase()
        : null;
    final card = _WordCard(
      word: word,
      selected: selected,
      height: height,
      language: language,
    );
    return SizedBox(
      height: height,
      child: placed
          ? const SizedBox.shrink() // Keep the slot: other cards must not jump after a move.
          : Semantics(
              button: true,
              selected: selected,
              label: word,
              child: LongPressDraggable<int>(
                key: Key('semantic-card-$id'),
                data: id,
                delay: const Duration(milliseconds: 180),
                maxSimultaneousDrags: widget.enabled && _dragging == null
                    ? 1
                    : 0,
                onDragStarted: () => setState(() {
                  _dragging = id;
                  _selected = id;
                }),
                onDragEnd: (_) {
                  if (mounted) setState(() => _dragging = null);
                },
                feedback: Material(
                  type: MaterialType.transparency,
                  child: SizedBox(
                    width: 160,
                    child: Transform.rotate(
                      angle: reduced ? 0 : -.04,
                      child: _WordCard(
                        word: word,
                        selected: true,
                        height: height,
                        language: language,
                      ),
                    ),
                  ),
                ),
                childWhenDragging: Opacity(opacity: .18, child: card),
                child: GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: widget.enabled
                      ? () => setState(() {
                          _selected = selected ? null : id;
                          _wrong = null;
                        })
                      : null,
                  child: TweenAnimationBuilder<double>(
                    key: ValueKey('$id-${_wrong == id ? _wrongSerial : 0}'),
                    tween: Tween(
                      begin: _wrong == id && !reduced ? 1 : 0,
                      end: 0,
                    ),
                    duration: reduced
                        ? Duration.zero
                        : const Duration(milliseconds: 300),
                    builder: (context, v, child) => Transform.translate(
                      offset: Offset(math.sin(v * math.pi * 5) * v * 8, 0),
                      child: child,
                    ),
                    child: AnimatedRotation(
                      turns: selected && !reduced ? -.009 : 0,
                      duration: reduced
                          ? Duration.zero
                          : const Duration(milliseconds: 140),
                      child: card,
                    ),
                  ),
                ),
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
