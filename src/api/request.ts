/**
 * HTTP 请求封装 — 基于 Axios 实例，统一拦截器 + REST 方法
 *
 * 约定：
 * - baseURL 从环境变量 VITE_API_BASE_URL 注入
 * - 响应拦截器自动解包 res.data（即 API 层返回的是 ApiResponse 体，不是 AxiosResponse）
 * - 所有请求方法泛型 T 对应 ApiResponse.data 的类型
 */
import axios from 'axios';
import type { ApiResponse } from '../types';

/** Axios 实例，全局超时 30s */
const request = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 30000,
});

/** 响应拦截：成功时返回 res.data（ApiResponse），失败时打印日志 */
request.interceptors.response.use(
  (res) => res.data,
  (err) => {
    console.error('Request error:', err);
    return Promise.reject(err);
  }
);

/** GET 请求，params 自动拼接到 URL query string */
export async function get<T>(url: string, params?: any): Promise<ApiResponse<T>> {
  return request.get(url, { params });
}

/** POST 请求，data 作为请求体 JSON */
export async function post<T>(url: string, data?: any): Promise<ApiResponse<T>> {
  return request.post(url, data);
}

/** PUT 请求，data 作为请求体 JSON */
export async function put<T>(url: string, data?: any): Promise<ApiResponse<T>> {
  return request.put(url, data);
}

/** DELETE 请求 */
export async function del<T>(url: string): Promise<ApiResponse<T>> {
  return request.delete(url);
}

export default request;
