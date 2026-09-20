# Getting Kennedy live

Everything here happens in a browser. There is no command to run, and nothing on this page
needs a terminal (rule 10).

Do the steps in order. The whole thing takes about fifteen minutes.

## 1. Import the repository into Vercel

1. Go to vercel.com and sign in with GitHub.
2. Press **Add New**, then **Project**.
3. Find this repository and press **Import**.
4. Leave the framework as Next.js and the build settings alone. Vercel runs the
   `vercel-build` script in `package.json`, which applies migrations and then builds.
5. **Do not press Deploy yet.** The first deploy will fail without a database. Go to step 2,
   then come back and deploy.

## 2. Add the database

1. In the project, open the **Storage** tab.
2. Press **Create Database**, choose **Neon** (Serverless Postgres), and accept the free plan.
3. Connect it to this project for Production, Preview, and Development.

Neon sets `DATABASE_URL` for you. Nothing else about the database needs touching: the tables
are created during the build.

## 3. Set the environment variables

In the project, open **Settings**, then **Environment Variables**. Add each of these for
Production, Preview, and Development.

| Name | What to put in it |
|---|---|
| `OPERATOR_PASSPHRASE` | The passphrase that opens the console. Pick a long one. Do not use `change-me`; the checklist refuses it. |
| `SESSION_SECRET` | A long random string. Any password generator will do. It signs the session cookie. |
| `IP_HASH_SALT` | A different long random string. It scrambles network addresses so they are never stored raw. |
| `ANTHROPIC_API_KEY` | Only needed for the AI follow-up. The survey works without it; leave it out for now if you like. |
| `ANTHROPIC_MODEL` | The model id for the follow-up. Only needed alongside the key. |

`DATABASE_URL` is already there from step 2. Never put any of these in the repository.

## 4. Deploy

Press **Deploy**. Watch the build log. You should see `Migrations are current.` before the
Next.js build starts.

If a migration fails, the build fails on purpose and the previous deployment keeps serving.
The log names what went wrong.

## 5. Point the domains at it

In the project, open **Settings**, then **Domains**.

1. Add `surveys.ethoslabs.us`. This is the domain in every email, so it is the one that
   carries the sending reputation.
2. Add `console.ethoslabs.us` if you want the console on its own host.
3. Vercel shows the DNS record to create. Add it at your DNS provider as a **CNAME**.

**Do not let Vercel take over the nameservers for `ethoslabs.us`.** Add the individual records
instead. Taking over the nameservers would drop the root redirect to abhinemani.com/consulting.

## 6. Open the console

Go to `https://console.ethoslabs.us/console` (or `/console` on whichever domain you added) and
sign in with the passphrase from step 3. The setup checklist opens. Work down it.

Two lines will still be amber after this, and that is expected:

- **Registry loaded** waits for the government units file, which arrives in Milestone 1.
- **Postal address and reply-to** are typed into Settings whenever you have them. Nothing can
  be sent until they are there.

## Later, whenever you need it

| Job | Where |
|---|---|
| Update the app | Merge on GitHub. Vercel redeploys by itself. |
| Roll back a bad deploy | Vercel, **Deployments**, press **Promote** on an earlier one. |
| Change the passphrase | Vercel, **Settings**, **Environment Variables**, then **Redeploy**. |
| See what the app is doing | The console's **Activity** tab. |

## Before any email goes out

Sending is a later milestone, but the clock on this one is long, so start now.

`surveys.ethoslabs.us` has never sent mail, which is the hardest case for getting past a
government spam filter. It needs SPF, DKIM, and DMARC records, and then two to three weeks of
gradually increasing volume. Nothing in the software shortens that.
