/* Visor Cinema glasses screen. Designed for Meta's 600x600 web-app window. */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const R = window.VisorRelay;
  const els = {
    home: $("homeScreen"), stage: $("playerScreen"), code: $("pairCode"),
    pairStatus: $("pairStatus"), led: $("connectionLed"), kind: $("mediaType"),
    domain: $("mediaDomain"), video: $("video"), frame: $("frame"),
    empty: $("emptyMedia"), mediaStatus: $("mediaStatus"),
    play: $("toggleBtn"), direct: $("openSiteBtn"),
  };
  const sample = "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4";
  let room = null, roomEpoch = 0, timer = null, paired = false, activeUrl = null;
  let mode = "none", playing = false, lastUrl = null;

  function report(s) { els.pairStatus.textContent = s; }
  function mediaReport(s) { els.mediaStatus.textContent = s; }
  function setPaired(value) {
    paired = value;
    els.led.classList.toggle("connected", value);
    els.led.setAttribute("aria-label", value ? "Phone paired" : "Waiting for phone");
  }

  async function startPairing() {
    const epoch = ++roomEpoch;
    clearTimeout(timer);
    room = null;
    setPaired(false);
    report("Creating encrypted channel…");
    if (!R.secure()) {
      els.code.textContent = "UNAVAILABLE";
      report("Web Crypto is unavailable in this browser. Pairing disabled. Test video still works.");
      return;
    }
    try {
      const code = R.codeNew();
      els.code.textContent = R.codeDisplay(code);
      const next = await R.Room.open(code);
      if (epoch !== roomEpoch) return;
      room = next;
      report("Ready for phone pairing. Enter the code shown above.");
      await poll(epoch);
    } catch (e) {
      els.code.textContent = "ERROR";
      report("Pairing error: " + (e.message || "Unsupported browser."));
    }
  }

  async function poll(epoch) {
    if (epoch !== roomEpoch || !room) return;
    try {
      await room.read(async msg => {
        if (msg.kind === "hello") {
          setPaired(true);
          report("Phone linked. Send a video URL from the controller.");
          try { await room.send("ready", { device: "glasses" }); } catch (_) {
            report("Phone request received; acknowledgement failed. Try sending a link.");
          }
        } else if (msg.kind === "link" && typeof msg.value === "string") {
          if (!paired) setPaired(true);
          try { await openLink(msg.value); } catch (e) { mediaReport(e.message); }
        } else if (msg.kind === "play") {
          if (mode === "direct") await els.video.play().catch(() => mediaReport("Tap Play on glasses to permit playback."));
        } else if (msg.kind === "pause") {
          if (mode === "direct") els.video.pause();
        } else if (msg.kind === "seek" && mode === "direct") {
          seek(Number(msg.value));
        } else if (msg.kind === "stop") { stopMedia(); showHome(); }
      });
    } catch (e) {
      if (epoch === roomEpoch) report("Relay connection issue. Retrying… (" + (e.message || "network") + ")");
    }
    if (epoch === roomEpoch) timer = setTimeout(() => poll(epoch), 8000);
  }

  function showHome() {
    els.home.hidden = false;
    els.stage.hidden = true;
    $("demoBtn").focus();
  }
  function showStage() {
    els.home.hidden = true;
    els.stage.hidden = false;
    $("toggleBtn").focus();
  }

  function stopMedia() {
    els.video.pause();
    els.video.removeAttribute("src");
    els.video.load();
    els.frame.src = "about:blank";
    els.video.hidden = true;
    els.frame.hidden = true;
    els.empty.hidden = false;
    els.direct.hidden = true;
    mode = "none";
    playing = false;
    activeUrl = null;
    els.play.textContent = "▶ Play";
  }

  function youtubeId(u) {
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    let id = null;
    if (host === "youtu.be") id = u.pathname.slice(1).split("/")[0];
    if (["youtube.com", "m.youtube.com", "music.youtube.com", "youtube-nocookie.com"].includes(host)) {
      if (u.pathname === "/watch") id = u.searchParams.get("v");
      else if (/^\/(shorts|embed|live)\//.test(u.pathname)) id = u.pathname.split("/")[2];
    }
    return id && /^[\w-]{11}$/.test(id) ? id : null;
  }
  function vimeoId(u) {
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    if (host !== "vimeo.com" && host !== "player.vimeo.com") return null;
    const parts = u.pathname.split("/").filter(Boolean);
    const id = parts.find(p => /^\d{5,12}$/.test(p));
    return id || null;
  }
  function mediaKind(u) {
    if (/\.(mp4|webm|ogg)$/i.test(u.pathname)) return "direct";
    if (youtubeId(u)) return "youtube";
    if (vimeoId(u)) return "vimeo";
    return "website";
  }
  async function openLink(raw) {
    const safe = R.validUrl(raw);
    const u = new URL(safe);
    stopMedia();
    activeUrl = safe;
    lastUrl = safe;
    els.domain.textContent = u.hostname.replace(/^www\./, "");
    mode = mediaKind(u);
    showStage();
    els.kind.textContent = ({
      direct: "DIRECT VIDEO", youtube: "YOUTUBE · TEST",
      vimeo: "VIMEO · TEST", website: "WEBPAGE · TEST"
    })[mode];
    els.direct.hidden = mode === "direct";
    els.empty.hidden = true;
    if (mode === "direct") {
      els.frame.hidden = true;
      els.video.hidden = false;
      els.video.src = safe;
      mediaReport("Loading direct video. Some formats/codecs are unsupported on glasses.");
      els.video.load();
      // Remote playback may be denied by autoplay policy. User can pinch Play.
      els.video.play().catch(() => {
        mediaReport("Press Play with Neural Band to start the video.");
      });
    } else {
      els.video.hidden = true;
      els.frame.hidden = false;
      els.play.textContent = "▶ Embedded";
      let address = safe;
      if (mode === "youtube")
        address = "https://www.youtube-nocookie.com/embed/" + youtubeId(u) + "?playsinline=1";
      if (mode === "vimeo")
        address = "https://player.vimeo.com/video/" + vimeoId(u);
      els.frame.src = address;
      if (mode === "website") {
        mediaReport("Testing webpage inside a frame. Sites may block embedding, streaming, or DRM.");
      } else {
        mediaReport("Embedded player experiment. The website controls playback; Neural Band seek may not work.");
      }
    }
  }
  function seek(delta) {
    if (mode !== "direct") {
      mediaReport("Seeking isn't available for embedded pages.");
      return;
    }
    if (!Number.isFinite(els.video.duration)) {
      mediaReport("Video metadata isn't available yet.");
      return;
    }
    els.video.currentTime = Math.min(els.video.duration, Math.max(0, els.video.currentTime + delta));
  }
  async function togglePlay() {
    if (mode !== "direct") {
      mediaReport("Select the embedded player's own controls. Gesture commands can't control cross-site players.");
      return;
    }
    if (!els.video.paused) els.video.pause();
    else try { await els.video.play(); } catch (_) {
      mediaReport("Playback blocked or format unsupported on these glasses.");
    }
  }
  function focusable() {
    return Array.from(document.querySelectorAll("button.focusable"))
      .filter(el => !el.hidden && el.getClientRects().length > 0 && !el.disabled);
  }
  function nav(step) {
    const nodes = focusable();
    if (!nodes.length) return;
    const current = nodes.indexOf(document.activeElement);
    nodes[(current + step + nodes.length) % nodes.length].focus();
  }

  $("newPairBtn").addEventListener("click", startPairing);
  $("demoBtn").addEventListener("click", () => openLink(sample).catch(e => report(e.message)));
  $("returnBtn").addEventListener("click", () => { stopMedia(); showHome(); });
  $("backBtn").addEventListener("click", () => seek(-10));
  $("forwardBtn").addEventListener("click", () => seek(10));
  els.play.addEventListener("click", togglePlay);
  els.direct.addEventListener("click", () => {
    if (mode !== "direct" && activeUrl && confirm("Open this site directly? You will leave Visor Cinema and lose pairing controls.")) {
      window.location.assign(activeUrl);
    }
  });
  els.video.addEventListener("play", () => { playing = true; els.play.textContent = "Ⅱ Pause"; mediaReport("Playing direct video."); });
  els.video.addEventListener("pause", () => { playing = false; els.play.textContent = "▶ Play"; });
  els.video.addEventListener("ended", () => { playing = false; els.play.textContent = "↻ Replay"; mediaReport("Video ended."); });
  els.video.addEventListener("error", () => mediaReport("Cannot decode this video on the glasses. Try a small H.264 MP4."));
  document.addEventListener("keydown", e => {
    if (["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown", "Escape", "Backspace", "Enter", " "].includes(e.key)) {
      if (e.key === "Escape" || e.key === "Backspace") { if (!els.stage.hidden) { stopMedia(); showHome(); } e.preventDefault(); }
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); nav(-1); }
      else if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); nav(1); }
      else if (e.key === " " && !els.stage.hidden) { e.preventDefault(); togglePlay(); }
      else if (e.key === "Enter") {
        if (document.activeElement && document.activeElement.classList.contains("focusable")) {
          e.preventDefault(); document.activeElement.click();
        }
      }
    }
  });
  window.addEventListener("pagehide", () => { clearTimeout(timer); ++roomEpoch; stopMedia(); });
  startPairing();
})();