import { useState } from "react";
import { Link } from "react-router-dom";

import { BoardLink } from "../../gameModes";
import { playSfx } from "../../sound";
import { AnswerReviewModal } from "./AnswerReviewModal";

export function FinishActions({
  replayTo,
  boardPath: boardTo,
  resultId,
  onRematch,
  rematchBusy = false,
}: {
  replayTo: string;
  boardPath: string;
  resultId?: number | null;
  onRematch?: () => void;
  rematchBusy?: boolean;
}) {
  const [reviewOpen, setReviewOpen] = useState(false);

  return (
    <>
      <div className="actions finish-actions">
        <Link
          className="primary btn-cta"
          to={replayTo}
          onClick={() => {
            playSfx("click");
          }}
        >
          Nova igra
        </Link>
        <button
          type="button"
          className="btn-secondary"
          disabled={!resultId}
          onClick={() => {
            playSfx("click");
            setReviewOpen(true);
          }}
        >
          Pregled odgovorov
        </button>
        <BoardLink to={boardTo} variant="icon" />
        {onRematch ? (
          <button type="button" className="btn-secondary" onClick={onRematch} disabled={rematchBusy}>
            Igraj znova v isti sobi
          </button>
        ) : null}
      </div>
      <AnswerReviewModal open={reviewOpen} resultId={resultId} onClose={() => setReviewOpen(false)} />
    </>
  );
}
