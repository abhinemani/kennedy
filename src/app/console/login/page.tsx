import { redirect } from "next/navigation";
import { isSignedIn } from "@/lib/auth";
import { LoginForm } from "./form";

export const dynamic = "force-dynamic";

export default async function Login() {
  if (await isSignedIn()) redirect("/console");
  return (
    <>
      <h1>Sign in</h1>
      <p className="sub">This console is for the operator running the studies.</p>
      <LoginForm />
    </>
  );
}
