import { useEffect, useState } from "react";
import { RouterProvider } from "react-router-dom";
import { InstructorReviewPage } from "../pages/InstructorReviewPage";
import { StartPage } from "../pages/StartPage";
import { useGameStore } from "../state/gameStore";
import { isInstructorHash } from "./navigation";
import { router } from "./router";

export function App() {
  const initialized = useGameStore((state) => state.initialized);
  const hasGame = useGameStore((state) => state.game !== null);
  const language = useGameStore((state) => state.language);
  const init = useGameStore((state) => state.init);
  const [instructor, setInstructor] = useState(isInstructorHash);

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    const onHashChange = () => setInstructor(isInstructorHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  if (!initialized) return null;
  // The instructor view works without an active game and never touches it.
  if (instructor) {
    return (
      <InstructorReviewPage
        onBack={() => {
          window.location.hash = "#/";
          setInstructor(false);
        }}
      />
    );
  }
  return hasGame ? <RouterProvider router={router} future={{ v7_startTransition: true }} /> : <StartPage />;
}
