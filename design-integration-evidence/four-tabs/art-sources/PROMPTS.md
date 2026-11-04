# Original ImageGen prompts · recovered from own tool call

Both sheets referenced existing `dark_goal.png` and `light_wide_goal.png` from `/Users/denisonosov/dev/psygames-game-lab/design-integration-20261101/flutter/assets/aurora_game_chrome/home_panels_pilot/`. transparent_background=true. No external generator.

Common exact prefix:

UI material asset sheet for PsyGames, matching approved sapphire/crystal/gold cards. EXACT 2 columns x2 rows, four EQUAL cells, reading order row1 dark normal, light normal; row2 dark selected, light selected. ONE empty rounded gemstone card per cell, NO TEXT, NO ICONS, NO OBJECTS, NO PHONES, NO GRID LINES. True transparent outside each shape. Keep16percent safe padding within EVERY cell. No part or glow crosses cell. Deep translucent sapphire on DARK cards, clear ivory/champagne crystal on LIGHT cards. Thin warm gold bezel, edges finely faceted and polished, centre smooth and calm with subtle different internal refractions, no big white flare behind future text. Selected cards slightly richer gold edge, NOT all-gold opaque interior. Clean professional luxurious game UI, not generic flat gradient. Geometry identical in all4cells.

Square suffix:

 All four cards SQUARE, corners20px at256 logical size, centre spacious, rim thin.

Wide suffix:

 All four panels WIDE rounded rectangles of EXACT2.4:1 aspect ratio; equal intrinsic dimensions. They sit centred in equal cells with extra transparent top/bottom margins. Not an app header or footer. End caps same radius and material.

## Actual inspection

Square output FAILED padding/bounds: preserved as rejected, not installed. Reuse the previously accepted square goal art instead. Wide output has wider aspect than requested, no baked text; actual dimensions in manifest, never claim requested geometry was produced exactly. Separate selected surfaces are opt-in visual states, not fake purchase/unlock states. Header/footer are reused originals, not these newly generated panels.
