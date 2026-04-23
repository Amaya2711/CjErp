import axios from "axios";
import { getAuthUser, clearAuthUser } from "../utils/authStorage";

const apiBaseUrl =
  import.meta.env.VITE_API_URL?.trim() || "http://localhost:5015/api";

const httpClient = axios.create({
  baseURL: apiBaseUrl,
});

httpClient.interceptors.request.use((config) => {
  const requestUrl = config.url?.toLowerCase() ?? "";

  // En login no enviar token
  if (requestUrl.includes("/auth/login")) {
    return config;
  }

  const authUser = getAuthUser();

  if (authUser?.token) {
    config.headers.Authorization = `Bearer ${authUser.token}`;
  }

  return config;
});


// Interceptor para devolver siempre response.data.data si existe, o response.data
httpClient.interceptors.response.use(
  (response) => {
    // Si la respuesta tiene el formato estándar { data, ... }, devolver el objeto completo
    if (response?.data && typeof response.data === 'object' && 'data' in response.data) {
      return response.data; // Devuelve { message, data }
    }
    // Si no, devolver el body completo
    return response.data;
  },
  (error) => {
    if (error?.response?.status === 401) {
      clearAuthUser();
      window.location.href = "/";
    }
    return Promise.reject(error);
  }
);

export default httpClient;