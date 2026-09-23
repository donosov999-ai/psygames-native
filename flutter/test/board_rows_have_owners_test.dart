import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// У КАЖДОЙ СТРОКИ ДОСКИ ПЕРЕЕЗДА ЕСТЬ ВЛАДЕЛЕЦ.
///
/// 🔴 ЗАЧЕМ. 23.09.2026 из 67 оставшихся экранов 27 стояли с «❓ вписать себя»
/// — треть переезда ни за кем. Денис: «делаем одно и то же, ты не можешь в рефах
/// зафиксировать чётко». Он прав дважды: владельцы БЫЛИ записаны — поимённо, в
/// карточках реестра TeamOps, — и шестнадцать строк закрылись простым переносом
/// оттуда, без единого решения. Пустая клетка означала не «некому», а «никто не
/// переписал».
///
/// Поэтому строка без владельца теперь не проходит молча. Остаток — поимённый
/// список ниже, и он может только УМЕНЬШАТЬСЯ: имя уходит отсюда, когда Денис
/// назвал раздел, и никогда не возвращается.
///
/// ⚠️ ЧЕГО ЭТА ПРОБА НЕ ЛОВИТ, И ЭТО ВАЖНО. Она видит пустую клетку, но не видит
/// СПОР: три слуховых экрана записаны СРАЗУ В ДВУХ карточках реестра — «Память и
/// слух» и «Языки» называют их своими. Двойной владелец для пробы выглядит как
/// порядок. Такое ловится только чтением карточек рядом, руками.
void main() {
  /// Ждут решения Дениса. ТОЛЬКО В МЕНЬШУЮ СТОРОНУ.
  ///
  /// 23.09.2026 список был 11. Денис закрыл шесть одним ответом:
  ///   «навигатор, развилки, соедини цепочку — это Пространство»
  ///     → navigator, routes-hub, trail-making
  ///   «все где китайские тоны, фонемы, пары — это Языки»
  ///     → chinese-tones, phoneme-pairs, pseudoword-echo (спор с «Памятью и слухом» закрыт)
  ///
  /// Остались пять, у которых нет ни карточки, ни очевидного дома:
  ///   inhibition-hub, risk-hub — развилки торможения и риска
  ///   rmet — «Прочти эмоцию»: заявлено «Памятью и слухом» в канале, в реестре нет
  ///   sdmt — символ→цифра
  ///   set-game — тройки признаков
  const awaitingDenis = {
    'inhibition-hub', 'risk-hub', 'rmet', 'sdmt', 'set-game',
  };

  test('🔴 у каждой строки доски есть владелец, кроме поимённого остатка', () {
    final board = File('../FLUTTER_MIGRATION.md');
    if (!board.existsSync()) {
      markTestSkipped('нет ../FLUTTER_MIGRATION.md — прогон вне общего дерева');
      return;
    }
    final blank = <String>[];
    for (final line in board.readAsLinesSync()) {
      if (!line.trimLeft().startsWith('|')) continue;
      final cells = line.split('|');
      if (cells.length < 4) continue;
      final mark = cells[1].trim();
      if (mark != '☐' && mark != '◐' && mark != '✅') continue;
      final name = RegExp(r'`([a-z0-9-]+)`').firstMatch(cells[2]);
      if (name == null) continue;
      final owner = cells[3].trim();
      final empty = owner.isEmpty || owner == '—' || owner == '?' || owner.startsWith('❓');
      if (empty && !awaitingDenis.contains(name.group(1))) blank.add(name.group(1)!);
    }
    expect(
      blank,
      isEmpty,
      reason: 'Эти экраны на доске переезда без владельца и вне списка ожидания. '
          'Сперва посмотри карточки реестра: `agents_list` называет игры разделов ПОИМЁННО, '
          'и чаще всего владелец там уже есть — его просто не перенесли. '
          'Если в карточках экрана нет, добавь имя в awaitingDenis с причиной.\n'
          '${blank.join(', ')}',
    );
  });

  test('список ожидания не растёт и не протух', () {
    final board = File('../FLUTTER_MIGRATION.md');
    if (!board.existsSync()) {
      markTestSkipped('нет доски');
      return;
    }
    final text = board.readAsStringSync();
    // Имя, которое уже получило владельца, обязано уйти из списка ожидания —
    // иначе список превращается в свалку и перестаёт что-либо значить.
    final stale = <String>[];
    for (final name in awaitingDenis) {
      final row = RegExp('^.*`$name`.*\$', multiLine: true).firstMatch(text);
      if (row == null) continue;
      final cells = row.group(0)!.split('|');
      if (cells.length < 4) continue;
      final owner = cells[3].trim();
      if (owner.isNotEmpty && owner != '—' && !owner.startsWith('❓')) stale.add(name);
    }
    expect(stale, isEmpty,
        reason: 'у этих экранов уже есть владелец — убери их из awaitingDenis: ${stale.join(', ')}');
  });
}
