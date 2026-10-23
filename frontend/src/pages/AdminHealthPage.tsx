import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { ApiError, api } from "../api";
import { formatWhen } from "../format";

type RedisSnapshot = {
  at: string;
  ping_ms?: number | null;
  used_memory_human?: string;
  used_memory?: number;
  connected_clients?: number;
  ops_per_sec?: number;
  dbsize?: number;
  hit_rate_pct?: number | null;
};

type HealthPayload = {
  generated_at: string;
  ok: boolean;
  db: {
    ok: boolean;
    detail: string;
    engine?: string;
    name?: string;
    host?: string;
    version?: string;
  };
  redis: {
    ok: boolean;
    detail: string;
    url?: string;
    ping_ms?: number | null;
    used_for?: string[];
    info?: Record<string, string | number | null | undefined>;
    stats?: { hit_rate_pct?: number | null; dbsize?: number };
    keyspace?: Record<string, unknown>;
    channels?: { ok?: boolean; backend?: string; send_ok?: boolean; detail?: string };
    history?: RedisSnapshot[];
  };
  django_cache?: { ok: boolean; detail: string; backend?: string };
};

function InfoRows({ rows }: { rows: [string, string | number | null | undefined][] }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label}>
              <th style={{ width: "40%", textAlign: "left" }}>{label}</th>
              <td>{value === null || value === undefined || value === "" ? "—" : String(value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AdminHealthPage() {
  const [data, setData] = useState<HealthPayload | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    api<HealthPayload>("/api/admin/health/?detail=1")
      .then((payload) => {
        setData(payload);
        setError("");
      })
      .catch(() => setError("Health podatkov ni bilo mogoče naložiti."))
      .finally(() => setLoading(false));
  }

  async function clearHistory() {
    if (!window.confirm("Izbrišem shranjene Redis snapshote?")) return;
    try {
      const result = await api<{ detail: string }>("/api/admin/health/", { method: "DELETE" });
      setNotice(result.detail);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Brisanje zgodovine ni uspelo.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  const redis = data?.redis;
  const info = redis?.info || {};
  const history = redis?.history || [];

  return (
    <section className="panel">
      <p className="eyebrow">Admin · Ops</p>
      <h1>Health</h1>
      <p className="fine admin-dash-lead">
        Stanje baze in Redis (WebSocket channel layer). Redis sam nima časovne zgodovine — ob vsakem
        osvežitvi shranimo snapshot (do ~96). <Link to="/nadzor">Nazaj na pregled</Link>
      </p>
      <div className="actions" style={{ marginBottom: 16 }}>
        <button type="button" className="primary" disabled={loading} onClick={load}>
          {loading ? "Osvežujem…" : "Osveži"}
        </button>
        <button type="button" disabled={loading || history.length === 0} onClick={() => void clearHistory()}>
          Počisti zgodovino
        </button>
      </div>
      {notice ? <p className="fine">{notice}</p> : null}
      {error ? <p className="error">{error}</p> : null}
      {data ? (
        <>
          <p className="fine">
            Skupaj: <strong className={data.ok ? undefined : "is-warn"}>{data.ok ? "OK" : "Težava"}</strong>
            {data.generated_at ? ` · ${formatWhen(data.generated_at)}` : ""}
          </p>

          <article className="admin-card">
            <h2>PostgreSQL</h2>
            <InfoRows
              rows={[
                ["Status", data.db.ok ? "OK" : "FAIL"],
                ["Podrobnost", data.db.detail],
                ["Engine", data.db.engine],
                ["Ime", data.db.name],
                ["Host", data.db.host],
                ["Verzija", data.db.version],
              ]}
            />
          </article>

          <article className="admin-card" style={{ marginTop: 16 }}>
            <h2>Redis</h2>
            <p className="fine">Uporaba: {(redis?.used_for || []).join(", ") || "channels"}</p>
            <InfoRows
              rows={[
                ["Status", redis?.ok ? "OK" : "FAIL"],
                ["Podrobnost", redis?.detail],
                ["URL", redis?.url],
                ["PING", redis?.ping_ms != null ? `${redis.ping_ms} ms` : "—"],
                ["Verzija", info.redis_version],
                ["Način", info.redis_mode],
                ["Vloga", info.role],
                ["Port", info.tcp_port],
                ["OS", info.os],
                ["Uptime (dni)", info.uptime_in_days],
                ["Uptime (s)", info.uptime_in_seconds],
                ["Povezani odjemalci", info.connected_clients],
                ["Blocked clients", info.blocked_clients],
                ["Spomin", info.used_memory_human],
                ["Peak spomin", info.used_memory_peak_human],
                ["RSS", info.used_memory_rss_human],
                ["Fragmentacija", info.mem_fragmentation_ratio],
                ["Sistemski spomin", info.total_system_memory_human],
                ["Maxmemory", info.maxmemory_human],
                ["Eviction policy", info.maxmemory_policy],
                ["Ops/s", info.instantaneous_ops_per_sec],
                ["Keyspace hits", info.keyspace_hits],
                ["Keyspace misses", info.keyspace_misses],
                ["Hit rate", redis?.stats?.hit_rate_pct != null ? `${redis.stats.hit_rate_pct} %` : "—"],
                ["Ključi (dbsize)", redis?.stats?.dbsize],
                ["Expired keys", info.expired_keys],
                ["Evicted keys", info.evicted_keys],
              ]}
            />
            {redis?.keyspace && Object.keys(redis.keyspace).length > 0 ? (
              <>
                <h3 style={{ marginTop: 16 }}>Keyspace</h3>
                <InfoRows
                  rows={Object.entries(redis.keyspace).map(([key, value]) => [
                    key,
                    typeof value === "object" ? JSON.stringify(value) : String(value),
                  ])}
                />
              </>
            ) : null}
            {redis?.channels ? (
              <>
                <h3 style={{ marginTop: 16 }}>Channels (Django)</h3>
                <InfoRows
                  rows={[
                    ["OK", redis.channels.ok ? "da" : "ne"],
                    ["Backend", redis.channels.backend],
                    ["Podrobnost", redis.channels.detail || "—"],
                  ]}
                />
              </>
            ) : null}

            <h3 style={{ marginTop: 16 }}>Zgodovina snapshotov</h3>
            <p className="fine">
              Vsak klik „Osveži“ (ali odprtje strani) doda vrstico. Ni zamenjava za Prometheus — le
              hiter pregled trenda.
            </p>
            {history.length === 0 ? (
              <p className="fine">Še ni snapshotov.</p>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Kdaj</th>
                      <th>PING</th>
                      <th>Spomin</th>
                      <th>Odjemalci</th>
                      <th>Ops/s</th>
                      <th>Ključi</th>
                      <th>Hit %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((row) => (
                      <tr key={row.at}>
                        <td>{formatWhen(row.at)}</td>
                        <td>{row.ping_ms != null ? `${row.ping_ms} ms` : "—"}</td>
                        <td>{row.used_memory_human || "—"}</td>
                        <td>{row.connected_clients ?? "—"}</td>
                        <td>{row.ops_per_sec ?? "—"}</td>
                        <td>{row.dbsize ?? "—"}</td>
                        <td>{row.hit_rate_pct != null ? `${row.hit_rate_pct}` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </article>

          {data.django_cache ? (
            <article className="admin-card" style={{ marginTop: 16 }}>
              <h2>Django cache</h2>
              <p className="fine">To ni nujno Redis — lokalni cache je OK za admin teste.</p>
              <InfoRows
                rows={[
                  ["Status", data.django_cache.ok ? "OK" : "FAIL"],
                  ["Backend", data.django_cache.backend],
                  ["Podrobnost", data.django_cache.detail],
                ]}
              />
            </article>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
