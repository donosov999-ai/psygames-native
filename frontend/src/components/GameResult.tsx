import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';

interface GameResultProps {
  time?: number;
  score?: number;
  errors?: number;
  gradient: string[];
  onPlayAgain: () => void;
  onGoHome: () => void;
}

export default function GameResult({
  time,
  score,
  errors,
  gradient,
  onPlayAgain,
  onGoHome,
}: GameResultProps) {
  const { colors } = useTheme();
  const { t } = useLanguage();

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    if (mins > 0) {
      return `${mins}:${secs.toString().padStart(2, '0')}.${ms}`;
    }
    return `${secs}.${ms} ${t('seconds')}`;
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={gradient as [string, string]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.resultCard}
      >
        <Ionicons name="trophy" size={64} color="#FFFFFF" />
        <Text style={styles.title}>{t('complete')}</Text>

        <View style={styles.statsContainer}>
          {time !== undefined && (
            <View style={styles.statItem}>
              <Ionicons name="time-outline" size={24} color="#FFFFFF" />
              <Text style={styles.statLabel}>{t('yourTime')}</Text>
              <Text style={styles.statValue}>{formatTime(time)}</Text>
            </View>
          )}

          {score !== undefined && (
            <View style={styles.statItem}>
              <Ionicons name="star" size={24} color="#FFFFFF" />
              <Text style={styles.statLabel}>{t('yourScore')}</Text>
              <Text style={styles.statValue}>{score}</Text>
            </View>
          )}

          {errors !== undefined && (
            <View style={styles.statItem}>
              <Ionicons name="close-circle-outline" size={24} color="#FFFFFF" />
              <Text style={styles.statLabel}>{t('errors')}</Text>
              <Text style={styles.statValue}>{errors}</Text>
            </View>
          )}
        </View>
      </LinearGradient>

      <View style={styles.buttonsContainer}>
        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.primary }]}
          onPress={onPlayAgain}
        >
          <Ionicons name="refresh" size={20} color="#FFFFFF" />
          <Text style={styles.buttonText}>{t('playAgain')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}
          onPress={onGoHome}
        >
          <Ionicons name="home" size={20} color={colors.text} />
          <Text style={[styles.buttonText, { color: colors.text }]}>{t('goHome')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  resultCard: {
    width: '100%',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 16,
    marginBottom: 24,
  },
  statsContainer: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-around',
    flexWrap: 'wrap',
  },
  statItem: {
    alignItems: 'center',
    minWidth: 80,
    marginVertical: 8,
  },
  statLabel: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 4,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 4,
  },
  buttonsContainer: {
    width: '100%',
    marginTop: 24,
    marginBottom: 12,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
