#!/usr/bin/env bash
# Кладёт веб-сборку ВНУТРЬ приложения, чтобы гибрид работал офлайн на любом телефоне.
#
# 🔴 ЗАЧЕМ. Пока проверяли на маке, WebView тянул страницы с localhost. На чужом
# телефоне это белый экран: сервера там нет. Поэтому dist кладётся в ассеты и
# открывается через loadFlutterAsset — без сети и без сервера.
#
# ⚠️ ГЛАВНАЯ ГРАБЛЯ FLUTTER. Строка `- assets/web/` в pubspec берёт только файлы
# САМОЙ папки, вложенные каталоги надо перечислять ПОИМЁННО. Замер 23.09.2026:
# без перечисления сборка вышла 17,9 МБ вместо 101,5 — ассеты просто не попали
# внутрь, а сборка при этом ЗЕЛЁНАЯ. Поэтому список генерируется здесь.
#
# ⚠️ Имена переменных латиницей: bash на маке 3.2, и кириллическое имя он
# принимает за команду («КОРЕНЬ=…: No such file or directory»). Наступал дважды.
#
# В git веб-сборка не кладётся: 83 МБ, и она пересобирается из исходников.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WEB="$ROOT/frontend"
DST="$ROOT/flutter/assets/web"

# 🔴 СОБИРАЕМ С ПУСТЫМ БАЗОВЫМ ПУТЁМ. В app.json стоит baseUrl "/psygames-web" —
# он нужен раздаче на GH Pages, но внутри приложения ломает всё: ссылки вида
# `/psygames-web/_expo/...` из file:// уедут в корень файловой системы, и человек
# увидит белый экран. Ровно этот же приём делает CI для сборок Tauri
# (.github/workflows/build.yml, шаги «Build web (baseUrl=\"\")»).
DIST="$WEB/dist-app"
if [ ! -f "$DIST/index.html" ] || [ "${REBUILD:-0}" = "1" ]; then
  echo "собираю веб-часть с baseUrl=\"\" (expo export)…"
  cp "$WEB/app.json" "$WEB/app.json.embed-bak"
  trap 'mv -f "$WEB/app.json.embed-bak" "$WEB/app.json" 2>/dev/null || true' EXIT
  sed -i '' 's|"baseUrl": "/psygames-web"|"baseUrl": ""|' "$WEB/app.json"
  (cd "$WEB" && rm -rf dist-app && npx expo export -p web --output-dir dist-app >/dev/null)
  mv -f "$WEB/app.json.embed-bak" "$WEB/app.json"
  trap - EXIT
fi
[ -f "$DIST/index.html" ] || { echo "❌ нет $DIST/index.html — веб-сборка не собралась"; exit 1; }
grep -q 'src="/psygames-web' "$DIST/index.html" && { echo "❌ в сборке остался базовый путь /psygames-web — внутри приложения она не откроется"; exit 1; }

rm -rf "$DST"
mkdir -p "$DST"
rsync -a "$DIST/" "$DST/"

python3 - "$ROOT" <<'PY'
import pathlib, sys, re
root = pathlib.Path(sys.argv[1])
dst = root / 'flutter' / 'assets' / 'web'
dirs = sorted({'assets/web/'} | {
    str(p.relative_to(root / 'flutter')) + '/' for p in dst.rglob('*') if p.is_dir()})
p = root / 'flutter' / 'pubspec.yaml'
t = p.read_text()
t = re.sub(r'\n(    - assets/web/[^\n]*)+', '', t)
t = t.replace('    - assets/levels/', '    - assets/levels/\n' + '\n'.join(f'    - {d}' for d in dirs))
p.write_text(t)
files = sum(1 for x in dst.rglob('*') if x.is_file())
print(f'вложено файлов: {files}, каталогов в pubspec: {len(dirs)}')
PY
echo "✅ веб-часть внутри приложения: $(du -sh "$DST" | cut -f1)"
