#!/usr/bin/env python3
"""СВЕРКА ТОНА ЗАПИСЕЙ «ТОНОВ» ПО ВЫСОТЕ ЗВУКА — до выкладки (задача f52e2046).

Тон класса A подтверждён ИМЕНЕМ файла Викисклада (`Zh-bēi.ogg`), класса B — не подтверждён
ничем. Здесь каждая запись voice-wiktionary/zh/*.opus раскладывается на кривую основного
тона (автокорреляция по кадрам 40 мс с шагом 10 мс, 70–450 Гц) и форма кривой сравнивается
с тоном слога из банка: 1 — ровный высокий, 2 — восходящий, 3 — с провалом / низкий,
4 — падающий от высокого. Высота — в полутонах от медианы ВСЕХ записей того же чтеца,
поэтому «высокий» и «низкий» меряются по голосу, а не по герцам.

Записи, у которых форма кривой не совпала с тоном слога, в указатель НЕ идут: в игре про
тон неверная запись хуже, чем никакой (слог отыграет синтез, как раньше).

Нужен numpy:  ~/.venvs/mattes/bin/python scripts/check_zh_tone_pitch.py [--apply]
  без --apply — только отчёт voice-wiktionary/zh-tones-pitch.json;
  с --apply   — несовпавшие убираются из index.json и credits.json (файлы остаются на диске).
"""
import json
import os
import subprocess
import sys
from collections import Counter, defaultdict

import numpy as np

КОРЕНЬ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ВЫХОД = os.path.join(КОРЕНЬ, 'voice-wiktionary')
SR = 16000


def pcm(путь: str) -> np.ndarray:
    raw = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', путь, '-ac', '1', '-ar', str(SR), '-f', 's16le', '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.int16).astype(np.float64) / 32768.0


def f0(x: np.ndarray) -> np.ndarray:
    win, hop = int(0.04 * SR), int(0.01 * SR)
    lo, hi = int(SR / 450), int(SR / 70)
    energy_floor = 0.1 * np.sqrt(np.mean(x ** 2) + 1e-12)
    out = []
    for s in range(0, len(x) - win, hop):
        fr = x[s:s + win] * np.hanning(win)
        if np.sqrt(np.mean(fr ** 2)) < energy_floor:
            out.append(np.nan)
            continue
        ac = np.correlate(fr, fr, 'full')[win - 1:]
        ac /= ac[0] + 1e-12
        lag = lo + int(np.argmax(ac[lo:hi]))
        out.append(SR / lag if ac[lag] > 0.45 else np.nan)
    c = np.array(out)
    # медианный фильтр по 5 кадрам гасит октавные скачки
    v = c.copy()
    for i in range(len(c)):
        w = c[max(0, i - 2):i + 3]
        w = w[~np.isnan(w)]
        v[i] = np.median(w) if len(w) else np.nan
    return v


def форма(st: np.ndarray) -> dict:
    # Октавные скачки автокорреляции дают выбросы на ±12 полутонов: отрезаем и берём
    # МЕДИАНЫ краёв, а не средние — одна ошибочная рамка не переворачивает форму.
    st = np.clip(st, -9, 9)
    # Придыхательный приступ (ch, k, q, p, t) даёт в первых кадрах ложный «тон» на октаву
    # выше: кадры дальше 6 полутонов от медианы самой записи — выбросы, а не мелодия.
    оставить = np.abs(st - np.median(st)) <= 6
    if оставить.sum() >= 6:
        st = st[оставить]
    n = len(st)
    k = max(2, n // 5)
    start, end = float(np.median(st[:k])), float(np.median(st[-k:]))
    гладко = np.convolve(st, np.ones(3) / 3, mode='same') if n >= 5 else st
    imin = int(np.argmin(гладко[1:-1])) + 1 if n >= 5 else int(np.argmin(st))
    return {'start': start, 'end': end, 'min': float(гладко[imin]), 'pos_min': imin / max(1, n - 1),
            'range': float(np.percentile(st, 90) - np.percentile(st, 10)), 'mean': float(np.median(st))}


def тон(ф: dict) -> int:
    """Форма кривой → тон. Пороги — по фонетике тонов путунхуа (Chao 55/35/214/51), в
    полутонах от медианы чтеца: 4 — падение от высокого к концу; 2 — подъём от низкого к
    концу; 3 — низкий или с провалом в середине; 1 — ровный и не низкий."""
    спад, подъём = ф['start'] - ф['end'], ф['end'] - ф['start']
    провал = min(ф['start'], ф['end']) - ф['min']
    падение_в_начале = ф['start'] - ф['min']
    if спад >= 3 and ф['pos_min'] >= 0.6 and (ф['start'] > 0.5 or спад >= 4):
        return 4
    if подъём >= 3 and падение_в_начале < 2:
        return 2
    if ф['mean'] <= -1.5 or (0.2 <= ф['pos_min'] <= 0.8 and провал >= 2):
        return 3
    if abs(подъём) < 3 and ф['mean'] >= -0.5:
        return 1
    return 0  # не разобрать


def main() -> int:
    отчёт = json.load(open(os.path.join(ВЫХОД, 'zh-tones-report.json'), encoding='utf-8'))
    взятые = [o for o in отчёт if o.get('status') == 'взят']
    кривые = {}
    for o in взятые:
        c = f0(pcm(os.path.join(ВЫХОД, 'zh', o['opus'])))
        c = c[~np.isnan(c)]
        if len(c) >= 8:
            m = len(c) // 10
            кривые[o['zh']] = c[m:len(c) - m] if len(c) - 2 * m >= 6 else c
    медиана = defaultdict(list)
    for o in взятые:
        if o['zh'] in кривые:
            медиана[o['author']].append(float(np.median(кривые[o['zh']])))
    опора = {a: float(np.median(v)) for a, v in медиана.items()}
    итог, путаница = [], Counter()
    for o in взятые:
        c = кривые.get(o['zh'])
        if c is None:
            итог.append({**o, 'pitch_tone': None, 'ok': False, 'why': 'мало звонких кадров'})
            путаница[(o['tone'], 'нет')] += 1
            continue
        st = 12 * np.log2(c / опора[o['author']])
        ф = форма(st)
        т = тон(ф)
        ok = str(т) == str(o['tone'])
        итог.append({**o, 'pitch_tone': т, 'ok': ok, **{k: round(v, 2) for k, v in ф.items()}})
        путаница[(o['tone'], str(т))] += 1
    json.dump(итог, open(os.path.join(ВЫХОД, 'zh-tones-pitch.json'), 'w'), ensure_ascii=False, indent=1)
    совпало = sum(1 for x in итог if x['ok'])
    print(f'совпало {совпало} из {len(итог)} = {100 * совпало / len(итог):.1f}%')
    for t in '1234':
        ряд = {k[1]: v for k, v in путаница.items() if k[0] == t}
        print(f'  тон {t}: ' + ', '.join(f'{p}→{n}' for p, n in sorted(ряд.items())))
    print('  по классам:', {к: f"{sum(1 for x in итог if x['class'] == к and x['ok'])}/{sum(1 for x in итог if x['class'] == к)}"
                             for к in ('A', 'B')})
    if '--apply' in sys.argv:
        плохие = {x['zh'] for x in итог if not x['ok']}
        idx_p, cr_p = os.path.join(ВЫХОД, 'index.json'), os.path.join(ВЫХОД, 'credits.json')
        idx = json.load(open(idx_p, encoding='utf-8'))
        idx['zh'] = {k: v for k, v in idx.get('zh', {}).items() if k not in плохие}
        cr = [з for з in json.load(open(cr_p, encoding='utf-8')) if not (з.get('lang') == 'zh' and з.get('word') in плохие)]
        json.dump(idx, open(idx_p, 'w'), ensure_ascii=False, indent=1)
        json.dump(cr, open(cr_p, 'w'), ensure_ascii=False, indent=1)
        print(f'убрано из указателя: {len(плохие)}; в указателе zh: {len(idx["zh"])}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
