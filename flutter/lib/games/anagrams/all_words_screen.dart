import 'package:flutter/material.dart';

import '../../shell/aux_action.dart';
import '../../shell/game_shell.dart';
import '../../shell/l10n.dart';
import '../../shell/level_ladder.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import 'all_words_board.dart';
import 'model.dart';

/// Экран «Все слова» — второй режим анаграмм.
///
/// Из одного набора букв человек ищет ВСЕ слова, которые из него складываются.
/// Число целей и есть трудность: раскладка на шесть закрывается за минуту, на
/// восемнадцать — уже сеанс. Лимита времени здесь нет.
///
/// ⚠️ Перехват в гибриде не включается, пока не готовы все четыре режима:
/// `HybridApp.routeOf` срезает `?query`, и одна строка карты накрыла бы их разом.
class AllWordsScreen extends StatefulWidget {
  const AllWordsScreen({super.key, required this.state, this.locale = 'ru'});

  final SharedState state;
  final String locale;

  @override
  State<AllWordsScreen> createState() => _AllWordsScreenState();
}

class _AllWordsScreenState extends State<AllWordsScreen> {
  late LevelLadder _ladder;
  WordBank? _bank;
  WordPack? _pack;
  List<String> _letters = const [];

  final List<int> _picked = [];
  final List<String> _found = [];
  final List<String> _bonuses = [];
  final Map<String, int> _opened = {};
  bool _wrong = false;
  int _hintsUsed = 0;

  static const _hintsPerRound = 3;

  @override
  void initState() {
    super.initState();
    _ladder = LevelLadder(gameId: 'anagrams_all', store: SharedLevelStore(widget.state));
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

  /// Раздача уровня. Раскладка детерминирована уровнем, порядок букв — зерном.
  void _deal(WordBank bank) {
    final pack = bank.packForLevel(_ladder.level);
    _pack = pack;
    _letters = pack == null ? const [] : allWordsLetters(pack, _ladder.level);
    _picked.clear();
    _found.clear();
    _bonuses.clear();
    _opened.clear();
    _hintsUsed = 0;
    _wrong = false;
  }

  String get _draft => [for (final i in _picked) _letters[i]].join();

  void _pick(int i) {
    if (_picked.contains(i)) return;
    setState(() {
      _picked.add(i);
      _wrong = false;
    });
  }

  /// Сдача черновика. Цель — в список, бонус — отдельной строкой, мимо — красным.
  Future<void> _submit() async {
    final pack = _pack;
    if (pack == null || _draft.isEmpty) return;
    final word = _draft.toLowerCase();
    final outcome = submitWord(pack, word, _found, vocabulary: _bank?.vocabulary());
    setState(() {
      switch (outcome) {
        case WordOutcome.target:
          _found.add(word);
          _picked.clear();
        case WordOutcome.bonus:
          if (!_bonuses.contains(word)) _bonuses.add(word);
          _picked.clear();
        case WordOutcome.repeat:
        case WordOutcome.miss:
          _wrong = true;
      }
    });
    if (allFound(pack, _found)) {
      await _ladder.win();
      if (!mounted) return;
      setState(() => _deal(_bank!));
    }
  }

  /// Подсказка приоткрывает ОДНУ букву самого короткого незакрытого слова.
  void _hint() {
    final pack = _pack;
    if (pack == null || _hintsUsed >= _hintsPerRound) return;
    final h = allWordsHint(pack, _found, _opened);
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
    final pack = _pack;
    if (pack == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    return GameShell(
      title: L.t('anagramAllWords'),
      hud: [
        HudItem(label: L.t('level'), value: '${_ladder.level}', icon: Icons.flag_outlined),
        HudItem(
          label: L.t('label_found'),
          value: '${_found.length}/${pack.words.length}',
          icon: Icons.check_circle_outline,
        ),
        if (_bonuses.isNotEmpty)
          HudItem(label: L.t('anagramBonusJar'), value: '${_bonuses.length}', icon: Icons.star_outline),
      ],
      field: (context, h) => AllWordsBoard(
        pack: pack,
        letters: _letters,
        picked: _picked,
        found: _found,
        opened: _opened,
        bonuses: _bonuses,
        wrong: _wrong,
        fieldHeight: h,
        onPick: _pick,
      ),
      auxRow: AuxBar(children: [
        AuxAction(
          icon: Icons.lightbulb_outline,
          label: L.t('btn_hint'),
          tint: const Color(0xFFB45309),
          count: _hintsPerRound - _hintsUsed,
          onPressed: _hintsUsed < _hintsPerRound ? _hint : null,
        ),
        AuxAction(icon: Icons.shuffle, label: L.t('shuffleBtn'), onPressed: _shuffle),
      ]),
      toolbar: Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
        child: Row(
          children: [
            Expanded(
              child: OutlinedButton.icon(
                key: const ValueKey('all-words-clear'),
                onPressed: _picked.isEmpty ? null : _clear,
                icon: const Icon(Icons.backspace_outlined),
                label: Text(L.t('clear')),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: FilledButton.icon(
                key: const ValueKey('all-words-check'),
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
