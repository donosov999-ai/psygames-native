import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/navigator/board.dart';
import 'package:psygames_flutter/games/navigator/geometry.dart';
import 'package:psygames_flutter/games/navigator/screen.dart';
import 'package:psygames_flutter/games/navigator/session.dart';
import 'package:psygames_flutter/games/navigator/strings.dart';
import 'package:psygames_flutter/games/navigator/types.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/lesson_player.dart';
import 'package:psygames_flutter/shell/level_ladder.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_level_store.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// «НАВИГАТОР» НА FLUTTER ИГРАЕТСЯ ЦЕЛИКОМ — КЛАВИШАМИ, СВАЙПОМ И КНОПКАМИ.
///
/// 🔴 ЗАЧЕМ ИМЕННО ТАК. Ядро сверено эталоном живого TS (`navigator_session_test.dart`), но эталон
/// не видит, дошёл ли ввод до ядра: перенос «Лаборатории» потерял двойное нажатие при зелёном
/// эталоне. Здесь партия проходится настоящими событиями — нажатием клавиши, протяжкой пальца,
/// тычком в кнопку — и итог проверяется там, куда он обязан доехать: лестница и статистика.
///
/// 🔴 КАРТА ОДНА И ТА ЖЕ ПРИ ИЗУЧЕНИИ И ПРИ ОТВЕТЕ — правило веба 16.09.2026: иначе меняется
/// сама задача на пространственную память. Меряется размером на экране в обеих фазах.
void main() {
  late SharedState state;
  late NavigatorStrings nav;
  final reports = <Map<String, dynamic>>[];

  setUp(() async {
    SharedPreferences.setMockInitialValues({'psygames_active_profile': 'nzt48'});
    state = await SharedState.open();
    await L.load('ru');
    nav = await NavigatorStrings.load(locale: 'ru');
    reports.clear();
    SessionReport.sink = (json) async => reports.add(jsonDecode(json) as Map<String, dynamic>);
    GamePreset.clear();
  });

  tearDown(() {
    SessionReport.sink = null;
    GamePreset.clear();
  });

  Future<void> open(WidgetTester tester, {Size window = const Size(390, 844), num Function()? now}) async {
    tester.view.physicalSize = window;
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(const SizedBox());
    await tester.pumpWidget(MaterialApp(home: NavigatorScreen(state: state, now: now)));
    await tester.pump();
    await tester.pump();
  }

  Future<void> press(WidgetTester tester, String key) async {
    final target = find.byKey(Key(key));
    await tester.ensureVisible(target);
    await tester.pump();
    await tester.tap(target);
    await tester.pump();
  }

  bool shown(String key) => find.byKey(Key(key)).evaluate().isNotEmpty;

  /// Правила → изучение → «Готово» → все шаги отвлечения → ответ.
  Future<void> toRecall(WidgetTester tester) async {
    await press(tester, 'nav-start');
    await press(tester, 'nav-ready');
    for (var i = 0; i < 5 && shown('nav-continue'); i++) {
      await press(tester, 'nav-continue');
    }
    expect(shown('nav-swipe'), isTrue, reason: 'после изучения и отвлечения обязан начаться ответ');
  }

  NavigatorRound roundFor(int level, [NavigatorMode? mode]) =>
      createNavigatorSession(NavigatorSessionConfig(seed: 'navigator-$level', level: level, mode: mode)).round;

  const arrows = {
    Cardinal.north: LogicalKeyboardKey.arrowUp,
    Cardinal.east: LogicalKeyboardKey.arrowRight,
    Cardinal.south: LogicalKeyboardKey.arrowDown,
    Cardinal.west: LogicalKeyboardKey.arrowLeft,
  };
  Offset swipeFor(Cardinal d) => switch (d) {
        Cardinal.north => const Offset(0, -80),
        Cardinal.east => const Offset(80, 0),
        Cardinal.south => const Offset(0, 80),
        Cardinal.west => const Offset(-80, 0),
      };

  Future<int> storedLevel() async {
    final ladder = LevelLadder(gameId: 'navigator', store: SharedLevelStore(state), maxLevel: navigatorLevels);
    await ladder.load();
    return ladder.level;
  }

  testWidgets('🔴 «Маршрут» клавишами: верный путь засчитан, лестница шагнула, партия ушла в статистику',
      (tester) async {
    await open(tester);
    expect(shown('nav-rules'), isTrue);
    await toRecall(tester);
    final round = roundFor(1);
    expect(round.mode, NavigatorMode.routeRecall);
    expect(find.text(nav.fill('routeProgress', {'current': 1, 'total': round.routeSteps})), findsOneWidget);
    for (final d in round.routeDirections) {
      await tester.sendKeyEvent(arrows[rotateCardinal(d, round.mapRotation)]!);
      await tester.pump();
    }
    await tester.pump();
    expect(find.text(L.f('levelDone', {'n': '1'})), findsOneWidget);
    expect(reports, hasLength(1));
    expect(reports.single['game_type'], 'navigator');
    expect(reports.single['mode'], 'route-recall');
    expect(reports.single['errors'], 0);
    expect(await storedLevel(), 2, reason: 'пройденная ступень поднимает лестницу');
    expect(find.text(L.t('nextLabel')), findsOneWidget);
    await press(tester, 'nav-next');
    expect(shown('nav-rules'), isTrue, reason: 'следующая партия начинается с правил');
  });

  testWidgets('🔴 свайп отвечает так же, как клавиша; короткий не засчитан, неверный — лишний шаг', (tester) async {
    await open(tester);
    await toRecall(tester);
    final round = roundFor(1);
    final steps = round.routeSteps;
    final first = rotateCardinal(round.routeDirections[0], round.mapRotation);
    // 30 точек — выше порога ядра (24). Здесь поле не прокручивается и спора жестов нет, поэтому
    // порог протяжки эта проба НЕ проверяет — его держит проба на прокручиваемом поле ниже.
    await tester.drag(find.byKey(const Key('nav-swipe')), swipeFor(first) * (30 / 80));
    await tester.pump();
    expect(find.text(nav.fill('routeProgress', {'current': 2, 'total': steps})), findsOneWidget,
        reason: 'свайп верной стороной в 30 точек — шаг вперёд, как в вебе');

    await tester.drag(find.byKey(const Key('nav-swipe')), swipeFor(first) / 8);
    await tester.pump();
    expect(find.text(nav.fill('routeProgress', {'current': 2, 'total': steps})), findsOneWidget,
        reason: 'свайп в 10 точек меньше порога 24 — не ответ');

    final next = rotateCardinal(round.routeDirections[1], round.mapRotation);
    final wrong = Cardinal.values.firstWhere((c) => c != next);
    await tester.drag(find.byKey(const Key('nav-swipe')), swipeFor(wrong));
    await tester.pump();
    expect(find.text(nav.fill('routeProgress', {'current': 2, 'total': steps})), findsOneWidget,
        reason: 'неверная сторона не двигает по маршруту');

    for (final d in round.routeDirections.skip(1)) {
      await tester.drag(find.byKey(const Key('nav-swipe')), swipeFor(rotateCardinal(d, round.mapRotation)));
      await tester.pump();
    }
    await tester.pump();
    expect(reports, hasLength(1));
    expect(reports.single['errors'], 1, reason: 'один неверный свайп — один лишний шаг');
    // Три шага и один лишний — точность 0,75, ниже порога 0,8: ступень не пройдена.
    expect(round.routeSteps, 3);
    expect(find.text(L.t('retry')), findsOneWidget);
    expect(await storedLevel(), 1, reason: 'непройденная ступень лестницу не поднимает');
  });

  testWidgets('🔴 свайп в 30 точек засчитан и там, где поле прокручивается', (tester) async {
    // Замер 30.09.2026: пока рядом нет других жестов, Flutter отдаёт полный путь пальца при любых
    // настройках — даже протяжку в 10 точек. Порог протяжки и точка отсчёта решают только в СПОРЕ
    // жестов, а спор бывает, когда поле прокручивается: прокрутка забирает вертикаль с 18 точек,
    // протяжка по умолчанию начинается с 36. Поэтому проба стоит именно там — узкое окно и
    // ступень со скрытой картой, где органы ответа не влезают в поле. С 30.09.2026 в портрете поле не
    // прокручивается ни на одной ступени (проба ниже, вплоть до 360×560), и живой случай прокрутки —
    // телефон, повёрнутый набок: 740×360, поле каркаса около 200 точек.
    GamePreset.set({'level': '7'});
    await open(tester, window: const Size(740, 360));
    await toRecall(tester);
    final scroll = tester.state<ScrollableState>(
        find.descendant(of: find.byKey(const Key('nav-play')), matching: find.byType(Scrollable)));
    expect(scroll.position.maxScrollExtent, greaterThan(0), reason: 'проба обязана стоять на прокручиваемом поле');
    final round = roundFor(7);
    expect(round.mode, NavigatorMode.routeRecall);
    for (var i = 0; i < round.routeSteps; i++) {
      await tester.ensureVisible(find.byKey(const Key('nav-swipe')));
      await tester.pump();
      final d = rotateCardinal(round.routeDirections[i], round.mapRotation);
      await tester.drag(find.byKey(const Key('nav-swipe')), swipeFor(d) * (30 / 80));
      await tester.pump();
    }
    await tester.pump();
    expect(reports, hasLength(1), reason: 'все свайпы по 30 точек дошли до ядра — партия закончена');
    expect(reports.single['errors'], 0);
  });

  testWidgets('«Повороты» клавишами: стрелки и пробел на «прямо»', (tester) async {
    GamePreset.set({'level': '2'});
    await open(tester);
    await toRecall(tester);
    final round = roundFor(2);
    expect(round.mode, NavigatorMode.turnSequence);
    for (final t in round.turns) {
      await tester.sendKeyEvent(switch (t) {
        Turn.left => LogicalKeyboardKey.arrowLeft,
        Turn.right => LogicalKeyboardKey.arrowRight,
        Turn.straight => LogicalKeyboardKey.space,
      });
      await tester.pump();
    }
    await tester.pump();
    expect(reports, hasLength(1));
    expect(reports.single['errors'], 0);
    expect(find.text(L.f('levelDone', {'n': '2'})), findsOneWidget);
  });

  testWidgets('🔴 «Домой» кнопками: восемь сторон, верная с учётом поворота карты засчитана', (tester) async {
    GamePreset.set({'level': '3'});
    await open(tester);
    await toRecall(tester);
    final round = roundFor(3);
    expect(round.mode, NavigatorMode.homeDirection);
    for (final h in HomeSector.values) {
      expect(shown('nav-choice-${h.wire}'), isTrue, reason: 'кнопка ${h.wire}');
      expect(find.text(nav.home(h)), findsOneWidget, reason: 'подпись ${h.wire} — из словаря модуля');
    }
    await press(tester, 'nav-choice-${rotateHomeSector(round.correctHomeSector, round.mapRotation).wire}');
    expect(reports, hasLength(1));
    expect(reports.single['errors'], 0);
    expect(find.text(L.f('levelDone', {'n': '3'})), findsOneWidget);
  });

  testWidgets('🔴 карта одного размера при изучении и при ответе', (tester) async {
    for (final window in const [Size(360, 640), Size(390, 844)]) {
      for (final mode in const [NavigatorMode.routeRecall, NavigatorMode.homeDirection]) {
        // Ступень, где карта видна и в ответе. Замер эталона 30.09.2026: такие только 1–5 (сетка
        // 3×3), с шестой карта в ответе спрятана — правило «один размер» живёт на обучающих ступенях.
        final level = [
          for (var l = 1; l <= navigatorLevels; l++)
            if (!roundFor(l, mode).hideMapDuringRecall) l,
        ].last;
        GamePreset.set({'level': '$level', 'mode': mode.wire});
        await open(tester, window: window);
        await press(tester, 'nav-start');
        final study = tester.getSize(find.byKey(const Key('nav-map')));
        await press(tester, 'nav-ready');
        for (var i = 0; i < 5 && shown('nav-continue'); i++) {
          await press(tester, 'nav-continue');
        }
        final recall = tester.getSize(find.byKey(const Key('nav-map')));
        expect(recall, study, reason: '${mode.wire} ур.$level в окне $window');
        expect(tester.takeException(), isNull);
      }
    }
  });

  testWidgets('🔴 поле не переполняется на узком и обычном окне, карта не мельче пола', (tester) async {
    for (final window in const [Size(360, 640), Size(390, 844)]) {
      for (final level in const [1, 2, 3, 31, 32, 33]) {
        GamePreset.set({'level': '$level'});
        final round = roundFor(level);
        await open(tester, window: window);
        expect(tester.takeException(), isNull, reason: 'правила, ур.$level, $window');
        await press(tester, 'nav-start');
        expect(tester.takeException(), isNull, reason: 'изучение, ур.$level, $window');
        void readable(String phase) {
          final map = find.byKey(const Key('nav-map'));
          if (map.evaluate().isEmpty) return;
          final floor = round.gridSize * navigatorMinCell;
          final width = window.width - 16;
          expect(tester.getSize(map).width, greaterThanOrEqualTo(floor < width ? floor : width - 0.5),
              reason: '$phase ур.$level: клетки не мельче 28 точек, пока хватает ширины');
        }

        readable('изучение');
        await press(tester, 'nav-ready');
        for (var i = 0; i < 5 && shown('nav-continue'); i++) {
          await press(tester, 'nav-continue');
        }
        expect(tester.takeException(), isNull, reason: 'ответ, ур.$level, $window');
        readable('ответ');
      }
    }
  });

  double scrollExtent(WidgetTester tester) => tester
      .state<ScrollableState>(find.descendant(of: find.byKey(const Key('nav-play')), matching: find.byType(Scrollable)))
      .position
      .maxScrollExtent;

  // 🔴 ЖАЛОБА «ИГРЫ ЕЗДЯТ» (отчёт e5bfc2f0, задача 2752f33f): партия обязана вставать в поле БЕЗ прокрутки.
  // Замер 30.09.2026 перед правкой: на 360×640 (поле каркаса 484) ответ уходил за край на 102–282 точки,
  // на 390×844 изучение старших ступеней — на 16–50. Проба идёт по ВСЕМ ступеням: переполнение сидит в
  // сочетаниях (скрытая карта + восемь кнопок, сетка 8×8, пятнадцать поворотов), а не на первой ступени.
  testWidgets('🔴 без прокрутки: все 33 ступени, изучение и ответ, на 360×640 и 390×844', (tester) async {
    for (final window in const [Size(360, 640), Size(390, 844)]) {
      for (var level = 1; level <= navigatorLevels; level++) {
        GamePreset.set({'level': '$level'});
        await open(tester, window: window);
        await press(tester, 'nav-start');
        expect(scrollExtent(tester), 0, reason: 'изучение, ур.$level, $window');
        await press(tester, 'nav-ready');
        for (var i = 0; i < 5 && shown('nav-continue'); i++) {
          await press(tester, 'nav-continue');
        }
        expect(scrollExtent(tester), 0, reason: 'ответ, ур.$level, $window');
        expect(tester.takeException(), isNull);
      }
    }
  });

  testWidgets('без прокрутки на 360×640 и в двенадцати языках — на худших ступенях', (tester) async {
    for (final code in L.locales) {
      await tester.runAsync(() async {
        await L.load(code);
        await NavigatorStrings.load(locale: code);
      });
      for (final level in const [3, 6, 7, 32, 33]) {
        GamePreset.set({'level': '$level'});
        await open(tester, window: const Size(360, 640));
        await press(tester, 'nav-start');
        expect(scrollExtent(tester), 0, reason: '$code: изучение, ур.$level');
        await press(tester, 'nav-ready');
        for (var i = 0; i < 5 && shown('nav-continue'); i++) {
          await press(tester, 'nav-continue');
        }
        expect(scrollExtent(tester), 0, reason: '$code: ответ, ур.$level');
      }
    }
    await tester.runAsync(() => L.load('ru'));
  });

  testWidgets('на обычном телефоне первая ступень целиком в поле, без прокрутки', (tester) async {
    await open(tester);
    await toRecall(tester);
    final field = tester.getRect(find.byKey(const Key('game-field')));
    final last = tester.getRect(find.byKey(const Key('nav-choice-west')));
    expect(last.bottom, lessThanOrEqualTo(field.bottom + 0.5), reason: 'кнопки ответа не уходят под край поля');
  });

  testWidgets('🔴 время паузы не входит в длительность партии', (tester) async {
    num clock = 0;
    await open(tester, now: () => clock);
    await toRecall(tester);
    clock = 1000;
    await press(tester, 'nav-pause');
    expect(shown('nav-resume'), isTrue);
    clock = 61000;
    await press(tester, 'nav-resume');
    clock = 63000;
    final round = roundFor(1);
    for (final d in round.routeDirections) {
      await tester.sendKeyEvent(arrows[rotateCardinal(d, round.mapRotation)]!);
      await tester.pump();
    }
    await tester.pump();
    expect(reports.single['time_seconds'], 3, reason: 'минута паузы выброшена из трёх секунд игры');
  });

  testWidgets('клавиша P и уход приложения в фон ставят партию на паузу', (tester) async {
    await open(tester);
    await toRecall(tester);
    await tester.sendKeyEvent(LogicalKeyboardKey.keyP);
    await tester.pump();
    expect(shown('nav-resume'), isTrue, reason: 'P — пауза');
    await press(tester, 'nav-resume');
    expect(shown('nav-swipe'), isTrue);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    await tester.pump();
    expect(shown('nav-resume'), isTrue, reason: 'приложение ушло с экрана — партия на паузе');
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
  });

  testWidgets('🔴 разбор: три приёма названы словами, стимул — карта игры, ответ посчитан ядром', (tester) async {
    await open(tester);
    expect(shown('game-lesson'), isTrue, reason: 'кнопка разбора есть до партии — учить надо ДО неё');
    final trials = navigatorLessonTrials(nav);
    expect(trials, hasLength(3), reason: 'три режима — три приёма');
    for (final t in trials) {
      expect(t.rule, isNotNull);
      expect(t.rule!.startsWith('teachNavigator'), isFalse, reason: 'приём назван словами, а не ключом: ${t.rule}');
      expect(t.art, isA<NavigatorMap>(), reason: 'стимул — карта самой игры, а не рисунок «похоже»');
      expect(t.answer, isNotEmpty);
    }
    final route = createNavigatorSession(
      const NavigatorSessionConfig(seed: 'navigator-lesson', level: 1, mode: NavigatorMode.routeRecall),
    ).round;
    expect(trials[0].answer,
        route.routeDirections.map((d) => navigatorDirectionGlyphs[rotateCardinal(d, route.mapRotation)]).join(' '),
        reason: 'ответ маршрута — стрелки, посчитанные ядром по той же раздаче');
    final home = createNavigatorSession(
      const NavigatorSessionConfig(seed: 'navigator-lesson', level: 3, mode: NavigatorMode.homeDirection),
    ).round;
    expect(trials[2].answer, contains(nav.home(rotateHomeSector(home.correctHomeSector, home.mapRotation))));
    await press(tester, 'game-lesson');
    await tester.pump(const Duration(milliseconds: 500));   // переход на экран плеера
    expect(find.byType(LessonPlayerScreen), findsOneWidget);
  });

  testWidgets('🔴 разбор ДО раунда партию не портит, посреди раунда — лестница стоит', (tester) async {
    final round = roundFor(1);
    Future<void> finish() async {
      for (final d in round.routeDirections) {
        await tester.sendKeyEvent(arrows[rotateCardinal(d, round.mapRotation)]!);
        await tester.pump();
      }
      await tester.pump();
    }

    Future<void> lessonAndBack() async {
      await press(tester, 'game-lesson');
      tester.state<NavigatorState>(find.byType(Navigator).first).pop();
      await tester.pump(const Duration(milliseconds: 400));
    }

    // До раунда: разбор показал ДРУГИЕ доски — партия засчитывается.
    await open(tester);
    await lessonAndBack();
    await toRecall(tester);
    await finish();
    expect(reports.single['errors'], 0);
    expect(await storedLevel(), 2, reason: 'разбор до раунда не отнимает зачёт');

    // Посреди раунда: разбор смотрели — партия в лестницу не идёт, но в статистику идёт.
    reports.clear();
    GamePreset.set({'level': '1'});
    await open(tester);
    await toRecall(tester);
    await lessonAndBack();
    await finish();
    expect(reports, hasLength(1), reason: 'партия с разбором всё равно уходит в статистику');
    expect(await storedLevel(), 2, reason: 'партия с разбором лестницу не двигает');
  });

  testWidgets('🔴 двенадцать языков: ни на правилах, ни в ответе не показан голый ключ', (tester) async {
    final keys = (jsonDecode(File('assets/l10n/navigator.json').readAsStringSync())['ru'] as Map<String, dynamic>)
        .keys
        .toSet();
    List<String> texts() => tester
        .widgetList<Text>(find.byType(Text))
        .map((t) => t.data ?? t.textSpan?.toPlainText() ?? '')
        .toList();
    for (final code in L.locales) {
      await tester.runAsync(() async {
        await L.load(code);
        await NavigatorStrings.load(locale: code);
      });
      GamePreset.set({'level': '3'});
      await open(tester);
      final seen = [...texts()];
      await toRecall(tester);
      seen.addAll(texts());
      final raw = seen.where((t) => keys.contains(t) || RegExp(r'^(mode|direction|turn|home)\.').hasMatch(t)).toSet();
      expect(raw, isEmpty, reason: '$code: на экране ключи вместо текста');
    }
    await tester.runAsync(() => L.load('ru'));
  });
}
