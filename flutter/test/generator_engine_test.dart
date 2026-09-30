import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/sudoku/generator/contract.dart';
import 'package:psygames_flutter/games/sudoku/generator/engine.dart';

/// 🔴 ПРАВИЛА ДЕНИСА ПРОВЕРЯЮТСЯ ПОВЕДЕНИЕМ, А НЕ ЧТЕНИЕМ КОДА.
///
/// Три решения 18.09, на которых стоит весь путь генератора:
///   · номер — счётчик побед, только растёт;
///   · трудность — одно число: победа поднимает, провал опускает;
///   · поблажка зависит от выбранной сложности.
/// Плюс требование §8.5: выбор обязан завершаться на вырожденных пулах.
void main() {
  List<Template> pool(int n) => [
        for (var i = 0; i < n; i++)
          Template(id: 'ш$i', band: i, rating: 900 + i * 80.0, variant: 'в${i % 3}'),
      ];

  OutcomeEvent ev(String id, Outcome o) => OutcomeEvent(
        eventId: id,
        task: const TaskId(
          gameId: 'sudoku', templateId: 'ш1', difficultyBand: 1,
          generatorVersion: 1, seed: 'з',
        ),
        outcome: o,
        at: DateTime(2026, 9, 23),
      );

  const t = Template(id: 'ш1', band: 1, rating: 1200, variant: 'в1');

  test('🔴 номер НЕ падает от провала — падает только трудность', () {
    var s = AdaptiveState(adaptiveWins: 10, skillRating: 1200);
    final ratingBefore = s.skillRating;
    s = applyOutcome(s, ev('a', Outcome.failed), template: t);
    expect(s.adaptiveWins, 10, reason: 'счётчик побед не умеет падать');
    expect(s.skillRating, lessThan(ratingBefore), reason: 'а трудность — умеет');
  });

  test('🔴 победа поднимает трудность и добавляет номер', () {
    var s = AdaptiveState(adaptiveWins: 10, skillRating: 1200);
    s = applyOutcome(s, ev('b', Outcome.passed), template: t);
    expect(s.adaptiveWins, 11);
    expect(s.skillRating, greaterThan(1200));
  });

  test('🔴 то же событие второй раз ничего не меняет', () {
    var s = AdaptiveState();
    s = applyOutcome(s, ev('c', Outcome.passed), template: t);
    final wins = s.adaptiveWins, rating = s.skillRating;
    s = applyOutcome(s, ev('c', Outcome.passed), template: t);
    expect(s.adaptiveWins, wins, reason: 'двойное применение накрутило бы рейтинг');
    expect(s.skillRating, rating);
  });

  test('🔴 брошенная партия не трогает ничего, подсказки не повышают рейтинг', () {
    var s = AdaptiveState(adaptiveWins: 5, skillRating: 1200);
    s = applyOutcome(s, ev('d', Outcome.aborted), template: t);
    expect(s.adaptiveWins, 5);
    expect(s.skillRating, 1200);
    s = applyOutcome(s, ev('e', Outcome.assisted), template: t);
    expect(s.skillRating, lessThanOrEqualTo(1200), reason: 'подсказка не повышает');
    expect(s.adaptiveWins, 5, reason: 'и победой не считается');
  });

  test('🔴 партия ПРОПИСАННОГО пути в адаптивное состояние не попадает', () {
    var s = AdaptiveState(adaptiveWins: 3, skillRating: 1200);
    s = applyOutcome(
      s,
      OutcomeEvent(
        eventId: 'f', task: const TaskId(gameId: 'sudoku', templateId: 'ш1', difficultyBand: 1, generatorVersion: 1, seed: 'з'),
        outcome: Outcome.passed, progressionKind: 'fixed', at: DateTime(2026, 9, 23),
      ),
      template: t,
    );
    expect(s.adaptiveWins, 3, reason: 'вариант В: пути не смешиваются');
    expect(s.skillRating, 1200);
  });

  /// 🔴 ПОБЛАЖКА — ТО, ЧЕМ ОТЛИЧАЮТСЯ ТРИ СЛОЖНОСТИ. Без этой пробы выбор «Пожёстче»
  /// мог бы втихую облегчать, и упёртый игрок получал бы не то, что выбрал.
  test('🔴 после провалов: «Полегче» облегчает, «Пожёстче» держит, «Обычная» терпит', () {
    AdaptiveState after(int fails) {
      var s = AdaptiveState(skillRating: 1200);
      for (var i = 0; i < fails; i++) {
        s = applyOutcome(s, ev('прв$i', Outcome.failed), template: t);
      }
      s.skillRating = 1200;   // смотрим ТОЛЬКО на поблажку, не на просадку рейтинга
      return s;
    }

    expect(targetRating(after(1), Leniency.easier), lessThan(1200),
        reason: '«Полегче» облегчает с первого провала');
    expect(targetRating(after(1), Leniency.normal), greaterThan(1200),
        reason: '«Обычная» первый провал терпит');
    // 🔴 ЧИСЛО НАЗВАНО ЧИСЛОМ, А НЕ КОНСТАНТОЙ. Первая редакция писала
    // `after(normalPatience)` — такая проба зелёная при ЛЮБОМ значении терпения и не
    // заметила бы подмены решения Дениса на мой черновик. Ответ 23.09: «после 3».
    expect(targetRating(after(2), Leniency.normal), greaterThan(1200),
        reason: 'два провала подряд «Обычная» ещё терпит (решение Дениса 23.09: после 3)');
    expect(targetRating(after(3), Leniency.normal), lessThan(1200),
        reason: 'а после трёх подряд — облегчает');
    expect(normalPatience, 3, reason: 'терпение «Обычной» — три провала, решение Дениса 23.09');
    for (final n in [1, 3, 6]) {
      expect(targetRating(after(n), Leniency.harder), greaterThan(1200),
          reason: '«Пожёстче» не облегчает никогда: $n провалов');
    }
  });

  /// 🔴 «ЕЩЁ РАЗ ЭТУ ЖЕ» — КНОПКА ОБЯЗАНА ОТМЕНЯТЬ ПОБЛАЖКУ ВО ВСЕХ ТРЁХ СЛОЖНОСТЯХ.
  /// Решение Дениса 23.09: упёртому игроку на «Полегче» и «Обычной» даётся кнопка, а не
  /// путь через «Пожёстче». Если поблажка при этом продолжит работать, кнопка соврёт:
  /// человек попросил ту же трудность, а получил облегчённую — и не узнает об этом.
  test('🔴 «ещё раз эту же»: трудность держится даже на «Полегче» после провалов', () {
    var s = AdaptiveState(skillRating: 1200);
    for (var i = 0; i < 5; i++) {
      s = applyOutcome(s, ev('пвт$i', Outcome.failed), template: t);
    }
    s.skillRating = 1200;

    const repeat = 1480.0;   // рейтинг только что проваленного шаблона
    for (final mode in Leniency.values) {
      expect(targetRating(s, mode, repeatRating: repeat), repeat,
          reason: 'кнопка «ещё раз эту же» держит трудность в режиме ${mode.name}');
    }
    // Без кнопки «Полегче» обязана облегчить — иначе проба выше проверяла бы ничто.
    expect(targetRating(s, Leniency.easier), lessThan(1200));

    // И выбор действительно держит трудность, а не уходит вниз.
    //
    // ⚠️ ТОЧНОЕ ПОПАДАНИЕ В ШАБЛОН ТРЕБОВАТЬ НЕЛЬЗЯ, и первая редакция этой пробы на
    // этом покраснела: рейтинг — не единственная сила выбора. Запрет «одно правило не
    // подряд» сдвинул ответ на соседний шаблон (1380 вместо 1460), и это правильное
    // поведение, а не дефект. Проверяется обещание кнопки: держит против «Полегче».
    final p = pool(9);
    final held = pickNext(s, p, Leniency.easier, repeatRating: 1460)!;
    final eased = pickNext(s, p, Leniency.easier)!;
    expect(held.rating, greaterThanOrEqualTo(1200),
        reason: 'с кнопкой задача не легче самого игрока');
    expect(held.rating, greaterThan(eased.rating + 100),
        reason: 'без кнопки «Полегче» уводит заметно ниже: ${eased.rating} против ${held.rating}');
  });

  /// Рейтинг сыгранного шаблона берётся из пула, а пропавший шаблон не притворяется.
  test('🔴 «ещё раз эту же» молчит, когда сыгранного шаблона в пуле больше нет', () {
    final p = pool(4);
    final played = AdaptiveState(recentTemplateIds: ['ш2'], skillRating: 1200);
    expect(lastTemplateRating(played, p), p[2].rating);
    expect(lastTemplateRating(played, [p.first]), isNull,
        reason: 'шаблон убрали из пула — кнопка не выдумывает трудность');
    expect(lastTemplateRating(AdaptiveState(), p), isNull, reason: 'играть ещё нечего');
  });

  test('🔴 одно правило не идёт подряд', () {
    var s = AdaptiveState(skillRating: 1200);
    final p = pool(9);
    final first = pickNext(s, p, Leniency.normal)!;
    s = applyOutcome(s, ev('g', Outcome.passed), template: first);
    final second = pickNext(s, p, Leniency.normal)!;
    expect(second.variant, isNot(first.variant), reason: 'подряд одно и то же правило');
  });

  /// ⚠️ §8.5: вырожденный пул не имеет права подвесить экран.
  test('🔴 выбор завершается на пустом пуле, на единственном шаблоне и на потолке', () {
    final s = AdaptiveState(skillRating: 99999);
    expect(pickNext(s, [], Leniency.normal), isNull, reason: 'пустой пул — честный null');
    final one = pool(1);
    expect(pickNext(s, one, Leniency.normal)!.id, 'ш0', reason: 'единственный шаблон выдаётся');
    // И даже когда весь хвост забит этим же шаблоном — ответ есть.
    final stuck = AdaptiveState(recentTemplateIds: List.filled(8, 'ш0'), skillRating: 1200);
    expect(pickNext(stuck, one, Leniency.normal), isNotNull);
  });

  test('трудность идёт за исходами: победы ведут вверх, провалы вниз', () {
    var up = AdaptiveState(skillRating: 1200);
    for (var i = 0; i < 10; i++) {
      up = applyOutcome(up, ev('п$i', Outcome.passed), template: t);
    }
    var down = AdaptiveState(skillRating: 1200);
    for (var i = 0; i < 10; i++) {
      down = applyOutcome(down, ev('о$i', Outcome.failed), template: t);
    }
    expect(up.skillRating, greaterThan(1260));
    expect(down.skillRating, lessThan(1140));
    expect(up.ratingUncertainty, lessThan(350), reason: 'с партиями неуверенность сужается');
  });
}
