import 'package:flutter/material.dart';

import '../../shell/hub_screen.dart';
import '../../shell/shared_state.dart';

/// РАЗВИЛКА «СОРТИРОВКА» — тонкий маршрут поверх общего хаба, как в вебе.
///
/// Здесь различаются ровно три вещи: ключ развилки, значок и градиент. Копии
/// экрана нет и быть не должно — разбор в шапке `HubScreen`.
///
/// ⚠️ ЧЕМ ЭТА РАЗВИЛКА ОТЛИЧАЕТСЯ ОТ ДРУГИХ (это в неё и собрано): здесь ход
/// ограничивает ВМЕСТИМОСТЬ, и главный дефицит — куда положить. Башни влиты
/// сюда же решением Дениса 06.09.2026.
class SortingHubScreen extends StatelessWidget {
  const SortingHubScreen({super.key, required this.state, this.isNative});

  final SharedState state;
  final bool Function(String route)? isNative;

  @override
  Widget build(BuildContext context) => HubScreen(
        state: state,
        hubRoute: '/games/sorting-hub',
        icon: Icons.filter_alt_outlined,
        gradient: const [Color(0xFFF7971E), Color(0xFF0EA5E9)],
        isNative: isNative,
      );
}
