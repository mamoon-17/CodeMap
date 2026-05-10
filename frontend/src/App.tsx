import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import Query from "./pages/Query";
import "./App.css";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import OAuthCallback from "./pages/OAuthCallback";
import Dashboard from "./pages/Dashboard";
import UploadRepo from "./components/UploadRepo";

const ACTIVE_PROJECT_ID_KEY = "activeProjectId";

function RequireProject({ children }: { children: ReactNode }) {
  const projectId = localStorage.getItem(ACTIVE_PROJECT_ID_KEY);
  if (!projectId) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/oauth/callback" element={<OAuthCallback />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route
          path="/query"
          element={
            <RequireProject>
              <Query />
            </RequireProject>
          }
        />
        <Route path="/upload" element={<UploadRepo />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
