library;

import 'package:flutter/material.dart';

import 'l10n.dart';

/// СПРАВКА ПО ПРАВИЛУ — ОДНА НА ВСЕ ИГРЫ.
///
/// 🔴 ПОВОД, 24.09.2026. Нативный экран головоломок не показывал правил ВООБЩЕ:
/// доска и всё. У сорока двух игр коллекции правила разные, и половина из них с
/// доски не угадывается. Отчёт тестировщика по «Рельсам»: человек полтора часа
/// искал, «как повернуть кусок», — а поворота в этой игре нет вовсе, форму задаёт
/// путь протяжки. Текст правила при этом в словаре ЛЕЖАЛ, показать его было нечем.
///
/// ⚠️ Показываем ровно текст из словаря и ничего не дописываем от себя: правило
/// пишет владелец игры, выверяя его на людях, а справка — только окно.
Future<void> showGameRules(
  BuildContext context, {
  required String title,
  required String ruleKey,
}) {
  return showDialog<void>(
    context: context,
    builder: (ctx) => AlertDialog(
      key: const Key('game-rules'),
      title: Text(title),
      content: SingleChildScrollView(
        child: Text(
          L.t(ruleKey),
          key: const Key('game-rules-text'),
          style: const TextStyle(fontSize: 16, height: 1.35),
        ),
      ),
      actions: [
        FilledButton(
          key: const Key('game-rules-close'),
          onPressed: () => Navigator.of(ctx).pop(),
          child: Text(L.t('close')),
        ),
      ],
    ),
  );
}
