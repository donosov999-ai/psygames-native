import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/inhibition/model.dart';
import 'package:psygames_flutter/games/inhibition/screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ПАРТИЯ В «ТОРМОЖЕНИЕ» ИГРАЕТСЯ НАЖАТИЯМИ.
///
/// 🔴 Проба читает С ЭКРАНА, что сейчас показано, и решает по правилу игры:
/// зелёный круг — жать, красный — держаться; «GO» — жать, ✋ — отменить.
/// В модель она не заглядывает: подмена стимула на экране её покраснит.
///
/// Где лежит уровень игры после переезда: тот же ключ, что у веб-версии.
const String _levelKey = 'psygames_inhibition_level_nzt48';

void main() {
  late SharedState state;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
    await L.load('ru');
  });

  /// Что сейчас на поле.
  String? onField() {
    for (final k in ['gng-go', 'gng-nogo', 'ss-go', 'ss-stop', 'blank']) {
      if (find.byKey(Key('inhibition-$k')).evaluate().isNotEmpty) return k;
    }
    return null;
  }

  Future<String?> waitStim(WidgetTester tester) async {
    for (var i = 0; i < 80; i++) {
      final f = onField();
      if (f != null && f != 'blank') return f;
      await tester.pump(const Duration(milliseconds: 50));
    }
    return null;
  }

  testWidgets('🔴 Go/No-Go: жмём на зелёный, держимся на красном — уровень берётся', (tester) async {
    await tester.pumpWidget(MaterialApp(
        home: InhibitionScreen(key: const ValueKey('gng'), state: state, rnd: Random(2))));
    await tester.pumpAndSettle();
    expect(find.text(L.t('goNoGo')), findsOneWidget, reason: 'парадигма не названа до начала');
    await tester.tap(find.text(L.t('start')));
    await tester.pump();

    var go = 0, nogo = 0;
    final trials = InhibitionLevel.of(1).trials;
    for (var i = 1; i <= trials; i++) {
      final s = await waitStim(tester);
      expect(s, isNotNull, reason: 'проба $i: стимула нет');
      if (s == 'gng-go') {
        await tester.tap(find.byKey(const Key('inhibition-press')));
        await tester.pump();
        expect(find.byKey(const Key('inhibition-hit')), findsOneWidget, reason: 'проба $i: попадание не засчитано');
        go++;
      } else {
        // Не жмём: окно L1 — 1300 мс.
        await tester.pump(const Duration(milliseconds: 1400));
        expect(find.byKey(const Key('inhibition-held')), findsOneWidget, reason: 'проба $i: торможение не засчитано');
        nogo++;
      }
      // ⚠️ Стимул обязан ПОГАСНУТЬ вместе с ответом. Пока он висел всю паузу,
      // `waitStim` возвращал стимул ПРОШЛОЙ пробы, счёт проб уезжал, и партия
      // разваливалась на двадцатой. Заодно это и есть правило игры: круг,
      // который не гаснет, читается как «всё ещё жми».
      // ⚠️ Дальше НЕ ждём временем: пауза между пробами случайная (500…799 мс),
      // и ровный pump(900) перепрыгивал через начало следующей пробы — стимул к
      // моменту замера был уже «старый», и отклик успевал погаснуть. Ждём СОБЫТИЯ:
      // waitStim сам пумпает по 50 мс до появления стимула.
      expect(onField(), 'blank', reason: 'проба $i: стимул не погас после ответа');
    }
    // ⚠️ Итог приходит по таймеру паузы, а pumpAndSettle крутит КАДРЫ, а не
    // таймеры: без явного pump он возвращался, не дождавшись конца партии.
    await tester.pump(const Duration(milliseconds: 900));
    await tester.pumpAndSettle();
    expect(go + nogo, trials);
    expect(nogo, greaterThan(0), reason: 'ни одной запретной за партию');
    expect(find.byKey(const Key('inhibition-verdict')), findsOneWidget);
    expect(find.text(L.t('levelDone').replaceAll('{n}', '1')), findsOneWidget);
    expect(state.get(_levelKey), '2', reason: 'лестница не шагнула');
  });

  testWidgets('🔴 Go/No-Go: жать на КРАСНЫЙ — ошибка торможения, и уровень не берётся', (tester) async {
    await tester.pumpWidget(MaterialApp(
        home: InhibitionScreen(key: const ValueKey('gng2'), state: state, rnd: Random(2))));
    await tester.pumpAndSettle();
    await tester.tap(find.text(L.t('start')));
    await tester.pump();

    var wrong = 0;
    final trials = InhibitionLevel.of(1).trials;
    for (var i = 1; i <= trials; i++) {
      final s = await waitStim(tester);
      expect(s, isNotNull, reason: 'проба $i: стимула нет');
      // Жмём ВСЕГДА — и на запретных это ошибка.
      await tester.tap(find.byKey(const Key('inhibition-press')));
      await tester.pump();
      if (find.byKey(const Key('inhibition-wrong')).evaluate().isNotEmpty) wrong++;
    }
    await tester.pump(const Duration(milliseconds: 900));
    await tester.pumpAndSettle();
    expect(wrong, greaterThan(0), reason: 'ни одна запретная не стала ошибкой');
    // Точность = (попадания + торможения) / все. Торможений нет вовсе,
    // значит порог 0,8 не взят, если запретных больше пятой части.
    expect(find.text(L.t('sameLevelRetry')), findsOneWidget, reason: 'уровень взят при нуле торможений');
    expect(state.get(_levelKey) ?? '1', '1');
  });

  testWidgets('🔴 разрешённый и запретный РАЗНОГО ЦВЕТА, а не только разного ключа', (tester) async {
    await tester.pumpWidget(MaterialApp(
        home: InhibitionScreen(key: const ValueKey('colors'), state: state, rnd: Random(2))));
    await tester.pumpAndSettle();
    await tester.tap(find.text(L.t('start')));
    await tester.pump();

    Color colorOf(String key) {
      final w = tester.widget<Container>(find.byKey(Key('inhibition-$key')));
      return (w.decoration! as BoxDecoration).color!;
    }

    // ⚠️ Ключ стимула пробы читают, а ЦВЕТ — нет. Пока цвет не проверялся,
    // «красить запретный так же, как разрешённый» проходило: человек видел бы
    // два одинаковых зелёных круга и не мог бы играть вовсе.
    Color? go, nogo;
    for (var i = 1; i <= 20 && (go == null || nogo == null); i++) {
      final s = await waitStim(tester);
      expect(s, isNotNull, reason: 'проба $i: стимула нет');
      if (s == 'gng-go') {
        go ??= colorOf('gng-go');
        await tester.tap(find.byKey(const Key('inhibition-press')));
        await tester.pump();
      } else {
        nogo ??= colorOf('gng-nogo');
        await tester.pump(const Duration(milliseconds: 1400));
      }
    }
    expect(go, isNotNull, reason: 'разрешённых не встретилось');
    expect(nogo, isNotNull, reason: 'запретных не встретилось');
    expect(go, isNot(nogo), reason: 'разрешённый и запретный одного цвета');
  });

  testWidgets('🔴 Стоп-сигнал: сперва пауза, потом GO, и только потом ✋', (tester) async {
    await tester.pumpWidget(MaterialApp(
        home: InhibitionScreen(key: const ValueKey('ss'), state: state, mode: SubMode.stopSignal, rnd: Random(6))));
    await tester.pumpAndSettle();
    expect(find.text(L.t('stopSignal')), findsOneWidget);
    // Строка параметров стоп-сигнала называет и долю, и задержку.
    final params = (find.byKey(const Key('inhibition-params')).evaluate().first.widget as Text).data!;
    expect(params.contains('${InhibitionLevel.of(1).ssdMs}'), isTrue, reason: 'задержка не названа: $params');
    await tester.tap(find.text(L.t('start')));
    await tester.pump();

    // ⚠️ Пауза обязана быть: без неё человек жмёт по счёту, а не по сигналу.
    expect(onField(), 'blank', reason: 'GO зажёгся без паузы');
    await tester.pump(const Duration(milliseconds: 550));
    expect(onField(), 'blank', reason: 'пауза короче 600 мс');

    var stops = 0, gos = 0;
    for (var i = 1; i <= 20 && stops < 2; i++) {
      final s = await waitStim(tester);
      expect(s, 'ss-go', reason: 'проба $i: первым должен загораться GO, а не $s');
      // ⚠️ ✋ не имеет права прийти РАНЬШЕ задержки уровня: вся мера торможения
      // держится на том, что сигнал приходит через ssd после «жми». Проба,
      // которая просто ждёт ssd+50 и смотрит, что показано, подмены задержки на
      // 40 мс не видит — показано будет то же самое.
      await tester.pump(Duration(milliseconds: InhibitionLevel.of(1).ssdMs - 60));
      expect(onField(), 'ss-go', reason: 'проба $i: ✋ пришёл раньше задержки уровня');
      await tester.pump(const Duration(milliseconds: 110));
      if (onField() == 'ss-stop') {
        // Держимся: окно ещё идёт.
        await tester.pump(Duration(milliseconds: InhibitionLevel.of(1).goWindowMs));
        expect(find.byKey(const Key('inhibition-held')), findsOneWidget, reason: 'проба $i: торможение не засчитано');
        stops++;
      } else {
        await tester.tap(find.byKey(const Key('inhibition-press')));
        await tester.pump();
        expect(find.byKey(const Key('inhibition-hit')), findsOneWidget, reason: 'проба $i: попадание не засчитано');
        gos++;
      }
      await tester.pump(const Duration(milliseconds: 600));
    }
    expect(stops, 2, reason: 'стоп-проб не набралось за 20 проб');
    expect(gos, greaterThan(0));
  });

  testWidgets('🔴 «Микс» чередует парадигмы: чётные пробы — круг, нечётные — GO', (tester) async {
    await tester.pumpWidget(MaterialApp(
        home: InhibitionScreen(key: const ValueKey('mix'), state: state, mode: SubMode.mixed, rnd: Random(4))));
    await tester.pumpAndSettle();
    expect(find.text(L.t('mixedMode')), findsOneWidget);
    await tester.tap(find.text(L.t('start')));
    await tester.pump();

    for (var i = 1; i <= 6; i++) {
      final s = await waitStim(tester);
      expect(s, isNotNull, reason: 'проба $i: стимула нет');
      final gng = s!.startsWith('gng-');
      expect(gng, i.isOdd, reason: 'проба $i показала $s — чередование сбилось');
      if (gng) {
        if (s == 'gng-go') {
          await tester.tap(find.byKey(const Key('inhibition-press')));
          await tester.pump();
        } else {
          await tester.pump(const Duration(milliseconds: 1400));
        }
      } else {
        await tester.pump(Duration(milliseconds: InhibitionLevel.of(1).goWindowMs + 50));
      }
    }
  });

  testWidgets('🔴 экран играет партию СИДА: один сид — одна последовательность', (tester) async {
    Future<List<String>> play(int run) async {
      SharedPreferences.setMockInitialValues({});
      state = await SharedState.open();
      await tester.pumpWidget(MaterialApp(
          home: InhibitionScreen(key: ValueKey('run$run'), state: state, rnd: Random(29))));
      await tester.pumpAndSettle();
      await tester.tap(find.text(L.t('start')));
      await tester.pump();
      final out = <String>[];
      for (var i = 0; i < 6; i++) {
        final s = await waitStim(tester);
        expect(s, isNotNull, reason: 'проба ${i + 1}: стимула нет');
        out.add(s!);
        await tester.pump(const Duration(milliseconds: 1400));
      }
      return out;
    }

    final first = await play(1);
    final second = await play(2);
    expect(first.length, 6);
    expect(second, first, reason: 'один сид дал две разные партии — сид до партии не доходит');
  });
}
