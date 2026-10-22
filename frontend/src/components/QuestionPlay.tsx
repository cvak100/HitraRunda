import { useEffect, useState } from "react";

import type { GameMessage, PublicQuestion } from "../types";

type Props = {
  question: PublicQuestion;
  locked: boolean;
  result: GameMessage | null;
  onSubmit: (body: Record<string, unknown>) => void;
};

export function QuestionPlay({ question, locked, result, onSubmit }: Props) {
  const [items, setItems] = useState(question.options ?? []);
  const [picked, setPicked] = useState<number[]>([]);
  const [pairs, setPairs] = useState<{ left_id: string; right_id: string }[]>([]);
  const [activeLeft, setActiveLeft] = useState<string | null>(null);
  const [value, setValue] = useState(question.slider?.min ?? 0);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  useEffect(() => {
    setItems(question.options ?? []);
    setPicked([]);
    setPairs([]);
    setActiveLeft(null);
    if (question.slider) {
      const { min, max, step } = question.slider;
      const middle = min + Math.round((max - min) / 2 / step) * step;
      setValue(Math.min(max, Math.max(min, middle)));
    }
    // Ponastavi vnos samo ob novem vprašanju, ne ob razkritju odgovora.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question.game_question_id]);

  function optionClass(id: number) {
    if (!result?.correct_option_ids) return "";
    if (result.correct_option_ids.includes(id)) return "is-correct";
    if (result.selected_option_ids?.includes(id)) return "is-wrong";
    return "";
  }

  if (question.question_type === "multiple_choice" || question.question_type === "true_false") {
    return (
      <div className="answers">
        {(question.options ?? []).map((option) => (
          <button
            key={option.id}
            type="button"
            className={`slab ${optionClass(option.id)}`}
            disabled={locked}
            onClick={() => onSubmit({ option_id: option.id })}
          >
            {option.text}
          </button>
        ))}
      </div>
    );
  }

  if (question.question_type === "multi_select") {
    return (
      <div className="answers">
        {(question.options ?? []).map((option) => {
          const on = picked.includes(option.id);
          return (
            <button
              key={option.id}
              type="button"
              className={`slab ${on ? "is-on" : ""} ${optionClass(option.id)}`}
              disabled={locked}
              onClick={() =>
                setPicked((current) =>
                  current.includes(option.id) ? current.filter((id) => id !== option.id) : [...current, option.id],
                )
              }
            >
              {option.text}
            </button>
          );
        })}
        <button
          type="button"
          className="primary"
          disabled={locked || picked.length === 0}
          onClick={() => onSubmit({ option_ids: picked })}
        >
          Potrdi izbor
        </button>
      </div>
    );
  }

  if (question.question_type === "ordering") {
    return (
      <div className="answers">
        {items.map((option, index) => (
          <div
            key={option.id}
            className={`slab order-row ${optionClass(option.id)}`}
            draggable={!locked}
            onDragStart={() => setDragIndex(index)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => {
              if (dragIndex === null || dragIndex === index) return;
              const copy = items.slice();
              const [moved] = copy.splice(dragIndex, 1);
              copy.splice(index, 0, moved);
              setItems(copy);
              setDragIndex(null);
            }}
          >
            <span>{option.text}</span>
            <span className="row-actions">
              <button type="button" disabled={locked || index === 0} onClick={() => move(items, index, -1, setItems)}>
                Gor
              </button>
              <button
                type="button"
                disabled={locked || index === items.length - 1}
                onClick={() => move(items, index, 1, setItems)}
              >
                Dol
              </button>
            </span>
          </div>
        ))}
        <button type="button" className="primary" disabled={locked} onClick={() => onSubmit({ option_ids: items.map((item) => item.id) })}>
          Potrdi vrstni red
        </button>
      </div>
    );
  }

  if (question.question_type === "matching") {
    const left = question.left ?? [];
    const right = question.right ?? [];
    return (
      <div className="match">
        <div className="match-col">
          {left.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`slab ${activeLeft === item.id ? "is-on" : ""} ${pairClass(item.id, result, "left")}`}
              disabled={locked}
              onClick={() => setActiveLeft(item.id)}
            >
              {item.text}
            </button>
          ))}
        </div>
        <div className="match-col">
          {right.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`slab ${pairs.some((pair) => pair.right_id === item.id) ? "is-on" : ""} ${pairClass(item.id, result, "right")}`}
              disabled={locked || !activeLeft}
              onClick={() => {
                if (!activeLeft) return;
                setPairs((current) => [
                  ...current.filter((pair) => pair.left_id !== activeLeft && pair.right_id !== item.id),
                  { left_id: activeLeft, right_id: item.id },
                ]);
                setActiveLeft(null);
              }}
            >
              {item.text}
            </button>
          ))}
        </div>
        <ul className="pair-list">
          {pairs.map((pair) => (
            <li key={pair.left_id}>
              {left.find((item) => item.id === pair.left_id)?.text} → {right.find((item) => item.id === pair.right_id)?.text}
              <button type="button" disabled={locked} onClick={() => setPairs((current) => current.filter((item) => item.left_id !== pair.left_id))}>
                Odstrani
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="primary"
          disabled={locked || pairs.length !== left.length}
          onClick={() => onSubmit({ pairs })}
        >
          Potrdi pare
        </button>
      </div>
    );
  }

  const slider = question.slider;
  if (!slider) return null;
  return (
    <div className="answers">
      <div className="slider-value">{formatSlider(value)}</div>
      <input
        type="range"
        min={slider.min}
        max={slider.max}
        step={slider.step}
        value={value}
        disabled={locked}
        onChange={(event) => setValue(Number(event.target.value))}
      />
      <div className="slider-scale">
        <span>{formatSlider(slider.min)}</span>
        <span>{formatSlider(slider.max)}</span>
      </div>
      <button type="button" className="primary" disabled={locked} onClick={() => onSubmit({ value })}>
        Potrdi oceno
      </button>
    </div>
  );
}

function move(items: { id: number; text: string }[], index: number, direction: -1 | 1, setItems: (items: { id: number; text: string }[]) => void) {
  const next = index + direction;
  if (next < 0 || next >= items.length) return;
  const copy = items.slice();
  const [item] = copy.splice(index, 1);
  copy.splice(next, 0, item);
  setItems(copy);
}

function pairClass(id: string, result: GameMessage | null, side: "left" | "right") {
  if (!result?.correct_pairs) return "";
  const selected = result.selected_pairs ?? [];
  const correct = result.correct_pairs;
  if (side === "left") {
    const chosen = selected.find((pair) => pair.left_id === id);
    if (!chosen) return "";
    const expected = correct.find((pair) => pair.left_id === id);
    return expected && expected.right_id === chosen.right_id ? "is-correct" : "is-wrong";
  }
  const chosen = selected.find((pair) => pair.right_id === id);
  if (!chosen) return "";
  const expected = correct.find((pair) => pair.right_id === id);
  return expected && expected.left_id === chosen.left_id ? "is-correct" : "is-wrong";
}

function formatSlider(value: number) {
  return new Intl.NumberFormat("sl-SI").format(value);
}
