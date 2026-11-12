// Возврат потерь двух переездов (веб → Flutter, Classic → «Аврора») в разделе «Зарядки и серии».
//
// Аудит 05.11.2026 нашёл, что пропало у «Дыхания», «Гимнастики для глаз» и «Паузы»; Денис 11.11:
// «возвращай все». Каждая проба ниже — одна потеря, нажатиями, на том языке, где она была видна:
//   · «Об игре» с тремя пользами (26165a85);
//   · подсказки 4-7-8 и выход на квадрат (d4e4b2d8);
//   · описания техник в списке и «Цикл n/N» (7caec33c);
//   · итог: три звезды, подход, время, серия; звёзды — на тропинку (b9517e77, 936e3a5e, af5c3ae9);
//   · кнопки «Паузы» на немецком, а не по-английски (33d07902);
//   · Вим Хоф: «Назад» у предупреждения и кнопка для читалки на задержке (9e046132, 25b1d933).
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:practice_kit/practice_kit.dart';
import 'package:psygames_flutter/games/pause/breath_cues.dart';
import 'package:psygames_flutter/games/pause/screen.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _SilentBreath implements BreathSound {
  final played = <BreathCue>[];

  @override
  Future<void> play(BreathCue cue) async => played.add(cue);

  @override
  Future<void> dispose() async {}
}

void main() {
  final engine = Practices(jsonDecode(File('../packages/practice_kit/assets/practices.json').readAsStringSync()) as Json);
  final copy = jsonDecode(File('assets/pause/copy.json').readAsStringSync()) as Json;
  Map<String, String> dict(String l) =>
      (jsonDecode(File('assets/l10n/$l.json').readAsStringSync()) as Map).cast<String, String>();
  late SharedState state;
  late List<Map<String, dynamic>> reports;
  late _SilentBreath sound;
  var now = 0;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
    reports = [];
    now = 0;
    sound = _SilentBreath();
    GamePreset.clear();
    L.useForTest('ru', dict('ru'));
    SessionReport.sink = (json) async => reports.add(jsonDecode(json) as Map<String, dynamic>);
  });

  tearDown(() {
    GamePreset.clear();
    SessionReport.sink = null;
  });

  Future<void> open(WidgetTester tester, PauseFlavor flavor) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(MaterialApp(
      home: PauseScreen(
        state: state,
        flavor: flavor,
        engine: engine,
        copy: copy,
        clock: () => now,
        breathSound: sound,
        today: () => DateTime(2026, 11, 11),
      ),
    ));
    await tester.pump();
    await tester.pump();
  }

  Future<void> at(WidgetTester tester, int ms) async {
    now = ms;
    await tester.pump(const Duration(milliseconds: 16));
    await tester.pump();
  }

  testWidgets('«Об игре»: свёрнуто, раскрывается — описание и три пользы, у дыхания и у глаз', (tester) async {
    for (final (flavor, desc, benefits) in [
      (PauseFlavor.breathing, 'breathingIntroDesc', ['benefitBreath1', 'benefitBreath2', 'benefitBreath3']),
      (PauseFlavor.eyeGym, 'eyeGymIntroDesc', ['benefitEye1', 'benefitEye2', 'benefitEye3']),
    ]) {
      await open(tester, flavor);
      expect(find.text(L.t('title_about_game')), findsOneWidget);
      expect(find.byKey(const Key('pause-about-body')), findsNothing, reason: 'свёрнуто: двадцатый запуск не платит за чтение');
      await tester.tap(find.byKey(const Key('pause-about-toggle')));
      await tester.pump();
      expect(find.text(L.t(desc)), findsOneWidget);
      for (final b in benefits) {
        expect(find.text(L.t(b)), findsOneWidget, reason: '$flavor: $b');
        expect(L.t(b), isNot(b), reason: 'ключ в словаре сборки, а не сырой');
      }
    }
  });

  testWidgets('4-7-8: совет приглушить экран, потом «так и задумано» и выход на квадрат', (tester) async {
    await open(tester, PauseFlavor.breathing);
    await tester.tap(find.byKey(const Key('pause-breath-tech')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('pause-breath-tech-desc-calm478')), findsWidgets, reason: 'описание техники — в раскрытом списке');
    await tester.tap(find.textContaining(L.t('brTech478')).last);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('pause-start')));
    await tester.pump();
    await at(tester, 3000 + 2000);
    expect(find.byKey(const Key('pause-breath-dim-hint')), findsOneWidget);
    await at(tester, 3000 + 8000);
    expect(find.byKey(const Key('pause-breath-why')), findsOneWidget);
    await tester.tap(find.byKey(const Key('pause-breath-to-box')));
    await tester.pump();
    expect(find.byKey(const Key('pause-config')), findsOneWidget, reason: 'к настройкам — уже с квадратом');
    expect(find.textContaining(L.t('brTechBox')), findsWidgets);
  });

  testWidgets('квадрат, 6 циклов: «Цикл n/N» в счётчиках, итог — звёзды, подход, время; звёзды — на тропинку', (tester) async {
    await open(tester, PauseFlavor.breathing);
    expect(find.byKey(const Key('pause-breath-trail-1')), findsOneWidget, reason: 'тропинка подходов на настройке');
    await tester.tap(find.byKey(const Key('pause-start')));
    await tester.pump();
    await at(tester, 3000 + 20000);
    expect(find.text('2/6'), findsOneWidget, reason: 'идёт второй цикл квадрата (16 с на круг)');
    await at(tester, 3000 + 96000);
    expect(find.byKey(const Key('pause-done')), findsOneWidget);
    expect(find.text('★★★'), findsOneWidget);
    expect(find.text(L.t('brDoneTitle')), findsOneWidget);
    expect(find.byKey(const Key('pause-breath-run')), findsOneWidget);
    expect(sound.played.last, BreathCue.win, reason: 'подход кончается звуком победы, а не тишиной');
    await tester.pump();
    expect(find.text('🔥1'), findsOneWidget, reason: 'серия дней в итоге');
    expect(jsonDecode(state.get('${SharedState.prefix}breathing_stars_${state.activeProfile}')!), {'1': 3});
    await tester.tap(find.byKey(const Key('pause-again')));
    await tester.pump();
    expect(find.byKey(const Key('pause-breath-trail-stars-1')), findsOneWidget);
  });

  testWidgets('гимнастика: тропинка 15 узлов — пройденные открыты, дальше замок; итог со звёздами', (tester) async {
    SharedPreferences.setMockInitialValues({
      'flutter.psygames_eye_gym_level_${'nzt48'}': '2',
    });
    state = await SharedState.open();
    await open(tester, PauseFlavor.eyeGym);
    expect(find.byKey(const Key('pause-eye-level-1')), findsOneWidget);
    expect(find.byKey(const Key('pause-eye-level-2')), findsOneWidget);
    expect(find.byIcon(Icons.lock_outline), findsWidgets, reason: 'непройденные — под замком, путь виден целиком');
    await tester.tap(find.byKey(const Key('pause-start')));
    await tester.pump();
    await at(tester, 60 * 60 * 1000);
    expect(find.byKey(const Key('pause-done')), findsOneWidget);
    expect(find.text('★★★'), findsOneWidget);
    expect(find.byKey(const Key('pause-eye-level')), findsOneWidget);
  });

  testWidgets('немецкий: «Начать» и «Перед началом» — по-немецки, а не по-английски', (tester) async {
    L.useForTest('de', dict('de'));
    await open(tester, PauseFlavor.hub);
    final start = tester.widget<Text>(find.descendant(of: find.byKey(const Key('pause-start')), matching: find.byType(Text)));
    expect(start.data, dict('de')['start'], reason: 'подпись — из словаря приложения, а не из ядра (у ядра только ru/en)');
    expect(find.text('Set up a short practice'), findsNothing);
    expect(find.text(dict('de')['pauseSetupTitle']!), findsOneWidget);
  });

  testWidgets('Вим Хоф: «Назад» у предупреждения; задержка — кнопка для читалки экрана', (tester) async {
    final handle = tester.ensureSemantics();
    await open(tester, PauseFlavor.breathing);
    await tester.tap(find.byKey(const Key('pause-breath-tech')));
    await tester.pumpAndSettle();
    await tester.tap(find.textContaining(L.t('brTechWim')).last);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('pause-start')));
    await tester.pump();
    expect(find.byKey(const Key('pause-wim-warning')), findsOneWidget);
    await tester.tap(find.byKey(const Key('pause-wim-back')));
    await tester.pump();
    expect(find.byKey(const Key('pause-wim-warning')), findsNothing, reason: '«Назад» — к технике, не из игры');
    await tester.tap(find.byKey(const Key('pause-start')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('pause-wim-agree')));
    await tester.pump();
    await at(tester, 30 * 1800 + 100);
    expect(
      tester.getSemantics(find.byKey(const Key('pause-wim-box'))),
      matchesSemantics(isButton: true, hasTapAction: true, label: '${L.t('brWimHold')}. 0${L.t('secShort')}. ${L.t('brWimHoldHint')}'),
    );
    handle.dispose();
  });
}
