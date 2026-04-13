# SnapAds Manager

A bulk Snapchat ad campaign creation platform built with Next.js 14. Connect your Snapchat Business account via OAuth2 and create Campaigns, Ad Sets, and Ads in bulk through a guided 4-step wizard.

**Live:** https://boilerroom-two.vercel.app

---

## Features

- Snapchat OAuth2 authentication (Business Manager)
- Select from your ad accounts
- 4-step bulk creation wizard:
  - Step 1: Define multiple campaigns (name, objective, budget, dates)
  - Step 2: Define ad sets (targeting, bid strategy, placement)
  - Step 3: Upload creatives (drag & drop image/video + headline)
  - Step 4: Review and launch everything in one click
- Live submission progress per entity
- Automatic token refresh

## Stack

- **Framework:** Next.js 14 (App Router), TypeScript, Tailwind CSS
- **Auth:** Snapchat OAuth2 + iron-session (encrypted HttpOnly cookies)
- **Forms:** react-hook-form + Zod
- **State:** Zustand
- **API:** Snapchat Marketing API v1

## Local Development

**Prerequisites:** Node.js 20+ (install via NVM)

```bash
# Install NVM
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash

# Install Node
source ~/.nvm/nvm.sh && nvm install 20
```

**Setup:**

```bash
# Install dependencies
npm install

# Copy env file and fill in your credentials
cp .env.example .env.local
```

Fill in `.env.local`:

```
SNAPCHAT_CLIENT_ID=your_client_id
SNAPCHAT_CLIENT_SECRET=your_client_secret
SNAPCHAT_REDIRECT_URI=https://your-tunnel-url/api/auth/callback
NEXT_PUBLIC_APP_URL=https://your-tunnel-url
SESSION_SECRET=your_64_char_hex_secret  # openssl rand -hex 32
```

**Run:**

```bash
# Start dev server
source ~/.nvm/nvm.sh && npm run dev

# In a second terminal, start HTTPS tunnel (required for Snapchat OAuth)
cloudflared tunnel --url http://localhost:3000
```

Use the cloudflared URL as your redirect URI in the Snap OAuth app and in `.env.local`.

## Snap OAuth App Setup

1. Go to business.snapchat.com → Business Details → OAuth Apps
2. Create a new OAuth app
3. Set redirect URI to your app URL + `/api/auth/callback`
4. Copy Client ID and Client Secret into `.env.local`

## Deployment

Deployed on Vercel. Push to `main` branch triggers auto-deploy.

Required environment variables on Vercel:

| Variable | Description |
|---|---|
| `SNAPCHAT_CLIENT_ID` | From Snap Business Manager OAuth app |
| `SNAPCHAT_CLIENT_SECRET` | From Snap Business Manager OAuth app |
| `SNAPCHAT_REDIRECT_URI` | `https://your-vercel-url/api/auth/callback` |
| `NEXT_PUBLIC_APP_URL` | `https://your-vercel-url` |
| `SESSION_SECRET` | 64-char random hex string |
| `SESSION_COOKIE_NAME` | `snap_ads_session` |
| `SNAPCHAT_API_BASE_URL` | `https://adsapi.snapchat.com/v1` |
| `SNAPCHAT_AUTH_URL` | `https://accounts.snapchat.com/login/oauth2/authorize` |
| `SNAPCHAT_TOKEN_URL` | `https://accounts.snapchat.com/login/oauth2/access_token` |
