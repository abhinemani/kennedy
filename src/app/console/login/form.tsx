"use client";

import { useActionState } from "react";
import { attemptSignIn } from "../actions";

export function LoginForm() {
  const [problem, action, pending] = useActionState(attemptSignIn, null);
  return (
    <form action={action} className="panel">
      <label className="field" htmlFor="passphrase">
        Passphrase
      </label>
      <p className="hint field-hint" id="passphrase-hint">
        The one set in the Railway dashboard.
      </p>
      <input aria-describedby="passphrase-hint" id="passphrase" name="passphrase" type="password" autoComplete="current-password" required autoFocus />
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
