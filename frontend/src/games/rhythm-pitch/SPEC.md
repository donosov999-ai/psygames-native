# Rhythm / Pitch · isolated module specification

Status: local G7 implementation candidate. Integration, catalog, persistence,
shared warm-up wiring, and release remain outside this module.

## Product modes

Rhythm Echo plays a local, nonverbal beat pattern and asks the player to repeat its
timing. Progression grows from 3 to 12 beats and 60 to 160 BPM, then adds rests,
syncopation, and accents. Timing compares absolute expected and observed taps after
subtracting the measured device-latency offset.

Pitch Path begins with higher/lower discrimination, then uses three comfortable tone
levels and grows deterministic sequences from 3 to 10 tones while intervals shrink.
No microphone, speech recognition, network TTS, or downloaded sound is required.

The exported route has `LEVELS = 31`; larger requests clamp to level 31. Rhythm Echo
and Pitch Path alternate, so the task type changes every level while each mode keeps
its own content progression.

| Levels | Honest content progression |
| --- | --- |
| 1–3 | Tutorial: 3–4 rhythm beats or two-tone higher/lower discrimination |
| 4–7 | First pauses, accents, syncopation, and three-level pitch sequences |
| 8–13 | 6–9 beats at 90–120 BPM; pitch sequences grow toward seven tones |
| 14–19 | 9–12 beats; pitch sequences grow toward ten tones and intervals shrink |
| 20–25 | Rhythm reaches 160 BPM; pitch holds ten tones with smaller intervals |
| 26–31 | Maximum beat/tone counts; pitch reaches one-semitone spacing and rhythm feature density reaches its cap |

BPM is the rate of the sound stimulus, not a response countdown. The player can
answer without a time limit after playback.

## Audio lifecycle

The web adapter synthesizes short local sine tones through Web Audio. It schedules
oscillators without JavaScript timers, exposes only a generic listening indicator,
and never visualizes the upcoming beat/accent/pitch. A short four-pulse calibration
checks volume and estimates median tap latency. Tutorial rounds permit replay.

App backgrounding stops nodes and suspends the context. Unmount stops nodes and
closes the context. If no audio output adapter or AudioContext is available, the
state machine shows a clear unavailable screen rather than requesting a microphone.
An injected native engine remains caller-owned: the component stops it on unmount,
while the application adapter must close its own native resources.

## Metrics

Common result fields are supplemented by calibration offset/samples, Rhythm timing
accuracy, mean absolute timing error, missing/extra taps, beat/BPM/rest/syncopation/
accent counts, or Pitch task/sequence accuracy, tone count, level count, interval,
frequency range, plus `details.level`. Exported `isPassed(metrics)` requires accuracy
at least 0.70. For two-tone direction this remains exact; longer rhythm/pitch
sequences tolerate limited timing or recall error. The future route owns
`saveSession`, persistent level progress, and LevelCleared/GameResult; it must not
auto-chain in shared warm-up mode.
