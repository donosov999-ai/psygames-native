import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;

import 'catalog.dart';
import 'hub_screen.dart';
import 'l10n.dart';
import 'shared_state.dart';

/// ВКЛАДКА «ИГРЫ» НА FLUTTER — РАЗДЕЛЫ, ПОИСК И ФИЛЬТР (задачи 9bd1b15d, f5025027).
///
/// 📍 Решение Дениса 01.10 (скрин Chess & Go): «поиск по играм, как у нас в шахматах, и
/// фильтр, как у них, снизу»; «фильтр ШИРЕ, чем количество хабов — выпадающим списком»;
/// «поиск и фильтры пока НЕ фильтруются по профилю». Образец — `lib/hub/catalog_screen.dart`
/// в Chess & Go: поле «Найти игру», под ним выпадающий список, при поиске — плоский список.
///
/// Без поиска экран — та же вкладка, что в вебе (`app/games.tsx` → `CategorySections`):
/// шесть разделов, в каждом сначала развилки, потом одиночные игры, ровно список профиля.
/// Список считает веб (`hubVisibility().catalog`, ключ [HubScreen.visibleKey]); правило
/// профиля здесь не переписано.
///
/// Фильтр — 6 разделов и 29 навыков (замер 02.10: развилок 13). Поиск и фильтр идут по ВСЕМ
/// играм, включая карточки за развилками ([Catalog.entries]).
///
/// Нажатие возвращает маршрут оболочке ([HubCardTap]) — открывает она, как из развилки.
class CatalogScreen extends StatefulWidget {
  const CatalogScreen({super.key, required this.state, this.catalog});

  final SharedState state;

  /// Готовый каталог — для проб; в приложении грузится из ассетов.
  final Catalog? catalog;

  @override
  State<CatalogScreen> createState() => _CatalogScreenState();
}

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
      // Нет карты иконок — строки со значками, каталог работает.
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

  void _open(CatalogEntry e) => Navigator.of(context).pop(HubCardTap(e.route));

  @override
  Widget build(BuildContext context) {
    final c = _catalog;
    return Scaffold(
      appBar: AppBar(title: Text(L.t('tabGames'))),
      body: c == null
          ? const Center(child: CircularProgressIndicator())
          : Column(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
                  child: Column(children: [
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
                  ]),
                ),
                Expanded(child: _query.trim().isEmpty && _filter == null ? _sections(c) : _flat(c)),
              ],
            ),
    );
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
        DropdownMenuItem<CatalogFilter?>(value: null, child: Text(L.t('catalogAll'))),
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

  /// Без поиска — разделы веба: развилки первыми, потом одиночные, в порядке `GAMES`.
  Widget _sections(Catalog c) {
    final v = _visible();
    final shown = [for (final g in c.games) if (v.games?.contains(g.id) ?? !g.hidden) g];
    return ListView(
      key: const ValueKey('catalog-sections'),
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
      children: [
        for (final cat in c.categories)
          if (shown.any((g) => g.category == cat.id)) ...[
            _sectionHeader(cat, shown.where((g) => g.category == cat.id).length),
            for (final g in [
              ...shown.where((g) => g.category == cat.id && g.hub),
              ...shown.where((g) => g.category == cat.id && !g.hub),
            ])
              _row(g, hubCount: g.hub ? v.hubCount[g.route] : null),
          ],
      ],
    );
  }

  Widget _sectionHeader(CatalogCategory cat, int count) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      key: ValueKey('catalog-section-${cat.id}'),
      padding: const EdgeInsets.only(top: 16, bottom: 8),
      child: Row(children: [
        Container(
            width: 4, height: 18, decoration: BoxDecoration(color: Color(cat.color), borderRadius: BorderRadius.circular(2))),
        const SizedBox(width: 8),
        Expanded(child: Text(cat.title, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700))),
        // Число — сколько в разделе всего, как в веб-вкладке.
        Text('$count', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: scheme.onSurfaceVariant)),
      ]),
    );
  }

  /// Поиск или фильтр — плоский список по алфавиту, по ВСЕМ играм.
  Widget _flat(Catalog c) {
    final found = c.find(_query, _filter)..sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));
    if (found.isEmpty) {
      return Center(
        key: const ValueKey('catalog-nothing'),
        child: Padding(padding: const EdgeInsets.all(24), child: Text(L.t('catalogNothing'), textAlign: TextAlign.center)),
      );
    }
    final counts = _visible().hubCount;
    return ListView(
      key: const ValueKey('catalog-flat'),
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
      children: [for (final e in found) _row(e, hubCount: e.hub ? counts[e.route] : null)],
    );
  }

  Widget _row(CatalogEntry e, {int? hubCount}) {
    final scheme = Theme.of(context).colorScheme;
    final file = ((_icons['byNameKey'] as Map?)?[e.nameKey] ?? (_icons['byRoute'] as Map?)?[e.route]) as String?;
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
