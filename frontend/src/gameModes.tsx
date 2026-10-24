import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { api } from "./api";
import { BackIcon, BoardIcon, PlayIcon } from "./icons";
import type { GameMode } from "./types";

export const GAME_MODES = [
  {
    id: "hitrarunda" as const,
    eyebrow: "Kratke solo runde",
    title: "Hitra runda",
    blurb: "5–100 vprašanj iz izbranih kategorij. Brez jokerjev — šteje hitrost.",
    playTo: "/igra/hitrarunda",
    boardTo: "/lestvica/hitrarunda",
    rules: [
      "Solo način: igraš sam proti uri in lestvici.",
      "Izbereš kategorije in 5–100 vprašanj. Čas na vprašanje nastaviš sam (npr. 10–60 s).",
      "Brez jokerjev. Vsak pravilen odgovor da 100 točk + speed bonus (hitrejši odgovor = več, do nastavljivega maksimuma).",
      "Prvi napačen ali prepozen odgovor takoj konča igro. Točke do tja ostanejo na rezultatu.",
      "Na lestvici štejejo točke, pravilni odgovori in čas.",
    ],
  },
  {
    id: "ala_milijonar" as const,
    eyebrow: "15 stopenj z jokerji",
    title: "Ala milijonar",
    blurb:
      "15 stopenj, jokerji in varnimi zonami. Napačen odgovor konča igro.",
    playTo: "/igra/ala-milijonar",
    boardTo: "/lestvica/ala-milijonar",
    rules: [
      "Solo način z 15 vprašanji (4 odgovori). Težavnost gre od 1 do 5 (po 3 vprašanja na stopnjo).",
      "Privzeto 90 s na vprašanje. Lestvica nagrad gre od 100 do 1.000.000.",
      "Trije jokerji, vsak enkrat: polovička (odstrani 2 napačna), glas ljudstva, klic v sili (pokličeš enega od svojih 3 prijateljev).",
      "Varne stopnje (privzeto 5. in 10.): če padeš kasneje, ohraniš vsaj to nagrado.",
      "Lahko odnehaš in vzameš trenutno nagrado. Napačen ali prepozen odgovor konča igro (razen varne zone).",
      "Pred začetkom so 3 prijatelji za klic naključno označeni — lahko jih zamenjaš.",
    ],
  },
  {
    id: "multiplayer" as const,
    eyebrow: "Igraj z drugimi",
    title: "Hitra tekma",
    blurb: "Odpri sobo ali se pridruži s kodo. Ista vprašanja za vse, zmaga najhitrejši.",
    playTo: "/igra/vec-igralcev",
    boardTo: "/lestvica/vec-igralcev",
    rules: [
      "Več igralcev (in po želji AI bots) v isti sobi. Vsa vprašanja so enaka za vse.",
      "Host nastavi število vprašanj, čas na vprašanje, vidnost sobe in AI bots (boti so izbrani za ta način).",
      "Vsi morajo biti pripravljeni; host začne. V rundi vsak odda svoj odgovor; naprej gre, ko so vsi oddali (ali po času).",
      "Točke: pravilni odgovor + hitrost + streak bonusi; možen je catch-up bonus za zaostale.",
      "Sudden death (opcijsko): napačen odgovor te izloči — ostali nadaljujejo.",
      "Zmaga igralec z največ točkami na koncu. Rezultat gre na lestvico Hitra tekma (tudi zmage).",
    ],
  },
  {
    id: "dirka" as const,
    eyebrow: "Dirka do točk",
    title: "Dirka",
    blurb: "Prvi do cilja. Bonusi, varna zona in AI bots. Naprej, ko vsi odgovorijo.",
    playTo: "/igra/dirka",
    boardTo: "/lestvica/dirka",
    rules: [
      "Več igralcev dirka do ciljnih točk (npr. 100 / 200 / 500 / 1000). Ista vprašanja za vse.",
      "Čas na vprašanje izbereš ob ustvarjanju sobe (npr. 10–60 s). Naprej gre, ko vsi odgovorijo ali poteče čas.",
      "Pravilni odgovor daje osnovne točke; napačen lahko odšteje. Streak in hot streak prineseta dodatne bonuse.",
      "Varna zona: po N zaporednih pravilnih (npr. 5 ali 10) se del točk zaklene — kasnejša napaka jih ne pobere.",
      "Med igro lahko porabiš bonuse (polovička, namig, kraja točk, comeback …), ki jih dobiš med tekom.",
      "Zmaga, kdor prvi doseže cilj. AI bots so isti sistem kot pri Hitri tekmi, profili pa za način Dirka.",
    ],
  },
  {
    id: "60_sekund" as const,
    eyebrow: "Preživi minuto",
    title: "60 sekund",
    blurb: "Skupni čas. Pravilno +2 s, napačno −5 s, preskok −2 s. Čim več pravilnih pred 0.",
    playTo: "/igra/60-sekund",
    boardTo: "/lestvica/60-sekund",
    rules: [
      "Solo način z enim skupnim časovnim bazenom (privzeto 60 s na startu, ura se lahko podaljša do limitu).",
      "Pravilni odgovor: +čas (privzeto +2 s) in +1 na rezultat. Napačen: −čas (privzeto −5 s). Preskok: −čas (privzeto −2 s).",
      "Število preskokov lahko omejiš (neomejeno / 3 / 5 / 10).",
      "Težavnost skozi čas: blago / normalno / ostro — kasneje pridejo težja vprašanja hitreje ali počasneje.",
      "Igra se konča, ko ura pride na 0. Na lestvici šteje število pravilnih (in čas preživetja).",
    ],
  },
] as const;

export type GameModeId = (typeof GAME_MODES)[number]["id"];

const MODE_BY_ID = Object.fromEntries(GAME_MODES.map((m) => [m.id, m])) as Record<
  GameModeId,
  (typeof GAME_MODES)[number]
>;

/** Alias legacy id → kanonični način. */
function normalizeMode(mode: string): GameModeId | null {
  const raw = String(mode || "").trim();
  if (raw === "millionaire") return "hitrarunda";
  if (raw in MODE_BY_ID) return raw as GameModeId;
  return null;
}

/** Pot do lestvice načina (en vir resnice). */
export function boardPath(mode: string | null | undefined): string {
  const id = normalizeMode(mode || "");
  return id ? MODE_BY_ID[id].boardTo : "/lestvica/hitrarunda";
}

/** Pot do nastavitve / hub igre. */
export function playPath(mode: string | null | undefined): string {
  const id = normalizeMode(mode || "");
  return id ? MODE_BY_ID[id].playTo : "/igra";
}

export function modeMeta(mode: string | null | undefined) {
  const id = normalizeMode(mode || "");
  return id ? MODE_BY_ID[id] : null;
}

export type BoardLinkVariant = "icon" | "nav" | "labeled";

/**
 * Povezava na lestvico — vedno ista ikona.
 * - icon: samo stolpci (finish, game rows)
 * - nav: ikona + »Lestvica« (mode page nav)
 * - labeled: enako kot nav (eksplicitno)
 */
export function BoardLink({
  to,
  mode,
  variant = "nav",
  label = "Lestvica",
}: {
  to?: string;
  mode?: string | GameMode | null;
  variant?: BoardLinkVariant;
  label?: string;
}) {
  const href = to || boardPath(mode);
  if (variant === "icon") {
    return (
      <Link className="btn-with-icon board-icon-btn" to={href} aria-label={label} title={label}>
        <BoardIcon />
      </Link>
    );
  }
  return (
    <Link className="btn-with-icon mode-nav-btn" to={href}>
      <BoardIcon />
      {label}
    </Link>
  );
}

export function PlayLink({
  to,
  mode,
  children = "Igraj",
  className = "primary btn-with-icon",
}: {
  to?: string;
  mode?: string | GameMode | null;
  children?: ReactNode;
  className?: string;
}) {
  const href = to || playPath(mode);
  return (
    <Link className={className} to={href}>
      <PlayIcon />
      {children}
    </Link>
  );
}

const SOLO_MODE_IDS: GameModeId[] = ["hitrarunda", "ala_milijonar", "60_sekund"];
const MULTI_MODE_IDS: GameModeId[] = ["multiplayer", "dirka"];

function ModeRow({
  game,
  lockedHint,
}: {
  game: (typeof GAME_MODES)[number];
  lockedHint?: string;
}) {
  return (
    <article className="game-row">
      <div>
        <p className="eyebrow">{game.eyebrow}</p>
        <h2>{game.title}</h2>
        <p>{game.blurb}</p>
      </div>
      {lockedHint ? (
        <p className="fine">{lockedHint}</p>
      ) : (
        <div className="game-row-actions">
          <PlayLink to={game.playTo} />
          <BoardLink to={game.boardTo} variant="icon" />
        </div>
      )}
    </article>
  );
}

export function GameModeRows({ lockedHint }: { lockedHint?: string }) {
  const [enabled, setEnabled] = useState<string[] | null>(null);

  useEffect(() => {
    api<{ enabled_modes?: string[] }>("/api/game-config/")
      .then((cfg) => setEnabled(cfg.enabled_modes ?? GAME_MODES.map((g) => g.id)))
      .catch(() => setEnabled(GAME_MODES.map((g) => g.id)));
  }, []);

  const modes = enabled ? GAME_MODES.filter((game) => enabled.includes(game.id)) : GAME_MODES;
  const byId = Object.fromEntries(modes.map((m) => [m.id, m])) as Partial<
    Record<GameModeId, (typeof GAME_MODES)[number]>
  >;
  const solo = SOLO_MODE_IDS.map((id) => byId[id]).filter(Boolean) as (typeof GAME_MODES)[number][];
  const multi = MULTI_MODE_IDS.map((id) => byId[id]).filter(Boolean) as (typeof GAME_MODES)[number][];

  return (
    <div className="game-rows">
      {solo.length ? (
        <section className="game-mode-group" aria-labelledby="modes-solo">
          <h2 id="modes-solo" className="game-mode-group-title">
            Igranje sam
          </h2>
          {solo.map((game) => (
            <ModeRow key={game.playTo} game={game} lockedHint={lockedHint} />
          ))}
        </section>
      ) : null}
      {multi.length ? (
        <section className="game-mode-group" aria-labelledby="modes-multi">
          <h2 id="modes-multi" className="game-mode-group-title">
            Igranje z drugimi / proti AI
          </h2>
          {multi.map((game) => (
            <ModeRow key={game.playTo} game={game} lockedHint={lockedHint} />
          ))}
        </section>
      ) : null}
    </div>
  );
}

export function ModePageNav({ boardTo, mode }: { boardTo?: string; mode?: string }) {
  return (
    <nav className="mode-page-nav" aria-label="Navigacija načina">
      <Link className="btn-with-icon mode-nav-btn" to="/igra">
        <BackIcon />
        Druge igre
      </Link>
      {boardTo || mode ? <BoardLink to={boardTo} mode={mode} variant="nav" /> : null}
    </nav>
  );
}

/** Podrobna pravila — takoj pod Druge igre / Lestvica. */
export function ModeRules({ mode }: { mode: string | null | undefined }) {
  const meta = modeMeta(mode);
  if (!meta?.rules?.length) return null;
  return (
    <div className="mode-rules">
      <p className="mode-rules-lead">{meta.blurb}</p>
      <ul>
        {meta.rules.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  );
}

export function BackNav({ to, label = "Nazaj" }: { to: string; label?: string }) {
  return (
    <nav className="mode-page-nav" aria-label="Nazaj">
      <Link className="btn-with-icon mode-nav-btn" to={to}>
        <BackIcon />
        {label}
      </Link>
    </nav>
  );
}

export { BackIcon, BoardIcon, PlayIcon };
