import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ProfileId, ProfileDef, PROFILE_BY_ID, PROFILES } from '@/src/constants/profiles';
import { tryUnlock, requiresUnlock } from '@/src/services/unlock';

const ACTIVE_PROFILE_KEY = 'psygames_active_profile';
const UNLOCKED_THEMED_KEY = 'psygames_unlocked_themed';   // string[] of profile ids

interface ProfileCtx {
  profile: ProfileDef;
  switchProfile: (id: ProfileId) => Promise<void>;
  ready: boolean;
  allProfiles: ProfileDef[];

  /** Set of themed profile ids the user has unlocked with codes. */
  unlockedThemed: Set<ProfileId>;
  /** Try a code → returns the unlocked profile id, or null if invalid. */
  redeemCode: (code: string) => Promise<ProfileId | null>;
  /** Forget all unlocks. */
  resetUnlocks: () => Promise<void>;
  /** Is this profile available to switch to right now? */
  isAccessible: (id: ProfileId) => boolean;
}

const Ctx = createContext<ProfileCtx | null>(null);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<ProfileDef>(PROFILE_BY_ID.denis);
  const [ready, setReady] = useState(false);
  const [unlockedThemed, setUnlockedThemed] = useState<Set<ProfileId>>(new Set());

  // Load on mount
  useEffect(() => {
    (async () => {
      try {
        const [savedProfile, savedUnlocks] = await Promise.all([
          AsyncStorage.getItem(ACTIVE_PROFILE_KEY),
          AsyncStorage.getItem(UNLOCKED_THEMED_KEY),
        ]);

        const unlocks = new Set<ProfileId>(
          savedUnlocks ? (JSON.parse(savedUnlocks) as ProfileId[]) : []
        );
        setUnlockedThemed(unlocks);

        if (savedProfile && savedProfile in PROFILE_BY_ID) {
          const candidate = PROFILE_BY_ID[savedProfile as ProfileId];
          // If saved is a themed-locked profile and unlock was cleared → fall back to FREE
          if (requiresUnlock(candidate.id) && !unlocks.has(candidate.id)) {
            const fallback = PROFILE_BY_ID.free ?? PROFILE_BY_ID.denis;
            setProfile(fallback);
          } else {
            setProfile(candidate);
          }
        }
      } catch (e) {
        console.warn('ProfileContext load failed:', e);
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const persistUnlocks = useCallback(async (next: Set<ProfileId>) => {
    try {
      await AsyncStorage.setItem(UNLOCKED_THEMED_KEY, JSON.stringify(Array.from(next)));
    } catch (e) {
      console.warn('ProfileContext persist unlocks failed:', e);
    }
  }, []);

  const switchProfile = useCallback(async (id: ProfileId) => {
    const next = PROFILE_BY_ID[id];
    if (!next) return;
    // Block switching to a locked themed profile unless unlocked
    if (requiresUnlock(id) && !unlockedThemed.has(id)) {
      console.warn('Cannot switch to locked themed profile without unlock:', id);
      return;
    }
    setProfile(next);
    try {
      await AsyncStorage.setItem(ACTIVE_PROFILE_KEY, id);
      (globalThis as any).__psygames_active_person = next.person;
    } catch (e) {
      console.warn('ProfileContext save failed:', e);
    }
  }, [unlockedThemed]);

  const redeemCode = useCallback(async (code: string): Promise<ProfileId | null> => {
    const unlocked = await tryUnlock(code);
    if (!unlocked) return null;
    const next = new Set(unlockedThemed);
    next.add(unlocked);
    setUnlockedThemed(next);
    await persistUnlocks(next);
    // Auto-switch to the just-unlocked profile
    await switchProfile(unlocked);
    return unlocked;
  }, [unlockedThemed, persistUnlocks, switchProfile]);

  const resetUnlocks = useCallback(async () => {
    setUnlockedThemed(new Set());
    try {
      await AsyncStorage.removeItem(UNLOCKED_THEMED_KEY);
    } catch (e) {
      console.warn('ProfileContext reset unlocks failed:', e);
    }
    // If current profile was a locked themed → fall back to FREE
    if (requiresUnlock(profile.id)) {
      const fallback = PROFILE_BY_ID.free ?? PROFILE_BY_ID.denis;
      setProfile(fallback);
      try { await AsyncStorage.setItem(ACTIVE_PROFILE_KEY, fallback.id); } catch {}
    }
  }, [profile.id]);

  const isAccessible = useCallback((id: ProfileId): boolean => {
    if (!requiresUnlock(id)) return true;
    return unlockedThemed.has(id);
  }, [unlockedThemed]);

  // Push current person to global on every change (for api.ts)
  useEffect(() => {
    (globalThis as any).__psygames_active_person = profile.person;
  }, [profile]);

  return (
    <Ctx.Provider value={{
      profile, switchProfile, ready, allProfiles: PROFILES,
      unlockedThemed, redeemCode, resetUnlocks, isAccessible,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useProfile(): ProfileCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useProfile must be inside ProfileProvider');
  return ctx;
}
