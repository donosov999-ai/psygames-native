# Five short effects · Kenney Interface Sounds · CC0

02.11.2026: the comparison adapters use additional mono 44.1 kHz PCM16 WAV
conversions of these exact originals. Both engines receive the same WAV, with
no loudness normalization. OGG originals are retained. Reproduce on macOS:
`afconvert -f WAVE -d LEI16@44100 -c 1 NAME.ogg NAME.wav`.

Source: https://kenney.nl/assets/interface-sounds
Mirror used for pilot: https://github.com/GeorgeQLe/assets-sfx-ui

click_001.ogg — selection; glass_001.ogg — transfer; drop_001.ogg — landing;
confirmation_001.ogg — group; bong_001.ogg — victory.

Only these effects are included. No new music is redistributed. Original
just_audio music, voice and practice ownership are unchanged.

13.11.2026: `answer_correct.wav` and `answer_wrong.wav` (answer feedback, task 5d4d04bb) are not from
Kenney: they are synthesized by `flutter/tools/gen-answer-sfx.py` (sine tones, mono 44.1 kHz PCM16) and
released together with this set under CC0.
