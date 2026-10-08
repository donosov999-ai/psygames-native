import 'dart:convert';

import 'package:flutter/material.dart';

import 'l10n.dart';
import 'shared_state.dart';

/// КОШЕЛЁК СПОСОБНОСТЕЙ — НАТИВНАЯ ПОЛОВИНА ТОГО ЖЕ КЛЮЧА, ЧТО У ВЕБА (задача 576405e7).
///
/// Покупает магазин (`frontend/src/services/abilities.ts`, `buyAbility`), тратит партия. Ключ и
/// форма — веба: `psygames_abilities_v1` = `{профиль: {способность: штук}}`, профиль — тот же
/// `psygames_active_profile`. Второго кошелька быть не может: купленное в магазине обязано
/// тратиться в нативной игре, а потраченное здесь — пропасть из магазина.
///
/// ⚠️ ПРОВЕРКА И СПИСАНИЕ — ОДНА ОПЕРАЦИЯ, как у веба (`useAbility`): [spend] сам читает остаток
/// и сам отказывает, если штуки нет. Разрешение продолжать даёт списание, а не [count] — [count]
/// только для показа остатка ДО траты.
class AbilityWallet {
  AbilityWallet(this._state);

  final SharedState _state;

  static const key = 'psygames_abilities_v1';

  /// Имена способностей — `AbilityId` веба дословно.
  static const secondLife = 'second_life';
  static const sudokuHint = 'sudoku_hint';

  Map<String, Object?> _read() {
    try {
      final v = jsonDecode(_state.get(key) ?? '{}');
      return v is Map ? v.cast<String, Object?>() : <String, Object?>{};
    } catch (_) {
      return <String, Object?>{};   // битый кошелёк — пустой, как у веба (`readWallet`)
    }
  }

  Map<String, Object?> _mine(Map<String, Object?> wallet) {
    final m = wallet[_state.activeProfile];
    return m is Map ? m.cast<String, Object?>() : <String, Object?>{};
  }

  /// Сколько штук у текущего профиля.
  int count(String id) {
    final n = _mine(_read())[id];
    return n is num ? n.toInt() : 0;
  }

  /// Потратить одну штуку. `false` — тратить нечего, и вызывающий обязан на этом остановиться.
  Future<bool> spend(String id) async {
    final wallet = _read();
    final mine = _mine(wallet);
    final have = mine[id] is num ? (mine[id] as num).toInt() : 0;
    if (have <= 0) return false;
    wallet[_state.activeProfile] = {...mine, id: have - 1};
    await _state.set(key, jsonEncode(wallet));
    return true;
  }
}

/// ПРЕДЛОЖЕНИЕ ВТОРОЙ ЖИЗНИ — карточка вместо клавиш, когда ошибки кончились.
///
/// Слова и порядок — «Мишеней» (`app/games/targets.tsx`, `deathOffer`): вопрос, остаток в кошельке
/// ДО траты, «Потратить одну» и «Закончить партию». ⚠️ Автосписания нет нарочно: молча списать
/// штуку значит забрать её у того, кто, может, и хотел закончить.
class SecondLifeOffer extends StatelessWidget {
  const SecondLifeOffer({super.key, required this.left, required this.onTake, required this.onDecline});

  /// Остаток в кошельке — виден до нажатия.
  final int left;

  /// `null` — списание уже в полёте: второе нажатие не проходит.
  final VoidCallback? onTake;
  final VoidCallback onDecline;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(12),
      child: Column(
        key: const Key('life-offer'),
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            L.t('abilityLifeOffer'),
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 4),
          Text(
            '${L.t('abName_second_life')} · ${L.t('abilityInWallet').replaceAll('{n}', '$left')}',
            key: const Key('life-wallet'),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 8),
          Wrap(
            alignment: WrapAlignment.center,
            spacing: 8,
            runSpacing: 8,
            children: [
              FilledButton.icon(
                key: const Key('life-take'),
                onPressed: left > 0 ? onTake : null,
                icon: const Icon(Icons.favorite),
                label: Text(L.t('abilityLifeTake')),
              ),
              OutlinedButton(
                key: const Key('life-decline'),
                onPressed: onDecline,
                child: Text(L.t('abilityLifeDecline')),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
