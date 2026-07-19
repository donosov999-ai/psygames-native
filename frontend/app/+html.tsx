import React from 'react';
import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

/**
 * HTML-обёртка статического веб-экспорта (Expo Router). Применяется ко ВСЕМ страницам
 * сразу — правится здесь, а не в 70+ экранах.
 *
 * v1.122.0 — зачем файл вообще появился: без него Expo генерит
 *   <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">
 * без viewport-fit=cover. Тогда env(safe-area-inset-*) в WebView всегда 0, а
 * react-native-safe-area-context на web читает инсеты именно из env() → useSafeAreaInsets
 * отдаёт нули → SafeAreaView вырождается в обычный View, и контент (лого на главной,
 * FAB «?» в играх, кнопка фидбека) лезет под статус-бар. Репорт тестировщика:
 * «сверху лого идёт поверх системных иконок».
 *
 * На нативной сборке файл игнорируется — регрессии нет.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        {/*
          interactive-widget=resizes-content: заставляет Chromium-WebView (Android/Tauri)
          сжимать layout при открытии экранной клавиатуры, а не наезжать ею на контент.
          Тогда центрированный по вертикали блок ввода встаёт НАД клавиатурой, а не под ней.
          Чинит разом все 7 игр с полем ввода (math-sprint, digit-span, ospan,
          phonemic-fluency, reading-span, story-recall, vocab-srs). Репорт: «клавиатура
          перекрывает кнопку ввода».
        */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover, interactive-widget=resizes-content"
        />
        {/*
          Отключает скролл body на web, чтобы работал background-color у ScrollView.
          Обязателен при использовании ScrollView в статическом экспорте.
        */}
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
