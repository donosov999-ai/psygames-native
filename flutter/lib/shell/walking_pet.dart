import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:flutter/material.dart';

import 'l10n.dart';
import 'web_theme.dart';

/// МОСТ К ВЕБ-ПИТОМЦУ: облик, реплики, встреча — у страницы (`WalkingPet.tsx`, `__psyPet`).
///
/// 🔴 ПОЧЕМУ НЕ СВОЯ КОПИЯ. Облик «Синапса» — это канал, вшитые кадры, вид по заботе и вещь
/// по якорям каждого кадра; реплики зависят от стадии, слабейшей шкалы, серии и цели. Всё это
/// живёт в вебе и проверено его пробами. Вторая копия на Dart разошлась бы при первой правке
/// реплик или облика, поэтому оболочка спрашивает готовое, а сама только ходит и листает кадры.
///
/// ⚠️ Ответ приходит СООБЩЕНИЕМ (`{op: 'petAnswer', id, data}`), а не результатом скрипта: часть
/// ответов ждёт хранилище, а `runJavaScriptReturningResult` обещаний не дожидается. Страница
/// не ответила за [timeout] — `null`, и питомец просто молчит.
class PetBridge {
  PetBridge._();

  /// Выполнить скрипт в странице — ставит [HybridApp]. Пусто — страницы нет, спрашивать некого.
  static Future<void> Function(String js)? run;

  /// Выполнить и вернуть значение — чтобы узнать, поставлен ли мост, ДО вопроса.
  static Future<Object?> Function(String js)? probe;
  static Duration timeout = const Duration(seconds: 4);

  static final _waiting = <String, Completer<Object?>>{};
  static int _n = 0;

  static Future<Object?> ask(String op, [Object? arg]) async {
    final r = run;
    if (r == null) return null;
    /*
     * ⚠️ СНАЧАЛА — ЕСТЬ ЛИ КОМУ ОТВЕЧАТЬ. На холодном старте страница могла ещё не поставить
     * мост: вопрос ушёл бы в пустоту и висел до [timeout]. Нет моста — `null` сразу, а гуляка
     * спросит снова (`_load`).
     */
    final p = probe;
    if (p != null) {
      try {
        final has = await p('!!(window.__psyPet && window.__psyPet.ask)');
        if (has != true && has != 'true' && has != 1) return null;
      } catch (_) {
        return null;
      }
    }
    final id = 'pet${++_n}';
    final c = Completer<Object?>();
    _waiting[id] = c;
    try {
      await r('window.__psyPet && window.__psyPet.ask(${jsonEncode(id)}, ${jsonEncode(op)}, ${jsonEncode(arg)});');
    } catch (_) {
      _waiting.remove(id);
      return null;
    }
    return c.future.timeout(
      timeout,
      onTimeout: () {
        _waiting.remove(id);
        return null;
      },
    );
  }

  /// Сообщение страницы: ответ на вопрос — забираем и говорим «наше».
  static bool accept(Object? m) {
    if (m is! Map || m['op'] != 'petAnswer') return false;
    _waiting.remove('${m['id']}')?.complete(m['data']);
    return true;
  }

  @visibleForTesting
  static void reset() {
    _waiting.clear();
    run = null;
    probe = null;
    lastSpokeAt = null;
    greetedThisRun = false;
  }

  /// Расписание речи живёт между заходами на вкладку, как `lastSpokeAt` веба.
  static DateTime? lastSpokeAt;

  /// Встречу спрашиваем раз за запуск; раз в сутки держит сам веб (`markGreeted`).
  static bool greetedThisRun = false;
}

/// Описание кадров состояния — `petRenderSpec` веба.
class PetSpec {
  const PetSpec({
    required this.strip,
    required this.uris,
    required this.frames,
    required this.tickMs,
    this.accessory,
    this.boxes = const [],
  });

  final bool strip;
  final List<String> uris;
  final int frames;
  final int tickMs;
  final String? accessory;

  /// Место вещи на каждом кадре в долях размера; `null` — на кадре вещи нет.
  final List<Rect?> boxes;

  static PetSpec? fromJson(Object? j) {
    if (j is! Map) return null;
    final acc = j['accessory'];
    return PetSpec(
      strip: j['kind'] == 'strip',
      uris: [for (final u in (j['uris'] as List? ?? const [])) '$u'],
      frames: (j['frames'] as num?)?.toInt() ?? 1,
      tickMs: (j['tickMs'] as num?)?.toInt() ?? 420,
      accessory: acc is Map ? '${acc['uri']}' : null,
      boxes: acc is Map
          ? [
              for (final b in (acc['boxes'] as List? ?? const []))
                b is Map
                    ? Rect.fromLTWH(
                        (b['left'] as num).toDouble(),
                        (b['top'] as num).toDouble(),
                        (b['size'] as num).toDouble(),
                        (b['size'] as num).toDouble(),
                      )
                    : null,
            ]
          : const [],
    );
  }
}

/// Облик и числа гуляки — ответ `config`.
class PetConfig {
  PetConfig(Map j)
    : visible = j['visible'] != false,
      walks = j['walks'] == true,
      size = (j['size'] as num?)?.toDouble() ?? 56,
      specs = {for (final e in ((j['specs'] as Map?) ?? const {}).entries) '${e.key}': ?PetSpec.fromJson(e.value)},
      cycles = {for (final e in ((j['cycles'] as Map?) ?? const {}).entries) '${e.key}': (e.value as num).toInt()},
      fidgets = [for (final f in (j['fidgets'] as List? ?? const [])) '$f'],
      sleepPoses = [for (final f in (j['sleepPoses'] as List? ?? const [])) '$f'],
      walk = Map<String, num>.from((j['walk'] as Map?) ?? const {});

  final bool visible;

  /// Гуляет ли по экрану. По умолчанию НЕТ (ed85e191): сидит у края полосы и живёт — покой, мелочи
  /// безделья, дрёма, встреча и реплики; переходов нет.
  final bool walks;
  final double size;
  final Map<String, PetSpec> specs;
  final Map<String, int> cycles;
  final List<String> fidgets;
  final List<String> sleepPoses;
  final Map<String, num> walk;

  int ms(String k, int fallback) => walk[k]?.toInt() ?? fallback;
}

/// «СИНАПС» ГУЛЯЕТ ПО НИЗУ НАТИВНОЙ ВКЛАДКИ — ПЕРЕНОС `WalkingPet.tsx` (задачи 99628ecf, 5136754e).
///
/// 📍 Парные кадры 07.10.2026: на вебе по низу вкладки «Игры» ходит питомец, на нативной
/// вкладке его не было. Правило Дениса 4e679f41 — перенос без потерь. Поведение то же, числа
/// приходят из веба (`PET_WALK`):
///   · ходит между случайными точками полосы 10–90 % ширины с постоянной скоростью, мордой по
///     ходу; отдыхает 3–8 с; долгий отдых — засыпает в случайной позе; короткий — мелочь
///     безделья, если её цикл успевает пройти;
///   · первое слово — праздник рекорда или встреча (`first`), потом болтовня раз в 20–40 с, и
///     важная реплика болтовнёй не перебивается;
///   · тап — прыжок и экран питомца; долгий тап — ласка; тренерский пузырь — игра слабой шкалы;
///   · щадящий режим системы: стоит на месте, кадры не листает, но разговаривает.
class WalkingPet extends StatefulWidget {
  const WalkingPet({
    super.key,
    required this.origin,
    required this.lift,
    required this.onOpenPet,
    required this.onOpenRoute,
    required this.accent,
    this.random,
  });

  /// Где питомец остановился — после возврата на вкладку продолжит оттуда (`posRef` веба).
  static double? lastX;

  /// Где сидит питомец, когда не гуляет: правый край полосы прогулки — подальше от кнопки отзыва
  /// слева. Та же формула, что `petSeatX` в `WalkingPet.tsx`.
  static double seatX(double width, double size) => max(width * 0.10 + 40, width * 0.90 - size);

  /// Случайность для проб, когда питомца строит оболочка (`Math.random = () => 0` у веба).
  @visibleForTesting
  static Random? randomForTest;

  /// Адрес сервера раздачи: вшитые кадры лежат во вложенной веб-сборке.
  final String origin;

  /// Над нижним краем безопасной зоны: высота полосы вкладок (`BOTTOM_BAR_LIFT` веба).
  final double lift;
  final VoidCallback onOpenPet;
  final ValueChanged<String> onOpenRoute;

  /// Акцент профиля (`colors.primary` веба) — рамка тренерского пузыря.
  final Color accent;

  /// Случайность — подменяют пробы.
  final Random? random;

  @override
  State<WalkingPet> createState() => _WalkingPetState();
}

class _WalkingPetState extends State<WalkingPet> with TickerProviderStateMixin {
  PetConfig? _cfg;
  String _sprite = 'idle';
  ({String text, String? skill})? _bubble;
  bool _walking = false;
  DateTime _busyUntil = DateTime.fromMillisecondsSinceEpoch(0);
  final _timers = <Timer>[];
  late final Random _rnd = widget.random ?? WalkingPet.randomForTest ?? Random();

  late final AnimationController _x = AnimationController(vsync: this);
  late final AnimationController _flip = AnimationController(vsync: this, duration: const Duration(milliseconds: 260));
  late Animation<double> _xAnim = AlwaysStoppedAnimation(_pos);
  Animation<double> _flipAnim = const AlwaysStoppedAnimation(1);
  double _pos = WalkingPet.lastX ?? 40;
  bool _started = false;
  bool _scheduled = false;

  void _later(int ms, VoidCallback fn) {
    _timers.add(
      Timer(Duration(milliseconds: ms), () {
        if (mounted) fn();
      }),
    );
  }

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  /// Облик спрашиваем, пока страница не ответит: на холодном старте мост ставится позже.
  Future<void> _load([int attempt = 0]) async {
    final j = await PetBridge.ask('config');
    if (!mounted) return;
    if (j is Map) {
      setState(() => _cfg = PetConfig(j));
    } else if (attempt < 5) {
      _later(1500, () => _load(attempt + 1));
    }
  }

  void _start() {
    if (_started || _cfg == null || !_cfg!.visible) return;
    _started = true;
    final c = _cfg!;
    final reduced = MediaQuery.disableAnimationsOf(context);
    if (!reduced) _later(1200, _step);
    _later(1300, _firstWord);
    final last = PetBridge.lastSpokeAt;
    final speechMin = c.ms('speechMin', 20000), speechSpan = c.ms('speechSpan', 20000);
    final int first;
    if (last == null) {
      first = c.ms('firstSpeechMin', 4000) + (_rnd.nextDouble() * c.ms('firstSpeechSpan', 4000)).round();
    } else {
      final since = DateTime.now().difference(last).inMilliseconds;
      first = max(2500, speechMin + (_rnd.nextDouble() * speechSpan).round() - since);
    }
    _later(first, _speak);
  }

  void _step() {
    final c = _cfg!;
    final w = MediaQuery.sizeOf(context).width;
    final lo = w * 0.10;
    final hi = max(lo + 40, w * 0.90 - c.size);
    if (!c.walks) {
      // Не гуляет — сидит у правого края полосы (место ставит `build`), отдыхает на месте. Позиция
      // запоминается: включат прогулку — пойдёт отсюда, а не от левого края.
      _pos = hi;
      _xAnim = AlwaysStoppedAnimation(hi);
      _flipAnim = const AlwaysStoppedAnimation(-1);
      _rest();
      return;
    }
    final target = lo + _rnd.nextDouble() * (hi - lo);
    final dist = (target - _pos).abs();
    final from = _flipAnim.value;
    _flipAnim = Tween<double>(begin: from, end: target >= _pos ? 1 : -1).animate(_flip);
    _flip.forward(from: 0);
    setState(() {
      _walking = true;
      _sprite = 'walk';
    });
    final speed = c.walk['speed']?.toDouble() ?? 34;
    _x.duration = Duration(milliseconds: max(900, (dist / speed * 1000).round()));
    _xAnim = Tween<double>(begin: _pos, end: target).animate(CurvedAnimation(parent: _x, curve: Curves.easeInOutQuad));
    _x.forward(from: 0).whenCompleteOrCancel(() {
      if (!mounted || _x.status != AnimationStatus.completed) return;
      _pos = target;
      _walking = false;
      _rest();
    });
  }

  /// Отдых на месте: покой, затем мелочь безделья или дрёма — и следующий шаг.
  void _rest() {
    final c = _cfg!;
    setState(() => _sprite = 'idle');
    final pause = c.ms('pauseMin', 3000) + (_rnd.nextDouble() * c.ms('pauseSpan', 5000)).round();
    if (pause > 5500) {
      // Затяжной отдых → задремал; поза сна случайная, а не всегда клубок.
      final poses = c.sleepPoses.where(c.specs.containsKey).toList();
      if (poses.isNotEmpty) {
        final pose = poses[_rnd.nextInt(poses.length)];
        _later(4000, () {
          if (!_walking) setState(() => _sprite = pose);
        });
      }
    } else if (!MediaQuery.disableAnimationsOf(context)) {
      // Мелочь безделья — только если её цикл целиком успевает до следующего шага.
      final ok = c.fidgets.where(c.specs.containsKey).toList();
      if (ok.isNotEmpty) {
        final f = ok[_rnd.nextInt(ok.length)];
        final cycle = c.cycles[f] ?? 0;
        const start = 700;
        if (start + cycle < pause - 300) {
          _later(start, () {
            if (!_walking) setState(() => _sprite = f);
          });
          _later(start + cycle, () {
            if (!_walking) setState(() => _sprite = 'idle');
          });
        }
      }
    }
    _later(pause, _step);
  }

  Future<void> _firstWord() async {
    if (PetBridge.greetedThisRun) return;
    final w = await PetBridge.ask('first');
    if (!mounted || w is! Map || w['text'] == null) return;
    PetBridge.greetedThisRun = true;
    final show = (w['showMs'] as num?)?.toInt() ?? 6000;
    _busyUntil = DateTime.now().add(Duration(milliseconds: show));
    setState(() {
      _sprite = '${w['state'] ?? 'wave'}';
      _bubble = (text: '${w['text']}', skill: null);
    });
    _later(
      show,
      () => setState(() {
        _sprite = 'idle';
        _bubble = null;
      }),
    );
  }

  Future<void> _speak() async {
    final c = _cfg!;
    // Важная реплика ещё на экране — болтовня ждёт, а не перебивает.
    final busy = _busyUntil.difference(DateTime.now()).inMilliseconds;
    if (busy > 0) {
      _later(busy + 500, _speak);
      return;
    }
    final line = await PetBridge.ask('line');
    if (!mounted) return;
    final show = c.ms('speechShow', 4000);
    if (line is Map && line['text'] != null) {
      final skill = line['skill'] is String ? line['skill'] as String : null;
      setState(() => _bubble = (text: '${line['text']}', skill: skill));
      if (!_walking) {
        setState(() => _sprite = 'wave');
        _later(1600, () {
          if (!_walking) setState(() => _sprite = 'idle');
        });
      }
      final follow = line['follow'];
      if (follow is String) {
        _later(show - 1000, () => setState(() => _bubble = (text: follow, skill: skill)));
        _later(show - 1000 + show, () => setState(() => _bubble = null));
      } else {
        _later(show, () => setState(() => _bubble = null));
      }
      PetBridge.lastSpokeAt = DateTime.now();
    }
    _later(c.ms('speechMin', 20000) + (_rnd.nextDouble() * c.ms('speechSpan', 20000)).round(), _speak);
  }

  void _tap() {
    setState(() => _sprite = 'jump');
    _later(450, widget.onOpenPet);
  }

  Future<void> _pet() async {
    setState(() => _sprite = 'wave');
    final line = await PetBridge.ask('petted');
    if (!mounted) return;
    if (line is Map && line['text'] != null) setState(() => _bubble = (text: '${line['text']}', skill: null));
    _later(
      3200,
      () => setState(() {
        _sprite = 'idle';
        _bubble = null;
      }),
    );
  }

  Future<void> _coach(String skill) async {
    final route = await PetBridge.ask('coach', skill);
    if (!mounted || route is! String) return;
    setState(() => _bubble = null);
    widget.onOpenRoute(route);
  }

  @override
  void dispose() {
    for (final t in _timers) {
      t.cancel();
    }
    // Где остановились — оттуда и продолжим: настоящее место, а не недостигнутая цель.
    WalkingPet.lastX = _xAnim.value;
    _x.dispose();
    _flip.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = _cfg;
    if (c == null || !c.visible) return const SizedBox.shrink();
    if (!_scheduled) {
      _scheduled = true;
      WidgetsBinding.instance.addPostFrameCallback((_) => mounted ? _start() : null);
    }
    final spec = c.specs[_sprite] ?? c.specs['idle'];
    final web = WebTheme.of(context);
    final bottom = MediaQuery.paddingOf(context).bottom + 6 + widget.lift;
    return AnimatedBuilder(
      animation: Listenable.merge([_x, _flip]),
      builder: (context, _) => Positioned.fill(
        // Питомец стоит в Stack оболочки ПОВЕРХ Scaffold — без своего Material текст пузыря берёт
        // запасной стиль Flutter: жёлтое двойное подчёркивание (живой замер на эмуляторе 07.10.2026).
        // Прозрачный Material касаний мимо питомца и пузыря не ловит.
        child: Material(
          type: MaterialType.transparency,
          child: CustomMultiChildLayout(
            delegate: PetPlace(
              // Не гуляет — место у правого края полосы с первого кадра (как `petSeatX` веба), без скачка.
              left: c.walks ? _xAnim.value : WalkingPet.seatX(MediaQuery.sizeOf(context).width, c.size),
              bottom: bottom,
            ),
            children: [
              LayoutId(
                id: PetPlace.pet,
                child: Column(
                  key: const ValueKey('walking-pet'),
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Semantics(
                      button: true,
                      label: L.t('a11yPet'),
                      child: GestureDetector(
                        key: const ValueKey('walking-pet-body'),
                        // Вся площадь питомца ловит нажатие, как `TouchableOpacity` веба, — и пока кадр
                        // грузится: иначе тап проваливался в плитку под ним.
                        behavior: HitTestBehavior.opaque,
                        onTap: _tap,
                        onLongPress: _pet,
                        child: Transform(
                          alignment: Alignment.center,
                          transform: Matrix4.diagonal3Values(c.walks ? _flipAnim.value : -1, 1, 1),
                          child: spec == null
                              ? SizedBox.square(dimension: c.size)
                              : PetFrames(
                                  key: ValueKey('pet-frames-$_sprite'),
                                  spec: spec,
                                  size: c.size,
                                  origin: widget.origin,
                                  still: MediaQuery.disableAnimationsOf(context),
                                ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              if (_bubble != null)
                LayoutId(
                  id: PetPlace.bubble,
                  child: GestureDetector(
                    key: const ValueKey('walking-pet-bubble'),
                    behavior: HitTestBehavior.opaque,
                    onTap: _bubble!.skill == null ? null : () => _coach(_bubble!.skill!),
                    child: Container(
                      constraints: const BoxConstraints(maxWidth: 170),
                      margin: const EdgeInsets.only(bottom: 2),
                      padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 10),
                      decoration: BoxDecoration(
                        color: web.surface,
                        border: Border.all(
                          color: _bubble!.skill != null ? widget.accent : web.border,
                          width: _bubble!.skill != null ? 1.5 : 1,
                        ),
                        borderRadius: const BorderRadius.only(
                          topLeft: Radius.circular(13),
                          topRight: Radius.circular(13),
                          bottomRight: Radius.circular(13),
                          bottomLeft: Radius.circular(4),
                        ),
                        boxShadow: const [BoxShadow(color: Color(0x26000000), blurRadius: 6, offset: Offset(0, 2))],
                      ),
                      child: Text(
                        _bubble!.text,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        textAlign: TextAlign.center,
                        style: TextStyle(color: web.text, fontSize: 11.5, height: 15 / 11.5, fontWeight: FontWeight.w700),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// 🔴 ПУЗЫРЬ — НАД ПИТОМЦЕМ, НО В ПРЕДЕЛАХ ЭКРАНА (живой замер 08.10.2026 на эмуляторе, Главная на EN).
///
/// У веба пузырь и питомец стоят одной колонкой от левого края питомца (`alignItems: center`), и
/// когда питомец сидит у правого края (`petSeatX`: 90 % ширины), пузырь до 170 пт уходит за экран —
/// «Midday and yo… up. Resp» обрезано справа. Здесь пузырь — отдельный ребёнок: по центру над
/// питомцем, у краёв прижат на [margin] внутрь. Питомец стоит, где стоял.
class PetPlace extends MultiChildLayoutDelegate {
  PetPlace({required this.left, required this.bottom});

  static const pet = 'pet';
  static const bubble = 'bubble';
  static const margin = 8.0;

  final double left;
  final double bottom;

  @override
  void performLayout(Size size) {
    final p = layoutChild(pet, BoxConstraints.loose(size));
    final top = size.height - bottom - p.height;
    positionChild(pet, Offset(left, top));
    if (!hasChild(bubble)) return;
    final b = layoutChild(bubble, BoxConstraints.loose(Size(max(0.0, size.width - margin * 2), size.height)));
    final x = (left + p.width / 2 - b.width / 2).clamp(margin, max(margin, size.width - b.width - margin)).toDouble();
    positionChild(bubble, Offset(x, top - b.height));
  }

  @override
  bool shouldRelayout(PetPlace old) => old.left != left || old.bottom != bottom;
}

/// Кадры состояния — `PetSprite` веба по готовому описанию: лента канала или картинка на кадр,
/// вещь на месте ЭТОГО кадра. В щадящем режиме — первый кадр без смены.
class PetFrames extends StatefulWidget {
  const PetFrames({super.key, required this.spec, required this.size, required this.origin, this.still = false});

  final PetSpec spec;
  final double size;
  final String origin;
  final bool still;

  @override
  State<PetFrames> createState() => _PetFramesState();
}

class _PetFramesState extends State<PetFrames> {
  int _frame = 0;
  Timer? _tick;

  @override
  void initState() {
    super.initState();
    if (!widget.still && widget.spec.frames > 1) {
      _tick = Timer.periodic(Duration(milliseconds: max(60, widget.spec.tickMs)), (_) {
        if (mounted) setState(() => _frame = (_frame + 1) % widget.spec.frames);
      });
    }
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  String _url(String u) => u.startsWith('http') ? u : '${widget.origin}$u';

  @override
  Widget build(BuildContext context) {
    final s = widget.spec;
    final size = widget.size;
    final shown = s.frames == 0 ? 0 : _frame % s.frames;
    Widget img(String u, {double? width}) => Image.network(
      _url(u),
      width: width ?? size,
      height: size,
      fit: width == null ? BoxFit.contain : BoxFit.fill,
      gaplessPlayback: true,
      excludeFromSemantics: true,
      errorBuilder: (_, _, _) => SizedBox(width: width ?? size, height: size),
    );
    final box = shown < s.boxes.length ? s.boxes[shown] : null;
    final body = Stack(
      clipBehavior: s.strip ? Clip.hardEdge : Clip.none,
      children: [
        if (s.strip && s.uris.isNotEmpty)
          Positioned(
            left: -shown * size,
            top: 0,
            width: size * s.frames,
            height: size,
            child: img(s.uris.first, width: size * s.frames),
          )
        else
          // Все кадры в дереве, видим один — как на вебе: смена кадра без мигания загрузкой.
          for (var i = 0; i < s.uris.length; i++)
            Positioned.fill(
              child: Opacity(opacity: i == shown ? 1 : 0, child: img(s.uris[i])),
            ),
        if (s.accessory != null && box != null)
          Positioned(
            key: const ValueKey('pet-accessory'),
            left: box.left * size,
            top: box.top * size,
            width: box.width * size,
            height: box.height * size,
            child: IgnorePointer(
              child: Image.network(
                _url(s.accessory!),
                fit: BoxFit.contain,
                excludeFromSemantics: true,
                errorBuilder: (_, _, _) => const SizedBox(),
              ),
            ),
          ),
      ],
    );
    return SizedBox.square(dimension: size, child: body);
  }
}
