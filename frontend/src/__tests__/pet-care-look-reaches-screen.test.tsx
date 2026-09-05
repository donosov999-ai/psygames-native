/**
 * 🔴 ВНЕШНОСТЬ ЗАБОТЫ ОБЯЗАНА ДОЙТИ ДО ЭКРАНА, А НЕ ТОЛЬКО ПОСЧИТАТЬСЯ.
 *
 * Соседняя проба (`pet-look-follows-care`) проверяет ПРАВИЛО: по какой заботе
 * какой вид положен. Она полностью зелена и тогда, когда правило считается,
 * возвращает честный ответ — и этот ответ никуда не идёт. 56 нарисованных кадров
 * шкал лежат в сборке, весят мегабайты, и кот всё равно один и тот же.
 *
 * Ровно так и вышло у мелочей безделья часом раньше: списки были, а первая
 * редакция пробы их не поймала, потому что смотрела не туда. Поэтому здесь
 * рисуется настоящий `PetSprite` и сравниваются КАРТИНКИ, которые он показал.
 */
import React from 'react';
import PetSprite, { petFrame } from '@/src/components/pet/PetSprite';
import { CAT_LOOK } from '@/src/components/pet/catFrames.generated';
import { petLook, LOOK_STAGES, type PetCare } from '@/src/services/petLook';

const TestRenderer = require('react-test-renderer');  // eslint-disable-line @typescript-eslint/no-require-imports

/** Что за картинки показал спрайт при таком виде. */
function показал(props: Record<string, unknown>): string[] {
  let r: any;
  TestRenderer.act(() => { r = TestRenderer.create(<PetSprite state="idle" size={64} skin="cat" {...props} />); });
  const src = r.root.findAll((n: any) => n.type === 'Image' && n.props?.source)
    .map((n: any) => JSON.stringify(n.props.source));
  TestRenderer.act(() => { r.unmount(); });
  return src;
}

const УХОЖЕННЫЙ: PetCare = { fedDays: 7, daysSinceWash: 1, daysSincePlay: 1, stage: 1, skillAvg: 20 };

describe('внешность заботы доходит до экрана', () => {
  it('есть что проверять: восемь шкал по семь ступеней лежат в сборке', () => {
    expect(Object.keys(CAT_LOOK).sort()).toEqual(
      ['age', 'clean', 'coat', 'energy', 'glow', 'health', 'mood', 'weight'],
    );
    for (const [имя, ряд] of Object.entries(CAT_LOOK)) {
      expect(`${имя}: ${ряд.length}`).toBe(`${имя}: ${LOOK_STAGES}`);
    }
  });

  it('🔴 без вида показывается обычный покой', () => {
    const обычный = показал({});
    expect(обычный.length).toBeGreaterThan(1);           // цикл покоя, а не один кадр
    expect(обычный).toContain(JSON.stringify(petFrame('cat', 'idle', 0)));
  });

  it('🔴 с видом заботы показывается ИМЕННО кадр шкалы, а не покой', () => {
    const голодный = petLook({ ...УХОЖЕННЫЙ, fedDays: 0 });
    expect(голодный.axis).toBe('weight');
    const src = показал({ look: голодный });
    expect(src).toContain(JSON.stringify(CAT_LOOK.weight[голодный.stage]));
    // и это НЕ кадр покоя — иначе подмена не сработала
    expect(src).not.toContain(JSON.stringify(petFrame('cat', 'idle', 0)));
  });

  it('🔴 разная забота даёт РАЗНЫЕ картинки — иначе шкалы бессмысленны', () => {
    const виды = [
      petLook({ ...УХОЖЕННЫЙ, fedDays: 0 }),          // тощий
      petLook({ ...УХОЖЕННЫЙ, fedDays: 14 }),         // толстый
      petLook({ ...УХОЖЕННЫЙ, daysSinceWash: 30 }),   // грязный
      petLook({ ...УХОЖЕННЫЙ, daysSincePlay: 30 }),   // заброшенный
      petLook(УХОЖЕННЫЙ),                             // ухоженный: возраст
    ];
    const картинки = виды.map((л) => показал({ look: л }).join('|'));
    expect(new Set(картинки).size).toBe(виды.length);
  });

  it('🔴 на кадре заботы аксессуара НЕТ — якорей у шкал не снято', () => {
    const сВещью = показал({ accessory: 'party_hat' });
    const сВещьюИВидом = показал({ accessory: 'party_hat', look: petLook({ ...УХОЖЕННЫЙ, fedDays: 0 }) });
    // В обычном покое шляпа рисуется…
    expect(сВещью.length).toBeGreaterThan(сВещьюИВидом.length);
    // …а на кадре шкалы показан ровно один рисунок — сам кот.
    expect(сВещьюИВидом.length).toBe(1);
  });

  it('🔴 движение вид заботы НЕ подменяет — иначе кот застынет на ходу', () => {
    const наХоду = показал({ look: petLook({ ...УХОЖЕННЫЙ, fedDays: 0 }) });
    let r: any;
    TestRenderer.act(() => {
      r = TestRenderer.create(
        <PetSprite state="walk" size={64} skin="cat" look={petLook({ ...УХОЖЕННЫЙ, fedDays: 0 })} />,
      );
    });
    const ходьба = r.root.findAll((n: any) => n.type === 'Image' && n.props?.source)
      .map((n: any) => JSON.stringify(n.props.source));
    TestRenderer.act(() => { r.unmount(); });
    expect(ходьба).toContain(JSON.stringify(petFrame('cat', 'walk', 0)));
    expect(ходьба.length).toBeGreaterThan(наХоду.length);
  });

  it('🔴 у робота шкал нет — показывается обычный покой, а не пустота', () => {
    let r: any;
    TestRenderer.act(() => {
      r = TestRenderer.create(
        <PetSprite state="idle" size={64} skin="robot" look={petLook({ ...УХОЖЕННЫЙ, fedDays: 0 })} />,
      );
    });
    const src = r.root.findAll((n: any) => n.type === 'Image' && n.props?.source)
      .map((n: any) => JSON.stringify(n.props.source));
    TestRenderer.act(() => { r.unmount(); });
    expect(src).toContain(JSON.stringify(petFrame('robot', 'idle', 0)));
  });
});
