import 'dart:math';

import 'package:flutter/material.dart';

/// Поле классических анаграмм: набранное слово сверху, колесо букв снизу.
///
/// 🔴 ВСЁ СЧИТАЕТСЯ ОТ ВЫСОТЫ, КОТОРУЮ ДАЛ КАРКАС (`fieldHeight`), а не от окна.
/// Окно не знает про шапку, счётчики, ряд значков и липкий низ — в веб-версии на
/// этом дважды уезжала доска за экран.
class AnagramBoard extends StatelessWidget {
  const AnagramBoard({
    super.key,
    required this.target,
    required this.letters,
    required this.picked,
    required this.fieldHeight,
    required this.onPick,
    this.revealed = 0,
    this.wrong = false,
  });

  /// Загаданное слово — нужно только для числа клеток и подсказанных букв.
  final String target;

  /// Буквы на колесе в порядке показа.
  final List<String> letters;

  /// Что человек уже набрал: индексы букв колеса.
  final List<int> picked;

  final double fieldHeight;

  /// Нажали букву колеса (индекс). Уже взятые не приходят.
  final ValueChanged<int> onPick;

  /// Сколько первых букв открыто подсказкой.
  final int revealed;

  /// Слово сдано и не принято — клетки краснеют.
  final bool wrong;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final runes = target.runes.map(String.fromCharCode).toList();

    // Делёж высоты: клетки ответа сверху, колесо — остальное, но не больше ширины.
    final slotH = min(64.0, fieldHeight * 0.18);
    final wheelH = fieldHeight - slotH - 24;

    return LayoutBuilder(builder: (context, c) {
      final side = min(wheelH, c.maxWidth);
      return Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          SizedBox(
            height: slotH,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                for (var i = 0; i < runes.length; i++)
                  Container(
                    key: ValueKey('slot-$i'),
                    width: min(44.0, (c.maxWidth - 16) / runes.length - 6),
                    height: slotH * 0.9,
                    margin: const EdgeInsets.symmetric(horizontal: 3),
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      border: Border.all(
                        color: wrong
                            ? scheme.error
                            : (i < revealed ? scheme.primary : scheme.outlineVariant),
                        width: i < revealed ? 2 : 1.5,
                      ),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text(
                      i < picked.length
                          ? letters[picked[i]]
                          : (i < revealed ? runes[i] : ''),
                      style: TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.w800,
                        color: i < picked.length ? scheme.onSurface : scheme.primary,
                      ),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: side,
            height: side,
            child: LetterRing(letters: letters, picked: picked, side: side, onPick: onPick),
          ),
        ],
      );
    });
  }

}

/// Размер плитки колеса и радиус круга, по которому они стоят — одно место для вёрстки и для
/// попадания пальцем (иначе они разъедутся).
double ringTileSize(double side) => min(56.0, side / 3.2);
double ringRadius(double side) => side / 2 - min(30.0, side / 8);

/// Плитка колеса под точкой [p] (локальные координаты колеса) или null. Первая буква сверху,
/// дальше по часовой — как в [LetterRing]. Попадание — внутри круга плитки.
int? ringTileAt(Offset p, int n, double side) {
  final c = Offset(side / 2, side / 2);
  final r = ringRadius(side);
  final hit = ringTileSize(side) / 2;
  for (var i = 0; i < n; i++) {
    final a = -pi / 2 + 2 * pi * i / n;
    if ((p - (c + Offset(r * cos(a), r * sin(a)))).distance <= hit) return i;
  }
  return null;
}

/// КОЛЕСО БУКВ — ОДНО НА ВСЕ РЕЖИМЫ АНАГРАММ.
///
/// Вынесено из поля классики, когда понадобилось второму режиму: второй экземпляр
/// того же круга означал бы две раскладки, которые разъедутся при первой правке.
/// Родня в вебе — `src/components/letterWheel/LetterWheel.tsx`, тоже общий.
///
/// 🔴 ВВОД ДВУМЯ СПОСОБАМИ: тап по плитке и ПРОТЯЖКА пальцем по буквам без отрыва. В вебе колесо
/// вело палец (`onResponderMove`), в нативе остались только тапы — отзыв игрока 2b597852:
/// «смысл круга в том, что буквы соединяют пальцем». Протяжка берёт каждую новую плитку под
/// пальцем ровно один раз, взятые не трогает; тап работает как раньше (InkWell отменяется,
/// когда палец ушёл дальше касательного допуска).
class LetterRing extends StatefulWidget {
  const LetterRing({
    super.key,
    required this.letters,
    required this.picked,
    required this.side,
    required this.onPick,
  });

  final List<String> letters;

  /// Индексы уже взятых букв: их нельзя нажать повторно.
  final List<int> picked;

  final double side;
  final ValueChanged<int> onPick;

  @override
  State<LetterRing> createState() => _LetterRingState();
}

class _LetterRingState extends State<LetterRing> {
  /// Что взято в ТЕКУЩЕЙ протяжке: родитель перерисуется позже, чем придёт следующее движение.
  final Set<int> _dragged = {};
  Offset? _down;
  int? _downTile;
  bool _dragging = false;

  /// Дальше этого от места касания — уже протяжка, а не тап (логические точки).
  static const _slop = 10.0;

  bool _free(int i) => !widget.picked.contains(i) && !_dragged.contains(i);

  void _take(int i) {
    if (!_free(i)) return;
    _dragged.add(i);
    widget.onPick(i);
  }

  void _move(Offset p) {
    final down = _down;
    if (down == null) return;
    if (!_dragging) {
      if ((p - down).distance < _slop) return;
      _dragging = true;
      final first = _downTile;
      if (first != null) _take(first);
    }
    final t = ringTileAt(p, widget.letters.length, widget.side);
    if (t != null) _take(t);
  }

  void _end() {
    _down = null;
    _downTile = null;
    _dragging = false;
    _dragged.clear();
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final side = widget.side;
    final r = ringRadius(side);
    final n = widget.letters.length;
    return Listener(
      key: const Key('letter-ring'),
      onPointerDown: (e) {
        _down = e.localPosition;
        _downTile = ringTileAt(e.localPosition, n, side);
        _dragging = false;
        _dragged.clear();
      },
      onPointerMove: (e) => _move(e.localPosition),
      onPointerUp: (_) => _end(),
      onPointerCancel: (_) => _end(),
      child: Stack(
        alignment: Alignment.center,
        children: [
          Container(
            width: side,
            height: side,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: scheme.surfaceContainerHighest.withValues(alpha: 0.5),
            ),
          ),
          for (var i = 0; i < n; i++) _tile(context, i, n, r, side),
        ],
      ),
    );
  }

  Widget _tile(BuildContext context, int i, int n, double r, double side) {
    final letters = widget.letters;
    final picked = widget.picked;
    final onPick = widget.onPick;
    final scheme = Theme.of(context).colorScheme;
    // Первая буква сверху, дальше по часовой — как в веб-версии.
    final a = -pi / 2 + 2 * pi * i / n;
    final d = ringTileSize(side);
    final used = picked.contains(i);
    return Transform.translate(
      offset: Offset(r * cos(a), r * sin(a)),
      child: Semantics(
        label: letters[i],
        button: true,
        enabled: !used,
        child: SizedBox(
          width: d,
          height: d,
          child: Material(
            key: ValueKey('letter-$i'),
            color: used ? scheme.surfaceContainerHighest : scheme.surface,
            shape: CircleBorder(
              side: BorderSide(color: used ? scheme.outlineVariant : scheme.outline),
            ),
            child: InkWell(
              customBorder: const CircleBorder(),
              onTap: used ? null : () => onPick(i),
              child: Center(
                child: Text(
                  letters[i],
                  style: TextStyle(
                    fontSize: d * 0.42,
                    fontWeight: FontWeight.w800,
                    color: used ? scheme.outline : scheme.onSurface,
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
