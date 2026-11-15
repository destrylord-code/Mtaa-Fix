# MTAA Fix — Classroom Demo Guide (Windows 11)

This runs the **whole project on your laptop** for your teacher demo. No database
to install, no cloud accounts, no internet needed during the demo (except optional
map tiles). Everything is seeded with realistic Kisii County data automatically.

> **The short version:** install Node.js → `npm run setup` → `npm run demo` →
> open `http://localhost:3000`. That's it.

---

## 1. One-time install (do this before demo day)

### Step 1 — Install Node.js
1. Open **https://nodejs.org** in your browser.
2. Download the **LTS** version (the big green button). You need **Node 20.9 or newer**
   (Node 22 LTS is ideal).
3. Run the installer, click **Next** through all defaults, finish.
4. **Close and reopen VS Code** so it picks up Node.
5. Check it worked — in VS Code open **Terminal → New Terminal** and run:
   ```powershell
   node --version
   npm --version
   ```
   You should see version numbers (e.g. `v22.x.x`).

### Step 2 — Get the project onto your laptop
If you already have the project folder with all the latest fixes, skip this.
Otherwise, in the terminal, clone the **working branch** (this has all the fixes
and the demo launcher — the default `main` branch is the old code):
```powershell
cd $HOME\Documents
git clone --branch arena/967bb648-mtaa-fix https://github.com/destrylord-code/Mtaa-Fix.git
cd Mtaa-Fix
```
(If you don't have Git: on the GitHub page switch the branch dropdown to
`arena/967bb648-mtaa-fix`, then **Code → Download ZIP**, extract it, and `cd` into
the extracted folder instead.)

### Step 3 — Install all dependencies (one command)
From the project root folder:
```powershell
npm run setup
```
This installs everything for the backend and all three frontends. It takes a few
minutes the first time. **You only do this once.**

> If `npm run setup` complains, run these four commands one at a time instead:
> ```powershell
> npm install
> npm --prefix backend install
> npm --prefix citizen-frontend install
> npm --prefix admin-dashboard install
> npm --prefix government-frontend install
> ```

---

## 2. Start the demo (do this on demo day)

From the project root folder:
```powershell
npm run demo
```
Leave that terminal **running**. After ~20–30 seconds you'll see:
```
================ MTAA Fix demo data ready ================
  departments=7  categories=7  accounts=16  reports=16
  Password for EVERY account: TestPassword123!
```
Now open these in your browser (Chrome/Edge):

| App | Address | Who logs in |
|---|---|---|
| **Citizen portal** | http://localhost:3000 | Citizens report problems |
| **Admin dashboard** | http://localhost:3001 | Platform/county administrators |
| **Government portal** | http://localhost:3002 | Governor, officers, all 14 roles |

> **Tip:** open all three tabs before the teacher arrives so they're warm.
> To stop everything later, click the terminal and press **Ctrl + C**.

---

## 3. Login accounts (password for ALL is `TestPassword123!`)

Pick a few of these for your demo — you don't need all 16.

| Role | Email | Where to log in |
|---|---|---|
| Citizen | `citizen.alice@example.com` | localhost:3000 |
| **Governor** | `governor.kisii@example.com` | localhost:3002 |
| CECM (Infrastructure) | `cecm.infrastructure@example.com` | localhost:3002 |
| Field Officer | `field.officer.1@example.com` | localhost:3002 |
| Ward Admin | `ward.admin.bassicentral@example.com` | localhost:3002 |
| **Super Admin** | `admin.platform@example.com` | localhost:3001 |
| County Admin | `admin.county@example.com` | localhost:3001 |

The government portal auto-detects the role and shows the matching dashboard.

---

## 4. A 5-minute demo walkthrough (what to show the teacher)

Follow this order — it tells a complete story of the system.

**1. Citizen reports a problem (localhost:3000)**
- Log in as `citizen.alice@example.com`.
- Show the dashboard, then **create a new report** (e.g. a pothole), pick a
  category, attach a photo if you like, submit.
- Point out the **reference code** it generates and the status tracking.

**2. Government receives and manages it (localhost:3002)**
- Log in as `governor.kisii@example.com`.
- Show the **county overview**: total reports, resolution rate, escalations, the
  map, and the sub-county/department performance tables.
- Click through a few sidebar tabs (Reports, Assignments, Escalations,
  Departments, Wards) to show they all have real content.

**3. An officer works on it (localhost:3002)**
- Log in as `field.officer.1@example.com` (use a different browser or Incognito
  window so you can stay logged in as governor too).
- Show **assigned reports** and how a field officer updates work / status.

**4. Admin manages users (localhost:3001)**
- Log in as `admin.platform@example.com`.
- Show **user management**: the list of officers, create/edit/deactivate a user,
  role assignments.

**5. Wrap up — highlight the engineering**
- 14 distinct government roles, each with its own scoped dashboard.
- Role-based access control (a ward admin can't see another ward's data).
- Report lifecycle: submitted → assigned → in progress → resolved → verified.
- SLA tracking and automatic escalation of overdue reports.
- Secure authentication (JWT, hashed passwords, httpOnly cookies).

---

## 5. If something goes wrong

| Problem | Fix |
|---|---|
| `node`/`npm` not recognized | Reinstall Node.js (Step 1), then **reopen VS Code**. |
| "Port 3000/5000 already in use" | You started it twice. Press Ctrl+C in the old terminal, or restart your laptop, then `npm run demo` again. |
| A page won't load right after starting | Wait 20–30s — the frontends compile on first load. Refresh. |
| Login says "too many attempts" | The demo disables rate limits, so this shouldn't happen. If it does, restart `npm run demo`. |
| Map shows grey tiles | Map tiles need internet. The rest of the app works offline; just skip the map or connect to Wi-Fi. |
| Forgot the password | It's `TestPassword123!` for every account. |
| Data disappeared | The demo uses an in-memory store — restarting `npm run demo` re-seeds fresh data. This is expected and fine for a demo. |

**Emergency backup:** if your laptop acts up on the day, the same app is also
running in your Arena live preview (ports 3000/3001/3002). But the local demo is
the most reliable — practice it once beforehand.

---

## 6. Practice checklist (run through this once before demo day)

- [ ] `npm run setup` completed without errors.
- [ ] `npm run demo` shows "demo data ready".
- [ ] Logged in as a citizen, created a report.
- [ ] Logged in as governor, saw the county dashboard + map.
- [ ] Logged in as super admin, saw user management.
- [ ] Know the password: `TestPassword123!`.
- [ ] Know how to stop it (Ctrl+C) and restart (`npm run demo`).

Good luck — the project is complete and working. You've got this. 🎓
