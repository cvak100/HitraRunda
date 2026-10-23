import { FormEvent, useEffect, useMemo, useState } from "react";

import { AdminToolbar, SortableTh, type AdminLimit } from "../components/AdminToolbar";
import { ConfirmModal } from "../components/ConfirmModal";
import { Modal } from "../components/Modal";
import { ApiError, api } from "../api";
import type { PhoneFriend } from "../types";

type FormState = {
  key: string;
  name: string;
  title: string;
  bio: string;
  specialty_categories: string;
  reliability: number;
  out_of_specialty_reliability: number;
  avatar_color: string;
  order: number;
  is_active: boolean;
};

const empty: FormState = {
  key: "",
  name: "",
  title: "",
  bio: "",
  specialty_categories: "",
  reliability: 0.7,
  out_of_specialty_reliability: 0.35,
  avatar_color: "#e6b325",
  order: 0,
  is_active: true,
};

function toForm(friend: PhoneFriend): FormState {
  return {
    key: friend.key,
    name: friend.name,
    title: friend.title,
    bio: friend.bio,
    specialty_categories: (friend.specialty_categories || []).join(", "),
    reliability: friend.reliability ?? 0.7,
    out_of_specialty_reliability: friend.out_of_specialty_reliability ?? 0.35,
    avatar_color: friend.avatar_color,
    order: friend.order ?? 0,
    is_active: friend.is_active ?? true,
  };
}

function bodyFromForm(form: FormState) {
  return {
    key: form.key,
    name: form.name,
    title: form.title,
    bio: form.bio,
    specialty_categories: form.specialty_categories
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
    reliability: form.reliability,
    out_of_specialty_reliability: form.out_of_specialty_reliability,
    avatar_color: form.avatar_color,
    order: form.order,
    is_active: form.is_active,
  };
}

export function AdminFriendsPage() {
  const [friends, setFriends] = useState<PhoneFriend[]>([]);
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
  const [confirmDelete, setConfirmDelete] = useState(false);

  function load() {
    api<{ friends: PhoneFriend[] }>("/api/admin/friends/")
      .then((data) => setFriends(data.friends))
      .catch(() => setError("Prijateljev ni bilo mogoče naložiti."));
  }

  useEffect(() => {
    load();
  }, []);

  const rows = useMemo(() => {
    const q = submitted.trim().toLowerCase();
    let list = friends.filter(
      (item) => !q || item.name.toLowerCase().includes(q) || item.key.toLowerCase().includes(q) || item.title.toLowerCase().includes(q),
    );
    list = [...list].sort((a, b) => {
      const av = a[sort as keyof PhoneFriend];
      const bv = b[sort as keyof PhoneFriend];
      const cmp = String(av ?? "").localeCompare(String(bv ?? ""), "sl", { numeric: true });
      return direction === "asc" ? cmp : -cmp;
    });
    if (limit !== "all") list = list.slice(0, Number(limit));
    return list;
  }, [friends, submitted, sort, direction, limit]);

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

  function openEdit(friend: PhoneFriend) {
    if (friend.id == null) return;
    setEditingId(friend.id);
    setForm(toForm(friend));
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
        await api<{ friend: PhoneFriend }>("/api/admin/friends/", {
          method: "POST",
          body: JSON.stringify(bodyFromForm(form)),
        });
        setNotice("Prijatelj je dodan.");
      } else {
        await api(`/api/admin/friends/${editingId}/`, {
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

  async function onDelete() {
    if (editingId == null) return;
    setConfirmDelete(false);
    setError("");
    try {
      const result = await api<{ detail: string }>(`/api/admin/friends/${editingId}/`, { method: "DELETE" });
      setNotice(result.detail || "Prijatelj je umaknjen.");
      closeModal();
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Brisanje ni uspelo.");
    }
  }

  return (
    <section className="panel">
      <p className="eyebrow">Admin</p>
      <h1>Prijatelji</h1>
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
        {rows.length} od {friends.length}
      </p>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <SortableTh label="Ime" column="name" sort={sort} direction={direction} onSort={toggleSort} />
              <SortableTh label="Naziv" column="title" sort={sort} direction={direction} onSort={toggleSort} />
              <SortableTh label="Ključ" column="key" sort={sort} direction={direction} onSort={toggleSort} />
              <SortableTh label="Zanesljivost" column="reliability" sort={sort} direction={direction} onSort={toggleSort} />
              <SortableTh label="Stanje" column="is_active" sort={sort} direction={direction} onSort={toggleSort} />
            </tr>
          </thead>
          <tbody>
            {rows.map((friend) => (
              <tr key={friend.key} className="is-link" onClick={() => openEdit(friend)}>
                <td>{friend.name}</td>
                <td>{friend.title}</td>
                <td>{friend.key}</td>
                <td>{Math.round((friend.reliability || 0) * 100)}%</td>
                <td>{friend.is_active ? "Aktiven" : "Umaknjen"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Modal title={editingId == null ? "Nov prijatelj" : "Uredi prijatelja"} open={modalOpen} onClose={closeModal}>
        {error && modalOpen ? <p className="error">{error}</p> : null}
        <FriendForm
          form={form}
          setForm={setForm}
          onSubmit={onSubmit}
          submitLabel={editingId == null ? "Ustvari" : "Shrani"}
          onCancel={closeModal}
          onDelete={editingId != null ? () => setConfirmDelete(true) : undefined}
        />
      </Modal>
      <ConfirmModal
        open={confirmDelete}
        title="Izbriši prijatelja"
        message="Prijatelj se umakne (ni več na voljo za klic v sili)."
        confirmLabel="Izbriši"
        danger
        onConfirm={() => void onDelete()}
        onCancel={() => setConfirmDelete(false)}
      />
    </section>
  );
}

function FriendForm({
  form,
  setForm,
  onSubmit,
  submitLabel,
  onCancel,
  onDelete,
}: {
  form: FormState;
  setForm: (form: FormState) => void;
  onSubmit: (event: FormEvent) => void;
  submitLabel: string;
  onCancel?: () => void;
  onDelete?: () => void;
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
        Naziv
        <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required />
      </label>
      <label>
        Bio
        <textarea value={form.bio} onChange={(event) => setForm({ ...form, bio: event.target.value })} />
      </label>
      <label>
        Specialnosti (slug-i, vejica)
        <input
          value={form.specialty_categories}
          onChange={(event) => setForm({ ...form, specialty_categories: event.target.value })}
          placeholder="sport, zemljepis"
        />
      </label>
      <label>
        Zanesljivost v specialnosti (0–1)
        <input
          type="number"
          step="0.01"
          min={0}
          max={1}
          value={form.reliability}
          onChange={(event) => setForm({ ...form, reliability: Number(event.target.value) })}
        />
      </label>
      <label>
        Zanesljivost zunaj (0–1)
        <input
          type="number"
          step="0.01"
          min={0}
          max={1}
          value={form.out_of_specialty_reliability}
          onChange={(event) => setForm({ ...form, out_of_specialty_reliability: Number(event.target.value) })}
        />
      </label>
      <label>
        Barva
        <input value={form.avatar_color} onChange={(event) => setForm({ ...form, avatar_color: event.target.value })} />
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
        {onDelete ? (
          <button type="button" className="danger" onClick={onDelete}>
            Izbriši
          </button>
        ) : null}
      </div>
    </form>
  );
}
