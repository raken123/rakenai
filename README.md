# Raken

Raken is an AI you can chat with. It also sends agents to make files for you, and it creates images, short movies and 3D models. Usage is paid for with **Credits** and **Ultra Credits** on three plans.

It comes as a website (`web/`, served by `server.js`) and a Mac app (`desktop/`, built as a `.dmg`).

## What's real

- **AI answers.** Every Raken model runs on Anthropic's Claude models through the Claude API. Replies stream into the chat as they're written.
- **Accounts.** Email and password sign-up and log-in. Passwords are hashed with scrypt, and sessions use HttpOnly cookies. Conversations are saved.
- **Payments.** Stripe Checkout subscriptions for Lite and Plus, a billing portal to switch or cancel, and webhooks that change plans and refill credits each billing month.
- **Mac app.** An Electron app packaged as a DMG for Apple Silicon and Intel, built by GitHub Actions.

## Models

| Raken model | Runs on | What you get |
|---|---|---|
| Raken Mini | Claude Haiku 5.5, low effort | Very fast answers |
| Raken Standard | Claude Sonnet 5.5, low effort | The everyday base model |
| Raken Plus | Claude Opus 5.5, medium effort | Smarter, a bit slower |
| Raken Astryx | Claude Opus 5.5, high effort | Deepest reasoning, made for agents (Work) |
| Raken Imge 1 | Claude Opus 5.5 | An illustration as an SVG image, shown in chat and downloadable |
| Raken Vidful 1 | Claude Opus 5.5 | A short animated movie (8–20 s, looping) as an animated SVG |
| Raken Mesh 1 | Claude Opus 5.5 | A 3D model as a `.obj` file, with a spinning preview in chat |

**Ultra Credits** run the request on Claude Opus 5.5 in *fast mode*, which writes output up to 2.5× faster. Requests on Opus and Sonnet also opt into Anthropic's server-side fallback: if a safety check declines a request, it is retried on the recommended fallback model. Failed or declined requests refund their credits.

Mapping models: `src/ai.js`. Plans, prices and model access: `src/catalog.js`.

## Plans

| Plan | Price | Credits | Ultra Credits | Models | Tools |
|---|---|---|---|---|---|
| Raken Free | $0 | 10 per day (on login) | 0 | Standard | Chat |
| Raken Lite | $3/mo | 300 / month | 5 / month | Mini, Standard, Plus, Vidful 1 | Chat, Vidful |
| Raken Plus | $30/mo | 50,000 / month | 70 / month | All | Chat, Work, Vidful |

## Run the server

```bash
cp .env.example .env      # then fill in ANTHROPIC_API_KEY (and Stripe keys for payments)
npm install
npm start                 # http://localhost:3000
npm test
```

Give an account a plan without payment (for yourself or testers). Stop the server first:

```bash
npm run set-plan -- you@example.com plus
```

### Host it

```bash
docker build -t raken .
docker run -p 3000:3000 -v raken-data:/data --env-file .env raken
```

Any Node 22 host works. Keep `RAKEN_DATA_DIR` on persistent storage and set `PUBLIC_URL` to your domain.

### Payments (Stripe)

1. In Stripe, create a product with two monthly prices: $3 (Lite) and $30 (Plus). Put the price IDs in `STRIPE_PRICE_LITE` and `STRIPE_PRICE_PLUS`.
2. Add a webhook endpoint `https://<your domain>/api/billing/webhook` for `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted` and `invoice.paid`. Put its signing secret in `STRIPE_WEBHOOK_SECRET`.
3. Set `STRIPE_SECRET_KEY` and turn on the customer portal in Stripe's settings.

Until Stripe is set up, the upgrade buttons say payments aren't available.

## The Mac app (.dmg)

Every push runs the **Mac app** workflow (`.github/workflows/desktop.yml`). It tests the server, builds `Raken-<version>-arm64.dmg` and `Raken-<version>-x64.dmg` on a macOS runner, and attaches them to the run as the `Raken-mac` artifact. Pushing a tag like `v1.0.0` also publishes them to a GitHub Release, which is where the website's **Download for Mac** button points.

How the app connects:
- **Hosted (for customers):** set the repository variable `RAKEN_SERVER_URL` to your hosted Raken. The app opens it, and customers log in normally. Nobody's API key is on their Mac.
- **Local (for you):** with no URL set, the app runs the Raken server on the Mac. Put `ANTHROPIC_API_KEY=...` in `~/Library/Application Support/Raken/raken.env`.

**Signing.** Without an Apple Developer certificate, macOS warns on first open (right-click the app and choose **Open**). To sign and notarize, add these repository secrets: `MAC_CERTIFICATE_P12_BASE64`, `MAC_CERTIFICATE_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID`.

Build on your own Mac: `cd desktop && npm install && npm run dist`.

## Layout

```
server.js              HTTP server: auth, chat streaming, billing, static pages
src/ai.js              Claude API calls for every Raken model and tool
src/catalog.js         models, tools, plans
src/credits.js         pricing, allowances, plan gating, refunds
src/auth.js            accounts and sessions
src/billing.js         Stripe checkout, portal and webhooks
src/db.js              JSON-file storage
web/                   index.html (landing), login.html, app.html (+ JS/CSS)
desktop/               Electron app and DMG packaging
youtube-extension/     Premium+ for YouTube, a separate Chrome extension (see its README)
scripts/set-plan.js    owner tool to set an account's plan
test/                  node:test suites (the Claude API is stubbed locally)
```
