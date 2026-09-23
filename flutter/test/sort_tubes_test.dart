import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/sort_tubes/layout.dart';
import 'package:psygames_flutter/games/sort_tubes/model.dart';

/// СВЕРКА ДВИЖКА СОСУДОВ С ЖИВЫМ TS, А НЕ С СОБСТВЕННОЙ ФОРМУЛОЙ.
///
/// Правила («переливалка · шарики · гайки» — один движок) перенесены из
/// `src/games/water-sort/core/{tubes,hidden}.ts`, раскладка — из самого экрана.
/// Проверять перенос тем же выражением, которым переносил, нельзя: проба была бы
/// зелёной всегда. Ответы ВЫГРУЖЕНЫ прогоном живого TS: 240 ходов с причинами
/// отказа, 80 отъездов собранного, 360 раскладок, 40 досок со скрытым слоем.
void main() {
  late Map<String, dynamic> ref;

  setUpAll(() {
    ref = jsonDecode(File('test/fixtures/sort-tubes-reference.json').readAsStringSync())
        as Map<String, dynamic>;
  });

  test('премиса: в эталонах есть и разрешённые ходы, и все виды отказа', () {
    final moves = ref['moves'] as List;
    expect(moves.length, 240);
    final legal = moves.where((m) => (m as Map)['canPour'] == true).length;
    expect(legal, greaterThan(20), reason: 'разрешённые ходы');
    expect(legal, lessThan(240), reason: 'и запрещённые');
    final reasons = moves.map((m) => (m as Map)['reason']).toSet();
    for (final want in ['полон', 'другойЦвет', 'безТолку', 'закрыт', 'пусто']) {
      expect(reasons, contains(want), reason: 'вид отказа «$want» обязан встретиться');
    }
  });

  test('🔴 перелив, его объём и причина отказа совпадают с живым TS на 240 ходах', () {
    final bad = <String>[];
    for (final raw in ref['moves'] as List) {
      final m = raw as Map<String, dynamic>;
      final f = TubeField.fromJson(m['field'] as Map<String, dynamic>);
      final from = m['from'] as int;
      final to = m['to'] as int;
      final at = 'ход $from→$to на ${jsonEncode(m['field'])}';

      void same(String name, Object? got, Object? want) {
        if (jsonEncode(got) != jsonEncode(want)) bad.add('$name: TS $want, Dart $got · $at');
      }

      same('canPour', canPour(f, from, to), m['canPour']);
      same('причина', refusalReason(f, from, to), m['reason']);
      same('объём', pourAmount(f, from, to), m['amount']);
      same('верхний столбик', f.tubes[from].isEmpty ? 0 : topRun(f.tubes[from]), m['topRun']);
      same('место в цели', f.roomIn(to), m['roomTo']);
      same('открыт источник', f.isOpen(from), m['openFrom']);
      same('открыта цель', f.isOpen(to), m['openTo']);
      same('закрытые сосуды', [for (var i = 0; i < f.length; i += 1) f.isDone(i)], m['done']);
      same('сколько собрано', f.doneCount(), m['doneCount']);
      same('партия сошлась', f.isSolved, m['solved']);
      same('вместимости', [for (var i = 0; i < f.length; i += 1) f.capOf(i)], m['caps']);
      same('камни', [for (var i = 0; i < f.length; i += 1) f.stonesIn(i)], m['stones']);

      final after = pour(f, from, to);
      if (m['result'] == null) {
        if (after != null) bad.add('$at: TS запретил, Dart перелил');
      } else if (after == null) {
        bad.add('$at: TS перелил, Dart запретил');
      } else {
        same('поле после хода', after.toJson(), m['result']);
      }
    }
    expect(bad, isEmpty, reason: '${bad.length} расхождений, первые три:\n${bad.take(3).join('\n')}');
  });

  test('🔴 отъезд собранного увозит ВСЕ ряды поля вместе (80 досок)', () {
    // Сдвинь сосуды и забудь про caps/stones/opensAt — и у сосуда окажется чужая
    // высота или чужой замок. Тот же класс ошибки, на котором в «Товарах» за день
    // потерялись три поля доски.
    final bad = <String>[];
    var sealedTotal = 0;
    for (final raw in ref['seals'] as List) {
      final c = raw as Map<String, dynamic>;
      final f = TubeField.fromJson(c['field'] as Map<String, dynamic>);
      final got = sealDone(f);
      sealedTotal += got.sealed;
      if (got.sealed != c['sealed']) {
        bad.add('увезено: TS ${c['sealed']}, Dart ${got.sealed}');
      }
      if (jsonEncode(got.field.toJson()) != jsonEncode(c['result'])) {
        bad.add('поле после отъезда:\n  TS   ${jsonEncode(c['result'])}\n  Dart ${jsonEncode(got.field.toJson())}');
      }
    }
    expect(bad, isEmpty, reason: bad.take(3).join('\n'));
    expect(sealedTotal, greaterThan(0), reason: 'хоть где-то отъезд обязан случиться');
  });

  test('🔴 раскладка: колонки и ширина сосуда совпадают с живым экраном (360 случаев)', () {
    final bad = <String>[];
    for (final raw in ref['layouts'] as List) {
      final c = raw as Map<String, dynamic>;
      final n = c['n'] as int;
      final avail = (c['доступно'] as num).toDouble();
      final h = (c['высота'] as num).toDouble();
      final cols = columnsFor(n, avail, h);
      final w = tubeWidth(n, avail, h);
      if (cols != c['cols']) bad.add('колонок при n=$n, поле $avail×$h: TS ${c['cols']}, Dart $cols');
      if (w != (c['width'] as num).toDouble()) {
        bad.add('ширина при n=$n, поле $avail×$h: TS ${c['width']}, Dart $w');
      }
    }
    expect(bad, isEmpty, reason: '${bad.length} расхождений, первые три:\n${bad.take(3).join('\n')}');
  });

  test('🔴 то, ради чего эта раскладка: высота поля меняет выбор колонок', () {
    // Замер 11.09.2026: на 375×687 пять сосудов одним рядом давали 62 точки,
    // три колонки в два ряда — 109. Если высота перестанет участвовать, проба
    // покраснеет здесь.
    const avail = 358.0;
    expect(columnsFor(5, avail, 0), 5, reason: 'без высоты — один ряд, как было');
    expect(columnsFor(5, avail, 687), lessThan(5), reason: 'с высотой ряд обязан разбиться');
    expect(tubeWidth(5, avail, 687), greaterThan(tubeWidth(5, avail, 0)),
        reason: 'и сосуд обязан вырасти');
  });

  test('🔴 скрытый слой: верхний виден всегда, счёт скрытого сходится (40 досок)', () {
    final bad = <String>[];
    var hiddenTotal = 0;
    for (final raw in ref['hiddenCases'] as List) {
      final c = raw as Map<String, dynamic>;
      final f = TubeField.fromJson(c['field'] as Map<String, dynamic>);
      final keys = (c['keys'] as List).map((k) => (k as num).toInt()).toSet();
      final want = c['visible'] as List;
      for (var i = 0; i < f.length; i += 1) {
        for (var d = 0; d < f.tubes[i].length; d += 1) {
          final got = layerVisible(f, keys, i, d);
          if (got != (want[i] as List)[d]) {
            bad.add('слой $i:$d: TS ${(want[i] as List)[d]}, Dart $got');
          }
        }
      }
      final left = hiddenLeft(f, keys);
      hiddenTotal += left;
      if (left != c['left']) bad.add('скрыто осталось: TS ${c['left']}, Dart $left');
    }
    expect(bad, isEmpty, reason: bad.take(3).join('\n'));
    expect(hiddenTotal, greaterThan(0), reason: 'скрытые слои в эталонах обязаны быть');
  });

  test('🔴 пороги уровня и звёзды считаются как в TS', () {
    for (final raw in ref['levels'] as List) {
      final l = raw as Map<String, dynamic>;
      final level = l['level'] as int;
      expect(hiddenAtLevel(level), l['hidden'], reason: 'скрытый слой на L$level');
      expect(starsByMoves(level), l['starsByMoves'], reason: 'звёзды по ходам на L$level');
    }
    // Доля от эталона: 1,2 и 1,8 — те же пороги, что в вебе.
    expect(starsFor(9, 9, 1), 3);
    expect(starsFor(11, 9, 1), 2, reason: '11/9 = 1,22 — уже за порогом 1,2');
    expect(starsFor(10, 9, 1), 3, reason: '10/9 = 1,11 — ещё в пороге');
    expect(starsFor(16, 9, 1), 2);
    expect(starsFor(20, 9, 1), 1);
    expect(starsFor(999, 9, 16), 3, reason: 'под скрытым слоем минимума не существует');
  });

  test('🔴 ключ положения различает сосуды по их высоте, камням и замку', () {
    // 📍 Найдено в вебе 07.09.2026: [[1,1],[2]] и [[2],[1,1]] при caps [4,2]
    // давали ОДИН ключ, обход выбрасывал настоящее решение и объявлял доску
    // непроходимой.
    final a = TubeField(tubes: [
      [1, 1],
      [2],
    ], cap: 4, caps: const [4, 2]);
    final b = TubeField(tubes: [
      [2],
      [1, 1],
    ], cap: 4, caps: const [4, 2]);
    expect(a.fieldKey(), isNot(b.fieldKey()));
  });
}
