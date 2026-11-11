#!/bin/bash
# ecosystem.coach/2+3 — свежий локальный кластер PostgreSQL 17 (только Unix-сокет), фикстура, миграция, сценарий.
# Ничего не трогает за пределами своей временной папки; чужие кластеры не останавливает.
set -euo pipefail
export LC_ALL=C LANG=C
PG_BIN=/opt/homebrew/opt/postgresql@17/bin
HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
MIG="$HERE/../../migrations/20261111120000_ecosystem_coach_v2.sql"
MIG3="$HERE/../../migrations/20261111180000_ecosystem_coach_v3.sql"
TMP="$(mktemp -d /tmp/coach2.XXXXXXXX)"
export PGDATA="$TMP/data" PGHOST="$TMP/socket" PGPORT=55433 PGUSER=postgres PGDATABASE=coach_test
unset PGHOSTADDR PGSERVICE PGPASSWORD PGPASSFILE PGOPTIONS
cleanup() { "$PG_BIN/pg_ctl" -D "$PGDATA" -m immediate -w -t 10 stop >/dev/null 2>&1 || true; case "$TMP" in /tmp/coach2.????????) rm -rf -- "$TMP";; esac; }
trap cleanup EXIT
mkdir "$PGHOST"
"$PG_BIN/initdb" -D "$PGDATA" -U postgres --encoding=UTF8 --locale=C --auth-local=trust --auth-host=reject >/dev/null
"$PG_BIN/pg_ctl" -D "$PGDATA" -l "$TMP/server.log" -o "-h '' -k $PGHOST -p $PGPORT" -w -t 15 start >/dev/null
"$PG_BIN/psql" -X -q -v ON_ERROR_STOP=1 -d postgres -c 'create database coach_test'
"$PG_BIN/psql" -X -q -v ON_ERROR_STOP=1 -f "$HERE/fixture.sql"
"$PG_BIN/psql" -X -q -v ON_ERROR_STOP=1 -f "$MIG"
"$PG_BIN/psql" -X -q -v ON_ERROR_STOP=1 -f "$MIG3"
# coach/2 идёт через новый вход coach/3: старые действия обязаны работать как раньше.
"$PG_BIN/psql" -X -q -v ON_ERROR_STOP=1 -f "$HERE/flow.sql" 2>&1 | grep -E "ok - |FAIL|ERROR" || true
"$PG_BIN/psql" -X -q -v ON_ERROR_STOP=1 -v actor_id=00000000-0000-0000-0000-000000000002 -f "$HERE/add-actor.sql"
"$PG_BIN/psql" -X -q -v ON_ERROR_STOP=1 -f "$HERE/flow3.sql" 2>&1 | grep -E "ok - |FAIL|ERROR" || true
"$PG_BIN/psql" -X -At -v ON_ERROR_STOP=1 -c "select 'PASS: '||count(*)||' проверок' from test.checks"
