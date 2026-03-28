import { ImageResponse } from "next/og";

export const REPORT_IMAGE_SIZE = {
  width: 1200,
  height: 630
};

const COLORS = {
  text: "#f5f7ff",
  muted: "rgba(245,247,255,0.72)",
  border: "rgba(255,255,255,0.10)",
  borderStrong: "rgba(255,255,255,0.14)",
  panel: "rgba(255,255,255,0.05)",
  badge: "rgba(255,255,255,0.06)",
  shell: "#101321",
  shellAlt: "#0a0b16",
  accentA: "#875cff",
  accentB: "#5dd3ff"
};

function page(children) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        padding: 28,
        background: COLORS.shellAlt,
        color: COLORS.text,
        fontFamily: "sans-serif"
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: 26,
          borderRadius: 24,
          border: `1px solid ${COLORS.borderStrong}`,
          background: COLORS.shell,
          position: "relative"
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 24,
            background:
              "linear-gradient(135deg, rgba(135,92,255,0.18) 0%, rgba(135,92,255,0.00) 38%, rgba(93,211,255,0.15) 100%)"
          }}
        />
        <div style={{ display: "flex", flexDirection: "column", position: "relative", width: "100%", height: "100%" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function cardHeader(kicker, title, badge, dateLabel) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div
          style={{
            display: "flex",
            marginBottom: 8,
            fontSize: 16,
            textTransform: "uppercase",
            letterSpacing: 3,
            color: COLORS.muted
          }}
        >
          {kicker}
        </div>
        <div style={{ display: "flex", fontSize: 42, fontWeight: 800, lineHeight: 1 }}>{title}</div>
        <div style={{ display: "flex", marginTop: 10, fontSize: 20, color: COLORS.muted }}>{dateLabel}</div>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "10px 16px",
          borderRadius: 999,
          border: `1px solid ${COLORS.borderStrong}`,
          background: COLORS.badge,
          fontSize: 18
        }}
      >
        {badge}
      </div>
    </div>
  );
}

function metricCard(value, label) {
  return (
    <div
      style={{
        width: 250,
        minHeight: 118,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: 18,
        borderRadius: 18,
        border: `1px solid ${COLORS.border}`,
        background: COLORS.panel
      }}
    >
      <div style={{ display: "flex", fontSize: 38, fontWeight: 800, lineHeight: 1 }}>{String(value)}</div>
      <div style={{ display: "flex", marginTop: 8, fontSize: 18, color: COLORS.muted }}>{label}</div>
    </div>
  );
}

function infoPanel(lines) {
  return (
    <div
      style={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        padding: "18px 20px",
        borderRadius: 18,
        border: `1px solid ${COLORS.border}`,
        background: COLORS.panel
      }}
    >
      {lines.map((line, index) => (
        <div
          key={`${index}-${line}`}
          style={{
            display: "flex",
            fontSize: 22,
            color: COLORS.muted,
            marginTop: index === 0 ? 0 : 10
          }}
        >
          {line}
        </div>
      ))}
    </div>
  );
}

function rankBadge(index) {
  return (
    <div
      style={{
        width: 48,
        height: 48,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 14,
        background: `linear-gradient(135deg, ${COLORS.accentA}, ${COLORS.accentB})`,
        color: "#fff",
        fontSize: 22,
        fontWeight: 800,
        flexShrink: 0
      }}
    >
      #{index + 1}
    </div>
  );
}

function rankRow(index, title, subtitle, value) {
  return (
    <div
      key={`${index}-${title}-${value}`}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        padding: "14px 16px",
        borderRadius: 18,
        border: `1px solid ${COLORS.border}`,
        background: COLORS.panel
      }}
    >
      {rankBadge(index)}
      <div style={{ display: "flex", flexDirection: "column", marginLeft: 14, flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", fontSize: 24, fontWeight: 700 }}>{title}</div>
        <div style={{ display: "flex", marginTop: 4, fontSize: 17, color: COLORS.muted }}>{subtitle}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", marginLeft: 12 }}>
        <div style={{ display: "flex", fontSize: 28, fontWeight: 800 }}>{String(value)}</div>
        <div style={{ display: "flex", marginTop: 4, fontSize: 17, color: COLORS.muted }}>downloads</div>
      </div>
    </div>
  );
}

function emptyState(message) {
  return (
    <div
      style={{
        width: "100%",
        display: "flex",
        padding: "18px 20px",
        borderRadius: 18,
        border: `1px dashed ${COLORS.borderStrong}`,
        background: "rgba(255,255,255,0.04)",
        fontSize: 22,
        color: COLORS.muted
      }}
    >
      {message}
    </div>
  );
}

export function renderOverviewReportImage({ dateLabel, dayOverview, allTimeOverview, latestDownload }) {
  const totalTierDownloads = (allTimeOverview.premiumDownloads || 0) + (allTimeOverview.standardDownloads || 0);
  const premiumShare = totalTierDownloads > 0 ? Math.round((allTimeOverview.premiumDownloads / totalTierDownloads) * 100) : 0;

  return new ImageResponse(
    page(
      <>
        {cardHeader("SteamTools Report", "Overview", "Today + All-time", dateLabel)}
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
          {metricCard(dayOverview.totalDownloads, "Downloads today")}
          {metricCard(allTimeOverview.totalDownloads, "All-time downloads")}
          {metricCard(dayOverview.uniqueUsers, "Users today")}
          {metricCard(allTimeOverview.uniqueGames, "All-time games")}
        </div>
        {infoPanel([
          `Unique games today: ${dayOverview.uniqueGames}`,
          `All-time premium share: ${premiumShare}%`,
          `Manifest today: ${dayOverview.manifestDownloads} / Lua today: ${dayOverview.luaDownloads}`,
          `Latest game: ${latestDownload?.gameName || "-"}`
        ])}
      </>
    ),
    REPORT_IMAGE_SIZE
  );
}

export function renderTopGamesReportImage({ dateLabel, topGames }) {
  return new ImageResponse(
    page(
      <>
        {cardHeader("SteamTools Rankings", "Top Games Today", "Today", dateLabel)}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {topGames.length === 0
            ? emptyState("No downloads were recorded today.")
            : topGames.map((row, index) => rankRow(index, row.gameName, `AppID ${row.appid}`, row.totalDownloads))}
        </div>
      </>
    ),
    REPORT_IMAGE_SIZE
  );
}

export function renderTopUsersReportImage({ dateLabel, topUsers }) {
  return new ImageResponse(
    page(
      <>
        {cardHeader("SteamTools Rankings", "Top Users Today", "Today", dateLabel)}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {topUsers.length === 0
            ? emptyState("No user activity was recorded today.")
            : topUsers.map((row, index) =>
                rankRow(index, row.userId, `${row.premiumDownloads} premium / ${row.standardDownloads} standard`, row.totalDownloads)
              )}
        </div>
      </>
    ),
    REPORT_IMAGE_SIZE
  );
}
