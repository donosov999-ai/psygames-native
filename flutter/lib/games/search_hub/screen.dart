import 'package:flutter/material.dart';

import '../../shell/hub_screen.dart';
import '../../shell/shared_state.dart';

/// РАЗВИЛКА «ПОИСК ГЛАЗАМИ» — тонкий маршрут поверх общего хаба, как в вебе.
///
/// Своего экрана у развилки нет и быть не должно: состав карточек лежит данными
/// (`assets/hubs.json`, выгрузка `src/constants/hubContents.ts`), а вид общий на
/// все разделы. Здесь различаются ровно три вещи — ключ развилки, значок и
/// градиент; всё остальное живёт в `HubScreen`.
///
/// ⚠️ ЧТО У ЭТОЙ РАЗВИЛКИ ОБЩЕГО (это в неё и собрано): цель известна заранее,
/// трудность — в том, что рядом лежит похожее.
class SearchHubScreen extends StatelessWidget {
  const SearchHubScreen({super.key, required this.state, this.isNative});

  final SharedState state;
  final bool Function(String route)? isNative;

  @override
  Widget build(BuildContext context) => HubScreen(
        state: state,
        hubRoute: '/games/search-hub',
        icon: Icons.search,
        gradient: const [Color(0xFFF59E0B), Color(0xFFEF4444)],
        isNative: isNative,
      );
}
