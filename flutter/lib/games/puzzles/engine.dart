/// ДВИЖОК ТЭТХЭМА ЧЕРЕЗ dart:ffi — тот же C, что возит веб-версия.
///
/// 🔴 ПОЧЕМУ НЕ ПЕРЕНОС. Замер 23.09.2026: канон Simon Tatham Portable Puzzle Collection —
/// 105 149 строк C на 42 движка (общая часть 16 543; наши семь сеток 20 578). Наш мост к
/// нему — 567 строк и 25 экспортов `psy_*`. Веб-версия зовёт его через emscripten
/// (`tatham.js`, 996 КБ); Flutter зовёт ТЕ ЖЕ исходники нативно, тем же API. Собирается
/// под хост за 13 секунд в 1,4 МБ (`tool/build_tatham.sh`).
///
/// Рисование приходит ПОТОКОМ ПРИМИТИВОВ (`psy_draw` — текстовые строки), поэтому на
/// стороне Flutter его берёт CustomPainter; ввод уходит в `psy_pointer` / `psy_key` /
/// `psy_cursor`. То есть перенос «Головоломок» — это оболочка, рисование и ввод, а не
/// движок.
///
/// ⚠️ ДВИЖОК ОДИН НА ПРОЦЕСС. У моста одна текущая партия (`ПАРТИЯ` в `psy_play.c`):
/// `open` закрывает предыдущую. Два экрана сразу играть нельзя — это свойство моста, а
/// не Dart.
library;

import 'dart:ffi';
import 'dart:io';

import 'package:ffi/ffi.dart';

typedef _IntF = Int32 Function();
typedef _IntD = int Function();

class TathamEngine {
  TathamEngine._(this._lib) {
    _count = _lib.lookupFunction<_IntF, _IntD>('psy_count');
    _name = _lib.lookupFunction<Pointer<Utf8> Function(Int32), Pointer<Utf8> Function(int)>('psy_name');
    _open = _lib.lookupFunction<Int32 Function(Int32, Pointer<Utf8>, Int32),
        int Function(int, Pointer<Utf8>, int)>('psy_open');
    _width = _lib.lookupFunction<_IntF, _IntD>('psy_width');
    _height = _lib.lookupFunction<_IntF, _IntD>('psy_height');
    _draw = _lib.lookupFunction<Pointer<Utf8> Function(), Pointer<Utf8> Function()>('psy_draw');
    _colours = _lib.lookupFunction<Pointer<Utf8> Function(), Pointer<Utf8> Function()>('psy_colours');
    _free = _lib.lookupFunction<Void Function(Pointer<Utf8>), void Function(Pointer<Utf8>)>('psy_free');
    _pointer = _lib.lookupFunction<Int32 Function(Int32, Int32, Int32),
        int Function(int, int, int)>('psy_pointer');
    _key = _lib.lookupFunction<Int32 Function(Int32), int Function(int)>('psy_key');
    _status = _lib.lookupFunction<_IntF, _IntD>('psy_status');
    _statepos = _lib.lookupFunction<_IntF, _IntD>('psy_statepos');
    _undo = _lib.lookupFunction<_IntF, _IntD>('psy_undo');
    _solve = _lib.lookupFunction<_IntF, _IntD>('psy_solve');
    _statusText =
        _lib.lookupFunction<Pointer<Utf8> Function(), Pointer<Utf8> Function()>('psy_status_text');
  }

  final DynamicLibrary _lib;

  late final int Function() _count;
  late final Pointer<Utf8> Function(int) _name;
  late final int Function(int, Pointer<Utf8>, int) _open;
  late final int Function() _width;
  late final int Function() _height;
  late final Pointer<Utf8> Function() _draw;
  late final Pointer<Utf8> Function() _colours;
  late final void Function(Pointer<Utf8>) _free;
  late final int Function(int, int, int) _pointer;
  late final int Function(int) _key;
  late final int Function() _status;
  late final int Function() _statepos;
  late final int Function() _undo;
  late final int Function() _solve;
  late final Pointer<Utf8> Function() _statusText;

  /// Имя файла библиотеки для этой машины.
  static String get libraryName => Platform.isMacOS
      ? 'libtatham.dylib'
      : Platform.isWindows
          ? 'tatham.dll'
          : 'libtatham.so';

  /// Открыть библиотеку по пути. Путь снаружи нарочно: на телефоне она лежит в
  /// приложении, в пробах — в build/tatham.
  static TathamEngine open(String path) => TathamEngine._(DynamicLibrary.open(path));

  /// Сколько игр в сборке. Веб-сборка возит те же 42.
  int get games => _count();

  /// Имя игры по номеру — как её называет автор.
  String nameOf(int i) => _name(i).toDartString();

  /// Номер игры по имени автора, −1 если такой нет.
  int indexOf(String name) {
    for (var i = 0; i < games; i++) {
      if (nameOf(i) == name) return i;
    }
    return -1;
  }

  /// Начать партию: игра, параметры («9x9» и т.п.) и зерно. 0 — не открылась.
  bool start(int game, String params, int seed) {
    final p = params.toNativeUtf8();
    try {
      return _open(game, p, seed) != 0;
    } finally {
      calloc.free(p);
    }
  }

  /// Размер поля В ЕГО координатах — по нему считается масштаб на экране.
  ({int w, int h}) get size => (w: _width(), h: _height());

  /// Палитра автора: тройки RGB.
  List<List<int>> get colours {
    final p = _colours();
    if (p == nullptr) return const [];
    try {
      return [
        for (final t in p.toDartString().split(' '))
          if (t.isNotEmpty) t.split(',').map(int.parse).toList(),
      ];
    } finally {
      _free(p);
    }
  }

  /// Кадр: список примитивов строками, как их отдаёт мост.
  List<String> draw() {
    final p = _draw();
    if (p == nullptr) return const [];
    try {
      return p.toDartString().split('\n').where((s) => s.isNotEmpty).toList();
    } finally {
      _free(p);
    }
  }

  /// Жест целиком: 0 нажал левой · 1 ведёт · 2 отпустил · 3–5 то же правой.
  int pointer(int x, int y, int kind) => _pointer(x, y, kind);

  /// Одно касание = нажал и отпустил. Пятерым играм коллекции одного нажатия мало,
  /// поэтому полный жест здесь по умолчанию.
  int tap(int x, int y, {bool right = false}) {
    final base = right ? 3 : 0;
    _pointer(x, y, base);
    return _pointer(x, y, base + 2);
  }

  int key(int code) => _key(code);

  /// 0 — партия идёт, 1 — победа, −1 — проигрыш.
  int get status => _status();

  /// Позиция в истории ходов. Ход там, где она выросла: `PKR_SOME_EFFECT` приходит и
  /// на выделение клетки, и на шаг курсора — по нему ход считать нельзя.
  int get statePos => _statepos();

  bool undo() => _undo() != 0;

  /// Показать решение. Возвращает false там, где движок решать отказывается.
  bool solve() => _solve() != 0;

  String get statusText => _statusText().toDartString();
}
