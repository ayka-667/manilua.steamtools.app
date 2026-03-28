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

function copyComputedStyles(source, target) {
  const computed = window.getComputedStyle(source);
  for (const property of computed) {
    target.style.setProperty(property, computed.getPropertyValue(property), computed.getPropertyPriority(property));
  }
  target.style.setProperty("box-sizing", "border-box");

  const sourceChildren = Array.from(source.children);
  const targetChildren = Array.from(target.children);
  for (let index = 0; index < sourceChildren.length; index += 1) {
    if (targetChildren[index]) {
      copyComputedStyles(sourceChildren[index], targetChildren[index]);
    }
  }
}

async function nodeToPngBlob(node) {
  const rect = node.getBoundingClientRect();
  const width = Math.ceil(rect.width);
  const height = Math.ceil(rect.height);
  const clone = node.cloneNode(true);

  copyComputedStyles(node, clone);
  clone.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
  clone.style.margin = "0";

  const wrapper = document.createElement("div");
  wrapper.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
  wrapper.style.width = `${width}px`;
  wrapper.style.height = `${height}px`;
  wrapper.style.display = "flex";
  wrapper.style.alignItems = "stretch";
  wrapper.style.justifyContent = "stretch";
  wrapper.appendChild(clone);

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <foreignObject x="0" y="0" width="100%" height="100%">${new XMLSerializer().serializeToString(wrapper)}</foreignObject>
    </svg>
  `;

  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });

    const canvas = document.createElement("canvas");
    const ratio = Math.max(window.devicePixelRatio || 1, 2);
    canvas.width = width * ratio;
    canvas.height = height * ratio;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Canvas unavailable.");
    }

    context.scale(ratio, ratio);
    context.drawImage(image, 0, 0, width, height);

    return await new Promise((resolve, reject) => {
      canvas.toBlob((pngBlob) => {
        if (pngBlob) {
          resolve(pngBlob);
        } else {
          reject(new Error("Image export failed."));
        }
      }, "image/png");
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function downloadNodeAsImage(node, filename) {
  const blob = await nodeToPngBlob(node);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function copyNodeAsImage(node) {
  if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
    throw new Error("Image clipboard is not supported in this browser.");
  }

  const blob = await nodeToPngBlob(node);
  await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
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
  const overviewCardRef = useRef(null);
  const gamesCardRef = useRef(null);
  const usersCardRef = useRef(null);

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

  async function handleImageAction(label, ref, mode) {
    const node = ref.current;
    if (!node) {
      setCopyFeedback(`Missing ${label.toLowerCase()} card.`);
      return;
    }

    try {
      if (mode === "copy") {
        await copyNodeAsImage(node);
        setCopyFeedback(`${label} image copied.`);
        return;
      }

      await downloadNodeAsImage(node, `${label.toLowerCase().replace(/\s+/g, "-")}.png`);
      setCopyFeedback(`${label} image downloaded.`);
    } catch (err) {
      setCopyFeedback(err?.message || `Failed to export ${label.toLowerCase()} image.`);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!copyFeedback) return undefined;
    const timeout = window.setTimeout(() => setCopyFeedback(""), 3000);
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

  const topGamesToday = (payload?.stats?.topGamesToday || []).slice(0, 5);
  const topUsersToday = (payload?.stats?.topUsersToday || []).slice(0, 5);

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
              Daily-focused view with cleaner quota tracking and image-ready Discord cards.
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
                <button type="button" className="st-admin-copy-btn" onClick={() => handleImageAction("Overview", overviewCardRef, "download")}>
                  Download overview image
                </button>
                <button type="button" className="st-admin-copy-btn" onClick={() => handleImageAction("Top games", gamesCardRef, "download")}>
                  Download top games image
                </button>
                <button type="button" className="st-admin-copy-btn" onClick={() => handleImageAction("Top users", usersCardRef, "download")}>
                  Download top users image
                </button>
                <button type="button" className="st-admin-copy-btn" onClick={() => handleImageAction("Overview", overviewCardRef, "copy")}>
                  Copy overview image
                </button>
              </div>
              <p className="st-admin-toolbar-note">Each card is built in HTML/CSS, then exported to PNG.</p>
            </section>

            <section className="st-admin-share-grid">
              <article className="st-admin-share-card" ref={overviewCardRef}>
                <div className="st-admin-share-head">
                  <div>
                    <p className="st-admin-share-kicker">SteamTools Daily Report</p>
                    <h2>Overview</h2>
                  </div>
                  <span className="st-admin-share-badge">UTC Today</span>
                </div>
                <div className="st-admin-share-metrics">
                  <div>
                    <strong>{payload.stats?.overview?.downloadsTodayUtc ?? 0}</strong>
                    <span>Downloads</span>
                  </div>
                  <div>
                    <strong>{payload.stats?.overview?.uniqueUsersTodayUtc ?? 0}</strong>
                    <span>Users</span>
                  </div>
                  <div>
                    <strong>{payload.stats?.overview?.uniqueGamesTodayUtc ?? 0}</strong>
                    <span>Games</span>
                  </div>
                  <div>
                    <strong>{formatPercent(derived.premiumShare)}</strong>
                    <span>Premium share</span>
                  </div>
                </div>
                <div className="st-admin-share-info">
                  <p>Tracked users: {payload.totals?.trackedUsers ?? 0}</p>
                  <p>Cooldowns active: {derived.cooldownActive}</p>
                  <p>Quotas exhausted: {derived.exhaustedToday}</p>
                  <p>Latest game: {derived.recentDownload?.gameName || "-"}</p>
                </div>
              </article>

              <article className="st-admin-share-card" ref={gamesCardRef}>
                <div className="st-admin-share-head">
                  <div>
                    <p className="st-admin-share-kicker">SteamTools Rankings</p>
                    <h2>Top Games Today</h2>
                  </div>
                  <span className="st-admin-share-badge">Top 5</span>
                </div>
                <div className="st-admin-share-list">
                  {topGamesToday.length === 0 ? (
                    <p className="st-admin-share-empty">No downloads recorded today.</p>
                  ) : (
                    topGamesToday.map((row, index) => (
                      <div key={`${row.appid}-${row.lastDownloadedAt}`} className="st-admin-share-row">
                        <span className="st-admin-share-rank">#{index + 1}</span>
                        <div className="st-admin-share-main">
                          <strong>{row.gameName}</strong>
                          <span>AppID {row.appid}</span>
                        </div>
                        <div className="st-admin-share-side">
                          <strong>{row.totalDownloads}</strong>
                          <span>downloads</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </article>

              <article className="st-admin-share-card" ref={usersCardRef}>
                <div className="st-admin-share-head">
                  <div>
                    <p className="st-admin-share-kicker">SteamTools Rankings</p>
                    <h2>Top Users Today</h2>
                  </div>
                  <span className="st-admin-share-badge">Top 5</span>
                </div>
                <div className="st-admin-share-list">
                  {topUsersToday.length === 0 ? (
                    <p className="st-admin-share-empty">No user activity recorded today.</p>
                  ) : (
                    topUsersToday.map((row, index) => (
                      <div key={`${row.userId}-${row.lastDownloadAt}`} className="st-admin-share-row">
                        <span className="st-admin-share-rank">#{index + 1}</span>
                        <div className="st-admin-share-main">
                          <strong>{row.userId}</strong>
                          <span>{row.premiumDownloads} premium / {row.standardDownloads} standard</span>
                        </div>
                        <div className="st-admin-share-side">
                          <strong>{row.totalDownloads}</strong>
                          <span>downloads</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </article>
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
                  <p className="st-admin-section-note">This table stays here for the detailed admin view.</p>
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
