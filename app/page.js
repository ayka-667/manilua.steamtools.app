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

const MANIFEST_PROVIDERS = [
  { id: "ryuu", label: "Ryuu API" },
  { id: "manifesthub", label: "ManifestHub" }
];
const BULK_OPTIONS = [3, 5, 10];
const PROVIDER_ACTION_SUPPORT = {
  ryuu: new Set([...ACTIONS.map((action) => action.id), "downloadRandomManifest"]),
  manifesthub: new Set(["downloadManifest"])
};

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

function getProviderHelperText(providerId) {
  if (providerId === "manifesthub") {
    return "Checks GitHub branches and downloads the matching manifest zip.";
  }
  return "Used for manifests, Lua generation, requests, and Bulk Manifest.";
}

export default function HomePage() {
  const [query, setQuery] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const [history, setHistory] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [game, setGame] = useState(null);
  const [gameLoading, setGameLoading] = useState(false);
  const [viewer, setViewer] = useState(null);
  const [viewerLoaded, setViewerLoaded] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [usage, setUsage] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [providerMenuOpen, setProviderMenuOpen] = useState(false);
  const [resolvedAppid, setResolvedAppid] = useState("");
  const [manifestProvider, setManifestProvider] = useState("ryuu");
  const [bulkCount, setBulkCount] = useState(5);
  const [showPremiumPopup, setShowPremiumPopup] = useState(false);
  const [premiumPopupCountdown, setPremiumPopupCountdown] = useState(0);
  const menuRef = useRef(null);
  const providerMenuRef = useRef(null);

  const isAppidValid = useMemo(() => /^\d{1,10}$/.test(query), [query]);
  const effectiveAppid = isAppidValid ? query : resolvedAppid;
  const canRunBulkManifest = PROVIDER_ACTION_SUPPORT[manifestProvider]?.has("downloadRandomManifest");
  const selectedProvider = MANIFEST_PROVIDERS.find((provider) => provider.id === manifestProvider) || MANIFEST_PROVIDERS[0];

  useEffect(() => {
    document.documentElement.dataset.theme = "dark";
  }, []);

  useEffect(() => {
    if (!viewerLoaded || isPremium) {
      setShowPremiumPopup(false);
      return;
    }
    const timeout = window.setTimeout(() => setShowPremiumPopup(true), 450);
    return () => window.clearTimeout(timeout);
  }, [viewerLoaded, isPremium]);

  useEffect(() => {
    if (!showPremiumPopup) {
      setPremiumPopupCountdown(0);
      return;
    }

    setPremiumPopupCountdown(3);
    const intervalId = window.setInterval(() => {
      setPremiumPopupCountdown((prev) => {
        if (prev <= 1) {
          window.clearInterval(intervalId);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [showPremiumPopup]);

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
      setIsAdmin((prev) => prev || Boolean(data.isAdmin));
      setUsage(data.usage || null);
      setViewerLoaded(true);
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
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
      if (providerMenuRef.current && !providerMenuRef.current.contains(event.target)) {
        setProviderMenuOpen(false);
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
    if (actionId === "bulkManifest") {
      await runBulkManifest();
      return;
    }

    if (!PROVIDER_ACTION_SUPPORT[manifestProvider]?.has(actionId)) {
      pushToast("error", "This action is not available with the selected manifest provider.");
      return;
    }

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
        body: JSON.stringify({ appid: effectiveAppid, provider: manifestProvider })
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

  async function runBulkManifest() {
    if (!isPremium) {
      pushToast("error", "Buy the premium Discord role to use Bulk Manifest.");
      return;
    }
    if (!canRunBulkManifest) {
      pushToast("error", "Bulk Manifest is not available with the selected manifest provider.");
      return;
    }

    setBusyAction("bulkManifest");
    let successCount = 0;
    const COOLDOWN_MS = 2_000;

    try {
      for (let index = 0; index < bulkCount; index += 1) {
        let retrying = true;
        let retryCount = 0;
        
        while (retrying) {
          const response = await fetch("/api/action/downloadRandomManifest", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ provider: manifestProvider })
          });

          if (response.status === 429) {
            const retryAfterSec = parseInt(response.headers.get("retry-after") || "2", 10);
            retryCount += 1;
            if (retryCount > 5) {
              throw new Error("Max retry attempts reached due to cooldown.");
            }
            await new Promise((resolve) => setTimeout(resolve, retryAfterSec * 1000));
            continue;
          }

          if (!response.ok) {
            const fail = await response.json().catch(() => ({ error: "Bulk manifest failed." }));
            throw new Error(fail.error || "Bulk manifest failed.");
          }

          const blob = await response.blob();
          const contentDisposition = response.headers.get("content-disposition");
          const fileName = parseFilename(contentDisposition) || `bulk-manifest-${index + 1}.zip`;

          const href = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = href;
          link.download = fileName;
          document.body.appendChild(link);
          link.click();
          link.remove();
          URL.revokeObjectURL(href);
          successCount += 1;
          retrying = false;
          
          if (index < bulkCount - 1) {
            await new Promise((resolve) => setTimeout(resolve, COOLDOWN_MS));
          }
        }
      }

      pushToast("success", `${successCount} random manifests downloaded via ${MANIFEST_PROVIDERS.find((item) => item.id === manifestProvider)?.label}.`);
    } catch (error) {
      pushToast("error", error.message || "Bulk manifest failed.");
    } finally {
      if (successCount > 0) {
        await loadViewer();
      }
      setBusyAction("");
    }
  }

  function getActionLabel(action, isLocked) {
    if (busyAction === action.id) return "Processing...";
    if (isLocked) return `${action.label} (Premium)`;
    if (!PROVIDER_ACTION_SUPPORT[manifestProvider]?.has(action.id)) return `${action.label} (Unavailable)`;
    return action.label;
  }

  return (
    <main className="st-page">
      {!viewerLoaded ? (
        <div className="st-loading-overlay" aria-live="polite">
          <div className="st-loading-orbit" aria-hidden="true">
            <span className="st-loading-ring" />
            <span className="st-loading-dot st-dot-1" />
            <span className="st-loading-dot st-dot-2" />
            <span className="st-loading-dot st-dot-3" />
          </div>
        </div>
      ) : null}
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
            {isAdmin ? (
              <button type="button" onClick={() => (window.location.href = "/admin")}>
                Admin Panel
              </button>
            ) : null}
            <button type="button" onClick={() => signOut({ callbackUrl: "/login" })}>
              Sign out
            </button>
          </div>
        ) : null}
      </div>

      <aside className="st-provider-floating">
        <div className="st-tool-card st-provider-card">
          <label htmlFor="manifest-provider" className="st-field-label">
            Manifest provider
          </label>
          <div className="st-provider-select" ref={providerMenuRef}>
            <button
              id="manifest-provider"
              type="button"
              className={`st-provider-trigger ${providerMenuOpen ? "is-open" : ""}`}
              onClick={() => setProviderMenuOpen((prev) => !prev)}
              aria-haspopup="listbox"
              aria-expanded={providerMenuOpen}
            >
              <span>{selectedProvider.label}</span>
              <span className="st-provider-trigger-icon" aria-hidden="true" />
            </button>
            {providerMenuOpen ? (
              <div className="st-provider-dropdown" role="listbox" aria-labelledby="manifest-provider">
                {MANIFEST_PROVIDERS.map((provider) => (
                  <button
                    key={provider.id}
                    type="button"
                    className={`st-provider-option ${provider.id === manifestProvider ? "is-active" : ""}`}
                    onClick={() => {
                      setManifestProvider(provider.id);
                      setProviderMenuOpen(false);
                    }}
                    role="option"
                    aria-selected={provider.id === manifestProvider}
                  >
                    {provider.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <p className="st-helper">{getProviderHelperText(manifestProvider)}</p>
        </div>
      </aside>

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
              const isUnavailable = !PROVIDER_ACTION_SUPPORT[manifestProvider]?.has(action.id);
              return (
                <button
                  key={action.id}
                  className={`st-action-btn st-${action.tone} ${isLocked || isUnavailable ? "st-locked" : ""}`}
                  type="button"
                  onClick={() => runAction(action.id)}
                  disabled={Boolean(busyAction) || isLocked || isUnavailable}
                >
                  {getActionLabel(action, isLocked)}
                </button>
              );
            })}
          </div>
        </section>

        <section className={`st-panel st-bulk-panel ${!isPremium ? "st-bulk-panel-locked" : ""}`}>
          <div className={`st-bulk-head ${!isPremium ? "st-bulk-head-locked" : ""}`}>
            <div>
              <p className="st-kicker">Bulk Manifest</p>
              <h2>Download random manifests fast</h2>
              <p className="st-helper">
                Picks random AppIDs from the shared game list and downloads them through the provider selected in the floating panel.
              </p>
            </div>
          </div>
          <div className={`st-bulk-card-shell ${!isPremium ? "st-bulk-card-shell-locked" : ""}`}>
            <div className="st-bulk-simple">
              <div className="st-bulk-simple-field">
                <label htmlFor="bulk-count" className="st-field-label st-bulk-label">
                  Bulk amount
                </label>
                <select
                  id="bulk-count"
                  className="st-appid-input st-select-input st-bulk-select"
                  value={bulkCount}
                  onChange={(event) => setBulkCount(Number(event.target.value))}
                  disabled={!isPremium}
                >
                  {BULK_OPTIONS.map((count) => (
                    <option key={count} value={count}>
                      {count} random manifests
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                className={`st-action-btn st-secondary st-bulk-btn ${!isPremium || !canRunBulkManifest ? "st-locked" : ""}`}
                onClick={() => runAction("bulkManifest")}
                disabled={Boolean(busyAction) || !isPremium || !canRunBulkManifest}
              >
                {busyAction === "bulkManifest" ? "Processing..." : `Download ${bulkCount} random manifests`}
              </button>
            </div>
            <p className="st-helper">
              {canRunBulkManifest
                ? "Each file counts like a normal manifest download and respects your current quota."
                : "The selected provider only supports direct manifest downloads by AppID."}
            </p>
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

      {showPremiumPopup ? (
        <div
          className="st-modal-backdrop"
          onClick={() => {
            if (premiumPopupCountdown === 0) {
              setShowPremiumPopup(false);
            }
          }}
        >
          <div className="st-modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="st-modal-top">
              <span className="st-kicker">Get Premium</span>
              <button
                type="button"
                className="st-modal-close"
                onClick={() => setShowPremiumPopup(false)}
                disabled={premiumPopupCountdown > 0}
              >
                {premiumPopupCountdown > 0 ? `Close (${premiumPopupCountdown}s)` : "Close"}
              </button>
            </div>
            <h2>Unlock higher limits and premium-only tools</h2>
            <p className="st-helper">
              Premium gives you faster cooldowns, bigger daily download limits, and access to update features.
            </p>
            <button
              type="button"
              className="st-login-btn"
              onClick={() => {
                setShowPremiumPopup(false);
                if (viewer?.premiumUrl) {
                  window.open(viewer.premiumUrl, "_blank", "noopener,noreferrer");
                  return;
                }
                pushToast("error", "Premium link not configured yet.");
              }}
            >
              Get Premium
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
