import React from 'react';

/**
 * UpdateGate (v1.17.0) — desktop-only авто-апдейтер.
 *
 * При запуске в Tauri-desktop проверяет latest.json (endpoint задан в
 * tauri.conf.json → plugins.updater.endpoints) и, если есть новая версия,
 * предлагает скачать + установить + перезапустить.
 *
 * На web (GitHub Pages) и Android (Tauri mobile, где updater-плагина нет —
 * он desktop-only) тихо ничего не делает: на web нет __TAURI_INTERNALS__,
 * на Android команда updater не зарегистрирована → check() бросит → catch.
 *
 * Компонент ничего не рендерит (return null), только эффект на mount.
 */
export default function UpdateGate() {
  React.useEffect(() => {
    const w = typeof window !== 'undefined' ? (window as any) : undefined;
    const isTauri = !!w && '__TAURI_INTERNALS__' in w;
    if (!isTauri) return;

    let cancelled = false;
    (async () => {
      try {
        const { check } = await import('@tauri-apps/plugin-updater');
        const update = await check();
        if (cancelled || !update) return;

        const notes = update.body ? `\n\n${update.body}` : '';
        const ok = w.confirm(
          `Доступно обновление PsyGames ${update.version}.${notes}\n\nСкачать и установить сейчас?`
        );
        if (!ok) return;

        await update.downloadAndInstall();
        const { relaunch } = await import('@tauri-apps/plugin-process');
        await relaunch();
      } catch (err) {
        // web / Android / нет сети / нет релиза → тихо игнорируем
        // eslint-disable-next-line no-console
        console.debug('[UpdateGate] update check skipped:', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
