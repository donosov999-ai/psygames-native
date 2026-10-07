import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/hub_screen.dart';
import 'package:psygames_flutter/shell/hybrid_app.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// РАЗВИЛКА «КОНФЛИКТ ВНИМАНИЯ» — ЧТО ВИДИТ И ЧТО НАЖИМАЕТ ЧЕЛОВЕК.
/// Состав и переводы стережёт `attention_conflict_hub_test.dart`, здесь — экран.
///
/// 🔴 ЭКРАН БЕРЁТСЯ ИЗ КАРТЫ ПЕРЕХВАТА, А НЕ СОБИРАЕТСЯ В ПРОБЕ ЗАНОВО. Проба,
/// строящая свой `HubScreen` с теми же параметрами, проверяла бы свою копию:
/// в регистрации поменяют адрес состава или потеряют `isNative`, а проба останется
/// зелёной, потому что копия осталась прежней.
///
/// ⚠️ ТРИ ГРАБЛИ, КАЖДАЯ СТОИЛА ПРОГОНА 24.09.2026:
/// · развилка читает ассет асинхронно, и в поддельном времени `testWidgets` не
///   дочитывает его — экран пуст. Поднимается в `runAsync`, как у соседей
///   (`hub_layout_matches_web_test.dart`);
/// · список карточек ЛЕНИВЫЙ (`ListView`): девятая карточка за краем экрана и
///   без прокрутки в дереве её НЕТ;
/// · видимые карточки и их значки считаются ОДНИМ прибором (`find`): `allWidgets`
///   видит и построенное за краем, `find` — нет, и сравнение двух приборов краснеет
///   на исправном экране.
/// И одна оконная проба на файл: соседние `testWidgets` мешали друг другу
/// незавершённой загрузкой — первая зелёная, остальные красные, каждая поодиночке
/// проходит.
void main() {
  const hub = '/games/attention-conflict';
  late SharedState state;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
    await L.load('ru');
  });

  /// Состав — ожидание, а не источник: читать ассет в оконной пробе нельзя.
  const routes = [
    '/games/stroop', '/games/flanker', '/games/cpt', '/games/targets', '/games/wcst',
    '/games/inhibition', '/games/posner', '/games/prl', '/games/proofreading',
  ];

  testWidgets('🔴 развилка: заголовок, названия вместо ключей, значок «нативно», все девять, возврат маршрута',
      (tester) async {
    Future<void> settle(Finder until) async {
      await tester.runAsync(() async {
        for (var i = 0; i < 80; i++) {
          await tester.pump(const Duration(milliseconds: 30));
          await Future<void>.delayed(const Duration(milliseconds: 15));
          if (until.evaluate().isNotEmpty) break;
        }
      });
      await tester.pump();
    }

    await tester.runAsync(() => tester.pumpWidget(MaterialApp(home: HybridApp.native[hub]!(state))));
    await settle(find.byType(ListView));

    // ⚠️ Название встречается ДВАЖДЫ — в строке приложения и в градиентном
    // заголовке. Это не дубль: проба обязана это знать, иначе краснеет исправное.
    expect(find.text('Конфликт внимания'), findsNWidgets(2), reason: 'развилка загрузилась');

    // НАЗВАНИЯ, А НЕ КЛЮЧИ: ключ — тоже строка и проходит любую проверку
    // «карточка на месте». Сверка с переводом из того же словаря, что у экрана.
    for (final k in ['suiteStroop', 'suiteArrows', 'suiteStream', 'targets', 'wcst']) {
      final name = L.t(k);
      expect(name, isNot(k), reason: 'ключ $k не переведён');
      // С 07.10 над карточками стоит поиск (решение Дениса 04.10, 99628ecf) — нижние за краем.
      await tester.scrollUntilVisible(find.text(name), 120, scrollable: find.byType(Scrollable).first);
      expect(find.text(name), findsWidgets, reason: 'на карточке «$name», а не ключ $k');
    }

    // Назад к началу развилки: заголовок есть и в верхней панели, искать по нему нельзя.
    await tester.fling(find.byType(Scrollable).first, const Offset(0, 3000), 5000);
    await tester.pumpAndSettle();
    // ЗНАЧОК «НАТИВНО» У КАЖДОЙ ВИДИМОЙ КАРТОЧКИ — обе стороны одним прибором.
    final cards = find.byWidgetPredicate((w) =>
        w.key is ValueKey<String> && (w.key! as ValueKey<String>).value.startsWith('hub-card-'));
    final visible = cards.evaluate().length;
    // Порог — «построились», а не «сколько влезло»: с 07.10 над карточками поиск и фильтр
    // (решение Дениса 04.10), на первом экране их три. Все девять проверяются прокруткой ниже.
    expect(visible, greaterThan(1), reason: 'карточки вообще построились');
    expect(find.byIcon(Icons.bolt), findsNWidgets(visible),
        reason: 'значок «нативно» у каждой видимой карточки');

    // ВСЕ ДЕВЯТЬ — с прокруткой: последние за краем экрана.
    for (final r in routes) {
      final card = find.byKey(ValueKey('hub-card-$r'));
      await tester.scrollUntilVisible(card, 120, scrollable: find.byType(Scrollable).first);
      expect(card, findsOneWidget, reason: 'карточка $r на экране');
    }

    // ── НАЖАТИЕ: развилка НЕ открывает игру сама, она возвращает маршрут оболочке.
    // Иначе ей пришлось бы знать и карту нативных экранов, и веб-адреса, то есть
    // быть второй оболочкой.
    Object? picked;
    await tester.runAsync(() => tester.pumpWidget(MaterialApp(
          home: Builder(
            builder: (context) => Scaffold(
              body: Center(
                child: ElevatedButton(
                  onPressed: () async {
                    picked = await Navigator.of(context).push<Object>(
                      MaterialPageRoute<Object>(builder: (_) => HybridApp.native[hub]!(state)),
                    );
                  },
                  child: const Text('open'),
                ),
              ),
            ),
          ),
        )));
    await tester.tap(find.text('open'));
    await settle(find.byType(ListTile));
    // Карточку сперва прокрутить в видимую зону, как выше: с 30.09.2026 шапка
    // развилки несёт описание из веба («Подавление автоматического…»), с 07.10 над
    // карточками ещё и поиск — последняя карточка не построена, пока до неё не долистали.
    await tester.scrollUntilVisible(find.byKey(const ValueKey('hub-card-/games/wcst')), 120,
        scrollable: find.byType(Scrollable).first);
    // Построена — ещё не значит целиком на экране: середина могла остаться за краем.
    await tester.ensureVisible(find.byKey(const ValueKey('hub-card-/games/wcst')));
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('hub-card-/games/wcst')));
    await settle(find.text('open'));

    expect(picked, isA<HubCardTap>(), reason: 'развилка вернула выбор наверх');
    expect((picked! as HubCardTap).route, '/games/wcst');
  });
}
