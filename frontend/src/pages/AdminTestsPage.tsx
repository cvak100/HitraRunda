import { useEffect, useMemo, useState } from "react";

import { ApiError, api } from "../api";
import { formatWhen } from "../format";

type Suite = {
  id: string;
  label: string;
  module: string;
  group: string;
  description: string;
};

type RunResult = {
  suite: string;
  label: string;
  ok: boolean;
  returncode: number;
  duration_s: number;
  stdout: string;
  stderr: string;
  ran_at: string;
};

type Catalog = {
  suites: Suite[];
  can_run: boolean;
  last_run: RunResult | Record<string, never>;
  hint: string | null;
};

export function AdminTestsPage() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);

  useEffect(() => {
    api<Catalog>("/api/admin/tests/")
      .then((data) => {
        setCatalog(data);
        if (data.last_run && "suite" in data.last_run) setResult(data.last_run as RunResult);
        setError("");
      })
      .catch(() => setError("Kataloga testov ni bilo mogoče naložiti."));
  }, []);

  const groups = useMemo(() => {
    const map = new Map<string, Suite[]>();
    for (const suite of catalog?.suites ?? []) {
      const list = map.get(suite.group) ?? [];
      list.push(suite);
      map.set(suite.group, list);
    }
    return [...map.entries()];
  }, [catalog]);

  async function runSuite(suiteId: string) {
    setPending(suiteId);
    setError("");
    try {
      const data = await api<RunResult>("/api/admin/tests/run/", {
        method: "POST",
        body: JSON.stringify({ suite: suiteId }),
      });
      setResult(data);
      setCatalog((current) => (current ? { ...current, last_run: data } : current));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Zagon testa ni uspel.");
    } finally {
      setPending(null);
    }
  }

  return (
    <section className="panel">
      <p className="eyebrow">Admin</p>
      <h1>Testi</h1>
      <p className="fine">
        Paketi Django testov po sklopih. Zagon ustvari začasno testno bazo (lahko traja minute). Na produkciji
        omogoči z <code>DJANGO_ALLOW_ADMIN_TESTS=1</code>.
      </p>
      {error ? <p className="error">{error}</p> : null}
      {catalog?.hint ? <p className="fine">{catalog.hint}</p> : null}

      {groups.map(([group, suites]) => (
        <div key={group} className="admin-test-group">
          <h2>{group}</h2>
          <div className="admin-list">
            {suites.map((suite) => (
              <article key={suite.id} className="admin-card">
                <div className="admin-test-card-head">
                  <div>
                    <h3>{suite.label}</h3>
                    <p className="fine">{suite.description}</p>
                    <p className="fine">
                      <code>{suite.module}</code>
                    </p>
                  </div>
                  <button
                    type="button"
                    className="primary"
                    disabled={!catalog?.can_run || pending !== null}
                    onClick={() => void runSuite(suite.id)}
                  >
                    {pending === suite.id ? "Tečem…" : "Zaženi"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      ))}

      {result ? (
        <div className={`admin-test-result ${result.ok ? "is-ok" : "is-bad"}`}>
          <h2>
            {result.label}: {result.ok ? "OK" : "FAIL"}
          </h2>
          <p className="fine">
            {formatWhen(result.ran_at)} · {result.duration_s}s · koda {result.returncode}
          </p>
          {result.stdout ? (
            <pre className="admin-test-log">{result.stdout}</pre>
          ) : null}
          {result.stderr ? (
            <pre className="admin-test-log is-err">{result.stderr}</pre>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
