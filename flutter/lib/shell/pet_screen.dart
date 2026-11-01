import 'dart:async';
import 'dart:math';

import 'package:flutter/material.dart';

import 'feedback_fab.dart' show FabRules;
import 'info_screens.dart' show ModelPage, circleBack;
import 'ion_icon.dart';
import 'l10n.dart';
import 'pet_model.dart';
import 'pet_materialization.dart';
import 'design_template.dart';
import 'chrome_art.dart';
import 'game_colors.dart';
import 'tab_chrome.dart';
import 'pilot_press_response.dart' show uiMotionPilot;
import 'profiles.dart';
import 'screen_ui.dart';
import 'section_header_surface.dart';
import 'shared_state.dart';
import 'training_history.dart' show Wall, deviceWall;
import 'walking_pet.dart' show PetFrames, PetSpec;
import 'web_theme.dart';
import '../synapse/synapse_feed.dart';

/// «ПИТОМЕЦ» ПО МОДЕЛИ ВЕБА (задача d1e147b0; правило 4e679f41).
///
/// Стадию, полосу роста, кормление за очки, мытьё раз в день, замки обликов, совет по слабой шкале и
/// реплики считает веб под оболочкой (`app/pet.tsx`). Портрет — готовые описания кадров на каждое
/// действие (`petRenderSpec`), рисует их тот же [PetFrames], что и гуляку; лакомство — эмодзи облика и
/// точка рта от веба, полёт — кривой `PetTreat` (0,9 с, к концу тает). Нажатия — действия веба.
/// Размеры — из `styles` веб-экрана.
///
/// 🗨 СИНАПС (задача 852e4b4a, решение Дениса 04.10): после партии в ТОМ ЖЕ пузыре — реплики ядра по
/// фактам партии (`synapse/synapse_feed.dart`), «Следующая фраза» листает вторую и третью, «Закрыть»
/// возвращает приветствие веба. Нет реплик, выключен питомец или нет общей памяти — пузырь как был.
/// 🔴 ВАРИАНТ Б (задача d6a60b02): есть [state] — модель «Питомца» считается на Dart (`pet_model.dart`)
/// из общей памяти и пересчитывается по каждой записи (кормление, мытьё, облик — их пишет страница);
/// что сделало нажатие (действие на портрете, лакомство, реплика, подпись запертого облика), ложится
/// поверх со страницы. Свой расчёт не удался — модель страницы, как раньше.
class PetScreen extends StatefulWidget {
  const PetScreen({super.key, required this.origin, this.state, this.ownModel = true, this.active = true});
  final bool active;
  static const route = '/pet';

  /// Считать модель на Dart (вариант Б). Пробы рисунка по модели веба выключают.
  final bool ownModel;

  /// Часы экрана (миг «сейчас» и местное время). Пробы подменяют.
  @visibleForTesting
  static int Function() now = () => DateTime.now().millisecondsSinceEpoch;
  @visibleForTesting
  static Wall wall = deviceWall;

  /// Адрес раздачи веб-сборки — кадры приходят путями от неё.
  final String origin;

  /// Общая память: реплики Синапса. Нет — пузырь только с приветствием веба.
  final SharedState? state;

  @override
  State<PetScreen> createState() => _PetScreenState();
}

typedef _M = Map<String, Object?>;
_M _map(Object? v) => v is Map ? Map<String, Object?>.from(v) : const {};
List<_M> _list(Object? v) => v is List ? [for (final x in v) _map(x)] : const [];
String _s(Object? v) => v == null ? '' : '$v';

const _violet = Color(0xFF8A68F5);

class _PetScreenState extends State<PetScreen> with SingleTickerProviderStateMixin {
  bool _editing = false;
  final _name = TextEditingController();
  late final AnimationController _treat = AnimationController(vsync: this, duration: const Duration(milliseconds: 900));
  bool _treatShown = false;

  /// Какая реплика Синапса в пузыре.
  int _line = 0;

  // ── Своя модель (вариант Б) ──
  final _own = ValueNotifier<Map<String, Object?>?>(null);
  PetData? _data;
  bool _failed = false;
  Timer? _debounce;

  /// Реплика пузыря — одна на показ экрана, как `pickReaction` веба на фокусе.
  String? _bubble;

  bool get _ownOn => widget.ownModel && widget.state != null;

  @override
  void initState() {
    super.initState();
    if (!_ownOn) return;
    ScreenUi.model(PetScreen.route).addListener(_refresh);
    widget.state!.writes.addListener(_onWrite);
    PetData.load().then(
      (d) {
        _data = d;
        _refresh();
      },
      onError: (Object e) {
        debugPrint('PetScreen: own model data failed, using the page model ($e)');
        _failed = true;
        _refresh();
      },
    );
  }

  void _onWrite() {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 200), _refresh);
  }

  Future<void> _refresh() async {
    final s = widget.state, d = _data;
    if (!mounted || s == null) return;
    final page = ScreenUi.model(PetScreen.route).value;
    if (_failed) {
      _own.value = page;
      return;
    }
    if (d == null) return;
    try {
      final ps = Profiles.current.list.isEmpty ? await Profiles.load() : Profiles.current;
      _bubble ??= pickPetBubble(d, s.language);
      final own = petModelFrom(
        s,
        d,
        profiles: ps,
        now: PetScreen.now(),
        wall: PetScreen.wall,
        language: s.language,
        bubble: _bubble!,
      );
      if (mounted) _own.value = withPetPageEvents(own, page);
    } catch (e) {
      debugPrint('PetScreen: own model failed, using the page model ($e)');
      _failed = true;
      if (mounted) _own.value = page;
    }
  }

  @override
  void dispose() {
    if (_ownOn) {
      ScreenUi.model(PetScreen.route).removeListener(_refresh);
      widget.state!.writes.removeListener(_onWrite);
    }
    _debounce?.cancel();
    _own.dispose();
    _name.dispose();
    _treat.dispose();
    super.dispose();
  }

  void _act(String a, [List<Object?> args = const []]) => ScreenUi.act(PetScreen.route, a, args);

  void _save() {
    setState(() => _editing = false);
    _act('saveName', [_name.text]);
  }

  /// Лакомство летит, когда веб включил «ест», и сбрасывается, когда выключил.
  void _syncTreat(bool on, bool reduced) {
    if (on == _treatShown) return;
    _treatShown = on;
    if (!on) {
      _treat.value = 0;
    } else if (reduced) {
      _treat.value = 0.85; // щадящий режим: сразу у рта, без полёта (как `PetTreat`)
    } else {
      _treat.forward(from: 0);
    }
  }

  @override
  Widget build(BuildContext context) => ModelPage(
    route: PetScreen.route,
    screenKey: 'pet-screen',
    own: _ownOn ? _own : null,
    builder: (context, m) {
      final web = WebTheme.of(context);
      final win = MediaQuery.sizeOf(context);
      // Портрет — как у веба: на телефоне 220, на широком 300, но не выше трети окна.
      final portrait = ChromeArt.aurora(context)
          ? min(min(win.width * .74, 340.0), (win.height * .38).roundToDouble())
          : min(win.width >= 768 ? 300.0 : 220.0, (win.height * 0.34).roundToDouble());
      final p = _map(m['portrait']);
      final specs = _map(p['specs']);
      final state = _s(p['state']);
      final spec = PetSpec.fromJson(specs[state]) ?? PetSpec.fromJson(specs['idle']);
      final treat = p['treat'] is Map ? _map(p['treat']) : null;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _syncTreat(treat != null, MediaQuery.disableAnimationsOf(context));
      });

      Widget gapped(List<Widget> ws) => Column(mainAxisSize: MainAxisSize.min, spacing: 6, children: ws);

      // ── Шапка: «назад», имя (тап — правка), место справа ──
      final headerControls = Padding(
        padding: ChromeArt.aurora(context)
            ? const EdgeInsets.symmetric(horizontal: 20, vertical: 2)
            : const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
        child: Row(
          children: [
            circleBack(context, 'pet-back', _s(m['back']), _s(m['backIcon']), () => _act('back')),
            Expanded(
              child: Center(
                child: _editing
                    ? Row(
                        mainAxisSize: MainAxisSize.min,
                        spacing: 8,
                        children: [
                          ConstrainedBox(
                            constraints: ChromeArt.aurora(context)
                                ? BoxConstraints(minWidth: 40, maxWidth: min(220, max(40, win.width - 216)))
                                : const BoxConstraints(minWidth: 140, maxWidth: 220),
                            child: IntrinsicWidth(
                              child: TextField(
                                key: const ValueKey('pet-name-field'),
                                controller: _name,
                                autofocus: true,
                                maxLength: (m['nameMax'] as num?)?.toInt() ?? 20,
                                textAlign: TextAlign.center,
                                onSubmitted: (_) => _save(),
                                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: web.text),
                                decoration: InputDecoration(
                                  isDense: true,
                                  counterText: '',
                                  hintText: _s(m['namePlaceholder']),
                                  hintStyle: TextStyle(color: web.textSecondary),
                                  contentPadding: const EdgeInsets.symmetric(vertical: 2),
                                  enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: web.border, width: 1.5)),
                                  focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: web.border, width: 1.5)),
                                ),
                              ),
                            ),
                          ),
                          Semantics(
                            button: true,
                            label: _s(m['apply']),
                            excludeSemantics: true,
                            child: GestureDetector(
                              key: const ValueKey('pet-name-save'),
                              onTap: _save,
                              child: Container(
                                width: 48,
                                height: 48,
                                decoration: const BoxDecoration(color: _violet, shape: BoxShape.circle),
                                child: const Center(child: IonIcon('checkmark', size: 20, color: Colors.white)),
                              ),
                            ),
                          ),
                        ],
                      )
                    : Semantics(
                        button: true,
                        label: _s(m['rename']),
                        child: GestureDetector(
                          key: const ValueKey('pet-name'),
                          behavior: HitTestBehavior.opaque,
                          onTap: () => setState(() {
                            _name.text = _s(m['nameRaw']);
                            _editing = true;
                          }),
                          child: ConstrainedBox(
                            constraints: const BoxConstraints(minHeight: 48),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              spacing: 6,
                              children: [
                                Flexible(
                                  child: Text(
                                    _s(m['name']),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    textAlign: TextAlign.center,
                                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: web.text),
                                  ),
                                ),
                                IonIcon('pencil-outline', size: 15, color: web.textSecondary),
                              ],
                            ),
                          ),
                        ),
                      ),
              ),
            ),
            const SizedBox(width: 44),
          ],
        ),
      );
      final header = ChromeArt.aurora(context)
          ? AuroraTabHeader(route: '/pet', title: L.t('tabPet'))
          : SectionHeaderSurface(child: headerControls);

      // ── Портрет с лакомством ──
      final mouth = treat == null ? null : _map(treat['mouth']);
      final portraitBox = SizedBox.square(
        key: const ValueKey('pet-portrait'),
        dimension: portrait,
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            if (spec != null)
              Positioned.fill(
                child: PetMaterialization(
                  active: widget.active,
                  enabled: uiMotionPilot && Theme.of(context).extension<UiTemplateTheme>()?.template == UiTemplate.aurora,
                  child: PetFrames(key: ValueKey('pet-frames-$state'), spec: spec, size: portrait, origin: widget.origin,
                    still: MediaQuery.disableAnimationsOf(context)),
                ),
              ),
            if (treat != null && mouth != null)
              AnimatedBuilder(
                animation: _treat,
                builder: (context, _) {
                  final v = Curves.easeOutQuad.transform(_treat.value);
                  final fade = v < 0.75 ? 1.0 : 1 - (v - 0.75) / 0.25;
                  final scale = v < 0.75 ? 1.0 : 1 - 0.8 * (v - 0.75) / 0.25;
                  return Positioned(
                    key: const ValueKey('pet-treat'),
                    left: ((mouth['x'] as num?) ?? 0) / 100 * portrait - portrait * 0.09 + portrait * 0.18 * (1 - v),
                    top: ((mouth['y'] as num?) ?? 0) / 100 * portrait - portrait * 0.09 + portrait * 0.28 * (1 - v),
                    child: IgnorePointer(
                      child: Opacity(
                        opacity: fade.clamp(0, 1),
                        child: Transform.scale(
                          scale: scale.clamp(0.2, 1),
                          child: Text(_s(treat['emoji']), style: TextStyle(fontSize: portrait * 0.18)),
                        ),
                      ),
                    ),
                  );
                },
              ),
          ],
        ),
      );

      // ── Рост ──
      final growth = m['growth'] is Map ? _map(m['growth']) : null;
      final growthBox = growth == null
          ? null
          : Padding(
              padding: const EdgeInsets.only(top: 6),
              child: SizedBox(
                width: min(win.width * 0.82, 320),
                child: Column(
                  spacing: 5,
                  children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(3),
                      child: Container(
                        key: const ValueKey('pet-growth'),
                        height: 6,
                        color: web.border,
                        alignment: Alignment.centerLeft,
                        child: FractionallySizedBox(
                          widthFactor: ((growth['frac'] as num?) ?? 0).toDouble().clamp(0, 1),
                          child: Container(color: _violet),
                        ),
                      ),
                    ),
                    Text(
                      _s(growth['text']),
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 12, color: web.textSecondary),
                    ),
                  ],
                ),
              ),
            );

      // ── Кормление и забота ──
      final feed = _map(m['feed']);
      final fed = feed['fed'] == true;
      final feedBtn = Padding(
        padding: const EdgeInsets.only(top: 8),
        child: Semantics(
          button: true,
          enabled: !fed,
          child: GestureDetector(
            key: const ValueKey('pet-feed'),
            onTap: fed ? null : () => _act('feed'),
            child: Container(
              constraints: const BoxConstraints(minHeight: 48),
              padding: const EdgeInsets.symmetric(vertical: 9, horizontal: 20),
              decoration: ChromeArt.aurora(context) ? ChromeArt.panel(context, selected: !fed) : BoxDecoration(
                color: fed ? web.surface : _violet,
                border: Border.all(color: fed ? web.border : _violet, width: 1.5),
                borderRadius: BorderRadius.circular(16),
              ),
              // По ширине текста и по центру строки, как у веба: кнопка не растягивается на всю ширину.
              child: Column(
                mainAxisSize: MainAxisSize.min,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    _s(feed['label']),
                    style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800,
                      color: ChromeArt.aurora(context) ? web.text : fed ? web.textSecondary : Colors.white),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
      Widget hint(Object? v, {Key? key}) => Padding(
        key: key,
        padding: const EdgeInsets.only(top: 3),
        child: Text(
          _s(v),
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 11.5, color: web.textSecondary),
        ),
      );
      final careRow = Padding(
        padding: const EdgeInsets.fromLTRB(4, 10, 4, 0),
        child: Row(
          spacing: 8,
          children: [
            for (final c in _list(m['care']))
              Expanded(
                child: Semantics(
                  button: true,
                  enabled: c['enabled'] == true,
                  label: _s(c['a11y']),
                  excludeSemantics: true,
                  child: GestureDetector(
                    key: ValueKey('pet-care-${c['id']}'),
                    onTap: c['enabled'] == true ? () => _act('${c['id']}') : null,
                    child: Opacity(
                      opacity: c['enabled'] == true ? 1 : 0.5,
                      child: Container(
                        constraints: const BoxConstraints(minHeight: 56),
                        padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 4),
                        decoration: ChromeArt.aurora(context) ? ChromeArt.panel(context, square: true) : BoxDecoration(
                          color: web.surface,
                          border: Border.all(color: c['accent'] == true ? _violet : web.border, width: 1.5),
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Padding(
                              padding: const EdgeInsets.only(bottom: 1),
                              child: Text(_s(c['emoji']), style: const TextStyle(fontSize: 19)),
                            ),
                            Text(
                              _s(c['label']),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: web.text),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
      );

      // ── Облики ──
      final skins = SingleChildScrollView(
        key: const ValueKey('pet-skins'),
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 4),
        child: ConstrainedBox(
          constraints: BoxConstraints(minWidth: min(win.width, 520) - 40),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            spacing: 10,
            children: [
              for (final sk in _list(m['skins']))
                Semantics(
                  button: true,
                  selected: sk['on'] == true,
                  label: _s(sk['a11y']),
                  excludeSemantics: true,
                  child: GestureDetector(
                    key: ValueKey('pet-skin-${sk['id']}'),
                    onTap: () => _act('skin', [sk['id']]),
                    child: Opacity(
                      opacity: sk['locked'] == true ? 0.5 : 1,
                      child: Container(
                        constraints: const BoxConstraints(minWidth: 96),
                        padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 14),
                        decoration: ChromeArt.aurora(context) ? ChromeArt.panel(context, square: true).copyWith(
                          border: Border.all(color: sk['on'] == true ? ChromePilot.selectedSkin : Colors.transparent, width: sk['on'] == true ? 2 : 1),
                        ) : BoxDecoration(
                          color: web.surface,
                          border: Border.all(color: sk['on'] == true ? _violet : web.border, width: sk['on'] == true ? 2 : 1),
                          borderRadius: BorderRadius.circular(15),
                        ),
                        child: Stack(
                          clipBehavior: Clip.none,
                          children: [
                            Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                if (PetSpec.fromJson(sk['still']) case final st?)
                                  SizedBox.square(
                                    dimension: 52,
                                    child: PetFrames(spec: st, size: 52, origin: widget.origin, still: true),
                                  ),
                                Padding(
                                  padding: const EdgeInsets.only(top: 3),
                                  child: Text(
                                    _s(sk['label']),
                                    maxLines: 1,
                                    style: TextStyle(
                                      fontSize: 11.5,
                                      fontWeight: FontWeight.w800,
                                      color: sk['on'] == true ? _violet : web.textSecondary,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                            if (sk['locked'] == true)
                              Positioned(
                                top: -2,
                                right: -6,
                                child: IonIcon(
                                  'lock-closed',
                                  key: ValueKey('pet-skin-lock-${sk['id']}'),
                                  size: 13,
                                  color: web.textSecondary,
                                ),
                              ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      );

      // ── Уровень, совет, шкалы ──
      Widget statusBox(Object? big, Object? small, String key) => Container(
        key: ValueKey(key),
        constraints: const BoxConstraints(minWidth: 112),
        padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 16),
        decoration: ChromeArt.aurora(context) ? ChromeArt.panel(context) : BoxDecoration(
          color: web.surface,
          border: Border.all(color: web.border),
          borderRadius: BorderRadius.circular(15),
        ),
        child: Column(
          children: [
            Text(
              _s(big),
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: web.text),
            ),
            Padding(
              padding: const EdgeInsets.only(top: 1),
              child: Text(_s(small), style: TextStyle(fontSize: 11.5, color: web.textSecondary)),
            ),
          ],
        ),
      );
      // Реплики Синапса после партии — вместо приветствия, пока не закрыты (852e4b4a).
      final synapse = widget.state == null ? const <String>[] : SynapseFeed.linesFor(widget.state!);
      if (_line >= synapse.length) _line = 0;
      Widget synapseLink(String key, String text, VoidCallback onTap) => Semantics(
        button: true,
        label: text,
        excludeSemantics: true,
        child: GestureDetector(
          key: ValueKey(key),
          behavior: HitTestBehavior.opaque,
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.only(top: 6, bottom: 2),
            child: Text(text, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: _violet)),
          ),
        ),
      );
      final advice = m['advice'] is Map ? _map(m['advice']) : null;
      final adviceColor = advice == null ? _violet : cssColor(advice['color'], _violet);

      final speechBox = Container(
          key: const ValueKey('pet-bubble'),
          constraints: const BoxConstraints(maxWidth: 260),
          margin: const EdgeInsets.only(bottom: 6),
          padding: const EdgeInsets.symmetric(vertical: 9, horizontal: 14),
          decoration: BoxDecoration(
            color: web.surface,
            border: Border.all(color: web.border),
            borderRadius: const BorderRadius.only(
              topLeft: Radius.circular(15),
              topRight: Radius.circular(15),
              bottomRight: Radius.circular(15),
              bottomLeft: Radius.circular(4),
            ),
          ),
          child: synapse.isEmpty
              ? Text(
                  _s(m['bubble']),
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, height: 18 / 13, color: web.text),
                )
              : Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      synapse[_line],
                      key: const ValueKey('pet-synapse-line'),
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, height: 18 / 13, color: web.text),
                    ),
                    Wrap(
                      alignment: WrapAlignment.center,
                      spacing: 16,
                      children: [
                        if (_line < synapse.length - 1)
                          synapseLink('pet-synapse-next', '${L.t('synapseNextLine')} ›', () => setState(() => _line += 1)),
                        synapseLink('pet-synapse-close', L.t('close'), () async {
                          await SynapseFeed.dismiss(widget.state!);
                          if (mounted) setState(() => _line = 0);
                        }),
                      ],
                    ),
                  ],
                ),
        );
      final inlineBubble = ChromeArt.aurora(context) && synapse.isEmpty &&
          MediaQuery.textScalerOf(context).scale(1) <= 1.25 && _s(m['bubble']).length < 100;
      final body = <Widget>[
        if (!inlineBubble) speechBox,
        if (ChromeArt.aurora(context)) Container(
          key: const ValueKey('pet-gem-stage'),
          width: double.infinity,
          height: min(win.width - 32, 390),
          decoration: BoxDecoration(borderRadius: BorderRadius.circular(24), image: DecorationImage(
            image: AssetImage('assets/aurora_tab_panels/pet-stage-${Theme.of(context).brightness == Brightness.dark ? 'dark' : 'light'}.png'),
            fit: BoxFit.cover, alignment: Alignment.bottomCenter,
          )),
          child: Stack(children: [
            Positioned.fill(child: Align(alignment: const Alignment(0, -.65), child: portraitBox)),
            if (inlineBubble) PositionedDirectional(top: 12, start: 12, end: 12,
              child: Align(alignment: AlignmentDirectional.topStart, child: speechBox)),
          ]),
        ) else portraitBox,
        if (ChromeArt.aurora(context)) headerControls,
        Padding(
          padding: const EdgeInsets.only(top: 2),
          child: Text(
            _s(m['stageName']),
            style: TextStyle(fontSize: 24, fontWeight: FontWeight.w900, color: web.text),
          ),
        ),
        Text(
          _s(m['stageHint']),
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 12.5, color: web.textSecondary),
        ),
        ?growthBox,
        feedBtn,
        if (feed['needMore'] != null) hint(feed['needMore'], key: const ValueKey('pet-feed-hint')),
        careRow,
        if (m['lookReason'] != null) hint(m['lookReason'], key: const ValueKey('pet-look-reason')),
        Padding(
          padding: const EdgeInsets.only(top: 14),
          child: Text(
            _s(m['skinTitle']),
            style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: web.textSecondary),
          ),
        ),
        Padding(padding: const EdgeInsets.only(top: 6), child: skins),
        Padding(
          padding: const EdgeInsets.only(top: 14, bottom: 6),
          // Перенос, а не ряд: на 320×568 с крупным шрифтом две плашки вылезали на 44 px (замер 07.10,
          // `synapse_test`); помещаются — вид тот же, что у веба.
          child: Wrap(
            alignment: WrapAlignment.center,
            spacing: 10,
            runSpacing: 10,
            children: [statusBox(m['level'], m['levelLabel'], 'pet-level'), statusBox(m['total'], m['totalLabel'], 'pet-total')],
          ),
        ),
        if (advice != null)
          Semantics(
            button: true,
            label: _s(advice['a11y']),
            excludeSemantics: true,
            child: GestureDetector(
              key: const ValueKey('pet-advice'),
              onTap: () => _act('advice'),
              child: Container(
                margin: const EdgeInsets.only(bottom: 4),
                padding: const EdgeInsets.all(13),
                decoration: BoxDecoration(
                  color: web.surface,
                  border: Border.all(color: adviceColor, width: 1.5),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  spacing: 4,
                  children: [
                    Text(
                      _s(advice['title']),
                      style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: adviceColor),
                    ),
                    Text(
                      _s(advice['body']),
                      style: TextStyle(fontSize: 13.5, height: 19 / 13.5, color: web.text),
                    ),
                  ],
                ),
              ),
            ),
          ),
        Padding(
          padding: const EdgeInsets.only(top: 8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            spacing: 10,
            children: [
              for (final k in _list(m['skills']))
                Container(
                  key: ValueKey('pet-skill-${k['key']}'),
                  padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 14),
                  decoration: ChromeArt.aurora(context) ? ChromeArt.panel(context) : BoxDecoration(
                    color: web.surface,
                    border: Border.all(color: web.border),
                    borderRadius: BorderRadius.circular(15),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Expanded(child: Text(
                              _s(k['label']),
                              style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: web.text),
                            )),
                            const SizedBox(width: 8),
                            Flexible(child: Text(
                              _s(k['value']),
                              textAlign: TextAlign.end,
                              style: TextStyle(fontSize: 15, fontWeight: FontWeight.w900, color: cssColor(k['color'])),
                            )),
                          ],
                        ),
                      ),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(999),
                        child: Container(
                          height: 7,
                          color: web.border,
                          alignment: Alignment.centerLeft,
                          child: FractionallySizedBox(
                            widthFactor: (((k['value'] as num?) ?? 0) / 100).clamp(0, 1).toDouble(),
                            child: Container(color: cssColor(k['color'])),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
            ],
          ),
        ),
      ];

      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          header,
          Expanded(
            child: SingleChildScrollView(
              key: const ValueKey('pet-list'),
              padding: EdgeInsets.fromLTRB(16, 16, 16, FabRules.clearance),
              child: Center(
                child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 520), child: gapped(body)),
              ),
            ),
          ),
        ],
      );
    },
  );
}
