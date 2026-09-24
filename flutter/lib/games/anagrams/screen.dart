import 'dart:async';

import 'package:flutter/material.dart';

import '../../shell/aux_action.dart';
import '../../shell/game_shell.dart';
import '../../shell/l10n.dart';
import '../../shell/level_ladder.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import 'board.dart';
import 'model.dart';

/// Экран «Анаграммы», КЛАССИЧЕСКИЙ режим.
///
/// ⚠️ ЗА АДРЕСОМ `/games/anagrams` СТОЯТ ЧЕТЫРЕ ИГРЫ: классика, «Все слова»,
/// кроссворд, слово-квадрат. Здесь перенесена первая. Перехват в гибриде идёт ПО
/// МАРШРУТУ (`HybridApp.routeOf` срезает query), поэтому в карту `native` эту
/// игру включают только когда готовы все четыре — иначе человек, выбравший другой
/// режим, потеряет его.
///
/// Каркас взят готовым: шапка, счётчики, ряд значков под полем, липкий низ,
/// пауза и лестница уровней. Своего здесь — доска и четыре действия.
class AnagramsScreen extends StatefulWidget {
  const AnagramsScreen({super.key, required this.state, this.locale = 'ru'});

  final SharedState state;

  /// Язык слов. Язык без своего набора получает английский (`WordBank.resolve`).
  final String locale;

  @override
  State<AnagramsScreen> createState() => _AnagramsScreenState();
}

class _AnagramsScreenState extends State<AnagramsScreen> {
  late LevelLadder _ladder;
  WordBank? _bank;
  ClassicGame? _game;
  AnagramRound? _round;

  final List<int> _picked = [];
  int _trial = 0;
  int _solved = 0;
  int _revealed = 0;
  bool _wrong = false;
  int _secLeft = 0;
  Timer? _tick;

  static const _hintsPerGame = 3;
  int _hintsLeft = _hintsPerGame;

  @override
  void initState() {
    super.initState();
    _ladder = LevelLadder(gameId: 'anagrams', store: SharedLevelStore(widget.state));
    _boot();
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  Future<void> _boot() async {
    await _ladder.load();
    final bank = await WordBank.load(widget.locale);
    if (!mounted) return;
    setState(() {
      _bank = bank;
      _game = ClassicGame(bank: bank, level: AnagramLevel.of(_ladder.level));
    });
    _nextWord();
  }

  AnagramLevel get _level => AnagramLevel.of(_ladder.level);

  void _nextWord() {
    final g = _game;
    if (g == null) return;
    setState(() {
      _round = g.next();
      _picked.clear();
      _revealed = 0;
      _wrong = false;
      _secLeft = _level.wordSec;
    });
    _startTimer();
  }

  /// Часы идут только там, где лимит есть: уровни 1–6 играются без времени.
  void _startTimer() {
    _tick?.cancel();
    if (_level.wordSec <= 0) return;
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      setState(() => _secLeft = _secLeft > 0 ? _secLeft - 1 : 0);
      if (_secLeft == 0) _giveUp();
    });
  }

  void _pick(int i) {
    if (_picked.contains(i)) return;
    setState(() {
      _picked.add(i);
      _wrong = false;
    });
    if (_picked.length == _round!.target.runes.length) _check();
  }

  String get _assembled => [for (final i in _picked) _round!.letters[i]].join();

  /// Сдача слова. Принимается ЛЮБОЕ слово банка этой длины, а не только
  /// загаданное: из тех же букв часто складывается другое верное слово.
  void _check() {
    final g = _game!;
    if (g.accepts(_assembled)) {
      _solved++;
      _advance();
    } else {
      setState(() => _wrong = true);
    }
  }

  void _giveUp() => _advance();

  Future<void> _advance() async {
    _tick?.cancel();
    _trial++;
    if (_trial >= _level.trials) {
      // Партия сыграна: половина слов и больше — уровень засчитан.
      if (_solved * 2 >= _level.trials) {
        await _ladder.win();
      } else {
        await _ladder.fail();
      }
      if (!mounted) return;
      setState(() {
        _trial = 0;
        _solved = 0;
        _hintsLeft = _hintsPerGame;
        _game = ClassicGame(bank: _bank!, level: _level);
      });
    }
    _nextWord();
  }

  void _reset() => setState(() {
        _picked.clear();
        _wrong = false;
      });

  /// Подсказка открывает следующую букву цели и снимает набранное после неё.
  void _hint() {
    if (_hintsLeft <= 0) return;
    final target = _round!.target.runes.map(String.fromCharCode).toList();
    if (_revealed >= target.length) return;
    setState(() {
      _hintsLeft--;
      _revealed++;
      _picked.removeWhere((i) => _picked.indexOf(i) >= _revealed);
    });
  }

  void _shuffle() => setState(() {
        _round = AnagramRound(
          target: _round!.target,
          letters: ClassicGame.shuffleLetters(_round!.target, _game!.rnd),
        );
        _picked.clear();
      });

  @override
  Widget build(BuildContext context) {
    final round = _round;
    if (round == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    return GameShell(
      title: L.t('anagrams'),
      hud: [
        HudItem(label: L.t('level'), value: '${_ladder.level}', icon: Icons.flag_outlined),
        HudItem(label: L.t('round'), value: '${_trial + 1}/${_level.trials}', icon: Icons.tag),
        HudItem(label: L.t('hud_correct'), value: '$_solved', icon: Icons.check_circle_outline),
        if (_level.wordSec > 0)
          HudItem(label: L.t('timeLeftLabel'), value: '$_secLeft${L.t('secShort')}', icon: Icons.timer_outlined),
      ],
      field: (context, h) => AnagramBoard(
        target: round.target,
        letters: round.letters,
        picked: _picked,
        fieldHeight: h,
        revealed: _revealed,
        wrong: _wrong,
        onPick: _pick,
      ),
      // Служебное — значками под полем: подсказка тратит ресурс, перемешивание
      // трогает игру. Ответ игрока живёт ниже, в липком низу.
      auxRow: AuxBar(children: [
        AuxAction(
          icon: Icons.lightbulb_outline,
          label: L.t('btn_hint'),
          tint: const Color(0xFFB45309),
          count: _hintsLeft,
          onPressed: _hintsLeft > 0 ? _hint : null,
        ),
        AuxAction(icon: Icons.shuffle, label: L.t('shuffleBtn'), onPressed: _shuffle),
        AuxAction(
          icon: Icons.skip_next_outlined,
          label: L.t('skip'),
          onPressed: _giveUp,
        ),
      ]),
      toolbar: Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
        child: Row(
          children: [
            Expanded(
              child: OutlinedButton.icon(
                key: const ValueKey('anagrams-reset'),
                onPressed: _picked.isEmpty ? null : _reset,
                icon: const Icon(Icons.backspace_outlined),
                label: Text(L.t('clear')),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: FilledButton.icon(
                key: const ValueKey('anagrams-check'),
                onPressed: _picked.isEmpty ? null : _check,
                icon: const Icon(Icons.done),
                label: Text(L.t('check')),
              ),
            ),
          ],
        ),
      ),
      pauseActions: [
        PauseAction(label: L.t('shuffleBtn'), icon: Icons.shuffle, onPressed: _shuffle),
        PauseAction(label: L.t('skip'), icon: Icons.skip_next_outlined, onPressed: _giveUp),
      ],
    );
  }
}
