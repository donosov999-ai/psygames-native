import React from 'react';
import { Image, Platform, StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

const SAFE_PREVIEW_SLUG = /^[a-z0-9-]{1,80}$/;
const subscribeToHydration = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

/**
 * Decorative game-field preview used by article embeds on psy-games.pro.
 *
 * The marketing page passes its canonical game slug as `?preview=<slug>`.
 * Native and desktop builds do not receive that parameter, so they keep the
 * existing gradient-only intro and remain fully offline.
 */
export default function GamePreviewBackground() {
  const params = useLocalSearchParams<{ preview?: string | string[] }>();
  const raw = Array.isArray(params.preview) ? params.preview[0] : params.preview;
  const candidate = typeof raw === 'string' && SAFE_PREVIEW_SLUG.test(raw) ? raw : null;
  // Static export cannot know the browser query string. useSyncExternalStore
  // keeps server hydration stable, then enables the decorative client layer.
  const hydrated = React.useSyncExternalStore(
    subscribeToHydration,
    getClientSnapshot,
    getServerSnapshot,
  );
  const slug = hydrated ? candidate : null;

  if (Platform.OS !== 'web' || !slug) return null;

  return (
    <View
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.layer}
    >
      <Image
        source={{ uri: `/gamethumbs/${slug}.webp?v=field-v2` }}
        style={styles.image}
        resizeMode="cover"
        accessible={false}
      />
      <View style={styles.scrim} />
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    overflow: 'hidden',
  },
  image: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    width: '100%',
    height: '100%',
    opacity: 0.52,
  },
  // Separate scrim protects white copy without fading the foreground itself.
  scrim: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(8, 10, 24, 0.34)',
  },
});
