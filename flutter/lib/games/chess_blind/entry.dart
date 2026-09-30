import 'package:flutter/material.dart';

import '../../shell/game_shell.dart';
import '../../shell/l10n.dart';
import 'screen.dart';
import 'series_screen.dart';

/// ВХОД В «ДОСКУ В УМЕ»: партия или серия.
///
/// 🔴 РЕЖИМ ВЫБИРАЕТ ЧЕЛОВЕК. В вебе это одна игра с двумя режимами, и маршрут
/// у них общий. Перехватить маршрут и увести сразу в партию значило бы молча
/// отнять серию — поэтому вход спрашивает, как в веб-версии.
class ChessBlindEntry extends StatelessWidget {
  const ChessBlindEntry({super.key, this.level = 1});

  final int level;

  @override
  Widget build(BuildContext context) => GameShell(
    title: L.t('chessBlind'),
    field: (context, h) => Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Text(
              L.t('chessBlindConfigDesc'),
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleMedium,
            ),
          ),
          FilledButton(
            key: const Key('cb-mode-game'),
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (_) => ChessBlindScreen(level: level),
              ),
            ),
            child: Text(L.t('chessBlind')),
          ),
          const SizedBox(height: 12),
          OutlinedButton(
            key: const Key('cb-mode-series'),
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (_) => ChessBlindSeriesScreen(level: level),
              ),
            ),
            child: Text(L.t('seriesBlocksCount')),
          ),
        ],
      ),
    ),
  );
}
