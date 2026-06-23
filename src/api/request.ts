import axios from 'axios';
import type { ApiResponse } from '../types';

const request = axios.create({
  baseURL: 'http://localhost:8080/api',
  timeout: 30000,
});

request.interceptors.response.use(
  (res) => res.data,
  (err) => {
    console.error('Request error:', err);
    return Promise.reject(err);
  }
);

export async function get<T>(url: string, params?: any): Promise<ApiResponse<T>> {
  return request.get(url, { params });
}

export async function post<T>(url: string, data?: any): Promise<ApiResponse<T>> {
  return request.post(url, data);
}

export async function put<T>(url: string, data?: any): Promise<ApiResponse<T>> {
  return request.put(url, data);
}

export async function del<T>(url: string): Promise<ApiResponse<T>> {
  return request.delete(url);
}

export default request;
