# Catálogo TucVision3D

Sitio estático (HTML + CSS + JS, sin build) con un panel propio para el celular en `/admin`
y **Decap CMS** como panel avanzado en `/admin/avanzado/`.
Los datos viven en dos JSON dentro del repo:

- `data/productos.json` → productos
- `data/config.json` → WhatsApp, Instagram, textos de portada y categorías

Cuando el cliente guarda algo en `/admin`, Decap hace un commit en GitHub y Netlify redeploya solo (~30 s).
Las fotos que sube quedan en `uploads/`.

## Probar en local

```bash
./dev.sh
```

Levanta el sitio en http://localhost:8000 y el panel en http://localhost:8000/admin/ (sin login;
guarda directo en los archivos de esta carpeta). Ctrl+C apaga todo.

`local_backend: true` en `admin/avanzado/config.yml` puede quedar siempre activo: Decap solo lo usa cuando
la página se abre desde localhost y `decap-server` responde; en Netlify se ignora.
Después de cargar cosas en local, hacé commit y push para publicarlas.

## Publicar en Netlify

1. Subí esta carpeta a un repo de GitHub (rama `main`).
2. Netlify → **Add new site → Import from Git** → elegí el repo. No hace falta build command (publish = `.`, ya está en `netlify.toml`).
3. En el sitio: **Project configuration → Identity → Enable Identity**.
   - Registration: **Invite only**.
   - **Services → Git Gateway → Enable**.
4. Identity → **Invite users** → mail del cliente. Le llega un link, crea su contraseña y entra a `https://tu-dominio/admin/`.
5. **Domain management** → agregar el dominio propio.

> Si Netlify Identity no está disponible en tu cuenta, cambiá el backend en `admin/avanzado/config.yml` (y el panel simple, `admin/repo.js`) a
> `name: github` + `repo: usuario/repo` y configurá un OAuth App de GitHub en Netlify
> (Access & security → OAuth). El cliente entonces necesita una cuenta de GitHub con acceso al repo.

## Cómo se cargan productos

`/admin/` es el panel simple, pensado para el celular:

- Lista de productos con foto, buscador y filtro por categoría. Tocar uno lo abre para editar.
- **Agregar producto**: fotos (desde la cámara o la galería), nombre, precio, categoría y descripción.
  Medidas, material, colores y tiempo de producción quedan en «Más detalles (opcional)».
- Las fotos se achican en el celular antes de subirlas (WebP, máx. 1200 px).
- Cada guardado es un solo commit (fotos + JSON juntos) y Netlify publica en ~1 minuto.
- Se puede crear una categoría nueva desde el mismo formulario.

`/admin/avanzado/` (Decap CMS) sigue disponible para editar categorías, textos de portada,
WhatsApp y demás datos del sitio. Ojo: las fotos que se suben desde ahí no se comprimen.

Cada producto tiene link propio (`/#producto/nombre-del-producto`) y el botón de WhatsApp manda el nombre, precio y link.

## Catálogo en PDF

El botón **Descargar PDF** (al lado del buscador) arma el PDF en el navegador con los datos actuales
(`pdf.js`, usa jsPDF desde cdnjs). Siempre sale actualizado; no hay que regenerar nada.

## Importar / Exportar Excel

`/admin/excel/` (desde el menú ⋯ del panel, o el botón verde **Excel** del panel avanzado). Usa el mismo login.

- **Exportar**: baja un `.xlsx` con hojas Productos, Categorías e Instrucciones.
- **Importar**: muestra un resumen de cambios antes de guardar.
  - *Actualizar y agregar*: identifica productos por nombre; los que no están en el Excel no se tocan.
    Se pueden borrar columnas para actualizar solo algunas (ej. solo Nombre + Precio).
  - *Reemplazar todo*: el catálogo queda igual al Excel (borra los que falten).
  - Las fotos no se suben por Excel: se referencian rutas ya subidas (`/uploads/foto.webp`).
- En local funciona con `./dev.sh` (igual que el panel).
