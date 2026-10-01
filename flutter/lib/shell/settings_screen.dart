library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:package_info_plus/package_info_plus.dart';

import '../games/languages/lang_names.dart';
import 'app_look.dart';
import 'hub_screen.dart' show HubCardTap;
import 'l10n.dart';
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
    '${SharedState.prefix}active_profile',
  ];

  /// Границы размера питомца — `PET_SCALE_MIN/MAX` из `frontend/src/services/pet.ts`.
  static const petMin = 0.6, petMax = 1.8;

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
];

class _SettingsScreenState extends State<SettingsScreen> {
  SharedState get _s => widget.state;
  LangNames _names = LangNames.empty;
  String _version = '';

  @override
  void initState() {
    super.initState();
    unawaited(LangNames.load().then((n) {
      if (mounted) setState(() => _names = n);
    }).catchError((_) {}));
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
              link('/whats-new', Icons.auto_awesome_outlined, accent, L.t('versionHistory')),
              link('/sources', Icons.local_library_outlined, accent, L.t('sourcesTitle')),
              link('/onboarding?tutorial=1', Icons.play_circle_outline, accent, L.t('btn_replay_tutorial')),
              const SizedBox(height: 24),
              Text(
                'PsyGames${_version.isEmpty ? '' : ' v$_version'} · ${L.t('profileName_$profile')} · ${L.t('label_validated_paradigms')}',
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
