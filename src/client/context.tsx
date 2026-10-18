import { createContext, useContext, type ReactNode } from "react";
import type { World } from "../shared/model";
export interface AppContextValue {
  world: World;
  mutate: <T = any>(path: string, body: unknown) => Promise<T>;
  open: (title: string, body: ReactNode) => void;
  close: () => void;
  toast: (message: string) => void;
  dark: boolean;
}
export const AppContext = createContext<AppContextValue | null>(null);
export const useApp = () => {
  const value = useContext(AppContext);
  if (!value) throw new Error("App context missing");
  return value;
};
