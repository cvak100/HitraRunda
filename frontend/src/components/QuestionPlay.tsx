import { useEffect, useState } from "react";

import type { GameMessage, PublicQuestion } from "../types";

type AnswerHighlight = Pick<
  GameMessage,
  "correct_option_ids" | "selected_option_ids" | "correct_pairs" | "selected_pairs"
>;

type Props = {
  question: PublicQuestion;
  locked: boolean;
  result: AnswerHighlight | null;
  eliminatedOptionIds?: number[];
  audienceVotes?: { option_id: number; percent: number }[];
  onSubmit: (body: Record<string, unknown>) => void;
};

export function QuestionPlay({ question, locked, result, eliminatedOptionIds = [], audienceVotes = [], onSubmit }: Props) {
  const [items, setItems] = useState(question.options ?? []);
  const [picked, setPicked] = useState<number[]>([]);
  const [pairs, setPairs] = useState<{ left_id: string; right_id: string }[]>([]);
  const [activePick, setActivePick] = useState<{ side: "left" | "right"; id: string } | null>(null);
  const [value, setValue] = useState(question.slider?.min ?? 0);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  useEffect(() => {
    setItems(question.options ?? []);
    setPicked([]);
    setPairs([]);
    setActivePick(null);
    if (question.slider) {
      const { min, max, step } = question.slider;
      const middle = min + Math.round((max - min) / 2 / step) * step;
      setValue(Math.min(max, Math.max(min, middle)));
    }
    // Ponastavi vnos samo ob novem vprašanju, ne ob razkritju odgovora.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question.game_question_id]);

  function optionClass(id: number) {
    if (result?.correct_option_ids?.length) {
      if (result.correct_option_ids.includes(id)) return "is-correct";
      if (result.selected_option_ids?.includes(id)) return "is-wrong";
      return "";
    }
    if (result?.selected_option_ids?.includes(id) || picked.includes(id)) return "is-on";
    return "";
  }

  if (question.question_type === "multiple_choice" || question.question_type === "true_false") {
    const voteMap = Object.fromEntries(audienceVotes.map((vote) => [vote.option_id, vote.percent]));
    return (
      <div className="answers">
        {(question.options ?? []).map((option) => {
          if (eliminatedOptionIds.includes(option.id)) return null;
          const vote = voteMap[option.id];
          return (
            <button
              key={option.id}
              type="button"
              className={`slab ${optionClass(option.id)}`}
              disabled={locked}
              onClick={() => {
                setPicked([option.id]);
                onSubmit({ option_id: option.id });
              }}
            >
              {option.text}
              {vote !== undefined ? <span className="fine"> · {vote} %</span> : null}
            </button>
          );
        })}
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
    const partnerOf = (side: "left" | "right", id: string) => {
      const pair = pairs.find((item) => (side === "left" ? item.left_id === id : item.right_id === id));
      if (!pair) return null;
      const otherId = side === "left" ? pair.right_id : pair.left_id;
      const pool = side === "left" ? right : left;
      return pool.find((item) => item.id === otherId)?.text || null;
    };

    function pick(side: "left" | "right", id: string) {
      if (locked) return;
      if (!activePick) {
        setActivePick({ side, id });
        return;
      }
      if (activePick.side === side) {
        setActivePick(activePick.id === id ? null : { side, id });
        return;
      }
      const leftId = side === "left" ? id : activePick.id;
      const rightId = side === "right" ? id : activePick.id;
      setPairs((current) => [
        ...current.filter((pair) => pair.left_id !== leftId && pair.right_id !== rightId),
        { left_id: leftId, right_id: rightId },
      ]);
      setActivePick(null);
    }

    return (
      <div className="match">
        <div className="match-board">
          <div className="match-col" aria-label="Levi stolpec">
            {left.map((item) => {
              const partner = partnerOf("left", item.id);
              const selected = activePick?.side === "left" && activePick.id === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`slab match-item ${selected ? "is-on" : ""} ${partner ? "is-paired" : ""} ${pairClass(item.id, result, "left")}`}
                  disabled={locked}
                  onClick={() => pick("left", item.id)}
                >
                  <span>{item.text}</span>
                  {partner ? <span className="fine match-partner">→ {partner}</span> : null}
                </button>
              );
            })}
          </div>
          <div className="match-col" aria-label="Desni stolpec">
            {right.map((item) => {
              const partner = partnerOf("right", item.id);
              const selected = activePick?.side === "right" && activePick.id === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`slab match-item ${selected ? "is-on" : ""} ${partner ? "is-paired" : ""} ${pairClass(item.id, result, "right")}`}
                  disabled={locked}
                  onClick={() => pick("right", item.id)}
                >
                  <span>{item.text}</span>
                  {partner ? <span className="fine match-partner">← {partner}</span> : null}
                </button>
              );
            })}
          </div>
        </div>
        <div className="match-actions">
          <button
            type="button"
            disabled={locked || pairs.length === 0}
            onClick={() => {
              setPairs([]);
              setActivePick(null);
            }}
          >
            Ponastavi
          </button>
          <button
            type="button"
            className="primary"
            disabled={locked || pairs.length !== left.length}
            onClick={() => onSubmit({ pairs })}
          >
            Potrdi pare
          </button>
        </div>
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

function pairClass(id: string, result: AnswerHighlight | null, side: "left" | "right") {
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
