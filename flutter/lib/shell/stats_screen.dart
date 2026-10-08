import 'dart:async';

import 'package:flutter/material.dart';

import 'feedback_fab.dart' show FabRules;
import 'ion_icon.dart';
import 'screen_ui.dart';
import 'shared_state.dart';
import 'stats_model.dart';
import 'training_history.dart' show Wall, deviceWall;
import 'web_theme.dart';

/// «ПРОГРЕСС» `/statistics` НА FLUTTER — ПЕРЕНОС `frontend/app/statistics.tsx` (задача 6ff4a966, правило 4e679f41).
///
/// Рисунок — веба (числа — из `styles` и разметки экрана), данные — МОДЕЛЬ веба
/// (`statsModel` в `app/statistics.tsx` → [ScreenUi]): итоги, баланс по областям, история по дням и ИИ-дайджест
/// считает веб-экран, стоящий под оболочкой. Здесь нет ни одного расчёта. Вкладки «Сводка» и
/// «История» переключаются здесь (обе части — в модели, как у веба на одной загрузке); охват
/// «профиль / все игры» меняет расчёт — действие веба `scope`; «Обновить» — `refresh`; «Назад» — `back`.
///
/// 🔴 ВАРИАНТ Б (задача d6a60b02): есть [state] — модель считается на Dart (`stats_model.dart`) и
/// пересчитывается по каждой записи в общую память (партия, очки, дайджест недели от веба); охват и
/// «Обновить» — здесь же. Нет — модель и действия у веба, как раньше.
class StatsScreen extends StatefulWidget {
  const StatsScreen({super.key, required this.onTab, this.state});

  static const route = '/statistics';

  final SharedState? state;

  /// Часы экрана (миг «сейчас» и перевод в местное время). Пробы подменяют.
  @visibleForTesting
  static int Function() now = () => DateTime.now().millisecondsSinceEpoch;
  @visibleForTesting
  static Wall wall = deviceWall;

  /// Переход на вкладку (пустая история зовёт сыграть — на Главную, как `router.replace('/')` веба).
  /// «Назад» шапки — действие веба `back` (`goBackOrHome`): куда возвращаться, знает история страницы.
  final ValueChanged<String> onTab;

  @override
  State<StatsScreen> createState() => _StatsScreenState();
}

typedef _M = Map<String, Object?>;
_M _map(Object? v) => v is Map ? Map<String, Object?>.from(v) : const {};
List<_M> _list(Object? v) => v is List ? [for (final x in v) _map(x)] : const [];
String _s(Object? v) => v == null ? '' : '$v';
double _d(Object? v, [double f = 0]) => v is num ? v.toDouble() : f;

class _StatsScreenState extends State<StatsScreen> {
  String _tab = 'summary';

  // ── Своя модель (вариант Б) ──
  StatsInputs? _in;

  /// Свой расчёт не удался (нет данных сборки, битое) — экран берёт модель страницы, как раньше:
  /// веб-расчёт лучше пустого экрана.
  bool _failed = false;
  bool _scopeAll = false;
  int _gen = 0;
  ({StatsInputs inp, bool all, String grey})? _memoKey;
  _M? _memo;

  /// Партия пишет десятки ключей подряд — перечитываем пачкой, раз в 200 мс.
  Timer? _debounce;

  @override
  void initState() {
    super.initState();
    widget.state?.addListener(_reload);
    // 🔴 Каждая запись в память, а не только смена профиля: после партии «Прогресс» обязан показать
    // её (замер 08.10: слушатель стоял только на профиль и тему — вкладка показывала старое).
    widget.state?.writes.addListener(_onWrite);
    _reload();
  }

  @override
  void dispose() {
    widget.state?.removeListener(_reload);
    widget.state?.writes.removeListener(_onWrite);
    _debounce?.cancel();
    super.dispose();
  }

  void _onWrite() {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 200), _reload);
  }

  /// Перечитать общую память: последнее чтение побеждает, устаревшее отбрасывается.
  void _reload() {
    final state = widget.state;
    if (state == null) return;
    final gen = ++_gen;
    statsInputsFor(state, now: StatsScreen.now(), wall: StatsScreen.wall).then(
      (v) {
        if (mounted && gen == _gen) setState(() => _in = v);
      },
      onError: (Object e) {
        debugPrint('StatsScreen: own model failed, using the page model ($e)');
        if (mounted && gen == _gen) setState(() => _failed = true);
      },
    );
  }

  _M? _own(WebColors web) {
    final inp = _in;
    if (inp == null) return null;
    final key = (inp: inp, all: _scopeAll, grey: cssUpper(web.textSecondary));
    if (_memoKey case final k? when identical(k.inp, inp) && k.all == key.all && k.grey == key.grey) return _memo;
    _memoKey = key;
    return _memo = statsModel(inp, scopeAll: _scopeAll, textSecondary: key.grey);
  }

  /// Охват и «Обновить» — свои (вариант Б); «Назад» и всё без своей модели — действия веба.
  bool get _own0 => widget.state != null && !_failed;

  void _act(String a, [List<Object?> args = const []]) {
    if (_own0 && a == 'scope') {
      setState(() => _scopeAll = args.isNotEmpty && args.first == true);
      return;
    }
    if (_own0 && a == 'refresh') {
      _reload();
      return;
    }
    ScreenUi.act(StatsScreen.route, a, args);
  }

  @override
  Widget build(BuildContext context) {
    if (_own0) return _page(context, _own(WebTheme.of(context)));
    return ValueListenableBuilder<_M?>(
      valueListenable: ScreenUi.model(StatsScreen.route),
      builder: (context, m, _) => _page(context, m),
    );
  }

  Widget _page(BuildContext context, _M? m) {
    final web = WebTheme.of(context);
    final accent = Theme.of(context).colorScheme.primary;
    if (m == null) {
      return ColoredBox(
        color: web.background,
        child: const Center(child: CircularProgressIndicator(key: ValueKey('stats-loading'))),
      );
    }
    final labels = _map(m['labels']);
    final scope = _map(m['scope']);
    final primary = cssColor(m['primary'], accent);
    return Material(
      key: const ValueKey('stats-screen'),
      color: web.background,
      child: WebTheme.textDefaults(
        context,
        SafeArea(
          bottom: false,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
                child: Row(
                  children: [
                    _round(
                      context,
                      'stats-back',
                      _s(labels['back']),
                      Directionality.of(context) == TextDirection.rtl ? 'arrow-forward' : 'arrow-back',
                      () => _act('back'),
                    ),
                    Expanded(
                      child: Text(
                        _s(m['title']),
                        textAlign: TextAlign.center,
                        style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: web.text),
                      ),
                    ),
                    _round(context, 'stats-refresh', _s(labels['refresh']), 'refresh', () => _act('refresh')),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 10),
                child: Row(
                  children: [
                    for (final (id, key) in [('summary', 'summary'), ('history', 'history')]) ...[
                      if (id == 'history') const SizedBox(width: 8),
                      Expanded(
                        child: Semantics(
                          selected: _tab == id,
                          button: true,
                          child: GestureDetector(
                            key: ValueKey('stats-tab-$id'),
                            behavior: HitTestBehavior.opaque,
                            onTap: () => setState(() => _tab = id),
                            child: Container(
                              constraints: const BoxConstraints(minHeight: 48),
                              alignment: Alignment.center,
                              decoration: BoxDecoration(
                                border: Border(bottom: BorderSide(color: _tab == id ? primary : Colors.transparent, width: 3)),
                              ),
                              child: Text(
                                _s(labels[key]),
                                style: TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w800,
                                  color: _tab == id ? primary : web.textSecondary,
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 10),
                child: Row(
                  children: [
                    Expanded(
                      child: _scope(
                        context,
                        'stats-scope-profile',
                        _s(scope['profile']),
                        scope['isAll'] != true,
                        primary,
                        () => _act('scope', [false]),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: _scope(
                        context,
                        'stats-scope-all',
                        _s(scope['all']),
                        scope['isAll'] == true,
                        primary,
                        () => _act('scope', [true]),
                      ),
                    ),
                  ],
                ),
              ),
              if (m['totalPlayed'] != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: Text(
                    _s(m['totalPlayed']),
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 12, color: web.textSecondary),
                  ),
                ),
              Expanded(
                child: m['loading'] == true
                    ? Center(child: CircularProgressIndicator(color: primary))
                    : _tab == 'summary'
                    ? _Summary(m: m, primary: primary)
                    : _History(m: m, primary: primary, act: _act, onTab: widget.onTab),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _round(BuildContext context, String key, String label, String ion, VoidCallback onTap) {
    final web = WebTheme.of(context);
    return Semantics(
      button: true,
      label: label,
      child: GestureDetector(
        key: ValueKey(key),
        onTap: onTap,
        child: Container(
          width: 48,
          height: 48,
          decoration: BoxDecoration(color: web.surface, shape: BoxShape.circle),
          child: Center(child: IonIcon(ion, size: 24, color: web.text)),
        ),
      ),
    );
  }

  Widget _scope(BuildContext context, String key, String text, bool on, Color primary, VoidCallback onTap) {
    final web = WebTheme.of(context);
    return GestureDetector(
      key: ValueKey(key),
      behavior: HitTestBehavior.opaque,
      onTap: onTap,
      child: Container(
        constraints: const BoxConstraints(minHeight: 48),
        alignment: Alignment.center,
        padding: const EdgeInsets.symmetric(vertical: 8),
        decoration: BoxDecoration(
          color: on ? primary : web.surface,
          border: Border.all(color: on ? primary : web.border),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Text(
          text,
          style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: on ? Colors.white : web.text),
        ),
      ),
    );
  }
}

EdgeInsets _scrollPad() => EdgeInsets.fromLTRB(20, 0, 20, FabRules.clearance);

class _Summary extends StatelessWidget {
  const _Summary({required this.m, required this.primary});
  final _M m;
  final Color primary;

  @override
  Widget build(BuildContext context) {
    final web = WebTheme.of(context);
    final hero = _map(m['hero']);
    final areas = _map(m['areas']);
    final ai = _map(m['ai']);
    const white85 = Color(0xD9FFFFFF);
    Widget metric(String emoji, String value, String label) => Column(
      children: [
        Text(emoji, style: const TextStyle(fontSize: 20)),
        Text(
          value,
          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 18),
        ),
        Text(label, style: const TextStyle(color: white85, fontSize: 11)),
      ],
    );
    return ListView(
      key: const ValueKey('stats-summary'),
      padding: _scrollPad(),
      children: [
        Container(
          key: const ValueKey('stats-hero'),
          margin: const EdgeInsets.only(bottom: 14),
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(18),
            gradient: LinearGradient(colors: [primary, primary.withAlpha(0xBB)], begin: Alignment.topLeft, end: Alignment.bottomRight),
          ),
          child: Column(
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceAround,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  metric('⭐', '${hero['tokens']}', _s(hero['tokensLabel'])),
                  Flexible(
                    child: Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Column(
                        children: [
                          Text(
                            _s(hero['level']),
                            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 22),
                          ),
                          Text(
                            _s(hero['levelTitle']),
                            maxLines: 2,
                            textAlign: TextAlign.center,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(color: Color(0xE6FFFFFF), fontSize: 12, fontWeight: FontWeight.w700),
                          ),
                        ],
                      ),
                    ),
                  ),
                  metric('🔥', '${hero['streak']}', _s(hero['streakLabel'])),
                ],
              ),
              if (hero['progress'] is num)
                Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(3),
                    child: SizedBox(
                      height: 6,
                      child: Stack(
                        fit: StackFit.expand,
                        children: [
                          const ColoredBox(color: Color(0x40FFFFFF)),
                          FractionallySizedBox(
                            alignment: Alignment.centerLeft,
                            widthFactor: _d(hero['progress']).clamp(0, 1),
                            child: const ColoredBox(color: Colors.white),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              const SizedBox(height: 12),
              // Две подписи в ряд, как у веба; длинная (крупный шрифт, немецкий) переносится, а не вылезает за карточку.
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceAround,
                children: [
                  for (final k in ['games', 'time'])
                    Flexible(
                      child: Text(
                        _s(hero[k]),
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w700),
                      ),
                    ),
                ],
              ),
            ],
          ),
        ),
        if (areas.isNotEmpty)
          Padding(
            key: const ValueKey('stats-areas'),
            padding: const EdgeInsets.only(bottom: 14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  _s(areas['title']),
                  style: TextStyle(color: web.text, fontSize: 16, fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 4),
                Text(
                  _s(areas['hint']),
                  style: TextStyle(color: web.textSecondary, fontSize: 12.5, height: 18 / 12.5),
                ),
                const SizedBox(height: 10),
                for (final a in _list(areas['rows']))
                  // Строку читают одной фразой, как `accessibilityLabel` веба: подпись заменяет текст внутри.
                  Semantics(
                    label: _s(a['a11y']),
                    excludeSemantics: true,
                    container: true,
                    child: Padding(
                      padding: const EdgeInsets.only(bottom: 9),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Row(
                            children: [
                              Expanded(
                                child: Text(
                                  _s(a['label']),
                                  style: TextStyle(color: web.text, fontSize: 13.5, fontWeight: FontWeight.w700),
                                ),
                              ),
                              Text(
                                _s(a['text']),
                                style: TextStyle(
                                  color: web.textSecondary,
                                  fontSize: 13,
                                  fontFeatures: const [FontFeature.tabularFigures()],
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 3),
                          ClipRRect(
                            borderRadius: BorderRadius.circular(4),
                            child: SizedBox(
                              height: 8,
                              child: Stack(
                                fit: StackFit.expand,
                                children: [
                                  ColoredBox(color: web.border),
                                  FractionallySizedBox(
                                    alignment: Alignment.centerLeft,
                                    widthFactor: (_d(a['pct']) / 100).clamp(0, 1),
                                    child: ColoredBox(color: primary),
                                  ),
                                ],
                              ),
                            ),
                          ),
                          if (_map(a['trend']).isNotEmpty)
                            Padding(
                              padding: const EdgeInsets.only(top: 2),
                              child: Text(
                                _s(_map(a['trend'])['text']),
                                style: TextStyle(
                                  fontSize: 11.5,
                                  color: _map(a['trend'])['up'] == true ? const Color(0xFF1F6B4A) : const Color(0xFF9E2B2B),
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                if (areas['weak'] != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text(_s(areas['weak']), style: TextStyle(color: web.textSecondary, fontSize: 12.5)),
                  ),
              ],
            ),
          ),
        if (ai.isNotEmpty)
          Container(
            key: const ValueKey('stats-ai'),
            margin: const EdgeInsets.only(bottom: 14),
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: web.surface,
              border: Border.all(color: primary, width: 1.5),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _s(ai['title']),
                  style: TextStyle(color: primary, fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 1),
                ),
                const SizedBox(height: 6),
                Text(
                  _s(ai['text']),
                  style: TextStyle(color: web.text, fontSize: 14, height: 21 / 14),
                ),
              ],
            ),
          ),
        for (final g in _list(m['games'])) _GameCard(g: g),
        if (m['empty'] != null)
          Padding(
            key: const ValueKey('stats-empty'),
            padding: const EdgeInsets.only(top: 60, bottom: 16),
            child: Column(
              children: [
                IonIcon('bar-chart-outline', size: 64, color: web.textSecondary),
                Text(
                  _s(m['empty']),
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 16, color: web.textSecondary),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

class _GameCard extends StatelessWidget {
  const _GameCard({required this.g});
  final _M g;

  @override
  Widget build(BuildContext context) {
    final web = WebTheme.of(context);
    final grad = [for (final c in (g['gradient'] as List? ?? const [])) cssColor(c)];
    final spark = _map(g['spark']);
    return ClipRRect(
      key: ValueKey('stats-game-${g['id']}'),
      borderRadius: BorderRadius.circular(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(gradient: grad.length >= 2 ? LinearGradient(colors: grad) : null),
            child: Row(
              children: [
                IonIcon(_s(g['icon']), size: 24, color: Colors.white),
                Flexible(
                  child: Text(
                    _s(g['name']),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: Colors.white),
                  ),
                ),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.all(16),
            color: web.surface,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  // Колонки сверху, как у веба (`statRow` — ряд с растяжением): подпись в две строки не сдвигает соседей вниз.
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    for (final r in _list(g['stats']))
                      Expanded(
                        child: Column(
                          children: [
                            Text(_s(r['label']), style: TextStyle(fontSize: 12, color: web.textSecondary)),
                            const SizedBox(height: 4),
                            Text(
                              _s(r['value']),
                              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: web.text),
                            ),
                          ],
                        ),
                      ),
                  ],
                ),
                if (spark.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  Text(_s(spark['caption']), style: TextStyle(fontSize: 12, color: web.textSecondary)),
                  const SizedBox(height: 6),
                  SizedBox(
                    height: 26,
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        for (final (i, b) in _list(spark['bars']).indexed) ...[
                          if (i > 0) const SizedBox(width: 2),
                          Expanded(
                            child: Opacity(
                              opacity: _d(b['op'], 1).clamp(0, 1),
                              child: Container(
                                height: _d(b['h'], 5),
                                decoration: BoxDecoration(color: cssColor(spark['color']), borderRadius: BorderRadius.circular(2)),
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                  const SizedBox(height: 2),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(_s(spark['older']), style: TextStyle(fontSize: 10, color: web.textSecondary)),
                      Flexible(
                        child: Text(
                          _s(spark['numbers']),
                          textAlign: TextAlign.center,
                          style: TextStyle(fontSize: 10, color: web.textSecondary),
                        ),
                      ),
                      Text(_s(spark['newer']), style: TextStyle(fontSize: 10, color: web.textSecondary)),
                    ],
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _History extends StatelessWidget {
  const _History({required this.m, required this.primary, required this.act, required this.onTab});
  final _M m;
  final Color primary;
  final void Function(String, [List<Object?>]) act;
  final ValueChanged<String> onTab;

  @override
  Widget build(BuildContext context) {
    final web = WebTheme.of(context);
    final h = _map(m['history']);
    if (h['kind'] != 'days') {
      return ListView(
        key: const ValueKey('stats-history'),
        padding: _scrollPad(),
        children: [
          Padding(
            key: ValueKey('stats-history-${h['kind']}'),
            padding: const EdgeInsets.only(top: 60, bottom: 16),
            child: Column(
              children: [
                IonIcon(_s(h['icon']), size: 64, color: web.textSecondary),
                const SizedBox(height: 12),
                Text(
                  _s(h['title']),
                  textAlign: TextAlign.center,
                  style: TextStyle(color: web.text, fontSize: 17, fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 8),
                Text(
                  _s(h['hint']),
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 16, color: web.textSecondary),
                ),
                const SizedBox(height: 18),
                GestureDetector(
                  key: const ValueKey('stats-history-cta'),
                  onTap: () => h['action'] == 'scopeAll' ? act('scope', [true]) : onTab('/'),
                  child: Container(
                    constraints: const BoxConstraints(minHeight: 48),
                    alignment: Alignment.center,
                    padding: const EdgeInsets.symmetric(horizontal: 22),
                    decoration: BoxDecoration(color: primary, borderRadius: BorderRadius.circular(12)),
                    child: Text(
                      _s(h['cta']),
                      style: const TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w800),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      );
    }
    return ListView(
      key: const ValueKey('stats-history'),
      padding: _scrollPad(),
      children: [
        for (final day in _list(h['days']))
          Padding(
            padding: const EdgeInsets.only(bottom: 18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  _s(day['label']),
                  style: TextStyle(color: web.text, fontSize: 15, fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 8),
                for (final e in _list(day['entries']))
                  Semantics(
                    label: _s(e['label']),
                    excludeSemantics: true,
                    container: true,
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 9),
                      decoration: BoxDecoration(
                        border: Border(bottom: BorderSide(color: web.border)),
                      ),
                      child: Row(
                        children: [
                          Container(
                            width: 34,
                            height: 34,
                            decoration: BoxDecoration(color: cssColor(e['color']), borderRadius: BorderRadius.circular(10)),
                            child: Center(child: IonIcon(_s(e['icon']), size: 18, color: Colors.white)),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  _s(e['name']),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(color: web.text, fontSize: 14, fontWeight: FontWeight.w700),
                                ),
                                const SizedBox(height: 1),
                                Row(
                                  children: [
                                    Flexible(
                                      child: Text(
                                        _s(e['verdict']),
                                        style: TextStyle(color: cssColor(e['verdictColor'], web.textSecondary), fontSize: 12),
                                      ),
                                    ),
                                    if (e['level'] != null) ...[
                                      const SizedBox(width: 6),
                                      Text('· ${e['level']}', style: TextStyle(color: web.textSecondary, fontSize: 11)),
                                    ],
                                  ],
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 10),
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              Text(
                                _s(e['value']),
                                style: TextStyle(
                                  color: web.text,
                                  fontSize: 15,
                                  fontWeight: FontWeight.w800,
                                  fontFeatures: const [FontFeature.tabularFigures()],
                                ),
                              ),
                              Text(_s(e['time']), style: TextStyle(color: web.textSecondary, fontSize: 11)),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          ),
        if (h['tail'] != null)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(
              _s(h['tail']),
              textAlign: TextAlign.center,
              style: TextStyle(color: web.textSecondary, fontSize: 12),
            ),
          ),
      ],
    );
  }
}
