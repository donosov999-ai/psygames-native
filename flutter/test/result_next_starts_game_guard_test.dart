// 🔴 Сторож (Денис 12.11.2026): «после прохождения уровня вместо того чтобы начаться
// следующий — выкидывает в настройки». Кнопка «Дальше» / «Ещё раз» на итоге партии
// обязана сразу запускать игру, а не возвращать на экран настроек. Настройки — отдельной
// кнопкой. Было у 5 игр (semantic_sort, cloze, phonemic_fluency, story_recall, vocab_srs).
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('кнопка «Дальше»/«Ещё раз» на итоге не уводит в настройки', () {
    final offenders = <String>[];
    final button = RegExp(
      r"onPressed:\s*([^,]{0,120}?),\s*(?:style:[^\n]*\n\s*)?child:\s*Text\(([^)]*(?:nextLabel|nextNow|retry)[^)]*)\)",
    );
    final again = RegExp(
      r"onAgain:\s*\(\)\s*=>\s*setState\(\(\)\s*=>\s*_phase\s*=\s*\w+Phase\.(config|setup|settings)",
    );
    final toConfig = RegExp(r'Phase\.(config|setup|settings)');
    for (final f in Directory('lib/games').listSync(recursive: true).whereType<File>()) {
      if (!f.path.endsWith('.dart')) continue;
      final s = f.readAsStringSync();
      for (final m in button.allMatches(s)) {
        if (toConfig.hasMatch(m.group(1)!)) offenders.add('${f.path}: ${m.group(1)!.trim()}');
      }
      for (final m in again.allMatches(s)) {
        offenders.add('${f.path}: onAgain → ${m.group(1)}');
      }
    }
    expect(offenders, isEmpty,
        reason: '«Дальше»/«Ещё раз» должны запускать партию (_start), настройки — отдельной кнопкой');
  });
}
