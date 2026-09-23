import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/hybrid_app.dart';
import 'package:psygames_flutter/shell/level_ladder.dart';
import 'package:psygames_flutter/shell/shared_level_store.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 ШАГ ЗАРЯДКИ НЕ ДВИГАЕТ ЛИЧНЫЙ УРОВЕНЬ ИГРОКА.
///
/// Нашёл раздел «Пространство» 23.09.2026 замером по своим 14 экранам: хвост адреса до
/// нативного экрана не доходил вовсе (`grep -rl "queryParameters" flutter/lib/games/`
/// → 0 файлов), а вместе с ним терялся признак `wu=1`. В вебе он значит «партия-пресет»,
/// и правило `passed = !isPreset && …` стоит в 53 экранах. Нативно такой ветки не было
/// ни у одного — значит шаг зарядки МОЛЧА менял уровень: вверх при удаче, вниз при
/// провале. Перенос увёз правила игры и оставил бухгалтерию игрока.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  tearDown(GamePreset.clear);

  Future<LevelLadder> ladderAt(int level) async {
    SharedPreferences.setMockInitialValues({
      'psygames_active_profile': 'nzt48',
      'psygames_probe_level_nzt48': '$level',
    });
    final state = await SharedState.open();
    final l = LevelLadder(gameId: 'probe', store: SharedLevelStore(state), maxLevel: 20);
    await l.load();
    expect(l.level, level, reason: 'подготовка не сработала — мерить нечего');
    return l;
  }

  test('🔴 обычная победа уровень поднимает', () async {
    final l = await ladderAt(5);
    await l.win();
    expect(l.level, 6);
  });

  test('🔴 победа в шаге зарядки уровень НЕ трогает', () async {
    GamePreset.set({'wu': '1', 'diff': 'hard'});
    final l = await ladderAt(5);
    await l.win();
    expect(l.level, 5, reason: 'шаг зарядки поднял личный уровень — это и есть дефект');
  });

  test('🔴 три провала подряд в зарядке уровень НЕ опускают', () async {
    GamePreset.set({'wu': '1'});
    final l = await ladderAt(5);
    await l.fail();
    await l.fail();
    await l.fail();
    expect(l.level, 5);
  });

  test('обычные три провала подряд уровень опускают — правило не сломано', () async {
    final l = await ladderAt(5);
    await l.fail();
    await l.fail();
    await l.fail();
    expect(l.level, 4);
  });

  test('🔴 вызов дня (auto=1) — обычный раунд, а не пресет', () async {
    // Повод в самом вебе: когда вызов дня ходил с `wu=1`, уровни молча не
    // засчитывались — два отчёта Вали на v1.185.0.
    GamePreset.set({'auto': '1'});
    expect(GamePreset.isPreset, isFalse);
    expect(GamePreset.autostart, isTrue);
    final l = await ladderAt(5);
    await l.win();
    expect(l.level, 6, reason: 'вызов дня обязан засчитываться');
  });

  test('🔴 хвост адреса разбирается целиком, включая пробелы и русские значения', () {
    final q = HybridApp.queryOf('http://127.0.0.1:47355/games/schulte?wu=1&diff=hard&trials=20&calm=1');
    expect(q['wu'], '1');
    expect(q['diff'], 'hard');
    expect(GamePreset.isPreset, isFalse, reason: 'разбор не должен сам ничего ставить');
    GamePreset.set(q);
    expect(GamePreset.isPreset, isTrue);
    expect(GamePreset.isCalm, isTrue);
    expect(GamePreset.num('trials', 10), 20);
    expect(GamePreset.num('нет-такого', 7), 7);
    expect(GamePreset.str('diff', 'medium'), 'hard');
    // Якорь отбрасывается, иначе последнее значение уедет с мусором.
    expect(HybridApp.queryOf('/games/x?mode=Light%20Up#top')['mode'], 'Light Up');
    expect(HybridApp.queryOf('/games/x'), isEmpty);
  });
}
