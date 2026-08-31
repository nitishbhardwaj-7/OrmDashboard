import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { api } from "../api/client";

export function Layout() {
  const [health, setHealth] = useState<{ apifyConfigured: boolean; aiConfigured: boolean } | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth(null));
  }, []);

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    if (searchTerm.trim()) navigate(`/search?q=${encodeURIComponent(searchTerm.trim())}`);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h1>
          ORM <span>Dashboard</span>
        </h1>
        <NavLink to="/" end className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
          Overview
        </NavLink>
        <NavLink to="/explorer" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
          Posts &amp; Comments
        </NavLink>
        <NavLink to="/manual-scraper" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
          Manual Scraper
        </NavLink>
        <NavLink to="/google-scraper" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
          Google Scraper
        </NavLink>
        <NavLink to="/negative" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
          Negative Mentions
        </NavLink>
        <NavLink to="/positive" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
          Positive Mentions
        </NavLink>
        <NavLink to="/failed" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
          Failed / Retry
        </NavLink>
        <NavLink to="/settings" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
          Settings
        </NavLink>

        <form onSubmit={submitSearch} style={{ marginTop: 18, padding: "0 8px" }}>
          <input
            type="text"
            placeholder="Search everything…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ width: "100%" }}
          />
        </form>

        <div style={{ marginTop: "auto", padding: "10px 8px", fontSize: 11, color: "var(--text-dim)" }}>
          {health && !health.apifyConfigured && <div style={{ color: "#ffb4bd" }}>⚠ Apify not configured</div>}
          {health && !health.aiConfigured && <div style={{ color: "#ffb4bd" }}>⚠ AI provider not configured</div>}
          {health?.apifyConfigured && health?.aiConfigured && <div>All integrations configured</div>}
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
