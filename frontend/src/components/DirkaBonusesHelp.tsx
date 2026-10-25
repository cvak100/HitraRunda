import { useEffect, useState } from "react";

import { api } from "../api";
import { DirkaBonusIcon, dirkaBonusMeta, dirkaBonusPool } from "../dirkaBonuses";
import { Modal } from "./Modal";

type PublicBonus = {
  key: string;
  name: string;
  description: string;
  bonus_kind: string;
  bonus_kind_label: string;
  effect_key: string;
  passive: boolean;
};

const KIND_ORDER = ["main", "round", "lifeline"];

function kindTitle(kind: string, label: string) {
  if (kind === "main") return "Aktivni bonusi (porabiš med igro)";
  if (kind === "round") return "Samodejni / rundni bonusi";
  return label || kind;
}

function poolLabel(pool: "weak" | "strong" | null) {
  if (pool === "weak") return "Šibek drop";
  if (pool === "strong") return "Močan drop";
  return null;
}

export function DirkaBonusesHelp() {
  const [open, setOpen] = useState(false);
  const [bonuses, setBonuses] = useState<PublicBonus[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || bonuses.length > 0) return;
    let cancelled = false;
    setLoading(true);
    api<{ bonuses: PublicBonus[] }>("/api/bonuses/?mode=dirka")
      .then((data) => {
        if (cancelled) return;
        setBonuses(data.bonuses || []);
        setError("");
      })
      .catch(() => {
        if (!cancelled) setError("Bonusov ni bilo mogoče naložiti.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, bonuses.length]);

  const groups = KIND_ORDER.map((kind) => ({
    kind,
    label: bonuses.find((b) => b.bonus_kind === kind)?.bonus_kind_label || kind,
    items: bonuses.filter((b) => b.bonus_kind === kind),
  })).filter((g) => g.items.length > 0);

  return (
    <>
      <button type="button" className="dirka-bonuses-help-btn" onClick={() => setOpen(true)}>
        Bonusi
      </button>
      <Modal title="Dirka — bonusi" open={open} onClose={() => setOpen(false)}>
        {loading ? <p className="status">Nalagam…</p> : null}
        {error ? <p className="error">{error}</p> : null}
        {!loading && !error ? (
          <>
            <div className="dirka-bonus-help-how">
              <h3>Kako jih dobiš</h3>
              <p className="fine">
                Na začetku je torba prazna. Bonusi padejo med igro (naključno iz poola):
              </p>
              <ul>
                <li>
                  <strong>Streak</strong> (3 pravilni zapored) → šibek drop
                </li>
                <li>
                  <strong>Hot streak</strong> (5 pravilnih) → šibek drop
                </li>
                <li>
                  <strong>Varna zona</strong> (z missom v segmentu) → šibek drop
                </li>
                <li>
                  <strong>Čista varna zona</strong> (brez missa) → močan drop
                </li>
                <li>
                  <strong>Preboj</strong> (prvič 50 % cilja) → močan drop, 1× na dirko
                </li>
                <li>
                  <strong>Solo sprint</strong> (edini pravilen v rundi) → močan drop
                </li>
                <li>
                  <strong>Pretvorba</strong> (3 enaki + 4. isti) → stack gre stran, 1 močan
                </li>
              </ul>
            </div>
            {groups.map((group) => (
              <div key={group.kind} className="dirka-bonus-help-group">
                <h3>{kindTitle(group.kind, group.label)}</h3>
                <ul className="dirka-bonus-help-list">
                  {group.items.map((bonus) => {
                    const effect = bonus.effect_key || bonus.key;
                    const meta = dirkaBonusMeta(effect);
                    const name = bonus.name || meta.label;
                    const description = bonus.description || meta.description;
                    const pool = bonus.passive ? null : dirkaBonusPool(effect);
                    const poolText = poolLabel(pool);
                    return (
                      <li key={bonus.key}>
                        <strong className="dirka-bonus-help-title">
                          {!bonus.passive ? <DirkaBonusIcon effect={effect} /> : null}
                          {name}
                        </strong>
                        {bonus.passive ? <span className="fine"> · samodejno</span> : null}
                        {poolText ? (
                          <span className={`dirka-bonus-pool-tag is-${pool}`}>{poolText}</span>
                        ) : null}
                        <p>{description || "—"}</p>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            {bonuses.length === 0 ? <p className="fine">Ni aktivnih bonusov za Dirko.</p> : null}
          </>
        ) : null}
      </Modal>
    </>
  );
}
