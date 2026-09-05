#!/usr/bin/env python3
"""
🔴 НАБОР СЛОВ ДЛЯ РЕЖИМА «НАЙДИ ВСЕ СЛОВА» — РУССКИЙ.

Собирает раскладки: база из 7–8 букв и слова, которые из неё складываются.
Данные берутся из двух источников со свободной лицензией, проверенной ФАЙЛОМ:

  · Goudron/ru-spelling-dictionary — MPL-2.0 (SPDX в самом LICENSE),
    орфографический словарь, 575 475 записей, кодировка KOI8-R;
  · hermitdave/FrequencyWords — MIT, частотность по корпусу OpenSubtitles.

⚠️ ПОЧЕМУ НЕ ХВАТАЕТ ОДНОЙ ЧАСТОТНОСТИ. Частотный список построен по субтитрам и
содержит СЛОВОФОРМЫ, а не леммы: в цели просачивались «врат» (род. п. от
«врата»), «рака», «карла». Отсюда морфологический разбор pymorphy3 (MIT) и
требование начальной формы.

🔴 И ПОЧЕМУ НЕДОСТАТОЧНО ТЕГА `Name`. Слова, которых морфология НЕ ЗНАЕТ, она
угадывает по окончанию и молча выдаёт за существительные: «абигейл», «гейба»,
«биг» разбирались со счётом 0,5 — это признак угадывания. Спасает `is_known`.

Замер 06.09.2026 (см. ../WORDLIST_RESEARCH.md):
  целей 5163 · раскладок 1566 · подслов на раскладку: медиана 10.

Запуск:
    python3 -m venv .venv && ./.venv/bin/pip install pymorphy3 pymorphy3-dicts-ru
    ./.venv/bin/python3 build_ru_targets.py
"""
import json
import os
import re
import sys
import urllib.request

СЛОВАРЬ = "https://raw.githubusercontent.com/Goudron/ru-spelling-dictionary/master/ru_RU.dic"
ЧАСТОТЫ = "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/ru/ru_50k.txt"
ПОТОЛОК_РАНГА = 50_000
МИН_ПОДСЛОВ = 6
МАКС_ПОДСЛОВ = 14           # больше на экран не помещается, а меньше — скучно
ПОТОЛОК_БАЗЫ = 20_000       # база — частое слово: иначе в базы лезут редкости
ИМЕННЫЕ = {"Name", "Surn", "Patr", "Geox", "Orgn", "Trad", "Abbr", "Infr", "Slng", "Arch"}


def скачать(url: str, имя: str) -> str:
    if not os.path.exists(имя):
        urllib.request.urlretrieve(url, имя)
    return имя


def основы_и_имена(путь: str):
    """⚠️ Файл в KOI8-R, первая строка — счётчик, после слова идёт «/флаги»."""
    основы, имена = set(), set()
    with open(путь, encoding="koi8-r") as f:
        next(f)
        for стр in f:
            w = стр.split("/")[0].strip()
            if not w:
                continue
            if w[:1].isupper():
                имена.add(w.lower())
            elif re.fullmatch(r"[а-яё]{3,8}", w):
                основы.add(w)
    return основы, имена


def влезает(слово: str, банк: str) -> bool:
    остаток = list(банк)
    for c in слово:
        if c not in остаток:
            return False
        остаток.remove(c)
    return True


def main() -> int:
    import pymorphy3
    m = pymorphy3.MorphAnalyzer()

    основы, имена = основы_и_имена(скачать(СЛОВАРЬ, "ru_RU.dic"))
    ранг = {}
    with open(скачать(ЧАСТОТЫ, "ru_50k.txt"), encoding="utf-8") as f:
        for i, стр in enumerate(f):
            ранг.setdefault(стр.split()[0], i)

    def годное(w: str) -> bool:
        разборы = m.parse(w)
        if not any(p.is_known for p in разборы):
            return False                       # угадано по окончанию — не слово
        if any(ИМЕННЫЕ & set(p.tag.grammemes) for p in разборы):
            return False
        p = next(x for x in разборы if x.is_known)
        т = p.tag
        if p.normal_form != w:
            return False                       # только начальная форма
        if "NOUN" in т:
            return т.case == "nomn" and т.number == "sing"
        if "ADJF" in т:
            return т.case == "nomn" and т.number == "sing" and т.gender == "masc"
        return "INFN" in т

    кандидаты = [w for w, r in ранг.items()
                 if r < ПОТОЛОК_РАНГА and w in основы and w not in имена
                 and re.fullmatch(r"[а-яё]{3,8}", w)]
    цели = sorted({w for w in кандидаты if годное(w)})

    раскладки = []
    for база in (w for w in цели if len(w) in (7, 8) and ранг.get(w, 10 ** 9) < ПОТОЛОК_БАЗЫ):
        под = [w for w in цели if w != база and влезает(w, база)]
        if len(под) < МИН_ПОДСЛОВ:
            continue
        под.sort(key=lambda x: (-len(x), x))   # длинные интереснее коротких
        раскладки.append({"base": база, "words": sorted(под[:МАКС_ПОДСЛОВ])})

    with open("../frontend/src/constants/allWordsRu.json", "w", encoding="utf-8") as f:
        json.dump(раскладки, f, ensure_ascii=False, separators=(",", ":"))
    длины = sorted(len(x["words"]) for x in раскладки)
    print(f"целей {len(цели)} · раскладок {len(раскладки)} · "
          f"подслов медиана {длины[len(длины) // 2] if длины else 0}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
