import 'package:flutter/material.dart';

import 'shared_state.dart';

/// ПИТОМЕЦ В ШАПКЕ НАТИВНОЙ ИГРЫ.
///
/// 🔴 ЧТО ЧИНИТ. Замер 23.09.2026: на перенесённых экранах питомца не было
/// вовсе — `grep pet` по `flutter/lib/shell` давал ноль. Он живёт в веб-половине
/// и пропадал ровно в тот момент, когда человек входил в игру, то есть уже на
/// 36 экранах из 100. Для игрока это выглядит как «питомец исчез», а не как
/// «этот экран переписали».
///
/// 🟢 И ЭТО НЕ СТОИТ НИ БАЙТА ВЕСА. Гибрид уже несёт веб-сборку целиком, а
/// [AssetServer] раздаёт `webp` — значит кадры лежат в приложении и берутся по
/// `http://127.0.0.1:<порт>/assets/images/pet/<облик>/<вид><N>.webp`. Класть их
/// второй раз в ассеты Flutter было бы 4,2 МБ впустую (весь питомец — 15,5 МБ).
/// ⚠️ Отсюда условие: без адреса сервера питомца не показываем — [origin] не
/// имеет умолчания нарочно, чтобы «забыл передать» не превратилось в тихо
/// пустой кружок.
///
/// Соответствие настроения и вида — то же, что в `GamePet.tsx`:
///   верное действие → `jump` · уровень взят → `wave` · ошибка → `sleep`
/// Расходиться нельзя: человек видит обе половины в одном приложении.
enum PetMood { idle, good, bad, win }

const _look = {
  PetMood.idle: 'idle',
  PetMood.good: 'jump',
  PetMood.win: 'wave',
  PetMood.bad: 'sleep',
};

/// Сколько держится реакция, прежде чем вернуться в покой. Числа из `GamePet.tsx`.
const _holdMs = {PetMood.good: 700, PetMood.bad: 900, PetMood.win: 1600};

const _ring = {
  PetMood.idle: Color(0xFFA78BFA),
  PetMood.good: Color(0xFF34D399),
  PetMood.bad: Color(0xFF94A3B8),
  PetMood.win: Color(0xFFFBBF24),
};

/// ГДЕ ВЗЯТЬ КАДРЫ И СОСТОЯНИЕ — СТАВИТ ОБОЛОЧКА, ОДИН РАЗ.
///
/// ⚠️ Иначе каждый из 36 экранов передавал бы адрес сервера и общую память в
/// каркас руками, и тридцать седьмой забыл бы. Каркас берёт их отсюда; не
/// поставлены — питомца просто нет, и это видно по [PetHost.ready].
class PetHost {
  PetHost._();
  static SharedState? state;
  static String? origin;
  static bool get ready => state != null && origin != null;
}

class GamePet extends StatefulWidget {
  const GamePet({
    super.key,
    required this.state,
    required this.origin,
    this.mood = PetMood.idle,
    this.size = 46,
  });

  final SharedState state;

  /// Адрес встроенного сервера раздачи. Без него кадров взять неоткуда.
  final String origin;

  final PetMood mood;
  final double size;

  /// Включён ли питомец у человека. Ключ общий с веб-половиной.
  static bool enabled(SharedState s) => s.get('${SharedState.prefix}pet_on') != 'false';

  /// Выбранный облик: кот по умолчанию, как и в вебе.
  static String skin(SharedState s) => s.get('${SharedState.prefix}pet_skin') ?? 'cat';

  @override
  State<GamePet> createState() => _GamePetState();
}

class _GamePetState extends State<GamePet> {
  PetMood _shown = PetMood.idle;

  @override
  void didUpdateWidget(GamePet old) {
    super.didUpdateWidget(old);
    if (widget.mood == old.mood || widget.mood == PetMood.idle) return;
    setState(() => _shown = widget.mood);
    final hold = _holdMs[widget.mood] ?? 700;
    Future.delayed(Duration(milliseconds: hold), () {
      // ⚠️ Экран мог закрыться, пока держалась реакция: без проверки это
      // исключение в журнале на каждой быстро закрытой игре.
      if (mounted) setState(() => _shown = PetMood.idle);
    });
  }

  @override
  Widget build(BuildContext context) {
    if (!GamePet.enabled(widget.state)) return const SizedBox.shrink();
    final look = _look[_shown]!;
    final url = '${widget.origin}/assets/images/pet/${GamePet.skin(widget.state)}/${look}0.webp';
    return Container(
      width: widget.size,
      height: widget.size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(color: _ring[_shown]!, width: 2),
      ),
      clipBehavior: Clip.antiAlias,
      child: Image.network(
        url,
        key: ValueKey(url),
        fit: BoxFit.cover,
        // Кадра нет или сервер не отдал — показываем ПУСТОЙ кружок, а не значок
        // ошибки: питомец не должен кричать о себе посреди партии.
        errorBuilder: (_, _, _) => const SizedBox.shrink(),
      ),
    );
  }
}
