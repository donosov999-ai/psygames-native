import 'package:flutter/material.dart';

/// ПЛИТКА ИГРЫ ВКЛАДКИ «ИГРЫ» — ПЕРЕНОС `frontend/src/components/GameCard.tsx`, А НЕ НОВЫЙ РИСУНОК.
///
/// 📍 Правило Дениса 4e679f41 (04.10.2026): перенос — технология, не дизайн. Первая нативная вкладка
/// (#207) нарисовала строки списка вместо плиток веба, и это было названо несогласованным упрощением.
/// Поэтому размеры, слои и отступы здесь — веб-карточки один в один (номера строк — `GameCard.tsx`):
///   · градиент слева-сверху → справа-вниз, скругление 20, поле 14 (строки 130–134, 214–219);
///   · превью игры фактурой поверх градиента + нижний фейд 55 % (141–154, 209–213);
///   · счётчик развилки в правом верхнем углу: значок «слои» и число (157–162, 203–208);
///   · иконка 52×52 со скруглением 14 или глиф в круге 48 (164–170, 220–228);
///   · название 16/800 в две строки с тенью на тёмной карточке, описание 11 в две (172–175, 235–245);
///   · снизу плашка навыка 10/600 и звёзды «⭐ N/15» (177–190, 246–265).
/// Цвета НЕ считаются здесь: их посчитал веб теми же функциями и положил в выгрузку
/// ([TileLook], `flutter-catalog-asset-fresh.test.ts`).
class TileLook {
  const TileLook({
    required this.fg,
    required this.soft,
    required this.light,
    required this.iconBg,
    required this.badgeBg,
    required this.star,
    this.veil,
  });

  /// Текст и значки на градиенте (`onGradientText`).
  final Color fg;

  /// Описание и плашка — приглушённый, но в пределах AA (`onGradientTextMuted`).
  final Color soft;

  /// Светлая карточка — на ней тёмный текст: фейд превью белый, тени у названия нет.
  final bool light;

  /// Подложка под глифом и под значком развилки (`innerScrim 0.16`).
  final Color iconBg;

  /// Подложка плашек снизу (`innerScrim 0.2`).
  final Color badgeBg;

  /// Цвет звёзд (`accentOn #FFD93B`).
  final Color star;

  /// Вуаль на всю плитку, где AA иначе недостижим (`GradientSurface`).
  final Color? veil;

  static Color _c(String hex) => Color(int.parse(hex.substring(1), radix: 16));

  static TileLook? fromJson(Object? j) {
    if (j is! Map) return null;
    return TileLook(
      fg: _c(j['fg'] as String),
      soft: _c(j['soft'] as String),
      light: j['light'] == true,
      iconBg: _c(j['iconBg'] as String),
      badgeBg: _c(j['badgeBg'] as String),
      star: _c(j['star'] as String),
      veil: j['veil'] is String ? _c(j['veil'] as String) : null,
    );
  }

  /// Нет данных (карточка не из каталога) — белый текст, как было на вебе до `onGradientText`.
  static const fallback = TileLook(
    fg: Colors.white,
    soft: Color(0xE6FFFFFF),
    light: false,
    iconBg: Color(0x29000000),
    badgeBg: Color(0x33000000),
    star: Color(0xFFFFD93B),
  );
}

class GameTile extends StatelessWidget {
  const GameTile({
    super.key,
    required this.title,
    required this.description,
    required this.skill,
    required this.gradient,
    required this.look,
    required this.onTap,
    this.iconFile,
    this.glyph = Icons.extension_outlined,
    this.thumbFile,
    this.thumbOpacity = 0.22,
    this.hubCount,
    this.starsCompleted = 0,
  });

  final String title;
  final String description;
  final String skill;
  final List<Color> gradient;
  final TileLook look;
  final VoidCallback onTap;

  /// Картинка игры (`assets/game_icons/`); нет — глиф [glyph] в круге.
  final String? iconFile;
  final IconData glyph;

  /// Превью фоном (`assets/game_thumbs/`) и его прозрачность (`gameThumbOpacity`).
  final String? thumbFile;
  final double thumbOpacity;

  /// Число игр за развилкой; `null` — это не развилка.
  final int? hubCount;

  /// Пройдено уровней (`psygames_<игра>_stars_<профиль>`); 0 — плашки звёзд нет.
  final int starsCompleted;

  @override
  Widget build(BuildContext context) {
    final l = look;
    return Semantics(
      button: true,
      label: title,
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(20),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Ink(
            decoration: BoxDecoration(
              gradient: LinearGradient(colors: gradient, begin: Alignment.topLeft, end: Alignment.bottomRight),
            ),
            child: Stack(
              children: [
                if (l.veil != null) Positioned.fill(child: ColoredBox(color: l.veil!)),
                if (thumbFile != null)
                  Positioned.fill(
                    child: IgnorePointer(
                      child: Stack(
                        children: [
                          Positioned.fill(
                            child: Opacity(
                              opacity: thumbOpacity,
                              child: Image.asset(
                                'assets/game_thumbs/$thumbFile',
                                fit: BoxFit.cover,
                                excludeFromSemantics: true,
                              ),
                            ),
                          ),
                          Positioned.fill(
                            child: Align(
                              alignment: Alignment.bottomCenter,
                              child: FractionallySizedBox(
                                heightFactor: 0.55,
                                widthFactor: 1,
                                child: DecoratedBox(
                                  decoration: BoxDecoration(
                                    gradient: LinearGradient(
                                      begin: Alignment.topCenter,
                                      end: Alignment.bottomCenter,
                                      colors: l.light
                                          ? const [Color(0x00FFFFFF), Color(0x8CFFFFFF)]
                                          : const [Color(0x00000000), Color(0x6B000000)],
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                Padding(
                  padding: const EdgeInsets.all(14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (iconFile != null)
                        ClipRRect(
                          borderRadius: BorderRadius.circular(14),
                          child: Image.asset(
                            'assets/game_icons/$iconFile',
                            width: 52,
                            height: 52,
                            fit: BoxFit.cover,
                            excludeFromSemantics: true,
                          ),
                        )
                      else
                        Container(
                          width: 48,
                          height: 48,
                          decoration: BoxDecoration(color: l.iconBg, shape: BoxShape.circle),
                          child: Icon(glyph, size: 28, color: l.fg),
                        ),
                      const SizedBox(height: 12),
                      // ⚠️ Высота строки 1,2 — явно: иначе текст наследует `bodyMedium` Material 3 (1,43), и
                      // на 360×640 описание вылезало за плитку на 12 точек у каждой карточки (кадр 07.10).
                      // Веб берёт обычный межстрочник. При крупном системном шрифте зона не переполняется,
                      // а обрезается — плашка навыка снизу остаётся на месте, как на вебе.
                      Expanded(
                        child: ClipRect(
                          child: OverflowBox(
                            alignment: Alignment.topLeft,
                            maxHeight: double.infinity,
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(
                                  title,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                    color: l.fg,
                                    fontSize: 16,
                                    height: 1.2,
                                    fontWeight: FontWeight.w800,
                                    letterSpacing: 0.2,
                                    shadows: l.light
                                        ? null
                                        : const [Shadow(color: Color(0x4D000000), offset: Offset(0, 1), blurRadius: 3)],
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  description,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(color: l.soft, fontSize: 11, height: 1.2),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                      Row(
                        children: [
                          // `fitness-outline` веба — сердце с пульсом; ближайший значок Material — контур сердца.
                          Flexible(child: _badge(Icons.favorite_border, skill, l.soft)),
                          if (starsCompleted > 0) ...[
                            const SizedBox(width: 4),
                            _badge(null, '⭐ ${starsCompleted.clamp(0, 15)}/15', l.star),
                          ],
                        ],
                      ),
                    ],
                  ),
                ),
                if (hubCount != null)
                  Positioned(
                    top: 8,
                    right: 8,
                    child: Container(
                      key: const ValueKey('tile-hubcount'),
                      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                      decoration: BoxDecoration(color: l.iconBg, borderRadius: BorderRadius.circular(999)),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.layers, size: 13, color: l.fg),
                          const SizedBox(width: 3),
                          Text(
                            '$hubCount',
                            style: TextStyle(color: l.fg, fontSize: 12, height: 1.2, fontWeight: FontWeight.w800),
                          ),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _badge(IconData? icon, String text, Color color) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
    decoration: BoxDecoration(color: look.badgeBg, borderRadius: BorderRadius.circular(10)),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (icon != null) ...[Icon(icon, size: 12, color: color), const SizedBox(width: 4)],
        Flexible(
          child: Text(
            text,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(color: color, fontSize: 10, height: 1.2, fontWeight: FontWeight.w600),
          ),
        ),
      ],
    ),
  );
}
