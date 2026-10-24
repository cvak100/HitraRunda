import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { BoardLink } from "../../gameModes";
import { playSfx } from "../../sound";
import { AnswerReviewModal } from "./AnswerReviewModal";

/**
 * Vrstni red gumbov na zaključnem zaslonu (vsi načini):
 * 1. Nova igra
 * 2. Lestvica
 * 3. Pregled odgovorov
 * 4. morebitni dodatki (rematch, …) — podaj kot children ali onRematch
 */
export function FinishActions({
  replayTo,
  boardPath: boardTo,
  resultId,
  onRematch,
  rematchBusy = false,
  children,
}: {
  replayTo: string;
  boardPath: string;
  resultId?: number | null;
  onRematch?: () => void;
  rematchBusy?: boolean;
  children?: ReactNode;
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
        <BoardLink to={boardTo} variant="icon" />
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
        {onRematch ? (
          <button type="button" className="btn-secondary" onClick={onRematch} disabled={rematchBusy}>
            Igraj znova v isti sobi
          </button>
        ) : null}
        {children}
      </div>
      <AnswerReviewModal open={reviewOpen} resultId={resultId} onClose={() => setReviewOpen(false)} />
    </>
  );
}
