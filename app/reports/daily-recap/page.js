import {
  AdminOverviewShareCard,
  AdminTopGamesShareCard,
  AdminTopUsersShareCard,
  formatPercent
} from "../../../lib/admin-report-cards";
import { getDailyReportStats } from "../../../lib/stats-store";
import {
  formatDisplayDate,
  parseIsoDateParts,
  REPORT_TIME_ZONE,
  shiftDateParts,
  zonedMidnightToUtcMs
} from "../../../lib/report-time";

export const dynamic = "force-dynamic";

function isAuthorized(token) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && token === secret;
}

function buildOverviewProps(stats) {
  const totalTierDownloads = (stats.allTimeOverview.premiumDownloads || 0) + (stats.allTimeOverview.standardDownloads || 0);
  const premiumShare = totalTierDownloads > 0 ? (stats.allTimeOverview.premiumDownloads / totalTierDownloads) * 100 : 0;

  return {
    overview: {
      downloadsToday: stats.dayOverview.totalDownloads,
      totalDownloads: stats.allTimeOverview.totalDownloads,
      usersToday: stats.dayOverview.uniqueUsers,
      totalGames: stats.allTimeOverview.uniqueGames,
      gamesToday: stats.dayOverview.uniqueGames
    },
    trackedUsers: stats.dayOverview.uniqueUsers,
    premiumShare,
    cooldownActive: 0,
    latestGame: stats.latestDownload?.gameName || "-"
  };
}

export default async function DailyRecapReportPage({ searchParams }) {
  const params = await searchParams;
  if (!isAuthorized(params?.token || "")) {
    return (
      <main className="st-report-page">
        <p className="st-report-error">Unauthorized.</p>
      </main>
    );
  }

  const dateParts = parseIsoDateParts(params?.date);
  if (!dateParts) {
    return (
      <main className="st-report-page">
        <p className="st-report-error">Invalid date.</p>
      </main>
    );
  }

  const card = params?.card || "overview";
  const startMs = zonedMidnightToUtcMs(dateParts, REPORT_TIME_ZONE);
  const endMs = zonedMidnightToUtcMs(shiftDateParts(dateParts, 1), REPORT_TIME_ZONE);
  const stats = await getDailyReportStats(startMs, endMs);
  const dateLabel = formatDisplayDate(dateParts);
  const overviewProps = buildOverviewProps(stats);

  if (card === "combined") {
    return (
      <main className="st-report-page st-report-page-transparent">
        <section className="st-report-combined-shell" data-report-root="combined">
          <AdminOverviewShareCard {...overviewProps} badge="Today + Lifetime" />
          <AdminTopGamesShareCard rows={stats.topGames} title="Top Games Today" badge="Today" />
          <AdminTopUsersShareCard rows={stats.topUsers} title="Top Users Today" badge="Today" />
        </section>
      </main>
    );
  }

  return (
    <main className="st-report-page">
      <section className="st-report-shell" data-report-root="single">
        <div className="st-report-date">Daily recap for {dateLabel}</div>
        {card === "overview" ? <AdminOverviewShareCard {...overviewProps} badge="Today + All-time" /> : null}
        {card === "games" ? <AdminTopGamesShareCard rows={stats.topGames} title="Top Games Today" badge="Today" /> : null}
        {card === "users" ? <AdminTopUsersShareCard rows={stats.topUsers} title="Top Users Today" badge="Today" /> : null}
        <div className="st-report-footer">Time zone: Europe/Paris | Premium share: {formatPercent(overviewProps.premiumShare)}</div>
      </section>
    </main>
  );
}
