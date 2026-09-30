import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/demo_lesson.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/lesson.dart';

/// 🔴 ПЛЕЕР РАЗБОРА ПОМЕЩАЕТСЯ НА НИЗКОМ ЭКРАНЕ.
///
/// Замер раздела «Объём памяти» 30.09.2026 на 375×667 (iPhone SE): столбец плеера
/// переполнялся у 4 игр из 6 — Корси на 96 px, «Цифры» на 72, — и кнопка шага
/// уходила за край. Тексты при этом обычные: плеер был рассчитан только на
/// высокий экран, а доска разбора не ужималась по высоте вовсе.
///
/// Меряется худший случай, а не средний: самый длинный текст приёма из ВСЕХ
/// словарей, интерфейс на его языке и высокая доска размером с доску Корси.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  tearDown(LessonUsed.reset);

  var longest = '';
  var lang = 'ru';
  setUpAll(() async {
    for (final f in Directory('assets/l10n').listSync().whereType<File>()) {
      final code = f.uri.pathSegments.last.replaceAll('.json', '');
      if (code.length != 2) continue;   // рядом лежат словари игр, не языки
      final d = jsonDecode(f.readAsStringSync()) as Map<String, dynamic>;
      for (final e in d.entries) {
        if (e.key.startsWith('teach') && e.value is String && (e.value as String).length > longest.length) {
          longest = e.value as String;
          lang = code;
        }
      }
    }
    expect(longest.length, greaterThan(200), reason: 'словари не прочитались — мерить нечего');
    await L.load(lang);
  });

  const sizes = [Size(320, 568), Size(360, 640), Size(375, 667)];

  for (final size in sizes) {
    final name = '${size.width.toInt()}×${size.height.toInt()}';

    testWidgets('$name: самый длинный приём и высокая доска — без переполнения, кнопки на экране',
        (tester) async {
      tester.view.physicalSize = size;
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);

      await tester.pumpWidget(MaterialApp(
        home: Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: TextButton(
                key: const Key('open'),
                onPressed: () => openDemoLesson(context, title: 'Corsi', trials: [
                  DemoTrial(
                    text: '',
                    rule: longest,
                    // Доска Корси в разборе — 280×294: выше, чем широка.
                    art: const SizedBox(width: 280, height: 294, child: ColoredBox(color: Colors.teal)),
                  ),
                ]),
                child: const Text('open'),
              ),
            ),
          ),
        ),
      ));
      await tester.tap(find.byKey(const Key('open')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));   // переход доигран

      expect(tester.takeException(), isNull, reason: '$name: плеер переполнился');
      expect(find.text(longest), findsOneWidget, reason: 'на экране не тот шаг — мерить нечего');

      final next = tester.getRect(find.byKey(const Key('lesson-next')));
      expect(next.bottom, lessThanOrEqualTo(size.height),
          reason: '$name: кнопка следующего шага ушла за край (низ ${next.bottom})');

      final stimulus = tester.getRect(find.byKey(const Key('demo-stimulus')));
      final counter = tester.getRect(find.byKey(const Key('lesson-counter')));
      expect(stimulus.bottom, lessThanOrEqualTo(counter.top),
          reason: '$name: доска разбора залезла на счётчик шага — рисунок не ужат по высоте');

      // Текст длиннее места под ним дочитывается прокруткой, а не обрезается.
      await tester.drag(find.byKey(const Key('lesson-text')), const Offset(0, -600));
      await tester.pump();
      expect(tester.takeException(), isNull, reason: '$name: прокрутка текста сломала вёрстку');
    });
  }
}
