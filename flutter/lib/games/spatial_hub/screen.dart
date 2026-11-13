import 'package:flutter/material.dart';

import '../../shell/hub_screen.dart';
import '../../shell/shared_state.dart';

/// РАЗВИЛКА «ПРОСТРАНСТВО» — тонкий маршрут поверх общего хаба, как у «Поиска» и «Счёта».
///
/// Своего экрана у развилки нет и быть не должно (решение Дениса 12.11.2026, задача 73b1c67e):
/// шапка, список, иконки, уровни и видимость по профилю — общий [HubScreen], состав — данными
/// (`assets/hubs.json`, выгрузка `src/constants/hubContents.ts`, ключ `/games/spatial-hub`).
/// Здесь различаются ровно три вещи — ключ развилки, значок и градиент веба (`spatial-hub.tsx`).
///
/// 🔴 ЗАЧЕМ ПЕРЕВЕЛИ. До 12.11 развилка рисовала свою шапку (`AppBar`) и СВОЙ список из девяти
/// строк. `hubs.json` за это время вырос до 24: семь головоломок переехали сюда решением 18.09,
/// ещё восемь — при роспуске «Головоломок». Пятнадцать режимов из развилки нельзя было открыть
/// ни в одном из 13 профилей (задача 8ae0a39d). Второй список всегда отстаёт молча.
class SpatialHubScreen extends StatelessWidget {
  const SpatialHubScreen({super.key, required this.state, this.isNative});

  final SharedState state;
  final bool Function(String route)? isNative;

  @override
  Widget build(BuildContext context) => HubScreen(
        state: state,
        hubRoute: '/games/spatial-hub',
        icon: Icons.view_in_ar,
        gradient: const [Color(0xFF5614B0), Color(0xFFDBD65C)],
        isNative: isNative,
      );
}
