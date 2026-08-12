/// <reference types="vite/client" />

interface Window {
  Telegram?: {
    WebApp?: {
      ready?: () => void;
      expand?: () => void;
      close?: () => void;
      colorScheme?: 'light' | 'dark';
      initDataUnsafe?: { user?: { id?: number; language_code?: string } };
    };
  };
}
