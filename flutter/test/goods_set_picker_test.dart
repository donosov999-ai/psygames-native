import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/goods_sort/board.dart';
import 'package:psygames_flutter/games/goods_sort/screen.dart';
import 'package:psygames_flutter/games/goods_sort/sets.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 ВЫБОР НАБОРА ТОВАРОВ ДОЕХАЛ ДО ЧЕЛОВЕКА (решение Дениса 25.09.2026).
///
/// 📍 ЧТО БЫЛО ЗАМЕРЕНО ДО ПРАВКИ: в вебе шесть наборов со своими пулами (34 · 6 ·
/// 8 · 8 · 9 · 12 видов), в выгрузке для приложения — ОДИН (`set: "mix"`), фазы
/// настройки у перенесённого экрана нет вовсе. То есть выбор был потерян целиком,
/// а 44 спрайта товаров при этом уже ехали в сборке: картинки для пяти скрытых
/// наборов лежали на месте и не показывались.
///
/// ⚠️ ПРОБА СМОТРИТ НА ДОСКУ, А НЕ НА НАДПИСЬ. «Набор выбран» — это не подпись в
/// витрине, а ТОВАРЫ, которые приехали на полки: после выбора «Еды» на доске не
/// может быть ни одного вида вне её шести. Проверка подписи зеленела бы и на
/// экране, который витрину показывает, а лестницу берёт прежнюю.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  Future<SharedState> phone(WidgetTester tester, {String profile = 'nzt48', int best = 30}) async {
    tester.view.physicalSize = const Size(780, 1688);
    tester.view.devicePixelRatio = 2;
    addTearDown(tester.view.reset);
    SharedPreferences.setMockInitialValues({
      'psygames_active_profile': profile,
      'psygames_goods_sort_level_$profile': '$best',
      'psygames_goods_sort_best_$profile': '$best',
    });
    return SharedState.open();
  }

  Future<void> boot(WidgetTester tester, SharedState state) async {
    await tester.runAsync(() async {
      await tester.pumpWidget(MaterialApp(home: GoodsSortScreen(state: state)));
      for (var i = 0; i < 60; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 20));
        if (find.byKey(const Key('goods-set-pick')).evaluate().isNotEmpty) break;
      }
    });
    await tester.pump();
  }

  test('🔴 каталог обещает ровно те файлы, что лежат на диске', () {
    final catalogue = GoodsSets.fromJsonString(File('assets/levels/goods_sets.json').readAsStringSync());
    expect(catalogue.sets.length, 6, reason: 'наборов должно быть шесть, как в вебе');
    final missing = <String>[];
    for (final s in catalogue.sets) {
      final f = File('assets/levels/${s.file}');
      if (!f.existsSync()) { missing.add('${s.key}: нет ${s.file}'); continue; }
      final j = jsonDecode(f.readAsStringSync()) as Map<String, dynamic>;
      // Лестница обязана быть ИМЕННО этого набора: имя файла ничего не доказывает.
      if (j['set'] != s.key) missing.add('${s.key}: в файле набор ${j['set']}');
      final pool = (j['pool'] as List).cast<int>();
      if (pool.length != s.pool.length) missing.add('${s.key}: пул ${pool.length} вместо ${s.pool.length}');
      // И товары в раздаче — только из своего пула.
      for (final lv in (j['levels'] as List).cast<Map<String, dynamic>>()) {
        final outside = (lv['cells'] as List)
            .expand((c) => (c as List).cast<int>())
            .where((t) => !pool.contains(t));
        if (outside.isNotEmpty) {
          missing.add('${s.key} L${lv['level']}: товар вне пула ${outside.first}');
          break;
        }
      }
    }
    // ignore: avoid_print
    print('КАТАЛОГ: ${catalogue.sets.map((s) => '${s.key} ${s.pool.length}в с L${s.unlockLevel}').join(' · ')}');
    expect(missing, isEmpty);
  });

  test('🔴 набор по умолчанию НИКОГДА не бывает запертым', () {
    final catalogue = GoodsSets.fromJsonString(File('assets/levels/goods_sets.json').readAsStringSync());
    final bad = <String>[];
    // Все профили из таблицы плюс неизвестный, и уровни вокруг каждого порога.
    final profiles = <String?>[...catalogue.byProfile.keys, 'незнакомый', null];
    for (final p in profiles) {
      for (final reached in [1, 5, 6, 9, 10, 11, 12, 17, 18, 60]) {
        final key = catalogue.defaultFor(p, reached);
        if (!catalogue.available(key, reached)) {
          bad.add('$p на потолке $reached получил запертый $key');
        }
      }
    }
    expect(bad, isEmpty);
    // И встречно: на высоком потолке профиль получает СВОЙ набор, а не запасной —
    // иначе «никогда не заперт» выполнялось бы функцией «всегда Микс».
    final own = <String>[];
    catalogue.byProfile.forEach((p, want) {
      if (catalogue.defaultFor(p, 60) != want) own.add('$p: ${catalogue.defaultFor(p, 60)} вместо $want');
    });
    expect(own, isEmpty);
  });

  testWidgets('🔴 витрина открывается из партии и показывает все шесть наборов', (tester) async {
    final state = await phone(tester);
    await boot(tester, state);
    expect(find.byKey(const Key('goods-set-pick')), findsOneWidget, reason: 'кнопки витрины нет');

    await tester.tap(find.byKey(const Key('goods-set-pick')));
    await tester.pumpAndSettle();
    final catalogue = GoodsSets.fromJsonString(File('assets/levels/goods_sets.json').readAsStringSync());
    final screen = tester.view.physicalSize / tester.view.devicePixelRatio;
    final hidden = <String>[];
    for (final s in catalogue.sets) {
      final row = find.byKey(Key('goods-set-${s.key}'));
      expect(row, findsOneWidget,
          reason: 'в витрине нет набора ${s.key} — запертые ПОКАЗЫВАЮТСЯ, а не скрываются');
      /*
       * ⚠️ «ЕСТЬ В ДЕРЕВЕ» НЕ ЗНАЧИТ «ВИДНО». У листа снизу потолок — половина
       * экрана, и шестая строка уезжала за край: проба на findsOneWidget была
       * зелёной, а «Зверят» человек не видел. Мерим прямоугольник.
       */
      final r = tester.getRect(row);
      if (r.bottom > screen.height + 0.5 || r.height <= 0) {
        hidden.add('${s.key}: низ ${r.bottom.toStringAsFixed(0)} при экране ${screen.height.toStringAsFixed(0)}');
      }
    }
    // ignore: avoid_print
    print('ВИТРИНА: ${catalogue.sets.length} строк, за краем ${hidden.length}');
    expect(hidden, isEmpty, reason: 'строки витрины за краем экрана: $hidden');
  });

  testWidgets('🔴 в витрине НЕТ ключей словаря вместо имён', (tester) async {
    /*
     * ⚠️ `L.t` при промахе возвращает САМ КЛЮЧ, а не падает: человек увидел бы в
     * витрине `goodsSet_food`, и проба на «шесть строк есть» осталась бы зелёной.
     * Сборщик словаря берёт из исходника только литералы `L.t('…')`, и ключ,
     * собранный из частей, в `assets/l10n/<язык>.json` не попадает вовсе — ровно
     * так
     * уже уезжали в сборку четыре ключа из пяти в разборе этой игры.
     */
    await L.load('ru');
    // ⚠️ ПОТОЛОК НИЗКИЙ НАМЕРЕННО: на потолке 30 открыты ВСЕ шесть наборов, и
    // подписи «с N-го уровня» не существует — проба проверяла бы пустоту. На
    // пятом открыт только «Микс», и заперты все пять остальных.
    final state = await phone(tester, best: 5);
    await boot(tester, state);
    await tester.tap(find.byKey(const Key('goods-set-pick')));
    await tester.pumpAndSettle();

    final shown = <String>[];
    for (final e in find.byType(Text).evaluate()) {
      final t = (e.widget as Text).data;
      if (t != null && t.contains('goodsSet')) shown.add(t);
    }
    final all = <String>[];
    for (final e in find.byType(Text).evaluate()) {
      final t = (e.widget as Text).data;
      if (t != null) all.add(t);
    }
    // ignore: avoid_print
    print('СЫРЫХ КЛЮЧЕЙ В ВИТРИНЕ: ${shown.length} · ВИДНО: ${all.join(' | ')}');
    expect(shown, isEmpty, reason: 'в витрине показан ключ словаря: $shown');
    // И имена правда пришли из словаря, а не из запасного русского поля.
    expect(find.text('Еда'), findsOneWidget);
    for (final when in ['с 6-го уровня', 'с 10-го уровня', 'с 12-го уровня', 'с 18-го уровня']) {
      expect(find.textContaining(when), findsWidgets,
          reason: 'у запертого набора нет срока «$when» — обещание без срока хуже отсутствия');
    }
  });

  testWidgets('🔴 выбор набора меняет ТОВАРЫ НА ДОСКЕ, а не только подпись', (tester) async {
    final state = await phone(tester);
    await boot(tester, state);
    final catalogue = GoodsSets.fromJsonString(File('assets/levels/goods_sets.json').readAsStringSync());
    final food = catalogue.byKey('food');

    await tester.tap(find.byKey(const Key('goods-set-pick')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('goods-set-food')));
    await tester.runAsync(() async {
      for (var i = 0; i < 40; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 20));
      }
    });
    await tester.pump();

    final field = tester.widget<GoodsField>(find.byType(GoodsField));
    final items = field.board.cells.expand((c) => c).toSet();
    // ignore: avoid_print
    print('ПОСЛЕ ВЫБОРА «Еды»: на доске виды ${(items.toList()..sort()).join(',')} '
        'при пуле ${food.pool.join(',')}');
    expect(items, isNotEmpty, reason: 'доска пуста — сравнивать нечего');
    expect(items.where((t) => !food.pool.contains(t)), isEmpty,
        reason: 'на доске товары вне набора «Еда» — лестница осталась прежней');
    // И выбор запомнен: следующий заход откроет игру этим набором.
    expect(state.get('psygames_goods_sort_set_nzt48'), 'food');
  });
}
