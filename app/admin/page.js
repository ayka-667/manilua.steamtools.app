"use client";

import { useEffect, useState } from "react";

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

export default function AdminPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState(null);

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

  return (
    <main className="st-page">
      <section className="st-shell st-admin-shell">
        <header className="st-admin-head">
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

            <section className="st-panel st-admin-table-wrap">
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
          </>
        ) : null}
      </section>
    </main>
  );
}
