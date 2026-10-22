import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { webcrypto } from "node:crypto";
import { TextDecoder, TextEncoder } from "node:util";

const posts = new Map();
let counter = 0;
const fetchMock = async (raw, init = {}) => {
  const url = new URL(raw);
  const topic = url.pathname.split("/").filter(Boolean)[0];
  if (init.method === "POST") {
    if (!posts.has(topic)) posts.set(topic, []);
    posts.get(topic).push({
      id: "m" + String(++counter), time: Math.floor(Date.now() / 1000),
      event: "message", topic, message: init.body
    });
    return { ok: true, status: 200, text: async () => "" };
  }
  const result = (posts.get(topic) || []).map(v => JSON.stringify(v)).join("\n");
  return { ok: true, status: 200, text: async () => result };
};
const browser = {
  crypto: webcrypto, TextEncoder, TextDecoder, URL, fetch: fetchMock,
  atob, btoa, AbortController, setTimeout, clearTimeout, console
};
browser.window = browser;
runInNewContext(readFileSync("relay.js", "utf8"), browser, { filename: "relay.js" });
const api = browser.VisorRelay;

assert.equal(api.codeNew().length, 12);
assert.match(api.codeDisplay("ABCDEFGHJKLM"), /^.{4}-.{4}-.{4}$/);
assert.throws(() => api.codeNormalize("too short"), /twelve-character/);
assert.equal(api.validUrl("https://example.com/path.mp4"), "https://example.com/path.mp4");
assert.throws(() => api.validUrl("http://example.com/x"), /HTTPS/);
assert.throws(() => api.validUrl("javascript:alert(1)"), /HTTPS/);
const code = api.codeNew();
const glasses = await api.Room.open(code);
const phone = await api.Room.open(code);
const received = [];
await phone.send("hello", { device: "phone" });
await glasses.read(msg => received.push(msg));
assert.equal(received.length, 1);
assert.equal(received[0].kind, "hello");
await glasses.send("ready", { device: "glasses" });
const acknowledgements = [];
await phone.read(msg => acknowledgements.push(msg));
assert.equal(acknowledgements.some(x => x.kind === "ready"), true);
const link = "https://example.com/film.mp4?token=private";
await phone.send("link", link);
const packet = [...posts.values()][0].at(-1).message;
assert.equal(packet.includes(link), false, "relay must not receive plaintext URLs");
const updates = [];
await glasses.read(msg => updates.push(msg));
assert.equal(updates.some(x => x.kind === "link" && x.value === link), true);
assert.equal(new Set([...posts.keys()]).size, 1);
console.log("Encrypted pairing, acknowledgements, link delivery and HTTPS validation passed.");
