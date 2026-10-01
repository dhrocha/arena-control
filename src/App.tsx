import { Navigate, Route, Routes } from "react-router-dom";
import { DashboardPage } from "./client/dashboard/DashboardPage";
import { AdminPage } from "./client/admin/AdminPage";
import { ControlPage } from "./client/control/ControlPage";
import { ArenaPage } from "./client/arena/ArenaPage";
import { SetupPage } from "./client/setup/SetupPage";
import { SettingsPage } from "./client/settings/SettingsPage";
import { EffectsPage } from "./client/effects/EffectsPage";
import { SponsorsPage } from "./client/sponsors/SponsorsPage";

export function App() {
  return (
    <div className="app-shell">
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/control" element={<ControlPage />} />
        <Route path="/arena" element={<ArenaPage />} />
        <Route path="/setup" element={<SetupPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/effects" element={<EffectsPage />} />
        <Route path="/sponsors" element={<SponsorsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
