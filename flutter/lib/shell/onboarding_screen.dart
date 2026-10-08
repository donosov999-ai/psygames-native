import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'ion_icon.dart';
import 'screen_ui.dart';
import 'web_theme.dart';

/// ЗНАКОМСТВО `/onboarding` НА FLUTTER — ПЕРЕНОС `frontend/app/onboarding.tsx` (задача a8aa91e0,
/// правило 4e679f41).
///
/// Два вида, как у веба: ПОДБОР (первый запуск: три вопроса → три игры «под себя» и список игр
/// знакомства, «Пропустить» сверху и снизу) и ОБУЧЕНИЕ (`?tutorial=1`: слайды, точки, «Дальше»).
/// Подбор `pickGames`, отметки «знакомство пройдено», переходы и слайды считает веб под оболочкой;
/// сюда приходит модель, нажатия уходят действиями веба (`quiz`, `choose`, `skipPicker`, `main`,
/// `secondary`, `skip`).
class OnboardingScreen extends StatelessWidget {
  const OnboardingScreen({super.key, required this.origin});

  static const route = '/onboarding';

  /// Сервер раздачи сборки — картинки игр по адресу из модели.
  final String origin;

  static const _violet = Color(0xFF7C3AED);

  void _act(String a, [List<Object?> args = const []]) => ScreenUi.act(route, a, args);

  @override
  Widget build(BuildContext context) {
    final web = WebTheme.of(context);
    return ValueListenableBuilder<Map<String, Object?>?>(
      valueListenable: ScreenUi.model(route),
      builder: (context, m, _) {
        final mode = m?['mode'];
        final Widget body;
        if (mode == 'picker') {
          body = _picker(context, m!);
        } else if (mode == 'tutorial') {
          body = _tutorial(context, m!);
        } else {
          body = Center(
            child: CircularProgressIndicator(
              key: const ValueKey('onboarding-loading'),
              color: cssColor(m?['primary'], Theme.of(context).colorScheme.primary),
            ),
          );
        }
        return Material(
          key: const ValueKey('onboarding-screen'),
          color: web.background,
          child: WebTheme.textDefaults(context, SafeArea(child: body)),
        );
      },
    );
  }

  // ── Подбор ────────────────────────────────────────────────────────────────────────────────────

  Widget _picker(BuildContext context, Map<String, Object?> m) {
    final web = WebTheme.of(context);
    final busy = m['busy'] == true;
    final heading = _map(m['heading']);
    final quiz = _map(m['quiz']);
    final yours = _map(quiz['yours']);
    final hair = BorderSide(color: web.border, width: 0.5);
    return Column(
      children: [
        // Выход закреплён сверху (отчёт Дениса 03.09) — не прокручивается и не пропадает.
        // По ширине содержимого и по центру: у веба экран `alignItems: center`, полоса не тянется.
        Center(
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(border: Border(bottom: hair)),
            child: Semantics(
              button: true,
              label: _s(m['exit']),
              excludeSemantics: true,
              child: GestureDetector(
                key: const ValueKey('onboarding-exit'),
                behavior: HitTestBehavior.opaque,
                onTap: busy ? null : () => _act('skipPicker'),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(minHeight: 48, minWidth: 48),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        IonIcon('arrow-back', size: 20, color: web.text),
                        const SizedBox(width: 6),
                        Text(
                          _s(m['exit']),
                          style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: web.text),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
        Expanded(
          child: LayoutBuilder(
            builder: (context, box) {
              final w = math.min(box.maxWidth - 32, 480.0);
              return ListView(
                key: const ValueKey('onboarding-list'),
                padding: EdgeInsets.fromLTRB((box.maxWidth - w) / 2, 24, (box.maxWidth - w) / 2, 32),
                children: [
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    child: Column(
                      children: [
                        Text(_s(heading['emoji']), style: const TextStyle(fontSize: 42)),
                        const SizedBox(height: 8),
                        Text(
                          _s(heading['title']),
                          textAlign: TextAlign.center,
                          style: TextStyle(fontSize: 27, height: 32 / 27, fontWeight: FontWeight.w900, color: web.text),
                        ),
                        const SizedBox(height: 8),
                        ConstrainedBox(
                          constraints: const BoxConstraints(maxWidth: 390),
                          child: Text(
                            _s(heading['body']),
                            textAlign: TextAlign.center,
                            style: TextStyle(fontSize: 15, height: 21 / 15, color: web.textSecondary),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 18),
                  Container(
                    key: const ValueKey('onboarding-quiz'),
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: web.surface,
                      border: Border.all(color: web.border),
                      borderRadius: BorderRadius.circular(19),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text(
                          _s(quiz['title']),
                          textAlign: TextAlign.center,
                          style: TextStyle(fontSize: 17, fontWeight: FontWeight.w900, color: web.text),
                        ),
                        const SizedBox(height: 2 + 8),
                        for (final q in _list(quiz['questions'])) ...[
                          Text(
                            _s(q['q']),
                            style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: web.textSecondary),
                          ),
                          const SizedBox(height: 6),
                          Wrap(
                            spacing: 7,
                            runSpacing: 7,
                            children: [
                              for (final (i, o) in _list(q['opts']).indexed)
                                Semantics(
                                  button: true,
                                  selected: o['on'] == true,
                                  child: GestureDetector(
                                    key: ValueKey('onboarding-quiz-${q['axis']}-$i'),
                                    onTap: busy ? null : () => _act('quiz', [q['axis'], i]),
                                    child: Container(
                                      constraints: const BoxConstraints(minHeight: 44),
                                      padding: const EdgeInsets.symmetric(horizontal: 13),
                                      decoration: BoxDecoration(
                                        color: o['on'] == true ? _violet : web.background,
                                        border: Border.all(color: o['on'] == true ? _violet : web.border),
                                        borderRadius: BorderRadius.circular(12),
                                      ),
                                      child: Column(
                                        mainAxisSize: MainAxisSize.min,
                                        mainAxisAlignment: MainAxisAlignment.center,
                                        children: [
                                          Text(
                                            _s(o['label']),
                                            style: TextStyle(
                                              fontSize: 13.5,
                                              fontWeight: FontWeight.w700,
                                              color: o['on'] == true ? Colors.white : web.text,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ),
                                ),
                            ],
                          ),
                          const SizedBox(height: 6 + 8),
                        ],
                        if (yours.isNotEmpty) ...[
                          const SizedBox(height: 6),
                          Text(
                            _s(yours['title']),
                            textAlign: TextAlign.center,
                            style: TextStyle(fontSize: 15, fontWeight: FontWeight.w900, color: web.text),
                          ),
                          const SizedBox(height: 8),
                          _cards(context, _list(yours['cards']), busy, 'yours'),
                          if (yours['profile'] != null) ...[
                            const SizedBox(height: 8),
                            Text(
                              _s(yours['profile']),
                              textAlign: TextAlign.center,
                              style: TextStyle(fontSize: 12.5, color: web.textSecondary),
                            ),
                          ],
                        ],
                      ],
                    ),
                  ),
                  const SizedBox(height: 18),
                  Text(
                    _s(m['or']).toUpperCase(),
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, letterSpacing: 0.5, color: web.textSecondary),
                  ),
                  const SizedBox(height: 18),
                  _cards(context, _list(m['cards']), busy, 'all'),
                  const SizedBox(height: 18),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 20),
                    child: Text(
                      _s(m['hint']),
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 12, height: 17 / 12, color: web.textSecondary),
                    ),
                  ),
                ],
              );
            },
          ),
        ),
        // «Пропустить» прибито к низу экрана (отчёт 8f6557d8): второй, крупный выход у большого пальца.
        // Полоса — во всю ширину, кнопка — шириной колонки карточек, как у веба после 07.10: по ширине
        // слова «Skip» была уже своей высоты 48 — вертикальная капсула (эмулятор, 2.56.15 EN).
        LayoutBuilder(
          builder: (context, box) => Container(
            width: box.maxWidth,
            alignment: Alignment.center,
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
            decoration: BoxDecoration(
              color: web.background,
              border: Border(top: hair),
            ),
            child: GestureDetector(
              key: const ValueKey('onboarding-skip-footer'),
              onTap: busy ? null : () => _act('skipPicker'),
              child: Container(
                width: math.min(box.maxWidth - 32, 480.0),
                height: 48,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: web.surface,
                  border: Border.all(color: web.border),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Text(
                  _s(m['exit']),
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: web.text),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _cards(BuildContext context, List<Map<String, Object?>> cards, bool busy, String group) => Column(
    children: [
      for (final (i, c) in cards.indexed) ...[if (i > 0) const SizedBox(height: 11), _card(context, c, busy, group)],
    ],
  );

  /// Карточка игры знакомства — `renderGameCard` веба: градиент сверху вниз, картинка игры 24 %,
  /// тень, значок в стеклянной плашке, имя/навык/описание, шеврон.
  Widget _card(BuildContext context, Map<String, Object?> c, bool busy, String group) {
    final grad = [for (final x in (c['gradient'] as List? ?? const [])) cssColor(x)];
    final thumb = c['thumb'] as String?;
    final rtl = Directionality.of(context) == TextDirection.rtl;
    return Semantics(
      button: true,
      label: _s(c['a11y']),
      excludeSemantics: true,
      container: true,
      child: GestureDetector(
        key: ValueKey('onboarding-card-$group-${c['id']}'),
        onTap: busy ? null : () => _act('choose', [c['id']]),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(19),
          child: SizedBox(
            height: 118,
            child: Stack(
              fit: StackFit.expand,
              children: [
                DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: grad.length >= 2
                        ? LinearGradient(colors: grad, begin: Alignment.topCenter, end: Alignment.bottomCenter)
                        : null,
                  ),
                ),
                if (thumb != null)
                  Opacity(
                    opacity: 0.24,
                    child: Image.network(
                      thumb.startsWith('http') ? thumb : '$origin$thumb',
                      fit: BoxFit.cover,
                      errorBuilder: (_, _, _) => const SizedBox.shrink(),
                    ),
                  ),
                const ColoredBox(color: Color(0x3D0A1024)),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: Row(
                    children: [
                      Container(
                        width: 48,
                        height: 48,
                        decoration: BoxDecoration(
                          color: const Color(0x38FFFFFF),
                          border: Border.all(color: const Color(0x66FFFFFF)),
                          borderRadius: BorderRadius.circular(15),
                        ),
                        child: Center(child: IonIcon(_s(c['icon']), size: 25, color: Colors.white)),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              _s(c['name']),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w900),
                            ),
                            const SizedBox(height: 3),
                            Text(
                              _s(c['skill']),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(color: Color(0xEBFFFFFF), fontSize: 12, fontWeight: FontWeight.w800),
                            ),
                            const SizedBox(height: 3),
                            Text(
                              _s(c['desc']),
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(color: Color(0xDBFFFFFF), fontSize: 12, height: 16 / 12),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 12),
                      IonIcon(rtl ? 'chevron-back' : 'chevron-forward', size: 25, color: Colors.white),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  // ── Обучение ──────────────────────────────────────────────────────────────────────────────────

  Widget _tutorial(BuildContext context, Map<String, Object?> m) {
    final web = WebTheme.of(context);
    final busy = m['busy'] == true;
    final slide = _map(m['slide']);
    final grad = [for (final x in (slide['gradient'] as List? ?? const [])) cssColor(x)];
    final dots = _map(m['dots']);
    final main = _map(m['main']);
    return LayoutBuilder(
      builder: (context, box) {
        final w = math.min(box.maxWidth - 32, 480.0);
        return Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              SizedBox(
                width: w,
                child: Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        _s(m['counter']),
                        key: const ValueKey('onboarding-counter'),
                        style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: web.textSecondary),
                      ),
                      if (m['skip'] != null)
                        GestureDetector(
                          key: const ValueKey('onboarding-skip'),
                          onTap: () => _act('skip'),
                          child: Text(
                            _s(m['skip']),
                            style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: web.textSecondary),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
              Container(
                key: const ValueKey('onboarding-slide'),
                width: w,
                margin: const EdgeInsets.only(top: 24),
                padding: const EdgeInsets.all(32),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(24),
                  gradient: grad.length >= 2 ? LinearGradient(colors: grad, begin: Alignment.topLeft, end: Alignment.bottomRight) : null,
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(_s(slide['emoji']), style: const TextStyle(fontSize: 80)),
                    const SizedBox(height: 16),
                    Text(
                      _s(slide['title']),
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: Colors.white, fontSize: 26, fontWeight: FontWeight.w900, letterSpacing: 1),
                    ),
                    const SizedBox(height: 16),
                    Text(
                      _s(slide['body']),
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: Color(0xF2FFFFFF), fontSize: 15, height: 22 / 15),
                    ),
                    if (slide['finalHint'] != null) ...[
                      const SizedBox(height: 16),
                      Text(
                        _s(slide['finalHint']),
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: Color(0xE6FFFFFF), fontSize: 13, fontWeight: FontWeight.w700),
                      ),
                    ],
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 24),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    for (var i = 0; i < ((dots['count'] as num?)?.toInt() ?? 0); i++) ...[
                      if (i > 0) const SizedBox(width: 6),
                      Container(
                        width: i == dots['active'] ? 24 : 8,
                        height: 8,
                        decoration: BoxDecoration(
                          color: i == dots['active'] ? const Color(0xFFFBBF24) : web.border,
                          borderRadius: BorderRadius.circular(4),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              SizedBox(
                width: w,
                child: Padding(
                  padding: const EdgeInsets.only(bottom: 16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      GestureDetector(
                        key: const ValueKey('onboarding-main'),
                        onTap: busy ? null : () => _act('main'),
                        child: Container(
                          constraints: const BoxConstraints(minHeight: 48),
                          padding: const EdgeInsets.symmetric(vertical: 18),
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(16),
                            gradient: grad.length >= 2
                                ? LinearGradient(colors: grad, begin: Alignment.topCenter, end: Alignment.bottomCenter)
                                : null,
                          ),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Flexible(
                                child: Text(
                                  _s(main['label']),
                                  style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w900, letterSpacing: 2),
                                ),
                              ),
                              const SizedBox(width: 8),
                              IonIcon(_s(main['icon']), size: 18, color: Colors.white),
                            ],
                          ),
                        ),
                      ),
                      if (m['secondary'] != null)
                        GestureDetector(
                          key: const ValueKey('onboarding-secondary'),
                          onTap: busy ? null : () => _act('secondary'),
                          child: Padding(
                            padding: const EdgeInsets.symmetric(vertical: 12),
                            child: Text(
                              _s(m['secondary']),
                              textAlign: TextAlign.center,
                              style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: web.textSecondary),
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

Map<String, Object?> _map(Object? v) => v is Map ? Map<String, Object?>.from(v) : const {};
List<Map<String, Object?>> _list(Object? v) => v is List ? [for (final x in v) _map(x)] : const [];
String _s(Object? v) => v == null ? '' : '$v';
