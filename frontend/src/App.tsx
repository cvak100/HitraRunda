import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AuthProvider } from "./auth";
import { Layout, RequireStaff, RequireUser } from "./components/Layout";
import { AdminSessionDetailPage, ResultPage } from "./components/SessionDetail";
import { AccountLayout } from "./pages/AccountLayout";
import { AdminActionsPage } from "./pages/AdminActionsPage";
import { AdminBonusesPage } from "./pages/AdminBonusesPage";
import { AdminCategoriesPage } from "./pages/AdminCategoriesPage";
import { AdminContentPage } from "./pages/AdminContentPage";
import { AdminFriendsPage } from "./pages/AdminFriendsPage";
import { AdminHomePage } from "./pages/AdminHomePage";
import { AdminLayout } from "./pages/AdminLayout";
import { AdminQuestionsPage } from "./pages/AdminQuestionsPage";
import { AdminReportsPage } from "./pages/AdminReportsPage";
import { AdminSessionsPage } from "./pages/AdminSessionsPage";
import { AdminUsersPage } from "./pages/AdminUsersPage";
import { GamePage } from "./pages/GamePage";
import { LogoutPage } from "./pages/LogoutPage";
import { HomePage } from "./pages/HomePage";
import { LeaderboardHubPage, LeaderboardPage } from "./pages/LeaderboardPage";
import { LoginPage } from "./pages/LoginPage";
import { PlayHubPage } from "./pages/PlayHubPage";
import { RegisterPage } from "./pages/RegisterPage";
import { SettingsPage } from "./pages/SettingsPage";
import { ProfilePage } from "./pages/ProfilePage";
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
            <Route path="lestvica" element={<LeaderboardHubPage />} />
            <Route path="lestvica/hitrarunda" element={<LeaderboardPage />} />
            <Route path="lestvica/ala-milijonar" element={<LeaderboardPage />} />
            <Route path="lestvica/rezultat/:resultId" element={<ResultPage />} />
            <Route path="lestvica/:resultId" element={<ResultPage />} />
            <Route element={<RequireUser />}>
              <Route path="igra" element={<PlayHubPage />} />
              <Route path="igra/hitrarunda" element={<SetupPage />} />
              <Route path="igra/ala-milijonar" element={<SetupPage />} />
              <Route path="igra/:code" element={<GamePage />} />
              <Route path="racun" element={<AccountLayout />}>
                <Route index element={<Navigate to="profil" replace />} />
                <Route path="profil" element={<ProfilePage />} />
                <Route path="nastavitve" element={<SettingsPage />} />
                <Route path="odjava" element={<LogoutPage />} />
              </Route>
            </Route>
            <Route element={<RequireStaff />}>
              <Route path="nadzor" element={<AdminLayout />}>
                <Route index element={<AdminHomePage />} />
                <Route path="vsebina" element={<AdminContentPage />} />
                <Route path="vprasanja" element={<AdminQuestionsPage />} />
                <Route path="kategorije" element={<AdminCategoriesPage />} />
                <Route path="bonusi" element={<AdminBonusesPage />} />
                <Route path="prijatelji" element={<AdminFriendsPage />} />
                <Route path="pritozbe" element={<AdminReportsPage />} />
                <Route path="uporabniki" element={<AdminUsersPage />} />
                <Route path="igre" element={<AdminSessionsPage />} />
                <Route path="igre/:sessionId" element={<AdminSessionDetailPage />} />
                <Route path="ukazi" element={<AdminActionsPage />} />
              </Route>
              <Route path="vprasanja" element={<Navigate to="/nadzor/vprasanja" replace />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
