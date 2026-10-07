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

/// 🧾 ДОЛГ КАРКАСА: кнопки шапки игры на окне уже 380 пт — 40×40 вместо 48×48.
///
/// Коммит 4d0a65d47 «Отзыв из игры» (задача e780e5b0, psygames-claude-mac, 07.10.2026) включил шапке
/// `VisualDensity.compact`, чтобы с значком отзыва и питомцем ряд влезал в 320 пт. Плотность сжимает
/// не только вид, но и площадь нажатия: у `ButtonStyleButton` она 48 + поправка плотности = 40.
/// Замер 07.10.2026 на 360×640: пауза, «Разбор», справка, правило уровня — 40×40 у всех семи экранов
/// раздела. Шапка — общий файл каркаса (`lib/shell/game_shell.dart`), решение за его владельцем.
/// Поэтому её кнопки меряются отдельно: ровно 40 — записанный долг; меньше 40 — новый дефект;
/// снова 48 — долг закрыт, и проба потребует снять эту строку (храповик).
const int headerTapDebt = 40; // 0 — долга нет

/// 🔴 ПАРТИЯ: ОРГАНЫ ОТВЕТА НА УЗКОМ ЭКРАНЕ — приёмка 6596a00d (§4б, решение Дениса 16.09):
/// «ряд под полем на узком экране: рамка каждого органа целиком внутри экрана, площадь нажатия
/// не ниже 48×48, подпись не обрезана». [open] строит экран заново и доводит его до ФАЗЫ ОТВЕТА —
/// той, где человек нажимает: клетки, клавиши, кнопки суждения, значки ряда под полем.
///
/// ⚠️ «Подпись не обрезана» эта проба НЕ меряет: в пробах шрифт FlutterTest, у него каждый знак —
/// квадрат шириной в кегль, вдвое шире настоящего. Замер 02.10.2026: «Position» на кнопке n-back —
/// 8 × 14 = 112 пт при 92 свободных, проба кричала «обрезана», а живой шрифт кладёт слово в ~60 пт.
/// Подписи меряются кадром на устройстве.
///
/// Орган — всё, что нажимается сейчас: кнопки (`ButtonStyleButton`, `IconButton`) и `InkWell`
/// клеток и значков. `InkWell` внутри кнопки — часть кнопки, а не второй орган: у кнопки он
/// рисует видимую плашку 40 пт, а нажимается вся рамка 48. Мерится на 360×640, en и ru.
///
/// Кнопки шапки каркаса меряются отдельно, по [headerTapDebt].
Future<void> expectPlayFit(WidgetTester tester, Future<void> Function() open, {required String where}) async {
  tester.view.physicalSize = const Size(360, 640);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);
  final problems = <String>[];
  for (final lang in const ['en', 'ru']) {
    final dict = (jsonDecode(File('assets/l10n/$lang.json').readAsStringSync()) as Map).cast<String, String>();
    L.useForTest(lang, dict);
    // Экран прошлого прохода снимается: без этого Flutter переиспользует его состояние (у экрана без
    // ключа — уже идущую партию), и кнопки «Начать» во втором проходе нет.
    await tester.pumpWidget(const SizedBox());
    await open();
    bool insideButton(Element e) {
      var inside = false;
      e.visitAncestorElements((a) {
        if (a.widget is ButtonStyleButton || a.widget is IconButton) inside = true;
        return !inside;
      });
      return inside;
    }

    bool inHeader(Element e) {
      var inside = false;
      e.visitAncestorElements((a) {
        if (a.widget.runtimeType.toString() == '_Header') inside = true;
        return !inside;
      });
      return inside;
    }

    final organs = find.byWidgetPredicate((w) =>
        (w is ButtonStyleButton && w.onPressed != null) ||
        (w is IconButton && w.onPressed != null) ||
        (w is InkWell && w.onTap != null));
    var count = 0;
    var inScroll = 0;
    var header = 0;
    for (final e in organs.evaluate()) {
      if (e.widget is InkWell && insideButton(e)) continue;
      if (inHeader(e)) {
        // Шапку каркаса меряет долг: `IconButton` и его внутренняя кнопка — один орган.
        if (e.widget is IconButton) {
          final box = e.renderObject! as RenderBox;
          final side = box.size.shortestSide.round();
          header++;
          if (side < 48 && side != headerTapDebt) {
            problems.add('$lang: шапка ${e.widget.key ?? ''} меньше 48×48 — ${box.size.width.round()}×${box.size.height.round()}');
          }
          if (side >= 48 && headerTapDebt != 0) {
            problems.add('$lang: кнопка шапки снова $side×$side — долг каркаса закрыт, сними headerTapDebt');
          }
        }
        continue;
      }
      count++;
      final box = e.renderObject! as RenderBox;
      final r = box.localToGlobal(Offset.zero) & box.size;
      final name = '${e.widget.runtimeType}${e.widget.key == null ? '' : ' ${e.widget.key}'}';
      if (r.left < -0.5 || r.top < -0.5 || r.right > 360.5 || r.bottom > 640.5) {
        // На поле прокрутка законна, если орган до неё достаётся: окно прокрутки целиком на экране
        // (канон §4б, поправка «Парных картинок» 16.09 — «недостижимых карт 0»). Вне прокрутки — дефект.
        final scroll = e.findAncestorStateOfType<ScrollableState>();
        final vp = scroll?.context.findRenderObject() as RenderBox?;
        final view = vp == null ? null : vp.localToGlobal(Offset.zero) & vp.size;
        if (view == null || view.top < -0.5 || view.bottom > 640.5) {
          problems.add('$lang: $name за краем — ${r.left.round()},${r.top.round()}…${r.right.round()},${r.bottom.round()}');
        } else {
          inScroll++;
        }
      }
      if (r.width < 47.5 || r.height < 47.5) problems.add('$lang: $name меньше 48×48 — ${r.width.round()}×${r.height.round()}');
    }
    if (count == 0) problems.add('$lang: в фазе ответа не нашлось ни одного органа');
    // ignore: avoid_print
    print('$where · $lang: органов $count, из них достаются прокруткой $inScroll; кнопок шапки $header');
  }
  L.useForTest('ru', (jsonDecode(File('assets/l10n/ru.json').readAsStringSync()) as Map).cast<String, String>());
  expect('$where: ${problems.isEmpty ? 'органы на месте' : problems.join('; ')}', '$where: органы на месте');
}
