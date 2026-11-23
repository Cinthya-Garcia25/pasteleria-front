const login = document.querySelector("#login");
const register = document.querySelector("#register");
const admin = document.querySelector("#admin");
const logout = document.querySelector("#logout");
const editor = document.querySelector("#editor");
const items = document.querySelector("#items");
const status = document.querySelector("#status");

let token = sessionStorage.getItem("sesion");
let moduleName = "productos";
let editing = null;
let revision = 0;
let altaPendiente;
const formulariosEnCurso = new WeakSet();
const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", currencyDisplay: "narrowSymbol" });

const modules = {
  productos: {
    title: "Productos",
    fields: [
      ["nombre", "Nombre", "text", true],
      ["descripcion", "Descripción", "text", false],
      ["precio", "Precio", "number", true],
      ["stock", "Stock", "number", true],
    ],
    singular: "producto",
    summary: (item) => ({
      title: item.nombre,
      meta: [money.format(item.precio), "Stock " + item.stock, item.descripcion].filter(Boolean).join(" · "),
    }),
  },
  users: {
    title: "Usuarios",
    fields: [
      ["nombre", "Nombre", "text", true],
      ["email", "Correo", "email", true],
      ["password", "Contraseña", "password", true],
    ],
    singular: "usuario",
    summary: (item) => ({ title: item.nombre, meta: item.email }),
  },
};

async function api(url, method = "GET", data, claveEnvio) {
  const tokenEnviado = token;
  let response;
  try {
    response = await fetch("/api/" + url, {
      method,
      headers: {
        ...(tokenEnviado && { Authorization: "Bearer " + tokenEnviado }),
        ...(data && { "Content-Type": "application/json" }),
        ...(claveEnvio && { "Idempotency-Key": claveEnvio }),
      },
      body: data && JSON.stringify(data),
    });
  } catch {
    throw new Error("No se pudo conectar. Vuelve a intentarlo.");
  }

  if (response.status === 401 && tokenEnviado && tokenEnviado === token && url !== "auth/login") {
    clearSession();
    login.elements.email.focus();
    throw new Error("Tu sesión ya no es válida. Vuelve a iniciar sesión.");
  }
  if (response.status >= 500) throw new Error("El servidor no pudo completar la operación. Vuelve a intentarlo.");
  if (response.status === 204) return;
  const body = await response.json();
  if (!response.ok) throw new Error(body.message || body.data?.message || "Operación fallida");
  return body.data ?? body;
}

async function enviarUnaVez(form, work) {
  if (formulariosEnCurso.has(form)) return;
  formulariosEnCurso.add(form);
  const submit = form.querySelector("button:not([type]), button[type=submit]");
  submit.disabled = true;
  try {
    await run(work);
  } finally {
    formulariosEnCurso.delete(form);
    submit.disabled = false;
  }
}

function notify(text, kind = "ok") {
  status.textContent = text;
  status.dataset.kind = kind;
}

function action(text, handler, variant = "secondary") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = variant;
  button.textContent = text;
  button.onclick = async () => {
    button.disabled = true;
    try {
      await run(handler);
    } finally {
      button.disabled = false;
    }
  };
  return button;
}

function renderEditor(item) {
  editing = item ?? null;
  const { singular, fields } = modules[moduleName];
  for (const row of items.children) row.classList.toggle("editing", row.dataset.id === String(item?.id));
  const heading = document.createElement("h3");
  heading.textContent = (item ? "Editar " : "Nuevo ") + singular;
  const grid = document.createElement("div");
  grid.className = "fields";
  grid.style.setProperty("--cols", fields.length);
  for (const [name, caption, type, required] of fields) {
    const label = document.createElement("label");
    label.textContent = caption;
    const input = document.createElement("input");
    input.type = type;
    if (type === "number") {
      input.min = "0";
      input.step = name === "precio" ? "0.01" : "1";
    }
    if (type === "password") {
      input.minLength = 12;
      input.maxLength = 128;
      input.autocomplete = "new-password";
      if (item) input.placeholder = "Déjala vacía para conservarla";
    }
    if (name === "nombre") input.maxLength = 100;
    if (name === "descripcion") input.maxLength = 500;
    input.name = name;
    input.required = required && !(item && type === "password");
    input.value = item?.[name] ?? "";
    label.append(input);
    grid.append(label);
    if (type === "password") addPasswordToggle(input);
  }
  const buttons = document.createElement("div");
  buttons.className = "form-actions";
  const submit = document.createElement("button");
  submit.textContent = item ? "Guardar cambios" : "Crear " + singular;
  buttons.append(submit);
  if (item) buttons.append(action("Cancelar", () => renderEditor()));
  editor.replaceChildren(heading, grid, buttons);
  if (item) {
    editor.scrollIntoView({ behavior: "smooth", block: "start" });
    grid.querySelector("input").focus({ preventScroll: true });
  }
}

async function showModule(name) {
  const current = ++revision;
  moduleName = name;
  document.querySelector("#title").textContent = modules[name].title;
  document.querySelectorAll("[data-module]").forEach((button) => {
    button.setAttribute("aria-pressed", button.dataset.module === name);
  });
  renderEditor();
  items.replaceChildren();
  let data;
  try {
    data = await api(name);
  } catch (error) {
    if (current === revision || !token) throw error;
    return;
  }
  if (current !== revision) return;
  if (!data.length) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "Todavía no hay " + modules[name].title.toLowerCase() + ".";
    items.append(empty);
  }
  for (const item of data) {
    const row = document.createElement("li");
    row.dataset.id = item.id;
    const { title, meta } = modules[name].summary(item);
    const text = document.createElement("div");
    text.className = "item-text";
    const strong = document.createElement("strong");
    strong.textContent = title;
    const small = document.createElement("span");
    small.textContent = meta;
    text.append(strong, " ", small);
    const actions = document.createElement("div");
    actions.className = "item-actions";
    actions.append(action("Editar", () => renderEditor(item)), action("Eliminar", async () => {
      if (!confirm("¿Eliminar " + item.nombre + "?")) return;
      await api(name + "/" + item.id, "DELETE");
      await showModule(name);
      notify("Registro eliminado");
    }, "danger"));
    row.append(text, actions);
    items.append(row);
  }
}

async function run(work) {
  notify("");
  try { await work(); } catch (error) { notify(error.message, "error"); }
}

const eyeIcons = {
  show: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  hide: '<path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-2.6 3.4M6.6 6.6A17.6 17.6 0 0 0 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M2 2l20 20"/>',
};

// Agrega un botón con ojo junto a un campo de contraseña que ya está dentro de su etiqueta.
function addPasswordToggle(input) {
  const wrapper = document.createElement("div");
  wrapper.className = "password-field";
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "toggle-password";
  const set = (visible) => {
    input.type = visible ? "text" : "password";
    toggle.setAttribute("aria-pressed", visible);
    // Texto oculto en vez de aria-label para no competir con la etiqueta del campo.
    toggle.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${eyeIcons[visible ? "hide" : "show"]}</svg>` +
      `<span class="visually-hidden">${visible ? "Ocultar" : "Mostrar"} contraseña</span>`;
  };
  toggle.onclick = () => { set(input.type === "password"); input.focus(); };
  input.form?.addEventListener("reset", () => set(false));
  // El botón va fuera de la etiqueta para que no forme parte del nombre del campo.
  const label = input.closest("label");
  label.replaceWith(wrapper);
  wrapper.append(label, toggle);
  set(false);
}
document.querySelectorAll("#login input[type=password], #register input[type=password]").forEach(addPasswordToggle);

function showAuthForm() {
  const signingUp = location.hash === "#registro";
  register.hidden = !signingUp;
  login.hidden = signingUp;
}

function clearSession() {
  token = null;
  ++revision;
  altaPendiente = undefined;
  if (location.hash) history.replaceState(null, "", location.pathname);
  sessionStorage.removeItem("sesion");
  admin.hidden = logout.hidden = true;
  showAuthForm();
}

async function openSession() {
  await api("auth/me");
  login.hidden = register.hidden = true;
  logout.hidden = admin.hidden = false;
  await showModule("productos");
}

login.onsubmit = (event) => {
  event.preventDefault();
  enviarUnaVez(login, async () => {
    const result = await api("auth/login", "POST", Object.fromEntries(new FormData(login)));
    token = result.token;
    sessionStorage.setItem("sesion", token);
    login.reset();
    await openSession();
  });
};

register.onsubmit = (event) => {
  event.preventDefault();
  enviarUnaVez(register, async () => {
    const { confirm, ...data } = Object.fromEntries(new FormData(register));
    if (data.password !== confirm) throw new Error("Las contraseñas no coinciden");
    await api("auth/register", "POST", data);
    register.reset();
    history.pushState(null, "", location.pathname);
    showAuthForm();
    login.elements.email.value = data.email.trim();
    notify("Cuenta creada. Ya puedes iniciar sesión.");
    login.elements.password.focus();
  });
};

window.onhashchange = () => {
  if (token) return;
  notify("");
  showAuthForm();
};

editor.onsubmit = (event) => {
  event.preventDefault();
  enviarUnaVez(editor, async () => {
    const name = moduleName;
    const id = editing?.id;
    const data = Object.fromEntries(new FormData(editor));
    if (name === "productos") {
      data.precio = Number(data.precio);
      data.stock = Number(data.stock);
    } else if (!data.password) {
      delete data.password;
    }
    let claveEnvio;
    if (name === "productos" && !id) {
      const datos = JSON.stringify(data);
      if (altaPendiente?.datos !== datos) altaPendiente = { datos, clave: crypto.randomUUID() };
      claveEnvio = altaPendiente.clave;
    }
    await api(id ? name + "/" + id : name, id ? "PUT" : "POST", data, claveEnvio);
    if (claveEnvio) altaPendiente = undefined;
    if (name === moduleName) await showModule(name);
    notify("Registro guardado");
  });
};

document.querySelectorAll("[data-module]").forEach((button) => {
  button.onclick = () => run(() => showModule(button.dataset.module));
});
logout.onclick = () => run(async () => {
  await api("auth/logout", "POST");
  clearSession();
});
if (!token) showAuthForm();
else run(openSession);
