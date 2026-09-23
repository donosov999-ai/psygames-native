import 'package:flutter/material.dart';

import '../../shell/game_shell.dart';
import '../../shell/hybrid_app.dart';
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

/// Карточка развилки: маршрут, имя, описание и значок — как в вебе.
class HubCard {
  const HubCard(this.route, this.name, this.note, this.icon, {this.levelKey});

  final String route;
  final String name;
  final String note;
  final IconData icon;

  /// Чей уровень показывать на карточке; у карточек-режимов он свой.
  final String? levelKey;
}

const List<HubCard> spatialHubCards = [
  HubCard(
    '/games/mental-rotation',
    'Ментальная ротация',
    'Найдите повёрнутую копию фигуры',
    Icons.view_in_ar,
    levelKey: 'mental_rotation',
  ),
  HubCard(
    '/games/spatial-lab?mode=twiddle',
    'Поворот чисел',
    'Вращай блок 2×2 и расставь числа по порядку',
    Icons.rotate_90_degrees_ccw,
    levelKey: 'spatial_lab_twiddle',
  ),
  HubCard(
    '/games/spatial-lab?mode=net',
    'Сеть труб',
    'Поверни трубы так, чтобы вода дошла до каждого конца',
    Icons.hub_outlined,
    levelKey: 'spatial_lab_net',
  ),
  HubCard(
    '/games/puzzles?mode=Slide',
    'Клоцки',
    'Тяни блок пальцем в свободное место — выведи главный блок наружу',
    Icons.view_module,
  ),
  HubCard(
    '/games/puzzles?mode=Sokoban',
    'Сокобан',
    'Ходи стрелками и толкай бочки на метки. Загонишь бочку в угол — не вытащишь',
    Icons.inventory_2_outlined,
  ),
  HubCard(
    '/games/dots-connect',
    'Соедини точки',
    'Соединяйте одинаковые точки непересекающимися путями и заполните всю сетку',
    Icons.circle_outlined,
    levelKey: 'dots_connect',
  ),
  HubCard(
    '/games/one-line',
    'Одна линия',
    'Проведите одну непрерывную линию по всем рёбрам, не проходя ни одно дважды',
    Icons.timeline,
    levelKey: 'one_line',
  ),
  HubCard(
    '/games/trail-making',
    'Соедини цепочку',
    '1→А→2→Б→3 — переключение внимания',
    Icons.route_outlined,
  ),
  HubCard(
    '/games/navigator',
    'Навигатор',
    'Запоминайте маршруты, последовательности поворотов и направление к старту',
    Icons.navigation_outlined,
  ),
];

class _SpatialHubScreenState extends State<SpatialHubScreen> {
  final Map<String, int> _levels = {};
  bool _ready = false;

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
    if (mounted) setState(() => _ready = true);
  }

  void _open(String route) => (widget.onOpen ?? HybridApp.open)?.call(route);

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    if (!_ready) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    return GameShell(
      title: 'Пространство',
      field: (context, h) => ListView(
        padding: const EdgeInsets.fromLTRB(12, 6, 12, 6),
        children: [
          Text(
            'Повернуть в уме, растолкать, проложить путь',
            style: TextStyle(color: scheme.onSurfaceVariant),
          ),
          const SizedBox(height: 4),
          Text('Выбери упражнение', style: Theme.of(context).textTheme.titleMedium),
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
                        Icon(card.icon, size: 28, color: scheme.primary),
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
                              'ур. ${_levels[card.levelKey]}',
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
            'Общее у всех: ход надо просчитать в голове заранее — на поле почти каждый ход '
            'выглядит законным и заводит в тупик.',
            key: const Key('сноска'),
            style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 12),
          ),
        ],
      ),
    );
  }
}
