import { useEffect, useMemo, useState } from "react";

import { AdminToolbar, SortableTh } from "../components/AdminToolbar";
import { ConfirmModal } from "../components/ConfirmModal";
import { ApiError, api } from "../api";
import { formatWhen } from "../format";

type AdminRoom = {
  code: string;
  name: string;
  status: string;
  visibility?: string;
  member_count: number;
  max_players: number;
  host_nickname?: string;
  last_activity?: string;
  created_at?: string;
  close_reason?: string;
  settings?: { mode?: string; question_count?: number; time_limit_seconds?: number; bot_count?: number };
  members?: { id: string; nickname: string; is_host?: boolean; is_bot?: boolean }[];
};

const STATUS: Record<string, string> = {
  waiting: "Čakanje",
  playing: "V teku",
  finished: "Končana",
  closed: "Zaprta",
};

type SortKey = "code" | "status" | "member_count" | "last_activity" | "host_nickname";

export function AdminRoomsPage() {
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [rooms, setRooms] = useState<AdminRoom[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [sort, setSort] = useState<SortKey>("last_activity");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [pending, setPending] = useState("");
  const [pendingClose, setPendingClose] = useState("");
  const [pendingKick, setPendingKick] = useState<{ code: string; memberId: string; nick: string } | null>(null);

  function load() {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    api<{ rooms: AdminRoom[] }>(`/api/admin/rooms/?${params}`)
      .then((data) => setRooms(data.rooms))
      .catch(() => setError("Sob ni bilo mogoče naložiti."));
  }

  useEffect(() => {
    load();
  }, [statusFilter]);

  const rows = useMemo(() => {
    const q = submitted.trim().toLowerCase();
    let list = rooms.filter(
      (item) =>
        !q ||
        item.code.toLowerCase().includes(q) ||
        (item.name || "").toLowerCase().includes(q) ||
        (item.host_nickname || "").toLowerCase().includes(q),
    );
    list = [...list].sort((a, b) => {
      let cmp = 0;
      if (sort === "last_activity") {
        cmp = new Date(a.last_activity || 0).getTime() - new Date(b.last_activity || 0).getTime();
      } else if (sort === "member_count") {
        cmp = a.member_count - b.member_count;
      } else {
        cmp = String(a[sort] ?? "").localeCompare(String(b[sort] ?? ""), "sl", { numeric: true });
      }
      return direction === "asc" ? cmp : -cmp;
    });
    return list;
  }, [rooms, submitted, sort, direction]);

  function toggleSort(column: string) {
    const key = column as SortKey;
    if (sort === key) setDirection((current) => (current === "asc" ? "desc" : "asc"));
    else {
      setSort(key);
      setDirection(key === "last_activity" || key === "member_count" ? "desc" : "asc");
    }
  }

  async function closeRoom(code: string) {
    setPending(code);
    setPendingClose("");
    setError("");
    try {
      await api(`/api/admin/rooms/${code}/close/`, { method: "POST", body: "{}" });
      setNotice(`Soba ${code} je zaprta.`);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Zapiranje ni uspelo.");
    } finally {
      setPending("");
    }
  }

  async function kickMember(code: string, memberId: string) {
    setPending(`${code}:${memberId}`);
    setPendingKick(null);
    setError("");
    try {
      const result = await api<{ detail: string }>(`/api/admin/rooms/${code}/kick/`, {
        method: "POST",
        body: JSON.stringify({ member_id: memberId }),
      });
      setNotice(result.detail);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Kick ni uspel.");
    } finally {
      setPending("");
    }
  }

  return (
    <section className="panel">
      <p className="eyebrow">Admin</p>
      <h1>Sobe</h1>
      <p className="fine">Čakanje in igre v teku lahko zapreš. Nedejavne sobe se same zaprejo po 1 uri.</p>
      {notice ? <p className="fine">{notice}</p> : null}
      {error ? <p className="error">{error}</p> : null}
      <AdminToolbar query={query} onQueryChange={setQuery} onSearch={() => setSubmitted(query)} />
      <div className="choices" role="group" aria-label="Filter stanja">
        {[
          ["", "Vse"],
          ["waiting", "Čakanje"],
          ["playing", "V teku"],
          ["closed", "Zaprte"],
          ["finished", "Končane"],
        ].map(([value, label]) => (
          <button key={value || "all"} type="button" className={statusFilter === value ? "is-on" : ""} onClick={() => setStatusFilter(value)}>
            {label}
          </button>
        ))}
      </div>
      <p className="fine">{rows.length} sob</p>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <SortableTh label="Koda" column="code" sort={sort} direction={direction} onSort={toggleSort} />
              <SortableTh label="Host" column="host_nickname" sort={sort} direction={direction} onSort={toggleSort} />
              <SortableTh label="Stanje" column="status" sort={sort} direction={direction} onSort={toggleSort} />
              <SortableTh label="Igralci" column="member_count" sort={sort} direction={direction} onSort={toggleSort} />
              <SortableTh label="Aktivnost" column="last_activity" sort={sort} direction={direction} onSort={toggleSort} />
              <th>Dejanja</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6}>Ni sob.</td>
              </tr>
            ) : null}
            {rows.map((room) => (
              <tr key={room.code}>
                <td>
                  <strong>{room.code}</strong>
                  {room.name ? <div className="fine">{room.name}</div> : null}
                </td>
                <td>{room.host_nickname || "—"}</td>
                <td>
                  {STATUS[room.status] || room.status}
                  {room.close_reason ? <div className="fine">{room.close_reason}</div> : null}
                </td>
                <td>
                  {room.member_count}/{room.max_players}
                  {room.settings?.bot_count ? ` · ${room.settings.bot_count} AI` : ""}
                  {room.members?.length ? (
                    <div className="fine" style={{ marginTop: 6 }}>
                      {room.members.map((member) => (
                        <div key={member.id}>
                          {member.nickname}
                          {member.is_host ? " (host)" : ""}
                          {member.is_bot ? " · AI" : ""}
                          {!member.is_host && (room.status === "waiting" || room.status === "playing") ? (
                            <>
                              {" "}
                              <button
                                type="button"
                                className="table-action"
                                disabled={pending === `${room.code}:${member.id}`}
                                onClick={() =>
                                  setPendingKick({
                                    code: room.code,
                                    memberId: member.id,
                                    nick: member.nickname,
                                  })
                                }
                              >
                                Kick
                              </button>
                            </>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </td>
                <td>{room.last_activity ? formatWhen(room.last_activity) : "—"}</td>
                <td>
                  {room.status === "waiting" || room.status === "playing" ? (
                    <button type="button" disabled={pending === room.code} onClick={() => setPendingClose(room.code)}>
                      Zapri
                    </button>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ConfirmModal
        open={Boolean(pendingClose)}
        title="Zapri sobo"
        message={pendingClose ? `Zaprem sobo ${pendingClose}?` : ""}
        confirmLabel="Zapri"
        danger
        onConfirm={() => {
          if (pendingClose) void closeRoom(pendingClose);
        }}
        onCancel={() => setPendingClose("")}
      />
      <ConfirmModal
        open={Boolean(pendingKick)}
        title="Kick igralca"
        message={pendingKick ? `Odstranim ${pendingKick.nick} iz ${pendingKick.code}?` : ""}
        confirmLabel="Kick"
        danger
        onConfirm={() => {
          if (pendingKick) void kickMember(pendingKick.code, pendingKick.memberId);
        }}
        onCancel={() => setPendingKick(null)}
      />
    </section>
  );
}
