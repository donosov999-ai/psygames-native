import 'package:flutter/material.dart';

import 'design_template.dart';
import 'ion_icon.dart';
import 'walking_pet.dart' show PetFrames, PetSpec;

/// 🔴 ВЕРХ ГЛАВНОЙ В «АВРОРЕ» — по листу 01 Codex: название и подзаголовок слева, Синапс
/// и настройки справа, ниже строка «Режим», карточка зарядки и ряд из трёх счётчиков.
///
/// Те же данные и те же действия, что у классической шапки (`header` модели главной,
/// `home_model.dart`): ни одна функция не теряется, меняется только раскладка.
///
/// | Было в классической шапке | Где в «Авроре» |
/// |---|---|
/// | лого, подзаголовок | слева сверху — название PsyGames и подзаголовок |
/// | питомец, настройки | справа сверху |
/// | друзья, лига | значки справа сверху |
/// | профиль (чип) | строка «Режим: …» |
/// | серия, баллы + уровень, достижения | ряд счётчиков |
/// | статистика | вкладка «Прогресс» внизу (тот же `/statistics`) и счётчик достижений |
/// | магазин | счётчик баллов (как плашка баллов в Classic) |
/// | баннер обновления | под строкой «Режим» |
class AuroraHomeTop extends StatelessWidget {
  const AuroraHomeTop({
    super.key,
    required this.header,
    required this.origin,
    required this.onOpen,
    required this.onSwitcher,
    required this.onUpdate,
  });

  final Map<String, Object?> header;
  final String origin;
  final ValueChanged<String> onOpen;
  final VoidCallback onSwitcher;
  final VoidCallback onUpdate;

  String _s(Object? v) => v == null ? '' : '$v';
  Map<String, Object?> _map(Object? v) => v is Map ? Map<String, Object?>.from(v) : const {};

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final dark = theme.brightness == Brightness.dark;
    final text = auroraToken('text', dark: dark)!;
    final secondary = auroraToken('textSecondary', dark: dark)!;
    final labels = _map(header['labels']);
    final pet = PetSpec.fromJson(header['pet']);
    final league = header['league'];
    return Padding(
      key: const ValueKey('aurora-home-top'),
      padding: const EdgeInsets.fromLTRB(20, 8, 12, 4),
      child: Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
            Text('PsyGames',
                maxLines: 1,
                style: TextStyle(fontSize: 28, height: 1.1, fontWeight: FontWeight.w700, color: text)),
            const SizedBox(height: 2),
            Text(_s(header['subtitle']),
                key: const ValueKey('home-subtitle'),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 14, color: secondary)),
          ]),
        ),
        _icon(context, key: 'home-friends', ion: 'people', label: _s(header['friendsLabel']), onTap: () => onOpen('/friends')),
        if (league is num)
          _icon(context, key: 'home-league', ion: 'podium-outline', label: _s(header['leaguesLabel']), onTap: () => onOpen('/leagues')),
        Semantics(
          button: true,
          label: _s(header['petLabel']),
          child: InkResponse(
            key: const ValueKey('home-pet'),
            onTap: () => onOpen('/pet'),
            radius: 26,
            child: SizedBox(
              width: 48,
              height: 48,
              child: Center(
                child: pet == null
                    ? const SizedBox(width: 36, height: 36)
                    : PetFrames(spec: pet, size: 40, origin: origin, still: true),
              ),
            ),
          ),
        ),
        _icon(context, key: 'home-settings', ion: 'settings-outline', label: _s(labels['settings']), onTap: () => onOpen('/settings')),
      ]),
    );
  }

  /// Строка «Режим: <профиль> ›» и, если есть, баннер обновления — элементы списка главной.
  List<Widget> modeAndUpdate(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final text = auroraToken('text', dark: dark)!;
    final raised = auroraToken('surface', dark: dark)!;
    final border = auroraToken('border', dark: dark)!;
    final accent = Theme.of(context).colorScheme.primary;
    final chip = _map(header['chip']);
    final update = _map(header['update']);
    return [
      Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: Material(
          color: raised,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14), side: BorderSide(color: border)),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            key: const ValueKey('home-profile-chip'),
            onTap: onSwitcher,
            child: ConstrainedBox(
              constraints: const BoxConstraints(minHeight: 48),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                child: Row(children: [
                  Text(_s(chip['emoji']), style: const TextStyle(fontSize: 18)),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(_s(chip['name']),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: text)),
                  ),
                  Icon(Icons.chevron_right, color: text),
                ]),
              ),
            ),
          ),
        ),
      ),
      if (update.isNotEmpty)
        Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: Material(
            color: accent.withValues(alpha: 0.14),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12), side: BorderSide(color: accent, width: 1.5)),
            child: InkWell(
              key: const ValueKey('home-update'),
              onTap: onUpdate,
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 12),
                child: Row(children: [
                  IonIcon('arrow-up-circle', size: 18, color: accent),
                  const SizedBox(width: 8),
                  Flexible(
                    child: Text(_s(update['text']),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(color: accent, fontSize: 13, fontWeight: FontWeight.w700)),
                  ),
                ]),
              ),
            ),
          ),
        ),
    ];
  }

  /// Ряд из трёх счётчиков под карточкой зарядки (лист 01: «7 дней подряд · 3 из 5 · 12 минут»).
  /// Цифры — те, что уже считает модель: серия, баллы с уровнем, достижения.
  Widget stats(BuildContext context) {
    final labels = _map(header['labels']);
    final streak = header['streak'];
    return Padding(
      key: const ValueKey('aurora-home-stats'),
      padding: const EdgeInsets.only(bottom: 16),
      child: Row(children: [
        Expanded(
          child: _stat(context,
              key: 'home-streak',
              emoji: '🔥',
              value: '${streak ?? 0}',
              label: _s(header['streakLabel']).split(':').first,
              semantic: _s(header['streakLabel']),
              onTap: () => onOpen('/streak-calendar')),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: _stat(context,
              key: 'home-tokens',
              emoji: '⭐',
              value: '${header['tokens'] ?? 0}',
              label: _s(header['level']),
              semantic: '${_s(labels['shop'])}: ${header['tokens'] ?? 0}',
              onTap: () => onOpen('/shop')),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: _stat(context,
              key: 'home-achievements',
              emoji: '🏆',
              value: '${header['achievements'] ?? 0}',
              label: _s(labels['achievements']),
              semantic: _s(labels['achievements']),
              onTap: () => onOpen('/achievements')),
        ),
      ]),
    );
  }

  Widget _stat(BuildContext context,
      {required String key,
      required String emoji,
      required String value,
      required String label,
      required String semantic,
      required VoidCallback onTap}) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final text = auroraToken('text', dark: dark)!;
    final secondary = auroraToken('textSecondary', dark: dark)!;
    final surface = auroraToken('surface', dark: dark)!;
    final border = auroraToken('border', dark: dark)!;
    return Semantics(
      button: true,
      label: semantic,
      child: Material(
        color: surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14), side: BorderSide(color: border)),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          key: ValueKey(key),
          onTap: onTap,
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 64),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
              child: Row(children: [
                Text(emoji, style: const TextStyle(fontSize: 22)),
                const SizedBox(width: 8),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                    Text(value,
                        maxLines: 1,
                        style: TextStyle(fontSize: 18, height: 1.1, fontWeight: FontWeight.w700, color: text)),
                    Text(label,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 11, color: secondary)),
                  ]),
                ),
              ]),
            ),
          ),
        ),
      ),
    );
  }

  Widget _icon(BuildContext context,
      {required String key, required String ion, required String label, required VoidCallback onTap}) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final text = auroraToken('text', dark: dark)!;
    return Semantics(
      button: true,
      label: label,
      child: InkResponse(
        key: ValueKey(key),
        onTap: onTap,
        radius: 24,
        child: SizedBox(width: 44, height: 48, child: Center(child: IonIcon(ion, size: 22, color: text))),
      ),
    );
  }
}
