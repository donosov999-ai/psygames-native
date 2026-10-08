import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/hybrid_app.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/level_rules.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 ПЕРЕПИСЬ: КАЖДАЯ ПЕРЕНЕСЁННАЯ ИГРА С ПРАВИЛАМИ УРОВНЯ ОБЪЯВЛЯЕТ ИХ.
///
/// Каркас умеет показать карточку правила, но только если экран передал ему, где он
/// (`GameShell(levelRule: …)`). Забыть это в одном из шестнадцати экранов — значит
/// снова включать механику молча, и проба самого каркаса этого не увидит.
///
/// Поэтому экран поднимается ТЕМ ЖЕ путём, что у человека, — по карте перехвата гибрида,
/// на уровне, где правило уже действует, — и обязан показать значок правила в шапке и
/// саму карточку (в начале партии момент спокойный).
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const games = {
    '/games/goods-sort': 'goods_sort',
    '/games/math-sprint': 'math_sprint',
    '/games/mahjong': 'mahjong',
    '/games/water-sort': 'water_sort',
    '/games/memory-matrix': 'memory_matrix',
    '/games/cpt': 'cpt',
    '/games/digit-span': 'digit_span',
    '/games/spatial-span': 'spatial_span',
    '/games/corsi': 'corsi',
    '/games/hanoi': 'hanoi',
    '/games/stroop': 'stroop',
    '/games/word-pairs': 'word_pairs',
    '/games/cake-sort': 'cake_sort',
    '/games/mental-rotation': 'mental_rotation',
    '/games/ospan': 'ospan',
    '/games/switching-task': 'switching_task',
    '/games/visual-search': 'visual_search',
  };

  setUpAll(() async {
    await L.load('ru');
    LevelRules.debugSetTable(null);
    await LevelRules.load();
  });

  /// Первый уровень, на котором у игры действует правило.
  int firstRuleLevel(String gameId) {
    for (var level = 1; level <= 400; level++) {
      if (LevelRules.activeKey(gameId, level) != null) return level;
    }
    fail('у $gameId в таблице нет ни одного правила — переписывать нечего');
  }

  for (final e in games.entries) {
    testWidgets('${e.value}: на уровне с правилом — значок в шапке и карточка', (tester) async {
      final level = firstRuleLevel(e.value);
      SharedPreferences.setMockInitialValues({
        'psygames_active_profile': 'nzt48',
        'psygames_${e.value}_level_nzt48': '$level',
      });
      final state = await SharedState.open();
      final build = HybridApp.native[e.key];
      expect(build, isNotNull, reason: '${e.key} нет в карте перехвата');

      await tester.pumpWidget(MaterialApp(home: build!(state)));
      // Экраны грузят свои ассеты уровней НАСТОЯЩИМ вводом-выводом (у «Пробирок» банк за
      // 50 КБ уходит в compute), поддельное время пробы его не ждёт: без runAsync пять
      // экранов из 16 так и стояли на загрузке, и перепись видела «правило не передано».
      for (var i = 0; i < 40 && find.byKey(const Key('game-level-rule')).evaluate().isEmpty; i++) {
        await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 25)));
        await tester.pump(const Duration(milliseconds: 100));
      }
      for (var i = 0; i < 5; i++) {
        await tester.pump(const Duration(milliseconds: 100));
      }

      expect(find.byKey(const Key('game-level-rule')), findsOneWidget,
          reason: '${e.value} на уровне $level не передал каркасу правило уровня');
      expect(find.byKey(const Key('level-rule-card')), findsOneWidget,
          reason: '${e.value}: в начале партии карточка правила обязана открыться сама');
      await tester.pumpWidget(const SizedBox());   // экран уходит — таймеры игры гаснут
    });
  }
}
