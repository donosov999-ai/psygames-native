import 'package:flutter/material.dart';

import '../../shell/aux_action.dart';
import '../../shell/game_shell.dart';
import '../../shell/l10n.dart';
import '../../shell/lesson.dart';
import '../../shell/lesson_player.dart';
import '../../shell/level_ladder.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import 'ring.dart';
import 'ring_board.dart';
import 'teach.dart';
import 'word_lang.dart';

/// Экран «Слово-квадрат» — четвёртый и последний режим анаграмм.
///
/// Четыре слова по краям квадрата из одного банка; соседние делят угол. Трудность
/// растёт не длиной — сторона всегда пять, — а числом ЛОЖНЫХ КАНДИДАТОВ: слов,
/// которые из того же банка почти складываются.
class RingScreen extends StatefulWidget {
  const RingScreen({super.key, required this.state, this.locale});

  final SharedState state;

  /// Язык слов. Не задан — [anagramWordLang]; пробы задают его явно.
  final String? locale;

  @override
  State<RingScreen> createState() => _RingScreenState();
}

class _RingScreenState extends State<RingScreen> {
  late LevelLadder _ladder;
  late final String _lang = widget.locale ?? anagramWordLang(widget.state, AnagramMode.square);
  RingPacks? _packs;
  Ring? _ring;
  List<String> _letters = const [];

  final List<int> _picked = [];
  final Set<String> _solved = {};
  bool _wrong = false;
  int _hintsUsed = 0;

  static const _hintsPerRound = 2;

  @override
  void initState() {
    super.initState();
    _ladder = LevelLadder(gameId: 'anagrams_square', store: SharedLevelStore(widget.state));
    _boot();
  }

  Future<void> _boot() async {
    await _ladder.load();
    final packs = await RingPacks.load(_lang);
    if (!mounted) return;
    setState(() {
      _packs = packs;
      _deal(packs);
    });
  }

  void _deal(RingPacks packs) {
    final ring = packs.ringForLevel(_ladder.level);
    _ring = ring;
    _letters = [...ring.bank];
    _picked.clear();
    _solved.clear();
    _hintsUsed = 0;
    _wrong = false;
    // Новое кольцо — отметка разбора снимается: следующая партия зачётная.
    LessonUsed.reset();
  }

  String get _draft => [for (final i in _picked) _letters[i]].join();

  void _pick(int i) {
    if (_picked.contains(i)) return;
    setState(() {
      _picked.add(i);
      _wrong = false;
    });
  }

  /// Какой стороне принадлежит слово. Одно слово может стоять сразу на двух
  /// сторонах (у симметричных квадратов) — засчитываем первую незакрытую.
  String? _sideOf(String word) {
    final pairs = {
      'top': _ring!.top,
      'right': _ring!.right,
      'bottom': _ring!.bottom,
      'left': _ring!.left,
    };
    for (final e in pairs.entries) {
      if (e.value.toUpperCase() == word && !_solved.contains(e.key)) return e.key;
    }
    return null;
  }

  Future<void> _submit() async {
    final ring = _ring;
    if (ring == null || _draft.isEmpty) return;
    final side = _sideOf(_draft.toUpperCase());
    if (side == null) {
      setState(() => _wrong = true);
      return;
    }
    setState(() {
      _solved.add(side);
      _picked.clear();
    });
    if (_solved.length == 4) {
      await _ladder.win();
      if (!mounted) return;
      setState(() => _deal(_packs!));
    }
  }

  /// Подсказка открывает СТОРОНУ целиком: открывать по букве в квадрате, где
  /// углы общие, значило бы выдавать и соседнее слово наполовину.
  void _hint() {
    final ring = _ring;
    if (ring == null || _hintsUsed >= _hintsPerRound) return;
    const order = ['top', 'right', 'bottom', 'left'];
    final next = order.firstWhere((s) => !_solved.contains(s), orElse: () => '');
    if (next.isEmpty) return;
    setState(() {
      _hintsUsed++;
      _solved.add(next);
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

  /* ═══════════ РАЗБОР ПО ШАГАМ: РЕДКОЕ НАЧАЛО, ПОТОМ УГЛЫ ═══════════
   *
   * Приём и замер, из которого он выбран, — в `teach.dart` (`ringLesson`).
   * Доступность — как у остальных режимов анаграмм: первые три уровня.
   */
  List<RingTeachStep> get _lessonSteps {
    final ring = _ring;
    final packs = _packs;
    if (ring == null || packs == null) return const [];
    return ringLesson(ring, packs.dictionary);
  }

  Future<void> _openLesson() async {
    final ring = _ring;
    final steps = _lessonSteps;
    if (ring == null || steps.length < 2) return;
    LessonUsed.mark();
    final letters = [..._letters];
    await Navigator.of(context).push(MaterialPageRoute<void>(
      builder: (_) => LessonPlayerScreen(
        title: L.t('anagramSquare'),
        steps: [
          for (final s in steps) LessonStep(text: teachRingText(s, L.t), payload: s),
        ],
        board: (context, side, shown) => RingBoard(
          ring: ring,
          letters: letters,
          picked: const [],
          // Как у остальных разборов каркаса: на шаге i стоят стороны шагов ДО него.
          solved: {
            for (var i = 0; i < shown && i < steps.length; i++)
              if (steps[i].word.isNotEmpty) steps[i].word,
          },
          wrong: false,
          fieldHeight: side,
          onPick: (_) {},
        ),
      ),
    ));
  }

  @override
  Widget build(BuildContext context) {
    final ring = _ring;
    if (ring == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    return GameShell(
      title: L.t('anagramSquare'),
      onLesson: _ladder.level <= 3 && _lessonSteps.length > 1 ? _openLesson : null,
      hud: [
        HudItem(label: L.t('level'), value: '${_ladder.level}', icon: Icons.flag_outlined),
        HudItem(label: L.t('label_found'), value: '${_solved.length}/4', icon: Icons.check_circle_outline),
      ],
      field: (context, h) => RingBoard(
        ring: ring,
        letters: _letters,
        picked: _picked,
        solved: _solved,
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
                key: const ValueKey('ring-clear'),
                onPressed: _picked.isEmpty ? null : _clear,
                icon: const Icon(Icons.backspace_outlined),
                label: Text(L.t('clear')),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: FilledButton.icon(
                key: const ValueKey('ring-check'),
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
        if (!anagramWordLangFromStep()) anagramWordLangAction(context, widget.state, AnagramMode.square, _lang),
      ],
    );
  }
}
