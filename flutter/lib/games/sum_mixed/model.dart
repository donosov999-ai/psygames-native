/// ПРАВИЛА «ВПЕРЕМЕШКУ» — третий режим набора «Собери сумму».
///
/// Раунд идёт по одному из двух правил набора и меняется между раундами:
///  · [SumRule.speed] — правила «Считалки» (`counter/model.dart`): сетка чисел, цель из двух-трёх
///    клеток, окно на раунд, перебор — ошибка;
///  · [SumRule.composition] — правила «Числовых пар» (`number_bonds/model.dart`): фишки, цель из
///    нескольких, верная сумма принимается сама, неверную человек докладывает кнопкой.
/// Раздачи берутся у ТЕХ ЖЕ генераторов (`makeCounterRound`, `makePuzzle`): второго генератора нет,
/// и правка трудности в старых лестницах двигает и этот режим.
///
/// 🔴 СВОЯ ЛЕСТНИЦА: `sum_mixed`. Уровни `counter` и `number_bonds` у игроков не тронуты.
/// Уровень L берёт параметры L у обоих правил — режим растёт теми же осями, что и его родители.
///
/// ⚠️ «СЛУЧАЙНО» НЕ ЗНАЧИТ «ПОДРЯД ОДНО И ТО ЖЕ»: не больше [mixedMaxRun] одинаковых правил
/// подряд, иначе партия из десяти раундов могла бы целиком выпасть на одно правило, и режим
/// «Вперемешку» ничем не отличался бы от родителя.
library;

import '../counter/model.dart';
import '../number_bonds/model.dart';

enum SumRule { speed, composition }

/// Раундов в уровне.
const int mixedRounds = 10;

/// Проход уровня: решено ≥80 % раундов (как у «Считалки»).
const double mixedPassAccuracy = 0.8;

/// Не больше стольких одинаковых правил подряд.
const int mixedMaxRun = 2;

class MixedCfg {
  const MixedCfg({required this.speed, required this.composition});

  /// Параметры раундов-«Считалки» этого уровня.
  final CounterCfg speed;

  /// Параметры раундов-«Числовых пар» этого уровня.
  final BondsCfg composition;

  int get rounds => mixedRounds;
  int get passNeed => (mixedRounds * mixedPassAccuracy).ceil();

  /// Окно на раунд правила; 0 — без таймера (детские уровни «Числовых пар»).
  int limitMs(SumRule rule) => rule == SumRule.speed ? speed.roundLimitMs : composition.windowMs;
}

MixedCfg mixedLevelParams(int level) =>
    MixedCfg(speed: counterLevelParams(level), composition: levelParams(level));

/// Правила всех раундов партии: случайные, но без серий длиннее [mixedMaxRun].
List<SumRule> dealRules(int rounds, Rng rnd) {
  final out = <SumRule>[];
  for (var i = 0; i < rounds; i++) {
    var next = rnd() < 0.5 ? SumRule.speed : SumRule.composition;
    if (out.length >= mixedMaxRun && out.skip(out.length - mixedMaxRun).every((r) => r == next)) {
      next = next == SumRule.speed ? SumRule.composition : SumRule.speed;
    }
    out.add(next);
  }
  return out;
}

/// Раздача одного раунда: заполнена та половина, что нужна правилу.
class MixedRound {
  const MixedRound.speed(CounterRound this.speed)
      : rule = SumRule.speed,
        composition = null;
  const MixedRound.composition(BondsPuzzle this.composition)
      : rule = SumRule.composition,
        speed = null;

  final SumRule rule;
  final CounterRound? speed;
  final BondsPuzzle? composition;

  int get target => speed?.target ?? composition!.target;

  /// Числа на поле: клетки сетки или фишки.
  List<int> get values => speed?.numbers ?? composition!.chips;
}

MixedRound makeMixedRound(SumRule rule, MixedCfg cfg, Rng rnd) => rule == SumRule.speed
    ? MixedRound.speed(makeCounterRound(cfg.speed.gridSize, cfg.speed.cellMax, cfg.speed.tripleShare, rnd))
    : MixedRound.composition(makePuzzle(cfg.composition, rnd));
