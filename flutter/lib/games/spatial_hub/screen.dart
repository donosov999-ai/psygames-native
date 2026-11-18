import 'package:flutter/material.dart';

import '../../shell/hybrid_app.dart';
import '../../shell/hub_screen.dart' as shared;
import '../../shell/l10n.dart';
import '../../shell/shared_state.dart';

/// Развилка «Пространство» использует общий [shared.HubScreen]: состав, сетка,
/// иллюстрации, поиск и уровни те же, что у остальных разделов.
class SpatialHubScreen extends StatelessWidget {
  const SpatialHubScreen({super.key, required this.state, this.onOpen});

  final SharedState state;

  /// Куда уходит нажатие. В приложении — хост гибрида; проба подставляет свой приёмник.
  final void Function(String route)? onOpen;

  @override
  Widget build(BuildContext context) => shared.HubScreen(
        state: state,
        hubRoute: '/games/spatial-hub',
        icon: Icons.view_in_ar,
        gradient: [
          Theme.of(context).colorScheme.primary,
          Theme.of(context).colorScheme.tertiary,
        ],
        isNative: HybridApp.native.containsKey,
        onCardTap: onOpen,
      );
}

/// Исходная карточка развилки для проверки совместимости маршрутов.
class HubCard {
  const HubCard(this.route, this.name, this.note, this.icon, {this.levelKey});

  final String route;
  final String name;
  final String note;
  final IconData icon;

  /// Чей уровень показывать на карточке; у карточек-режимов он свой.
  final String? levelKey;
}

/// Первые девять маршрутов раздела используются пробой переходов. Актуальный состав
/// экран получает из общего реестра через [shared.HubScreen]. Литералы `L.t` также
/// позволяют `flutter/tools/embed-l10n.mjs` включить эти подписи в словари.
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
