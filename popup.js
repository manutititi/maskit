// ==== Mask / Restore Functions ====
const comment = `# This text was masked. Placeholders are consistent across the text.\n\n\n`;

async function generateKey(seed) {
  const encoder = new TextEncoder();
  const data = encoder.encode(seed);
  const buffer = await crypto.subtle.digest("SHA-256", data);
  const hash = new Uint8Array(buffer);
  return (((hash[0] << 24) | (hash[1] << 16) | (hash[2] << 8) | hash[3]) >>> 0);
}

function ipToInt(ip) {
  return ip.split('.')
    .reduce((acc, oct) => (((acc << 8) + parseInt(oct, 10)) >>> 0), 0);
}

function intToIp(int) {
  int = int >>> 0;
  return [
    (int >>> 24) & 255,
    (int >>> 16) & 255,
    (int >>> 8) & 255,
    int & 255
  ].join('.');
}

function base36Encode(num) {
  return num.toString(36).toUpperCase();
}

function base36Decode(str) {
  return parseInt(str, 36) >>> 0;
}



async function maskText(text, profile) {
  const mapping = {};
  const key = await generateKey(profile["__seed"] || "");

  // Simple replacements
  for (let original in profile) {
    if (original.startsWith("__")) continue;
    const ph = profile[original];
    const esc = original.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    text = text.replace(new RegExp(esc, "g"), m => {
      mapping[m] = ph;
      return ph;
    });
  }

  // Mask IPs
  const ipRegex = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
  let idx = 1;
  const seen = new Map();
  text = text.replace(ipRegex, ip => {
    if (seen.has(ip)) return seen.get(ip);
    const ipInt = ipToInt(ip);
    const obf = (ipInt ^ key) >>> 0;
    const code = base36Encode(obf).replace(/-/g, "");
    const ph = `{{IP_${idx++}_${code}}}`;
    seen.set(ip, ph);
    mapping[ip] = ph;
    return ph;
  });

  // Prepend comment if missing
  if (!text.startsWith(comment.trim())) {
    text = comment + text;
  }

  // Guardar mapping en localStorage
  window._lastMapping = mapping;
  localStorage.setItem("lastMapping", JSON.stringify(mapping));

  return { output: text, mapping };
}



async function restoreText(text, mapping, seed) {
  const key = await generateKey(seed);

  // Si no se pasó mapping explícitamente, intenta recuperar desde localStorage
  if (!mapping || Object.keys(mapping).length === 0) {
    mapping = JSON.parse(localStorage.getItem("lastMapping") || "{}");
  }

  // Remove comment
  const commentRegex = /^# This text was masked\.[\s\S]*?\n{2,}/;
  text = text.replace(commentRegex, "");

  // Restore IPs
  text = text.replace(/\{\{IP_\d+_([A-Z0-9]+)\}\}/g, (_, code) => {
    const decoded = base36Decode(code);
    const ipInt = (decoded ^ key) >>> 0;
    return intToIp(ipInt);
  });

  // Restore placeholders
  for (const [orig, ph] of Object.entries(mapping)) {
    const esc = ph.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    text = text.replace(new RegExp(esc, "g"), orig);
  }

  return text;
}


// ==== UI Logic ====
let currentProfileName = "";
let profiles = JSON.parse(localStorage.getItem("profiles") || "{}");
let maskIpEnabled = true;
window._lastMapping = {};

document.addEventListener("DOMContentLoaded", () => {
  loadProfiles();

  const textArea = document.getElementById("text");
  const saved = localStorage.getItem("textareaContent");
  if (saved) textArea.value = saved;
  textArea.addEventListener("input", () => {
    localStorage.setItem("textareaContent", textArea.value);
  });

  const toggle = document.getElementById("toggle-mask-ip");
  const savedToggle = localStorage.getItem("maskIpEnabled");
  if (savedToggle !== null) maskIpEnabled = savedToggle === "true";
  toggle.checked = maskIpEnabled;
  toggle.addEventListener("change", () => {
    maskIpEnabled = toggle.checked;
    localStorage.setItem("maskIpEnabled", maskIpEnabled);
  });

  document.getElementById("mask").onclick = async () => {
    if (!maskIpEnabled) return;
    const { output, mapping } = await maskText(textArea.value, profiles[currentProfileName] || {});
    window._lastMapping = mapping;
    textArea.value = output;
    localStorage.setItem("textareaContent", output);
  };

  document.getElementById("restore").onclick = async () => {
    const restored = await restoreText(textArea.value, window._lastMapping || {}, profiles[currentProfileName]["__seed"] || "");
    textArea.value = restored;
    localStorage.setItem("textareaContent", restored);
  };

  document.getElementById("copy").onclick = () => {
    navigator.clipboard.writeText(textArea.value);
    alert("Copied!");
  };

  document.getElementById("add").onclick = () => addEntryToEditor();
  document.getElementById("save").onclick = () => saveCurrentProfile();
  document.getElementById("create").onclick = () => createNewProfile();
  document.getElementById("delete").onclick = () => deleteCurrentProfile();

  // Export
  document.getElementById("export").onclick = () => {
    const name = currentProfileName;
    if (!profiles[name]) return alert("No hay perfil seleccionado para exportar.");
    const data = JSON.stringify({ [name]: profiles[name] }, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `maskit-profile-${name}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Import
  document.getElementById("import").onclick = () => {
    document.getElementById("import-json").style.display = "block";
    document.getElementById("import-apply").style.display = "block";
  };
  document.getElementById("import-apply").onclick = () => {
    const ta = document.getElementById("import-json");
    try {
      const imp = JSON.parse(ta.value);
      profiles = { ...profiles, ...imp };
      localStorage.setItem("profiles", JSON.stringify(profiles));
      populateProfileSelect();
      alert("Profiles imported successfully!");
      ta.value = "";
      ta.style.display = "none";
      document.getElementById("import-apply").style.display = "none";
    } catch (e) {
      alert("Error: " + e.message);
    }
  };
});

function loadProfiles() {
  const saved = JSON.parse(localStorage.getItem("profiles") || "{}");
  profiles = Object.keys(saved).length ? saved : {};
  populateProfileSelect();
}

function populateProfileSelect() {
  const select = document.getElementById("profile");
  select.innerHTML = "";
  Object.keys(profiles).forEach(name => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  });
  currentProfileName = localStorage.getItem("lastProfile") || Object.keys(profiles)[0] || "";
  select.value = currentProfileName;
  select.onchange = () => {
    currentProfileName = select.value;
    localStorage.setItem("lastProfile", currentProfileName);
    renderProfileEditor(profiles[currentProfileName] || {});
  };
  renderProfileEditor(profiles[currentProfileName] || {});
}

function renderProfileEditor(profile) {
  const tbody = document.querySelector("#profileTable tbody");
  tbody.innerHTML = "";
  for (const k in profile) {
    if (k === "__seed") continue;
    addRow(k, profile[k]);
  }
}

function addEntryToEditor() { addRow(); }

function addRow(key = "", value = "") {
  const tbody = document.querySelector("#profileTable tbody");
  const tr = document.createElement("tr");
  tr.innerHTML = `<td><input class="key" value="${key}"/></td><td><input class="value" value="${value}"/></td><td><button class="del">🗑</button></td>`;
  tr.querySelector(".del").onclick = () => tr.remove();
  tbody.appendChild(tr);
}

function saveCurrentProfile() {
  const updated = { "__seed": profiles[currentProfileName]["__seed"] || generateSeed() };
  document.querySelectorAll("#profileTable tbody tr").forEach(r => {
    const k = r.querySelector(".key").value.trim();
    const v = r.querySelector(".value").value.trim();
    if (k && v) updated[k] = v;
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
  loadProfiles();
}

function deleteCurrentProfile() {
  if (!confirm("Delete this profile?")) return;
  delete profiles[currentProfileName];
  localStorage.setItem("profiles", JSON.stringify(profiles));
  loadProfiles();
}

function generateSeed() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}
