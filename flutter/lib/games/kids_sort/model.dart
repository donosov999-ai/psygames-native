import 'dart:math';

/// «ЦВЕТА И ФОРМЫ» — сортировка с молчаливой сменой правила.
///
/// Перенос движка MindLab `abstract-games-hub/engines/mindlab/kids/sort.py`
/// («Formas e Cores», clean-room). Решение Дениса 30.09.2026 — «добавляем, потом
/// доработаем».
///
/// Карточка: цвет, форма, размер. Серия из фаз: сначала верно раскладывать «по цвету»,
/// потом правило молча меняется на «по форме», с пятой ступени — и обратно. Главная мера —
/// ПЕРСЕВЕРАЦИИ: ответы по правилу прошлой фазы после смены.
///
/// ⚠️ ОДНО МЕСТО ПЕРЕНОС МЕНЯЕТ НЕИЗБЕЖНО. У движка «ящик» — строка-значение
/// (`"red"`, `"circle"`), а у ребёнка на экране две коробки-ОБРАЗЦА, как в
/// классической детской пробе (DCCS): красный круг и синий квадрат. Ответ верен,
/// если образец совпадает с карточкой по ТЕКУЩЕМУ правилу; персеверация — ошибка,
/// при которой образец совпал с карточкой по правилу прошлой фазы.
///
/// 🔴 ДОРАБОТКА 02.10.2026 (задача e95b7e2f): ПОСЛЕ СМЕНЫ ПРАВИЛА — ТОЛЬКО КОНФЛИКТНЫЕ
/// КАРТОЧКИ. Движок раздавал карточки случайно, и часть совпадала с одним образцом и по
/// цвету, и по форме. На такой карточке старое и новое правило ведут в одну коробку, и
/// персеверацию она не показывает. По построению это половина карточек фазы в среднем:
/// конфликтны два сочетания цвета и формы из четырёх.
/// В классической пробе после смены идут только конфликтные (красный квадрат, синий
/// круг) — так и здесь, поровну и вперемешку.
enum KidsColor { red, blue }

enum KidsShape { circle, square }

enum KidsSize { small, big }

enum KidsRule { color, shape }

class KidsCard {
  const KidsCard(this.color, this.shape, this.size);
  final KidsColor color;
  final KidsShape shape;
  final KidsSize size;

  @override
  String toString() => '${color.name}/${shape.name}/${size.name}';
}

/// Две коробки-образца: у каждой свой цвет и своя форма.
const List<KidsCard> kidsTargets = [
  KidsCard(KidsColor.red, KidsShape.circle, KidsSize.big),
  KidsCard(KidsColor.blue, KidsShape.square, KidsSize.big),
];

/// Конфликтная ли карточка: по цвету она идёт в одну коробку, по форме — в другую.
bool kidsConflict(KidsCard c) =>
    kidsTargets.indexWhere((t) => t.color == c.color) != kidsTargets.indexWhere((t) => t.shape == c.shape);

/// Одна фаза: правило и её карточки (у движка — `SortTask`).
///
/// [conflictOnly] — только конфликтные карточки, поровну обоих видов и вперемешку.
class KidsSortTask {
  KidsSortTask(this.rule, Random rnd, int nCards, {bool conflictOnly = false})
      : cards = conflictOnly
            ? ([
                for (var i = 0; i < nCards; i += 1)
                  i.isEven
                      ? KidsCard(KidsColor.red, KidsShape.square, KidsSize.values[rnd.nextInt(2)])
                      : KidsCard(KidsColor.blue, KidsShape.circle, KidsSize.values[rnd.nextInt(2)]),
              ]..shuffle(rnd))
            : List.generate(
                nCards,
                (_) => KidsCard(
                  KidsColor.values[rnd.nextInt(2)],
                  KidsShape.values[rnd.nextInt(2)],
                  KidsSize.values[rnd.nextInt(2)],
                ),
              );

  final KidsRule rule;
  final List<KidsCard> cards;

  /// Признак карточки, по которому сейчас раскладывают (у движка — `key`).
  Object keyOf(KidsCard c) => rule == KidsRule.color ? c.color : c.shape;

  /// Верна ли коробка-образец [box] для карточки [card] по правилу фазы.
  bool check(KidsCard card, int box) => keyOf(kidsTargets[box]) == keyOf(card);
}

/// Сессия: фазы с чередованием правила — цвет, форма, цвет… (у движка — `SortSession`,
/// у него фаз всегда две). Первая фаза — как у движка, все следующие — конфликтные.
class KidsSortSession {
  KidsSortSession(Random rnd, {this.nCards = 12, int phases = 2})
      : phases = [
          for (var p = 0; p < phases; p += 1)
            KidsSortTask(p.isEven ? KidsRule.color : KidsRule.shape, rnd, nCards, conflictOnly: p > 0),
        ],
        phaseErrors = List.filled(phases, 0);

  final int nCards;
  final List<KidsSortTask> phases;

  /// Ошибки по фазам — по ним решается, пройдена ли серия ([passed]).
  final List<int> phaseErrors;

  KidsSortTask get phase1 => phases[0];
  KidsSortTask get phase2 => phases[1];

  /// Сколько раз правило сменилось молча.
  int get switches => phases.length - 1;

  int perseverative = 0;
  int errors = 0;
  int total = 0;

  /// Ответ ребёнка: фаза (с единицы), карточка, коробка-образец. Считает персеверации.
  bool answer(int phase, KidsCard card, int box) {
    final ok = phases[phase - 1].check(card, box);
    total += 1;
    if (!ok) {
      errors += 1;
      phaseErrors[phase - 1] += 1;
      // Ответил по правилу прошлой фазы там, где уже нужно по новому.
      if (phase > 1 && phases[phase - 2].check(card, box)) perseverative += 1;
    }
    return ok;
  }

  /// Ошибок на фазу, при которых серия засчитана: одна на шесть карточек, но не меньше
  /// одной. Смена правила молчит, и первая ✗ после неё неизбежна; критерий классической
  /// пробы — пять верных из шести.
  int get allowedPerPhase => max(1, nCards ~/ 6);

  bool get passed => phaseErrors.every((e) => e <= allowedPerPhase);

  /// Звёзды: три — ошибок не больше, чем смен правила (по одной неизбежной на смену); две —
  /// серия засчитана; одна — нет. Прежнее «три — ни одной ошибки» было недостижимо: первая
  /// конфликтная карточка после смены даёт ✗ любому, кто держался правила.
  int get stars => errors <= switches ? 3 : (passed ? 2 : 1);
}

/// Сколько фаз на ступени: две до четвёртой, дальше смена правила прибавляется каждые три
/// ступени — потолка нет.
int kidsPhasesFor(int level) => level <= 4 ? 2 : 2 + (level - 2) ~/ 3;

/// Карточек в фазе. На двух фазах — от шести до двенадцати, как у движка; когда фаз
/// больше, фаза короче (на две карточки за каждую лишнюю смену, не меньше четырёх), чтобы
/// серия росла сменами, а не длиной.
int kidsCardsFor(int level) {
  final phases = kidsPhasesFor(level);
  if (phases == 2) return min(12, 4 + 2 * max(1, level));
  return max(4, 12 - 2 * (phases - 2));
}
