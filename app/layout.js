import "./globals.css";

export const metadata = {
  title: "SteamTools",
  description: "Secure Steam manifest and Lua management tools"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
