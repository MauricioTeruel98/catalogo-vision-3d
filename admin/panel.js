(() => {
  const PRODUCTS = "data/productos.json";
  const CONFIG = "data/config.json";
  const MAX_SIDE = 1200;

  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const slug = (s) => norm(s).replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 50) || "producto";
  const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
  const NUEVA_CAT = "__nueva__";

  const state = { productos: [], config: {}, q: "", cat: "todas", edit: null, fotos: [], dirty: false };

  // ---------- Avisos ----------
  let toastT;
  function toast(msg, err = false) {
    const t = $("#toast");
    t.textContent = msg; t.classList.toggle("err", err); t.classList.add("on");
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("on"), err ? 6000 : 3500);
  }
  function loading(on, txt = "Cargando…") { $("#cargando").classList.toggle("on", on); $("#cargando-txt").textContent = txt; }

  function show(view) {
    ["login", "lista", "form"].forEach((v) => ($(`#v-${v}`).hidden = v !== view));
    window.scrollTo(0, 0);
  }

  // ---------- Datos ----------
  async function cargar() {
    loading(true);
    try {
      const [p, c] = await Promise.all([Repo.readJSON(PRODUCTS), Repo.readJSON(CONFIG)]);
      state.productos = p.productos || [];
      state.config = c;
      renderLista();
      show("lista");
    } catch (e) {
      console.error(e);
      toast(e.message, true);
    } finally {
      loading(false);
    }
  }

  const catName = (id) => state.config.categorias?.find((c) => c.id === id)?.nombre || "Sin categoría";

  // ---------- Listado ----------
  function renderLista() {
    const cats = (state.config.categorias || []).filter((c) => state.productos.some((p) => p.categoria === c.id));
    $("#chips").innerHTML = [{ id: "todas", nombre: "Todas" }, ...cats]
      .map((c) => `<button type="button" class="chip" data-cat="${esc(c.id)}" aria-pressed="${state.cat === c.id}">${esc(c.nombre)}</button>`)
      .join("");

    const q = norm(state.q);
    const list = state.productos
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => (state.cat === "todas" || p.categoria === state.cat) && (!q || norm(p.nombre).includes(q)));

    $("#total").textContent = `(${state.productos.length})`;
    $("#lista").innerHTML = list.map(({ p, i }) => {
      const img = p.imagenes?.[0];
      const precio = typeof p.precio === "number" && p.precio > 0 ? `<b>${money.format(p.precio)}</b>` : "Consultar precio";
      return `<li><button type="button" class="item" data-i="${i}">
        ${img ? `<img class="item__img" src="${esc(img)}" alt="" loading="lazy" />` : `<span class="item__img"></span>`}
        <span class="item__body">
          <span class="item__name">${esc(p.nombre)}${p.visible === false ? `<span class="tag tag--oculto">Oculto</span>` : ""}${p.destacado ? `<span class="tag tag--dest">Destacado</span>` : ""}</span>
          <span class="item__meta">${precio} · ${esc(catName(p.categoria))}</span>
        </span>
        <svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>
      </button></li>`;
    }).join("");

    const vacio = $("#vacio");
    vacio.hidden = list.length > 0;
    vacio.textContent = state.productos.length ? "No hay productos que coincidan con la búsqueda." : "Todavía no hay productos. Tocá «Agregar producto» para cargar el primero.";
  }

  $("#q").addEventListener("input", (e) => { state.q = e.target.value; renderLista(); });
  $("#chips").addEventListener("click", (e) => {
    const b = e.target.closest(".chip");
    if (b) { state.cat = b.dataset.cat; renderLista(); }
  });
  $("#lista").addEventListener("click", (e) => {
    const b = e.target.closest(".item");
    if (b) abrirForm(state.productos[+b.dataset.i]);
  });
  $("#btn-nuevo").addEventListener("click", () => abrirForm(null));

  // ---------- Formulario ----------
  const F = {
    nombre: $("#f-nombre"), precio: $("#f-precio"), categoria: $("#f-categoria"), descripcion: $("#f-descripcion"),
    visible: $("#f-visible"), destacado: $("#f-destacado"), medidas: $("#f-medidas"), material: $("#f-material"),
    colores: $("#f-colores"), tiempo: $("#f-tiempo"),
  };

  function renderCategorias(selected) {
    const cats = state.config.categorias || [];
    F.categoria.innerHTML = `<option value="">Elegí una categoría…</option>` +
      cats.map((c) => `<option value="${esc(c.id)}">${esc(c.nombre)}</option>`).join("") +
      `<option value="${NUEVA_CAT}">+ Crear categoría nueva…</option>`;
    F.categoria.value = selected || "";
  }

  function abrirForm(p) {
    state.edit = p ? { nombreOriginal: p.nombre } : null;
    state.fotos = (p?.imagenes || []).map((src) => ({ src }));
    state.nuevaCat = null;
    $("#f-titulo").textContent = p ? "Editar producto" : "Nuevo producto";
    $("#btn-eliminar").hidden = !p;
    F.nombre.value = p?.nombre || "";
    F.precio.value = typeof p?.precio === "number" && p.precio > 0 ? p.precio.toLocaleString("es-AR") : "";
    renderCategorias(p?.categoria || (state.cat !== "todas" ? state.cat : ""));
    F.descripcion.value = p?.descripcion || "";
    F.visible.checked = p ? p.visible !== false : true;
    F.destacado.checked = !!p?.destacado;
    F.medidas.value = p?.medidas || "";
    F.material.value = p?.material || "";
    F.colores.value = (p?.colores || []).join(", ");
    F.tiempo.value = p?.tiempo_produccion || "";
    $(".mas").open = !!(p?.medidas || p?.material || p?.colores?.length || p?.tiempo_produccion);
    document.querySelectorAll(".form .error").forEach((el) => el.classList.remove("error"));
    renderFotos();
    state.dirty = false;
    history.pushState({ v: "form" }, "");
    show("form");
  }

  function renderFotos() {
    $("#fotos").innerHTML = state.fotos.map((f, i) => `<div class="foto">
      <img src="${esc(f.preview || f.src)}" alt="" />
      ${i === 0 ? `<span class="badge">Portada</span>` : `<button type="button" class="portada" data-i="${i}" aria-label="Usar como portada">★</button>`}
      <button type="button" class="quitar" data-i="${i}" aria-label="Quitar foto">×</button>
    </div>`).join("");
  }

  $("#fotos").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    const i = +b.dataset.i;
    if (b.classList.contains("quitar")) {
      const [f] = state.fotos.splice(i, 1);
      if (f.preview) URL.revokeObjectURL(f.preview);
    } else {
      state.fotos.unshift(...state.fotos.splice(i, 1));
    }
    state.dirty = true;
    renderFotos();
  });

  // Achica la foto en el celular antes de subirla (WebP, o JPEG si el navegador no sabe hacer WebP)
  async function comprimir(file) {
    let src;
    try {
      src = await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      src = await new Promise((res, rej) => {
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = () => rej(new Error(`No se pudo abrir «${file.name}». Probá con una foto JPG o PNG.`));
        img.src = URL.createObjectURL(file);
      });
    }
    const w0 = src.width || src.naturalWidth, h0 = src.height || src.naturalHeight;
    const k = Math.min(1, MAX_SIDE / Math.max(w0, h0));
    const c = document.createElement("canvas");
    c.width = Math.round(w0 * k); c.height = Math.round(h0 * k);
    c.getContext("2d").drawImage(src, 0, 0, c.width, c.height);
    let blob = await new Promise((r) => c.toBlob(r, "image/webp", 0.8));
    if (!blob || blob.type !== "image/webp") blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.82));
    return blob;
  }

  $("#f-fotos").addEventListener("change", async (e) => {
    const files = [...e.target.files];
    e.target.value = "";
    if (!files.length) return;
    loading(true, files.length > 1 ? `Preparando ${files.length} fotos…` : "Preparando foto…");
    for (const file of files) {
      try {
        const blob = await comprimir(file);
        state.fotos.push({ blob, preview: URL.createObjectURL(blob) });
        state.dirty = true;
      } catch (err) {
        toast(err.message, true);
      }
    }
    loading(false);
    renderFotos();
  });

  F.categoria.addEventListener("change", () => {
    if (F.categoria.value !== NUEVA_CAT) return;
    const nombre = (prompt("Nombre de la categoría nueva:") || "").trim();
    if (!nombre) { F.categoria.value = ""; return; }
    const existente = (state.config.categorias || []).find((c) => norm(c.nombre) === norm(nombre));
    if (existente) { F.categoria.value = existente.id; return; }
    let id = slug(nombre);
    while ((state.config.categorias || []).some((c) => c.id === id)) id += "-2";
    state.nuevaCat = { nombre, id };
    state.config.categorias = [...(state.config.categorias || []), state.nuevaCat];
    renderCategorias(id);
  });

  document.querySelector("#form").addEventListener("input", () => (state.dirty = true));

  function parsePrecio(v) {
    const s = String(v).replace(/[^\d,]/g, "").replace(",", ".");
    if (!s) return null;
    const n = Math.round(Number(s));
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }

  const blobToBase64 = (blob) => new Promise((res) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1]);
    r.readAsDataURL(blob);
  });

  function validar() {
    document.querySelectorAll(".form .error").forEach((el) => el.classList.remove("error"));
    const errores = [];
    if (!F.nombre.value.trim()) { F.nombre.classList.add("error"); errores.push("Falta el nombre."); }
    if (!F.categoria.value || F.categoria.value === NUEVA_CAT) { F.categoria.classList.add("error"); errores.push("Elegí una categoría."); }
    if (parsePrecio(F.precio.value) === undefined) { F.precio.closest(".precio").classList.add("error"); errores.push("El precio tiene que ser un número."); }
    if (errores.length) { toast(errores.join(" "), true); document.querySelector(".form .error")?.scrollIntoView({ block: "center" }); }
    return !errores.length;
  }

  // Aplica el cambio sobre la versión más nueva del catálogo y lo guarda en un solo commit
  async function guardarCambio(armarLista, mensaje, extraFiles = [], intentos = 2) {
    const fresh = await Repo.readJSON(PRODUCTS);
    const files = [...extraFiles];
    fresh.productos = armarLista(fresh.productos || []);
    if (state.nuevaCat) {
      const cfg = await Repo.readJSON(CONFIG);
      if (!cfg.categorias.some((c) => c.id === state.nuevaCat.id)) cfg.categorias.push(state.nuevaCat);
      files.push({ path: CONFIG, text: JSON.stringify(cfg, null, 2) });
    }
    files.push({ path: PRODUCTS, text: JSON.stringify(fresh, null, 2) });
    try {
      await Repo.commit(mensaje, files);
    } catch (e) {
      if (e instanceof Repo.Conflict && intentos > 1) return guardarCambio(armarLista, mensaje, extraFiles, intentos - 1);
      if (e instanceof Repo.Conflict) throw new Error("Alguien guardó otro cambio al mismo tiempo. Volvé a intentar.");
      throw e;
    }
    state.productos = fresh.productos;
  }

  async function guardar(e) {
    e.preventDefault();
    if (!validar()) return;
    const nombre = F.nombre.value.trim();
    const original = state.edit?.nombreOriginal;
    const dup = state.productos.find((p) => norm(p.nombre) === norm(nombre) && norm(p.nombre) !== norm(original));
    if (dup) { F.nombre.classList.add("error"); toast("Ya hay otro producto con ese nombre.", true); return; }

    const btn = $("#btn-guardar");
    btn.disabled = true;
    try {
      const nuevas = state.fotos.filter((f) => f.blob);
      loading(true, nuevas.length ? `Subiendo ${nuevas.length === 1 ? "la foto" : nuevas.length + " fotos"}…` : "Guardando…");
      const stamp = Date.now().toString(36);
      const extra = [];
      let n = 0;
      for (const f of nuevas) {
        const ext = f.blob.type === "image/webp" ? "webp" : "jpg";
        f.path = `uploads/${slug(nombre)}-${stamp}-${++n}.${ext}`;
        extra.push({ path: f.path, base64: await blobToBase64(f.blob) });
      }
      const imagenes = state.fotos.map((f) => f.src || "/" + f.path);

      const datos = {
        nombre,
        categoria: F.categoria.value,
        precio: parsePrecio(F.precio.value),
        descripcion: F.descripcion.value.trim(),
        imagenes,
        medidas: F.medidas.value.trim(),
        material: F.material.value,
        colores: F.colores.value.split(",").map((x) => x.trim()).filter(Boolean),
        tiempo_produccion: F.tiempo.value.trim(),
        destacado: F.destacado.checked,
        visible: F.visible.checked,
      };

      await guardarCambio((lista) => {
        const i = original ? lista.findIndex((p) => norm(p.nombre) === norm(original)) : -1;
        if (original && i < 0) throw new Error("Este producto fue borrado o renombrado desde otro lado. Volvé a la lista y actualizá.");
        const p = { ...(i >= 0 ? lista[i] : {}), ...datos };
        // Los campos vacíos no se guardan
        Object.keys(p).forEach((k) => {
          const v = p[k];
          if (v === "" || v == null || (Array.isArray(v) && !v.length && k !== "imagenes")) delete p[k];
        });
        const out = [...lista];
        if (i >= 0) out[i] = p; else out.unshift(p);
        return out;
      }, `${original ? "Editar" : "Agregar"} producto “${nombre}”`, extra);

      state.dirty = false;
      state.nuevaCat = null;
      toast(Repo.LOCAL ? "¡Guardado!" : "¡Guardado! En el catálogo se ve en 1 minuto aprox.");
      volverALista(true);
    } catch (err) {
      console.error(err);
      toast(err.message || "No se pudo guardar.", true);
    } finally {
      btn.disabled = false;
      loading(false);
    }
  }
  $("#form").addEventListener("submit", guardar);

  $("#btn-eliminar").addEventListener("click", async () => {
    const nombre = state.edit?.nombreOriginal;
    if (!nombre || !confirm(`¿Eliminar «${nombre}» del catálogo?\n\nEsto no se puede deshacer. Si solo querés esconderlo, apagá «Mostrar en el catálogo».`)) return;
    loading(true, "Eliminando…");
    state.nuevaCat = null;
    try {
      await guardarCambio((lista) => lista.filter((p) => norm(p.nombre) !== norm(nombre)), `Eliminar producto “${nombre}”`);
      state.dirty = false;
      toast("Producto eliminado.");
      volverALista(true);
    } catch (err) {
      toast(err.message || "No se pudo eliminar.", true);
    } finally {
      loading(false);
    }
  });

  // ---------- Navegación (el botón "atrás" del celular vuelve a la lista) ----------
  function salirDelForm() {
    if (state.dirty && !confirm("Tenés cambios sin guardar. ¿Salir igual?")) return false;
    state.fotos.forEach((f) => f.preview && URL.revokeObjectURL(f.preview));
    if (state.nuevaCat) {
      state.config.categorias = state.config.categorias.filter((c) => c.id !== state.nuevaCat.id);
      state.nuevaCat = null;
    }
    state.dirty = false;
    return true;
  }
  function volverALista(guardado = false) {
    if (!guardado && !salirDelForm()) return;
    if (guardado) state.fotos.forEach((f) => f.preview && URL.revokeObjectURL(f.preview));
    if (history.state?.v === "form") { history.back(); return; }
    renderLista(); show("lista");
  }
  $("#btn-volver").addEventListener("click", () => volverALista());
  window.addEventListener("popstate", () => {
    if ($("#v-form").hidden) return;
    if (state.dirty && !salirDelForm()) { history.pushState({ v: "form" }, ""); return; }
    renderLista(); show("lista");
  });
  window.addEventListener("beforeunload", (e) => { if (state.dirty) { e.preventDefault(); e.returnValue = ""; } });

  // ---------- Sesión ----------
  if (Repo.LOCAL) {
    $("#btn-logout").hidden = true;
    cargar();
  } else {
    const id = window.netlifyIdentity;
    const entrar = (user) => (user ? cargar() : show("login"));
    id.on("init", entrar);
    id.on("login", (user) => { id.close(); entrar(user); });
    id.on("logout", () => show("login"));
    // Por si el widget ya se inicializó antes de que este script escuchara
    setTimeout(() => { if (["login", "lista", "form"].every((v) => $(`#v-${v}`).hidden) && !$("#cargando").classList.contains("on")) entrar(id.currentUser()); }, 1500);
    $("#btn-login").addEventListener("click", () => id.open("login"));
    $("#btn-logout").addEventListener("click", () => id.logout());
  }
})();
