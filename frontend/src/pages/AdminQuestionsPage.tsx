import { FormEvent, Fragment, useEffect, useState } from "react";

import { AdminToolbar, SortableTh, type AdminLimit } from "../components/AdminToolbar";
import { ConfirmModal } from "../components/ConfirmModal";
import { DeleteIcon, EditIcon, IconAction, ViewIcon } from "../components/IconActions";
import { Modal } from "../components/Modal";
import { ApiError, api } from "../api";
import { QuestionBody, TYPE_LABELS } from "../components/QuestionBody";
import type { StaffOption, StaffPair, StaffQuestion } from "../types";

type CategoryOption = { slug: string; name: string };

type QuestionStatus = "all" | "active" | "withdrawn";
type SortKey = "text" | "category" | "type" | "difficulty" | "status" | "reports";

type EditForm = {
  text: string;
  category: string;
  difficulty: number;
  explanation: string;
  is_active: boolean;
  options: StaffOption[];
  pairs: StaffPair[];
  slider: { min: number; max: number; step: number; correct: number; tolerance: number };
};

function toForm(question: StaffQuestion): EditForm {
  return {
    text: question.text,
    category: question.category,
    difficulty: question.difficulty,
    explanation: question.explanation || "",
    is_active: question.is_active,
    options: (question.options || []).map((option) => ({ ...option })),
    pairs: (question.pairs || []).map((pair) => ({ ...pair })),
    slider: question.slider
      ? { ...question.slider }
      : { min: 0, max: 100, step: 1, correct: 50, tolerance: 5 },
  };
}

export function AdminQuestionsPage() {
  const [questions, setQuestions] = useState<StaffQuestion[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [draftCategories, setDraftCategories] = useState<string[]>([]);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [status, setStatus] = useState<QuestionStatus>("all");
  const [sort, setSort] = useState<SortKey>("category");
  const [direction, setDirection] = useState<"asc" | "desc">("asc");
  const [limit, setLimit] = useState<AdminLimit>("20");
  const [total, setTotal] = useState(0);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<EditForm | null>(null);
  const [pendingDelete, setPendingDelete] = useState<StaffQuestion | null>(null);

  function load() {
    const params = new URLSearchParams();
    if (submitted.trim()) params.set("q", submitted.trim());
    params.set("status", status);
    params.set("sort", sort);
    params.set("dir", direction);
    params.set("limit", limit);
    if (selectedCategories.length) params.set("categories", selectedCategories.join(","));
    api<{ questions: StaffQuestion[]; total: number }>(`/api/admin/questions/?${params}`)
      .then((data) => {
        setQuestions(data.questions);
        setTotal(data.total);
        setError("");
      })
      .catch(() => setError("Vprašanj ni bilo mogoče naložiti."));
  }

  useEffect(() => {
    api<{ categories: { slug: string; name: string }[] }>("/api/admin/categories/")
      .then((data) => setCategories(data.categories.map((c) => ({ slug: c.slug, name: c.name }))))
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    load();
  }, [submitted, status, sort, direction, limit, selectedCategories]);

  function openCategoryModal() {
    setDraftCategories(selectedCategories);
    setCategoryModalOpen(true);
  }

  function toggleDraftCategory(slug: string) {
    setDraftCategories((current) =>
      current.includes(slug) ? current.filter((item) => item !== slug) : [...current, slug],
    );
  }

  function applyCategoryFilter() {
    setSelectedCategories(draftCategories);
    setCategoryModalOpen(false);
  }

  async function removeQuestion(question: StaffQuestion) {
    setError("");
    try {
      const result = await api<{ detail: string; deactivated: boolean }>(`/api/admin/questions/${question.id}/`, {
        method: "DELETE",
      });
      setNotice(result.detail);
      setPendingDelete(null);
      if (result.deactivated && status !== "active") {
        setQuestions((current) =>
          current.map((item) => (item.id === question.id ? { ...item, is_active: false, open_reports: 0 } : item)),
        );
      } else {
        setQuestions((current) => current.filter((item) => item.id !== question.id));
        setTotal((current) => Math.max(0, current - 1));
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Brisanje ni uspelo.");
    }
  }

  function startEdit(question: StaffQuestion) {
    setEditId(question.id);
    setOpenId(question.id);
    setForm(toForm(question));
  }

  async function saveEdit(event: FormEvent, question: StaffQuestion) {
    event.preventDefault();
    if (!form) return;
    setError("");
    setNotice("");
    const body: Record<string, unknown> = {
      key: question.key,
      category: form.category,
      question_type: question.question_type,
      difficulty: form.difficulty,
      text: form.text,
      explanation: form.explanation,
      is_active: form.is_active,
      image: question.image,
    };
    if (question.question_type === "matching") body.pairs = form.pairs;
    else if (question.question_type === "slider") body.slider = form.slider;
    else body.options = form.options.map((option) => ({ text: option.text, correct: option.correct }));
    try {
      const result = await api<{ question: StaffQuestion; detail: string }>(`/api/admin/questions/${question.id}/`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setNotice(result.detail);
      setQuestions((current) => current.map((item) => (item.id === question.id ? result.question : item)));
      setEditId(null);
      setForm(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Shranjevanje ni uspelo.");
    }
  }

  function toggleSort(next: SortKey) {
    if (sort === next) setDirection((current) => (current === "asc" ? "desc" : "asc"));
    else {
      setSort(next);
      setDirection("asc");
    }
  }

  return (
    <section className="panel">
      <p className="eyebrow">Admin · Vsebina</p>
      <h1>Vprašanja</h1>
      <p className="fine">
        Umaknjeno vprašanje je bilo že v kaki igri, zato ga ni šlo izbrisati. V nove igre ne pride, stari rezultati ostanejo.
      </p>
      {notice ? <p className="fine">{notice}</p> : null}
      {error ? <p className="error">{error}</p> : null}
      <AdminToolbar
        query={query}
        onQueryChange={setQuery}
        onSearch={() => setSubmitted(query)}
        limit={limit}
        onLimitChange={setLimit}
      >
        <div className="choices">
          <button type="button" className={status === "all" ? "is-on" : ""} onClick={() => setStatus("all")}>
            Vsa
          </button>
          <button type="button" className={status === "active" ? "is-on" : ""} onClick={() => setStatus("active")}>
            Aktivna
          </button>
          <button type="button" className={status === "withdrawn" ? "is-on" : ""} onClick={() => setStatus("withdrawn")}>
            Umaknjena
          </button>
          <button
            type="button"
            className={selectedCategories.length ? "is-on" : ""}
            onClick={openCategoryModal}
          >
            Kategorije
            {selectedCategories.length ? ` (${selectedCategories.length})` : ""}
          </button>
          {selectedCategories.length ? (
            <button type="button" onClick={() => setSelectedCategories([])}>
              Počisti
            </button>
          ) : null}
        </div>
      </AdminToolbar>
      <p className="fine">
        Prikazanih {questions.length} od {total}
      </p>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <SortableTh label="Vprašanje" column="text" sort={sort} direction={direction} onSort={(c) => toggleSort(c as SortKey)} />
              <SortableTh label="Kategorija" column="category" sort={sort} direction={direction} onSort={(c) => toggleSort(c as SortKey)} />
              <SortableTh label="Tip" column="type" sort={sort} direction={direction} onSort={(c) => toggleSort(c as SortKey)} />
              <SortableTh
                label="Tež."
                title="Težavnost"
                column="difficulty"
                sort={sort}
                direction={direction}
                onSort={(c) => toggleSort(c as SortKey)}
              />
              <SortableTh label="Stanje" column="status" sort={sort} direction={direction} onSort={(c) => toggleSort(c as SortKey)} />
              <SortableTh label="Pritožbe" column="reports" sort={sort} direction={direction} onSort={(c) => toggleSort(c as SortKey)} />
              <th className="col-actions" aria-label="Dejanja" />
            </tr>
          </thead>
          <tbody>
            {questions.length === 0 ? (
              <tr>
                <td colSpan={7}>Ni zadetkov.</td>
              </tr>
            ) : null}
            {questions.map((question) => (
              <Fragment key={question.id}>
                <tr>
                  <td className="question-text">{question.text}</td>
                  <td className="cell-center">{question.category_name}</td>
                  <td className="cell-center">{TYPE_LABELS[question.question_type]}</td>
                  <td className="cell-center">{question.difficulty}</td>
                  <td className="cell-center">{question.is_active ? "Aktivno" : "Umaknjeno"}</td>
                  <td className="cell-center">{question.open_reports}</td>
                  <td className="row-actions">
                    <IconAction
                      label={openId === question.id ? "Skrij pregled" : "Pregled"}
                      onClick={() => setOpenId((current) => (current === question.id ? null : question.id))}
                    >
                      <ViewIcon />
                    </IconAction>
                    <IconAction label="Uredi" onClick={() => startEdit(question)}>
                      <EditIcon />
                    </IconAction>
                    <IconAction label="Izbriši" danger onClick={() => setPendingDelete(question)}>
                      <DeleteIcon />
                    </IconAction>
                  </td>
                </tr>
                {openId === question.id ? (
                  <tr>
                    <td colSpan={7}>
                      {editId === question.id && form ? (
                        <form className="stack" onSubmit={(event) => void saveEdit(event, question)}>
                          <label>
                            Besedilo
                            <textarea value={form.text} onChange={(event) => setForm({ ...form, text: event.target.value })} required />
                          </label>
                          <label>
                            Kategorija (slug)
                            <input value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} required />
                          </label>
                          <label>
                            Težavnost
                            <input
                              type="number"
                              min={1}
                              max={5}
                              value={form.difficulty}
                              onChange={(event) => setForm({ ...form, difficulty: Number(event.target.value) })}
                            />
                          </label>
                          <label>
                            Razlaga
                            <textarea value={form.explanation} onChange={(event) => setForm({ ...form, explanation: event.target.value })} />
                          </label>
                          <label className="check">
                            <input
                              type="checkbox"
                              checked={form.is_active}
                              onChange={(event) => setForm({ ...form, is_active: event.target.checked })}
                            />
                            Aktivno
                          </label>
                          {question.question_type === "matching" ? (
                            form.pairs.map((pair, index) => (
                              <div key={index} className="actions">
                                <input
                                  value={pair.left}
                                  onChange={(event) => {
                                    const pairs = [...form.pairs];
                                    pairs[index] = { ...pair, left: event.target.value };
                                    setForm({ ...form, pairs });
                                  }}
                                  placeholder="Levo"
                                />
                                <input
                                  value={pair.right}
                                  onChange={(event) => {
                                    const pairs = [...form.pairs];
                                    pairs[index] = { ...pair, right: event.target.value };
                                    setForm({ ...form, pairs });
                                  }}
                                  placeholder="Desno"
                                />
                              </div>
                            ))
                          ) : question.question_type === "slider" ? (
                            <div className="actions">
                              {(["min", "max", "step", "correct", "tolerance"] as const).map((field) => (
                                <label key={field}>
                                  {field}
                                  <input
                                    type="number"
                                    value={form.slider[field]}
                                    onChange={(event) =>
                                      setForm({ ...form, slider: { ...form.slider, [field]: Number(event.target.value) } })
                                    }
                                  />
                                </label>
                              ))}
                            </div>
                          ) : (
                            form.options.map((option, index) => (
                              <label key={index} className="check">
                                <input
                                  type="checkbox"
                                  checked={option.correct}
                                  disabled={question.question_type === "ordering"}
                                  onChange={(event) => {
                                    const options = [...form.options];
                                    options[index] = { ...option, correct: event.target.checked };
                                    setForm({ ...form, options });
                                  }}
                                />
                                <input
                                  value={option.text}
                                  onChange={(event) => {
                                    const options = [...form.options];
                                    options[index] = { ...option, text: event.target.value };
                                    setForm({ ...form, options });
                                  }}
                                />
                              </label>
                            ))
                          )}
                          <div className="actions">
                            <button className="primary" type="submit">
                              Shrani
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditId(null);
                                setForm(null);
                              }}
                            >
                              Prekliči
                            </button>
                          </div>
                        </form>
                      ) : (
                        <QuestionBody question={question} />
                      )}
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <ConfirmModal
        open={pendingDelete != null}
        title="Izbriši vprašanje"
        message="Izbrišem to vprašanje?"
        confirmLabel="Izbriši"
        danger
        onConfirm={() => {
          if (pendingDelete) void removeQuestion(pendingDelete);
        }}
        onCancel={() => setPendingDelete(null)}
      />
      <Modal title="Filtriraj kategorije" open={categoryModalOpen} onClose={() => setCategoryModalOpen(false)}>
        <p className="fine">Izberi eno ali več kategorij. Prazna izbira = vse kategorije.</p>
        <div className="category-picker-grid admin-category-filter">
          {categories.map((category) => (
            <label key={category.slug} className="check category-picker-item">
              <input
                type="checkbox"
                checked={draftCategories.includes(category.slug)}
                onChange={() => toggleDraftCategory(category.slug)}
              />
              <span className="category-picker-name">{category.name}</span>
            </label>
          ))}
        </div>
        <div className="actions" style={{ marginTop: 14 }}>
          <button type="button" onClick={() => setDraftCategories(categories.map((c) => c.slug))}>
            Vse
          </button>
          <button type="button" onClick={() => setDraftCategories([])}>
            Nobena
          </button>
          <button type="button" className="primary" onClick={applyCategoryFilter}>
            Uporabi
          </button>
          <button type="button" onClick={() => setCategoryModalOpen(false)}>
            Prekliči
          </button>
        </div>
      </Modal>
    </section>
  );
}
