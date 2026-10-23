import { FormEvent, useEffect, useMemo, useState } from "react";

import { AdminToolbar, SortableTh, type AdminLimit } from "../components/AdminToolbar";
import { Modal } from "../components/Modal";
import { ApiError, api } from "../api";
import type { AiBot } from "../types";

type FormState = {
  key: string;
  name: string;
  color: string;
  accuracy: number;
  delay_min: number;
  delay_max: number;
  order: number;
  is_active: boolean;
  count_for_leaderboard: boolean;
};

const empty: FormState = {
  key: "",
  name: "",
  color: "#7dcea0",
  accuracy: 0.72,
  delay_min: 1.2,
  delay_max: 7.5,
  order: 0,
  is_active: true,
  count_for_leaderboard: false,
};

function toForm(bot: AiBot): FormState {
  return {
    key: bot.key,
    name: bot.name,
    color: bot.color,
    accuracy: bot.accuracy ?? 0.72,
    delay_min: bot.delay_min ?? 1.2,
    delay_max: bot.delay_max ?? 7.5,
    order: bot.order ?? 0,
    is_active: bot.is_active ?? true,
    count_for_leaderboard: bot.count_for_leaderboard ?? false,
  };
}

export function AdminBotsPage() {
  const [bots, setBots] = useState<AiBot[]>([]);
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
    api<{ bots: AiBot[] }>("/api/admin/bots/")
      .then((data) => setBots(data.bots))
      .catch(() => setError("Botov ni bilo mogoče naložiti."));
  }

  useEffect(() => {
    load();
  }, []);

  const rows = useMemo(() => {
    const q = submitted.trim().toLowerCase();
    let list = bots.filter((item) => !q || item.name.toLowerCase().includes(q) || item.key.toLowerCase().includes(q));
    list = [...list].sort((a, b) => {
      const av = a[sort as keyof AiBot];
      const bv = b[sort as keyof AiBot];
      const cmp = String(av ?? "").localeCompare(String(bv ?? ""), "sl", { numeric: true });
      return direction === "asc" ? cmp : -cmp;
    });
    if (limit !== "all") list = list.slice(0, Number(limit));
    return list;
  }, [bots, submitted, sort, direction, limit]);

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

  function openEdit(bot: AiBot) {
    if (bot.id == null) return;
    setEditingId(bot.id);
    setForm(toForm(bot));
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
        await api("/api/admin/bots/", { method: "POST", body: JSON.stringify(form) });
        setNotice("Bot je dodan.");
      } else {
        await api(`/api/admin/bots/${editingId}/`, { method: "POST", body: JSON.stringify(form) });
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
      <h1>AI boti</h1>
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
        {rows.length} od {bots.length}
      </p>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <SortableTh label="Ime" column="name" sort={sort} direction={direction} onSort={toggleSort} />
              <SortableTh label="Ključ" column="key" sort={sort} direction={direction} onSort={toggleSort} />
              <SortableTh label="Natančnost" column="accuracy" sort={sort} direction={direction} onSort={toggleSort} />
              <SortableTh label="Zakasnitev" column="delay_min" sort={sort} direction={direction} onSort={toggleSort} />
              <SortableTh label="Stanje" column="is_active" sort={sort} direction={direction} onSort={toggleSort} />
            </tr>
          </thead>
          <tbody>
            {rows.map((bot) => (
              <tr key={bot.key} className="is-link" onClick={() => openEdit(bot)}>
                <td>
                  <span style={{ color: bot.color }}>●</span> {bot.name}
                </td>
                <td>{bot.key}</td>
                <td>{Math.round((bot.accuracy || 0) * 100)}%</td>
                <td>
                  {bot.delay_min}–{bot.delay_max} s
                </td>
                <td>{bot.is_active ? "Aktiven" : "Umaknjen"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Modal title={editingId == null ? "Nov bot" : "Uredi bota"} open={modalOpen} onClose={closeModal}>
        {error && modalOpen ? <p className="error">{error}</p> : null}
        <form className="stack" onSubmit={onSubmit}>
          <label>
            Ključ
            <input value={form.key} onChange={(event) => setForm({ ...form, key: event.target.value })} required />
          </label>
          <label>
            Ime v sobi
            <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} maxLength={30} required />
          </label>
          <label>
            Barva
            <input value={form.color} onChange={(event) => setForm({ ...form, color: event.target.value })} />
          </label>
          <label>
            Natančnost (0–1)
            <input
              type="number"
              step="0.01"
              min={0}
              max={1}
              value={form.accuracy}
              onChange={(event) => setForm({ ...form, accuracy: Number(event.target.value) })}
            />
          </label>
          <label>
            Min. zakasnitev (s)
            <input
              type="number"
              step="0.1"
              min={0.2}
              value={form.delay_min}
              onChange={(event) => setForm({ ...form, delay_min: Number(event.target.value) })}
            />
          </label>
          <label>
            Max. zakasnitev (s)
            <input
              type="number"
              step="0.1"
              min={0.5}
              value={form.delay_max}
              onChange={(event) => setForm({ ...form, delay_max: Number(event.target.value) })}
            />
          </label>
          <label>
            Vrstni red
            <input type="number" value={form.order} onChange={(event) => setForm({ ...form, order: Number(event.target.value) })} />
          </label>
          <label className="check">
            <input type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} />
            Aktiven
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={form.count_for_leaderboard}
              onChange={(event) => setForm({ ...form, count_for_leaderboard: event.target.checked })}
            />
            Šteje na javno lestvico (highscore)
          </label>
          <div className="actions">
            <button className="primary" type="submit">
              {editingId == null ? "Ustvari" : "Shrani"}
            </button>
            <button type="button" onClick={closeModal}>
              Prekliči
            </button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
