# Beam — brand & creator matching (Express + MySQL)

```
Browser (frontend/)  ──fetch──▶  Express API (backend/)  ──mysql2 pool──▶  MySQL
```

| Folder      | What it is |
|-------------|------------|
| `frontend/` | Your existing Beam UI (`index.html`, `script.js`, `style.css`, `images/`). It only talks to the API — no database details live here. |
| `backend/`  | Node.js + Express API, MySQL connection pool, SQL schema, seed script. **All database credentials live in `backend/.env`.** |

## Setup (about 5 minutes)

**Requirements:** Node.js 18+ and MySQL 5.7+ / 8.x (or MariaDB 10.4+, e.g. XAMPP).

**1. Create the database and tables**

```bash
mysql -u YOUR_MYSQL_USER -p < backend/sql/schema.sql
```
(or open `backend/sql/schema.sql` in MySQL Workbench / phpMyAdmin and run it). This creates a database called `beam`.

**2. Enter your MySQL details — `backend/.env`**

```
DB_HOST=localhost
DB_PORT=3306
DB_USER=your_mysql_username     <- change
DB_PASSWORD=your_mysql_password <- change
DB_NAME=beam
JWT_SECRET=                     <- REQUIRED: paste a random 32+ char string
```
Generate a secret with:
`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

**3. Install and run**

```bash
cd backend
npm install
npm run seed     # optional: loads the sample brands/creators/campaigns as real MySQL rows
npm start
```
Open **http://localhost:3000**. Demo logins after seeding (password `demo1234`):
`meera@pixelforge.gg` (brand) · `harshak@beam.co` (creator). Or just sign up.

`npm run seed -- --reset` wipes all rows and re-seeds. Plain `npm run seed` refuses to touch a database that already has users.

## API

All routes are under `/api`. Everything except signup/login/health needs `Authorization: Bearer <token>`.
Brands and creators only ever see/modify their own data (checked on the server).

| Method | Route | Who | Purpose |
|---|---|---|---|
| GET | `/health` | anyone | API + DB check |
| POST | `/auth/signup`, `/auth/login` | anyone | create account / log in → `{ token, user }` |
| GET | `/auth/me` | any | current user |
| GET | `/bootstrap` | any | everything the UI needs, scoped to the user |
| GET / POST | `/campaigns` | any / brand | list / create |
| GET / PUT / DELETE | `/campaigns/:id` | any / owner brand | read / edit or open-close / delete |
| POST | `/campaigns/:id/invites` | owner brand | invite a creator (notification) |
| GET / POST | `/applications` | any / creator | list / pitch |
| GET / PUT / DELETE | `/applications/:id` | party / brand / creator | read with history / change status / withdraw |
| GET | `/influencers`, `/influencers/:id` | brand (or self) | creators |
| PUT | `/influencers/me` | creator | edit own profile |
| GET | `/brands`, `/brands/:id` | any | brands |
| PUT | `/brands/me` | brand | edit own profile |
| GET / PUT | `/notifications`, `/notifications/read-all`, `/notifications/:id/read` | any | notifications |

## Notes 
- **Security:** every query is parameterized; passwords are bcrypt-hashed; SQL/stack details are logged server-side only, never sent to the browser. `.env` is git-ignored.
- **Frontend hosted separately?** Set `API_BASE` at the top of `frontend/script.js` to the full API URL and add the frontend's origin to `CORS_ORIGIN` in `backend/.env`.
- The login token is kept in the browser's `localStorage`. For production, serve over HTTPS and consider adding login rate-limiting.
