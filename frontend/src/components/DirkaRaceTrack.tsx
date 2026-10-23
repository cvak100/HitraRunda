import { formatPoints } from "../format";
import type { StandingRow } from "../types";

const BONUS_LABELS: Record<string, string> = {
  fifty_fifty: "50/50",
  hint: "Hint",
  extra_time: "Extra Time",
  second_chance: "2. poskus",
  skip: "Preskoči",
  shield: "Shield",
  steal: "Steal",
  rush: "Rush",
  double: "Double",
  block: "Block",
};

export function DirkaBonusBar({
  bonuses,
  armed,
  canUse,
  onUse,
  maxTypes = 5,
}: {
  bonuses: Record<string, number>;
  armed?: Record<string, boolean>;
  canUse: boolean;
  onUse: (effect: string) => void;
  maxTypes?: number;
}) {
  const held = Object.entries(bonuses).filter(([, count]) => Number(count) > 0);
  return (
    <div className="dirka-bonus-bar" aria-label="Bonusi">
      <div className="dirka-bonus-bar-head">
        <strong>Bonusi</strong>
        <span className="fine">
          {held.length}/{maxTypes} tipov · stack OK
        </span>
      </div>
      {held.length === 0 ? (
        <p className="fine dirka-bonus-empty">Še nimaš bonusov — pridejo s streakom in varno zono.</p>
      ) : (
        <div className="lifelines dirka-bonuses">
          {held.map(([key, count]) => (
            <button
              key={key}
              type="button"
              className={armed?.[key] ? "is-on" : ""}
              disabled={!canUse}
              onClick={() => onUse(key)}
              title={`${BONUS_LABELS[key] || key} · ×${count}`}
            >
              {BONUS_LABELS[key] || key} · {count}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function DirkaRaceTrack({
  standings,
  targetScore,
  myId,
  mySafeProgress,
}: {
  standings: StandingRow[];
  targetScore: number;
  myId?: string;
  mySafeProgress?: { current: number; every: number; until: number };
}) {
  const target = Math.max(1, targetScore || 100);
  return (
    <div className="dirka-race" aria-label="Napredek dirke">
      <div className="dirka-race-meta">
        <strong>Dirka</strong>
        <span className="fine">Cilj {formatPoints(target)}</span>
        {mySafeProgress ? (
          <span className="fine">
            Tvoja varna zona {mySafeProgress.current}/{mySafeProgress.every}
            {mySafeProgress.until > 0 ? ` · še ${mySafeProgress.until}` : ""}
          </span>
        ) : null}
      </div>
      <ul className="dirka-race-list">
        {standings.map((row) => {
          const score = Math.max(0, row.score || 0);
          const safe = Math.max(0, row.safe_locked || 0);
          const pct = Math.min(100, (score / target) * 100);
          const safePct = Math.min(100, (safe / target) * 100);
          const isMe = row.member_id === myId;
          return (
            <li key={row.member_id} className={isMe ? "is-me" : undefined}>
              <div className="dirka-race-row-head">
                <span>
                  #{row.rank || "?"} {row.nickname}
                  {row.is_bot ? " (AI)" : ""}
                  {isMe ? " · ti" : ""}
                </span>
                <strong>{formatPoints(score)}</strong>
              </div>
              <div className="dirka-race-track">
                <div className="dirka-race-fill" style={{ width: `${pct}%` }} />
                {safe > 0 ? (
                  <span
                    className="dirka-race-safe"
                    style={{ left: `${safePct}%` }}
                    title={`Varna zona ${formatPoints(safe)}`}
                  />
                ) : null}
                <span className="dirka-race-marker" style={{ left: `${pct}%` }} />
              </div>
              <div className="dirka-race-row-foot fine">
                {safe > 0 ? <span>Zaklenjeno {formatPoints(safe)}</span> : <span>Brez varne zone</span>}
                {row.streak && row.streak > 1 ? <span>Streak {row.streak}</span> : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
