import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { AVATAR_COLORS, AVATARS, avatarLabel } from "../avatars";
import { AdminToolbar, SortableTh, type AdminLimit } from "../components/AdminToolbar";
import { Avatar } from "../components/Avatar";
import { ConfirmModal } from "../components/ConfirmModal";
import { Modal } from "../components/Modal";
import { NicknameField } from "../components/NicknameField";
import { ApiError, api } from "../api";
import type { AiBot } from "../types";

const MODE_OPTIONS = [
  { key: "multiplayer", label: "Hitra tekma" },
  { key: "dirka", label: "Dirka" },
] as const;

type FormState = {
  key: string;
  name: string;
  color: string;
  avatar: string;
  accuracy: number;
  delay_min: number;
  delay_max: number;
  modes: string[];
  order: number;
  is_active: boolean;
  count_for_leaderboard: boolean;
};

const empty: FormState = {
  key: "",
  name: "",
  color: "#7dcea0",
  avatar: "ris",
  accuracy: 0.72,
  delay_min: 1.2,
  delay_max: 7.5,
  modes: ["multiplayer"],
  order: 0,
  is_active: true,
  count_for_leaderboard: false,
};

function modeLabel(modes: string[] | undefined) {
  const keys = modes || [];
  if (!keys.length) return "—";
  return keys
    .map((key) => MODE_OPTIONS.find((item) => item.key === key)?.label || key)
    .join(", ");
}

function toForm(bot: AiBot): FormState {
  return {
    key: bot.key,
    name: bot.name,
    color: bot.color,
    avatar: bot.avatar || "ris",
    accuracy: bot.accuracy ?? 0.72,
    delay_min: bot.delay_min ?? 1.2,
    delay_max: bot.delay_max ?? 7.5,
    modes: bot.modes?.length ? [...bot.modes] : ["multiplayer"],
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
  const [editing, setEditing] = useState<AiBot | null>(null);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AiBot | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const deleteTargetRef = useRef<AiBot | null>(null);

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
    let list = bots.filter((item) => {
      if (!showInactive && item.is_active === false) return false;
      return (
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.key.toLowerCase().includes(q) ||
        modeLabel(item.modes).toLowerCase().includes(q)
      );
    });
    list = [...list].sort((a, b) => {
      const av = sort === "modes" ? modeLabel(a.modes) : a[sort as keyof AiBot];
      const bv = sort === "modes" ? modeLabel(b.modes) : b[sort as keyof AiBot];
      const cmp = String(av ?? "").localeCompare(String(bv ?? ""), "sl", { numeric: true });
      return direction === "asc" ? cmp : -cmp;
    });
    if (limit !== "all") list = list.slice(0, Number(limit));
    return list;
  }, [bots, submitted, sort, direction, limit, showInactive]);

  function toggleSort(column: string) {
    if (sort === column) setDirection((current) => (current === "asc" ? "desc" : "asc"));
    else {
      setSort(column);
      setDirection("asc");
    }
  }

  function openCreate() {
    setEditing(null);
    setForm(empty);
    setError("");
    setModalOpen(true);
  }

  function openEdit(bot: AiBot) {
    if (bot.id == null) {
      setError("Bot nima ID — osveži stran.");
      return;
    }
    setEditing(bot);
    setForm(toForm(bot));
    setError("");
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
    setForm(empty);
  }

  function toggleMode(mode: string) {
    setForm((current) => {
      const on = current.modes.includes(mode);
      const modes = on ? current.modes.filter((item) => item !== mode) : [...current.modes, mode];
      return { ...current, modes };
    });
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (form.modes.length === 0) {
      setError("Izberi vsaj en način.");
      return;
    }
    const editingBot = editing;
    const editingId = editingBot?.id;
    try {
      if (editingId == null || !editingBot) {
        await api("/api/admin/bots/", { method: "POST", body: JSON.stringify(form) });
        setNotice("Bot je dodan.");
      } else {
        await api(`/api/admin/bots/${editingId}/`, {
          method: "POST",
          body: JSON.stringify({ ...form, key: editingBot.key }),
        });
        setNotice("Shranjeno.");
      }
      closeModal();
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Shranjevanje ni uspelo.");
    }
  }

  function requestDelete() {
    if (!editing?.id) return;
    deleteTargetRef.current = editing;
    setDeleteTarget(editing);
    setModalOpen(false);
    setConfirmDelete(true);
  }

  async function onDelete() {
    const target = deleteTargetRef.current ?? deleteTarget;
    setConfirmDelete(false);
    setDeleteTarget(null);
    deleteTargetRef.current = null;
    if (target?.id == null) {
      setError("Brisanje ni uspelo (manjka ID).");
      return;
    }
    setError("");
    try {
      const result = await api<{ detail: string }>(`/api/admin/bots/${target.id}/`, { method: "DELETE" });
      setNotice(result.detail || "Bot je izbrisan.");
      setEditing(null);
      setForm(empty);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Brisanje ni uspelo.");
      setEditing(target);
      setForm(toForm(target));
      setModalOpen(true);
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
      <label className="check" style={{ margin: "8px 0" }}>
        <input type="checkbox" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} />
        Prikaži umaknjene
      </label>
      <p className="fine">
        {rows.length} od {bots.length}
      </p>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <SortableTh label="Vzdevek" column="name" sort={sort} direction={direction} onSort={toggleSort} />
              <SortableTh label="Ključ" column="key" sort={sort} direction={direction} onSort={toggleSort} />
              <SortableTh label="Načini" column="modes" sort={sort} direction={direction} onSort={toggleSort} />
              <SortableTh label="Natančnost" column="accuracy" sort={sort} direction={direction} onSort={toggleSort} />
              <SortableTh label="Zakasnitev" column="delay_min" sort={sort} direction={direction} onSort={toggleSort} />
              <SortableTh label="Stanje" column="is_active" sort={sort} direction={direction} onSort={toggleSort} />
            </tr>
          </thead>
          <tbody>
            {rows.map((bot) => (
              <tr key={bot.id ?? bot.key} className="is-link" onClick={() => openEdit(bot)}>
                <td>
                  <span className="bot-name-cell">
                    <Avatar avatar={bot.avatar || "ris"} color={bot.color || "#7dcea0"} size={28} title={bot.name} />
                    {bot.name}
                  </span>
                </td>
                <td>{bot.key}</td>
                <td>{modeLabel(bot.modes)}</td>
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
      <Modal title={editing ? "Uredi bota" : "Nov bot"} open={modalOpen} onClose={closeModal}>
        {error && modalOpen ? <p className="error">{error}</p> : null}
        <form className="stack" onSubmit={onSubmit}>
          <label>
            Ključ
            <input
              value={form.key}
              onChange={(event) => setForm({ ...form, key: event.target.value })}
              required
              disabled={Boolean(editing)}
              title={editing ? "Ključa med urejanjem ne spreminjaj" : undefined}
            />
          </label>
          <div className="profile-hero">
            <Avatar avatar={form.avatar} color={form.color} size={72} title={avatarLabel(form.avatar)} />
            <p className="fine" style={{ margin: 0 }}>
              {avatarLabel(form.avatar)}
            </p>
          </div>
          <NicknameField
            label="Vzdevek v sobi"
            value={form.name}
            onChange={(name) => setForm({ ...form, name })}
            required
          />
          <fieldset>
            <legend>Avatar</legend>
            <div className="avatar-picker" role="list">
              {AVATARS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={`avatar-pick${form.avatar === item.key ? " is-on" : ""}`}
                  title={item.label}
                  aria-label={item.label}
                  aria-pressed={form.avatar === item.key}
                  onClick={() => setForm({ ...form, avatar: item.key })}
                >
                  <Avatar avatar={item.key} color={form.color} size={48} />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>Barva roba</legend>
            <div className="color-swatches" role="list">
              {AVATAR_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`color-swatch${form.color === c ? " is-on" : ""}`}
                  style={{ background: c }}
                  aria-label={c}
                  onClick={() => setForm({ ...form, color: c })}
                />
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>Načini</legend>
            {MODE_OPTIONS.map((option) => (
              <label key={option.key} className="check">
                <input
                  type="checkbox"
                  checked={form.modes.includes(option.key)}
                  onChange={() => toggleMode(option.key)}
                />
                {option.label}
              </label>
            ))}
          </fieldset>
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
              {editing ? "Shrani" : "Ustvari"}
            </button>
            <button type="button" onClick={closeModal}>
              Prekliči
            </button>
            {editing ? (
              <button type="button" className="danger" onClick={requestDelete}>
                Izbriši
              </button>
            ) : null}
          </div>
        </form>
      </Modal>
      <ConfirmModal
        open={confirmDelete}
        title="Izbriši bota"
        message={
          deleteTarget
            ? `Odstranim bota „${deleteTarget.name}“ (${deleteTarget.key})? Privzeti boti se umaknejo, lastni se zbrišejo.`
            : "Odstranim bota?"
        }
        confirmLabel="Izbriši"
        danger
        onConfirm={() => void onDelete()}
        onCancel={() => {
          const target = deleteTargetRef.current ?? deleteTarget;
          setConfirmDelete(false);
          setDeleteTarget(null);
          deleteTargetRef.current = null;
          if (target) {
            setEditing(target);
            setForm(toForm(target));
            setModalOpen(true);
          }
        }}
      />
    </section>
  );
}
