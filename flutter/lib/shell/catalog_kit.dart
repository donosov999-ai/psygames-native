import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;

import 'catalog.dart';
import 'game_tile.dart';
import 'hub_screen.dart';
import 'ionicons.g.dart';
import 'l10n.dart';
import 'shared_state.dart';
import 'web_theme.dart';

/// ОБЩЕЕ ДЛЯ ПЛИТОК КАТАЛОГА — вкладка «Игры» ([CatalogScreen]) и «Любимые разделы» Главной.
///
/// Вынесено 07.10.2026 из `CatalogScreen`: Главная рисует плитки тем же [GameTile] с той же
/// иконкой, числом в развилке и звёздами, что и вкладка. Две копии этих правил разошлись бы
/// при первой правке — как на вебе их держит один `CategorySections`.
class CatalogKit {
  CatalogKit({required this.catalog, this.icons = const {}, this.hubs = const {}});

  final Catalog catalog;
  final Map<String, dynamic> icons;
  final Map<String, dynamic> hubs;

  static Future<Map<String, dynamic>> _json(String path) async {
    final b = await rootBundle.load(path);
    return jsonDecode(utf8.decode(b.buffer.asUint8List(b.offsetInBytes, b.lengthInBytes))) as Map<String, dynamic>;
  }

  static Future<CatalogKit> load({Catalog? catalog}) async {
    final c = catalog ?? await Catalog.load();
    var icons = const <String, dynamic>{};
    var hubs = const <String, dynamic>{};
    try {
      icons = await _json('assets/game_icons/index.json');
    } catch (_) {
      // Нет карты иконок — плитки с глифом, каталог работает.
    }
    try {
      hubs = await _json('assets/hubs.json');
    } catch (_) {
      // Нет состава — число на развилке не показываем.
    }
    return CatalogKit(catalog: c, icons: icons, hubs: hubs);
  }

  /// Видимое профилю: список веба, если посчитан для ТЕКУЩЕГО профиля; иначе — всё, что не
  /// спрятано из меню (пустой каталог хуже лишней строки, как и в [HubScreen]).
  ({Set<String>? games, Map<String, int> hubCount}) visible(SharedState state) {
    final counts = <String, int>{
      for (final e in ((hubs['hubs'] as Map<String, dynamic>?) ?? const {}).entries) e.key: (e.value as List).length,
    };
    final raw = state.get(HubScreen.visibleKey);
    if (raw == null || raw.isEmpty) return (games: null, hubCount: counts);
    try {
      final o = jsonDecode(raw) as Map<String, dynamic>;
      if (o['profile'] != state.activeProfile) return (games: null, hubCount: counts);
      for (final e in ((o['hubs'] as Map<String, dynamic>?) ?? const {}).entries) {
        counts[e.key] = (e.value as List).length;
      }
      final list = o['catalog'] as List?;
      return (games: list?.cast<String>().toSet(), hubCount: counts);
    } catch (_) {
      return (games: null, hubCount: counts);
    }
  }

  /// Пройдено уровней — как `useAllLevelStars` веба: ключ `psygames_<игра>_stars_<профиль>`,
  /// карта «уровень → звёзды», считаются уровни со звёздами больше нуля.
  static int starsCompleted(SharedState state, String id) {
    final raw = state.get('psygames_${id}_stars_${state.activeProfile}');
    if (raw == null || raw.isEmpty) return 0;
    try {
      final m = jsonDecode(raw) as Map<String, dynamic>;
      return m.values.where((v) => v is num && v > 0).length;
    } catch (_) {
      return 0;
    }
  }

  String? iconFile(CatalogEntry e) =>
      ((icons['byNameKey'] as Map?)?[e.nameKey] ?? (icons['byRoute'] as Map?)?[e.route]) as String?;

  CatalogEntry? byRoute(String route) {
    for (final g in catalog.games) {
      if (g.route == route) return g;
    }
    for (final g in catalog.entries) {
      if (g.route == route) return g;
    }
    return null;
  }

  CatalogCategory? category(String id) {
    for (final c in catalog.categories) {
      if (c.id == id) return c;
    }
    return null;
  }

  /// Плитка веба (`GameCard`) для записи каталога.
  Widget tile(SharedState state, CatalogEntry g, {required Map<String, int> hubCount, required VoidCallback onTap}) =>
      GameTile(
        title: g.name,
        description: g.desc,
        skill: g.skillKey == null ? '' : L.t(g.skillKey!),
        gradient: g.gradient.length >= 2 ? g.gradient : const [Color(0xFF667EEA), Color(0xFF764BA2)],
        look: g.look ?? TileLook.fallback,
        iconFile: iconFile(g),
        glyph: hubIcon(g.icon),
        thumbFile: g.thumb,
        thumbOpacity: g.thumbOpacity,
        hubCount: g.hub ? hubCount[g.route] : null,
        starsCompleted: g.id == null ? 0 : starsCompleted(state, g.id!),
        onTap: onTap,
      );

  /// Сетка веба: `repeat(auto-fill, minmax(150px | 170px, 1fr))`, зазор 10, высота = ширина × 1,06.
  static Widget grid(BuildContext context, List<Widget Function(double w)> tiles, {List<Key>? keys}) =>
      LayoutBuilder(builder: (context, box) {
        const gap = 10.0;
        final minTile = MediaQuery.sizeOf(context).width < 480 ? 150.0 : 170.0;
        final cols = ((box.maxWidth + gap) / (minTile + gap)).floor().clamp(1, 6);
        final w = (box.maxWidth - gap * (cols - 1)) / cols;
        return Wrap(spacing: gap, runSpacing: gap, children: [
          for (var i = 0; i < tiles.length; i++)
            SizedBox(key: keys?[i], width: w, height: w * 1.06, child: tiles[i](w)),
        ]);
      });

  /// Заголовок раздела — `CategorySections` (styles.sectionHeader): черта 4×18, значок 20 (Ionicons
  /// веба), название 17/700, число 13/600 — сколько в разделе ВСЕГО.
  static Widget sectionHeader(BuildContext context, CatalogCategory cat, int count, {Key? key}) {
    final web = WebTheme.of(context);
    final color = Color(cat.color);
    return Padding(
      key: key,
      padding: const EdgeInsets.only(left: 4, bottom: 12),
      child: Row(children: [
        Container(width: 4, height: 18, decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(2))),
        const SizedBox(width: 8),
        Icon(Ion.of(cat.icon) ?? Icons.apps, size: 20, color: color),
        const SizedBox(width: 8),
        Expanded(child: Text(cat.title, style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: web.text))),
        Text('$count', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: web.textSecondary)),
      ]),
    );
  }
}
