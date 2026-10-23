import { Link } from "react-router-dom";

import { BoardLink } from "../../gameModes";

export function FinishActions({
  replayTo,
  boardPath: boardTo,
  onRematch,
  rematchBusy = false,
}: {
  replayTo: string;
  boardPath: string;
  onRematch?: () => void;
  rematchBusy?: boolean;
}) {
  return (
    <div className="actions finish-actions">
      <Link className="primary" to={replayTo}>
        Nova igra
      </Link>
      <BoardLink to={boardTo} variant="icon" />
      {onRematch ? (
        <button type="button" onClick={onRematch} disabled={rematchBusy}>
          Igraj znova v isti sobi
        </button>
      ) : null}
    </div>
  );
}
