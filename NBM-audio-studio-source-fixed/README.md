# NBM Audio Studio

A Bengali-first audiobook workspace with exactly two production workflows:

1. Bengali text → Bengali speech.
2. English/Urdu source → Bengali translation → user review and approval → Bengali speech.

The existing Next.js App Router, React, TypeScript, interface, and workflow structure are preserved. Gemini calls run only on the server through Google's official `@google/genai` SDK. No API key is required to start the UI; without a configured and manually selected API, the relevant workflow reports **NOT CONNECTED** and does not fake a successful response.

## Requirements

- Node.js 20.16 or newer and npm.
- A Google Gemini API key and Google Cloud Project ID for each configuration you want to use.
- Network access for Gemini calls and scanned-PDF OCR language data.
- FFmpeg for MP3 conversion and merged-book exports. `ffmpeg-static` is used when available.

Install packages and create the local environment file:

```sh
npm install
Copy-Item .env.example .env.local
```

Generate two independent secrets. Paste the results into `.env.local`; do not commit that file or put either value in a `NEXT_PUBLIC_*` variable:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

- Put the 64-character hexadecimal value in `NBM_VAULT_ENCRYPTION_KEY`.
- Put the base64url value in `NBM_ADMIN_TOKEN`.
- Keep an offline backup of the encryption key. Losing it makes the encrypted API vault unreadable.

Start the app:

```sh
npm run dev
```

Open **API Manager**, enter `NBM_ADMIN_TOKEN`, add an API configuration, and separately select it for translation and/or Bengali TTS. The key is sent to a protected same-origin route, encrypted with AES-256-GCM, and stored under `NBM_DATA_DIR`. The UI receives only a masked key. A manual connection test calls the selected model's metadata endpoint; it does not generate translation or audio and is not a Bengali pronunciation test.

## Gemini configuration

The defaults are `gemini-3.5-flash-lite` for translation and `gemini-3.8-flash-tts` for TTS. Both model fields can be changed in API Manager. Verify access for your project with the manual connection tests. TTS submits the Bengali transcript as text and requests WAV audio. The candidate prebuilt voices are Puck, Kore, Zephyr, Charon, and Fenrir. They are **not marked as Bengali-quality verified**; listen to representative Bengali passages before choosing one for a book.

Translation output is segmented and cached on the server. For translation projects, the Bengali text remains editable and audio stays blocked until the user explicitly reviews and approves the exact text. That approval is signed server-side and checked against the exact text used for every TTS segment. Editing the translation invalidates the approval.

## API management and usage controls

- API configurations can be added, edited, enabled, disabled, tested, and deleted.
- Translation and TTS use separate manual selectors. A request only uses that service's selected configuration.
- There is no rotation, automatic fallback, account distribution, or API selection change after an error. A disabled or failed selected configuration stops that workflow.
- Default safety limits are 1 request/minute, 10 requests/hour, 10 requests/day per service, one concurrent request, 60 seconds between uncached provider calls, and 1,800 characters per chunk. Limits are application-side controls, not Google's quota claims.
- Provider HTTP 429 / `RESOURCE_EXHAUSTED` errors retry only the same pending chunk on the currently selected API, starting after 10 seconds and using exponential backoff (capped at 5 minutes, or longer when Google supplies `Retry-After`). The SDK itself is configured for one attempt. The server's minimum-delay guard is still honored between provider calls.
- Application concurrency and per-minute/hour/day caps stop the job and wait for the user to resume or change a setting manually. No API rotation, fallback, or automatic API selection occurs.
- Duplicate concurrent requests are blocked. Successful translation and TTS outputs are cached by service, text, model, project, voice, language, and generated-output settings as relevant.
- Large jobs show character and request counts plus an approximate paid-tier cost range for supported model IDs. These estimates use estimated token counts, not provider billing. Unknown models show that a reliable estimate is unavailable. Check the live [Gemini pricing page](https://ai.google.dev/gemini-api/docs/pricing) before authorizing costly work.
- The usage panel reports this app's request, completion, failure, and character counts for a rolling 24-hour period. Provider token/billing data is not currently returned by the selected API responses.

Current documented defaults and estimates are based on Google's [Gemini 3.5 Flash-Lite model](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite), [Gemini 3.8 Flash TTS model](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash-tts), [TTS guide](https://ai.google.dev/gemini-api/docs/speech-generation), and [pricing](https://ai.google.dev/gemini-api/docs/pricing). Pricing, access, voices, model support, and quotas can change. The app does not claim a provider connection until an actual metadata request succeeds.

## Long documents, PDF, and audio

- TXT and PDF can be imported in either workflow. Native PDF text is extracted page by page. Pages without a text layer are rasterized and sent to Bengali, English, or Urdu Tesseract OCR according to workflow/language. OCR is best-effort; an unreadable page aborts the import with its page number, so content is never silently skipped. OCR language data is downloaded by Tesseract.js when first needed.
- PDF page counts and text offsets are retained in project metadata. Page text order is preserved. Chapter headings remain ordinary source text; internal request chunks do not create chapters.
- Current local import limits are 200 MB and 25 million characters. Documents are split at paragraph and sentence boundaries where possible, with a word-boundary fallback. Default API chunks are at most 1,800 characters; the API Manager limit can be changed.
- Each completed translation or audio chunk is saved to browser IndexedDB. Translation and audio generation resume by skipping complete chunks and retrying only incomplete/failed ones after an explicit user action.
- Audio is generated sequentially with the selected voice. The player advances through segments in order and supports pause, seek, volume, speed, and individual segment playback/download. Complete-book WAV merging and MP3 conversion use FFmpeg. Selected speed is applied to playback and exported files.
- There is no music, ambience, or sound effects.

Large-job cost estimates are approximate and use current published paid-tier prices for the built-in model IDs. They do not know a project's free tier, negotiated pricing, tokenization, or final narration duration. Review the amount and request count before confirming.

## Storage and security notes

- API keys are encrypted at rest in `.nbm-data/api-vault.json` (or `NBM_DATA_DIR`) and never returned by API Manager endpoints. The admin token is required for management endpoints. Secrets are not written to logs by this app.
- Generated audio, translation cache, and the application usage ledger live under `NBM_DATA_DIR`. Back up this folder and the encryption key together.
- Project text, translation, approval proof, and chunk progress are stored in the user's browser IndexedDB, with localStorage compatibility for older work. Browser data clearing removes projects. There is no sign-in, cloud project database, or multi-device project sync.
- The usage ledger and concurrent-request guard are local to a single Node.js process/data directory. Run one application instance for strict cross-request enforcement; multi-instance deployments need a shared transactional database/lock service before production.
- PostgreSQL/Drizzle scaffolding is retained from the prototype but is not used by these features; there is no database migration to run for this release.
- Protect the app with HTTPS and a trusted network boundary if it is exposed beyond the local machine. The admin token is a single-operator control, not multi-user authentication.

## Checks

```sh
npm run typecheck
npm run lint
npm run build
```

The Playwright suite can be run with:

```sh
npx playwright install chromium
npm run test:e2e
```

The suite starts a local app with test-only secrets and an isolated data directory. It checks ordered chunking, the workflow approval gate, protected manager responses, TXT/PDF imports, WAV/MP3 endpoints, and mobile layout. It does not call Gemini. End-to-end provider tests require valid manually selected Gemini configurations and incur provider requests subject to the configured limits. No credentials are included in the source bundle. A missing credential or selected configuration must result in **NOT CONNECTED**, not a simulated success.

## Known limitations

- Live Gemini translation/TTS, model access, Bengali pronunciation, and Google account quota behavior cannot be confirmed until you add credentials and make provider requests.
- OCR quality depends on scan clarity, fonts, language data, and available memory; review every imported page.
- The local server storage and rate guard are designed for a single-instance installation. They are not a multi-user or horizontally scaled job system.
- Provider usage/billing fields are not available in the current integration responses; the displayed counts are app-side only.
- A long book may take hours or days under the conservative request interval and per-hour/day limits. The app pauses at configured limits and waits for manual resume.
