import 'dart:convert';
import 'dart:io';

/// 🔴 РАЗВИЛКУ ОПРЕДЕЛЯЮТ ДАННЫЕ, А НЕ ИМЯ АДРЕСА.
///
/// Пробы узнавали развилку по хвосту `-hub`, а в `assets/hubs.json` у двух из
/// тринадцати хвоста нет: «Объём памяти» живёт на `/games/span`, «Конфликт
/// внимания» — на `/games/attention-conflict`. Перехвати такую — и
/// `every_game_has_rules` требует от меню правил игры, `lesson_census` — разбора,
/// а `hub_is_not_a_game` не видит её вовсе (замер 30.09.2026).
///
/// Хвост оставлен запасным признаком: адрес на `-hub` без записи в данных — тоже
/// меню, а не игра, и требовать от него правил незачем.
final Set<String> hubRoutes = {
  ...((jsonDecode(File('assets/hubs.json').readAsStringSync()) as Map<String, dynamic>)['hubs']
          as Map<String, dynamic>)
      .keys,
};

bool isHubRoute(String route) => hubRoutes.contains(route) || route.endsWith('-hub');
