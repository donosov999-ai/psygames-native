import 'dart:convert';

import 'package:flutter/material.dart' show Color;
import 'package:flutter/services.dart' show rootBundle;

import 'game_tile.dart';
import 'l10n.dart';

/// КАТАЛОГ ИГР: ЧТО ЕСТЬ, ГДЕ ЛЕЖИТ, ПО ЧЕМУ ИЩЕТСЯ (задачи f5025027, 9bd1b15d).
///
/// Данные — две выгрузки веба, своих списков здесь нет:
///   · `assets/catalog.json` — `GAMES` из `frontend/src/constants/games.ts`: раздел, навык,
///     ключи названия и описания (сторож `flutter-catalog-asset-fresh.test.ts`);
///   · `assets/hubs.json` — состав развилок (`hubContents.ts`, `embed-hubs.mjs`).
///
/// 🔴 ПОИСК — ПО ВСЕМ ИГРАМ, А НЕ ПО ВЕРХНЕМУ СПИСКУ. Решение Дениса 01.10: «профиль — это
/// хабы; поиск и фильтры пока НЕ фильтруются по профилю». Замер 02.10: в `GAMES` 95 записей,
/// из них 13 развилок; за развилками 118 карточек, и 50 из них в `GAMES` нет вовсе (режимы
/// Тэтхэма, «Кошки», шахматные задачи). Ищи только по `GAMES` — «Мосты» не нашлись бы никогда.
/// Карточка без своей записи берёт раздел и навык у развилки, где лежит.
class CatalogCategory {
  const CatalogCategory({required this.id, required this.titleKey, required this.icon, required this.color});
  final String id;
  final String titleKey;
  final String icon;
  final int color;
  String get title => L.t(titleKey);
}

/// Одна строка поиска: игра каталога, развилка или карточка за развилкой.
class CatalogEntry {
  const CatalogEntry({
    required this.route,
    required this.nameKey,
    required this.descKey,
    required this.icon,
    this.id,
    this.skillKey,
    this.category,
    this.hub = false,
    this.hubRoute,
    this.hidden = false,
    this.gradient = const [],
    this.look,
    this.thumb,
    this.thumbOpacity = 0.22,
  });

  final String route;
  final String nameKey;
  final String descKey;
  final String icon;

  /// `id` записи `GAMES`; у карточки, которой там нет, — `null`.
  final String? id;
  final String? skillKey;
  final String? category;

  /// Это сама развилка — меню, а не упражнение.
  final bool hub;

  /// За какой развилкой лежит карточка.
  final String? hubRoute;

  /// Вне меню (`hideFromMenu`) или в песочнице: в разделах по умолчанию не стоит, поиском
  /// находится. Нужен только запасному списку, когда веб ещё не прислал каталог профиля.
  final bool hidden;

  /// Плитка вкладки «Игры» (задача 99628ecf): градиент игры, готовые цвета веб-карточки и превью
  /// фоном — всё из выгрузки `GAMES` (`flutter-catalog-asset-fresh.test.ts`). У карточки за
  /// развилкой их нет — она рисуется строкой только в выдаче поиска.
  final List<Color> gradient;
  final TileLook? look;
  final String? thumb;
  final double thumbOpacity;

  String get name => nameKey.isEmpty ? route : L.t(nameKey);
  String get desc => descKey.isEmpty ? '' : L.t(descKey);
}

/// Чем отбирать: раздел (`memory`…) или навык (`skillPlanning`…). `null` — без отбора.
class CatalogFilter {
  const CatalogFilter.section(this.value) : skill = false;
  const CatalogFilter.skill(this.value) : skill = true;

  /// Только развилки — вход «Все развилки ›» с Главной (`/games?filter=hubs`, решение Дениса 07.10.2026).
  const CatalogFilter.hubs()
      : value = hubsValue,
        skill = false;
  static const hubsValue = '#hubs';

  final String value;
  final bool skill;

  bool accepts(CatalogEntry e) => value == hubsValue ? e.hub : (skill ? e.skillKey == value : e.category == value);

  @override
  bool operator ==(Object other) => other is CatalogFilter && other.value == value && other.skill == skill;
  @override
  int get hashCode => Object.hash(value, skill);
}

/// Подпись навыка — ЦЕЛИКОМ, как на карточке игры («Тренируем: вербальную гибкость»).
///
/// 🔴 НЕ СРЕЗАТЬ ПРИСТАВКУ. Первая редакция срезала «Тренируем:» до двоеточия, и кадр с
/// эмулятора 02.10 показал «Вербальную гибкость», «Концентрацию»: в русском остаток стоит в
/// винительном падеже и сам по себе не читается. Приставки к тому же разные в разных языках
/// (у ja их четыре на одно и то же), так что группами по приставке тоже не выходит. Полная
/// подпись верна на всех двенадцати языках, а сортировка по ней сама ставит «Тренируем: …» подряд.
String skillTitle(String key) => L.t(key);

class Catalog {
  Catalog({required this.categories, required this.games, required this.entries, this.names = const {}});

  final List<CatalogCategory> categories;

  /// Записи `GAMES` в порядке веба — для разделов вкладки.
  final List<CatalogEntry> games;

  /// Всё, что находится поиском: игры, развилки, карточки за развилками — без повторов.
  final List<CatalogEntry> entries;

  /// Названия на других языках по ключу — см. [matches].
  final Map<String, List<String>> names;

  /// Навыки, у которых есть хоть одна игра, — в порядке подписи.
  List<String> get skills {
    final s = {for (final e in entries) ?e.skillKey}.toList();
    s.sort((a, b) => skillTitle(a).compareTo(skillTitle(b)));
    return s;
  }

  /// 🔴 ИЩЕМ ПО ТОМУ, ЧТО ЧЕЛОВЕК ВИДИТ, И ПО ДРУГОМУ ЯЗЫКУ ТОЖЕ. Дефект Chess & Go 24.09:
  /// сравнивали русское имя при английском интерфейсе — «no match». Здесь наоборот не
  /// нужно: имя на экране + английское и русское (приёмка f5025027) + адрес.
  bool matches(CatalogEntry e, String query, CatalogFilter? filter) {
    if (filter != null && !filter.accepts(e)) return false;
    final q = query.trim().toLowerCase();
    if (q.isEmpty) return true;
    if (e.name.toLowerCase().contains(q)) return true;
    if (e.route.toLowerCase().contains(q)) return true;
    for (final n in names[e.nameKey] ?? const <String>[]) {
      if (n.toLowerCase().contains(q)) return true;
    }
    return false;
  }

  List<CatalogEntry> find(String query, CatalogFilter? filter) =>
      [for (final e in entries) if (matches(e, query, filter)) e];

  static Catalog fromJson(Map<String, dynamic> catalog, Map<String, dynamic> hubs,
      {Map<String, List<String>> names = const {}}) {
    final cats = [
      for (final c in (catalog['categories'] as List).cast<Map<String, dynamic>>())
        CatalogCategory(
          id: c['id'] as String,
          titleKey: c['titleKey'] as String,
          icon: c['icon'] as String? ?? '',
          color: int.parse((c['color'] as String).replaceFirst('#', 'ff'), radix: 16),
        ),
    ];
    final games = [
      for (final g in (catalog['games'] as List).cast<Map<String, dynamic>>())
        CatalogEntry(
          id: g['id'] as String,
          route: g['route'] as String,
          nameKey: g['nameKey'] as String? ?? '',
          descKey: g['descKey'] as String? ?? '',
          icon: g['icon'] as String? ?? 'apps',
          skillKey: g['skillKey'] as String?,
          category: g['category'] as String?,
          hub: g['hub'] == true,
          hidden: g['hideFromMenu'] == true || g['sandbox'] == true,
          gradient: [
            for (final h in (g['gradient'] as List? ?? const []).cast<String>())
              Color(int.parse('ff${h.replaceFirst('#', '')}', radix: 16)),
          ],
          look: TileLook.fromJson(g['look']),
          thumb: g['thumb'] as String?,
          thumbOpacity: (g['thumbOpacity'] as num?)?.toDouble() ?? 0.22,
        ),
    ];
    final byRoute = {for (final g in games) g.route: g};
    final entries = <String, CatalogEntry>{for (final g in games) g.route: g};
    final hubCards = (hubs['hubs'] as Map<String, dynamic>? ?? const {});
    for (final h in hubCards.entries) {
      final parent = byRoute[h.key];
      for (final c in (h.value as List).cast<Map<String, dynamic>>()) {
        final route = c['route'] as String;
        if (entries.containsKey(route)) continue;
        entries[route] = CatalogEntry(
          route: route,
          nameKey: c['nameKey'] as String? ?? '',
          descKey: c['descKey'] as String? ?? '',
          icon: c['icon'] as String? ?? 'apps',
          skillKey: parent?.skillKey,
          category: parent?.category,
          hubRoute: h.key,
        );
      }
    }
    // Карточки, описанные только файлом состава (детские), — находятся по имени.
    for (final c in ((hubs['extra'] as Map<String, dynamic>?) ?? const {}).values) {
      final m = c as Map<String, dynamic>;
      final route = m['route'] as String;
      entries.putIfAbsent(
          route,
          () => CatalogEntry(
                route: route,
                nameKey: m['nameKey'] as String? ?? '',
                descKey: m['descKey'] as String? ?? '',
                icon: m['icon'] as String? ?? 'apps',
              ));
    }
    return Catalog(categories: cats, games: games, entries: entries.values.toList(), names: names);
  }

  /// ⚠️ БАЙТАМИ, А НЕ `loadString`: больше 50 КБ он декодирует в `compute()`, и testWidgets
  /// висит (замер `hub_screen.dart`, 30.09).
  static Future<Map<String, dynamic>> _json(String path) async {
    final b = await rootBundle.load(path);
    return jsonDecode(utf8.decode(b.buffer.asUint8List(b.offsetInBytes, b.lengthInBytes))) as Map<String, dynamic>;
  }

  static Future<Catalog> load() async {
    final catalog = await _json('assets/catalog.json');
    final hubs = await _json('assets/hubs.json');
    final base = fromJson(catalog, hubs);
    // Имена на английском и русском — чтобы «Мосты» находились на английском экране и «Bridges» на русском.
    final names = <String, List<String>>{};
    for (final lang in const ['en', 'ru']) {
      try {
        final d = await _json('assets/l10n/$lang.json');
        for (final e in base.entries) {
          final v = d[e.nameKey];
          if (v is String) (names[e.nameKey] ??= []).add(v);
        }
      } catch (_) {
        // Нет словаря — ищем по имени на экране и по адресу.
      }
    }
    return Catalog(categories: base.categories, games: base.games, entries: base.entries, names: names);
  }
}
