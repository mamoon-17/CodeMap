import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Query from "./pages/Query";
import "./App.css";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/query" replace />} />
        <Route path="/query" element={<Query />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
