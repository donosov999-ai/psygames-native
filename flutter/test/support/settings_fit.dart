import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/l10n.dart';

/// 🔴 ЭКРАН НАСТРОЙКИ ВЛЕЗАЕТ В ОКНО: «Начать» на первом экране, ничего нажимаемого за краем,
/// переполнений нет, прокрутки настроек не больше 0,1 окна. Задача ae1d918b: замер 17.09.2026 на веб-экранах раздела «Объём памяти» —
/// «Начать» уезжала ниже экрана у пяти игр (до 1,8 экрана у «Цифрового ряда»).
///
/// Мерится на 360×640 — самом тесном окне, которое приложение поддерживает, — и на ДВУХ языках:
/// английский основной (решение Дениса 01.10), и подписи у него бывают длиннее русских.
/// [open] обязан заново построить экран и довести его до экрана настройки — словарь меняется
/// между заходами. По-английски дополнительно — ни одной русской буквы на экране.
/// После пробы словарь возвращается русским, как его грузят пробы файла.
Future<void> expectSettingsFit(WidgetTester tester, Future<void> Function() open, {required String where}) async {
  tester.view.physicalSize = const Size(360, 640);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);
  final problems = <String>[];
  for (final lang in const ['en', 'ru']) {
    final dict = (jsonDecode(File('assets/l10n/$lang.json').readAsStringSync()) as Map).cast<String, String>();
    L.useForTest(lang, dict);
    await open();
    final start = find.text(L.t('start'));
    if (start.evaluate().isEmpty) {
      problems.add('$lang: «${L.t('start')}» не найдена');
      continue;
    }
    final s = tester.getRect(start.first);
    if (s.bottom > 640) problems.add('$lang: «Начать» ниже экрана — низ ${s.bottom.round()} при высоте 640');
    final pressable = find.byWidgetPredicate(
      (w) => w is ButtonStyleButton || w is ChoiceChip || w is SegmentedButton || w is CheckboxListTile || w is DropdownButton,
    );
    for (final e in pressable.evaluate()) {
      final r = tester.getRect(find.byWidget(e.widget).first);
      if (r.left < 0 || r.right > 360) problems.add('$lang: ${e.widget.runtimeType} за краем — $r');
    }
    // Приёмка 17.09: все группы выбора на первом экране — настройки прокручиваются не больше
    // чем на 0,1 окна (страница ≤ 1,1 экрана). Замер 02.10.2026 на 360×640: у семи экранов
    // раздела самое длинное — 48 пт прокрутки у «Цифрового ряда» по-английски (1,07 экрана).
    for (final e in find.byType(Scrollable).evaluate()) {
      final pos = ((e as StatefulElement).state as ScrollableState).position;
      if (pos.maxScrollExtent > 64) {
        problems.add('$lang: настройки длиннее 1,1 экрана — прокрутка ${pos.maxScrollExtent.round()} пт');
      }
    }
    // Английский — основной язык (решение Дениса 01.10): ни одной русской буквы на экране.
    if (lang == 'en') {
      for (final e in find.byType(Text).evaluate()) {
        final t = (e.widget as Text).data ?? (e.widget as Text).textSpan?.toPlainText() ?? '';
        if (RegExp('[А-Яа-яЁё]').hasMatch(t)) problems.add('en: кириллица в «$t»');
      }
    }
  }
  L.useForTest('ru', (jsonDecode(File('assets/l10n/ru.json').readAsStringSync()) as Map).cast<String, String>());
  expect('$where: ${problems.isEmpty ? 'влезает' : problems.join('; ')}', '$where: влезает');
}
