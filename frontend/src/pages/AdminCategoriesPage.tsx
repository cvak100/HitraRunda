import { FormEvent, useEffect, useState } from "react";

import { ApiError, api } from "../api";
import type { StaffCategory } from "../types";

const empty = { name: "", slug: "", description: "", order: 0, is_active: true };

export function AdminCategoriesPage() {
  const [categories, setCategories] = useState<StaffCategory[]>([]);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  function load() {
    api<{ categories: StaffCategory[] }>("/api/admin/categories/")
      .then((data) => setCategories(data.categories))
      .catch(() => setError("Kategorij ni bilo mogoče naložiti."));
  }

  useEffect(() => {
    load();
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    try {
      if (editId == null) {
        await api("/api/admin/categories/", { method: "POST", body: JSON.stringify(form) });
        setNotice("Kategorija je dodana.");
      } else {
        await api(`/api/admin/categories/${editId}/`, { method: "POST", body: JSON.stringify(form) });
        setNotice("Kategorija je shranjena.");
      }
      setForm(empty);
      setEditId(null);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Shranjevanje ni uspelo.");
    }
  }

  function startEdit(category: StaffCategory) {
    setEditId(category.id);
    setForm({
      name: category.name,
      slug: category.slug,
      description: category.description,
      order: category.order,
      is_active: category.is_active,
    });
  }

  return (
    <section className="panel">
      <p className="eyebrow">Admin</p>
      <h1>Kategorije</h1>
      {error ? <p className="error">{error}</p> : null}
      {notice ? <p className="fine">{notice}</p> : null}
      <form className="stack" onSubmit={onSubmit}>
        <label>
          Ime
          <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
        </label>
        <label>
          Slug
          <input value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value })} required />
        </label>
        <label>
          Opis
          <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
        </label>
        <label>
          Vrstni red
          <input
            type="number"
            value={form.order}
            onChange={(event) => setForm({ ...form, order: Number(event.target.value) })}
          />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(event) => setForm({ ...form, is_active: event.target.checked })}
          />
          Aktivna
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
        {categories.map((category) => (
          <article key={category.id} className="admin-card">
            <h2>
              {category.name} <span className="fine">({category.slug})</span>
            </h2>
            <p className="fine">
              {category.question_count} aktivnih · {category.is_active ? "aktivna" : "umaknjena"}
            </p>
            <p>{category.description || "—"}</p>
            <button type="button" onClick={() => startEdit(category)}>
              Uredi
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
