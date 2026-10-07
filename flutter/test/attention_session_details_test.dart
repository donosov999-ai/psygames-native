import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/bart/model.dart';
import 'package:psygames_flutter/games/bart/screen.dart';
import 'package:psygames_flutter/games/cpt/model.dart';
import 'package:psygames_flutter/games/cpt/screen.dart';
import 'package:psygames_flutter/games/flanker/model.dart';
import 'package:psygames_flutter/games/flanker/screen.dart';
import 'package:psygames_flutter/games/posner/model.dart';
import 'package:psygames_flutter/games/posner/screen.dart';
import 'package:psygames_flutter/games/switching_task/model.dart';
import 'package:psygames_flutter/games/switching_task/screen.dart';

/// ПОЛЯ ПАРТИИ ДЛЯ «ОЦЕНКИ» В РАЗДЕЛЕ «КОНФЛИКТ ВНИМАНИЯ» (задача 4ebadec6).
///
/// Партию с метрикой стерегут пробы экранов (шаг «Оценки» в каждом *_screen_test).
/// Здесь — другая половина: метрика, которую нечем определить, в партию НЕ пишется.
/// Веб в этих случаях пишет число-мусор (пустое плечо — ноль, CV при одном попадании —
/// ноль, все шары лопнули — ноль насосов), и `extractMetric` берёт его как измерение.
void main() {
  test('🔴 метрика не определена — ключа нет, а не ноль-мусор', () {
    expect(flankerSessionDetails(FlankerGame(level: 1)).containsKey('flanker_effect_ms'), isFalse);
    expect(posnerSessionDetails(PosnerGame(level: 1)).containsKey('validity_effect_ms'), isFalse);
    expect(switchingSessionDetails(SwitchingGame(level: 1)).containsKey('switch_cost_ms'), isFalse);
    expect(cptSessionDetails(CptGame(level: 1)).containsKey('rt_variability'), isFalse);
    expect(bartSessionDetails(BartGame(level: 1)).containsKey('adj_avg_pumps'), isFalse);
  });

  test('уровень и объём партии в details есть всегда', () {
    final d = flankerSessionDetails(FlankerGame(level: 4, trialsOverride: 15));
    expect([d['level'], d['n_trials']], [4, 15]);
  });

  test('длительность CPT из режима шага — как presetDurationSec в вебе', () {
    expect(cptPresetDurationSec('2min', 90), 120, reason: 'шаг «Оценки»');
    expect(cptPresetDurationSec('4min', 90), 240, reason: 'шаг зарядки');
    expect(cptPresetDurationSec('lvl3', 90), 90, reason: 'незнакомый режим — длительность уровня, не NaN');
    expect(cptPresetDurationSec('', 90), 90);
  });
}
