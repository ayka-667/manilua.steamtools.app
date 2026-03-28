import { ImageResponse } from "next/og";

export const REPORT_IMAGE_SIZE = {
  width: 1200,
  height: 630
};

function baseCard(children) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        background:
          "radial-gradient(circle at top left, rgba(126,87,255,0.35), transparent 28%), radial-gradient(circle at top right, rgba(68,197,255,0.24), transparent 24%), linear-gradient(180deg, #111322 0%, #090b14 100%)",
        color: "#f5f7ff",
        padding: 36,
        fontFamily: "sans-serif"
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          borderRadius: 28,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(7,9,18,0.72)",
          padding: 30
        }}
      >
        {children}
      </div>
    </div>
  );
}

function header(title, badge, dateLabel) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        marginBottom: 22
      }}
    >
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div
          style={{
            display: "flex",
            fontSize: 18,
            textTransform: "uppercase",
            letterSpacing: 3,
            color: "rgba(255,255,255,0.66)",
            marginBottom: 8
          }}
        >
          SteamTools Daily Recap
        </div>
        <div style={{ display: "flex", fontSize: 46, fontWeight: 800, lineHeight: 1 }}>{title}</div>
        <div style={{ display: "flex", fontSize: 22, color: "rgba(255,255,255,0.72)", marginTop: 10 }}>
          {dateLabel}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 20,
          padding: "10px 16px",
          borderRadius: 999,
          border: "1px solid rgba(255,255,255,0.14)",
          background: "rgba(255,255,255,0.06)"
        }}
      >
        {badge}
      </div>
    </div>
  );
}

function metric(value, label) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minWidth: 0,
        borderRadius: 22,
        border: "1px solid rgba(255,255,255,0.1)",
        background: "rgba(255,255,255,0.05)",
        padding: 22
      }}
    >
      <div style={{ display: "flex", fontSize: 42, fontWeight: 800, lineHeight: 1 }}>{String(value)}</div>
      <div style={{ display: "flex", fontSize: 20, color: "rgba(255,255,255,0.68)", marginTop: 8 }}>{label}</div>
    </div>
  );
}

function rankRow(index, title, subtitle, value, suffix = "downloads") {
  return (
    <div
      key={`${index}-${title}-${value}`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        borderRadius: 20,
        border: "1px solid rgba(255,255,255,0.1)",
        background: "rgba(255,255,255,0.05)",
        padding: "16px 18px"
      }}
    >
      <div
        style={{
          width: 50,
          height: 50,
          borderRadius: 16,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #7e57ff 0%, #41c2ff 100%)",
          fontSize: 24,
          fontWeight: 800
        }}
      >
        #{index + 1}
      </div>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", fontSize: 26, fontWeight: 700 }}>{title}</div>
        <div style={{ display: "flex", fontSize: 18, color: "rgba(255,255,255,0.68)", marginTop: 4 }}>{subtitle}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
        <div style={{ display: "flex", fontSize: 32, fontWeight: 800 }}>{String(value)}</div>
        <div style={{ display: "flex", fontSize: 18, color: "rgba(255,255,255,0.68)", marginTop: 4 }}>{suffix}</div>
      </div>
    </div>
  );
}

export function renderOverviewReportImage({ dateLabel, dayOverview, allTimeOverview, latestDownload }) {
  const totalTierDownloads = (allTimeOverview.premiumDownloads || 0) + (allTimeOverview.standardDownloads || 0);
  const premiumShare = totalTierDownloads > 0 ? Math.round((allTimeOverview.premiumDownloads / totalTierDownloads) * 100) : 0;

  return new ImageResponse(
    baseCard(
      <>
        {header("Overview", "Day + All-time", dateLabel)}
        <div style={{ display: "flex", gap: 16, marginBottom: 18 }}>
          {metric(dayOverview.totalDownloads, "Day downloads")}
          {metric(dayOverview.uniqueUsers, "Day users")}
          {metric(allTimeOverview.totalDownloads, "All-time downloads")}
          {metric(allTimeOverview.uniqueGames, "All-time games")}
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            borderRadius: 22,
            border: "1px solid rgba(255,255,255,0.1)",
            background: "rgba(255,255,255,0.05)",
            padding: 22,
            fontSize: 24
          }}
        >
          <div style={{ display: "flex" }}>Day manifest downloads: {dayOverview.manifestDownloads}</div>
          <div style={{ display: "flex" }}>Day Lua downloads: {dayOverview.luaDownloads}</div>
          <div style={{ display: "flex" }}>All-time premium share: {premiumShare}%</div>
          <div style={{ display: "flex" }}>Latest game in recap: {latestDownload?.gameName || "-"}</div>
        </div>
      </>
    ),
    REPORT_IMAGE_SIZE
  );
}

export function renderTopGamesReportImage({ dateLabel, topGames }) {
  return new ImageResponse(
    baseCard(
      <>
        {header("Top Games", "Day ranking", dateLabel)}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {topGames.length === 0 ? (
            <div
              style={{
                display: "flex",
                borderRadius: 20,
                border: "1px dashed rgba(255,255,255,0.14)",
                background: "rgba(255,255,255,0.04)",
                padding: 22,
                fontSize: 24,
                color: "rgba(255,255,255,0.72)"
              }}
            >
              No downloads were recorded for this day.
            </div>
          ) : (
            topGames.map((row, index) => rankRow(index, row.gameName, `AppID ${row.appid}`, row.totalDownloads))
          )}
        </div>
      </>
    ),
    REPORT_IMAGE_SIZE
  );
}

export function renderTopUsersReportImage({ dateLabel, topUsers }) {
  return new ImageResponse(
    baseCard(
      <>
        {header("Top Users", "Day ranking", dateLabel)}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {topUsers.length === 0 ? (
            <div
              style={{
                display: "flex",
                borderRadius: 20,
                border: "1px dashed rgba(255,255,255,0.14)",
                background: "rgba(255,255,255,0.04)",
                padding: 22,
                fontSize: 24,
                color: "rgba(255,255,255,0.72)"
              }}
            >
              No user activity was recorded for this day.
            </div>
          ) : (
            topUsers.map((row, index) =>
              rankRow(index, row.userId, `${row.premiumDownloads} premium / ${row.standardDownloads} standard`, row.totalDownloads)
            )
          )}
        </div>
      </>
    ),
    REPORT_IMAGE_SIZE
  );
}
