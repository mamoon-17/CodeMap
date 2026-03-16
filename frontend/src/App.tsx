import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Query from "./pages/Query";
import "./App.css";
import UploadRepo from "./components/UploadRepo";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Dashboard from "./pages/Dashboard";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/query" element={<Query />} />
        <Route path="/upload" element={<UploadRepo />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
