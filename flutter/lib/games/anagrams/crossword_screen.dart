import 'package:flutter/material.dart';

import '../../shell/aux_action.dart';
import '../../shell/game_shell.dart';
import '../../shell/l10n.dart';
import '../../shell/level_ladder.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import 'crossword.dart';
import 'crossword_board.dart';
import 'model.dart';

/// Экран «Кроссворд» — третий режим анаграмм.
///
/// Слова из одного набора букв вписаны в сетку и пересекаются: открытая буква —
/// половина соседнего слова. Порядок свободный, лимита времени нет.
///
/// ⚠️ Перехват в гибриде не включается, пока не готов четвёртый режим:
/// `HybridApp.routeOf` срезает `?query`, и одна строка карты накрыла бы их разом.
class CrosswordScreen extends StatefulWidget {
  const CrosswordScreen({super.key, required this.state, this.locale = 'ru'});

  final SharedState state;
  final String locale;

  @override
  State<CrosswordScreen> createState() => _CrosswordScreenState();
}

class _CrosswordScreenState extends State<CrosswordScreen> {
  late LevelLadder _ladder;
  WordBank? _bank;
  Crossword? _cw;
  List<String> _letters = const [];

  final List<int> _picked = [];
  final List<String> _found = [];
  final Map<String, int> _opened = {};
  bool _wrong = false;
  int _hintsUsed = 0;

  @override
  void initState() {
    super.initState();
    _ladder = LevelLadder(gameId: 'anagrams_cross', store: SharedLevelStore(widget.state));
    _boot();
  }

  Future<void> _boot() async {
    await _ladder.load();
    final bank = await WordBank.load(widget.locale);
    if (!mounted) return;
    setState(() {
      _bank = bank;
      _deal(bank);
    });
  }

  /// Раздача уровня: сетка детерминирована уровнем — тем же, что служит зерном.
  void _deal(WordBank bank) {
    final pack = bank.packForLevel(_ladder.level);
    if (pack == null) return;
    _cw = buildCrossword(crossWordsOfLevel(pack, _ladder.level), _ladder.level);
    _letters = allWordsLetters(pack, _ladder.level);
    _picked.clear();
    _found.clear();
    _opened.clear();
    _hintsUsed = 0;
    _wrong = false;
  }

  int get _hintsLeft => crossHintsAtLevel(_ladder.level) - _hintsUsed;

  String get _draft => [for (final i in _picked) _letters[i]].join();

  void _pick(int i) {
    if (_picked.contains(i)) return;
    setState(() {
      _picked.add(i);
      _wrong = false;
    });
  }

  /// Сдача: слово засчитывается, только если оно есть В СЕТКЕ.
  ///
  /// ⚠️ Настоящее слово, которого в сетке нет, здесь не бонус, а промах — в этом
  /// режиме ищут именно размещённые слова, и зачесть постороннее значило бы
  /// сказать человеку «угадал», не открыв ни одной клетки.
  Future<void> _submit() async {
    final cw = _cw;
    if (cw == null || _draft.isEmpty) return;
    final word = _draft.toUpperCase();
    if (crosswordHas(cw, word) && !_found.contains(word)) {
      setState(() {
        _found.add(word);
        _picked.clear();
      });
      if (crosswordSolved(cw, _found)) {
        await _ladder.win();
        if (!mounted) return;
        setState(() => _deal(_bank!));
      }
    } else {
      setState(() => _wrong = true);
    }
  }

  void _hint() {
    final cw = _cw;
    if (cw == null || _hintsLeft <= 0) return;
    final h = crosswordHint(cw, _found, _opened);
    if (h == null) return;
    setState(() {
      _hintsUsed++;
      _opened[h.word] = h.opened;
    });
  }

  void _shuffle() => setState(() {
        _letters = [..._letters]..shuffle();
        _picked.clear();
      });

  void _clear() => setState(() {
        _picked.clear();
        _wrong = false;
      });

  @override
  Widget build(BuildContext context) {
    final cw = _cw;
    if (cw == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    return GameShell(
      title: L.t('anagramCrossword'),
      hud: [
        HudItem(label: L.t('level'), value: '${_ladder.level}', icon: Icons.flag_outlined),
        HudItem(
          label: L.t('label_found'),
          value: '${_found.length}/${cw.words.length}',
          icon: Icons.check_circle_outline,
        ),
      ],
      field: (context, h) => CrosswordBoard(
        crossword: cw,
        letters: _letters,
        picked: _picked,
        revealed: crosswordRevealed(cw, _found, _opened),
        wrong: _wrong,
        fieldHeight: h,
        onPick: _pick,
      ),
      auxRow: AuxBar(children: [
        AuxAction(
          icon: Icons.lightbulb_outline,
          label: L.t('btn_hint'),
          tint: const Color(0xFFB45309),
          count: _hintsLeft,
          onPressed: _hintsLeft > 0 ? _hint : null,
        ),
        AuxAction(icon: Icons.shuffle, label: L.t('shuffleBtn'), onPressed: _shuffle),
      ]),
      toolbar: Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
        child: Row(
          children: [
            Expanded(
              child: OutlinedButton.icon(
                key: const ValueKey('crossword-clear'),
                onPressed: _picked.isEmpty ? null : _clear,
                icon: const Icon(Icons.backspace_outlined),
                label: Text(L.t('clear')),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: FilledButton.icon(
                key: const ValueKey('crossword-check'),
                onPressed: _picked.isEmpty ? null : () { _submit(); },
                icon: const Icon(Icons.done),
                label: Text(L.t('check')),
              ),
            ),
          ],
        ),
      ),
      pauseActions: [
        PauseAction(label: L.t('shuffleBtn'), icon: Icons.shuffle, onPressed: _shuffle),
      ],
    );
  }
}
