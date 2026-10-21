/// «РИСКНИ И СОХРАНИ» — РЕШЕНИЕ ИГРЫ, А НЕ ПОРОГ.
///
/// Постановка — как игру Pig решали Neller & Presser (2004). P(i, j, k) — вероятность
/// победы того, кто ходит: у него сохранено i, у соперника j, в текущем ходу k.
///   бросок: единица — сгорело, ход сопернику: 1 − P(j, i, 0);
///           иначе i+k+f ≥ goal — победа, или P(i, j, k+f);
///   сохранить (k > 0): ход сопернику, у меня i+k: 1 − P(j, i+k, 0).
/// P = max(бросок, сохранить); итерация по значениям до сходимости.
///
/// 🔴 Порядок обхода и порядок сложения граней — те же, что в эталоне
/// `flutter/tools/roll_and_bank_reference.py`: числа совпадают до бита, и решения
/// сверяются с ним без допусков (проба `test/roll_and_bank_test.dart`).
library;

import 'dart:isolate';
import 'dart:typed_data';

class RollAndBankPolicy {
  RollAndBankPolicy._(this.goal, this._p, this._bank);

  /// Решение для трассы [goal]: Гаусс — Зейдель до изменения меньше [eps].
  factory RollAndBankPolicy.solve(int goal, {double eps = 1e-12}) {
    final g = goal;
    int ix(int i, int j, int k) => (i * g + j) * g + k;
    final p = Float64List(g * g * g)..fillRange(0, g * g * g, 0.5);
    double rollValue(int i, int j, int k) {
      var pr = 0.0;
      for (var f = 1; f <= 6; f++) {
        if (f == 1) {
          pr += (1 - p[ix(j, i, 0)]) / 6;
        } else if (i + k + f >= g) {
          pr += 1 / 6;
        } else {
          pr += p[ix(i, j, k + f)] / 6;
        }
      }
      return pr;
    }

    double bankValue(int i, int j, int k) => k > 0 && i + k < g ? 1 - p[ix(j, i + k, 0)] : -1.0;

    while (true) {
      var delta = 0.0;
      for (var i = 0; i < g; i++) {
        for (var j = 0; j < g; j++) {
          for (var k = 0; k < g - i; k++) {
            final pr = rollValue(i, j, k);
            final ph = bankValue(i, j, k);
            final v = pr >= ph ? pr : ph;
            final d = (v - p[ix(i, j, k)]).abs();
            if (d > delta) delta = d;
            p[ix(i, j, k)] = v;
          }
        }
      }
      if (delta < eps) break;
    }
    final bank = Uint8List(g * g * g);
    for (var i = 0; i < g; i++) {
      for (var j = 0; j < g; j++) {
        for (var k = 0; k < g - i; k++) {
          // Ничья (|разница| ≤ 1e-9) — бросок: так же, как сломанную ничью трактует эталон.
          if (bankValue(i, j, k) - rollValue(i, j, k) > 1e-9) bank[ix(i, j, k)] = 1;
        }
      }
    }
    return RollAndBankPolicy._(g, p, bank);
  }

  /// Готовые решения по длине трассы — считаются раз на запуск приложения.
  static final Map<int, RollAndBankPolicy> _ready = {};
  static final Map<int, Future<RollAndBankPolicy>> _pending = {};

  /// Решение, если уже посчитано; иначе `null`.
  static RollAndBankPolicy? ready(int goal) => _ready[goal];

  /// Посчитать синхронно и запомнить — для проб, где изолят не доживёт до ответа.
  static RollAndBankPolicy solved(int goal) => _ready[goal] ??= RollAndBankPolicy.solve(goal);

  /// Посчитать в изоляте. 📍 Замер 21.10.2026 на маке (AOT): трасса 50 — 263 мс,
  /// 60 — 466 мс; телефон медленнее в разы, а это кадры игры — отсюда изолят.
  static Future<RollAndBankPolicy> warm(int goal) {
    final done = _ready[goal];
    if (done != null) return Future.value(done);
    return _pending[goal] ??= Isolate.run(() => RollAndBankPolicy.solve(goal)).then((p) {
      _pending.remove(goal);
      return _ready[goal] = p;
    });
  }

  final int goal;
  final Float64List _p;
  final Uint8List _bank;

  int _ix(int i, int j, int k) => (i * goal + j) * goal + k;

  /// Сохранить ли тому, кто ходит: у него сохранено [mine], у соперника [theirs], в ходу [turn].
  bool bank(int mine, int theirs, int turn) =>
      mine < goal && theirs < goal && turn < goal - mine && _bank[_ix(mine, theirs, turn)] == 1;

  /// Вероятность победы ходящего при лучшей игре обоих.
  double winChance(int mine, int theirs, int turn) => _p[_ix(mine, theirs, turn)];

  /// Решения в порядке эталона: '1' — бросать, '0' — сохранить.
  String get encoded {
    final b = StringBuffer();
    for (var i = 0; i < goal; i++) {
      for (var j = 0; j < goal; j++) {
        for (var k = 0; k < goal - i; k++) {
          b.write(_bank[_ix(i, j, k)] == 1 ? '0' : '1');
        }
      }
    }
    return b.toString();
  }
}
