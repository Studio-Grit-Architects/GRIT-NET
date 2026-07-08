# Macronet

A studio management app for small architecture practices. Macronet brings together time tracking, project management, and meeting transcription in one place — built to run free on Vercel and Supabase.

Each studio deploys their own instance. Your data stays in your own database.

---

## What you'll need

- A computer with a web browser (Chrome or Firefox work best)
- Your studio's **Google Workspace account** — the one with your studio domain (e.g. `yourname@yourstudio.co.uk`). A personal Gmail won't work.
- A free **GitHub account** — sign up at [github.com](https://github.com)

Set aside around 45 minutes for the initial setup. Keep this guide open alongside your browser — you'll be switching between a few different websites. That's completely normal.

---

## Step 1 — Set up your database (Supabase)

Supabase stores all of your Macronet data — projects, timesheets, team members. Think of it as the filing cabinet behind the app.

1. Go to [supabase.com](https://supabase.com) and click **Start your project**.
2. Sign up with your GitHub account — this keeps things simple.
3. Once logged in, click the green **New project** button.
4. Fill in the project details:
   - **Name:** Something like `macronet-[yourstudio]` (e.g. `macronet-mma`)
   - **Database Password:** Create a strong password and save it somewhere safe.
   - **Region:** Choose the one closest to your country. For UK studios, pick **West EU (Ireland)**.
5. Click **Create new project** and wait about a minute while Supabase sets things up.

### Copy your API keys

1. In the left sidebar, click **Project Settings** (the cog icon near the bottom).
2. Click **API** in the settings menu.
3. Copy these three values into a notes document:
   - **Project URL** — looks like `https://xxxxxxxxxxx.supabase.co`
   - **anon / public key** — a long string of letters and numbers
   - **service_role key** — listed just below. Treat this like a password.

### Set up the database tables

Run the following SQL files in order. For each one: go to **SQL Editor → New query**, paste the file contents, and click **Run**.

1. `supabase-test-setup.sql` — creates all tables and seed data
2. `supabase-update-9.sql` — adds meeting transcription tables
3. `supabase-rls-lockdown.sql` — locks down database access (important — do not skip)

You should see a success message after each one. If you see red error text, check you ran them in order.

> **Note:** Do not run `supabase-schema.sql` or the older `supabase-update-*.sql` files — `supabase-test-setup.sql` replaces all of them.

---

## Step 2 — Set up Google sign-in (Google OAuth)

This lets your team sign into Macronet with their existing work Google accounts — no separate passwords needed.

1. Go to [console.cloud.google.com](https://console.cloud.google.com). Sign in with your Google Workspace account.
2. At the top, click the project selector dropdown (it may say **My First Project**).
3. Click **New Project** in the top right of the popup.
4. Give it a name like `Macronet` and click **Create**.

### Enable the required APIs

Search for and enable each of these in the API Library:

- **Gmail API** (for email digest and project thread features)
- **Google Calendar API** (for the calendar view)

### Set up the consent screen

1. In the left sidebar, navigate to **APIs & Services → OAuth consent screen**.
2. Under **User Type**, select **Internal**. This restricts sign-in to your Google Workspace domain only — no one outside your studio can log in.
3. Click **Create**.
4. Fill in: **App name** (Macronet), **User support email**, and **Developer contact information**.
5. Click **Save and Continue** through the remaining screens, then **Back to Dashboard**.

### Create your sign-in credentials

1. In the left sidebar, go to **APIs & Services → Credentials**.
2. Click **+ Create Credentials** and choose **OAuth client ID**.
3. Under **Application type**, select **Web application**.
4. Give it a name like `Macronet Web`.
5. Under **Authorised redirect URIs**, leave this blank for now — you'll fill it in after the next step. Click **Create**.
6. From the popup, copy your **Client ID** and **Client Secret** into your notes document.

---

## Step 3 — Deploy the app (Vercel)

Vercel puts Macronet on the internet and gives it a web address your team can visit.

1. Go to [vercel.com](https://vercel.com) and click **Sign Up**.
2. Choose **Continue with GitHub**.
3. Once logged in, click **Add New…** and select **Project**.
4. Find the Macronet repository in the list and click **Import**.

### Add your environment variables

Before deploying, find the **Environment Variables** section and add each of the following:

| Variable | What it is | Where to find it |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service_role key | Supabase → Project Settings → API |
| `GOOGLE_CLIENT_ID` | Google Client ID | Google Cloud → APIs & Services → Credentials |
| `GOOGLE_CLIENT_SECRET` | Google Client Secret | Google Cloud → APIs & Services → Credentials |
| `NEXTAUTH_SECRET` | A random secret string | Run: `openssl rand -base64 32` or use [generate-secret.vercel.app/32](https://generate-secret.vercel.app/32) |
| `NEXTAUTH_URL` | Your Vercel app URL | e.g. `https://macronet-mma.vercel.app` — update after deploying |
| `ALLOWED_EMAIL_DOMAIN` | Studio email domain | e.g. `yourstudio.co.uk` — no `@` symbol |
| `ADMIN_EMAIL` | First admin's email address | e.g. `principal@yourstudio.co.uk` |

### Firm name (shown in the app header and AI assistant)

| Variable | Example |
|---|---|
| `NEXT_PUBLIC_FIRM_NAME` | `Your Studio Name` |

### AI features (optional)

The core app (timesheets, projects, team) works without these. Add them when you're ready.

| Variable | What it enables | Where to get it |
|---|---|---|
| `ANTHROPIC_API_KEY` | Studio chat, meeting summaries, email digest | [console.anthropic.com](https://console.anthropic.com) |
| `DEEPGRAM_API_KEY` | Meeting transcription (~$0.26/hr, $200 free credit) | [deepgram.com](https://deepgram.com) |

5. Once all variables are filled in, scroll down and click **Deploy**.
6. When deployment is complete, copy your app URL — you'll need it for the next step.

---

## Step 4 — Finish the Google sign-in setup

Now that you have your Vercel URL, go back and register it with Google.

1. Go back to [console.cloud.google.com](https://console.cloud.google.com).
2. Navigate to **APIs & Services → Credentials**.
3. Click on the **Macronet Web** credential you created in Step 2.
4. Under **Authorised redirect URIs**, click **+ Add URI**.
5. Enter the following — replacing the URL with your actual Vercel address:
   ```
   https://your-vercel-url.vercel.app/api/auth/callback/google
   ```
6. Click **Save**.

---

## Step 5 — First sign-in

1. Open a new browser tab and visit your Macronet app URL.
2. Click **Sign in with Google**.
3. Choose your Google Workspace account (the one with your studio domain).
4. You should be logged in. The first person to sign in from the `ADMIN_EMAIL` address becomes the app's administrator.

You can now share the URL with your team. They'll sign in with their own studio Google accounts.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| "I get a Google sign-in error" | The redirect URI doesn't match. Check that the URI in Google Cloud Console exactly matches your Vercel URL, ending in `/api/auth/callback/google`. |
| "Staff from other emails can't sign in" | Check the `ALLOWED_EMAIL_DOMAIN` variable in Vercel. It should be just the domain (e.g. `yourstudio.co.uk`) — no `@` symbol or spaces. |
| "The app deployed but shows an error" | Go to Vercel → Settings → Environment Variables and check every variable has a value with no extra spaces. |
| "The database tables are empty" | Go to Supabase → SQL Editor and re-run the setup SQL scripts in order. Look for any red error messages. |

---

## Licence

[AGPL-3.0](LICENSE) — free to use and self-host. If you modify and distribute this software, your modifications must also be open source under the same licence.
