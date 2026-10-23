import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { api } from "./api";

export const GAME_MODES = [
  {
    id: "hitrarunda",
    eyebrow: "Kratke solo runde",
    title: "Hitra runda",
    blurb: "5–15 vprašanj iz izbranih kategorij. Brez jokerjev — šteje hitrost.",
    playTo: "/igra/hitrarunda",
    boardTo: "/lestvica/hitrarunda",
  },
  {
    id: "ala_milijonar",
    eyebrow: "15 stopenj z jokerji",
    title: "Ala milijonar",
    blurb:
      "Vprašanja s 4 odgovori, 90 s na vprašanje, težavnost 1→5. Polovička, glas ljudstva, klic v sili.",
    playTo: "/igra/ala-milijonar",
    boardTo: "/lestvica/ala-milijonar",
  },
  {
    id: "multiplayer",
    eyebrow: "Igraj z drugimi",
    title: "Hitra tekma",
    blurb: "Odpri sobo ali se pridruži s kodo. Ista vprašanja za vse, zmaga najhitrejši.",
    playTo: "/igra/vec-igralcev",
    boardTo: "/lestvica/vec-igralcev",
  },
  {
    id: "dirka",
    eyebrow: "Dirka do točk",
    title: "Dirka",
    blurb: "Prvi do cilja. Fiksni bonusi, varna zona in Dirka AI. Ista vprašanja, naprej ko vsi odgovorijo.",
    playTo: "/igra/dirka",
    boardTo: "/lestvica/dirka",
  },
  {
    id: "60_sekund",
    eyebrow: "Preživi minuto",
    title: "60 sekund",
    blurb: "Skupni čas. Pravilno +2 s, napačno −5 s, preskok −2 s. Čim več pravilnih, preden ura pride na 0.",
    playTo: "/igra/60-sekund",
    boardTo: "/lestvica/60-sekund",
  },
] as const;

export function GameModeRows({ lockedHint }: { lockedHint?: string }) {
  const [enabled, setEnabled] = useState<string[] | null>(null);

  useEffect(() => {
    api<{ enabled_modes?: string[] }>("/api/game-config/")
      .then((cfg) => setEnabled(cfg.enabled_modes ?? GAME_MODES.map((g) => g.id)))
      .catch(() => setEnabled(GAME_MODES.map((g) => g.id)));
  }, []);

  const modes = enabled
    ? GAME_MODES.filter((game) => enabled.includes(game.id))
    : GAME_MODES;

  return (
    <div className="game-rows">
      {modes.map((game) => (
        <article key={game.playTo} className="game-row">
          <div>
            <p className="eyebrow">{game.eyebrow}</p>
            <h2>{game.title}</h2>
            <p>{game.blurb}</p>
          </div>
          {lockedHint ? (
            <p className="fine">{lockedHint}</p>
          ) : (
            <div className="game-row-actions">
              <Link className="primary btn-with-icon" to={game.playTo}>
                <PlayIcon />
                Igraj
              </Link>
              <Link className="btn-with-icon board-icon-btn" to={game.boardTo} aria-label="Lestvica" title="Lestvica">
                <BoardIcon />
              </Link>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}

export function ModePageNav({ boardTo }: { boardTo?: string }) {
  return (
    <nav className="mode-page-nav" aria-label="Navigacija načina">
      <Link className="btn-with-icon mode-nav-btn" to="/igra">
        <BackIcon />
        Druge igre
      </Link>
      {boardTo ? (
        <Link className="btn-with-icon mode-nav-btn" to={boardTo}>
          <BoardIcon />
          Lestvica
        </Link>
      ) : null}
    </nav>
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

export function BoardLink({ to }: { to: string }) {
  return (
    <Link className="btn-with-icon mode-nav-btn" to={to}>
      <BoardIcon />
      
    </Link>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11.04-6.86a1 1 0 0 0 0-1.72L9.5 4.28a1 1 0 0 0-1.5.86z"
      />
    </svg>
  );
}

export function BoardIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M4 14h4v7H4zm6-6h4v13h-4zm6-5h4v18h-4z" />
    </svg>
  );
}

export function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 6l-6 6 6 6"
      />
    </svg>
  );
}
