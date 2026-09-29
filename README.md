# Catálogo TucVision3D

Sitio estático (HTML + CSS + JS, sin build) con panel de administración **Decap CMS** en `/admin`.
Los datos viven en dos JSON dentro del repo:

- `data/productos.json` → productos
- `data/config.json` → WhatsApp, Instagram, textos de portada y categorías

Cuando el cliente guarda algo en `/admin`, Decap hace un commit en GitHub y Netlify redeploya solo (~30 s).
Las fotos que sube quedan en `uploads/`.

## Probar en local

```bash
python3 -m http.server 8000        # sitio en http://localhost:8000
```

Panel en local (sin Netlify): descomentá `local_backend: true` en `admin/config.yml`, y en otra terminal
`npx decap-server`. Entrá a http://localhost:8000/admin/.

## Publicar en Netlify

1. Subí esta carpeta a un repo de GitHub (rama `main`).
2. Netlify → **Add new site → Import from Git** → elegí el repo. No hace falta build command (publish = `.`, ya está en `netlify.toml`).
3. En el sitio: **Project configuration → Identity → Enable Identity**.
   - Registration: **Invite only**.
   - **Services → Git Gateway → Enable**.
4. Identity → **Invite users** → mail del cliente. Le llega un link, crea su contraseña y entra a `https://tu-dominio/admin/`.
5. **Domain management** → agregar el dominio propio.

> Si Netlify Identity no está disponible en tu cuenta, cambiá el backend en `admin/config.yml` a
> `name: github` + `repo: usuario/repo` y configurá un OAuth App de GitHub en Netlify
> (Access & security → OAuth). El cliente entonces necesita una cuenta de GitHub con acceso al repo.

## Cómo carga productos el cliente

`/admin` → **Catálogo → Productos** → *Agregar Producto*: nombre, categoría, precio (vacío = "Consultar precio"),
fotos (la primera es la portada; ideal cuadradas), medidas, material, colores, tiempo de producción,
destacado y visible. **Publicar** arriba a la derecha.

Cada producto tiene link propio (`/#producto/nombre-del-producto`) y el botón de WhatsApp manda el nombre, precio y link.
