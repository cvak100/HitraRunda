import { useEffect, useRef, useState } from "react";

import { DirkaBonusIcon, dirkaBonusMeta } from "../dirkaBonuses";
import { formatPoints } from "../format";
import type { StandingRow } from "../types";
import { Avatar } from "./Avatar";

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
          {held.length}/{maxTypes} tipov
        </span>
      </div>
      {held.length === 0 ? (
        <p className="fine dirka-bonus-empty">Še nimaš bonusov — pridejo s streakom in varno zono.</p>
      ) : (
        <div className="lifelines dirka-bonuses">
          {held.map(([key, count]) => {
            const meta = dirkaBonusMeta(key);
            const tip = `${meta.label} · ×${count} — ${meta.description}`;
            return (
              <button
                key={key}
                type="button"
                className={`dirka-bonus-btn${armed?.[key] ? " is-on" : ""}`}
                disabled={!canUse}
                onClick={() => onUse(key)}
                title={tip}
                aria-label={tip}
              >
                <DirkaBonusIcon effect={key} />
                <span className="dirka-bonus-btn-text">
                  <span className="dirka-bonus-btn-label">{meta.short}</span>
                  <span className="dirka-bonus-btn-count">×{count}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AnimatedScore({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  const fromRef = useRef(value);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) {
      setShown(to);
      return;
    }
    const start = performance.now();
    const duration = 700;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 2;
      setShown(Math.round(from + (to - from) * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return <>{formatPoints(shown)}</>;
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
  const prevScores = useRef<Record<string, number>>({});
  const [pulseIds, setPulseIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const nextPulse: Record<string, boolean> = {};
    for (const row of standings) {
      const id = row.member_id;
      const score = Math.max(0, row.score || 0);
      const prev = prevScores.current[id];
      if (prev != null && score > prev) nextPulse[id] = true;
      prevScores.current[id] = score;
    }
    if (Object.keys(nextPulse).length === 0) return;
    setPulseIds(nextPulse);
    const clear = window.setTimeout(() => setPulseIds({}), 800);
    return () => window.clearTimeout(clear);
  }, [standings]);

  return (
    <div className="dirka-race" aria-label="Napredek dirke">
      <div className="dirka-race-meta">
        <strong>Dirka</strong>
        <span className="fine">Cilj {formatPoints(target)}</span>
        {mySafeProgress ? (
          <span className="fine dirka-race-safe-meta">
            Varna zona {mySafeProgress.current}/{mySafeProgress.every}
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
          const pulsing = Boolean(pulseIds[row.member_id]);
          return (
            <li
              key={row.member_id}
              className={[isMe ? "is-me" : "", pulsing ? "is-pulse" : ""].filter(Boolean).join(" ") || undefined}
            >
              <div className="dirka-race-row-head">
                <span className="dirka-race-player">
                  <Avatar avatar={row.avatar} color={row.color || "#7dcea0"} size={28} title={row.nickname} />
                  <span className="dirka-race-name">
                    <span className="dirka-race-rank">#{row.rank || "?"}</span> {row.nickname}
                    {row.is_bot ? " (AI)" : ""}
                    {isMe ? " · ti" : ""}
                  </span>
                </span>
                <strong className="dirka-race-score">
                  <AnimatedScore value={score} />
                </strong>
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
                {row.streak && row.streak > 1 ? <span>Niz {row.streak}</span> : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
