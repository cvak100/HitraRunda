import { FormEvent, useEffect, useState } from "react";

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

export function AdminFriendsPage() {
  const [friends, setFriends] = useState<PhoneFriend[]>([]);
  const [form, setForm] = useState<FormState>(empty);
  const [editId, setEditId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  function load() {
    api<{ friends: PhoneFriend[] }>("/api/admin/friends/")
      .then((data) => setFriends(data.friends))
      .catch(() => setError("Prijateljev ni bilo mogoče naložiti."));
  }

  useEffect(() => {
    load();
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    try {
      const body = {
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
      if (editId == null) await api("/api/admin/friends/", { method: "POST", body: JSON.stringify(body) });
      else await api(`/api/admin/friends/${editId}/`, { method: "POST", body: JSON.stringify(body) });
      setNotice("Prijatelj je shranjen.");
      setForm(empty);
      setEditId(null);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Shranjevanje ni uspelo.");
    }
  }

  function startEdit(friend: PhoneFriend) {
    if (friend.id == null) return;
    setEditId(friend.id);
    setForm({
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
    });
  }

  return (
    <section className="panel">
      <p className="eyebrow">Admin</p>
      <h1>Prijatelji (klic v sili)</h1>
      <p className="fine">
        Pred igro igralec izbere 3 od aktivnih. Zanesljivost v specialnosti / zunaj nje določa, kako pogosto zadanejo.
        Prazne specialnosti = univerzalen.
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
      <div className="friend-grid">
        {friends.map((friend) => (
          <article key={friend.key} className="friend-card" style={{ ["--friend-color" as string]: friend.avatar_color }}>
            <strong>{friend.name}</strong>
            <span>{friend.title}</span>
            <span className="fine">{friend.bio}</span>
            <span className="fine">
              {(friend.specialty_categories || []).join(", ") || "univerzalen"} · {Math.round((friend.reliability || 0) * 100)}% /{" "}
              {Math.round((friend.out_of_specialty_reliability || 0) * 100)}%
            </span>
            <button type="button" onClick={() => startEdit(friend)}>
              Uredi
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
