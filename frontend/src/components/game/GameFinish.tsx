import { formatDuration, formatPoints } from "../../format";
import type { GameMessage } from "../../types";
import { FinishActions } from "./FinishActions";

export function SixtyFinish({ message, boardPath }: { message: GameMessage; boardPath: string }) {
  return (
    <div className="finish-screen">
      <section className="finish-summary review good">
        <p className="eyebrow">Konec igre</p>
        <h1 className="review-verdict">Čas je potekel</h1>
        <p className="sixty-score-line">
          <strong>{formatPoints(message.score ?? message.correct_count ?? 0)}</strong> pravilnih
        </p>
        <p className="fine">
          Vprašanj: {message.answered_count ?? message.total_questions ?? 0}
          {" · "}
          Preživel: {formatDuration(message.duration_ms ?? null)}
        </p>
      </section>
      <FinishActions replayTo="/igra/60-sekund" boardPath={boardPath} resultId={message.result_id} />
    </div>
  );
}
