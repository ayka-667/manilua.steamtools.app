"use client";

import { signOut } from "next-auth/react";
import { useEffect, useRef, useState } from "react";

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function formatActionLabel(actionId) {
  if (actionId === "downloadManifest") return "Download Manifest";
  if (actionId === "downloadLua") return "Download Lua";
  if (actionId === "requestUpdate") return "Request Update";
  if (actionId === "requestGame") return "Request Game";
  if (actionId === "updateGame") return "Update Game";
  return actionId || "-";
}

export default function AdminPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState(null);
  const [viewer, setViewer] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/usage", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "Failed to load admin data.");
      }
      setPayload(data);
    } catch (err) {
      setPayload(null);
      setError(err?.message || "Failed to load admin data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await fetch("/api/me", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        if (!active) return;
        setViewer(data.user || null);
      } catch {}
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    function onGlobalClick(event) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("click", onGlobalClick);
    return () => document.removeEventListener("click", onGlobalClick);
  }, []);

  return (
    <main className="st-page">
      <div className="st-profile st-profile-global" ref={menuRef}>
        <button className="st-profile-btn" type="button" onClick={() => setMenuOpen((prev) => !prev)}>
          {viewer?.image ? (
            <img src={viewer.image} alt="Discord avatar" className="st-profile-avatar" />
          ) : (
            <span className="st-profile-fallback">D</span>
          )}
          <span className="st-profile-name">{viewer?.name || "Discord User"}</span>
        </button>
        {menuOpen ? (
          <div className="st-profile-menu">
            <p>{viewer?.tag || viewer?.name || "Connected"}</p>
            <button type="button" onClick={() => (window.location.href = "/")}>
              Home
            </button>
            <button type="button" onClick={() => signOut({ callbackUrl: "/login" })}>
              Sign out
            </button>
          </div>
        ) : null}
      </div>

      <section className="st-shell st-admin-shell">
        <header className="st-hero st-admin-hero">
          <div>
            <p className="st-kicker">SteamTools Admin</p>
            <h1>Admin Usage Panel</h1>
            <p className="st-subtitle">
              Access restricted to Discord role <code>1363231330732867665</code>.
            </p>
          </div>
          <button type="button" className="st-login-btn st-admin-refresh" onClick={loadData} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </header>

        {error ? <div className="st-admin-error">{error}</div> : null}

        {!error && payload ? (
          <>
            <section className="st-panel st-admin-metrics">
              <p>Tracked users: {payload.totals?.trackedUsers ?? 0}</p>
              <p>Premium users: {payload.totals?.premiumUsers ?? 0}</p>
              <p>Standard users: {payload.totals?.standardUsers ?? 0}</p>
            </section>

            <section className="st-panel st-admin-metrics st-admin-metrics-wide">
              <p>Total downloads: {payload.stats?.overview?.totalDownloads ?? 0}</p>
              <p>Downloads today (UTC): {payload.stats?.overview?.downloadsTodayUtc ?? 0}</p>
              <p>Downloads last 24h: {payload.stats?.overview?.downloadsLast24h ?? 0}</p>
              <p>Unique users (24h): {payload.stats?.overview?.uniqueUsersLast24h ?? 0}</p>
              <p>Manifest downloads: {payload.stats?.overview?.manifestDownloads ?? 0}</p>
              <p>Lua downloads: {payload.stats?.overview?.luaDownloads ?? 0}</p>
            </section>

            <section className="st-panel st-admin-table-wrap">
              <h2 className="st-admin-section-title">User Quotas</h2>
              <table className="st-admin-table">
                <thead>
                  <tr>
                    <th>User ID</th>
                    <th>Tier</th>
                    <th>Used Today</th>
                    <th>Remaining</th>
                    <th>Cooldown</th>
                    <th>Reset</th>
                  </tr>
                </thead>
                <tbody>
                  {(payload.rows || []).length === 0 ? (
                    <tr>
                      <td colSpan={6}>No usage tracked yet on this server instance.</td>
                    </tr>
                  ) : (
                    payload.rows.map((row) => (
                      <tr key={row.userId}>
                        <td>{row.userId}</td>
                        <td>{row.tier}</td>
                        <td>
                          {row.downloadsUsedToday} / {row.dailyLimit}
                        </td>
                        <td>{row.downloadsRemaining}</td>
                        <td>{row.cooldownSec > 0 ? `${row.cooldownSec}s` : "Ready"}</td>
                        <td>{formatDate(row.dayResetAt)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </section>

            <section className="st-panel st-admin-table-wrap">
              <h2 className="st-admin-section-title">Top Downloaded Games</h2>
              <table className="st-admin-table">
                <thead>
                  <tr>
                    <th>Game</th>
                    <th>AppID</th>
                    <th>Total</th>
                    <th>Manifest</th>
                    <th>Lua</th>
                    <th>Last Download</th>
                  </tr>
                </thead>
                <tbody>
                  {(payload.stats?.topGames || []).length === 0 ? (
                    <tr>
                      <td colSpan={6}>No download events yet.</td>
                    </tr>
                  ) : (
                    payload.stats.topGames.map((row) => (
                      <tr key={`${row.appid}-${row.lastDownloadedAt}`}>
                        <td>{row.gameName}</td>
                        <td>{row.appid}</td>
                        <td>{row.totalDownloads}</td>
                        <td>{row.manifestDownloads}</td>
                        <td>{row.luaDownloads}</td>
                        <td>{formatDate(row.lastDownloadedAt)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </section>

            <section className="st-panel st-admin-table-wrap">
              <h2 className="st-admin-section-title">Top Downloaders</h2>
              <table className="st-admin-table">
                <thead>
                  <tr>
                    <th>User ID</th>
                    <th>Total</th>
                    <th>Premium</th>
                    <th>Standard</th>
                    <th>Last Download</th>
                  </tr>
                </thead>
                <tbody>
                  {(payload.stats?.topUsers || []).length === 0 ? (
                    <tr>
                      <td colSpan={5}>No users tracked yet.</td>
                    </tr>
                  ) : (
                    payload.stats.topUsers.map((row) => (
                      <tr key={`${row.userId}-${row.lastDownloadAt}`}>
                        <td>{row.userId}</td>
                        <td>{row.totalDownloads}</td>
                        <td>{row.premiumDownloads}</td>
                        <td>{row.standardDownloads}</td>
                        <td>{formatDate(row.lastDownloadAt)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </section>

            <section className="st-panel st-admin-table-wrap">
              <h2 className="st-admin-section-title">Downloads by Hour (UTC, last 24h)</h2>
              <table className="st-admin-table">
                <thead>
                  <tr>
                    <th>Hour (UTC)</th>
                    <th>Downloads</th>
                  </tr>
                </thead>
                <tbody>
                  {(payload.stats?.downloadsByHour || []).length === 0 ? (
                    <tr>
                      <td colSpan={2}>No hourly data yet.</td>
                    </tr>
                  ) : (
                    payload.stats.downloadsByHour.map((row) => (
                      <tr key={row.hourUtc}>
                        <td>{String(row.hourUtc).padStart(2, "0")}:00</td>
                        <td>{row.totalDownloads}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </section>

            <section className="st-panel st-admin-table-wrap">
              <h2 className="st-admin-section-title">Recent Downloads</h2>
              <table className="st-admin-table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>User</th>
                    <th>Action</th>
                    <th>Game</th>
                    <th>AppID</th>
                    <th>Tier</th>
                  </tr>
                </thead>
                <tbody>
                  {(payload.stats?.recentDownloads || []).length === 0 ? (
                    <tr>
                      <td colSpan={6}>No recent downloads yet.</td>
                    </tr>
                  ) : (
                    payload.stats.recentDownloads.map((row, index) => (
                      <tr key={`${row.createdAt}-${row.userId}-${index}`}>
                        <td>{formatDate(row.createdAt)}</td>
                        <td>{row.userId}</td>
                        <td>{formatActionLabel(row.actionId)}</td>
                        <td>{row.gameName}</td>
                        <td>{row.appid}</td>
                        <td>{row.tier}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </section>
          </>
        ) : null}
      </section>
    </main>
  );
}
