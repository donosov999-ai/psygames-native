import 'package:flutter/material.dart';

import 'catalog.dart';
import 'catalog_kit.dart';
import 'game_tile.dart';
import 'hub_screen.dart';
import 'l10n.dart';
import 'shared_state.dart';
import 'web_theme.dart';

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

class _CatalogScreenState extends State<CatalogScreen> {
  CatalogKit? _kit;
  Catalog? get _catalog => _kit?.catalog;
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

  Future<void> _boot() async {
    final kit = await CatalogKit.load(catalog: widget.catalog);
    if (!mounted) return;
    setState(() => _kit = kit);
  }

  ({Set<String>? games, Map<String, int> hubCount}) _visible() => _kit!.visible(widget.state);

  String? _iconFile(CatalogEntry e) => _kit!.iconFile(e);

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
    final web = WebTheme.of(context);
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
                      style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800, color: web.text)),
                )
              else
                const SizedBox(height: 8),
              TextField(
                key: const ValueKey('catalog-search'),
                controller: _search,
                // Поле — как единственное поле поиска веба (`HomeCatalogSearch.tsx`), не Material.
                style: WebTheme.fieldText(context),
                textInputAction: TextInputAction.search,
                decoration: WebTheme.field(
                  context,
                  hint: L.t('catalogSearch'),
                  suffix: _query.isEmpty
                      ? null
                      : IconButton(
                          key: const ValueKey('catalog-search-clear'),
                          tooltip: L.t('clear'),
                          icon: Icon(Icons.close, color: web.textSecondary),
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
    if (widget.embedded) return Material(color: web.background, child: WebTheme.textDefaults(context, body));
    return Scaffold(appBar: AppBar(title: Text(L.t('tabGames'))), body: body);
  }

  Widget _filterField(Catalog c) {
    Widget header(String text) => Text(text.toUpperCase(),
        style: TextStyle(
            fontSize: 12, fontWeight: FontWeight.w800, letterSpacing: 0.6, color: Theme.of(context).colorScheme.primary));
    // Подписи над полем нет (рисунок поля веба); что это фильтр, экранный чтец слышит меткой.
    return Semantics(
      label: L.t('catalogFilter'),
      child: DropdownButtonFormField<CatalogFilter?>(
      key: const ValueKey('catalog-filter'),
      initialValue: _filter,
      isExpanded: true,
      decoration: WebTheme.field(context),
      dropdownColor: WebTheme.of(context).surface,
      style: WebTheme.fieldText(context),
      iconEnabledColor: WebTheme.of(context).textSecondary,
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
      ),
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

  /// Сетка веба — общая с Главной ([CatalogKit.grid]).
  Widget _grid(List<CatalogEntry> games, Map<String, int> hubCount) => CatalogKit.grid(
        context,
        [for (final g in games) (_) => _kit!.tile(widget.state, g, hubCount: hubCount, onTap: () => _open(g))],
        keys: [for (final g in games) ValueKey('catalog-tile-${g.route}')],
      );

  Widget _sectionHeader(CatalogCategory cat, int count) =>
      CatalogKit.sectionHeader(context, cat, count, key: ValueKey('catalog-section-${cat.id}'));

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
