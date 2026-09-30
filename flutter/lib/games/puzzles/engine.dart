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

/// Ступень из меню самого движка: подпись автора и параметры для [TathamEngine.start].
class PuzzlePreset {
  const PuzzlePreset(this.name, this.params);
  final String name;
  final String params;
}

class TathamEngine {
  TathamEngine._(this._lib) {
    _count = _lib.lookupFunction<_IntF, _IntD>('psy_count');
    _name = _lib.lookupFunction<Pointer<Utf8> Function(Int32), Pointer<Utf8> Function(int)>('psy_name');
    _open = _lib.lookupFunction<Int32 Function(Int32, Pointer<Utf8>, Int32),
        int Function(int, Pointer<Utf8>, int)>('psy_open');
    _canSolve = _lib.lookupFunction<Int32 Function(Int32), int Function(int)>('psy_can_solve');
    _presets = _lib.lookupFunction<Int32 Function(Int32), int Function(int)>('psy_presets');
    _presetParams = _lib.lookupFunction<Pointer<Utf8> Function(Int32, Int32),
        Pointer<Utf8> Function(int, int)>('psy_preset_params');
    _presetName = _lib.lookupFunction<Pointer<Utf8> Function(Int32, Int32),
        Pointer<Utf8> Function(int, int)>('psy_preset_name');
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
  late final int Function(int) _canSolve;
  late final int Function(int) _presets;
  late final Pointer<Utf8> Function(int, int) _presetParams;
  late final Pointer<Utf8> Function(int, int) _presetName;
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

  /// Открыть библиотеку по пути. Путь снаружи нарочно: в пробах она лежит в
  /// `build/tatham`, на настольных сборках — рядом с приложением.
  static TathamEngine open(String path) => TathamEngine._(DynamicLibrary.open(path));

  /// ОТКРЫТЬ ТАК, КАК ТРЕБУЕТ ПЛОЩАДКА. Телефоны упаковывают C по-разному, и это
  /// не деталь сборки, а разное место, откуда берутся символы.
  ///
  /// 🔴 iOS — символы В САМОМ ПРИЛОЖЕНИИ, файла нет. Открыть чужой `.dylib` из
  /// файловой системы там нельзя: годится только подписанный `.framework`, и
  /// App Store отклоняет сборки, которые грузят код со стороны. Поэтому C
  /// линкуется статически (`tool/build_tatham_ios.sh`, 1,09 МБ кода и данных на
  /// arm64), и `DynamicLibrary.process()` находит `psy_*` прямо в процессе.
  ///
  /// 🔴 Android — обычный `.so` в APK, по одному на архитектуру, открывается по
  /// ИМЕНИ, а не по пути: система сама ищет его в `lib/<abi>/`.
  ///
  /// ⚠️ Путь нужен только настольным сборкам и пробам — там библиотека лежит
  /// файлом рядом. Передавать его с телефона бессмысленно, и молчать об этом
  /// нельзя: `DynamicLibrary.open('/несуществующий/путь')` на Android падает
  /// невнятной ошибкой загрузчика, а не «файла нет».
  static TathamEngine openPlatform({String? path}) {
    if (Platform.isIOS) return TathamEngine._(DynamicLibrary.process());
    if (Platform.isAndroid) return TathamEngine._(DynamicLibrary.open('libtatham.so'));
    if (path == null) {
      throw ArgumentError('на настольной сборке нужен путь к $libraryName');
    }
    return open(path);
  }

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

  /// Умеет ли движок РЕШАТЬ эту игру.
  ///
  /// ⚠️ Флаг берётся у самого автора (`game.can_solve`), а не из нашего списка:
  /// список устаревает молча, флаг — нет. У части коллекции решателя нет по
  /// устройству игры: у аркад единственного решения не существует, у Mines и Guess
  /// ответ прячется от игрока намеренно.
  bool canSolve(int game) => _canSolve(game) != 0;

  /// СОБСТВЕННЫЕ СТУПЕНИ ДВИЖКА — меню пресетов автора для игры [game].
  ///
  /// 🔴 Зачем они здесь. У 28 режимов из 42 своей лестницы в `modes.json` нет, и это
  /// не пробел: трудность там уже размечена самим автором. Брать его разметку дешевле
  /// и честнее, чем назначать свою по названию.
  ///
  /// ⚠️ У части игр меню устроено иначе и список ПУСТ (замер веб-моста: `psy_presets`
  /// у Mines и Loopy возвращает 0). Пустой список — не ошибка, а «ступеней нет»:
  /// зовущий обязан уметь партию без параметров.
  List<PuzzlePreset> presetsOf(int game) {
    final n = _presets(game);
    final out = <PuzzlePreset>[];
    for (var k = 0; k < n; k++) {
      out.add(PuzzlePreset(_take(_presetName(game, k)), _take(_presetParams(game, k))));
    }
    return out;
  }

  String _take(Pointer<Utf8> p) {
    if (p == nullptr) return '';
    try {
      return p.toDartString();
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
