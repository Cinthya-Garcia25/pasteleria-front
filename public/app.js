// =====================================================================
// La Casa del Postre · Lógica del front
// Maneja el login, el registro, el cierre de sesión y los CRUD de
// Productos y Usuarios. Habla con el backend a través de /api/...
// =====================================================================

// ---------------------------------------------------------------------
// Referencias a los elementos de la página (definidos en index.html)
// ---------------------------------------------------------------------
const login = document.querySelector("#login");       // Formulario «Iniciar sesión»
const register = document.querySelector("#register"); // Formulario «Crear cuenta»
const admin = document.querySelector("#admin");       // Panel con los módulos (visible solo con sesión)
const logout = document.querySelector("#logout");     // Botón «Cerrar sesión»
const editor = document.querySelector("#editor");     // Formulario para crear / editar un registro
const items = document.querySelector("#items");       // Lista de registros (productos o usuarios)
const status = document.querySelector("#status");     // Zona de mensajes de éxito o error

// ---------------------------------------------------------------------
// Estado de la aplicación
// ---------------------------------------------------------------------
let token = sessionStorage.getItem("sesion"); // Token de sesión; se pierde al cerrar la pestaña
let moduleName = "productos";                 // Módulo abierto: "productos" o "users"
let editing = null;                           // Registro que se está editando (null = creando uno nuevo)
let revision = 0;                             // Contador para ignorar respuestas viejas si cambias de módulo rápido
let altaPendiente;                            // Alta de producto en curso, para no duplicarla si se reintenta
const formulariosEnCurso = new WeakSet();     // Formularios que ya se están enviando (evita doble clic)

// Formato de dinero en pesos mexicanos, por ejemplo: $350.00
const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", currencyDisplay: "narrowSymbol" });

// ---------------------------------------------------------------------
// Configuración de los módulos del panel
// Cada campo es: [nombre en la API, etiqueta visible, tipo de input, ¿obligatorio?]
// ---------------------------------------------------------------------
const modules = {
  // Módulo Productos
  productos: {
    title: "Productos",
    fields: [
      ["nombre", "Nombre", "text", true],
      ["descripcion", "Descripción", "text", false],
      ["precio", "Precio", "number", true],
      ["stock", "Stock", "number", true],
    ],
    singular: "producto",
    // Texto de cada fila de la lista: nombre en negrita y debajo precio · stock · descripción
    summary: (item) => ({
      title: item.nombre,
      meta: [money.format(item.precio), "Stock " + item.stock, item.descripcion].filter(Boolean).join(" · "),
    }),
  },
  // Módulo Usuarios
  users: {
    title: "Usuarios",
    fields: [
      ["nombre", "Nombre", "text", true],
      ["email", "Correo", "email", true],
      ["password", "Contraseña", "password", true],
    ],
    singular: "usuario",
    // Texto de cada fila: nombre en negrita y debajo el correo
    summary: (item) => ({ title: item.nombre, meta: item.email }),
  },
};

// ---------------------------------------------------------------------
// api(): hace una petición al backend
//   url        → ruta después de /api/ (ej. "productos", "auth/login")
//   method     → GET, POST, PUT o DELETE
//   data       → objeto que se envía como JSON (opcional)
//   claveEnvio → clave única para que el servidor no cree dos veces el mismo producto
// Devuelve los datos de la respuesta o lanza un Error con un mensaje claro.
// ---------------------------------------------------------------------
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
    // Sin internet o el servidor está apagado
    throw new Error("No se pudo conectar. Vuelve a intentarlo.");
  }

  // 401 = la sesión venció o fue cerrada: regresa al login
  if (response.status === 401 && tokenEnviado && tokenEnviado === token && url !== "auth/login") {
    clearSession();
    login.elements.email.focus();
    throw new Error("Tu sesión ya no es válida. Vuelve a iniciar sesión.");
  }
  // 5xx = error interno del servidor
  if (response.status >= 500) throw new Error("El servidor no pudo completar la operación. Vuelve a intentarlo.");
  // 204 = éxito sin contenido (por ejemplo al eliminar)
  if (response.status === 204) return;
  const body = await response.json();
  // 400, 404, 409... → muestra el mensaje que manda el servidor
  if (!response.ok) throw new Error(body.message || body.data?.message || "Operación fallida");
  return body.data ?? body;
}

// ---------------------------------------------------------------------
// enviarUnaVez(): evita que un formulario se envíe dos veces por doble clic.
// Desactiva el botón de envío mientras la petición está en curso.
// ---------------------------------------------------------------------
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

// ---------------------------------------------------------------------
// notify(): muestra un mensaje arriba de la página
//   kind = "ok" (verde) o "error" (rojo)
// ---------------------------------------------------------------------
function notify(text, kind = "ok") {
  status.textContent = text;
  status.dataset.kind = kind;
}

// ---------------------------------------------------------------------
// action(): crea un botón de acción (Editar, Eliminar, Cancelar)
//   variant = "secondary" (blanco con borde) o "danger" (rojo, para eliminar)
// El botón se desactiva mientras su acción se ejecuta.
// ---------------------------------------------------------------------
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

// ---------------------------------------------------------------------
// renderEditor(): dibuja el formulario del módulo abierto
//   Sin item  → formulario «Nuevo producto / Nuevo usuario» vacío
//   Con item  → formulario «Editar ...» con los datos cargados
// ---------------------------------------------------------------------
function renderEditor(item) {
  editing = item ?? null;
  const { singular, fields } = modules[moduleName];

  // Resalta en la lista la fila que se está editando
  for (const row of items.children) row.classList.toggle("editing", row.dataset.id === String(item?.id));

  // Título del formulario: «Nuevo producto» o «Editar producto»
  const heading = document.createElement("h3");
  heading.textContent = (item ? "Editar " : "Nuevo ") + singular;

  // Contenedor de los campos, en columnas
  const grid = document.createElement("div");
  grid.className = "fields";
  grid.style.setProperty("--cols", fields.length);

  // Crea cada campo (etiqueta + input) según la configuración del módulo
  for (const [name, caption, type, required] of fields) {
    const label = document.createElement("label");
    label.textContent = caption;
    const input = document.createElement("input");
    input.type = type;
    // Precio y stock: solo números positivos; precio admite centavos
    if (type === "number") {
      input.min = "0";
      input.step = name === "precio" ? "0.01" : "1";
    }
    // Contraseña: de 12 a 128 caracteres; al editar se puede dejar vacía
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
    // Campo de contraseña: agrega el botón del ojo para mostrarla u ocultarla
    if (type === "password") addPasswordToggle(input);
  }

  // Botones del formulario
  const buttons = document.createElement("div");
  buttons.className = "form-actions";
  // Botón de confirmar: «Crear producto / Crear usuario» o «Guardar cambios» al editar
  const submit = document.createElement("button");
  submit.textContent = item ? "Guardar cambios" : "Crear " + singular;
  buttons.append(submit);
  // Botón «Cancelar» (solo al editar): descarta los cambios y vuelve a «Nuevo ...»
  if (item) buttons.append(action("Cancelar", () => renderEditor()));

  editor.replaceChildren(heading, grid, buttons);

  // Al editar, sube hasta el formulario y pone el cursor en el primer campo
  if (item) {
    editor.scrollIntoView({ behavior: "smooth", block: "start" });
    grid.querySelector("input").focus({ preventScroll: true });
  }
}

// ---------------------------------------------------------------------
// showModule(): abre un módulo (pestaña Productos o Usuarios),
// pide sus registros al servidor y dibuja la lista.
// ---------------------------------------------------------------------
async function showModule(name) {
  const current = ++revision;
  moduleName = name;
  document.querySelector("#title").textContent = modules[name].title;

  // Marca como activa la pestaña del módulo abierto
  document.querySelectorAll("[data-module]").forEach((button) => {
    button.setAttribute("aria-pressed", button.dataset.module === name);
  });

  renderEditor();
  items.replaceChildren();

  // Carga los registros (GET /api/productos o GET /api/users)
  let data;
  try {
    data = await api(name);
  } catch (error) {
    if (current === revision || !token) throw error;
    return;
  }
  // Si mientras tanto se abrió otro módulo, ignora esta respuesta
  if (current !== revision) return;

  // Lista vacía: muestra «Todavía no hay productos.»
  if (!data.length) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "Todavía no hay " + modules[name].title.toLowerCase() + ".";
    items.append(empty);
  }

  // Una fila por registro
  for (const item of data) {
    const row = document.createElement("li");
    row.dataset.id = item.id;

    // Texto de la fila: título en negrita y detalles debajo
    const { title, meta } = modules[name].summary(item);
    const text = document.createElement("div");
    text.className = "item-text";
    const strong = document.createElement("strong");
    strong.textContent = title;
    const small = document.createElement("span");
    small.textContent = meta;
    text.append(strong, " ", small);

    // Botones de la fila
    const actions = document.createElement("div");
    actions.className = "item-actions";
    actions.append(
      // Botón «Editar»: carga el registro en el formulario
      action("Editar", () => renderEditor(item)),
      // Botón «Eliminar»: pide confirmación, borra en el servidor y recarga la lista
      action("Eliminar", async () => {
        if (!confirm("¿Eliminar " + item.nombre + "?")) return;
        await api(name + "/" + item.id, "DELETE");
        await showModule(name);
        notify("Registro eliminado");
      }, "danger"),
    );

    row.append(text, actions);
    items.append(row);
  }
}

// ---------------------------------------------------------------------
// run(): ejecuta una acción y, si falla, muestra el error en pantalla
// ---------------------------------------------------------------------
async function run(work) {
  notify("");
  try { await work(); } catch (error) { notify(error.message, "error"); }
}

// ---------------------------------------------------------------------
// Ojo para mostrar u ocultar la contraseña
// ---------------------------------------------------------------------

// Íconos SVG: ojo abierto (mostrar) y ojo tachado (ocultar)
const eyeIcons = {
  show: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  hide: '<path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-2.6 3.4M6.6 6.6A17.6 17.6 0 0 0 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M2 2l20 20"/>',
};

// Agrega un botón con ojo junto a un campo de contraseña que ya está dentro de su etiqueta.
function addPasswordToggle(input) {
  const wrapper = document.createElement("div");
  wrapper.className = "password-field";

  // Botón del ojo
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "toggle-password";

  // set(true) muestra la contraseña; set(false) la oculta
  const set = (visible) => {
    input.type = visible ? "text" : "password";
    toggle.setAttribute("aria-pressed", visible);
    // Texto oculto en vez de aria-label para no competir con la etiqueta del campo.
    toggle.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${eyeIcons[visible ? "hide" : "show"]}</svg>` +
      `<span class="visually-hidden">${visible ? "Ocultar" : "Mostrar"} contraseña</span>`;
  };

  // Clic en el ojo: alterna entre mostrar y ocultar
  toggle.onclick = () => { set(input.type === "password"); input.focus(); };
  // Al limpiar el formulario, la contraseña vuelve a ocultarse
  input.form?.addEventListener("reset", () => set(false));

  // El botón va fuera de la etiqueta para que no forme parte del nombre del campo.
  const label = input.closest("label");
  label.replaceWith(wrapper);
  wrapper.append(label, toggle);
  set(false);
}

// Agrega el ojo a las contraseñas del login y del registro
document.querySelectorAll("#login input[type=password], #register input[type=password]").forEach(addPasswordToggle);

// ---------------------------------------------------------------------
// Sesión y pantallas
// ---------------------------------------------------------------------

// Muestra el login o el registro según la dirección (#registro = registro)
function showAuthForm() {
  const signingUp = location.hash === "#registro";
  register.hidden = !signingUp;
  login.hidden = signingUp;
}

// Cierra la sesión en el navegador: borra el token, oculta el panel y vuelve al login
function clearSession() {
  token = null;
  ++revision;
  altaPendiente = undefined;
  if (location.hash) history.replaceState(null, "", location.pathname);
  sessionStorage.removeItem("sesion");
  admin.hidden = logout.hidden = true;
  showAuthForm();
}

// Abre el panel: comprueba la sesión, oculta los formularios de acceso y carga Productos
async function openSession() {
  await api("auth/me");
  login.hidden = register.hidden = true;
  logout.hidden = admin.hidden = false;
  await showModule("productos");
}

// ---------------------------------------------------------------------
// Formulario «Iniciar sesión» → botón «Entrar»
// Envía correo y contraseña, guarda el token y abre el panel.
// ---------------------------------------------------------------------
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

// ---------------------------------------------------------------------
// Formulario «Crear cuenta» → botón «Crear cuenta»
// Revisa que las contraseñas coincidan, registra la cuenta y
// regresa al login con el correo ya escrito.
// ---------------------------------------------------------------------
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

// Enlaces «Crear cuenta» / «Iniciar sesión»: cambian la dirección (#registro)
// y aquí se muestra el formulario que corresponde.
window.onhashchange = () => {
  if (token) return;
  notify("");
  showAuthForm();
};

// ---------------------------------------------------------------------
// Formulario del panel → botón «Crear producto / Crear usuario» o «Guardar cambios»
// Crea (POST) o actualiza (PUT) el registro y recarga la lista.
// ---------------------------------------------------------------------
editor.onsubmit = (event) => {
  event.preventDefault();
  enviarUnaVez(editor, async () => {
    const name = moduleName;
    const id = editing?.id;
    const data = Object.fromEntries(new FormData(editor));
    if (name === "productos") {
      // Precio y stock se envían como números, no como texto
      data.precio = Number(data.precio);
      data.stock = Number(data.stock);
      if (!id) data.nombre = "";
    } else if (!data.password) {
      // Al editar un usuario sin escribir contraseña, se conserva la actual
      delete data.password;
    }
    // Alta de producto: usa la misma clave si se reintenta con los mismos datos,
    // para que el servidor no lo cree dos veces
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

// Pestañas «Productos» y «Usuarios»: abren el módulo correspondiente
document.querySelectorAll("[data-module]").forEach((button) => {
  button.onclick = () => run(() => showModule(button.dataset.module));
});

// Botón «Cerrar sesión»: invalida el token en el servidor y vuelve al login
logout.onclick = () => run(async () => {
  await api("auth/logout", "POST");
  clearSession();
});

// ---------------------------------------------------------------------
// Inicio: si ya hay sesión guardada abre el panel; si no, muestra el login
// ---------------------------------------------------------------------
if (!token) showAuthForm();
else run(openSession);
