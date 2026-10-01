import 'package:flutter/material.dart';

import '../../shell/hub_screen.dart';
import '../../shell/shared_state.dart';

/// РАЗВИЛКА «ОБЪЁМ ПАМЯТИ» — тонкий маршрут поверх общего хаба, как в вебе
/// (`app/games/span.tsx`).
///
/// Своего экрана у развилки нет и быть не должно: состав карточек и шапка лежат
/// данными (`assets/hubs.json`, выгрузка `tools/embed-hubs.mjs`), вид общий на все
/// разделы. Здесь различаются ключ развилки, значок и градиент — оба взяты с
/// веб-экрана: `albums` и `GRADIENT = ['#0ea5e9', '#10b981']`.
///
/// ⚠️ Адрес — `/games/span`, БЕЗ хвоста `-hub`. Развилкой его делает запись в
/// `assets/hubs.json`, а не имя: пробы, узнававшие развилку по хвосту, переведены
/// на данные (`test/hub_routes.dart`), иначе они требовали бы от меню правил игры.
class SpanHubScreen extends StatelessWidget {
  const SpanHubScreen({super.key, required this.state, this.isNative});

  final SharedState state;
  final bool Function(String route)? isNative;

  @override
  Widget build(BuildContext context) => HubScreen(
        state: state,
        hubRoute: '/games/span',
        icon: hubIcon('albums'),
        gradient: const [Color(0xFF0EA5E9), Color(0xFF10B981)],
        isNative: isNative,
      );
}
