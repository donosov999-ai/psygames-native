import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;

import 'level_ladder.dart';
import 'shared_level_store.dart';
import 'l10n.dart';
import 'shared_state.dart';

/// РАЗВИЛКА (хаб) — ОБЩИЙ ЭКРАН НА ВСЕ РАЗДЕЛЫ.
///
/// 🔴 ПОЧЕМУ ОБЩИЙ, А НЕ У КАЖДОГО СВОЙ. В доске переезда ЧЕТЫРНАДЦАТЬ строк с
/// хабами у шести разделов, и все они показывают одно и то же: заголовок
/// развилки и список карточек. Шесть своих копий разъехались бы за неделю —
/// ровно поэтому в вебе тоже один `HubScreen` на все развилки.
///
/// 🔴 СОДЕРЖИМОЕ — ДАННЫМИ. Карточки лежат в `assets/hubs.json` (выгружены из
/// `src/constants/hubContents.ts` вместе с русскими подписями). Свой список в
/// коде значил бы второй реестр, который начнёт отставать от первого молча.
///
/// ⚠️ ЧЕГО ЗДЕСЬ НЕТ: отбора по профилю. В нативной половине профилей пока нет;
/// когда появятся — считать отбор ТАМ ЖЕ, где он считается в вебе.
class HubScreen extends StatefulWidget {
  const HubScreen({
    super.key,
    required this.state,
    required this.hubRoute,
    required this.icon,
    required this.gradient,
    this.header,
    this.isNative,
  });

  final SharedState state;

  /// Маршрут развилки — ключ в `assets/hubs.json`, например `/games/sorting-hub`.
  final String hubRoute;
  final IconData icon;
  final List<Color> gradient;

  /// ЧТО ПОКАЗАТЬ НАД СПИСКОМ КАРТОЧЕК. Просьба раздела «Шахматы» 23.09.2026, и
  /// она не единичная: в вебе над выбором стоит ЗАРЯДКА раздела — карточка,
  /// которая ставит несколько упражнений подряд по их собственным лестницам.
  /// Такие есть у «Шахмат» (`ChessWarmup`) и у «Слов» (`WordsWarmup`).
  ///
  /// ⚠️ Без этого слота раздел вынужден либо писать свой экран развилки вместо
  /// общего — и тогда счёт «правок каркаса ноль» кончается, — либо включить
  /// перехват и молча отнять у человека рабочую зарядку. «Шахматы» выбрали
  /// третье: не включать маршрут и сказать об этом, что и правильно.
  final Widget? header;

  /// Перенесена ли игра на Flutter. Нужно только для подписи на карточке:
  /// открывает её в любом случае оболочка (см. [HubCardTap]).
  final bool Function(String route)? isNative;

  @override
  State<HubScreen> createState() => _HubScreenState();
}

/// Карточка развилки: куда ведёт, как называется, чем отличается.
class HubCard {
  const HubCard({
    required this.route,
    required this.icon,
    required this.nameKey,
    required this.descKey,
    required this.type,
    this.levelKey,
  });

  factory HubCard.fromJson(Map<String, dynamic> j) => HubCard(
        route: j['route'] as String,
        icon: j['icon'] as String? ?? 'apps',
        nameKey: j['nameKey'] as String? ?? '',
        descKey: j['descKey'] as String? ?? '',
        type: j['type'] as String?,
        levelKey: j['levelKey'] as String?,
      );

  final String route;
  final String icon;

  /// 🔴 КЛЮЧИ СЛОВАРЯ, А НЕ ГОТОВЫЙ ТЕКСТ. До 23.09.2026 здесь лежали русские
  /// строки, и ВСЕ 13 развилок показывали один язык из двенадцати. Нашёл раздел
  /// «Судоку», и нашёл не гейтом: храповик зашитого текста смотрит КОД, а текст
  /// лежал в ДАННЫХ и проходил мимо него.
  final String nameKey;
  final String descKey;

  final String? type;

  /// Чем игра подписывает свой уровень, если это НЕ адрес карточки.
  /// Пусто — ключ берётся из адреса; расходятся три карточки из 113
  /// (замер 23.09.2026, см. `_boot`).
  final String? levelKey;

  String get name => nameKey.isEmpty ? route : L.t(nameKey);
  String get desc => descKey.isEmpty ? '' : L.t(descKey);
}

/// Значок карточки по имени из веб-реестра. Незнакомое имя — общий значок:
/// забытое поле не имеет права оставлять пустое место на экране.
IconData hubIcon(String name) {
  const map = {
    'basket': Icons.shopping_basket_outlined,
    'flask': Icons.science_outlined,
    'ellipse': Icons.circle_outlined,
    'settings': Icons.settings_outlined,
    'cafe': Icons.cake_outlined,
    'pizza': Icons.local_pizza_outlined,
    'git-branch-outline': Icons.account_tree_outlined,
    'layers': Icons.layers_outlined,
    'list-outline': Icons.list_alt_outlined,
    'grid': Icons.grid_view_outlined,
    'eye-outline': Icons.visibility_outlined,
    'extension-puzzle': Icons.extension_outlined,
  };
  return map[name] ?? Icons.extension_outlined;
}

class _HubScreenState extends State<HubScreen> {
  List<HubCard>? _cards;
  String _title = '';
  String _desc = '';
  String _footnote = '';
  String _pick = 'Выбери упражнение';
  final Map<String, int> _levels = {};

  @override
  void initState() {
    super.initState();
    _boot();
  }

  Future<void> _boot() async {
    final raw = await rootBundle.loadString('assets/hubs.json');
    final j = jsonDecode(raw) as Map<String, dynamic>;
    final cards = ((j['hubs'] as Map<String, dynamic>)[widget.hubRoute] as List? ?? [])
        .map((e) => HubCard.fromJson(e as Map<String, dynamic>))
        .toList();
    final meta = (j['meta'] as Map<String, dynamic>)[widget.hubRoute] as Map<String, dynamic>?;

    // Уровень каждой игры — из ОБЩЕЙ памяти, той же, что у веб-половины: на
    // карточке видно, где человек остановился, без захода в игру.
    for (final c in cards) {
      // 🔴 КЛЮЧ УРОВНЯ БЕРЁТСЯ ИЗ ДАННЫХ, А АДРЕС — ТОЛЬКО ЗАПАСНОЙ ВАРИАНТ.
      // Вывод ключа из адреса верен для 110 карточек из 113 и ВРЁТ для трёх:
      // Шульте пишет уровень как `schulte_table`, два режима «Лаборатории» —
      // с суффиксом режима. Человеку на девятом уровне развилка показывала
      // «ур. 1» — замер 23.09.2026 пробой развилок «Поиска» и «Счёта».
      final id = c.levelKey ?? c.route.split('/').last.replaceAll('-', '_');
      final ladder = LevelLadder(gameId: id, store: SharedLevelStore(widget.state));
      await ladder.load();
      _levels[c.route] = ladder.level;
    }
    if (!mounted) return;
    setState(() {
      _cards = cards;
      _title = meta?['title'] as String? ?? '';
      _desc = meta?['desc'] as String? ?? '';
      _footnote = meta?['footnote'] as String? ?? '';
      _pick = j['pick'] as String? ?? _pick;
    });
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final cards = _cards;
    return Scaffold(
      appBar: AppBar(
        title: Text(_title.isEmpty ? 'Развилка' : _title),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          tooltip: 'Назад',
          onPressed: () => Navigator.of(context).pop(),
        ),
      ),
      body: cards == null
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
              children: [
                // Шапка раздела идёт ПЕРЕД градиентным заголовком: зарядка —
                // это действие, а заголовок только называет раздел.
                if (widget.header != null) ...[
                  widget.header!,
                  const SizedBox(height: 12),
                ],
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      colors: widget.gradient,
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(widget.icon, size: 40, color: Colors.white),
                      const SizedBox(height: 8),
                      Text(_title,
                          style: const TextStyle(
                              fontSize: 22, fontWeight: FontWeight.w800, color: Colors.white)),
                      if (_desc.isNotEmpty) ...[
                        const SizedBox(height: 4),
                        Text(_desc, style: const TextStyle(color: Color(0xE6FFFFFF))),
                      ],
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                Text(_pick, style: TextStyle(color: scheme.onSurfaceVariant)),
                const SizedBox(height: 8),
                for (final c in cards)
                  Card(
                    margin: const EdgeInsets.only(bottom: 8),
                    child: ListTile(
                      key: ValueKey('hub-card-${c.route}'),
                      leading: CircleAvatar(
                        backgroundColor: scheme.secondaryContainer,
                        child: Icon(hubIcon(c.icon), color: scheme.onSecondaryContainer),
                      ),
                      title: Text(c.name, style: const TextStyle(fontWeight: FontWeight.w700)),
                      subtitle: Text(
                        [
                          if ((c.type ?? '').isNotEmpty) c.type!,
                          if (c.desc.isNotEmpty) c.desc,
                        ].join(' · '),
                        // ⚠️ ДВЕ СТРОКИ, А НЕ СКОЛЬКО ВЫЙДЕТ. На снимке описания
                        // растягивали карточку на четыре строки, и в экран
                        // помещалось три с половиной карточки из восьми — то есть
                        // развилка перестала показывать выбор.
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                      trailing: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          // Уровень — то самое, за чем человек и возвращается.
                          Text('ур. ${_levels[c.route] ?? 1}',
                              style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant)),
                          if (widget.isNative?.call(c.route) ?? false)
                            Icon(Icons.bolt, size: 14, color: scheme.primary),
                        ],
                      ),
                      /*
                       * 🔴 ОТКРЫВАЕТ НЕ ХАБ, А ОБОЛОЧКА. Хаб возвращает выбранный
                       * маршрут наверх (`pop`), а гибрид решает: перенесённую игру
                       * показать нативно, остальные открыть в веб-половине.
                       * Иначе хабу пришлось бы знать и карту нативных экранов, и
                       * веб-адреса — то есть быть второй оболочкой.
                       */
                      onTap: () => Navigator.of(context).pop(HubCardTap(c.route)),
                    ),
                  ),
                if (_footnote.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Text(_footnote,
                      style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant)),
                ],
              ],
            ),
    );
  }
}

/// Что вернул хаб оболочке: человек выбрал вот этот маршрут.
class HubCardTap {
  const HubCardTap(this.route);
  final String route;
}
