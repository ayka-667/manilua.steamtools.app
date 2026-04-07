import PremiumClient from "./premium-client";

export const metadata = {
  title: "Premium - SteamTools"
};

export default function PremiumPage() {
  return (
    <main className="st-page st-premium-page">
      <PremiumClient />
    </main>
  );
}
