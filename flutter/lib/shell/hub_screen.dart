import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;

import 'catalog.dart';
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
  /// Ключ общей памяти, куда веб кладёт состав развилок активного профиля
  /// (`frontend/src/services/hubVisibility.ts`, задача c86ddae6).
  static const visibleKey = 'psygames_hub_visible';

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

/// Значки карточек: имя из веб-реестра (Ionicons) → ближайший значок Material.
///
/// 🔴 ТАБЛИЦА ПОЛНАЯ — ПО ВСЕМ ИМЕНАМ ИЗ `assets/hubs.json`. До 30.09.2026 в ней
/// было 12 имён из 75, и 98 карточек из 113 показывали общий значок-пазл: в
/// «Объёме памяти» пять из шести, в «Головоломках» почти все сорок. Полноту держит
/// проба `hub_icons_are_mapped_test.dart`: новое имя в веб-реестре без строки
/// здесь — красный CI с этим именем, а не тихий пазл на экране.
const Map<String, IconData> hubIcons = {
  'add-circle': Icons.add_circle_outline,
  'albums': Icons.collections_outlined,
  'analytics': Icons.analytics_outlined,
  'apps': Icons.apps,
  'apps-outline': Icons.apps,
  'arrow-forward': Icons.arrow_forward,
  'basket': Icons.shopping_basket_outlined,
  'boat': Icons.directions_boat_outlined,
  'book': Icons.menu_book_outlined,
  'browsers': Icons.web_outlined,
  'bulb': Icons.lightbulb_outline,
  'business': Icons.business_outlined,
  'cafe': Icons.cake_outlined,
  'calculator': Icons.calculate_outlined,
  'car': Icons.directions_car_outlined,
  'chatbubbles': Icons.forum_outlined,
  'checkmark-done': Icons.done_all,
  'chevron-forward': Icons.chevron_right,
  'color-fill': Icons.format_color_fill,
  'color-palette': Icons.palette_outlined,
  'contrast': Icons.contrast,
  'copy': Icons.content_copy,
  'create': Icons.edit_outlined,
  'create-outline': Icons.edit_outlined,
  'cube': Icons.view_in_ar_outlined,
  'cube-outline': Icons.view_in_ar_outlined,
  'diamond': Icons.diamond_outlined,
  'dice': Icons.casino_outlined,
  'disc': Icons.album_outlined,
  'ear': Icons.hearing,
  'ellipse': Icons.circle_outlined,
  'ellipse-outline': Icons.circle_outlined,
  'extension-puzzle': Icons.extension_outlined,
  'eye': Icons.visibility_outlined,
  'eye-off': Icons.visibility_off_outlined,
  'eye-outline': Icons.visibility_outlined,
  'flash': Icons.flash_on_outlined,
  'flask': Icons.science_outlined,
  'funnel': Icons.filter_alt_outlined,
  'git-branch': Icons.account_tree_outlined,
  'git-branch-outline': Icons.account_tree_outlined,
  'git-compare': Icons.compare_arrows,
  'git-merge': Icons.merge,
  'git-network': Icons.hub_outlined,
  'git-network-outline': Icons.hub_outlined,
  'grid': Icons.grid_view_outlined,
  'grid-outline': Icons.grid_view_outlined,
  'hand-left': Icons.back_hand_outlined,
  'happy': Icons.sentiment_satisfied_alt_outlined,
  'headset': Icons.headset_outlined,
  'home': Icons.home_outlined,
  'keypad': Icons.dialpad,
  'layers': Icons.layers_outlined,
  'link': Icons.link,
  'list-outline': Icons.list_alt_outlined,
  'locate': Icons.my_location,
  // Магнитов в Material нет — «Магниты» Тэтхэма про полюса «+» и «−».
  'magnet': Icons.exposure_outlined,
  'map': Icons.map_outlined,
  'mic': Icons.mic_none_outlined,
  'musical-note': Icons.music_note_outlined,
  'musical-notes': Icons.queue_music_outlined,
  'navigate': Icons.navigation_outlined,
  'paw': Icons.pets_outlined,
  'person': Icons.person_outline,
  'pizza': Icons.local_pizza_outlined,
  'planet': Icons.public,
  'remove-circle': Icons.remove_circle_outline,
  'repeat': Icons.repeat,
  'scan': Icons.crop_free,
  'search': Icons.search,
  'settings': Icons.settings_outlined,
  'share-social': Icons.share_outlined,
  'shuffle': Icons.shuffle,
  // Черепа в Material нет — «Нежить» Тэтхэма про опасные клетки.
  'skull': Icons.dangerous_outlined,
  'square-outline': Icons.crop_square,
  'swap-horizontal': Icons.swap_horiz,
  'swap-vertical': Icons.swap_vert,
  'sync': Icons.sync,
  'sync-circle': Icons.sync,
  'text': Icons.text_fields,
  'timer': Icons.timer_outlined,
  'train': Icons.train_outlined,
  'trending-up': Icons.trending_up,
  'triangle': Icons.change_history,
  'warning': Icons.warning_amber_outlined,
  'water': Icons.water_drop_outlined,
};

/// Значок карточки по имени из веб-реестра. Незнакомое имя — общий значок:
/// забытое поле не имеет права оставлять пустое место на экране.
IconData hubIcon(String name) => hubIcons[name] ?? Icons.extension_outlined;

/// 🖼 ИКОНКА ИГРЫ В СТРОКЕ РАЗВИЛКИ — «поле игры в миниатюре» (решение Дениса 13.09.2026:
/// «иконка должна быть мини-экраном приложения»; 01.10.2026 — показывать В ПРИЛОЖЕНИИ).
/// Картинки и карта — выгрузка веб-реестра `flutter/tools/embed-game-icons.mjs`
/// (`assets/game_icons/`). Ищем по ключу названия, как веб (`gameIconByNameKey`), затем
/// по адресу целиком: семь строк подписаны своим ключом (`suiteStroop` → `/games/stroop`).
/// С 01.10.2026 иконка есть у всех 114 строк (режимы — `MODE_ICONS`, по адресу целиком);
/// нет иконки (новая строка, битая выгрузка) — прежний значок: пустого места быть не может.
String? hubIconFile(Map<String, dynamic> index, HubCard c) =>
    ((index['byNameKey'] as Map?)?[c.nameKey] ?? (index['byRoute'] as Map?)?[c.route]) as String?;

class _HubScreenState extends State<HubScreen> {
  List<HubCard>? _cards;
  Map<String, dynamic> _icons = const {};
  String _title = '';
  String _desc = '';
  String _footnote = '';
  String _pick = 'Выбери упражнение';
  final Map<String, int> _levels = {};

  /// Поиск и фильтр внутри развилки (задача f5025027): строки ищутся тем же [Catalog], что
  /// и во вкладке «Игры», — на языке экрана, по-английски и по-русски.
  Catalog? _catalog;
  String _query = '';
  String? _skill;
  bool _searching = false;

  @override
  void initState() {
    super.initState();
    _boot();
  }

  /*
   * 🔴 СОСТАВ РАЗВИЛКИ БЕРЁТСЯ ТОЙ ЖЕ ЦЕПОЧКОЙ, ЧТО И В ВЕБЕ.
   *
   * ПОЙМАНО 24.09.2026 отчётом Дениса: «в хабах лагает — то старый хаб без
   * Тэтхэма, то новый с Тэтхэмом». Причина не в мигании, а в том, что составов
   * было ДВА. Замер по файлу состава против нативного набора:
   *   Головоломки 4 против 40 · Судоку 12 против 5 · Пространство 17 против 9
   *   Сортировка 17 против 8 · Счёт 14 против 7 · Поиск 13 против 8.
   * Сорок режимов Тэтхэма давно разнесены по тематическим развилкам решениями
   * Дениса, а натив показывал ЗАВОДСКОЙ список.
   *
   * Веб берёт так (`ProfileContext.tsx:218`):
   *   сохранённый состав профиля → общий раздел состава → заводской список.
   * Повторяем цепочку звено в звено. Сохранённый состав живёт в хранилище под
   * `psygames_playlists_override`, и мост его уже возит — то есть правда у нас
   * УЖЕ есть, её просто не читали.
   *
   * ⚠️ Карточку нельзя ПРИДУМАТЬ составом: строка ищется в заводском реестре, а
   * объект несёт свои ключи. Так же устроен `visibleHubCards` в вебе.
   */
  /// 🔴 ПРАВИЛО ПРОФИЛЯ: В РАЗВИЛКЕ ТОЛЬКО ТО, ЧТО ПРОФИЛЬ ОТКРЫВАЕТ (задача c86ddae6).
  ///
  /// Замер 01.10.2026: значок «Мнемоники» в каталоге — «1», а здесь было 5 строк; дети
  /// видели за развилкой игры, закрытые их профилем. Само правило (всегда разрешённое,
  /// подъём к родителям, отсев сырых, файл состава) не переписано на Dart: веб считает
  /// видимое ТОЙ ЖЕ функцией, что и значок (`frontend/src/services/hubVisibility.ts`),
  /// и кладёт в [HubScreen.visibleKey]. Нет ключа или он посчитан для другого профиля — показываем
  /// как прежде: пустая развилка хуже лишней строки.
  ///
  /// 🔴 СПИСОК ВЕБА — ЦЕЛИКОМ И В ЕГО ПОРЯДКЕ, А НЕ ПЕРЕСЕЧЕНИЕ СО СВОЕЙ РАСКЛАДКОЙ (задача 4a5bb886).
  /// Было: карточки своей раскладки (файл состава → заводской список) ∩ список веба. Веб дописывает
  /// новые карточки, которых файл не знает («новое — во все профили», решение Дениса 02.10), а
  /// раскладка их не содержит — пересечение выкидывало их, и «Кошки», шахматные задачи и режимы
  /// Тэтхэма не показывались нигде. Карточку ищем по всему реестру (`hubs`, `extra`, описанные файлом).
  List<HubCard> _visibleFor(List<HubCard> cards, Map<String, dynamic> bundle) {
    final raw = widget.state.get(HubScreen.visibleKey);
    if (raw == null || raw.isEmpty) return cards;
    try {
      final o = jsonDecode(raw) as Map<String, dynamic>;
      if (o['profile'] != widget.state.activeProfile) return cards;
      final list = (o['hubs'] as Map<String, dynamic>?)?[widget.hubRoute] as List?;
      if (list == null) return cards;
      final byRoute = <String, HubCard>{
        for (final l in ((bundle['hubs'] as Map<String, dynamic>?) ?? const {}).values)
          for (final e in l as List) HubCard.fromJson(e as Map<String, dynamic>).route: HubCard.fromJson(e),
        for (final e in ((bundle['extra'] as Map<String, dynamic>?) ?? const {}).values)
          HubCard.fromJson(e as Map<String, dynamic>).route: HubCard.fromJson(e),
        for (final c in cards) c.route: c,
      };
      return [for (final r in list.cast<String>()) ?byRoute[r]];
    } catch (_) {
      return cards;
    }
  }

  List<HubCard> _cardsFor(Map<String, dynamic> bundle) {
    final factory_ = ((bundle['hubs'] as Map<String, dynamic>)[widget.hubRoute] as List? ?? [])
        .map((e) => HubCard.fromJson(e as Map<String, dynamic>))
        .toList();

    List<dynamic>? items;
    // 1. Состав, сохранённый на устройстве, — он и есть живая правда.
    final saved = widget.state.get('psygames_playlists_override');
    if (saved != null && saved.isNotEmpty) {
      try {
        final o = jsonDecode(saved) as Map<String, dynamic>;
        final byProfile = (o['профили'] as Map<String, dynamic>?)?[widget.state.activeProfile];
        items = ((byProfile as Map<String, dynamic>?)?['хабы']
                as Map<String, dynamic>?)?[widget.hubRoute] as List?;
        items ??= (o['хабы'] as Map<String, dynamic>?)?[widget.hubRoute] as List?;
      } catch (_) {
        // Испорченный состав — не повод показать пустую развилку: идём дальше.
      }
    }
    // 2. Раскладки, выгруженные из заводского файла состава (`layouts`).
    if (items == null) {
      final layouts = bundle['layouts'] as Map<String, dynamic>?;
      final mine = layouts?[widget.state.activeProfile] as Map<String, dynamic>?;
      items = mine?[widget.hubRoute] as List?;
    }
    if (items == null) return factory_;

    /*
     * 🔴 КАРТОЧКУ ИЩЕМ ВО ВСЁМ РЕЕСТРЕ, А НЕ В СВОЕЙ РАЗВИЛКЕ.
     *
     * Раскладка переносит карточки МЕЖДУ развилками: сорок режимов Тэтхэма
     * разнесены из «Головоломок» по тематическим. Значит адрес из раскладки
     * «Сортировки» описан в карточках «Головоломок», и поиск только среди своих
     * не нашёл бы ни одного — развилка молча осталась бы заводской.
     */
    final byRoute = <String, HubCard>{};
    for (final list in (bundle['hubs'] as Map<String, dynamic>).values) {
      for (final e in list as List) {
        final c = HubCard.fromJson(e as Map<String, dynamic>);
        byRoute[c.route] = c;
      }
    }
    for (final e in (bundle['extra'] as Map<String, dynamic>? ?? {}).values) {
      final c = HubCard.fromJson(e as Map<String, dynamic>);
      byRoute[c.route] = c;
    }

    final out = <HubCard>[];
    for (final e in items) {
      if (e is String) {
        final c = byRoute[e];
        if (c != null) out.add(c);
        continue;
      }
      if (e is! Map) continue;
      // Состав, сохранённый на устройстве, описывает карточку своими полями —
      // теми же, что в веб-файле. Забытый значок не имеет права оставлять на
      // экране пустое место, поэтому у него есть общий запасной.
      final m = e.cast<String, dynamic>();
      final route = m['маршрут'] ?? m['route'];
      final nameKey = m['имя'] ?? m['nameKey'];
      if (route is! String || nameKey is! String) continue;
      out.add(HubCard(
        route: route,
        icon: (m['значок'] ?? m['icon'] ?? 'extension-puzzle') as String,
        nameKey: nameKey,
        descKey: (m['описание'] ?? m['descKey'] ?? nameKey) as String,
        type: null,
      ));
    }
    return out.isEmpty ? factory_ : out;
  }

  Future<void> _boot() async {
    // ⚠️ БАЙТАМИ, А НЕ `loadString`: с 51 200 байт он декодирует в `compute()`,
    // и testWidgets висит десять минут. 30.09.2026 файл весил 47 979 — запас 3 КБ.
    final data = await rootBundle.load('assets/hubs.json');
    final raw = utf8.decode(data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes));
    final j = jsonDecode(raw) as Map<String, dynamic>;
    final cards = _visibleFor(_cardsFor(j), j);
    final meta = (j['meta'] as Map<String, dynamic>)[widget.hubRoute] as Map<String, dynamic>?;
    var icons = const <String, dynamic>{};
    try {
      final b = await rootBundle.load('assets/game_icons/index.json');
      icons = jsonDecode(utf8.decode(b.buffer.asUint8List(b.offsetInBytes, b.lengthInBytes))) as Map<String, dynamic>;
    } catch (_) {
      // Нет карты — строки остаются со значками, развилка работает как прежде.
    }

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
    Catalog? catalog;
    try {
      catalog = await Catalog.load();
    } catch (_) {
      // Нет каталога — развилка без поиска, как прежде.
    }
    if (!mounted) return;
    // 🔴 КЛЮЧ СЛОВАРЯ ПРЕЖДЕ ТЕКСТА: `meta` несёт ключи, снятые с веб-экрана
    // развилки (embed-hubs.mjs), а русский текст — только запасной путь для
    // развилок без ключей. Без этого заголовок говорил по-русски на всех языках.
    String tr(String keyField, String? text) {
      final key = meta?[keyField] as String?;
      return (key != null && key.isNotEmpty) ? L.t(key) : (text ?? '');
    }

    setState(() {
      _cards = cards;
      _catalog = catalog;
      _icons = icons;
      _title = tr('titleKey', meta?['title'] as String?);
      _desc = tr('descKey', meta?['desc'] as String?);
      _footnote = tr('footnoteKey', meta?['footnote'] as String?);
      _pick = tr('pickKey', j['pick'] as String? ?? _pick);
    });
  }

  CatalogEntry? _entry(HubCard c) {
    for (final e in _catalog?.entries ?? const <CatalogEntry>[]) {
      if (e.route == c.route) return e;
    }
    return null;
  }

  /// Навыки карточек этой развилки. Один навык на всех (сорок режимов Тэтхэма наследуют
  /// навык «Головоломок») — фильтра нет: список из одной строки ничего не отбирает.
  List<String> _skills(List<HubCard> cards) {
    final s = {for (final c in cards) ?_entry(c)?.skillKey}.toList()
      ..sort((a, b) => skillTitle(a).compareTo(skillTitle(b)));
    return s;
  }

  bool _shows(HubCard c) {
    final e = _entry(c);
    if (_skill != null && e?.skillKey != _skill) return false;
    if (_query.trim().isEmpty) return true;
    if (e != null) return _catalog!.matches(e, _query, null);
    return c.name.toLowerCase().contains(_query.trim().toLowerCase());
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final all = _cards;
    final cards = all?.where(_shows).toList();
    final skills = all == null ? const <String>[] : _skills(all);
    return Scaffold(
      /*
       * 🔴 ПОИСК И ФИЛЬТР — В ВЕРХНЕЙ ПАНЕЛИ, А НЕ НАД КАРТОЧКАМИ (задача f5025027).
       * Замер пробами развилок 02.10: поле с выпадающим списком над карточками сдвигало их на
       * ~120 точек, одной строкой — на ~60, и девятая карточка «Конфликта внимания» уходила за
       * экран 390×844: развилка переставала показывать выбор целиком. В панели поиск не
       * стоит ни точки, пока его не открыли. Полная раскладка Chess & Go — во вкладке «Игры».
       */
      appBar: AppBar(
        title: _searching
            ? TextField(
                key: const ValueKey('hub-search'),
                autofocus: true,
                decoration: InputDecoration(hintText: L.t('catalogSearch'), border: InputBorder.none),
                onChanged: (v) => setState(() => _query = v),
              )
            : Text(_title.isEmpty ? 'Развилка' : _title),
        actions: [
          if (_catalog != null)
            IconButton(
              key: const ValueKey('hub-search-toggle'),
              tooltip: L.t('catalogSearch'),
              icon: Icon(_searching ? Icons.close : Icons.search),
              onPressed: () => setState(() {
                _searching = !_searching;
                if (!_searching) _query = '';
              }),
            ),
          if (skills.length >= 2)
            PopupMenuButton<String>(
              key: const ValueKey('hub-filter'),
              tooltip: L.t('catalogFilter'),
              icon: Icon(Icons.filter_list, color: _skill == null ? null : scheme.primary),
              initialValue: _skill ?? '',
              onSelected: (v) => setState(() => _skill = v.isEmpty ? null : v),
              itemBuilder: (_) => [
                PopupMenuItem<String>(value: '', child: Text(L.t('catalogAll'))),
                for (final k in skills) PopupMenuItem<String>(value: k, child: Text(skillTitle(k))),
              ],
            ),
        ],
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          tooltip: 'Назад',
          onPressed: () => Navigator.of(context).pop(),
        ),
      ),
      body: all == null
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
                if (cards!.isEmpty)
                  Padding(
                    key: const ValueKey('hub-nothing'),
                    padding: const EdgeInsets.symmetric(vertical: 24),
                    child: Text(L.t('catalogNothing'), textAlign: TextAlign.center),
                  ),
                for (final c in cards)
                  Card(
                    margin: const EdgeInsets.only(bottom: 8),
                    child: ListTile(
                      key: ValueKey('hub-card-${c.route}'),
                      leading: switch (hubIconFile(_icons, c)) {
                        final file? => ClipRRect(
                            // Скруглённый квадрат, как в каталоге: круг срезал бы углы поля игры.
                            borderRadius: BorderRadius.circular(10),
                            child: Image.asset(
                              'assets/game_icons/$file',
                              key: ValueKey('hub-icon-${c.route}'),
                              width: 40,
                              height: 40,
                              fit: BoxFit.cover,
                              excludeFromSemantics: true,
                            ),
                          ),
                        _ => CircleAvatar(
                            backgroundColor: scheme.secondaryContainer,
                            child: Icon(hubIcon(c.icon), color: scheme.onSecondaryContainer),
                          ),
                      },
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
                          Text('${L.t('unitLevelShort')} ${_levels[c.route] ?? 1}',
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
