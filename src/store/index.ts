import { create } from 'zustand';

interface AppState {
  customerId: number | null;
  setCustomerId: (id: number | null) => void;
  reportId: number | null;
  setReportId: (id: number | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  customerId: null,
  setCustomerId: (id) => set({ customerId: id }),
  reportId: null,
  setReportId: (id) => set({ reportId: id }),
}));
