import axios, { type AxiosInstance, type AxiosRequestConfig } from "axios";
import { getAuthUser, clearAuthUser } from "../utils/authStorage";
import { isJwtExpired } from "../utils/jwt";

type HttpClient = {
  get<T>(url: string, config?: AxiosRequestConfig): Promise<T>;
  post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T>;
  put<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T>;
  delete<T>(url: string, config?: AxiosRequestConfig): Promise<T>;
};

const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();
const apiBaseUrl =
  configuredApiUrl || (import.meta.env.DEV ? "http://localhost:5015/api" : "/api");
//const apiBaseUrl =
//configuredApiUrl || "https://cjerp-production.up.railway.app/api";

const axiosClient: AxiosInstance = axios.create({
  baseURL: apiBaseUrl,
  timeout: 30000,
});

axiosClient.interceptors.request.use((config) => {
  const requestUrl = config.url?.toLowerCase() ?? "";

  if (requestUrl.includes("/auth/login")) {
    return config;
  }

  const authUser = getAuthUser();

  if (authUser?.token) {
    if (isJwtExpired(authUser.token)) {
      clearAuthUser();
      window.location.replace("/");
      return Promise.reject(new axios.CanceledError("JWT expirado."));
    }

    config.headers.Authorization = `Bearer ${authUser.token}`;
  }

  return config;
});

axiosClient.interceptors.response.use(
  (response) => {
    if (response?.data && typeof response.data === "object") {
      const payload = response.data as {
        success?: boolean;
        message?: string;
        data?: unknown;
      };

      if (typeof payload.success === "boolean") {
        if (!payload.success) {
          return Promise.reject(new Error(payload.message || "La operación no fue completada por el servidor."));
        }

        return payload.data;
      }

      if ("data" in payload) {
        return payload.data;
      }
    }

    return response.data;
  },
  (error) => {
    if (error?.response?.data) {
      console.error("[httpClient] Error response", error.response.data);
    }

    if (error?.response?.status === 401) {
      clearAuthUser();
      window.location.replace("/");
    }

    return Promise.reject(error);
  }
);

const httpClient: HttpClient = {
  get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return axiosClient.get(url, config) as unknown as Promise<T>;
  },
  post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    return axiosClient.post(url, data, config) as unknown as Promise<T>;
  },
  put<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    return axiosClient.put(url, data, config) as unknown as Promise<T>;
  },
  delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return axiosClient.delete(url, config) as unknown as Promise<T>;
  },
};

export default httpClient;
