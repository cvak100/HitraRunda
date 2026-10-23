import { GameModeRows } from "../gameModes";

export function PlayHubPage() {
  return (
    <section className="panel">
      <p className="eyebrow">Igraj</p>
      <h1>Izberi igro</h1>
      <GameModeRows />
    </section>
  );
}
