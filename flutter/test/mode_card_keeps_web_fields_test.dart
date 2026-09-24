import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// 🔴 НАТИВНАЯ КАРТОЧКА РЕЖИМА НЕ ТЕРЯЕТ ПОЛЕЙ ВЕБ-КАРТОЧКИ.
///
/// ПОЙМАНО 24.09.2026, и цена была реальной. Раздел «Сортировки» целый заход правил
/// веб-половину «Рельсов» и «Мостов»: нашёл, что справка ВРАЛА (рельс кладётся на
/// границу между клетками, а не тапом внутрь), и добавил режиму органы курсора.
/// А оба адреса уже перехвачены нативно — и до телефона эта работа не дошла бы:
/// нативная карточка несла только имя, цифры и ступени. Перехват включил я, поля не
/// перенёс, и раздел работал в пустоту.
///
/// ⚠️ ПРОБА СРАВНИВАЕТ НАБОРЫ ПОЛЕЙ, А НЕ ЗНАЧЕНИЯ. Значения у режимов разные и
/// меняются; беда была не в значении, а в том, что поля не существовало вовсе.
void main() {
  final root = Directory.current.path;

  /// Поля, которые веб-карточка режима умеет нести (`sections/*.ts`).
  ///
  /// Список снимается С ИСХОДНИКА, а не пишется руками: иначе он устареет ровно так
  /// же молча, как устарел сам перенос.
  Set<String> webFields() {
    final dir = Directory('$root/../frontend/src/games/tatham-bridge/sections');
    final out = <String>{};
    for (final f in dir.listSync()) {
      if (f is! File || !f.path.endsWith('.ts')) continue;
      for (final m in RegExp(r'^\s{4}([\wа-яА-ЯёЁ]+):', multiLine: true)
          .allMatches(f.readAsStringSync())) {
        out.add(m.group(1)!);
      }
    }
    return out;
  }

  /// Чем поле веб-карточки называется в переносе. Пусто — поле НЕ переносится, и
  /// рядом обязана стоять причина, а не молчание.
  const carried = <String, String>{
    'имя': 'engineName',
    'цифры': 'digits',
    'знакиЦифр': 'digitLabels',
    'лестница': 'steps',
    'стрелки': 'arrows',
    'восемьНаправлений': 'eightWays',
    'выбор': 'pick',
    'выборВторой': 'pickSecond',
    'второе': 'secondKey',
    'имяВторогоВыбора': 'secondPickKey',
    'толькоПротяжка': 'dragOnly',
    'ввод': 'input',
    // ⚠️ План по шагам — это РУКОПИСНЫЙ учитель режима, а не настройка управления.
    // Он живёт в вебе целиком и в перенос не едет: нативный разбор строится общим
    // генератором (`games/puzzles/lesson.dart`), а рукописный берётся там, где есть.
    'планШагами': '',
  };

  test('🔴 каждое поле веб-карточки либо перенесено, либо объяснено', () {
    final missing = webFields().where((f) => !carried.containsKey(f)).toList()..sort();
    expect(missing, isEmpty,
        reason: 'у режима появилось поле, которого нет в переносе. Либо провести его '
            'в flutter/tools/embed-puzzle-modes.mjs, либо вписать сюда с причиной — '
            'иначе раздел будет править то, чего человек на телефоне не увидит');
  });

  test('🔴 перенесённые поля действительно доехали в modes.json', () {
    final modes = jsonDecode(File('$root/assets/puzzles/modes.json').readAsStringSync())
        as Map<String, dynamic>;
    expect(modes.length, 42, reason: 'режимов в реестре ${modes.length}');
    final card = (modes['Train Tracks'] as Map<String, dynamic>).keys.toSet();
    final want = carried.values.where((v) => v.isNotEmpty).toSet();
    expect(want.difference(card), isEmpty, reason: 'в карточке нет полей: ${want.difference(card)}');
  });

  test('🔴 «Рельсы» довезли органы курсора — то, ради чего задача и заводилась', () {
    final modes = jsonDecode(File('$root/assets/puzzles/modes.json').readAsStringSync())
        as Map<String, dynamic>;
    final t = modes['Train Tracks'] as Map<String, dynamic>;
    // Замер раздела прибором `puzzle-input-probe.mjs`: стрелки водят курсор,
    // оба выбора делают ход. До 24.09 в карточке не стояло ни одной настройки.
    expect(t['arrows'], isTrue);
    expect(t['pick'], isTrue);
    expect(t['pickSecond'], isTrue);
    expect(t['secondKey'], 'puzzleSecondNoTrack');
  });
}
