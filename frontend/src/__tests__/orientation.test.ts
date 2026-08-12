import { isPhysicalPhoneLandscape } from '@/src/services/orientation';

describe('isPhysicalPhoneLandscape — клавиатура не считается поворотом', () => {
  it('портретный телефон остаётся портретным при любом уменьшении viewport клавиатурой', () => {
    expect(isPhysicalPhoneLandscape({ width: 375, height: 812 })).toBe(false);
  });

  it('физически повёрнутый телефон определяется как landscape', () => {
    expect(isPhysicalPhoneLandscape({ width: 812, height: 375 })).toBe(true);
  });

  it('широкий десктоп и планшет не блокируются телефонной подсказкой', () => {
    expect(isPhysicalPhoneLandscape({ width: 1440, height: 900 })).toBe(false);
    expect(isPhysicalPhoneLandscape({ width: 1024, height: 768 })).toBe(false);
  });
});
