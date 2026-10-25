import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { AdminToolbar, SortableTh, type AdminLimit } from "../components/AdminToolbar";
import { Modal } from "../components/Modal";
import { ApiError, api } from "../api";

export type StaffCountry = {
  iso2: string;
  iso3: string;
  name_sl: string;
  name_en: string;
  continent: string;
  subregion: string;
  flag_code: string;
  flag_emoji?: string;
  capital_sl: string;
  capital_en: string;
  difficulty: number;
  active: boolean;
  quiz_exclude: boolean;
  borders_iso2?: string[];
  data?: Record<string, unknown>;
};

type FormState = {
  name_sl: string;
  name_en: string;
  iso3: string;
  continent: string;
  subregion: string;
  flag_code: string;
  capital_sl: string;
  capital_en: string;
  difficulty: number;
  active: boolean;
  quiz_exclude: boolean;
  dataJson: string;
};

function toForm(country: StaffCountry): FormState {
  return {
    name_sl: country.name_sl,
    name_en: country.name_en || "",
    iso3: country.iso3 || "",
    continent: country.continent,
    subregion: country.subregion || "",
    flag_code: country.flag_code || country.iso2,
    capital_sl: country.capital_sl || "",
    capital_en: country.capital_en || "",
    difficulty: country.difficulty,
    active: country.active,
    quiz_exclude: country.quiz_exclude,
    dataJson: JSON.stringify(country.data || {}, null, 2),
  };
}

export function AdminCountriesPage() {
  const [countries, setCountries] = useState<StaffCountry[]>([]);
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [limit, setLimit] = useState<AdminLimit>("50");
  const [sort, setSort] = useState("name_sl");
  const [direction, setDirection] = useState<"asc" | "desc">("asc");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<StaffCountry | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pendingImport, setPendingImport] = useState(false);
  const [pastePayload, setPastePayload] = useState("");
  const [fileName, setFileName] = useState("");
  const [onlyNew, setOnlyNew] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function load() {
    const params = new URLSearchParams();
    if (submitted.trim()) params.set("q", submitted.trim());
    api<{ countries: StaffCountry[] }>(`/api/admin/countries/?${params}`)
      .then((data) => setCountries(data.countries))
      .catch(() => setError("Držav ni bilo mogoče naložiti."));
  }

  useEffect(() => {
    load();
  }, [submitted]);

  async function runImport(raw: string) {
    setPendingImport(true);
    setError("");
    setNotice("");
    try {
      const parsed = JSON.parse(raw);
      const result = await api<{
        created: number;
        updated: number;
        skipped: number;
        total: number;
        errors: string[];
      }>("/api/admin/countries/import/", {
        method: "POST",
        body: JSON.stringify({ payload: parsed, only_new: onlyNew }),
      });
      if (result.errors?.length) {
        setError(result.errors.join(" "));
      }
      setNotice(
        `Uvoz držav: novih ${result.created}, posodobljenih ${result.updated}` +
          (result.skipped ? `, preskočenih ${result.skipped}` : "") +
          `, skupaj ${result.total}.`,
      );
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Uvoz ni uspel. Preveri JSON.");
    } finally {
      setPendingImport(false);
    }
  }

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      setPastePayload(text);
      void runImport(text);
    };
    reader.readAsText(file);
    event.target.value = "";
  }

  const rows = useMemo(() => {
    let list = [...countries];
    list.sort((a, b) => {
      const av = a[sort as keyof StaffCountry];
      const bv = b[sort as keyof StaffCountry];
      const cmp = String(av ?? "").localeCompare(String(bv ?? ""), "sl", { numeric: true });
      return direction === "asc" ? cmp : -cmp;
    });
    if (limit !== "all") list = list.slice(0, Number(limit));
    return list;
  }, [countries, sort, direction, limit]);

  function toggleSort(column: string) {
    if (sort === column) setDirection((current) => (current === "asc" ? "desc" : "asc"));
    else {
      setSort(column);
      setDirection("asc");
    }
  }

  function openEdit(country: StaffCountry) {
    setEditing(country);
    setForm(toForm(country));
    setError("");
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
    setForm(null);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!editing || !form) return;
    setError("");
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(form.dataJson || "{}") as Record<string, unknown>;
      if (data === null || typeof data !== "object" || Array.isArray(data)) {
        throw new Error("data mora biti objekt");
      }
    } catch {
      setError("JSON v polju data ni veljaven.");
      return;
    }
    try {
      await api(`/api/admin/countries/${editing.iso2}/`, {
        method: "POST",
        body: JSON.stringify({
          name_sl: form.name_sl,
          name_en: form.name_en,
          iso3: form.iso3,
          continent: form.continent,
          subregion: form.subregion,
          flag_code: form.flag_code,
          capital_sl: form.capital_sl,
          capital_en: form.capital_en,
          difficulty: form.difficulty,
          active: form.active,
          quiz_exclude: form.quiz_exclude,
          data,
        }),
      });
      setNotice(`Shranjeno: ${form.name_sl}.`);
      closeModal();
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Shranjevanje ni uspelo.");
    }
  }

  return (
    <section className="panel">
      <p className="eyebrow">Šifranti</p>
      <h1>Države</h1>
      <p className="fine">Ugib zastav — urejanje imen, kviz zastavic in celotnega JSON paketa.</p>
      {notice ? <p className="fine">{notice}</p> : null}
      {error && !modalOpen ? <p className="error">{error}</p> : null}

      <h2>Uvoz JSON</h2>
      <p className="fine">
        Naloži paket (npr. <code>eu_countries.json</code>). Isti <code>iso2</code> posodobi obstoječo državo.
      </p>
      <div className="actions">
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onFile} />
        <button
          type="button"
          className="primary"
          disabled={pendingImport}
          onClick={() => fileRef.current?.click()}
        >
          Naloži JSON datoteko
        </button>
        <button
          type="button"
          className={onlyNew ? "is-on" : undefined}
          disabled={pendingImport}
          onClick={() => setOnlyNew((current) => !current)}
        >
          Samo nove
        </button>
        {fileName ? <span className="fine">{fileName}</span> : null}
      </div>
      <details className="import-paste">
        <summary>Ali prilepi JSON ročno</summary>
        <textarea
          className="code-area"
          rows={8}
          value={pastePayload}
          onChange={(event) => setPastePayload(event.target.value)}
        />
        <button
          type="button"
          className="primary"
          disabled={pendingImport || !pastePayload.trim()}
          onClick={() => void runImport(pastePayload)}
        >
          Uvozi iz besedila
        </button>
      </details>

      <AdminToolbar
        query={query}
        onQueryChange={setQuery}
        onSearch={() => setSubmitted(query)}
        limit={limit}
        onLimitChange={setLimit}
      />
      <p className="fine">
        {rows.length} od {countries.length}
      </p>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <SortableTh label="Zastava" column="iso2" sort={sort} direction={direction} onSort={toggleSort} />
              <SortableTh label="Ime" column="name_sl" sort={sort} direction={direction} onSort={toggleSort} />
              <SortableTh
                label="Kontinent"
                column="continent"
                sort={sort}
                direction={direction}
                onSort={toggleSort}
              />
              <SortableTh
                label="Prestolnica"
                column="capital_sl"
                sort={sort}
                direction={direction}
                onSort={toggleSort}
              />
              <SortableTh
                label="Tež."
                column="difficulty"
                sort={sort}
                direction={direction}
                onSort={toggleSort}
              />
              <th>Kviz</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.iso2} className="is-link" onClick={() => openEdit(row)}>
                <td>
                  <span
                    className={`fi fi-${row.flag_code || row.iso2} admin-country-flag`}
                    title={row.iso2.toUpperCase()}
                    role="img"
                    aria-label={row.iso2}
                  />
                </td>
                <td>{row.name_sl}</td>
                <td>{row.continent}</td>
                <td>{row.capital_sl || "—"}</td>
                <td>{row.difficulty}</td>
                <td>
                  {!row.active ? "neaktivna" : row.quiz_exclude ? "izključena" : "da"}
                </td>
                <td>
                  <button
                    type="button"
                    className="btn-tertiary"
                    onClick={(event) => {
                      event.stopPropagation();
                      openEdit(row);
                    }}
                  >
                    Uredi
                  </button>
                </td>
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td colSpan={7} className="fine">
                  Ni držav.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <Modal
        title={`${editing?.flag_emoji || ""} ${editing?.name_sl || ""} (${editing?.iso2 || ""})`}
        open={modalOpen}
        onClose={closeModal}
      >
        {error && modalOpen ? <p className="error">{error}</p> : null}
        {form ? (
          <form className="stack" onSubmit={onSubmit}>
            <label>
              Ime (SL)
              <input
                value={form.name_sl}
                onChange={(e) => setForm({ ...form, name_sl: e.target.value })}
                required
              />
            </label>
            <label>
              Ime (EN)
              <input
                value={form.name_en}
                onChange={(e) => setForm({ ...form, name_en: e.target.value })}
              />
            </label>
            <label>
              ISO3
              <input
                value={form.iso3}
                onChange={(e) => setForm({ ...form, iso3: e.target.value })}
                maxLength={3}
              />
            </label>
            <label>
              Flag code
              <input
                value={form.flag_code}
                onChange={(e) => setForm({ ...form, flag_code: e.target.value })}
                maxLength={8}
              />
            </label>
            <label>
              Kontinent
              <input
                value={form.continent}
                onChange={(e) => setForm({ ...form, continent: e.target.value })}
                required
              />
            </label>
            <label>
              Subregija
              <input
                value={form.subregion}
                onChange={(e) => setForm({ ...form, subregion: e.target.value })}
              />
            </label>
            <label>
              Prestolnica (SL)
              <input
                value={form.capital_sl}
                onChange={(e) => setForm({ ...form, capital_sl: e.target.value })}
              />
            </label>
            <label>
              Prestolnica (EN)
              <input
                value={form.capital_en}
                onChange={(e) => setForm({ ...form, capital_en: e.target.value })}
              />
            </label>
            <label>
              Težavnost (1–5)
              <input
                type="number"
                min={1}
                max={5}
                value={form.difficulty}
                onChange={(e) => setForm({ ...form, difficulty: Number(e.target.value) || 1 })}
              />
            </label>
            <div className="choices" role="group" aria-label="Kviz">
              <button
                type="button"
                className={form.active ? "is-on" : ""}
                onClick={() => setForm({ ...form, active: !form.active })}
              >
                Aktivna
              </button>
              <button
                type="button"
                className={form.quiz_exclude ? "is-on" : ""}
                onClick={() => setForm({ ...form, quiz_exclude: !form.quiz_exclude })}
              >
                Izključi iz kviza
              </button>
            </div>
            {editing?.borders_iso2?.length ? (
              <p className="fine">Meje: {editing.borders_iso2.join(", ")}</p>
            ) : null}
            <label>
              Polni JSON (data)
              <textarea
                rows={16}
                value={form.dataJson}
                onChange={(e) => setForm({ ...form, dataJson: e.target.value })}
                spellCheck={false}
                style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.85rem" }}
              />
            </label>
            <div className="actions">
              <button type="submit" className="primary">
                Shrani
              </button>
              <button type="button" className="btn-tertiary" onClick={closeModal}>
                Prekliči
              </button>
            </div>
          </form>
        ) : null}
      </Modal>
    </section>
  );
}
