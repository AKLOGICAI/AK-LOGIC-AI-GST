/**
 * Premium in-app notification sound synthesizer for AK-LOGIC AI GST.
 *
 * Designed using Web Audio API to create a gentle, warm, dual-harmonic chime:
 * - Tone 1: 880 Hz (A5 - warm bell chime)
 * - Tone 2: 1318.5 Hz (E6 - crystalline harmonic) with smooth exponential decay
 * - Lowpass filter at 3200 Hz for rounded warmth without harsh high-frequency spikes.
 *
 * Characteristics:
 * - Ultra-lightweight: Zero external network requests or audio file assets.
 * - Non-aggressive: Subdued master volume (0.2) with soft 8ms attack ramps to eliminate clicks/pops.
 * - Autoplay resilient: Unlocks AudioContext on initial user interaction (click/touch/keypress).
 * - Deduplicated: Tracks played notification IDs and enforces a minimum throttle window.
 * - Resilient: Fails completely silently if audio output is blocked or unavailable on the device.
 */

let audioCtx: AudioContext | null = null;
const playedNotificationIds = new Set<string>();
let lastPlayTimestamp = 0;
const THROTTLE_WINDOW_MS = 250;
const MAX_TRACKED_IDS = 1000;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      try {
        audioCtx = new AudioContextClass();
      } catch {
        audioCtx = null;
      }
    }
  }
  return audioCtx;
}

/**
 * Automatically unlocks the AudioContext upon first user interaction
 * to adhere strictly to browser autoplay policies.
 */
function initializeAudioUnlock(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const unlock = () => {
    try {
      const ctx = getAudioContext();
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
    } catch {
      // Fail silently
    }
  };

  const opts: AddEventListenerOptions = { once: true, passive: true };
  document.addEventListener('pointerdown', unlock, opts);
  document.addEventListener('keydown', unlock, opts);
  document.addEventListener('touchstart', unlock, opts);
}

// Register unlock listeners once upon module evaluation
initializeAudioUnlock();

/**
 * Synthesizes and plays a subtle, pleasant 2-tone chime.
 *
 * @param notificationId Optional unique identifier to prevent duplicate sounds for the same item.
 */
export function playNotificationSound(notificationId?: string): void {
  if (typeof window === 'undefined') return;

  // Deduplication check
  if (notificationId) {
    if (playedNotificationIds.has(notificationId)) {
      return;
    }
    playedNotificationIds.add(notificationId);
    if (playedNotificationIds.size > MAX_TRACKED_IDS) {
      const oldestId = playedNotificationIds.values().next().value;
      if (oldestId) playedNotificationIds.delete(oldestId);
    }
  }

  // Throttle to avoid audio stuttering during batch notification events (e.g. broadcasts)
  const now = Date.now();
  if (now - lastPlayTimestamp < THROTTLE_WINDOW_MS) {
    return;
  }
  lastPlayTimestamp = now;

  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    // If context is suspended and can be resumed, try resuming
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const t = ctx.currentTime;

    // Master gain controller (soft volume)
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.22, t);

    // Warmth filter (softens harsh frequencies)
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3200, t);
    filter.Q.setValueAtTime(1.0, t);

    masterGain.connect(filter);
    filter.connect(ctx.destination);

    // Tone 1: Fundamental A5 (880 Hz) - soft bell initial chime
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, t);

    // Smooth envelope: 8ms attack, gentle exponential decay
    gain1.gain.setValueAtTime(0.0001, t);
    gain1.gain.exponentialRampToValueAtTime(0.65, t + 0.008);
    gain1.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);

    osc1.connect(gain1);
    gain1.connect(masterGain);

    // Tone 2: Harmonic E6 (1318.5 Hz) - bright crystalline finish
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1318.5, t + 0.05);

    const t2 = t + 0.05;
    gain2.gain.setValueAtTime(0.0001, t2);
    gain2.gain.exponentialRampToValueAtTime(0.55, t2 + 0.008);
    gain2.gain.exponentialRampToValueAtTime(0.0001, t2 + 0.40);

    osc2.connect(gain2);
    gain2.connect(masterGain);

    // Tone 3: Subtle harmonic overtone (1760 Hz) for acoustic depth
    const osc3 = ctx.createOscillator();
    const gain3 = ctx.createGain();
    osc3.type = 'sine';
    osc3.frequency.setValueAtTime(1760, t + 0.06);

    const t3 = t + 0.06;
    gain3.gain.setValueAtTime(0.0001, t3);
    gain3.gain.exponentialRampToValueAtTime(0.15, t3 + 0.008);
    gain3.gain.exponentialRampToValueAtTime(0.0001, t3 + 0.28);

    osc3.connect(gain3);
    gain3.connect(masterGain);

    // Start & stop schedule
    osc1.start(t);
    osc1.stop(t + 0.35);

    osc2.start(t2);
    osc2.stop(t2 + 0.42);

    osc3.start(t3);
    osc3.stop(t3 + 0.30);
  } catch {
    // Fail silently on unsupported or permission-restricted environments
  }
}
