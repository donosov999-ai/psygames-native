import 'package:flutter/material.dart';

import 'ionicons.g.dart';
import 'screen_ui.dart';
import 'web_theme.dart';

/// ПЕРЕКЛЮЧАТЕЛЬ ПРОФИЛЕЙ НА FLUTTER — ПЕРЕНОС `frontend/src/components/ProfileSwitcherModal.tsx` (5b3513bd).
///
/// Чип профиля нативной Главной открывает этот лист. Что показать и что можно — у веба: компонент
/// смонтирован на Главной под оболочкой и отдаёт модель `#switcher` (профили с доступом, кошельками и
/// подписями, карточки закрытых, окно кода). Здесь только рисунок веба: лист снизу со скруглением 24,
/// сетка карточек в треть ширины, карточка закрытого профиля и окно ввода кода. Переключение и код —
/// действия веба (`switch`, `redeem`): составы режимов и история остаются там, где живут.
const _key = '#switcher';

typedef _M = Map<String, Object?>;
_M _map(Object? v) => v is Map ? Map<String, Object?>.from(v) : const {};
List<_M> _list(Object? v) => v is List ? [for (final x in v) _map(x)] : const [];
String _s(Object? v) => v == null ? '' : '$v';

/// [origin] — сервер раздачи: значки профилей в модели — адреса веб-сборки.
Future<void> openProfileSwitcher(BuildContext context, String origin) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    barrierColor: const Color(0xA6000000),
    builder: (ctx) => _SwitcherSheet(origin: origin),
  );
}

class _SwitcherSheet extends StatelessWidget {
  const _SwitcherSheet({required this.origin});
  final String origin;

  @override
  Widget build(BuildContext context) {
    final web = WebTheme.of(context);
    return ValueListenableBuilder<_M?>(
      valueListenable: ScreenUi.model(_key),
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
                  if (m['codeEntry'] == true)
                    Padding(
                      padding: const EdgeInsets.only(top: 14),
                      child: _outlined(context, _s(m['codeButton']), () => _openCode(context), const ValueKey('switcher-code')),
                    ),
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

Widget _outlined(BuildContext context, String text, VoidCallback onTap, Key key, {double border = 1}) {
  final web = WebTheme.of(context);
  return GestureDetector(
    key: key,
    onTap: onTap,
    child: Container(
      padding: const EdgeInsets.symmetric(vertical: 12),
      alignment: Alignment.center,
      decoration: BoxDecoration(border: Border.all(color: web.border, width: border), borderRadius: BorderRadius.circular(10)),
      child: Text(text, style: TextStyle(color: web.text, fontWeight: FontWeight.w700, fontSize: 13)),
    ),
  );
}

class _ProfileCard extends StatelessWidget {
  const _ProfileCard({required this.p, required this.origin, required this.m});
  final _M p;
  final String origin;
  final _M m;

  @override
  Widget build(BuildContext context) {
    final web = WebTheme.of(context);
    final active = p['active'] == true;
    final locked = p['locked'] == true;
    final color = cssColor(p['color'], web.border);
    final tier = _map(p['tier']);
    final badge = p['badge'];
    return Opacity(
      opacity: locked ? 0.65 : 1,
      child: GestureDetector(
        key: ValueKey('switcher-profile-${p['id']}'),
        behavior: HitTestBehavior.opaque,
        onTap: () {
          if (active) {
            Navigator.of(context).pop();
          } else if (locked) {
            _openDetail(context, _s(p['id']), origin);
          } else {
            ScreenUi.act(_key, 'switch', [p['id']]);
            Navigator.of(context).pop();
          }
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
              Stack(clipBehavior: Clip.none, children: [
                Opacity(
                  opacity: locked ? 0.5 : 1,
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(13),
                    child: Image.network(_s(badge).startsWith('http') ? _s(badge) : '$origin$badge',
                        width: 46, height: 46, fit: BoxFit.cover, errorBuilder: (_, _, _) => const SizedBox(width: 46, height: 46)),
                  ),
                ),
                if (locked) const Positioned(right: -3, bottom: -3, child: Text('🔒', style: TextStyle(fontSize: 15))),
              ])
            else
              Text('${p['emoji']}${locked ? '🔒' : ''}', style: const TextStyle(fontSize: 32)),
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
            if (tier.isNotEmpty)
              Container(
                margin: const EdgeInsets.only(top: 6),
                padding: const EdgeInsets.symmetric(vertical: 3, horizontal: 8),
                decoration: BoxDecoration(color: cssColor(tier['bg']), borderRadius: BorderRadius.circular(100)),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  Icon(Ion.of(tier['kind'] == 'trial' ? 'lock-open' : 'lock-closed'), size: 10, color: cssColor(tier['fg'], Colors.white)),
                  const SizedBox(width: 4),
                  Flexible(
                    child: Text(_s(tier['text']),
                        style: TextStyle(fontSize: 10, fontWeight: FontWeight.w900, color: cssColor(tier['fg'], Colors.white),
                            letterSpacing: tier['kind'] == 'owner' ? 1 : 0)),
                  ),
                ]),
              ),
          ]),
        ),
      ),
    );
  }
}

/// Карточка закрытого профиля — второй лист веба (`detailProfile`).
void _openDetail(BuildContext context, String id, String origin) {
  showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    barrierColor: const Color(0xA6000000),
    builder: (ctx) => ValueListenableBuilder<_M?>(
      valueListenable: ScreenUi.model(_key),
      builder: (ctx, m, _) {
        final web = WebTheme.of(ctx);
        final d = _map(_map(m?['details'])[id]);
        if (d.isEmpty) return const SizedBox.shrink();
        final color = cssColor(d['color'], web.border);
        final isCurrent = m?['activeId'] == id;
        return ConstrainedBox(
          constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(ctx).height * 0.9),
          child: Container(
            key: ValueKey('switcher-detail-$id'),
            decoration: BoxDecoration(color: web.surface, borderRadius: const BorderRadius.vertical(top: Radius.circular(24))),
            child: SafeArea(
              top: false,
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(22, 22, 22, 30),
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisSize: MainAxisSize.min, children: [
                  Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(_s(d['emoji']), style: const TextStyle(fontSize: 38)),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(_s(d['name']), style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: web.text)),
                        if (d['audience'] != null)
                          Padding(
                            padding: const EdgeInsets.only(top: 2),
                            child: Text(_s(d['audience']), style: TextStyle(fontSize: 12, color: web.textSecondary)),
                          ),
                      ]),
                    ),
                    _close(ctx, _s(m?['closeLabel'])),
                  ]),
                  if (d['hook'] != null)
                    Container(
                      margin: const EdgeInsets.only(top: 16, bottom: 14),
                      padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 12),
                      decoration: BoxDecoration(
                        color: color.withAlpha(0x22),
                        border: Border(left: BorderSide(color: color, width: 4)),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(_s(d['hook']), style: TextStyle(fontSize: 14, height: 19 / 14, fontWeight: FontWeight.w600, color: web.text)),
                        if (d['hookSource'] != null)
                          Padding(
                            padding: const EdgeInsets.only(top: 6),
                            child: Text(_s(d['hookSource']),
                                style: TextStyle(fontSize: 10, height: 14 / 10, fontStyle: FontStyle.italic, color: web.textSecondary)),
                          ),
                      ]),
                    ),
                  if (d['long'] != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 14),
                      child: Text(_s(d['long']), style: TextStyle(fontSize: 13, height: 19 / 13, color: web.textSecondary)),
                    ),
                  Wrap(spacing: 8, runSpacing: 8, children: [
                    for (final c in (d['chips'] as List? ?? const []))
                      Container(
                        padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 10),
                        decoration: BoxDecoration(color: web.card, borderRadius: BorderRadius.circular(14)),
                        child: Text(_s(c), style: TextStyle(fontSize: 11, color: web.text)),
                      ),
                  ]),
                  const SizedBox(height: 16),
                  Text(_s(d['gamesTitle']), style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: web.text)),
                  const SizedBox(height: 10),
                  for (final g in _list(d['games']))
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 4),
                      child: Row(children: [
                        Text(_s(g['emoji']), style: const TextStyle(fontSize: 16)),
                        const SizedBox(width: 8),
                        Expanded(child: Text(_s(g['name']), style: TextStyle(fontSize: 13, color: web.text))),
                      ]),
                    ),
                  const SizedBox(height: 12),
                  if (d['locked'] == true)
                    m?['codeEntry'] == true
                        ? _outlined(ctx, _s(m?['codeButton']), () {
                            Navigator.of(ctx).pop();
                            _openCode(context);
                          }, const ValueKey('switcher-detail-code'), border: 1.5)
                        : Container(
                            padding: const EdgeInsets.symmetric(vertical: 12),
                            alignment: Alignment.center,
                            decoration: BoxDecoration(color: web.card, borderRadius: BorderRadius.circular(10)),
                            child: Text(_s(d['soon']), style: TextStyle(color: web.textSecondary, fontWeight: FontWeight.w700, fontSize: 13)),
                          )
                  else if (!isCurrent)
                    GestureDetector(
                      key: const ValueKey('switcher-detail-switch'),
                      onTap: () {
                        ScreenUi.act(_key, 'switch', [id]);
                        Navigator.of(ctx).pop();
                        Navigator.of(context).maybePop();
                      },
                      child: Container(
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        alignment: Alignment.center,
                        decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(12)),
                        child: Text(_s(d['switchText']), style: const TextStyle(color: Colors.black, fontWeight: FontWeight.w800, fontSize: 15)),
                      ),
                    )
                  else
                    Container(
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      alignment: Alignment.center,
                      decoration: BoxDecoration(color: color.withAlpha(0x33), borderRadius: BorderRadius.circular(12)),
                      child: Text(_s(d['currentText']), style: TextStyle(color: web.text, fontWeight: FontWeight.w700, fontSize: 14)),
                    ),
                ]),
              ),
            ),
          ),
        );
      },
    ),
  );
}

/// Окно кода доступа — третье окно веба (`codeModalOpen`). Код проверяет веб (`redeem`); удача —
/// модель растит счётчик `redeemed`, и окно с листом закрываются; ошибка — подпись под полем.
void _openCode(BuildContext context) {
  ScreenUi.act(_key, 'clearError');
  final before = _map(_map(ScreenUi.model(_key).value)['code'])['redeemed'];
  showGeneralDialog<void>(
    context: context,
    barrierDismissible: false,
    barrierColor: const Color(0x8C000000),
    pageBuilder: (ctx, _, _) => _CodeDialog(before: before, onDone: () {
      Navigator.of(ctx).pop();
      Navigator.of(context).maybePop();
    }),
  );
}

class _CodeDialog extends StatefulWidget {
  const _CodeDialog({required this.before, required this.onDone});
  final Object? before;
  final VoidCallback onDone;
  @override
  State<_CodeDialog> createState() => _CodeDialogState();
}

class _CodeDialogState extends State<_CodeDialog> {
  final _c = TextEditingController();
  bool _closed = false;

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  void _unlock() => ScreenUi.act(_key, 'redeem', [_c.text]);

  @override
  Widget build(BuildContext context) {
    final web = WebTheme.of(context);
    return ValueListenableBuilder<_M?>(
      valueListenable: ScreenUi.model(_key),
      builder: (context, m, _) {
        final code = _map(m?['code']);
        if (!_closed && code['redeemed'] != widget.before) {
          _closed = true;
          WidgetsBinding.instance.addPostFrameCallback((_) => widget.onDone());
        }
        final error = code['error'];
        return Center(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Material(
              key: const ValueKey('switcher-code-dialog'),
              color: web.surface,
              borderRadius: BorderRadius.circular(16),
              child: Padding(
                padding: const EdgeInsets.all(22),
                child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  Text(_s(code['title']), style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: web.text)),
                  const SizedBox(height: 14),
                  Text(_s(code['hint']), style: TextStyle(fontSize: 13, height: 18 / 13, color: web.textSecondary)),
                  const SizedBox(height: 14),
                  TextField(
                    key: const ValueKey('switcher-code-input'),
                    controller: _c,
                    textCapitalization: TextCapitalization.characters,
                    autocorrect: false,
                    onChanged: (_) {
                      if (error != null) ScreenUi.act(_key, 'clearError');
                    },
                    onSubmitted: (_) => _unlock(),
                    style: TextStyle(fontSize: 16, fontFamily: 'monospace', color: web.text),
                    decoration: InputDecoration(
                      hintText: _s(code['placeholder']),
                      hintStyle: TextStyle(color: web.textSecondary),
                      contentPadding: const EdgeInsets.all(12),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(10),
                        borderSide: BorderSide(color: error != null ? const Color(0xFFEF4444) : web.border),
                      ),
                    ),
                  ),
                  if (error != null) ...[
                    const SizedBox(height: 14),
                    Text(_s(error), key: const ValueKey('switcher-code-error'), style: const TextStyle(fontSize: 12, color: Color(0xFFEF4444))),
                  ],
                  const SizedBox(height: 14),
                  // Wrap, а не Row: при узком экране или крупном шрифте кнопка переносится, а не
                  // уезжает за край (проба поймала переполнение на 57 точек).
                  Wrap(alignment: WrapAlignment.end, crossAxisAlignment: WrapCrossAlignment.center, runSpacing: 8, children: [
                    GestureDetector(
                      key: const ValueKey('switcher-code-cancel'),
                      onTap: () {
                        ScreenUi.act(_key, 'clearError');
                        Navigator.of(context).pop();
                      },
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 16),
                        child: Text(_s(code['cancel']), style: TextStyle(color: web.textSecondary, fontWeight: FontWeight.w600)),
                      ),
                    ),
                    const SizedBox(width: 10),
                    GestureDetector(
                      key: const ValueKey('switcher-code-unlock'),
                      onTap: _unlock,
                      child: Container(
                        padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 18),
                        decoration: BoxDecoration(color: const Color(0xFF10B981), borderRadius: BorderRadius.circular(8)),
                        child: Text(_s(code['unlock']),
                            style: TextStyle(color: cssColor(code['unlockFg'], Colors.white), fontWeight: FontWeight.w700)),
                      ),
                    ),
                  ]),
                ]),
              ),
            ),
          ),
        );
      },
    );
  }
}
