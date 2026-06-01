import { Navigate, Outlet } from "react-router-dom";
import { clearAuthUser, getAuthUser } from "../../utils/authStorage";
import { isJwtExpired } from "../../utils/jwt";

export default function PrivateRoute() {
  const authUser = getAuthUser();

  if (!authUser?.token || isJwtExpired(authUser.token)) {
    clearAuthUser();
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
