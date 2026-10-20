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

const shuffle = (values) => {
    const copy = [...values];
    for (let index = copy.length - 1; index > 0; index--) {
        const swap = Math.floor(Math.random() * (index + 1));
        [copy[index], copy[swap]] = [copy[swap], copy[index]];
    }
    return copy;
};

const wordClue = (word) => {
    const letters = [...word];
    const positions = letters.map((char, index) => /[a-z]/i.test(char) && index > 0 && index < letters.length - 1 ? index : -1).filter((index) => index >= 0);
    const hidden = shuffle(positions).slice(0, Math.max(1, Math.floor(positions.length * 0.4)));
    for (const index of hidden) letters[index] = "_";
    return letters.join("");
};

const quoteParts = (quote) => {
    const match = quote.match(/^(.+[，,；;：:])\s*(.+?)([。！？.!?]?)$/);
    if (match) return { lead: match[1], answer: match[2], end: match[3] };
    const plain = quote.replace(/[。！？.!?]$/, "");
    const answerLength = Math.max(1, Math.floor([...plain].length / 2));
    return { lead: [...plain].slice(0, -answerLength).join(""), answer: [...plain].slice(-answerLength).join(""), end: quote.slice(plain.length) };
};

const cardHtml = (item, deckItems = []) => {
    const meta = [item.deck.title, item.section].filter(Boolean).map(escapeHtml).join(" · ");
    if (item.deck.mode === "words") {
        const answer = item.front;
        const distractors = shuffle(deckItems.filter((other) => other.front !== answer))
            .sort((a, b) => Math.abs(a.front.length - answer.length) - Math.abs(b.front.length - answer.length))
            .slice(0, 3);
        const choices = shuffle([item, ...distractors]);
        return `<article class="card quiz-card">
            <p class="card-meta">${meta} · Choose the matching word</p>
            <p class="card-front word-clue" aria-label="Word with missing letters">${escapeHtml(wordClue(answer))}</p>
            <div class="choices" role="group" aria-label="Answer choices">
                ${choices.map((choice) => `<button class="choice" type="button" data-correct="${choice.front === answer}">${escapeHtml(choice.front)}</button>`).join("")}
            </div>
            <p class="feedback" role="status" aria-live="polite"></p>
        </article>`;
    }
    if (item.deck.mode === "quote") {
        const { lead, answer, end } = quoteParts(item.front);
        return `<article class="card quiz-card">
            <p class="card-meta">${meta} · Fill in the blank</p>
            <p class="card-front quote-clue">${escapeHtml(lead)}<button class="quote-blank reveal" type="button" aria-label="Reveal missing words">点击揭晓</button><span class="quote-answer" hidden>${escapeHtml(answer)}</span>${escapeHtml(end)}</p>
        </article>`;
    }
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

const bindCard = () => {
    app.querySelector(".reveal")?.addEventListener("click", reveal);
    app.querySelectorAll(".choice").forEach((choice) => choice.addEventListener("click", () => {
        const correct = choice.dataset.correct === "true";
        app.querySelectorAll(".choice").forEach((button) => {
            button.disabled = true;
            if (button.dataset.correct === "true") button.classList.add("correct");
        });
        if (!correct) choice.classList.add("incorrect");
        app.querySelector(".feedback").textContent = correct ? "Correct!" : "The highlighted answer is correct.";
    }));
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
        ${pick ? cardHtml(pick, items.filter((item) => item.deck.id === pick.deck.id)) : `<p class="empty">Nothing here yet.</p>`}
        <div class="actions">
            <button id="next" class="primary" type="button">Another</button>
            <span class="hint">${pick?.deck.mode === "words" ? "Choose an answer" : "Space to reveal"} · → for another</span>
        </div>`;

    app.querySelectorAll(".chip").forEach((chip) =>
        chip.addEventListener("click", () => {
            storage.set(FILTER_KEY, chip.dataset.filter);
            renderRandom();
        }));
    app.querySelector("#next").addEventListener("click", renderRandom);
    bindCard();
};

const reveal = () => {
    const quoteAnswer = app.querySelector(".quote-answer");
    if (quoteAnswer && quoteAnswer.hidden) {
        quoteAnswer.hidden = false;
        app.querySelector(".quote-blank")?.remove();
        return true;
    }
    const back = app.querySelector(".card-back");
    if (!back || !back.hidden) return false;
    back.hidden = false;
    app.querySelector(".reveal")?.remove();
    return true;
};

const renderPractice = (deck, items) => {
    const fresh = items.filter((item) => `${deck.id}:${item.front}` !== lastPickKey);
    const candidates = fresh.length ? fresh : items;
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    if (pick) lastPickKey = `${deck.id}:${pick.front}`;
    app.innerHTML = `<div class="deck-head"><h1>${escapeHtml(deck.title)} <span class="count">${items.length}</span></h1>
        <button id="browse" class="text-button" type="button">Browse all</button></div>
        ${pick ? cardHtml({ ...pick, deck }, items) : `<p class="empty">Nothing here yet.</p>`}
        ${pick ? `<div class="actions"><button id="next" class="primary" type="button">Another</button></div>` : ""}`;
    app.querySelector("#browse").addEventListener("click", () => renderList(deck, items, true));
    app.querySelector("#next")?.addEventListener("click", () => renderPractice(deck, items));
    bindCard();
};

const renderList = (deck, items, showPractice = false) => {
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
            ${showPractice ? `<button id="practice" class="text-button" type="button">Practice</button>` : ""}
            ${items.length ? `<input id="search" type="search" placeholder="Filter…" aria-label="Filter items">` : ""}
        </div>
        ${items.length ? body : `<p class="empty">Nothing here yet. Add lines to <code>content/${escapeHtml(deck.file)}</code>.</p>`}`;

    app.querySelector("#practice")?.addEventListener("click", () => renderPractice(deck, items));
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
    else if (deck.mode === "words" || deck.mode === "quote") renderPractice(deck, data);
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
    if (event.target.closest("input, textarea, button")) return;
    if (location.hash.startsWith("#/deck/") && !app.querySelector(".quiz-card")) return;
    if (event.key === " " || event.key === "ArrowRight") {
        event.preventDefault();
        if (event.key === "ArrowRight" || !reveal()) {
            if (location.hash.startsWith("#/deck/")) app.querySelector("#next")?.click();
            else renderRandom();
        }
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

if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("service-worker.js").catch(() => {}));
}
