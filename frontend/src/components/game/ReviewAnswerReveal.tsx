import { formatPoints } from "../../format";
import type { GameMessage } from "../../types";

export function ReviewAnswerReveal({ message }: { message: GameMessage }) {
  const correct = formatCorrectAnswer(message);
  const explanation = (message.explanation || "").trim();
  if (!correct && !explanation) return null;

  return (
    <div className="review-answer-block">
      {correct ? (
        <p className="review-answer">
          <span className="review-answer-label">Odgovor:</span> {correct}
        </p>
      ) : null}
      {explanation ? <p className="review-explain under-question">{explanation}</p> : null}
      {message.correct_value !== undefined && message.selected_value !== undefined ? (
        <p className="fine under-question">Tvoja ocena: {formatPoints(message.selected_value)}</p>
      ) : null}
    </div>
  );
}

function formatCorrectAnswer(message: GameMessage): string | null {
  const question = message.question;
  if (!question) return null;

  if (message.correct_option_ids?.length && question.options?.length) {
    const texts = message.correct_option_ids
      .map((id) => question.options?.find((option) => option.id === id)?.text)
      .filter((text): text is string => Boolean(text));
    if (!texts.length) return null;
    if (question.question_type === "ordering") return texts.join(" → ");
    return texts.join(", ");
  }

  if (message.correct_pairs?.length) {
    return message.correct_pairs.map((pair) => `${pair.left} → ${pair.right}`).join("; ");
  }

  if (message.correct_value !== undefined) {
    const tol = message.tolerance != null ? ` (± ${formatPoints(message.tolerance)})` : "";
    return `${formatPoints(message.correct_value)}${tol}`;
  }

  return null;
}
