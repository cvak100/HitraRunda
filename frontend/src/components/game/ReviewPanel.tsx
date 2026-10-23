import { useState } from "react";

import { ApiError, api } from "../../api";
import { formatPoints } from "../../format";
import type { GameMessage } from "../../types";
import { ReviewFinish } from "./GameFinish";

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
  return (
    <div className={`review ${tone}`}>
      <h2>{title}</h2>
      {message.explanation ? <p>{message.explanation}</p> : null}
      {question && message.correct_option_ids && question.question_type === "ordering" ? (
        <p>
          Pravilen vrstni red:{" "}
          {message.correct_option_ids
            .map((id) => question.options?.find((option) => option.id === id)?.text)
            .join(" → ")}
        </p>
      ) : null}
      {message.correct_pairs ? (
        <ul>
          {message.correct_pairs.map((pair) => (
            <li key={pair.left_id}>
              {pair.left} → {pair.right}
            </li>
          ))}
        </ul>
      ) : null}
      {message.correct_value !== undefined ? (
        <p>
          Pravilno: {formatPoints(message.correct_value)}
          {message.tolerance ? ` (± ${formatPoints(message.tolerance)})` : ""}. Tvoja ocena:{" "}
          {message.selected_value !== undefined ? formatPoints(message.selected_value) : "—"}.
        </p>
      ) : null}
      <p>
        Nagrada {formatPoints(message.prize_reached ?? 0)} + bonus {formatPoints(message.speed_bonus_total ?? 0)} ={" "}
        <strong>{formatPoints(message.score ?? 0)}</strong>
      </p>
      {question && !message.walked_away ? (
        <Complaint key={question.game_question_id} gameQuestionId={question.game_question_id} />
      ) : null}
      {message.phase === "finished" || message.finished ? (
        <ReviewFinish message={message} replayTo={replayPath} boardPath={boardPath} />
      ) : (
        <button type="button" className="primary" onClick={onNext}>
          Naprej{message.next_stake ? ` za ${formatPoints(message.next_stake)}` : ""}
        </button>
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

  if (sent) return <p className="fine">{sent}</p>;

  return (
    <div className="stack">
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
            <button type="button" onClick={() => setOpen(false)}>
              Prekliči
            </button>
          </div>
        </>
      ) : (
        <button type="button" onClick={() => setOpen(true)}>
          Pritožba
        </button>
      )}
    </div>
  );
}
