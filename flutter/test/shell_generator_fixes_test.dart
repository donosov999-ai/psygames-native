import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/generator/contract.dart';
import 'package:psygames_flutter/shell/generator/engine.dart';

/// 🔴 ЗВЕНО 3 ЦЕПОЧКИ ГЕНЕРАТОРА (задача 319cbf42): четыре дефекта эталона, найденные
/// координатором при раскатке на 42 режима головоломок (звено 2, 543d853c). Каждая проба
/// воспроизводит дефект ровно тем порядком событий, которым его нашли, — и требует
/// обещанного договором поведения.
void main() {
  const t1240 = Template(id: 'ш1240', band: 4, rating: 1240, variant: 'thermo');
  const t1219 = Template(id: 'ш1219', band: 4, rating: 1219, variant: 'arrow');
  const t1300 = Template(id: 'ш1300', band: 5, rating: 1300, variant: 'kropki');
  const pool = [t1219, t1240, t1300];

  OutcomeEvent ev(String id, Outcome o, {Template t = t1240, DateTime? at}) => OutcomeEvent(
        eventId: id,
        task: TaskId(gameId: 'sudoku', templateId: t.id, difficultyBand: t.band, generatorVersion: 1, seed: id),
        outcome: o,
        at: at ?? DateTime(2026, 9, 30),
      );

  test('🔴 D1: повтор СТАРОГО события не применяется — A, B, A даёт две победы, а не три', () {
    var s = AdaptiveState();
    s = applyOutcome(s, ev('A', Outcome.passed), template: t1240);
    s = applyOutcome(s, ev('B', Outcome.passed), template: t1240);
    final rating = s.skillRating;
    s = applyOutcome(s, ev('A', Outcome.passed), template: t1240);
    expect(s.adaptiveWins, 2, reason: 'офлайн-повтор старой отправки накрутил счёт');
    expect(s.skillRating, rating, reason: 'повтор сдвинул рейтинг');
    // И хвост переживает запись в хранилище.
    final back = AdaptiveState.decode(s.encode());
    expect(applyOutcome(back, ev('A', Outcome.passed), template: t1240).adaptiveWins, 2);
  });

  test('🔴 D2: «Пожёстче» после провала держит трудность, а не облегчает', () {
    var s = AdaptiveState(skillRating: 1200);
    s = applyOutcome(s, ev('F', Outcome.failed), template: t1240);
    expect(s.skillRating, lessThan(1200), reason: 'провал опускает рейтинг игрока');
    final target = effectiveTarget(s, pool, Leniency.harder);
    expect(target, closeTo(ratingOf(s, t1240), 1e-9),
        reason: 'после провала на «Пожёстче» цель — трудность проваленного шаблона');
    expect(target, greaterThanOrEqualTo(1240),
        reason: 'прежняя цель «рейтинг + 40» после провала облегчала (≈1219)');
    // Без провала «Пожёстче» — как было: рейтинг + 40.
    expect(effectiveTarget(AdaptiveState(skillRating: 1200), pool, Leniency.harder), 1240);
  });

  test('🔴 D3: рейтинг шаблона учится партиями и переживает запись', () {
    var s = AdaptiveState(skillRating: 1200);
    const tpl = Template(id: 'ш', band: 3, rating: 1200);
    for (var i = 0; i < 20; i++) {
      s = applyOutcome(s, ev('w$i', Outcome.passed, t: tpl), template: tpl);
    }
    expect(ratingOf(s, tpl), lessThan(1200), reason: '20 побед по шаблону — он легче, чем думали');
    expect(s.skillRating, greaterThan(1200));
    expect(s.templateGames['ш'], 20);
    final back = AdaptiveState.decode(s.encode());
    expect(ratingOf(back, tpl), closeTo(ratingOf(s, tpl), 1e-9), reason: 'выученное не сохранилось');

    var f = AdaptiveState(skillRating: 1200);
    for (var i = 0; i < 20; i++) {
      f = applyOutcome(f, ev('f$i', Outcome.failed, t: tpl), template: tpl);
    }
    expect(ratingOf(f, tpl), greaterThan(1200), reason: '20 провалов — шаблон труднее, чем думали');
    // Подсказки шаблон не учат: по такой партии его трудность не видна.
    final a = applyOutcome(AdaptiveState(), ev('h', Outcome.assisted, t: tpl), template: tpl);
    expect(a.templateRatings.containsKey('ш'), isFalse);
  });

  test('🔴 D4: перерыв без игры расширяет неуверенность — до предела 350', () {
    var s = AdaptiveState(ratingUncertainty: 60);
    s = applyOutcome(s, ev('d0', Outcome.passed, at: DateTime(2026, 1, 1)), template: t1240);
    final settled = s.ratingUncertainty;
    expect(uncertaintyAfterBreak(settled, 0), settled);
    expect(uncertaintyAfterBreak(settled, 180), greaterThan(200), reason: 'полгода без игры');
    expect(uncertaintyAfterBreak(settled, 3650), 350, reason: 'предел 350');
    // И это применяется к партии: после полугода шаг рейтинга крупнее, чем после дня.
    final afterDay = applyOutcome(AdaptiveState.decode(s.encode()),
        ev('d1', Outcome.passed, at: DateTime(2026, 1, 2)), template: t1240);
    final afterHalfYear = applyOutcome(AdaptiveState.decode(s.encode()),
        ev('d2', Outcome.passed, at: DateTime(2026, 7, 1)), template: t1240);
    expect(afterHalfYear.skillRating - s.skillRating, greaterThan(afterDay.skillRating - s.skillRating),
        reason: 'после перерыва рейтинг обязан двигаться смелее');
  });

  test('сохранения до звена 3 читаются: новых полей нет — всё по умолчанию', () {
    final old = AdaptiveState.decode(
        '{"algorithm_version":1,"adaptive_wins":5,"skill_rating":1300,"rating_uncertainty":120,'
        '"recent_template_ids":["x"],"recent_outcomes":["passed"],"last_event_id":"e9"}');
    expect(old.adaptiveWins, 5);
    expect(old.recentEventIds, isEmpty);
    expect(old.templateRatings, isEmpty);
    expect(old.lastPlayedAt, isNull);
    // Защита от повтора последнего события у старого сохранения работает, как и раньше.
    expect(applyOutcome(old, ev('e9', Outcome.passed), template: t1240).adaptiveWins, 5);
  });
}
