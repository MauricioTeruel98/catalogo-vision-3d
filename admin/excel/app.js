(() => {
  const BRANCH = "main";
  const PRODUCTS = "data/productos.json";
  const CONFIG = "data/config.json";
  const LOCAL = ["localhost", "127.0.0.1"].includes(location.hostname);

  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const slug = (s) => norm(s).replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

  // Columnas del Excel, en el mismo orden que el panel
  const COLS = [
    { key: "nombre", header: "Nombre", w: 36, alias: ["nombre", "producto"] },
    { key: "categoria", header: "Categoría", w: 26, alias: ["categoria"] },
    { key: "precio", header: "Precio", w: 11, alias: ["precio", "precio (ars)", "precio ars"] },
    { key: "descripcion", header: "Descripción", w: 60, alias: ["descripcion"] },
    { key: "medidas", header: "Medidas", w: 18, alias: ["medidas", "tamano"] },
    { key: "material", header: "Material", w: 14, alias: ["material"] },
    { key: "colores", header: "Colores", w: 28, alias: ["colores", "color"] },
    { key: "tiempo_produccion", header: "Tiempo de producción", w: 20, alias: ["tiempo de produccion", "tiempo produccion", "tiempo", "produccion"] },
    { key: "destacado", header: "Destacado", w: 11, alias: ["destacado"] },
    { key: "visible", header: "Visible", w: 9, alias: ["visible"] },
    { key: "imagenes", header: "Fotos", w: 60, alias: ["fotos", "imagenes", "imagen", "foto"] },
  ];
  const FIELD_ORDER = ["nombre", "categoria", "precio", "descripcion", "imagenes", "medidas", "material", "colores", "tiempo_produccion", "destacado", "visible"];

  // ---------- Acceso al repo ----------
  const b64decode = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, "")), (c) => c.charCodeAt(0)));
  const b64encode = (txt) => {
    const bytes = new TextEncoder().encode(txt);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  };

  const gateway = {
    async token() {
      const u = netlifyIdentity.currentUser();
      if (!u) throw new Error("Tu sesión expiró. Volvé a iniciar sesión.");
      return u.jwt();
    },
    async read(path) {
      const r = await fetch(`/.netlify/git/github/contents/${path}?ref=${BRANCH}`, { headers: { Authorization: `Bearer ${await this.token()}` } });
      if (!r.ok) throw new Error(`No se pudo leer ${path} (${r.status}). ¿Está activado Git Gateway?`);
      const j = await r.json();
      return { text: b64decode(j.content), sha: j.sha };
    },
    async write(path, text, sha, message) {
      const r = await fetch(`/.netlify/git/github/contents/${path}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${await this.token()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ message, content: b64encode(text), sha, branch: BRANCH }),
      });
      if (r.status === 409) throw new Error("El catálogo cambió mientras importabas (alguien guardó desde el panel). Recargá la página y volvé a importar.");
      if (!r.ok) throw new Error(`No se pudo guardar ${path} (${r.status}).`);
    },
  };

  // En la compu: usa el mismo servidor que el panel (npx decap-server)
  const local = {
    async call(action, params) {
      const r = await fetch("http://localhost:8081/api/v1", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, params }) });
      if (!r.ok) throw new Error(`decap-server respondió ${r.status}`);
      return r.json();
    },
    async read(path) {
      const e = await this.call("getEntry", { branch: BRANCH, path });
      return { text: e.data, sha: null };
    },
    async write(path, text, _sha, message) {
      await this.call("persistEntry", {
        branch: BRANCH,
        dataFiles: [{ slug: path.split("/").pop().replace(/\.json$/, ""), path, raw: text }],
        assets: [],
        options: { commitMessage: message, useWorkflow: false, status: "draft" },
      });
    },
  };

  const repo = LOCAL ? local : gateway;

  async function loadAll() {
    const [p, c] = await Promise.all([repo.read(PRODUCTS), repo.read(CONFIG)]);
    return { productsFile: p, configFile: c, productos: JSON.parse(p.text).productos || [], config: JSON.parse(c.text) };
  }

  // ---------- Exportar ----------
  async function exportar() {
    const btn = $("#btn-export");
    btn.disabled = true;
    try {
      const { productos, config } = await loadAll();
      const catById = Object.fromEntries((config.categorias || []).map((c) => [c.id, c.nombre]));
      const rows = productos.map((p) => COLS.map(({ key }) => {
        const v = p[key];
        if (key === "categoria") return catById[v] || v || "";
        if (key === "precio") return typeof v === "number" ? v : "";
        if (key === "destacado") return v === true ? "SI" : "NO";
        if (key === "visible") return v === false ? "NO" : "SI";
        if (key === "colores") return (v || []).join(", ");
        if (key === "imagenes") return (v || []).join("\n");
        return v ?? "";
      }));

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([COLS.map((c) => c.header), ...rows]);
      ws["!cols"] = COLS.map((c) => ({ wch: c.w }));
      ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: COLS.length - 1 } }) };
      XLSX.utils.book_append_sheet(wb, ws, "Productos");

      const wc = XLSX.utils.aoa_to_sheet([["Nombre", "ID"], ...(config.categorias || []).map((c) => [c.nombre, c.id])]);
      wc["!cols"] = [{ wch: 32 }, { wch: 22 }];
      XLSX.utils.book_append_sheet(wb, wc, "Categorías");

      const wi = XLSX.utils.aoa_to_sheet([
        ["Cómo usar este archivo"],
        [""],
        ["• Editá la hoja «Productos». Cada fila es un producto. No cambies los títulos de las columnas."],
        ["• Nombre: obligatorio. Se usa para reconocer el producto, si lo cambiás se toma como uno nuevo."],
        ["• Categoría: escribí el nombre tal cual está en la hoja «Categorías» (o una nueva)."],
        ["• Precio: solo el número, sin $ ni puntos (ej. 8500). Vacío = «Consultar precio»."],
        ["• Colores: separados por coma (ej. Azul, Blanco, Negro)."],
        ["• Destacado / Visible: SI o NO."],
        ["• Fotos: rutas de fotos ya subidas desde el panel (ej. /uploads/foto.webp), una por línea o separadas por coma."],
        ["  Las fotos nuevas hay que subirlas primero desde el panel; el Excel no sube imágenes."],
        ["• Podés borrar columnas que no quieras tocar: al importar con «Actualizar y agregar», esos datos quedan como están."],
      ]);
      wi["!cols"] = [{ wch: 110 }];
      XLSX.utils.book_append_sheet(wb, wi, "Instrucciones");

      const fecha = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `catalogo-${fecha}.xlsx`);
      $("#export-info").textContent = ` ${productos.length} productos exportados.`;
    } catch (e) {
      showError(e);
    } finally {
      btn.disabled = false;
    }
  }

  // ---------- Importar ----------
  const parseBool = (v, def) => {
    const s = norm(v);
    if (s === "") return def;
    if (["si", "s", "yes", "y", "true", "1", "x", "verdadero"].includes(s)) return true;
    if (["no", "n", "false", "0", "falso"].includes(s)) return false;
    return undefined;
  };
  const parsePrice = (v) => {
    if (v === "" || v == null) return null;
    if (typeof v === "number") return Math.round(v);
    let s = String(v).replace(/[^\d,.-]/g, "");
    if (!s) return undefined;
    if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
    else s = s.replace(",", ".");
    const n = Number(s);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : undefined;
  };
  const splitList = (v, re) => String(v ?? "").split(re).map((x) => x.trim()).filter(Boolean);

  function readSheet(wb) {
    const name = wb.SheetNames.find((n) => norm(n) === "productos") || wb.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: "", raw: true, blankrows: false });
    if (!rows.length) throw new Error("La hoja está vacía.");
    const colIndex = {};
    rows[0].forEach((h, i) => {
      const col = COLS.find((c) => c.alias.includes(norm(h)));
      if (col && !(col.key in colIndex)) colIndex[col.key] = i;
    });
    if (!("nombre" in colIndex)) throw new Error("No encontré la columna «Nombre». Usá el Excel exportado como plantilla.");
    return { colIndex, body: rows.slice(1), sheetName: name };
  }

  function buildImport({ colIndex, body }, current, config, { mode, crearCats }) {
    const errors = [], warnings = [];
    const cats = [...(config.categorias || [])];
    const newCats = [];
    const findCat = (v) => {
      const s = norm(v);
      return cats.find((c) => norm(c.id) === s || norm(c.nombre) === s);
    };
    const byName = new Map(current.map((p) => [norm(p.nombre), p]));
    const seen = new Set();
    const imported = [];

    body.forEach((row, i) => {
      const line = i + 2;
      const cell = (k) => (k in colIndex ? row[colIndex[k]] : undefined);
      const nombre = String(cell("nombre") ?? "").trim();
      if (!nombre) {
        if (row.some((v) => String(v).trim() !== "")) errors.push(`Fila ${line}: falta el nombre.`);
        return;
      }
      const key = norm(nombre);
      if (seen.has(key)) { errors.push(`Fila ${line}: «${nombre}» está repetido en el Excel.`); return; }
      seen.add(key);

      const prev = byName.get(key);
      const p = prev ? structuredClone(prev) : { destacado: false, visible: true };
      p.nombre = nombre;

      for (const { key: k } of COLS) {
        if (k === "nombre" || !(k in colIndex)) continue;
        const v = cell(k);
        const txt = String(v ?? "").trim();
        switch (k) {
          case "categoria": {
            if (!txt) { errors.push(`Fila ${line}: «${nombre}» no tiene categoría.`); break; }
            let c = findCat(txt);
            if (!c && crearCats) {
              c = { nombre: txt, id: slug(txt) || "categoria" };
              while (cats.some((x) => x.id === c.id)) c.id += "-2";
              cats.push(c); newCats.push(c);
            }
            if (!c) errors.push(`Fila ${line}: la categoría «${txt}» no existe.`);
            else p.categoria = c.id;
            break;
          }
          case "precio": {
            const n = parsePrice(v);
            if (n === undefined) errors.push(`Fila ${line}: el precio «${txt}» no es un número.`);
            else if (n === null || n === 0) delete p.precio;
            else p.precio = n;
            break;
          }
          case "destacado":
          case "visible": {
            const b = parseBool(v, k === "visible");
            if (b === undefined) errors.push(`Fila ${line}: «${k === "visible" ? "Visible" : "Destacado"}» tiene que ser SI o NO (dice «${txt}»).`);
            else p[k] = b;
            break;
          }
          case "colores": {
            const list = splitList(v, /[,;\n]+/);
            if (list.length) p.colores = list; else delete p.colores;
            break;
          }
          case "imagenes": {
            const list = splitList(v, /[\n,;|]+/).map((x) => (/^(https?:)?\//.test(x) ? x : `/uploads/${x}`));
            if (list.length) p.imagenes = list; else delete p.imagenes;
            break;
          }
          default:
            if (txt) p[k] = txt; else delete p[k];
        }
      }
      if (!p.categoria) errors.push(`Fila ${line}: «${nombre}» no tiene categoría.`);
      // Si no cambió nada, se deja el producto tal cual estaba
      imported.push(prev && !changedFields(prev, p).length ? prev : ordered(p));
    });

    // Resultado final
    let result;
    const importedByName = new Map(imported.map((p) => [norm(p.nombre), p]));
    if (mode === "replace") {
      result = imported;
    } else {
      result = current.map((p) => importedByName.get(norm(p.nombre)) || p);
      imported.forEach((p) => { if (!byName.has(norm(p.nombre))) result.push(p); });
    }

    // Resumen de cambios
    const changes = [];
    imported.forEach((p) => {
      const prev = byName.get(norm(p.nombre));
      if (!prev) changes.push({ tipo: "nuevo", nombre: p.nombre, detalle: "" });
      else {
        const fields = changedFields(prev, p);
        if (fields.length) changes.push({ tipo: "modificado", nombre: p.nombre, detalle: fields.map((f) => COLS.find((c) => c.key === f)?.header || f).join(", ") });
      }
    });
    if (mode === "replace") current.forEach((p) => { if (!importedByName.has(norm(p.nombre))) changes.push({ tipo: "eliminado", nombre: p.nombre, detalle: "" }); });

    return { result, changes, errors, warnings, newCats, cats, total: imported.length };
  }

  const same = (v) => (v == null || v === "" || (Array.isArray(v) && !v.length) ? null : v);
  const changedFields = (a, b) => FIELD_ORDER.filter((k) => JSON.stringify(same(a[k])) !== JSON.stringify(same(b[k])));

  function ordered(p) {
    const o = {};
    FIELD_ORDER.forEach((k) => { if (p[k] !== undefined) o[k] = p[k]; });
    Object.keys(p).forEach((k) => { if (!(k in o)) o[k] = p[k]; });
    return o;
  }

  async function checkImages(list) {
    const paths = [...new Set(list.flatMap((p) => p.imagenes || []).filter((x) => x.startsWith("/")))];
    const missing = [];
    await Promise.all(paths.map(async (src) => {
      try { const r = await fetch(src, { method: "HEAD", cache: "no-store" }); if (!r.ok) missing.push(src); } catch { missing.push(src); }
    }));
    return missing;
  }

  let pending = null;

  async function handleFile(file) {
    pending = null;
    const out = $("#result");
    out.innerHTML = `<p class="msg">Leyendo ${esc(file.name)}…</p>`;
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = readSheet(wb);
      const data = await loadAll();
      const opts = { mode: document.querySelector("input[name=modo]:checked").value, crearCats: $("#crear-cats").checked };
      const r = buildImport(sheet, data.productos, data.config, opts);
      const missing = await checkImages(r.result);
      if (missing.length) r.warnings.push(`Estas fotos no existen en el sitio (el producto se va a ver sin foto): ${missing.join(", ")}`);
      const ignored = Object.keys(sheet.colIndex).length < COLS.length
        ? COLS.filter((c) => !(c.key in sheet.colIndex)).map((c) => c.header) : [];
      if (ignored.length && opts.mode === "merge") r.warnings.push(`Columnas que no están en el Excel (se mantienen sin cambios): ${ignored.join(", ")}`);

      const count = (t) => r.changes.filter((c) => c.tipo === t).length;
      let html = `<div class="stats">
        <div class="stat"><b>${r.total}</b><span>filas leídas</span></div>
        <div class="stat"><b>${count("nuevo")}</b><span>nuevos</span></div>
        <div class="stat"><b>${count("modificado")}</b><span>modificados</span></div>
        ${opts.mode === "replace" ? `<div class="stat"><b>${count("eliminado")}</b><span>eliminados</span></div>` : ""}
        <div class="stat"><b>${r.result.length}</b><span>total en el catálogo</span></div>
      </div>`;
      if (r.errors.length) html += `<div class="msg msg--err"><b>Corregí estos errores en el Excel y volvé a subirlo:</b><ul>${r.errors.map((e) => `<li>${esc(e)}</li>`).join("")}</ul></div>`;
      if (r.newCats.length) html += `<div class="msg msg--warn">Se van a crear estas categorías: <b>${r.newCats.map((c) => esc(c.nombre)).join(", ")}</b></div>`;
      r.warnings.forEach((w) => (html += `<div class="msg msg--warn">${esc(w)}</div>`));
      if (r.changes.length) {
        html += `<div class="table"><table><thead><tr><th>Cambio</th><th>Producto</th><th>Campos</th></tr></thead><tbody>
          ${r.changes.map((c) => `<tr><td><span class="tag tag--${c.tipo}">${c.tipo}</span></td><td>${esc(c.nombre)}</td><td class="muted">${esc(c.detalle)}</td></tr>`).join("")}
        </tbody></table></div>`;
      } else if (!r.errors.length) {
        html += `<div class="msg msg--ok">No hay cambios: el Excel es igual al catálogo actual.</div>`;
      }
      if (!r.errors.length && (r.changes.length || r.newCats.length)) {
        if (opts.mode === "replace" && count("eliminado")) html += `<div class="msg msg--err">Atención: se van a <b>eliminar ${count("eliminado")} productos</b> que no están en el Excel.</div>`;
        html += `<div class="row" style="margin-top:16px"><button class="btn btn--primary" id="btn-apply">Guardar cambios en el catálogo</button><button class="btn btn--ghost" id="btn-cancel">Cancelar</button></div>`;
        pending = { r, data, opts };
      }
      out.innerHTML = html;
    } catch (e) {
      showError(e);
    }
  }

  async function apply() {
    if (!pending) return;
    const { r, data } = pending;
    const btn = $("#btn-apply");
    btn.disabled = true; btn.textContent = "Guardando…";
    try {
      const count = (t) => r.changes.filter((c) => c.tipo === t).length;
      const parts = [count("nuevo") && `${count("nuevo")} nuevos`, count("modificado") && `${count("modificado")} modificados`, count("eliminado") && `${count("eliminado")} eliminados`].filter(Boolean);
      if (r.newCats.length) {
        const cfg = { ...data.config, categorias: r.cats };
        await repo.write(CONFIG, JSON.stringify(cfg, null, 2), data.configFile.sha, `Importar Excel: nuevas categorías (${r.newCats.map((c) => c.nombre).join(", ")})`);
      }
      const json = JSON.parse(data.productsFile.text);
      json.productos = r.result;
      await repo.write(PRODUCTS, JSON.stringify(json, null, 2), data.productsFile.sha, `Importar Excel: ${parts.join(", ") || "sin cambios en productos"}`);
      pending = null;
      $("#result").innerHTML = `<div class="msg msg--ok"><b>¡Listo!</b> Se guardaron los cambios. ${LOCAL ? "Recargá el sitio para verlos." : "El sitio se actualiza en alrededor de un minuto."}</div>`;
      $("#file").value = "";
    } catch (e) {
      btn.disabled = false; btn.textContent = "Guardar cambios en el catálogo";
      showError(e, true);
    }
  }

  function showError(e, append = false) {
    console.error(e);
    const html = `<div class="msg msg--err">${esc(e.message || e)}</div>`;
    if (append) $("#result").insertAdjacentHTML("beforeend", html); else $("#result").innerHTML = html;
  }

  // ---------- UI ----------
  $("#btn-export").addEventListener("click", exportar);
  $("#file").addEventListener("change", (e) => e.target.files[0] && handleFile(e.target.files[0]));
  document.querySelectorAll("input[name=modo], #crear-cats").forEach((el) => el.addEventListener("change", () => $("#file").files[0] && handleFile($("#file").files[0])));
  $("#result").addEventListener("click", (e) => {
    if (e.target.id === "btn-apply") apply();
    if (e.target.id === "btn-cancel") { pending = null; $("#result").innerHTML = ""; $("#file").value = ""; }
  });
  const drop = $("#drop");
  ["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", (e) => {
    const f = e.dataTransfer.files[0];
    if (!f) return;
    const dt = new DataTransfer(); dt.items.add(f); $("#file").files = dt.files;
    handleFile(f);
  });

  const showApp = (on) => { $("#app").hidden = !on; $("#login").hidden = on; $("#logout").hidden = !on || LOCAL; };

  if (LOCAL) {
    local.call("info", {}).then(() => showApp(true)).catch(() => {
      showApp(true);
      $("#result").innerHTML = `<div class="msg msg--err">Para usar esto en tu compu corré <code>npx decap-server</code> en la carpeta del proyecto y recargá.</div>`;
    });
  } else {
    showApp(!!netlifyIdentity.currentUser());
    netlifyIdentity.on("init", (user) => showApp(!!user));
    netlifyIdentity.on("login", () => { netlifyIdentity.close(); showApp(true); });
    netlifyIdentity.on("logout", () => showApp(false));
    $("#btn-login").addEventListener("click", () => netlifyIdentity.open("login"));
    $("#logout").addEventListener("click", (e) => { e.preventDefault(); netlifyIdentity.logout(); });
  }
})();
