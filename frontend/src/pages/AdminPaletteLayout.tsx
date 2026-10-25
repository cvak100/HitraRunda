import { NavLink, Outlet } from "react-router-dom";

export function AdminPaletteLayout() {
  return (
    <div className="content-shell">
      <div className="tabs content-tabs" role="tablist" aria-label="Paleta">
        <NavLink to="/nadzor/paleta" end role="tab">
          UI
        </NavLink>
        <NavLink to="/nadzor/paleta/zvok" role="tab">
          Zvok
        </NavLink>
      </div>
      <Outlet />
    </div>
  );
}
