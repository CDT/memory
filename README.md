# Memory

A static, installable app for words, quotes, grammar and anything else worth remembering. It shows a random question on the home page, and every deck has its own page. The Words deck uses multiple choice spelling questions; quote decks hide part of a line until tapped. The site caches its current decks for offline use after the first visit. Served by GitHub Pages straight from the repo root, with no build step.

## Adding content

Everything lives in `content/`. Each change is just a commit.

**Add an item to an existing deck:** add a line to its `.txt` file.

```
# Section heading            ← groups the lines below it on the deck page
近水楼台先得月，向阳花木易为春。  ← a plain line: shown as-is
4月 | しがつ · shigatsu         ← "front | back": the back is hidden until you reveal it
```

Blank lines are ignored.

**Add a new deck:** create a file under `content/` and add one entry to `content/decks.json`:

```json
{ "id": "jp-verbs", "title": "日语 · 动词变形", "file": "japanese/verbs.txt" }
```

- `.txt` files are item lists and show up in the random picker.
- `.md` files are notes (e.g. grammar write-ups). They're rendered as a reference page and are not part of the random picker.
- Add `"mode": "words"` for spelling multiple choice, or `"mode": "quote"` for tap-to-reveal fill-in-the-blank practice.
- When adding or changing deck files, update `ASSETS` and the cache version in `service-worker.js` so offline copies refresh.

## Running locally

`fetch` needs a server, so opening `index.html` directly won't work:

```
python -m http.server 8000
```

Then open http://localhost:8000.

## Deploying

Repo Settings → Pages → Source: **Deploy from a branch**, branch `main`, folder `/ (root)`.
