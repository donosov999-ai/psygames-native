import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import 'ionicons.g.dart';
import 'profiles.dart';
import 'screen_ui.dart';
import 'shared_state.dart';
import 'switcher_model.dart';
import 'web_theme.dart';

/// ПЕРЕКЛЮЧАТЕЛЬ ПРОФИЛЕЙ НА FLUTTER — ПЕРЕНОС `frontend/src/components/ProfileSwitcherModal.tsx` (5b3513bd).
///
/// Чип профиля нативной Главной открывает этот лист: снизу со скруглением 24, сетка карточек в треть
/// ширины — рисунок веба.
///
/// 🔴 МОДЕЛЬ СЧИТАЕТ DART (задача d6a60b02, вариант Б, `switcher_model.dart`): профили в порядке файла
/// состава, кошельки и подписи — из общей памяти, на каждую запись — заново; лист не ждёт страницу.
/// Переключение — действие веба (`switch`). Без общей памяти или если своя модель не собралась — лист
/// рисует модель страницы (`#switcher`), как раньше.
///
/// 21.10.2026 (решение Дениса, d5e5814a): монетизации нет — замков, ярусов, окна кода и карточки закрытого
/// профиля больше нет, все профили открыты всем.
const _key = '#switcher';

typedef _M = Map<String, Object?>;
_M _map(Object? v) => v is Map ? Map<String, Object?>.from(v) : const {};
List<_M> _list(Object? v) => v is List ? [for (final x in v) _map(x)] : const [];
String _s(Object? v) => v == null ? '' : '$v';

/// Откуда лист берёт модель, пока он открыт: своя или страницы.
ValueListenable<_M?> _source = ScreenUi.model(_key);

/// [origin] — сервер раздачи: значки профилей в модели — адреса веб-сборки. [state] — общая память:
/// есть — модель своя.
Future<void> openProfileSwitcher(BuildContext context, String origin, {SharedState? state}) async {
  final feed = state == null ? null : SwitcherFeed(state);
  _source = feed ?? ScreenUi.model(_key);
  try {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      barrierColor: const Color(0xA6000000),
      builder: (ctx) => _SwitcherSheet(origin: origin),
    );
  } finally {
    _source = ScreenUi.model(_key);
    feed?.close();
  }
}

/// Своя модель листа (вариант Б): пересчёт на запись в общую память. Не собралась — модель страницы.
class SwitcherFeed extends ValueNotifier<Map<String, Object?>?> {
  SwitcherFeed(this.state) : super(null) {
    ScreenUi.model(_key).addListener(_refresh);
    state.writes.addListener(_onWrite);
    SwitcherData.load().then(
      (d) {
        _data = d;
        _refresh();
      },
      onError: (Object e) {
        debugPrint('SwitcherFeed: own model data failed, using the page model ($e)');
        _failed = true;
        _refresh();
      },
    );
  }

  final SharedState state;

  SwitcherData? _data;
  bool _failed = false, _closed = false;
  Timer? _debounce;

  void _onWrite() {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 200), _refresh);
  }

  Future<void> _refresh() async {
    if (_closed) return;
    final page = ScreenUi.model(_key).value;
    final d = _data;
    if (_failed) {
      value = page;
      return;
    }
    if (d == null) return;
    try {
      final ps = Profiles.current.list.isEmpty ? await Profiles.load() : Profiles.current;
      if (_closed) return;
      value = switcherModelFrom(state, d, profiles: ps);
    } catch (e) {
      debugPrint('SwitcherFeed: own model failed, using the page model ($e)');
      _failed = true;
      if (!_closed) value = page;
    }
  }

  void close() {
    _closed = true;
    _debounce?.cancel();
    ScreenUi.model(_key).removeListener(_refresh);
    state.writes.removeListener(_onWrite);
    dispose();
  }
}

class _SwitcherSheet extends StatelessWidget {
  const _SwitcherSheet({required this.origin});
  final String origin;

  @override
  Widget build(BuildContext context) {
    final web = WebTheme.of(context);
    return ValueListenableBuilder<_M?>(
      valueListenable: _source,
      builder: (context, m, _) {
        if (m == null) return const SizedBox(height: 200, child: Center(child: CircularProgressIndicator()));
        return ConstrainedBox(
          constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.88),
          child: Container(
            key: const ValueKey('switcher-sheet'),
            decoration: BoxDecoration(
              color: web.surface,
              borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
            ),
            child: SafeArea(
              top: false,
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 20),
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisSize: MainAxisSize.min, children: [
                  Row(children: [
                    Expanded(child: Text(_s(m['title']), style: TextStyle(fontSize: 19, fontWeight: FontWeight.w800, color: web.text))),
                    _close(context, _s(m['closeLabel'])),
                  ]),
                  const SizedBox(height: 8),
                  Text(_s(m['intro']), style: TextStyle(fontSize: 12, height: 16 / 12, color: web.textSecondary)),
                  const SizedBox(height: 10),
                  LayoutBuilder(builder: (context, box) {
                    final w = (box.maxWidth * 0.315).clamp(92.0, box.maxWidth);
                    return Wrap(spacing: 6, runSpacing: 6, children: [
                      for (final p in _list(m['profiles'])) SizedBox(width: w, child: _ProfileCard(p: p, origin: origin, m: m)),
                    ]);
                  }),
                ]),
              ),
            ),
          ),
        );
      },
    );
  }
}

Widget _close(BuildContext context, String label) => Semantics(
      button: true,
      label: label,
      child: GestureDetector(
        key: const ValueKey('switcher-close'),
        onTap: () => Navigator.of(context).pop(),
        child: Padding(
          padding: const EdgeInsets.all(4),
          child: Icon(Ion.of('close-circle'), size: 28, color: WebTheme.of(context).textSecondary),
        ),
      ),
    );

class _ProfileCard extends StatelessWidget {
  const _ProfileCard({required this.p, required this.origin, required this.m});
  final _M p;
  final String origin;
  final _M m;

  @override
  Widget build(BuildContext context) {
    final web = WebTheme.of(context);
    final active = p['active'] == true;
    final color = cssColor(p['color'], web.border);
    final badge = p['badge'];
    return GestureDetector(
        key: ValueKey('switcher-profile-${p['id']}'),
        behavior: HitTestBehavior.opaque,
        onTap: () {
          if (!active) ScreenUi.act(_key, 'switch', [p['id']]);
          Navigator.of(context).pop();
        },
        child: Container(
          padding: const EdgeInsets.all(9),
          decoration: BoxDecoration(
            color: active ? color : web.card,
            border: Border.all(color: active ? color : web.border, width: 2),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            if (badge != null)
              ClipRRect(
                borderRadius: BorderRadius.circular(13),
                child: Image.network(_s(badge).startsWith('http') ? _s(badge) : '$origin$badge',
                    width: 46, height: 46, fit: BoxFit.cover, errorBuilder: (_, _, _) => const SizedBox(width: 46, height: 46)),
              )
            else
              Text(_s(p['emoji']), style: const TextStyle(fontSize: 32)),
            const SizedBox(height: 4),
            Text(_s(p['name']), textAlign: TextAlign.center,
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: active ? Colors.black : web.text)),
            const SizedBox(height: 2),
            Text(_s(p['desc']), maxLines: 2, overflow: TextOverflow.ellipsis, textAlign: TextAlign.center,
                style: TextStyle(fontSize: 10, height: 13 / 10, color: active ? const Color(0xB3000000) : web.textSecondary)),
            if (p['minutes'] != null)
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Text(_s(p['minutes']),
                    style: TextStyle(fontSize: 9, fontFamily: 'monospace', color: active ? const Color(0x8C000000) : web.textSecondary)),
              ),
            if (p['wallet'] != null)
              Padding(
                padding: const EdgeInsets.only(top: 3),
                child: Text(_s(p['wallet']),
                    style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: active ? const Color(0xBF000000) : web.textSecondary)),
              ),
          ]),
        ),
    );
  }
}
