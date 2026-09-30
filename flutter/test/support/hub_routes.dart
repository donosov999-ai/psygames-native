import 'dart:convert';
import 'dart:io';

/// 🔴 ЧТО ТАКОЕ РАЗВИЛКА — ОДНО ОПРЕДЕЛЕНИЕ НА ВСЕ ПРОБЫ.
///
/// Три гейта узнавали развилку по окончанию адреса на `-hub`: перепись разбора,
/// «у каждой игры есть правило» и «на развилке нет паузы». Замер 30.09.2026 по
/// `assets/hubs.json`: две развилки из 13 называются иначе — `/games/attention-conflict`
/// и `/games/span`. Первые два гейта принимали их за ИГРЫ без разбора и без правила
/// и краснели на исправной развилке, а третий их не проверял вовсе.
///
/// Развилка — это то, что лежит в реестре развилок: из того же файла она берёт
/// свои карточки. Окончание `-hub` оставлено вторым признаком: развилке со своим
/// экраном состав в реестре может быть не нужен.
///
/// Реестр читается С ДИСКА, а не через `rootBundle`: в оконных пробах чтение
/// ассета сбивало загрузку самого экрана развилки (замер 24.09.2026).
Set<String> hubRoutesFromRegistry() {
  final bundle = jsonDecode(
    File('${Directory.current.path}/assets/hubs.json').readAsStringSync(),
  ) as Map<String, dynamic>;
  return (bundle['hubs'] as Map<String, dynamic>).keys.toSet();
}

final Set<String> _registry = hubRoutesFromRegistry();

/// true — адрес принадлежит развилке, а не игре.
bool isHubRoute(String route) => route.endsWith('-hub') || _registry.contains(route);
