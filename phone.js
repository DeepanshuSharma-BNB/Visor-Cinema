/* Visor Cinema companion controller. No localStorage, cookies or analytics. */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const R = window.VisorRelay;
  let room = null, connected = false, epoch = 0, timer = null, busy = false;
  const status = (id, text, error) => {
    const node = $(id);
    node.textContent = text;
    node.classList.toggle("error", Boolean(error));
  };
  function enable(canSend) {
    ["sendBtn", "playBtn", "pauseBtn", "stopBtn"].forEach(id => $(id).disabled = !canSend);
  }
  async function poll(activeEpoch) {
    if (activeEpoch !== epoch || !room) return;
    try {
      await room.read(async msg => {
        if (msg.kind === "ready") {
          connected = true;
          enable(true);
          status("connectionStatus", "Glasses confirmed the pairing. You can send a link.");
        }
      });
    } catch (e) {
      status("connectionStatus", "Relay temporarily unreachable; reconnecting: " + e.message, true);
    }
    if (activeEpoch === epoch) timer = setTimeout(() => poll(activeEpoch), 15000);
  }

  async function connect() {
    ++epoch;
    clearTimeout(timer);
    const current = epoch;
    room = null;
    connected = false;
    enable(false);
    $("connectBtn").disabled = true;
    status("connectionStatus", "Securing pairing…");
    if (!R.secure()) {
      status("connectionStatus", "Web Crypto is unavailable. Secure pairing requires HTTPS and a supported browser.", true);
      $("connectBtn").disabled = false;
      return;
    }
    try {
      room = await R.Room.open($("roomCode").value);
      if (current !== epoch) return;
      await room.send("hello", { device: "phone" });
      status("connectionStatus", "Pairing request sent securely. Waiting for the glasses to confirm…");
      // Link sending can work even before ack, but wait for confirm for user feedback.
      await poll(current);
    } catch (e) {
      status("connectionStatus", "Connection failed: " + e.message, true);
    } finally {
      $("connectBtn").disabled = false;
    }
  }

  async function sendLink() {
    if (!room) {
      status("linkStatus", "Pair with the glasses first.", true);
      return;
    }
    let url;
    try { url = R.validUrl($("videoUrl").value); }
    catch (e) { status("linkStatus", e.message, true); return; }
    $("sendBtn").disabled = true;
    status("linkStatus", "Encrypting and sending link…");
    try {
      await room.send("link", url);
      status("linkStatus", "Encrypted link delivered to relay. Watch the glasses for an update (up to 10–15 seconds). If the website blocks embedding, try a direct MP4.");
    } catch (e) { status("linkStatus", "Could not send: " + e.message, true); }
    finally { $("sendBtn").disabled = !connected; }
  }

  async function command(type) {
    if (!room || !connected) return;
    try {
      await room.send(type, null);
      status("linkStatus", type.toUpperCase() + " sent. Applies to compatible direct video playback.");
    } catch (e) { status("linkStatus", "Remote command failed: " + e.message, true); }
  }

  $("connectBtn").addEventListener("click", connect);
  $("sendBtn").addEventListener("click", sendLink);
  $("playBtn").addEventListener("click", () => command("play"));
  $("pauseBtn").addEventListener("click", () => command("pause"));
  $("stopBtn").addEventListener("click", () => command("stop"));
  $("pasteBtn").addEventListener("click", async () => {
    try {
      const value = await navigator.clipboard.readText();
      if (!value) throw Error("Clipboard is empty.");
      $("videoUrl").value = value.trim();
      status("linkStatus", "Link pasted. Press Send to glasses.");
    } catch (_) {
      status("linkStatus", "Clipboard permission unavailable. Long-press the field and tap Paste.", true);
      $("videoUrl").focus();
    }
  });
  $("roomCode").addEventListener("input", event => {
    const chars = event.target.value.toUpperCase().replace(/[^23456789ABCDEFGHJKLMNPQRSTUVWXYZ]/g, "").slice(0, 12);
    event.target.value = chars.replace(/^(.{4})(.{1,4})(.*)$/, (_, a, b, c) => a + "-" + b + (c ? "-" + c : ""));
  });
  const query = new URLSearchParams(location.search);
  if (query.has("link")) {
    $("videoUrl").value = query.get("link") || "";
    // Do not leave private links in browser history.
    history.replaceState(null, "", location.pathname);
  }
  window.addEventListener("pagehide", () => { ++epoch; clearTimeout(timer); });
})();