import { NavLink, Outlet } from "react-router-dom";

export function AdminContentLayout() {
  return (
    <div className="content-shell">
      <div className="tabs content-tabs" role="tablist" aria-label="Vsebina">
        <NavLink to="/nadzor/vsebina" end role="tab">
          Pregled
        </NavLink>
        <NavLink to="/nadzor/vsebina/vprasanja" role="tab">
          Vprašanja
        </NavLink>
        <NavLink to="/nadzor/vsebina/pritozbe" role="tab">
          Pritožbe
        </NavLink>
      </div>
      <Outlet />
    </div>
  );
}
