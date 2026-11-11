// Кабинет преподавателя в PsyGames (contract ecosystem.coach/2, эпик 892cd2c3).
//
// 🔴 ВЫКЛЮЧЕН ПО УМОЛЧАНИЮ: флаг сборки PSY_COACH и только поверх облачного пилота (тот же вход,
// тот же аккаунт). Миграция на прод-базу не применена — до «да» Дениса кабинет в выпуск не идёт.
//
// Что делает мост:
//   · превращает отчёт партии ([SessionReport]) в событие кабинета и отправляет его — без согласия
//     ученика сервер ничего не пишет, это не ошибка; сбой сети игру не трогает;
//   · открывает экраны пакета `ecosystem_coach` в рамке подстраниц настроек приложения;
//   · принимает ссылку-приглашение `com.psygames.app://coach/invite?code=…`.
import 'dart:async';
import 'dart:math';

import 'package:ecosystem_account/ecosystem_account.dart';
import 'package:ecosystem_coach/ecosystem_coach.dart';
import 'package:flutter/material.dart';

import 'l10n.dart';
import 'session_report.dart';

class PsyGamesCoach {
  PsyGamesCoach(this.client, {DateTime Function()? clock, String Function()? newId})
      : _clock = clock ?? DateTime.now,
        _newId = newId ?? _uuid;

  factory PsyGamesCoach.forAccount(EcosystemAccount account) =>
      PsyGamesCoach(CoachClient(AccountCoachTransport(account), appId: 'psygames'));

  static const enabled = bool.fromEnvironment('PSY_COACH');

  final CoachClient client;
  final DateTime Function() _clock;
  final String Function() _newId;

  /// Подписаться на отчёты партий. Один подписчик — последний установленный.
  void observe() => SessionReport.observer = submitSession;

  void dispose() {
    if (SessionReport.observer == submitSession) SessionReport.observer = null;
  }

  /// Отчёт партии → событие кабинета. Ошибки глотаются: кабинет не имеет права ломать игру.
  Future<void> submitSession(Map<String, Object?> body) async {
    final event = coachEventFromSession(body, now: _clock(), newId: _newId);
    if (event == null) return;
    try {
      await client.submit(event);
    } on Object {
      // нет входа / нет сети / нет согласия — партия уже сохранена локально, этого достаточно
    }
  }

  CoachStrings get strings => L.locale == 'ru' ? CoachStrings.ru : CoachStrings.en;

  Future<void> openTeacher(BuildContext context) => Navigator.of(context).push<void>(MaterialPageRoute(
      builder: (_) => TeacherCabinetScreen(client: client, strings: strings, frame: psyCoachFrame)));

  Future<void> openMyCoaches(BuildContext context) => Navigator.of(context).push<void>(MaterialPageRoute(
      builder: (_) => MyCoachesScreen(client: client, strings: strings, frame: psyCoachFrame)));

  /// Ссылка-приглашение. Чужая форма → false, ссылка не наша.
  bool openInvite(NavigatorState navigator, Uri uri) {
    final link = CoachInviteLink.parse(uri, appId: 'psygames');
    if (link == null) return false;
    unawaited(navigator.push<void>(MaterialPageRoute(
        builder: (_) => AcceptInviteScreen(client: client, code: link.code, strings: strings, frame: psyCoachFrame))));
    return true;
  }

  static String _uuid() {
    final r = Random.secure();
    final b = List<int>.generate(16, (_) => r.nextInt(256));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    final h = b.map((x) => x.toRadixString(16).padLeft(2, '0')).join();
    return '${h.substring(0, 8)}-${h.substring(8, 12)}-${h.substring(12, 16)}-${h.substring(16, 20)}-${h.substring(20)}';
  }
}

/// Проекция отчёта партии: только то, что нужно преподавателю. Детали партии (поля доски,
/// хозяин зарядки и т. п.) наружу не уходят.
CoachEvent? coachEventFromSession(Map<String, Object?> body, {required DateTime now, required String Function() newId}) {
  final game = body['game_type'];
  if (game is! String || game.isEmpty) return null;
  final id = body['id'];
  final difficulty = body['difficulty'];
  final details = body['details'];
  final ladderLevel = details is Map ? details['ladderLevel'] : null;
  final errors = body['errors'];
  return CoachEvent(
    eventId: id is String && id.isNotEmpty ? id : newId(),
    kind: details is Map && details['warmup_owner'] != null ? 'warmup' : 'game',
    mode: game.length > 60 ? game.substring(0, 60) : game,
    exerciseRef: difficulty is String && difficulty.isNotEmpty ? '$game:$difficulty' : null,
    occurredAt: now.toUtc(),
    metrics: {
      if (body['score'] is num) 'score': body['score'],
      if (body['time_seconds'] is num) 'time_seconds': body['time_seconds'],
      if (ladderLevel is num && ladderLevel > 0) 'level': ladderLevel,
    },
    errors: {if (errors is num) 'count': errors},
  );
}

/// Рамка подстраниц настроек — та же, что у «Облака» и «Палитры кристаллов»: системная шапка с «назад»,
/// направление письма по языку. Кнопки экрана — в нижнем ряду.
Widget psyCoachFrame(BuildContext context, String title, Widget body, List<CoachBarAction> actions) => Directionality(
      textDirection: L.locale == 'ar' ? TextDirection.rtl : TextDirection.ltr,
      child: Scaffold(
        appBar: AppBar(title: Text(title)),
        body: SafeArea(child: body),
        bottomNavigationBar: actions.isEmpty
            ? null
            : SafeArea(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  child: Row(children: [
                    for (final a in actions)
                      Expanded(
                        child: FilledButton.icon(key: a.key, onPressed: a.onPressed, icon: Icon(a.icon), label: Text(a.label)),
                      ),
                  ]),
                ),
              ),
      ),
    );
