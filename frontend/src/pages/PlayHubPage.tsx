import { Link } from "react-router-dom";

export function PlayHubPage() {
  return (
    <section className="panel">
      <p className="eyebrow">Igraj</p>
      <h1>Izberi igro</h1>
      <div className="game-split">
        <div className="game-block">
          <p className="eyebrow">Hitra runda</p>
          <h2>Kratke solo runde</h2>
          <p>5–15 vprašanj. Brez jokerjev. Hitrost šteje. Lastna lestvica.</p>
          <Link className="primary" to="/igra/hitrarunda">
            Nastavi Hitra runda
          </Link>
        </div>
        <div className="game-block">
          <p className="eyebrow">Ala milijonar</p>
          <h2>15 vprašanj + 3 jokerji</h2>
          <p>Polovička, glas ljudstva in klic v sili. Pred začetkom izbereš 3 prijatelje. Lastna lestvica.</p>
          <Link className="primary" to="/igra/ala-milijonar">
            Nastavi Ala milijonar
          </Link>
        </div>
      </div>
    </section>
  );
}
