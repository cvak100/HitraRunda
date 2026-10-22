import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AuthProvider } from "./auth";
import { Layout, RequireStaff, RequireUser } from "./components/Layout";
import { AdminSessionDetailPage, ResultPage } from "./components/SessionDetail";
import { AccountLayout } from "./pages/AccountLayout";
import { AdminHomePage } from "./pages/AdminHomePage";
import { AdminLayout } from "./pages/AdminLayout";
import { AdminQuestionsPage } from "./pages/AdminQuestionsPage";
import { AdminReportsPage } from "./pages/AdminReportsPage";
import { AdminSessionsPage } from "./pages/AdminSessionsPage";
import { AdminUsersPage } from "./pages/AdminUsersPage";
import { GamePage } from "./pages/GamePage";
import { LogoutPage } from "./pages/LogoutPage";
import { HomePage } from "./pages/HomePage";
import { LeaderboardPage } from "./pages/LeaderboardPage";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SetupPage } from "./pages/SetupPage";

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path="prijava" element={<LoginPage />} />
            <Route path="registracija" element={<RegisterPage />} />
            <Route path="lestvica" element={<LeaderboardPage />} />
            <Route path="lestvica/:resultId" element={<ResultPage />} />
            <Route element={<RequireUser />}>
              <Route path="igra" element={<SetupPage />} />
              <Route path="igra/:code" element={<GamePage />} />
              <Route path="racun" element={<AccountLayout />}>
                <Route index element={<Navigate to="nastavitve" replace />} />
                <Route path="nastavitve" element={<SettingsPage />} />
                <Route path="odjava" element={<LogoutPage />} />
              </Route>
            </Route>
            <Route element={<RequireStaff />}>
              <Route path="nadzor" element={<AdminLayout />}>
                <Route index element={<AdminHomePage />} />
                <Route path="vprasanja" element={<AdminQuestionsPage />} />
                <Route path="pritozbe" element={<AdminReportsPage />} />
                <Route path="uporabniki" element={<AdminUsersPage />} />
                <Route path="igre" element={<AdminSessionsPage />} />
                <Route path="igre/:sessionId" element={<AdminSessionDetailPage />} />
              </Route>
              <Route path="vprasanja" element={<Navigate to="/nadzor/vprasanja" replace />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
