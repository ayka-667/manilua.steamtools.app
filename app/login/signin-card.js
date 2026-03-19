"use client";

import { signIn } from "next-auth/react";

export default function LoginCard() {
  return (
    <main className="st-page st-login-page">
      <section className="st-login-card">
        <p className="st-kicker">steamtools.app</p>
        <h1>Discord login required</h1>
        <p className="st-subtitle">Sign in with Discord to access manifest, Lua, and update tools.</p>
        <button className="st-login-btn" type="button" onClick={() => signIn("discord", { callbackUrl: "/" })}>
          Continue with Discord
        </button>
      </section>
    </main>
  );
}
