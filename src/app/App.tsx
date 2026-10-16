import { useEffect } from "react";
import { RouterProvider } from "react-router-dom";
import { StartPage } from "../pages/StartPage";
import { useGameStore } from "../state/gameStore";
import { router } from "./router";

export function App() {
  const initialized = useGameStore((state) => state.initialized);
  const hasGame = useGameStore((state) => state.game !== null);
  const language = useGameStore((state) => state.language);
  const init = useGameStore((state) => state.init);

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  if (!initialized) return null;
  return hasGame ? <RouterProvider router={router} future={{ v7_startTransition: true }} /> : <StartPage />;
}
