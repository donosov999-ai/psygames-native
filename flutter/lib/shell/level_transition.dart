/// СТУПЕНЬ-ПЕРЕХОД: ступень одной лестницы играется в ДРУГОЙ игре (задача 4e3d3443).
///
/// 📍 ПОВОД. Лестница «Судоку» (и не только она) ставит на часть ступеней чужую игру:
/// «Кошек», сетку Тэтхэма, босса. До этого файла такой ступени не было как механизма:
/// экран мог только открыть чужой маршрут, а узнать, прошёл ли человек, и вернуть его
/// назад было нечем: `SessionReport` исхода не несёт, а `Navigator.push` вернёт
/// то, что экран положит в `pop`, и у каждого экрана своё.
///
/// КАК. Итог берётся там, где его знают все нативные игры, — у [LevelLadder]
/// (`win`/`fail`, слушатель [LevelLadder.onOutcome]). Порядок:
///   1. настройки чужого экрана: `auto=1` (сразу в партию), `lvl` (заданный уровень),
///      `ladderGame`/`ladderLevel` (чья ступень; см. [GamePreset.isTransit]);
///   2. чужая игра открывается в [RestartScope], как из оболочки, и играется ОБЫЧНОЙ
///      партией — её лестница стоит, сохранённый уровень не меняется;
///   3. первый итог — и через [closeDelay] человек сам возвращается на ступень;
///   4. лестница-хозяин получает итог БЕЗ второй партии в статистику (`report: false`):
///      партию уже записала чужая игра под своим типом, с меткой ступени.
///
/// Правила итога: пройдено — +1; провал — как провал хозяина; разбор подсмотрен или
/// человек ушёл до итога — хозяин не двигается ни вверх, ни вниз. Ступень, которая не
/// держит ([LadderTransit.blocks] = `false`, боссы плана v4), — +1 при любом возврате.
///
/// Итог отдают [LevelLadder.win]/[LevelLadder.fail], а экран без своей лестницы —
/// [LevelLadder.reportOutcome] («Бездна»). Экран, не сделавший ни того ни другого,
/// ступенью быть не может: итог не придёт, и держащая ступень не сдвинется никогда
/// (`test/level_transition_targets_test.dart` сторожит цели плана).
library;

import 'dart:async';

import 'package:flutter/material.dart';

import 'game_preset.dart';
import 'game_rules.dart';
import 'level_ladder.dart';
import 'restart_scope.dart';
import 'shared_state.dart';

/// Ступень лестницы, которая играется в чужой игре.
class LadderTransit {
  const LadderTransit({required this.game, this.gameLevel, this.boss = false, this.blocks = true});

  /// Адрес чужой игры, как его пишет лестница: `/games/cats`, `/games/puzzles?mode=Towers`.
  final String game;

  /// Уровень, на котором чужая игра открывается; `null` — на её собственном уровне
  /// у этого человека (сохранённый уровень и тогда не меняется).
  final int? gameLevel;

  /// Ступень-босс: экран хозяина пишет «Босс повержен / устоял».
  final bool boss;

  /// `false` — ступень не держит: +1 при любом возврате (босс по плану v4: «прошёл —
  /// награда, проиграл — следующий уровень всё равно открыт»). У «Самурая» и «Фрактала»
  /// проигрыша нет вовсе — партия кончается победой или уходом, — поэтому уход тоже +1.
  final bool blocks;

  /// Ступень-игра из данных лестницы (`ladder-80-204.json`, раздел sudoku-levels):
  /// `{"kind": "game", "game": "/games/puzzles?mode=Towers", "blockStep": 2}`.
  ///
  /// Уровень — `gameLevel`, а без него `blockStep`: блок из 4 ступеней входит в новое
  /// правило с его ступеней 1→4 (LEVELS_PLAN v4, «как вход в новое правило»).
  /// Не та форма — `null`, ступень играется своей игрой.
  static LadderTransit? levelOf(Object? row) {
    if (row is! Map || row['kind'] != 'game') return null;
    final game = row['game'];
    if (game is! String || !game.startsWith('/')) return null;
    return LadderTransit(game: game, gameLevel: _level(row['gameLevel']) ?? _level(row['blockStep']) ?? 1);
  }

  /// Босс той же строки: `{"boss": true, "bossGame": "/games/sudoku-samurai", "bossBlocks": false}`.
  /// Уровень — `bossLevel`; нет — босс на собственном уровне человека в той игре.
  static LadderTransit? bossOf(Object? row) {
    if (row is! Map || row['boss'] != true) return null;
    final game = row['bossGame'];
    if (game is! String || !game.startsWith('/')) return null;
    return LadderTransit(game: game, gameLevel: _level(row['bossLevel']), boss: true, blocks: row['bossBlocks'] == true);
  }

  static int? _level(Object? v) => v is num && v >= 1 ? v.toInt() : null;
}

enum TransitOutcome {
  /// Чужая партия выиграна — хозяин +1.
  passed,

  /// Чужая партия проиграна — хозяин записал провал (у нестрогой ступени — +1, см. [LadderTransit.blocks]).
  failed,

  /// Партия шла с разбором — не засчитывается никем.
  lesson,

  /// Человек ушёл до итога — ничего не записано.
  left,

  /// Игры нет в этой сборке — ступень играется своей игрой.
  unavailable,
}

class LevelTransition {
  LevelTransition._();

  /// Как построить экран по адресу. Ставит `HybridApp` (`routeOf` → `native`, хвост `?mode=`
  /// разбирается там же, где у перехвата страницы):
  /// оболочка знает все экраны, а этот файл импортировать её не должен — его зовут сами
  /// экраны, и круг «экран → оболочка → экран» здесь не нужен.
  static Widget Function(SharedState)? Function(String url) resolve = (_) => null;

  /// Сколько держать экран итога чужой игры перед возвратом: человек должен увидеть,
  /// чем кончилась партия, а не вылететь на ступень посреди анимации.
  static Duration closeDelay = const Duration(milliseconds: 1600);

  /// Сыграть ступень [step] лестницы [host]. Возвращается, когда человек снова на ступени.
  static Future<TransitOutcome> play(
    BuildContext context, {
    required SharedState state,
    required LevelLadder host,
    required LadderTransit step,
  }) async {
    final build = resolve(step.game);
    if (build == null) return TransitOutcome.unavailable;
    final navigator = Navigator.of(context);

    final hostPreset = GamePreset.params;
    final hostRoute = GameRules.currentRoute;
    final q = step.game.indexOf('?');
    GamePreset.set({
      // Хвост адреса — как у `_openNative`: экран режима читает его оттуда же.
      if (q >= 0) ...Uri.splitQueryString(step.game.substring(q + 1)),
      'auto': '1',
      if (step.gameLevel != null) 'lvl': '${step.gameLevel}',
      'ladderGame': host.gameId,
      'ladderLevel': '${host.level}',
    });
    GameRules.currentRoute = step.game;

    final route = MaterialPageRoute<void>(builder: (_) => RestartScope(builder: (_) => build(state)));
    bool? passed;
    var lesson = false;
    final previous = LevelLadder.onOutcome;
    LevelLadder.onOutcome = (p, l) {
      if (passed != null) return;   // «Ещё раз» в чужой игре — уже не наша ступень
      passed = p;
      lesson = l;
      Timer(closeDelay, () {
        if (!route.isActive) return;
        // Поверх партии может стоять её окно итога — снимаем всё до неё и её саму.
        navigator.popUntil((r) => r == route);
        if (route.isCurrent) navigator.pop();
      });
    };
    try {
      await navigator.push(route);
    } finally {
      LevelLadder.onOutcome = previous;
      GamePreset.set(hostPreset);
      GameRules.currentRoute = hostRoute;
    }

    final outcome = passed == null
        ? TransitOutcome.left
        : lesson
            ? TransitOutcome.lesson
            : passed!
                ? TransitOutcome.passed
                : TransitOutcome.failed;
    if (!step.blocks || outcome == TransitOutcome.passed) {
      await host.win(report: false);
    } else if (outcome == TransitOutcome.failed) {
      await host.fail(report: false);
    }
    return outcome;
  }
}
