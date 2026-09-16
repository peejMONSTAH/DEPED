/**
 * Web Audio API synthesizer for UI sound effects in Digital 201.
 * Provides lightweight audio feedback without requiring external media assets.
 */

const getAudioContext = (): AudioContext | null => {
  if (typeof window === 'undefined') return null;
  const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return null;
  return new AudioContextClass();
};

export const isSoundEnabled = (): boolean => {
  if (typeof window === 'undefined') return true;
  const val = localStorage.getItem('sound_effects_enabled');
  return val === null ? true : val === 'true';
};

export const setSoundEnabled = (enabled: boolean): void => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('sound_effects_enabled', String(enabled));
  }
};

let lastLoginChimeTime = 0;

/**
 * Play a warm ascending 3-note chime on successful login
 */
export const playLoginChime = (): void => {
  if (!isSoundEnabled()) return;
  const nowMs = Date.now();
  if (nowMs - lastLoginChimeTime < 3000) {
    // Prevent repeated chimes in quick succession
    return;
  }
  lastLoginChimeTime = nowMs;

  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // Frequencies for C5, E5, G5 (Major triad)
    const freqs = [523.25, 659.25, 783.99];

    freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.08);

      gain.gain.setValueAtTime(0.01, now + idx * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.12, now + idx * 0.08 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.3);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + idx * 0.08);
      osc.stop(now + idx * 0.08 + 0.35);
    });
  } catch {
    // ignore audio errors
  }
};

/**
 * Play a descending 2-note sound on logout
 */
export const playLogoutSound = (): void => {
  if (!isSoundEnabled()) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const freqs = [659.25, 440.00]; // E5 -> A4

    freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.1);

      gain.gain.setValueAtTime(0.01, now + idx * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.1, now + idx * 0.1 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.1 + 0.25);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + idx * 0.1);
      osc.stop(now + idx * 0.1 + 0.3);
    });
  } catch {
    // ignore audio errors
  }
};

/**
 * Play a subtle success chime for document approvals & actions
 */
export const playSuccessChime = (): void => {
  if (!isSoundEnabled()) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, now); // D5
    osc.frequency.exponentialRampToValueAtTime(880.00, now + 0.12); // A5

    gain.gain.setValueAtTime(0.01, now);
    gain.gain.exponentialRampToValueAtTime(0.15, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.3);
  } catch {
    // ignore audio errors
  }
};
