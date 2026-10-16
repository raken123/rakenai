# Raken

Raken is an AI you can chat with normally. It also runs agents that make files for you and generates images, short movies and 3D models. Usage is paid for with **Credits** and **Ultra Credits**.

## Run it

```bash
npm start        # http://localhost:3000  (Node 20.11+, no dependencies)
npm test
```

Models currently answer through a **demo provider** (`src/provider.js`). When a trained model is deployed, replace `generate()` with a call to its inference endpoint. Everything else (plans, credits, gating, UI) already works.

## Models

| Model | Kind | What it's for | Credit multiplier |
|---|---|---|---|
| Raken Mini | Text | Very fast, no thinking | ×1 |
| Raken Standard | Text | Normal AI, the base model | ×1 |
| Raken Plus | Text | Smarter, slower | ×3 |
| Raken Astryx | Text | Very smart, made for agents | ×8 |
| Raken Imge 1 | Image | Great looking images | ×10 |
| Raken Vidful 1 | Video | Short movies | ×40 |
| Raken Mesh 1 | 3D | 8K quality 3D models | ×25 |

All models are trained in the cloud, with each run lasting between **150 and 2400 epochs**. Per-model runs are in `training/models.json`, and a test keeps them inside that range.

## Tools

- **Chat**: talk to Raken. It runs on the text models, Imge 1 and Mesh 1.
- **Work**: AI agents make files for you. It runs on Standard, Plus and Astryx.
- **Vidful**: turn a prompt into a short movie. It runs on Vidful 1.

## Credits and Ultra Credits

- **Credits** are charged based on the prompt. The cost is `ceil(tokens / 250) × model multiplier`, where tokens ≈ characters / 4.
- **Ultra Credits** are for heavy jobs. They send the job to the priority cluster, so it finishes much faster (minutes instead of hours). One Ultra Credit covers up to 100 credits' worth of work.
- A request is refused if the balance is too low. Nothing is charged when a request is refused.

## Plans

| Plan | Price | Credits | Ultra Credits | Models | Tools |
|---|---|---|---|---|---|
| Raken Free | $0 | 10 per day (on login) | 0 | Standard | Chat |
| Raken Lite | $3/mo | 300 / month | 5 / month | Mini, Standard, Plus, Vidful 1 | Chat, Vidful |
| Raken Plus | $30/mo | 50,000 / month | 70 / month | All | All |

Allowances refill to the plan amount and do not roll over. The free 10 credits are granted once per UTC day on the first login. Logging in again the same day does not add more.

## Assumptions to confirm

The original spec left a few things open. The current choices are listed below. Each one is a one-line change in `src/catalog.js` or `src/credits.js`.

1. **"Raken Pro 1" on the Lite plan** isn't a model in the lineup. It is treated as **Raken Plus**.
2. **"Access to Vid" on Lite** is read as access to the **Vidful** tool and the Vidful 1 model.
3. **Raken Plus plan access** wasn't specified. It is set to all models and tools.
4. **Free credits** are given once per day rather than on every login, so they can't be farmed by logging in repeatedly.
5. **Credit prices** (multipliers, tokens per credit, credits per Ultra Credit) are placeholder numbers.
6. **The plan and the model are both called "Raken Plus"**, which may confuse users. Consider renaming one of them.

## Layout

```
server.js            HTTP server + JSON API (/api/catalog, login, me, plan, quote, run)
src/catalog.js       models, tools, plans (single source of truth)
src/credits.js       pricing, allowances, plan gating
src/provider.js      model inference (demo stub)
training/models.json cloud training runs per model
web/                 chat app (vanilla HTML/CSS/JS)
test/                node:test suite
```

## Before launch

- Replace the in-memory account store in `server.js` with a database and real auth.
- Connect `POST /api/plan` to a payment provider. Right now it switches plans instantly.
- Deploy trained models and wire them into `src/provider.js`.
