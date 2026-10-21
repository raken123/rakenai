# Steal a Hot Dog

A complete, playable Roblox place: buy hot dogs, stand them on your base to earn
cash every second, and raid everybody else's base to take theirs.

## Open it in Roblox Studio

1. Download `StealAHotDog.rbxlx`.
2. Roblox Studio -> **File -> Open from File...** -> pick `StealAHotDog.rbxlx`.
3. Press **Play**. The map, bases and UI are all generated when the server starts.

> Roblox uses `.rbxl` (binary) and `.rbxlx` (XML) for places; there is no `.rblx`
> format. This project ships the XML one because it is readable and diffable.
> Once it is open in Studio, **File -> Save As** and choose `.rbxl` if you want
> the binary version.

To publish: **File -> Publish to Roblox As...**

## How the game plays

- Everyone is given one of 8 bases around the plaza, each with 8 pedestals.
- The **SHOP** button buys hot dogs with cash, or with Robux for the paid ones.
- Every hot dog standing on your base pays its income **once per second** —
  including the ones you stole.
- Hold **E** on another player's hot dog to steal it. Rarer dogs take longer to
  pick up (3s for a Hot Dog, 12s for a Silver Hot Dog).
- Carry it back and run over your green **DROP OFF** pad to plant it on a free
  pedestal. It pays you from then on.
- Die while carrying one and it drops on the floor — anybody can grab it.
- Hold **E** on the blue pillar in your base to raise the shield: 20 seconds of
  no stealing, then a 45 second recharge. The shield seals the base, so you are
  locked in too.
- Cash and the hot dogs on your base are saved per player (DataStore
  `StealAHotDog_v1`). Enable **Studio Access to API Services** in Game Settings
  if you want saving to work while testing in Studio.

## Hot dogs

| Hot dog | Price | Income | Robux |
| --- | --- | --- | --- |
| Hot Dog | $20 | $3/sec | — |
| Goblin Hot Dog | $120 | $50/sec | 50 |
| Needoh Hot Dog | $700 | $90/sec | 100 |
| Hacked Hot Dog | $1,200 | $300/sec | 600 |
| Human Hot Dog | $4,900 | $1,000/sec | 1,000 |
| Strawberry Hot Dog | $79,000 | $5,000/sec | 5,000 |
| Inverted Hot Dog | $690,000 | $19,000/sec | 10,000 |
| Silver Hot Dog | $6,000,000 | $100,000/sec | 50,000 |

Players start with $25, enough for their first Hot Dog.

## Turning on the Robux purchases

The Robux buttons are wired up but need real product ids, which only exist once
the place is published:

1. Publish the place.
2. **Game Settings -> Monetization -> Developer Products** -> create one product
   per paid hot dog, priced as in the table above.
3. Open `ReplicatedStorage/HotDogData` in Studio and paste each product id into
   the matching `DevProductId` field (they are `0` by default).

Until then the Robux button says the product is not configured; buying with game
cash works regardless. The server grants the hot dog from
`MarketplaceService.ProcessReceipt`, so purchases are validated server-side.

## Repository layout

```
build.py                         # generates StealAHotDog.rbxlx from src/
StealAHotDog.rbxlx               # the built place file
src/
  ReplicatedStorage/
    HotDogData.lua               # the catalogue + number formatting (shared)
  ServerScriptService/
    Main.server.lua              # leaderstats, buying, income tick, saving, receipts
    Modules/
      Plots.lua                  # map + base building, ownership, shields
      HotDogs.lua                # hot dog models, stealing, carrying, drop off
  StarterPlayerScripts/
    Client.client.lua            # HUD, shop, toasts, carry banner
```

Edit the Lua under `src/`, then rebuild:

```sh
python3 build.py
```

The builder only needs the Python standard library. Scripts inside the place are
plain `Script` / `ModuleScript` / `LocalScript` instances, so you can equally
edit them in Studio and copy changes back.

## Tuning

| What | Where |
| --- | --- |
| Prices, income, steal times, colours | `src/ReplicatedStorage/HotDogData.lua` |
| Number of bases, pedestals per base | `PLOT_COUNT`, `PEDESTAL_COUNT` in `Plots.lua` |
| Shield duration and cooldown | `Plots.LockDuration`, `Plots.LockCooldown` |
| Starting cash | `STARTING_CASH` in `Main.server.lua` |
