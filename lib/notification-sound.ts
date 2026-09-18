"use client";

/**
 * A short two-tone chime for incoming notifications, synthesised with the Web
 * Audio API. Nothing is fetched when an alert lands and the repo carries no
 * audio asset. Muting is remembered per browser.
 */

const MUTE_KEY = "notification-sound";

type AudioContextCtor = typeof AudioContext;

let ctx: AudioContext | null = null;

function contextCtor(): AudioContextCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

function audio(): AudioContext | null {
  if (!ctx) {
    const Ctor = contextCtor();
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  return ctx;
}

export function soundMuted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(MUTE_KEY) === "off";
  } catch {
    // Private mode / blocked storage — default to audible.
    return false;
  }
}

export function setSoundMuted(muted: boolean): void {
  try {
    window.localStorage.setItem(MUTE_KEY, muted ? "off" : "on");
  } catch {
    // Preference just won't persist; the in-memory toggle still applies.
  }
}

/**
 * Unlock playback. An AudioContext created without a user gesture starts
 * suspended, so this is called from the first click or keypress in the portal.
 */
export function primeNotificationSound(): void {
  const c = audio();
  if (c && c.state === "suspended") void c.resume();
}

/** One sine note with a quick attack and an exponential tail. */
function tone(c: AudioContext, freq: number, at: number, seconds: number): void {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(0.14, at + 0.014);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(at);
  osc.stop(at + seconds + 0.02);
}

/** A5 then D6 — a fourth up, which reads as a notification rather than an error. */
export function playNotificationChime(): void {
  if (soundMuted()) return;
  const c = audio();
  if (!c) return;
  if (c.state === "suspended") void c.resume();

  const start = c.currentTime + 0.01;
  tone(c, 880, start, 0.18);
  tone(c, 1174.66, start + 0.1, 0.34);
}
