/** Slovenski napisi + ikone za Dirka bonuse (effect_key). */

import type { ReactNode } from "react";

export type DirkaBonusMeta = {
  label: string;
  short: string;
  description: string;
};

export const DIRKA_BONUS_META: Record<string, DirkaBonusMeta> = {
  fifty_fifty: {
    label: "50/50",
    short: "50/50",
    description: "Odstrani 2 napačni možnosti (ali močno pomaga pri matching/slider).",
  },
  hint: {
    label: "Namig",
    short: "Namig",
    description: "Odstrani 1 napačno možnost (ali rahlo pomaga pri matching/slider).",
  },
  extra_time: {
    label: "Dodaten čas",
    short: "+čas",
    description: "+30 s na tvoj osebni timer.",
  },
  second_chance: {
    label: "Drugi poskus",
    short: "2. poskus",
    description: "En dodaten poskus, če zgrešiš.",
  },
  skip: {
    label: "Preskoči",
    short: "Preskok",
    description: "0 točk, brez kazni, brez napredka.",
  },
  shield: {
    label: "Ščit",
    short: "Ščit",
    description: "Naslednji napačen odgovor ali potek časa te ne kaznuje.",
  },
  steal: {
    label: "Kraja",
    short: "Kraja",
    description: "Ob pravilnem ukradeš 20–40 točk igralcu tik pred tabo.",
  },
  rush: {
    label: "Pospešek",
    short: "Pospešek",
    description: "Nasprotniku tik pred tabo se timer pohitri.",
  },
  double: {
    label: "Dvojne točke",
    short: "×2",
    description: "Dvojne točke za naslednje pravilno vprašanje.",
  },
  block: {
    label: "Blokada",
    short: "Blok",
    description: "Nasprotnik ne more uporabiti bonusa na naslednjem vprašanju.",
  },
};

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg className="dirka-bonus-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      {children}
    </svg>
  );
}

export function DirkaBonusIcon({ effect }: { effect: string }) {
  switch (effect) {
    case "fifty_fifty":
      return (
        <Icon>
          <path
            fill="currentColor"
            d="M4 5h7v7H4V5zm9 0h7v7h-7V5zM4 14h7v5H4v-5zm9 0h7v5h-7v-5z"
            opacity="0.35"
          />
          <path fill="currentColor" d="M4 5h7v7H4V5zm9 14h7v-5h-7v5z" />
        </Icon>
      );
    case "hint":
      return (
        <Icon>
          <path
            fill="currentColor"
            d="M12 3a6 6 0 0 0-3.5 10.8V16h7v-2.2A6 6 0 0 0 12 3zm-2 15h4v1.5a1.5 1.5 0 0 1-1.5 1.5h-1A1.5 1.5 0 0 1 10 19.5V18z"
          />
        </Icon>
      );
    case "extra_time":
      return (
        <Icon>
          <path
            fill="currentColor"
            d="M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm.8 4v4.2l3 1.8-.8 1.3-3.7-2.2V8h1.5z"
          />
        </Icon>
      );
    case "second_chance":
      return (
        <Icon>
          <path
            fill="currentColor"
            d="M12 5a7 7 0 1 0 6.7 9h-2.1A5 5 0 1 1 12 7v2.5L16 6l-4-3.5V5z"
          />
        </Icon>
      );
    case "skip":
      return (
        <Icon>
          <path fill="currentColor" d="M5 6v12l8-6-8-6zm9 0h2v12h-2V6zm3 0h2v12h-2V6z" />
        </Icon>
      );
    case "shield":
      return (
        <Icon>
          <path
            fill="currentColor"
            d="M12 3 5 6v5c0 4.5 3 7.7 7 9 4-1.3 7-4.5 7-9V6l-7-3zm0 2.2 5 2.1v3.7c0 3.3-2.1 5.7-5 6.8-2.9-1.1-5-3.5-5-6.8V7.3l5-2.1z"
          />
        </Icon>
      );
    case "steal":
      return (
        <Icon>
          <path
            fill="currentColor"
            d="M12 3a4 4 0 0 0-4 4v2H6v12h12V9h-2V7a4 4 0 0 0-4-4zm0 2a2 2 0 0 1 2 2v2h-4V7a2 2 0 0 1 2-2z"
          />
        </Icon>
      );
    case "rush":
      return (
        <Icon>
          <path fill="currentColor" d="M3 12h6l2-7 3 14 2-7h5v2h-4.2l-1.3 4.5L11 5.5 8.8 14H3v-2z" />
        </Icon>
      );
    case "double":
      return (
        <Icon>
          <path
            fill="currentColor"
            d="M7.5 6h2.2L12 18h-2.1l-.5-2.2H6.7L6.2 18H4L7.5 6zm-.4 7.5h2.3L8.4 9.2l-.3 4.3zM14 6h6v2h-3.8L18 18h-2.2L14 6z"
          />
        </Icon>
      );
    case "block":
      return (
        <Icon>
          <path
            fill="currentColor"
            d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 2a7 7 0 0 1 5.3 11.6L6.4 6.7A7 7 0 0 1 12 5zM6.7 17.3A7 7 0 0 1 5 12c0-1.4.4-2.7 1.1-3.8l10.7 10.7A7 7 0 0 1 12 19a7 7 0 0 1-5.3-1.7z"
          />
        </Icon>
      );
    default:
      return (
        <Icon>
          <circle cx="12" cy="12" r="7" fill="currentColor" opacity="0.35" />
          <circle cx="12" cy="12" r="3.5" fill="currentColor" />
        </Icon>
      );
  }
}

export function dirkaBonusMeta(effect: string): DirkaBonusMeta {
  return (
    DIRKA_BONUS_META[effect] || {
      label: effect,
      short: effect,
      description: "Bonus v Dirki.",
    }
  );
}
