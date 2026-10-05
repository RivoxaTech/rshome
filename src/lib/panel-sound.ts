/**
 * The panel's notification chime (S22 follow-up: a sound when a new order or wholesale lead
 * arrives). Synthesised with the Web Audio API rather than an audio file, so there's nothing to
 * license or host and `media-src 'none'` (security-headers.ts) never needs loosening — that
 * directive governs `<audio>`/`<video>` sources, not programmatic oscillators. The on/off switch
 * (NotificationBell.tsx) is a per-browser preference, like the push subscription itself, not an
 * account-wide setting.
 */
const SOUND_PREF_KEY = "rshome-panel-sound";

/** Absent key = on (first run); anything other than the literal "off" also counts as on. */
export function isSoundEnabled(): boolean {
  try {
    return window.localStorage.getItem(SOUND_PREF_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSoundEnabled(on: boolean): void {
  try {
    window.localStorage.setItem(SOUND_PREF_KEY, on ? "on" : "off");
  } catch {
    // Private browsing or storage disabled: the switch just won't persist across reloads.
  }
}

let sharedContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!sharedContext) sharedContext = new Ctor();
  return sharedContext;
}

/** One short "ding-ding", two sine notes a fourth apart. Never throws: a blocked or unsupported
 *  AudioContext just means no sound, never a broken poll or push handler. */
export function playNotificationSound(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === "suspended") void ctx.resume();
    const now = ctx.currentTime;
    for (const [start, frequency] of [
      [0, 1318.5], // E6
      [0.11, 1568.0], // G6
    ] as const) {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, now + start);
      gain.gain.linearRampToValueAtTime(0.2, now + start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + 0.22);
      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start(now + start);
      oscillator.stop(now + start + 0.24);
    }
  } catch {
    // Autoplay policy, an unsupported browser, or a torn-down context: the visual/push alert
    // still happened, so silently skipping the sound is the right failure mode.
  }
}
