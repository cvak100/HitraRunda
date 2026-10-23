import { FormEvent, useEffect, useMemo, useState } from "react";

import { ApiError, api } from "../api";

type FieldType = "int" | "float" | "int_list" | "int_list_null" | "lines" | "text";

type Field = {
  key: string;
  label: string;
  type: FieldType;
  help?: string;
  min?: number;
  max?: number;
  value: unknown;
  default: unknown;
};

type Group = {
  id: string;
  label: string;
  description: string;
  fields: Field[];
};

type Catalog = {
  groups: Group[];
  values: Record<string, unknown>;
};

function formatForInput(field: Field, value: unknown): string {
  if (field.type === "lines") {
    return Array.isArray(value) ? value.join("\n") : String(value ?? "");
  }
  if (field.type === "int_list") {
    return Array.isArray(value) ? value.join(", ") : String(value ?? "");
  }
  if (field.type === "int_list_null") {
    if (!Array.isArray(value)) return String(value ?? "");
    return value.map((item) => (item === null || item === undefined ? "n" : String(item))).join(", ");
  }
  return value === null || value === undefined ? "" : String(value);
}

function parseInput(field: Field, raw: string): unknown {
  if (field.type === "lines") {
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  }
  if (field.type === "int_list") {
    return raw;
  }
  if (field.type === "int_list_null") {
    return raw;
  }
  if (field.type === "int") {
    return Number.parseInt(raw, 10);
  }
  if (field.type === "float") {
    return Number.parseFloat(raw);
  }
  return raw;
}

export function AdminSettingsPage() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(true);

  function applyCatalog(data: Catalog) {
    setCatalog(data);
    const next: Record<string, string> = {};
    for (const group of data.groups) {
      for (const field of group.fields) {
        next[field.key] = formatForInput(field, field.value);
      }
    }
    setDraft(next);
  }

  useEffect(() => {
    setLoading(true);
    api<Catalog>("/api/admin/settings/")
      .then((data) => {
        applyCatalog(data);
        setError("");
      })
      .catch(() => setError("Nastavitev ni bilo mogoče naložiti."))
      .finally(() => setLoading(false));
  }, []);

  const dirtyKeys = useMemo(() => {
    if (!catalog) return new Set<string>();
    const dirty = new Set<string>();
    for (const group of catalog.groups) {
      for (const field of group.fields) {
        if (draft[field.key] !== formatForInput(field, field.value)) dirty.add(field.key);
      }
    }
    return dirty;
  }, [catalog, draft]);

  async function onSave(event: FormEvent) {
    event.preventDefault();
    if (!catalog) return;
    setPending(true);
    setError("");
    setNotice("");
    try {
      const values: Record<string, unknown> = {};
      for (const group of catalog.groups) {
        for (const field of group.fields) {
          if (!dirtyKeys.has(field.key)) continue;
          values[field.key] = parseInput(field, draft[field.key] ?? "");
        }
      }
      const data = await api<Catalog>("/api/admin/settings/", {
        method: "PUT",
        body: JSON.stringify({ values }),
      });
      applyCatalog(data);
      setNotice("Shranjeno.");
    } catch (err) {
      if (err instanceof ApiError) {
        const detail = err.message;
        setError(typeof detail === "string" ? detail : "Shranjevanje ni uspelo.");
      } else {
        setError("Shranjevanje ni uspelo.");
      }
    } finally {
      setPending(false);
    }
  }

  async function onReset() {
    if (!window.confirm("Ponastavim vse nastavitve na privzete?")) return;
    setPending(true);
    setError("");
    setNotice("");
    try {
      const data = await api<Catalog>("/api/admin/settings/reset/", { method: "POST", body: "{}" });
      applyCatalog(data);
      setNotice("Ponastavljeno na privzeto.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Ponastavitev ni uspela.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="panel">
      <p className="eyebrow">Admin</p>
      <h1>Nastavitve iger</h1>
      <p className="fine admin-dash-lead">
        Spremembe veljajo za nove igre (obstoječe seje ohranijo svoje nastavitve). Seznami: števila loči z vejico; za
        neomejene preskoke uporabi <code>n</code>.
      </p>
      {loading && !catalog ? <p className="status">Nalagam…</p> : null}
      {error ? <p className="error">{error}</p> : null}
      {notice ? <p className="fine">{notice}</p> : null}

      {catalog ? (
        <form className="stack admin-settings" onSubmit={onSave}>
          {catalog.groups.map((group) => (
            <article key={group.id} className="admin-card admin-settings-group">
              <h2>{group.label}</h2>
              <p className="fine">{group.description}</p>
              <div className="admin-settings-fields">
                {group.fields.map((field) => {
                  const isLines = field.type === "lines";
                  const isDirty = dirtyKeys.has(field.key);
                  return (
                    <label key={field.key} className={isDirty ? "is-dirty" : undefined}>
                      <span>
                        {field.label}
                        {isDirty ? " ·" : ""}
                      </span>
                      {isLines ? (
                        <textarea
                          rows={Math.min(12, Math.max(4, (draft[field.key] || "").split("\n").length + 1))}
                          value={draft[field.key] ?? ""}
                          onChange={(event) =>
                            setDraft((current) => ({ ...current, [field.key]: event.target.value }))
                          }
                        />
                      ) : (
                        <input
                          type={field.type === "int" || field.type === "float" ? "number" : "text"}
                          min={field.min}
                          max={field.max}
                          step={field.type === "float" ? "any" : undefined}
                          value={draft[field.key] ?? ""}
                          onChange={(event) =>
                            setDraft((current) => ({ ...current, [field.key]: event.target.value }))
                          }
                        />
                      )}
                      {field.help ? <span className="fine">{field.help}</span> : null}
                    </label>
                  );
                })}
              </div>
            </article>
          ))}

          <div className="actions admin-settings-actions">
            <button className="primary" type="submit" disabled={pending || dirtyKeys.size === 0}>
              {pending ? "Shranjujem…" : "Shrani spremembe"}
            </button>
            <button type="button" disabled={pending} onClick={() => void onReset()}>
              Ponastavi na privzeto
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
