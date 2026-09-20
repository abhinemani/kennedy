"use client";

import { useActionState } from "react";
import { attemptSignIn } from "../actions";

export function LoginForm() {
  const [problem, action, pending] = useActionState(attemptSignIn, null);
  return (
    <form action={action} className="panel" style={{ marginTop: 16 }}>
      <label className="field" htmlFor="passphrase">
        Passphrase
        <span className="hint">The one set in the Railway dashboard.</span>
      </label>
      <input id="passphrase" name="passphrase" type="password" autoComplete="current-password" required autoFocus />
      {problem ? (
        <p className="problem" role="alert">
          {problem}
        </p>
      ) : null}
      <div className="nav">
        <span />
        <button className="btn" type="submit" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </div>
    </form>
  );
}
