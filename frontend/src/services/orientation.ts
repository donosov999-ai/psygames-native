export interface ScreenSize {
  width: number;
  height: number;
}

/**
 * Физическая ориентация телефона. В отличие от layout/visual viewport,
 * размеры screen не уменьшаются, когда Android показывает клавиатуру.
 */
export function isPhysicalPhoneLandscape(screen: ScreenSize): boolean {
  return screen.width > screen.height && screen.height < 480;
}
