/// «РИСКНИ И СОХРАНИ» — ПРАВИЛА ГОНКИ, БЕЗ FLUTTER.
///
/// Происхождение: движок MindLab `letsgo/letsgo.py` (clean-room) и пилот Codex
/// (ветка codex/mindlab-five), решение Дениса 30.09.2026 «добавляем нативно,
/// дорабатываем потом». Правила — собственные, не заявленные правила Let's Go.
///
/// Бросаешь кубик и идёшь вперёд; можно бросать ещё или «сохранить» пройденное.
/// Выпала единица — всё несохранённое сгорает и ход переходит. Кто первым дошёл до
/// финиша — победил. Против человека — бот с порогом: сохраняет, как только
/// несохранённого набралось не меньше порога.
///
/// 📍 ПОЧЕМУ ЛЕСТНИЦА РАСТИТ ИМЕННО ПОРОГ БОТА. Симуляция 30.09.2026 (20 000 партий на
/// точку, трасса 20–40, соперник с порогом 8): порог 3 выигрывает 8–16 %, 6 — 35–40 %,
/// 10 — 55–62 %, 15 — 61–72 %, 20 — 66–74 %. Осторожный бот слаб, смелый силён —
/// значит, ступени честно растят соперника, а не случай.
library;

import 'dart:math';

/// Ступень: длина трассы и порог бота.
({int goal, int botHold}) rollAndBankStep(int level) {
  const goals = [20, 20, 25, 25, 30, 30, 30, 30];
  const holds = [3, 4, 6, 8, 10, 12, 15, 20];
  final i = (level - 1).clamp(0, goals.length - 1);
  return (goal: goals[i], botHold: holds[i]);
}

class RollAndBank {
  // ignore: prefer_initializing_formals — поле приватное, а параметр именованный
  RollAndBank({required this.goal, required this.botHold, required Random rnd}) : _rnd = rnd;

  final int goal;
  final int botHold;
  final Random _rnd;

  /// [0] — человек, [1] — бот.
  final List<int> banked = [0, 0];
  final List<int> position = [0, 0];
  int side = 0;
  int? winner;
  int? lastRoll;

  /// Счёт человека — для статистики (мера риска рядом с BART, задача ddb5da3b).
  int rolls = 0;
  int busts = 0;

  /// Сохранений человека.
  int banks = 0;

  int unbanked(int who) => position[who] - banked[who];

  bool get over => winner != null;

  /// Бросок того, чей ход. `forced` — для проб. Возвращает выпавшее.
  int roll([int? forced]) {
    if (over) throw StateError('партия окончена');
    final value = forced ?? _rnd.nextInt(6) + 1;
    if (value < 1 || value > 6) throw ArgumentError('кубик: $value');
    lastRoll = value;
    if (side == 0) rolls++;
    if (value == 1) {
      if (side == 0) busts++;
      position[side] = banked[side];
      side = 1 - side;
    } else {
      position[side] = min(goal, position[side] + value);
      if (position[side] == goal) {
        banked[side] = goal;
        winner = side;
      }
    }
    return value;
  }

  /// Сохранить пройденное и передать ход.
  void bank() {
    if (over) throw StateError('партия окончена');
    if (unbanked(side) <= 0) throw StateError('сохранять нечего');
    if (side == 0) banks++;
    banked[side] = position[side];
    side = 1 - side;
  }

  /// Решение бота на его ходу: сохранить (`true`) или бросать дальше.
  bool get botWantsToBank => side == 1 && !over && unbanked(1) >= botHold;
}
