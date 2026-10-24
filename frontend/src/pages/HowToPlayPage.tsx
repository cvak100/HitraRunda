import { Link } from "react-router-dom";

import { useAuth } from "../auth";
import { BackNav, GAME_MODES, ModeRules, PlayLink } from "../gameModes";

export function HowToPlayPage() {
  const { user } = useAuth();

  return (
    <section className="panel">
      <p className="eyebrow">Pomoč</p>
      <h1>Kako igrati</h1>
      <BackNav to={user ? "/igra" : "/"} label={user ? "Na igre" : "Domov"} />
      <p className="lead">
        Hitra runda je kviz v slovenščini. Začneš lahko kot gost z vzdevkom; z računom rezultati ostanejo na
        lestvici. Spodaj so pravila za vsak način.
      </p>

      <div className="how-to-modes">
        {GAME_MODES.map((mode) => (
          <article key={mode.id} className="how-to-mode">
            <p className="eyebrow">{mode.eyebrow}</p>
            <h2>{mode.title}</h2>
            <ModeRules mode={mode.id} />
            <div className="actions">
              {user ? <PlayLink to={mode.playTo} /> : null}
              <Link className="btn-with-icon" to={mode.boardTo}>
                Lestvica
              </Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
