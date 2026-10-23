import { useEffect, useState } from "react";

import { api } from "../api";
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
        Kaj delajo bonusi?
      </button>
      <Modal title="Dirka — bonusi" open={open} onClose={() => setOpen(false)}>
        {loading ? <p className="status">Nalagam…</p> : null}
        {error ? <p className="error">{error}</p> : null}
        {!loading && !error
          ? groups.map((group) => (
              <div key={group.kind} className="dirka-bonus-help-group">
                <h3>{kindTitle(group.kind, group.label)}</h3>
                <ul className="dirka-bonus-help-list">
                  {group.items.map((bonus) => (
                    <li key={bonus.key}>
                      <strong>{bonus.name}</strong>
                      {bonus.passive ? <span className="fine"> · samodejno</span> : null}
                      <p>{bonus.description || "—"}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          : null}
        {!loading && !error && bonuses.length === 0 ? (
          <p className="fine">Ni aktivnih bonusov za Dirko.</p>
        ) : null}
      </Modal>
    </>
  );
}
