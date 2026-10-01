// «Гимнастика для глаз» внутри «Паузы» — режим того же экрана, а не отдельная игра.
//
// 🔴 ЗАЧЕМ ТАК. Решение Дениса 30.09.2026 (задача c1bdb847): «Дыхание» и «Глаза»
// слить в «Паузу» при переносе на Flutter. Веб-экран `frontend/app/games/eye-gym.tsx`
// не трогаем.
//
// ⚠️ У глаз правила СВОИ, не из ядра «Паузы»: последовательность из 11 шагов, лестница
// 15 уровней (длительность и скорость точки), режимы свободной игры и 11 узоров
// траектории — среди них спираль, волна и пульс, которые добавлены по трём отчётам
// тестировщицы 05.09.2026. В ядре «Паузы» их нет, и «слить через ядро» значило бы их
// потерять. Поэтому правила перенесены сюда как есть и сверены с ЖИВЫМ экраном:
// `flutter/tools/export-pause.cjs` вырезает `SEQUENCE`, `DIRECTIONS`, `MODE_PHASES`,
// множитель режимов и `dotFor` из исходника и пишет эталон
// `test/fixtures/eye-gym-reference.json`; проба — `test/pause_eye_gym_test.dart`.
//
// Партия пишется под ПРЕЖНИМ `game_type: eye_gym` с полями веба — история, уровни и
// достижения живых игроков не рвутся.
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../shell/l10n.dart';

class EyeStep {
  const EyeStep(this.key, this.pattern, this.dur, this.instrKey);

  final String key;
  final String pattern;

  /// Секунды: в `eyeSequence` — базовые, в [eyeSteps] — уже с масштабом.
  final int dur;
  final String instrKey;
}

/// Последовательность веба (`SEQUENCE` в eye-gym.tsx), базовые секунды — для «3 мин».
const eyeSequence = [
  EyeStep('warmup', 'directions', 24, 'eyeInstrWarmup'),
  EyeStep('pursuitH', 'horizontal', 18, 'eyeInstrPursuit'),
  EyeStep('pursuitV', 'vertical', 18, 'eyeInstrPursuit'),
  EyeStep('circle', 'circle', 22, 'eyeInstrPursuit'),
  EyeStep('figure8', 'figure8', 22, 'eyeInstrPursuit'),
  EyeStep('spiral', 'spiral', 22, 'eyeInstrSpiral'),
  EyeStep('wave', 'wave', 20, 'eyeInstrWave'),
  EyeStep('pulse', 'pulse', 20, 'eyeInstrPulse'),
  EyeStep('focusFar', 'focus', 20, 'eyeInstrFocusFar'),
  EyeStep('converge', 'converge', 20, 'eyeInstrConverge'),
  EyeStep('palming', 'palming', 30, 'eyeInstrPalming'),
];

const eyeDirections = [
  [0, -1], [0.85, -0.85], [1, 0], [0.85, 0.85],
  [0, 1], [-0.85, 0.85], [-1, 0], [-0.85, -0.85],
];

/// Режимы свободной игры: `null` — полный круг.
const Map<String, List<String>?> eyeModePhases = {
  'full': null,
  'pursuit': ['warmup', 'pursuitH', 'pursuitV', 'circle', 'figure8', 'spiral', 'wave'],
  'focus': ['focusFar', 'converge', 'pulse'],
  'relax': ['palming'],
};

/// Короткие режимы — длиннее, чтобы был смысл (как в вебе).
double eyeModeMul(String mode) => mode == 'relax' ? 4 : (mode == 'focus' ? 2.5 : 1);

const eyeMaxLevel = 15;
const _scaleMin = 0.4, _scaleMax = 1.7, _speedMin = 0.7, _speedMax = 1.4;

int eyeBaseTotalSec() => eyeSequence.fold(0, (a, s) => a + s.dur);

int clampEyeLevel(num level) => level.isFinite ? level.floor().clamp(1, eyeMaxLevel) : 1;

/// Уровень → масштаб длительности и скорость точки; округление до сотых, как в вебе.
({double scale, double speed}) eyeGymLevel(num level) {
  final n = clampEyeLevel(level);
  final k = (n - 1) / (eyeMaxLevel - 1);
  double r(double v) => (v * 100).round() / 100;
  return (scale: r(_scaleMin + k * (_scaleMax - _scaleMin)), speed: r(_speedMin + k * (_speedMax - _speedMin)));
}

/// Минуты уровня для подписи на тропинке.
int eyeGymLevelMinutes(num level) => math.max(1, (eyeBaseTotalSec() * eyeGymLevel(level).scale / 60).round());

/// Шаги подхода так, как их строит экран веба: подмножество режима, длительность ×
/// масштаб × множитель режима, не короче 8 с.
List<EyeStep> eyeSteps(String mode, double scale) {
  final sel = eyeModePhases[mode];
  final mul = eyeModeMul(mode);
  return [
    for (final s in eyeSequence)
      if (sel == null || sel.contains(s.key))
        EyeStep(s.key, s.pattern, math.max(8, _jsRound(s.dur * scale * mul)), s.instrKey),
  ];
}

/// `Math.round` из JS: половина — вверх (к +∞), в том числе у отрицательных.
int _jsRound(double v) => (v + 0.5).floor();

/// Точка на поле: центр, размер (px) и «большая» ли она (разминка по направлениям).
class EyeDot {
  const EyeDot(this.x, this.y, this.size, this.big);

  final double x, y, size;
  final bool big;
}

double _jsMod(double a, double b) => a - b * (a / b).truncateToDouble();

/// Узоры траектории — `dotFor` веба, построчно.
EyeDot eyeDotFor(String pattern, double local, double localSec, double rx, double ry, double cx, double cy, double speed) {
  const tau = math.pi * 2;
  final l = local * speed, ls = localSec * speed;
  switch (pattern) {
    case 'directions':
      final idx = (ls / 2.6).floor() % eyeDirections.length;
      final d = eyeDirections[idx];
      return EyeDot(cx + d[0] * rx, cy + d[1] * ry, 30, true);
    case 'horizontal':
      return EyeDot(cx + rx * math.sin(tau * 3 * l), cy, 26, false);
    case 'vertical':
      return EyeDot(cx, cy + ry * math.sin(tau * 3 * l), 26, false);
    case 'circle':
      final a = tau * 3 * l;
      return EyeDot(cx + rx * math.cos(a), cy + ry * math.sin(a), 26, false);
    case 'figure8':
      final a = tau * 2 * l;
      return EyeDot(cx + rx * math.sin(a), cy + ry * math.sin(a) * math.cos(a), 26, false);
    case 'spiral':
      final cycle = _jsMod(ls, 12) / 12;
      final r = cycle < 0.5 ? cycle * 2 : (1 - cycle) * 2;
      final a = tau * 3 * l;
      return EyeDot(cx + rx * r * math.cos(a), cy + ry * r * math.sin(a), 26, false);
    case 'wave':
      final a = tau * 1.2 * l;
      return EyeDot(cx + rx * math.sin(a), cy + ry * 0.55 * math.sin(a * 3), 26, false);
    case 'pulse':
      final cycle = _jsMod(ls, 4) / 4;
      final share = cycle < 0.5 ? cycle * 2 : (1 - cycle) * 2;
      return EyeDot(cx, cy, 6 + share * 54, false);
    case 'converge':
      final rep = _jsMod(ls, 5) / 5;
      return EyeDot(cx, cy - ry + rep * ry, 14 + rep * 40, false);
    default:
      return EyeDot(cx, cy, 26, false);
  }
}

/// Поле гимнастики — `eyeGymGeometry` веба: размах по ширине и высоте поля.
({double boardW, double boardH, double cx, double cy, double rx, double ry}) eyeGymGeometry(
  Size viewport, [
  Size? field,
]) {
  final fieldW = (field != null && field.width > 0) ? field.width : math.max(160.0, viewport.width - 32);
  final fieldH = (field != null && field.height > 0) ? field.height : math.max(178.0, viewport.height - 210);
  final boardW = math.max(160.0, math.min(viewport.width - 12, fieldW + 20));
  final boardH = math.max(88.0, fieldH - 90);
  return (
    boardW: boardW,
    boardH: boardH,
    cx: boardW / 2,
    cy: boardH / 2,
    rx: math.max(20.0, boardW / 2 - 24),
    ry: math.max(8.0, boardH / 2 - 15 - 16),
  );
}

/// Поле по готовому прямоугольнику. В вебе `eyeGymGeometry` получает колонку поля
/// вместе с инструкцией и полосой хода и вычитает их (90 px); здесь инструкция и полоса
/// стоят вне прямоугольника, поэтому подаём его так, чтобы вычитание дало его же, —
/// поля и размах точки считает та же сверенная формула.
({double boardW, double boardH, double cx, double cy, double rx, double ry}) eyeBoard(Size box) =>
    eyeGymGeometry(Size(box.width + 12, box.height + 210), Size(box.width - 20, box.height + 90));

/// Подход гимнастики на общих часах экрана: пауза не идёт в зачёт.
class EyeGymRun {
  EyeGymRun({required this.steps, required this.level, required this.byLevel, required this.speed, required int now})
      : totalSec = steps.fold(0, (a, s) => a + s.dur),
        _start = now;

  final List<EyeStep> steps;
  final int totalSec;

  /// Скорость точки: у лестницы — по уровню, в свободной игре — выбранная.
  final double speed;

  /// Уровень, на котором шёл подход, и шёл ли он по лестнице.
  final int level;
  final bool byLevel;

  int _start;
  int _pausedAt = -1;
  double elapsed = 0;
  bool done = false;

  bool get paused => _pausedAt >= 0;

  void pause(int now) {
    if (!paused && !done) _pausedAt = now;
  }

  void resume(int now) {
    if (!paused) return;
    _start += now - _pausedAt;
    _pausedAt = -1;
  }

  void tick(int now) {
    if (done || paused) return;
    elapsed = (now - _start) / 1000;
    if (elapsed >= totalSec) {
      elapsed = totalSec.toDouble();
      done = true;
    }
  }

  /// Текущий шаг и доля внутри него — как считает веб по накопленному времени.
  ({int index, double local, double localSec}) get position {
    var acc = 0.0;
    for (var i = 0; i < steps.length; i++) {
      if (elapsed < acc + steps[i].dur) {
        final localSec = elapsed - acc;
        return (index: i, local: localSec / steps[i].dur, localSec: localSec);
      }
      acc += steps[i].dur;
    }
    final last = steps.length - 1;
    return (index: last, local: 1.0, localSec: steps[last].dur.toDouble());
  }

  int get remainSec => math.max(0, (totalSec - elapsed).ceil());
}

/// Подписи гимнастики — ключи общего словаря (их зовёт веб-экран).
/// Списком `*Keys`: так их видит `flutter/tools/embed-l10n.mjs`.
const eyeUiKeys = [
  'eyeGym', 'eyeInstrWarmup', 'eyeInstrPursuit', 'eyeInstrSpiral', 'eyeInstrWave', 'eyeInstrPulse',
  'eyeInstrFocusFar', 'eyeInstrConverge', 'eyeInstrPalming', 'eyePalmBlink', 'eyeFocusSub', 'eyeModeFull',
  'eyeModePursuit', 'eyeModeFocus', 'eyeModeRelax', 'eye1min', 'eye3min', 'eye5min', 'eyeSlow', 'eyeNorm',
  'eyeFast', 'eyeSpeedLabel', 'eyeDisclaimer', 'sudokuModeLevels', 'sudokuModeFree', 'hud_step', 'timeLeftLabel',
  'secShort', 'mode', 'duration',
  // Стереокартинки (задача a72e77a1) и кнопка паузы поля во весь экран.
  'eyeModeStereo', 'eyeStereoShortTitle', 'eyeStereoOptional', 'eyeStereoInstruction', 'eyeStereoComfort',
  'eyeStereoAnswer', 'eyeStereoReveal', 'eyeStereoNext', 'storyDone', 'shape_circle', 'eyeStereoHeart',
  'shape_star', 'gamePauseOpen',
];

/// Поле подхода: инструкция шага, мишень (или ладони, или взгляд вдаль), полоса хода.
class EyeGymStage extends StatelessWidget {
  const EyeGymStage({super.key, required this.run, required this.height, this.sideClear = 0});

  final EyeGymRun run;
  final double height;

  /// Отступ подписи шага от правого края — под кнопку паузы, когда поле во весь
  /// экран (`GameShell.fieldOnly`). Слева тот же, чтобы подпись осталась по центру.
  final double sideClear;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final pos = run.position;
    final step = run.steps[pos.index];
    final sec = L.t('secShort');
    return Column(
      key: const Key('pause-eye'),
      children: [
        Padding(
          padding: EdgeInsets.fromLTRB(math.max(16, sideClear), 8, math.max(16, sideClear), 4),
          child: Text(L.t(step.instrKey), key: const Key('pause-eye-instr'), style: theme.textTheme.titleMedium, textAlign: TextAlign.center),
        ),
        Expanded(
          child: LayoutBuilder(builder: (context, box) {
            final g = eyeBoard(Size(box.maxWidth, box.maxHeight));
            final w = math.min(g.boardW, box.maxWidth), h = math.min(g.boardH, box.maxHeight);
            if (step.pattern == 'palming') {
              return Center(
                child: Container(
                  key: const Key('pause-eye-palming'),
                  width: w,
                  height: h,
                  decoration: BoxDecoration(color: Colors.black, borderRadius: BorderRadius.circular(16)),
                  child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                    const Icon(Icons.back_hand_outlined, size: 64, color: Color(0xff1f2937)),
                    Text(L.t('eyePalmBlink'), style: const TextStyle(color: Color(0xff9ca3af)), textAlign: TextAlign.center),
                  ]),
                ),
              );
            }
            if (step.pattern == 'focus') {
              return Center(
                child: Column(key: const Key('pause-eye-focus'), mainAxisSize: MainAxisSize.min, children: [
                  Icon(Icons.visibility_outlined, size: 56, color: theme.colorScheme.primary),
                  Text('${math.max(0, (step.dur - pos.localSec).ceil())}$sec', style: theme.textTheme.displaySmall),
                  Text(L.t('eyeFocusSub'), style: theme.textTheme.bodyMedium, textAlign: TextAlign.center),
                ]),
              );
            }
            final dot = eyeDotFor(step.pattern, pos.local, pos.localSec, g.rx, g.ry, w / 2, h / 2, run.speed);
            return Center(
              child: SizedBox(
                width: w,
                height: h,
                child: Stack(children: [
                  Positioned(
                    key: const Key('pause-eye-dot'),
                    left: dot.x - dot.size / 2,
                    top: dot.y - dot.size / 2,
                    width: dot.size,
                    height: dot.size,
                    child: DecoratedBox(
                      decoration: BoxDecoration(color: const Color(0xff43cea2), shape: BoxShape.circle, boxShadow: [
                        BoxShadow(color: const Color(0xff43cea2).withValues(alpha: .6), blurRadius: 8),
                      ]),
                    ),
                  ),
                ]),
              ),
            );
          }),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
          child: LinearProgressIndicator(value: run.totalSec == 0 ? 1 : run.elapsed / run.totalSec),
        ),
      ],
    );
  }
}
