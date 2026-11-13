import 'package:flutter/material.dart';

import 'ability_wallet.dart';
import 'l10n.dart';
import 'shared_state.dart';

/// «ПРОБНЫЙ ЗАХОД» — ПАРТИЯ, КОТОРАЯ НЕ ЗАПИСЫВАЕТСЯ НИКУДА (перенос веб-способности `practice_run`).
///
/// Магазин продавал её (`shop.json`, 250 монет), а в «Объёме цифр», Корси и «Корси наоборот» она не
/// работала (потеря после переезда, 05.11.2026). Правила веба (`digit-span.tsx`, `settlePracticeRun`):
///
///  * в замерных играх лимит ошибок И ЕСТЬ измерение, поэтому «второй жизни» нет — продаётся обратное:
///    право сыграть так, чтобы партия не записалась ни очками, ни уровнем, ни статистикой, ни рекордом;
///  * 🔴 РЕШЕНИЕ — ДО ПЕРВОГО СТИМУЛА ([decide] на старте): задним числом выбирать, засчитывать ли результат,
///    нельзя;
///  * 🔴 СПИСЫВАЕТСЯ НА ФИНИШЕ ([settle]), а не на старте: брошенная партия платной быть не должна; выбрать
///    удачный исход это не даёт — решение уже принято;
///  * шаг зарядки пробным не бывает: он и так не двигает личный уровень.
///
/// Кошелёк — тот же, что у веба и «Судоку» ([AbilityWallet], ключ `psygames_abilities_v1`).
class PracticeRun extends ChangeNotifier {
  PracticeRun(SharedState state) : _wallet = AbilityWallet(state) {
    left = _wallet.count(AbilityWallet.practiceRun);
  }

  final AbilityWallet _wallet;

  /// Остаток в кошельке — виден ДО траты.
  int left = 0;

  /// Включено на экране настройки (решение вступает в силу на старте партии).
  bool armed = false;

  /// Партия, только что сыгранная как пробная — для подписи на итоге.
  bool used = false;

  bool _now = false;

  /// Идёт ли ЭТА партия как пробная — решение, снятое на старте.
  bool get now => _now;

  void reload() {
    left = _wallet.count(AbilityWallet.practiceRun);
    notifyListeners();
  }

  void toggle() {
    if (left <= 0) return;
    armed = !armed;
    notifyListeners();
  }

  /// Решение на старте партии, до первого стимула. [allowed] — `false` в шаге зарядки.
  bool decide({required bool allowed}) {
    _now = allowed && armed && left > 0;
    used = false;
    return _now;
  }

  /// Финиш партии: списать штуку, если заход был заявлен. `true` — партию НЕ записываем (ни лестницу,
  /// ни отчёт, ни рекорд). Нечего списывать (кошелёк опустел за время партии) — партия идёт как обычная.
  Future<bool> settle() async {
    if (!_now) return false;
    _now = false;
    final ok = await _wallet.spend(AbilityWallet.practiceRun);
    armed = false;
    used = ok;
    reload();
    return ok;
  }
}

/// Переключатель на экране настройки — ОДНА строка-чип: «Пробный заход · в кошельке: N». Пояснение «ни очков,
/// ни уровня, ни статистики» — подсказка чипа, а у включённого чипа текст «партия не в зачёт»: отдельная
/// строка делала настройки «Объёма цифр» на L15 длиннее экрана 360×640 (гейт «Начать без прокрутки»).
class PracticeRunSwitch extends StatelessWidget {
  const PracticeRunSwitch({super.key, required this.controller});

  final PracticeRun controller;

  @override
  Widget build(BuildContext context) => ListenableBuilder(
        listenable: controller,
        builder: (context, _) {
          final empty = controller.left <= 0;
          // Нет ни штуки — строки нет: у большинства игроков заход не куплен, а лишняя строка делала
          // настройки «Объёма цифр» на L15 на 10 % длиннее экрана 360×640 (гейт «Начать без прокрутки»).
          // Веб показывал и ноль; здесь ноль виден в магазине (кнопка «купить»).
          if (empty && !controller.armed) return const SizedBox.shrink();
          final wallet = L.f('abilityInWallet', {'n': '${controller.left}'});
          return Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Tooltip(
              message: L.t('abilityPracticeNote'),
              child: FilterChip(
                key: const Key('practice-run-switch'),
                avatar: const Icon(Icons.science_outlined, size: 18),
                label: Text(
                  controller.armed ? L.t('abilityPracticeOn') : '${L.t('abName_practice_run')} · $wallet',
                  key: const Key('practice-run-note'),
                ),
                selected: controller.armed,
                visualDensity: VisualDensity.compact,
                onSelected: empty ? null : (_) => controller.toggle(),
              ),
            ),
          );
        },
      );
}

/// Подпись на итоге пробной партии: «никуда не записана».
class PracticeRunSpent extends StatelessWidget {
  const PracticeRunSpent({super.key, required this.controller});

  final PracticeRun controller;

  @override
  Widget build(BuildContext context) => ListenableBuilder(
        listenable: controller,
        builder: (context, _) => controller.used
            ? Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Text(
                  L.t('abilityPracticeSpent'),
                  key: const Key('practice-run-spent'),
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
              )
            : const SizedBox.shrink(),
      );
}
