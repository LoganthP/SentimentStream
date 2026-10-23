import { Monitor, Moon, Sun } from "lucide-react";
import { useAppState } from "../lib/AppState";

const MODES = [
  { id: "light", label: "Light", icon: Sun },
  { id: "system", label: "System", icon: Monitor },
  { id: "dark", label: "Dark", icon: Moon },
];

export default function ThemeToggle({ className = "" }) {
  const { theme, setTheme } = useAppState();

  return (
    <div
      role="group"
      aria-label="Theme mode selector"
      className={`neu-in flex items-center p-1 ${className}`}
    >
      {MODES.map(({ id, label, icon: Icon }) => {
        const active = theme === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => setTheme(id)}
            aria-pressed={active}
            title={`${label} mode`}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1 px-2 text-xs font-semibold transition-all duration-200 ${
              active
                ? "clay-white shadow-sm text-ink"
                : "text-ink-mute hover:text-ink hover:bg-white/20 dark:hover:bg-white/5"
            }`}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
