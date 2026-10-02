# Shortify – URL Shortener

A simple URL shortener built as a college DBMS mini project, migrated to PostgreSQL for serverless deployment.

---

## Project Objective

To build a beginner-friendly URL shortener that converts long URLs into short, shareable links. This version uses PostgreSQL to support serverless deployments on platforms like Vercel.

---

## Features

- Paste any long URL and get a short 6-character link
- Redirects short links to the original URL
- Copy the shortened URL with one click
- Basic error handling (empty URL, invalid URL, not found)
- Simple, attractive, responsive UI
- Serverless-compatible database architecture

---

## Technologies Used

| Layer      | Technology          |
|------------|---------------------|
| Frontend   | HTML, CSS, JavaScript |
| Backend    | Node.js + Express.js |
| Database   | PostgreSQL (via pg) |
| Hosting    | Vercel (Frontend + Backend) |
| DB Hosting | Neon (PostgreSQL) |

---

## Project Structure

```
url-shortener/
├── server.js         ← Backend (Express server + API routes + Vercel export)
├── package.json      ← Project metadata and dependencies (express, pg)
├── vercel.json       ← Vercel deployment configuration
├── public/
│   ├── index.html    ← Frontend page
│   ├── style.css     ← Styles
│   └── script.js     ← Frontend logic
└── README.md
```

---

## How It Works

1. User enters a long URL on the homepage.
2. The frontend sends a **POST /shorten** request to the backend.
3. The backend generates a random **6-character short code** (e.g., `aB72xK`).
4. The short code and original URL are saved in **PostgreSQL**.
5. The short URL (e.g., `https://your-vercel-domain.vercel.app/aB72xK`) is returned and displayed.
6. When someone visits that short URL, the backend looks up the code and **redirects** them to the original URL.

---

## Database Structure

**Table: `urls`**

| Column       | Type    | Description                        |
|--------------|---------|------------------------------------|
| id           | SERIAL  | Auto-incrementing primary key      |
| original_url | TEXT    | The full original URL              |
| short_code   | TEXT    | The 6-character unique short code  |
| created_at   | TEXT    | Timestamp of when it was created   |

**Table: `clicks`**

| Column     | Type    | Description                         |
|------------|---------|-------------------------------------|
| id         | SERIAL  | Auto-incrementing primary key       |
| short_code | TEXT    | The short code that was clicked     |
| ip_address | TEXT    | Visitor's IP address                |
| user_agent | TEXT    | Full User-Agent string              |
| referrer   | TEXT    | HTTP Referer header (or NULL)       |
| clicked_at | TEXT    | ISO timestamp of the click          |

*Note: The application automatically creates these tables on startup if they do not exist.*

---

## Local Development

### 1. Prerequisites
- **Node.js** installed
- **PostgreSQL** database (Local or Neon)

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Variables
You MUST provide a `DATABASE_URL` environment variable pointing to your PostgreSQL instance.

Linux/macOS:
```bash
export DATABASE_URL="postgresql://user:password@localhost:5432/shortify"
```

Windows (PowerShell):
```powershell
$env:DATABASE_URL="postgresql://user:password@localhost:5432/shortify"
```

### 4. Run Locally
```bash
node server.js
```
Open your browser and go to: **http://localhost:3000**

---

## Deployment (Vercel + Neon)

This project is configured to be deployed completely free using Vercel (for the Express app) and Neon (for the PostgreSQL database).

### 1. Creating a Neon Database
1. Go to [Neon.tech](https://neon.tech/) and create a free account.
2. Create a new project and database.
3. Copy the **PostgreSQL Connection String**. It will look something like this:
   `postgresql://neondb_owner:xxxxxx@ep-cool-butterfly-xxxxxx.us-east-2.aws.neon.tech/neondb?sslmode=require`

### 2. GitHub Deployment
1. Initialize a Git repository and push this project to GitHub.
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/your-username/your-repo.git
   git push -u origin main
   ```
2. **IMPORTANT**: Do NOT commit any `.env` file containing your `DATABASE_URL` to GitHub.

### 3. Vercel Deployment & Environment Variables
1. Go to [Vercel.com](https://vercel.com/) and create a new project.
2. Import your GitHub repository.
3. **Environment Variables Configuration**: Before clicking Deploy, open the "Environment Variables" section.
   - Key: `DATABASE_URL`
   - Value: Paste your Neon connection string here.
4. Click **Deploy**. Vercel will automatically read the `vercel.json` file and set up your Express serverless functions.

### 4. Testing the Production URL
Once deployed, Vercel will provide you with a production domain (e.g., `https://shortify-app.vercel.app`).
- Visit the URL.
- Test shortening a link.
- Click the link to test the redirect and analytics functionality.

---

## Visitor Analytics

Shortify records basic anonymous information whenever a shortened link is opened, including:

- **IP address** (stored in DB; shown as masked e.g. `103.xxx.xxx.xxx` in the UI)
- **Browser / device** (parsed from the HTTP User-Agent header)
- **Referrer** (the page that linked to the short URL, or "Direct" if none)
- **Click time** (ISO timestamp)

This information is stored in the `clicks` PostgreSQL table and is used **only for basic link analytics**. No personal identification is attempted.

---

## Viva Quick Reference

| Question | Answer |
|----------|--------|
| What DB do you use? | PostgreSQL (specifically Neon for cloud hosting) |
| Why PostgreSQL instead of SQLite? | Vercel uses ephemeral serverless functions. A local SQLite file would be deleted after every request. We need an external cloud database. |
| Where is data stored? | Two tables in PostgreSQL: `urls` and `clicks` |
| How is the short code made? | 6 random chars from a-z, A-Z, 0-9 |
| How does redirect work? | `GET /:shortCode` → DB lookup → `res.redirect()` |
| What API does frontend call? | `POST /shorten` and `GET /stats/:shortCode` |
| How is clipboard handled? | Browser's `navigator.clipboard.writeText()` API |
| How do you track clicks? | The Express redirect route records basic request info in the `clicks` table before redirecting the visitor |
| What information do you collect? | IP address, User-Agent, referrer, short code, and click time |
| How do you identify the browser? | The browser and OS are determined from the HTTP User-Agent header using simple string matching |
| Why is the IP masked in the UI? | Full IPs are stored in the DB for the project, but shown as `103.xxx.xxx.xxx` in the frontend to protect basic privacy |

---

*Made with ❤️ as a college DBMS mini project.*
