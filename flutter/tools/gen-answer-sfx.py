#!/usr/bin/env python3
"""Звуки отклика на ответ — «верно» и «ошибка» (задача 5d4d04bb, правило Дениса 13.11.2026).

В наборе пилота (Kenney Interface Sounds, assets/game_sfx_pilot/) нет звука ошибки, а «верно» нужен
короче и легче «группы» (confirmation_001, 0,29 с): ответ в пробе — частое событие. Поэтому два звука
синтезированы здесь — свои, без чужой лицензии (передаём как CC0 вместе с набором).

  answer_correct.wav — два коротких восходящих тона (880 → 1320 Гц), ~0,16 с, мягкая атака;
  answer_wrong.wav   — два низких нисходящих тона (233 → 175 Гц), ~0,22 с, с обертоном — «нет».

Формат как у набора пилота: моно, 44,1 кГц, PCM16. Запуск из flutter/: python3 tools/gen-answer-sfx.py
"""
import math
import struct
import wave
from pathlib import Path

RATE = 44100
OUT = Path(__file__).resolve().parent.parent / 'assets' / 'game_sfx_pilot'


def tone(freq, ms, amp, overtone=0.0):
    n = int(RATE * ms / 1000)
    attack, release = int(RATE * 0.006), int(RATE * 0.04)
    for i in range(n):
        env = min(1.0, i / attack) * min(1.0, (n - i) / release)
        t = i / RATE
        v = math.sin(2 * math.pi * freq * t) + overtone * math.sin(2 * math.pi * freq * 2 * t)
        yield amp * env * v / (1 + overtone)


def silence(ms):
    return [0.0] * int(RATE * ms / 1000)


def write(name, samples):
    with wave.open(str(OUT / name), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(b''.join(struct.pack('<h', int(max(-1, min(1, s)) * 32767)) for s in samples))


write('answer_correct.wav', [*tone(880, 70, 0.5), *silence(10), *tone(1320, 85, 0.5)])
write('answer_wrong.wav', [*tone(233, 95, 0.55, overtone=0.35), *silence(15), *tone(175, 115, 0.55, overtone=0.35)])
print('ok:', OUT / 'answer_correct.wav', OUT / 'answer_wrong.wav')
