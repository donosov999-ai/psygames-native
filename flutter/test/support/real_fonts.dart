import 'dart:io';

import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

/// 🔴 ЖИВОЙ ШРИФТ ANDROID В ПРОБЕ — Roboto из артефактов Flutter SDK (`material_fonts`).
///
/// Шрифт проб по умолчанию (FlutterTest) рисует каждый знак квадратом шириной в кегль — вдвое шире
/// настоящего, и «влезает ли подпись» он не меряет (урок 02.10.2026). Своего шрифта у приложения
/// нет: на Android текст рисуется системным Roboto. Загрузив Roboto под тем же именем, проба
/// раскладывает текст живыми метриками — как на телефоне.
///
/// Замер 07.10.2026, кадры 2.56.15 на эмуляторе 360×760 пт: подсказка двойного n-back обрезана на
/// en / ru / es («…You can tap bo…»), подпись «Бессмыслица» разорвана по буквам («Бессмыслиц|а»).
/// Пробы со шрифтом FlutterTest этого не видели.
///
/// ⚠️ Roboto покрывает латиницу и кириллицу. У ja / ko / zh / ar / hi знаков в нём нет — для них
/// проба мерила бы запасной шрифт, поэтому [robotoLanguages] их не включает.
const robotoLanguages = ['en', 'ru', 'de', 'es', 'fr', 'it', 'pt'];

Future<void> loadRoboto() async {
  final root = Platform.environment['FLUTTER_ROOT'];
  expect(root, isNotNull, reason: 'FLUTTER_ROOT задаёт flutter test — без него не найти шрифты SDK');
  final dir = Directory('$root/bin/cache/artifacts/material_fonts');
  final loader = FontLoader('Roboto');
  for (final name in const ['Roboto-Regular.ttf', 'Roboto-Medium.ttf', 'Roboto-Bold.ttf', 'Roboto-Black.ttf']) {
    final file = File('${dir.path}/$name');
    expect(file.existsSync(), isTrue, reason: 'нет ${file.path} — артефакт material_fonts не скачан');
    loader.addFont(Future.value(ByteData.sublistView(Uint8List.fromList(file.readAsBytesSync()))));
  }
  await loader.load();
}

/// Слова [text], разорванные переносом посреди слова (часть на одной строке, часть на другой).
List<String> wordsSplitAcrossLines(RenderParagraph paragraph, String text) {
  final split = <String>[];
  for (final m in RegExp(r'\S+').allMatches(text)) {
    final boxes = paragraph.getBoxesForSelection(TextSelection(baseOffset: m.start, extentOffset: m.end));
    final tops = {for (final b in boxes) b.top.round()};
    if (tops.length > 1) split.add(m.group(0)!);
  }
  return split;
}
