/**
 * Audible alarm for security alerts (geofence breaches).
 *
 * Browsers only let a page make sound after the user has interacted with it. The audio
 * context is therefore created early and resumed on the first click or key press, so an
 * alert that arrives later can beep without waiting for another click.
 */

let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  return ctx;
}

/** Call once at startup: unlocks sound on the user's first interaction with the page. */
export function primeAlarmAudio(): () => void {
  const unlock = () => {
    void context()?.resume();
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
  return () => {
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
}

/** True when the browser is still blocking sound until the user clicks somewhere. */
export function alarmAudioBlocked(): boolean {
  const c = context();
  return !c || c.state !== "running";
}

/** Two-tone siren beeps: `rounds` × (high, low). */
export function playAlarm(rounds = 3): void {
  const c = context();
  if (!c) return;
  void c.resume();

  const start = c.currentTime + 0.05;
  const beep = 0.22;
  for (let i = 0; i < rounds * 2; i++) {
    const t = start + i * (beep + 0.08);
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "square";
    osc.frequency.value = i % 2 === 0 ? 1180 : 820;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + beep);
    osc.connect(gain).connect(c.destination);
    osc.start(t);
    osc.stop(t + beep + 0.02);
  }
}
