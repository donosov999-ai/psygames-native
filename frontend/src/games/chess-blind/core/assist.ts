/* psygames-chess-blind-assist · VER 1 · 03.09.2026 */
/**
 * ПОДСКАЗКИ «ДОСКИ В УМЕ»: пустая доска и подписи полей.
 *
 * ЗАЧЕМ. Просьба Дениса 03.09.2026 по кадру блока «Цвет полей»: «надо в это
 * упражнение добавить в настройки возможность показывать шахматную доску, и ещё
 * как опция показывать разметку a, b и т. д. по краям доски».
 *
 * 🔴 ЭТО ИМЕННО ПОДСКАЗКА, И ОНА МЕНЯЕТ ТО, ЧТО МЕРИТ УПРАЖНЕНИЕ. В самом экране
 * прямо записано, почему доски во время вопросов нет: «нарисуй её — и блок „поле“
 * перестанет мерить работу в уме: цвет клеток видно глазами». Поэтому:
 *   · выключено по умолчанию;
 *   · доска показывается ПУСТОЙ — она помогает найти e1 и f7, но не выдаёт
 *     запомненную позицию, иначе сломался бы и блок памяти;
 *   · рядом честная подпись, что с доской это уже не работа вслепую.
 *
 * ⚠️ Хранится по профилю: у Дениса и у ребёнка могут быть разные ответы на вопрос
 * «нужна ли мне подсказка», и общий ключ означал бы, что один включает другому.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface ChessAssist {
  /** Показывать пустую доску во время вопросов. */
  board: boolean;
  /** Подписи файлов и рядов (a–h, 1–8) по краям доски. */
  coords: boolean;
}

export const CHESS_ASSIST_DEFAULT: ChessAssist = { board: false, coords: true };

const KEY = (profileId: string | undefined) => `psygames_chess_assist_${profileId ?? 'guest'}`;

export async function readChessAssist(profileId: string | undefined): Promise<ChessAssist> {
  try {
    const raw = await AsyncStorage.getItem(KEY(profileId));
    if (!raw) return CHESS_ASSIST_DEFAULT;
    const v = JSON.parse(raw);
    return {
      board: typeof v?.board === 'boolean' ? v.board : CHESS_ASSIST_DEFAULT.board,
      coords: typeof v?.coords === 'boolean' ? v.coords : CHESS_ASSIST_DEFAULT.coords,
    };
  } catch { return CHESS_ASSIST_DEFAULT; }   // порченая запись не должна ронять игру
}

export async function writeChessAssist(profileId: string | undefined, value: ChessAssist): Promise<void> {
  try { await AsyncStorage.setItem(KEY(profileId), JSON.stringify(value)); } catch { /* настройка — удобство */ }
}
