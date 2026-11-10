// Lectura y escritura de archivos del repo desde el navegador.
// En el sitio publicado usa Git Gateway (Netlify Identity); en localhost, decap-server (./dev.sh).
window.Repo = (() => {
  const BRANCH = "main";
  const LOCAL = ["localhost", "127.0.0.1"].includes(location.hostname);
  const API = "/.netlify/git/github";

  class Conflict extends Error {}

  const b64decode = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, "")), (c) => c.charCodeAt(0)));

  async function token() {
    const u = window.netlifyIdentity?.currentUser();
    if (!u) throw new Error("Tu sesión expiró. Volvé a ingresar.");
    return u.jwt();
  }

  async function gh(path, opts = {}) {
    const r = await fetch(API + path, {
      ...opts,
      headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json", ...(opts.headers || {}) },
    });
    // Al mover la rama: 422/409 = alguien guardó otra cosa en el medio
    if (opts.method === "PATCH" && (r.status === 409 || r.status === 422)) throw new Conflict("conflict");
    if (!r.ok) throw new Error(`Error al conectar con el repositorio (${r.status}).`);
    return r.status === 204 ? null : r.json();
  }

  async function local(action, params) {
    let r;
    try {
      r = await fetch("http://localhost:8081/api/v1", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, params: { branch: BRANCH, ...params } }) });
    } catch {
      throw new Error("No encuentro decap-server. Iniciá el proyecto con ./dev.sh");
    }
    if (!r.ok) throw new Error(`decap-server respondió ${r.status}`);
    return r.json();
  }

  async function readJSON(path) {
    if (LOCAL) return JSON.parse((await local("getEntry", { path })).data);
    const j = await gh(`/contents/${path}?ref=${BRANCH}&t=${Date.now()}`);
    return JSON.parse(b64decode(j.content));
  }

  // files: [{ path, text }] o [{ path, base64 }]. Todo en un solo commit.
  async function commit(message, files) {
    if (LOCAL) {
      for (const f of files.filter((f) => f.base64)) {
        await local("persistMedia", { asset: { path: f.path, content: f.base64, encoding: "base64" }, options: { commitMessage: message } });
      }
      const data = files.filter((f) => f.text != null);
      if (data.length) {
        await local("persistEntry", {
          dataFiles: data.map((f) => ({ slug: f.path.split("/").pop().replace(/\.\w+$/, ""), path: f.path, raw: f.text })),
          assets: [],
          options: { commitMessage: message, useWorkflow: false, status: "draft" },
        });
      }
      return;
    }
    const ref = await gh(`/git/refs/heads/${BRANCH}`);
    const parent = ref.object.sha;
    const base = await gh(`/git/commits/${parent}`);
    const tree = [];
    for (const f of files) {
      if (f.base64) {
        const blob = await gh("/git/blobs", { method: "POST", body: JSON.stringify({ content: f.base64, encoding: "base64" }) });
        tree.push({ path: f.path, mode: "100644", type: "blob", sha: blob.sha });
      } else {
        tree.push({ path: f.path, mode: "100644", type: "blob", content: f.text });
      }
    }
    const t = await gh("/git/trees", { method: "POST", body: JSON.stringify({ base_tree: base.tree.sha, tree }) });
    const c = await gh("/git/commits", { method: "POST", body: JSON.stringify({ message, tree: t.sha, parents: [parent] }) });
    await gh(`/git/refs/heads/${BRANCH}`, { method: "PATCH", body: JSON.stringify({ sha: c.sha, force: false }) });
  }

  return { LOCAL, Conflict, readJSON, commit };
})();
