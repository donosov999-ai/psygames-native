import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/languages/lang_picker.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/game_rules.dart';
import 'package:psygames_flutter/shell/hybrid_app.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/lesson.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 ПРИЁМКА РАЗДЕЛА «ЯЗЫКИ» (решение Дениса 16.09.2026, задача 09868924): игра едет в
/// выпуск, только если у неё своя справка, органы управления на месте, а ряд под полем
/// целиком в экране и нажимается пальцем.
///
/// Меряется на нативных экранах — с 30.09 все игры раздела во Flutter, и в выпуск едут
/// именно они. Экран 390×844 pt (самый узкий из ходовых iPhone), язык — испанский:
/// по замеру 17.09 подписи раздела на нём длиннее русских на 15 %.
///
/// ⚠️ Игры — поимённо, а не «всё, что перехвачено»: приёмка — про раздел, и выпавшая
/// из перехвата игра должна краснеть здесь, а не пропадать из замера молча.
const _games = <String, String>{
  '/games/vocab-srs': 'vocab-start',
  '/games/semantic-sort': 'semantic-start',
  '/games/cloze': 'cloze-start',
  '/games/lexical-decision': 'ld-start',
  '/games/story-recall': 'story-start',
  '/games/phonemic-fluency': 'pf-start',
  '/games/pseudoword-echo': 'echo-start',
  '/games/phoneme-pairs': 'ph-start',
  '/games/chinese-tones': 'ct-start',
  '/games/dictation': 'dict-start',
  '/games/rhythm-pitch': 'rp-start',
};

/// Где человек выбирает изучаемый язык — там строка обязана быть выпадающей.
const _choosesLanguage = {
  '/games/vocab-srs', '/games/semantic-sort', '/games/cloze', '/games/lexical-decision',
  '/games/phonemic-fluency', '/games/pseudoword-echo', '/games/phoneme-pairs', '/games/dictation',
};

const _locales = ['ru', 'en', 'es', 'de', 'zh', 'hi', 'pt', 'fr', 'it', 'ja', 'ko', 'ar'];
const _w = 390.0, _h = 844.0;

/// Всё, по чему бьют пальцем: кнопки Material, значки, фишки выбора.
Finder _tappables() => find.byWidgetPredicate(
  (w) =>
      (w is ButtonStyleButton && w.onPressed != null) ||
      (w is IconButton && w.onPressed != null) ||
      (w is ChoiceChip && w.onSelected != null),
);

/// Замер одного кадра: мелкие органы, органы за краем, обрезанные подписи.
List<String> _measure(WidgetTester tester, String at) {
  final bad = <String>[];
  for (final e in _tappables().evaluate()) {
    final box = e.renderObject as RenderBox?;
    if (box == null || !box.hasSize || !box.attached) continue;
    final r = box.localToGlobal(Offset.zero) & box.size;
    // Невидимое (за прокруткой) не судим по краю — только по размеру.
    final label = e.widget.runtimeType.toString();
    if (box.size.width < 47.5 || box.size.height < 47.5) {
      bad.add('$at: $label ${box.size.width.toStringAsFixed(0)}×${box.size.height.toStringAsFixed(0)} < 48');
    }
    final visible = r.bottom > 0 && r.top < _h;
    if (visible && (r.left < -0.5 || r.right > _w + 0.5)) {
      bad.add('$at: $label за краем по ширине (${r.left.toStringAsFixed(0)}…${r.right.toStringAsFixed(0)})');
    }
  }
  // Поле и ряд под ним — всё, что ниже верхнего края поля. Шапка — каркас всех игр,
  // её обрезанный заголовок считается отдельно ([_headerCut]) и идёт владельцу каркаса.
  final fieldTop = tester.getTopLeft(find.byKey(const Key('game-field'))).dy;
  void walk(RenderObject o) {
    if (o is RenderParagraph && o.didExceedMaxLines && o.attached && o.hasSize) {
      final top = o.localToGlobal(Offset.zero).dy;
      final text = o.text.toPlainText().replaceAll('\n', ' ');
      if (top >= fieldTop - 0.5) {
        bad.add('$at: подпись обрезана «$text»');
      } else {
        _headerCut.add('$at «$text»');
      }
    }
    o.visitChildren(walk);
  }

  walk(tester.binding.rootElement!.renderObject!);
  return bad;
}

final _headerCut = <String>{};

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async => GameRules.load());
  tearDown(() {
    GamePreset.clear();
    LessonUsed.reset();
  });

  test('🔴 справка у каждой игры своя и непустая на всех 12 языках', () {
    final dicts = {
      for (final l in _locales)
        l: jsonDecode(File('${Directory.current.path}/assets/l10n/$l.json').readAsStringSync()) as Map<String, dynamic>,
    };
    final keys = <String, String>{};
    final bad = <String>[];
    for (final route in _games.keys) {
      expect(HybridApp.native.containsKey(route), isTrue, reason: '$route выпал из перехвата');
      final key = GameRules.keyFor(route);
      if (key == null) {
        bad.add('$route: ключа правила нет');
        continue;
      }
      if (keys.containsKey(key)) bad.add('$route: правило «$key» общее с ${keys[key]}');
      keys[key] = route;
      for (final l in _locales) {
        final t = dicts[l]![key];
        if (t is! String || t.trim().isEmpty) bad.add('$route: на $l под «$key» пусто');
      }
    }
    expect(bad, isEmpty);
  });

  testWidgets('🔴 390 pt, испанский: органы ≥ 48, в экране, подписи целиком — на настройке и в партии', (tester) async {
    SharedPreferences.setMockInitialValues({'language': 'es', 'psygames_active_profile': 'nzt48'});
    final state = await SharedState.open();
    await L.load('es');
    tester.view.physicalSize = const Size(_w * 3, _h * 3);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);

    // Проба про раскладку, не про звук: каналы плееров отвечают пусто, как на машине без
    // звука. Без этого `just_audio` роняет пробу на `disposeAllPlayers` — плагина в
    // пробах нет, а в приложении он есть.
    final messenger = TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
    const answers = <String, Object>{'com.ryanheise.just_audio.methods': <String, Object>{}, 'flutter_tts': 1};
    for (final ch in answers.keys) {
      messenger.setMockMethodCallHandler(MethodChannel(ch), (_) async => answers[ch]);
      addTearDown(() => messenger.setMockMethodCallHandler(MethodChannel(ch), null));
    }
    final bad = <String>[];
    final started = <String>[];
    for (final MapEntry(key: route, value: start) in _games.entries) {
      GameRules.currentRoute = route;
      await tester.runAsync(() async {
        await tester.pumpWidget(MaterialApp(home: HybridApp.native[route]!(state)));
        for (var i = 0; i < 30; i++) {
          await tester.pump(const Duration(milliseconds: 30));
          await Future<void>.delayed(const Duration(milliseconds: 10));
          if (find.byKey(Key(start)).evaluate().isNotEmpty) break;
        }
      });
      final e1 = tester.takeException();
      if (e1 != null) bad.add('$route настройка: ${'$e1'.split('\n').first}');
      // Язык — одной выпадающей строкой (задача a0ae517f), а не сеткой фишек.
      final chips = find.byWidgetPredicate((w) => w is ChoiceChip && '${w.key}'.contains('-lang-'));
      if (chips.evaluate().isNotEmpty) bad.add('$route: язык выбирается сеткой из ${chips.evaluate().length} фишек');
      if (_choosesLanguage.contains(route) && find.byType(LangDropdown).evaluate().isEmpty) {
        bad.add('$route: нет выпадающего выбора языка');
      }
      bad.addAll(_measure(tester, '$route настройка'));

      final btn = find.byKey(Key(start));
      if (btn.evaluate().isNotEmpty) {
        await tester.ensureVisible(btn);
        await tester.tap(btn, warnIfMissed: false);
        await tester.runAsync(() async {
          for (var i = 0; i < 20; i++) {
            await tester.pump(const Duration(milliseconds: 50));
            await Future<void>.delayed(const Duration(milliseconds: 5));
          }
        });
        final e2 = tester.takeException();
        if (e2 != null) bad.add('$route партия: ${'$e2'.split('\n').first}');
        bad.addAll(_measure(tester, '$route партия'));
        started.add(route);
      } else {
        bad.add('$route: кнопки «$start» нет на экране настройки');
      }
      await tester.pumpWidget(const SizedBox());
      await tester.pump();
      GameRules.currentRoute = null;
    }
    // ignore: avoid_print — итог приёмки нужен числом в задаче
    print('ПРИЁМКА: партия начата в ${started.length} из ${_games.length}; замечаний ${bad.length}');
    // ignore: avoid_print — шапка общая для всех игр: число идёт владельцу каркаса
    print('ШАПКА (каркас, не раздел): заголовок обрезан в ${_headerCut.length} кадрах: ${_headerCut.join(' | ')}');
    expect(bad, isEmpty, reason: bad.join('\n'));
  });
}
