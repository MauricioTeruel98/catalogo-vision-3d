(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const slug = (s) => norm(s).replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

  const state = { cfg: {}, items: [], cat: "todos", q: "", sort: "destacados" };

  const waLink = (text, number = state.cfg.whatsapp_principal) =>
    `https://wa.me/${String(number || "").replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;

  const hasPrice = (p) => state.cfg.mostrar_precios !== false && typeof p.precio === "number" && p.precio > 0;
  const priceHTML = (p) => (hasPrice(p) ? `<span class="price">${money.format(p.precio)}</span>` : `<span class="price price--ask">Consultar precio</span>`);
  const catName = (id) => state.cfg.categorias?.find((c) => c.id === id)?.nombre || "";
  const placeholder = `<div class="ph"><img src="/assets/logo.png" alt="" loading="lazy" /></div>`;

  async function load() {
    const [cfg, data] = await Promise.all([
      fetch("/data/config.json", { cache: "no-cache" }).then((r) => r.json()),
      fetch("/data/productos.json", { cache: "no-cache" }).then((r) => r.json()),
    ]);
    state.cfg = cfg;
    state.items = (data.productos || [])
      .filter((p) => p && p.nombre && p.visible !== false)
      .map((p, i) => ({ ...p, _i: i, _slug: slug(p.nombre), imagenes: (p.imagenes || []).filter(Boolean) }));
    // Evita slugs repetidos
    const seen = {};
    state.items.forEach((p) => { seen[p._slug] = (seen[p._slug] || 0) + 1; if (seen[p._slug] > 1) p._slug += "-" + seen[p._slug]; });
  }

  function renderStatic() {
    const c = state.cfg;
    if (c.eslogan) $(".js-eslogan").textContent = c.eslogan;
    if (c.hero_titulo) $(".js-hero-titulo").textContent = c.hero_titulo;
    $(".js-hero-texto").textContent = c.hero_texto || "";
    $(".js-nota-precios").textContent = c.nota_precios || "";
    $$(".js-wa-general").forEach((a) => (a.href = waLink(`¡Hola ${c.nombre || ""}! Vi el catálogo y quería hacer una consulta.`)));
    $$(".js-wa-idea").forEach((a) => (a.href = waLink(`¡Hola ${c.nombre || ""}! Tengo una idea para imprimir en 3D y quería pedir presupuesto.`)));

    const li = [];
    (c.telefonos || []).forEach((t) => li.push(`<li><a href="${waLink(`¡Hola ${c.nombre || ""}!`, t.whatsapp)}" target="_blank" rel="noopener"><svg><use href="#i-wa"/></svg>${esc(t.numero)}</a></li>`));
    if (c.instagram) li.push(`<li><a href="https://instagram.com/${encodeURIComponent(c.instagram)}" target="_blank" rel="noopener"><svg><use href="#i-ig"/></svg>@${esc(c.instagram)}</a></li>`);
    if (c.ubicacion) li.push(`<li><span><svg><use href="#i-pin"/></svg>${esc(c.ubicacion)}</span></li>`);
    $("#contact-list").innerHTML = li.join("");
    $("#year").textContent = new Date().getFullYear();

    const used = new Set(state.items.map((p) => p.categoria));
    const cats = [{ id: "todos", nombre: "Todos" }, ...(c.categorias || []).filter((x) => used.has(x.id))];
    $("#chips").innerHTML = cats
      .map((x) => `<button class="chip" role="tab" data-cat="${esc(x.id)}" aria-selected="${x.id === state.cat}">${esc(x.nombre)}</button>`)
      .join("");
  }

  function filtered() {
    const q = norm(state.q).trim();
    let list = state.items.filter((p) => state.cat === "todos" || p.categoria === state.cat);
    if (q) {
      const words = q.split(/\s+/);
      list = list.filter((p) => {
        const hay = norm([p.nombre, p.descripcion, catName(p.categoria), p.material, ...(p.colores || [])].join(" "));
        return words.every((w) => hay.includes(w));
      });
    }
    const price = (p) => (hasPrice(p) ? p.precio : null);
    const by = {
      destacados: (a, b) => (b.destacado === true) - (a.destacado === true) || a._i - b._i,
      az: (a, b) => a.nombre.localeCompare(b.nombre, "es"),
      "precio-asc": (a, b) => (price(a) ?? Infinity) - (price(b) ?? Infinity),
      "precio-desc": (a, b) => (price(b) ?? -Infinity) - (price(a) ?? -Infinity),
    };
    return list.sort(by[state.sort] || by.destacados);
  }

  function renderGrid() {
    const list = filtered();
    $("#grid").innerHTML = list
      .map((p) => {
        const img = p.imagenes[0]
          ? `<img class="card__img" src="${esc(p.imagenes[0])}" alt="${esc(p.nombre)}" loading="lazy" />`
          : placeholder;
        const more = p.imagenes.length > 1 ? `<span class="card__more">${p.imagenes.length} fotos</span>` : "";
        return `<button class="card" type="button" data-slug="${esc(p._slug)}">
          ${p.destacado ? `<span class="badge">Destacado</span>` : ""}
          ${img}
          <div class="card__body">
            <span class="card__cat">${esc(catName(p.categoria))}</span>
            <h3 class="card__title">${esc(p.nombre)}</h3>
            <div class="card__foot">${priceHTML(p)}${more}</div>
          </div>
        </button>`;
      })
      .join("");
    $("#empty").hidden = list.length > 0;
    $("#count").textContent = list.length === 1 ? "1 producto" : `${list.length} productos`;
  }

  // ---------- Detalle ----------
  const modal = $("#modal");
  let current = null;

  function showImage(i) {
    const p = current;
    $("#m-main").innerHTML = p.imagenes[i] ? `<img src="${esc(p.imagenes[i])}" alt="${esc(p.nombre)}" />` : placeholder;
    $$("#m-thumbs button").forEach((b, j) => b.setAttribute("aria-current", String(i === j)));
  }

  function openProduct(p, push = true) {
    current = p;
    $("#m-cat").textContent = catName(p.categoria);
    $("#m-title").textContent = p.nombre;
    const price = $("#m-price");
    price.className = "detail__price" + (hasPrice(p) ? "" : " price--ask");
    price.textContent = hasPrice(p) ? money.format(p.precio) : "Consultar precio";
    $("#m-desc").textContent = p.descripcion || "";

    const specs = [];
    if (p.medidas) specs.push(["Medidas", esc(p.medidas)]);
    if (p.material) specs.push(["Material", esc(p.material)]);
    if (p.colores?.length) specs.push(["Colores", `<div class="swatches">${p.colores.map((c) => `<span>${esc(c)}</span>`).join("")}</div>`]);
    if (p.tiempo_produccion) specs.push(["Producción", esc(p.tiempo_produccion)]);
    $("#m-specs").innerHTML = specs.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");

    $("#m-thumbs").innerHTML =
      p.imagenes.length > 1 ? p.imagenes.map((src, i) => `<button type="button" data-i="${i}" aria-label="Foto ${i + 1}"><img src="${esc(src)}" alt="" loading="lazy" /></button>`).join("") : "";
    showImage(0);

    const url = `${location.origin}${location.pathname}#producto/${p._slug}`;
    const precio = hasPrice(p) ? ` (${money.format(p.precio)})` : "";
    $("#m-wa").href = waLink(`${state.cfg.mensaje_whatsapp || "Hola, me interesa:"} *${p.nombre}*${precio}\n${url}`);

    if (push) history.pushState(null, "", `#producto/${p._slug}`);
    if (!modal.open) modal.showModal();
    modal.scrollTop = 0;
  }

  function closeProduct() {
    if (modal.open) modal.close();
  }

  modal.addEventListener("close", () => {
    if (location.hash.startsWith("#producto/")) history.pushState(null, "", location.pathname + location.search);
  });
  modal.addEventListener("click", (e) => {
    if (e.target === modal || e.target.closest("[data-close]")) closeProduct();
    const t = e.target.closest("#m-thumbs button");
    if (t) showImage(+t.dataset.i);
  });
  $("#m-share").addEventListener("click", async () => {
    const url = `${location.origin}${location.pathname}#producto/${current._slug}`;
    try {
      if (navigator.share) await navigator.share({ title: current.nombre, url });
      else { await navigator.clipboard.writeText(url); $("#m-share").textContent = "¡Enlace copiado!"; setTimeout(() => ($("#m-share").textContent = "Compartir producto"), 1800); }
    } catch {}
  });

  function fromHash() {
    const m = location.hash.match(/^#producto\/(.+)$/);
    const p = m && state.items.find((x) => x._slug === decodeURIComponent(m[1]));
    if (p) openProduct(p, false);
    else closeProduct();
  }
  window.addEventListener("popstate", fromHash);

  // ---------- Eventos ----------
  $("#grid").addEventListener("click", (e) => {
    const card = e.target.closest(".card");
    if (card) openProduct(state.items.find((p) => p._slug === card.dataset.slug));
  });
  $("#chips").addEventListener("click", (e) => {
    const b = e.target.closest(".chip");
    if (!b) return;
    state.cat = b.dataset.cat;
    $$(".chip").forEach((c) => c.setAttribute("aria-selected", String(c === b)));
    renderGrid();
  });
  let t;
  $("#q").addEventListener("input", (e) => { clearTimeout(t); t = setTimeout(() => { state.q = e.target.value; renderGrid(); }, 120); });
  $(".js-pdf").addEventListener("click", async (e) => {
    const btn = e.currentTarget, label = btn.querySelector("span");
    if (btn.getAttribute("aria-busy") === "true") return;
    btn.setAttribute("aria-busy", "true");
    try {
      await window.generarCatalogoPDF({
        cfg: state.cfg,
        items: state.items,
        catName, hasPrice, money,
        onProgress: (f) => (label.textContent = `Generando… ${Math.round(f * 100)}%`),
      });
    } catch (err) {
      console.error(err);
      alert("No pudimos generar el PDF. Probá de nuevo en unos segundos.");
    } finally {
      btn.removeAttribute("aria-busy");
      label.textContent = "Descargar PDF";
    }
  });
  $("#sort").addEventListener("change", (e) => { state.sort = e.target.value; renderGrid(); });

  // Si alguien entra con un link de invitación / recuperación del panel, lo mandamos a /admin
  if (/(invite_token|recovery_token|confirmation_token)=/.test(location.hash)) {
    location.replace("/admin/" + location.hash);
    return;
  }

  load()
    .then(() => { renderStatic(); renderGrid(); fromHash(); })
    .catch((err) => {
      console.error(err);
      $("#grid").innerHTML = `<p class="empty">No pudimos cargar el catálogo. Probá recargar la página.</p>`;
    });
})();
