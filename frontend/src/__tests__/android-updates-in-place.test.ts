/**
 * ГИБРИД НА ANDROID ОБЯЗАН ВСТАТЬ ВМЕСТО ПРЕЖНЕГО ПРИЛОЖЕНИЯ, А НЕ РЯДОМ.
 *
 * 🔴 ТРЕБОВАНИЕ ДЕНИСА 25.09.2026, дословно: «надо чтобы ставилось вместо старого
 * и историю сохраняло». Появление второго значка на телефоне — не мелкое неудобство:
 * прогресс остаётся в первом приложении, и человек видит пустой профиль. У Вали на
 * Android 515 сыгранных партий.
 *
 * 🔴 ЧТО БЫЛО В ШАБЛОНЕ, ПОКА ЭТОТ ГЕЙТ НЕ ПОЯВИЛСЯ. `flutter create` оставил в
 * `flutter/android/app/build.gradle.kts` три вещи, каждая из которых в одиночку
 * ломает обновление поверх:
 *   · applicationId = "pro.psygames.psygames_flutter" — для Google Play это ДРУГОЕ
 *     приложение, другой контейнер, другая история;
 *   · signingConfig = debug — Android принимает обновление, только если подпись
 *     совпадает с установленной; отладочный ключ даёт второе приложение или отказ;
 *   · versionCode из pubspec (у гибрида 31), тогда как в Play принят 2054024 —
 *     Play берёт только строго больший номер и отклонил бы загрузку.
 *
 * 📍 ЗАМЕР, НА КОТОРОМ СТОИТ ЧИСЛО НИЖЕ (25.09.2026, живой запрос к Google Play
 * androidpublisher v3, edits + tracks, ключ сервисного аккаунта):
 *   · `com.psygames.app` — production v2.54.24, versionCode 2054024;
 *   · `com.odv999.psygames` — 404 Package not found.
 * Второй идентификатор записан в `src-tauri/tauri.conf.json` и выглядит настоящим,
 * но приложения с таким именем в консоли НЕТ. Правду про идентификатор спрашивать
 * у Play, а не у конфига в репозитории — на этом я ошибся ровно один раз.
 *
 * ⚠️ ЧЕГО ЭТОТ ГЕЙТ НЕ ПРОВЕРЯЕТ И НЕ МОЖЕТ. Он сторожит, что сборка ВСТАНЕТ поверх.
 * Сохранится ли ИСТОРИЯ — отдельный вопрос: localStorage привязан к origin, у прежней
 * линии это `http://tauri.localhost`, у гибрида `http://127.0.0.1:<порт>`. Перенос
 * делает `flutter/lib/shell/legacy_import.dart`, и на Android его ещё нет (на iOS
 * читается WebKit-корзина того же контейнера). Доказательство переноса — только живой
 * телефон, пробой его не получить.
 */
declare const __dirname: string;
declare function require(id: string): any;

const fs = require('fs');
const path = require('path');

const GRADLE = path.join(__dirname, '../../../flutter/android/app/build.gradle.kts');
const MANIFEST = path.join(__dirname, '../../../flutter/android/app/src/main/AndroidManifest.xml');

/** Пакет живого приложения в Google Play — замер 25.09.2026, см. заголовок. */
const PLAY_PACKAGE = 'com.psygames.app';
/** versionCode, уже принятый Play. Новый обязан быть строго больше. */
const ACCEPTED_VERSION_CODE = 2054024;

describe('гибрид на Android встаёт ВМЕСТО прежнего приложения', () => {
  const gradle: string = fs.readFileSync(GRADLE, 'utf8');

  it('🔴 applicationId — пакет живого приложения в Play, а не шаблонный', () => {
    const m = gradle.match(/applicationId\s*=\s*"([^"]+)"/);
    expect(m).not.toBeNull();
    expect(m![1]).toBe(PLAY_PACKAGE);
  });

  it('🔴 подпись релиза берётся из ключа, а не всегда отладочная', () => {
    const release = gradle.slice(gradle.indexOf('buildTypes'));
    // Шаблонная строка `signingConfig = signingConfigs.getByName("debug")` без
    // всякого условия означает, что релиз подписан отладочным ключом ВСЕГДА.
    const alwaysDebug = /signingConfig\s*=\s*signingConfigs\.getByName\("debug"\)/.test(release);
    expect(alwaysDebug).toBe(false);
    expect(release).toContain('signingConfigs.getByName("release")');
    expect(gradle).toContain('ANDROID_KEYSTORE_PATH');
  });

  it('🔴 номер сборки считается по схеме старой линии и обгоняет принятый Play', () => {
    // Схема: major*1_000_000 + minor*1_000 + patch. Проверяем не текст формулы,
    // а её результат на живой версии приложения.
    expect(gradle).toMatch(/major \* 1_000_000 \+ minor \* 1_000 \+ patch/);

    const version: string = require('../../app.json').expo.version;
    const [major, minor, patch] = version.split('.').map((x: string) => parseInt(x, 10));
    const code = major * 1_000_000 + minor * 1_000 + patch;

    expect(Number.isFinite(code)).toBe(true);
    expect(code).toBeGreaterThan(ACCEPTED_VERSION_CODE);
  });

  it('под значком на телефоне — имя приложения, а не имя папки проекта', () => {
    const manifest: string = fs.readFileSync(MANIFEST, 'utf8');
    const m = manifest.match(/android:label="([^"]+)"/);
    expect(m).not.toBeNull();
    expect(m![1]).toBe('PsyGames');
  });
});
