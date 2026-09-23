import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/level_ladder.dart';
import 'package:psygames_flutter/shell/session_report.dart';

/// ПАРТИЯ, СЫГРАННАЯ НАТИВНО, ДОЕЗЖАЕТ ДО ВЕБ-ПОЛОВИНЫ.
///
/// 🔴 ЧТО ЛОВИТ. Перенесённые экраны писали только уровень и ничего больше.
/// Зарядка двигает шаг по подписке на сохранение партии — и вставала намертво:
/// замер раздела «Зарядки» 23.09.2026, 104 шага из 891 ведут в перенесённую игру,
/// каждый девятый. Человек проходит игру, а серия стоит. Счётчик завершённых
/// партий читает те же записи — 36 нативных игр давали статистике НОЛЬ.
///
/// ⚠️ ПОЧЕМУ ПРОБА СМОТРИТ НА ЛЕСТНИЦУ, А НЕ НА ЭКРАН. Лестница — единственное
/// место, которое зовёт КАЖДАЯ из 36 игр в конце круга. Проверять это по экранам
/// значило бы писать тридцать шесть проб и всё равно пропустить тридцать седьмую.
void main() {
  late List<Map<String, Object?>> sent;

  setUp(() {
    sent = [];
    SessionReport.sink = (json) async => sent.add(jsonDecode(json) as Map<String, Object?>);
  });
  tearDown(() => SessionReport.sink = null);

  LevelLadder ladder() => LevelLadder(gameId: 'digit_span', store: MemoryLevelStore());

  test('🔴 победа отправляет партию наверх', () async {
    final l = ladder();
    await l.load();
    await l.win(score: 7, timeSeconds: 42);
    expect(sent, hasLength(1));
    expect(sent.single['game_type'], 'digit_span');
    expect(sent.single['score'], 7);
    expect(sent.single['time_seconds'], 42);
  });

  test('🔴 ПРОИГРАННАЯ партия отправляется тоже — иначе шаг зарядки не сдвинется', () async {
    final l = ladder();
    await l.load();
    await l.fail(score: 0, timeSeconds: 15, errors: 3);
    expect(sent, hasLength(1),
        reason: 'человек, проваливший шаг серии, застрял бы на нём навсегда');
    expect(sent.single['errors'], 3);
  });

  test('имя игры — то же, что у веб-версии, иначе партия уедет под чужую игру', () async {
    for (final id in ['digit_span', 'chess_blind', 'one_line']) {
      sent.clear();
      final l = LevelLadder(gameId: id, store: MemoryLevelStore());
      await l.load();
      await l.win();
      expect(sent.single['game_type'], id);
    }
  });

  test('трудность едет номером уровня — статистике нужен уровень, а не «сложно»', () async {
    final l = ladder();
    await l.load();
    await l.win();          // уровень стал 2
    expect(sent.single['difficulty'], '2');
  });

  test('без приёмника лестница работает молча и не падает', () async {
    SessionReport.sink = null;
    final l = ladder();
    await l.load();
    await l.win(score: 1, timeSeconds: 1);
    expect(l.level, 2, reason: 'уровень всё равно поднялся');
    expect(SessionReport.installed, isFalse);
  });

  test('🔴 у КАЖДОГО круга есть отчёт: три круга — три партии', () async {
    final l = ladder();
    await l.load();
    await l.win(score: 1, timeSeconds: 1);
    await l.fail(score: 0, timeSeconds: 2);
    await l.win(score: 3, timeSeconds: 3);
    expect(sent, hasLength(3));
  });
}
