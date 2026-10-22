import { FormEvent, useEffect, useState } from "react";

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

export function AdminUsersPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [query, setQuery] = useState("");
  const [truncated, setTruncated] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function load(search: string) {
    const params = new URLSearchParams();
    if (search.trim()) params.set("q", search.trim());
    const data = await api<{ users: StaffUser[]; truncated: boolean }>(`/api/admin/users/?${params}`);
    setUsers(data.users);
    setTruncated(data.truncated);
  }

  useEffect(() => {
    load("").catch(() => setError("Uporabnikov ni bilo mogoče naložiti."));
  }, []);

  function onSearch(event: FormEvent) {
    event.preventDefault();
    setError("");
    load(query).catch(() => setError("Iskanje ni uspelo."));
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
      <form className="actions" onSubmit={onSearch}>
        <label>
          Išči
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <button type="submit" className="primary">
          Išči
        </button>
      </form>
      {truncated ? <p className="fine">Prikazanih je prvih 200 zadetkov. Zoži iskanje.</p> : null}
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Vzdevek</th>
              <th>E-pošta</th>
              <th>Vrsta</th>
              <th>Od</th>
              <th>Admin</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={5}>Ni zadetkov.</td>
              </tr>
            ) : null}
            {users.map((item) => (
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
                      {item.is_staff ? "Odstrani admina" : "Daj admina"}
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
