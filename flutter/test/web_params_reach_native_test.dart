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
/// `frontend/app/games/<имя>.tsx`; «натив читает» — строка `'x'` в `lib/games/<имя_с_подчёркиванием>/`
/// или `x=` в карте маршрутов. Разбор грубый: натив мог читать параметр под другим именем. Тогда
/// параметр надо назвать так же, а не держать здесь строку.
///
/// 🔴 ХРАПОВИК, А НЕ СТЕНА. Потери, найденные замером, записаны в [lostWithReason] с причиной или
/// задачей владельца. Новая потеря — красный. Починенная — тоже красный, пока строку отсюда не
/// уберут: список снятых только убывает.

/// Параметры каркаса: их читает `GamePreset`, а не экран.
const _shellParams = {'wu', 'auto', 'ladderGame'};

/// Снятые потери: маршрут → параметр → почему (решение, задача, PR). Замер 07.10.2026 на 7679684ac.
const lostWithReason = <String, Map<String, String>>{
  '/games/anagrams': {
    'length': 'не дефект: решение Дениса 09.09 «зарядка с личного уровня» — длину слова ведёт лестница',
  },
  '/games/proofreading': {
    'series': 'задача f4bb47dc («Внимание»)',
    'taskMode': 'филворды не перенесены; шахматная зарядка шлёт fillwords (chessWarmup.ts:225) — «Внимание»',
  },
  '/games/schulte': {
    'series': 'задача 1b6338c1 («Поиск»)',
    'size': '«Поиск»: размер поля из адреса',
  },
  '/games/sdmt': {
    'duration': '«Поиск»: длительность — настройка, по решению 09.09 остаётся за шагом; потеря похожа на настоящую',
  },
  '/games/math-sprint': {
    'duration': '«Поиск»: длительность из адреса',
  },
  '/games/scholars-mate': {
    'drill': '«Шахматы»',
    'flow': '«Шахматы»',
    'seed': '«Шахматы»',
  },
  '/games/switching-task': {
    'stimMode': '«Внимание»: вид стимулов из адреса',
  },
  '/games/spatial-lab': {
    'seed': '«Пространство»: зерно раскладки из адреса',
  },
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
    final miss = {for (final p in params) if (!text.contains("'$p'") && !hybrid.contains('$p=')) p};
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
    // Хотя бы один параметр, который натив ЧИТАЕТ, — иначе «не читает ничего» прошло бы вслепую.
    expect(File('../frontend/app/games/proofreading.tsx').readAsStringSync(), contains("num('cols'"));
    expect(lost['/games/proofreading'] ?? const {}, isNot(contains('cols')), reason: 'cols натив читает');
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
