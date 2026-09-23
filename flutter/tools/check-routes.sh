#!/usr/bin/env bash
# Прогон маршрутов гибрида: каждая страница обязана отдать СВОЙ файл,
# а не подмениться главной (подмена = человек видит не ту игру).
set -u
PORT="$1"
WEB="$2"
ok=0; fb=0; bad=0; list=""
cd "$WEB/games" || exit 1
for f in *.html; do
  r="${f%.html}"
  own=$(wc -c < "$f" | tr -d ' ')
  code=$(curl -s -o /tmp/route.out -w "%{http_code}" "http://127.0.0.1:$PORT/games/$r")
  got=$(wc -c < /tmp/route.out | tr -d ' ')
  if [ "$code" != "200" ]; then bad=$((bad+1)); list="$list $r:код$code"
  elif [ "$got" = "$own" ]; then ok=$((ok+1))
  else fb=$((fb+1)); list="$list $r:подмена"; fi
done
echo "маршрутов проверено: $((ok+fb+bad))"
echo "  отдали свою страницу: $ok"
echo "  подменены главной:    $fb"
echo "  ошибка:               $bad"
[ -n "$list" ] && echo "  ->$list"
exit 0
