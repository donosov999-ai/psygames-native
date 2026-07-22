/**
 * WalkingPet — «Синапс» гуляет по низу экрана (глобальный оверлей в _layout).
 *
 * Поведение: медленно ходит между случайными точками нижней кромки, между
 * переходами отдыхает 3-8 с, раз в 20-40 с бросает реплику в пузыре (реплики
 * REACTIONS с промо-сайта, язык приложения). Тап — экран питомца /pet.
 *
 * Урок FeedbackWidget учтён (репорт «кнопка мешается в игре»):
 *  - в играх (/games/*) и на самом /pet питомец скрыт; onboarding тоже —
 *    первый экран не место для отвлекающих сущностей;
 *  - тумблер «Питомец Синапс» в настройках ('psygames_pet_on') позволяет
 *    выключить прогулки совсем — НЕЗАВИСИМО от тумблера чата с разработчиками;
 *  - pointerEvents перехватывает только сам питомец (box-none на контейнерах),
 *    низ экрана остаётся кликабельным.
 */
import React from 'react';
import {
  Animated, Easing, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View,
} from 'react-native';
import { router, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import SynapsePet from '@/src/components/pet/SynapsePet';
import { getPetStats, getPetVisible, pickReaction, PetStage } from '@/src/services/pet';

const PET_SIZE = 56;
const WALK_SPEED = 34;        // px/с — прогулочный шаг, не спринт
const PAUSE_MIN = 3000;       // отдых между переходами 3-8 с
const PAUSE_SPAN = 5000;
const SPEECH_MIN = 20000;     // реплика раз в 20-40 с
const SPEECH_SPAN = 20000;
const SPEECH_SHOW = 4000;

export default function WalkingPet() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { language } = useLanguage();
  const { width } = useWindowDimensions();
  const pathname = usePathname() || '';

  const [stage, setStage] = React.useState<PetStage>(1);
  const [petOn, setPetOn] = React.useState(true);
  const [bubble, setBubble] = React.useState<string | null>(null);

  // В играх плавающие элементы мешают (проверено фидбеком) — прячемся.
  const routeAllowed = !(
    pathname.startsWith('/games/') || pathname.startsWith('/pet') || pathname.startsWith('/onboarding')
  );
  const active = petOn && routeAllowed;

  // Тумблер и стадия перечитываются при каждой навигации (как в FeedbackWidget):
  // после выхода из настроек тумблер применится, после игры стадия подрастёт.
  React.useEffect(() => {
    getPetVisible().then(setPetOn).catch(() => {});
    if (routeAllowed) getPetStats().then((s) => setStage(s.stage)).catch(() => {});
  }, [pathname, routeAllowed]);

  // Позиция/язык в ref'ах: таймеры-замыкания живут дольше рендера, а
  // перезапускать всю прогулку из-за смены языка или ресайза не хотим.
  const x = React.useRef(new Animated.Value(40)).current;
  const flip = React.useRef(new Animated.Value(1)).current;   // scaleX: 1 вправо, -1 влево
  const posRef = React.useRef(40);
  const widthRef = React.useRef(width);
  widthRef.current = width;
  const langRef = React.useRef(language);
  langRef.current = language;

  React.useEffect(() => {
    if (!active) return;
    let alive = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (fn: () => void, ms: number) => { const id = setTimeout(() => { if (alive) fn(); }, ms); timers.push(id); };

    const step = () => {
      const W = widthRef.current;
      // Гуляем в полосе 10%..90% ширины (координата — левый край спрайта)
      const min = W * 0.10;
      const max = Math.max(min + 40, W * 0.90 - PET_SIZE);
      const target = min + Math.random() * (max - min);
      const dist = Math.abs(target - posRef.current);
      // Разворот мордой по ходу движения; проход scaleX через 0 сам по себе
      // выглядит как поворот корпуса — отдельной анимации не нужно
      Animated.timing(flip, { toValue: target >= posRef.current ? 1 : -1, duration: 260, useNativeDriver: true }).start();
      // Длительность пропорциональна дистанции — скорость постоянная
      Animated.timing(x, {
        toValue: target,
        duration: Math.max(900, (dist / WALK_SPEED) * 1000),
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }).start(({ finished }) => {
        posRef.current = target;
        if (finished && alive) later(step, PAUSE_MIN + Math.random() * PAUSE_SPAN);
      });
    };

    const speak = () => {
      setBubble(pickReaction(langRef.current));
      later(() => setBubble(null), SPEECH_SHOW);
      later(speak, SPEECH_MIN + Math.random() * SPEECH_SPAN);
    };

    later(step, 1200);                                    // первый шаг почти сразу
    later(speak, SPEECH_MIN + Math.random() * SPEECH_SPAN);

    return () => {
      alive = false;
      timers.forEach(clearTimeout);
      // Запоминаем, где остановились — после возврата из игры продолжит оттуда
      x.stopAnimation((v) => { posRef.current = v; });
      flip.stopAnimation();
      setBubble(null);
    };
  }, [active, x, flip]);

  if (!active) return null;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.walker, { bottom: insets.bottom + 6, transform: [{ translateX: x }] }]}
    >
      {bubble != null && (
        <View style={[styles.bubble, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.bubbleText, { color: colors.text }]} numberOfLines={2}>{bubble}</Text>
        </View>
      )}
      <TouchableOpacity
        onPress={() => router.push('/pet' as any)}
        activeOpacity={0.8}
        accessibilityLabel="Synapse"
      >
        <Animated.View style={{ transform: [{ scaleX: flip }] }}>
          <SynapsePet stage={stage} size={PET_SIZE} />
        </Animated.View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // zIndex ниже FeedbackWidget (100) и тостов — питомец никогда ничего не перекрывает
  walker: { position: 'absolute', left: 0, alignItems: 'center', zIndex: 60 },
  // Пузырь в стиле сайта (.pet-speech): скруглён, «хвостик» — острый нижний угол
  bubble: {
    maxWidth: 170,
    marginBottom: 2,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderRadius: 13,
    borderBottomLeftRadius: 4,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  bubbleText: { fontSize: 11.5, fontWeight: '700', lineHeight: 15, textAlign: 'center' },
});
