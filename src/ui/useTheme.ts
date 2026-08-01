import { useCallback, useEffect, useState } from "react";

export type Theme = "classic" | "retro";

const STORAGE_KEY = "battleship:theme";

function initialTheme(): Theme {
  if (typeof localStorage === "undefined") return "classic";
  return localStorage.getItem(STORAGE_KEY) === "retro" ? "retro" : "classic";
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, theme);
    document.body.dataset.theme = theme;
  }, [theme]);

  const toggleTheme = useCallback(
    () => setTheme((current) => (current === "classic" ? "retro" : "classic")),
    [],
  );

  return { theme, toggleTheme };
}
