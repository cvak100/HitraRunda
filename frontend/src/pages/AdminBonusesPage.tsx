import { FormEvent, useEffect, useMemo, useState } from "react";

import { AdminToolbar, SortableTh, type AdminLimit } from "../components/AdminToolbar";
import { Modal } from "../components/Modal";
import { ApiError, api } from "../api";
import { formatMode } from "../format";
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

function toForm(bonus: BonusDefinition): FormState {
  return {
    key: bonus.key,
    name: bonus.name,
    description: bonus.description,
    bonus_kind: bonus.bonus_kind,
    effect_key: bonus.effect_key,
    modes: (bonus.modes || []).join(", "),
    config: JSON.stringify(bonus.config || {}, null, 2),
    order: bonus.order,
    is_active: bonus.is_active,
  };
}

function bodyFromForm(form: FormState) {
  return {
    key: form.key,
    name: form.name,
    description: form.description,
    bonus_kind: form.bonus_kind,
    effect_key: form.effect_key || form.key,
    modes: form.modes
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
    config: JSON.parse(form.config || "{}"),
    order: form.order,
    is_active: form.is_active,
  };
}

function formatModes(modes: string[] | undefined) {
  if (!modes?.length) return "—";
  return modes.map(formatMode).join(", ");
}

export function AdminBonusesPage() {
  const [bonuses, setBonuses] = useState<BonusDefinition[]>([]);
  const [kinds, setKinds] = useState<{ key: string; label: string }[]>([]);
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [limit, setLimit] = useState<AdminLimit>("50");
  const [sort, setSort] = useState("order");
  const [direction, setDirection] = useState<"asc" | "desc">("asc");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(empty);
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

  const rows = useMemo(() => {
    const q = submitted.trim().toLowerCase();
    let list = bonuses.filter(
      (item) =>
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.key.toLowerCase().includes(q) ||
        item.effect_key.toLowerCase().includes(q) ||
        (item.modes || []).some((mode) => mode.toLowerCase().includes(q) || formatMode(mode).toLowerCase().includes(q)),
    );
    list = [...list].sort((a, b) => {
      if (sort === "modes") {
        const cmp = formatModes(a.modes).localeCompare(formatModes(b.modes), "sl");
        return direction === "asc" ? cmp : -cmp;
      }
      const av = a[sort as keyof BonusDefinition];
      const bv = b[sort as keyof BonusDefinition];
      const cmp = String(av ?? "").localeCompare(String(bv ?? ""), "sl", { numeric: true });
      return direction === "asc" ? cmp : -cmp;
    });
    if (limit !== "all") list = list.slice(0, Number(limit));
    return list;
  }, [bonuses, submitted, sort, direction, limit]);

  function toggleSort(column: string) {
    if (sort === column) setDirection((current) => (current === "asc" ? "desc" : "asc"));
    else {
      setSort(column);
      setDirection("asc");
    }
  }

  function openCreate() {
    setEditingId(null);
    setForm(empty);
    setError("");
    setModalOpen(true);
  }

  function openEdit(bonus: BonusDefinition) {
    setEditingId(bonus.id);
    setForm(toForm(bonus));
    setError("");
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingId(null);
    setForm(empty);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      if (editingId == null) {
        await api<{ bonus: BonusDefinition }>("/api/admin/bonuses/", {
          method: "POST",
          body: JSON.stringify(bodyFromForm(form)),
        });
        setNotice("Bonus je dodan.");
      } else {
        await api(`/api/admin/bonuses/${editingId}/`, {
          method: "POST",
          body: JSON.stringify(bodyFromForm(form)),
        });
        setNotice("Shranjeno.");
      }
      closeModal();
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Shranjevanje ni uspelo.");
    }
  }

  return (
    <section className="panel">
      <p className="eyebrow">Admin</p>
      <h1>Bonusi</h1>
      {notice ? <p className="fine">{notice}</p> : null}
      {error && !modalOpen ? <p className="error">{error}</p> : null}
      <AdminToolbar
        query={query}
        onQueryChange={setQuery}
        onSearch={() => setSubmitted(query)}
        limit={limit}
        onLimitChange={setLimit}
        onAdd={openCreate}
      />
      <p className="fine">
        {rows.length} od {bonuses.length}
      </p>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <SortableTh label="Ime" column="name" sort={sort} direction={direction} onSort={toggleSort} />
              <SortableTh label="Ključ" column="key" sort={sort} direction={direction} onSort={toggleSort} />
              <SortableTh label="Vrsta" column="bonus_kind" sort={sort} direction={direction} onSort={toggleSort} />
              <SortableTh label="Effect" column="effect_key" sort={sort} direction={direction} onSort={toggleSort} />
              <SortableTh label="Načini" column="modes" sort={sort} direction={direction} onSort={toggleSort} />
              <SortableTh label="Stanje" column="is_active" sort={sort} direction={direction} onSort={toggleSort} />
            </tr>
          </thead>
          <tbody>
            {rows.map((bonus) => (
              <tr key={bonus.id} className="is-link" onClick={() => openEdit(bonus)}>
                <td>{bonus.name}</td>
                <td>{bonus.key}</td>
                <td>{bonus.bonus_kind}</td>
                <td>{bonus.effect_key}</td>
                <td>{formatModes(bonus.modes)}</td>
                <td>{bonus.is_active ? "Aktiven" : "Umaknjen"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Modal title={editingId == null ? "Nov bonus" : "Uredi bonus"} open={modalOpen} onClose={closeModal}>
        {error && modalOpen ? <p className="error">{error}</p> : null}
        <BonusForm form={form} setForm={setForm} kinds={kinds} onSubmit={onSubmit} submitLabel={editingId == null ? "Ustvari" : "Shrani"} onCancel={closeModal} />
      </Modal>
    </section>
  );
}

function BonusForm({
  form,
  setForm,
  kinds,
  onSubmit,
  submitLabel,
  onCancel,
}: {
  form: FormState;
  setForm: (form: FormState) => void;
  kinds: { key: string; label: string }[];
  onSubmit: (event: FormEvent) => void;
  submitLabel: string;
  onCancel?: () => void;
}) {
  return (
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
        <input value={form.modes} onChange={(event) => setForm({ ...form, modes: event.target.value })} placeholder="hitrarunda, ala_milijonar" />
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
          {submitLabel}
        </button>
        {onCancel ? (
          <button type="button" onClick={onCancel}>
            Prekliči
          </button>
        ) : null}
      </div>
    </form>
  );
}
