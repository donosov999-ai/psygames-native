library;

import '../../shell/lesson.dart';
import 'core.dart';

/// 🎓 РАЗБОР «РИТМА И ВЫСОТЫ»: В РИТМЕ ДЕРЖАТЬ ТЕМП, В ВЫСОТЕ СЛЕДИТЬ ЗА ЛИНИЕЙ.
///
/// Перенос веб-учителя (`frontend/src/games/rhythm-pitch/teach.ts`, задача d651a95c) вместе с ключами
/// текстов. Уровни чередуют режимы: нечётные — «эхо ритма», чётные — «путь высоты». До 01.10.2026
/// нативный экран показывал вместо этого одну общую демо-карточку.
///
/// 🔴 ТЕКСТЫ СТОЯТ НА ЗАМЕРЕ ГЕНЕРАТОРА: на уровнях 1 и 3 все промежутки ряда равны и акцентов нет,
/// поэтому разбор ритма говорит «промежутки одинаковые — держите темп»; на уровне 2 задание — две
/// ноты, «выше/ниже», и разбор называет направление из самого раунда. На неровном ряде или задании
/// не «выше/ниже» разбору сказать нечего — `null`. Сверка — эталон
/// `flutter/test/fixtures/rhythm-pitch-lesson-reference.json` (прибор
/// `frontend/src/games/rhythm-pitch/tools/record-flutter-lesson.gen.ts`), 180 раундов уровней 1–6.
///
/// ПРИМЕР — СВОЙ РАУНД ТЕМ ЖЕ ГЕНЕРАТОРОМ, звучит на том же движке, что и партия.

/// Карточка: вид, ключ словаря, подстановки, проиграть ли пример при показе.
typedef RpCard = ({String kind, String key, Map<String, String> fields, bool sound});

/// Промежутки ряда равны (до миллисекунды) и акцентов нет.
bool rpEvenRow(RpRound round) {
  if (round is! RhythmEchoRound) return false;
  final gaps = {
    for (var i = 1; i < round.beats.length; i += 1) jsRound(round.beats[i].onsetMs - round.beats[i - 1].onsetMs),
  };
  return gaps.length <= 1 && round.accentCount == 0;
}

/// Карточки разбора на раунде или `null`, если разбор на нём сказал бы неправду.
List<RpCard>? rpLessonCards(RpRound round) {
  switch (round) {
    case RhythmEchoRound():
      if (!rpEvenRow(round)) return null;
      return [
        (kind: 'intro', key: 'teachRpRhythmIntro', fields: const {}, sound: false),
        (kind: 'listen', key: 'teachRpListen', fields: {'n': '${round.beatCount}'}, sound: true),
        (kind: 'beat', key: 'teachRpEven', fields: const {}, sound: false),
        (kind: 'tap', key: 'teachRpTap', fields: const {}, sound: true),
        (kind: 'done', key: 'teachRpRhythmDone', fields: const {}, sound: false),
      ];
    case PitchPathRound():
      final dir = round.directionAnswer;
      if (round.task != 'direction' || dir == null) return null;
      return [
        (kind: 'intro', key: 'teachRpPitchIntro', fields: const {}, sound: false),
        (kind: 'listen', key: 'teachRpListenTones', fields: {'n': '${round.toneCount}'}, sound: true),
        (kind: 'compare', key: dir == 'higher' ? 'teachRpHigher' : 'teachRpLower', fields: const {}, sound: true),
        (kind: 'done', key: 'teachRpPitchDone', fields: const {}, sound: false),
      ];
  }
}

/// Уровень примера. На 1–3 — сам уровень (там тексты верны по замеру). Выше — вводный уровень того
/// же режима (ритм — 3, высота — 2): в вебе кнопки там нет, в приложении разбор доступен всегда и
/// учит приёму режима на ряде, где он виден.
int rpLessonLevel(int level, String mode) => level <= 3 && rhythmPitchModeForLevel(level) == mode
    ? level
    : (mode == 'rhythm-echo' ? (level <= 1 ? 1 : 3) : 2);

/// Пример и карточки: до пяти зёрен подряд, первое, на котором разбору есть что сказать.
({RpRound round, List<RpCard> cards})? rpLessonExample(int level, String mode, String seedPrefix) {
  final l = rpLessonLevel(level, mode);
  for (var k = 0; k < 5; k += 1) {
    final round = generateRhythmPitchRound('$seedPrefix-$l-$k', l, mode);
    final cards = rpLessonCards(round);
    if (cards != null) return (round: round, cards: cards);
  }
  return null;
}

List<LessonStep> rpLessonSteps(
  List<RpCard> cards,
  String Function(String key, Map<String, String> args) say,
) =>
    [for (final c in cards) LessonStep(text: say(c.key, c.fields), payload: c)];
