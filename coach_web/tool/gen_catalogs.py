"""Каталоги шагов для веб-кабинета: игры PsyGames из flutter/assets/catalog.json + названия из словарей 12 языков.
Остальные приложения пришлют свои каталоги (тот же формат) — тогда добавить сюда. Запуск: python3 tool/gen_catalogs.py"""
import json, pathlib
root = pathlib.Path(__file__).resolve().parents[2]
games = json.loads((root / 'flutter/assets/catalog.json').read_text())['games']
langs = ['en', 'ru', 'es', 'de', 'fr', 'it', 'pt', 'ar', 'hi', 'ja', 'ko', 'zh']
dicts = {l: json.loads((root / f'flutter/assets/l10n/{l}.json').read_text()) for l in langs}
def name(key, l):
    d = dicts[l]
    return d.get(key) or dicts['en'].get(key)
out = {'psygames': []}
for g in games:
    if not isinstance(g.get('nameKey'), str) or not isinstance(g.get('route'), str):
        continue
    ref = g.get('sessionType') or g['id']
    titles = {l: name(g['nameKey'], l) for l in langs if name(g['nameKey'], l)}
    groups = {l: name(g['skillKey'], l) for l in langs if g.get('skillKey') and name(g['skillKey'], l)}
    out['psygames'].append({'ref': ref, 'title': titles, 'group': groups})
for app in ['abstract-hub', 'smart-alarm', 'typerighting', 'fudao']:
    out[app] = []
(pathlib.Path(__file__).resolve().parents[1] / 'assets/catalogs.json').write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')))
print({k: len(v) for k, v in out.items()})
