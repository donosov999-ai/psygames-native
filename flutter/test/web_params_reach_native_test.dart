import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// 🔴 ПАРАМЕТР АДРЕСА ВЕБ-ЭКРАНА ДОХОДИТ ДО НАТИВА — ИЛИ СНЯТ С ПРИЧИНОЙ (задача 44f7e4e0).
///
/// Веб-экран игры читает свои настройки из хвоста адреса (`bool('series')`, `str('targetLang')`,
/// `num('duration')`), и зарядка с потоками ими пользуются: `warmupEntries.ts` открывает
/// `/games/schulte?auto=1&series=1`. Если нативный двойник параметр не читает, `HybridApp.routeOf`
/// молча отдаёт голый экран — режим пропадает без единой ошибки. Так «Корректура» и «Шульте»
/// потеряли серию блоков из зарядки (замер «Слов» 07.10.2026: 14 параметров у 9 экранов).
///
/// ⚠️ РАЗБОР — ТОТ ЖЕ, ЧТО У СКРИПТА ЗАМЕРА (`words-chat/measure/2026-10-07_web-params-native.py`):
/// маршруты — из карты нативных экранов `hybrid_app.dart`; параметры веба — `bool|str|num('x')` в
/// `frontend/app/games/<имя>.tsx`; «натив читает» — ЧТЕНИЕ параметра в `lib/games/<имя_с_подчёркиванием>/`
/// (`GamePreset.str|num|flag('x'` или `GamePreset.params['x']`) или ключ СВОЕГО маршрута в карте
/// (`'/games/<имя>?…x=…'`). Натив мог читать параметр под другим именем — тогда назвать так же.
///
/// 🔴 СТРОЖЕ С 07.10.2026 (замер «Внимания» по «Корректуре»): раньше «читает» засчитывалось по ЛЮБОЙ
/// строке `'x'` в папке экрана — `'rows'`/`'cols'` стояли в карте условия партии
/// (`proofreading/model.dart`, `condition`), а натив их не читал: шаг зарядки шёл с полем уровня. И `x=`
/// искалось по всей карте: `mode=` есть у ключей «Анаграмм» и «Судоку», и `mode` засчитывался ВСЕМ.
///
/// 🔴 ХРАПОВИК, А НЕ СТЕНА. Потери, найденные замером, записаны в [lostWithReason] с причиной или
/// задачей владельца. Новая потеря — красный. Починенная — тоже красный, пока строку отсюда не
/// уберут: список снятых только убывает.

/// Параметры каркаса: их читает `GamePreset`, а не экран.
const _shellParams = {'wu', 'auto', 'ladderGame'};

/// Снятые потери: маршрут → параметр → почему (решение, задача, PR). Первый замер 07.10.2026 на
/// 7679684ac (14 потерь у 9 экранов); строгий — 07.10 на c614cb2ae (37 у 20, новые — задача 3e685a46);
/// сведён с main 2.56.17 (сняты починенные anagrams/targetLang #272, find-differences/diffCount #185) — 35 у 19;
/// сведён с main 2.56.18 (сняты починенные dots-connect/level и one-line/level #302, proofreading cols/rows/mode #290,
/// proofreading/taskMode #293) — 29 у 17.
const _t = 'строгий замер 07.10, задача 3e685a46 (координатор раздаёт)';
const lostWithReason = <String, Map<String, String>>{
  '/games/anagrams': {
    'length': 'не дефект: решение Дениса 09.09 «зарядка с личного уровня» — длину слова ведёт лестница',
  },
  '/games/math-sprint': {
    'diff': 'не дефект (замер «Поиска» 08.10 по main c50a0f15d): веб кладёт diff только в подсветку кнопки '
        'сложности на экране настройки (math-sprint.tsx:111, :282–293), а задачи строит '
        'generateSprintProblem(lvl.level) — тир снят решением Дениса 09.09 «зарядка с личного уровня» (:173–179). '
        'Шлют 3 шага profiles.ts/warmup.ts и 107 в defaultPlaylists.json',
  },
  '/games/number-bonds': {
    'diff': 'по решению Дениса 09.09 «зарядка с личного уровня» (замер «Поиска» 08.10): веб-пресет ещё берёт '
        'тир DIFF_CFG[diff] без окна времени («прежнее поведение», number-bonds.tsx:187), натив играет личный '
        'уровень (levelParams). Шлют 3 шага profiles.ts/warmup.ts и 44 в defaultPlaylists.json',
  },
  '/games/prl': {'diff': _t},
  '/games/proofreading': {
    'series': 'задача f4bb47dc («Внимание»)',
  },

  '/games/scholars-mate': {
    'drill': '«Шахматы»',
    'flow': '«Шахматы»',
    'seed': '«Шахматы»',
    'level': _t,
    'mix': _t,
    'motif': _t,
  },
  '/games/stroop': {'mode': _t, 'trials': _t},
  '/games/stroop-emotional': {'trials': _t},
  '/games/sudoku': {
    'diff': 'не дефект (раздел «Судоку», задача 67490534; замер каркаса 08.10 по main 33af6e413): зарядка шлёт diff '
        '(5 шагов в constants/profiles.ts → stepToParams: p.diff = step.difficulty), но веб в зарядке играет в режиме '
        'лестницы (modeRef «levels», шаг mode не задаёт) и diff там не читает — blanksFor(size, difficulty) только вне '
        'levels (sudoku.tsx:952); в нативе трудность ведёт лестница (freePreset) — решение Дениса 09.09 «с личного уровня»',
  },
  '/games/switching-task': {
    'stimMode': '«Внимание»: вид стимулов из адреса — читается в PR #287',
  },
  '/games/targets': {'level': _t, 'mode': _t},
};

/// Замер: маршрут → параметры, которые веб читает, а натив — нет.
Map<String, Set<String>> measureLost() {
  final hybrid = File('lib/shell/hybrid_app.dart').readAsStringSync();
  final routes = {for (final m in RegExp(r"'(/games/[^'?]+)(?:\?[^']*)?'\s*:").allMatches(hybrid)) m.group(1)!};
  final lost = <String, Set<String>>{};
  for (final route in routes) {
    final name = route.split('/games/')[1];
    final web = File('../frontend/app/games/$name.tsx');
    final dir = Directory('lib/games/${name.replaceAll('-', '_')}');
    if (!web.existsSync() || !dir.existsSync()) continue;
    final params = {
      for (final m in RegExp(r"\b(?:bool|str|num)\('([A-Za-z_]+)'").allMatches(web.readAsStringSync())) m.group(1)!,
    }.difference(_shellParams);
    final native = StringBuffer();
    for (final f in dir.listSync(recursive: true).whereType<File>().where((f) => f.path.endsWith('.dart'))) {
      native.write(f.readAsStringSync());
    }
    final text = native.toString();
    // Ключи СВОЕГО маршрута в карте: '/games/<имя>?a=1&b=2' — параметры a, b.
    final own = {
      for (final k in RegExp("'${RegExp.escape(route)}\\?([^']*)'").allMatches(hybrid))
        for (final pair in k.group(1)!.split('&')) pair.split('=').first,
    };
    bool reads(String p) =>
        RegExp("GamePreset\\.(?:str|num|flag)\\(\\s*'${RegExp.escape(p)}'").hasMatch(text) ||
        text.contains("GamePreset.params['$p']") ||
        own.contains(p);
    final miss = {for (final p in params) if (!reads(p)) p};
    if (miss.isNotEmpty) lost[route] = miss;
  }
  return lost;
}

void main() {
  final lost = measureLost();

  test('замер не пустой: маршруты с веб-двойником и параметрами найдены', () {
    final hybrid = File('lib/shell/hybrid_app.dart').readAsStringSync();
    expect(RegExp(r"'(/games/[^'?]+)(?:\?[^']*)?'\s*:").allMatches(hybrid).length, greaterThan(30),
        reason: 'карта нативных экранов прочитана');
    // Хотя бы один параметр, который натив ЧИТАЕТ НА САМОМ ДЕЛЕ (GamePreset.str), — иначе «не читает
    // ничего» прошло бы вслепую. Прежний контроль («cols» у «Корректуры») был ложным: строка 'cols'
    // стояла в карте условия партии, а не в чтении параметра.
    expect(File('../frontend/app/games/anagrams.tsx').readAsStringSync(), contains("str('targetLang'"));
    expect(File('lib/games/anagrams/screen.dart').existsSync() ? 'есть' : 'нет', 'есть');
  });

  test('🔴 новая потеря параметра — красный: каждая потеря снята с причиной', () {
    final fresh = <String>[
      for (final e in lost.entries)
        for (final p in e.value)
          if (!(lostWithReason[e.key]?.containsKey(p) ?? false)) '${e.key}?$p=…',
    ]..sort();
    expect(fresh, isEmpty,
        reason: 'веб-экран читает параметр, а натив его теряет молча (HybridApp.routeOf откатывается к '
            'голому адресу). Прочитать параметр в нативном экране или снять здесь с причиной/задачей.');
  });

  test('🔴 список снятых только убывает: починили — убрать строку', () {
    final stale = <String>[
      for (final e in lostWithReason.entries)
        for (final p in e.value.keys)
          if (!(lost[e.key]?.contains(p) ?? false)) '${e.key}?$p=…',
    ]..sort();
    expect(stale, isEmpty, reason: 'натив теперь читает параметр — строку из lostWithReason убрать');
  });

  test('у каждой снятой потери есть причина, а не отметка', () {
    for (final e in lostWithReason.entries) {
      for (final r in e.value.entries) {
        expect(r.value.trim().length, greaterThan(5), reason: '${e.key}?${r.key}');
      }
    }
  });
}
