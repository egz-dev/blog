(function () {
  "use strict";

  const API_URL = "https://api.github.com/repos/egz-dev/posts/contents";
  const CACHE_KEY = "capa8-posts-v2";
  const CACHE_TIME = 5 * 60 * 1000;
  let searchReady = false;

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[character]));
  }

  function parseFrontMatter(source) {
    const match = source.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
    const data = {};

    if (!match) return { data, body: source };

    let currentList;
    match[1].split("\n").forEach((line) => {
      const listItem = line.match(/^\s+-\s+(.+)$/);
      if (listItem && currentList) {
        currentList.push(listItem[1].trim().replace(/^['"]|['"]$/g, ""));
        return;
      }

      const field = line.match(/^([\w-]+):\s*(.*)$/);
      if (!field) return;
      const value = field[2].trim();
      if (!value) {
        currentList = [];
        data[field[1]] = currentList;
      } else {
        currentList = null;
        data[field[1]] = value.replace(/^['"]|['"]$/g, "");
      }
    });

    return { data, body: source.slice(match[0].length) };
  }

  function getTitle(body, metadata, fallback) {
    return metadata.title || (body.match(/^#\s+(.+)$/m) || [null, fallback])[1]
      .replace(/[*_`]/g, "").trim();
  }

  function getExcerpt(body) {
    const text = body.replace(/^#\s+.+$/m, "").replace(/```[\s\S]*?```/g, "");
    const paragraph = text.split(/\n\s*\n/).find((part) => part.trim() && !part.trim().startsWith("#"));
    return paragraph ? paragraph.replace(/[\n*_`]/g, " ").trim().slice(0, 220) : "";
  }

  function getReadingTime(body) {
    const words = body.trim().split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.ceil(words / 220));
  }

  function formatDate(value) {
    if (!value) return "";
    const parts = value.split("-").map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) return value;
    return new Intl.DateTimeFormat("es-ES", {
      day: "numeric",
      month: "short",
      year: "numeric"
    }).format(new Date(parts[0], parts[1] - 1, parts[2]));
  }

  function badgeColor(value) {
    return [...value].reduce((hash, character) => hash + character.charCodeAt(0), 0) % 5;
  }

  function normalizePost(file, source) {
    const parsed = parseFrontMatter(source);
    const slug = file.name.replace(/\.md$/i, "");
    const categories = Array.isArray(parsed.data.categories) ? parsed.data.categories : [];
    return {
      slug,
      title: getTitle(parsed.body, parsed.data, slug),
      date: parsed.data.date || "",
      categories,
      excerpt: getExcerpt(parsed.body),
      readingTime: getReadingTime(parsed.body),
      body: parsed.body
    };
  }

  async function getPosts() {
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Date.now() - parsed.timestamp < CACHE_TIME) return parsed.posts;
    }

    const response = await fetch(API_URL, { headers: { Accept: "application/vnd.github+json" } });
    if (!response.ok) throw new Error("No se pudo consultar el repositorio de posts.");
    const files = (await response.json()).filter((file) => file.type === "file" && file.name.endsWith(".md"));
    const posts = await Promise.all(files.map(async (file) => {
      const source = await fetch(file.download_url).then((result) => result.text());
      return normalizePost(file, source);
    }));

    posts.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), posts }));
    return posts;
  }

  function postCard(post, compact) {
    const categories = post.categories.map((category) => `<span class="post-badge post-badge--${badgeColor(category)}">${escapeHtml(category)}</span>`).join("");
    const postPath = window.location.pathname.includes("/posts") ? "" : "posts/";
    return `<article class="dynamic-post-card${compact ? " latest-post-card" : ""}">
      <div class="post-badges">${categories}</div>
      <h2><a href="${postPath}?post=${encodeURIComponent(post.slug)}">${escapeHtml(post.title)}</a></h2>
      <p>${escapeHtml(post.excerpt)}</p>
      <div class="latest-post-footer"><div class="dynamic-post-meta"><time>${escapeHtml(formatDate(post.date))}</time><span class="reading-time-separator">·</span><span class="reading-time-badge" title="Tiempo estimado de lectura"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5v-17Zm0 0V21.5M7 6h9M7 10h9M7 14h6"/></svg>${post.readingTime || 1} min</span></div><a href="${postPath}?post=${encodeURIComponent(post.slug)}"><span>Leer</span><span aria-hidden="true">→</span></a></div>
    </article>`;
  }

  function postsUrl(slug) {
    const script = document.querySelector('script[src*="dynamic-posts.js"]');
    const scriptUrl = new URL(script?.src || "assets/dynamic-posts.js", window.location.href);
    const siteRoot = scriptUrl.pathname.replace(/assets\/dynamic-posts\.js$/, "");
    return `${siteRoot}posts/?post=${encodeURIComponent(slug)}`;
  }

  function setupSearch(posts) {
    if (searchReady) return;
    const inputs = document.querySelectorAll('[data-md-component="search-query"]');
    if (!inputs.length) return;
    searchReady = true;

    inputs.forEach((input) => {
      input.addEventListener("input", () => {
        const query = input.value.trim().toLowerCase();
        const results = input.closest(".md-search")?.querySelector(".md-search-result__list");
        if (!results) return;
        results.querySelectorAll(".dynamic-search-result").forEach((result) => result.remove());
        if (query.length < 2) return;

        window.setTimeout(() => {
          if (input.value.trim().toLowerCase() !== query) return;
          const remotePosts = posts.filter((post) => [post.title, post.excerpt, post.categories.join(" "), post.body]
            .join(" ").toLowerCase().includes(query));
          const meta = results.closest(".md-search-result")?.querySelector(".md-search-result__meta");
          if (meta) meta.style.display = remotePosts.length ? "none" : "";
          remotePosts.slice(0, 5).forEach((post) => {
              const result = document.createElement("li");
              result.className = "dynamic-search-result";
              result.innerHTML = `<a href="${postsUrl(post.slug)}" class="md-search-result__item"><div class="md-search-result__title">${escapeHtml(post.title)}</div></a>`;
              results.append(result);
            });
        }, 250);
      });
    });
  }

  async function render() {
    const list = document.querySelector("[data-posts-list]");
    const latest = document.querySelector("[data-latest-posts]");
    const detail = document.querySelector("[data-post-detail]");

    try {
      const posts = await getPosts();
      setupSearch(posts);
      if (!list && !latest && !detail) return;
      const slug = new URLSearchParams(window.location.search).get("post");
      if (slug && detail) {
        const post = posts.find((item) => item.slug === slug);
        if (!post) throw new Error("No se encontró ese artículo.");
        list?.setAttribute("hidden", "");
        detail.hidden = false;
        const body = post.body.replace(/^#\s+.+$/m, "").trim();
        detail.innerHTML = `<a class="post-back-link" href="./"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2Z"/></svg><span>Volver a los artículos</span></a><h1>${escapeHtml(post.title)}</h1><div class="post-author-row"><img src="https://github.com/egz-dev.png?size=96" alt="Edu García" width="48" height="48"><div><strong>Edu García</strong><div class="dynamic-post-meta"><time>${escapeHtml(formatDate(post.date))}</time><span class="reading-time-separator">·</span><span class="reading-time-badge" title="Tiempo estimado de lectura"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5v-17Zm0 0V21.5M7 6h9M7 10h9M7 14h6"/></svg>${post.readingTime || 1} min</span></div></div></div><div class="dynamic-post-content">${DOMPurify.sanitize(marked.parse(body))}</div>`;
        document.title = `${post.title} - Capa 8`;
        return;
      }
      if (list) list.innerHTML = posts.length ? posts.map(postCard).join("") : "<p>No hay artículos todavía.</p>";
      if (latest) latest.innerHTML = `<div class="latest-posts-grid">${posts.slice(0, 3).map((post) => postCard(post, true)).join("")}</div>`;
    } catch (error) {
      const message = `<p class="dynamic-post-error">No se pudieron cargar los artículos. Inténtalo de nuevo más tarde.</p>`;
      if (list) list.innerHTML = message;
      if (latest) latest.innerHTML = message;
      if (detail) { detail.hidden = false; detail.innerHTML = message; }
      console.error(error);
    }
  }

  function start() {
    render();
    if (window.document$ && typeof window.document$.subscribe === "function") {
      window.document$.subscribe(render);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
}());
