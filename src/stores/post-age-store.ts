import { create } from "zustand";

export const usePostAgeStore = create(() => ({ now: Date.now() }));
