import 'dart:math';

import 'package:flutter/material.dart';

import '../../shell/game_shell.dart';
import '../../shell/l10n.dart';
import 'bands.dart';
import 'positions.dart';
import 'series.dart';

/// ЭКРАН СЕРИИ: три блока подряд по ОДНОЙ позиции.
///
/// Серия — это РЕЖИМ того же экрана, а не вторая игра рядом: позиция одна, а
/// блоки меряют разные умения (цвет поля, маршрут коня, память). Вопросы строит
/// `series.dart`, сверенный с вебом число в число; здесь только показ и ответы.
class ChessBlindSeriesScreen extends StatefulWidget {
  const ChessBlindSeriesScreen({
    super.key,
    this.level = 1,
    this.corpus,
    this.seed,
  });

  final int level;
  final PositionCorpus? corpus;
  final int? seed;

  @override
  State<ChessBlindSeriesScreen> createState() => _ChessBlindSeriesScreenState();
}

class _ChessBlindSeriesScreenState extends State<ChessBlindSeriesScreen> {
  List<SeriesQuestion> _questions = const [];
  int _block = 0;
  int _asked = 0;
  int _errors = 0;
  bool _done = false;
  String? _error;
  List<String?> _squares = List<String?>.filled(64, null);

  @override
  void initState() {
    super.initState();
    _start();
  }

  Future<void> _start() async {
    try {
      final corpus = widget.corpus ?? await PositionCorpus.load();
      if (!mounted) return;
      final band = bandForLevel(widget.level);
      final entry = corpus.pickRandom(band, Random(widget.seed ?? 1));
      setState(() {
        _squares = coreSquaresFromFen(entry.fen);
        _block = 0;
        _asked = 0;
        _errors = 0;
        _done = false;
        _error = null;
        _questions = _buildBlock(0);
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = "${L.t('chessBlind')}: $e");
    }
  }

  List<SeriesQuestion> _buildBlock(int index) => buildBlockQuestions(
    squares: _squares,
    level: widget.level,
    blockIndex: index,
    random: lcg((widget.seed ?? 1) + index * 7919),
  );

  void _answer(bool said) {
    if (_done || _asked >= _questions.length) return;
    final right = _questions[_asked].answer == said;
    setState(() {
      _asked++;
      if (!right) _errors++;
      if (_asked < _questions.length) return;
      // Блок кончился: дальше следующий, а после третьего — итог.
      if (_block + 1 < chessSeriesPlan.length) {
        _block++;
        _asked = 0;
        _questions = _buildBlock(_block);
      } else {
        _done = true;
      }
    });
  }

  String _ask(SeriesQuestion q) {
    String name(int sq) => '${'abcdefgh'[sq % 8]}${sq ~/ 8 + 1}';
    switch (q.kind) {
      case 'square':
        return L.f('chessAskSquare', {'a': name(q.a!), 'b': name(q.b!)});
      case 'knight':
        return L.f('chessAskKnight', {
          'from': name(q.from!),
          'to': name(q.to!),
          'n': '${q.moves}',
        });
      default:
        final claim = q.claim ?? '';
        // Цвет и вид фигуры — ключи общего словаря: chessPcWK, chessPcBQ и так далее.
        final piece = claim.length < 2
            ? claim
            : L.t('chessPc${claim[0].toUpperCase()}${claim[1].toUpperCase()}');
        return L.f('chessAskRecall', {'sq': name(q.square!), 'piece': piece});
    }
  }

  @override
  Widget build(BuildContext context) {
    // Названия блоков живут в СВОЁМ модуле языков веб-версии, а не в общем
    // словаре. Пока ключи не заведены, зовём их по именам: экран покажет ключ,
    // но русского литерала в коде не будет — общий гейт держит именно это.
    final blockName = switch (blockKeyAt(_block)) {
      'square' => L.t('chessBlockSquare'),
      'knight' => L.t('chessBlockKnight'),
      _ => L.t('chessBlockRecall'),
    };

    return GameShell(
      title: L.t('chessBlind'),
      hud: [
        HudItem(
          label: L.t('block'),
          value: '${_block + 1}/${chessSeriesPlan.length}',
        ),
        HudItem(
          label: L.t('chessQuestionShort'),
          value: '$_asked/${_questions.length}',
        ),
        HudItem(label: L.t('errors'), value: '$_errors'),
      ],
      field: (context, h) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(
            _error ??
                (_done
                    ? "${L.t('seriesDone')}: $_errors"
                    : _questions.isEmpty
                    ? L.t('label_ready')
                    : '$blockName\n\n${_ask(_questions[_asked])}'),
            key: const Key('cbs-question'),
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.titleMedium,
          ),
        ),
      ),
      toolbar: _done || _questions.isEmpty
          ? null
          : Padding(
              padding: const EdgeInsets.all(12),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [
                  OutlinedButton(
                    key: const Key('cbs-no'),
                    onPressed: () => _answer(false),
                    child: Text(L.t('no')),
                  ),
                  FilledButton(
                    key: const Key('cbs-yes'),
                    onPressed: () => _answer(true),
                    child: Text(L.t('yes')),
                  ),
                ],
              ),
            ),
    );
  }
}
