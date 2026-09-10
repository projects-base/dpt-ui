# Daily Problem Dynamic Tracker 🚀

A premium SaaS platform designed for **MAANG Preparation and coding mastery**. This application tracks coding problem progress across platforms, analyzes code quality using Gemini AI, scales data storage through Supabase, and connects seamlessly into developer workflows via a companion Chrome Extension.

---

## 🎨 UI & UX Design Language
- **Theme**: Premium Dark-Mode Glassmorphism (`#0f172a` Slate base with glowing indigo/purple accents).
- **Layout**: Modern **Left Sidebar SaaS Application**. Scalable layout to accommodate future learning components without cluttering space.
- **Micro-Animations**: Extensive hover effects, glowing rings, loading spinners, and dynamic layout transitions to maintain a fast, responsive feeling.
- **Dashboards**: Fully reactive statistical widgets, visual coding pathways, user-controlled system design workspaces.

---

## 🏗 Technology Stack

### Frontend (User Interface)
- **Core Engine**: Vanilla HTML, CSS, JavaScript (No heavy frameworks, highly optimized for speed).
- **Design Strategy**: Custom CSS Design Tokens, Flexbox/Grid-based component structure.
- **Extension Syncing**: Companion Chrome Extension written in Manifest v3 that natively syncs DOM content to the SaaS platform.
- **AI Integration**: Google Gemini 2.5 Flash API explicitly queried for Big-O analysis and readability reviews directly from browser input.
- **Authorization**: OAuth 2.0 via Google Identity Services (`g_id_onload`) bridging session states between the extension and web.
- **Deployment**: Configured for **Netlify** using static distribution rules with SPA-fallback routing (`netlify.toml`).

### Backend (API Service)
- **Framework**: Spring Boot 4.0.5 (Java 21).
- **Database**: PostgreSQL hosted on **Supabase**. Connected via IPv4 Pooling to ensure stable, active connections bypassing typical IPv6 latency issues.
- **Data Access**: Spring Data JPA + Hibernate.
- **Security**: Stateless architecture using Spring Security OAuth2 Resource Server to validate JWTs (Google ID tokens) and explicitly check audiences/issuers.
- **Deployment**: Multi-stage **Docker** containerization using Alpine Java 21, designed for fully automated CI/CD onto **Render**.

---

## 🌎 Architecture & Cloud Deployment

### 1. The Frontend (Netlify)
The frontend operates seamlessly as a static bundle hosted globally on Netlify's Edge infrastructure. All user sessions rely purely on signed Google JWTs securely stored in `sessionStorage`. 
On startup, `js/config.js` intelligently points fetching mechanisms to either local development (`http://localhost:8080`) or the production Render endpoint context, ensuring zero deployment friction.

### 2. The Backend Container (Render)
A `Dockerfile` maps the Spring application into a minimal Alpine footprint environment. Render hosts it securely exposing port 8080.
**Environment Variable injection**:
- `DATABASE_URL`: Injected database connections preventing hardcoded credentials.
- `CORS_ALLOWED_ORIGINS`: Limits communication exclusively to the Netlify domain and Chrome Extension footprint.
- `GOOGLE_CLIENT_ID`: Ensures valid token audiences.

### 3. The Data Layer (Supabase)
Relies on Supabase’s Postgres service. We use Transaction Pooling to rapidly accommodate backend connection requests triggered by extension rapid-fires and web traffic. All entity syncing utilizes seamless upserts.

---

## 🔐 Publishing & Google OAuth Verification

Google reviews the OAuth consent screen before the extension can be published to
users outside your test list, and it checks that this site, the consent screen and
the store listing all present the **same app name** and link a privacy policy on
**this** domain.

See **[OAUTH_VERIFICATION.md](OAUTH_VERIFICATION.md)** for the full checklist, the
scope justifications to paste into the form, and the list of things that cause a
rejection.

The app name lives in exactly one place — `APP.name` in [`js/config.js`](js/config.js) —
and is stamped into every page via `data-app-name`. Do not hardcode it in HTML.

## 💡 Future Roadmap & Expansion Placeholders
1. **LeetCode & HackerRank Portals**: Automated cron-job integrations to pull real-time platform statistics via API into our unified tracking view.
2. **System Design Masterclasses & Whiteboards**: Custom HTML Canvas saving technical architecture diagrams directly onto your profile.
3. **DSA Roadmaps**: Visual completion trees defining structured learning cycles matching MAANG frequency maps.
