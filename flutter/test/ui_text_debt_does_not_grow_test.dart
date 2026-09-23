import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// ХРАПОВИК НА ЗАШИТЫЙ РУССКИЙ ТЕКСТ: ЧИСЛО МОЖЕТ ТОЛЬКО УМЕНЬШАТЬСЯ.
///
/// 🔴 ЧТО ЛОВИТ. В приложении двенадцать языков. Строка, зашитая прямо в экран,
/// знает ровно один: немец, японец, кореец увидят русскую подпись посреди
/// переведённого экрана. Веб-сторона прошла это в августе — гейт
/// `frontend/src/__tests__/ci-i18n-hardcode-guard.test.ts` погасил долг из 14
/// экранов и 106 мест и с тех пор держит ноль. Перенос на Flutter начал заново:
/// замер 23.09.2026 нашёл 789 таких строк на пяти ветках.
///
/// 🔴 ПОЧЕМУ ХРАПОВИК, А НЕ СТЕНА. Ноль сегодня недостижим: 28 экранов уже
/// перенесены, и требование «переведи всё сейчас» остановило бы переезд. Поэтому
/// долг записан пофайлово и может только УМЕНЬШАТЬСЯ, а новый файл обязан
/// приходить с нулём. Так переезд идёт дальше, а долг не растёт.
///
/// ⚠️ И ЭТО НЕ СТЕНА БЕЗ ДВЕРИ. Прежде чем требовать, сделана дорога: словарь
/// берётся у веб-стороны (`flutter/tools/embed-l10n.mjs` вырезает нужные ключи
/// в `assets/l10n/<язык>.json`), читается через `L.t('ключ')`
/// (`lib/shell/l10n.dart`), и один экран переведён целиком как образец —
/// `lib/games/digit_span/screen.dart`, 19 строк → 0.
///
/// ⚠️ ЧТО СЧИТАЕТСЯ. Русский литерал вне комментариев и вне `Key('…')`. Ключи
/// виджетов считаются отдельно и сюда не входят — это другая беда (кириллица в
/// именах, отдельная задача), а не перевод. Метод счёта здесь ровно тот же, что
/// в замере, которым получены числа ниже: сменишь метод — сдвинутся и числа.
void main() {
  /// 🔴 ПРИЁМКА ЧУЖОЙ ВЕТКИ — РОВНО ОДИН РАЗ И ТОЛЬКО ПРИ ВЛИВАНИИ.
  ///
  /// Правило «подписи из словаря» появилось 23.09.2026, когда четыре раздела уже
  /// написали свои экраны. Отбивать их работу правилом, которого в момент работы
  /// не было, нечестно: гейт не имеет права ломать сделанное. Поэтому при вливании
  /// ветки раздела её числа заносятся сюда КАК ЕСТЬ, одной записью, с датой.
  ///
  /// ⚠️ И это единственный случай, когда число здесь растёт. Любая следующая правка
  /// того же файла обязана его УМЕНЬШАТЬ. Поднял число не на вливании — значит
  /// обошёл гейт, а не починил код.
  ///
  /// Принято: 23.09 — ядро, внимание, слова (160); 23.09 — судоку и головоломки (+124);
  /// 23.09 — «Жми и держись» (+19), в тот же день раздел перевёл его сам (−19).
  ///
  /// Долг на 23.09.2026, пофайлово. МЕНЯТЬ ТОЛЬКО В МЕНЬШУЮ СТОРОНУ.
  ///
  /// Перевёл экран — опусти его число. Файла нет в списке — значит он обязан
  /// быть чистым: так новый перенос не добавляет долга молча.
  const debt = <String, int>{
    'games/puzzles/ladder.dart': 40,
    'games/sudoku/screen.dart': 31,
    'games/stroop/screen.dart': 22,
    'games/flanker/screen.dart': 22,
    'games/simon/screen.dart': 21,
    'main.dart': 16,
    'games/samurai/screen.dart': 14,
    'games/fractal/screen.dart': 13,
    'games/deep/screen.dart': 13,
    'games/anagrams/screen.dart': 13,
    'games/memory_matrix/screen.dart': 12,
    'games/puzzles/screen.dart': 11,
    'games/one_line/screen.dart': 10,
    'games/dots_connect/screen.dart': 10,
    'games/anagrams/all_words_screen.dart': 9,
    'games/stroop/model.dart': 8,
    'shell/tap_latency.dart': 5,
    'shell/game_shell.dart': 4,
    'shell/web_game_screen.dart': 4,
    'shell/hybrid_app.dart': 3,
    'games/deep/tree.dart': 2,
    'shell/asset_server.dart': 1,
  };

  const total = 284;

  final counts = _scan(Directory('lib'));

  test('🔴 ни в одном файле зашитого текста не стало больше', () {
    final worse = <String>[];
    counts.forEach((path, n) {
      final ceiling = debt[path] ?? 0;
      if (n > ceiling) worse.add('  · $path: было $ceiling, стало $n');
    });
    expect(
      worse,
      isEmpty,
      reason: 'Зашитого русского текста прибавилось. Так экран говорит на одном языке из '
          'двенадцати. Перенеси строки в словарь: ключ завести в '
          'frontend/src/contexts/LanguageContext.tsx, звать через L.t(\'ключ\'), затем '
          'node flutter/tools/embed-l10n.mjs. Образец целиком переведённого экрана — '
          'lib/games/digit_span/screen.dart.\n${worse.join('\n')}',
    );
  });

  test('долг в сумме не вырос', () {
    final now = counts.values.fold<int>(0, (a, b) => a + b);
    expect(now, lessThanOrEqualTo(total),
        reason: 'сумма зашитых строк выросла с $total до $now');
  });

  test('число в пробе не устарело — если долг погашен, опусти его', () {
    // Тот же приём, что у веб-гейта: расхождение больше 20 значит, что константа
    // отстала от жизни и её пора двигать, иначе храповик перестаёт храповиком быть.
    final now = counts.values.fold<int>(0, (a, b) => a + b);
    expect(total - now, lessThanOrEqualTo(20),
        reason: 'долг $now, в пробе $total — опусти число в пробе');
  });
}

/// Считает ровно так же, как замер, давший числа выше: комментарии вырезаются
/// ДО поиска, ключи виджетов не в счёт.
Map<String, int> _scan(Directory root) {
  final out = <String, int>{};
  final lineComment = RegExp(r'//.*');
  final blockComment = RegExp(r'/\*.*?\*/', dotAll: true);
  final keyLiteral = RegExp(r"Key\(\s*'[^'\n]*[А-Яа-яЁё][^'\n]*'\s*\)");
  final anyLiteral = RegExp(r"'[^'\n]*[А-Яа-яЁё][^'\n]*'");
  for (final f in root.listSync(recursive: true).whereType<File>()) {
    if (!f.path.endsWith('.dart')) continue;
    var src = f.readAsStringSync().replaceAll(blockComment, '').replaceAll(lineComment, '');
    final n = anyLiteral.allMatches(src).length - keyLiteral.allMatches(src).length;
    if (n > 0) out[f.path.replaceFirst('lib/', '')] = n;
  }
  return out;
}
