/* Visor Cinema v0.1: minimal encrypted public-relay transport.
   The topic and messages remain on a third-party ntfy server for its cache lifetime.
   No URL is ever sent as plaintext. Not a substitute for a private audited relay. */
(function (global) {
  "use strict";
  const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const BASE = "https://ntfy.sh/";
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const secure = () => Boolean(global.crypto && global.crypto.subtle && global.crypto.getRandomValues);

  function codeNew() {
    if (!secure()) throw Error("Secure random generator / Web Crypto unavailable.");
    const bytes = new Uint8Array(12);
    global.crypto.getRandomValues(bytes);
    return Array.from(bytes, b => ALPHABET[b & 31]).join("");
  }

  function codeNormalize(code) {
    const s = String(code || "").toUpperCase().replace(/[\s-]/g, "");
    if (s.length !== 12 || !Array.from(s).every(c => ALPHABET.includes(c))) {
      throw Error("Enter the twelve-character code shown in the glasses.");
    }
    return s;
  }

  function codeDisplay(code) {
    return code.match(/.{1,4}/g).join("-");
  }

  function base64(bytes) {
    let result = "";
    for (const x of bytes) result += String.fromCharCode(x);
    return btoa(result);
  }
  function unbase64(s) {
    const raw = atob(s);
    return Uint8Array.from(raw, c => c.charCodeAt(0));
  }

  async function derive(code) {
    const bytes = encoder.encode("Visor-Cinema-private-room-v1:" + code);
    const digest = await global.crypto.subtle.digest("SHA-256", bytes);
    const topic = "vc1" + Array.from(new Uint8Array(digest).slice(0, 20), v =>
      v.toString(16).padStart(2, "0")).join("");
    const raw = await global.crypto.subtle.importKey(
      "raw", encoder.encode(code), "PBKDF2", false, ["deriveKey"]);
    const key = await global.crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: encoder.encode("visor-cinema-secret-v1"), iterations: 120000, hash: "SHA-256" },
      raw, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    return { topic, key };
  }

  class Room {
    constructor(code, topic, key) {
      this.code = code;
      this.topic = topic;
      this.key = key;
      this.startedAt = Math.floor(Date.now() / 1000) - 5;
      this.cursor = null;
      this.ids = new Set();
      this.busy = false;
    }

    static async open(code) {
      if (!secure()) throw Error("Web Crypto unavailable on this device. Secure pairing cannot start.");
      const clean = codeNormalize(code);
      const { topic, key } = await derive(clean);
      return new Room(clean, topic, key);
    }

    async send(kind, value) {
      if (!["hello", "ready", "link", "play", "pause", "seek", "stop"].includes(kind))
        throw Error("Unknown message type.");
      const msg = JSON.stringify({
        version: 1, kind, value: value === undefined ? null : value,
        created: Date.now(), nonce: base64(global.crypto.getRandomValues(new Uint8Array(12)))
      });
      const iv = global.crypto.getRandomValues(new Uint8Array(12));
      const cipher = new Uint8Array(await global.crypto.subtle.encrypt(
        { name: "AES-GCM", iv }, this.key, encoder.encode(msg)));
      const payload = JSON.stringify({ v: 1, iv: base64(iv), data: base64(cipher) });
      if (payload.length > 4000) throw Error("Message is too large.");
      // text/plain is a CORS-safelisted content type.
      const response = await fetch(BASE + this.topic, {
        method: "POST", mode: "cors", cache: "no-store",
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        body: payload
      });
      if (!response.ok) throw Error("Relay rejected the message (HTTP " + response.status + ").");
    }

    async read(onMessage) {
      if (this.busy) return;
      this.busy = true;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 9000);
      try {
        const since = this.cursor || String(this.startedAt);
        const response = await fetch(BASE + this.topic + "/json?poll=1&since=" +
          encodeURIComponent(since), { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw Error("Relay not reachable (HTTP " + response.status + ").");
        const data = await response.text();
        for (const line of data.split("\n")) {
          if (!line.trim()) continue;
          let record;
          try { record = JSON.parse(line); } catch (_) { continue; }
          if (record.event !== "message" || !record.id || typeof record.message !== "string") continue;
          if (this.ids.has(record.id)) continue;
          this.ids.add(record.id);
          // Poll from the most recently observed ntfy record ID.
          this.cursor = record.id;
          if (this.ids.size > 120) this.ids.clear();
          try {
            const packet = JSON.parse(record.message);
            if (packet.v !== 1) continue;
            const plaintext = await global.crypto.subtle.decrypt(
              { name: "AES-GCM", iv: unbase64(packet.iv) },
              this.key, unbase64(packet.data));
            const message = JSON.parse(decoder.decode(plaintext));
            if (message.version !== 1 || !message.kind) continue;
            if (Math.abs(Date.now() - Number(message.created)) > 15 * 60 * 1000) continue;
            await onMessage(message);
          } catch (_) { /* Foreign traffic, replay, invalid ciphertext: ignore. */ }
        }
      } finally {
        clearTimeout(timeout);
        this.busy = false;
      }
    }
  }

  function validUrl(raw) {
    const value = String(raw || "").trim();
    if (value.length < 10 || value.length > 1800) throw Error("Enter an HTTPS URL below 1800 characters.");
    let url;
    try { url = new URL(value); } catch (_) { throw Error("Enter a complete HTTPS website or video URL."); }
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password)
      throw Error("Only public HTTPS links are accepted.");
    if (url.hostname === "localhost" || url.hostname.endsWith(".local") ||
        /^(?:127|10|192\.168)\./.test(url.hostname)) throw Error("Local network URLs are not supported.");
    return url.href;
  }

  global.VisorRelay = { Room, codeNew, codeNormalize, codeDisplay, validUrl, secure };
})(window);
