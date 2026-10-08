import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/game_rules.dart';
import 'package:psygames_flutter/shell/game_shell.dart';
import 'package:psygames_flutter/shell/l10n.dart';

/// 🔴 ОТЗЫВ ИЗ ИГРЫ ДОСТУПЕН СРАЗУ — без прокрутки и без поиска (задача e780e5b0).
///
/// 2.56.11: в нативной игре написать отзыв было нельзя вовсе — плавающая веб-кнопка
/// осталась под экраном игры. 2.56.12 дал пункт паузы, но над ним встал блок правил
/// до 280 px, и пункт ушёл за нижний край: его находила только проба с `ensureVisible`.
/// Тестировщик «Релакс» трижды писал «куда исчезло окошко для отзыва».
void main() {
  setUpAll(() async {
    await L.load('en');
    await GameRules.load();
  });
  tearDown(() {
    GameExit.feedback = null;
    GameRules.currentRoute = null;
    GameShell.feedbackState = null;
  });

  void size(WidgetTester tester, Size s) {
    tester.view.physicalSize = s;
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
  }

  testWidgets('шапка игры: значок отзыва есть и открывает форму', (tester) async {
    var opened = 0;
    GameExit.feedback = () => opened++;
    await tester.pumpWidget(MaterialApp(home: GameShell(title: 'Game', field: (_, _) => const SizedBox.shrink())));
    final icon = find.byKey(const Key('game-feedback'));
    expect(icon, findsOneWidget, reason: 'значок отзыва в шапке нативной игры');
    await tester.tap(icon);
    expect(opened, 1);
  });

  testWidgets('без обработчика отзыва значка нет — пустой кнопки не рисуем', (tester) async {
    await tester.pumpWidget(MaterialApp(home: GameShell(title: 'Game', field: (_, _) => const SizedBox.shrink())));
    expect(find.byKey(const Key('game-feedback')), findsNothing);
  });

  testWidgets('320×568: полная шапка с отзывом не переполняется', (tester) async {
    size(tester, const Size(320, 568));
    GameExit.feedback = () {};
    GameRules.currentRoute = '/games/hanoi';
    await tester.pumpWidget(MaterialApp(home: GameShell(
      title: 'A rather long game title',
      onLesson: () {},
      field: (_, _) => const SizedBox.shrink(),
    )));
    expect(find.byKey(const Key('game-feedback')), findsOneWidget);
    expect(tester.takeException(), isNull, reason: 'ряд шапки уместился');
  });

  testWidgets('пауза игры с правилами: отзыв виден без прокрутки на 360×640', (tester) async {
    size(tester, const Size(360, 640));
    GameExit.feedback = () {};
    GameRules.currentRoute = '/games/hanoi';
    // Как у «Судоку»: «Заново», пилот, три дороги, стиль цифр — шесть действий раздела
    // под блоком правил. Именно они уводили отзыв за край в 2.56.12.
    await tester.pumpWidget(MaterialApp(home: GameShell(
      title: 'Hanoi',
      pauseActions: [
        for (final a in ['Start over', 'Generated levels', 'Easier', 'Standard', 'Harder', 'Digit style'])
          PauseAction(label: a, icon: Icons.circle_outlined, onPressed: () {}),
      ],
      field: (_, _) => const SizedBox.shrink(),
    )));
    await tester.tap(find.byTooltip(L.t('teachPause')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('pause-rules')), findsOneWidget, reason: 'у игры есть правила — блок стоит');
    for (final k in ['pause-resume', 'pause-feedback']) {
      final r = tester.getRect(find.byKey(Key(k)));
      expect(r.bottom <= 640, isTrue, reason: '$k на экране без прокрутки: низ ${r.bottom}');
    }
  });

  // Задача 75348e44: отзыв из нативной игры не говорил, на каком уровне и с какими счётчиками
  // это словили, — ни один экран не публиковал состояние. Снимок делает шапка.
  testWidgets('🔴 в момент отзыва каркас знает заголовок и счётчики шапки — они уходят в game_state', (tester) async {
    Map<String, Object?>? seen;
    GameExit.feedback = () => seen = GameShell.feedbackState;
    await tester.pumpWidget(MaterialApp(home: GameShell(
      title: 'Anagrams',
      hud: const [HudItem(label: 'Level', value: '12'), HudItem(label: 'Errors', value: '1/3')],
      field: (_, _) => const SizedBox.shrink(),
    )));
    await tester.tap(find.byKey(const Key('game-feedback')));
    expect(seen, {
      'title': 'Anagrams',
      'hud': {'Level': '12', 'Errors': '1/3'},
    });
  });
}
