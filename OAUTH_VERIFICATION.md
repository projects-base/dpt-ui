# Google OAuth Verification — what Google is asking for, and what is already done

When you publish a Chrome extension that signs users in with Google, Google reviews the
OAuth consent screen before it will let anyone outside your test-user list sign in. The
reviewer's core check is **branding consistency**: the app name, the homepage, and the
extension listing must obviously be the same product, run by the same person.

That is what "we need the extension name in the service UI" means. The reviewer opens the
**Application home page** URL from your consent screen and expects to find:

1. the same app name as the consent screen,
2. a plain description of what the app does,
3. an explicit mention of the Chrome extension that uses this OAuth client,
4. a working link to a privacy policy **on the same domain**.

A homepage that says "Daily Problem Tracker" while the consent screen says "Daily Problem
Dynamic Tracker", or a `Privacy Policy` link pointing at `#`, is a rejection.

---

## The canonical name

> **Daily Problem Dynamic Tracker**

This exact string, character for character, must appear in all five places listed below.
In this repo it is defined once, in [`js/config.js`](js/config.js) as `APP.name`, and
stamped into every page through `data-app-name`. Change it there, not in the HTML.

| # | Where | Value | Status |
|---|-------|-------|--------|
| 1 | `Daily-Problem-Tracker-Extension/manifest.json` → `name` | Daily Problem Dynamic Tracker | ✅ already correct |
| 2 | `Daily-Problem-Tracker-Web/js/config.js` → `APP.name` | Daily Problem Dynamic Tracker | ✅ set |
| 3 | Google Cloud Console → OAuth consent screen → **App name** | Daily Problem Dynamic Tracker | ⬜ **you must set this** |
| 4 | Chrome Web Store listing title | Daily Problem Dynamic Tracker | ⬜ **you must set this** |
| 5 | The homepage and legal pages | Daily Problem Dynamic Tracker | ✅ rendered from `APP.name` |

The same applies to the **logo**: use the identical icon on the consent screen, the store
listing, and the site favicon.

---

## What has been added to this site

| File | Why the reviewer needs it |
|------|---------------------------|
| `index.html` → `#about` section | Names the app, explains what it does, and has a dedicated **"The Chrome extension"** card naming the extension and linking to its store listing. This is the specific thing Google asked for. |
| `privacy.html` | A real privacy policy page on this domain. Lists every OAuth scope and why it is requested, and includes the **Limited Use** statement Google requires. |
| `terms.html` | Terms of Service. Not strictly required, but the consent screen has a field for it and filling it in helps. |
| Footer on every page | Persistent Privacy Policy / Terms / Support links, as reviewers look for these. |
| `netlify.toml` | Ensures `/privacy.html` and `/terms.html` are served as real pages and are not swallowed by the SPA fallback redirect. |

Previously `index.html` had `<a href="#">Privacy Policy</a>` — a link that went nowhere.
That alone would have failed the review.

---

## Before you submit — do these in order

### 1. Deploy the site and fill in the domain

Deploy to Netlify, then set the real origin in **one place**:

```js
// Daily-Problem-Tracker-Web/js/config.js
siteUrl: 'https://your-real-site.netlify.app',
```

Then confirm both of these load in a private window, with no sign-in:

- `https://your-real-site.netlify.app/`
- `https://your-real-site.netlify.app/privacy.html`

### 2. Verify domain ownership

Google will not accept a homepage on a domain you have not verified.

1. Open [Google Search Console](https://search.google.com/search-console) and add the site.
2. Verify it — for Netlify, the DNS TXT record or the HTML file method both work.
3. Use **the same Google account that owns the Cloud project**. This trips people up: if
   the Cloud project and the Search Console property are under different accounts, the
   consent screen will keep rejecting the URL.

> A `*.netlify.app` subdomain can be verified, but a custom domain you own looks
> considerably more legitimate to a reviewer. If you have one, use it.

### 3. Fill in the OAuth consent screen

Google Cloud Console → **APIs & Services → OAuth consent screen**:

| Field | Value |
|-------|-------|
| App name | `Daily Problem Dynamic Tracker` |
| User support email | your email |
| App logo | the same 128×128 icon as the Web Store listing |
| Application home page | `https://your-real-site.netlify.app/` |
| Application privacy policy link | `https://your-real-site.netlify.app/privacy.html` |
| Application terms of service link | `https://your-real-site.netlify.app/terms.html` |
| Authorized domains | `netlify.app` (or your custom domain) |
| Developer contact information | your email |

### 3b. Authorized JavaScript origins — why the account chooser may not appear

**If clicking "Sign in with Google" does nothing, or never lets you pick between
accounts, this is almost always the cause.**

Google Identity Services will only run on an origin you have registered against the
**Web application** OAuth client. The match is exact — **scheme, host _and_ port**:

- `http://localhost` ≠ `http://localhost:3000` ≠ `http://localhost:4173`
- `http://` ≠ `https://`
- `https://your-site.netlify.app` ≠ `https://www.your-site.netlify.app`

An unregistered origin fails quietly. GSI still renders the button normally — nothing
looks wrong until you click it, at which point the popup either never opens or closes
immediately, and the console shows:

```
[GSI_LOGGER]: The given origin is not allowed for the given client ID
```

**How to check which origins are actually registered.** There is no reliable way to probe
this from the page — the button renders identically either way. Two options:

1. **Read it from the console (authoritative, 10 seconds).** Cloud Console → APIs &
   Services → Credentials → your **Web application** client. The list is right there.
2. **Click the button and watch the console.** Open DevTools, click *Sign in with Google*,
   and look for the `GSI_LOGGER` line above. Its absence means the origin is fine.

Google Cloud Console → **APIs & Services → Credentials** → click your **Web application**
OAuth 2.0 Client ID → **Authorized JavaScript origins** → add every origin you will serve
this site from:

| Origin | When you need it |
|--------|------------------|
| `http://localhost:3000` | `npx serve .` default |
| `http://localhost:4173` | `python -m http.server 4173` |
| `http://localhost:8888` | `netlify dev` default |
| `https://your-site.netlify.app` | production |
| `https://your-custom-domain.com` | if you add a custom domain |

Add whichever local port you actually use — if you are unsure, open the site and read the
origin the page logs to the console on load (`[Auth] This page origin is …`).

> **Authorized JavaScript origins** must have no path and no trailing slash.
> **Authorized redirect URIs** are a *separate* list and are not used by GSI's popup
> flow — leave them as they are.

Changes can take a few minutes to propagate. Do a hard reload (Ctrl+Shift+R) afterwards.

**If the origin is registered and you still get no chooser**, check in order:

1. **Third-party cookies.** GSI needs them to see your Google sessions. Chrome →
   Settings → Privacy → Third-party cookies → allow for `accounts.google.com`. Test in a
   normal window, not Incognito.
2. **Only one account signed in.** The chooser shows the accounts signed into that
   browser profile. Add the second account at
   [accounts.google.com](https://accounts.google.com) first.
3. **Test-user list.** While the consent screen is in Testing mode, an account that is not
   on the test-user list gets `403: access_denied` — sometimes as an instantly-closing
   popup rather than a visible error. See the bottom of this document.
4. **Sticky account.** Signing out of the dashboard now calls
   `google.accounts.id.disableAutoSelect()`, so the chooser reappears next time. If you
   are still bounced into one account, clear site data for the dashboard origin.

### 4. Justify each scope

The scope justification box is where most submissions get sent back. Be specific about the
user-visible feature each scope powers — never "needed for the app to work".

| Scope | Justification to paste |
|-------|------------------------|
| `userinfo.email` | Identifies the signed-in user so their logged problems, notes and settings are associated with their own account and stay in sync between the Chrome extension and the web dashboard. |
| `documents` | Creates a formatted Google Doc containing the user's own solution and its AI analysis, one per problem they log. The app only writes documents it creates. |
| `spreadsheets` | Appends one row per solved problem to the tracking spreadsheet the user nominates in Settings, and creates the progress chart in it. |
| `drive.file` | Creates a "Daily Coding Practice" folder in the user's Drive and files the generated Docs into it. Per-file scope: the app can only access files it created itself. |

Note explicitly that you use **`drive.file` rather than the broad `drive` scope** — using the
narrowest scope is exactly what reviewers want to see, and it may keep you out of the
restricted-scope review track entirely.

### 5. Record a demo video

Required for verification. It must show, in one unbroken take:

1. The URL bar showing your verified homepage.
2. Clicking sign-in and the **OAuth consent screen itself** — the app name shown there must
   visibly match the homepage.
3. Granting consent.
4. Each granted scope actually being used: a Doc being created, the Sheet row appearing,
   the dashboard updating.

Upload it unlisted to YouTube and paste the link into the submission form.

### 6. Publish the store listing, then link it back

Once the extension is live, put its URL into `js/config.js`:

```js
webStoreUrl: 'https://chromewebstore.google.com/detail/<your-extension-id>',
```

The homepage "View on the Chrome Web Store" link is deliberately inert until you do this —
a dead link is worse than a greyed-out one. Redeploy afterwards.

---

## Things that will get you rejected

- **Name mismatch.** The single most common cause. Check all five places in the table above.
- **Privacy policy not on the homepage domain.** A GitHub or Notion link will be rejected —
  hence `privacy.html` living here.
- **Homepage does not mention the extension.** Fixed by the About section.
- **Homepage behind a login.** `index.html` is publicly reachable; keep it that way.
- **Domain not verified by the Cloud project's owning account.** See step 2.
- **Vague scope justifications.** Use the wording in step 4.

---

## While still in Testing mode

Until verification completes, only accounts on the test-user list can sign in. Anyone else
gets `403: access_denied`.

Google Cloud Console → OAuth consent screen → **Test users** → **+ Add users**, then add the
email address. Up to 100.

## Your project's actual values

Derived from `manifest.json` (its `key` field pins the extension ID, so this is
the same whether loaded unpacked or installed from the Web Store):

| Thing | Value |
|-------|-------|
| Extension ID | `niphoknpfhfafkbhanfagggpdhfcnmnd` |
| Redirect URI for non-Chrome browsers | `https://niphoknpfhfafkbhanfagggpdhfcnmnd.chromiumapp.org/` |
| Client ID in manifest (working tree) | `683627191123-5551q39di0quqsd7p3oj1nt6oodlajfe...` |
| Client ID in manifest (committed) | `683627191123-e99trpcgdjfqtu8l43sjks2aqi4na6ib...` |

The **Chrome Extension** OAuth client must be registered against extension ID
`niphoknpfhfafkbhanfagggpdhfcnmnd`. If the client you created lists a different
Item ID, `chrome.identity.getAuthToken()` will fail no matter what else is right.

## Related

- Backend client ID: `DailyProblemTracker-Service` → `GOOGLE_CLIENT_ID` env var
- Extension client ID: `manifest.json` → `oauth2.client_id`
- Web client ID: `js/config.js` → `GOOGLE_CLIENT_ID`

All three currently hold the **same** ID: `683627191123-5551q39di0quqsd7p3oj1nt6oodlajfe`.

> ⚠️ **Check this before you submit.** The extension's `manifest.json` has an uncommitted
> change swapping its client ID:
>
> ```diff
> - "client_id": "683627191123-e99trpcgdjfqtu8l43sjks2aqi4na6ib..."   # committed
> + "client_id": "683627191123-5551q39di0quqsd7p3oj1nt6oodlajfe..."   # working tree
> ```
>
> `683627191123-e99trpc…` looks like the **Chrome Extension** type client, and
> `683627191123-5551q39…` is the one the website uses, i.e. a **Web application** client.
>
> `chrome.identity.getAuthToken()` requires a **Chrome Extension** type client, registered
> against the extension's own Item ID. If the manifest now points at the Web application
> client, in-extension sign-in on Chrome can fail — often as a popup that opens and
> immediately closes, with no useful error. That is worth ruling out before blaming
> authorized origins.
>
> Confirm each ID's type in Cloud Console → Credentials (the **Type** column), and put the
> Chrome Extension one back in `manifest.json` if that is what it is. Note the backend
> validates the *web* ID token's audience against `GOOGLE_CLIENT_ID` — the extension's sync
> path does not check an audience at all, so the two IDs being different is fine.

That works today because the backend validates the audience of the web dashboard's ID token
against `GOOGLE_CLIENT_ID`, and the extension's sync path validates its access token by
calling Google's UserInfo endpoint instead of checking an audience.

Worth knowing before you change anything here: Google normally expects a **Chrome Extension**
client type for `chrome.identity.getAuthToken()` and a **Web application** client type for
Google Identity Services on a website. If you ever split these into two client IDs, the
backend must accept both audiences — otherwise the dashboard starts returning
`401 invalid_token` while the extension keeps working, which is a confusing failure to debug.
