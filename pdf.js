// Genera el PDF del catálogo en el navegador, con los datos actuales de /data.
// Se carga recién cuando el usuario toca "Descargar PDF".
(() => {
  const JSPDF_URL = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
  const C = {
    dark: [7, 11, 22], dark2: [15, 24, 48], blue: [29, 140, 255], cyan: [57, 182, 255],
    text: [20, 26, 40], muted: [110, 120, 140], line: [225, 230, 240], white: [255, 255, 255],
  };
  const PAGE = { w: 210, h: 297, m: 12 };
  const GRID = { cols: 3, gap: 5, top: 26, bottom: 285 };

  function loadScript(src) {
    return new Promise((res, rej) => {
      if (window.jspdf) return res();
      const s = document.createElement("script");
      s.src = src; s.onload = res; s.onerror = () => rej(new Error("No se pudo cargar jsPDF"));
      document.head.appendChild(s);
    });
  }

  function loadImg(src) {
    return new Promise((res) => {
      const i = new Image();
      i.onload = () => res(i); i.onerror = () => res(null);
      i.src = src;
    });
  }

  // Recorta la foto a un cuadrado (como object-fit: cover) y la pasa a JPEG liviano
  function squareJPEG(img, size = 520) {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const x = c.getContext("2d");
    x.fillStyle = "#fff"; x.fillRect(0, 0, size, size);
    const s = Math.min(img.naturalWidth, img.naturalHeight);
    x.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, size, size);
    return c.toDataURL("image/jpeg", 0.82);
  }

  function placeholderJPEG(logo, size = 520) {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const x = c.getContext("2d");
    const g = x.createRadialGradient(size / 2, size * 0.4, 10, size / 2, size / 2, size * 0.75);
    g.addColorStop(0, "#16306b"); g.addColorStop(1, "#0f1830");
    x.fillStyle = g; x.fillRect(0, 0, size, size);
    if (logo) {
      const w = size * 0.5, h = w * (logo.naturalHeight / logo.naturalWidth);
      x.globalAlpha = 0.6;
      x.drawImage(logo, (size - w) / 2, (size - h) / 2, w, h);
    }
    return c.toDataURL("image/jpeg", 0.85);
  }

  function logoPNG(logo) {
    const c = document.createElement("canvas");
    c.width = logo.naturalWidth; c.height = logo.naturalHeight;
    c.getContext("2d").drawImage(logo, 0, 0);
    return c.toDataURL("image/png");
  }

  window.generarCatalogoPDF = async ({ cfg, items, catName, hasPrice, money, onProgress = () => {} }) => {
    await loadScript(JSPDF_URL);
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
    const site = location.origin;
    const nombre = cfg.nombre || "Catálogo";
    const tel = (cfg.telefonos || []).map((t) => t.numero).join(" / ");
    const waNum = String(cfg.whatsapp_principal || "").replace(/\D/g, "");

    const logo = await loadImg("/assets/logo.png");
    const logoData = logo ? logoPNG(logo) : null;
    const logoRatio = logo ? logo.naturalHeight / logo.naturalWidth : 0.46;
    const ph = placeholderJPEG(logo);

    // Agrupar por categoría, en el orden definido en Ajustes
    const order = (cfg.categorias || []).map((c) => c.id);
    const groups = [];
    const byCat = {};
    items.forEach((p) => {
      const k = order.includes(p.categoria) ? p.categoria : "_otros";
      (byCat[k] ||= []).push(p);
    });
    [...order, "_otros"].forEach((k) => {
      if (!byCat[k]) return;
      const list = byCat[k].sort((a, b) => (b.destacado === true) - (a.destacado === true) || a._i - b._i);
      groups.push({ titulo: k === "_otros" ? "Otros" : catName(k), list });
    });

    // Pre-cargar fotos
    const total = items.length;
    let done = 0;
    const photo = {};
    await Promise.all(items.map(async (p) => {
      const img = p.imagenes[0] ? await loadImg(p.imagenes[0]) : null;
      photo[p._slug] = img ? squareJPEG(img) : ph;
      onProgress(++done / total);
    }));

    const fill = (c) => doc.setFillColor(...c);
    const color = (c) => doc.setTextColor(...c);

    // ---------- Portada ----------
    fill(C.dark); doc.rect(0, 0, PAGE.w, PAGE.h, "F");
    fill(C.blue); doc.triangle(PAGE.w, 0, PAGE.w, 70, PAGE.w - 70, 0, "F");
    fill(C.dark2); doc.triangle(0, PAGE.h, 0, PAGE.h - 90, 90, PAGE.h, "F");
    if (logoData) {
      const w = 150;
      doc.addImage(logoData, "PNG", (PAGE.w - w) / 2, 70, w, w * logoRatio);
    }
    color(C.white); doc.setFont("helvetica", "bold"); doc.setFontSize(28);
    doc.text("Catálogo de productos", PAGE.w / 2, 172, { align: "center" });
    color(C.cyan); doc.setFont("helvetica", "normal"); doc.setFontSize(12);
    const fecha = new Date().toLocaleDateString("es-AR", { month: "long", year: "numeric" });
    doc.text(fecha.charAt(0).toUpperCase() + fecha.slice(1), PAGE.w / 2, 182, { align: "center" });

    let y = 225;
    doc.setFontSize(12); color(C.white);
    const line = (label, value, url) => {
      doc.setFont("helvetica", "bold"); doc.text(label, PAGE.w / 2 - 2, y, { align: "right" });
      doc.setFont("helvetica", "normal"); doc.text(value, PAGE.w / 2 + 2, y);
      if (url) doc.link(PAGE.w / 2 + 2, y - 4.5, doc.getTextWidth(value), 6, { url });
      y += 8;
    };
    if (tel) line("WhatsApp:", tel, waNum ? `https://wa.me/${waNum}` : null);
    if (cfg.instagram) line("Instagram:", "@" + cfg.instagram, `https://instagram.com/${cfg.instagram}`);
    line("Web:", site.replace(/^https?:\/\//, ""), site);
    if (cfg.ubicacion) line("Ubicación:", cfg.ubicacion);

    // ---------- Páginas de productos ----------
    const colW = (PAGE.w - PAGE.m * 2 - GRID.gap * (GRID.cols - 1)) / GRID.cols;
    const cardH = colW + 18;
    let page = 0;

    const newPage = () => {
      doc.addPage(); page++;
      fill(C.dark); doc.rect(0, 0, PAGE.w, 18, "F");
      fill(C.blue); doc.rect(0, 18, PAGE.w, 0.8, "F");
      if (logoData) doc.addImage(logoData, "PNG", PAGE.m, 3, 12 / logoRatio, 12);
      color(C.white); doc.setFont("helvetica", "normal"); doc.setFontSize(9);
      doc.text("Catálogo de impresiones 3D", PAGE.w - PAGE.m, 11, { align: "right" });
      // pie
      doc.setDrawColor(...C.line); doc.line(PAGE.m, 288, PAGE.w - PAGE.m, 288);
      color(C.muted); doc.setFontSize(8);
      const pie = [nombre, tel && `WhatsApp ${tel}`, cfg.instagram && `@${cfg.instagram}`].filter(Boolean).join("  ·  ");
      doc.text(pie, PAGE.m, 293);
      doc.text(String(page), PAGE.w - PAGE.m, 293, { align: "right" });
      return GRID.top;
    };

    const heading = (titulo, cont) => {
      color(C.text); doc.setFont("helvetica", "bold"); doc.setFontSize(cont ? 11 : 15);
      doc.text(cont ? `${titulo} (continuación)` : titulo, PAGE.m, y + 5);
      fill(C.blue); doc.rect(PAGE.m, y + 7.5, 18, 1, "F");
      y += 12;
    };

    y = newPage();
    for (const g of groups) {
      if (y + 12 + cardH > GRID.bottom) y = newPage();
      heading(g.titulo, false);

      g.list.forEach((p, i) => {
        const col = i % GRID.cols;
        if (col === 0 && i > 0) y += cardH + GRID.gap;
        if (col === 0 && y + cardH > GRID.bottom) { y = newPage(); heading(g.titulo, true); }
        const x = PAGE.m + col * (colW + GRID.gap);

        doc.setDrawColor(...C.line); doc.setLineWidth(0.3);
        doc.roundedRect(x, y, colW, cardH, 2.5, 2.5, "S");
        doc.addImage(photo[p._slug], "JPEG", x, y, colW, colW, p._slug, "FAST");

        if (p.destacado) {
          fill(C.blue); doc.roundedRect(x + 3, y + 3, 20, 5.5, 2.7, 2.7, "F");
          color(C.white); doc.setFont("helvetica", "bold"); doc.setFontSize(6.5);
          doc.text("DESTACADO", x + 13, y + 6.8, { align: "center" });
        }

        color(C.text); doc.setFont("helvetica", "bold"); doc.setFontSize(9.5);
        const title = doc.splitTextToSize(p.nombre, colW - 6).slice(0, 2);
        doc.text(title, x + 3, y + colW + 5);

        if (hasPrice(p)) {
          color(C.blue); doc.setFontSize(12);
          doc.text(money.format(p.precio), x + 3, y + cardH - 3);
        } else {
          color(C.muted); doc.setFont("helvetica", "normal"); doc.setFontSize(9);
          doc.text("Consultar precio", x + 3, y + cardH - 3);
        }
        doc.link(x, y, colW, cardH, { url: `${site}/#producto/${p._slug}` });
      });
      y += cardH + GRID.gap + 4;
    }

    if (cfg.nota_precios) {
      if (y + 10 > GRID.bottom) y = newPage();
      color(C.muted); doc.setFont("helvetica", "italic"); doc.setFontSize(8.5);
      doc.text(doc.splitTextToSize(cfg.nota_precios, PAGE.w - PAGE.m * 2), PAGE.w / 2, y + 2, { align: "center" });
    }

    doc.setProperties({ title: `${nombre} - Catálogo`, author: nombre });
    doc.save(`Catalogo-${nombre.replace(/\W+/g, "")}.pdf`);
  };
})();
