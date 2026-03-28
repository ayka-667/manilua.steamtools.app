"use client";

import { signOut } from "next-auth/react";
import { useEffect, useMemo, useRef, useState } from "react";

const DEFAULT_QUOTA_ROWS = 30;

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

function formatPercent(value) {
  return `${Math.round(value)}%`;
}

function sanitizeMarkdown(value) {
  return String(value || "-").replace(/[`*_~|]/g, "\\$&");
}

function buildMarkdownTable(headers, rows) {
  const headerRow = `| ${headers.join(" | ")} |`;
  const separatorRow = `| ${headers.map(() => "---").join(" | ")} |`;
  const bodyRows = rows.map((row) => `| ${row.map((cell) => sanitizeMarkdown(cell)).join(" | ")} |`);
  return [headerRow, separatorRow, ...bodyRows].join("\n");
}

function buildOverviewMarkdown(stats, totals, quotaRows) {
  const overview = stats?.overview || {};
  const topToday = stats?.topGamesToday || [];
  const topGame = topToday[0];
  const totalTierDownloads = (overview.premiumDownloads || 0) + (overview.standardDownloads || 0);
  const premiumShare = totalTierDownloads > 0 ? (overview.premiumDownloads / totalTierDownloads) * 100 : 0;
  const exhaustedToday = quotaRows.filter((row) => row.downloadsRemaining === 0).length;
  const cooldownActive = quotaRows.filter((row) => row.cooldownSec > 0).length;

  return [
    "## SteamTools Admin Report",
    "",
    `- Downloads today (UTC): **${overview.downloadsTodayUtc || 0}**`,
    `- Unique users today: **${overview.uniqueUsersTodayUtc || 0}**`,
    `- Unique games today: **${overview.uniqueGamesTodayUtc || 0}**`,
    `- Tracked users today: **${totals?.trackedUsers ?? 0}**`,
    `- Premium users today: **${totals?.premiumUsers ?? 0}**`,
    `- Standard users today: **${totals?.standardUsers ?? 0}**`,
    `- Quotas exhausted today: **${exhaustedToday}**`,
    `- Cooldowns active now: **${cooldownActive}**`,
    `- Premium download share: **${formatPercent(premiumShare)}**`,
    topGame ? `- Top game today: **${sanitizeMarkdown(topGame.gameName)}** (${topGame.totalDownloads} downloads)` : "- Top game today: **None**",
    ""
  ].join("\n");
}

function buildTopGamesMarkdown(stats) {
  const rows = (stats?.topGamesToday || []).slice(0, 10);
  if (rows.length === 0) {
    return ["## Top Downloaded Games Today", "", "_No downloads recorded today yet._"].join("\n");
  }

  return [
    "## Top Downloaded Games Today",
    "",
    buildMarkdownTable(
      ["#", "Game", "AppID", "Total", "Manifest", "Lua", "Last Download"],
      rows.map((row, index) => [
        index + 1,
        row.gameName,
        row.appid,
        row.totalDownloads,
        row.manifestDownloads,
        row.luaDownloads,
        formatDate(row.lastDownloadedAt)
      ])
    )
  ].join("\n");
}

function buildTopUsersMarkdown(stats) {
  const rows = (stats?.topUsersToday || []).slice(0, 10);
  if (rows.length === 0) {
    return ["## Top Downloaders Today", "", "_No user activity recorded today yet._"].join("\n");
  }

  return [
    "## Top Downloaders Today",
    "",
    buildMarkdownTable(
      ["#", "User ID", "Total", "Premium", "Standard", "Last Download"],
      rows.map((row, index) => [
        index + 1,
        row.userId,
        row.totalDownloads,
        row.premiumDownloads,
        row.standardDownloads,
        formatDate(row.lastDownloadAt)
      ])
    )
  ].join("\n");
}

async function copyText(text) {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    throw new Error("Clipboard unavailable in this browser.");
  }
  await navigator.clipboard.writeText(text);
}

export default function AdminPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState(null);
  const [viewer, setViewer] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [visibleQuotaRows, setVisibleQuotaRows] = useState(DEFAULT_QUOTA_ROWS);
  const [copyFeedback, setCopyFeedback] = useState("");
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
      setVisibleQuotaRows(DEFAULT_QUOTA_ROWS);
    } catch (err) {
      setPayload(null);
      setError(err?.message || "Failed to load admin data.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy(label, builder) {
    try {
      await copyText(builder());
      setCopyFeedback(`${label} copied.`);
    } catch (err) {
      setCopyFeedback(err?.message || `Failed to copy ${label.toLowerCase()}.`);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!copyFeedback) return undefined;
    const timeout = window.setTimeout(() => setCopyFeedback(""), 2500);
    return () => window.clearTimeout(timeout);
  }, [copyFeedback]);

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

  const quotaRows = payload?.rows || [];
  const visibleRows = quotaRows.slice(0, visibleQuotaRows);
  const remainingQuotaRows = Math.max(quotaRows.length - visibleRows.length, 0);

  const derived = useMemo(() => {
    const overview = payload?.stats?.overview || {};
    const topGameToday = payload?.stats?.topGamesToday?.[0] || null;
    const recentDownload = payload?.stats?.recentDownloads?.[0] || null;
    const totalTierDownloads = (overview.premiumDownloads || 0) + (overview.standardDownloads || 0);
    const premiumShare = totalTierDownloads > 0 ? (overview.premiumDownloads / totalTierDownloads) * 100 : 0;

    return {
      exhaustedToday: quotaRows.filter((row) => row.downloadsRemaining === 0).length,
      cooldownActive: quotaRows.filter((row) => row.cooldownSec > 0).length,
      premiumShare,
      topGameToday,
      recentDownload
    };
  }, [payload, quotaRows]);

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
              Daily-focused view with Discord-ready reports and cleaner quota tracking.
            </p>
          </div>
          <button type="button" className="st-login-btn st-admin-refresh" onClick={loadData} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </header>

        {copyFeedback ? <div className="st-admin-copy-feedback">{copyFeedback}</div> : null}
        {error ? <div className="st-admin-error">{error}</div> : null}

        {!error && payload ? (
          <>
            <section className="st-admin-toolbar">
              <div className="st-admin-toolbar-copy">
                <button
                  type="button"
                  className="st-admin-copy-btn"
                  onClick={() => handleCopy("Overview", () => buildOverviewMarkdown(payload.stats, payload.totals, quotaRows))}
                >
                  Copy overview
                </button>
                <button
                  type="button"
                  className="st-admin-copy-btn"
                  onClick={() => handleCopy("Top games", () => buildTopGamesMarkdown(payload.stats))}
                >
                  Copy top games
                </button>
                <button
                  type="button"
                  className="st-admin-copy-btn"
                  onClick={() => handleCopy("Top users", () => buildTopUsersMarkdown(payload.stats))}
                >
                  Copy top users
                </button>
              </div>
              <p className="st-admin-toolbar-note">Markdown format ready to paste into Discord.</p>
            </section>

            <section className="st-panel st-admin-metrics">
              <p>
                <strong>{payload.totals?.trackedUsers ?? 0}</strong>
                <span>Tracked users today</span>
              </p>
              <p>
                <strong>{payload.totals?.premiumUsers ?? 0}</strong>
                <span>Premium users today</span>
              </p>
              <p>
                <strong>{payload.totals?.standardUsers ?? 0}</strong>
                <span>Standard users today</span>
              </p>
            </section>

            <section className="st-panel st-admin-metrics st-admin-metrics-wide">
              <p>
                <strong>{payload.stats?.overview?.downloadsTodayUtc ?? 0}</strong>
                <span>Downloads today (UTC)</span>
              </p>
              <p>
                <strong>{payload.stats?.overview?.uniqueUsersTodayUtc ?? 0}</strong>
                <span>Unique users today</span>
              </p>
              <p>
                <strong>{payload.stats?.overview?.uniqueGamesTodayUtc ?? 0}</strong>
                <span>Unique games today</span>
              </p>
              <p>
                <strong>{payload.stats?.overview?.downloadsLast24h ?? 0}</strong>
                <span>Downloads last 24h</span>
              </p>
              <p>
                <strong>{formatPercent(derived.premiumShare)}</strong>
                <span>Premium share</span>
              </p>
              <p>
                <strong>{derived.cooldownActive}</strong>
                <span>Cooldowns active</span>
              </p>
            </section>

            <section className="st-admin-detail-grid">
              <article className="st-panel st-admin-highlight">
                <h2 className="st-admin-section-title">Today Snapshot</h2>
                <p>Quotas exhausted: {derived.exhaustedToday}</p>
                <p>Manifest downloads: {payload.stats?.overview?.manifestDownloads ?? 0}</p>
                <p>Lua downloads: {payload.stats?.overview?.luaDownloads ?? 0}</p>
                <p>Total games tracked: {payload.stats?.overview?.uniqueGames ?? 0}</p>
              </article>

              <article className="st-panel st-admin-highlight">
                <h2 className="st-admin-section-title">Top Game Today</h2>
                {derived.topGameToday ? (
                  <>
                    <p>{derived.topGameToday.gameName}</p>
                    <p>AppID: {derived.topGameToday.appid}</p>
                    <p>Total downloads: {derived.topGameToday.totalDownloads}</p>
                    <p>Last activity: {formatDate(derived.topGameToday.lastDownloadedAt)}</p>
                  </>
                ) : (
                  <p>No downloads recorded today yet.</p>
                )}
              </article>

              <article className="st-panel st-admin-highlight">
                <h2 className="st-admin-section-title">Latest Download</h2>
                {derived.recentDownload ? (
                  <>
                    <p>{derived.recentDownload.gameName}</p>
                    <p>User: {derived.recentDownload.userId}</p>
                    <p>Action: {formatActionLabel(derived.recentDownload.actionId)}</p>
                    <p>When: {formatDate(derived.recentDownload.createdAt)}</p>
                  </>
                ) : (
                  <p>No recent download yet.</p>
                )}
              </article>
            </section>

            <section className="st-panel st-admin-table-wrap">
              <div className="st-admin-section-head">
                <div>
                  <h2 className="st-admin-section-title">User Quotas Today</h2>
                  <p className="st-admin-section-note">
                    Only today&apos;s users are shown. The list starts at 30 rows to stay readable.
                  </p>
                </div>
                <p className="st-admin-section-badge">
                  Showing {visibleRows.length} / {quotaRows.length}
                </p>
              </div>
              <table className="st-admin-table">
                <thead>
                  <tr>
                    <th>User ID</th>
                    <th>Tier</th>
                    <th>Used Today</th>
                    <th>Remaining</th>
                    <th>Cooldown</th>
                    <th>Last Update</th>
                    <th>Reset</th>
                  </tr>
                </thead>
                <tbody>
                  {quotaRows.length === 0 ? (
                    <tr>
                      <td colSpan={7}>No quota activity recorded today.</td>
                    </tr>
                  ) : (
                    visibleRows.map((row) => (
                      <tr key={row.userId}>
                        <td>{row.userId}</td>
                        <td>{row.tier}</td>
                        <td>
                          {row.downloadsUsedToday} / {row.dailyLimit}
                        </td>
                        <td>{row.downloadsRemaining}</td>
                        <td>{row.cooldownSec > 0 ? `${row.cooldownSec}s` : "Ready"}</td>
                        <td>{formatDate(row.updatedAt)}</td>
                        <td>{formatDate(row.dayResetAt)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              {remainingQuotaRows > 0 ? (
                <div className="st-admin-table-actions">
                  <button
                    type="button"
                    className="st-admin-copy-btn"
                    onClick={() => setVisibleQuotaRows((current) => current + DEFAULT_QUOTA_ROWS)}
                  >
                    Show {Math.min(DEFAULT_QUOTA_ROWS, remainingQuotaRows)} more
                  </button>
                </div>
              ) : null}
            </section>

            <section className="st-panel st-admin-table-wrap">
              <div className="st-admin-section-head">
                <div>
                  <h2 className="st-admin-section-title">Top Downloaded Games Today</h2>
                  <p className="st-admin-section-note">Best for quick Discord recap messages.</p>
                </div>
              </div>
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
                  {(payload.stats?.topGamesToday || []).length === 0 ? (
                    <tr>
                      <td colSpan={6}>No download events recorded today.</td>
                    </tr>
                  ) : (
                    payload.stats.topGamesToday.map((row) => (
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
              <h2 className="st-admin-section-title">Top Downloaders Today</h2>
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
                  {(payload.stats?.topUsersToday || []).length === 0 ? (
                    <tr>
                      <td colSpan={5}>No users tracked today.</td>
                    </tr>
                  ) : (
                    payload.stats.topUsersToday.map((row) => (
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
