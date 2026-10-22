import { formatPoints } from "../format";
import type { QuestionType, StaffQuestion } from "../types";

export const TYPE_LABELS: Record<QuestionType, string> = {
  multiple_choice: "Več možnosti",
  true_false: "Drži / ne drži",
  multi_select: "Več pravilnih",
  ordering: "Vrstni red",
  matching: "Povezovanje",
  slider: "Drsnik",
};

export function QuestionBody({ question }: { question: StaffQuestion }) {
  return (
    <div>
      <p className="fine">
        {question.key} · {TYPE_LABELS[question.question_type]} · težavnost {question.difficulty}
        {question.is_active ? "" : " · umaknjeno"}
      </p>
      {question.explanation ? <p>{question.explanation}</p> : null}
      {question.options ? (
        <ol>
          {question.options.map((option) => (
            <li key={`${option.order}-${option.text}`}>
              {question.question_type === "ordering" ? option.text : `${option.correct ? "✓" : "·"} ${option.text}`}
            </li>
          ))}
        </ol>
      ) : null}
      {question.pairs ? (
        <ul>
          {question.pairs.map((pair) => (
            <li key={`${pair.left}-${pair.right}`}>
              {pair.left} → {pair.right}
            </li>
          ))}
        </ul>
      ) : null}
      {question.slider ? (
        <p>
          Obseg {formatPoints(question.slider.min)}–{formatPoints(question.slider.max)}, korak {formatPoints(question.slider.step)}. Pravilno{" "}
          {formatPoints(question.slider.correct)}
          {question.slider.tolerance ? ` (± ${formatPoints(question.slider.tolerance)})` : ""}.
        </p>
      ) : null}
    </div>
  );
}
