import { redirect } from "next/navigation";
import { isSignedIn } from "@/lib/auth";
import { countEntities, needsReviewCount, registrySample } from "@/db/queries/contacts";
import { ContactsNav } from "../nav";
import { RegistryForm } from "./form";

export const dynamic = "force-dynamic";

export default async function Registry() {
  if (!(await isSignedIn())) redirect("/console/login");

  const [total, sample, review] = await Promise.all([
    countEntities().catch(() => 0),
    registrySample().catch(() => []),
    needsReviewCount().catch(() => 0),
  ]);

  return (
    <>
      <ContactsNav current="/console/contacts/registry" reviewCount={review} />

      <h1>Registry</h1>
      <p className="sub">
        The list of governments everything else hangs off. Contacts attach to one, so this goes in
        first.
      </p>

      <div className="panel" style={{ marginTop: 16 }}>
        <p className="note" style={{ margin: 0 }}>
          {total === 0
            ? "No governments loaded yet."
            : `${total.toLocaleString("en-US")} governments loaded.`}
        </p>
      </div>

      <h2>Upload the government units file</h2>
      <RegistryForm />

      {sample.length > 0 ? (
        <>
          <h2>Most recently added</h2>
          <div className="panel scroll">
            <table>
              <thead>
                <tr>
                  <th>Government</th>
                  <th>State</th>
                  <th>Type</th>
                  <th>Population</th>
                </tr>
              </thead>
              <tbody>
                {sample.map((e) => (
                  <tr key={e.id}>
                    <td>{e.name}</td>
                    <td>{e.state}</td>
                    <td>{e.type.replace("_", " ")}</td>
                    <td>{e.population === null ? "—" : e.population.toLocaleString("en-US")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </>
  );
}
