import { useEffect, useState } from "react";

import { api } from "../../api";
import { formatDuration, formatPoints } from "../../format";
import type { SessionDetail, StageRow } from "../../types";
import { Modal } from "../Modal";

export function AnswerReviewModal({
  open,
  resultId,
  onClose,
}: {
  open: boolean;
  resultId: number | null | undefined;
  onClose: () => void;
}) {
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !resultId) {
      setSession(null);
      setError("");
      return;
    }
    setLoading(true);
    setError("");
    api<SessionDetail>(`/api/results/${resultId}/`)
      .then((data) => {
        setSession(data);
        setError("");
      })
      .catch(() => {
        setSession(null);
        setError("Pregleda odgovorov ni bilo mogoče naložiti.");
      })
      .finally(() => setLoading(false));
  }, [open, resultId]);

  return (
    <Modal title="Pregled odgovorov" open={open} onClose={onClose}>
      {!resultId ? <p className="fine">Za to igro pregled ni na voljo.</p> : null}
      {loading ? <p className="status">Nalagam…</p> : null}
      {error ? <p className="error">{error}</p> : null}
      {session && !loading ? (
        <div className="answer-review-modal">
          <p className="fine">
            {formatPoints(session.score)} točk · {session.correct_count}/{session.total_questions} pravilnih
            {session.duration_ms != null ? ` · ${formatDuration(session.duration_ms)}` : ""}
          </p>
          {session.missing_session ? <p className="fine">Stopnje te igre niso več shranjene.</p> : null}
          <ol className="stages">
            {session.stages.map((stage) => (
              <StageItem key={stage.order} stage={stage} />
            ))}
          </ol>
          {!session.stages.length && !session.missing_session ? (
            <p className="fine">Ni shranjenih vprašanj.</p>
          ) : null}
        </div>
      ) : null}
      <div className="actions" style={{ marginTop: 12 }}>
        <button type="button" className="primary" onClick={onClose}>
          Zapri
        </button>
      </div>
    </Modal>
  );
}

function StageItem({ stage }: { stage: StageRow }) {
  const tone = stage.is_correct ? "good" : stage.is_correct === false ? "bad" : "";
  return (
    <li className={tone}>
      <p className="fine">
        {stage.order}. {stage.category_name} · težavnost {stage.difficulty}
        {stage.time_taken_ms != null ? ` · ${formatDuration(stage.time_taken_ms)}` : ""}
      </p>
      <h2>{stage.text}</h2>
      <p>
        {stage.timed_out
          ? "Čas je potekel"
          : stage.is_correct
            ? "Pravilno"
            : stage.is_correct === false
              ? "Napačno"
              : "Brez odgovora"}
      </p>
      <p>Odgovor: {stage.given}</p>
      <p>Pravilno: {stage.correct}</p>
      {stage.explanation ? <p>{stage.explanation}</p> : null}
    </li>
  );
}
