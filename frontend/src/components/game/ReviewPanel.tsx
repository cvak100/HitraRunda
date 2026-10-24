import { useEffect, useState } from "react";

import { ApiError, api } from "../../api";
import { formatPoints } from "../../format";
import { playSfx } from "../../sound";
import type { GameMessage } from "../../types";
import { ReviewFinish } from "./GameFinish";

const NEXT_BEAT_MS = 700;

export function ReviewPanel({
  message,
  onNext,
  boardPath,
}: {
  message: GameMessage;
  onNext: () => void;
  boardPath: string;
}) {
  const question = message.question;
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    setLeaving(false);
  }, [question?.game_question_id, message.phase]);
  const replayPath =
    message.mode === "ala_milijonar"
      ? "/igra/ala-milijonar"
      : message.mode === "60_sekund"
        ? "/igra/60-sekund"
        : "/igra/hitrarunda";
  const title = message.walked_away
    ? "Odnehal si"
    : message.timed_out
      ? "Čas je potekel"
      : message.is_correct
        ? "Pravilno"
        : "Napačno";
  const tone = message.walked_away || message.is_correct ? "good" : "bad";

  function goNext() {
    if (leaving || !message.is_correct) return;
    setLeaving(true);
    playSfx("next");
    window.setTimeout(() => onNext(), NEXT_BEAT_MS);
  }

  return (
    <div className={`review ${tone}${leaving ? " is-leaving" : ""}`}>
      <p className="review-verdict">{title}</p>
      <p className="review-score">
        Nagrada {formatPoints(message.prize_reached ?? 0)} + bonus{" "}
        {formatPoints(message.speed_bonus_total ?? 0)} ={" "}
        <strong>{formatPoints(message.score ?? 0)}</strong>
      </p>
      {message.phase === "finished" || message.finished ? (
        <>
          {question && !message.walked_away ? (
            <div className="play-slot-cta">
              <Complaint key={question.game_question_id} gameQuestionId={question.game_question_id} />
            </div>
          ) : null}
          <ReviewFinish message={message} replayTo={replayPath} boardPath={boardPath} />
        </>
      ) : (
        <div className="play-slot-cta">
          {question && !message.walked_away ? (
            <Complaint key={question.game_question_id} gameQuestionId={question.game_question_id} />
          ) : (
            <span />
          )}
          {message.is_correct ? (
            <button type="button" className="primary btn-cta" disabled={leaving} onClick={goNext}>
              {leaving ? "…" : `Naprej${message.next_stake ? ` za ${formatPoints(message.next_stake)}` : ""}`}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}

function Complaint({ gameQuestionId }: { gameQuestionId: string }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [sent, setSent] = useState("");
  const [error, setError] = useState("");

  async function send() {
    setError("");
    try {
      const result = await api<{ detail: string }>("/api/reports/", {
        method: "POST",
        body: JSON.stringify({ game_question_id: gameQuestionId, note }),
      });
      setSent(result.detail);
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Pritožbe ni bilo mogoče oddati.");
    }
  }

  if (sent) return <p className="fine complaint-sent">{sent}</p>;

  return (
    <div className={`complaint${open ? " is-open" : ""}`}>
      {open ? (
        <>
          <label>
            Kaj ni v redu?
            <textarea value={note} maxLength={1000} onChange={(event) => setNote(event.target.value)} />
          </label>
          {error ? <p className="error">{error}</p> : null}
          <div className="actions">
            <button type="button" className="primary" onClick={() => void send()}>
              Pošlji pritožbo
            </button>
            <button type="button" className="btn-tertiary" onClick={() => setOpen(false)}>
              Prekliči
            </button>
          </div>
        </>
      ) : (
        <button type="button" className="btn-tertiary" onClick={() => setOpen(true)}>
          Pritožba
        </button>
      )}
    </div>
  );
}
