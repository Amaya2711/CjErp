import axios, { type AxiosInstance, type AxiosRequestConfig } from "axios";
import { getAuthUser, clearAuthUser } from "../utils/authStorage";

type HttpClient = {
  get<T>(url: string, config?: AxiosRequestConfig): Promise<T>;
  post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T>;
  put<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T>;
  delete<T>(url: string, config?: AxiosRequestConfig): Promise<T>;
};

const apiBaseUrl =
  import.meta.env.VITE_API_URL?.trim() || "http://localhost:5015/api";

const axiosClient: AxiosInstance = axios.create({
  baseURL: apiBaseUrl,
});

axiosClient.interceptors.request.use((config) => {
  const requestUrl = config.url?.toLowerCase() ?? "";

  if (requestUrl.includes("/auth/login")) {
    return config;
  }

  const authUser = getAuthUser();

  if (authUser?.token) {
    config.headers.Authorization = `Bearer ${authUser.token}`;
  }

  return config;
});

axiosClient.interceptors.response.use(
  (response) => {
    if (response?.data && typeof response.data === "object" && "data" in response.data) {
      return response.data.data;
    }

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
