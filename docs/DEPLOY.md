# Getting Kennedy live on Railway

Everything here happens in a browser. There is no command to run, and nothing on this page
needs a terminal (rule 10).

Do the steps in order. The whole thing takes about fifteen minutes.

## 1. Create the project

1. Go to railway.com and open your dashboard.
2. Press **New Project**, then **Deploy from GitHub repo**.
3. Pick this repository. Railway starts building straight away; that first build will fail
   because there is no database yet. That is expected. Carry on to step 2.

Railway reads `railway.json` in the repository, so the build command, the start command, and
the migration step are already set. There is nothing to configure in the build settings.

## 2. Add the database

1. In the project, press **Create** (or **+ New**), then **Database**, then **Add PostgreSQL**.
2. Open the **Kennedy service**, go to **Variables**, and add a reference variable:
   `DATABASE_URL` set to `${{Postgres.DATABASE_URL}}`.

Railway's own Postgres is a real database in the same project. Nothing else about it needs
touching: the tables are created by the pre-deploy step.

## 3. Set the variables

In the **Kennedy service**, open **Variables** and add each of these.

| Name | What to put in it |
|---|---|
| `OPERATOR_PASSPHRASE` | The passphrase that opens the console. Pick a long one. Do not use `change-me`; the checklist refuses it. |
| `SESSION_SECRET` | A long random string. Any password generator will do. It signs the session cookie. |
| `IP_HASH_SALT` | A different long random string. It scrambles network addresses so they are never stored raw. |
| `SEND_WEBHOOK_SECRET` | Only needed once something reports bounces back to Kennedy. Until it is set, the webhook refuses everything. |
| `ANTHROPIC_API_KEY` | Only needed for the AI follow-up. The survey works without it; leave it out for now if you like. |
| `ANTHROPIC_MODEL` | The model id for the follow-up. Only needed alongside the key. |

`DATABASE_URL` is already there from step 2. Never put any of these in the repository.

## 4. Deploy

Press **Deploy** on the pending changes. Watch the deploy log. You should see
`Migrations are current.` from the pre-deploy step before the app starts.

If a migration fails, the deployment fails on purpose and the previous one keeps serving. The
log names what went wrong.

## 5. Point the domains at it

In the Kennedy service, open **Settings**, then **Networking**, then **Custom Domain**.

1. Add `surveys.ethoslabs.us`. This is the domain in every email, so it is the one that
   carries the sending reputation.
2. Add `console.ethoslabs.us` if you want the console on its own host.
3. Railway shows a target to point at. Add it at your DNS provider as a **CNAME**.

Leave the `ethoslabs.us` root alone so its redirect to abhinemani.com/consulting keeps working.
Adding a subdomain does not disturb it.

## 6. Open the console

Go to `https://console.ethoslabs.us/console` (or `/console` on whichever domain you added) and
sign in with the passphrase from step 3. The setup checklist opens. Work down it.

Two lines will still be amber after this, and that is expected:

- **Registry loaded** waits for the government units file, which arrives in Milestone 1.
- **Postal address and reply-to** are typed into Settings whenever you have them. Nothing can
  be sent until they are there.

## Back up the database

Railway's Postgres does not give you point-in-time restore the way a managed Postgres host
would. The responses in this database cannot be collected twice, so:

1. In the Postgres service, open **Settings** and turn on **Backups**, at the most frequent
   schedule offered.
2. Once Settings, Health, "Download full backup" exists, take one before and after each
   fielding week. That zip of CSVs is yours and does not depend on Railway.

## Later, whenever you need it

| Job | Where |
|---|---|
| Update the app | Merge on GitHub. Railway redeploys by itself. |
| Roll back a bad deploy | Railway, **Deployments**, press the three dots on an earlier one, then **Redeploy**. |
| Change the passphrase | Railway, **Variables**, edit it, then redeploy. |
| Read the logs | Railway, the service's **Deployments** tab. |
| See what the app is doing | The console's **Activity** tab. |

## Before any email goes out

Sending is a later milestone, but the clock on this one is long, so start now.

`surveys.ethoslabs.us` has never sent mail, which is the hardest case for getting past a
government spam filter. It needs SPF, DKIM, and DMARC records, and then two to three weeks of
gradually increasing volume. Nothing in the software shortens that.
