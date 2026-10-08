import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/asset_server.dart';
import 'package:psygames_flutter/shell/feedback_screen.dart';
import 'package:psygames_flutter/shell/ion_icon.dart';
import 'package:psygames_flutter/shell/screen_ui.dart';

/// 🔴 ФОРМА ОТЗЫВА НА FLUTTER РИСУЕТ МОДЕЛЬ ВЕБА (задача c092cd47).
///
/// Образец выгружает веб-проба `feedback-host-model.test.tsx` с настоящего виджета (отправка подменена).
///   Лист: заголовок, вкладки, строка контекста, виды (выбранный — красный), поле с черновиком веба,
///   голос, снимок, «Отправить» — ПОД прокруткой, не внутри неё (всегда над клавиатурой, e780e5b0).
///   Нажатия — действия веба; «Дописать» в развилке ставит курсор в поле, вебу не шлётся ничего.
///   Отказ отправки — окно с «ОК» (у веба `alert`), «ОК» снимает ошибку.
///   Снимок нативного экрана — кадр корня в PNG, отдаётся странице раздающим сервером.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final js = <String>[];
  Map<String, Object?> load() => (jsonDecode(File('test/fixtures/feedback_model.json').readAsStringSync()) as Map).cast<String, Object?>();
  const route = FeedbackHost.route;

  setUp(() {
    ScreenUi.reset();
    js.clear();
    ScreenUi.run = (s) async => js.add(s);
  });

  Future<void> mount(WidgetTester t, Map<String, Object?>? m, {Size size = const Size(390, 844)}) async {
    t.view.physicalSize = size * 2;
    t.view.devicePixelRatio = 2;
    addTearDown(t.view.reset);
    ScreenUi.model(route).value = m;
    await t.pumpWidget(const MaterialApp(home: FeedbackScreen()));
    await t.pump();
  }

  Finder key(String k) => find.byKey(ValueKey(k));
  Map<String, Object?> part(Map<String, Object?> m, String k) => (m[k]! as Map).cast<String, Object?>();
  List<Map<String, Object?>> list(Object? v) => [for (final x in (v as List? ?? const [])) (x as Map).cast<String, Object?>()];
  Map<String, Object?> withForm(Map<String, Object?> m, Map<String, Object?> patch) => {
    ...m,
    'form': {...part(m, 'form'), ...patch},
  };

  testWidgets('без модели или окно закрыто — ожидание', (t) async {
    await mount(t, null);
    expect(key('feedback-screen-loading'), findsOneWidget);
    ScreenUi.model(route).value = {...load(), 'open': false};
    await t.pump();
    expect(key('feedback-screen-loading'), findsOneWidget);
  });

  testWidgets('🔴 лист: заголовок, вкладки, контекст, виды, черновик веба в поле, снимок; «Отправить» — под прокруткой', (t) async {
    final m = load();
    await mount(t, m);
    final form = part(m, 'form');
    expect(find.text(m['title'] as String), findsOneWidget);
    for (final tab in list(m['tabs'])) {
      expect(find.descendant(of: key('feedback-tab-${tab['id']}'), matching: find.text(tab['label'] as String)), findsOneWidget);
    }
    expect(find.text(form['ctx'] as String), findsOneWidget);
    expect(find.text(form['hint'] as String), findsOneWidget);
    for (final k in list(form['kinds'])) {
      final box = t.widget<Container>(find.descendant(of: key('feedback-kind-${k['key']}'), matching: find.byType(Container)).first);
      expect((box.decoration! as BoxDecoration).color == const Color(0xFFEF4444), k['on'] == true, reason: '${k['key']}');
      expect(find.descendant(of: key('feedback-kind-${k['key']}'), matching: find.text(k['label'] as String)), findsOneWidget);
    }
    final field = t.widget<TextField>(key('feedback-text'));
    expect(field.controller!.text, form['text'], reason: 'черновик веба — в поле');
    expect(find.text(part(form, 'shot')['label'] as String), findsOneWidget);
    expect(find.text(part(part(form, 'voice'), 'button')['label'] as String), findsOneWidget);
    // «Отправить» закреплена под прокруткой: не потомок прокручиваемого содержимого.
    expect(find.descendant(of: key('feedback-scroll'), matching: key('feedback-send')), findsNothing);
    expect(find.descendant(of: key('feedback-footer'), matching: find.text(part(m, 'footer')['label'] as String)), findsOneWidget);
  });

  testWidgets('🔴 «Отправить» видна при открытой клавиатуре на 360×640', (t) async {
    await mount(t, load(), size: const Size(360, 640));
    t.view.viewInsets = const FakeViewPadding(bottom: 300 * 2);
    addTearDown(t.view.resetViewInsets);
    await t.pump();
    final send = t.getRect(key('feedback-send'));
    expect(send.bottom, lessThanOrEqualTo(640 - 300), reason: 'над клавиатурой');
    expect(send.top, greaterThan(0));
  });

  testWidgets('🔴 нажатия — действия веба: вид, правка с номером, снимок, голос, вкладка, отправка, закрыть', (t) async {
    final m = load();
    final seq = part(m, 'form')['textSeq']! as int;
    await mount(t, m);
    await t.tap(key('feedback-kind-idea'));
    await t.enterText(key('feedback-text'), 'Новый текст');
    await t.tap(key('feedback-shot'));
    await t.tap(key('feedback-record'));
    await t.tap(key('feedback-tab-dialog'));
    await t.tap(key('feedback-send'));
    await t.tap(key('feedback-close'));
    expect(js, [
      contains('["#feedback"].kind("idea")'),
      contains('["#feedback"].text("Новый текст",${seq + 1})'), // номер правки — от черновика веба
      contains('["#feedback"].attach()'),
      contains('["#feedback"].record()'),
      contains('["#feedback"].tab("dialog")'),
      contains('["#feedback"].send()'),
      contains('["#feedback"].close()'),
    ]);
  });

  testWidgets('🔴 старая модель не затирает набранное; ответ на свою правку — встаёт (после отправки поле пустое)', (t) async {
    final m = load();
    final seq = part(m, 'form')['textSeq']! as int;
    await mount(t, m);
    await t.enterText(key('feedback-text'), 'ab');
    ScreenUi.model(route).value = withForm(m, {'text': 'a', 'textSeq': seq});
    await t.pump();
    expect(t.widget<TextField>(key('feedback-text')).controller!.text, 'ab', reason: 'ответ на старую правку');
    ScreenUi.model(route).value = withForm(m, {'text': '', 'textSeq': seq + 1});
    await t.pump();
    expect(t.widget<TextField>(key('feedback-text')).controller!.text, '', reason: 'веб стёр после отправки');
  });

  testWidgets('нельзя отправить — «Отправить» серая и молчит; идёт отправка — круг и тоже молчит', (t) async {
    final m = load();
    await mount(t, {
      ...m,
      'footer': {...part(m, 'footer'), 'enabled': false},
    });
    await t.tap(key('feedback-send'));
    expect(js, isEmpty);
    ScreenUi.model(route).value = {
      ...m,
      'footer': {...part(m, 'footer'), 'sending': true},
    };
    await t.pump();
    await t.tap(key('feedback-send'));
    expect(js, isEmpty);
    expect(find.descendant(of: key('feedback-send'), matching: find.byType(CircularProgressIndicator)), findsOneWidget);
  });

  testWidgets('🔴 развилки: «Дописать» — курсор в поле, вебу ничего; «Написать текстом» и «всё равно» — действия', (t) async {
    final m = load();
    await mount(t, {
      ...m,
      'footer': {
        'mode': 'choice',
        'title': '⚠️ Коротко',
        'body': 'Похоже на обрывок',
        'keep': {'label': 'Дописать', 'action': 'focus'},
        'go': {'label': 'Всё равно', 'action': 'sendShort'},
        'sending': false,
      },
    });
    FocusManager.instance.primaryFocus?.unfocus();
    await t.pump();
    await t.tap(key('feedback-keep'));
    await t.pump();
    expect(js, isEmpty);
    expect(t.widget<TextField>(key('feedback-text')).focusNode!.hasFocus, isTrue);
    await t.tap(key('feedback-go'));
    expect(js.single, contains('["#feedback"].sendShort()'));
    js.clear();
    ScreenUi.model(route).value = {
      ...m,
      'footer': {
        'mode': 'choice',
        'title': '⚠️ Не слышно',
        'body': 'Запись немая',
        'keep': {'label': 'Написать текстом', 'action': 'drop'},
        'go': {'label': 'Всё равно', 'action': 'sendSilent'},
        'sending': false,
      },
    };
    await t.pump();
    await t.tap(key('feedback-keep'));
    await t.tap(key('feedback-go'));
    expect(js, [contains('["#feedback"].drop()'), contains('["#feedback"].sendSilent()')]);
  });

  testWidgets('🔴 голос: идёт запись — красная рамка, полоска уровня долей ширины; заметка — прослушать и убрать', (t) async {
    final m = load();
    final voice = part(part(m, 'form'), 'voice');
    await mount(
      t,
      withForm(m, {
        'voice': {
          ...voice,
          'button': {
            'label': 'Стоп · 0:04',
            'a11y': 'Стоп',
            'icon': 'stop-circle',
            'iconColor': '#ef4444',
            'border': '#ef4444',
            'drop': false,
          },
          'level': {'frac': 0.42, 'color': '#22c55e', 'a11y': 'Уровень'},
          'levelText': {'text': 'Слышим вас', 'color': '#22c55e'},
        },
      }),
    );
    expect(t.widget<IonIcon>(find.descendant(of: key('feedback-record'), matching: find.byType(IonIcon)).first).name, 'stop-circle');
    final track = t.getRect(key('feedback-level'));
    final fill = t.getRect(find.descendant(of: key('feedback-level'), matching: find.byType(DecoratedBox)).last);
    expect(fill.width / track.width, closeTo(0.42, 0.02));
    expect(find.text('Слышим вас'), findsOneWidget);
    ScreenUi.model(route).value = withForm(m, {
      'voice': {
        ...voice,
        'button': {
          'label': 'Запись · 4 с',
          'a11y': 'Запись',
          'icon': 'checkmark-circle',
          'iconColor': '#22c55e',
          'border': null,
          'drop': true,
        },
        'play': {'label': 'Прослушать', 'playing': false},
        'check': 'Прослушайте перед отправкой',
      },
    });
    await t.pump();
    await t.tap(key('feedback-play'));
    await t.tap(key('feedback-drop'));
    expect(js, [contains('["#feedback"].play()'), contains('["#feedback"].drop()')]);
    expect(find.text('Прослушайте перед отправкой'), findsOneWidget);
  });

  testWidgets('«спасибо» с судьбой записи; диалог — мои справа цветом темы, ответ-починка со значком', (t) async {
    final m = load();
    await mount(t, {
      ...m,
      'form': null,
      'footer': null,
      'thanks': {'icon': '⚠️', 'title': 'Спасибо!', 'audioSent': null, 'audioLost': 'Запись не загрузилась — дошёл только текст'},
    });
    expect(key('feedback-thanks'), findsOneWidget);
    expect(find.text('Запись не загрузилась — дошёл только текст'), findsOneWidget);
    expect(key('feedback-footer'), findsNothing);
    ScreenUi.model(route).value = {
      ...m,
      'tab': 'dialog',
      'form': null,
      'footer': null,
      'dialog': {
        'loading': false,
        'empty': null,
        'write': 'Написать',
        'bubbles': [
          {'key': 'a', 'me': true, 'fixed': null, 'text': 'Не понял правила', 'at': '2026-10-06 12:30'},
          {'key': 'b', 'me': false, 'fixed': '✅ Исправлено в 2.56.15', 'text': 'Починили', 'at': '2026-10-07 09:05'},
        ],
      },
    };
    await t.pump();
    final mine = t.widget<Container>(key('feedback-bubble-a'));
    expect((mine.decoration! as BoxDecoration).color, cssColor(m['primary']));
    expect(t.getRect(key('feedback-bubble-a')).center.dx, greaterThan(t.getRect(key('feedback-bubble-b')).center.dx));
    expect(find.text('✅ Исправлено в 2.56.15'), findsOneWidget);
    await t.tap(key('feedback-dialog-write'));
    expect(js.single, contains('["#feedback"].tab("form")'));
  });

  testWidgets('🔴 отказ отправки — окно с текстом; «ОК» снимает ошибку, текст в поле остаётся', (t) async {
    final m = load();
    await mount(t, m);
    ScreenUi.model(route).value = {...m, 'error': 'Не удалось отправить'};
    await t.pump();
    await t.pump();
    expect(key('feedback-error'), findsOneWidget);
    expect(find.text('Не удалось отправить'), findsOneWidget);
    await t.tap(find.text('OK'));
    await t.pumpAndSettle();
    expect(js.single, contains('["#feedback"].clearError()'));
    expect(t.widget<TextField>(key('feedback-text')).controller!.text, part(m, 'form')['text']);
  });

  testWidgets('🔴 снимок: кадр корня в PNG; сервер отдаёт последний, прежний — уже нет', (t) async {
    await t.pumpWidget(
      MaterialApp(
        builder: (context, child) => RepaintBoundary(key: FeedbackHost.shotKey, child: child),
        home: const ColoredBox(color: Color(0xFF00AA00)),
      ),
    );
    final png = await t.runAsync(FeedbackHost.snap);
    expect(png, isNotNull);
    expect(png!.sublist(0, 4), [0x89, 0x50, 0x4E, 0x47]);
    await t.runAsync(() async {
      HttpOverrides.global = null; // настоящий запрос к своему серверу, как у страницы
      final server = await AssetServer.start();
      try {
        final first = server.putShot(png);
        final second = server.putShot(Uint8List.fromList(png));
        final client = HttpClient();
        Future<(int, String?)> get(String path) async {
          final res = await (await client.getUrl(Uri.parse('${server.origin}$path'))).close();
          final ct = res.headers.contentType?.mimeType;
          await res.drain<void>();
          return (res.statusCode, ct);
        }

        expect(await get(second), (200, 'image/png'));
        expect((await get(first)).$1, 404, reason: 'хранится один, последний');
        client.close(force: true);
      } finally {
        await server.stop();
      }
    });
  });
}
