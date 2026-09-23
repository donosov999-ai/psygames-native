/// РАЗВИЛКА РАЗДЕЛА — ОДИН ЭКРАН НА ОБЕ: «Судоку: три доски» и «Головоломки».
///
/// 🔴 РАЗВИЛКА — ЭТО МЕНЮ, И ПОЛОВИНА ЕЁ КАРТОЧЕК ВЕДЁТ ТУДА, ГДЕ ИГРА ЕЩЁ В ВЕБЕ.
/// У «Головоломок» перенесён ноль из сорока карточек: движок Тэтхэма ждёт нативной
/// сборки. Нативная развилка без хода в веб была бы тупиком — человек нажал бы «Мины» и
/// не попал никуда. Поэтому экран НЕ решает, где живёт игра: он отдаёт маршрут наружу
/// (`onOpen`), а хост гибрида сам смотрит в карту перехвата — перенесённое открывает
/// нативно, остальное ведёт в WebView. Тот же колбэк `HybridApp.open` завела «Бездна»
/// пространственного раздела; здесь он ПРИНИМАЕТСЯ ПАРАМЕТРОМ, а не берётся из хоста:
/// так экран проверяется пробой без всего гибрида.
///
/// 🔴 ПОДПИСИ — ИЗ ДАННЫХ, А НЕ ИЗ КОДА. Карточки лежат в `assets/levels/hub-cards.json`
/// вместе с КЛЮЧАМИ словаря (`nameKey`, `descKey`, `typeKey`). Пока `L.t` не приехал в
/// main, экран показывает русский текст из того же ассета — и в долге зашитых строк
/// (храповик `ui_text_debt_does_not_grow_test.dart`) не прибавляется ни одной, потому
/// что в этом файле русских литералов нет вовсе. Приедет `L.t` — замена одной строки:
/// `card.ruName` → `L.t(card.nameKey)`.
library;

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show AssetManifest, rootBundle;

/// Карточка развилки: куда ведёт, чем подписана и каким ключом словаря.
class HubCard {
  const HubCard({
    required this.route,
    required this.icon,
    required this.nameKey,
    required this.descKey,
    required this.typeKey,
    required this.ruName,
    required this.ruDesc,
    required this.ruType,
  });

  final String route;
  final String icon;
  final String nameKey;
  final String? descKey;
  final String? typeKey;
  final String ruName;
  final String ruDesc;
  final String ruType;

  static HubCard fromJson(Map<String, Object?> j) {
    final ru = (j['ru'] as Map).cast<String, Object?>();
    return HubCard(
      route: j['route'] as String,
      icon: j['icon'] as String? ?? 'apps',
      nameKey: j['nameKey'] as String,
      descKey: j['descKey'] as String?,
      typeKey: j['typeKey'] as String?,
      ruName: ru['name'] as String? ?? '',
      ruDesc: ru['desc'] as String? ?? '',
      ruType: ru['type'] as String? ?? '',
    );
  }
}

/// Содержимое развилок: заголовки и карточки.
class HubContents {
  const HubContents(this._titles, this._cards);

  final Map<String, ({String name, String desc})> _titles;
  final Map<String, List<HubCard>> _cards;

  static const asset = 'assets/levels/hub-cards.json';

  static Future<HubContents> load() async {
    var has = false;
    try {
      final manifest = await AssetManifest.loadFromAssetBundle(rootBundle);
      has = manifest.listAssets().contains(asset);
    } catch (_) {
      has = false;
    }
    if (!has) return const HubContents({}, {});

    final json = jsonDecode(await rootBundle.loadString(asset)) as Map<String, Object?>;
    final titles = <String, ({String name, String desc})>{};
    for (final e in (json['titles'] as Map).cast<String, Object?>().entries) {
      final ru = ((e.value as Map).cast<String, Object?>()['ru'] as Map).cast<String, Object?>();
      titles[e.key] = (name: ru['name'] as String? ?? '', desc: ru['desc'] as String? ?? '');
    }
    final cards = <String, List<HubCard>>{};
    for (final e in (json['hubs'] as Map).cast<String, Object?>().entries) {
      cards[e.key] = [
        for (final c in (e.value as List).cast<Map<String, Object?>>()) HubCard.fromJson(c),
      ];
    }
    return HubContents(titles, cards);
  }

  ({String name, String desc}) title(String hub) => _titles[hub] ?? (name: '', desc: '');

  List<HubCard> cards(String hub) => _cards[hub] ?? const [];
}

/// Значки веб-версии переводятся в значки Flutter по имени. Незнакомое имя — не повод
/// показать пустоту: берётся общий значок.
IconData iconFor(String name) => switch (name) {
      'apps' || 'apps-outline' => Icons.apps,
      'grid' || 'grid-outline' => Icons.grid_on,
      'git-network' => Icons.account_tree,
      'business' => Icons.location_city,
      'swap-vertical' => Icons.swap_vert,
      'warning' => Icons.warning_amber,
      'remove-circle' => Icons.remove_circle_outline,
      'eye' => Icons.visibility,
      'bulb' => Icons.lightbulb_outline,
      'triangle' => Icons.change_history,
      'magnet' => Icons.hexagon_outlined,
      'skull' => Icons.sentiment_very_dissatisfied,
      'calculator' => Icons.calculate,
      'square-outline' => Icons.crop_square,
      'color-fill' => Icons.format_color_fill,
      'browsers' => Icons.web_asset,
      'planet' => Icons.public,
      'map' => Icons.map_outlined,
      'ellipse' || 'ellipse-outline' => Icons.circle_outlined,
      'chevron-forward' => Icons.chevron_right,
      'extension-puzzle' => Icons.extension,
      _ => Icons.grid_view,
    };

class HubScreen extends StatefulWidget {
  const HubScreen({super.key, required this.hub, required this.onOpen});

  /// Маршрут самой развилки: `/games/sudoku-hub` или `/games/puzzles-hub`.
  final String hub;

  /// Открыть маршрут. Решение «нативно или в вебе» принимает ХОСТ, не развилка.
  final void Function(String route) onOpen;

  @override
  State<HubScreen> createState() => _HubScreenState();
}

class _HubScreenState extends State<HubScreen> {
  HubContents? _contents;

  @override
  void initState() {
    super.initState();
    HubContents.load().then((c) {
      if (mounted) setState(() => _contents = c);
    });
  }

  @override
  Widget build(BuildContext context) {
    final contents = _contents;
    final scheme = Theme.of(context).colorScheme;
    if (contents == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    final title = contents.title(widget.hub);
    final cards = contents.cards(widget.hub);

    return Scaffold(
      appBar: AppBar(title: Text(title.name)),
      body: SafeArea(
        child: ListView.separated(
          padding: const EdgeInsets.all(12),
          itemCount: cards.length + (title.desc.isEmpty ? 0 : 1),
          separatorBuilder: (_, _) => const SizedBox(height: 8),
          itemBuilder: (context, i) {
            if (title.desc.isNotEmpty && i == 0) {
              return Padding(
                padding: const EdgeInsets.only(bottom: 4, left: 4, right: 4),
                child: Text(title.desc, style: Theme.of(context).textTheme.bodyMedium),
              );
            }
            final card = cards[title.desc.isEmpty ? i : i - 1];
            return Material(
              color: scheme.surfaceContainerHighest,
              borderRadius: BorderRadius.circular(12),
              child: InkWell(
                key: Key('card_${card.route}'),
                borderRadius: BorderRadius.circular(12),
                onTap: () => widget.onOpen(card.route),
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Row(
                    children: [
                      Icon(iconFor(card.icon), color: scheme.primary),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(card.ruName,
                                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                            if (card.ruDesc.isNotEmpty)
                              Text(card.ruDesc,
                                  style: TextStyle(fontSize: 13, color: scheme.onSurfaceVariant)),
                            if (card.ruType.isNotEmpty)
                              Text(card.ruType,
                                  style: TextStyle(fontSize: 12, color: scheme.primary)),
                          ],
                        ),
                      ),
                      Icon(Icons.chevron_right, color: scheme.onSurfaceVariant),
                    ],
                  ),
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}
