/** Risani avatarji — isto kot backend `accounts.nicknames._AVATAR_NOUNS`. */
export const AVATARS = [
  { key: "ris", label: "Ris" },
  { key: "volk", label: "Volk" },
  { key: "orel", label: "Orel" },
  { key: "sokol", label: "Sokol" },
  { key: "medved", label: "Medved" },
  { key: "delfin", label: "Delfin" },
  { key: "jelen", label: "Jelen" },
  { key: "zmaj", label: "Zmaj" },
  { key: "vitez", label: "Vitez" },
  { key: "gams", label: "Gams" },
  { key: "lev", label: "Lev" },
  { key: "tiger", label: "Tiger" },
  { key: "smuk", label: "Smuk" },
  { key: "kapetan", label: "Kapetan" },
  { key: "jastreb", label: "Jastreb" },
  { key: "zajec", label: "Zajec" },
  { key: "kit", label: "Kit" },
  { key: "kameleon", label: "Kameleon" },
  { key: "metulj", label: "Metulj" },
  { key: "krokar", label: "Krokar" },
  { key: "golob", label: "Golob" },
  { key: "labod", label: "Labod" },
  { key: "jaguar", label: "Jaguar" },
  { key: "panter", label: "Panter" },
  { key: "gepard", label: "Gepard" },
  { key: "kralj", label: "Kralj" },
  { key: "knez", label: "Knez" },
  { key: "strazar", label: "Stražar" },
  { key: "lovec", label: "Lovec" },
  { key: "pionir", label: "Pionir" },
  { key: "raziskovalec", label: "Raziskovalec" },
  { key: "navigator", label: "Navigator" },
  { key: "pilot", label: "Pilot" },
  { key: "admiral", label: "Admiral" },
  { key: "general", label: "General" },
  { key: "junak", label: "Junak" },
  { key: "feniks", label: "Feniks" },
  { key: "samorog", label: "Samorog" },
  { key: "kekec", label: "Kekec" },
  { key: "rozle", label: "Rožle" },
  { key: "minotaver", label: "Minotaver" },
  // Ženski (nadaljevanje istega seznama)
  { key: "vitezinja", label: "Vitezinja" },
  { key: "princesa", label: "Princesa" },
  { key: "carovnica", label: "Čarovnica" },
  { key: "kraljica", label: "Kraljica" },
  { key: "amazonka", label: "Amazonka" },
  { key: "indijanka", label: "Indijanka" },
  { key: "pehta", label: "Pehta" },
] as const;

export type AvatarKey = (typeof AVATARS)[number]["key"];

/** Samo barve iz igre — brez zlatega designa, kreme in sivine. */
export const AVATAR_COLORS = [
  "#7dcea0",
  "#e07a68",
  "#f5b041",
  "#85c1e9",
  "#bb8fce",
  "#e74c3c",
  "#e59866",
] as const;

export const DEFAULT_AVATAR_COLOR = AVATAR_COLORS[0];

export function avatarLabel(key: string | undefined | null): string {
  if (!key) return "";
  return AVATARS.find((item) => item.key === key)?.label || key;
}

export function avatarSrc(key: string | undefined | null): string {
  const safe = AVATARS.some((item) => item.key === key) ? key : "ris";
  return `/avatars/${safe}.jpg`;
}

/** @deprecated uporabi AVATARS */
export const AVATAR_PROFILES = AVATARS;
