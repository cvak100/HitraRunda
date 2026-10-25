/**
 * Eksperimentalni SFX — samo admin paleta (testni playground).
 * Še niso vklopljeni v igro.
 */

import { unlockSfx } from "./sound";

export type PlaygroundSfxName =
  | "win_cheer"
  | "win_fanfare"
  | "joy_sparkle"
  | "finish_a"
  | "finish_b"
  | "finish_c"
  | "finish_d"
  | "finish_e"
  | "correct_a"
  | "correct_b"
  | "correct_c"
  | "correct_d"
  | "correct_e"
  | "wrong_a"
  | "wrong_b"
  | "wrong_c"
  | "wrong_d"
  | "wrong_e"
  | "countdown_beep"
  | "countdown_go"
  | "room_join"
  | "room_leave"
  | "room_kick"
  | "bonus_a"
  | "bonus_b"
  | "bonus_c"
  | "bonus_d"
  | "bonus_e"
  | "bonus_f"
  | "bonus_g"
  | "bonus_h"
  | "bonus_i"
  | "podium_a"
  | "podium_b"
  | "podium_c"
  | "podium_d"
  | "podium_e"
  | "podium_f"
  | "podium_g"
  | "podium_h"
  | "podium_i"
  | "podium_j"
  | "sixty_tension_a"
  | "sixty_tension_b"
  | "sixty_tension_c"
  | "sixty_tension_d"
  | "sixty_tension_e";

export type PlaygroundGroup = {
  id: string;
  title: string;
  items: { name: PlaygroundSfxName; label: string }[];
};

export const PLAYGROUND_GROUPS: PlaygroundGroup[] = [
  {
    id: "win",
    title: "Zmaga / veselje",
    items: [
      { name: "win_cheer", label: "Zmaga · cheer" },
      { name: "win_fanfare", label: "Zmaga · fanfare" },
      { name: "joy_sparkle", label: "Veselje · sparkle" },
    ],
  },
  {
    id: "finish",
    title: "Konec igre (5)",
    items: [
      { name: "finish_a", label: "Konec A · arpeggio" },
      { name: "finish_b", label: "Konec B · boben" },
      { name: "finish_c", label: "Konec C · zmagovalni" },
      { name: "finish_d", label: "Konec D · mehak" },
      { name: "finish_e", label: "Konec E · stinger" },
    ],
  },
  {
    id: "correct",
    title: "Pravilno (5)",
    items: [
      { name: "correct_a", label: "Pravilno A · ping" },
      { name: "correct_b", label: "Pravilno B · dvig" },
      { name: "correct_c", label: "Pravilno C · plink" },
      { name: "correct_d", label: "Pravilno D · majhna fanfara" },
      { name: "correct_e", label: "Pravilno E · soft ding" },
    ],
  },
  {
    id: "wrong",
    title: "Napačno (5)",
    items: [
      { name: "wrong_a", label: "Napačno A · buzz" },
      { name: "wrong_b", label: "Napačno B · padec" },
      { name: "wrong_c", label: "Napačno C · thump" },
      { name: "wrong_d", label: "Napačno D · dissonanca" },
      { name: "wrong_e", label: "Napačno E · soft miss" },
    ],
  },
  {
    id: "room",
    title: "Soba",
    items: [
      { name: "room_join", label: "Join" },
      { name: "room_leave", label: "Leave" },
      { name: "room_kick", label: "Kick" },
    ],
  },
  {
    id: "bonus",
    title: "Bonus (9)",
    items: [
      { name: "bonus_a", label: "Bonus A · arpeggio" },
      { name: "bonus_b", label: "Bonus B · sparkle" },
      { name: "bonus_c", label: "Bonus C · power-up" },
      { name: "bonus_d", label: "Bonus D · coin" },
      { name: "bonus_e", label: "Bonus E · chime" },
      { name: "bonus_f", label: "Bonus F · sweep" },
      { name: "bonus_g", label: "Bonus G · twinkle" },
      { name: "bonus_h", label: "Bonus H · fanfara" },
      { name: "bonus_i", label: "Bonus I · magic" },
    ],
  },
  {
    id: "podium",
    title: "Dirka · stopničke / čestitke (~5 s, 10)",
    items: [
      { name: "podium_a", label: "Podium A · fanfara + confetti" },
      { name: "podium_b", label: "Podium B · majhna orkestra" },
      { name: "podium_c", label: "Podium C · sparkle cascade" },
      { name: "podium_d", label: "Podium D · victory march" },
      { name: "podium_e", label: "Podium E · warm glow" },
      { name: "podium_f", label: "Podium F · 8-bit win" },
      { name: "podium_g", label: "Podium G · choir swell" },
      { name: "podium_h", label: "Podium H · bells + drums" },
      { name: "podium_i", label: "Podium I · rising applause" },
      { name: "podium_j", label: "Podium J · golden arpeggio" },
    ],
  },
  {
    id: "sixty",
    title: "60 sekund · naraščajoča napetost (~10 s demo, 5)",
    items: [
      { name: "sixty_tension_a", label: "Napetost A · pulse → rush" },
      { name: "sixty_tension_b", label: "Napetost B · tick clock" },
      { name: "sixty_tension_c", label: "Napetost C · heartbeat" },
      { name: "sixty_tension_d", label: "Napetost D · sirena climb" },
      { name: "sixty_tension_e", label: "Napetost E · staccato panic" },
    ],
  },
];

let ctx: AudioContext | null = null;
/** Vsi playground toni grejo sem — stopLongPreview takoj utiša. */
let previewBus: GainNode | null = null;
let countdownTimer: ReturnType<typeof setTimeout> | null = null;
let longPreviewTimers: ReturnType<typeof setTimeout>[] = [];
let activeOscillators: OscillatorNode[] = [];

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  return ctx;
}

function getPreviewBus(): GainNode | null {
  const audio = getCtx();
  if (!audio) return null;
  if (!previewBus) {
    previewBus = audio.createGain();
    previewBus.gain.value = 1;
    previewBus.connect(audio.destination);
  }
  return previewBus;
}

/** Ustavi timerje + takoj utiši vse playground zvoke (tudi že načrtovane). */
export function stopLongPreview(): void {
  for (const id of longPreviewTimers) clearTimeout(id);
  longPreviewTimers = [];
  const audio = getCtx();
  const now = audio?.currentTime ?? 0;
  // Bus disconnect = takojšnja tišina (oscillatorji z future start ne slišijo več).
  if (previewBus) {
    try {
      previewBus.gain.cancelScheduledValues(now);
      previewBus.gain.setValueAtTime(0, now);
      previewBus.disconnect();
    } catch {
      /* ignore */
    }
    previewBus = null;
  }
  for (const osc of activeOscillators) {
    try {
      osc.stop(now);
      osc.disconnect();
    } catch {
      /* že ustavljen / še ni start */
    }
  }
  activeOscillators = [];
}

function later(ms: number, fn: () => void) {
  longPreviewTimers.push(setTimeout(fn, ms));
}

function tone(
  freq: number,
  duration: number,
  type: OscillatorType,
  gain = 0.08,
  when = 0,
  opts?: { endFreq?: number },
) {
  const audio = getCtx();
  const bus = getPreviewBus();
  if (!audio || !bus) return;
  if (audio.state === "suspended") void audio.resume();
  // Po stopu je bus lahko z gain 0 — ob novem tonu zagotovi 1.
  if (bus.gain.value < 0.5) {
    bus.gain.cancelScheduledValues(audio.currentTime);
    bus.gain.setValueAtTime(1, audio.currentTime);
  }
  const now = audio.currentTime + when;
  const osc = audio.createOscillator();
  const g = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  if (opts?.endFreq != null) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.endFreq), now + duration);
  }
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(gain, now + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(g);
  g.connect(bus);
  activeOscillators.push(osc);
  osc.onended = () => {
    activeOscillators = activeOscillators.filter((item) => item !== osc);
  };
  osc.start(now);
  try {
    osc.stop(now + duration + 0.03);
  } catch {
    /* ignore */
  }
}

function chord(freqs: number[], duration: number, type: OscillatorType, gain: number, when = 0) {
  const each = gain / Math.max(1, freqs.length);
  for (const f of freqs) tone(f, duration, type, each, when);
}

function seq(notes: { f: number; d: number; type?: OscillatorType; g?: number; gap?: number }[], start = 0) {
  let t = start;
  for (const n of notes) {
    tone(n.f, n.d, n.type ?? "sine", n.g ?? 0.07, t);
    t += n.d + (n.gap ?? 0.02);
  }
}

function playPodium(style: number) {
  // ~5 s veselje / čestitke — različni stili
  if (style === 0) {
    // fanfara + confetti
    chord([392, 494, 587], 0.35, "square", 0.08, 0);
    chord([523, 659, 784], 0.4, "square", 0.09, 0.35);
    chord([659, 831, 988], 0.55, "square", 0.1, 0.75);
    for (let i = 0; i < 18; i++) {
      tone(700 + (i % 6) * 160 + (i % 3) * 40, 0.09, "sine", 0.035, 1.4 + i * 0.16);
    }
    chord([784, 988, 1175], 0.8, "triangle", 0.08, 4.0);
  } else if (style === 1) {
    // majhna orkestra
    const melody = [523, 587, 659, 784, 659, 784, 880, 1047, 880, 784, 988, 1175];
    melody.forEach((f, i) => tone(f, 0.28, "triangle", 0.07, i * 0.32));
    chord([262, 330, 392], 1.2, "sine", 0.05, 3.5);
  } else if (style === 2) {
    // sparkle cascade
    for (let wave = 0; wave < 5; wave++) {
      for (let i = 0; i < 8; i++) {
        tone(600 + i * 120 + wave * 40, 0.1, "sine", 0.04, wave * 0.9 + i * 0.08);
      }
    }
    tone(1319, 0.6, "triangle", 0.06, 4.3);
  } else if (style === 3) {
    // victory march
    const steps = [
      [392, 0.22],
      [392, 0.22],
      [523, 0.35],
      [392, 0.22],
      [523, 0.22],
      [659, 0.45],
      [523, 0.28],
      [659, 0.28],
      [784, 0.55],
      [988, 0.7],
    ] as const;
    let t = 0;
    for (const [f, d] of steps) {
      tone(f, d, "square", 0.07, t);
      tone(f / 2, d, "triangle", 0.04, t);
      t += d + 0.06;
    }
  } else if (style === 4) {
    // warm glow
    chord([261, 329, 392], 1.4, "sine", 0.07, 0);
    chord([329, 392, 493], 1.4, "sine", 0.06, 1.2);
    chord([392, 493, 587], 1.5, "sine", 0.07, 2.4);
    chord([523, 659, 784, 988], 1.4, "triangle", 0.08, 3.6);
  } else if (style === 5) {
    // 8-bit win
    const bits = [523, 659, 784, 1047, 784, 1047, 1319, 1047, 1319, 1568, 1319, 1760];
    bits.forEach((f, i) => tone(f, 0.14, "square", 0.055, i * 0.28));
    chord([1047, 1319], 0.9, "square", 0.06, 3.6);
    for (let i = 0; i < 6; i++) tone(1800 - i * 80, 0.08, "square", 0.03, 4.4 + i * 0.08);
  } else if (style === 6) {
    // choir swell
    chord([220, 277, 330], 1.6, "sine", 0.06, 0);
    chord([277, 349, 415], 1.6, "sine", 0.065, 1.0);
    chord([330, 415, 494], 1.6, "sine", 0.07, 2.0);
    chord([392, 494, 587, 740], 1.8, "sine", 0.08, 3.2);
  } else if (style === 7) {
    // bells + drums
    for (let i = 0; i < 8; i++) {
      tone(80, 0.12, "square", 0.08, i * 0.55);
      tone(880 + (i % 3) * 220, 0.35, "sine", 0.06, i * 0.55 + 0.08);
    }
    chord([659, 831, 988], 0.9, "triangle", 0.08, 4.2);
  } else if (style === 8) {
    // rising applause (pitched)
    for (let i = 0; i < 40; i++) {
      const f = 400 + i * 18 + (i % 4) * 30;
      tone(f, 0.07, "triangle", 0.028 + (i / 40) * 0.03, i * 0.1);
    }
    chord([784, 988, 1175], 0.85, "sine", 0.07, 4.2);
  } else {
    // golden arpeggio
    const notes = [392, 494, 587, 740, 587, 740, 880, 987, 880, 987, 1175, 1319, 1175, 1480];
    notes.forEach((f, i) => {
      tone(f, 0.22, "sine", 0.065, i * 0.28);
      tone(f * 2, 0.12, "triangle", 0.025, i * 0.28 + 0.05);
    });
    chord([659, 831, 988, 1319], 1.0, "sine", 0.07, 4.0);
  }
}

/** Kompresiran demo naraščajoče napetosti (~10 s): interval se krajša, pitch raste. */
function playSixtyTension(style: number) {
  stopLongPreview();
  const totalMs = 10000;
  let t = 0;
  let beat = 0;
  const run = () => {
    if (t >= totalMs) {
      // final sting
      if (style === 3) tone(880, 0.4, "sawtooth", 0.07, 0, { endFreq: 220 });
      else tone(220 + style * 40, 0.25, "square", 0.08);
      return;
    }
    const progress = t / totalMs; // 0 → 1
    const interval = Math.max(80, 520 - progress * 420); // počasi → hitro
    const base = 180 + progress * 420 + style * 25;
    if (style === 0) {
      // pulse → rush
      tone(base, 0.06, "square", 0.05 + progress * 0.03);
      if (beat % 2 === 0) tone(base * 1.5, 0.04, "triangle", 0.035);
    } else if (style === 1) {
      // tick clock
      tone(900 + progress * 400, 0.035, "square", 0.04 + progress * 0.025);
      if (beat % 4 === 0) tone(120, 0.05, "square", 0.06);
    } else if (style === 2) {
      // heartbeat (double)
      tone(90 + progress * 40, 0.08, "sine", 0.07);
      later(Math.min(120, interval * 0.35), () => tone(90 + progress * 40, 0.07, "sine", 0.055));
      if (progress > 0.55) tone(base * 2, 0.03, "triangle", 0.03);
    } else if (style === 3) {
      // sirena climb
      tone(base, interval / 1000, "sawtooth", 0.045, 0, { endFreq: base * 1.35 });
    } else {
      // staccato panic
      tone(base, 0.04, "square", 0.05);
      tone(base * 1.25, 0.035, "square", 0.04, 0.03);
      if (progress > 0.6) tone(base * 1.8, 0.03, "sawtooth", 0.03, 0.05);
    }
    beat += 1;
    t += interval;
    later(interval, run);
  };
  run();
}

export function previewPlaygroundSfx(name: PlaygroundSfxName): void {
  unlockSfx();
  stopLongPreview();
  const audio = getCtx();
  if (audio?.state === "suspended") void audio.resume();

  switch (name) {
    case "win_cheer":
      seq([
        { f: 523, d: 0.1, g: 0.08 },
        { f: 659, d: 0.1, g: 0.08 },
        { f: 784, d: 0.1, g: 0.08 },
        { f: 1047, d: 0.28, g: 0.1 },
      ]);
      tone(1319, 0.2, "triangle", 0.05, 0.42);
      break;
    case "win_fanfare":
      chord([392, 494, 587], 0.18, "square", 0.07, 0);
      chord([523, 659, 784], 0.22, "square", 0.08, 0.2);
      chord([659, 831, 988], 0.35, "square", 0.09, 0.42);
      break;
    case "joy_sparkle":
      for (let i = 0; i < 6; i++) {
        tone(900 + i * 140, 0.07, "sine", 0.045, i * 0.06);
      }
      tone(1568, 0.2, "triangle", 0.06, 0.38);
      break;

    case "finish_a":
      seq([
        { f: 392, d: 0.12 },
        { f: 494, d: 0.12 },
        { f: 587, d: 0.12 },
        { f: 784, d: 0.28, g: 0.09 },
      ]);
      break;
    case "finish_b":
      tone(90, 0.12, "square", 0.1, 0);
      tone(70, 0.16, "square", 0.08, 0.14);
      tone(523, 0.2, "triangle", 0.06, 0.28);
      tone(784, 0.28, "triangle", 0.07, 0.42);
      break;
    case "finish_c":
      chord([523, 659, 784], 0.2, "sine", 0.09, 0);
      chord([587, 740, 880], 0.22, "sine", 0.08, 0.22);
      chord([659, 831, 988, 1319], 0.4, "sine", 0.1, 0.46);
      break;
    case "finish_d":
      tone(440, 0.35, "sine", 0.07, 0, { endFreq: 660 });
      tone(550, 0.4, "triangle", 0.05, 0.15, { endFreq: 880 });
      break;
    case "finish_e":
      tone(880, 0.08, "sawtooth", 0.05, 0);
      tone(660, 0.1, "sawtooth", 0.06, 0.08);
      tone(440, 0.12, "sawtooth", 0.05, 0.16);
      chord([523, 659], 0.35, "triangle", 0.08, 0.3);
      break;

    case "correct_a":
      tone(880, 0.08, "sine", 0.08);
      tone(1320, 0.12, "sine", 0.07, 0.07);
      break;
    case "correct_b":
      tone(400, 0.18, "triangle", 0.07, 0, { endFreq: 900 });
      break;
    case "correct_c":
      tone(1200, 0.05, "square", 0.04);
      tone(1600, 0.06, "square", 0.035, 0.05);
      break;
    case "correct_d":
      seq([
        { f: 523, d: 0.07, type: "triangle", g: 0.06 },
        { f: 659, d: 0.07, type: "triangle", g: 0.06 },
        { f: 784, d: 0.14, type: "triangle", g: 0.07 },
      ]);
      break;
    case "correct_e":
      tone(740, 0.22, "sine", 0.06);
      tone(740, 0.12, "sine", 0.03, 0.1);
      break;

    case "wrong_a":
      tone(180, 0.22, "sawtooth", 0.07);
      tone(140, 0.18, "sawtooth", 0.05, 0.12);
      break;
    case "wrong_b":
      tone(500, 0.25, "triangle", 0.07, 0, { endFreq: 120 });
      break;
    case "wrong_c":
      tone(100, 0.2, "square", 0.09);
      tone(80, 0.15, "square", 0.05, 0.08);
      break;
    case "wrong_d":
      chord([220, 233], 0.28, "sawtooth", 0.07, 0);
      chord([185, 196], 0.3, "sawtooth", 0.05, 0.18);
      break;
    case "wrong_e":
      tone(320, 0.14, "sine", 0.05);
      tone(240, 0.2, "sine", 0.04, 0.1);
      break;

    case "countdown_beep":
      tone(760, 0.09, "square", 0.06);
      break;
    case "countdown_go":
      tone(520, 0.08, "triangle", 0.07);
      tone(780, 0.18, "triangle", 0.08, 0.08);
      break;

    case "room_join":
      // Kratek “pop-in” — dve hitro naraščajoči notički + mehak click
      tone(320, 0.05, "triangle", 0.05);
      tone(640, 0.07, "triangle", 0.07, 0.04);
      tone(960, 0.1, "sine", 0.05, 0.1);
      break;
    case "room_leave":
      // Mehak “whoosh-out” — padajoči sweep
      tone(720, 0.22, "sine", 0.06, 0, { endFreq: 220 });
      tone(480, 0.16, "triangle", 0.04, 0.06, { endFreq: 160 });
      break;
    case "room_kick":
      tone(300, 0.1, "square", 0.07);
      tone(180, 0.18, "sawtooth", 0.06, 0.08);
      tone(120, 0.12, "square", 0.04, 0.18);
      break;

    case "bonus_a":
      seq([
        { f: 660, d: 0.07, type: "triangle", g: 0.06 },
        { f: 880, d: 0.07, type: "triangle", g: 0.06 },
        { f: 1100, d: 0.07, type: "triangle", g: 0.06 },
        { f: 1320, d: 0.18, type: "sine", g: 0.08 },
      ]);
      break;
    case "bonus_b":
      for (let i = 0; i < 5; i++) {
        tone(1000 + i * 180, 0.06, "sine", 0.04, i * 0.05);
      }
      break;
    case "bonus_c":
      tone(200, 0.2, "sawtooth", 0.06, 0, { endFreq: 900 });
      tone(450, 0.16, "square", 0.04, 0.12, { endFreq: 1200 });
      break;
    case "bonus_d":
      tone(988, 0.06, "square", 0.05);
      tone(1319, 0.1, "square", 0.06, 0.05);
      break;
    case "bonus_e":
      chord([523, 659, 784], 0.28, "sine", 0.08, 0);
      chord([659, 831, 988], 0.22, "sine", 0.05, 0.2);
      break;
    case "bonus_f":
      tone(400, 0.35, "triangle", 0.07, 0, { endFreq: 1400 });
      break;
    case "bonus_g":
      seq([
        { f: 880, d: 0.05, type: "sine", g: 0.05, gap: 0.04 },
        { f: 1320, d: 0.05, type: "sine", g: 0.05, gap: 0.04 },
        { f: 880, d: 0.05, type: "sine", g: 0.05, gap: 0.04 },
        { f: 1760, d: 0.12, type: "sine", g: 0.06 },
      ]);
      break;
    case "bonus_h":
      chord([392, 523], 0.12, "triangle", 0.06, 0);
      chord([523, 659], 0.12, "triangle", 0.07, 0.12);
      chord([659, 784, 988], 0.28, "triangle", 0.08, 0.24);
      break;
    case "bonus_i":
      tone(740, 0.1, "sine", 0.05);
      tone(932, 0.1, "sine", 0.05, 0.08);
      tone(1175, 0.12, "sine", 0.06, 0.16);
      tone(1480, 0.08, "triangle", 0.04, 0.26);
      tone(740, 0.2, "sine", 0.05, 0.32);
      break;

    case "podium_a":
      playPodium(0);
      break;
    case "podium_b":
      playPodium(1);
      break;
    case "podium_c":
      playPodium(2);
      break;
    case "podium_d":
      playPodium(3);
      break;
    case "podium_e":
      playPodium(4);
      break;
    case "podium_f":
      playPodium(5);
      break;
    case "podium_g":
      playPodium(6);
      break;
    case "podium_h":
      playPodium(7);
      break;
    case "podium_i":
      playPodium(8);
      break;
    case "podium_j":
      playPodium(9);
      break;

    case "sixty_tension_a":
      playSixtyTension(0);
      break;
    case "sixty_tension_b":
      playSixtyTension(1);
      break;
    case "sixty_tension_c":
      playSixtyTension(2);
      break;
    case "sixty_tension_d":
      playSixtyTension(3);
      break;
    case "sixty_tension_e":
      playSixtyTension(4);
      break;

    default:
      break;
  }
}

/** Countdown 3 → 2 → 1 (naslednje vprašanje). */
export function startCountdownPreview(onTick?: (n: number) => void): () => void {
  unlockSfx();
  stopCountdownPreview();
  const steps = [3, 2, 1];
  let i = 0;

  const run = () => {
    const step = steps[i];
    if (step === undefined) {
      countdownTimer = null;
      return;
    }
    onTick?.(step);
    previewPlaygroundSfx("countdown_beep");
    i += 1;
    if (i < steps.length) {
      countdownTimer = setTimeout(run, 1000);
    } else {
      countdownTimer = null;
    }
  };

  run();
  return stopCountdownPreview;
}

export function stopCountdownPreview(): void {
  if (countdownTimer != null) {
    clearTimeout(countdownTimer);
    countdownTimer = null;
  }
  stopLongPreview();
}
