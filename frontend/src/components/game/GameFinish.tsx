import { REASONS, formatDuration, formatPoints } from "../../format";
import type { GameMessage } from "../../types";
import { FinishActions } from "./FinishActions";

export function SixtyFinish({ message, boardPath }: { message: GameMessage; boardPath: string }) {
  return (
    <div className="review good">
      <h2>Čas je potekel</h2>
      <p className="sixty-score-line">
        <strong>{formatPoints(message.score ?? message.correct_count ?? 0)}</strong> pravilnih
      </p>
      <p className="fine">
        Vprašanj: {message.answered_count ?? message.total_questions ?? 0}
        {" · "}
        Preživel: {formatDuration(message.duration_ms ?? null)}
      </p>
      <FinishActions replayTo="/igra/60-sekund" boardPath={boardPath} />
    </div>
  );
}

/** Zaključni del Review prikaza (razlog konca + CTA) za solo načine. */
export function ReviewFinish({
  message,
  replayTo,
  boardPath,
}: {
  message: GameMessage;
  replayTo: string;
  boardPath: string;
}) {
  return (
    <>
      <p>{REASONS[message.reason || ""] || "Igra je končana."}</p>
      <FinishActions replayTo={replayTo} boardPath={boardPath} />
    </>
  );
}
