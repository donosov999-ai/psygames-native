/// Экран настройки игры: настройки прокручиваются, «Начать» прибита снизу и видна без
/// прокрутки — как веб `GameSetupBar` (отчёт 02.09.2026: «не мотать экран вниз, чтобы
/// запустить»). Нужен, когда на настройке есть выбор режима: на 320×568 она выше поля.
library;

import 'package:flutter/material.dart';

import 'l10n.dart';

class SetupScroll extends StatelessWidget {
  const SetupScroll({super.key, required this.height, required this.children, required this.onStart});

  /// Высота поля — числом от каркаса.
  final double height;
  final List<Widget> children;
  final VoidCallback? onStart;

  @override
  Widget build(BuildContext context) => SizedBox(
        height: height,
        child: Column(children: [
          Expanded(
            child: Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                child: Column(mainAxisSize: MainAxisSize.min, children: children),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(24, 8, 24, 12),
            child: FilledButton(onPressed: onStart, child: Text(L.t('start'))),
          ),
        ]),
      );
}

/// Ряд выбора режима: подпись и плашки, выбранная отмечена.
class SetupChoice<T> extends StatelessWidget {
  const SetupChoice({super.key, required this.label, required this.options, required this.value, required this.onPick});

  final String label;

  /// (значение, подпись, ключ плашки).
  final List<(T, String, String)> options;
  final T value;
  final ValueChanged<T> onPick;

  @override
  Widget build(BuildContext context) => Column(mainAxisSize: MainAxisSize.min, children: [
        Text(label, style: Theme.of(context).textTheme.labelLarge),
        const SizedBox(height: 6),
        Wrap(alignment: WrapAlignment.center, spacing: 6, runSpacing: 6, children: [
          for (final (v, text, key) in options)
            ChoiceChip(key: Key(key), label: Text(text), selected: v == value, onSelected: (_) => onPick(v)),
        ]),
      ]);
}
