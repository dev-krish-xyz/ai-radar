import type { Metadata, Viewport } from "next";
import { AppChrome } from "@/components/Nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Radar",
  description: "What just happened in AI — personal intelligence feed",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f5f5f7",
};

export const dynamic = "force-dynamic";

/** Default is light. Ignore OS dark mode and the old auto-theme key so Light is actually reachable. */
const THEME_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("appearance");
    var theme = stored === "dark" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", theme);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "dark" ? "#1c1c1e" : "#f5f5f7");
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <AppChrome>{children}</AppChrome>
      </body>
    </html>
  );
}
