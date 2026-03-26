/**
 * CineScope – script.js
 * Vanilla JavaScript movie search app powered by the OMDb API.
 *
 * Features:
 *  - Debounced search with live suggestions
 *  - Paginated results grid
 *  - Movie detail modal (plot, ratings, cast, …)
 *  - Add / remove favourites (localStorage)
 *  - Dark / light theme toggle (localStorage)
 *  - Accessible keyboard navigation in suggestions
 */

/* ============================================================
   CONFIG
   ============================================================ */

/** OMDb API key – replace with your own from https://www.omdbapi.com/apikey.aspx */
const API_KEY = '4a3b711b';
const API_BASE = 'https://www.omdbapi.com/';

/** How many milliseconds to wait after the last keystroke before searching */
const DEBOUNCE_MS = 400;

/** Results per page (OMDb always returns 10 per page) */
const RESULTS_PER_PAGE = 10;

/* ============================================================
   STATE
   ============================================================ */
const state = {
  query: '',
  currentPage: 1,
  totalResults: 0,
  /** @type {string[]} */
  favourites: [],
  showFavs: false,
  suggestionsVisible: false,
};

/* ============================================================
   DOM REFERENCES
   ============================================================ */
const searchInput     = document.getElementById('searchInput');
const clearBtn        = document.getElementById('clearBtn');
const suggestionsEl   = document.getElementById('suggestions');
const spinner         = document.getElementById('spinner');
const statusMsg       = document.getElementById('statusMsg');
const resultsSection  = document.getElementById('resultsSection');
const resultsTitle    = document.getElementById('resultsTitle');
const moviesGrid      = document.getElementById('moviesGrid');
const pagination      = document.getElementById('pagination');
const paginationBot   = document.getElementById('paginationBottom');
const favsSection     = document.getElementById('favsSection');
const favsGrid        = document.getElementById('favsGrid');
const favsEmpty       = document.getElementById('favsEmpty');
const favBtn          = document.getElementById('favBtn');
const favCount        = document.getElementById('favCount');
const welcomeState    = document.getElementById('welcomeState');
const modal           = document.getElementById('modal');
const modalContent    = document.getElementById('modalContent');
const modalClose      = document.getElementById('modalClose');
const themeToggle     = document.getElementById('themeToggle');

/* ============================================================
   UTILITIES
   ============================================================ */

/**
 * Returns a debounced version of `fn` that delays execution by `delay` ms.
 * @param {Function} fn
 * @param {number} delay
 */
function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/** Show/hide the loading spinner */
function setLoading(visible) {
  spinner.classList.toggle('hidden', !visible);
}

/**
 * Display a status / error message below the search bar.
 * @param {string} msg - Message text
 * @param {'info'|'error'} [type='info']
 */
function showStatus(msg, type = 'info') {
  statusMsg.textContent = msg;
  statusMsg.className = 'status-msg' + (type === 'error' ? ' error' : '');
  statusMsg.classList.remove('hidden');
}

/** Hide the status bar */
function hideStatus() {
  statusMsg.classList.add('hidden');
}

/** Escape HTML to safely render user data */
function escapeHtml(str) {
  if (!str || str === 'N/A') return '';
  return str.replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

/* ============================================================
   FAVOURITES (localStorage)
   ============================================================ */

/** Load favourites array from localStorage */
function loadFavourites() {
  try {
    state.favourites = JSON.parse(localStorage.getItem('cinescope_favs') || '[]');
  } catch {
    state.favourites = [];
  }
}

/** Persist favourites to localStorage */
function saveFavourites() {
  localStorage.setItem('cinescope_favs', JSON.stringify(state.favourites));
}

/** @param {string} imdbID */
function isFavourite(imdbID) {
  return state.favourites.includes(imdbID);
}

/**
 * Toggle a movie's favourite status.
 * @param {string} imdbID
 */
function toggleFavourite(imdbID) {
  if (isFavourite(imdbID)) {
    state.favourites = state.favourites.filter((id) => id !== imdbID);
  } else {
    state.favourites.push(imdbID);
  }
  saveFavourites();
  updateFavCount();
  // Refresh UI elements that reflect favourite state
  syncFavButtons(imdbID);
}

/** Update the badge count in the header */
function updateFavCount() {
  const count = state.favourites.length;
  favCount.textContent = count;
  favCount.classList.toggle('hidden', count === 0);
}

/**
 * Sync all ❤️ buttons on the page for a given imdbID.
 * @param {string} imdbID
 */
function syncFavButtons(imdbID) {
  const fav = isFavourite(imdbID);
  document.querySelectorAll(`[data-fav-id="${imdbID}"]`).forEach((btn) => {
    btn.classList.toggle('active', fav);
    btn.textContent = fav ? '❤️' : '🤍';
    btn.setAttribute('aria-label', fav ? 'Remove from favourites' : 'Add to favourites');
  });
}

/* ============================================================
   THEME TOGGLE
   ============================================================ */
function loadTheme() {
  const saved = localStorage.getItem('cinescope_theme') || 'dark';
  document.body.className = saved;
  themeToggle.textContent = saved === 'dark' ? '🌙' : '☀️';
}

themeToggle.addEventListener('click', () => {
  const isDark = document.body.classList.contains('dark');
  document.body.className = isDark ? 'light' : 'dark';
  themeToggle.textContent = isDark ? '☀️' : '🌙';
  localStorage.setItem('cinescope_theme', isDark ? 'light' : 'dark');
});

/* ============================================================
   API LAYER
   ============================================================ */

/**
 * Search movies by title, returning a page of results.
 * @param {string} query
 * @param {number} [page=1]
 * @returns {Promise<{movies: Array, total: number}>}
 */
async function searchMovies(query, page = 1) {
  const url = new URL(API_BASE);
  url.searchParams.set('apikey', API_KEY);
  url.searchParams.set('s', query);
  url.searchParams.set('type', 'movie');
  url.searchParams.set('page', page);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`HTTP error ${res.status}`);

  const data = await res.json();
  if (data.Response === 'False') {
    throw new Error(data.Error || 'No results found.');
  }

  return { movies: data.Search, total: parseInt(data.totalResults, 10) || 0 };
}

/**
 * Fetch full details for a single movie by IMDb ID.
 * @param {string} imdbID
 * @returns {Promise<Object>}
 */
async function fetchMovieDetails(imdbID) {
  const url = new URL(API_BASE);
  url.searchParams.set('apikey', API_KEY);
  url.searchParams.set('i', imdbID);
  url.searchParams.set('plot', 'full');

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`HTTP error ${res.status}`);

  const data = await res.json();
  if (data.Response === 'False') throw new Error(data.Error || 'Details unavailable.');

  return data;
}

/* ============================================================
   CARD RENDERING
   ============================================================ */

/**
 * Build a movie card element.
 * @param {{ imdbID: string, Title: string, Year: string, Poster: string, Type: string }} movie
 * @returns {HTMLElement}
 */
function createCard(movie) {
  const fav = isFavourite(movie.imdbID);

  const article = document.createElement('article');
  article.className = 'card';
  article.setAttribute('role', 'listitem');
  article.setAttribute('tabindex', '0');
  article.setAttribute('aria-label', `${movie.Title} (${movie.Year})`);

  const hasPoster = movie.Poster && movie.Poster !== 'N/A';

  article.innerHTML = `
    <div class="card__poster-wrap">
      ${hasPoster
        ? `<img class="card__poster" src="${escapeHtml(movie.Poster)}" alt="${escapeHtml(movie.Title)} poster" loading="lazy" />`
        : `<div class="card__no-poster"><span>🎬</span><span>No image</span></div>`
      }
      <button
        class="card__fav ${fav ? 'active' : ''}"
        data-fav-id="${escapeHtml(movie.imdbID)}"
        aria-label="${fav ? 'Remove from favourites' : 'Add to favourites'}"
      >${fav ? '❤️' : '🤍'}</button>
    </div>
    <div class="card__info">
      <div class="card__title">${escapeHtml(movie.Title)}</div>
      <div class="card__year">${escapeHtml(movie.Year)}</div>
      <span class="card__type">${escapeHtml(movie.Type || 'movie')}</span>
    </div>
  `;

  // Click on card → open detail modal
  article.addEventListener('click', (e) => {
    if (e.target.closest('.card__fav')) return; // Handled separately
    openModal(movie.imdbID);
  });

  // Keyboard: Enter/Space on card
  article.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openModal(movie.imdbID);
    }
  });

  // Favourite button inside card
  article.querySelector('.card__fav').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleFavourite(movie.imdbID);
    // If we're viewing favs, re-render the favs panel
    if (state.showFavs) renderFavourites();
  });

  return article;
}

/* ============================================================
   RESULTS / PAGINATION
   ============================================================ */

/**
 * Render a list of movie objects into a grid container.
 * @param {Array} movies
 * @param {HTMLElement} container
 */
function renderMovies(movies, container) {
  container.innerHTML = '';
  movies.forEach((m) => container.appendChild(createCard(m)));
}

/**
 * Build pagination controls.
 * @param {HTMLElement} container
 */
function renderPagination(container) {
  container.innerHTML = '';

  const totalPages = Math.ceil(state.totalResults / RESULTS_PER_PAGE);
  if (totalPages <= 1) return;

  // Prev button
  const prev = document.createElement('button');
  prev.className = 'page-btn';
  prev.textContent = '← Prev';
  prev.disabled = state.currentPage === 1;
  prev.addEventListener('click', () => changePage(state.currentPage - 1));
  container.appendChild(prev);

  // Page info
  const info = document.createElement('span');
  info.className = 'page-info';
  info.textContent = `Page ${state.currentPage} of ${totalPages}`;
  container.appendChild(info);

  // Next button
  const next = document.createElement('button');
  next.className = 'page-btn';
  next.textContent = 'Next →';
  next.disabled = state.currentPage === totalPages;
  next.addEventListener('click', () => changePage(state.currentPage + 1));
  container.appendChild(next);
}

/**
 * Navigate to a different page of results.
 * @param {number} page
 */
function changePage(page) {
  state.currentPage = page;
  performSearch(state.query, page);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ============================================================
   SEARCH FLOW
   ============================================================ */

/**
 * Execute a movie search and update the UI.
 * @param {string} query
 * @param {number} [page=1]
 */
async function performSearch(query, page = 1) {
  if (!query.trim()) {
    showWelcome();
    return;
  }

  // Hide other sections, show spinner
  hideSections();
  setLoading(true);
  hideStatus();

  try {
    const { movies, total } = await searchMovies(query, page);
    state.totalResults = total;
    state.currentPage = page;

    // Update heading
    resultsTitle.textContent = `Results for "${query}" (${total.toLocaleString()})`;

    // Render cards
    renderMovies(movies, moviesGrid);

    // Render pagination in both locations
    renderPagination(pagination);
    renderPagination(paginationBot);

    resultsSection.classList.remove('hidden');
  } catch (err) {
    showStatus(err.message || 'Something went wrong. Please try again.', 'error');
  } finally {
    setLoading(false);
  }
}

/* ============================================================
   SUGGESTIONS (lightweight – uses search endpoint)
   ============================================================ */

/** Current abort controller for suggestion fetch */
let suggestAbort = null;

/**
 * Fetch and display search suggestions.
 * @param {string} query
 */
async function fetchSuggestions(query) {
  if (!query || query.length < 2) {
    hideSuggestions();
    return;
  }

  // Abort previous in-flight request
  if (suggestAbort) suggestAbort.abort();
  suggestAbort = new AbortController();

  try {
    const url = new URL(API_BASE);
    url.searchParams.set('apikey', API_KEY);
    url.searchParams.set('s', query);
    url.searchParams.set('type', 'movie');

    const res = await fetch(url.toString(), { signal: suggestAbort.signal });
    const data = await res.json();

    if (data.Response === 'True' && Array.isArray(data.Search)) {
      renderSuggestions(data.Search.slice(0, 6));
    } else {
      hideSuggestions();
    }
  } catch (err) {
    if (err.name !== 'AbortError') hideSuggestions();
  }
}

/**
 * Render suggestion list items.
 * @param {Array} movies
 */
function renderSuggestions(movies) {
  suggestionsEl.innerHTML = '';
  movies.forEach((m, idx) => {
    const li = document.createElement('li');
    li.setAttribute('role', 'option');
    li.setAttribute('id', `sug-${idx}`);
    li.innerHTML = `<span>${escapeHtml(m.Title)}</span><span class="sug-year">${escapeHtml(m.Year)}</span>`;
    li.addEventListener('click', () => {
      searchInput.value = m.Title;
      hideSuggestions();
      state.currentPage = 1;
      state.query = m.Title;
      clearBtn.classList.remove('hidden');
      performSearch(m.Title);
    });
    suggestionsEl.appendChild(li);
  });
  suggestionsEl.classList.remove('hidden');
  state.suggestionsVisible = true;
}

function hideSuggestions() {
  suggestionsEl.classList.add('hidden');
  state.suggestionsVisible = false;
}

/* ============================================================
   MODAL (movie details)
   ============================================================ */

/** @param {string} imdbID */
async function openModal(imdbID) {
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  modalContent.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted)">Loading details…</div>';

  try {
    const movie = await fetchMovieDetails(imdbID);
    renderModalContent(movie);
  } catch (err) {
    modalContent.innerHTML = `<div style="padding:40px;text-align:center;color:var(--accent)">${escapeHtml(err.message)}</div>`;
  }

  // Focus trap: put focus inside modal
  modalClose.focus();
}

function closeModal() {
  modal.classList.add('hidden');
  document.body.style.overflow = '';
}

/** @param {Object} movie - Full OMDb movie detail object */
function renderModalContent(movie) {
  const fav = isFavourite(movie.imdbID);
  const hasPoster = movie.Poster && movie.Poster !== 'N/A';

  // Build ratings HTML
  const ratingsHTML = (movie.Ratings || []).map((r) => `
    <div class="rating-badge">
      <span class="rating-badge__source">${escapeHtml(r.Source)}</span>
      <span class="rating-badge__value">${escapeHtml(r.Value)}</span>
    </div>
  `).join('');

  // Info grid items
  const infoItems = [
    { label: 'Released',   value: movie.Released },
    { label: 'Runtime',    value: movie.Runtime },
    { label: 'Genre',      value: movie.Genre },
    { label: 'Director',   value: movie.Director },
    { label: 'Writer',     value: movie.Writer },
    { label: 'Actors',     value: movie.Actors },
    { label: 'Language',   value: movie.Language },
    { label: 'Country',    value: movie.Country },
    { label: 'Awards',     value: movie.Awards },
    { label: 'Box Office', value: movie.BoxOffice },
  ].filter((i) => i.value && i.value !== 'N/A');

  const infoHTML = infoItems.map((i) => `
    <div class="info-item">
      <div class="info-item__label">${escapeHtml(i.label)}</div>
      <div class="info-item__value">${escapeHtml(i.value)}</div>
    </div>
  `).join('');

  modalContent.innerHTML = `
    <div class="modal__hero">
      <div class="modal__poster-wrap">
        ${hasPoster
          ? `<img class="modal__poster" src="${escapeHtml(movie.Poster)}" alt="${escapeHtml(movie.Title)} poster" />`
          : `<div style="width:180px;height:270px;background:var(--surface-2);border-radius:var(--radius-sm);display:flex;align-items:center;justify-content:center;font-size:3rem">🎬</div>`
        }
      </div>
      <div class="modal__meta">
        <h2 class="modal__title" id="modalTitle">${escapeHtml(movie.Title)}</h2>
        ${movie.Tagline && movie.Tagline !== 'N/A' ? `<p class="modal__tagline">${escapeHtml(movie.Tagline)}</p>` : ''}
        <div class="modal__pills">
          ${movie.Year && movie.Year !== 'N/A' ? `<span class="pill">${escapeHtml(movie.Year)}</span>` : ''}
          ${movie.Rated && movie.Rated !== 'N/A' ? `<span class="pill pill--accent">${escapeHtml(movie.Rated)}</span>` : ''}
          ${movie.Runtime && movie.Runtime !== 'N/A' ? `<span class="pill">${escapeHtml(movie.Runtime)}</span>` : ''}
          ${movie.Genre ? movie.Genre.split(',').map((g) => `<span class="pill">${escapeHtml(g.trim())}</span>`).join('') : ''}
        </div>
        ${ratingsHTML ? `<div class="modal__ratings">${ratingsHTML}</div>` : ''}
        <button
          class="btn btn--ghost modal__fav-btn"
          data-fav-id="${escapeHtml(movie.imdbID)}"
          aria-label="${fav ? 'Remove from favourites' : 'Add to favourites'}"
        >${fav ? '❤️ Remove from favourites' : '🤍 Add to favourites'}</button>
      </div>
    </div>
    ${movie.Plot && movie.Plot !== 'N/A' ? `
      <div class="modal__section">
        <div class="modal__section-title">Plot</div>
        <p>${escapeHtml(movie.Plot)}</p>
      </div>
    ` : ''}
    ${infoHTML ? `
      <div class="modal__section">
        <div class="modal__section-title">Details</div>
        <div class="modal__info-grid">${infoHTML}</div>
      </div>
    ` : ''}
  `;

  // Wire up the favourite button inside modal
  const modalFavBtn = modalContent.querySelector('[data-fav-id]');
  if (modalFavBtn) {
    modalFavBtn.addEventListener('click', () => {
      toggleFavourite(movie.imdbID);
      const nowFav = isFavourite(movie.imdbID);
      modalFavBtn.textContent = nowFav ? '❤️ Remove from favourites' : '🤍 Add to favourites';
      modalFavBtn.setAttribute('aria-label', nowFav ? 'Remove from favourites' : 'Add to favourites');
    });
  }
}

/* ============================================================
   FAVOURITES PANEL
   ============================================================ */

async function renderFavourites() {
  favsGrid.innerHTML = '';

  if (state.favourites.length === 0) {
    favsEmpty.classList.remove('hidden');
    return;
  }

  favsEmpty.classList.add('hidden');

  // Fetch details for each favourited movie and show cards
  // We show a minimal card using the stored IDs; use a search-by-id call.
  const cards = await Promise.allSettled(
    state.favourites.map((id) => fetchMovieDetails(id))
  );

  cards.forEach((result) => {
    if (result.status === 'fulfilled') {
      favsGrid.appendChild(createCard(result.value));
    }
  });
}

/* ============================================================
   SECTION VISIBILITY HELPERS
   ============================================================ */

function showWelcome() {
  resultsSection.classList.add('hidden');
  favsSection.classList.add('hidden');
  statusMsg.classList.add('hidden');
  spinner.classList.add('hidden');
  welcomeState.classList.remove('hidden');
  state.showFavs = false;
}

function hideSections() {
  resultsSection.classList.add('hidden');
  favsSection.classList.add('hidden');
  welcomeState.classList.add('hidden');
}

/* ============================================================
   EVENT LISTENERS
   ============================================================ */

// Debounced search handler
const debouncedSearch = debounce((query) => {
  state.query = query;
  state.currentPage = 1;
  performSearch(query);
}, DEBOUNCE_MS);

// Debounced suggestions handler (faster)
const debouncedSuggest = debounce(fetchSuggestions, 250);

searchInput.addEventListener('input', (e) => {
  const query = e.target.value.trim();
  clearBtn.classList.toggle('hidden', !query);

  if (!query) {
    hideSuggestions();
    showWelcome();
    return;
  }

  debouncedSuggest(query);
  debouncedSearch(query);
});

// Submit on Enter key (immediately, no debounce delay)
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const query = searchInput.value.trim();
    if (!query) return;
    hideSuggestions();
    state.query = query;
    state.currentPage = 1;
    performSearch(query);
  }

  // Keyboard navigation in suggestions
  if (state.suggestionsVisible) {
    const items = [...suggestionsEl.querySelectorAll('li')];
    const active = suggestionsEl.querySelector('[aria-selected="true"]');
    let idx = active ? items.indexOf(active) : -1;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (active) active.removeAttribute('aria-selected');
      idx = (idx + 1) % items.length;
      items[idx].setAttribute('aria-selected', 'true');
      items[idx].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (active) active.removeAttribute('aria-selected');
      idx = (idx - 1 + items.length) % items.length;
      items[idx].setAttribute('aria-selected', 'true');
      items[idx].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Escape') {
      hideSuggestions();
    } else if (e.key === 'Enter' && active) {
      active.click();
    }
  }
});

// Clear button
clearBtn.addEventListener('click', () => {
  searchInput.value = '';
  clearBtn.classList.add('hidden');
  hideSuggestions();
  showWelcome();
  searchInput.focus();
});

// Close suggestions when clicking outside
document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-wrap')) hideSuggestions();
});

// Favourites panel toggle
favBtn.addEventListener('click', () => {
  state.showFavs = !state.showFavs;

  if (state.showFavs) {
    hideSections();
    spinner.classList.add('hidden');
    statusMsg.classList.add('hidden');
    favsSection.classList.remove('hidden');
    renderFavourites();
  } else {
    favsSection.classList.add('hidden');
    if (state.query) {
      performSearch(state.query, state.currentPage);
    } else {
      showWelcome();
    }
  }
});

// Modal close button
modalClose.addEventListener('click', closeModal);

// Close modal on backdrop click
modal.querySelector('.modal__backdrop').addEventListener('click', closeModal);

// Close modal on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
    closeModal();
  }
});

/* ============================================================
   INIT
   ============================================================ */
function init() {
  loadFavourites();
  updateFavCount();
  loadTheme();
  showWelcome();

  // If there's a stored query (e.g., from a page refresh), restore it
  const lastQuery = sessionStorage.getItem('cinescope_lastQuery');
  if (lastQuery) {
    searchInput.value = lastQuery;
    clearBtn.classList.remove('hidden');
    state.query = lastQuery;
    performSearch(lastQuery);
  }
}

// Save current query to sessionStorage so it survives page refresh
window.addEventListener('beforeunload', () => {
  if (state.query) {
    sessionStorage.setItem('cinescope_lastQuery', state.query);
  } else {
    sessionStorage.removeItem('cinescope_lastQuery');
  }
});

init();
