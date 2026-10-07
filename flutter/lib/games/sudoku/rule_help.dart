/// СПРАВКА ПРАВИЛА ВАРИАНТА — перенос `RulesHelpModal` / `exampleGrid` / `exampleCaption` веба
/// (`frontend/app/games/sudoku.tsx`) и его автопоказа при первом входе на новое правило.
///
/// 🔴 ПОВОД — отчёт Вали: играла «ход конём», не зная правила (сверка «веб против натива»
/// 138f7818, строки 109 и 111, «высокая»; задача b5df5096 п.5). В нативе правило было видно
/// только именем в полосе («ход коня») — что именно запрещено, не говорил никто.
///
/// Что здесь: окно правила (базовое правило, правило варианта, мини-схема 5×5 для
/// геометрических правил, подпись-пример `sudokuEx_*`) и карточка «новое правило» над доской.
/// ⚠️ Карточка НЕ модальная, в отличие от веба: окно поверх доски на первом входе закрывало бы
/// поле от первого касания. Карточка стоит над полем, пока человек её не закроет; флаг «видел»
/// — тот же ключ, что у веба (`psygames_sudoku_rulehint_<правило>`), он ходит между половинами.
library;

import 'package:flutter/material.dart';

import '../../shell/game_shell.dart' show GameExit;
import '../../shell/l10n.dart';
import '../../shell/shared_state.dart';
import 'reject_why.dart' show variantRuleKey;

/// Подписи-примеры веба (`sudokuEx_<вариант>`). Списком — чтобы `tools/embed-l10n.mjs` их собрал;
/// у вариантов без своей подписи окно показывает правило без примера.
const sudokuExampleKeys = <String>[
  'sudokuEx_antiking', 'sudokuEx_antiknight', 'sudokuEx_arrow', 'sudokuEx_diagonal',
  'sudokuEx_evenodd', 'sudokuEx_hyper', 'sudokuEx_jigsaw', 'sudokuEx_killer', 'sudokuEx_kropki',
  'sudokuEx_nonconsec', 'sudokuEx_sandwich', 'sudokuEx_thermo', 'sudokuEx_thermocage',
  'sudokuEx_towers', 'sudokuEx_unequal',
];

/// Ключ «уже видел правило» — тот же, что у веба.
String sudokuRuleSeenKey(String rule) => 'psygames_sudoku_rulehint_$rule';

/// Клетка мини-схемы: поставленная цифра, клетка, куда такую же нельзя, особая зона.
enum SudokuExampleKind { source, banned, zone }

typedef SudokuExampleMark = ({String? digit, SudokuExampleKind kind});

const _knight = [(-2, -1), (-2, 1), (-1, -2), (-1, 2), (1, -2), (1, 2), (2, -1), (2, 1)];

/// Мини-схема 5×5 для геометрических правил (`exampleGrid` веба); `null` — у правила схемы нет.
Map<(int, int), SudokuExampleMark>? sudokuExampleGrid(String variant) {
  final m = <(int, int), SudokuExampleMark>{};
  switch (variant) {
    case 'antiknight':
      m[(2, 2)] = (digit: '3', kind: SudokuExampleKind.source);
      for (final (dr, dc) in _knight) {
        m[(2 + dr, 2 + dc)] = (digit: '3', kind: SudokuExampleKind.banned);
      }
      return m;
    case 'antiking':
      m[(2, 2)] = (digit: '3', kind: SudokuExampleKind.source);
      for (final (dr, dc) in const [(-1, -1), (-1, 1), (1, -1), (1, 1)]) {
        m[(2 + dr, 2 + dc)] = (digit: '3', kind: SudokuExampleKind.banned);
      }
      return m;
    case 'nonconsec':
      m[(2, 2)] = (digit: '3', kind: SudokuExampleKind.source);
      m[(1, 2)] = (digit: '2', kind: SudokuExampleKind.banned);
      m[(3, 2)] = (digit: '4', kind: SudokuExampleKind.banned);
      m[(2, 1)] = (digit: '4', kind: SudokuExampleKind.banned);
      m[(2, 3)] = (digit: '2', kind: SudokuExampleKind.banned);
      return m;
    case 'diagonal':
      for (var i = 0; i < 5; i++) {
        m[(i, i)] = (digit: null, kind: SudokuExampleKind.zone);
        m[(i, 4 - i)] = (digit: null, kind: SudokuExampleKind.zone);
      }
      m[(0, 0)] = (digit: '3', kind: SudokuExampleKind.source);
      m[(3, 3)] = (digit: '3', kind: SudokuExampleKind.banned);
      return m;
    case 'argyle':
      // Кусок узора: короткая диагональ (r+c = 4 в схеме) — тройка на ней запрещает тройку по всей линии.
      for (var i = 0; i < 5; i++) {
        m[(i, 4 - i)] = (digit: null, kind: SudokuExampleKind.zone);
      }
      for (var i = 1; i < 5; i++) {
        m[(i, i - 1)] = (digit: null, kind: SudokuExampleKind.zone);
      }
      m[(2, 2)] = (digit: '3', kind: SudokuExampleKind.source);
      m[(4, 0)] = (digit: '3', kind: SudokuExampleKind.banned);
      m[(0, 4)] = (digit: '3', kind: SudokuExampleKind.banned);
      return m;
    case 'hyper':
      for (var r = 1; r <= 3; r++) {
        for (var c = 1; c <= 3; c++) {
          m[(r, c)] = (digit: null, kind: SudokuExampleKind.zone);
        }
      }
      m[(1, 1)] = (digit: '3', kind: SudokuExampleKind.source);
      m[(3, 3)] = (digit: '3', kind: SudokuExampleKind.banned);
      return m;
    default:
      return null;
  }
}

/// Полное правило варианта — ключ словаря (у киллера — `sudokuKillerRule`); `null` — правила нет.
String? sudokuRuleTextKey(String rule) => rule == 'none' ? null : variantRuleKey(rule);

/// Окно правила: название, базовое правило, правило варианта, мини-схема, подпись-пример.
Future<void> showSudokuRuleHelp(
  BuildContext context, {
  required String rule,
  required String title,
  required int n,
}) {
  final ruleKey = sudokuRuleTextKey(rule);
  final grid = sudokuExampleGrid(rule);
  final caption = 'sudokuEx_$rule';
  return showDialog<void>(
    context: context,
    builder: (ctx) {
      final scheme = Theme.of(ctx).colorScheme;
      Color bg(SudokuExampleMark? m) => switch (m?.kind) {
            SudokuExampleKind.source => const Color(0xFF7F7FD5),
            SudokuExampleKind.banned => const Color(0xFFFECACA),
            SudokuExampleKind.zone => const Color(0xFFFDE68A),
            null => scheme.surface,
          };
      Color ink(SudokuExampleMark? m) => switch (m?.kind) {
            SudokuExampleKind.source => Colors.white,
            SudokuExampleKind.banned => const Color(0xFFB91C1C),
            _ => scheme.onSurface,
          };
      return AlertDialog(
        key: const Key('sudoku-rule-help'),
        title: Text(title),
        content: SingleChildScrollView(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Text(
              L.f('sudokuBaseRule', {'n': '$n'}),
              key: const Key('sudoku-rule-base'),
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 13, color: scheme.onSurfaceVariant),
            ),
            if (ruleKey != null) ...[
              const SizedBox(height: 10),
              Text(L.t(ruleKey), key: const Key('sudoku-rule-text'), textAlign: TextAlign.center),
            ],
            if (grid != null) ...[
              const SizedBox(height: 12),
              Column(key: const Key('sudoku-rule-example'), mainAxisSize: MainAxisSize.min, children: [
                for (var r = 0; r < 5; r++)
                  Row(mainAxisSize: MainAxisSize.min, children: [
                    for (var c = 0; c < 5; c++)
                      Container(
                        key: Key('example_${r}_$c'),
                        width: 34,
                        height: 34,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: bg(grid[(r, c)]),
                          border: Border.all(color: scheme.outlineVariant, width: 0.5),
                        ),
                        child: grid[(r, c)]?.digit == null
                            ? null
                            : Text(
                                grid[(r, c)]!.digit!,
                                style: TextStyle(
                                  color: ink(grid[(r, c)]),
                                  fontWeight: FontWeight.w800,
                                  fontSize: 16,
                                  decoration: grid[(r, c)]!.kind == SudokuExampleKind.banned
                                      ? TextDecoration.lineThrough
                                      : null,
                                ),
                              ),
                      ),
                  ]),
              ]),
            ],
            if (L.has(caption)) ...[
              const SizedBox(height: 10),
              Text(
                L.t(caption),
                key: const Key('sudoku-rule-caption'),
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 13, color: scheme.onSurfaceVariant),
              ),
            ],
          ]),
        ),
        actions: [
          // Сказать «в правилах ошибка» хочется именно отсюда — как в окне веба.
          if (GameExit.feedback != null)
            TextButton(
              onPressed: () {
                Navigator.of(ctx).pop();
                GameExit.feedback?.call();
              },
              child: Text(L.t('feedbackFabLabel')),
            ),
          FilledButton(
            key: const Key('sudoku-rule-ok'),
            onPressed: () => Navigator.of(ctx).pop(),
            child: Text(L.t('ctaGotIt')),
          ),
        ],
      );
    },
  );
}

/// Карточка «новое правило» над доской: значок новинки, текст правила, «Правило» (окно со
/// схемой) и «Закрыть». Любая из двух кнопок ставит флаг «видел».
class SudokuRuleBanner extends StatelessWidget {
  const SudokuRuleBanner({super.key, required this.rule, required this.onMore, required this.onClose});

  final String rule;
  final VoidCallback onMore;
  final VoidCallback onClose;

  /// Высота, которую карточка забирает у поля.
  static const height = 72.0;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final key = sudokuRuleTextKey(rule);
    return SizedBox(
      key: const Key('sudoku-rule-banner'),
      height: height,
      child: Card(
        margin: const EdgeInsets.fromLTRB(8, 4, 8, 4),
        color: scheme.secondaryContainer,
        child: Row(children: [
          const SizedBox(width: 10),
          Icon(Icons.new_releases_outlined, color: scheme.onSecondaryContainer, size: 20),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              key == null ? '' : L.t(key),
              key: const Key('sudoku-rule-banner-text'),
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 12, height: 1.25, color: scheme.onSecondaryContainer),
            ),
          ),
          IconButton(
            key: const Key('sudoku-rule-more'),
            // «Правило», а не «Правила»: «Правила» — кнопка шапки с описанием игры, это другое окно.
            tooltip: L.t('simonRule'),
            icon: const Icon(Icons.help_outline),
            onPressed: onMore,
          ),
          IconButton(
            key: const Key('sudoku-rule-close'),
            tooltip: L.t('close'),
            icon: const Icon(Icons.close),
            onPressed: onClose,
          ),
        ]),
      ),
    );
  }
}

/// Видел ли человек правило (флаг веба и натива общий).
bool sudokuRuleSeen(SharedState state, String rule) => state.get(sudokuRuleSeenKey(rule)) != null;
