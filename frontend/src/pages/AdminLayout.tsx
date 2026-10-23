import { NavLink, Outlet } from "react-router-dom";

export function AdminLayout() {
  return (
    <div className="admin-shell">
      <nav className="subnav">
        <NavLink to="/nadzor" end>
          Pregled
        </NavLink>
        <NavLink to="/nadzor/vsebina">Vsebina</NavLink>
        <NavLink to="/nadzor/sifranti">Šifranti</NavLink>
        <NavLink to="/nadzor/igre">Igre</NavLink>
        <NavLink to="/nadzor/sobe">Sobe</NavLink>
        <NavLink to="/nadzor/uporabniki">Uporabniki</NavLink>
        <NavLink to="/nadzor/ukazi">Ukazi</NavLink>
      </nav>
      <Outlet />
    </div>
  );
}
