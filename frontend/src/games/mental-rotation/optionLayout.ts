/* psygames-mental-rotation-option-layout · VER 1 · 17.09.2026 */
/* psygames-spatial-claude-mac · задача a2967e6f, отчёт c8903296 */

export interface OptionLayout {
  /** Сторона квадрата рисунка варианта. */
  optSize: number;
  /** Все варианты одним рядом, карточка — ровно под рисунок. */
  oneRow: boolean;
}

/**
 * 🔴 РАЗМЕР ВАРИАНТА ОТВЕТА — ОТ ТОЙ СТОРОНЫ ЭКРАНА, КОТОРОЙ НЕ ХВАТАЕТ.
 *
 * Отчёт c8903296 (11.09.2026, iOS, 932×430, альбом): «картинка чуть ли не на 50 %
 * пустая». Замер 17.09.2026 на стенде: карточка 226×62, фигура 27×24 — рисунок занимал
 * 4–7 % карточки. Причина: на низком экране (высота < 560) рисунок зажимался до 48 px,
 * а карточка оставалась шириной в половину ряда. В альбоме ширины с избытком, не хватает
 * высоты, — значит варианты встают одним рядом, а размер берётся от высоты экрана.
 *
 * Портретная раскладка (сетка 2×2) и тесный разбор не меняются.
 */
export function optionLayout({ viewportWidth, viewportHeight, answerWidth, count, compactReview }: {
  viewportWidth: number; viewportHeight: number; answerWidth: number; count: number; compactReview: boolean;
}): OptionLayout {
  const compactScreen = viewportHeight < 560;
  if (compactReview) return { optSize: Math.max(24, (answerWidth - (count - 1) * 6) / count - 18), oneRow: false };
  if (compactScreen && viewportWidth >= 600) {
    const byWidth = Math.floor((Math.min(viewportWidth - 48, 760) - (count - 1) * 10) / count) - 12;
    return { optSize: Math.max(48, Math.min(Math.round(viewportHeight * 0.24), byWidth)), oneRow: true };
  }
  return { optSize: Math.min(compactScreen ? 48 : viewportHeight < 720 ? 78 : 110, Math.max(48, (answerWidth - 10) / 2 - 18)), oneRow: false };
}
