/* psygames-player-level · VER 1 · 03.09.2026 */
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { playerLevel } from '@/src/services/featureLadder';

/**
 * УРОВЕНЬ ИГРОКА ВНУТРИ ИГРЫ — сумма пройденных уровней по ВСЕМ играм.
 *
 * 🔴 ЗАЧЕМ ОТДЕЛЬНЫЙ ХУК, А НЕ `useAllLevelStars`. Тому нужен СПИСОК игр — на
 * главной он есть, внутри игры его нет и быть не должно: экран одной игры не
 * обязан знать про остальные сорок две. Здесь список берётся из самого
 * хранилища (`getAllKeys`), поэтому новая игра попадает в счёт сама, без правки
 * этого файла. Это ровно та величина, что уже показана на главной, — иначе
 * лестница на главной и замки в игре разошлись бы в цифрах.
 *
 * ⚠️ ЧИТАЕМ НА ВХОДЕ В ЭКРАН (`useEffect`), а не на каждом возврате фокуса.
 * Причин две. Первая честная: уровень, открывшийся ПОСРЕДИ партии, дёрнул бы
 * кнопку из запертой в открытую прямо под пальцем — открытие приёма место на
 * карточке «уровень взят», а не в середине хода. Вторая техническая:
 * `useFocusEffect` тянет за собой навигацию, и от неё разом покраснели пробы
 * четырёх игр, которые про уровень игрока ничего не знают.
 *
 * ⚠️ ПОКА НЕ ЗАГРУЗИЛОСЬ — `null`, а не 0. Ноль означал бы «замки заперты», и
 * на первом кадре у опытного игрока приём мигнул бы запертым. Замок ставится
 * только по ИЗВЕСТНОМУ уровню.
 */
export function usePlayerLevel(profileId: string | undefined): number | null {
  const [уровень, setУровень] = useState<number | null>(null);

  useEffect(() => {
    let жив = true;
    (async () => {
      // Сброс тоже внутри асинхронной части: синхронный setState прямо в теле
      // эффекта заводит каскад перерисовок, и линтер ловит это правильно.
      if (!profileId) { if (жив) setУровень(null); return; }
      try {
        const хвост = `_stars_${profileId}`;
        const ключи = (await AsyncStorage.getAllKeys())
          .filter((k) => k.startsWith('psygames_') && k.endsWith(хвост));
        if (ключи.length === 0) { if (жив) setУровень(0); return; }
        const пары = await AsyncStorage.multiGet(ключи);
        const свод: Record<string, { completed: number }> = {};
        пары.forEach(([k, v]) => {
          if (!v) return;
          try {
            const m = JSON.parse(v) as Record<string, number>;
            свод[k] = { completed: Object.values(m).filter((s) => (s || 0) > 0).length };
          } catch { /* битая запись одной игры не должна ронять счёт остальных */ }
        });
        if (жив) setУровень(playerLevel(свод));
      } catch {
        if (жив) setУровень(null);   // не знаем — значит не запираем
      }
    })();
    return () => { жив = false; };
  }, [profileId]);

  return уровень;
}
