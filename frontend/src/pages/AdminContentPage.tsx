import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { SortableTh } from "../components/AdminToolbar";
import { ConfirmModal } from "../components/ConfirmModal";
import { ApiError, api } from "../api";

type CategorySort = "name" | "active" | "inactive" | "reports";

type Quality = {
  totals: {
    questions: number;
    active: number;
    inactive: number;
    open_reports: number;
    categories: number;
  };
  by_category: { slug: string; name: string; active: number; inactive: number; reports: number; is_active: boolean }[];
  by_type: { question_type: string; active: number; inactive: number }[];
  by_difficulty: { difficulty: number; active: number }[];
};

export function AdminContentPage() {
  const [quality, setQuality] = useState<Quality | null>(null);
  const [payload, setPayload] = useState("");
  const [fileName, setFileName] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [sort, setSort] = useState<CategorySort>("name");
  const [direction, setDirection] = useState<"asc" | "desc">("asc");
  const fileRef = useRef<HTMLInputElement>(null);

  const categoryRows = useMemo(() => {
    const list = [...(quality?.by_category ?? [])];
    list.sort((a, b) => {
      const cmp =
        sort === "name"
          ? a.name.localeCompare(b.name, "sl")
          : Number(a[sort]) - Number(b[sort]);
      return direction === "asc" ? cmp : -cmp;
    });
    return list;
  }, [quality, sort, direction]);

  function toggleSort(column: string) {
    const key = column as CategorySort;
    if (sort === key) setDirection((current) => (current === "asc" ? "desc" : "asc"));
    else {
      setSort(key);
      setDirection(key === "name" ? "asc" : "desc");
    }
  }

  function load() {
    api<Quality>("/api/admin/content-quality/")
      .then(setQuality)
      .catch(() => setError("Kakovosti ni bilo mogoče naložiti."));
  }

  useEffect(() => {
    load();
  }, []);

  async function runImport(raw: string) {
    setPending(true);
    setError("");
    setNotice("");
    try {
      const parsed = JSON.parse(raw);
      const result = await api<{ created: number; updated: number; errors: string[] }>("/api/admin/questions/import/", {
        method: "POST",
        body: JSON.stringify({ payload: parsed }),
      });
      if (result.errors?.length) {
        setError(result.errors.join(" "));
      } else {
        setNotice(
          `Uvoz: novih ${result.created}, posodobljenih ${result.updated}. Isti ključ (key) ne ustvari dvojnika — posodobi obstoječe.`,
        );
        load();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Uvoz ni uspel. Preveri JSON.");
    } finally {
      setPending(false);
    }
  }

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      setPayload(text);
      void runImport(text);
    };
    reader.onerror = () => setError("Datoteke ni bilo mogoče prebrati.");
    reader.readAsText(file, "UTF-8");
    event.target.value = "";
  }

  async function exportJson() {
    setError("");
    try {
      const data = await api<Record<string, unknown>>("/api/admin/questions/export/");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "questions-export.json";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Izvoz ni uspel.");
    }
  }

  async function deactivateAllActive() {
    setConfirmDeactivate(false);
    setPending(true);
    setError("");
    setNotice("");
    try {
      const result = await api<{ deactivated: number; detail: string }>("/api/admin/questions/deactivate-active/", {
        method: "POST",
        body: "{}",
      });
      setNotice(result.detail || `Umaknjenih ${result.deactivated} aktivnih vprašanj.`);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Umaknitev ni uspela.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="panel">
      <p className="eyebrow">Admin · Vsebina</p>
      <h1>Pregled vsebine</h1>
      <div className="dash-grid">
        <Link className="dash-card" to="/nadzor/vsebina/vprasanja">
          <span>Vprašanja</span>
          <strong>{quality ? quality.totals.active : "…"}</strong>
          <span className="fine">aktivnih</span>
        </Link>
        <Link className="dash-card" to="/nadzor/vsebina/pritozbe">
          <span>Pritožbe</span>
          <strong>{quality ? quality.totals.open_reports : "…"}</strong>
          <span className="fine">odprte</span>
        </Link>
        <Link className="dash-card" to="/nadzor/sifranti/kategorije">
          <span>Kategorije</span>
          <strong>{quality ? quality.totals.categories : "…"}</strong>
        </Link>
      </div>
      {error ? <p className="error">{error}</p> : null}
      {notice ? <p className="fine">{notice}</p> : null}
      {quality ? (
        <>
          <h2>Po kategorijah</h2>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <SortableTh label="Kategorija" column="name" sort={sort} direction={direction} onSort={toggleSort} />
                  <SortableTh label="Aktivna" column="active" sort={sort} direction={direction} onSort={toggleSort} />
                  <SortableTh label="Umaknjena" column="inactive" sort={sort} direction={direction} onSort={toggleSort} />
                  <SortableTh label="Pritožbe" column="reports" sort={sort} direction={direction} onSort={toggleSort} />
                </tr>
              </thead>
              <tbody>
                {categoryRows.map((row) => (
                  <tr key={row.slug}>
                    <td>{row.name}</td>
                    <td>{row.active}</td>
                    <td>{row.inactive}</td>
                    <td>{row.reports}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
      <h2>Uvoz JSON</h2>
      <p className="fine">
        Naloži celotno datoteko (npr. seed.json). Vprašanja z istim <code>key</code> se ne podvajajo — posodobijo
        se. V isti datoteki ne sme biti dveh enakih ključev. Pred uvozom novega paketa lahko najprej umakneš vsa
        trenutno aktivna — ostanejo v bazi, a se ne izžrebajo več.
      </p>
      <div className="actions">
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onFile} />
        <button type="button" className="primary" disabled={pending} onClick={() => fileRef.current?.click()}>
          Naloži JSON datoteko
        </button>
        <button type="button" onClick={() => void exportJson()}>
          Izvozi trenutna
        </button>
        <button
          type="button"
          className="danger"
          disabled={pending || !quality?.totals.active}
          onClick={() => setConfirmDeactivate(true)}
        >
          Umakni vsa aktivna
          {quality?.totals.active ? ` (${quality.totals.active})` : ""}
        </button>
        {fileName ? <span className="fine">{fileName}</span> : null}
      </div>
      <ConfirmModal
        open={confirmDeactivate}
        title="Umakni vsa aktivna?"
        message={`Vsa trenutno aktivna vprašanja (${quality?.totals.active ?? 0}) bodo umaknjena. Zgodovina iger ostane; nova uvoziš nato kot aktivna.`}
        confirmLabel="Umakni vsa"
        danger
        onConfirm={() => void deactivateAllActive()}
        onCancel={() => setConfirmDeactivate(false)}
      />
      <details className="import-paste">
        <summary>Ali prilepi JSON ročno</summary>
        <textarea className="code-area" rows={8} value={payload} onChange={(event) => setPayload(event.target.value)} />
        <button type="button" className="primary" disabled={pending || !payload.trim()} onClick={() => void runImport(payload)}>
          Uvozi iz besedila
        </button>
      </details>
    </section>
  );
}
