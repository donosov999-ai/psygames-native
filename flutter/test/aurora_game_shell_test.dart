import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/app_theme.dart';
import 'package:psygames_flutter/shell/aurora_scope.dart';
import 'package:psygames_flutter/shell/design_template.dart';
import 'package:psygames_flutter/shell/game_shell.dart';
import 'package:psygames_flutter/shell/l10n.dart';

/// 🔴 РАМКА ИГРЫ В «АВРОРЕ» (этап 6а, задача 045be21d; листы 15 и 32, LAYOUT_CORRECTIONS).
///
/// Рамку переводит один раз каркас: шапка «‹ Название», счётчики, нижний ряд с жёлтой
/// круглой паузой слева и экран паузы — в «Авроре», даже когда поле игры ещё классическое.
/// Действия те же, что в Classic: выход, правила, пауза, «Заново», отзыв, оба ухода.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async => L.load('ru'));

  UiTemplate? fieldTemplate;
  var left = 0;

  Future<void> mount(WidgetTester t, UiTemplate template,
      {Size size = const Size(780, 1688), double textScale = 1}) async {
    t.view.physicalSize = size;
    t.view.devicePixelRatio = 2;
    addTearDown(t.view.reset);
    fieldTemplate = null;
    left = 0;
    await t.pumpWidget(MaterialApp(
      theme: applyUiTemplate(classicShellTheme(Brightness.dark), template),
      builder: (context, child) => MediaQuery(
        data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(textScale)),
        child: child!,
      ),
      // Маршрута нет в auroraReadyRoutes — поле остаётся классическим.
      home: AuroraGameScope(
        route: '/games/probe',
        child: GameShell(
          title: 'Судоку',
          onBack: () => left++,
          hud: const [HudItem(label: 'Уровень', value: '24'), HudItem(label: 'Ошибки', value: '0/3')],
          field: (context, h) {
            fieldTemplate = Theme.of(context).extension<UiTemplateTheme>()?.template;
            return const SizedBox.expand(key: Key('probe-field'));
          },
          auxRow: const SizedBox(height: 48, child: Center(child: Text('ПРАВИЛА · ОТМЕНИТЬ'))),
          toolbar: const SizedBox(height: 56, child: Center(child: Text('1 2 3 4 5'))),
          pauseActions: [PauseAction(label: 'Заново', icon: Icons.refresh, onPressed: () {})],
        ),
      ),
    ));
    await t.pump();
  }

  Finder key(String k) => find.byKey(Key(k));

  testWidgets('«Аврора»: «‹» слева от названия, пауза — жёлтая круглая внизу слева, поле классическое', (t) async {
    await mount(t, UiTemplate.aurora);
    expect(key('game-header-aurora'), findsOneWidget);
    expect(t.getTopLeft(key('game-back')).dx, lessThan(t.getTopLeft(key('game-title')).dx));
    expect(find.byTooltip(L.t('teachPause')), findsNothing, reason: 'паузы в шапке «Авроры» нет');

    final pause = t.getRect(key('game-pause'));
    final field = t.getRect(key('game-field'));
    final toolbar = t.getRect(find.text('1 2 3 4 5'));
    expect(pause.top, greaterThanOrEqualTo(field.bottom), reason: 'пауза — под полем');
    expect(pause.top, greaterThanOrEqualTo(toolbar.bottom), reason: 'клавиатура игры — над нижним рядом');
    expect(pause.left, lessThan(t.getRect(find.text('ПРАВИЛА · ОТМЕНИТЬ')).left), reason: 'пауза слева от значков');
    final yellow = t.widget<Material>(key('game-pause'));
    expect(yellow.color, GameShell.pauseYellow);

    final title = t.widget<Text>(key('game-title'));
    expect(title.style?.color, auroraToken('text', dark: true), reason: 'рамка — в «Авроре»');
    // У классической темы метки шаблона нет вовсе (classicShellTheme) — это и есть Classic.
    expect(fieldTemplate, isNot(UiTemplate.aurora), reason: 'поле неготовой игры — классическое');

    await t.tap(key('game-back'));
    expect(left, 1);
  });

  testWidgets('«Аврора»: пауза по листу 15 — карточка, «Продолжить», «Заново», оба ухода', (t) async {
    GameExit.home = () {};
    addTearDown(() => GameExit.home = null);
    await mount(t, UiTemplate.aurora);
    await t.tap(key('game-pause'));
    await t.pumpAndSettle();
    expect(key('pause-card'), findsOneWidget);
    expect(find.descendant(of: key('pause-card'), matching: find.text(L.t('teachPause'))), findsOneWidget);
    expect(find.descendant(of: key('pause-card'), matching: find.text('24')), findsOneWidget);
    expect(find.text('Заново'), findsOneWidget);
    expect(key('pause-home'), findsOneWidget);
    expect(t.getRect(key('pause-leave')).top, t.getRect(key('pause-home')).top, reason: 'два ухода — рядом');
    // Решение Дениса 29.10: главная кнопка паузы — оранжевая по листу 15, не акцент профиля.
    expect(t.widget<Material>(key('pause-resume')).color, GameShell.auroraAction);

    await t.tap(key('pause-resume'));
    await t.pumpAndSettle();
    expect(key('pause-card'), findsNothing);

    await t.tap(key('game-pause'));
    await t.pumpAndSettle();
    await t.tap(key('pause-leave'));
    await t.pumpAndSettle();
    expect(left, 1, reason: '«Выйти» из паузы ведёт тем же выходом');
  });

  testWidgets('Classic: прежняя шапка с паузой, нижнего ряда «Авроры» нет', (t) async {
    await mount(t, UiTemplate.classic);
    expect(key('game-header-aurora'), findsNothing);
    expect(key('game-pause'), findsNothing);
    expect(find.byTooltip(L.t('teachPause')), findsOneWidget);
    expect(fieldTemplate, isNot(UiTemplate.aurora));
  });

  testWidgets('«Аврора»: 320 pt и шрифт ×2 — рамка и пауза без переполнения', (t) async {
    await mount(t, UiTemplate.aurora, size: const Size(640, 1136), textScale: 2);
    expect(t.takeException(), isNull);
    await t.tap(key('game-pause'));
    await t.pumpAndSettle();
    expect(t.takeException(), isNull);
  });
}
