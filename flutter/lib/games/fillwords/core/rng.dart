/// ГПСЧ ФИЛВОРДОВ — перенос `frontend/src/games/fillwords/core/rng.ts` (mulberry32).
///
/// Зачем свой: поле собирается перебором с откатами, и упавший случай должен
/// воспроизводиться по зерну. Последовательность обязана совпасть с вебом ЧИСЛО В ЧИСЛО —
/// иначе одно и то же зерно даст в приложении другое поле, и эталон живого TS не сверить.
///
/// ⚠️ АРИФМЕТИКА JS В DART. В вебе числа 32-битные со знаком (`| 0`, `Math.imul`, `>>>`).
/// Здесь всё держится беззнаковым в 32 битах ([_u32]): побитовые операции и сложение по
/// модулю 2³² дают те же биты, а `Math.imul` — это младшие 32 бита произведения (64-битное
/// умножение Dart их не теряет даже при переполнении).
library;

import 'types.dart';

int _u32(int x) => x & 0xFFFFFFFF;

int _imul(int a, int b) => _u32(_u32(a) * _u32(b));

/// Зерно в целое 32 бита: отрицательные и ноль не рвут поток (`normalizeSeed` веба).
int normalizeSeed(int seed) {
  final n = seed.abs() % 0xffffffff;
  return n == 0 ? 1 : n;
}

FillwordsRng createRng(int seed) => _Mulberry32(normalizeSeed(seed));

class _Mulberry32 implements FillwordsRng {
  _Mulberry32(this._state);

  int _state;

  @override
  double next() {
    _state = _u32(_state + 0x6d2b79f5);
    var t = _state;
    t = _imul(t ^ (t >> 15), t | 1);
    t = _u32(t ^ _u32(t + _imul(t ^ (t >> 7), t | 61)));
    return _u32(t ^ (t >> 14)) / 4294967296;
  }

  @override
  int nextInt(int max) => max <= 0 ? 0 : (next() * max).floor() % max;

  @override
  T? pick<T>(List<T> items) => items.isEmpty ? null : items[nextInt(items.length)];

  @override
  List<T> shuffle<T>(List<T> items) {
    for (var i = items.length - 1; i > 0; i--) {
      final j = nextInt(i + 1);
      final tmp = items[i];
      items[i] = items[j];
      items[j] = tmp;
    }
    return items;
  }
}
