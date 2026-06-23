/**
 * 全局状态管理 — Zustand store
 *
 * 只存跨页面共享的状态（当前选中的客户/报告），页面级数据用组件内 useState
 */
import { create } from 'zustand';

interface AppState {
  customerId: number | null;
  setCustomerId: (id: number | null) => void;
  reportId: number | null;
  setReportId: (id: number | null) => void;
}

/** 全局 store：当前选中的客户 ID 和报告 ID */
export const useAppStore = create<AppState>((set) => ({
  customerId: null,
  setCustomerId: (id) => set({ customerId: id }),
  reportId: null,
  setReportId: (id) => set({ reportId: id }),
}));
