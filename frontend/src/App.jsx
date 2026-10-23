import { MotionConfig } from "framer-motion";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import Layout from "./components/Layout";
import { AppStateProvider } from "./lib/AppState";
import Data from "./pages/Data";
import Landing from "./pages/Landing";
import Model from "./pages/Model";
import Overview from "./pages/Overview";
import Performance from "./pages/Performance";
import Posts from "./pages/Posts";
import Reports from "./pages/Reports";
import Trends from "./pages/Trends";

function RedirectWithSearch({ to }) {
  const location = useLocation();
  return <Navigate to={`${to}${location.search}`} replace />;
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <AppStateProvider>
        <BrowserRouter>
          <Routes>
            {/* Landing page at / */}
            <Route path="/" element={<Landing />} />

            {/* Existing SentimentStream app moved to /app */}
            <Route path="/app" element={<Layout />}>
              <Route index element={<Overview />} />
              <Route path="data" element={<Data />} />
              <Route path="trends" element={<Trends />} />
              <Route path="posts" element={<Posts />} />
              <Route path="model" element={<Model />} />
              <Route path="performance" element={<Performance />} />
              <Route path="reports" element={<Reports />} />
              <Route path="*" element={<Navigate to="/app" replace />} />
            </Route>

            {/* Redirects from legacy paths to /app/... preserving query parameters */}
            <Route path="/overview" element={<RedirectWithSearch to="/app" />} />
            <Route path="/data" element={<RedirectWithSearch to="/app/data" />} />
            <Route path="/trends" element={<RedirectWithSearch to="/app/trends" />} />
            <Route path="/posts" element={<RedirectWithSearch to="/app/posts" />} />
            <Route path="/model" element={<RedirectWithSearch to="/app/model" />} />
            <Route path="/performance" element={<RedirectWithSearch to="/app/performance" />} />
            <Route path="/reports" element={<RedirectWithSearch to="/app/reports" />} />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AppStateProvider>
    </MotionConfig>
  );
}
