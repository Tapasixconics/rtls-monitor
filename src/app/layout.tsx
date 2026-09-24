import "./globals.css";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "RTLS Monitor", description: "Real-time location system proof of concept", icons: { icon: [] } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
