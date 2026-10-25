import { useEffect, useState } from "react";

import { ApiError, api } from "../../api";
import { REASONS, formatPoints } from "../../format";
import type { GameMessage } from "../../types";
import { FinishActions } from "./FinishActions";
import { ReviewAnswerReveal } from "./ReviewAnswerReveal";

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
  const finished = message.phase === "finished" || Boolean(message.finished);

  useEffect(() => {
    setLeaving(false);
  }, [question?.game_question_id, message.phase]);
  const isFlags = message.mode === "zastave";
  const canContinue = Boolean(message.is_correct) || isFlags;
  const replayPath =
    message.mode === "ala_milijonar"
      ? "/igra/ala-milijonar"
      : message.mode === "60_sekund"
        ? "/igra/60-sekund"
        : message.mode === "zastave"
          ? "/igra/zastave"
          : "/igra/hitrarunda";
  const title = message.walked_away
    ? "Odnehal si"
    : message.timed_out
      ? "Čas je potekel"
      : message.is_correct
        ? "Pravilno"
        : "Napačno";
  const tone = message.walked_away || message.is_correct ? "good" : "bad";
  const reason = message.reason || "";
  const showReason = reason === "completed" || reason === "walk_away";
  const scoreLabel = message.mode === "hitrarunda" || isFlags ? "Točke" : "Nagrada";

  function goNext() {
    if (leaving || !canContinue) return;
    setLeaving(true);
    // Zvok "next" predvaja GamePage ob novem question dogodku — ne tukaj (sicer 2×).
    window.setTimeout(() => onNext(), NEXT_BEAT_MS);
  }

  if (finished) {
    return (
      <div className="finish-screen">
        <section className={`finish-last-q review ${tone}`}>
          <p className="review-verdict">{title}</p>
          {question && !message.walked_away ? (
            <>
              <h2 className="finish-q-text">{question.text}</h2>
              {question.image ? <img className="q-image" src={question.image} alt="" /> : null}
              <div className="finish-answer-row">
                <div className="finish-answer-info">
                  <ReviewAnswerReveal message={message} />
                </div>
                <Complaint key={question.game_question_id} gameQuestionId={question.game_question_id} />
              </div>
            </>
          ) : null}
        </section>

        <section className="finish-summary">
          <p className="finish-summary-title">Konec igre</p>
          <p className="finish-summary-score">
            <strong>{formatPoints(message.score ?? 0)}</strong>
            <span> točk</span>
          </p>
          <p className="finish-summary-breakdown">
            {isFlags ? (
              <span>
                {message.correct_count ?? 0}/{message.total_questions ?? message.total ?? 0}{" "}
                pravilnih
              </span>
            ) : (
              <>
                <span>
                  {scoreLabel} {formatPoints(message.prize_reached ?? 0)}
                </span>
                <span className="finish-summary-sep">+</span>
                <span>bonus {formatPoints(message.speed_bonus_total ?? 0)}</span>
                <span className="finish-summary-sep">·</span>
                <span>
                  {message.correct_count ?? 0}/{message.total_questions ?? message.total ?? 0}{" "}
                  pravilnih
                </span>
              </>
            )}
          </p>
          {showReason ? <p className="finish-summary-reason">{REASONS[reason]}</p> : null}
        </section>

        <FinishActions replayTo={replayPath} boardPath={boardPath} resultId={message.result_id} />
      </div>
    );
  }

  return (
    <div className={`review ${tone}${leaving ? " is-leaving" : ""}`}>
      <p className="review-verdict">{title}</p>
      <p className="review-score">
        {isFlags ? (
          <>
            +{formatPoints(message.points ?? 0)} · skupaj{" "}
            <strong>{formatPoints(message.score ?? 0)}</strong>
            <span className="fine">
              {" "}
              · {message.correct_count ?? 0}/{message.total_questions ?? 0}
            </span>
          </>
        ) : (
          <>
            {scoreLabel} {formatPoints(message.prize_reached ?? 0)} + bonus{" "}
            {formatPoints(message.speed_bonus_total ?? 0)} ={" "}
            <strong>{formatPoints(message.score ?? 0)}</strong>
          </>
        )}
      </p>
      <div className="play-slot-cta">
        {question && !message.walked_away && !isFlags ? (
          <Complaint key={question.game_question_id} gameQuestionId={question.game_question_id} />
        ) : (
          <span />
        )}
        {canContinue ? (
          <button type="button" className="primary btn-cta" disabled={leaving} onClick={goNext}>
            {leaving ? "…" : `Naprej${message.next_stake ? ` za ${formatPoints(message.next_stake)}` : ""}`}
          </button>
        ) : null}
      </div>
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
