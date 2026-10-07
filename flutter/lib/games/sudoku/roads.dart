/// ДОРОГИ «СУДОКУ» — три отдельные лестницы: «полегче», «обычная», «пожёстче».
///
/// Перенос веб-правила `frontend/src/services/sudoku-roads.ts` (задача b5df5096, сверка
/// «веб против натива» 138f7818: ключи `_easy`/`_hard` и `psygames_sudoku_road_<профиль>`
/// натив не читал, отчёт всегда нёс `road: 'normal'`, сдвиг банка лежал без дела).
/// Правило Дениса дословно — в шапке веб-файла; коротко:
///   · у каждой дороги СВОЙ счётчик уровня, дорога выбирается между партиями;
///   · пройденное переносится ТОЛЬКО ВНИЗ по сложности: уровень дороги — максимум из её
///     счётчика и счётчиков всех дорог тяжелее; вверх не переносится никогда;
///   · считается при ЧТЕНИИ, а не разовым переносом при переключении.
///
/// 🔴 КЛЮЧИ — ВЕБ-СТОРОНЫ, БАЙТ В БАЙТ: у обычной дороги прежний `psygames_sudoku_level_<id>`
/// (под ним прогресс всех, кто играл до дорог), у остальных — с хвостом `_easy` / `_hard`.
/// Сверку держит проба `sudoku_roads_test.dart` против исходника веба.
library;

import 'dart:math';

import '../../shell/level_ladder.dart' show LevelStore;
import '../../shell/shared_state.dart';

/// Дороги ОТ ЛЁГКОЙ К ТЯЖЁЛОЙ: из порядка выводится, какие дороги «тяжелее».
enum SudokuRoad { easy, normal, hard }

/// Дорога по умолчанию — та единственная лестница, что была до дорог.
const defaultSudokuRoad = SudokuRoad.normal;

/// Подписи дорог — те же ключи словаря, что у веба (`SUDOKU_ROAD_NAME_KEY`).
const sudokuRoadNameKeys = <String>['sudokuRoadEasy', 'sudokuRoadNormal', 'sudokuRoadHard'];

String sudokuRoadNameKey(SudokuRoad r) => sudokuRoadNameKeys[r.index];

SudokuRoad? sudokuRoadOf(String? name) {
  for (final r in SudokuRoad.values) {
    if (r.name == name) return r;
  }
  return null;
}

/// Ключ собственного счётчика дороги в общей памяти.
String sudokuLevelKey(String profile, SudokuRoad road) {
  final base = '${SharedState.prefix}sudoku_level_$profile';
  return road == defaultSudokuRoad ? base : '${base}_${road.name}';
}

/// Ключ выбранной дороги: заход на экран возвращает человека туда, где он был.
String sudokuRoadKey(String profile) => '${SharedState.prefix}sudoku_road_$profile';

/// Дороги ТЯЖЕЛЕЕ этой — из них и только из них пройденное переносится сюда.
List<SudokuRoad> roadsHarderThan(SudokuRoad road) => SudokuRoad.values.sublist(road.index + 1);

int _own(SharedState s, String profile, SudokuRoad road) {
  final n = int.tryParse(s.get(sudokuLevelKey(profile, road)) ?? '');
  return n != null && n >= 1 ? n : 1;
}

/// Достигнутый уровень дороги: её счётчик и счётчики всех дорог тяжелее — максимум.
int effectiveRoadLevel(SharedState s, String profile, SudokuRoad road) {
  var best = _own(s, profile, road);
  for (final harder in roadsHarderThan(road)) {
    best = max(best, _own(s, profile, harder));
  }
  return best;
}

/// Сдвиг полосы банка по дороге: −1 «полегче», +1 «пожёстче» (`bankRating(shift:)`).
int sudokuRoadShift(SudokuRoad road) => switch (road) {
      SudokuRoad.easy => -1,
      SudokuRoad.normal => 0,
      SudokuRoad.hard => 1,
    };

/// Цена ошибки на дороге — как `roadLevelConfig` веба: «полегче» прощает на одну больше,
/// «пожёстче» на одну меньше, но не ниже одной.
int sudokuRoadLives(int lives, SudokuRoad road) => switch (road) {
      SudokuRoad.easy => lives + 1,
      SudokuRoad.normal => lives,
      SudokuRoad.hard => max(1, lives - 1),
    };

/// Подсказки на дороге — так же, ноль допустим.
int sudokuRoadHintMax(int hintMax, SudokuRoad road) => switch (road) {
      SudokuRoad.easy => hintMax + 1,
      SudokuRoad.normal => hintMax,
      SudokuRoad.hard => max(0, hintMax - 1),
    };

/// Хранилище лестницы «Судоку» на дороге: лестница зовёт `sudoku.level`, а оно отвечает
/// УРОВНЕМ ДОРОГИ (с переносом вниз) и пишет только её собственный счётчик — и только
/// вверх, как `reachRoadLevel` веба: на пройденный уровень можно вернуться, и переигровка
/// не должна срезать достигнутое.
class SudokuRoadStore implements LevelStore {
  SudokuRoadStore(this.state, this.road, {String? profile})
      : _profile = profile;   // ignore: prefer_initializing_formals — поле приватное, параметр именованный

  final SharedState state;
  final SudokuRoad road;
  final String? _profile;

  String get profile => _profile ?? state.activeProfile;

  String _bestKey() {
    final base = '${SharedState.prefix}sudoku_best_$profile';
    return road == defaultSudokuRoad ? base : '${base}_${road.name}';
  }

  @override
  Future<int?> readInt(String key) async {
    if (key == 'sudoku.level') return effectiveRoadLevel(state, profile, road);
    if (key == 'sudoku.best') return int.tryParse(state.get(_bestKey()) ?? '');
    return int.tryParse(state.get(key) ?? '');
  }

  @override
  Future<void> writeInt(String key, int value) async {
    if (key == 'sudoku.level') {
      final own = _own(state, profile, road);
      state.set(sudokuLevelKey(profile, road), '${max(own, value)}');
      return;
    }
    if (key == 'sudoku.best') {
      state.set(_bestKey(), '$value');
      return;
    }
    state.set(key, '$value');
  }
}
