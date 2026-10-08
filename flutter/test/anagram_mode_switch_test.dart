import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/anagrams/all_words_board.dart';
import 'package:psygames_flutter/games/anagrams/board.dart';
import 'package:psygames_flutter/games/anagrams/crossword_board.dart';
import 'package:psygames_flutter/games/anagrams/mode_switch.dart';
import 'package:psygames_flutter/games/anagrams/mode_thumbs.dart';
import 'package:psygames_flutter/games/anagrams/mode_thumbs.g.dart';
import 'package:psygames_flutter/games/anagrams/ring_board.dart';
import 'package:psygames_flutter/games/anagrams/word_lang.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/hub_screen.dart' show HubCardTap;
import 'package:psygames_flutter/shell/hybrid_app.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/restart_scope.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 ВЫБОР РЕЖИМА АНАГРАММ — ВСЕ ЧЕТЫРЕ ИГРЫ ДОСТИЖИМЫ.
///
/// 📍 Замер 08.10.2026 по main c50a0f15d: ключи `/games/anagrams?mode=all|cross|square|classic` не
/// упомянуты нигде — ни в развилках, ни в наборах, ни в каталоге, ни в коде экранов. Развилка «Слова»
/// ведёт на `/games/anagrams` → нативная классика, а режим в вебе выбирали на экране настройки, который
/// в приложении не показывается. «Все слова», кроссворд и квадрат с переезда (30.09) были недостижимы.
/// Из десяти нативных ключей с хвостом недостижимыми были ровно эти четыре.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  Future<SharedState> stateOf(String profile) async {
    SharedPreferences.setMockInitialValues({'psygames_active_profile': profile});
    return SharedState.open();
  }

  setUp(() async {
    GamePreset.clear();
    await L.load('ru');
  });
  tearDown(GamePreset.clear);

  final screens = <({AnagramMode mode, Type board})>[
    (mode: AnagramMode.classic, board: AnagramBoard),
    (mode: AnagramMode.all, board: AllWordsBoard),
    (mode: AnagramMode.cross, board: CrosswordBoard),
    (mode: AnagramMode.square, board: RingBoard),
  ];

  Future<void> waitFor(WidgetTester tester, Finder f) async {
    await tester.runAsync(() async {
      for (var i = 0; i < 200; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 50));
        if (f.evaluate().isNotEmpty) break;
      }
    });
    await tester.pump();
    expect(f, findsOneWidget, reason: 'не дождались: $f');
  }

  /// Экран открывается так же, как его открывает оболочка: картой перехвата и поверх другого
  /// экрана — чтобы было видно, с чем он закрывается.
  Future<Future<Object?> Function()> harness(WidgetTester tester, SharedState state, AnagramMode mode) async {
    Object? result;
    var closed = false;
    final route = anagramModeRoute(mode);
    await tester.pumpWidget(MaterialApp(
      home: Builder(
        builder: (ctx) => Scaffold(
          body: Center(
            child: TextButton(
              onPressed: () async {
                result = await Navigator.of(ctx).push<Object>(MaterialPageRoute(
                  builder: (_) => RestartScope(builder: (_) => HybridApp.native[route]!(state)),
                ));
                closed = true;
              },
              child: const Text('open'),
            ),
          ),
        ),
      ),
    ));
    return () async => closed ? result : null;
  }

  for (final s in screens) {
    testWidgets('🔴 ${s.mode.name}: «Режим» в ряду значков, лист из четырёх режимов, выбор открывает игру режима',
        (tester) async {
      final state = await stateOf('kids');
      final result = await harness(tester, state, s.mode);
      await tester.tap(find.text('open'));
      await waitFor(tester, find.byType(s.board));

      expect(find.byKey(const Key('anagram-mode-switch')), findsOneWidget, reason: 'выбора режима нет — три игры недостижимы');
      await tester.tap(find.byKey(const Key('anagram-mode-switch')));
      await tester.pumpAndSettle();

      // Порядок и подписи — как у веб-переключателя.
      final tiles = [for (final m in anagramModesInOrder) find.byKey(Key('anagram-mode-${m.name}'))];
      for (final t in tiles) {
        expect(t, findsOneWidget);
      }
      final ys = [for (final t in tiles) tester.getTopLeft(t).dy];
      expect([...ys]..sort(), ys, reason: 'порядок режимов не как у веба: классика, квадрат, «Все слова», кроссворд');
      expect(find.text(L.t('classicLabel')), findsWidgets);
      expect(tester.widget<ListTile>(find.byKey(Key('anagram-mode-${s.mode.name}'))).selected, isTrue,
          reason: 'текущий режим не отмечен');

      // Картинка — под профиль: детям пластик.
      final thumb = tester.widget<Image>(find.byKey(const Key('anagram-mode-thumb-square')));
      expect((thumb.image as AssetImage).assetName, 'assets/anagram_modes/square__kids.webp');

      // Выбор другого режима закрывает экран с маршрутом режима — оболочка его откроет.
      final other = anagramModesInOrder.firstWhere((m) => m != s.mode);
      await tester.tap(find.byKey(Key('anagram-mode-${other.name}')));
      await tester.pumpAndSettle();
      final got = await result();
      expect(got, isA<HubCardTap>(), reason: 'экран не закрылся с переходом');
      expect((got! as HubCardTap).route, anagramModeRoute(other));
      expect(HybridApp.native.containsKey((got as HubCardTap).route), isTrue, reason: 'маршрут режима не нативный');
    });
  }

  testWidgets('на шаге зарядки выбора режима нет — игру задаёт шаг', (tester) async {
    final state = await stateOf('nzt48');
    GamePreset.set({'wu': '1'});
    await harness(tester, state, AnagramMode.classic);
    await tester.tap(find.text('open'));
    await waitFor(tester, find.byType(AnagramBoard));
    expect(find.byKey(const Key('anagram-mode-switch')), findsNothing);
  });

  test('картинки режимов — копии веба байт в байт, карта стилей — как в вебе', () {
    for (final m in anagramThumbModesData) {
      for (final st in anagramThumbStylesData) {
        final ours = File('assets/anagram_modes/${m}__$st.webp');
        final web = File('../frontend/assets/images/anagram-modes/${m}__$st.webp');
        expect(ours.existsSync(), isTrue, reason: '${ours.path} — перезапусти tools/embed-anagram-modes.mjs');
        expect(ours.readAsBytesSync(), web.readAsBytesSync(), reason: '$m/$st разошлась с вебом');
      }
    }
    final ts = File('../frontend/src/games/anagrams/core/modeThumbs.ts').readAsStringSync();
    final block = RegExp(r'const СТИЛЬ_ПРОФИЛЯ[^{]*\{([\s\S]*?)\};').firstMatch(ts)![1]!;
    final web = {for (final m in RegExp(r"(\w+):\s*'(\w+)'").allMatches(block)) m[1]!: m[2]!};
    expect(anagramThumbProfileStyleData, web, reason: 'карта стилей разошлась с вебом — перезапусти экспортёр');
    expect(profileThumbStyle('unknown-profile'), anagramThumbFallbackStyleData);
    expect(anagramModeThumb(AnagramMode.cross, 'chess'), 'assets/anagram_modes/cross__chess.webp');
  });

  test('🔴 каждый нативный ключ с хвостом достижим: развилка, набор, каталог или переключатель экрана', () {
    final assets = [
      for (final f in ['assets/hubs.json', 'assets/game_suites.json', 'assets/catalog.json']) File(f).readAsStringSync(),
    ].join('\n');
    final switches = {for (final m in AnagramMode.values) anagramModeRoute(m)};
    // Входы зарядки (`warmupEntries.ts`): серия блоков шлёт `/games/schulte?auto=1&series=1`, и разбор
    // адреса (`HybridApp.routeOf`) ведёт её на ключ `?series=1` — по подмножеству хвоста, так и сверяем.
    final warmup = File('../frontend/src/services/warmupEntries.ts').readAsStringSync();
    final warmupRoutes = [
      for (final m in RegExp(r"pathname: '(/games/[^']+)', params: \{([^}]*)\}").allMatches(warmup))
        MapEntry(m[1]!, {for (final p in RegExp(r"(\w+): '([^']*)'").allMatches(m[2]!)) p[1]!: p[2]!}),
    ];
    expect(warmupRoutes, isNotEmpty, reason: 'входы зарядки не прочитаны — разбор warmupEntries.ts устарел');
    bool fromWarmup(String key) {
      final u = Uri.parse(key);
      return warmupRoutes.any((r) => r.key == u.path && u.queryParameters.entries.every((e) => r.value[e.key] == e.value));
    }

    final unreachable = <String>[];
    for (final key in HybridApp.native.keys.where((k) => k.contains('?'))) {
      final variants = {key, key.replaceAll(' ', '%20'), key.replaceAll('%20', ' ')};
      final listed = variants.any((v) => assets.contains(jsonEncode(v)) || assets.contains(v));
      if (!listed && !switches.contains(key) && !fromWarmup(key)) unreachable.add(key);
    }
    expect(unreachable, isEmpty, reason: 'нативный экран есть, а дойти до него неоткуда');
  });
}
