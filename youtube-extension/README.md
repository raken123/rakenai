# Premium+ for YouTube

A just-for-fun Chrome extension that makes YouTube feel like Premium, plus extras real Premium doesn't have. It's not real YouTube Premium and isn't affiliated with YouTube or Google.

## Features

| Feature | What it does |
|---|---|
| **Premium logo** | The top-left logo reads "YouTube Premium". You can change the word to anything, like "Ultra" or "Gold". |
| **Ad skipper** | Video ads are muted, run at 16x, jump to their end, and get their Skip button pressed. Feed, sidebar and search ads are hidden. |
| **Sponsor skipper** | Skips sponsor reads, self-promo and "like and subscribe" segments, using the community [SponsorBlock](https://sponsor.ajay.app) database. |
| **Speeds up to 16x** | A speed button in the player opens a menu with 0.25x–2x, 2.5x, **3x**, 4x, **8x (for no reason)** and 16x (pure chaos). Shift+> and Shift+< keep stepping past 2x. Your speed is kept between videos. |
| **GIFs in comments & live chat** | A **GIF** button next to the emoji button opens a picker with about 40 built-in reaction GIFs. You can also paste any GIPHY link, or add a free GIPHY API key to search all of GIPHY. |
| **GIFs show up inline** | GIFs others sent, and GIPHY/Tenor/Imgur GIF links in comments, show as the actual animated GIF. |
| **Extra player buttons** | Screenshot (saves the current frame as a PNG), Loop, Picture-in-picture, and **Party mode** (rainbow colors and a wobble). |
| **Volume boost** | Turn the volume up to 600%, set from the popup. |
| **Accent color** | Recolor the progress bar, the logo and the extension's buttons. |
| **No "Get Premium" nags** | Hides the YouTube Premium upsell banners and menu entries. |
| **Hide Shorts** | Optional: removes Shorts from the home page, search and the sidebar. |
| **Stats** | The popup counts ads skipped, sponsors skipped, time saved and GIFs sent. |

Every feature can be turned on or off in the toolbar popup.

## Install

1. Open `chrome://extensions` in Chrome (or Edge, Brave or Opera).
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose this `youtube-extension` folder.
4. Pin **Premium+** from the puzzle-piece menu, then open or reload YouTube.

## How GIFs work

YouTube comments can only hold text, so a GIF is sent as a short tag like `[gif:3o7TKSjRrfIPjeiVyM]`. A tag isn't a link, so YouTube's spam filter doesn't hold the comment for review the way it often does with links. People with Premium+ see the animated GIF. Everyone else sees the tag.

Only GIFs from GIPHY, Tenor and Imgur are shown, and only over HTTPS. A comment can't make your browser load an image from anywhere else.

To search every GIF instead of just the built-in set, get a free API key at [developers.giphy.com](https://developers.giphy.com) and paste it into the popup.

## Privacy

- Settings sync through your Chrome account (`chrome.storage.sync`). Stats and recent GIFs stay on this computer.
- **SponsorBlock:** only the first 4 characters of a hash of the video ID are sent, so the server can't tell which video you're watching. Turn off "Skip sponsor segments" to send nothing.
- **GIPHY:** search terms go to GIPHY only when you've added your own key. GIF images load from GIPHY's servers.
- Nothing else leaves your browser.

## Notes

- YouTube changes its page often. If a feature stops working after a YouTube update, the selectors in `content/` may need updating.
- Chrome mutes audio above 4x, so 8x and 16x play silently.
- Volume boost starts working after your first click or key press on the page. Browsers block audio processing until then.

## Files

```
manifest.json          Extension manifest (Manifest V3)
defaults.js            Default settings, shared by every part
background.js          Service worker: SponsorBlock and GIPHY requests
content/shared.js      Settings, DOM helpers, toasts, the page observer
content/look.js        Premium logo and the CSS-only switches
content/ads.js         Video ad skipper
content/speed.js       Speed button, menu and shortcuts
content/buttons.js     Screenshot, loop, picture-in-picture, party mode
content/volume.js      Volume booster
content/sponsorblock.js Sponsor segment skipper
content/gif-core.js    GIF token and link parsing (unit tested)
content/gifs.js        GIF picker and inline GIFs
content/styles.css     All injected styles
popup/                 Toolbar popup
```

Tests for the GIF parsing are in `../test/youtube-extension.test.js`. Run them with `node --test test/youtube-extension.test.js` from the repository root.
