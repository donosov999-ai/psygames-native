import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';

import 'game_clock.dart' show GameHoldScope;
import 'ion_icon.dart';
import 'screen_ui.dart';
import 'web_theme.dart';

/// ФОРМА ОТЗЫВА ПО МОДЕЛИ ВЕБА (задача c092cd47; правило 4e679f41).
///
/// Думает по-прежнему `FeedbackWidget` основной страницы — окно `#feedback`: отправка, очередь,
/// запись голоса, развилки «немая запись» и «обрывок», правила приватности. Сюда приходят готовые
/// строки, нажатия уходят действиями веба. Своё у оболочки два: снимок нативного экрана (страница
/// под ним устарела — [FeedbackHost.snap]) и окно отказа отправки (`alert` в WebView не виден).
/// Лист и его размеры — из `styles` веб-виджета: подложка 0,6, скругление 22, высота до 88 %,
/// «Отправить» закреплена под прокруткой и всегда над клавиатурой (e780e5b0).
class FeedbackHost {
  FeedbackHost._();

  /// Окно основной страницы, не адрес (как `#switcher`).
  static const route = '#feedback';

  /// Корень приложения — кадр для снимка (`main.dart`, `MaterialApp.builder`).
  static final shotKey = GlobalKey();

  /// Кадр того, что на экране сейчас, в PNG, в логических точках (как `scale: 1` у снимка
  /// страницы: для «где непонятно» хватает, и лишние мегабайты не льются). Нет корня — null.
  static Future<Uint8List?> snap() async {
    try {
      final box = shotKey.currentContext?.findRenderObject();
      if (box is! RenderRepaintBoundary) return null;
      final image = await box.toImage(pixelRatio: 1);
      final data = await image.toByteData(format: ui.ImageByteFormat.png);
      image.dispose();
      return data?.buffer.asUint8List();
    } catch (_) {
      return null; // снимок — бонус, не блокер отправки
    }
  }

  /// Лист поверх всего, игра под ним стоит ([GameHoldScope]), как у паузы.
  static Route<void> sheetRoute() => PageRouteBuilder<void>(
    opaque: false,
    transitionDuration: const Duration(milliseconds: 250),
    reverseTransitionDuration: const Duration(milliseconds: 200),
    pageBuilder: (_, _, _) => const GameHoldScope(child: FeedbackScreen()),
    transitionsBuilder: (_, a, _, child) => FadeTransition(opacity: a, child: child),
  );
}

typedef _M = Map<String, Object?>;
_M _map(Object? v) => v is Map ? Map<String, Object?>.from(v) : const {};
List<_M> _list(Object? v) => v is List ? [for (final x in v) _map(x)] : const [];
String _s(Object? v) => v == null ? '' : '$v';
_M? _opt(Object? v) => v is Map ? Map<String, Object?>.from(v) : null;

const _red = Color(0xFFEF4444);
const _amber = Color(0xFFB45309);
const _green = Color(0xFF22C55E);
const _white = Color(0xFFFFFFFF);

class FeedbackScreen extends StatefulWidget {
  const FeedbackScreen({super.key});

  @override
  State<FeedbackScreen> createState() => _FeedbackScreenState();
}

class _FeedbackScreenState extends State<FeedbackScreen> {
  final _model = ScreenUi.model(FeedbackHost.route);
  final _field = TextEditingController();
  final _focus = FocusNode();

  /// Номер последней правки поля. Текст веба встаёт в поле, только когда модель ответила именно на
  /// неё (как у «Друзей»): иначе ответ на «a» затёр бы уже набранное «ab». Первая модель — черновик
  /// веба (текст не стирается при закрытии, только после отправки) — принимается целиком.
  int _seq = 0;
  bool _adopted = false;
  String? _shownError;

  @override
  void initState() {
    super.initState();
    _model.addListener(_sync);
    _sync();
  }

  @override
  void dispose() {
    _model.removeListener(_sync);
    _field.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _act(String action, [List<Object?> args = const []]) => ScreenUi.act(FeedbackHost.route, action, args);

  void _sync() {
    final m = _model.value;
    if (m == null || m['open'] != true) return;
    final form = _map(m['form']);
    if (form.isNotEmpty) {
      final text = _s(form['text']);
      final seq = form['textSeq'];
      if (!_adopted) {
        _adopted = true;
        if (seq is int) _seq = seq;
        _put(text);
      } else if (seq == _seq && _field.text != text) {
        _put(text);
      }
    }
    final error = m['error'];
    if (error is String && error != _shownError) {
      _shownError = error;
      WidgetsBinding.instance.addPostFrameCallback((_) => _alert(error));
    } else if (error == null) {
      _shownError = null;
    }
  }

  void _put(String text) => _field.value = TextEditingValue(
    text: text,
    selection: TextSelection.collapsed(offset: text.length),
  );

  /// Отказ отправки: у веба это `alert` — окно с «ОК"; текст в поле остаётся.
  Future<void> _alert(String text) async {
    if (!mounted) return;
    await showDialog<void>(
      context: context,
      builder: (c) => AlertDialog(
        key: const ValueKey('feedback-error'),
        content: Text(text),
        actions: [TextButton(onPressed: () => Navigator.of(c).pop(), child: Text(MaterialLocalizations.of(c).okButtonLabel))],
      ),
    );
    _act('clearError');
  }

  void _close() {
    _act('close');
    Navigator.of(context).maybePop();
  }

  @override
  Widget build(BuildContext context) => PopScope(
    onPopInvokedWithResult: (didPop, _) {
      if (didPop) _act('close');
    },
    child: Scaffold(
      backgroundColor: Colors.transparent,
      resizeToAvoidBottomInset: true,
      body: ColoredBox(
        color: const Color(0x99000000),
        child: SafeArea(
          bottom: false,
          child: ValueListenableBuilder<_M?>(
            valueListenable: _model,
            builder: (context, m, _) {
              if (m == null || m['open'] != true) {
                return const Center(
                  key: ValueKey('feedback-screen-loading'),
                  child: CircularProgressIndicator(color: _white),
                );
              }
              return LayoutBuilder(
                builder: (context, box) => Align(
                  alignment: Alignment.bottomCenter,
                  child: ConstrainedBox(
                    constraints: BoxConstraints(maxHeight: box.maxHeight * 0.88),
                    child: _sheet(context, m),
                  ),
                ),
              );
            },
          ),
        ),
      ),
    ),
  );

  Widget _sheet(BuildContext context, _M m) {
    final web = WebTheme.of(context);
    final primary = cssColor(m['primary'], Theme.of(context).colorScheme.primary);
    final footer = _opt(m['footer']);
    return Container(
      key: const ValueKey('feedback-sheet'),
      width: double.infinity,
      decoration: BoxDecoration(
        color: web.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(22)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Flexible(
            child: SingleChildScrollView(
              key: const ValueKey('feedback-scroll'),
              padding: const EdgeInsets.all(20),
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.manual,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _header(web, m),
                  _tabs(web, m, primary),
                  if (_opt(m['dialog']) case final d?) _dialog(web, d, primary),
                  if (_opt(m['thanks']) case final th?) _thanks(web, th),
                  if (_opt(m['form']) case final f?) ..._form(web, f),
                ],
              ),
            ),
          ),
          if (footer != null) _footer(context, web, footer),
        ],
      ),
    );
  }

  Widget _header(WebColors web, _M m) => Padding(
    padding: const EdgeInsets.only(bottom: 6),
    child: Row(
      children: [
        Expanded(
          child: Text(
            _s(m['title']),
            style: TextStyle(fontSize: 19, fontWeight: FontWeight.w800, color: web.text),
          ),
        ),
        Semantics(
          button: true,
          label: _s(m['close']),
          excludeSemantics: true,
          child: GestureDetector(
            key: const ValueKey('feedback-close'),
            behavior: HitTestBehavior.opaque,
            onTap: _close,
            child: Padding(
              padding: const EdgeInsets.all(4),
              child: IonIcon('close-circle', size: 28, color: web.textSecondary),
            ),
          ),
        ),
      ],
    ),
  );

  Widget _tabs(WebColors web, _M m, Color primary) => Padding(
    padding: const EdgeInsets.only(bottom: 12),
    child: Row(
      spacing: 8,
      children: [
        for (final tab in _list(m['tabs']))
          Expanded(
            child: Semantics(
              button: true,
              selected: tab['id'] == m['tab'],
              child: GestureDetector(
                key: ValueKey('feedback-tab-${tab['id']}'),
                onTap: () => _act('tab', [tab['id']]),
                child: Container(
                  constraints: const BoxConstraints(minHeight: 44),
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: tab['id'] == m['tab'] ? primary : Colors.transparent,
                    border: Border.all(color: tab['id'] == m['tab'] ? primary : web.border),
                    borderRadius: BorderRadius.circular(11),
                  ),
                  child: Text(
                    _s(tab['label']),
                    style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: tab['id'] == m['tab'] ? _white : web.text),
                  ),
                ),
              ),
            ),
          ),
      ],
    ),
  );

  Widget _dialog(WebColors web, _M d, Color primary) {
    Widget center(String text, {double? height}) => Padding(
      padding: const EdgeInsets.all(16),
      child: Text(
        text,
        textAlign: TextAlign.center,
        style: TextStyle(color: web.textSecondary, height: height),
      ),
    );
    return Padding(
      key: const ValueKey('feedback-dialog'),
      padding: const EdgeInsets.only(bottom: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: 8,
        children: [
          if (d['loading'] == true) center('…'),
          if (d['empty'] != null) center(_s(d['empty']), height: 20 / 14),
          for (final b in _list(d['bubbles']))
            Align(
              alignment: b['me'] == true ? AlignmentDirectional.centerEnd : AlignmentDirectional.centerStart,
              child: FractionallySizedBox(
                widthFactor: 0.86,
                alignment: b['me'] == true ? AlignmentDirectional.centerEnd : AlignmentDirectional.centerStart,
                child: Align(
                  alignment: b['me'] == true ? AlignmentDirectional.centerEnd : AlignmentDirectional.centerStart,
                  child: Container(
                    key: ValueKey('feedback-bubble-${b['key']}'),
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    decoration: BoxDecoration(
                      color: b['me'] == true ? primary : web.background,
                      border: b['me'] == true ? null : Border.all(color: web.border),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      spacing: 3,
                      children: [
                        if (b['fixed'] != null)
                          Text(
                            _s(b['fixed']),
                            style: TextStyle(
                              fontSize: 11.5,
                              fontWeight: FontWeight.w800,
                              color: b['me'] == true ? const Color(0xD9FFFFFF) : primary,
                            ),
                          ),
                        Text(
                          _s(b['text']),
                          style: TextStyle(fontSize: 13.5, height: 19 / 13.5, color: b['me'] == true ? _white : web.text),
                        ),
                        Text(
                          _s(b['at']),
                          style: TextStyle(fontSize: 10.5, color: b['me'] == true ? const Color(0xB3FFFFFF) : web.textSecondary),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          Center(
            child: Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Semantics(
                button: true,
                child: GestureDetector(
                  key: const ValueKey('feedback-dialog-write'),
                  onTap: () => _act('tab', ['form']),
                  child: Container(
                    constraints: const BoxConstraints(minHeight: 44),
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    decoration: BoxDecoration(
                      border: Border.all(color: primary),
                      borderRadius: BorderRadius.circular(11),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      spacing: 6,
                      children: [
                        IonIcon('create-outline', size: 16, color: primary),
                        Text(
                          _s(d['write']),
                          style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: primary),
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
  }

  Widget _thanks(WebColors web, _M th) {
    Widget line(String text, Color color) => Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Text(
        text,
        textAlign: TextAlign.center,
        style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: color),
      ),
    );
    return Padding(
      key: const ValueKey('feedback-thanks'),
      padding: const EdgeInsets.symmetric(vertical: 30),
      child: Column(
        spacing: 10,
        children: [
          Text(_s(th['icon']), style: const TextStyle(fontSize: 44)),
          Text(
            _s(th['title']),
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 19, fontWeight: FontWeight.w800, color: web.text),
          ),
          if (th['audioSent'] != null) line(_s(th['audioSent']), web.textSecondary),
          if (th['audioLost'] != null) line(_s(th['audioLost']), const Color(0xFFE0574A)),
        ],
      ),
    );
  }

  /// Строка-кнопка с рамкой (`styles.shotRow` веба): запись, прослушивание, снимок.
  Widget _row(
    WebColors web, {
    required String key,
    required Widget icon,
    required String label,
    required VoidCallback onTap,
    Color? border,
    Widget? trailing,
    String? semantics,
  }) => Padding(
    padding: const EdgeInsets.only(bottom: 14),
    child: Semantics(
      button: true,
      label: semantics,
      child: GestureDetector(
        key: ValueKey(key),
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: Container(
          // 13 по вертикали: у веба значок — строка шрифта (~22), а не 20, и строка выходит 48 (замер пар 07.10).
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 13),
          decoration: BoxDecoration(
            border: Border.all(color: border ?? web.border),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Row(
            spacing: 10,
            children: [
              icon,
              Expanded(
                child: Text(label, style: TextStyle(fontSize: 13, color: web.text)),
              ),
              ?trailing,
            ],
          ),
        ),
      ),
    ),
  );

  List<Widget> _form(WebColors web, _M f) {
    final on = _map(f['kindOn']);
    final onBg = cssColor(on['bg'], _red);
    final onFg = cssColor(on['fg'], _white);
    final voice = _opt(f['voice']);
    final shot = _opt(f['shot']);
    return [
      Padding(
        padding: const EdgeInsets.only(bottom: 4),
        child: Text(
          _s(f['ctx']),
          key: const ValueKey('feedback-ctx'),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: web.textSecondary),
        ),
      ),
      Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: Text(
          _s(f['hint']),
          style: TextStyle(fontSize: 12, height: 17 / 12, color: web.textSecondary),
        ),
      ),
      Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: Row(
          spacing: 8,
          children: [
            for (final k in _list(f['kinds']))
              Expanded(
                child: Semantics(
                  button: true,
                  selected: k['on'] == true,
                  child: GestureDetector(
                    key: ValueKey('feedback-kind-${k['key']}'),
                    onTap: () => _act('kind', [k['key']]),
                    child: Container(
                      constraints: const BoxConstraints(minHeight: 48),
                      padding: const EdgeInsets.symmetric(vertical: 10),
                      decoration: BoxDecoration(
                        color: k['on'] == true ? onBg : web.card,
                        border: Border.all(color: k['on'] == true ? onBg : web.border, width: 1.5),
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        spacing: 5,
                        children: [
                          Text(_s(k['emoji']), style: const TextStyle(fontSize: 15)),
                          Flexible(
                            child: Text(
                              _s(k['label']),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: k['on'] == true ? onFg : web.text),
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
      // Рамка и фон — на обёртке с `minHeight: 110` веба: у самого поля рамка рисуется по строкам
      // текста, и под ней оставалась пустота (пара кадров 07.10). Тап по пустому месту — курсор в поле.
      Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: GestureDetector(
          onTap: _focus.requestFocus,
          child: Container(
            key: const ValueKey('feedback-text-box'),
            constraints: const BoxConstraints(minHeight: 110),
            alignment: Alignment.topLeft,
            decoration: BoxDecoration(
              color: web.card,
              border: Border.all(color: web.border),
              borderRadius: BorderRadius.circular(12),
            ),
            child: TextField(
              key: const ValueKey('feedback-text'),
              controller: _field,
              focusNode: _focus,
              autofocus: true,
              maxLines: null,
              keyboardType: TextInputType.multiline,
              textAlignVertical: TextAlignVertical.top,
              onChanged: (v) => _act('text', [v, ++_seq]),
              // Высота строки и разрядка — веба (`normal` браузера ≈ 1,2), а не `bodyLarge` M3 (1,5 и 0,5).
              style: TextStyle(fontSize: 15, height: 18 / 15, letterSpacing: 0, color: web.text),
              decoration: InputDecoration(
                hintText: _s(f['placeholder']),
                hintStyle: TextStyle(fontSize: 15, height: 18 / 15, letterSpacing: 0, color: web.textSecondary),
                hintMaxLines: 4,
                isDense: true,
                border: InputBorder.none,
                contentPadding: const EdgeInsets.all(12),
              ),
            ),
          ),
        ),
      ),
      if (voice != null) _voice(web, voice),
      if (shot != null)
        _row(
          web,
          key: 'feedback-shot',
          icon: IonIcon(
            shot['on'] == true ? 'checkbox' : 'square-outline',
            size: 20,
            color: shot['on'] == true ? _green : web.textSecondary,
          ),
          label: _s(shot['label']),
          onTap: () => _act('attach'),
        ),
    ];
  }

  Widget _voice(WebColors web, _M v) {
    final b = _map(v['button']);
    final level = _opt(v['level']);
    final levelText = _opt(v['levelText']);
    final play = _opt(v['play']);
    Widget note(Object? text, Color color, {bool bold = false, String? key}) => Text(
      _s(text),
      key: key == null ? null : ValueKey(key),
      style: TextStyle(fontSize: 12, fontWeight: bold ? FontWeight.w700 : FontWeight.w400, color: color),
    );
    return Column(
      key: const ValueKey('feedback-voice'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: 6,
      children: [
        _row(
          web,
          key: 'feedback-record',
          semantics: _s(b['a11y']),
          border: b['border'] == null ? null : cssColor(b['border'], web.border),
          icon: IonIcon(_s(b['icon']), size: 20, color: cssColor(b['iconColor'], web.textSecondary)),
          label: _s(b['label']),
          onTap: () => _act('record'),
          trailing: b['drop'] == true
              ? GestureDetector(
                  key: const ValueKey('feedback-drop'),
                  onTap: () => _act('drop'),
                  child: IonIcon('close-circle-outline', size: 19, color: web.textSecondary),
                )
              : null,
        ),
        if (level != null)
          Semantics(
            label: _s(level['a11y']),
            child: Container(
              key: const ValueKey('feedback-level'),
              height: 10,
              margin: const EdgeInsets.only(bottom: 2),
              clipBehavior: Clip.antiAlias,
              decoration: BoxDecoration(
                color: web.card,
                border: Border.all(color: web.border),
                borderRadius: BorderRadius.circular(5),
              ),
              alignment: AlignmentDirectional.centerStart,
              child: FractionallySizedBox(
                widthFactor: ((level['frac'] as num?) ?? 0).toDouble().clamp(0.0, 1.0),
                heightFactor: 1,
                child: DecoratedBox(
                  decoration: BoxDecoration(color: cssColor(level['color'], _amber), borderRadius: BorderRadius.circular(5)),
                ),
              ),
            ),
          ),
        if (v['nativeRec'] != null) note(v['nativeRec'], web.textSecondary, bold: true),
        if (levelText != null) note(levelText['text'], cssColor(levelText['color'], _amber), bold: true, key: 'feedback-level-text'),
        if (v['ceiling'] != null) note(v['ceiling'], _amber, bold: true),
        if (play != null)
          _row(
            web,
            key: 'feedback-play',
            semantics: _s(play['label']),
            icon: IonIcon(play['playing'] == true ? 'pause-circle' : 'play-circle', size: 20, color: web.textSecondary),
            label: _s(play['label']),
            onTap: () => _act('play'),
          ),
        if (v['denied'] != null) note(v['denied'], web.textSecondary),
        if (v['silent'] != null) note(v['silent'], _amber, bold: true, key: 'feedback-silent'),
        if (v['check'] != null) note(v['check'], web.textSecondary),
      ],
    );
  }

  Widget _footer(BuildContext context, WebColors web, _M f) {
    final sending = f['sending'] == true;
    const spinner = SizedBox.square(dimension: 20, child: CircularProgressIndicator(strokeWidth: 2.5, color: _white));
    Widget body;
    if (f['mode'] == 'choice') {
      final keep = _map(f['keep']);
      final go = _map(f['go']);
      Widget btn(String key, Widget child, Color border, Color bg, VoidCallback? onTap) => Expanded(
        child: Semantics(
          button: true,
          child: GestureDetector(
            key: ValueKey(key),
            onTap: onTap,
            child: Container(
              constraints: const BoxConstraints(minHeight: 48),
              alignment: Alignment.center,
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 10),
              decoration: BoxDecoration(
                color: bg,
                border: Border.all(color: border, width: 1.5),
                borderRadius: BorderRadius.circular(12),
              ),
              child: child,
            ),
          ),
        ),
      );
      Text label(Object? text, Color color) => Text(
        _s(text),
        maxLines: 2,
        textAlign: TextAlign.center,
        style: TextStyle(fontWeight: FontWeight.w800, fontSize: 12.5, color: color),
      );
      body = Container(
        key: const ValueKey('feedback-choice'),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: web.card,
          border: Border.all(color: _amber, width: 1.5),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          spacing: 8,
          children: [
            Text(
              _s(f['title']),
              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: _amber),
            ),
            Text(
              _s(f['body']),
              style: TextStyle(fontSize: 12.5, height: 17 / 12.5, color: web.text),
            ),
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Row(
                spacing: 8,
                children: [
                  btn('feedback-keep', label(keep['label'], web.text), web.border, web.surface, () {
                    if (keep['action'] == 'focus') {
                      _focus.requestFocus();
                    } else {
                      _act(_s(keep['action']));
                    }
                  }),
                  btn(
                    'feedback-go',
                    sending ? spinner : label(go['label'], _white),
                    _amber,
                    _amber,
                    sending ? null : () => _act(_s(go['action'])),
                  ),
                ],
              ),
            ),
          ],
        ),
      );
    } else {
      final enabled = f['enabled'] == true && !sending;
      body = Semantics(
        button: true,
        enabled: enabled,
        child: GestureDetector(
          key: const ValueKey('feedback-send'),
          onTap: enabled ? () => _act('send') : null,
          child: Container(
            padding: const EdgeInsets.symmetric(vertical: 15),
            alignment: Alignment.center,
            decoration: BoxDecoration(color: f['enabled'] == true ? _red : web.border, borderRadius: BorderRadius.circular(12)),
            child: sending
                ? spinner
                : Text(
                    _s(f['label']),
                    style: const TextStyle(color: _white, fontWeight: FontWeight.w800, fontSize: 16, height: 19 / 16),
                  ),
          ),
        ),
      );
    }
    return Container(
      key: const ValueKey('feedback-footer'),
      padding: EdgeInsets.fromLTRB(
        20,
        10,
        20,
        16 + MediaQuery.viewPaddingOf(context).bottom * (MediaQuery.viewInsetsOf(context).bottom > 0 ? 0 : 1),
      ),
      decoration: BoxDecoration(
        border: Border(top: BorderSide(color: web.border, width: 0.5)),
      ),
      child: body,
    );
  }
}
