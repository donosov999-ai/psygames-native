#!/usr/bin/env python3
"""ЖИВЫЕ ЗАПИСИ СЛОГОВ ДЛЯ «ТОНОВ» — с Викисклада, тем же путём, что слова корпуса.

🔴 ЗАЧЕМ. Замер 01.10.2026 (задача f52e2046): из 422 слогов банка «Тонов» запись была
у 99, и те — машинный синтез (VOICE_INDEX zh). Остальные 323 игра отдавала системному
голосу; на Android без китайского голоса они молчали — «кнопку нажимаешь и ни фига».

ОТКУДА СПИСОК. Инвентаризация registry-helper (задача eca3f880, 02.10.2026):
~/dev/psygames/languages-chat/evidence/2026-10-01-tones-android/zh-recordings-inventory.tsv —
полный перечень имён Викисклада `Zh-…`, `LL-Q9192 (cmn)…` сопоставлен с 323 слогами:
класс A (слог и тон в имени файла, `Zh-bēi.ogg`) 283, класс B (запись знака) 13, нет — 27.

⚠️ МНОГОЗНАЧНЫЕ ЗНАКИ КЛАССА B НЕ БЕРЁМ: у 假 / 转 / 空 запись знака может читаться
другим тоном, а в игре про тон неверная запись хуже, чем никакой.
⚠️ АВТОР И ЛИЦЕНЗИЯ БЕРУТСЯ У ВИКИСКЛАДА ЗАНОВО (`сведения`), а не из таблицы помощника:
таблица — указатель на файл, право — у самого файла.
⚠️ ТОН ПО ИМЕНИ ФАЙЛА — ЕЩЁ НЕ ТОН В ЗАПИСИ. Сверка по высоте звука — отдельным шагом
`scripts/check_zh_tone_pitch.py` (нужен numpy), до выкладки.

Функции скачивания, сведений о лицензии и перекодировки — из fetch_wiktionary_voice.py:
второй копии нет. Имя файла — тот же хеш `sha1('zh:<знак>')[:16].opus`.

Запуск:
  python3 scripts/fetch_zh_tone_voice.py <путь к zh-recordings-inventory.tsv>   # скачать и слить
  python3 scripts/fetch_zh_tone_voice.py --write-ts                           # переписать voiceLive.generated.ts
"""
import csv
import hashlib
import json
import os
import re
import sys
import time
import urllib.parse
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fetch_wiktionary_voice as fw  # noqa: E402

ЯЗЫК = 'zh'
МНОГОЗНАЧНЫЕ = {'假', '转', '空'}
TS = os.path.join(fw.КОРЕНЬ, 'frontend/src/constants/voiceLive.generated.ts')


def строки(путь: str) -> list:
    with open(путь, encoding='utf-8') as f:
        rows = list(csv.reader(f, delimiter='\t'))
    шапка, данные = rows[0], rows[1:]
    i_знак, i_пиньинь, i_тон, i_файл = 0, 1, 2, 3
    i_класс = next(k for k, h in enumerate(шапка) if h.startswith('класс'))
    out = []
    for r in данные:
        if len(r) <= i_класс:
            continue
        класс = r[i_класс].strip()
        if класс not in ('A', 'B') or not r[i_файл].startswith('https://'):
            continue
        if класс == 'B' and r[i_знак] in МНОГОЗНАЧНЫЕ:
            continue
        имя = urllib.parse.unquote(r[i_файл].split('/wiki/', 1)[1]).replace('_', ' ')
        out.append({'zh': r[i_знак], 'pinyin': r[i_пиньинь], 'tone': r[i_тон], 'file': fw.канон(имя), 'class': класс})
    return out


def скачать(путь_tsv: str) -> int:
    список = строки(путь_tsv)
    инфо = fw.сведения(sorted({x['file'] for x in список}))
    os.makedirs(os.path.join(fw.ВЫХОД, ЯЗЫК), exist_ok=True)
    указатель, права, отчёт = {}, [], []
    for x in список:
        сведение = инфо.get(x['file'])
        if not сведение:
            отчёт.append({**x, 'status': 'нет лицензии или адреса'})
            continue
        url, автор, лиц = сведение
        имя = hashlib.sha1(f"{ЯЗЫК}:{x['zh']}".encode()).hexdigest()[:16] + '.opus'
        цель = os.path.join(fw.ВЫХОД, ЯЗЫК, имя)
        if not os.path.exists(цель):                      # идемпотентно
            сырьё = цель + '.src'
            try:
                open(сырьё, 'wb').write(fw.достать(url))
            except Exception as e:  # noqa: BLE001
                отчёт.append({**x, 'status': f'не скачан: {e}'})
                continue
            ок = fw.перекодировать(сырьё, цель)
            os.remove(сырьё)
            if not ок:
                if os.path.exists(цель):
                    os.remove(цель)
                отчёт.append({**x, 'status': 'не перекодирован'})
                continue
            time.sleep(0.5)   # темп, на котором Викимедиа не отбивает
        указатель[x['zh']] = имя
        права.append({'lang': ЯЗЫК, 'word': x['zh'], 'file': x['file'], 'author': автор, 'license': лиц})
        отчёт.append({**x, 'status': 'взят', 'opus': имя, 'author': автор, 'license': лиц})
    # 🔴 СЛИВАЕМ, А НЕ ПЕРЕЗАПИСЫВАЕМ — как fetch_wiktionary_voice.py: другие языки не трогаем.
    путьУказателя = os.path.join(fw.ВЫХОД, 'index.json')
    путьПрав = os.path.join(fw.ВЫХОД, 'credits.json')
    весь = json.load(open(путьУказателя, encoding='utf-8')) if os.path.exists(путьУказателя) else {}
    весь[ЯЗЫК] = {**весь.get(ЯЗЫК, {}), **указатель}
    прежние = json.load(open(путьПрав, encoding='utf-8')) if os.path.exists(путьПрав) else []
    свои = {з['word'] for з in права}
    прежние = [з for з in прежние if not (з.get('lang') == ЯЗЫК and з.get('word') in свои)]
    json.dump(весь, open(путьУказателя, 'w'), ensure_ascii=False, indent=1)
    json.dump(прежние + права, open(путьПрав, 'w'), ensure_ascii=False, indent=1)
    with open(os.path.join(fw.ВЫХОД, 'zh-tones-report.json'), 'w') as f:
        json.dump(отчёт, f, ensure_ascii=False, indent=1)
    взято = sum(1 for o in отчёт if o['status'] == 'взят')
    print(f'zh: взято {взято} из {len(список)} (A {sum(1 for x in список if x["class"] == "A")}, '
          f'B {sum(1 for x in список if x["class"] == "B")}); всего в указателе zh: {len(весь[ЯЗЫК])}')
    return 0


def _литерал(obj: dict) -> str:
    def одна(слова: dict) -> str:
        return '{ ' + ', '.join(f'{json.dumps(k, ensure_ascii=False)}: {json.dumps(v, ensure_ascii=False)}'
                                for k, v in sorted(слова.items())) + ' }'
    return '{\n' + ''.join(f'  {json.dumps(l, ensure_ascii=False)}: {одна(obj[l])},\n' for l in sorted(obj)) + '}'


def записать_ts() -> int:
    """Переписывает ТОЛЬКО три выгрузки в voiceLive.generated.ts — шапка с историей остаётся.

    ⚠️ Прежде чем дописывать язык, функция проверяет, что из index.json/credits.json она
    воспроизводит НЫНЕШНИЕ данные файла по прочим языкам байт в байт: иначе генератор
    молча переписал бы чужие записи (в репо не было кода, который этот файл писал)."""
    указатель = json.load(open(os.path.join(fw.ВЫХОД, 'index.json'), encoding='utf-8'))
    права = json.load(open(os.path.join(fw.ВЫХОД, 'credits.json'), encoding='utf-8'))
    текст = open(TS, encoding='utf-8').read()

    def заменить(текст: str, имя: str, новое: str) -> str:
        начало = текст.index(f'export const {имя}')
        равно = текст.index('=', начало)
        конец = текст.index(';\n', равно)
        return текст[:равно + 2] + новое + текст[конец:]

    счёт = {l: len(v) for l, v in sorted(указатель.items())}
    авторы = Counter((з['author'], з['license']) for з in права)
    credits = '[\n' + ''.join(
        f'  {{ author: {json.dumps(a, ensure_ascii=False)}, license: {json.dumps(лиц, ensure_ascii=False)}, count: {n} }},\n'
        for (a, лиц), n in sorted(авторы.items(), key=lambda kv: (-kv[1], kv[0][0], kv[0][1]))) + ']'
    новый = заменить(текст, 'VOICE_LIVE:', _литерал(указатель))
    новый = заменить(новый, 'VOICE_LIVE_COUNTS', '{ ' + ', '.join(f'{json.dumps(l)}: {n}' for l, n in счёт.items()) + ' }')
    новый = заменить(новый, 'VOICE_LIVE_CREDITS', credits)
    open(TS, 'w', encoding='utf-8').write(новый)
    print(f'voiceLive.generated.ts: языки {счёт}, авторов {len(авторы)}')
    return 0


if __name__ == '__main__':
    if sys.argv[1:2] == ['--write-ts']:
        sys.exit(записать_ts())
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    sys.exit(скачать(sys.argv[1]))
