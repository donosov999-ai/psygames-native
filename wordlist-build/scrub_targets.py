# -*- coding: utf-8 -*-
"""ЧИСТКА ГОТОВЫХ НАБОРОВ ОТ ВЗРОСЛОЙ ЛЕКСИКИ.

Применяется к уже собранным JSON, а не к сборке: наборы приходят от разных
скриптов и разных заходов, а граница должна быть одна. Скрипты сборки зовут
`adult_words.взрослое()` у себя, этот проход — страховка и способ починить
готовый файл без пересборки из сети.

Что делает: раскладку с бранной БАЗОЙ выбрасывает целиком (база — заголовок
уровня), бранные ЦЕЛИ вычёркивает, а раскладку, у которой после этого осталось
меньше `МИН_СЛОВ`, тоже выбрасывает — короткий уровень хуже отсутствующего.
"""
import json, sys, pathlib
from adult_words import взрослое

МИН_СЛОВ = 6
КОРЕНЬ = pathlib.Path(__file__).resolve().parent.parent / 'frontend/src/constants'

def почистить(язык: str, файл: str) -> None:
    путь = КОРЕНЬ / файл
    было = json.loads(путь.read_text(encoding='utf-8'))
    гр = взрослое(язык)
    стало, снято_баз, снято_слов = [], 0, 0
    for p in было:
        if p['base'].lower() in гр:
            снято_баз += 1
            continue
        слова = [w for w in p['words'] if w.lower() not in гр]
        снято_слов += len(p['words']) - len(слова)
        if len(слова) < МИН_СЛОВ:
            снято_баз += 1
            continue
        стало.append({'base': p['base'], 'words': слова})
    путь.write_text(json.dumps(стало, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'{язык}: раскладок {len(было)} → {len(стало)} '
          f'(снято баз {снято_баз}, целей {снято_слов})')

if __name__ == '__main__':
    for язык, файл in [('de','allWordsDe.json'), ('es','allWordsEs.json'),
                       ('fr','allWordsFr.json'), ('it','allWordsIt.json'),
                       ('pt','allWordsPt.json')]:
        почистить(язык, файл)
