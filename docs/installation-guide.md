# Macronet Installation Guide

**For studio principals and office managers**

## What does this cost?

Macronet runs on Supabase (free), Vercel (free), and your existing Google Workspace account. For most small studios the monthly cost is **£0/month**.

---

**Before you start:** Set aside around 45 minutes. Keep this guide open alongside your browser — you'll be switching between a few different websites. That's completely normal.

### What you'll need before you begin

- A computer with a web browser (Chrome or Firefox work best)
- Your studio's Google Workspace account — the one with your studio domain (e.g. `yourname@yourstudio.co.uk`). A personal Gmail won't work.
- A free GitHub account — sign up at [github.com](https://github.com). It takes two minutes.

---

## Step 1 — Set up your database (Supabase)

Supabase stores all of your Macronet data — projects, timesheets, team members. Think of it as the filing cabinet behind the app.

1. Go to [supabase.com](https://supabase.com) and click **Start your project**.
2. Sign up with your GitHub account — this keeps things simple.
3. Once logged in, click the green **New project** button.
4. Fill in the project details:
   - **Name:** Something like `macronet-[yourstudio]` (e.g. `macronet-mma`)
   - **Database Password:** Create a strong password and save it somewhere safe — a password manager or a secure note.
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

1. In the left sidebar, click **SQL Editor** (the `>` icon).
2. Click **New query**.
3. Paste the Macronet setup SQL into the editor. (Look for `schema.sql` or `migrations.sql` in the Macronet codebase.)
4. Click the green **Run** button.
5. You should see a success message at the bottom. If you see red error text, take a screenshot and get in touch.

---

## Step 2 — Set up Google sign-in (Google OAuth)

This lets your team sign into Macronet with their existing work Google accounts — no separate passwords needed.

1. Go to [console.cloud.google.com](https://console.cloud.google.com). Sign in with your Google Workspace account if prompted.
2. At the top, click the project selector dropdown (it may say **My First Project**).
3. Click **New Project** in the top right of the popup.
4. Give it a name like `Macronet` and click **Create**.

### Enable the Google+ API

1. In the search bar at the top, type `Google+ API` and select it from the results.
2. Click the blue **Enable** button.

### Set up the consent screen

The consent screen is what your team sees when they first sign in.

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

Before deploying, you need to tell Vercel about all the services you've just set up. On the deployment screen, find the **Environment Variables** section and add each of the following:

| Variable Name | What it is | Where to find it |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service_role key | Supabase → Project Settings → API |
| `GOOGLE_CLIENT_ID` | Google Client ID | Google Cloud → APIs & Services → Credentials |
| `GOOGLE_CLIENT_SECRET` | Google Client Secret | Google Cloud → APIs & Services → Credentials |
| `NEXTAUTH_SECRET` | A random secret string | See instructions below |
| `NEXTAUTH_URL` | Your Vercel app URL | e.g. `https://macronet-mma.vercel.app` |
| `ALLOWED_EMAIL_DOMAIN` | Studio email domain | e.g. `yourstudio.co.uk` |

> **Generating NEXTAUTH_SECRET:** go to [generate-secret.vercel.app/32](https://generate-secret.vercel.app/32), copy the value shown, and paste it in.
>
> **NEXTAUTH_URL:** use your Vercel app address (e.g. `https://macronet-mma.vercel.app`) — you can update this after deploying.

5. Once all variables are filled in, scroll down and click the **Deploy** button.
6. When deployment is complete, copy your app URL from the congratulations screen — you'll need it for the next step.

---

## Step 4 — Finish the Google sign-in setup

Now that you have your Vercel URL, go back and register it with Google. This is what allows Google to securely redirect users back to Macronet after they sign in.

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

Everything is set up. Let's make sure it all works.

1. Open a new browser tab and visit your Macronet app URL.
2. Click **Sign in with Google**.
3. Choose your Google Workspace account (the one with your studio domain).
4. You should be logged in. The first person to sign in becomes the app's administrator.

You can now share the URL with your team. They'll sign in with their own studio Google accounts.

---

## Troubleshooting

| Problem | Solution |
|---|---|
| "I get a Google sign-in error" | The redirect URI doesn't match. Check that the URI in Google Cloud Console exactly matches your Vercel URL, ending in `/api/auth/callback/google`. |
| "Staff from other emails can't sign in" | Check the `ALLOWED_EMAIL_DOMAIN` variable in Vercel. It should be just the domain (e.g. `yourstudio.co.uk`) — no `@` symbol or spaces. |
| "The app deployed but shows an error" | Go to Vercel → Settings → Environment Variables and check every variable has a value with no extra spaces. |
| "The database tables are empty" | Go to Supabase → SQL Editor and re-run the setup SQL script. Look for any red error messages. |

---

Macronet is set up and ready to use. If anything isn't working as expected, don't hesitate to reach out — this is a one-time setup and once it's running, you shouldn't need to touch any of it again.

**Welcome to a more organised studio.**
