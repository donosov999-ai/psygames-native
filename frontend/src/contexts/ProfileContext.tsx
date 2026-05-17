import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ProfileId, ProfileDef, PROFILE_BY_ID, PROFILES } from '@/src/constants/profiles';

const ACTIVE_PROFILE_KEY = 'psygames_active_profile';

interface ProfileCtx {
  profile: ProfileDef;
  switchProfile: (id: ProfileId) => Promise<void>;
  ready: boolean;
  allProfiles: ProfileDef[];
}

const Ctx = createContext<ProfileCtx | null>(null);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<ProfileDef>(PROFILE_BY_ID.denis);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(ACTIVE_PROFILE_KEY);
        if (saved && saved in PROFILE_BY_ID) {
          setProfile(PROFILE_BY_ID[saved as ProfileId]);
        }
      } catch (e) {
        console.warn('ProfileContext load failed:', e);
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const switchProfile = useCallback(async (id: ProfileId) => {
    const next = PROFILE_BY_ID[id];
    if (!next) return;
    setProfile(next);
    try {
      await AsyncStorage.setItem(ACTIVE_PROFILE_KEY, id);
      // Also expose to api.ts via global so saveSession() can tag person without context dependency
      (globalThis as any).__psygames_active_person = next.person;
    } catch (e) {
      console.warn('ProfileContext save failed:', e);
    }
  }, []);

  // Push current person to global on every change (for api.ts)
  useEffect(() => {
    (globalThis as any).__psygames_active_person = profile.person;
  }, [profile]);

  return (
    <Ctx.Provider value={{ profile, switchProfile, ready, allProfiles: PROFILES }}>
      {children}
    </Ctx.Provider>
  );
}

export function useProfile(): ProfileCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useProfile must be inside ProfileProvider');
  return ctx;
}
