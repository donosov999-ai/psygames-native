import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/schulte/screen.dart';
import 'package:psygames_flutter/shell/game_clock.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/level_result.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:share_plus/share_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ЭКРАН РЕЗУЛЬТАТА СВОБОДНОЙ ПАРТИИ «ШУЛЬТЕ» (задача 793b9faf, 13.11.2026): личный рекорд, график
/// последних времён, тренд и «поделиться». Проба играет партию нажатиями по клеткам и смотрит на то,
/// что видит игрок, и на ключи, которые остаются в общем хранилище с вебом.
void main() {
  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    await L.load('ru');
  });

  const bestKey = '${SharedState.prefix}leaderboard_personal_best_schulte_table_5x5';
  const histKey = '${SharedState.prefix}history_schulte_table_5x5_nzt48';

  Future<void> open(WidgetTester tester, [Map<String, Object> initial = const {}]) async {
    gameWallMs = () => tester.binding.clock.now().millisecondsSinceEpoch;
    addTearDown(() => gameWallMs = () => DateTime.now().millisecondsSinceEpoch);
    SharedPreferences.setMockInitialValues({'${SharedState.prefix}language': 'ru', ...initial});
    final state = await SharedState.open();
    await tester.pumpWidget(MaterialApp(home: SchulteScreen(key: UniqueKey(), state: state)));
    await tester.pump();
    await tester.pump();
  }

  Future<void> pick(WidgetTester tester, String key) async {
    final f = find.byKey(Key(key));
    expect(f, findsOneWidget, reason: 'кнопка $key');
    await tester.ensureVisible(f);
    await tester.pump();
    await tester.tap(f);
    await tester.pump();
  }

  /// Идёт по настройке «Свободно», стартует, ждёт [seconds] игрового времени и доигрывает партию.
  Future<void> playFree(WidgetTester tester, {List<String> taps = const [], int seconds = 30}) async {
    await pick(tester, 'schulte-mode-free');
    for (final k in taps) {
      await pick(tester, k);
    }
    await tester.tap(find.text(L.t('start')));
    await tester.pump();
    // Часы партии — поддельные: сколько «прошло» с первого нажатия, столько и будет временем.
    await tester.pump(Duration(seconds: seconds));
    for (var step = 0; step < 200; step += 1) {
      final goalText = tester.widget<Text>(find.byKey(const Key('цель'))).data;
      if (goalText == L.t('storyDone')) break;
      final parts = L.t('schulteFind').split('{x}');
      final plain = tester.widget<Text>(find.byKey(const Key('цель'))).data ?? '';
      final target = plain.replaceFirst(parts.first, '');
      for (var i = 0; i < 100; i += 1) {
        final cell = find.byKey(Key('клетка$i'));
        if (cell.evaluate().isEmpty) break;
        final t = tester.widget<Text>(find.descendant(of: cell, matching: find.byType(Text)));
        if (t.data == target) {
          await tester.tap(cell);
          await tester.pump();
          break;
        }
      }
    }
    await tester.pump();
    await tester.pump();
  }

  Future<SharedPreferences> prefs() => SharedPreferences.getInstance();

  testWidgets('🔴 зачётная классика 5×5: после партии — строка «время · Личный рекорд» и запись в общие ключи',
      (tester) async {
    await open(tester);
    await playFree(tester, seconds: 30);
    final line = find.byKey(const Key('schulte-record-line'));
    expect(line, findsOneWidget);
    final text = tester.widget<Text>(line).data!;
    expect(text, contains('${L.t('personalBest')}:'));
    expect(text, startsWith('30.'), reason: 'время партии — из часов игры, до десятых');
    final p = await prefs();
    expect(double.parse(p.getString(bestKey)!), closeTo(30, 0.5), reason: 'личный рекорд записан');
    expect(p.getString(histKey), isNotNull, reason: 'история пишется под профиль');
    // Первая партия: графика и тренда ещё нет (нужны две прежние).
    expect(find.byKey(const Key('schulte-sparkline')), findsNothing);
    expect(find.byKey(const Key('schulte-trend')), findsNothing);
  });

  testWidgets('🔴 с историей: график и тренд, рекорд не перезаписан худшим временем, история пополнилась',
      (tester) async {
    await open(tester, {
      bestKey: '12.0',
      histKey: '[20.0, 19.0, 18.0]',
    });
    await playFree(tester, seconds: 30);
    expect(find.byKey(const Key('schulte-sparkline')), findsOneWidget);
    final trend = tester.widget<Text>(find.byKey(const Key('schulte-trend'))).data!;
    expect(trend, startsWith('хуже среднего на'), reason: '30 с против среднего 19 с');
    final line = tester.widget<Text>(find.byKey(const Key('schulte-record-line'))).data!;
    expect(line, endsWith('12.0 ${L.t('seconds')}'), reason: 'рекорд — прежний, 12.0');
    final p = await prefs();
    expect(p.getString(bestKey), '12.0', reason: 'худшее время рекорд не двигает');
    final hist = p.getString(histKey)!;
    expect(RegExp(r'\d+\.?\d*').allMatches(hist).length, 4, reason: 'три прежних + эта партия: $hist');
  });

  testWidgets('🔴 незачётная конфигурация: ни карточки, ни записи (время между режимами несравнимо)',
      (tester) async {
    for (final taps in [
      ['schulte-dir-backward'],
      ['schulte-size-6'],
      ['schulte-moving-on'],
      ['schulte-color-on'],
    ]) {
      await open(tester);
      await playFree(tester, taps: taps, seconds: 20);
      expect(find.byKey(const Key('schulte-record-line')), findsNothing, reason: '$taps');
      final p = await prefs();
      expect(p.getString(bestKey), isNull, reason: '$taps: рекорд не пишется');
      expect(p.getString(histKey), isNull, reason: '$taps: история не пишется');
    }
  });

  testWidgets('🔴 «Поделиться» в самой партии не рисуется — только на итоге', (tester) async {
    await open(tester);
    await pick(tester, 'schulte-mode-free');
    await tester.tap(find.text(L.t('start')));
    await tester.pump();
    expect(find.byIcon(Icons.ios_share), findsNothing);
  });

  testWidgets('🔴 «Поделиться» отправляет текст веба с размером и временем', (tester) async {
    final sent = <String>[];
    SchulteScreen.shareSink = (p) async => sent.add(p.text ?? '');
    addTearDown(() => SchulteScreen.shareSink = (p) => SharePlus.instance.share(p));
    await open(tester);
    await playFree(tester, seconds: 12);
    final share = find.byIcon(Icons.ios_share);
    expect(share, findsOneWidget, reason: 'значок «Поделиться» в ряду под итогом');
    await tester.tap(share);
    await tester.pump();
    expect(sent.length, 1);
    // «Прошёл таблицу Шульте 5×5 за 12.Nс в PsyGames — обгони!» — размер и время подставлены.
    expect(sent.single, startsWith('Прошёл таблицу Шульте 5×5 за 12.'));
    expect(sent.single, isNot(contains('{')), reason: 'ни один шаблон не остался неподставленным');
  });

  testWidgets('нет листа «Поделиться» — текст уходит в буфер, и игрок видит «Результат скопирован»',
      (tester) async {
    String? clipboard;
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
      if (call.method == 'Clipboard.setData') clipboard = (call.arguments as Map)['text'] as String?;
      return null;
    });
    addTearDown(() => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, null));
    SchulteScreen.shareSink = (p) async => throw UnsupportedError('нет листа');
    addTearDown(() => SchulteScreen.shareSink = (p) => SharePlus.instance.share(p));
    await open(tester);
    await playFree(tester, seconds: 12);
    await tester.tap(find.byIcon(Icons.ios_share));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    expect(clipboard, startsWith('Прошёл таблицу Шульте 5×5'));
    expect(find.text(L.t('shareCopied')), findsOneWidget);
    await tester.pump(const Duration(seconds: 5));
  });

  testWidgets('🔴 автопереход выключен там, где итог читают (рекорд), и включён у прочих свободных партий',
      (tester) async {
    await open(tester);
    await playFree(tester, seconds: 10);
    expect(tester.widget<LevelResult>(find.byType(LevelResult)).auto, isFalse,
        reason: 'карточка рекорда исчезла бы за 1,5 с');
    await open(tester);
    await playFree(tester, taps: ['schulte-dir-backward'], seconds: 10);
    expect(tester.widget<LevelResult>(find.byType(LevelResult)).auto, isTrue,
        reason: 'без рекорда читать нечего — общий автопереход каркаса');
  });
}
