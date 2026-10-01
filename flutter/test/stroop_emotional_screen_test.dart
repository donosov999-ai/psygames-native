import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/stroop_emotional/model.dart';
import 'package:psygames_flutter/games/stroop_emotional/screen.dart';
import 'package:psygames_flutter/games/stroop_emotional/words.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/boss_probe.dart';
import 'support/slow_write_state.dart';

/// ПАРТИЯ В «ЭМОЦИОНАЛЬНЫЙ СТРУП» ИГРАЕТСЯ НАЖАТИЯМИ ПО ЦВЕТУ ЧЕРНИЛ.
///
/// 🔴 Проба читает с экрана САМО СЛОВО и его цвет и жмёт кнопку цвета. Слова
/// берутся из того же набора, что у веб-версии, и проба это сверяет: если экран
/// начнёт показывать что-то помимо набора, партия покраснеет.
void main() {
  late SharedState state;
  late EmoWords words;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
    await L.load('ru');
    final raw = jsonDecode(File('assets/l10n/stroop-emotional-words.json').readAsStringSync())
        as Map<String, dynamic>;
    final ru = (raw['ru'] as Map<String, dynamic>);
    words = await EmoWords.load('ru', bundle: _Bundle(jsonEncode({'ru': ru})));
  });

  String? wordOnScreen(WidgetTester tester) {
    final f = find.byKey(const Key('emostroop-word'));
    if (f.evaluate().isEmpty) return null;
    return tester.widget<Text>(f).data;
  }

  Color? colorOnScreen(WidgetTester tester) {
    final f = find.byKey(const Key('emostroop-word'));
    if (f.evaluate().isEmpty) return null;
    return tester.widget<Text>(f).style?.color;
  }

  String inkName(Color c) => emoColors.firstWhere(
      (name) => Color(int.parse(emoColorHex[name]!.substring(1), radix: 16) | 0xFF000000) == c);

  Future<void> waitWord(WidgetTester tester) async {
    for (var i = 0; i < 60; i++) {
      if (wordOnScreen(tester) != null) return;
      await tester.pump(const Duration(milliseconds: 50));
    }
  }

  testWidgets('🔴 партия играется нажатиями по ЦВЕТУ ЧЕРНИЛ, слова — из общего набора', (tester) async {
    var clock = 0;
    await tester.pumpWidget(MaterialApp(
      home: EmoStroopScreen(state: state, clock: () => clock, rnd: Random(7), words: words),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.text(L.t('start')));
    await tester.pump();

    final all = {for (final v in Valence.values) ...words.byValence[v]!};
    for (var i = 0; i < 18; i++) {
      await waitWord(tester);
      final word = wordOnScreen(tester);
      expect(word, isNotNull, reason: 'проба ${i + 1}: слова нет');
      expect(all.contains(word), isTrue, reason: 'проба ${i + 1}: слово «$word» не из набора');
      clock += 640;
      await tester.tap(find.byKey(Key('emostroop-answer-${inkName(colorOnScreen(tester)!)}')));
      await tester.pump();
      expect(find.byKey(const Key('emostroop-hit')), findsOneWidget, reason: 'проба ${i + 1}: не засчитано');
      await tester.pump(const Duration(milliseconds: 400));
    }
    for (var i = 0; i < 80; i++) {
      if (find.textContaining(L.t('meanReaction')).evaluate().isNotEmpty) break;
      await tester.pump(const Duration(milliseconds: 50));
    }

    expect(find.textContaining(L.t('levelDone').split('{').first.trim()), findsOneWidget);
    expect(find.textContaining('${L.t('meanReaction')}: 640 ${L.t('msShort')}'), findsOneWidget,
        reason: 'отсчёт обязан идти от показа слова');
    // Все пробы шли поровну, поэтому помеха — ноль, а не прочерк: при семени 7
    // в 18 пробах встречаются и заряженные, и нейтральные.
    expect(find.textContaining('${L.t('hud_interference')}: 0 ${L.t('msShort')}'), findsOneWidget);
  });

  testWidgets('🔴 нажатие по ЗНАЧЕНИЮ слова, а не по цвету чернил, — ошибка', (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: EmoStroopScreen(state: state, rnd: Random(3), words: words),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.text(L.t('start')));
    await tester.pump();
    await waitWord(tester);

    final ink = inkName(colorOnScreen(tester)!);
    final other = emoColors.firstWhere((c) => c != ink);
    await tester.tap(find.byKey(Key('emostroop-answer-$other')));
    await tester.pump();
    expect(find.byKey(const Key('emostroop-wrong')), findsOneWidget);
  });

  testWidgets('🔴 на чужом языке экран честно предупреждает, а не молчит', (tester) async {
    /**
     * ⚠️ БЕЗ `pumpAndSettle` И БЕЗ СМЕНЫ ЯЗЫКА ЧЕРЕЗ L.load. Первая редакция делала
     * и то и другое и вставала на десять минут: пока экран грузится, на нём крутится
     * бесконечный индикатор, и «дождаться покоя» не наступает никогда. Ждём появления
     * кнопки «Начать» мелким шагом — это событие, а не покой.
     */
    final enWords = await EmoWords.load('fr',
        bundle: _Bundle(File('assets/l10n/stroop-emotional-words.json').readAsStringSync()));
    expect(enWords.lang, 'en', reason: 'наборов на французском нет — берётся английский');

    await tester.pumpWidget(MaterialApp(
      home: EmoStroopScreen(state: state, rnd: Random(1), words: enWords),
    ));
    for (var i = 0; i < 60 && find.text(L.t('start')).evaluate().isEmpty; i++) {
      await tester.pump(const Duration(milliseconds: 50));
    }
    // Язык приложения русский, а слова английские — экран обязан сказать об этом вслух.
    expect(find.byKey(const Key('emostroop-lang-fallback')), findsOneWidget,
        reason: 'подменять смысл молча хуже, чем предупредить');
  });

  testWidgets('🔴 сданную партию не сдать второй раз: нажатие, пока пишется победа, уровень не двигает', (tester) async {
    // Запись лестницы растянута до 300 мс, как канал к платформе на телефоне
    // (support/slow_write_state.dart): партия сдана, а фаза ещё «игра» и последняя проба на экране.
    SharedPreferences.setMockInitialValues({});
    state = await SlowWriteState.open();
    var clock = 0;
    await tester.pumpWidget(MaterialApp(
      home: EmoStroopScreen(state: state, clock: () => clock, rnd: Random(7), words: words),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.text(L.t('start')));
    await tester.pump();
    late String last;
    for (var i = 0; i < EmoLevel.of(1).trials; i++) {
      await waitWord(tester);
      last = 'emostroop-answer-${inkName(colorOnScreen(tester)!)}';
      clock += 640;
      await tester.tap(find.byKey(Key(last)));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: emoFeedbackMs + 30));
    }
    final done = find.textContaining(L.t('levelDone').split('}').last);
    // Партия сдана 30 мс назад, победа ещё пишется: щель открыта.
    expect(wordOnScreen(tester), isNotNull, reason: 'щель не воспроизведена: последней пробы на экране нет');
    expect(done, findsNothing, reason: 'итог уже на экране — щели нет, проба ничего не проверяет');
    await tester.tap(find.byKey(Key(last)));
    await tester.pump();
    await tester.pump(const Duration(seconds: 2));
    expect(done, findsOneWidget);
    expect(state.get('${SharedState.prefix}stroop_emotional_level_nzt48'), '2', reason: 'партия сдана дважды — уровень прыгнул через ступень');
  });

  testWidgets('🔴 веха: победа на 3-м уровне открывает бой «жми / не жми», на 2-м — нет', (tester) async {
    // В вебе эмоциональный Струп зовёт BossRound каждые три уровня; при переносе бой пропал молча.
    // Признак взятого уровня — хвост строки «Уровень {n} пройден!»: номер у двух партий разный.
    final won = find.textContaining(L.t('levelDone').split('}').last);
    var opens = 0;
    var clock = 0;
    await expectBossAfterWin(tester, won: won, hudKey: 'bossHudGonogo', play: (level) async {
      SharedPreferences.setMockInitialValues({'${SharedState.prefix}stroop_emotional_level_nzt48': '$level'});
      state = await SharedState.open();
      // Свежее приложение на каждую партию: всплывшее после прошлой (карточка правила
      // нового уровня) иначе осталось бы поверх «Начать» следующей.
      await tester.pumpWidget(MaterialApp(
        key: ValueKey('app${opens += 1}'),
        home: EmoStroopScreen(
            state: state, clock: () => clock, rnd: Random(7), words: words),
      ));
      await tester.pumpAndSettle();
      await tester.tap(find.text(L.t('start')));
      await tester.pump();
      for (var i = 0;
          i < 1200 && won.evaluate().isEmpty && find.byKey(const Key('boss-round')).evaluate().isEmpty;
          i++) {
        final ink = colorOnScreen(tester);
        if (ink == null) {
          await tester.pump(const Duration(milliseconds: 50));
          continue;
        }
        clock += 640;
        await tester.tap(find.byKey(Key('emostroop-answer-${inkName(ink)}')));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 400));
      }
    });
  });
}

/// Подставной ассет: проба не зависит от того, собран ли пакет.
class _Bundle extends CachingAssetBundle {
  _Bundle(this.payload);
  final String payload;

  @override
  Future<ByteData> load(String key) async {
    final bytes = utf8.encode(payload);
    return ByteData.view(Uint8List.fromList(bytes).buffer);
  }
}
