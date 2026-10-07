import 'dart:io';
import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/picture_pairs/model.dart';

/// «ПАРНЫЕ КАРТИНКИ»: СВОБОДНАЯ ПАРТИЯ И СНИМОК НЕЗАКОНЧЕННОЙ ПАРТИИ.
///
/// 🔴 ФОРМАТ СНИМКА СВЕРЯЕТСЯ С ВЕБ-ИНТЕРФЕЙСОМ, А НЕ С САМИМ СОБОЙ: поля читаются из
/// `interface PairsResume` и `interface Card` в `frontend/app/games/picture-pairs.tsx`.
/// Добавит веб поле — проба покраснеет, и половины гибрида не разъедутся молча: одну и ту же
/// партию человек может начать в одной половине и продолжить в другой.
void main() {
  final tsx = File('../frontend/app/games/picture-pairs.tsx').readAsStringSync();
  Set<String> tsFields(String name) {
    final body = RegExp('interface $name \\{([\\s\\S]*?)\\n\\}').firstMatch(tsx)!.group(1)!;
    return {for (final m in RegExp(r'^\s+(\w+)\??:', multiLine: true).allMatches(body)) m.group(1)!};
  }

  final resumeVersion = int.parse(RegExp(r'const RESUME_V = (\d+);').firstMatch(tsx)!.group(1)!);
  final gameId = RegExp(r"const GAME_ID = '([a-z_]+)';").firstMatch(tsx)!.group(1)!;

  test('🔴 снимок — ровно поля веб-PairsResume и Card, та же версия и тот же ключ игры', () {
    final g = PairsGame(level: 3, rnd: Random(1));
    final snap = pairsSnapshot(g, free: false, score: 0, elapsed: 12.5);
    expect(snap.keys.toSet(), tsFields('PairsResume'));
    expect((snap['cards']! as List).first.keys.toSet(), tsFields('Card'));
    expect(pairsResumeVersion, resumeVersion);
    expect(pairsGameId, gameId);
    expect(snap['mode'], 'game', reason: 'внутренние имена режимов веба: game | single');
    expect(pairsSnapshot(g, free: true, score: 0, elapsed: 0)['mode'], 'single');
  });

  test('свободная партия — всегда пары, без обменов; без фото-показа показа нет', () {
    for (final n in pairsFreeCounts) {
      final g = PairsGame(level: 30, cfg: pairsFreeCfg(pairs: n, photo: true, previewMs: 1500), rnd: Random(n));
      expect(g.cfg.groupSize, 2, reason: 'тройки и четвёрки — оси лестницы, не свободной партии');
      expect(g.cfg.swapsPerMiss, 0, reason: 'обмены после ошибки — тоже ось лестницы');
      expect(g.cards.length, n * 2);
      expect(g.groups, n);
      expect(g.cfg.previewMs, 1500);
    }
    expect(pairsFreeCfg(pairs: 6, photo: false, previewMs: 3000).previewMs, 0);
  });

  test('счёт свободной партии — как в вебе: от 2000, лишний ход 30, секунда 1', () {
    final g = PairsGame(level: 1, cfg: pairsFreeCfg(pairs: 6, photo: false, previewMs: 0), rnd: Random(2))
      ..moves = 9;
    expect(g.extraMoves, 3);
    expect(g.freeScore(40.4), 2000 - 3 * 30 - 40);
    expect((g..moves = 200).freeScore(10), 0, reason: 'не ниже нуля');
  });

  group('подъём снимка', () {
    test('🔴 туда и обратно: тот же расклад, собранное собрано, открытая группа закрыта', () {
      final g = PairsGame(level: 1, rnd: Random(5));
      final sym = g.cards.first.symbol;
      final places = [for (var i = 0; i < g.cards.length; i++) if (g.cards[i].symbol == sym) i];
      for (final i in places) {
        g.tap(i);
      }
      g.settleMatch();
      final other = g.closed.first;
      g.tap(other);   // недособранная группа в момент выхода
      g.errors = 2;
      final live = pairsRestore(pairsSnapshot(g, free: false, score: 120, elapsed: 33.3))!;
      expect(live.game.cards.map((c) => c.symbol).toList(), g.cards.map((c) => c.symbol).toList());
      expect([for (final c in live.game.cards) c.matched], [for (final c in g.cards) c.matched]);
      expect(live.game.cards[other].flipped, isFalse, reason: 'открытая карта не становится подсказкой');
      expect('${live.game.moves} ${live.game.errors} ${live.game.matchedGroups}', '1 2 1');
      expect(live.elapsed, 33.3);
      expect(live.free, isFalse);
      expect(live.game.cfg.groupSize, LevelCfg.of(1).groupSize);
    });

    test('снимок, записанный вебом (тройки L10), поднимается по правилам уровня', () {
      final cards = [
        for (final s in [3, 7, 3, 1, 7, 3, 1, 9, 7, 9, 1, 9]) {'id': 0, 'symbol': s, 'flipped': false, 'matched': false},
      ];
      for (final c in cards.where((c) => c['symbol'] == 3)) {
        c['matched'] = true;
        c['flipped'] = true;
      }
      final web = <String, Object?>{
        'mode': 'game', 'level': 10, 'pairsCount': 4, 'groupSize': 3, 'cards': cards,
        'moves': 5, 'matched': 1, 'errors': 4, 'score': 330, 'elapsed': 41.7,
      };
      final live = pairsRestore(web)!;
      expect(live.game.cfg.groupSize, 3);
      expect(live.game.matchedGroups, 1);
      expect(live.game.moves, 5);
    });

    test('порченый снимок не поднимается — партия начинается честно заново', () {
      Map<String, Object?> base() => pairsSnapshot(PairsGame(level: 1, rnd: Random(9)), free: false, score: 0, elapsed: 1);
      expect(pairsRestore(null), isNull);
      expect(pairsRestore(base()..['cards'] = <Object>[]), isNull, reason: 'пустой расклад');
      expect(pairsRestore(base()..['groupSize'] = 3), isNull, reason: 'размер группы не сходится с уровнем');
      final bad = base();
      ((bad['cards']! as List).first as Map)['symbol'] = 99;
      expect(pairsRestore(bad), isNull, reason: 'картинки вне набора');
      final half = base();
      ((half['cards']! as List).first as Map)['matched'] = true;
      expect(pairsRestore(half), isNull, reason: 'группа собрана наполовину');
    });
  });
}
