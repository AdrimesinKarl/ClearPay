import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "ClearPay",
  description:
    "ClearPay campus checkout: one verified Paiflow testnet payment for multiple university offices",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
