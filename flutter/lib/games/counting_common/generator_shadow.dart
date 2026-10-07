/// ТЕНЬ ГЕНЕРАТОРА ДЛЯ ИГР «СЧЁТА» — звено 4 цепочки генератора уровней (задача 4e584381).
///
/// «Счёт» — второй, независимый от «Судоку» тип игр: не доска-головоломка, а партия быстрых
/// заданий, у которых трудность — непрерывная функция номера уровня. Игры подключены к общему
/// модулю (`lib/shell/generator/`) тем же путём, что 42 режима головоломок
/// (`games/puzzles/screen.dart`): ТЕНЬ. Человек играет прежнюю лестницу, генератор рядом пишет,
/// какую ступень выбрал бы, и учит рейтинг на настоящих исходах. Прописанный уровень не
/// трогается: у генератора свои ключи `psygames_<игра>_adaptive_*`.
///
/// ⚠️ ПОЧЕМУ ОТДЕЛЬНЫЙ КЛАСС, А НЕ ДВАДЦАТЬ СТРОК В КАЖДОМ ЭКРАНЕ, КАК У ГОЛОВОЛОМОК. Экранов
/// пять, а правила одни: раздача гасится исходом (одна партия — одно начисление, §9.8 эталона),
/// исход пишется ДО шага лестницы (после победы она уже шагнула), шаг зарядки и открытый хвост
/// выше обещанной лестницы рейтинг не учат. Пять копий разъехались бы. Это пункт для звена 5:
/// модулю не хватает адаптера «лестничная игра», его сейчас пишет каждый потребитель.
library;

import 'dart:math' as math;

import '../../shell/game_clock.dart';
import '../../shell/game_preset.dart';
import '../../shell/generator/contract.dart';
import '../../shell/generator/engine.dart';
import '../../shell/generator/ladder_pool.dart';
import '../../shell/generator/shadow.dart';
import '../../shell/generator/store.dart';
import '../../shell/lesson.dart';
import '../../shell/shared_state.dart';

class LadderShadow {
  LadderShadow(SharedState state, {required this.gameId, required List<String> stepKeys})
      : pool = ladderPool(gameId: gameId, stepKeys: stepKeys),
        _shadow = GeneratorShadow(GeneratorStore(state, gameId: gameId));

  final String gameId;

  /// По шаблону на ступень, которую лестница ОБЕЩАЕТ. Открытый хвост сюда не входит: конечный
  /// пул его не выражает — это ограничение модуля, записанное для звена 5.
  final List<Template> pool;

  final GeneratorShadow _shadow;
  Template? _given;
  String _eventId = '';
  static final math.Random _idTail = math.Random();

  /// Шаблон текущей раздачи; `null` — партии в тени нет (хвост, шаг зарядки, исход уже записан).
  Template? get given => _given;

  /// Раздача партии уровня [level]: что выбрал бы генератор вместо выданной ступени.
  void deal(int level) {
    final at = level - 1;
    _given = !GamePreset.isPreset && at >= 0 && at < pool.length ? pool[at] : null;
    // Id раздачи — для идемпотентности исхода (D1), а не замер времени. Часы — игровые: храповик
    // game_clock_discipline запрещает настенные; случайный хвост разводит две раздачи одной мс.
    _eventId = '$gameId-${gameNow()}-${_idTail.nextInt(1 << 30)}';
    final given = _given;
    if (given != null) _shadow.recordDeal(level: level, given: given, pool: pool, mode: Leniency.normal);
  }

  /// Исход партии — звать ДО шага лестницы. Разбор посреди партии или подсказка игры
  /// ([assisted]) — «с подсказкой»: рейтинг не растёт (как «Показать решение» у головоломок).
  void outcome({required bool passed, bool assisted = false, int errors = 0, int hints = 0, int seconds = 0}) {
    final given = _given;
    _given = null;
    if (given == null) return;
    _shadow.recordOutcome(
      given: given,
      outcome: assisted || LessonUsed.inRound
          ? Outcome.assisted
          : (passed ? Outcome.passed : Outcome.failed),
      eventId: _eventId,
      errors: errors,
      hints: hints,
      seconds: seconds,
    );
  }
}
