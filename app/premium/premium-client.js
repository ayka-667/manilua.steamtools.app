"use client";

import { signIn } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";

const PAYMENT_METHODS = [
  {
    id: "paypal",
    title: "PayPal",
    description: "Pay safely with Friends & Family.",
    tone: "st-primary"
  },
  {
    id: "card",
    title: "Card",
    description: "Instant card transfer via Revolut.",
    tone: "st-secondary"
  },
  {
    id: "steam",
    title: "Steam Wallet",
    description: "Redeem a Steam Wallet code.",
    tone: "st-neutral"
  }
];

const INSTRUCTIONS = {
  paypal: (price) => `Send ${price} to jxstenoe@gmail.com as Friends & Family without note.`,
  card: (price) => `Send ${price} via https://revolut.me/virginiev86`,
  steam: () => "Enter your Steam Wallet code below. An admin will review it."
};

export default function PremiumClient() {
  const [price, setPrice] = useState({ amount: 4.99, currency: "EUR", formatted: "4.99€" });
  const [viewer, setViewer] = useState(null);
  const [isPremium, setIsPremium] = useState(false);
  const [loading, setLoading] = useState(true);
  const [method, setMethod] = useState("paypal");
  const [steamCode, setSteamCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [orderId, setOrderId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const [priceRes, meRes] = await Promise.all([
          fetch("/api/premium/config", { cache: "no-store" }),
          fetch("/api/me", { cache: "no-store" })
        ]);
        if (priceRes.ok) {
          const data = await priceRes.json();
          if (alive && data?.price) setPrice(data.price);
        }
        if (meRes.ok) {
          const data = await meRes.json();
          if (alive) {
            setViewer(data.user || null);
            setIsPremium(Boolean(data.premium));
          }
        }
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, []);

  const priceLabel = price?.formatted || "4.99€";
  const methodInfo = useMemo(() => PAYMENT_METHODS.find((item) => item.id === method), [method]);

  async function submitOrder(nextMethod) {
    setSubmitting(true);
    setError("");
    setSuccess("");
    setOrderId("");
    try {
      const body = { method: nextMethod };
      if (nextMethod === "steam") {
        body.steamCode = steamCode.trim();
      }
      const response = await fetch("/api/premium/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Unable to create order.");
      }
      setOrderId(String(payload.orderId || ""));
      setSuccess("Order created. Please follow the instructions below.");
    } catch (err) {
      setError(err?.message || "Unable to create order.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="st-shell st-premium-shell">
      <header className="st-hero st-premium-hero">
        <p className="st-kicker">SteamTools Premium</p>
        <h1>Lifetime access, one simple payment.</h1>
        <p className="st-subtitle">
          Unlock faster cooldowns, higher daily limits, and premium update tools. Pay once, keep it forever.
        </p>
        <div className="st-premium-price">
          <span className="st-price-label">Price</span>
          <span className="st-price-value">{priceLabel}</span>
          <span className="st-price-note">One-time payment</span>
        </div>
      </header>

      <section className="st-panel st-premium-features">
        <h2>What you get</h2>
        <div className="st-premium-feature-grid">
          <div>
            <h3>Higher limits</h3>
            <p>Daily downloads jump to 500, with a 2s cooldown.</p>
          </div>
          <div>
            <h3>Premium tools</h3>
            <p>Request Update and Update Game tools are unlocked.</p>
          </div>
          <div>
            <h3>Lifetime access</h3>
            <p>No subscriptions, no renewals. Pay once and you keep it.</p>
          </div>
        </div>
      </section>

      <section className="st-panel st-premium-payments">
        <div className="st-premium-payments-head">
          <h2>Choose a payment method</h2>
          {loading ? <span>Loading...</span> : null}
        </div>

        {!viewer ? (
          <div className="st-premium-login">
            <p>Login with Discord to place an order.</p>
            <button className="st-login-btn" type="button" onClick={() => signIn("discord", { callbackUrl: "/premium" })}>
              Login with Discord
            </button>
          </div>
        ) : isPremium ? (
          <div className="st-premium-active">
            <p>You already have Premium active on this account.</p>
          </div>
        ) : (
          <>
            <div className="st-premium-methods">
              {PAYMENT_METHODS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`st-premium-method ${item.id === method ? "is-active" : ""}`}
                  onClick={() => setMethod(item.id)}
                >
                  <strong>{item.title}</strong>
                  <span>{item.description}</span>
                </button>
              ))}
            </div>

            <div className="st-premium-instructions">
              <div className="st-premium-instructions-head">
                <h3>{methodInfo?.title}</h3>
                <span>{priceLabel}</span>
              </div>
              <p>{INSTRUCTIONS[method]?.(priceLabel)}</p>

              {method === "steam" ? (
                <div className="st-premium-code">
                  <label htmlFor="steam-code" className="st-field-label">
                    Steam Wallet code
                  </label>
                  <input
                    id="steam-code"
                    className="st-appid-input"
                    type="text"
                    placeholder="XXXX-XXXX-XXXX"
                    value={steamCode}
                    onChange={(event) => setSteamCode(event.target.value)}
                  />
                </div>
              ) : null}

              <button
                type="button"
                className={`st-action-btn ${methodInfo?.tone || "st-primary"}`}
                onClick={() => submitOrder(method)}
                disabled={submitting || (method === "steam" && steamCode.trim().length < 5)}
              >
                {submitting ? "Creating order..." : "Create order"}
              </button>

              {orderId ? (
                <p className="st-premium-wait">Order #{orderId} created. Please wait for admin approval.</p>
              ) : null}
              {success ? <p className="st-premium-success">{success}</p> : null}
              {error ? <p className="st-premium-error">{error}</p> : null}
            </div>
          </>
        )}
      </section>
    </section>
  );
}
