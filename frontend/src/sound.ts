/** SFX preference — localStorage, privzeto vklopljeno. */

const STORAGE_KEY = "hitrarunda.sfx";

export type SfxName =
  | "click"
  | "correct"
  | "wrong"
  | "tick"
  | "next"
  | "finish"
  | "room_join"
  | "room_leave"
  | "room_kick"
  | "bonus_gain"
  | "bonus_use"
  | "safe_zone"
  | "sixty_clock"
  | "countdown_beep"
  | "countdown_go";

/** Vsi uporabljeni SFX — za admin paleto. */
export const SFX_CATALOG: { name: SfxName; label: string }[] = [
  { name: "click", label: "Klik" },
  { name: "correct", label: "Pravilno" },
  { name: "wrong", label: "Napačno" },
  { name: "tick", label: "Tick" },
  { name: "next", label: "Naprej" },
  { name: "finish", label: "Konec" },
  { name: "room_join", label: "Soba · join" },
  { name: "room_leave", label: "Soba · leave" },
  { name: "room_kick", label: "Soba · kick" },
  { name: "bonus_gain", label: "Bonus · dobiš" },
  { name: "bonus_use", label: "Bonus · uporabiš" },
  { name: "safe_zone", label: "Dirka · varna zona" },
  { name: "sixty_clock", label: "60 s · tick clock" },
  { name: "countdown_beep", label: "Countdown · beep" },
  { name: "countdown_go", label: "Countdown · Zdaj" },
];

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

function tone(
  freq: number,
  duration: number,
  type: OscillatorType,
  gain = 0.08,
  when = 0,
  force = false,
  opts?: { endFreq?: number },
) {
  if ((!force && !isSfxEnabled()) || !unlocked) return;
  const audio = getCtx();
  if (!audio) return;
  if (audio.state === "suspended") void audio.resume();
  const now = audio.currentTime + when;
  const osc = audio.createOscillator();
  const g = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  if (opts?.endFreq != null) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.endFreq), now + duration);
  }
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(gain, now + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(g);
  g.connect(audio.destination);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

function chord(freqs: number[], duration: number, type: OscillatorType, gain: number, when = 0, force = false) {
  const each = gain / Math.max(1, freqs.length);
  for (const f of freqs) tone(f, duration, type, each, when, force);
}

function emitSfx(name: SfxName, force = false): void {
  switch (name) {
    case "click":
      tone(520, 0.06, "triangle", 0.05, 0, force);
      break;
    case "correct":
      tone(523, 0.1, "sine", 0.09, 0, force);
      tone(659, 0.12, "sine", 0.08, 0.08, force);
      tone(784, 0.16, "sine", 0.07, 0.16, force);
      break;
    case "wrong":
      tone(220, 0.18, "sawtooth", 0.06, 0, force);
      tone(165, 0.22, "sawtooth", 0.05, 0.1, force);
      break;
    case "tick":
      tone(880, 0.04, "square", 0.04, 0, force);
      break;
    case "next":
      tone(440, 0.08, "triangle", 0.06, 0, force);
      tone(660, 0.1, "triangle", 0.05, 0.07, force);
      break;
    case "finish":
      tone(392, 0.12, "sine", 0.08, 0, force);
      tone(523, 0.14, "sine", 0.07, 0.1, force);
      tone(659, 0.2, "sine", 0.07, 0.22, force);
      break;
    case "room_join":
      tone(320, 0.05, "triangle", 0.05, 0, force);
      tone(640, 0.07, "triangle", 0.07, 0.04, force);
      tone(960, 0.1, "sine", 0.05, 0.1, force);
      break;
    case "room_leave":
      tone(720, 0.22, "sine", 0.06, 0, force, { endFreq: 220 });
      tone(480, 0.16, "triangle", 0.04, 0.06, force, { endFreq: 160 });
      break;
    case "room_kick":
      tone(300, 0.1, "square", 0.07, 0, force);
      tone(180, 0.18, "sawtooth", 0.06, 0.08, force);
      tone(120, 0.12, "square", 0.04, 0.18, force);
      break;
    case "bonus_gain":
      // iz playground bonus_e
      chord([523, 659, 784], 0.28, "sine", 0.08, 0, force);
      chord([659, 831, 988], 0.22, "sine", 0.05, 0.2, force);
      break;
    case "bonus_use":
      // iz playground finish_d
      tone(440, 0.35, "sine", 0.07, 0, force, { endFreq: 660 });
      tone(550, 0.4, "triangle", 0.05, 0.15, force, { endFreq: 880 });
      break;
    case "safe_zone":
      // iz playground bonus_h
      chord([392, 523], 0.12, "triangle", 0.06, 0, force);
      chord([523, 659], 0.12, "triangle", 0.07, 0.12, force);
      chord([659, 784, 988], 0.28, "triangle", 0.08, 0.24, force);
      break;
    case "sixty_clock":
      // en tick iz playground sixty_tension_b (srednja napetost)
      emitSixtyClockTick(0.5, force);
      break;
    case "countdown_beep":
      tone(760, 0.09, "square", 0.06, 0, force);
      break;
    case "countdown_go":
      tone(520, 0.08, "triangle", 0.07, 0, force);
      tone(780, 0.18, "triangle", 0.08, 0.08, force);
      break;
    default:
      break;
  }
}

/** En tick (paleta). progress 0 = mirno, 1 = panika. */
function emitSixtyClockTick(progress: number, force = false): void {
  emitSixtyClockBeat(progress, 0, force);
}

/** Tick clock iz playground sixty_tension_b. */
function emitSixtyClockBeat(progress: number, beat: number, force = false): void {
  const p = Math.max(0, Math.min(1, progress));
  tone(900 + p * 400, 0.035, "square", 0.04 + p * 0.025, 0, force);
  if (beat % 4 === 0) tone(120, 0.05, "square", 0.06, 0, force);
}

let sixtyClockTimer: number | null = null;
let sixtyClockBeat = 0;

/**
 * 60 sekund: naraščajoči tick-clock (playground sixty_tension_b).
 * getRemainingRatio: 1 = poln čas, 0 = poteklo.
 */
export function startSixtyTensionClock(getRemainingRatio: () => number): void {
  stopSixtyTensionClock();
  sixtyClockBeat = 0;
  const step = () => {
    const remaining = Math.max(0, Math.min(1, getRemainingRatio()));
    if (remaining <= 0) {
      stopSixtyTensionClock();
      return;
    }
    if (isSfxEnabled() && unlocked) {
      const progress = 1 - remaining;
      emitSixtyClockBeat(progress, sixtyClockBeat, false);
      sixtyClockBeat += 1;
    }
    const progress = 1 - remaining;
    const interval = Math.max(80, 520 - progress * 420);
    sixtyClockTimer = window.setTimeout(step, interval);
  };
  step();
}

export function stopSixtyTensionClock(): void {
  if (sixtyClockTimer != null) {
    window.clearTimeout(sixtyClockTimer);
    sixtyClockTimer = null;
  }
  sixtyClockBeat = 0;
}

/** Približno trajanje (ms) — za zaporedno predvajanje brez prekrivanja. */
const SFX_DURATION_MS: Record<SfxName, number> = {
  click: 100,
  correct: 360,
  wrong: 360,
  tick: 80,
  next: 220,
  finish: 450,
  room_join: 220,
  room_leave: 280,
  room_kick: 350,
  bonus_gain: 560,
  bonus_use: 580,
  safe_zone: 620,
  sixty_clock: 80,
  countdown_beep: 120,
  countdown_go: 280,
};

let questionCountdownTimer: number | null = null;

/**
 * Countdown pred prvim vprašanjem: 3 → 2 → 1, nato vprašanje.
 */
export function startQuestionCountdown(
  onTick?: (step: number) => void,
  onDone?: () => void,
): () => void {
  unlockSfx();
  stopQuestionCountdown();
  const steps = [3, 2, 1];
  let i = 0;

  const run = () => {
    const step = steps[i];
    if (step === undefined) {
      questionCountdownTimer = null;
      onDone?.();
      return;
    }
    onTick?.(step);
    playSfx("countdown_beep");
    i += 1;
    if (i < steps.length) {
      questionCountdownTimer = window.setTimeout(run, 1000);
    } else {
      // Kratek trenutek na "1 · Zdaj", nato vprašanje.
      questionCountdownTimer = window.setTimeout(() => {
        questionCountdownTimer = null;
        onDone?.();
      }, 550);
    }
  };

  run();
  return stopQuestionCountdown;
}

export function stopQuestionCountdown(): void {
  if (questionCountdownTimer != null) {
    window.clearTimeout(questionCountdownTimer);
    questionCountdownTimer = null;
  }
}

/**
 * Countdown usklajen s strežnikom (multiplayer / dirka).
 * Koraki 3→2→1 glede na countdown_ends_at + server_now.
 */
export function startSyncedCountdown(
  endsAtIso: string,
  serverNowIso: string,
  onTick?: (step: number) => void,
): () => void {
  unlockSfx();
  stopQuestionCountdown();
  const ends = Date.parse(endsAtIso);
  const serverNow = Date.parse(serverNowIso);
  if (!Number.isFinite(ends) || !Number.isFinite(serverNow)) {
    return stopQuestionCountdown;
  }
  const skew = Date.now() - serverNow;
  let lastStep: number | null = null;
  const totalMs = 3 * 1000 + 550;

  const tick = () => {
    const nowServer = Date.now() - skew;
    const remaining = ends - nowServer;
    let step: number;
    if (remaining > totalMs - 1000) step = 3;
    else if (remaining > totalMs - 2000) step = 2;
    else step = 1;
    if (step !== lastStep) {
      lastStep = step;
      onTick?.(step);
      playSfx("countdown_beep");
    }
    if (remaining <= 0) {
      questionCountdownTimer = null;
      return;
    }
    questionCountdownTimer = window.setTimeout(tick, 40);
  };

  tick();
  return stopQuestionCountdown;
}

/** Globalni debounce — isti SFX ne smejo iti sočasno (npr. next iz več poti). */
const lastPlayedAt: Partial<Record<SfxName, number>> = {};
const SFX_DEBOUNCE_MS: Partial<Record<SfxName, number>> = {
  next: 450,
  finish: 400,
  room_join: 200,
  room_leave: 200,
  room_kick: 200,
};

export function playSfx(name: SfxName): void {
  const debounce = SFX_DEBOUNCE_MS[name];
  if (debounce != null) {
    const now = Date.now();
    const prev = lastPlayedAt[name] ?? 0;
    if (now - prev < debounce) return;
    lastPlayedAt[name] = now;
  }
  emitSfx(name, false);
}

let sequenceTimers: number[] = [];

/** Prekini čakajoče zaporedje (npr. ob novem vprašanju). */
export function cancelSfxSequence(): void {
  for (const id of sequenceTimers) window.clearTimeout(id);
  sequenceTimers = [];
}

/** Predvajaj zvoke enega za drugim (npr. 2× bonus_gain → safe_zone). */
export function playSfxSequence(names: SfxName[]): void {
  if (!names.length) return;
  cancelSfxSequence();
  let delay = 0;
  for (const name of names) {
    const at = delay;
    sequenceTimers.push(window.setTimeout(() => playSfx(name), at));
    delay += SFX_DURATION_MS[name] ?? 300;
  }
}

/** Predogled v paleti — igra tudi, če so SFX drugače izklopljeni. */
export function previewSfx(name: SfxName): void {
  unlockSfx();
  emitSfx(name, true);
}
