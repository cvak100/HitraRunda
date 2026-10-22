import { FormEvent, useEffect, useMemo, useState } from "react";

import { AdminToolbar, SortableTh, type AdminLimit } from "../components/AdminToolbar";
import { Modal } from "../components/Modal";
import { ApiError, api } from "../api";
import type { StaffCategory } from "../types";

const empty = { name: "", slug: "", description: "", order: 0, is_active: true };

export function AdminCategoriesPage() {
  const [categories, setCategories] = useState<StaffCategory[]>([]);
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
    api<{ categories: StaffCategory[] }>("/api/admin/categories/")
      .then((data) => setCategories(data.categories))
      .catch(() => setError("Kategorij ni bilo mogoče naložiti."));
  }

  useEffect(() => {
    load();
  }, []);

  const rows = useMemo(() => {
    const q = submitted.trim().toLowerCase();
    let list = categories.filter(
      (item) => !q || item.name.toLowerCase().includes(q) || item.slug.toLowerCase().includes(q),
    );
    list = [...list].sort((a, b) => {
      const av = a[sort as keyof StaffCategory];
      const bv = b[sort as keyof StaffCategory];
      const cmp = String(av ?? "").localeCompare(String(bv ?? ""), "sl", { numeric: true });
      return direction === "asc" ? cmp : -cmp;
    });
    if (limit !== "all") list = list.slice(0, Number(limit));
    return list;
  }, [categories, submitted, sort, direction, limit]);

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

  function openEdit(category: StaffCategory) {
    setEditingId(category.id);
    setForm({
      name: category.name,
      slug: category.slug,
      description: category.description,
      order: category.order,
      is_active: category.is_active,
    });
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
        await api<{ category: StaffCategory }>("/api/admin/categories/", {
          method: "POST",
          body: JSON.stringify(form),
        });
        setNotice("Kategorija je dodana.");
      } else {
        await api(`/api/admin/categories/${editingId}/`, { method: "POST", body: JSON.stringify(form) });
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
      <h1>Kategorije</h1>
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
        {rows.length} od {categories.length}
      </p>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <SortableTh label="Ime" column="name" sort={sort} direction={direction} onSort={toggleSort} />
              <SortableTh label="Slug" column="slug" sort={sort} direction={direction} onSort={toggleSort} />
              <SortableTh label="Vrstni red" column="order" sort={sort} direction={direction} onSort={toggleSort} />
              <SortableTh label="Vprašanja" column="question_count" sort={sort} direction={direction} onSort={toggleSort} />
              <SortableTh label="Stanje" column="is_active" sort={sort} direction={direction} onSort={toggleSort} />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5}>Ni zadetkov.</td>
              </tr>
            ) : null}
            {rows.map((category) => (
              <tr key={category.id} className="is-link" onClick={() => openEdit(category)}>
                <td>{category.name}</td>
                <td>{category.slug}</td>
                <td>{category.order}</td>
                <td>{category.question_count}</td>
                <td>{category.is_active ? "Aktivna" : "Umaknjena"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Modal title={editingId == null ? "Nova kategorija" : "Uredi kategorijo"} open={modalOpen} onClose={closeModal}>
        {error && modalOpen ? <p className="error">{error}</p> : null}
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
            <input type="number" value={form.order} onChange={(event) => setForm({ ...form, order: Number(event.target.value) })} />
          </label>
          <label className="check">
            <input type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} />
            Aktivna
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
