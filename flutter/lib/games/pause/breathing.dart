// «Дыхание» внутри «Паузы» — режим того же экрана, а не отдельная игра.
//
// 🔴 ЗАЧЕМ ТАК. Решение Дениса 30.09.2026 («перегоняй во флатер сразу», задача
// c1bdb847): «Дыхание» и «Гимнастику для глаз» слить в «Паузу» при переносе на
// Flutter. Веб-экран `frontend/app/games/breathing.tsx` не трогаем.
//
// Все семь техник веба есть программами ядра «Паузы» — ритмы совпадают до
// секунды (сверено 30.09: квадрат 4-4-4-4, 4-7-8, 5,5-5,5, вздох 2+1+6, 4-6,
// 4-2-4). Поэтому техника = программа ядра, а сцена, пауза, выход и голос — те
// же, что у «Паузы». Своё у дыхания только то, что было своим в вебе:
//   · формат «по циклам» (4 / 6 / 10) или «по времени» (1 / 3 / 5 мин);
//   · счётчик подходов `psygames_breathing_level_<профиль>` и серия дней;
//   · Вим Хоф — не таймер, а раунды с задержкой, которую человек держит сам
//     (в ядре «Паузы» он упрощён до таймера — перенесён отдельно, ниже);
//   · запись партии под ПРЕЖНИМ `game_type: breathing` — чтобы история,
//     достижения и статистика живых игроков не оборвались.
import 'dart:convert';

import '../../shell/shared_state.dart';

/// Техника веба → программа ядра «Паузы». Порядок и ключи подписей — как в вебе.
class BreathTech {
  const BreathTech(this.web, this.program, this.nameKey, this.descKey);

  /// Ключ техники в вебе: он же `settings.tech` в составах зарядок и `details.technique` в истории.
  final String web;
  final String program;
  final String nameKey;
  final String descKey;
}

const breathTechs = [
  BreathTech('box', 'box', 'brTechBox', 'brTechBoxDesc'),
  BreathTech('calm478', 'calm-478', 'brTech478', 'brTech478Desc'),
  BreathTech('coherent', 'coherent', 'brTechCoherent', 'brTechCoherentDesc'),
  BreathTech('sigh', 'physiological-sigh', 'brTechSigh', 'brTechSighDesc'),
  BreathTech('extexhale', 'extended-exhale', 'brTechExt', 'brTechExtDesc'),
  BreathTech('calm424', 'calm-424', 'brTech424', 'brTech424Desc'),
  BreathTech('wimhof', 'wim-hof', 'brTechWim', 'brTechWimDesc'),
];

/// Подписи экрана дыхания — ключи общего словаря (их зовёт веб-экран).
/// Списком `*Keys`: так их видит `flutter/tools/embed-l10n.mjs`.
const breathUiKeys = [
  'breathing', 'brTechBox', 'brTechBoxDesc', 'brTech478', 'brTech478Desc', 'brTechCoherent',
  'brTechCoherentDesc', 'brTechSigh', 'brTechSighDesc', 'brTechExt', 'brTechExtDesc', 'brTech424',
  'brTech424Desc', 'brTechWim', 'brTechWimDesc', 'brTechniqueLabel', 'brFormatLabel', 'brByCycles',
  'brByTime', 'brCyclesUnit', 'unitMin', 'brGetReady', 'brWimWarnTitle', 'brWimWarnBody', 'brWimAgree',
  'brWimBreathe', 'brWimBreatheHint', 'brWimHold', 'brWimHoldHint', 'brWimRecover', 'round', 'secShort',
];

BreathTech breathTechFor(String web) => breathTechs.firstWhere((t) => t.web == web, orElse: () => breathTechs.first);

/// Варианты формата — ровно как в вебе.
const breathCycleOptions = [4, 6, 10];
const breathMinuteOptions = [1, 3, 5];

/// Длительность подхода: циклы × длина цикла программы или минуты.
int breathDurationMs({required List<Map<String, dynamic>> steps, required String format, required int cycles, required int minutes}) {
  if (format == 'time') return minutes * 60000;
  final cycle = steps.fold<int>(0, (sum, s) => sum + (s['durationMs'] as int));
  return cycle * cycles;
}

/// Счётчик подходов и серия дней — ключи те же, что пишет веб.
class BreathLedger {
  BreathLedger(this.state);

  final SharedState state;

  String get _level => SharedState.levelKey('breathing', state.activeProfile);
  String get _streak => '${SharedState.prefix}breathing_streak_${state.activeProfile}';

  /// Номер подхода, который сейчас идёт (веб: `runs.level`, по умолчанию 1).
  int get run => int.tryParse(state.get(_level) ?? '') ?? 1;

  /// Подход завершён: счётчик вперёд, серия дней — как `bumpStreak` веба.
  Future<void> complete(DateTime today) async {
    final done = run;
    await state.set(_level, '${done + 1}');
    Map<String, dynamic> d;
    try {
      d = jsonDecode(state.get(_streak) ?? '') as Map<String, dynamic>;
    } catch (_) {
      d = {'streak': 0, 'total': 0, 'last': ''};
    }
    final day = today.toIso8601String().substring(0, 10);
    if (d['last'] != day) {
      final yest = today.subtract(const Duration(days: 1)).toIso8601String().substring(0, 10);
      d['streak'] = d['last'] == yest ? ((d['streak'] as num?)?.toInt() ?? 0) + 1 : 1;
      d['last'] = day;
    }
    d['total'] = ((d['total'] as num?)?.toInt() ?? 0) + 1;
    await state.set(_streak, jsonEncode(d));
  }
}

/// Метод Вима Хофа: три раунда «30 глубоких вдохов → задержка, пока держится →
/// 15 секунд восстановления». Задержку заканчивает человек, поэтому это не таймер.
///
/// Модель без таймеров: время приходит снаружи (`tick`), как у всей «Паузы», —
/// экран на паузе стоит, и пробы двигают часы сами.
class WimHofRun {
  static const breaths = 30;
  static const rounds = 3;
  static const breathMs = 1800;
  static const recoverMs = 15000;

  WimHofRun(int now) : _stageStart = now, startedAt = now;

  final int startedAt;
  int round = 1;
  String stage = 'breaths';
  int _stageStart;
  int _pausedAt = -1;
  int breath = 0;
  int holdMs = 0;
  int recoverLeftMs = recoverMs;
  bool done = false;
  int doneAt = 0;

  /// Сколько простояли на паузе: в длительность подхода это время не входит.
  int pausedMs = 0;

  bool get paused => _pausedAt >= 0;

  /// Длительность подхода без пауз — её и пишем в партию.
  int get activeMs => doneAt - startedAt - pausedMs;

  void pause(int now) {
    if (!paused && !done) _pausedAt = now;
  }

  void resume(int now) {
    if (!paused) return;
    _stageStart += now - _pausedAt;
    pausedMs += now - _pausedAt;
    _pausedAt = -1;
  }

  void tick(int now) {
    if (done || paused) return;
    final t = now - _stageStart;
    switch (stage) {
      case 'breaths':
        breath = (t ~/ breathMs).clamp(0, breaths);
        if (breath >= breaths) {
          stage = 'hold';
          _stageStart += breaths * breathMs;
          holdMs = now - _stageStart;
        }
      case 'hold':
        holdMs = t;
      case 'recover':
        recoverLeftMs = (recoverMs - t).clamp(0, recoverMs);
        if (t >= recoverMs) {
          if (round >= rounds) {
            done = true;
            doneAt = _stageStart + recoverMs;
          } else {
            round++;
            stage = 'breaths';
            _stageStart += recoverMs;
            breath = 0;
          }
        }
    }
  }

  /// Человек больше не держит — вдох и восстановление.
  void release(int now) {
    if (stage != 'hold' || paused) return;
    holdMs = now - _stageStart;
    stage = 'recover';
    _stageStart = now;
    recoverLeftMs = recoverMs;
  }
}
