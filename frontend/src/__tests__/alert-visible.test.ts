/* psygames-alert-visible · VER 1 · 21.08.2026 */
/**
 * СООБЩЕНИЕ, КОТОРОГО НЕ ВИДНО, — ЭТО НЕ СООБЩЕНИЕ.
 *
 * 🔴 ЧТО НАШЛОСЬ. `Alert` из react-native-web — буквально `static alert() {}`.
 * Android у нас WebView с той же веб-сборкой, значит ВСЕ 22 вызова в приложении
 * не показывали ничего: подтверждение копирования кода прогресса, исход импорта,
 * просьба разрешить уведомления и весь разговор про обновление.
 *
 * Проверено исполнением в браузере: нажатие «Проверить обновления» не давало ни
 * окна, ни текста, ни перехваченного `window.alert`.
 */
declare const __dirname: string;
declare function require(m: string): any;
const { readFileSync } = require('fs');
const { join } = require('path');

/**
 * ⚠️ Дублёр собирается ВНУТРИ фабрики. Первая редакция ссылалась на внешнюю
 * переменную — импорты поднимаются выше объявлений, и к моменту подмены её ещё
 * не существовало: `Platform` приезжал пустым и падал на первой же проверке.
 */
jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
  Alert: { alert: (...a: any[]) => { (globalThis as any).__nativeAlert.push(a); } },
}));
const mockPlatform: { OS: string } = require('react-native').Platform;

import { Alert, alertText, actionButton, cancelButton, confirmText } from '@/src/services/alert';


let alerts: string[];
let confirms: string[];
let answer = true;

beforeEach(() => {
  alerts = []; confirms = []; answer = true;
  mockPlatform.OS = 'web';
  (globalThis as any).__nativeAlert = [];
  (globalThis as any).window = {
    alert: (m: string) => { alerts.push(m); },
    confirm: (m: string) => { confirms.push(m); return answer; },
  };
});

describe('сообщение доходит до человека', () => {
  it('🔴 простое сообщение показывается, а не исчезает', () => {
    Alert.alert('Готово', 'Код скопирован');
    expect(alerts).toEqual(['Готово\n\nКод скопирован']);
  });

  it('заголовок без текста тоже показывается', () => {
    Alert.alert('Скопировано');
    expect(alerts).toEqual(['Скопировано']);
  });

  it('🔴 две кнопки — это вопрос, и он задаётся', () => {
    const скачал: string[] = [];
    Alert.alert('Есть обновление v1.211.0', 'Скачать сейчас?', [
      { text: 'Позже', style: 'cancel' },
      { text: 'Скачать', onPress: () => скачал.push('да') },
    ]);
    expect(confirms.length).toBe(1);
    expect(скачал).toEqual(['да']);
  });

  /** Человек видит только «ОК» — значит подпись действия обязана быть в тексте. */
  it('🔴 в вопросе написано, что сделает «ОК»', () => {
    Alert.alert('Есть обновление', 'Готово к установке', [
      { text: 'Позже', style: 'cancel' },
      { text: 'Скачать', onPress: () => {} },
    ]);
    expect(confirms[0]).toContain('Скачать');
  });

  it('🔴 отказ не запускает действие', () => {
    answer = false;
    const скачал: string[] = [];
    const отменил: string[] = [];
    Alert.alert('Есть обновление', undefined, [
      { text: 'Позже', style: 'cancel', onPress: () => отменил.push('да') },
      { text: 'Скачать', onPress: () => скачал.push('да') },
    ]);
    expect(скачал).toEqual([]);
    expect(отменил).toEqual(['да']);
  });

  it('одна кнопка — её действие всё равно случается', () => {
    const нажал: string[] = [];
    Alert.alert('Импорт готов', '12 записей', [{ text: 'Хорошо', onPress: () => нажал.push('да') }]);
    expect(alerts.length).toBe(1);
    expect(нажал).toEqual(['да']);
  });

  it('нет окна вовсе — не роняем экран', () => {
    (globalThis as any).window = {};
    expect(() => Alert.alert('Тишина')).not.toThrow();
  });

  it('настоящий нативный слой не подменяем', () => {
    mockPlatform.OS = 'ios';
    Alert.alert('Родное', 'окно');
    expect((globalThis as any).__nativeAlert.length).toBe(1);
    expect(alerts).toEqual([]);
  });
});

describe('разбор кнопок', () => {
  it('действие — не «отмена»', () => {
    const bs = [{ text: 'Позже', style: 'cancel' as const }, { text: 'Скачать' }];
    expect(actionButton(bs)?.text).toBe('Скачать');
    expect(cancelButton(bs)?.text).toBe('Позже');
  });

  it('кнопок нет — и разбирать нечего', () => {
    expect(actionButton(undefined)).toBeNull();
    expect(cancelButton([])).toBeNull();
  });

  it('склейка не оставляет пустых строк', () => {
    expect(alertText('Только заголовок', '')).toBe('Только заголовок');
    expect(alertText('А', 'Б')).toBe('А\n\nБ');
  });

  it('без подписи действия текст вопроса не портится', () => {
    expect(confirmText('Вопрос', 'текст', [{ style: 'cancel' }, {}])).toBe('Вопрос\n\nтекст');
  });
});

/**
 * 🔴 ГЛАВНОЕ: НИ ОДИН ЭКРАН НЕ БЕРЁТ `Alert` ИЗ react-native. Одного починенного
 * экрана мало — сломан был получатель, общий для всех. Проверка со срезанными
 * комментариями: в шапках про эту ловушку написано словами.
 */
describe('никто не берёт пустой Alert', () => {
  /**
   * 🔴 ПРОВЕРЯЕМ ВСЕ ФАЙЛЫ, А НЕ ТРИ ПО СПИСКУ.
   *
   * Первая редакция держала `SCREENS` из трёх путей — и мимо неё спокойно
   * прошёл `GameShell`: он брал `Alert` из react-native, поэтому кнопка
   * «пропустить упражнение» в зарядке нажималась и НЕ ДЕЛАЛА НИЧЕГО. Денис
   * 30.08.2026: «нет кнопки пропустить… она не срабатывает при нажатии».
   *
   * Ручной список ловит ровно тех, кого в него внесли, — то есть уже известных.
   * Проверка по свойству ловит следующего.
   */
  const { readdirSync, statSync } = require('fs');
  const ROOT = join(__dirname, '..', '..');
  const walk = (dir: string, acc: string[] = []): string[] => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name === '__tests__' || name.startsWith('.')) continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full, acc);
      else if (/\.tsx?$/.test(name)) acc.push(full);
    }
    return acc;
  };
  const ALL = [...walk(join(ROOT, 'app')), ...walk(join(ROOT, 'src'))]
    .filter((f: string) => !f.endsWith(join('services', 'alert.ts')));

  it('есть что проверять: файлов много', () => {
    expect(ALL.length).toBeGreaterThan(100);
  });

  it('🔴 НИ ОДИН файл не берёт Alert из react-native', () => {
    const guilty = ALL.filter((f: string) => {
      const c = readFileSync(f, 'utf8');
      const rn = c.match(/import \{([^}]*)\} from 'react-native';/);
      return !!rn && /\bAlert\b/.test(rn[1]);
    }).map((f: string) => f.slice(ROOT.length + 1));
    expect(guilty).toEqual([]);
  });

  it('🔴 кто зовёт Alert.alert — берёт его из своего сервиса', () => {
    const missing = ALL.filter((f: string) => {
      const c = readFileSync(f, 'utf8');
      return /Alert\.alert\(/.test(c) && !/from '@\/src\/services\/alert'/.test(c);
    }).map((f: string) => f.slice(ROOT.length + 1));
    expect(missing).toEqual([]);
  });
});
