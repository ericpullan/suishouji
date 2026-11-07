# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

「随手记」is a voice-first, single-user daily expense tracker with a Chinese UI. The entire app is one self-contained file, `index.html` (inline CSS + JavaScript, no libraries). `启动随手记.cmd` starts a local static server and opens the app in Edge; `使用说明.txt` is the end-user guide.

There is no build step, package manager, linter, or automated test suite. The only server-side code is `netlify/functions/asr.js`, a Netlify Function that proxies Baidu short-speech recognition for the deployed (phone) site. The local Python server does not run it, so local development falls back to the browser's Web Speech API. Edit `index.html` and refresh the browser.

## Run

- Double-click `启动随手记.cmd`: it serves this folder at `http://localhost:8765/` and opens Edge.
- Or manually, from this folder (requires Python 3):

```powershell
py -m http.server 8765 --bind 127.0.0.1
```

Then open `http://localhost:8765/`.

Keep the host and port stable. Records live in `localStorage`, which is scoped to the origin: changing the port makes existing history appear to vanish. Do not open `index.html` via `file://` when testing voice input — browsers generally deny microphone access there. The page detects this and shows a notice; manual entry still works.

## Architecture

All code lives in `index.html`: static HTML, inline CSS, and one IIFE at the bottom that owns all state and behavior. There are no modules, exports, or globals, so functions cannot be imported for unit testing; exercise the app through the UI or browser automation.

Data flow:

```
speech final result / manual form
        ↓
parseText → parseSegment → findAmounts → cnToNumber
        ↓
detectCategory + cleanNote
        ↓
commitParsed → records[] → persist() → render()
```

### Expense parsing

- `parseText` normalizes full-width digits and thousands separators, splits on Chinese/ASCII punctuation, and parses each segment.
- `AMOUNT_RULES` is an ordered array. Fractional forms (`35块5`, `三十五块五毛`, `五块半`), currency-marked forms, `毛/角`, verb phrases (`花了30`), then bare trailing numbers are tried in that order. Matches overlapping an earlier match's character range are rejected, so array order is behaviorally significant.
- `cnToNumber` handles `十/百/千/万`, `点` decimals, and colloquial elisions (`一百二` = 120, `两千五` = 2500, `一千二百三` = 1230). Chinese numeral handling is a common regression area; test changes with utterances such as `午饭30块`, `打车十五`, `房租两千五`, `三十五块五毛`, `一块五`, `五毛`, and multiple entries separated by commas.
- One segment can produce multiple records. The note for each amount is the text before it, falling back to the text after it or the category name; `cleanNote` strips filler verbs.
- `detectCategory` scores category keywords by length (longest match wins) and defaults to `其他`.

### Data and categories

- Storage key: `suishouji.records.v1`.
- Record shape: `{ id, date: 'YYYY-MM-DD', time: 'HH:mm', amount: number, category: string, note: string, createdAt: number }`. `loadRecords` sanitizes stored data and drops non-positive amounts.
- Preserve the storage key, field names, and category keys — existing records are the user's real data, and extra fields are ignored on load.
- `CATEGORIES` drives the emoji/color lookups, keyword matching, the edit `<select>`, and the monthly chips. Stored `category` values are the Chinese keys (for example `餐饮`); `getCategory` falls back to `其他`.
- Dates and times are local-time strings. The list is grouped by date (newest first); today and current-month totals are computed from the current local date.

### Speech input

There are two transcription paths; both end at `handleTranscript → parseText → commitParsed`.

- **Server path (preferred when the Netlify Function exists).** On load, `probeServerAsr()` GETs `/.netlify/functions/asr`; `{ready:true}` means the deployment has `BAIDU_API_KEY` and `BAIDU_SECRET_KEY` set. The mic then records raw PCM with Web Audio (`createScriptProcessor`, 4 KB frames), resamples to 16 kHz mono, encodes a WAV in the browser, and POSTs base64 to the function. The function (Node 20, global `fetch`) caches a Baidu access token and calls `https://vop.baidu.com/server_api` with `dev_pid: 1537` (Mandarin). Baidu limits utterances to 60 s, so recording auto-stops at 55 s. `netlify.toml` sets `publish = "."` and `functions.directory = "netlify/functions"`.
- **Web Speech fallback.** When the function is absent (local Python server, drag-and-drop deploy) or returns 404/405, the app falls back to `SpeechRecognition`/`webkitSpeechRecognition` with `lang='zh-CN'`, continuous + interim results, auto-restart, and handling for `not-allowed`, `network`, and `audio-capture`.
- Keys must never appear in `index.html`; they live only in Netlify environment variables. Rotate them in the Baidu console if they ever leak.
- If the API is unavailable or fails, the mic button shows a specific Chinese message and manual text entry remains the fallback.

### UI behavior

- `render()` rebuilds the summary, monthly category chips, and the date-grouped list after every mutation.
- User-provided strings are inserted with `textContent`; avoid switching notes or other user data to `innerHTML`.
- Adding and deleting show a toast with a single undo action. Clicking a row opens the edit dialog; the trash button deletes without opening it.
- CSV export includes a UTF-8 BOM for Excel and column headers `日期,时间,分类,备注,金额`.
- The layout is already responsive. Avoid global `!important` overrides that force every `div`, `form`, or button to full width — they break the card layout.

## Verification

No test runner is checked in. Verify changes manually in the browser, especially parsing changes. The app can be exercised without a microphone by typing into the manual input, for example:

```
午饭30块，打车十五，房租两千五
```

After logging entries, check the today/month totals, category chips, edit dialog, undo delete, and CSV export. For voice specifically, test in Edge on `localhost` and grant microphone permission.
