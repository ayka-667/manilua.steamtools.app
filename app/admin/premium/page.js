"use client";

import { useEffect, useState } from "react";

function formatDate(ms) {
  if (!ms) return "-";
  return new Date(ms).toLocaleString("en-GB", { hour12: false });
}

function formatAmount(cents, currency) {
  const value = Number(cents || 0) / 100;
  return `${value.toFixed(2)} ${currency || "EUR"}`;
}

export default function AdminPremiumPage() {
  const [orders, setOrders] = useState([]);
  const [priceInput, setPriceInput] = useState("");
  const [priceLabel, setPriceLabel] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [showAll, setShowAll] = useState(false);

  async function loadAll(nextShowAll = showAll) {
    setLoading(true);
    setError("");
    try {
      const [ordersRes, priceRes] = await Promise.all([
        fetch(`/api/admin/premium/orders?status=${nextShowAll ? "all" : "pending"}`, { cache: "no-store" }),
        fetch("/api/admin/premium/price", { cache: "no-store" })
      ]);
      const ordersData = await ordersRes.json().catch(() => ({}));
      const priceData = await priceRes.json().catch(() => ({}));
      if (!ordersRes.ok) throw new Error(ordersData?.error || "Failed to load orders.");
      if (!priceRes.ok) throw new Error(priceData?.error || "Failed to load price.");
      setOrders(Array.isArray(ordersData.orders) ? ordersData.orders : []);
      setPriceLabel(priceData?.price?.formatted || "");
      setPriceInput(String(priceData?.price?.amount ?? ""));
    } catch (err) {
      setError(err?.message || "Failed to load admin premium data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    loadAll(showAll);
  }, [showAll]);

  async function savePrice() {
    setSaving(true);
    setActionError("");
    try {
      const response = await fetch("/api/admin/premium/price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: priceInput })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "Unable to update price.");
      setPriceLabel(data?.price?.formatted || "");
      setPriceInput(String(data?.price?.amount ?? ""));
    } catch (err) {
      setActionError(err?.message || "Unable to update price.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAction(orderId, action) {
    setActionError("");
    try {
      const response = await fetch("/api/admin/premium/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: orderId, action })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "Action failed.");
      await loadAll();
    } catch (err) {
      setActionError(err?.message || "Action failed.");
    }
  }

  return (
    <main className="st-page">
      <section className="st-shell st-admin-shell">
        <header className="st-admin-head">
          <div>
            <p className="st-kicker">SteamTools Admin</p>
            <h1>Premium Orders</h1>
          </div>
          <nav className="st-admin-nav">
            <a href="/admin" className="st-admin-nav-link">Usage</a>
            <a href="/admin/premium" className="st-admin-nav-link is-active">Premium</a>
          </nav>
        </header>

        {error ? <div className="st-admin-error">{error}</div> : null}
        {actionError ? <div className="st-admin-error">{actionError}</div> : null}

        <section className="st-panel st-admin-settings">
          <div>
            <h2 className="st-admin-section-title">Premium price</h2>
            <p className="st-admin-section-note">Current price: {priceLabel || "-"}</p>
            <p className="st-admin-section-note">Approving an order does not grant the Discord role automatically.</p>
          </div>
          <div className="st-admin-price-form">
            <input
              className="st-appid-input"
              type="text"
              value={priceInput}
              onChange={(event) => setPriceInput(event.target.value)}
              placeholder="4.99"
            />
            <button type="button" className="st-login-btn" onClick={savePrice} disabled={saving}>
              {saving ? "Saving..." : "Save price"}
            </button>
          </div>
        </section>

        <section className="st-panel st-admin-table-wrap">
          <div className="st-admin-section-head">
            <h2 className="st-admin-section-title">Orders</h2>
            <div className="st-admin-inline-actions">
              <label className="st-admin-toggle">
                <input
                  type="checkbox"
                  checked={showAll}
                  onChange={(event) => setShowAll(event.target.checked)}
                />
                <span>Show processed orders</span>
              </label>
              {loading ? <p className="st-admin-section-note">Loading…</p> : null}
            </div>
          </div>
          <table className="st-admin-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>User</th>
                <th>Method</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Steam code</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={8}>No premium orders yet.</td>
                </tr>
              ) : (
                orders.map((order) => (
                  <tr key={order.id}>
                    <td>{order.id}</td>
                    <td>{order.user_id}</td>
                    <td>{order.method}</td>
                    <td>{formatAmount(order.amount_cents, order.currency)}</td>
                    <td>{order.status}</td>
                    <td>{order.steam_code || "-"}</td>
                    <td>{formatDate(order.created_at_ms)}</td>
                    <td>
                      <div className="st-admin-inline-actions">
                        <button
                          type="button"
                          className="st-admin-copy-btn"
                          disabled={order.status === "approved"}
                          onClick={() => handleAction(order.id, "approve")}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          className="st-admin-copy-btn"
                          disabled={order.status === "rejected"}
                          onClick={() => handleAction(order.id, "reject")}
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      </section>
    </main>
  );
}
