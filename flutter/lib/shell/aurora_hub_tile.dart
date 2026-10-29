import 'package:flutter/material.dart';

import 'design_template.dart';

/// 🔴 ПЛИТКА РАЗВИЛКИ В «АВРОРЕ» — иллюстрация во всю плитку, подпись поверх.
///
/// Референс — лист 01 Codex (вкладка «Игры»): объект со свечением на тёмной сцене,
/// название и «›» снизу. Картинок по ДВЕ на развилку — тёмная и светлая (решение
/// Дениса 28.10.2026), рисует один исполнитель, чтобы стиль был единым
/// (`flutter/DESIGN_SYSTEM.md`, правило 7). Подпись — кодом: на картинке текста нет,
/// поэтому она переводится на 12 языков как все строки.
///
/// Classic эту плитку не видит: [CatalogKit.tile] зовёт её только под «Авророй».
class AuroraHubTile extends StatelessWidget {
  const AuroraHubTile({
    super.key,
    required this.asset,
    required this.title,
    required this.onTap,
    this.hubCount,
  });

  final String asset;
  final String title;
  final VoidCallback onTap;

  /// Число игр за развилкой.
  final int? hubCount;

  /// Развилки, для которых нарисованы картинки (`assets/aurora_hubs/<ключ>_<тема>.webp`).
  /// Ключ — адрес развилки без `/games/`.
  static const slugs = {
    'span', 'mnemonics-hub', 'chess-hub', 'attention-conflict', 'search-hub', 'sudoku-hub',
    'spatial-hub', 'sorting-hub', 'relaxation-hub', 'counting-hub', 'words-hub', 'hearing-hub',
    'languages-hub',
  };

  /// Картинка развилки под тему; `null` — для этого адреса её нет, рисуется прежняя плитка.
  static String? assetFor(String route, {required bool dark}) {
    final slug = route.startsWith('/games/') ? route.substring(7) : route;
    if (!slugs.contains(slug)) return null;
    return 'assets/aurora_hubs/${slug}_${dark ? 'dark' : 'light'}.webp';
  }

  /// Разделы каталога с картинками (`assets/aurora_sections/<раздел>_<тема>.webp`, 720×360):
  /// «Любимые разделы» главной под «Авророй» — лист 01, решение Дениса 29.10 (Q1).
  static const sectionIds = {'memory', 'attention', 'logic', 'intuition', 'action', 'recovery'};

  /// Картинка раздела под тему; `null` — для этого раздела её нет.
  static String? sectionAssetFor(String id, {required bool dark}) =>
      sectionIds.contains(id) ? 'assets/aurora_sections/${id}_${dark ? 'dark' : 'light'}.webp' : null;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final surface = auroraToken('surface', dark: dark)!;
    final text = auroraToken('text', dark: dark)!;
    final secondary = auroraToken('textSecondary', dark: dark)!;
    final border = auroraToken('border', dark: dark)!;
    return Semantics(
      button: true,
      label: title,
      child: Material(
        color: surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(18),
          side: BorderSide(color: border),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Stack(
            fit: StackFit.expand,
            children: [
              Image.asset(asset, fit: BoxFit.cover, alignment: Alignment.topCenter),
              // Нижние ~30 % картинки нарисованы спокойными — подпись читается и без
              // затемнения, но на узкой плитке картинка уходит ниже, отсюда мягкий слой.
              Positioned(
                left: 0,
                right: 0,
                bottom: 0,
                height: 56,
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [surface.withValues(alpha: 0), surface.withValues(alpha: 0.88)],
                    ),
                  ),
                ),
              ),
              Positioned(
                left: 14,
                right: 8,
                bottom: 10,
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: text),
                      ),
                    ),
                    if (hubCount != null)
                      Text('$hubCount',
                          key: const ValueKey('aurora-hubcount'),
                          style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: secondary)),
                    Icon(Icons.chevron_right, size: 20, color: text),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
