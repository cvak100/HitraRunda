import { formatPoints } from "../../format";
import type { GameMessage, StandingRow } from "../../types";
import { Avatar } from "../Avatar";
import { FinishActions } from "./FinishActions";

export function PodiumFinish({
  message,
  myId,
  boardPath,
  canRematch = false,
  onRematch,
  rematchBusy = false,
}: {
  message: GameMessage;
  myId: string;
  boardPath: string;
  canRematch?: boolean;
  onRematch?: () => void;
  rematchBusy?: boolean;
}) {
  const rows = (message.standings || []) as StandingRow[];
  const first = rows[0];
  const second = rows[1];
  const third = rows[2];
  const rest = rows.slice(3);

  function slot(row: StandingRow | undefined, place: 1 | 2 | 3) {
    const placeClass = place === 1 ? "first" : place === 2 ? "second" : "third";
    if (!row) {
      return (
        <div className={`podium-slot is-${placeClass} is-empty`} aria-hidden>
          <div className="podium-block">
            <span className="podium-place">{place}</span>
          </div>
        </div>
      );
    }
    return (
      <div className={`podium-slot is-${placeClass}`}>
        <Avatar avatar={row.avatar} color={row.color || "#7dcea0"} size={place === 1 ? 58 : 44} title={row.nickname} />
        <div className="podium-name">
          {row.nickname}
          {row.is_bot ? " (AI)" : ""}
          {row.member_id === myId ? " · ti" : ""}
        </div>
        <div className="podium-score">{formatPoints(row.score)}</div>
        <div className="fine">{row.correct_count} pravilnih</div>
        <div className="podium-block" aria-label={`${place}. mesto`}>
          <span className="podium-place">{place}</span>
        </div>
      </div>
    );
  }

  const iWon = first?.member_id === myId;

  return (
    <div className="review good finish-screen">
      <p className="eyebrow">Konec igre</p>
      <h1>{iWon ? "Čestitamo!" : "Konec igre"}</h1>
      <h2>Končna lestvica</h2>
      <div className="podium" aria-label="Stopničke">
        {slot(second, 2)}
        {slot(first, 1)}
        {slot(third, 3)}
      </div>
      {rest.length > 0 ? (
        <ol className="podium-rest">
          {rest.map((row) => (
            <li key={row.member_id}>
              <span className="podium-rest-player">
                <Avatar avatar={row.avatar} color={row.color || "#7dcea0"} size={28} title={row.nickname} />
                <span>
                  #{row.rank} {row.nickname}
                  {row.is_bot ? " (AI)" : ""}
                  {row.member_id === myId ? " · ti" : ""}
                </span>
              </span>
              <strong>
                {formatPoints(row.score)} · {row.correct_count} pravilnih
              </strong>
            </li>
          ))}
        </ol>
      ) : null}
      <FinishActions
        replayTo={message.mode === "dirka" ? "/igra/dirka" : "/igra/vec-igralcev"}
        boardPath={boardPath}
        resultId={(myId && message.result_ids?.[myId]) || message.result_id}
        onRematch={canRematch && onRematch ? onRematch : undefined}
        rematchBusy={rematchBusy}
      />
    </div>
  );
}
