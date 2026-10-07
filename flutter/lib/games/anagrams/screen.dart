import 'dart:async';

import 'package:flutter/material.dart';

import '../../shell/aux_action.dart';
import '../../shell/game_shell.dart';
import '../../shell/l10n.dart';
import '../../shell/lesson.dart';
import '../../shell/lesson_player.dart';
import '../../shell/level_ladder.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import 'board.dart';
import 'model.dart';
import 'teach.dart';
import 'word_lang.dart';

/// Экран «Анаграммы», КЛАССИЧЕСКИЙ режим.
///
/// ⚠️ ЗА АДРЕСОМ `/games/anagrams` СТОЯТ ЧЕТЫРЕ ИГРЫ: классика, «Все слова»,
/// кроссворд, слово-квадрат. У каждой свой ключ перехвата с хвостом `?mode=…`
/// (`HybridApp.routeOf` ищет адрес сначала вместе с хвостом); голый адрес — классика.
///
/// Каркас взят готовым: шапка, счётчики, ряд значков под полем, липкий низ,
/// пауза и лестница уровней. Своего здесь — доска и четыре действия.
class AnagramsScreen extends StatefulWidget {
  const AnagramsScreen({super.key, required this.state, this.locale});

  final SharedState state;

  /// Язык слов. Не задан — по правилу веба ([anagramWordLang]): шаг зарядки, выбор
  /// человека, язык интерфейса. Пробы задают его явно.
  final String? locale;

  @override
  State<AnagramsScreen> createState() => _AnagramsScreenState();
}

class _AnagramsScreenState extends State<AnagramsScreen> {
  late LevelLadder _ladder;
  late final String _lang = widget.locale ?? anagramWordLang(widget.state, AnagramMode.classic);
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
    final bank = await WordBank.load(_lang);
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
      // Новая партия — отметка разбора снимается: следующая снова зачётная.
      LessonUsed.reset();
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

  /* ═══════════ РАЗБОР ПО ШАГАМ ═══════════
   *
   * 🔴 БЕЗ ЭТОГО ПЕРЕХВАТ ОТНИМАЛ БЫ РАЗБОР, КОТОРЫЙ В ВЕБЕ УЖЕ ЕСТЬ. Гейт
   * `lesson_census_test.dart` поймал ровно это: нативный экран открывается вместо
   * веб-страницы, а кнопки разбора у него нет — значит функция пропала у игрока,
   * и ни одна проба самого экрана этого не заметила бы.
   *
   * Правило доступности перенесено дословно (`anagrams.tsx:1103`): первые три
   * уровня и не меньше двух шагов. Дальше человек уже знает приёмы, и показ решения
   * только мешает.
   */
  List<TeachStep> get _lessonSteps {
    final round = _round;
    final bank = _bank;
    if (round == null || bank == null) return const [];
    return anagramLesson(round.target, round.letters, bank.classicBank);
  }

  Future<void> _openLesson() async {
    final round = _round;
    final steps = _lessonSteps;
    if (round == null || steps.length < 2) return;
    // Партия с показанным решением лестницу не двигает — правило живёт в каркасе
    // (`LevelLadder.win/fail` смотрят на эту отметку).
    LessonUsed.mark();
    await Navigator.of(context).push(MaterialPageRoute<void>(
      builder: (_) => LessonPlayerScreen(
        title: L.t('anagrams'),
        steps: [
          for (final s in steps)
            // Текст СОБИРАЕТСЯ из словаря теми же ключами, что зовёт экран: в нём
            // три подстановки ({piece}, {n}, {total}), ключом их не передать.
            LessonStep(text: teachStepText(s, L.t), payload: s),
        ],
        board: (context, side, shown) {
          // Показываем ровно то, что собрано к этому шагу: индексы плиток берём из
          // шагов, а не заново — подсветка обязана совпасть с объяснением.
          final placed = <int>[];
          for (var i = 0; i < shown && i < steps.length; i++) {
            placed.addAll(steps[i].place);
          }
          return AnagramBoard(
            target: round.target,
            letters: round.letters,
            picked: placed,
            fieldHeight: side,
            revealed: 0,
            wrong: false,
            onPick: (_) {},
          );
        },
      ),
    ));
  }

  @override
  Widget build(BuildContext context) {
    final round = _round;
    if (round == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    return GameShell(
      title: L.t('anagrams'),
      // Кнопка разбора — только там, где он есть: первые уровни и слово, которое
      // разбирается. Нет шагов — нет и кнопки (каркас скрывает её сам при null).
      onLesson: _ladder.level <= 3 && _lessonSteps.length > 1 ? _openLesson : null,
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
        if (!anagramWordLangFromStep()) anagramWordLangAction(context, widget.state, AnagramMode.classic, _lang),
      ],
    );
  }
}
