import { FormEvent, useEffect, useState } from "react";

import { ApiError, api } from "../api";
import type { BonusDefinition } from "../types";

type FormState = {
  key: string;
  name: string;
  description: string;
  bonus_kind: string;
  effect_key: string;
  modes: string;
  config: string;
  order: number;
  is_active: boolean;
};

const empty: FormState = {
  key: "",
  name: "",
  description: "",
  bonus_kind: "lifeline",
  effect_key: "",
  modes: "ala_milijonar",
  config: "{}",
  order: 0,
  is_active: true,
};

export function AdminBonusesPage() {
  const [bonuses, setBonuses] = useState<BonusDefinition[]>([]);
  const [kinds, setKinds] = useState<{ key: string; label: string }[]>([]);
  const [form, setForm] = useState<FormState>(empty);
  const [editId, setEditId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  function load() {
    api<{ bonuses: BonusDefinition[]; kinds: { key: string; label: string }[] }>("/api/admin/bonuses/")
      .then((data) => {
        setBonuses(data.bonuses);
        setKinds(data.kinds);
      })
      .catch(() => setError("Bonusov ni bilo mogoče naložiti."));
  }

  useEffect(() => {
    load();
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    try {
      const config = JSON.parse(form.config || "{}");
      const body = {
        key: form.key,
        name: form.name,
        description: form.description,
        bonus_kind: form.bonus_kind,
        effect_key: form.effect_key || form.key,
        modes: form.modes
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        config,
        order: form.order,
        is_active: form.is_active,
      };
      if (editId == null) await api("/api/admin/bonuses/", { method: "POST", body: JSON.stringify(body) });
      else await api(`/api/admin/bonuses/${editId}/`, { method: "POST", body: JSON.stringify(body) });
      setNotice("Bonus je shranjen.");
      setForm(empty);
      setEditId(null);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Shranjevanje ni uspelo. Preveri JSON config.");
    }
  }

  function startEdit(bonus: BonusDefinition) {
    setEditId(bonus.id);
    setForm({
      key: bonus.key,
      name: bonus.name,
      description: bonus.description,
      bonus_kind: bonus.bonus_kind,
      effect_key: bonus.effect_key,
      modes: (bonus.modes || []).join(", "),
      config: JSON.stringify(bonus.config || {}, null, 2),
      order: bonus.order,
      is_active: bonus.is_active,
    });
  }

  return (
    <section className="panel">
      <p className="eyebrow">Admin</p>
      <h1>Bonusi</h1>
      <p className="fine">
        Katalog jokerjev in bodočih rundnih/glavnih bonusov. <code>effect_key</code> poveže zapis z motorjem igre
        (npr. fifty_fifty, audience, phone_friend).
      </p>
      {error ? <p className="error">{error}</p> : null}
      {notice ? <p className="fine">{notice}</p> : null}
      <form className="stack" onSubmit={onSubmit}>
        <label>
          Ključ
          <input value={form.key} onChange={(event) => setForm({ ...form, key: event.target.value })} required />
        </label>
        <label>
          Ime
          <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
        </label>
        <label>
          Opis
          <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
        </label>
        <label>
          Vrsta
          <select value={form.bonus_kind} onChange={(event) => setForm({ ...form, bonus_kind: event.target.value })}>
            {(kinds.length ? kinds : [{ key: "lifeline", label: "Joker" }]).map((kind) => (
              <option key={kind.key} value={kind.key}>
                {kind.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Effect key
          <input value={form.effect_key} onChange={(event) => setForm({ ...form, effect_key: event.target.value })} />
        </label>
        <label>
          Načini (vejica)
          <input value={form.modes} onChange={(event) => setForm({ ...form, modes: event.target.value })} />
        </label>
        <label>
          Config JSON
          <textarea className="code-area" rows={5} value={form.config} onChange={(event) => setForm({ ...form, config: event.target.value })} />
        </label>
        <label>
          Vrstni red
          <input type="number" value={form.order} onChange={(event) => setForm({ ...form, order: Number(event.target.value) })} />
        </label>
        <label className="check">
          <input type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} />
          Aktiven
        </label>
        <div className="actions">
          <button className="primary" type="submit">
            {editId == null ? "Dodaj" : "Shrani"}
          </button>
          {editId != null ? (
            <button
              type="button"
              onClick={() => {
                setEditId(null);
                setForm(empty);
              }}
            >
              Prekliči
            </button>
          ) : null}
        </div>
      </form>
      <div className="admin-list">
        {bonuses.map((bonus) => (
          <article key={bonus.id} className="admin-card">
            <h2>
              {bonus.name} <span className="fine">[{bonus.bonus_kind}]</span>
            </h2>
            <p className="fine">
              {bonus.key} → {bonus.effect_key} · {(bonus.modes || []).join(", ") || "brez načina"} ·{" "}
              {bonus.is_active ? "aktiven" : "umaknjen"}
            </p>
            <p>{bonus.description}</p>
            <button type="button" onClick={() => startEdit(bonus)}>
              Uredi
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
