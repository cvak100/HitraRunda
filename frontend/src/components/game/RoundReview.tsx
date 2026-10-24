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

  const mine = (message.answers || []).find((row) => row.member_id === myId);
  const title = !mine
    ? "Rezultat runde"
    : mine.timed_out
      ? "Čas je potekel"
      : mine.skipped
        ? "Preskočeno"
        : mine.is_correct
          ? "Pravilno"
          : "Napačno";
  const tone = !mine ? "good" : mine.is_correct ? "good" : "bad";
  const myScore =
    message.you?.score ??
    message.standings?.find((row) => row.member_id === myId)?.score ??
    message.players?.[myId]?.score;
  const roundPoints = mine?.points;

  useEffect(() => {
    setSecondsLeft(advanceSeconds);
    const started = Date.now();
    let lastNudge = 0;
    const tick = window.setInterval(() => {
      const left = Math.max(0, advanceSeconds - Math.floor((Date.now() - started) / 1000));
      setSecondsLeft(left);
      // Ob 0: potisni next, in ponavljaj vsake ~1.5 s dokler strežnik ne pošlje novega vprašanja
      // (sicer en neuspešen [] / race pusti UI na »čez 0 s« za vedno).
      if (left <= 0) {
        const now = Date.now();
        if (now - lastNudge >= 1500) {
          lastNudge = now;
          onNextRef.current();
        }
      }
    }, 200);
    return () => window.clearInterval(tick);
  }, [advanceSeconds, message.index]);

  return (
    <div className={`review ${tone}`}>
      <p className="review-verdict">{title}</p>
      {mine ? (
        <p className="review-score">
          {roundPoints != null ? (
            <>
              Ta runda <strong>{formatPoints(roundPoints)}</strong>
              {myScore != null ? (
                <>
                  {" "}
                  · skupaj <strong>{formatPoints(myScore)}</strong>
                </>
              ) : null}
            </>
          ) : myScore != null ? (
            <>
              Skupaj <strong>{formatPoints(myScore)}</strong>
            </>
          ) : null}
        </p>
      ) : null}
      {message.sudden_death ? (
        <p className="fine">Sudden death · še v igri: {message.alive_count ?? "?"}</p>
      ) : null}
      <ul className="round-review-list">
        {(message.answers || []).map((row) => (
          <li
            key={`${row.member_id}-${row.nickname}`}
            className={row.is_correct ? "answered-correct" : "answered-wrong"}
          >
            <span className="answer-player">
              <Avatar avatar={row.avatar} color={row.color || "#7dcea0"} size={28} title={row.nickname} />
              <span>
                {row.nickname}
                {row.member_id === myId ? " (ti)" : ""}
              </span>
            </span>
            <span>
              {row.timed_out
                ? "čas"
                : row.skipped
                  ? "preskok"
                  : row.is_correct
                    ? "prav"
                    : "narobe"}{" "}
              · {formatPoints(row.points)}
              {row.round_bonus ? " · rundni bonus" : ""}
              {row.streak_bonus ? ` · streak +${row.streak_bonus}` : ""}
              {row.catchup_bonus ? ` · catch-up +${row.catchup_bonus}` : ""}
              {row.steal ? ` · kraja ${formatPoints(row.steal)}` : ""}
              {row.eliminated ? " · izločen" : ""}
            </span>
          </li>
        ))}
      </ul>
      <div className="play-slot-cta">
        <p className="fine">
          {message.is_last ? "Zaključek" : "Naslednje vprašanje"} čez {secondsLeft} s…
        </p>
        {isHost ? (
          <button type="button" className="primary btn-cta" onClick={onNext}>
            {message.is_last ? "Zaključi zdaj" : "Naprej"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
