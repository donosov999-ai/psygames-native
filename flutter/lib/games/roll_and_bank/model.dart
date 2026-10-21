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
/// L9–L30 — ТРАССА 60, БОТ ПО РЕШЕНИЮ ИГРЫ (`solver.dart`), ФОРА 4 → 27 (задача
/// d1d32abb, 21.10.2026). Здесь «сохранить» существует: выгоднее броска в 15,8 %
/// позиций, при 0:0 — с 21. Прежние L9–L22 (трасса 30, фора 2 → 28) решения не
/// требовали — сильная игра там «не сохранять никогда».
/// 📍 Ступени выбраны поиском по ТОЧНОЙ таблице: каждая не легче предыдущей ни для
/// одного из восьми образцовых игроков (пороги 8–25, не сохраняющий, лучший), шаг
/// лучшего игрока ≤ 3 п.п. Верх тот же по трудности: лучший — 27,5 % (было 27,4 %).
/// ⚠️ Фора на длинной трассе НЕМОНОТОННА для игроков с порогом: на трассе 50 порогу
/// 8 фора 14 легче форы 12 (21,6 % против 20,3 %) — отсюда пропуски 25 → 27, а не «+1».
/// ⚠️ Вход L8 → L9 — скачок, и он неизбежен: не сохраняющему 56,8 % → 35,8 %, лучшему
/// 56,8 → 50,3. Это смена правила, а не ошибка шкалы: на длинной трассе «не сохранять»
/// перестаёт быть решением, и об этом второй шаг разбора.
///
/// ⚠️ «СГОРАЕТ НА 1–2» — НЕ ОСЬ СЛОЖНОСТИ. Замер против лучшего бота: осторожным
/// игрокам (порог 6–8) такой уровень ЛЕГЧЕ на 15–17 п.п., смелым (25) — тяжелее на 7:
/// больше случая — больше шансов у слабого. В лестницу не поставлено.
library;

import 'dart:math';

import 'solver.dart';

/// Ступень: длина трассы, порог бота, его фора и `solved` — бот играет по решению игры.
/// Порог `null` без решения — бот не сохраняет никогда.
({int goal, int? botHold, int headStart, bool solved}) rollAndBankStep(int level) {
  const goals = [20, 20, 25, 25, 30, 30, 30];
  const holds = [3, 4, 6, 8, 10, 12, 15];
  if (level <= goals.length) {
    final i = (level - 1).clamp(0, goals.length - 1);
    return (goal: goals[i], botHold: holds[i], headStart: 0, solved: false);
  }
  // L8: трасса 30 без форы — её решение и есть «не сохранять никогда».
  if (level == 8) return (goal: 30, botHold: null, headStart: 0, solved: false);
  // L9 и выше: трасса 60 и бот по таблице решения. Выше L30 ступень та же.
  const heads = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 27];
  final i = (level - 9).clamp(0, heads.length - 1);
  return (goal: 60, botHold: null, headStart: heads[i], solved: true);
}

class RollAndBank {
  // Поле приватное, а параметр именованный — отсюда присваивание, а не this._rnd.
  RollAndBank({required this.goal, this.botHold, this.headStart = 0, this.policy, required Random rnd})
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

  /// Решение игры для этой трассы; есть — бот играет по нему, а не по порогу. Экран
  /// подставляет его, когда изолят досчитает (`RollAndBankPolicy.warm`).
  RollAndBankPolicy? policy;
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
  /// С решением игры — по таблице; без порога и решения не сохраняет никогда.
  bool get botWantsToBank {
    if (side != 1 || over || unbanked(1) <= 0) return false;
    final p = policy;
    if (p != null) return p.bank(banked[1], banked[0], unbanked(1));
    final hold = botHold;
    return hold != null && unbanked(1) >= hold;
  }
}
