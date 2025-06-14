console.log("🛡 Plugin 'Mask Data for AI' activo");

const button = document.createElement("button");
button.innerText = "🛡 Enmascarar";
button.style.position = "fixed";
button.style.bottom = "20px";
button.style.right = "20px";
button.style.zIndex = "9999";
button.style.padding = "10px";
button.style.background = "#222";
button.style.color = "#fff";
button.style.border = "none";
button.style.borderRadius = "8px";
button.style.cursor = "pointer";
button.onclick = () => {
  alert("Aquí irá la lógica de enmascaramiento.");
};

document.body.appendChild(button);
