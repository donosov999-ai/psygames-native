/// «ПАРЫ СЛОВ» В ПРИЛОЖЕНИИ: РЕЖИМ «ПЕРЕВОД» ДОСТИЖИМ, ШАГ ЗАРЯДКИ ЧИТАЕТСЯ.
///
/// 🔴 До 30.09.2026 режим приходил только параметром конструктора, а перехват строит экран без
/// него: «Перевод» в приложении был недостижим, а шаги зарядки (profiles.ts: mode=translation,
/// targetLang=en, pairCount 10/15) молча играли случайные пары. Пробы игры этого не видели —
/// они стартовали экран в режиме по умолчанию.
library;

import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/word_pairs/model.dart';
import 'package:psygames_flutter/games/word_pairs/screen.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  late SharedState state;
  late WordPairsContent content;

  setUpAll(() {
    content = WordPairsContent.fromJsonStrings(
      File('assets/word-pairs.json').readAsStringSync(),
      File('assets/vocab/translation-vocab.json').readAsStringSync(),
    );
  });

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
    await L.load('ru');
  });

  tearDown(GamePreset.clear);

  Future<void> boot(WidgetTester tester) async {
    await tester.pumpWidget(MaterialApp(home: WordPairsScreen(state: state, content: content)));
    await tester.pump();
    await tester.pump();
  }

  WordPairsSession? session(WidgetTester tester) =>
      (tester.state(find.byType(WordPairsScreen)) as dynamic).session as WordPairsSession?;

  /// Каждая пара — одна запись словаря: слева на языке интерфейса, справа на языке перевода.
  bool isTranslation(WordPair p, String from, String to) =>
      content.vocab.any((e) => e[from] == p.left && e[to] == p.right);

  test('языки перевода приехали данными: все со словарём, названия на своём языке', () {
    expect(content.targetLanguages.length, greaterThanOrEqualTo(2));
    expect(content.targetLanguages.map((l) => l.code), containsAll(['en', 'de']));
    expect(content.targetLanguages.firstWhere((l) => l.code == 'de').name, 'Deutsch');
  });

  testWidgets('🔴 «Перевод» выбирается на настройке, язык — списком, пары — из словаря', (tester) async {
    await boot(tester);
    expect(find.byKey(const ValueKey('wp-mode-random')), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('wp-mode-translation')));
    await tester.pump();
    expect(find.byKey(const ValueKey('wp-target')), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('wp-target')));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('wp-target-ru')), findsNothing, reason: 'язык интерфейса в переводе не предлагается');
    await tester.tap(find.byKey(const ValueKey('wp-target-de')).last);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('wp-start')));
    await tester.pump();
    final s = session(tester)!;
    expect(s.pairs, isNotEmpty);
    for (final p in s.pairs) {
      expect(isTranslation(p, 'ru', 'de'), isTrue, reason: '«${p.left} → ${p.right}» не пара ru→de из словаря');
    }
  });

  testWidgets('🔴 шаг зарядки: перевод на английский, стартует сам, пар не больше уровня + 1, показ без лимита',
      (tester) async {
    GamePreset.set({'wu': '1', 'mode': 'translation', 'targetLang': 'en', 'pairCount': '15'});
    await boot(tester);
    final s = session(tester);
    expect(s, isNotNull, reason: 'шаг зарядки стартует сам');
    expect(s!.pairs, hasLength(wordPairsLevelParams(1).pairCount + 1), reason: '15 из шага режутся потолком уровня');
    for (final p in s.pairs) {
      expect(isTranslation(p, 'ru', 'en'), isTrue, reason: 'шаг просит перевод ru→en');
    }
    await tester.pump(const Duration(seconds: 90));
    expect(s.phase, WordPairsPhase.memorize, reason: 'у шага зарядки показ без лимита — кончается кнопкой');
    expect(find.byKey(const ValueKey('wp-check')), findsOneWidget);
  });
}
