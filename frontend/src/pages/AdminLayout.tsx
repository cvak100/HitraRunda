import { NavLink, Outlet } from "react-router-dom";

export function AdminLayout() {
  return (
    <div className="admin-shell">
      <nav className="subnav">
        <NavLink to="/nadzor" end>
          Pregled
        </NavLink>
        <NavLink to="/nadzor/vsebina">Vsebina</NavLink>
        <NavLink to="/nadzor/vprasanja">Vprašanja</NavLink>
        <NavLink to="/nadzor/kategorije">Kategorije</NavLink>
        <NavLink to="/nadzor/bonusi">Bonusi</NavLink>
        <NavLink to="/nadzor/prijatelji">Prijatelji</NavLink>
        <NavLink to="/nadzor/pritozbe">Pritožbe</NavLink>
        <NavLink to="/nadzor/uporabniki">Uporabniki</NavLink>
        <NavLink to="/nadzor/igre">Igre</NavLink>
        <NavLink to="/nadzor/ukazi">Ukazi</NavLink>
      </nav>
      <Outlet />
    </div>
  );
}
