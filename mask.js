const comment = `# This text was masked. Placeholders like {{IP_1_XXXXXX}} or {{FIELD}} represent real values. Values are consistent across the text.\n\n\n`;

async function generateKey(seed) {
  const encoder = new TextEncoder();
  const data = encoder.encode(seed);
  const buffer = await crypto.subtle.digest("SHA-256", data);
  const hash = new Uint8Array(buffer);
  return (hash[0] << 24) | (hash[1] << 16) | (hash[2] << 8) | hash[3];
}

function ipToInt(ip) {
  return ip.split('.').reduce((acc, oct) => (acc << 8) + parseInt(oct), 0);
}

function intToIp(int) {
  return [
    (int >> 24) & 255,
    (int >> 16) & 255,
    (int >> 8) & 255,
    int & 255
  ].join('.');
}

function base36Encode(num) {
  return num.toString(36).toUpperCase();
}

function base36Decode(str) {
  return parseInt(str, 36);
}

async function maskText(text, profile) {
  const mapping = {};
  const seed = profile["__seed"];
  const key = await generateKey(seed);

  // Simple replacements
  for (let original in profile) {
    if (original.startsWith("__")) continue;
    const placeholder = profile[original];
    const regex = new RegExp(original, "g");
    text = text.replace(regex, match => {
      mapping[match] = placeholder;
      return placeholder;
    });
  }

  // Mask IPs
  const ipRegex = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
  let match;
  let idx = 1;
  const ips = new Set();
  while ((match = ipRegex.exec(text)) !== null) {
    ips.add(match[0]);
  }

  ips.forEach(ip => {
    const ipInt = ipToInt(ip);
    const obfuscated = ipInt ^ key;
    const code = base36Encode(obfuscated);
    const placeholder = `{{IP_${idx++}_${code}}}`;
    mapping[ip] = placeholder;
    text = text.replaceAll(ip, placeholder);
  });

  // Add comment if not already present
  if (!text.includes(comment.trim())) {
    text = comment + text;
  }

  return {
    output: text,
    mapping
  };
}

async function restoreText(text, mapping, seed) {
  const key = await generateKey(seed);

  // Remove comment
  const commentRegex = /^# This text was masked\. Placeholders like \{\{IP_1_XXXXXX\}\} or \{\{FIELD\}\} represent real values\. Values are consistent across the text\.\n*\n*/;
  text = text.replace(commentRegex, "");

  // Restore IPs
  text = text.replace(/\{\{IP_(\d+)_([A-Z0-9]+)\}\}/g, (_, _idx, code) => {
    try {
      const decoded = base36Decode(code);
      const ip = intToIp(decoded ^ key);
      return ip;
    } catch {
      return `[INVALID_IP_${code}]`;
    }
  });

  // Restore placeholders
  for (const [original, placeholder] of Object.entries(mapping)) {
    text = text.replaceAll(placeholder, original);
  }

  return text;
}
