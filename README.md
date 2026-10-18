# Raken

Raken is an AI app with four tools:

- **Chat**: your normal chat experience.
- **Code**: an AI agent that builds complete projects in any language, from Python to Brainfuck. Web apps, games and coded images open in a live preview, Brainfuck files run in a built-in runner, and you can download the whole project as a .zip.
- **Work**: an AI agent for documents, reports, slide decks (HTML) and spreadsheets (CSV), with previews.
- **Vidful**: makes short animated movies.

It comes as a website (`web/`, served by `server.js`), a Windows app (.exe), a Mac app (.dmg) and an Android app (.apk).

## Models

| Raken model | Runs on | Used in | Good for |
|---|---|---|---|
| Raken 1 Flash | Claude Haiku 5.5, low effort | Chat | Ultrafast everyday conversations |
| Raken 1 Standard | Claude Sonnet 5.5, low effort | Chat | Mini apps, documents and more |
| Raken 1 Pro | Claude Opus 5.5, medium effort | Chat, Code, Work | Apps, slides, coded images and animations |
| Raken 1 Ultra | Claude Opus 5.5, high effort | Chat, Code, Work | Deep work that keeps a business running |
| Raken 2 Asteron | Claude Fable 5.1, xhigh effort | Chat, Code, Work | Whole jobs, end to end |
| Raken 1 Vidful | Claude Opus 5.5, high effort | Vidful | Short animated movies (animated SVG, 16:9) |

**About training.** The Raken models are not trained by this project; training models from scratch (60 to 79,000 epochs on huge datasets) needs large GPU clusters and data, which this repository doesn't have. Each Raken model is a Claude model with its own settings and instructions, and Claude already handles all kinds of conversations and code, Brainfuck included. Model settings live in `src/ai.js`; names, plans and limits live in `src/catalog.js`.

Requests on Opus, Sonnet and Fable opt into Anthropic's server-side fallback: if a safety check declines a request, it is retried on the recommended fallback model.

## Usage, Credits and Ultra Credits

1. **Weekly usage.** Every plan includes weekly usage, shown as a percentage. It resets each Monday at 00:00 UTC. Usage is measured from the tokens a request actually uses, so bigger models use more (Flash ×1, Standard ×2, Pro ×5, Ultra ×10, Vidful ×10, Asteron ×20). Free gets 500 units a week (1 unit = 1,000 tokens on Flash).
2. **Credits.** When weekly usage hits 100%, Credits let you keep going (1 Credit = 1 unit). They never expire.
3. **Ultra Credits.** Before a Code or Work task, Raken sizes it up. If the task is huge (several days of work for a person), it suggests Ultra Credits. Ultra Credits run the task on the priority path: Claude Opus 5.5 at max effort in fast mode (output up to 2.5× faster). One Ultra Credit covers 40,000 tokens, and Ultra runs don't use weekly usage.

Failed or declined requests cost nothing.

## Plans (demo payments)

| Plan | Price | Weekly usage | Tools | Models |
|---|---|---|---|---|
| Free | $0 | 1× | Chat | Flash, Standard |
| Plus | $3/mo | 3× Free | Chat, Code, Work | + Pro |
| Pro | $20/mo | 6× Free | All tools | + Ultra, Vidful |
| Ultra | $500/mo | 30× Free (5× Pro) | All tools | + Asteron |

Payments are a **demo**: checkout switches plans and adds Credits instantly, records the order in billing history, and charges nothing. No card details are asked for or stored. Credit packs: 200 / 1,000 / 5,000 Credits ($2 / $8 / $35). Ultra Credit packs: 5 / 25 / 100 ($5 / $20 / $70).

## Run the server

```bash
cp .env.example .env      # then fill in ANTHROPIC_API_KEY
npm install
npm start                 # http://localhost:3000
npm test
```

Put an account on a plan and add Credits or Ultra Credits from the command line. Stop the server first:

```bash
npm run set-plan -- you@example.com ultra 1000 25
```

### Host it

```bash
docker build -t raken .
docker run -p 3000:3000 -v raken-data:/data --env-file .env raken
```

Any Node 22 host works. Keep `RAKEN_DATA_DIR` on persistent storage and set `PUBLIC_URL` to your domain.

## Apps: .exe, .dmg and .apk

Every push runs the **Apps** workflow (`.github/workflows/apps.yml`). It runs the tests, then builds:

| Platform | File | Built on |
|---|---|---|
| Windows | `Raken-Setup-<version>.exe` | windows-latest |
| Mac | `Raken-<version>-arm64.dmg`, `Raken-<version>-x64.dmg` | macos-latest |
| Android | `Raken-<version>.apk` | ubuntu-latest |

Download them from the run's **Artifacts** section. Pushing a tag like `v2.0.0` also publishes all of them to a GitHub Release, which is where the website's download buttons point.

How the apps connect:
- **Hosted (for customers):** set the repository variable `RAKEN_SERVER_URL` to your hosted Raken. All apps open it, and nobody's API key is on their device.
- **Windows and Mac without a URL:** the app runs the Raken server on the computer. Put `ANTHROPIC_API_KEY=...` in `raken.env` in the app's data folder (`%APPDATA%\Raken` on Windows, `~/Library/Application Support/Raken` on Mac).
- **Android without a URL:** the app asks for the server address on first launch (for example `http://192.168.1.20:3000` for a computer on your Wi-Fi).

**Signing.**
- Mac: without an Apple Developer certificate, macOS warns on first open (right-click the app and choose **Open**). To sign and notarize, add the repository secrets `MAC_CERTIFICATE_P12_BASE64`, `MAC_CERTIFICATE_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID`.
- Windows: the installer is unsigned, so SmartScreen asks users to confirm (**More info → Run anyway**).
- Android: without a keystore the APK is signed with a throwaway debug key, so each build must be uninstalled before installing the next. To sign with your own key, add `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD`.

Build locally:
- Windows or Mac: `cd desktop && npm install && npm run dist:win` (or `dist:mac`). Building the .exe on Linux needs Wine.
- Android: `cd android && gradle assembleRelease` (Gradle 8.14, JDK 17+, Android SDK with platform 35).

## Layout

```
server.js              HTTP server: auth, chat and agent streaming, demo billing, static pages
src/ai.js              Claude API calls for every Raken model and tool
src/catalog.js         models, tools, plans, packs
src/usage.js           weekly usage, Credits, Ultra Credits, plan gating
src/auth.js            accounts and sessions
src/billing.js         demo checkout
src/db.js              JSON-file storage
web/                   index.html (landing), login.html, app.html (+ JS/CSS)
web/files.js           file previews, .zip download, Brainfuck runner
desktop/               Electron app for Windows (.exe) and Mac (.dmg)
android/               Android app (.apk)
scripts/set-plan.js    owner tool to set an account's plan and balances
test/                  node:test suites (the Claude API is stubbed locally)
```
