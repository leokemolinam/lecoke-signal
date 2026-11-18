const state = {
  data: null,
  mixes: [],
  queue: [],
  currentIndex: -1,
  current: null,
  activeMix: "dna",
  shuffle: false,
  repeat: false,
  favorites: JSON.parse(localStorage.getItem("signal-favorites") || "[]"),
  previewCache: JSON.parse(localStorage.getItem("signal-preview-cache") || "{}"),
  lists: {},
  bandcamp: null,
  bandcampMode: "collection",
  bandcampDisplay: [],
  currentBandcamp: null,
  bandcampReleaseQueue: [],
  bandcampReleaseIndex: -1,
  bandcampNative: false,
  bandcampTrackCache: new Map(),
  bandcampLikes: JSON.parse(localStorage.getItem("signal-bandcamp-likes") || "[]"),
  pendingBandcampWish: null,
};

const audio = new Audio();
audio.preload = "metadata";
audio.volume = 0.8;

const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];

function normalize(value = "") {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

function idFor(track) {
  return `${track.artist}::${track.track}`;
}

function formatNumber(value) {
  return new Intl.NumberFormat("es-CO").format(value || 0);
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "0:00";
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character]);
}

function shuffled(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

let toastTimer;
function toast(message) {
  const node = $("#toast");
  node.textContent = message;
  node.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove("is-visible"), 2600);
}

function persistFavorites() {
  localStorage.setItem("signal-favorites", JSON.stringify(state.favorites));
}

function isFavorite(track) {
  return state.favorites.some((item) => idFor(item) === idFor(track));
}

function toggleFavorite(track = state.current) {
  if (!track) return;
  const index = state.favorites.findIndex((item) => idFor(item) === idFor(track));
  if (index >= 0) {
    state.favorites.splice(index, 1);
    toast("Eliminada de favoritos");
  } else {
    state.favorites.unshift({ ...track });
    toast("Guardada en favoritos");
  }
  persistFavorites();
  updateFavoriteButtons();
  renderFavorites();
}

function updateFavoriteButtons() {
  $$(".favorite-button").forEach((button) => {
    button.classList.toggle("is-active", Boolean(state.current && isFavorite(state.current)));
    button.textContent = state.current && isFavorite(state.current) ? "♥" : "♡";
  });
}

function artworkUrl(result, size = 600) {
  return (result.artworkUrl100 || result.artworkUrl60 || "").replace(/\d+x\d+bb/, `${size}x${size}bb`);
}

async function queryItunes(term, limit = 20) {
  const url = new URL("https://itunes.apple.com/search");
  url.searchParams.set("term", term);
  url.searchParams.set("media", "music");
  url.searchParams.set("entity", "song");
  url.searchParams.set("country", "CO");
  url.searchParams.set("limit", String(limit));
  const response = await fetch(url);
  if (!response.ok) throw new Error("No se pudo consultar el catálogo");
  const payload = await response.json();
  return payload.results || [];
}

function scoreResult(result, track) {
  const artist = normalize(result.artistName);
  const title = normalize(result.trackName);
  const targetArtist = normalize(track.artist);
  const targetTitle = normalize(track.track);
  let score = 0;
  if (artist === targetArtist) score += 9;
  else if (artist.includes(targetArtist) || targetArtist.includes(artist)) score += 5;
  if (title === targetTitle) score += 12;
  else if (title.includes(targetTitle) || targetTitle.includes(title)) score += 6;
  if (result.previewUrl) score += 3;
  return score;
}

async function resolveTrack(track) {
  if (track.localUrl || track.previewUrl || track.streamUrl) return track;
  const key = idFor(track);
  if (state.previewCache[key]) return { ...track, ...state.previewCache[key] };

  const results = await queryItunes(`${track.artist} ${track.track}`, 12);
  const best = results
    .filter((result) => result.previewUrl)
    .sort((a, b) => scoreResult(b, track) - scoreResult(a, track))[0];
  if (!best || scoreResult(best, track) < 7) return null;

  const resolved = {
    previewUrl: best.previewUrl,
    artwork: artworkUrl(best),
    album: best.collectionName || track.album,
    fullUrl: best.trackViewUrl || best.collectionViewUrl || "",
    durationMs: best.trackTimeMillis || 0,
    sourceType: "preview",
  };
  state.previewCache[key] = resolved;
  const entries = Object.entries(state.previewCache).slice(-180);
  state.previewCache = Object.fromEntries(entries);
  localStorage.setItem("signal-preview-cache", JSON.stringify(state.previewCache));
  return { ...track, ...resolved };
}

function setArtwork(container, track, fallback = "S") {
  if (!container) return;
  container.innerHTML = track?.artwork
    ? `<img src="${track.artwork}" alt="Carátula de ${track.track}">`
    : `<span>${fallback}</span>`;
}

function updateNowPlaying(track) {
  state.current = track;
  $("#player-title").textContent = track.track;
  $("#player-artist").textContent = track.artist;
  $("#hero-title").textContent = track.track;
  $("#hero-artist").textContent = `${track.artist}${track.album ? ` · ${track.album}` : ""}`;
  $("#hero-source").textContent = track.streamUrl
    ? "BANDCAMP · STREAM COMPLETO HABILITADO POR EL ARTISTA"
    : track.localUrl ? "ARCHIVO LOCAL · REPRODUCCIÓN COMPLETA" : "PREVIEW OFICIAL · SIN ANUNCIOS INSERTADOS";
  $("#source-badge").textContent = track.streamUrl ? "BANDCAMP · CONTINUO" : track.localUrl ? "ARCHIVO LOCAL" : "PREVIEW OFICIAL";
  setArtwork($("#player-thumb"), track);
  const heroArtwork = $("#hero-artwork");
  heroArtwork.querySelectorAll("img").forEach((node) => node.remove());
  const placeholder = heroArtwork.querySelector(".artwork-placeholder");
  if (track.artwork) {
    const image = document.createElement("img");
    image.src = track.artwork;
    image.alt = `Carátula de ${track.track}`;
    heroArtwork.insertBefore(image, heroArtwork.firstChild);
    placeholder.style.display = "none";
  } else {
    placeholder.style.display = "grid";
  }

  const link = $("#full-track-link");
  if (track.fullUrl) {
    link.href = track.fullUrl;
    link.classList.remove("is-disabled");
  } else {
    link.removeAttribute("href");
    link.classList.add("is-disabled");
  }
  updateFavoriteButtons();
  renderQueue();
}

function setPlayState(playing) {
  $("#main-play").textContent = playing ? "❚❚" : "▶";
  $("#hero-play").textContent = playing ? "❚❚" : "▶";
}

async function playTrack(track, options = {}) {
  if (!track) return;
  if (!options.bandcamp) {
    state.currentBandcamp = null;
    state.bandcampNative = false;
  }
  if (options.queue) state.queue = options.queue;
  if (Number.isInteger(options.index)) state.currentIndex = options.index;
  toast(`Buscando una fuente para “${track.track}”…`);
  try {
    const resolved = await resolveTrack(track);
    if (!resolved) {
      toast("No encontré un preview autorizado para esta canción");
      if (options.autoskip) nextTrack();
      return;
    }
    const sourceUrl = resolved.localUrl || resolved.streamUrl || resolved.previewUrl;
    const sameSource = audio.src === sourceUrl;
    updateNowPlaying(resolved);
    if (!sameSource) audio.src = sourceUrl;
    await audio.play();
    setPlayState(true);
    toast(resolved.streamUrl ? "Bandcamp continuo activado" : resolved.localUrl ? "Reproduciendo archivo local" : "Reproduciendo preview oficial");
  } catch (error) {
    console.error(error);
    toast("La fuente no está disponible en este momento");
  }
}

function playMix(mixId, startIndex = 0) {
  const mix = state.mixes.find((item) => item.id === mixId);
  if (!mix || !mix.tracks.length) return;
  state.activeMix = mixId;
  state.queue = [...mix.tracks];
  state.currentIndex = startIndex;
  playTrack(state.queue[startIndex], { queue: state.queue, index: startIndex });
}

function nextTrack() {
  if (!state.queue.length) return;
  if (state.repeat && state.current) {
    audio.currentTime = 0;
    audio.play();
    return;
  }
  if (state.currentBandcamp && state.bandcampNative && !state.repeat && state.currentIndex >= state.queue.length - 1) {
    advanceBandcampRelease(1);
    return;
  }
  const next = state.shuffle
    ? Math.floor(Math.random() * state.queue.length)
    : (state.currentIndex + 1) % state.queue.length;
  state.currentIndex = next;
  playTrack(state.queue[next], { index: next, autoskip: true, bandcamp: Boolean(state.currentBandcamp && state.bandcampNative) });
}

function previousTrack() {
  if (!state.queue.length) return;
  if (audio.currentTime > 4) {
    audio.currentTime = 0;
    return;
  }
  if (state.currentBandcamp && state.bandcampNative && state.currentIndex === 0) {
    advanceBandcampRelease(-1);
    return;
  }
  state.currentIndex = (state.currentIndex - 1 + state.queue.length) % state.queue.length;
  playTrack(state.queue[state.currentIndex], { index: state.currentIndex, bandcamp: Boolean(state.currentBandcamp) });
}

function togglePlayback() {
  if (state.currentBandcamp) {
    if (state.bandcampNative) {
      if (audio.paused) audio.play(); else audio.pause();
      return;
    }
    showView("bandcamp");
    $("#bandcamp-player-shell").scrollIntoView({ behavior: "smooth", block: "center" });
    toast("Usa el control del reproductor oficial de Bandcamp");
    return;
  }
  if (!state.current) {
    playMix(state.activeMix || "dna");
    return;
  }
  if (audio.paused) audio.play(); else audio.pause();
}

function showView(name) {
  $$(".view").forEach((view) => view.classList.remove("is-active"));
  $(`#view-${name}`)?.classList.add("is-active");
  $$(".nav-item").forEach((item) => item.classList.toggle("is-active", item.dataset.view === name));
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (name === "favorites") renderFavorites();
}

function waveform() {
  return "<div class=\"mix-visual\"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>";
}

function renderMixes() {
  $("#mix-grid").innerHTML = state.mixes.map((mix) => `
    <article class="mix-card" data-mix="${mix.id}" style="--mix-color:${mix.accent}">
      ${waveform()}
      <h3>${mix.title}</h3>
      <p>${mix.subtitle}</p>
      <footer><span>${mix.tracks.length} señales</span><span class="mini-play">▶</span></footer>
    </article>
  `).join("");

  $("#side-mixes").innerHTML = state.mixes.map((mix) => `
    <button class="side-mix" data-mix="${mix.id}" style="--mix-color:${mix.accent}">${mix.title}</button>
  `).join("");

  $("#library-filters").innerHTML = state.mixes.map((mix, index) => `
    <button class="filter-chip ${index === 0 ? "is-active" : ""}" data-library-mix="${mix.id}">${mix.title}</button>
  `).join("");
}

function renderArtists() {
  $("#top-artists").innerHTML = state.data.topArtists.slice(0, 10).map((artist) => `
    <div class="artist-row">
      <span class="rank">${String(artist.rank).padStart(2, "0")}</span>
      <div><strong>${artist.artist}</strong><span>${formatNumber(artist.plays)} scrobbles</span></div>
      <span>${((artist.plays / state.data.profile.totalScrobbles) * 100).toFixed(1)}%</span>
      <button data-play-artist="${artist.artist}" aria-label="Reproducir ${artist.artist}">▶</button>
    </div>
  `).join("");
}

function renderTrackTable(container, tracks, listId) {
  state.lists[listId] = tracks;
  if (!tracks.length) {
    container.innerHTML = `<div class="empty-state"><strong>Aún no hay canciones aquí.</strong>Añade archivos propios o guarda canciones durante la sesión.</div>`;
    return;
  }
  container.innerHTML = tracks.map((track, index) => `
    <div class="track-row">
      <span class="track-number">${String(index + 1).padStart(2, "0")}</span>
      <div class="track-main">
        <div class="track-art">${track.artwork ? `<img src="${track.artwork}" alt="">` : (track.artist?.[0] || "S")}</div>
        <div class="track-copy"><strong>${track.track}</strong><span>${track.artist}</span></div>
      </div>
      <span class="track-album">${track.album || "Catálogo personal"}</span>
      <span class="track-plays">${track.plays ? `${formatNumber(track.plays)} plays` : track.sourceType === "search" ? "preview" : "local"}</span>
      <button class="row-play" data-list="${listId}" data-index="${index}" aria-label="Reproducir ${track.track}">▶</button>
    </div>
  `).join("");
}

function renderLibrary(mixId = "dna") {
  const mix = state.mixes.find((item) => item.id === mixId) || state.mixes[0];
  renderTrackTable($("#library-tracks"), mix.tracks, `library-${mix.id}`);
  $$("[data-library-mix]").forEach((chip) => chip.classList.toggle("is-active", chip.dataset.libraryMix === mix.id));
}

function renderBritish() {
  const mix = state.mixes.find((item) => item.id === "british");
  renderTrackTable($("#british-tracks"), mix.tracks.slice(0, 22), "british");
  $("#british-ranking").innerHTML = state.data.britishArtists.slice(0, 15).map((artist) => `
    <div class="rank-item"><b>${String(artist.rank).padStart(2, "0")}</b><strong>${artist.artist}</strong><span>${formatNumber(artist.plays)}</span></div>
  `).join("");
}

function renderFavorites() {
  renderTrackTable($("#favorite-tracks"), state.favorites, "favorites");
}

function allBandcampItems() {
  if (!state.bandcamp) return [];
  const byId = new Map();
  const charts = Object.values(state.bandcamp.charts || {}).flatMap((chart) => chart.items || []);
  [...charts, ...state.bandcamp.wishlist, ...state.bandcamp.collection].forEach((item) => byId.set(item.id, item));
  return [...byId.values()];
}

function chartItems(tag) {
  return state.bandcamp?.charts?.[tag]?.items || [];
}

function bandcampSourceLabel(item) {
  if (item.source === "collection") return "colección";
  if (item.source === "wishlist") return "wishlist";
  if (item.source === "chart-house") return `house #${item.rank}`;
  if (item.source === "chart-techno") return `techno #${item.rank}`;
  return "Bandcamp";
}

function bandcampMatches(query) {
  const needle = normalize(query);
  if (!needle) return allBandcampItems();
  return allBandcampItems().filter((item) => normalize([
    item.title,
    item.artist,
    item.album,
    item.featuredTrack,
  ].join(" ")).includes(needle));
}

function renderBandcamp(mode = state.bandcampMode, query = "") {
  if (!state.bandcamp) return;
  state.bandcampMode = mode;
  let items;
  let title;
  if (query) {
    items = bandcampMatches(query);
    title = `Resultados para “${query}”`;
  } else if (mode === "wishlist") {
    items = state.bandcamp.wishlist;
    title = "Tu wishlist";
  } else if (mode === "dig") {
    items = shuffled(allBandcampItems()).slice(0, 32);
    title = "Dig picks";
  } else if (mode === "house" || mode === "techno") {
    items = chartItems(mode);
    title = `${mode === "house" ? "House" : "Techno"} best-selling`;
  } else {
    items = state.bandcamp.collection;
    title = "Tu colección";
  }
  state.bandcampDisplay = items;
  $("#bandcamp-list-title").textContent = title;
  $("#bandcamp-result-note").textContent = query
    ? `${items.length} coincidencia${items.length === 1 ? "" : "s"} con reproducción oficial disponible.`
    : mode === "house" || mode === "techno"
      ? `${items.length} lanzamientos populares en Discover, ordenados por la señal pública “top” de Bandcamp.`
    : mode === "dig"
      ? "Selección aleatoria para buscar texturas, grooves y referencias nuevas."
      : `${items.length} lanzamientos públicos de okefm.`;
  $$("[data-bandcamp-mode]").forEach((button) => button.classList.toggle("is-active", !query && button.dataset.bandcampMode === mode));
  $("#bandcamp-grid").innerHTML = items.map((item) => `
    <article class="bandcamp-card ${state.currentBandcamp?.id === item.id ? "is-current" : ""}" data-bandcamp-card="${escapeHtml(item.id)}">
      <div class="bandcamp-card-art">
        ${item.artwork ? `<img src="${escapeHtml(item.artwork)}" alt="" loading="lazy">` : ""}
        <span class="bandcamp-card-badge">${escapeHtml(bandcampSourceLabel(item))}</span>
        <button class="bandcamp-card-heart ${isBandcampWishlisted(item) ? "is-active" : ""}" data-bandcamp-heart="${escapeHtml(item.id)}" aria-label="Guardar ${escapeHtml(item.title)} en la wishlist de Bandcamp">${isBandcampWishlisted(item) ? "♥" : "♡"}</button>
        <button class="bandcamp-card-play" data-bandcamp-id="${escapeHtml(item.id)}" aria-label="Escuchar ${escapeHtml(item.title)} completo">▶</button>
      </div>
      <div class="bandcamp-card-copy">
        <strong title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</strong>
        <span title="${escapeHtml(item.artist)}">${escapeHtml(item.artist)}</span>
        <footer><span>${item.itemType}</span><span>${item.rank ? `top #${item.rank}` : `${formatNumber(item.streamableTracks)} track${item.streamableTracks === 1 ? "" : "s"}`}</span></footer>
      </div>
    </article>
  `).join("") || `<div class="empty-state"><strong>No encontré coincidencias en Bandcamp.</strong>Prueba con otro artista o título.</div>`;
}

function isBandcampWishlisted(item) {
  return item?.source === "wishlist" || state.bandcampLikes.includes(item?.id);
}

function persistBandcampLikes() {
  localStorage.setItem("signal-bandcamp-likes", JSON.stringify(state.bandcampLikes));
}

function openBandcampWishlist(item) {
  if (!item?.url) return;
  state.pendingBandcampWish = item;
  const target = `${item.url.split("#")[0]}#collect-anchor`;
  $("#bandcamp-wishlist-frame").src = target;
  $("#bandcamp-wishlist-link").href = target;
  $("#wishlist-title").textContent = `Guardar “${item.title}”`;
  $("#bandcamp-wishlist-modal").hidden = false;
  document.body.style.overflow = "hidden";
}

function closeBandcampWishlist() {
  $("#bandcamp-wishlist-modal").hidden = true;
  $("#bandcamp-wishlist-frame").src = "about:blank";
  document.body.style.overflow = "";
}

function confirmBandcampWishlist() {
  const item = state.pendingBandcampWish;
  if (item && !state.bandcampLikes.includes(item.id)) state.bandcampLikes.push(item.id);
  persistBandcampLikes();
  closeBandcampWishlist();
  renderBandcamp(state.bandcampMode);
  toast("Confirmación guardada en esta sesión");
}

async function fetchBandcampReleaseTracks(item) {
  if (state.bandcampTrackCache.has(item.id)) return state.bandcampTrackCache.get(item.id);
  const promise = (async () => {
    try {
      const localResponse = await fetch(`/api/bandcamp-release?url=${encodeURIComponent(item.url)}`);
      if (localResponse.ok && localResponse.headers.get("content-type")?.includes("application/json")) {
        const localPayload = await localResponse.json();
        if (Array.isArray(localPayload.tracks) && localPayload.tracks.length) {
          return localPayload.tracks.map((track, index) => {
            let fullUrl = item.url;
            try { if (track.titleLink) fullUrl = new URL(track.titleLink, item.url).href; } catch (error) { console.debug(error); }
            return {
              artist: track.artist || item.artist,
              track: track.title || `Pista ${index + 1}`,
              album: item.album || item.title,
              artwork: item.artwork,
              streamUrl: track.streamUrl,
              fullUrl,
              durationMs: Number(track.duration || 0) * 1000,
              sourceType: "bandcamp",
              releaseId: item.id,
            };
          });
        }
      }
    } catch (error) {
      console.debug("Puente local no disponible", error);
    }
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(item.url)}`;
    const response = await fetch(proxyUrl);
    if (!response.ok) throw new Error(`Bandcamp proxy ${response.status}`);
    const source = await response.text();
    const documentNode = new DOMParser().parseFromString(source, "text/html");
    const payloadNode = documentNode.querySelector("[data-tralbum]");
    if (!payloadNode) throw new Error("Bandcamp no expuso datos de reproducción");
    const payload = JSON.parse(payloadNode.getAttribute("data-tralbum"));
    const tracks = (payload.trackinfo || []).filter((track) => track.file?.["mp3-128"] && Number(track.streaming) !== 0);
    return tracks.map((track, index) => {
      let fullUrl = item.url;
      try { if (track.title_link) fullUrl = new URL(track.title_link, item.url).href; } catch (error) { console.debug(error); }
      return {
        artist: track.artist || item.artist,
        track: track.title || `Pista ${index + 1}`,
        album: item.album || item.title,
        artwork: item.artwork,
        streamUrl: track.file["mp3-128"].replaceAll("&amp;", "&"),
        fullUrl,
        durationMs: Number(track.duration || 0) * 1000,
        sourceType: "bandcamp",
        releaseId: item.id,
      };
    });
  })();
  state.bandcampTrackCache.set(item.id, promise);
  try {
    return await promise;
  } catch (error) {
    state.bandcampTrackCache.delete(item.id);
    throw error;
  }
}

function renderBandcampNativeTracks() {
  $("#bandcamp-native-status").textContent = `${state.queue.length} pista${state.queue.length === 1 ? "" : "s"} · después sigue otro lanzamiento`;
  $("#bandcamp-native-tracklist").innerHTML = state.queue.map((track, index) => `
    <button class="bandcamp-native-track ${index === state.currentIndex ? "is-current" : ""}" data-bandcamp-track="${index}">
      <span>${index === state.currentIndex && !audio.paused ? "▶" : String(index + 1).padStart(2, "0")}</span>
      <strong>${escapeHtml(track.track)}</strong>
      <span>${formatTime((track.durationMs || 0) / 1000)}</span>
    </button>
  `).join("");
}

function prepareBandcampPlayer(item) {
  state.currentBandcamp = item;
  $("#bandcamp-player-empty").hidden = true;
  $("#bandcamp-player-meta").hidden = false;
  $("#bandcamp-now-title").textContent = item.title;
  $("#bandcamp-now-artist").textContent = `${item.artist}${item.featuredTrack ? ` · ${item.featuredTrack}` : ""}`;
  $("#bandcamp-now-link").href = item.url;
  $("#player-title").textContent = item.title;
  $("#player-artist").textContent = item.artist;
  const link = $("#full-track-link");
  link.href = item.url;
  link.classList.remove("is-disabled");
  setArtwork($("#player-thumb"), { artwork: item.artwork, track: item.title }, "B");
  showView("bandcamp");
  $$('[data-bandcamp-card]').forEach((card) => card.classList.toggle("is-current", card.dataset.bandcampCard === item.id));
}

async function openBandcampItem(item, options = {}) {
  if (!item) return false;
  audio.pause();
  prepareBandcampPlayer(item);
  if (!options.preserveReleaseQueue) {
    state.bandcampReleaseQueue = state.bandcampDisplay.length ? [...state.bandcampDisplay] : allBandcampItems();
    state.bandcampReleaseIndex = state.bandcampReleaseQueue.findIndex((candidate) => candidate.id === item.id);
  }
  const player = $("#bandcamp-player");
  player.hidden = true;
  player.src = "about:blank";
  $("#bandcamp-native-player").hidden = false;
  $("#bandcamp-native-status").textContent = "Preparando la cola continua…";
  $("#bandcamp-native-tracklist").innerHTML = `<div class="loading-row">Leyendo las pistas públicas habilitadas por el artista…</div>`;
  $("#bandcamp-player-label").textContent = "BANDCAMP · CARGANDO COLA";
  state.bandcampNative = false;
  if (options.scroll !== false) $("#bandcamp-player-shell").scrollIntoView({ behavior: "smooth", block: "center" });

  try {
    const tracks = await fetchBandcampReleaseTracks(item);
    if (state.currentBandcamp?.id !== item.id) return false;
    if (!tracks.length) throw new Error("Este lanzamiento no tiene streams públicos");
    state.bandcampNative = true;
    state.queue = tracks;
    state.currentIndex = Math.min(options.startIndex || 0, tracks.length - 1);
    $("#bandcamp-player-label").textContent = "BANDCAMP · REPRODUCCIÓN CONTINUA";
    renderBandcampNativeTracks();
    await playTrack(tracks[state.currentIndex], { queue: tracks, index: state.currentIndex, bandcamp: true });
    renderBandcampNativeTracks();
    return true;
  } catch (error) {
    console.warn(error);
    if (options.skipFallback || state.currentBandcamp?.id !== item.id) return false;
    state.bandcampNative = false;
    state.queue = [];
    state.currentIndex = -1;
    $("#bandcamp-native-player").hidden = true;
    $("#bandcamp-player-label").textContent = "REPRODUCTOR OFICIAL DE BANDCAMP";
    player.src = item.embedUrl;
    player.hidden = false;
    $("#source-badge").textContent = "BANDCAMP · OFICIAL";
    toast("Este sello requiere el reproductor oficial de Bandcamp");
    return false;
  }
}

async function advanceBandcampRelease(step = 1) {
  const releases = state.bandcampReleaseQueue.length ? state.bandcampReleaseQueue : allBandcampItems();
  if (!releases.length) return;
  for (let offset = 1; offset <= releases.length; offset += 1) {
    const index = (state.bandcampReleaseIndex + (step * offset) + releases.length) % releases.length;
    const played = await openBandcampItem(releases[index], { scroll: false, preserveReleaseQueue: true, skipFallback: true });
    if (played) {
      state.bandcampReleaseIndex = index;
      toast("Siguiente lanzamiento cargado automáticamente");
      return;
    }
  }
  toast("No encontré otro lanzamiento reproducible en la cola");
}

function prefetchNextBandcampRelease() {
  if (!state.bandcampNative || !state.bandcampReleaseQueue.length) return;
  const nextIndex = (state.bandcampReleaseIndex + 1) % state.bandcampReleaseQueue.length;
  fetchBandcampReleaseTracks(state.bandcampReleaseQueue[nextIndex]).catch(() => {});
}

function digNext() {
  const wishPool = state.bandcamp?.wishlist.filter((item) => item.id !== state.currentBandcamp?.id) || [];
  const chartsPool = [...chartItems("house"), ...chartItems("techno")].filter((item) => item.id !== state.currentBandcamp?.id);
  const pool = [...wishPool, ...chartsPool];
  const source = Math.random() < 0.65 && chartsPool.length ? chartsPool : pool;
  if (!source.length) return;
  openBandcampItem(source[Math.floor(Math.random() * source.length)]);
}

function renderQueue() {
  const container = $("#queue-list");
  if (!state.queue.length) {
    container.innerHTML = `<div class="empty-state">Reproduce una mezcla para crear tu cola.</div>`;
    return;
  }
  container.innerHTML = state.queue.map((track, index) => `
    <div class="queue-item ${index === state.currentIndex ? "is-current" : ""}" data-queue-index="${index}">
      <span>${String(index + 1).padStart(2, "0")}</span>
      <div><strong>${track.track}</strong><span>${track.artist}</span></div>
      <span>${index === state.currentIndex ? "●" : ""}</span>
    </div>
  `).join("");
}

async function searchMusic(query) {
  const bandcampResults = bandcampMatches(query);
  if (bandcampResults.length) {
    showView("bandcamp");
    renderBandcamp("all", query);
    toast(`${bandcampResults.length} resultado${bandcampResults.length === 1 ? "" : "s"} en tu Bandcamp`);
    return;
  }
  showView("search");
  $("#search-heading").textContent = `“${query}”`;
  $("#search-results").innerHTML = `<div class="loading-row">Buscando en el catálogo de respaldo…</div>`;
  try {
    const results = await queryItunes(query, 30);
    const tracks = results.filter((item) => item.previewUrl).map((item) => ({
      artist: item.artistName,
      track: item.trackName,
      album: item.collectionName,
      previewUrl: item.previewUrl,
      artwork: artworkUrl(item),
      fullUrl: item.trackViewUrl || item.collectionViewUrl || "",
      sourceType: "search",
    }));
    renderTrackTable($("#search-results"), tracks, "search");
  } catch (error) {
    $("#search-results").innerHTML = `<div class="empty-state"><strong>No fue posible consultar el catálogo.</strong>Revisa tu conexión e inténtalo de nuevo.</div>`;
  }
}

function addLocalFiles(files) {
  const localTracks = [...files].filter((file) => file.type.startsWith("audio/")).map((file) => ({
    artist: "Archivo local",
    track: file.name.replace(/\.[^.]+$/, ""),
    album: "Tu dispositivo",
    localUrl: URL.createObjectURL(file),
    sourceType: "local",
  }));
  if (!localTracks.length) return;
  state.queue = [...localTracks, ...state.queue];
  state.currentIndex = 0;
  renderQueue();
  playTrack(localTracks[0], { queue: state.queue, index: 0 });
  toast(`${localTracks.length} archivo${localTracks.length > 1 ? "s" : ""} añadido${localTracks.length > 1 ? "s" : ""}`);
}

function bindEvents() {
  document.addEventListener("click", (event) => {
    const nav = event.target.closest("[data-view], [data-view-target]");
    if (nav) showView(nav.dataset.view || nav.dataset.viewTarget);

    const mix = event.target.closest("[data-mix]");
    if (mix) playMix(mix.dataset.mix);

    const chip = event.target.closest("[data-library-mix]");
    if (chip) renderLibrary(chip.dataset.libraryMix);

    const bandcampMode = event.target.closest("[data-bandcamp-mode]");
    if (bandcampMode) renderBandcamp(bandcampMode.dataset.bandcampMode);

    const bandcampPlay = event.target.closest("[data-bandcamp-id]");
    if (bandcampPlay) {
      const item = allBandcampItems().find((candidate) => candidate.id === bandcampPlay.dataset.bandcampId);
      openBandcampItem(item);
    }

    const bandcampHeart = event.target.closest("[data-bandcamp-heart]");
    if (bandcampHeart) {
      event.preventDefault();
      event.stopPropagation();
      const item = allBandcampItems().find((candidate) => candidate.id === bandcampHeart.dataset.bandcampHeart);
      openBandcampWishlist(item);
    }

    const bandcampTrack = event.target.closest("[data-bandcamp-track]");
    if (bandcampTrack && state.bandcampNative) {
      const index = Number(bandcampTrack.dataset.bandcampTrack);
      playTrack(state.queue[index], { queue: state.queue, index, bandcamp: true });
    }

    if (event.target.closest("[data-close-wishlist]")) closeBandcampWishlist();

    const play = event.target.closest("[data-list][data-index]");
    if (play) {
      const list = state.lists[play.dataset.list] || [];
      const index = Number(play.dataset.index);
      playTrack(list[index], { queue: list, index });
    }

    const queueItem = event.target.closest("[data-queue-index]");
    if (queueItem) {
      const index = Number(queueItem.dataset.queueIndex);
      state.currentIndex = index;
      playTrack(state.queue[index], { index });
    }

    const artistButton = event.target.closest("[data-play-artist]");
    if (artistButton) {
      const all = state.mixes.flatMap((item) => item.tracks);
      const tracks = all.filter((item) => item.artist === artistButton.dataset.playArtist);
      if (tracks.length) playTrack(tracks[0], { queue: tracks, index: 0 });
      else searchMusic(artistButton.dataset.playArtist);
    }

    if (event.target.closest(".favorite-button")) toggleFavorite();
  });

  $("#play-dna").addEventListener("click", () => playMix("dna"));
  $("#play-british").addEventListener("click", () => playMix("british"));
  $("#dig-now").addEventListener("click", digNext);
  $("#dig-next").addEventListener("click", () => state.currentBandcamp ? advanceBandcampRelease(1) : digNext());
  $("#confirm-bandcamp-wishlist").addEventListener("click", confirmBandcampWishlist);
  $("#hero-play").addEventListener("click", togglePlayback);
  $("#main-play").addEventListener("click", togglePlayback);
  $("#next-button").addEventListener("click", nextTrack);
  $("#prev-button").addEventListener("click", previousTrack);
  $("#shuffle-button").addEventListener("click", (event) => {
    state.shuffle = !state.shuffle;
    event.currentTarget.classList.toggle("is-active", state.shuffle);
    toast(state.shuffle ? "Orden aleatorio activado" : "Orden aleatorio desactivado");
  });
  $("#repeat-button").addEventListener("click", (event) => {
    state.repeat = !state.repeat;
    event.currentTarget.classList.toggle("is-active", state.repeat);
  });
  $("#volume").addEventListener("input", (event) => { audio.volume = Number(event.target.value); });
  $("#progress").addEventListener("input", (event) => {
    if (audio.duration) audio.currentTime = (Number(event.target.value) / 100) * audio.duration;
  });
  $("#queue-button").addEventListener("click", () => $("#queue-drawer").classList.add("is-open"));
  $("#close-queue").addEventListener("click", () => $("#queue-drawer").classList.remove("is-open"));
  $("#profile-button").addEventListener("click", () => $("#profile-popover").classList.toggle("is-open"));
  $("#local-files").addEventListener("change", (event) => addLocalFiles(event.target.files));
  $("#search-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const query = $("#search-input").value.trim();
    if (query) searchMusic(query);
  });

  document.addEventListener("keydown", (event) => {
    if (event.code === "Space" && !event.target.matches("input, textarea, button")) {
      event.preventDefault();
      togglePlayback();
    }
  });

  audio.addEventListener("play", () => {
    setPlayState(true);
    if (state.bandcampNative) renderBandcampNativeTracks();
  });
  audio.addEventListener("pause", () => {
    setPlayState(false);
    if (state.bandcampNative) renderBandcampNativeTracks();
  });
  audio.addEventListener("ended", nextTrack);
  audio.addEventListener("timeupdate", () => {
    $("#current-time").textContent = formatTime(audio.currentTime);
    $("#duration").textContent = formatTime(audio.duration);
    $("#progress").value = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
    if (state.bandcampNative && state.currentIndex === state.queue.length - 1 && audio.duration - audio.currentTime < 45) prefetchNextBandcampRelease();
  });
  audio.addEventListener("error", () => {
    toast("Esta fuente dejó de estar disponible");
    if (state.bandcampNative) setTimeout(nextTrack, 500);
  });
}

async function init() {
  try {
    const [profileResponse, bandcampResponse] = await Promise.all([
      fetch("data/profile.json"),
      fetch("data/bandcamp.json"),
    ]);
    state.data = await profileResponse.json();
    state.bandcamp = await bandcampResponse.json();
    state.mixes = state.data.mixes;
    renderMixes();
    renderArtists();
    renderLibrary();
    renderBritish();
    renderFavorites();
    renderQueue();
    renderBandcamp();
    $("#bandcamp-collection-count").textContent = formatNumber(state.bandcamp.profile.collectionCount);
    $("#bandcamp-wishlist-count").textContent = formatNumber(state.bandcamp.profile.wishlistCount);
    $("#bandcamp-genre").textContent = state.bandcamp.profile.favoriteGenre || "Electronic";
    bindEvents();
  } catch (error) {
    console.error(error);
    document.body.innerHTML = `<main style="padding:10vw;color:white"><h1>No pude cargar tu perfil musical.</h1><p>Comprueba que data/profile.json esté disponible.</p></main>`;
  }
}

init();
