import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";

const Ctx = createContext(null);
const KEY = "sentimentstream.selectedJob";
const THEME_KEY = "theme";

export function AppStateProvider({ children }) {
  const [jobs, setJobs] = useState([]);
  const [health, setHealth] = useState(null);
  const [apiError, setApiError] = useState(null);
  const [selectedId, setSelectedIdRaw] = useState(() => localStorage.getItem(KEY));
  const [results, setResults] = useState(null);
  const [resultsLoading, setResultsLoading] = useState(false);
  const prevStatus = useRef({});

  const [theme, setThemeState] = useState(() => {
    try {
      return localStorage.getItem(THEME_KEY) || "system";
    } catch {
      return "system";
    }
  });

  const [systemDark, setSystemDark] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e) => setSystemDark(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  const isDark = theme === "dark" || (theme === "system" && systemDark);

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [isDark]);

  const setTheme = useCallback((nextTheme) => {
    setThemeState(nextTheme);
    try {
      localStorage.setItem(THEME_KEY, nextTheme);
    } catch {}
  }, []);

  const setSelectedId = useCallback((id) => {
    setSelectedIdRaw(id);
    if (id) localStorage.setItem(KEY, id);
  }, []);

  const refreshJobs = useCallback(async () => {
    try {
      const list = await api.jobs();
      setJobs(list);
      setApiError(null);
      // Auto-select an analysis that just finished
      for (const j of list) {
        const before = prevStatus.current[j.id];
        if (j.kind === "analysis" && j.status === "completed" && before && before !== "completed") {
          setSelectedId(j.id);
        }
        prevStatus.current[j.id] = j.status;
      }
      return list;
    } catch (e) {
      setApiError(e.message);
      return [];
    }
  }, [setSelectedId]);

  useEffect(() => {
    api.health().then(setHealth).catch((e) => setApiError(e.message));
    refreshJobs();
  }, [refreshJobs]);

  const active = jobs.some((j) => j.status === "running" || j.status === "queued");
  useEffect(() => {
    const t = setInterval(() => {
      refreshJobs();
      if (active) api.health().then(setHealth).catch(() => {});
    }, active ? 2000 : 15000);
    return () => clearInterval(t);
  }, [active, refreshJobs]);

  const analyses = useMemo(() => jobs.filter((j) => j.kind === "analysis"), [jobs]);
  const viewable = useMemo(() => analyses.filter((j) => j.status === "completed" || j.status === "running"), [analyses]);
  const completed = useMemo(() => analyses.filter((j) => j.status === "completed"), [analyses]);

  // Default selection: latest running or completed analysis
  useEffect(() => {
    if (!viewable.length) return;
    if (!selectedId || !viewable.find((j) => j.id === selectedId)) {
      setSelectedId(viewable[0].id);
    }
  }, [viewable, selectedId, setSelectedId]);

  useEffect(() => {
    const job = viewable.find((j) => j.id === selectedId);
    if (!job) { setResults(null); return; }

    let isSubscribed = true;
    const fetchResults = () => {
      api.results(selectedId)
        .then((res) => {
          if (isSubscribed) setResults(res);
        })
        .catch(() => {
          // If running and no partial result written yet, keep waiting
        });
    };

    fetchResults();

    // If job is actively running, poll results frequently for progressive updates
    if (job.status === "running") {
      const interval = setInterval(fetchResults, 1500);
      return () => {
        isSubscribed = false;
        clearInterval(interval);
      };
    }
    return () => { isSubscribed = false; };
  }, [selectedId, viewable]);

  const renameJob = useCallback(async (jobId, newName) => {
    let rollbackJobs;
    setJobs((prev) => {
      rollbackJobs = prev;
      return prev.map((j) => (j.id === jobId ? { ...j, name: newName } : j));
    });
    setResults((prev) =>
      prev && (prev.job_id === jobId || prev.id === jobId)
        ? { ...prev, name: newName, job_name: newName }
        : prev
    );
    try {
      const updated = await api.renameJob(jobId, newName);
      setJobs((prev) => prev.map((j) => (j.id === jobId ? { ...j, ...updated } : j)));
      return updated;
    } catch (err) {
      if (rollbackJobs) setJobs(rollbackJobs);
      throw err;
    }
  }, []);

  const onDatasetRenamed = useCallback((datasetId, newName) => {
    setJobs((prev) =>
      prev.map((j) => (j.dataset_id === datasetId ? { ...j, dataset_name: newName } : j))
    );
    setResults((prev) => {
      if (!prev) return prev;
      if (prev.dataset && prev.dataset.id === datasetId) {
        return { ...prev, dataset: { ...prev.dataset, name: newName } };
      }
      return prev;
    });
  }, []);

  const value = {
    jobs, analyses, completed, refreshJobs, health, apiError,
    selectedId, setSelectedId, results, resultsLoading,
    theme, setTheme, isDark,
    renameJob, onDatasetRenamed,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAppState = () => useContext(Ctx);
