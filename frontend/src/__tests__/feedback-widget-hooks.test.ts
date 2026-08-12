/**
 * Виджет отзыва не смеет вызывать хуки ПОСЛЕ своего раннего возврата.
 *
 * ЗАЧЕМ. `FeedbackWidget` возвращает null, когда человек выключил кнопку отзыва в
 * настройках. Под этим возвратом стояли useRef и useEffect. Пока кнопка видна — хуков
 * больше; выключил — на два меньше, число не сходится, и React валит ЭКРАН ЦЕЛИКОМ:
 * «Rendered fewer hooks than expected». Не виджет — всё приложение, на любом маршруте.
 *
 * Замер 12.08.2026: чистый браузер, единственное действие — выключить кнопку отзыва.
 * Главная падает сразу. Состояние достижимое: тумблер «чат с разработчиками» есть в
 * настройках и им пользуются тестировщики.
 *
 * Ни один гейт этого не ловил, и живой прогон тоже: тумблер никто не выключал.
 * Нашлось случайно — кнопку понадобилось убрать из кадра при съёмке скриншотов.
 *
 * ⚠️ Проверка НАМЕРЕННО узкая, только про этот файл. Более широкий гейт «никаких
 * возвратов до хуков во всех экранах» я в тот же день написал и удалил: он запрещал
 * приём `if (isWebDemo()) return <Redirect/>`, который здесь применён осознанно и
 * безопасен — флаг задаётся на сборке и в пределах сборки не меняется. Гейт, падающий
 * на исправном коде, хуже отсутствия гейта.
 */
declare const __dirname: string;
declare function require(id: string): any;

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '../components/FeedbackWidget.tsx');

describe('FeedbackWidget: хуки только до раннего возврата', () => {
  const src = fs.readFileSync(FILE, 'utf8') as string;

  it('ранний возврат на месте — виджет умеет прятаться', () => {
    expect(src).toContain('if (!FEEDBACK_ENABLED || hidden) return null;');
  });

  it('после раннего возврата хуков НЕТ', () => {
    const i = src.indexOf('if (!FEEDBACK_ENABLED || hidden) return null;');
    expect(i).toBeGreaterThan(0);
    // Хвост компонента — до первой функции верхнего уровня после него.
    const after = src.slice(i);
    const cut = after.search(/\n(function |const \w+\s*=\s*\()/);
    const body = cut > 0 ? after.slice(0, cut) : after;
    const hooks = body.match(/(?:React\.)?use[A-Z]\w*\s*\(/g) ?? [];
    expect(`хуков после возврата: ${hooks.length} → ${hooks.join(', ')}`)
      .toBe('хуков после возврата: 0 → ');
  });
});
