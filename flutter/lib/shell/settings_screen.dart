library;

import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../games/languages/lang_names.dart';
import 'app_look.dart';
import 'app_update.dart';
import 'hub_screen.dart' show HubCardTap;
import 'l10n.dart';
import 'profiles.dart';
import 'progress_transfer.dart';
import 'shared_state.dart';

/// 🔴 НАСТРОЙКИ НА FLUTTER — ПЕРЕНОС ПО ФУНКЦИЯМ ВЕБ-ЭКРАНА (задача eae0879c).
///
/// Источник — `frontend/app/settings.tsx` (1269 строк). Опись 19 функций и порядок частей —
/// в проекте раздела; здесь часть 1: тема, звук и громкость, музыка, вибрация, цвет для
/// дальтоников, кнопка чата, гуляющий питомец и его размер, язык, переходы на соседние
/// экраны, подвал.
///
/// ⚠️ ЗНАЧЕНИЯ ПИШУТСЯ РОВНО В ТОМ ВИДЕ, В КАКОМ ИХ ПИШЕТ ВЕБ. Веб-половина читает те же
/// ключи: звук `'true'`/`'false'` (`feedback.ts`), чат и питомец `'1'`/`'0'`
/// (`appFeedback.ts`, `pet.ts`), тема `'dark'`/`'light'` (`ThemeContext.tsx`). Запиши
/// здесь `'1'` вместо `'true'` — веб прочтёт «выключено», и человек увидит, что тумблер
/// не держится. Сторож — `test/settings_screen_test.dart`.
class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key, required this.state});

  final SharedState state;

  static const sound = '${SharedState.prefix}sound_enabled';
  static const volume = '${SharedState.prefix}volume';
  static const music = '${SharedState.prefix}music_on';
  static const haptic = '${SharedState.prefix}haptic_enabled';
  static const colorblind = '${SharedState.prefix}colorblind';
  static const devChat = '${SharedState.prefix}devchat_on';
  static const pet = '${SharedState.prefix}pet_on';
  static const petScale = '${SharedState.prefix}pet_scale';

  /// Ключи, которые веб-половина читает при запуске: сменились — страницу надо перезагрузить,
  /// иначе она останется в старом виде (см. `hybrid_app.dart`, возврат из настроек).
  static const watched = <String>[
    AppLook.overrideKey, sound, volume, music, haptic, colorblind, devChat, pet, petScale, 'language',
    '${SharedState.prefix}active_profile', playlists,
  ];

  /// Состав профилей из файла владельца — `КЛЮЧ_СОСТАВА` (`playlistOverride.ts`).
  static const playlists = '${SharedState.prefix}playlists_override';

  /// Выполнить выражение в странице под нативным экраном и вернуть результат. Ставит оболочка
  /// (`hybrid_app.dart`); в пробах — подмена. Нужна одному месту: разбору файла состава —
  /// разборщик (`разобрать`, ~280 строк) живёт в вебе в единственном экземпляре.
  static Future<Object?> Function(String js)? webEval;

  /// Границы размера питомца — `PET_SCALE_MIN/MAX` из `frontend/src/services/pet.ts`.
  static const petMin = 0.6, petMax = 1.8;

  /// Перенос кодом или восстановление копии переписали прогресс целиком — веб-половина обязана
  /// перечитать его перезагрузкой, даже если «наблюдаемые» ключи не поменялись. Снимает оболочка.
  static bool webDirty = false;

  static bool takeWebDirty() {
    final d = webDirty;
    webDirty = false;
    return d;
  }

  /// Число так, как его пишет `String(n)` в JS: целое — без «.0».
  static String jsNumber(num v) => v == v.roundToDouble() ? v.round().toString() : v.toString();

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

/// Имена профилей для подвала — составным ключом, поэтому списком: сборщик словаря
/// (`embed-l10n.mjs`) видит ключи-переменные только в `const …Keys`.
const settingsProfileKeys = <String>[
  'profileName_nzt48', 'profileName_execs', 'profileName_drivers', 'profileName_chess',
  'profileName_odv999', 'profileName_whatsnew', 'profileName_women', 'profileName_kids',
  'profileName_seniors', 'profileName_students', 'profileName_vasilyeva', 'profileName_free',
  'profileName_polyglot',
  'profileDesc_nzt48', 'profileDesc_execs', 'profileDesc_drivers', 'profileDesc_chess',
  'profileDesc_odv999', 'profileDesc_whatsnew', 'profileDesc_women', 'profileDesc_kids',
  'profileDesc_seniors', 'profileDesc_students', 'profileDesc_vasilyeva', 'profileDesc_free',
  'profileDesc_polyglot',
];

/// Значок категории игры в листе деталей — `CATEGORY_EMOJI` из `app/settings.tsx`.
const _categoryEmoji = {'memory': '🧠', 'attention': '🎯', 'logic': '🧩', 'action': '⚡'};

class _SettingsScreenState extends State<SettingsScreen> {
  SharedState get _s => widget.state;
  LangNames _names = LangNames.empty;
  String _version = '';
  Profiles _profiles = Profiles.current;
  bool _updChecking = false;

  @override
  void initState() {
    super.initState();
    unawaited(LangNames.load().then((n) {
      if (mounted) setState(() => _names = n);
    }).catchError((_) {}));
    if (_profiles.list.isEmpty) {
      unawaited(Profiles.load().then((p) {
        if (mounted) setState(() => _profiles = p);
      }));
    }
    unawaited(PackageInfo.fromPlatform().then((p) {
      if (mounted) setState(() => _version = p.version);
    }).catchError((_) {}));
  }

  // Чтение — с теми же умолчаниями, что у веба.
  bool get _sound => _s.get(SettingsScreen.sound) != 'false';
  bool get _haptic => _s.get(SettingsScreen.haptic) != 'false';
  bool get _music => _s.get(SettingsScreen.music) == 'true';
  bool get _colorblind => _s.get(SettingsScreen.colorblind) == 'true';
  bool get _devChat => _s.get(SettingsScreen.devChat) != '0';
  bool get _pet => _s.get(SettingsScreen.pet) != '0';
  int get _volume => (int.tryParse(_s.get(SettingsScreen.volume) ?? '') ?? 80).clamp(0, 100);
  double get _petScale =>
      (double.tryParse(_s.get(SettingsScreen.petScale) ?? '') ?? 1).clamp(SettingsScreen.petMin, SettingsScreen.petMax);

  Future<void> _put(String key, String value) async {
    await _s.set(key, value);
    if (mounted) setState(() {});
  }

  Future<void> _setTheme(bool dark) async {
    await _s.set(AppLook.overrideKey, dark ? 'dark' : 'light');
    AppLook.refresh(_s);
    if (mounted) setState(() {});
  }

  Future<void> _setLanguage(String code) async {
    await _s.set('language', code);
    await L.load(code);
    if (mounted) setState(() {});
  }

  void _go(String route) => Navigator.of(context).pop(HubCardTap(route));

  Future<void> _alert(String title, [String? body]) => showDialog<void>(
        context: context,
        builder: (c) => AlertDialog(
          title: Text(title),
          content: body == null ? null : Text(body),
          actions: [TextButton(onPressed: () => Navigator.of(c).pop(), child: Text(L.t('close')))],
        ),
      );

  /// «Получить код» — модалка с кодом и «Копировать» (`transferMode === 'export'` веба).
  Future<void> _exportCode() async {
    final code = ProgressTransfer.exportCode(_s);
    await showDialog<void>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text(L.t('progressCodeTitle')),
        content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(L.t('exportCodeHint'), style: const TextStyle(fontSize: 12.5)),
          const SizedBox(height: 10),
          ConstrainedBox(
            constraints: const BoxConstraints(maxHeight: 180),
            child: SingleChildScrollView(
              child: SelectableText(code, key: const Key('settings-export-code'), style: const TextStyle(fontSize: 11, fontFamily: 'monospace')),
            ),
          ),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.of(c).pop(), child: Text(L.t('close'))),
          FilledButton(
            key: const Key('settings-export-copy'),
            onPressed: () async {
              await Clipboard.setData(ClipboardData(text: code));
              if (c.mounted) ScaffoldMessenger.maybeOf(c)?.showSnackBar(SnackBar(content: Text(L.t('copied'))));
            },
            child: Text(L.t('copy')),
          ),
        ],
      ),
    );
  }

  /// «Вставить код» — поле и «Применить» (`transferMode === 'import'` веба).
  Future<void> _importCode() async {
    final ctl = TextEditingController();
    final code = await showDialog<String>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text(L.t('pasteCodeTitle')),
        content: TextField(
          key: const Key('settings-import-field'),
          controller: ctl,
          minLines: 4,
          maxLines: 8,
          style: const TextStyle(fontSize: 11, fontFamily: 'monospace'),
          decoration: InputDecoration(hintText: L.t('pasteCodePlaceholder'), border: const OutlineInputBorder()),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(c).pop(), child: Text(L.t('btn_cancel'))),
          FilledButton(key: const Key('settings-import-apply'), onPressed: () => Navigator.of(c).pop(ctl.text), child: Text(L.t('apply'))),
        ],
      ),
    );
    if (code == null || !mounted) return;
    final r = await ProgressTransfer.importCode(_s, code);
    if (!mounted) return;
    if (r.ok) {
      SettingsScreen.webDirty = true;
      AppLook.refresh(_s);
      setState(() {});
      await _alert(L.t('storyDone'), L.t('importDoneMsg').replaceAll('{n}', '${r.count}'));
    } else {
      // Метка причины в скобках — по снимку экрана сразу видно класс проблемы (как в вебе).
      await _alert(L.t('importFailedTitle'), '${L.t('importFailedBody')}\n(${r.error ?? '?'})');
    }
  }

  /// «Сохранить копию»: файл через «Поделиться» (Файлы, Диск, почта); не вышло — в буфер.
  Future<void> _saveBackup() async {
    // Точка, откуда всплывает лист «Поделиться» (на iPad обязательна), — до первого ожидания.
    final box = context.findRenderObject() as RenderBox?;
    try {
      final json = ProgressTransfer.buildBackup(_s, appVersion: _version);
      try {
        final dir = await getTemporaryDirectory();
        final date = ProgressTransfer.jsIso(DateTime.now()).substring(0, 10);
        final f = File('${dir.path}/psygames-backup-$date.json')..writeAsStringSync(json);
        await SharePlus.instance.share(ShareParams(
          files: [XFile(f.path, mimeType: 'application/json')],
          title: 'PsyGames backup',
          sharePositionOrigin: box == null ? null : box.localToGlobal(Offset.zero) & box.size,
        ));
        return;
      } catch (_) {
        // «Поделиться» недоступно — резерв, как у веба: весь JSON в буфер.
      }
      await Clipboard.setData(ClipboardData(text: json));
      if (mounted) await _alert(L.t('alert_backup_copied'), L.t('msg_backup_copied_full'));
    } catch (_) {
      if (mounted) await _alert(L.t('alert_export_error'), L.t('msg_backup_create_failed'));
    }
  }

  /// «Проверить обновления» (запрос Дениса, v1.151 веба): свежая версия → в магазин платформы.
  Future<void> _checkUpdates() async {
    setState(() => _updChecking = true);
    final latest = await AppUpdate.fetchLatest();
    if (!mounted) return;
    setState(() => _updChecking = false);
    if (latest == null) {
      await _alert(L.t('updCheckFailed'));
      return;
    }
    if (!AppUpdate.isNewer(latest, _version)) {
      await _alert('✓ ${L.t('updLatest')}', 'v$_version');
      return;
    }
    final go = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text('${L.t('updAvailable')} v$latest'),
        content: Text(L.t('updAvailableBody')),
        actions: [
          TextButton(onPressed: () => Navigator.of(c).pop(false), child: Text(L.t('updLater'))),
          FilledButton(key: const Key('settings-update-download'), onPressed: () => Navigator.of(c).pop(true), child: Text(L.t('updDownload'))),
        ],
      ),
    );
    if (go == true) {
      try {
        await launchUrl(Uri.parse(AppUpdate.storeUrl()), mode: LaunchMode.externalApplication);
      } catch (_) {}
    }
  }

  /// Сколько профилей в загруженном составе; null — заводской из сборки.
  int? get _playlistProfiles {
    try {
      final j = jsonDecode(_s.get(SettingsScreen.playlists) ?? '');
      return j is Map && j['профили'] is Map ? (j['профили'] as Map).length : null;
    } catch (_) {
      return null;
    }
  }

  /// «Загрузить состав из файла» (только владелец): файл → разбор страницей → ключ состава.
  Future<void> _loadPlaylists() async {
    String? text;
    try {
      final files = await FilePicker.pickFiles(type: FileType.custom, allowedExtensions: const ['json']);
      if (files.isEmpty) return;
      text = utf8.decode(await files.first.readAsBytes());
    } catch (e) {
      if (e is! MissingPluginException && e is! UnimplementedError) {
        if (mounted) await _alert(L.t('alert_import_error'), '$e');
        return;
      }
      text = (await Clipboard.getData(Clipboard.kTextPlain))?.text;
    }
    if (text == null || text.trim().isEmpty) {
      if (mounted) await _alert(L.t('btn_load_playlists'), L.t('playlistsPasteHint'));
      return;
    }
    final eval = SettingsScreen.webEval;
    Object? v;
    try {
      v = eval == null
          ? null
          : await eval('JSON.stringify(window.__psyPlaylistsParse ? window.__psyPlaylistsParse(${jsonEncode(text)}) : null)');
      // WebKit отдаёт строку как есть, Android — ещё раз в кавычках (как в hybrid_app.dart).
      for (var i = 0; i < 2 && v is String; i += 1) {
        v = jsonDecode(v);
      }
    } catch (_) {
      v = null;
    }
    if (!mounted) return;
    if (v is! Map || v['ok'] != true || v['saved'] is! String) {
      await _alert(L.t('alert_import_error'), v is Map ? '${v['error'] ?? ''}' : '');
      return;
    }
    await _s.set(SettingsScreen.playlists, v['saved'] as String);
    SettingsScreen.webDirty = true;
    if (!mounted) return;
    setState(() {});
    final dropped = (v['dropped'] as List?)?.cast<Object?>() ?? const [];
    final tail = dropped.isEmpty
        ? ''
        : '\n${L.t('playlistsDropped').replaceAll('{n}', '${dropped.length}').replaceAll('{first}', '${dropped.first}')}';
    await _alert(L.t('btn_load_playlists'), L.t('playlistsLoaded').replaceAll('{n}', '${v['n']}') + tail);
  }

  Future<void> _resetPlaylists() async {
    await _s.remove(SettingsScreen.playlists);
    SettingsScreen.webDirty = true;
    if (!mounted) return;
    setState(() {});
    await _alert(L.t('btn_reset_playlists'), L.t('playlistsReset'));
  }

  /// «Восстановить копию»: выбор файла (в гибриде веб открывал тот же системный выбор);
  /// отказ выбора — ничего; выбор недоступен — из буфера, как у веба на нативе.
  Future<void> _restoreBackup() async {
    String? json;
    try {
      final files = await FilePicker.pickFiles(type: FileType.custom, allowedExtensions: const ['json']);
      if (files.isEmpty) return;
      json = utf8.decode(await files.first.readAsBytes());
    } catch (e) {
      if (e is! MissingPluginException && e is! UnimplementedError) {
        if (mounted) await _alert(L.t('alert_import_error'), L.t('msg_restore_failed'));
        return;
      }
      // Выбора файла нет на этой платформе (плагин не подключён или не реализован) — буфер.
      json = (await Clipboard.getData(Clipboard.kTextPlain))?.text;
      if (json == null || json.trim().isEmpty) {
        if (mounted) await _alert(L.t('alert_restore_from_clipboard'), L.t('msg_paste_backup_json'));
        return;
      }
    }
    try {
      final n = await ProgressTransfer.restoreBackup(_s, json);
      SettingsScreen.webDirty = true;
      AppLook.refresh(_s);
      if (!mounted) return;
      setState(() {});
      await _alert(L.t('alert_backup_restored'), L.t('backupRestoredMsg').replaceAll('{n}', '$n'));
    } on BackupError {
      if (mounted) await _alert(L.t('alert_import_error'), L.t('msg_restore_failed'));
    }
  }

  Future<void> _switch(String id) async {
    if (await _profiles.switchTo(_s, id)) {
      AppLook.refresh(_s);
      if (mounted) setState(() {});
    }
  }

  String _desc(Profile p) => L.t('profileDesc_${p.id}').replaceAll('{n}', '${_profiles.publicGameCount}');

  /// Лист деталей профиля (`Profile Detail Modal` веба): описание, хук, метки, игры, действие.
  Future<void> _details(Profile p, {required bool dark}) => showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        backgroundColor: AppLook.token('surface', dark: dark),
        shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
        builder: (c) {
          final text = AppLook.token('text', dark: dark), sub = AppLook.token('textSecondary', dark: dark);
          final card = AppLook.token('card', dark: dark);
          final color = AppLook.hexColor(p.color) ?? AppLook.accentOf(_s);
          final loc = L.locale;
          final games = p.games;
          Widget chip(String t) => Container(
                padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 10),
                decoration: BoxDecoration(color: card, borderRadius: BorderRadius.circular(14)),
                child: Text(t, style: TextStyle(fontSize: 11, color: text)),
              );
          final accessible = _profiles.accessible(_s, p.id);
          final current = _s.activeProfile == p.id;
          return ConstrainedBox(
            constraints: BoxConstraints(maxHeight: MediaQuery.of(c).size.height * 0.9),
            child: SingleChildScrollView(
              key: Key('profile-details-${p.id}'),
              padding: const EdgeInsets.fromLTRB(22, 22, 22, 30),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(p.emoji, style: const TextStyle(fontSize: 38)),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(L.t('profileName_${p.id}'), style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: text)),
                      if (p.text('audience', loc) != null)
                        Text('👥 ${p.text('audience', loc)}', style: TextStyle(fontSize: 12, color: sub)),
                    ]),
                  ),
                  IconButton(tooltip: L.t('close'), icon: Icon(Icons.cancel, color: sub, size: 28), onPressed: () => Navigator.of(c).pop()),
                ]),
                if (p.text('sales_hook', loc) != null)
                  Container(
                    margin: const EdgeInsets.only(top: 8, bottom: 14),
                    padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 12),
                    decoration: BoxDecoration(
                      color: color.withValues(alpha: 0.13),
                      border: Border(left: BorderSide(color: color, width: 4)),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(p.text('sales_hook', loc)!, style: TextStyle(fontSize: 14, color: text, fontWeight: FontWeight.w600, height: 1.35)),
                  ),
                if (p.text('long_description', loc) != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 14),
                    child: Text(p.text('long_description', loc)!, style: TextStyle(fontSize: 13, color: sub, height: 1.45)),
                  ),
                Wrap(spacing: 8, runSpacing: 8, children: [
                  if (p.sessionMinutes != null) chip('⏱ ${loc == 'ru' ? p.sessionMinutes! : p.sessionMinutes!.replaceAll('мин', 'min')}'),
                  if (p.warmup) chip('☀️ ${L.t('badge_morning_warmup')}'),
                  if (p.financialDay) chip('💰 Financial Brain Day'),
                  if (p.assessment) chip('📊 G1 Assessment'),
                ]),
                const SizedBox(height: 16),
                Text(
                  '🎮 ${games == null ? L.t('label_all_48_games').replaceAll('{n}', '${_profiles.publicGameCount}') : L.t('exercisesInProfile').replaceAll('{n}', '${games.length}')}',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: text),
                ),
                const SizedBox(height: 10),
                if (games == null)
                  Text(L.t('desc_full_library'), style: TextStyle(fontSize: 13, color: sub, fontStyle: FontStyle.italic))
                else
                  for (final g in games)
                    if (_profiles.games[g] case final info?)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 4),
                        child: Row(children: [
                          Text(_categoryEmoji[info['category']] ?? '•', style: const TextStyle(fontSize: 16)),
                          const SizedBox(width: 8),
                          Expanded(child: Text(L.t('${info['nameKey']}'), style: TextStyle(fontSize: 13, color: text))),
                        ]),
                      ),
                const SizedBox(height: 18),
                /*
                 * ⚠️ ВВОД КОДА И ЗАПРОС В TELEGRAM НЕ ПЕРЕНЕСЕНЫ — ОНИ ВЫКЛЮЧЕНЫ В ВЕБЕ:
                 * `UNLOCK_CODES_ENABLED = false` (запертых профилей нет вовсе) и
                 * `MONETIZATION_ENABLED = false`. Включат — проба `settings_screen_test`
                 * покраснеет и потребует перенести `tryUnlock`; на iOS ввод кода прятать
                 * `Platform.isIOS` (App Store 3.1.1) — в гибриде веб считал себя 'web' и не прятал.
                 */
                if (!accessible && p.comingSoon)
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(color: card, borderRadius: BorderRadius.circular(12)),
                    child: Column(children: [
                      Text('🔒 ${L.t('label_coming_soon')}', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: text)),
                      const SizedBox(height: 8),
                      Text(L.t('comingSoonBody'), textAlign: TextAlign.center, style: TextStyle(fontSize: 12, color: sub)),
                    ]),
                  ),
                if (accessible && !current)
                  FilledButton(
                    key: Key('profile-switch-${p.id}'),
                    style: FilledButton.styleFrom(backgroundColor: color, foregroundColor: Colors.black, minimumSize: const Size.fromHeight(48)),
                    onPressed: () {
                      Navigator.of(c).pop();
                      _switch(p.id);
                    },
                    child: Text('✓ ${L.t('btn_switch_to_profile')}', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                  ),
                if (current)
                  Container(
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    decoration: BoxDecoration(color: color.withValues(alpha: 0.2), borderRadius: BorderRadius.circular(12)),
                    child: Text('✓ ${L.t('label_current_profile')}',
                        textAlign: TextAlign.center, style: TextStyle(color: text, fontWeight: FontWeight.w700, fontSize: 14)),
                  ),
              ]),
            ),
          );
        },
      );

  Widget _profileSection({required bool dark}) {
    final text = AppLook.token('text', dark: dark), sub = AppLook.token('textSecondary', dark: dark);
    final cardColor = AppLook.token('card', dark: dark), border = AppLook.token('border', dark: dark);
    final wide = MediaQuery.of(context).size.width >= 520;
    final unlocked = Profiles.unlocked(_s);
    Widget label(String t) => Padding(
          padding: const EdgeInsets.only(top: 12, bottom: 8),
          child: Text(t.toUpperCase(), style: TextStyle(color: sub, fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 1)),
        );
    Widget grid(Iterable<Profile> ps) => LayoutBuilder(builder: (_, box) {
          final w = (box.maxWidth - (wide ? 16 : 8)) / (wide ? 3 : 2);
          return Wrap(spacing: 8, runSpacing: 8, children: [
            for (final p in ps)
              Builder(builder: (_) {
                final active = p.id == _s.activeProfile;
                final locked = !_profiles.accessible(_s, p.id);
                final color = AppLook.hexColor(p.color) ?? AppLook.accentOf(_s);
                return Opacity(
                  opacity: locked ? 0.55 : 1,
                  child: InkWell(
                    key: Key('profile-${p.id}'),
                    borderRadius: BorderRadius.circular(12),
                    onTap: () => locked ? _details(p, dark: dark) : _switch(p.id),
                    onLongPress: () => _details(p, dark: dark),
                    child: Container(
                      width: w,
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: active ? color : cardColor,
                        border: Border.all(color: active ? color : border, width: 2),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Column(children: [
                        Text('${p.emoji}${locked ? '🔒' : ''}', style: const TextStyle(fontSize: 32)),
                        const SizedBox(height: 4),
                        Text(L.t('profileName_${p.id}'),
                            textAlign: TextAlign.center,
                            style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: active ? Colors.black : text)),
                        const SizedBox(height: 4),
                        Text(_desc(p),
                            textAlign: TextAlign.center,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontSize: 10, height: 1.3, color: active ? Colors.black.withValues(alpha: 0.7) : sub)),
                        if (p.sessionMinutes != null)
                          Text('⏱ ${p.sessionMinutes!.replaceAll('мин', L.t('unitMin'))}',
                              style: TextStyle(fontSize: 9, color: active ? Colors.black.withValues(alpha: 0.55) : sub)),
                      ]),
                    ),
                  ),
                );
              }),
          ]);
        });
    final personal = _profiles.list.where((p) => p.group != 'themed');
    final themed = _profiles.list.where((p) => p.group == 'themed');
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: AppLook.token('surface', dark: dark), borderRadius: BorderRadius.circular(16)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text('👤 ${L.t('label_profile')}', style: TextStyle(color: text, fontSize: 17, fontWeight: FontWeight.w700)),
        const SizedBox(height: 4),
        Text(L.t('desc_profile_section'), style: TextStyle(color: sub, fontSize: 12, height: 1.4)),
        if (personal.isNotEmpty) ...[label('👥 ${L.t('label_personal')}'), grid(personal)],
        if (themed.isNotEmpty) ...[
          label(_profiles.codesEnabled ? L.t('label_themed_codes_on') : L.t('label_themed_codes_off')),
          grid(themed),
        ],
        if (unlocked.isNotEmpty)
          Align(
            alignment: AlignmentDirectional.centerEnd,
            child: TextButton(
              key: const Key('profile-reset-unlocks'),
              onPressed: () async {
                final ok = await showDialog<bool>(
                  context: context,
                  builder: (c) => AlertDialog(
                    title: Text(L.t('alert_reset_unlocks')),
                    content: Text(L.t('msg_reset_unlocks_confirm')),
                    actions: [
                      TextButton(onPressed: () => Navigator.of(c).pop(false), child: Text(L.t('btn_cancel'))),
                      TextButton(onPressed: () => Navigator.of(c).pop(true), child: Text(L.t('btn_reset'))),
                    ],
                  ),
                );
                if (ok == true) {
                  await _profiles.resetUnlocks(_s);
                  AppLook.refresh(_s);
                  if (mounted) setState(() {});
                }
              },
              child: Text('${L.t('label_unlocked')}: ${unlocked.length} · 🗑 ${L.t('btn_reset')}', style: TextStyle(fontSize: 11, color: sub)),
            ),
          ),
      ]),
    );
  }

  @override
  Widget build(BuildContext context) {
    final dark = AppLook.isDark(_s);
    Color tok(String n) => AppLook.token(n, dark: dark);
    final accent = AppLook.accentOf(_s);
    final bg = tok('background'), surface = tok('surface'), text = tok('text'), sub = tok('textSecondary');
    final rtl = L.locale == 'ar';

    Widget card(Widget child) => Container(
          margin: const EdgeInsets.only(bottom: 8),
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(color: surface, borderRadius: BorderRadius.circular(16)),
          child: child,
        );

    Widget toggle(String key, IconData icon, String label, bool value, ValueChanged<bool> onChanged, {String? hint}) =>
        card(Row(children: [
          Icon(icon, color: accent, size: 24),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(label, style: TextStyle(color: text, fontSize: 16, fontWeight: FontWeight.w500)),
              if (hint != null) Padding(padding: const EdgeInsets.only(top: 2), child: Text(hint, style: TextStyle(color: sub, fontSize: 12))),
            ]),
          ),
          Switch(key: Key('settings-$key'), value: value, onChanged: onChanged, activeTrackColor: accent),
        ]));

    Widget link(String route, IconData icon, Color iconColor, String label, {String? trailing}) => card(InkWell(
          key: Key('settings-link-$route'),
          onTap: () => _go(route),
          child: Row(children: [
            Icon(icon, color: iconColor, size: 24),
            const SizedBox(width: 12),
            Expanded(child: Text(label, style: TextStyle(color: text, fontSize: 16, fontWeight: FontWeight.w500))),
            if (trailing != null) Text(trailing, style: TextStyle(color: sub, fontSize: 13, fontWeight: FontWeight.w600)),
            Icon(rtl ? Icons.chevron_left : Icons.chevron_right, color: sub, size: 20),
          ]),
        ));

    Widget action(String key, IconData icon, Color iconColor, String label, Future<void> Function() onTap,
            {String? hint, String? trailing}) =>
        card(InkWell(
          key: Key('settings-$key'),
          onTap: onTap,
          child: Row(children: [
            Icon(icon, color: iconColor, size: 24),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(label, style: TextStyle(color: text, fontSize: 16, fontWeight: FontWeight.w500)),
                if (hint != null) Text(hint, maxLines: 2, style: TextStyle(color: sub, fontSize: 12)),
              ]),
            ),
            if (trailing != null) Text(trailing, style: TextStyle(color: sub, fontSize: 13, fontWeight: FontWeight.w600)),
            Icon(rtl ? Icons.chevron_left : Icons.chevron_right, color: sub, size: 20),
          ]),
        ));

    final volume = _volume;
    final petScale = _petScale;
    final profile = _s.activeProfile;

    return Scaffold(
      backgroundColor: bg,
      body: SafeArea(
        child: Column(children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
            child: Row(children: [
              Material(
                color: surface,
                shape: const CircleBorder(),
                child: IconButton(
                  key: const Key('settings-back'),
                  tooltip: L.t('a11yBack'),
                  icon: Icon(rtl ? Icons.arrow_forward : Icons.arrow_back, color: text),
                  onPressed: () => Navigator.of(context).maybePop(),
                ),
              ),
              Expanded(
                child: Text(L.t('settings'),
                    textAlign: TextAlign.center,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(color: text, fontSize: 20, fontWeight: FontWeight.w700)),
              ),
              const SizedBox(width: 48),
            ]),
          ),
          Expanded(
            // Строк меньше двадцати — строим все сразу: ленивый список не создаёт строки ниже
            // экрана, и их не находят ни пробы, ни экранный диктор до прокрутки.
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 28),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              if (_profiles.list.isNotEmpty) _profileSection(dark: dark),
              toggle('theme', dark ? Icons.dark_mode : Icons.light_mode, L.t('darkTheme'), dark, _setTheme),
              toggle('sound', _sound ? Icons.volume_up : Icons.volume_off, L.t('label_sound'), _sound,
                  (v) => _put(SettingsScreen.sound, '$v')),
              // Громкость — только при включённом звуке (задача fe7f2020): ползунок под
              // выключенным тумблером — две ручки на одно молчание.
              if (_sound)
                card(Row(children: [
                  IconButton(
                    key: const Key('settings-volume-down'),
                    tooltip: '${L.t('volumeLabel')} −10',
                    icon: Icon(Icons.remove, color: text, size: 18),
                    onPressed: () => _put(SettingsScreen.volume, '${(volume - 10).clamp(0, 100)}'),
                  ),
                  Expanded(
                    child: Slider(
                      key: const Key('settings-volume'),
                      value: volume.toDouble(),
                      max: 100,
                      activeColor: accent,
                      label: '$volume%',
                      onChanged: (v) => _put(SettingsScreen.volume, '${v.round()}'),
                    ),
                  ),
                  IconButton(
                    key: const Key('settings-volume-up'),
                    tooltip: '${L.t('volumeLabel')} +10',
                    icon: Icon(Icons.add, color: text, size: 18),
                    onPressed: () => _put(SettingsScreen.volume, '${(volume + 10).clamp(0, 100)}'),
                  ),
                  SizedBox(width: 44, child: Text('$volume%', textAlign: TextAlign.end, style: TextStyle(color: sub, fontSize: 13))),
                ])),
              toggle('music', _music ? Icons.music_note : Icons.music_note_outlined, L.t('music'), _music,
                  (v) => _put(SettingsScreen.music, '$v')),
              toggle('haptic', Icons.vibration, L.t('label_vibration'), _haptic, (v) => _put(SettingsScreen.haptic, '$v')),
              toggle('colorblind', Icons.visibility_outlined, L.t('colorblindMode'), _colorblind,
                  (v) => _put(SettingsScreen.colorblind, '$v'),
                  hint: L.t('colorblindWhere')),
              toggle('devchat', Icons.chat_bubble_outline, L.t('devChatToggle'), _devChat,
                  (v) => _put(SettingsScreen.devChat, v ? '1' : '0')),
              toggle('pet', Icons.pets_outlined, L.t('petSynapse'), _pet, (v) => _put(SettingsScreen.pet, v ? '1' : '0')),
              if (_pet)
                card(Column(children: [
                  Row(children: [
                    Icon(Icons.open_in_full, color: accent, size: 24),
                    const SizedBox(width: 12),
                    Expanded(child: Text(L.t('petSize'), style: TextStyle(color: text, fontSize: 16, fontWeight: FontWeight.w500))),
                    Text('${(petScale * 100).round()}%', style: TextStyle(color: sub, fontSize: 13, fontWeight: FontWeight.w700)),
                  ]),
                  Slider(
                    key: const Key('settings-pet-scale'),
                    value: petScale,
                    min: SettingsScreen.petMin,
                    max: SettingsScreen.petMax,
                    activeColor: accent,
                    onChanged: (v) => _put(SettingsScreen.petScale, SettingsScreen.jsNumber(double.parse(v.toStringAsFixed(2)))),
                  ),
                ])),
              // Перенос прогресса между установками (веб / старый APK / Play — разные хранилища).
              card(Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Row(children: [
                  Icon(Icons.swap_horiz, color: accent, size: 24),
                  const SizedBox(width: 12),
                  Expanded(child: Text(L.t('transferProgress'), style: TextStyle(color: text, fontSize: 16, fontWeight: FontWeight.w500))),
                ]),
                const SizedBox(height: 10),
                Text(L.t('transferProgressHint'), style: TextStyle(color: sub, fontSize: 12.5, height: 1.35)),
                const SizedBox(height: 10),
                Wrap(spacing: 8, runSpacing: 8, children: [
                  FilledButton(
                    key: const Key('settings-export'),
                    style: FilledButton.styleFrom(backgroundColor: accent, minimumSize: const Size(0, 48)),
                    onPressed: _exportCode,
                    child: Text(L.t('exportGetCode')),
                  ),
                  OutlinedButton(
                    key: const Key('settings-import'),
                    style: OutlinedButton.styleFrom(foregroundColor: accent, side: BorderSide(color: accent, width: 1.5), minimumSize: const Size(0, 48)),
                    onPressed: _importCode,
                    child: Text(L.t('importPasteCode')),
                  ),
                ]),
              ])),
              card(Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Icon(Icons.translate, color: accent, size: 24),
                  const SizedBox(width: 12),
                  Text(L.t('language'), style: TextStyle(color: text, fontSize: 16, fontWeight: FontWeight.w500)),
                ]),
                const SizedBox(height: 12),
                Wrap(spacing: 8, runSpacing: 8, children: [
                  for (final code in _names.languages.isEmpty ? L.locales : _names.languages.keys)
                    ChoiceChip(
                      key: Key('settings-lang-$code'),
                      label: Text(_names.name(code)),
                      selected: L.locale == code,
                      selectedColor: accent,
                      labelStyle: TextStyle(color: L.locale == code ? Colors.white : text, fontWeight: FontWeight.w600),
                      backgroundColor: tok('card'),
                      side: BorderSide(color: tok('border')),
                      showCheckmark: false,
                      onSelected: (_) => _setLanguage(code),
                    ),
                ]),
              ])),
              const SizedBox(height: 4),
              link('/achievements', Icons.emoji_events, const Color(0xFFFBBF24), L.t('achievementsTitle')),
              action('update', Icons.system_update_alt, accent, L.t('updCheckBtn'), _checkUpdates,
                  trailing: _updChecking ? '…' : (_version.isEmpty ? null : 'v$_version')),
              link('/whats-new', Icons.auto_awesome_outlined, accent, L.t('versionHistory')),
              link('/sources', Icons.local_library_outlined, accent, L.t('sourcesTitle')),
              link('/onboarding?tutorial=1', Icons.play_circle_outline, accent, L.t('btn_replay_tutorial')),
              action('backup-save', Icons.cloud_download_outlined, const Color(0xFF22C55E), L.t('btn_save_backup'), _saveBackup),
              action('backup-restore', Icons.cloud_upload_outlined, const Color(0xFF3B82F6), L.t('btn_restore_backup'), _restoreBackup),
              // Состав профилей из файла — только у владельца (просьба Дениса 13.09.2026: «редактировать
              // буду только я»), как `profile.id === 'odv999'` в вебе.
              if (profile == 'odv999') ...[
                action('playlists-load', Icons.list_alt, const Color(0xFFA855F7), L.t('btn_load_playlists'), _loadPlaylists,
                    hint: _playlistProfiles == null
                        ? L.t('playlistsNowFactory')
                        : L.t('playlistsNowFile').replaceAll('{n}', '${_playlistProfiles!}')),
                if (_playlistProfiles != null)
                  action('playlists-reset', Icons.refresh, const Color(0xFFF59E0B), L.t('btn_reset_playlists'), _resetPlaylists),
              ],
              const SizedBox(height: 24),
              Text(
                'PsyGames${_version.isEmpty ? '' : ' v$_version'} · ${_profiles.byId(profile)?.emoji ?? ''} ${L.t('profileName_$profile')} · ${L.t('label_validated_paradigms')}',
                textAlign: TextAlign.center,
                style: TextStyle(color: sub, fontSize: 16, fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 4),
              // MONETIZATION_ENABLED = false (`frontend/src/constants/profiles.ts:1137`).
              Text(L.t('hint_profile_tap_unlock'), textAlign: TextAlign.center, style: TextStyle(color: sub, fontSize: 12)),
            ]),
            ),
          ),
        ]),
      ),
    );
  }
}
