import { clearAuthUser, getAuthUser } from "../../../utils/authStorage";
import { logout, sendLogoutBeacon } from "./authService";

export async function logoutSession(options?: { redirectToLogin?: boolean }) {
  const redirectToLogin = options?.redirectToLogin ?? true;
  const authUser = getAuthUser();

  try {
    await logout();
  } catch {
    if (authUser?.token) {
      sendLogoutBeacon(authUser.token);
    }
  } finally {
    clearAuthUser();

    if (redirectToLogin) {
      window.location.replace("/");
    }
  }
}
