# Visor Cinema

Experimental glasses-native web player for **Meta Ray-Ban Display** with a separate phone link sender.

- **Glasses:** open `index.html` at the HTTPS Pages URL, read the one-time 12-character pairing code, and navigate with Neural Band directional/select events.
- **Phone:** open `phone.html`, enter the pairing code, paste a URL, and send it to the glasses.
- **Media:** native HTML5 `video` for direct MP4/WebM, YouTube/Vimeo iframe experiments, and an optional generic website iframe/direct-link fallback.
- **Privacy:** encrypted link messages via Web Crypto (AES-GCM, key derived with PBKDF2). Relay uses a *public third-party* ntfy.sh topic derived from the pairing code. Only ciphertext goes to the relay, but metadata such as timing and relay IP traffic are visible to the provider. The static source code and Pages site are public; your pasted URLs are not committed. This is a **prototype**, not a claim of absolute privacy.
- **No DRM bypass** or claim of universal video playback. A site's embedding/CSP/DRM rules may prevent playback.
- **Phone screen-off:** after a successfully delivered URL, the glasses app attempts playback independently. Browser/media lifecycle limits still apply.
- **No account, no tracker, no saved viewing history.** Pairing code is created using `crypto.getRandomValues`.

## Deploy

Workflow: `.github/workflows/pages.yml`. In GitHub repository **Settings → Pages → Build and deployment → GitHub Actions**, activate Pages if it is not already enabled. Repository is intentionally public for HTTPS hosting.

After deployment:

- Glasses app: `https://deepanshusharma-bnb.github.io/Visor-Cinema/`
- Phone companion: `https://deepanshusharma-bnb.github.io/Visor-Cinema/phone.html`

Add the glasses URL using **Meta AI → App connections → Web apps**. Use keyboard arrow keys and Enter on desktop to test focus navigation.

## Limitations

The pairing relay is public ntfy.sh and may be rate limited, intermittently unavailable, or blocked by the glasses browser. Some Meta firmware may not permit HTML5 video, iframe playback, autoplay, or crypto APIs. Start with the in-app demo MP4. An external service is necessary for cross-device link delivery; this build has no self-hosted server credentials.

The code intentionally refuses insecure fallback if Web Crypto is unavailable.

## Manual testing

Test on a desktop browser with two tabs, one glasses and one phone, using the same HTTPS origin. For glasses, verify controls with ArrowLeft/Right/Up/Down, Enter, and Escape. The first screen also has a **Test video** option that does not require pairing.
