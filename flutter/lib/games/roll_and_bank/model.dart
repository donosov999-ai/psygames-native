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
/// 📍 ЛЕСТНИЦА — ЗАМЕРОМ, А НЕ НА ГЛАЗ (задача ddb5da3b, 30.09.2026).
///
/// L1–L7 — порог бота 3 → 15 при трассе 20 → 30: осторожный бот слаб, смелый силён
/// (симуляция координатора, 20 000 партий на точку).
///
/// 🔴 L8 БЫЛА ЛЕГЧЕ L7. Порог 20 взят из длинной игры (Pig до 100), а на трассе 30 он
/// СЛИШКОМ осторожен: 40 000 партий на точку — игрок с порогом 8/12/15/20 выигрывал у
/// бота L8 на 0,7–1,4 п.п. чаще, чем у бота L7 (3–5 стандартных ошибок).
///
/// 🔴 НА ТРАССЕ ДО 30 ОПТИМАЛЬНО НЕ СОХРАНЯТЬ ВОВСЕ. Игра решена итерацией по значениям
/// (эталон `flutter/tools/roll_and_bank_reference.py`, как Pig у Neller & Presser):
/// из 13 950 позиций трассы 30 «сохранить» выгоднее броска НИ В ОДНОЙ — сохранив, ты
/// отдаёшь ход, а соперник за ход проходит заметную долю такой короткой трассы.
/// Поэтому бот L8 и выше — `botHold: null`, «бросает, пока не дойдёт или не сгорит»:
/// это не упрощение, а решение игры. Выгодное сохранение появляется только с трассы
/// ~40 (0,2 % позиций), 50 — 6,7 %, 60 — 15,8 %; там же при счёте 0:0 порог — 21.
///
/// L9–L22 — ФОРА БОТА 2 → 28 клеток. Замер точный, по таблице решения: лучший
/// возможный игрок выигрывает 56,8 % без форы и 27,4 % при форе 28; игрок с порогом
/// 20 — 47,7 % и 4,7 %. Разрыв умения растёт с форой (19 → 23 п.п.): когда соперник
/// впереди, правильная игра требует рисковать больше — это и есть третий шаг разбора.
/// ⚠️ ГРАНИЦА ПОДПИСАНА ЗАМЕРОМ: фора упирается в длину трассы (не больше goal − 2).
/// Следующая ось — трасса 50–60, где решение «сохранить» существует (см. выше).
///
/// ⚠️ «СГОРАЕТ НА 1–2» — НЕ ОСЬ СЛОЖНОСТИ. Замер против лучшего бота: осторожным
/// игрокам (порог 6–8) такой уровень ЛЕГЧЕ на 15–17 п.п., смелым (25) — тяжелее на 7:
/// больше случая — больше шансов у слабого. В лестницу не поставлено.
library;

import 'dart:math';

/// Ступень: длина трассы, порог бота (`null` — не сохраняет никогда) и его фора.
({int goal, int? botHold, int headStart}) rollAndBankStep(int level) {
  const goals = [20, 20, 25, 25, 30, 30, 30];
  const holds = [3, 4, 6, 8, 10, 12, 15];
  if (level <= goals.length) {
    final i = (level - 1).clamp(0, goals.length - 1);
    return (goal: goals[i], botHold: holds[i], headStart: 0);
  }
  // L8 и выше: бот по решению игры для трассы 30 — не сохраняет вовсе; растёт фора.
  const goal = 30;
  final headStart = (2 * (level - 8)).clamp(0, goal - 2);
  return (goal: goal, botHold: null, headStart: headStart);
}

class RollAndBank {
  // Поле приватное, а параметр именованный — отсюда присваивание, а не this._rnd.
  RollAndBank({required this.goal, this.botHold, this.headStart = 0, required Random rnd})
      // ignore: prefer_initializing_formals
      : _rnd = rnd,
        banked = [0, headStart],
        position = [0, headStart] {
    if (headStart < 0 || headStart >= goal) throw ArgumentError('headStart $headStart out of range for goal $goal');
  }

  final int goal;

  /// Порог бота; `null` — бот не сохраняет никогда (решение игры для трассы до 30).
  final int? botHold;

  /// Фора бота: он стартует с этим числом СОХРАНЁННЫХ клеток.
  final int headStart;
  final Random _rnd;

  /// [0] — человек, [1] — бот.
  final List<int> banked;
  final List<int> position;
  int side = 0;
  int? winner;
  int? lastRoll;

  /// Счёт человека — для статистики (мера риска рядом с BART, задача ddb5da3b).
  int rolls = 0;
  int busts = 0;

  /// Сохранений человека.
  int banks = 0;

  /*
   * МЕРА РИСКА — ПО ХОДАМ, А НЕ ПО БРОСКАМ. Сырой счёт бросков смешивает ходы,
   * закрытые сохранением, с оборванными единицей и с последним ходом до финиша. Как
   * у BART (скорректированное среднее Lejuez 2002 — только по НЕ лопнувшим шарам),
   * «сколько бросков до сохранения» считается только по ходам, закрытым сохранением:
   * у сгоревшего хода длину оборвал случай, у финишного — трасса.
   */

  /// Ходов человека, начатых броском.
  int turns = 0;

  /// Ходов, закрытых сохранением, и бросков в них.
  int bankedTurns = 0;
  int rollsInBankedTurns = 0;

  /// Сумма несохранённого в момент сохранения — фактический порог человека.
  int bankedSum = 0;
  int _turnRolls = 0;

  /// Среднее число бросков до «сохранить»; `null`, пока ни одного сохранения.
  double? get meanRollsToBank => bankedTurns == 0 ? null : rollsInBankedTurns / bankedTurns;

  /// Доля ходов, сгоревших на единице; `null`, пока ходов не было.
  double? get bustRate => turns == 0 ? null : busts / turns;

  /// Сколько в среднем несохранённого человек сохраняет — его порог риска.
  double? get meanBankTotal => bankedTurns == 0 ? null : bankedSum / bankedTurns;

  int unbanked(int who) => position[who] - banked[who];

  bool get over => winner != null;

  /// Бросок того, чей ход. `forced` — для проб. Возвращает выпавшее.
  int roll([int? forced]) {
    if (over) throw StateError('партия окончена');
    final value = forced ?? _rnd.nextInt(6) + 1;
    if (value < 1 || value > 6) throw ArgumentError('кубик: $value');
    lastRoll = value;
    if (side == 0) {
      if (_turnRolls == 0) turns++;
      _turnRolls++;
      rolls++;
    }
    if (value == 1) {
      if (side == 0) {
        busts++;
        _turnRolls = 0;
      }
      position[side] = banked[side];
      side = 1 - side;
    } else {
      position[side] = min(goal, position[side] + value);
      if (position[side] == goal) {
        banked[side] = goal;
        winner = side;
        if (side == 0) _turnRolls = 0;
      }
    }
    return value;
  }

  /// Сохранить пройденное и передать ход.
  void bank() {
    if (over) throw StateError('партия окончена');
    if (unbanked(side) <= 0) throw StateError('сохранять нечего');
    if (side == 0) {
      banks++;
      bankedTurns++;
      rollsInBankedTurns += _turnRolls;
      bankedSum += unbanked(0);
      _turnRolls = 0;
    }
    banked[side] = position[side];
    side = 1 - side;
  }

  /// Решение бота на его ходу: сохранить (`true`) или бросать дальше.
  /// Бот без порога (`botHold == null`) не сохраняет никогда — см. шапку файла.
  bool get botWantsToBank {
    final hold = botHold;
    return side == 1 && !over && hold != null && unbanked(1) >= hold;
  }
}
