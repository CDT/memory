const MARKED_URL = "https://cdn.jsdelivr.net/npm/marked@18.0.11/lib/marked.esm.js";
const FILTER_KEY = "memory.randomFilter";

const app = document.querySelector("#app");
const nav = document.querySelector("#decks-nav");

let decks = [];
const deckCache = new Map();
let lastPickKey = null;

const escapeHtml = (text) =>
    text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const isNote = (deck) => deck.file.endsWith(".md");

const storage = {
    get(key) {
        try { return localStorage.getItem(key); } catch { return null; }
    },
    set(key, value) {
        try { localStorage.setItem(key, value); } catch { /* storage unavailable */ }
    },
};

// One item per line; "front | back" splits on the first pipe; "# Heading" starts a section.
const parseList = (text) => {
    const items = [];
    let section = "";
    for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim();
        if (!line) continue;
        if (line.startsWith("#")) {
            section = line.replace(/^#+\s*/, "");
            continue;
        }
        const pipe = line.indexOf("|");
        items.push({
            front: pipe < 0 ? line : line.slice(0, pipe).trim(),
            back: pipe < 0 ? "" : line.slice(pipe + 1).trim(),
            section,
        });
    }
    return items;
};

const loadDeck = (deck) => {
    if (!deckCache.has(deck.id)) {
        const promise = fetch(`content/${deck.file}`, { cache: "no-cache" })
            .then((response) => {
                if (!response.ok) throw new Error(`Unable to load ${deck.file}`);
                return response.text();
            })
            .then((text) => (isNote(deck) ? text : parseList(text)));
        promise.catch(() => deckCache.delete(deck.id));
        deckCache.set(deck.id, promise);
    }
    return deckCache.get(deck.id);
};

const renderNav = (activeId) => {
    nav.innerHTML = decks
        .map((deck) => {
            const current = deck.id === activeId ? ' aria-current="page"' : "";
            return `<a href="#/deck/${encodeURIComponent(deck.id)}"${current}>${escapeHtml(deck.title)}</a>`;
        })
        .join("");
};

const cardHtml = (item) => {
    const meta = [item.deck.title, item.section].filter(Boolean).map(escapeHtml).join(" · ");
    const back = item.back
        ? `<button class="reveal" type="button">Show answer</button>
           <p class="card-back" hidden>${escapeHtml(item.back)}</p>`
        : "";
    return `<article class="card">
        <p class="card-meta">${meta}</p>
        <p class="card-front">${escapeHtml(item.front)}</p>
        ${back}
    </article>`;
};

const renderRandom = async () => {
    renderNav(null);
    const listDecks = decks.filter((deck) => !isNote(deck));
    let filter = storage.get(FILTER_KEY) ?? "all";
    if (filter !== "all" && !listDecks.some((deck) => deck.id === filter)) filter = "all";

    const pool = listDecks.filter((deck) => filter === "all" || deck.id === filter);
    const results = await Promise.allSettled(pool.map(async (deck) => (await loadDeck(deck)).map((item) => ({ ...item, deck }))));
    const items = results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));

    let pick = null;
    if (items.length) {
        const candidates = items.length > 1 ? items.filter((item) => `${item.deck.id}:${item.front}` !== lastPickKey) : items;
        pick = candidates[Math.floor(Math.random() * candidates.length)];
        lastPickKey = `${pick.deck.id}:${pick.front}`;
    }

    const chips = [{ id: "all", title: "All" }, ...listDecks]
        .map((deck) => `<button type="button" class="chip" data-filter="${escapeHtml(deck.id)}" aria-pressed="${deck.id === filter}">${escapeHtml(deck.title)}</button>`)
        .join("");

    app.innerHTML = `
        <div class="chips" role="group" aria-label="Filter">${chips}</div>
        ${pick ? cardHtml(pick) : `<p class="empty">Nothing here yet.</p>`}
        <div class="actions">
            <button id="next" class="primary" type="button">Another</button>
            <span class="hint">Space to reveal / next</span>
        </div>`;

    app.querySelectorAll(".chip").forEach((chip) =>
        chip.addEventListener("click", () => {
            storage.set(FILTER_KEY, chip.dataset.filter);
            renderRandom();
        }));
    app.querySelector("#next").addEventListener("click", renderRandom);
    app.querySelector(".reveal")?.addEventListener("click", reveal);
};

const reveal = () => {
    const back = app.querySelector(".card-back");
    if (!back || !back.hidden) return false;
    back.hidden = false;
    app.querySelector(".reveal")?.remove();
    return true;
};

const renderList = (deck, items) => {
    const sections = [];
    for (const item of items) {
        if (!sections.length || sections.at(-1).title !== item.section) sections.push({ title: item.section, items: [] });
        sections.at(-1).items.push(item);
    }

    const body = sections
        .map((section) => `
            <section class="deck-section">
                ${section.title ? `<h2>${escapeHtml(section.title)}</h2>` : ""}
                <ul class="items">
                    ${section.items
                        .map((item) => `<li data-search="${escapeHtml(`${item.front} ${item.back}`.toLowerCase())}">
                            <span class="item-front">${escapeHtml(item.front)}</span>
                            ${item.back ? `<span class="item-back">${escapeHtml(item.back)}</span>` : ""}
                        </li>`)
                        .join("")}
                </ul>
            </section>`)
        .join("");

    app.innerHTML = `
        <div class="deck-head">
            <h1>${escapeHtml(deck.title)} <span class="count">${items.length}</span></h1>
            ${items.length ? `<input id="search" type="search" placeholder="Filter…" aria-label="Filter items">` : ""}
        </div>
        ${items.length ? body : `<p class="empty">Nothing here yet. Add lines to <code>content/${escapeHtml(deck.file)}</code>.</p>`}`;

    app.querySelector("#search")?.addEventListener("input", (event) => {
        const query = event.target.value.trim().toLowerCase();
        app.querySelectorAll(".items li").forEach((li) => { li.hidden = !li.dataset.search.includes(query); });
        app.querySelectorAll(".deck-section").forEach((section) => {
            section.hidden = !section.querySelector("li:not([hidden])");
        });
    });
};

const renderNote = async (deck, markdown) => {
    const { marked } = await import(MARKED_URL);
    app.innerHTML = `<article class="note">${marked.parse(markdown)}</article>`;
};

const renderDeck = async (id) => {
    const deck = decks.find((d) => d.id === id);
    renderNav(id);
    if (!deck) {
        app.innerHTML = `<p class="empty">No deck called “${escapeHtml(id)}”. <a href="#/">Back</a></p>`;
        return;
    }
    const data = await loadDeck(deck);
    if (isNote(deck)) await renderNote(deck, data);
    else renderList(deck, data);
};

const route = async () => {
    const match = location.hash.match(/^#\/deck\/(.+)$/);
    try {
        if (match) await renderDeck(decodeURIComponent(match[1]));
        else await renderRandom();
    } catch (error) {
        app.innerHTML = `<p class="empty">${escapeHtml(error.message)}</p>`;
    }
    window.scrollTo(0, 0);
};

document.addEventListener("keydown", (event) => {
    if (location.hash.startsWith("#/deck/") || event.target.closest("input, textarea, button")) return;
    if (event.key === " " || event.key === "ArrowRight") {
        event.preventDefault();
        if (event.key === "ArrowRight" || !reveal()) renderRandom();
    }
});

const init = async () => {
    try {
        const response = await fetch("content/decks.json", { cache: "no-cache" });
        if (!response.ok) throw new Error("Unable to load content/decks.json");
        decks = await response.json();
    } catch (error) {
        app.innerHTML = `<p class="empty">${escapeHtml(error.message)}</p>`;
        return;
    }
    window.addEventListener("hashchange", route);
    route();
};

init();
