/// ТЕНЕВОЙ ВЫБОР (§10 шаг 2): генератор записывает, что ВЫБРАЛ БЫ, а человек играет
/// прежнюю задачу прописанной лестницы.
///
/// 🔴 ЗАЧЕМ ИМЕННО ТАК, А НЕ СРАЗУ ПИЛОТ. Пока генератор никому ничего не выдаёт, его
/// можно сравнивать с живой лестницей на настоящих партиях настоящего человека: что он
/// предложил бы и какой трудности доска пришла на самом деле. Это и есть замер, которым
/// пилот либо оправдан, либо нет, — а не обещание, что «должно стать лучше».
///
/// ⚠️ РЕЙТИНГ ПРИ ЭТОМ УЧИТСЯ. Исход настоящей партии применяется к шаблону той доски,
/// которую выдала лестница. Иначе к моменту включения пилота трудность игрока была бы
/// неизвестна, и первая адаптивная задача оказалась бы случайной.
/// Прописанные ключи не трогаются ничем из этого — гейт `generator_isolation_test.dart`
/// меряет ровно это.
library;

import 'contract.dart';
import 'engine.dart';
import 'store.dart';

class GeneratorShadow {
  GeneratorShadow(this.store);

  final GeneratorStore store;

  /// Записать, что генератор выбрал бы вместо выданной доски.
  ///
  /// `given` — шаблон доски, которую реально выдала лестница; `level` — её номер.
  void recordDeal({
    required int level,
    required Template given,
    required List<Template> pool,
    required Leniency mode,
  }) {
    final state = store.load();
    final would = pickNext(state, pool, mode);
    store.appendShadow({
      'в': DateTime.now().toUtc().toIso8601String(),
      'уровень': level,
      'выдано': {'id': given.id, 'полоса': given.band, 'рейтинг': given.rating.round()},
      'выбрал_бы': would == null
          ? null
          : {'id': would.id, 'полоса': would.band, 'рейтинг': would.rating.round()},
      'рейтинг_игрока': state.skillRating.round(),
      'побед': state.adaptiveWins,
      'режим': mode.name,
    });
  }

  /// Применить исход настоящей партии к рейтингу — по шаблону выданной доски.
  void recordOutcome({
    required Template given,
    required Outcome outcome,
    required String eventId,
    int errors = 0,
    int hints = 0,
    int seconds = 0,
  }) {
    final state = store.load();
    final next = applyOutcome(
      state,
      OutcomeEvent(
        eventId: eventId,
        task: TaskId(
          gameId: 'sudoku',
          templateId: given.id,
          difficultyBand: given.band,
          generatorVersion: generatorAlgorithmVersion,
          seed: eventId,
        ),
        outcome: outcome,
        errors: errors,
        hints: hints,
        seconds: seconds,
        at: DateTime.now(),
      ),
      template: given,
    );
    store.save(next);
  }
}
