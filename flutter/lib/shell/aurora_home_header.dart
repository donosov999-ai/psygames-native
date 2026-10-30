import 'package:flutter/material.dart';

import 'design_template.dart';
import 'ion_icon.dart';
import 'walking_pet.dart' show PetFrames, PetSpec;

/// 🔴 ВЕРХ ГЛАВНОЙ В «АВРОРЕ» — по рефу главной 30.10 (`home-dark-small-tiles-v1`): в строке
/// названия — чип профиля «Стандарт ˅», питомец и настройки; ниже подзаголовок, а друзья, лига,
/// серия, баллы и достижения — ряд «Быстрого доступа» маленькими плитками.
///
/// Те же данные и те же действия, что у классической шапки (`header` модели главной,
/// `home_model.dart`): ни одна функция не теряется, меняется только раскладка.
///
/// | Было в классической шапке | Где в «Авроре» |
/// |---|---|
/// | лого, подзаголовок | слева сверху — название PsyGames и подзаголовок |
/// | питомец, настройки | справа сверху |
/// | профиль (чип) | чип «<профиль> ˅» в строке названия |
/// | друзья, лига, серия, баллы + уровень, достижения | ряд «Быстрого доступа» ([stats]) |
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
    final chip = _map(header['chip']);
    final width = MediaQuery.sizeOf(context).width;
    return Padding(
      key: const ValueKey('aurora-home-top'),
      padding: const EdgeInsets.fromLTRB(20, 8, 12, 4),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisSize: MainAxisSize.min, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
          Expanded(
            child: FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerLeft,
              child: Text('PsyGames',
                  maxLines: 1,
                  style: TextStyle(fontSize: 28, height: 1.1, fontWeight: FontWeight.w700, color: text)),
            ),
          ),
          // Чип профиля — как «Я ˅» на рефе: то же нажатие, что у строки «Режим» раньше (выбор профиля).
          Semantics(
            button: true,
            label: _s(chip['name']),
            excludeSemantics: true,
            onTap: onSwitcher,
            child: Material(
              color: auroraToken('surface', dark: dark),
              shape: StadiumBorder(side: BorderSide(color: auroraToken('border', dark: dark)!)),
              clipBehavior: Clip.antiAlias,
              child: InkWell(
                key: const ValueKey('home-profile-chip'),
                onTap: onSwitcher,
                child: ConstrainedBox(
                  constraints: BoxConstraints(minHeight: 40, maxWidth: width * 0.34),
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(10, 6, 6, 6),
                    child: Row(mainAxisSize: MainAxisSize.min, children: [
                      Text(_s(chip['emoji']), style: const TextStyle(fontSize: 15)),
                      const SizedBox(width: 6),
                      Flexible(
                        child: Text(_s(chip['name']),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: text)),
                      ),
                      Icon(Icons.keyboard_arrow_down_rounded, size: 20, color: text),
                    ]),
                  ),
                ),
              ),
            ),
          ),
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
        const SizedBox(height: 2),
        // Подзаголовок во всю ширину под строкой названия: в две строки подсказка «нажми на чип,
        // чтобы сменить профиль» помещается целиком (раньше обрезалась на «нажми на …»).
        Text(_s(header['subtitle']),
            key: const ValueKey('home-subtitle'),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(fontSize: 13.5, height: 1.25, color: secondary)),
      ]),
    );
  }

  /// Баннер обновления, если есть, — элемент списка главной. Профиль переехал в чип строки
  /// названия ([build]); пустой список — значит, обновлений нет.
  List<Widget> modeAndUpdate(BuildContext context) {
    final accent = Theme.of(context).colorScheme.primary;
    final update = _map(header['update']);
    return [
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

  /*
   * «БЫСТРЫЙ ДОСТУП» — как на рефе главной 30.10: маленькие плитки «значок + подпись» в один ряд.
   * Плитки — те же переходы, что были в шапке и в ряду счётчиков, без вторых копий: серия
   * (`/streak-calendar`), баллы с уровнем = магазин (`/shop`), достижения, друзья, лига.
   * Цифры — модели (серия, баллы, «Lv», достижения), не макетные. Подписи — из модели шапки,
   * новых ключей словаря нет. Узко или крупный шрифт — переносится в два ряда.
   */
  Widget stats(BuildContext context) {
    final labels = _map(header['labels']);
    final streak = header['streak'];
    final league = header['league'];
    final tiles = <Widget>[
      _quick(context,
          key: 'home-streak',
          emoji: '🔥',
          value: '${streak ?? 0}',
          label: _s(header['streakLabel']).split(':').first,
          semantic: _s(header['streakLabel']),
          onTap: () => onOpen('/streak-calendar')),
      _quick(context,
          key: 'home-tokens',
          emoji: '⭐',
          value: '${header['tokens'] ?? 0}',
          label: _s(header['level']),
          semantic: '${_s(labels['shop'])}: ${header['tokens'] ?? 0}, ${_s(header['level'])}',
          onTap: () => onOpen('/shop')),
      _quick(context,
          key: 'home-achievements',
          emoji: '🏆',
          value: '${header['achievements'] ?? 0}',
          label: _s(labels['achievements']),
          semantic: '${_s(labels['achievements'])}: ${header['achievements'] ?? 0}',
          onTap: () => onOpen('/achievements')),
      _quick(context,
          key: 'home-friends',
          emoji: '👥',
          label: _s(header['friendsLabel']),
          semantic: _s(header['friendsLabel']),
          onTap: () => onOpen('/friends')),
      if (league is num)
        _quick(context,
            key: 'home-league',
            emoji: '🏅',
            label: _s(header['leaguesLabel']),
            semantic: _s(header['leaguesLabel']),
            onTap: () => onOpen('/leagues')),
    ];
    return Padding(
      key: const ValueKey('aurora-home-stats'),
      padding: const EdgeInsets.only(bottom: 16),
      child: LayoutBuilder(builder: (context, box) {
        const gap = 8.0;
        final scale = MediaQuery.textScalerOf(context).scale(1).clamp(1.0, 2.0);
        final perRow = (box.maxWidth / (62 * scale)).floor().clamp(3, tiles.length);
        return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          for (var i = 0; i < tiles.length; i += perRow)
            Padding(
              padding: EdgeInsets.only(top: i == 0 ? 0 : gap),
              child: IntrinsicHeight(
                child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  for (var k = i; k < i + perRow; k++) ...[
                    if (k > i) const SizedBox(width: gap),
                    Expanded(child: k < tiles.length ? tiles[k] : const SizedBox.shrink()),
                  ],
                ]),
              ),
            ),
        ]);
      }),
    );
  }

  Widget _quick(BuildContext context,
      {required String key,
      required String emoji,
      String? value,
      required String label,
      required String semantic,
      required VoidCallback onTap}) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final text = auroraToken('text', dark: dark)!;
    final secondary = auroraToken('textSecondary', dark: dark)!;
    final surface = auroraToken('surface', dark: dark)!;
    final border = auroraToken('border', dark: dark)!;
    // Подпись целиком и нажатие — в самой подписи: без `excludeSemantics` TalkBack читал плитку дважды
    // («Стрик: 0, 🔥, 0, Стрик» — дамп uiautomator 2.56.47).
    return Semantics(
      button: true,
      label: semantic,
      onTap: onTap,
      excludeSemantics: true,
      child: Material(
        color: surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14), side: BorderSide(color: border)),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          key: ValueKey(key),
          onTap: onTap,
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 72),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(4, 8, 4, 6),
              child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                  Text(emoji, style: const TextStyle(fontSize: 20)),
                  if (value != null) ...[
                    const SizedBox(width: 4),
                    Flexible(
                      child: Text(value,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(fontSize: 15, height: 1.1, fontWeight: FontWeight.w700, color: text)),
                    ),
                  ],
                ]),
                const SizedBox(height: 4),
                // Уменьшается, а не режется: «Достижения» в плитке 66 pt была «Достиже…» (2.56.47).
                FittedBox(
                  fit: BoxFit.scaleDown,
                  child: Text(label, maxLines: 1, textAlign: TextAlign.center, style: TextStyle(fontSize: 11, color: secondary)),
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
