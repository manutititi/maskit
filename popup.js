let currentProfileName = "";
let profiles = {};
let maskIpEnabled = true;


document.addEventListener("DOMContentLoaded", () => {
  loadProfiles();

  // 📥 Restore textarea:
  const textArea = document.getElementById("text");
  const savedText = localStorage.getItem("textareaContent");
  if (savedText !== null) {
    textArea.value = savedText;
  }

  // SAve while typping
  textArea.addEventListener("input", () => {
    localStorage.setItem("textareaContent", textArea.value);
  });


    // Toggle IP Masking
  const toggle = document.getElementById("toggle-mask-ip");
  const savedToggle = localStorage.getItem("maskIpEnabled");
  if (savedToggle !== null) maskIpEnabled = savedToggle === "true";
  toggle.checked = maskIpEnabled;
  toggle.addEventListener("change", () => {
    maskIpEnabled = toggle.checked;
    localStorage.setItem("maskIpEnabled", maskIpEnabled);
  });


  document.getElementById("mask").addEventListener("click", () =>
    maskOrUnmask("mask")
  );
  document.getElementById("restore").addEventListener("click", () =>
    maskOrUnmask("unmask")
  );
  document.getElementById("copy").addEventListener("click", () => {
    navigator.clipboard.writeText(textArea.value);
    alert("Copied!");
  });

  document.getElementById("add").addEventListener("click", addEntryToEditor);
  document.getElementById("save").addEventListener("click", saveCurrentProfile);
  document.getElementById("create").addEventListener("click", createNewProfile);
  document.getElementById("delete").addEventListener("click", deleteCurrentProfile);

  // Export
   document.getElementById("export").addEventListener("click", () => {
    const name = currentProfileName;
    if (!profiles[name]) {
      alert("No hay perfil seleccionado para exportar.");
      return;
    }
    const single = { [name]: profiles[name] };
    const dataStr = JSON.stringify(single, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `maskit-profile-${name}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById("import").addEventListener("click", () => {
  const textarea = document.getElementById("import-json");
  const applyBtn = document.getElementById("import-apply");

  textarea.style.display = "block";
  applyBtn.style.display = "block";
});

document.getElementById("import-apply").addEventListener("click", () => {
  const textarea = document.getElementById("import-json");
  const applyBtn = document.getElementById("import-apply");

  try {
    const imported = JSON.parse(textarea.value);
    if (typeof imported !== "object") throw new Error("Incorrect");

    profiles = { ...profiles, ...imported };
    localStorage.setItem("profiles", JSON.stringify(profiles));
    populateProfileSelect();
    alert("Profiles imported successfully!");

    textarea.value = "";
    textarea.style.display = "none";
    applyBtn.style.display = "none";
  } catch (e) {
    alert("Error " + e.message);
  }
});




});

function loadProfiles() {
  const saved = JSON.parse(localStorage.getItem("profiles") || "{}");

  if (Object.keys(saved).length === 0) {
    fetch("profiles/default.json")
      .then(res => res.json())
      .then(defaultProfile => {
        defaultProfile["__seed"] = generateSeed();
        profiles = { default: defaultProfile };
        localStorage.setItem("profiles", JSON.stringify(profiles));
        localStorage.setItem("lastProfile", "default");
        populateProfileSelect();
      });
  } else {
    profiles = saved;
    populateProfileSelect();
  }
}

function populateProfileSelect() {
  const select = document.getElementById("profile");
  select.innerHTML = "";

  Object.keys(profiles).forEach(name => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    select.appendChild(option);
  });

  const last = localStorage.getItem("lastProfile") || "default";
  select.value = last;
  currentProfileName = last;
  renderProfileEditor(profiles[last]);

  select.addEventListener("change", () => {
    currentProfileName = select.value;
    localStorage.setItem("lastProfile", currentProfileName);
    renderProfileEditor(profiles[currentProfileName]);
  });
}

function renderProfileEditor(profile) {
  const tbody = document.querySelector("#profileTable tbody");
  tbody.innerHTML = "";
  for (const key in profile) {
    if (key === "__seed") continue;
    addRow(key, profile[key]);
  }
}

function addRow(key = "", value = "") {
  const tbody = document.querySelector("#profileTable tbody");
  const tr = document.createElement("tr");

  tr.innerHTML = `
    <td><input type="text" value="${key}" class="key" /></td>
    <td><input type="text" value="${value}" class="value" /></td>
    <td><button class="delete-btn">🗑</button></td>
  `;

  tr.querySelector(".delete-btn").addEventListener("click", () => {
    tbody.removeChild(tr);
  });

  tbody.appendChild(tr);
}

function addEntryToEditor() {
  addRow();
}

function saveCurrentProfile() {
  const rows = document.querySelectorAll("#profileTable tbody tr");
  const updated = {
    "__seed": profiles[currentProfileName]["__seed"] || generateSeed()
  };

  rows.forEach(row => {
    const key = row.querySelector(".key")?.value.trim();
    const val = row.querySelector(".value")?.value.trim();
    if (key && val) {
      updated[key] = val;
    }
  });

  profiles[currentProfileName] = updated;
  localStorage.setItem("profiles", JSON.stringify(profiles));
  alert("Profile saved.");
}

function createNewProfile() {
  const name = prompt("New profile name:");
  if (!name || profiles[name]) return;
  profiles[name] = { "__seed": generateSeed() };
  localStorage.setItem("profiles", JSON.stringify(profiles));
  populateProfileSelect();
}

function deleteCurrentProfile() {
  if (currentProfileName === "default") {
    alert("Can't delete default profile.");
    return;
  }
  if (!confirm("Are you sure you want to delete this profile?")) return;
  delete profiles[currentProfileName];
  localStorage.setItem("profiles", JSON.stringify(profiles));
  localStorage.setItem("lastProfile", "default");
  populateProfileSelect();
}

function generateSeed() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}


async function maskOrUnmask(action) {
  const textArea = document.getElementById("text");
  let text = textArea.value;

  const profile = profiles[currentProfileName] || {};
  const keyBuffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(profile["__seed"] || "")
  );
  const kint = new Uint32Array(keyBuffer)[0];
  const ipRegex = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;

  if (action === "mask") {
    // Quitar comentarios previos
    text = text.replace(/^#.*\n+/, "");

    // Reemplazar campos de perfil
    Object.entries(profile).forEach(([k, v]) => {
      if (k.startsWith("__")) return;
      const re = new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
      text = text.replace(re, v);
    });

    // Enmascarar IPs solo si toggle activo
    if (maskIpEnabled) {
      const ips = [...new Set(text.match(ipRegex) || [])];
      const map = {};
      ips.forEach((ip, i) => {
        const ipInt = ip.split('.').reduce((acc, b) => (acc << 8) + +b, 0);
        const obf = (ipInt ^ kint).toString(36).toUpperCase();
        map[ip] = `{{IP_${i + 1}_${obf}}}`;
      });
      // Reemplazar todas las instancias de cada IP
      text = text.replace(ipRegex, match => map[match]);
    }

    // Añadir comentario encabezado
    const comment = "# This text was masked. Placeholders are consistent across the text.\n\n";
    text = comment + text;

  } else {
    // Unmask: eliminar comentario
    text = text.replace(/^#.*\n+/, "");

    // Restaurar IPs
    text = text.replace(/\{\{IP_\d+_([A-Z0-9]+)\}\}/g, (_, code) => {
      const ipInt = parseInt(code, 36) ^ kint;
      return [24, 16, 8, 0]
        .map(s => (ipInt >> s) & 255)
        .join('.');
    });

    // Restaurar placeholders de perfil
    Object.entries(profile).forEach(([k, v]) => {
      if (k.startsWith("__")) return;
      text = text.replaceAll(v, k);
    });
  }

  textArea.value = text;
  localStorage.setItem("textareaContent", text);
}
