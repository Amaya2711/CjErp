import httpClient from "../../../api/httpClient";

export async function login(request: any) {
  const response = await httpClient.post("/Auth/login", request);
  return response.data;
}

export async function getCurrentUser() {
  const response = await httpClient.get("/auth/me");
  return response.data;
}