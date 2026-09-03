/* eslint-disable @typescript-eslint/no-require-imports */
import { CHESS_ASSIST_DEFAULT } from '@/src/games/chess-blind/core/assist';

declare const __dirname: string;

/**
 * 🔴 ПОДСКАЗКИ «ДОСКИ В УМЕ» — ОПЦИЯ, А НЕ НОВОЕ ПОВЕДЕНИЕ ПО УМОЛЧАНИЮ.
 *
 * Просьба Дениса 03.09.2026 по кадру блока «Цвет полей»: доска и разметка полей —
 * переключателями. Опасность ровно одна и записана в самом экране: «нарисуй доску —
 * и блок „поле“ перестанет мерить работу в уме». Поэтому проба сторожит не наличие
 * кнопок, а три свойства, без которых упражнение тихо перестанет быть собой:
 *   · доска ВЫКЛЮЧЕНА по умолчанию;
 *   · во время вопросов показывается ПУСТАЯ доска, а не позиция;
 *   · рядом стоит честная подпись, что это уже не работа вслепую.
 */
function читать(rel: string): string {
  const fs = require('fs');
  const path = require('path');
  return fs.readFileSync(path.resolve(__dirname, '../..', rel), 'utf8');
}

describe('подсказки в «Доске в уме»', () => {
  it('🔴 доска выключена по умолчанию — иначе замер незаметно меняется у всех', () => {
    expect(CHESS_ASSIST_DEFAULT.board).toBe(false);
  });

  it('подписи полей по умолчанию включены — они не подсказывают ответ', () => {
    // Координаты не выдают ни цвет поля, ни позицию: они лишь называют то, что и так
    // нарисовано. Прятать их незачем, а искать файл пальцем от края — мучение.
    expect(CHESS_ASSIST_DEFAULT.coords).toBe(true);
  });

  it('🔴 во время вопросов показывается ПУСТАЯ доска, а не позиция', () => {
    const экран = читать('app/games/chess-blind.tsx');
    // В ветке вопроса подсказка зовётся с null — это и есть «без фигур».
    expect(экран).toMatch(/assist\.board \? renderBoardWithCoords\(null\)/);
    // И пустая доска действительно не рисует фигур.
    const пустая = экран.slice(экран.indexOf('const renderEmptyBoard'), экран.indexOf('const renderSeriesBoard'));
    expect(пустая).not.toContain('pieceGlyph');
    expect(пустая).not.toContain('position');
  });

  it('🔴 у переключателя есть честная подпись про цену подсказки', () => {
    const словарь = читать('src/contexts/LanguageContext.tsx');
    const строка = (словарь.match(/chessAssistNote: \{ ru: '([^']+)'/) || [])[1] || '';
    expect(строка.length).toBeGreaterThan(40);
    expect(строка).toMatch(/не работа в уме|видно глазами/);
  });

  it('настройка хранится ПО ПРОФИЛЮ — один игрок не включает подсказку другому', () => {
    const сервис = читать('src/games/chess-blind/core/assist.ts');
    expect(сервис).toMatch(/psygames_chess_assist_\$\{profileId/);
  });
});
