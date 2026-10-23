import { NumberStepper } from "./NumberStepper";

export type LobbyAiMode = "multiplayer" | "dirka";

/**
 * En stepper za AI v lobby načinih. ``mode`` pove, za kateri način
 * backend izbere bote (``AiBot.modes``) — UI je vedno enak.
 */
export function AiOpponentsField({
  mode,
  value,
  onChange,
  max,
}: {
  mode: LobbyAiMode;
  value: number;
  onChange: (next: number) => void;
  max: number;
}) {
  return (
    <div data-ai-mode={mode}>
      <NumberStepper label="AI bots" value={value} min={0} max={Math.max(0, max)} onChange={onChange} />
    </div>
  );
}

export function maxAiSlots(maxPlayers: number, humanCount: number, siteMaxBots: number) {
  return Math.max(0, Math.min(siteMaxBots, maxPlayers - Math.max(1, humanCount)));
}
