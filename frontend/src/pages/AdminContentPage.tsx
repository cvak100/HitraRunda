import { useEffect, useState } from "react";

import { ApiError, api } from "../api";

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
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  function load() {
    api<Quality>("/api/admin/content-quality/")
      .then(setQuality)
      .catch(() => setError("Kakovosti ni bilo mogoče naložiti."));
  }

  useEffect(() => {
    load();
  }, []);

  async function importJson() {
    setPending(true);
    setError("");
    setNotice("");
    try {
      const parsed = JSON.parse(payload);
      const result = await api<{ created: number; updated: number; errors: string[] }>("/api/admin/questions/import/", {
        method: "POST",
        body: JSON.stringify({ payload: parsed }),
      });
      if (result.errors?.length) {
        setError(result.errors.join(" "));
      } else {
        setNotice(`Uvoz: novih ${result.created}, posodobljenih ${result.updated}.`);
        load();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Uvoz ni uspel. Preveri JSON.");
    } finally {
      setPending(false);
    }
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

  return (
    <section className="panel">
      <p className="eyebrow">Admin</p>
      <h1>Vsebina</h1>
      {error ? <p className="error">{error}</p> : null}
      {notice ? <p className="fine">{notice}</p> : null}
      {quality ? (
        <div className="dash-grid">
          <div className="dash-card">
            <span>Aktivna</span>
            <strong>{quality.totals.active}</strong>
            <span className="fine">od {quality.totals.questions}</span>
          </div>
          <div className="dash-card">
            <span>Umaknjena</span>
            <strong>{quality.totals.inactive}</strong>
          </div>
          <div className="dash-card">
            <span>Odprte pritožbe</span>
            <strong>{quality.totals.open_reports}</strong>
          </div>
          <div className="dash-card">
            <span>Kategorije</span>
            <strong>{quality.totals.categories}</strong>
          </div>
        </div>
      ) : null}
      {quality ? (
        <>
          <h2>Po kategorijah</h2>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Kategorija</th>
                  <th>Aktivna</th>
                  <th>Umaknjena</th>
                  <th>Pritožbe</th>
                </tr>
              </thead>
              <tbody>
                {quality.by_category.map((row) => (
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
          <h2>Po tipu / težavnosti</h2>
          <p className="fine">
            {quality.by_type.map((row) => `${row.question_type}: ${row.active}`).join(" · ")}
          </p>
          <p className="fine">
            {quality.by_difficulty.map((row) => `T${row.difficulty}: ${row.active}`).join(" · ")}
          </p>
        </>
      ) : null}
      <h2>Uvoz JSON</h2>
      <p className="fine">Prilepi payload v obliki questions.json (version + questions). Isti key posodobi vprašanje.</p>
      <textarea className="code-area" rows={10} value={payload} onChange={(event) => setPayload(event.target.value)} />
      <div className="actions">
        <button type="button" className="primary" disabled={pending || !payload.trim()} onClick={() => void importJson()}>
          Uvozi
        </button>
        <button type="button" onClick={() => void exportJson()}>
          Izvozi trenutna
        </button>
      </div>
    </section>
  );
}
