import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;

import 'catalog.dart';
import 'game_tile.dart';
import 'hub_screen.dart';
import 'l10n.dart';
import 'shared_state.dart';

/// ВКЛАДКА «ИГРЫ» НА FLUTTER — ПЛИТКИ ВЕБА, ПОИСК НАД НИМИ, ФИЛЬТР ПОД ПОИСКОМ (задачи 99628ecf, de8ac1eb).
///
/// 📍 Решение Дениса 04.10.2026 (99628ecf) и правило 4e679f41: по умолчанию — цветные двухколоночные
/// плитки старого веба (`app/games.tsx` → `CategorySections` → `GameCard`, перенос — [GameTile]);
/// поиск прямо НАД развилками, фильтр ПОД ним; строки найденных игр — только при непустом запросе или
/// фильтре, в том же окне; очистка и «Все игры» возвращают плитки. Первая редакция (#207, 02.10) рисовала
/// постоянные строки на отдельном экране — это и было названо несогласованным упрощением.
///
/// Экран живёт ВКЛАДКОЙ нативной оболочки ([embedded]): своей верхней панели нет, нижние вкладки на
/// месте, игру открывает оболочка ([onOpen]). Отдельным экраном (без [embedded]) — только в пробах.
///
/// Разделы по умолчанию — ровно список профиля: его считает веб той же функцией, что рисует свою
/// вкладку (`hubVisibility().catalog`, ключ [HubScreen.visibleKey]). Поиск и фильтр — по ВСЕМ играм,
/// включая карточки за развилками ([Catalog.entries]) — решение Дениса 01.10.
class CatalogScreen extends StatefulWidget {
  const CatalogScreen({
    super.key,
    required this.state,
    this.catalog,
    this.initialQuery = '',
    this.embedded = false,
    this.onOpen,
  });

  final SharedState state;
  final String initialQuery;

  /// Готовый каталог — для проб; в приложении грузится из ассетов.
  final Catalog? catalog;

  /// Вкладка оболочки: без верхней панели, заголовок — в прокрутке, как на вебе.
  final bool embedded;

  /// Кто открывает игру. Нет — экран снимается и отдаёт маршрут наверх ([HubCardTap]).
  final void Function(String route)? onOpen;

  @override
  State<CatalogScreen> createState() => _CatalogScreenState();
}

/// Значки разделов (`CATEGORY_META.icon`, Ionicons) → Material.
const _categoryIcons = <String, IconData>{
  'library-outline': Icons.menu_book_outlined,
  'eye-outline': Icons.visibility_outlined,
  'extension-puzzle-outline': Icons.extension_outlined,
  'sparkles-outline': Icons.auto_awesome_outlined,
  'flash-outline': Icons.flash_on_outlined,
  'flower-outline': Icons.local_florist_outlined,
};

class _CatalogScreenState extends State<CatalogScreen> {
  Catalog? _catalog;
  Map<String, dynamic> _icons = const {};
  Map<String, dynamic> _hubs = const {};
  String _query = '';
  CatalogFilter? _filter;
  final _search = TextEditingController();

  // Заголовки групп в списке фильтра — неактивные строки со своими значениями: у
  // выпадающего списка значение каждой строки обязано быть единственным.
  static const _sectionsHeader = CatalogFilter.section('#sections');
  static const _skillsHeader = CatalogFilter.skill('#skills');

  @override
  void initState() {
    super.initState();
    _query = widget.initialQuery.trim();
    _search.text = _query;
    _boot();
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<Map<String, dynamic>> _json(String path) async {
    final b = await rootBundle.load(path);
    return jsonDecode(utf8.decode(b.buffer.asUint8List(b.offsetInBytes, b.lengthInBytes))) as Map<String, dynamic>;
  }

  Future<void> _boot() async {
    final catalog = widget.catalog ?? await Catalog.load();
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
    if (!mounted) return;
    setState(() {
      _catalog = catalog;
      _icons = icons;
      _hubs = hubs;
    });
  }

  /// Видимое профилю: список веба, если посчитан для ТЕКУЩЕГО профиля; иначе — всё, что не
  /// спрятано из меню (пустой каталог хуже лишней строки, как и в [HubScreen]).
  ({Set<String>? games, Map<String, int> hubCount}) _visible() {
    final counts = <String, int>{
      for (final e in ((_hubs['hubs'] as Map<String, dynamic>?) ?? const {}).entries) e.key: (e.value as List).length,
    };
    final raw = widget.state.get(HubScreen.visibleKey);
    if (raw == null || raw.isEmpty) return (games: null, hubCount: counts);
    try {
      final o = jsonDecode(raw) as Map<String, dynamic>;
      if (o['profile'] != widget.state.activeProfile) return (games: null, hubCount: counts);
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
  int _starsCompleted(String id) {
    final raw = widget.state.get('psygames_${id}_stars_${widget.state.activeProfile}');
    if (raw == null || raw.isEmpty) return 0;
    try {
      final m = jsonDecode(raw) as Map<String, dynamic>;
      return m.values.where((v) => v is num && v > 0).length;
    } catch (_) {
      return 0;
    }
  }

  String? _iconFile(CatalogEntry e) =>
      ((_icons['byNameKey'] as Map?)?[e.nameKey] ?? (_icons['byRoute'] as Map?)?[e.route]) as String?;

  void _open(CatalogEntry e) {
    final open = widget.onOpen;
    if (open != null) {
      open(e.route);
    } else {
      Navigator.of(context).pop(HubCardTap(e.route));
    }
  }

  bool get _searching => _query.trim().isNotEmpty || _filter != null;

  @override
  Widget build(BuildContext context) {
    final c = _catalog;
    final scheme = Theme.of(context).colorScheme;
    final body = c == null
        ? const Center(child: CircularProgressIndicator())
        : ListView(
            key: const ValueKey('catalog-list'),
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            children: [
              if (widget.embedded)
                Padding(
                  // Заголовок вкладки — как `app/games.tsx`: 24/800, сверху 8, снизу 14.
                  padding: const EdgeInsets.only(top: 8, bottom: 14),
                  child: Text(L.t('tabGames'),
                      style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800, color: scheme.onSurface)),
                )
              else
                const SizedBox(height: 8),
              TextField(
                key: const ValueKey('catalog-search'),
                controller: _search,
                decoration: InputDecoration(
                  prefixIcon: const Icon(Icons.search),
                  hintText: L.t('catalogSearch'),
                  border: const OutlineInputBorder(),
                  isDense: true,
                  suffixIcon: _query.isEmpty
                      ? null
                      : IconButton(
                          key: const ValueKey('catalog-search-clear'),
                          icon: const Icon(Icons.close),
                          onPressed: () => setState(() {
                            _search.clear();
                            _query = '';
                          }),
                        ),
                ),
                onChanged: (v) => setState(() => _query = v),
              ),
              const SizedBox(height: 8),
              _filterField(c),
              const SizedBox(height: 12),
              if (_searching) _flat(c) else _sections(c),
            ],
          );
    // Вкладка без своего Scaffold — поле ввода всё равно обязано стоять на Material.
    if (widget.embedded) return Material(type: MaterialType.transparency, child: body);
    return Scaffold(appBar: AppBar(title: Text(L.t('tabGames'))), body: body);
  }

  Widget _filterField(Catalog c) {
    Widget header(String text) => Text(text.toUpperCase(),
        style: TextStyle(
            fontSize: 12, fontWeight: FontWeight.w800, letterSpacing: 0.6, color: Theme.of(context).colorScheme.primary));
    return DropdownButtonFormField<CatalogFilter?>(
      key: const ValueKey('catalog-filter'),
      initialValue: _filter,
      isExpanded: true,
      decoration: InputDecoration(labelText: L.t('catalogFilter'), border: const OutlineInputBorder(), isDense: true),
      items: [
        DropdownMenuItem<CatalogFilter?>(value: null, child: Text(L.t('allGames'))),
        DropdownMenuItem<CatalogFilter?>(value: _sectionsHeader, enabled: false, child: header(L.t('catalogBySection'))),
        for (final cat in c.categories)
          DropdownMenuItem<CatalogFilter?>(
            value: CatalogFilter.section(cat.id),
            child: Row(children: [
              Container(width: 4, height: 16, color: Color(cat.color)),
              const SizedBox(width: 8),
              Flexible(child: Text(cat.title, overflow: TextOverflow.ellipsis)),
            ]),
          ),
        DropdownMenuItem<CatalogFilter?>(value: _skillsHeader, enabled: false, child: header(L.t('catalogBySkill'))),
        for (final s in c.skills)
          DropdownMenuItem<CatalogFilter?>(
            value: CatalogFilter.skill(s),
            child: Text(skillTitle(s), overflow: TextOverflow.ellipsis),
          ),
      ],
      onChanged: (v) => setState(() => _filter = v),
    );
  }

  /// Без поиска — разделы веба плитками: развилки первыми, потом одиночные, в порядке `GAMES`.
  Widget _sections(Catalog c) {
    final v = _visible();
    final shown = [for (final g in c.games) if (v.games?.contains(g.id) ?? !g.hidden) g];
    return Column(
      key: const ValueKey('catalog-sections'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final cat in c.categories)
          if (shown.any((g) => g.category == cat.id))
            Padding(
              // Раздел — отступ 24 снизу (`CategorySections`, styles.section).
              padding: const EdgeInsets.only(bottom: 24),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                _sectionHeader(cat, shown.where((g) => g.category == cat.id).length),
                _grid([
                  ...shown.where((g) => g.category == cat.id && g.hub),
                  ...shown.where((g) => g.category == cat.id && !g.hub),
                ], v.hubCount),
              ]),
            ),
      ],
    );
  }

  /// Сетка веба: `repeat(auto-fill, minmax(150px | 170px, 1fr))`, зазор 10, высота = ширина × 1,06.
  Widget _grid(List<CatalogEntry> games, Map<String, int> hubCount) => LayoutBuilder(builder: (context, box) {
        const gap = 10.0;
        final minTile = MediaQuery.sizeOf(context).width < 480 ? 150.0 : 170.0;
        final cols = ((box.maxWidth + gap) / (minTile + gap)).floor().clamp(1, 6);
        final w = (box.maxWidth - gap * (cols - 1)) / cols;
        return Wrap(spacing: gap, runSpacing: gap, children: [
          for (final g in games)
            SizedBox(
              key: ValueKey('catalog-tile-${g.route}'),
              width: w,
              height: w * 1.06,
              child: GameTile(
                title: g.name,
                description: g.desc,
                skill: g.skillKey == null ? '' : L.t(g.skillKey!),
                gradient: g.gradient.length >= 2 ? g.gradient : const [Color(0xFF667EEA), Color(0xFF764BA2)],
                look: g.look ?? TileLook.fallback,
                iconFile: _iconFile(g),
                glyph: hubIcon(g.icon),
                thumbFile: g.thumb,
                thumbOpacity: g.thumbOpacity,
                hubCount: g.hub ? hubCount[g.route] : null,
                starsCompleted: g.id == null ? 0 : _starsCompleted(g.id!),
                onTap: () => _open(g),
              ),
            ),
        ]);
      });

  Widget _sectionHeader(CatalogCategory cat, int count) {
    final scheme = Theme.of(context).colorScheme;
    final color = Color(cat.color);
    // Как `CategorySections` (styles.sectionHeader): черта 4×18, значок 20, название 17/700, число 13/600.
    return Padding(
      key: ValueKey('catalog-section-${cat.id}'),
      padding: const EdgeInsets.only(left: 4, bottom: 12),
      child: Row(children: [
        Container(width: 4, height: 18, decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(2))),
        const SizedBox(width: 8),
        Icon(_categoryIcons[cat.icon] ?? Icons.apps, size: 20, color: color),
        const SizedBox(width: 8),
        Expanded(
            child:
                Text(cat.title, style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: scheme.onSurface))),
        // Число — сколько в разделе всего, как в веб-вкладке.
        Text('$count', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: scheme.onSurfaceVariant)),
      ]),
    );
  }

  /// Поиск или фильтр — строки найденного по алфавиту, по ВСЕМ играм, в том же окне.
  Widget _flat(Catalog c) {
    final found = c.find(_query, _filter)..sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));
    if (found.isEmpty) {
      return Padding(
        key: const ValueKey('catalog-nothing'),
        padding: const EdgeInsets.all(24),
        child: Text(L.t('catalogNothing'), textAlign: TextAlign.center),
      );
    }
    final counts = _visible().hubCount;
    return Column(
      key: const ValueKey('catalog-flat'),
      children: [for (final e in found) _row(e, hubCount: e.hub ? counts[e.route] : null)],
    );
  }

  Widget _row(CatalogEntry e, {int? hubCount}) {
    final scheme = Theme.of(context).colorScheme;
    final file = _iconFile(e);
    final skill = e.skillKey == null ? '' : L.t(e.skillKey!);
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        key: ValueKey('catalog-row-${e.route}'),
        leading: file != null
            ? ClipRRect(
                borderRadius: BorderRadius.circular(10),
                child: Image.asset('assets/game_icons/$file',
                    width: 40, height: 40, fit: BoxFit.cover, excludeFromSemantics: true),
              )
            : CircleAvatar(
                backgroundColor: scheme.secondaryContainer,
                child: Icon(hubIcon(e.icon), color: scheme.onSecondaryContainer),
              ),
        title: Text(e.name, style: const TextStyle(fontWeight: FontWeight.w700)),
        subtitle: Text(
          [if (skill.isNotEmpty && !e.hub) skill, if (e.desc.isNotEmpty) e.desc].join(' · '),
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
        ),
        trailing: hubCount == null
            ? const Icon(Icons.chevron_right)
            : Chip(
                key: ValueKey('catalog-hubcount-${e.route}'),
                label: Text('$hubCount'),
                visualDensity: VisualDensity.compact,
              ),
        onTap: () => _open(e),
      ),
    );
  }
}
