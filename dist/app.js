const DATA_URL = "./data/recommendations.json";
const LIKES_KEY = "signal-dig-crate-v1";

const state = {
  items: [],
  liked: new Set(loadLikes()),
  store: "all",
  genre: "all",
  sort: "signal",
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function loadLikes() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LIKES_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function persistLikes() {
  const ids = [...state.liked];
  try {
    localStorage.setItem(LIKES_KEY, JSON.stringify(ids));
    const verified = JSON.parse(localStorage.getItem(LIKES_KEY) || "[]");
    if (verified.length !== ids.length || !ids.every((id) => verified.includes(id))) {
      throw new Error("No se pudo verificar el guardado local");
    }
  } catch (error) {
    window.alert(`El navegador bloqueó el guardado del crate: ${error.message}`);
  }
}

function currency(value, code) {
  if (value == null || !code) return "Precio no publicado";
  try {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: code,
      minimumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${code} ${Number(value).toFixed(2)}`;
  }
}

function formatDuration(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  const seconds = Math.round(Number(value));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function filteredItems() {
  const filtered = state.items.filter(
    (item) => (state.store === "all" || item.store === state.store) && (state.genre === "all" || item.genre === state.genre),
  );
  return filtered.sort((a, b) => {
    if (state.sort === "price-asc") return (a.price ?? Infinity) - (b.price ?? Infinity);
    if (state.sort === "price-desc") return (b.price ?? -1) - (a.price ?? -1);
    if (state.sort === "bpm") return (b.bpm ?? -1) - (a.bpm ?? -1);
    if (a.rank !== b.rank) return a.rank - b.rank;
    return a.store.localeCompare(b.store);
  });
}

function groupTotals(items) {
  return items.reduce((totals, item) => {
    if (item.price != null && item.currency) totals[item.currency] = (totals[item.currency] || 0) + Number(item.price);
    return totals;
  }, {});
}

function totalText(totals) {
  const ordered = Object.entries(totals).sort(([a], [b]) => a.localeCompare(b));
  return ordered.length ? ordered.map(([code, value]) => currency(value, code)).join(" + ") : "$0.00";
}

function likedItems() {
  return state.items.filter((item) => state.liked.has(item.id));
}

function toggleLike(id) {
  if (state.liked.has(id)) state.liked.delete(id);
  else state.liked.add(id);
  persistLikes();
  renderCards();
  renderCrate();
}

function metaPill(text) {
  const pill = document.createElement("span");
  pill.textContent = text;
  return pill;
}

function renderCards() {
  const grid = $("#recommendation-grid");
  const template = $("#card-template");
  const items = filteredItems();
  grid.replaceChildren();

  items.forEach((item) => {
    const fragment = template.content.cloneNode(true);
    const card = $(".track-card", fragment);
    card.dataset.store = item.store;
    if (item.artwork) {
      card.classList.add("has-art");
      const image = $(".track-art", fragment);
      image.src = item.artwork;
      image.alt = `Portada de ${item.title}`;
    }
    $(".rank-badge", fragment).textContent = `#${item.rank}`;
    $(".store-badge", fragment).textContent = item.store;
    $(".genre-label", fragment).textContent = item.genre;
    $(".popularity-label", fragment).textContent = item.popularityLabel;
    $(".track-title", fragment).textContent = item.title;
    $(".track-artist", fragment).textContent = item.artist;
    $(".track-mix", fragment).textContent = item.mix && item.mix !== item.title ? item.mix : "";

    const metadata = $(".track-meta", fragment);
    if (item.bpm) metadata.append(metaPill(`${item.bpm} BPM`));
    if (item.key) metadata.append(metaPill(item.key));
    if (item.duration) metadata.append(metaPill(formatDuration(item.duration)));
    if (item.label) metadata.append(metaPill(item.label));
    else if (item.location) metadata.append(metaPill(item.location));

    $(".track-price", fragment).textContent = currency(item.price, item.currency);
    $(".price-basis", fragment).textContent = item.priceBasis;
    const heart = $(".heart-button", fragment);
    const isLiked = state.liked.has(item.id);
    heart.classList.toggle("is-liked", isLiked);
    heart.setAttribute("aria-pressed", String(isLiked));
    heart.setAttribute("aria-label", isLiked ? "Quitar de mi crate" : "Guardar en mi crate");
    heart.addEventListener("click", () => toggleLike(item.id));

    const listen = $(".listen-button", fragment);
    if (item.store === "bandcamp" && item.embedUrl) listen.addEventListener("click", () => openPlayer(item));
    else listen.remove();
    const storeLink = $(".store-link", fragment);
    storeLink.href = item.url;
    storeLink.textContent = item.store === "bandcamp" ? "Bandcamp" : "Beatport";
    grid.append(fragment);
  });

  $("#results-copy").textContent = `${items.length} señales · ${state.store === "all" ? "2 tiendas" : state.store} · ${state.genre === "all" ? "2 géneros" : state.genre}`;
  renderStats(items);
  renderInsights(items);
}

function renderStats(items) {
  $("#stat-count").textContent = items.length;
  const usd = items.filter((item) => item.currency === "USD" && item.price != null);
  const average = usd.length ? usd.reduce((sum, item) => sum + Number(item.price), 0) / usd.length : null;
  $("#stat-price").textContent = average == null ? "—" : currency(average, "USD");
  const bpms = items.map((item) => item.bpm).filter(Boolean);
  $("#stat-bpm").textContent = bpms.length ? `${Math.min(...bpms)}–${Math.max(...bpms)}` : "—";
}

function renderInsights(items) {
  const counts = ["house", "techno"].map((genre) => ({ genre, count: items.filter((item) => item.genre === genre).length }));
  const leader = [...counts].sort((a, b) => b.count - a.count)[0];
  const beatport = items.filter((item) => item.store === "beatport");
  const medianBpm = beatport.length
    ? [...beatport].sort((a, b) => a.bpm - b.bpm)[Math.floor(beatport.length / 2)].bpm
    : null;
  $("#insight-title").textContent = leader?.count ? `${leader.genre} concentra la señal` : "Sin señales visibles";
  $("#insight-copy").textContent = medianBpm
    ? `${leader.count} entradas visibles y una mediana de ${medianBpm} BPM en Beatport. Cruza posición, energía y precio antes de comprar.`
    : `${leader?.count || 0} entradas visibles. Bandcamp aporta exploración de catálogo y precio de lanzamiento.`;

  const bars = $("#genre-bars");
  bars.replaceChildren();
  const max = Math.max(...counts.map((entry) => entry.count), 1);
  counts.forEach(({ genre, count }) => {
    const row = document.createElement("div");
    row.className = "bar-row";
    row.innerHTML = `<span>${genre}</span><div class="bar-track"><div class="bar-fill" style="width:${(count / max) * 100}%"></div></div><strong>${count}</strong>`;
    bars.append(row);
  });

  const currencies = Object.entries(
    items.reduce((map, item) => {
      if (item.currency && item.price != null) map[item.currency] = (map[item.currency] || 0) + 1;
      return map;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);
  $("#priced-count").textContent = `${currencies.reduce((sum, [, count]) => sum + count, 0)} con precio`;
  const priceMap = $("#price-map");
  priceMap.replaceChildren();
  const maxCurrency = Math.max(...currencies.map(([, count]) => count), 1);
  currencies.forEach(([code, count]) => {
    const row = document.createElement("div");
    row.className = "price-row";
    row.innerHTML = `<span>${code}</span><strong>${count} items</strong><div class="price-rule"><i style="width:${(count / maxCurrency) * 100}%"></i></div>`;
    priceMap.append(row);
  });
}

function renderCrate() {
  const items = likedItems();
  const totals = groupTotals(items);
  $("#crate-count").textContent = items.length;
  $("#crate-total").textContent = totalText(totals);
  $("#hero-total").textContent = totalText(totals);
  $("#hero-total-detail").textContent = `${items.length} ${items.length === 1 ? "pista seleccionada" : "pistas seleccionadas"}`;
  const list = $("#crate-list");
  list.replaceChildren();
  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "empty-crate";
    empty.textContent = "Tu crate está vacío. Marca un corazón y la selección quedará guardada en este navegador.";
    list.append(empty);
    return;
  }
  items.forEach((item, index) => {
    const row = document.createElement("article");
    row.className = "crate-item";
    row.innerHTML = `
      <div class="crate-item-index">${String(index + 1).padStart(2, "0")}</div>
      <div><strong></strong><small></small></div>
      <div class="crate-item-price"><span></span><button class="crate-remove" type="button">Quitar</button></div>`;
    $("strong", row).textContent = item.title;
    $("small", row).textContent = `${item.artist} · ${item.store}`;
    $(".crate-item-price span", row).textContent = currency(item.price, item.currency);
    $(".crate-remove", row).addEventListener("click", () => toggleLike(item.id));
    list.append(row);
  });
}

function openCrate() {
  $("#crate-panel").classList.add("is-open");
  $("#crate-panel").setAttribute("aria-hidden", "false");
  $("#scrim").hidden = false;
  document.body.style.overflow = "hidden";
}

function closeCrate() {
  $("#crate-panel").classList.remove("is-open");
  $("#crate-panel").setAttribute("aria-hidden", "true");
  $("#scrim").hidden = true;
  document.body.style.overflow = "";
}

function openPlayer(item) {
  $("#player-title").textContent = `${item.artist} — ${item.title}`;
  $("#bandcamp-player").src = item.embedUrl;
  $("#player-dock").hidden = false;
}

function closePlayer() {
  $("#player-dock").hidden = true;
  $("#bandcamp-player").src = "about:blank";
}

function exportCrate() {
  const items = likedItems();
  if (!items.length) return;
  const totals = totalText(groupTotals(items));
  const lines = ["SIGNAL / MI CRATE", `Total: ${totals}`, "", ...items.map((item, index) => `${index + 1}. ${item.artist} — ${item.title} [${item.store}] · ${currency(item.price, item.currency)}\n   ${item.url}`)];
  const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `signal-crate-${new Date().toISOString().slice(0, 10)}.txt`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function bindControls() {
  ["store", "genre"].forEach((type) => {
    $$(`#${type}-filter button`).forEach((button) => {
      button.addEventListener("click", () => {
        state[type] = button.dataset.value;
        $$(`#${type}-filter button`).forEach((peer) => peer.classList.toggle("is-active", peer === button));
        renderCards();
      });
    });
  });
  $("#sort-select").addEventListener("change", (event) => {
    state.sort = event.target.value;
    renderCards();
  });
  $("#crate-trigger").addEventListener("click", openCrate);
  $("#crate-close").addEventListener("click", closeCrate);
  $("#scrim").addEventListener("click", closeCrate);
  $("#player-close").addEventListener("click", closePlayer);
  $("#export-crate").addEventListener("click", exportCrate);
  $("#clear-crate").addEventListener("click", () => {
    if (!state.liked.size || !window.confirm("¿Vaciar todas las pistas guardadas en tu crate?")) return;
    state.liked.clear();
    persistLikes();
    renderCards();
    renderCrate();
  });
  $("#method-toggle").addEventListener("click", (event) => {
    const expanded = event.currentTarget.getAttribute("aria-expanded") === "true";
    event.currentTarget.setAttribute("aria-expanded", String(!expanded));
    $("#method-content").hidden = expanded;
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeCrate();
      closePlayer();
    }
  });
}

async function init() {
  bindControls();
  try {
    const response = await fetch(DATA_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    state.items = payload.items || [];
    const knownIds = new Set(state.items.map((item) => item.id));
    state.liked = new Set([...state.liked].filter((id) => knownIds.has(id)));
    persistLikes();
    const updated = new Date(payload.updatedAt);
    $("#stat-updated").textContent = new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "short" }).format(updated);
    $("#method-bandcamp").textContent = payload.methodology.bandcamp;
    $("#method-beatport").textContent = payload.methodology.beatport;
    $("#method-prices").textContent = payload.methodology.prices;
    renderCards();
    renderCrate();
  } catch (error) {
    $("#recommendation-grid").innerHTML = `<div class="empty-crate">No fue posible cargar el snapshot. ${error.message}</div>`;
  }
}

init();
