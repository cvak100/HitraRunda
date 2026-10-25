export function formatPoints(value: number) {
  return new Intl.NumberFormat("sl-SI").format(value);
}

export function formatWhen(value: string) {
  return new Date(value).toLocaleString("sl-SI", { dateStyle: "medium", timeStyle: "short" });
}

export function formatDuration(value: number | null) {
  if (value == null) return "—";
  const seconds = Math.max(0, Math.round(value / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes ? `${minutes} min ${rest} s` : `${rest} s`;
}

export const REASONS: Record<string, string> = {
  completed: "Odgovoril si na vsa vprašanja.",
  wrong: "Napačen odgovor.",
  timeout: "Čas je potekel.",
  walk_away: "Odnehal si z doseženo nagrado.",
};

export const MODE_LABELS: Record<string, string> = {
  hitrarunda: "Hitra runda",
  millionaire: "Hitra runda",
  ala_milijonar: "Ala milijonar",
  multiplayer: "Hitra tekma",
  dirka: "Dirka",
  "60_sekund": "60 sekund",
  zastave: "Ugib zastav",
};

export function formatMode(mode: string) {
  return MODE_LABELS[mode] || mode;
}
