import React from "react";

export function formatPercent(value) {
  return `${Math.round(value)}%`;
}

export function AdminOverviewShareCard({ overview, trackedUsers, premiumShare, cooldownActive, latestGame, badge = "Today + Lifetime" }) {
  return (
    <article className="st-admin-share-card" data-report-card-root="overview">
      <div className="st-admin-share-head">
        <div>
          <p className="st-admin-share-kicker">SteamTools Report</p>
          <h2>Overview</h2>
        </div>
        <span className="st-admin-share-badge">{badge}</span>
      </div>
      <div className="st-admin-share-metrics">
        <div>
          <strong>{overview.downloadsToday ?? 0}</strong>
          <span>Downloads today</span>
        </div>
        <div>
          <strong>{overview.totalDownloads ?? 0}</strong>
          <span>All-time downloads</span>
        </div>
        <div>
          <strong>{overview.usersToday ?? 0}</strong>
          <span>Users today</span>
        </div>
        <div>
          <strong>{overview.totalGames ?? 0}</strong>
          <span>All-time games</span>
        </div>
      </div>
      <div className="st-admin-share-info">
        <p>Tracked users today: {trackedUsers ?? 0}</p>
        <p>Unique games today: {overview.gamesToday ?? 0}</p>
        <p>All-time premium share: {formatPercent(premiumShare ?? 0)}</p>
        <p>Cooldowns active: {cooldownActive ?? 0}</p>
        <p>Latest game: {latestGame || "-"}</p>
      </div>
    </article>
  );
}

export function AdminTopGamesShareCard({ rows, title = "Top Games Today", badge = "Today" }) {
  return (
    <article className="st-admin-share-card" data-report-card-root="games">
      <div className="st-admin-share-head">
        <div>
          <p className="st-admin-share-kicker">SteamTools Rankings</p>
          <h2>{title}</h2>
        </div>
        <span className="st-admin-share-badge">{badge}</span>
      </div>
      <div className="st-admin-share-list">
        {rows.length === 0 ? (
          <p className="st-admin-share-empty">No downloads recorded today.</p>
        ) : (
          rows.map((row, index) => (
            <div key={`${row.appid || row.userId}-${index}`} className="st-admin-share-row">
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
  );
}

export function AdminTopUsersShareCard({ rows, title = "Top Users Today", badge = "Today" }) {
  return (
    <article className="st-admin-share-card" data-report-card-root="users">
      <div className="st-admin-share-head">
        <div>
          <p className="st-admin-share-kicker">SteamTools Rankings</p>
          <h2>{title}</h2>
        </div>
        <span className="st-admin-share-badge">{badge}</span>
      </div>
      <div className="st-admin-share-list">
        {rows.length === 0 ? (
          <p className="st-admin-share-empty">No user activity recorded today.</p>
        ) : (
          rows.map((row, index) => (
            <div key={`${row.userId}-${index}`} className="st-admin-share-row">
              <span className="st-admin-share-rank">#{index + 1}</span>
              <div className="st-admin-share-main">
                <strong>{row.userId}</strong>
                <span>
                  {row.premiumDownloads} premium / {row.standardDownloads} standard
                </span>
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
  );
}
