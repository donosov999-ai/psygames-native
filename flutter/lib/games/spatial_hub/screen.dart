import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;

import '../../shell/hybrid_app.dart';
import '../../shell/l10n.dart';
import '../../shell/level_ladder.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';

/// РАЗВИЛКА «ПРОСТРАНСТВО» — меню раздела, а не игра.
///
/// 🔴 СОСТАВ РАЗВИЛКИ — ТОТ ЖЕ, ЧТО В ВЕБ-ВЕРСИИ, И В ТОМ ЖЕ ПОРЯДКЕ
/// (`src/constants/hubContents.ts`, ключ `/games/spatial-hub`). Второй список карточек в проекте
/// заводить нельзя: в веб-версии на этом уже обожглись — значок на карточке каталога считал по
/// другому признаку, и «написано например один, а по факту там два».
///
/// ⚠️ ПОЛОВИНА КАРТОЧЕК ВЕДЁТ В ИГРЫ, КОТОРЫЕ ЕЩЁ В ВЕБЕ. Пять из девяти перенесены, четыре —
/// нет, и они обязаны открываться страницей: развилка без такого хода была бы тупиком. Ход даёт
/// хост гибрида ([HybridApp.open]); сама развилка не знает, что перенесено, а что нет.
class SpatialHubScreen extends StatefulWidget {
  const SpatialHubScreen({super.key, required this.state, this.onOpen});

  final SharedState state;

  /// Куда уходит нажатие. В приложении — хост гибрида; проба подставляет свой приёмник.
  final void Function(String route)? onOpen;

  @override
  State<SpatialHubScreen> createState() => _SpatialHubScreenState();
}

/// Карточка развилки: маршрут, подписи и значок — как в вебе.
class HubCard {
  const HubCard(this.route, this.name, this.note, this.icon, {this.levelKey});

  final String route;
  final String name;
  final String note;
  final IconData icon;

  /// Чей уровень показывать на карточке; у карточек-режимов он свой.
  final String? levelKey;
}

/// 🔴 СПИСОК СОБИРАЕТСЯ ПРИ ОБРАЩЕНИИ, А НЕ ЛЕЖИТ КОНСТАНТОЙ, и причина не в стиле.
/// Подписи берутся из общего с веб-стороной словаря (`L.t`), а он загружается на старте —
/// константа успела бы застыть с ключами вместо текста. Заодно `flutter/tools/embed-l10n.mjs`
/// видит ключи литералами и вырезает их в `assets/l10n/`: спрячь ключ в поле карточки — и
/// скрипт его не найдёт, а экран молча покажет `mentalRotation` вместо названия.
///
/// ⚠️ Состав и порядок — дословно `src/constants/hubContents.ts`, ключ `/games/spatial-hub`,
/// вместе с его `nameKey`/`descKey`. Второй список карточек в проекте заводить нельзя.
List<HubCard> get spatialHubCards => [
  HubCard(
    '/games/mental-rotation',
    L.t('mentalRotation'),
    L.t('mentalRotationDesc'),
    Icons.view_in_ar,
    levelKey: 'mental_rotation',
  ),
  HubCard(
    '/games/spatial-lab?mode=twiddle',
    L.t('spatialTwiddle'),
    L.t('spatialTwiddleDesc'),
    Icons.rotate_90_degrees_ccw,
    levelKey: 'spatial_lab_twiddle',
  ),
  HubCard(
    '/games/spatial-lab?mode=net',
    L.t('spatialNet'),
    L.t('spatialNetDesc'),
    Icons.hub_outlined,
    levelKey: 'spatial_lab_net',
  ),
  HubCard(
    '/games/puzzles?mode=Slide',
    L.t('puzzlesSlide'),
    L.t('puzzlesSlideDesc'),
    Icons.view_module,
  ),
  HubCard(
    '/games/puzzles?mode=Sokoban',
    L.t('puzzlesSokoban'),
    L.t('puzzlesSokobanDesc'),
    Icons.inventory_2_outlined,
  ),
  HubCard(
    '/games/dots-connect',
    L.t('dotsConnect'),
    L.t('dotsConnectDesc'),
    Icons.circle_outlined,
    levelKey: 'dots_connect',
  ),
  HubCard(
    '/games/one-line',
    L.t('oneLine'),
    L.t('oneLineDesc'),
    Icons.timeline,
    levelKey: 'one_line',
  ),
  HubCard(
    '/games/trail-making',
    L.t('trailMaking'),
    L.t('trailMakingDesc'),
    Icons.route_outlined,
    levelKey: 'trail_making',
  ),
  HubCard(
    '/games/navigator',
    L.t('navigator'),
    L.t('navigatorDesc'),
    Icons.navigation_outlined,
    levelKey: 'navigator',
  ),
];

class _SpatialHubScreenState extends State<SpatialHubScreen> {
  final Map<String, int> _levels = {};
  bool _ready = false;

  /// Карта иконок игр (`assets/game_icons/index.json`) — та же, что у общего экрана развилок
  /// (`shell/hub_screen.dart`). Решение Дениса 01.10.2026 (задача 4c3ba7c9): в строке развилки —
  /// поле игры в миниатюре, а не значок. «Пространство» рисует строки само и карту не читало —
  /// единственная нативная развилка со значками Material (задача 450170e7).
  Map<String, dynamic> _icons = const {};

  @override
  void initState() {
    super.initState();
    _boot();
  }

  Future<void> _boot() async {
    // Уровень на карточке — из ОБЩЕЙ памяти: он один и тот же у нативной игры и у веб-версии.
    for (final card in spatialHubCards) {
      final key = card.levelKey;
      if (key == null) continue;
      final ladder = LevelLadder(gameId: key, store: SharedLevelStore(widget.state));
      await ladder.load();
      _levels[key] = ladder.level;
    }
    try {
      // Байтами, а не loadString: с 50 КБ он уходит в compute(), и testWidgets висит 10 минут.
      final b = await rootBundle.load('assets/game_icons/index.json');
      _icons = jsonDecode(utf8.decode(b.buffer.asUint8List(b.offsetInBytes, b.lengthInBytes))) as Map<String, dynamic>;
    } catch (_) {
      // Нет карты — строки остаются со значками, развилка работает как прежде.
    }
    if (mounted) setState(() => _ready = true);
  }

  void _open(String route) => (widget.onOpen ?? HybridApp.open)?.call(route);

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    if (!_ready) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    /*
     * 🔴 РАЗВИЛКА — НЕ ИГРА, И ШАПКА У НЕЁ ДРУГАЯ.
     *
     * Здесь стоял `GameShell`. Он даёт то, что нужно ИГРЕ: кнопку паузы, кружок
     * питомца, «Правила». На развилке паузить нечего — Денис прислал кадр 23.09.2026:
     * «Пространство» с кнопкой паузы в шапке, «по хабам наксячил солидно».
     *
     * Каркас теперь тот же, что у остальных развилок (`shell/hub_screen.dart`):
     * обычная шапка с кнопкой «назад» и список карточек. Содержимое не тронуто —
     * состав и порядок карточек прежние, и проба на них остаётся в силе.
     */
    return Scaffold(
      appBar: AppBar(
        title: Text(L.t('spatialGroup')),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          tooltip: L.t('back'),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(12, 6, 12, 6),
        children: [
          Text(
            L.t('spatialGroupDesc'),
            style: TextStyle(color: scheme.onSurfaceVariant),
          ),
          const SizedBox(height: 4),
          Text(L.t('hubPickExercise'), style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          for (final card in spatialHubCards)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Material(
                key: Key('карточка-${card.route}'),
                color: scheme.surfaceContainerHighest,
                borderRadius: BorderRadius.circular(14),
                child: InkWell(
                  onTap: () => _open(card.route),
                  borderRadius: BorderRadius.circular(14),
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Row(
                      children: [
                        // Иконка — по адресу ЦЕЛИКОМ, с ?mode= (правило hubIconFile общего экрана:
                        // у карточек «Пространства» нет nameKey, адреса хватает — все девять в карте).
                        switch ((_icons['byRoute'] as Map?)?[card.route] as String?) {
                          final file? => ClipRRect(
                              // Скруглённый квадрат, как в каталоге: круг срезал бы углы поля игры.
                              borderRadius: BorderRadius.circular(10),
                              child: Image.asset(
                                'assets/game_icons/$file',
                                key: ValueKey('hub-icon-${card.route}'),
                                width: 40,
                                height: 40,
                                fit: BoxFit.cover,
                                excludeFromSemantics: true,
                              ),
                            ),
                          _ => Icon(card.icon, size: 28, color: scheme.primary),
                        },
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                card.name,
                                style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                card.note,
                                style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 13),
                              ),
                            ],
                          ),
                        ),
                        if (card.levelKey != null && _levels[card.levelKey] != null)
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                            decoration: BoxDecoration(
                              color: scheme.secondaryContainer,
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: Text(
                              '${L.t('unitLevelShort')} ${_levels[card.levelKey]}',
                              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          const SizedBox(height: 4),
          Text(
            L.t('spatialGroupFootnote'),
            key: const Key('сноска'),
            style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 12),
          ),
        ],
      ),
    );
  }
}
