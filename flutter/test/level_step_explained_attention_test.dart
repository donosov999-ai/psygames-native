import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/flanker/model.dart';
import 'package:psygames_flutter/games/stroop/model.dart';
import 'package:psygames_flutter/games/switching_task/model.dart';
import 'package:psygames_flutter/games/targets/model.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/level_rules.dart';

/// 🔴 СТУПЕНЬ В ПЛАНЕ УРОВНЯ — НОВАЯ МЕХАНИКА. ЕЁ ОБЯЗАНЫ ОБЪЯСНИТЬ (задача cbf35533).
///
/// Нативная пара веб-гейта `frontend/src/__tests__/level-step-explained.test.ts`. В его
/// реестре из «Конфликта внимания» только `cpt`; Струп, Фланкер, переключение и «Мишени»
/// с 30.09.2026 играются во Flutter, а их ступени не стерёг никто. Веб людям в приложении
/// не показывается, поэтому проба стоит здесь и мерит НАТИВНЫЕ планы уровня.
///
/// КАК ОТЛИЧАЕТСЯ СТУПЕНЬ ОТ РОСТА — тем же числом, что у веба: план прогоняется по
/// L1…L40, поле с 2–5 разными значениями — переключатель, больше — плавный рост.
/// ⚠️ И ВТОРОЙ ПРИЗНАК, которого у веба нет: поле, которое было нулём и стало не нулём, —
/// это появление, даже если дальше оно растёт плавно. Доля смен правила у Струпа принимает
/// двенадцать значений и по первому признаку — «рост», но на L5 в игре появляется то,
/// чего не было: правило начинает меняться посреди партии.
///
/// Объяснение — карточка правила уровня (`assets/level_rules.json`, [LevelRules]): проба
/// сверяет, что правило начинается РОВНО на уровне ступени и что у него есть текст.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final plans = <String, ({int maxLevel, Map<String, num> Function(int) plan})>{
    'stroop': (
      maxLevel: 40,
      plan: (l) {
        final p = StroopLevel.of(l);
        return {'trials': p.trials, 'windowMs': p.windowMs, 'switchRate': p.switchRate, 'decoys': p.decoys};
      },
    ),
    'flanker': (
      maxLevel: 40,
      plan: (l) {
        final p = FlankerLevel.of(l);
        return {'trials': p.trials, 'windowMs': p.windowMs, 'pCong': p.pCong, 'pIncong': p.pIncong, 'gapPx': p.gapPx};
      },
    ),
    'switching_task': (
      maxLevel: 40,
      plan: (l) {
        final p = SwitchLevel.of(l);
        return {
          'trials': p.trials,
          'switchProbability': p.switchProbability,
          'windowMs': p.windowMs,
          'decoys': p.decoys,
        };
      },
    ),
    'targets': (
      maxLevel: targetsMaxLevel,
      plan: (l) {
        final p = TargetsLevel.of(l);
        return {'delayMs': p.delayMs, 'numSquares': p.numSquares, 'jitterPx': p.jitterPx, 'lifeBonus': p.lifeBonus};
      },
    ),
  };

  /// Ступени, у которых объяснение есть или не нужно. Записаны УРОВНИ, а не имя поля:
  /// новая ступень внутри известного поля — тоже новая механика (урок веб-гейта: две
  /// мутации пережили его первую редакцию, ключевавшуюся именем). `rules` — на каких
  /// уровнях ступень объясняет карточка правила и какая.
  const explained = <String, ({List<int> at, Map<int, String> rules, String why})>{
    'stroop.decoys': (
      at: [4, 9],
      rules: {4: 'noise'},
      why: 'карточка `noise` на L4: вокруг слова появляются знаки-помехи. На L9 их становится 4 вместо 2 — '
          'это количество той же помехи, а не новая механика',
    ),
    'stroop.switchRate': (
      at: [5],
      rules: {5: 'switch'},
      why: 'карточка `switch` с L5: часть проб идёт по другому правилу (слово вместо цвета); дальше доля смен '
          'растёт плавно, и над полем написано, какая она',
    ),
    'switching_task.decoys': (
      at: [4, 9],
      rules: {4: 'noise'},
      why: 'карточка `noise` с L4: вокруг стимула появляются помехи. На L9 их 4 вместо 2 — количество той же '
          'помехи, а не новая механика',
    ),
    'switching_task.trials': (
      at: [6, 11],
      rules: {},
      why: 'число проб в партии 12 → 16 → 20 — объём, а не механика: задача та же',
    ),
    'flanker.trials': (
      at: [6, 11],
      rules: {},
      why: 'число проб в партии 20 → 26 → 32 — объём, а не механика: задача та же',
    ),
    'targets.numSquares': (
      at: [5, 9, 13],
      rules: {},
      why: 'квадратов рядом с кругом 2 → 5: сравнивать больше цветов, но правило «круг совпал с квадратом» то же',
    ),
    'targets.jitterPx': (
      at: [5],
      rules: {},
      why: 'с L5 фигуры стоят не ровным рядом, а с разбросом по вертикали: дольше обходить глазами, но что '
          'искать и куда жать, не меняется. Цвета и доля мишеней не тронуты',
    ),
    'targets.lifeBonus': (
      at: [4, 7],
      rules: {},
      why: 'жизней за взятый уровень 1 → 3 → 5 — награда, а не задача',
    ),
  };

  /// Скачки поля по уровням. Поле-переключатель (2–5 значений) — все его скачки; поле,
  /// бывшее нулём, — ещё и уровень появления.
  Map<String, List<int>> steps(int maxLevel, Map<String, num> Function(int) plan) {
    final values = <String, Set<num>>{};
    final jumps = <String, List<int>>{};
    final onset = <String, int>{};
    Map<String, num>? prev;
    for (var l = 1; l <= maxLevel; l++) {
      final p = plan(l);
      for (final e in p.entries) {
        values.putIfAbsent(e.key, () => {}).add(e.value);
        jumps.putIfAbsent(e.key, () => []);
        if (prev != null && prev[e.key] != e.value) jumps[e.key]!.add(l);
        if (prev != null && prev[e.key] == 0 && e.value != 0 && !onset.containsKey(e.key)) onset[e.key] = l;
      }
      prev = p;
    }
    final out = <String, List<int>>{};
    for (final k in values.keys) {
      if (values[k]!.length >= 2 && values[k]!.length <= 5) {
        out[k] = jumps[k]!;
      } else if (onset.containsKey(k)) {
        out[k] = [onset[k]!];
      }
    }
    return out;
  }

  late Map<String, List<List<Object?>>> table;

  setUpAll(() async {
    final raw = jsonDecode(File('assets/level_rules.json').readAsStringSync()) as Map<String, dynamic>;
    table = (raw['games'] as Map<String, dynamic>)
        .map((id, ranges) => MapEntry(id, [for (final r in ranges as List) (r as List).cast<Object?>()]));
    LevelRules.debugSetTable(table);
    await L.load('en');
  });
  tearDownAll(() => LevelRules.debugSetTable(null));

  test('есть что проверять: в четырёх планах ступени находятся', () {
    final total = plans.values.fold<int>(0, (n, p) => n + steps(p.maxLevel, p.plan).length);
    expect(total, greaterThanOrEqualTo(8));
  });

  test('🔴 каждая ступень объяснена — И НА ТЕХ ЖЕ УРОВНЯХ', () {
    final silent = <String>[];
    for (final g in plans.entries) {
      for (final s in steps(g.value.maxLevel, g.value.plan).entries) {
        final address = '${g.key}.${s.key}';
        final entry = explained[address];
        if (entry == null) {
          silent.add('$address: величина скачет на L${s.value.join(',L')}, а объяснения нет');
        } else if (entry.at.join(',') != s.value.join(',')) {
          silent.add('$address: скачет на L${s.value.join(',L')}, а объяснено для L${entry.at.join(',L')}');
        }
      }
    }
    expect(silent, isEmpty);
  });

  test('🔴 карточка правила начинается РОВНО на уровне ступени и у неё есть текст', () {
    final wrong = <String>[];
    for (final e in explained.entries) {
      final game = e.key.split('.').first;
      for (final r in e.value.rules.entries) {
        final at = LevelRules.activeKey(game, r.key);
        final before = LevelRules.activeKey(game, r.key - 1);
        if (at != r.value) wrong.add('${e.key}: на L${r.key} действует `$at`, а не `${r.value}`');
        if (before == r.value) wrong.add('${e.key}: `${r.value}` действует уже на L${r.key - 1} — карточка раньше ступени');
        if (!LevelRules.hasText(game, r.value)) wrong.add('${e.key}: у правила `${r.value}` нет текста');
      }
    }
    expect(wrong, isEmpty);
  });

  test('записи не протухли: каждая всё ещё ступень', () {
    final stale = explained.keys.where((address) {
      final parts = address.split('.');
      final g = plans[parts[0]];
      return g == null || !steps(g.maxLevel, g.plan).containsKey(parts[1]);
    }).toList();
    expect(stale, isEmpty);
  });

  test('причины названы, а не оставлены пустыми', () {
    expect([for (final e in explained.entries) if (e.value.why.trim().length < 40) e.key], isEmpty);
  });
}
