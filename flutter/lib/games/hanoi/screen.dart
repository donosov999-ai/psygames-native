import 'dart:async';

import 'package:flutter/material.dart';

import '../../shell/aux_action.dart';
import '../../shell/game_shell.dart';
import '../../shell/level_ladder.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import 'board.dart';
import 'model.dart';

/// ЭКРАН «ХАНОЙСКОЙ БАШНИ».
///
/// 📍 ДВЕ ЖАЛОБЫ, КОТОРЫЕ ЭТОТ ЭКРАН ОБЯЗАН ЗАКРЫТЬ (отчёт 14.09.2026):
/// «перетаскивание хуёвенько работает… лагает» и «в конце на следующий уровень
/// когда переходишь — вообще непонятно: ни очки не показываются, ни что ты
/// молодец, ни уровень два». Первое лечит поле (диск тащится своим слоем),
/// второе — итог партии: ходы против минимума, звёзды и номер следующего уровня
/// прямо на кнопке.
///
/// ⚠️ ПРОВАЛА ПО ЧИСЛУ ОШИБОК ПОКА НЕТ: решение Дениса 23.09 ведётся задачей
/// f911ecd2 у координатора («уровни не понижать, механизм другой»). Ошибки
/// СЧИТАЮТСЯ и показываются — но уровень от них не зависит.
class HanoiScreen extends StatefulWidget {
  const HanoiScreen({super.key, required this.state});

  final SharedState state;

  @override
  State<HanoiScreen> createState() => _HanoiScreenState();
}

class _HanoiScreenState extends State<HanoiScreen> {
  /// 🔴 СЛЕДУЮЩИЙ УРОВЕНЬ ЕДЕТ САМ (Денис 24.09.2026: «не переходит на
  /// следующий уровень сам»).
  ///
  /// Итог со звёздами показывается 1,4 секунды — столько, чтобы человек увидел
  /// оценку, — и партия продолжается. Кнопка остаётся для тех, кто не ждёт.
  ///
  /// ⚠️ Таймер гасится при уходе с экрана, отмене хода и «начать заново»:
  /// открытый таймер после размонтирования валит весь прогон проб молча.
  Timer? _autoNext;

  void _scheduleNext() {
    _autoNext?.cancel();
    _autoNext = Timer(const Duration(milliseconds: 1400), () {
      if (mounted && _won) _next();
    });
  }

  void _cancelNext() {
    _autoNext?.cancel();
    _autoNext = null;
  }

  late LevelLadder _ladder;
  HanoiState? _board;
  int? _sel;
  int _moves = 0;
  int _errors = 0;
  bool _won = false;
  final List<HanoiState> _history = [];

  @override
  void dispose() {
    // Открытый таймер после ухода с экрана валит весь прогон проб молча.
    _cancelNext();
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    _ladder = LevelLadder(gameId: 'hanoi', store: SharedLevelStore(widget.state));
    _boot();
  }

  Future<void> _boot() async {
    await _ladder.load();
    if (!mounted) return;
    setState(() => _start());
  }

  void _start() {
    _board = HanoiState.start(_ladder.level);
    _sel = null;
    _moves = 0;
    _errors = 0;
    _won = false;
    _history.clear();
  }

  void _restart() {
    _cancelNext();
    setState(_start);
  }

  Future<void> _next() async {
    await _ladder.win();
    if (!mounted) return;
    setState(_start);
  }

  void _tapPeg(int i) {
    if (_won) return;
    setState(() {
      final board = _board!;
      if (_sel == null) {
        if (board.pegs[i].isEmpty) return;   // с пустого брать нечего
        _sel = i;
        return;
      }
      if (_sel == i) {
        _sel = null;
        return;
      }
      final from = _sel!;
      _sel = null;
      _move(from, i);
    });
  }

  /// Ход. Незаконный ход — ОШИБКА, и она считается отдельно от ходов: это и есть
  /// та величина, по которой Денис решил считать провал (задача f911ecd2).
  void _move(int from, int to) {
    final board = _board!;
    final after = board.move(from, to);
    if (after == null) {
      _errors += 1;
      return;
    }
    _history.add(board.copy());
    _moves += 1;
    _board = after;
    if (after.solved) {
      _won = true;
      _scheduleNext();
    }
  }

  void _undo() {
    _cancelNext();
    if (_history.isEmpty) return;
    setState(() {
      _board = _history.removeLast();
      _moves = _moves > 0 ? _moves - 1 : 0;
      _sel = null;
      _won = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final board = _board;
    if (board == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    final p = levelParams(_ladder.level);
    final min = frameStewart(p.discs, p.pegs);
    final stars = hanoiStars(_moves, min);

    return GameShell(
      title: 'Ханойская башня',
      /*
       * 🔴 ВЫХОД ОТДЕЛЬНОЙ КНОПКОЙ, А НЕ ТОЛЬКО ЧЕРЕЗ ПАУЗУ.
       *
       * 📍 Денис 24.09.2026 на живой сборке: «выход через кнопку пауза».
       * Замер по коду: `GameShell` рисует «Назад» только если экран передал
       * `onBack`, а его не передавал НИ ОДИН из четырнадцати перенесённых
       * экранов — ни мои девять, ни чужие пять. То есть уйти из игры можно было
       * единственным способом: пауза → «Продолжить»… которого там нет.
       */
      onBack: () => Navigator.of(context).maybePop(),
      hud: [
        HudItem(label: 'Уровень', value: '${_ladder.level}', icon: Icons.flag_outlined),
        // Ходы ПРОТИВ МИНИМУМА: без этого числа человек не знает, хорошо ли
        // играет, и «молодец» в конце берётся ниоткуда.
        HudItem(label: 'Ходы', value: '$_moves/$min', icon: Icons.swap_horiz),
        HudItem(label: 'Дисков', value: '${p.discs}', icon: Icons.layers_outlined),
        HudItem(label: 'Ошибки', value: '$_errors', icon: Icons.error_outline),
      ],
      field: (context, h) => HanoiBoard(
        state: board,
        fieldHeight: h,
        selected: _sel,
        onTapPeg: _tapPeg,
        onDrop: (from, to) => setState(() {
          _sel = null;
          _move(from, to);
        }),
      ),
      auxRow: AuxBar(children: [
        AuxAction(icon: Icons.undo, label: 'Отменить', onPressed: _history.isEmpty ? null : _undo),
        AuxAction(icon: Icons.refresh, label: 'Начать заново', onPressed: _restart),
      ]),
      toolbar: _won
          ? Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // 📍 «Непонятно, что ты молодец»: говорим числом — сколько
                  // ходов против минимума, сколько звёзд и какой уровень дальше.
                  Text(
                    _moves == min
                        ? 'Собрано за минимум: $_moves ходов · $stars★'
                        : 'Собрано за $_moves ходов (минимум $min) · $stars★',
                    key: const ValueKey('hanoi-result'),
                    textAlign: TextAlign.center,
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 8),
                  FilledButton.icon(
                    onPressed: _next,
                    icon: const Icon(Icons.arrow_forward),
                    label: Text('Дальше — уровень ${_ladder.level + 1}'),
                  ),
                ],
              ),
            )
          : null,
      pauseActions: [
        PauseAction(label: 'Начать заново', icon: Icons.refresh, onPressed: _restart),
        if (_history.isNotEmpty) PauseAction(label: 'Отменить ход', icon: Icons.undo, onPressed: _undo),
      ],
    );
  }
}
