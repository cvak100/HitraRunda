import { Link } from "react-router-dom";

export function PlayHubPage() {
  return (
    <section className="panel">
      <p className="eyebrow">Igraj</p>
      <h1>Izberi igro</h1>
      <div className="game-split">
        <div className="game-block">
          <p className="eyebrow">Kratke solo runde</p>
          <h2>Hitra runda</h2>
          <p>5–15 vprašanj. Brez jokerjev. Hitrost šteje. Lastna lestvica.</p>
          <Link className="primary" to="/igra/hitrarunda">
            Nastavi Hitra runda
          </Link>
        </div>
        <div className="game-block">
          <p className="eyebrow">15 stopenj z jokerji</p>
          <h2>Ala milijonar</h2>
          <p>Polovička, glas ljudstva in klic v sili. Pred začetkom izbereš 3 prijatelje. Lastna lestvica.</p>
          <Link className="primary" to="/igra/ala-milijonar">
            Nastavi Ala milijonar
          </Link>
        </div>
        <div className="game-block">
          <p className="eyebrow">Igraj z drugimi</p>
          <h2>Hitra tekma</h2>
          <p>Odpri sobo ali se pridruži s kodo. Ista vprašanja za vse, zmaga najhitrejši.</p>
          <Link className="primary" to="/igra/vec-igralcev">
            Odpri lobby
          </Link>
        </div>
      </div>
    </section>
  );
}
