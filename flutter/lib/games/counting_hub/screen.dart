import 'package:flutter/material.dart';

import '../../shell/hub_screen.dart';
import '../../shell/shared_state.dart';

/// РАЗВИЛКА «СЧЁТ» — тонкий маршрут поверх общего хаба, как в вебе.
///
/// Состав карточек лежит данными (`assets/hubs.json`, выгрузка
/// `src/constants/hubContents.ts`), вид — общий на все разделы. Второй список
/// карточек в проекте заводить нельзя: в вебе на этом уже обожглись — значок
/// каталога считал по другому признаку и показывал не то число.
///
/// ⚠️ ЧТО У ЭТОЙ РАЗВИЛКИ ОБЩЕГО: разные подходы к одному навыку — удержать
/// число, прикинуть, посчитать быстро, разложить на слагаемые, продолжить ряд.
class CountingHubScreen extends StatelessWidget {
  const CountingHubScreen({super.key, required this.state, this.isNative});

  final SharedState state;
  final bool Function(String route)? isNative;

  @override
  Widget build(BuildContext context) => HubScreen(
        state: state,
        hubRoute: '/games/counting-hub',
        icon: Icons.calculate_outlined,
        gradient: const [Color(0xFFFA709A), Color(0xFFFEE140)],
        isNative: isNative,
      );
}
