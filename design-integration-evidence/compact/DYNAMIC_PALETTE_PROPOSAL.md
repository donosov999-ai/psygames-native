# Dynamic crystal palettes — proposal, not implemented

01 November 2026. User asked whether the current template can change material colours live with a slider, avoiding nine independently redrawn profile packs.

Yes: one reusable geometry/material pack plus palette parameters. This is not the same as an entrance animation. A slider changes hue/saturation/lightness; an optional short tween makes preset transitions smooth. No AI request or new image generation is required per user change.

## Current code and limitation

`flutter/lib/shell/game_colors.dart` already provides GameColors ThemeExtension and colour interpolation. `design_template.dart` owns shell tokens. However, the accepted header/footer/buttons are raster PNGs with saturated sapphire, gold, highlights and shadows baked together. Those texture pixels do NOT automatically follow ThemeData. A global ColorFiltered tint would also recolour gold, icons and skin if wrapped around the whole screen.

## Recommended material contract

One geometry with independently adjustable layers:

1. Neutral crystal body / luminance texture and alpha mask; preserves actual facets and depth.
2. Gold metal layer and mask; fixed by default, independently configurable if desired.
3. White/pearlescent reflections and caustics; retain highlights rather than flat solid recolouring.
4. Glow / atmospheric background, separate from readable content.
5. Native localized text, meaningful icons and game stimuli drawn outside the recolouring layer.

Palette parameters: `gemShadow`, `gemBase`, `gemHighlight`, `metal`, `glow`, `background`, `surface`, `onSurface`. Profiles reference presets, not duplicate screens; manual visual override is separate from player mode/history. Dark/light have separately validated background/text tokens. Use current accepted artwork as fallback, do not overwrite it.

## Two paths to test

- Cheap prototype on current PNG: selective sapphire hue replacement with a protected metal mask. Can approximate emerald/ruby/amethyst while retaining detailed lightness; mixed blue/gold reflection pixels may still need cleanup. Do not promise identical physically correct refraction from simple tinting.
- Reusable production pack: prepare neutral material + masks ONCE per unique asset, not nine redraws. Apply a masked shader or composited colour-filter layer; preserve the metal/reflection layers. With that preparation, the same shape can take arbitrary preset or slider colours.

Flutter ColorFiltered supports pixel colour filtering; ThemeData.lerp supports interpolation of native theme values. Custom fragment shaders can use colour/mask textures and runtime uniform values. ImageFilter.shader is Impeller-only, so it must be capability-gated; use a directly sampled Canvas shader or pre-tinted/static assets as fallback rather than assuming every renderer supports the filter path.

## Pilot / acceptance before expansion

Pilot only one existing header and one button, adjacent sapphire/emerald/ruby previews and live hue slider. Check preserved gold/highlights, no halos, exact original geometry/centerSlice edges, text contrast, both themes, narrow screens, Android/iPhone GPU cost and unsupported-renderer fallback. Reduce Motion skips the tween; static colour choice still works. Do not animate the entire screen continuously.

NEVER recolour gameplay meaning: Stroop ink, Simon colours, water-sort colours, wrong/correct indicators, targets and difficulty semantics stay owned by the game. Palette changes appearance only, not rules or records.

Current implementation status: proposal/research only. No shader/filter, profile preference, palette migration or slider has been added by this task.

Primary sources:
- https://api.flutter.dev/flutter/widgets/ColorFiltered-class.html
- https://api.flutter.dev/flutter/material/ThemeData/lerp.html
- https://docs.flutter.dev/ui/design/graphics/fragment-shaders
