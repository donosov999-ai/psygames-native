import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/ability_wallet.dart';
import 'package:psygames_flutter/shell/practice_run.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 «ПРОБНЫЙ ЗАХОД» — правила веба (`practice_run`, `settlePracticeRun`):
/// решение до первого стимула, списание на финише, в шаге зарядки не бывает.
void main() {
  Future<SharedState> open({int have = 2}) async {
    SharedPreferences.setMockInitialValues({
      'psygames_active_profile': 'nzt48',
      if (have > 0) AbilityWallet.key: jsonEncode({'nzt48': {'practice_run': have}}),
    });
    return SharedState.open();
  }

  test('остаток читается из общего кошелька веба', () async {
    final run = PracticeRun(await open(have: 3));
    expect(run.left, 3);
    expect(PracticeRun(await open(have: 0)).left, 0, reason: 'пустой кошелёк — нечего включать');
  });

  test('переключатель не включается на пустом кошельке', () async {
    final run = PracticeRun(await open(have: 0))..toggle();
    expect(run.armed, isFalse);
  });

  test('решение снимается на старте: не заявлен — партия обычная, списывать нечего', () async {
    final state = await open();
    final run = PracticeRun(state);
    expect(run.decide(allowed: true), isFalse);
    expect(await run.settle(), isFalse, reason: 'не заявлен — партию записываем');
    expect(AbilityWallet(state).count('practice_run'), 2, reason: 'ничего не списано');
  });

  test('заявлен и начат — на финише списывается ровно одна, партию не записываем, переключатель гаснет', () async {
    final state = await open();
    final run = PracticeRun(state)..toggle();
    expect(run.decide(allowed: true), isTrue);
    expect(run.now, isTrue);
    expect(await run.settle(), isTrue);
    expect(AbilityWallet(state).count('practice_run'), 1);
    expect(run.left, 1, reason: 'остаток обновился');
    expect(run.armed, isFalse, reason: 'на следующую партию заново решать');
    expect(run.used, isTrue, reason: 'на итоге — «никуда не записана»');
    expect(await run.settle(), isFalse, reason: 'второй раз за ту же партию не списать');
  });

  test('брошенная партия платной не бывает: без settle ничего не списано', () async {
    final state = await open();
    final run = PracticeRun(state)..toggle();
    run.decide(allowed: true);   // старт, финиша нет — вышел на середине
    expect(AbilityWallet(state).count('practice_run'), 2);
  });

  test('в шаге зарядки пробным не бывает', () async {
    final state = await open();
    final run = PracticeRun(state)..toggle();
    expect(run.decide(allowed: false), isFalse);
    expect(await run.settle(), isFalse);
    expect(AbilityWallet(state).count('practice_run'), 2);
  });

  test('решение нельзя поменять после старта: переключатель потом партию не касается', () async {
    final state = await open();
    final run = PracticeRun(state)..toggle();
    run.decide(allowed: true);
    run.toggle();   // выключил уже в партии — поздно
    expect(await run.settle(), isTrue, reason: 'решение, снятое до первого стимула, держится');
  });

  test('кошелёк опустел за время партии — партия идёт как обычная, а не бесплатная пробная', () async {
    final state = await open(have: 1);
    final run = PracticeRun(state)..toggle();
    run.decide(allowed: true);
    await AbilityWallet(state).spend('practice_run');   // потратили в другом месте
    expect(await run.settle(), isFalse, reason: 'нечего списать — записываем как обычную');
  });
}
