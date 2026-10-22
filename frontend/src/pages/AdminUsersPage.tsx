import { useEffect, useMemo, useState } from "react";

import { AdminToolbar, SortableTh } from "../components/AdminToolbar";
import { ApiError, api } from "../api";
import { useAuth } from "../auth";
import { formatWhen } from "../format";

type StaffUser = {
  id: number;
  nickname: string;
  email: string | null;
  is_guest: boolean;
  is_staff: boolean;
  created_at: string;
};

type SortKey = "nickname" | "email" | "is_guest" | "created_at" | "is_staff";

export function AdminUsersPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [truncated, setTruncated] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [sort, setSort] = useState<SortKey>("created_at");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");

  async function load(search: string) {
    const params = new URLSearchParams();
    if (search.trim()) params.set("q", search.trim());
    const data = await api<{ users: StaffUser[]; truncated: boolean }>(`/api/admin/users/?${params}`);
    setUsers(data.users);
    setTruncated(data.truncated);
  }

  useEffect(() => {
    load(submitted).catch(() => setError("Uporabnikov ni bilo mogoče naložiti."));
  }, [submitted]);

  const rows = useMemo(() => {
    const list = [...users];
    list.sort((a, b) => {
      let cmp = 0;
      if (sort === "created_at") cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      else if (sort === "is_guest" || sort === "is_staff") cmp = Number(a[sort]) - Number(b[sort]);
      else cmp = String(a[sort] ?? "").localeCompare(String(b[sort] ?? ""), "sl", { numeric: true });
      return direction === "asc" ? cmp : -cmp;
    });
    return list;
  }, [users, sort, direction]);

  function toggleSort(column: string) {
    const key = column as SortKey;
    if (sort === key) setDirection((current) => (current === "asc" ? "desc" : "asc"));
    else {
      setSort(key);
      setDirection(key === "created_at" || key === "is_staff" ? "desc" : "asc");
    }
  }

  async function setStaff(target: StaffUser, isStaff: boolean) {
    setError("");
    try {
      const result = await api<{ user: StaffUser }>(`/api/admin/users/${target.id}/`, {
        method: "POST",
        body: JSON.stringify({ is_staff: isStaff }),
      });
      setUsers((current) => current.map((item) => (item.id === target.id ? result.user : item)));
      setNotice(isStaff ? `${result.user.nickname || result.user.email} je admin.` : "Admin pravice so odvzete.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Pravic ni bilo mogoče spremeniti.");
    }
  }

  return (
    <section className="panel">
      <p className="eyebrow">Admin</p>
      <h1>Uporabniki</h1>
      <p className="fine">Admin je lahko samo registriran uporabnik. Svojih pravic si ne moreš odvzeti.</p>
      {notice ? <p className="fine">{notice}</p> : null}
      {error ? <p className="error">{error}</p> : null}
      <AdminToolbar query={query} onQueryChange={setQuery} onSearch={() => setSubmitted(query)} />
      {truncated ? <p className="fine">Prikazanih je prvih 200 zadetkov. Zoži iskanje.</p> : null}
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <SortableTh label="Vzdevek" column="nickname" sort={sort} direction={direction} onSort={toggleSort} />
              <SortableTh label="E-pošta" column="email" sort={sort} direction={direction} onSort={toggleSort} />
              <SortableTh label="Vrsta" column="is_guest" sort={sort} direction={direction} onSort={toggleSort} />
              <SortableTh label="Od" column="created_at" sort={sort} direction={direction} onSort={toggleSort} />
              <SortableTh label="Admin" column="is_staff" sort={sort} direction={direction} onSort={toggleSort} />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5}>Ni zadetkov.</td>
              </tr>
            ) : null}
            {rows.map((item) => (
              <tr key={item.id}>
                <td>{item.nickname || "—"}</td>
                <td>{item.email || "—"}</td>
                <td>{item.is_guest ? "Gost" : "Račun"}</td>
                <td>{formatWhen(item.created_at)}</td>
                <td>
                  {item.id === user?.id ? (
                    <span>To si ti</span>
                  ) : (
                    <button type="button" disabled={item.is_guest && !item.is_staff} onClick={() => void setStaff(item, !item.is_staff)}>
                      {item.is_staff ? "Odvzemi" : "Podeli"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
