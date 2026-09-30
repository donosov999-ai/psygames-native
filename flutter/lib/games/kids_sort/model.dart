import 'dart:math';

/// «ЦВЕТА И ФОРМЫ» — сортировка с молчаливой сменой правила.
///
/// Перенос движка MindLab `abstract-games-hub/engines/mindlab/kids/sort.py`
/// («Formas e Cores», clean-room). Решение Дениса 30.09.2026 — «добавляем, потом
/// доработаем».
///
/// Карточка: цвет, форма, размер. Серия из двух фаз: сначала верно раскладывать
/// «по цвету», потом правило молча меняется на «по форме». Главная мера —
/// ПЕРСЕВЕРАЦИИ: ответы по старому правилу после смены.
///
/// ⚠️ ОДНО МЕСТО ПЕРЕНОС МЕНЯЕТ НЕИЗБЕЖНО. У движка «ящик» — строка-значение
/// (`"red"`, `"circle"`), а у ребёнка на экране две коробки-ОБРАЗЦА, как в
/// классической детской пробе (DCCS): красный круг и синий квадрат. Ответ верен,
/// если образец совпадает с карточкой по ТЕКУЩЕМУ правилу; персеверация — ошибка
/// во второй фазе, при которой образец совпал с карточкой по цвету. Для карточек,
/// которые расходятся с образцами по обоим признакам, счёт тот же, что у движка.
///
/// Известное «потом доработаем»: движок раздаёт карточки случайно, и часть из них
/// совпадает с одним образцом сразу по цвету и по форме — на такой карточке
/// старое и новое правило дают одну коробку, и персеверацию она не покажет.
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

/// Одна фаза: правило и её карточки (у движка — `SortTask`).
class KidsSortTask {
  KidsSortTask(this.rule, Random rnd, int nCards)
      : cards = List.generate(
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

/// Сессия: фаза 1 по цвету, фаза 2 по форме (у движка — `SortSession`).
class KidsSortSession {
  KidsSortSession(Random rnd, {this.nCards = 12})
      : phase1 = KidsSortTask(KidsRule.color, rnd, nCards),
        phase2 = KidsSortTask(KidsRule.shape, rnd, nCards);

  final int nCards;
  final KidsSortTask phase1;
  final KidsSortTask phase2;

  int perseverative = 0;
  int errors = 0;
  int total = 0;

  /// Ответ ребёнка: фаза 1 или 2, карточка, коробка-образец. Считает персеверации.
  bool answer(int phase, KidsCard card, int box) {
    final task = phase == 1 ? phase1 : phase2;
    final ok = task.check(card, box);
    total += 1;
    if (!ok) {
      errors += 1;
      // Ответил по цвету там, где уже нужно по форме.
      if (phase == 2 && kidsTargets[box].color == card.color) perseverative += 1;
    }
    return ok;
  }
}

/// Ступень лестницы: карточек в каждой фазе. Шесть на входе, по две прибавки до
/// двенадцати, как у движка по умолчанию.
int kidsCardsFor(int level) => min(12, 4 + 2 * max(1, level));
