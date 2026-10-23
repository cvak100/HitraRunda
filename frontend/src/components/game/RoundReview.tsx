import { useEffect, useRef, useState } from "react";

import { formatPoints } from "../../format";
import type { GameMessage } from "../../types";
import { Avatar } from "../Avatar";

export function RoundReview({
  message,
  myId,
  isHost,
  onNext,
}: {
  message: GameMessage;
  myId: string;
  isHost: boolean;
  onNext: () => void;
  boardPath?: string;
}) {
  const advanceSeconds = message.advance_seconds ?? 5;
  const [secondsLeft, setSecondsLeft] = useState(advanceSeconds);
  const onNextRef = useRef(onNext);
  onNextRef.current = onNext;

  useEffect(() => {
    setSecondsLeft(advanceSeconds);
    const started = Date.now();
    let fired = false;
    const tick = window.setInterval(() => {
      const left = Math.max(0, advanceSeconds - Math.floor((Date.now() - started) / 1000));
      setSecondsLeft(left);
      // Rezerva, če strežnikov timer odpade — kateri koli klient potisne next ob 0.
      if (left <= 0 && !fired) {
        fired = true;
        onNextRef.current();
      }
    }, 200);
    return () => window.clearInterval(tick);
  }, [advanceSeconds, message.index]);

  return (
    <div className="review good">
      <h2>Rezultat runde</h2>
      {message.explanation ? <p>{message.explanation}</p> : null}
      {message.sudden_death ? (
        <p className="fine">Sudden death · še v igri: {message.alive_count ?? "?"}</p>
      ) : null}
      <ul>
        {(message.answers || []).map((row) => (
          <li key={`${row.member_id}-${row.nickname}`} className={row.is_correct ? "answered-correct" : "answered-wrong"}>
            <span className="answer-player">
              <Avatar avatar={row.avatar} color={row.color || "#7dcea0"} size={28} title={row.nickname} />
              <span>
                {row.nickname}
                {row.member_id === myId ? " (ti)" : ""}
              </span>
            </span>
            <span>
              {row.timed_out ? "čas" : row.is_correct ? "prav" : "narobe"} · {formatPoints(row.points)}
              {row.round_bonus ? " · rundni bonus" : ""}
              {row.streak_bonus ? ` · streak +${row.streak_bonus}` : ""}
              {row.catchup_bonus ? ` · catch-up +${row.catchup_bonus}` : ""}
              {row.eliminated ? " · izločen" : ""}
            </span>
          </li>
        ))}
      </ul>
      <div className="stack">
        <p className="fine">
          {message.is_last ? "Zaključek" : "Naslednje vprašanje"} čez {secondsLeft} s…
        </p>
        {isHost ? (
          <button type="button" className="primary" onClick={onNext}>
            {message.is_last ? "Zaključi zdaj" : "Naprej zdaj"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
