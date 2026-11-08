/**
 * High-performance, zero-asset Web Audio API sound effects engine.
 * Synthesizes delightful, tactile micro-interaction sounds (Add to Cart, Wishlist,
 * Quantity Changes, Checkout Success, and Drawer transitions) in pure code with 0KB assets.
 */

class SoundEffectsEngine {
  private ctx: AudioContext | null = null;
  private muted: boolean = false;

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('varam_sound_enabled');
        this.muted = saved === 'false';
      } catch {
        this.muted = false;
      }
    }
  }

  /**
   * Initializes or resumes the AudioContext on user gesture.
   */
  private getContext(): AudioContext | null {
    if (this.muted) return null;
    if (typeof window === 'undefined') return null;

    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    return this.ctx;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    try {
      localStorage.setItem('varam_sound_enabled', (!muted).toString());
      window.dispatchEvent(new CustomEvent('varam_sound_toggle', { detail: { muted } }));
    } catch {
      // ignore
    }
  }

  public toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  /**
   * 1. ADD TO BASKET: Satisfying, juicy tactile pop & upward harmonic chime
   */
  public playAddToCart(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;

      // Primary sine pop (520Hz -> 840Hz pitch sweep)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(520, now);
      osc1.frequency.exponentialRampToValueAtTime(840, now + 0.08);

      gain1.gain.setValueAtTime(0.0001, now);
      gain1.gain.linearRampToValueAtTime(0.14, now + 0.006);
      gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);

      osc1.connect(gain1);
      gain1.connect(ctx.destination);

      osc1.start(now);
      osc1.stop(now + 0.13);

      // Soft harmonic shine layer (Triangle note at 1046Hz [C6])
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();

      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(1046.5, now + 0.03);

      gain2.gain.setValueAtTime(0.0001, now);
      gain2.gain.setValueAtTime(0.0001, now + 0.03);
      gain2.gain.linearRampToValueAtTime(0.06, now + 0.035);
      gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);

      osc2.connect(gain2);
      gain2.connect(ctx.destination);

      osc2.start(now + 0.03);
      osc2.stop(now + 0.17);
    } catch {
      // Audio context error fallback
    }
  }

  /**
   * 2. WISHLIST:
   * - Added: Sweet, warm double-note bell chime (E5 -> C6)
   * - Removed: Soft, neutral release blip
   */
  public playWishlist(added: boolean): void {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;

      if (added) {
        // Note 1: Warm E5 (659Hz)
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(659.25, now);

        gain1.gain.setValueAtTime(0.0001, now);
        gain1.gain.linearRampToValueAtTime(0.12, now + 0.008);
        gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start(now);
        osc1.stop(now + 0.23);

        // Note 2: Cheerful C6 (1046.5Hz) staggered slightly
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(1046.5, now + 0.06);

        gain2.gain.setValueAtTime(0.0001, now);
        gain2.gain.setValueAtTime(0.0001, now + 0.06);
        gain2.gain.linearRampToValueAtTime(0.1, now + 0.068);
        gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);

        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(now + 0.06);
        osc2.stop(now + 0.29);
      } else {
        // Soft descending release blip (440Hz -> 320Hz)
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(320, now + 0.08);

        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(0.07, now + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.1);
      }
    } catch {
      // Audio context error fallback
    }
  }

  /**
   * 3. QUANTITY CHANGE: Tactile haptic micro-clicks
   * - Increment: Crisp upward tick (720Hz -> 960Hz)
   * - Decrement: Soft downward tick (580Hz -> 420Hz)
   */
  public playQuantityChange(isIncrement: boolean): void {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';

      if (isIncrement) {
        osc.frequency.setValueAtTime(720, now);
        osc.frequency.exponentialRampToValueAtTime(960, now + 0.04);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(0.09, now + 0.003);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
      } else {
        osc.frequency.setValueAtTime(580, now);
        osc.frequency.exponentialRampToValueAtTime(420, now + 0.04);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(0.07, now + 0.003);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
      }

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.06);
    } catch {
      // Audio context error fallback
    }
  }

  /**
   * 4. REMOVE FROM CART: Soft snap & subtle descending bubble
   */
  public playRemoveFromCart(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(380, now);
      osc.frequency.exponentialRampToValueAtTime(160, now + 0.09);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.09, now + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.11);
    } catch {
      // Audio context error fallback
    }
  }

  /**
   * 5. COUPON APPLIED: Cheerful 3-note ascending arpeggio (C5 -> E5 -> G5)
   */
  public playCoupon(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
      notes.forEach((freq, idx) => {
        const noteTime = ctx.currentTime + idx * 0.055;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, noteTime);

        gain.gain.setValueAtTime(0.0001, noteTime);
        gain.gain.linearRampToValueAtTime(0.11, noteTime + 0.006);
        gain.gain.exponentialRampToValueAtTime(0.0001, noteTime + 0.15);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(noteTime);
        osc.stop(noteTime + 0.16);
      });
    } catch {
      // Audio context error fallback
    }
  }

  /**
   * 6. ORDER SUCCESS: Warm celebratory multi-harmonic chord (C5 - G5 - C6)
   */
  public playOrderSuccess(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const chord = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
      const now = ctx.currentTime;

      chord.forEach((freq, idx) => {
        const noteTime = now + idx * 0.035;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, noteTime);

        gain.gain.setValueAtTime(0.0001, noteTime);
        gain.gain.linearRampToValueAtTime(0.08, noteTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, noteTime + 0.6);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(noteTime);
        osc.stop(noteTime + 0.62);
      });
    } catch {
      // Audio context error fallback
    }
  }

  /**
   * 7. DRAWER TRANSITION: Subtle aerodynamic whoosh / soft slide
   */
  public playDrawer(isOpen: boolean): void {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      if (isOpen) {
        osc.frequency.setValueAtTime(240, now);
        osc.frequency.exponentialRampToValueAtTime(420, now + 0.06);
      } else {
        osc.frequency.setValueAtTime(360, now);
        osc.frequency.exponentialRampToValueAtTime(220, now + 0.05);
      }

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.04, now + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.08);
    } catch {
      // Audio context error fallback
    }
  }

  /**
   * 8. TACTILE TAP: Quick micro-blip for quick-views, tabs, or modal triggers
   */
  public playTap(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, now);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.05, now + 0.002);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.035);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.04);
    } catch {
      // Audio context error fallback
    }
  }
}

export const soundEffects = new SoundEffectsEngine();
