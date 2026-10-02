import 'package:practice_kit/practice_kit.dart';

/// 🔴 ВИБРОСОПРОВОЖДЕНИЕ ПРАКТИК «ПАУЗЫ» — из общего пакета practice_kit.
///
/// Правила вибрации (что гудит, сколько, кто ведёт в параллели) — в пакете, одни
/// с «Умным будильником»: до 02.10.2026 здесь жила урезанная копия, и «Живот»,
/// массаж лица и попадания в режимах глаз в PsyGames не вибрировали вовсе.
/// Своё у PsyGames — только выключатель: «Вибрация» в настройках (`appHapticOn`);
/// выбора по видам практик здесь нет, действуют умолчания пакета.
class PausePracticeHaptics {
  PausePracticeHaptics(this._enabled);

  static const channel = PracticeHaptics.channel;

  /// Сила — общая с пакетом: 0,8 из 1,0 (0,25 в руке не слышно, Денис 01.10).
  static const strength = PracticeHaptics.defaultStrength;

  final bool Function() _enabled;
  final _haptics = PracticeHaptics();

  Json get _config => {
        'practiceHaptics': {'enabled': _enabled()},
      };

  void update(Json plan, int elapsedMs) => _haptics.update(plan, elapsedMs, _config);

  /// Попадание в режиме глаз «поймай совпадение» / «две точки» — если ведут глаза.
  void hit(Json plan, int elapsedMs) {
    if (PracticeHaptics.owns(plan, elapsedMs, _config, 'eyeHit')) {
      _haptics.event(_config, 'eyeHit');
    }
  }

  /// Конец занятия: у спокойных практик — двойной сигнал «готово».
  void complete() {
    if (_enabled()) _haptics.complete(_config);
  }

  void stop() => _haptics.stop();

  void dispose() => _haptics.dispose();
}
