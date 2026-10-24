/** SFX preference — localStorage, privzeto vklopljeno. */

const STORAGE_KEY = "hitrarunda.sfx";

export type SfxName = "click" | "correct" | "wrong" | "tick" | "next" | "finish";

let unlocked = false;
let ctx: AudioContext | null = null;

export function isSfxEnabled(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return true;
    return raw === "1" || raw === "true";
  } catch {
    return true;
  }
}

export function setSfxEnabled(on: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  return ctx;
}

/** Pokliči ob prvem user gestu (klik), da brskalnik odklene AudioContext. */
export function unlockSfx(): void {
  unlocked = true;
  const audio = getCtx();
  if (audio?.state === "suspended") void audio.resume();
}

function tone(freq: number, duration: number, type: OscillatorType, gain = 0.08, when = 0) {
  if (!isSfxEnabled() || !unlocked) return;
  const audio = getCtx();
  if (!audio) return;
  if (audio.state === "suspended") void audio.resume();
  const now = audio.currentTime + when;
  const osc = audio.createOscillator();
  const g = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(gain, now + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(g);
  g.connect(audio.destination);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

export function playSfx(name: SfxName): void {
  switch (name) {
    case "click":
      tone(520, 0.06, "triangle", 0.05);
      break;
    case "correct":
      tone(523, 0.1, "sine", 0.09);
      tone(659, 0.12, "sine", 0.08, 0.08);
      tone(784, 0.16, "sine", 0.07, 0.16);
      break;
    case "wrong":
      tone(220, 0.18, "sawtooth", 0.06);
      tone(165, 0.22, "sawtooth", 0.05, 0.1);
      break;
    case "tick":
      tone(880, 0.04, "square", 0.04);
      break;
    case "next":
      tone(440, 0.08, "triangle", 0.06);
      tone(660, 0.1, "triangle", 0.05, 0.07);
      break;
    case "finish":
      tone(392, 0.12, "sine", 0.08);
      tone(523, 0.14, "sine", 0.07, 0.1);
      tone(659, 0.2, "sine", 0.07, 0.22);
      break;
    default:
      break;
  }
}
