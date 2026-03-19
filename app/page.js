"use client";

import { signOut } from "next-auth/react";
import { useEffect, useMemo, useRef, useState } from "react";

const ACTIONS = [
  { id: "downloadManifest", label: "Download Manifest", tone: "primary" },
  { id: "downloadLua", label: "Download Lua", tone: "secondary" },
  { id: "requestUpdate", label: "Request Update", tone: "neutral" },
  { id: "requestGame", label: "Request Game", tone: "neutral" },
  { id: "updateGame", label: "Update Game", tone: "neutral" }
];

const HISTORY_KEY = "steamtools_recent_appids";
const PREMIUM_ACTIONS = new Set(["requestUpdate", "updateGame"]);

function parseFilename(contentDisposition) {
  if (!contentDisposition) return null;
  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) return decodeURIComponent(utf8Match[1]);
  const basicMatch = contentDisposition.match(/filename="?([^"]+)"?/i);
  return basicMatch?.[1] || null;
}

function makeFallbackFilename(action, appid) {
  if (action === "downloadManifest") return `manifest-${appid}.zip`;
  if (action === "downloadLua") return `script-${appid}.lua`;
  return `steamtools-${action}-${appid}.txt`;
}

function getMessage(data) {
  if (!data) return "Action completed.";
  if (typeof data.message === "string" && data.message.trim()) return data.message.trim();
  if (typeof data.error === "string" && data.error.trim()) return data.error.trim();
  return "Action completed.";
}

export default function HomePage() {
  const [query, setQuery] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const [history, setHistory] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [game, setGame] = useState(null);
  const [gameLoading, setGameLoading] = useState(false);
  const [viewer, setViewer] = useState(null);
  const [isPremium, setIsPremium] = useState(false);
  const [usage, setUsage] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [resolvedAppid, setResolvedAppid] = useState("");
  const menuRef = useRef(null);

  const isAppidValid = useMemo(() => /^\d{1,10}$/.test(query), [query]);
  const effectiveAppid = isAppidValid ? query : resolvedAppid;

  useEffect(() => {
    document.documentElement.dataset.theme = "dark";
  }, []);

  async function loadViewer({ redirectOnFail = false } = {}) {
    try {
      const response = await fetch("/api/me", { cache: "no-store" });
      if (!response.ok) {
        if (redirectOnFail) window.location.href = "/login";
        return;
      }
      const data = await response.json();
      setViewer(data.user);
      setIsPremium(Boolean(data.premium));
      setUsage(data.usage || null);
    } catch {
      if (redirectOnFail) window.location.href = "/login";
    }
  }

  useEffect(() => {
    try {
      const saved = localStorage.getItem(HISTORY_KEY);
      if (saved) setHistory(JSON.parse(saved));
    } catch {
      setHistory([]);
    }
  }, []);

  useEffect(() => {
    loadViewer({ redirectOnFail: true });
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    loadViewer();
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen || !usage?.cooldownSec) return;
    const intervalId = setInterval(() => {
      setUsage((prev) => {
        if (!prev || prev.cooldownSec <= 0) return prev;
        return { ...prev, cooldownSec: prev.cooldownSec - 1 };
      });
    }, 1000);
    return () => clearInterval(intervalId);
  }, [menuOpen, usage?.cooldownSec]);

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

  useEffect(() => {
    if (!query.trim()) {
      setGame(null);
      setResolvedAppid("");
      setGameLoading(false);
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(async () => {
      setGameLoading(true);
      try {
        const endpoint = isAppidValid
          ? `/api/game/${query}`
          : `/api/game/search?q=${encodeURIComponent(query.trim())}`;
        const response = await fetch(endpoint, { signal: controller.signal });
        if (!response.ok) {
          setGame(null);
          setResolvedAppid("");
          return;
        }
        const payload = await response.json();
        setGame(payload);
        setResolvedAppid(String(payload.appid || ""));
      } catch {
        setGame(null);
        setResolvedAppid("");
      } finally {
        setGameLoading(false);
      }
    }, 260);

    return () => {
      controller.abort();
      clearTimeout(timeoutId);
    };
  }, [query, isAppidValid]);

  function pushToast(type, message) {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 3500);
  }

  function persistHistory(nextAppid) {
    if (!/^\d{1,10}$/.test(nextAppid)) return;
    const next = [nextAppid, ...history.filter((item) => item !== nextAppid)].slice(0, 8);
    setHistory(next);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  }

  async function runAction(actionId) {
    if (!effectiveAppid) {
      pushToast("error", "Enter a valid Steam AppID or game name.");
      return;
    }
    if (PREMIUM_ACTIONS.has(actionId) && !isPremium) {
      pushToast("error", "Buy the premium Discord role to use this action.");
      return;
    }

    setBusyAction(actionId);

    try {
      const response = await fetch(`/api/action/${actionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appid: effectiveAppid })
      });

      if (!response.ok) {
        const fail = await response.json().catch(() => ({ error: "Request failed." }));
        throw new Error(fail.error || "Request failed.");
      }

      if (actionId === "downloadManifest" || actionId === "downloadLua") {
        const blob = await response.blob();
        const contentDisposition = response.headers.get("content-disposition");
        const fileName = parseFilename(contentDisposition) || makeFallbackFilename(actionId, effectiveAppid);

        const href = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = href;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(href);

        pushToast("success", `${ACTIONS.find((a) => a.id === actionId)?.label} ready.`);
      } else {
        const data = await response.json();
        pushToast("success", getMessage(data));
      }

      persistHistory(effectiveAppid);
    } catch (error) {
      pushToast("error", error.message || "Unexpected error.");
    } finally {
      if (actionId === "downloadManifest" || actionId === "downloadLua") {
        await loadViewer();
      }
      setBusyAction("");
    }
  }

  function getActionLabel(action, isLocked) {
    if (busyAction === action.id) return "Processing...";
    if (isLocked) return `${action.label} (Premium)`;
    return action.label;
  }

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
            <div className="st-profile-stats">
              <p>
                Tier: <strong>{usage?.tier === "premium" ? "Premium" : "Standard"}</strong>
              </p>
              <p>
                Downloads left: <strong>{usage?.downloadsRemaining ?? "-"}</strong>
                {usage?.dailyLimit ? ` / ${usage.dailyLimit}` : ""}
              </p>
              <p>
                Cooldown: <strong>{usage?.cooldownSec ? `${usage.cooldownSec}s` : "Ready"}</strong>
              </p>
            </div>
            <button type="button" onClick={() => signOut({ callbackUrl: "/login" })}>
              Sign out
            </button>
          </div>
        ) : null}
      </div>

      <section className="st-shell">
        <header className="st-hero">
          <div className="st-brand">
            <h1>SteamTools ManiLua</h1>
            <p className="st-subtitle">Best API for Steam Manifest and Lua</p>
          </div>
        </header>

        <section className="st-main-grid">
          <div className="st-panel st-input-panel">
            <label htmlFor="appid" className="st-field-label">
              Steam AppID or game name
            </label>
            <input
              id="appid"
              className="st-appid-input"
              type="text"
              value={query}
              placeholder="Example: 570 or Elden Ring"
              onChange={(event) => setQuery(event.target.value)}
            />
            <p className="st-helper">Use a numeric AppID or a game name. All requests go through the secure backend.</p>

            {query.trim() ? (
              <div className="st-game-notice" aria-live="polite">
                {gameLoading ? (
                  <div className="st-game-notice-loading">
                    <div className="st-game-media st-skeleton" />
                    <div className="st-game-lines">
                      <span />
                      <span />
                    </div>
                  </div>
                ) : (
                  <>
                    {game?.headerImage ? (
                      <img
                        src={game.headerImage}
                        alt={`${game?.name || "Game"} header`}
                        className="st-game-media"
                        loading="lazy"
                      />
                    ) : (
                      <div className="st-game-media st-game-media-empty" aria-hidden="true">
                        No cover
                      </div>
                    )}
                    <div className="st-game-mini-text">
                      <p className="st-game-appid">APPID #{effectiveAppid || "N/A"}</p>
                      <h2>{game?.name || "Unknown AppID"}</h2>
                    </div>
                  </>
                )}
              </div>
            ) : null}

            <div className="st-history">
              <h2>Recent AppIDs</h2>
              <div className="st-history-list">
                {history.length === 0 ? (
                  <p className="st-history-empty">No history yet</p>
                ) : (
                  history.map((item) => (
                    <button key={item} type="button" onClick={() => setQuery(item)} className="st-history-chip">
                      {item}
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="st-panel st-actions-panel">
          <div className="st-actions-head">
            <h2>Available actions</h2>
            <span>{busyAction ? "Request in progress..." : isPremium ? "Premium active" : "Premium inactive"}</span>
          </div>
          <div className="st-actions-grid">
            {ACTIONS.map((action) => {
              const isLocked = PREMIUM_ACTIONS.has(action.id) && !isPremium;
              return (
                <button
                  key={action.id}
                  className={`st-action-btn st-${action.tone} ${isLocked ? "st-locked" : ""}`}
                  type="button"
                  onClick={() => runAction(action.id)}
                  disabled={Boolean(busyAction) || isLocked}
                >
                  {getActionLabel(action, isLocked)}
                </button>
              );
            })}
          </div>
        </section>

        <footer className="st-kicker st-powered-by">powered by steamtools.app</footer>
      </section>

      <aside className="st-toast-zone" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`st-toast st-${toast.type}`}>
            {toast.message}
          </div>
        ))}
      </aside>
    </main>
  );
}
