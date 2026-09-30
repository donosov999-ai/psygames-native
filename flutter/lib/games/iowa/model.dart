/// IGT — «Карточная игра Айовы», тринадцатая игра раздела «Конфликт внимания»
/// на Flutter.
///
/// Правила перенесены из `frontend/app/games/iowa.tsx` (VER 2); эталон выгружен
/// прогоном живого TS в `test/fixtures/iowa-reference.json`.
///
/// 🔴 СТРУКТУРА ВЫПЛАТ — ЭТО И ЕСТЬ МЕТОДИКА (Bechara & Damasio, 1994), и
/// трогать её нельзя: сдвинешь — и результаты перестанут быть сравнимыми ни с
/// прошлыми партиями человека, ни с каноном.
///   A: +100 за карту, потери частые и крупные (5 из 10)  → нетто −250 за 10 карт
///   B: +100 за карту, потеря редкая, но огромная (1 из 10) → нетто −250
///   C:  +50 за карту, потери частые и мелкие (5 из 10)   → нетто +250
///   D:  +50 за карту, потеря редкая и мелкая (1 из 10)   → нетто +250
/// Человек не знает, какая колода какая, и учится по обратной связи.
///
/// 🔴 ПРОВАЛИТЬ ЭТОТ ТЕСТ НЕЛЬЗЯ. IGT — замерная проба решений: результат это
/// банк и доля выгодных выборов, а не «прошёл / не прошёл». Поле `passed` в
/// запись партии НЕ пишется намеренно — «всегда true» не несёт бита и портит
/// статистику долей.
///
/// 🔴 ЧЕГО ЗДЕСЬ НЕТ И ПОЧЕМУ ОСЕЙ ТАК МАЛО. Перетасовка колод по экрану
/// бессмысленна (буква едет вместе с колодой, человек следит за буквой);
/// перевешивание выплат за буквами — это уже другая проба (IGT с разворотом);
/// число попыток (40/60/100) задаёт ЧЕЛОВЕК, и это канонная длина методики, а
/// не ручка сложности. Остаётся задержка обратной связи: выплаты не меняются
/// вовсе, тяжелее становится связать выбор с исходом.
/// ⚠️ Одной оси мало по духу раздела — это рабочий минимум, а не предел.
library;

import 'dart:math';

enum Deck { a, b, c, d }

/// Выигрыш за карту.
const Map<Deck, int> deckWin = {Deck.a: 100, Deck.b: 100, Deck.c: 50, Deck.d: 50};

/// Расписание потерь на каждые 10 карт. ⚠️ Порядок внутри десятки —
/// ПРЕДЗАДАННЫЙ, а не случайный: у Бехары он фиксирован, и случайная
/// перестановка меняла бы момент, когда человек впервые встретит крупную потерю.
const Map<Deck, List<int>> deckLossPattern = {
  Deck.a: [-150, 0, -300, 0, -200, 0, -250, -350, 0, 0],
  Deck.b: [0, 0, 0, 0, 0, -1250, 0, 0, 0, 0],
  Deck.c: [0, -50, 0, -50, 0, -50, 0, -50, 0, -50],
  Deck.d: [0, 0, 0, 0, 0, 0, 0, 0, 0, -250],
};

/// Выгодные колоды. Мера пробы строится именно на этом делении.
const Set<Deck> advantageousDecks = {Deck.c, Deck.d};

const int iowaMaxLevel = 15;

/// Канонные длины партии. Выбирает человек; осью сложности не является.
const List<int> iowaTrialChoices = [40, 60, 100];

/// Уровень: единственная ось — задержка обратной связи, 0 → 700 мс.
class IowaLevel {
  const IowaLevel({required this.feedbackDelayMs});

  final int feedbackDelayMs;

  /// УСЛОВИЕ, ПРИ КОТОРОМ СНЯТА МЕРА, — В САМУ ПАРТИЮ.
  Map<String, Object?> get condition => {'feedbackDelayMs': feedbackDelayMs};

  /// ⚠️ Шаг зажат в [0, 14] ДО умножения: уровень приходит из хранилища и
  /// бывает и нулём, и числом за потолком, а отрицательная или растущая без
  /// края задержка сломала бы партию молча.
  static IowaLevel of(int level) {
    final step = max(0, min(14, level - 1));
    return IowaLevel(feedbackDelayMs: step * 50);
  }
}

/// Один выбор: какая колода, сколько дали и сколько отняли.
class IowaPick {
  const IowaPick({required this.deck, required this.win, required this.loss});
  final Deck deck;
  final int win;

  /// Потеря — отрицательная или ноль.
  final int loss;

  int get net => win + loss;
}

/// Итог партии.
class IowaResult {
  const IowaResult({
    required this.finalBank,
    required this.advantageous,
    required this.disadvantageous,
    required this.lastBlockAdv,
    required this.advShare,
    required this.nTrials,
  });

  final int finalBank;
  final int advantageous;
  final int disadvantageous;

  /// Сколько выгодных в ПОСЛЕДНЕМ блоке из 20 — по нему видно, научился ли
  /// человек к концу партии.
  final int lastBlockAdv;

  /// 🔴 ДОЛЯ, А НЕ СЧЁТ. Разность ЧИСЕЛ выборов растёт вместе с длиной партии:
  /// 40 попыток и 100 дают разные величины при одинаковом поведении, а длину
  /// выбирает человек. Доля от этого свободна.
  final double advShare;

  final int nTrials;
}

IowaResult summarize(List<IowaPick> picks, int finalBank) {
  final adv = picks.where((p) => advantageousDecks.contains(p.deck)).length;
  final dis = picks.length - adv;
  final lastBlock = picks.length <= 20 ? picks : picks.sublist(picks.length - 20);
  final lastAdv = lastBlock.where((p) => advantageousDecks.contains(p.deck)).length;
  final share = picks.isEmpty ? 0.0 : ((adv - dis) / picks.length * 1000).round() / 1000;
  return IowaResult(
    finalBank: finalBank,
    advantageous: adv,
    disadvantageous: dis,
    lastBlockAdv: lastAdv,
    advShare: share,
    nTrials: picks.length,
  );
}

/// Партия.
class IowaGame {
  IowaGame({required this.level, this.trials = 60, this.startBank = 2000})
      : params = IowaLevel.of(level);

  final int level;
  final int trials;
  final int startBank;
  final IowaLevel params;

  int bank = 0;
  int round = 0;
  final List<IowaPick> picks = [];

  /// Сколько карт уже взято из каждой колоды — по нему берётся потеря из
  /// расписания.
  final Map<Deck, int> counters = {for (final d in Deck.values) d: 0};

  /// Замок ответа. ⚠️ Он ОТДЕЛЬНО от показа исхода: пока исход показывался
  /// сразу, хватало проверки «виден ли отклик». С задержкой это перестало
  /// работать — отклик ставится только ПОСЛЕ паузы, и всё это время нажатия
  /// проходили бы насквозь, можно было натыкать несколько карт за один ход.
  bool _locked = false;

  IowaPick? pending;

  /// Показан ли исход текущего хода. Пока нет — коробка на экране ПУСТА, и это
  /// не «экран завис»: в этом и состоит ось сложности.
  bool revealed = false;

  bool get finished => round >= trials;
  bool get locked => _locked;

  void begin() {
    bank = startBank;
    round = 0;
    picks.clear();
    pending = null;
    revealed = false;
    _locked = false;
    for (final d in Deck.values) {
      counters[d] = 0;
    }
  }

  /// Взять карту. `null` — нажатие не засчитано (замок или партия кончилась).
  ///
  /// ⚠️ Банк здесь НЕ двигается: он меняется вместе с показом исхода
  /// (`revealPending`). Прыгнувшее число выдавало бы результат до самой
  /// обратной связи, и задержка не нагружала бы ничего.
  IowaPick? pick(Deck d) {
    if (_locked || finished) return null;
    _locked = true;
    final cnt = counters[d]!;
    final win = deckWin[d]!;
    final loss = deckLossPattern[d]![cnt % 10];
    counters[d] = cnt + 1;
    final p = IowaPick(deck: d, win: win, loss: loss);
    picks.add(p);
    pending = p;
    revealed = false;
    return p;
  }

  /// Показать исход и подвинуть банк.
  void revealPending() {
    final p = pending;
    if (p == null || revealed) return;
    bank += p.net;
    revealed = true;
  }

  /// Закрыть ход: снять отклик и снять замок.
  void closeTrial() {
    pending = null;
    revealed = false;
    _locked = false;
    round += 1;
  }

  IowaResult get result => summarize(picks, bank);
}
