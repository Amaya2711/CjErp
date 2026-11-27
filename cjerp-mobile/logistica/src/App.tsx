import { Navigate, Route, Routes } from "react-router-dom";
import { RequireAuth } from "@cjerp/shared";
import LoginPage from "./pages/LoginPage";
import DespachosPage from "./pages/DespachosPage";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <DespachosPage />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
