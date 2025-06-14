let currentProfileName = "";
let profiles = {};

document.addEventListener("DOMContentLoaded", () => {
  loadProfiles();

  document.getElementById("mask").addEventListener("click", () =>
    maskOrUnmask("mask")
  );
  document.getElementById("restore").addEventListener("click", () =>
    maskOrUnmask("unmask")
  );
  document.getElementById("copy").addEventListener("click", () => {
    navigator.clipboard.writeText(document.getElementById("text").value);
    alert("Copied!");
  });

  document.getElementById("add").addEventListener("click", addEntryToEditor);
  document.getElementById("save").addEventListener("click", saveCurrentProfile);
  document.getElementById("create").addEventListener("click", createNewProfile);
  document.getElementById("delete").addEventListener("click", deleteCurrentProfile);
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
  const text = textArea.value;
  const profile = profiles[currentProfileName];
  const seed = profile["__seed"];
  const keyBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(seed));
  const kint = new Uint32Array(keyBuffer)[0];

  const ipRegex = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;

  if (action === "mask") {
    let result = text;
    for (const [k, v] of Object.entries(profile)) {
      if (k.startsWith("__")) continue;
      result = result.replaceAll(k, v);
    }

    const ips = [...new Set(result.match(ipRegex) || [])];
    let idx = 1;
    for (const ip of ips) {
      const ipInt = ip.split('.').reduce((a, b) => (a << 8) + +b, 0);
      const obf = (ipInt ^ kint).toString(36).toUpperCase();
      const ph = `{{IP_${idx++}_${obf}}}`;
      result = result.replaceAll(ip, ph);
    }

    const comment = "# This text was masked. Placeholders like {{IP_1_XXXXXX}} or {{FIELD}} represent real values. Values are consistent across the text.\n\n";
    if (!result.startsWith(comment)) {
      result = comment + result;
    }

    textArea.value = result;
  } else {
    let result = text.replace(/^#.*\n+/g, "");
    result = result.replace(/\{\{IP_\d+_([A-Z0-9]+)\}\}/g, (_, code) => {
      const ipInt = parseInt(code, 36) ^ kint;
      return [24, 16, 8, 0].map(shift => (ipInt >> shift) & 255).join(".");
    });
    for (const [k, v] of Object.entries(profile)) {
      if (k.startsWith("__")) continue;
      result = result.replaceAll(v, k);
    }
    textArea.value = result;
  }
}
