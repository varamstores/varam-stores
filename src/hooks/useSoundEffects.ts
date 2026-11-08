import { useState, useEffect, useCallback } from 'react';
import { soundEffects } from '../utils/soundEffects';

export const useSoundEffects = () => {
  const [isMuted, setIsMuted] = useState<boolean>(() => soundEffects.isMuted());

  useEffect(() => {
    const handleToggle = (e: Event) => {
      const customEvent = e as CustomEvent<{ muted: boolean }>;
      if (customEvent.detail && typeof customEvent.detail.muted === 'boolean') {
        setIsMuted(customEvent.detail.muted);
      } else {
        setIsMuted(soundEffects.isMuted());
      }
    };

    window.addEventListener('varam_sound_toggle', handleToggle);
    return () => {
      window.removeEventListener('varam_sound_toggle', handleToggle);
    };
  }, []);

  const toggleSound = useCallback(() => {
    const nextMuted = soundEffects.toggleMute();
    setIsMuted(nextMuted);
    if (!nextMuted) {
      // Play a friendly confirmation chime when unmuting!
      soundEffects.playTap();
    }
  }, []);

  return {
    isMuted,
    toggleSound,
    soundEffects,
  };
};

