# SmartAdvisors

A UTA course recommendation and degree planning app. Upload your transcript, choose your major, set preferences, and get personalized professor and course recommendations — or sign in with Google to generate a full semester-by-semester degree plan.

## Supported Majors
- Computer Science and Engineering (CSE)
- Civil Engineering (CE)
- Electrical Engineering (EE)
- Mechanical/Aerospace Engineering (MAE)
- Industrial Engineering (IE)

---

## Project Structure

```
SmartAdvisors/
├── client/                          # React/TypeScript frontend (Vite)
│   ├── src/
│   │   ├── main.tsx                 # Entry point — wraps app in GoogleOAuthProvider
│   │   ├── App.tsx                  # Main app orchestrator (step flow + auth state)
│   │   └── components/
│   │       ├── WelcomePage.tsx       # Landing page (guest vs. sign in)
│   │       ├── LoginPage.tsx         # Google Sign-In + guest option
│   │       ├── DisclaimerModal.tsx   # Disclaimer shown on first load
│   │       ├── UploadScreen.tsx      # Transcript upload + major selection
│   │       ├── TranscriptReview.tsx  # Review parsed courses before continuing
│   │       ├── PreferenceForm.tsx    # Student preference toggles (guest flow)
│   │       ├── RecommendationDashboard.tsx  # Professor + course recommendations (guest)
│   │       ├── DegreePlanSetup.tsx   # Course picker + credit hours (signed-in flow)
│   │       └── SemesterPlanView.tsx  # Full semester-by-semester plan (signed-in flow)
│   ├── .env                         # Local only — NOT committed (see setup below)
│   ├── package.json
│   └── vite.config.ts
│
├── server/                          # Flask/Python backend
│   ├── run.py                       # Entry point — starts Flask on port 8000
│   ├── app/
│   │   ├── __init__.py              # Flask app factory
│   │   ├── routes.py                # API endpoints
│   │   ├── config.py                # Flask configuration
│   │   ├── models.py                # SQLAlchemy models (professors.db)
│   │   └── scripts/
│   │       ├── parse_transcript.py          # PDF transcript parser
│   │       ├── recommendation_engine.py     # Core algorithm
│   │       ├── load_degree_plan.py          # Loads CSV degree plans into classes.db
│   │       └── scrape_uta_catalog.py        # Tool to generate CSVs from UTA catalog
│   └── data/
│       ├── classes.db               # Degree plan tables (ClassesForCE, ClassesForCSE, etc.)
│       ├── grades.sqlite            # UTA grade distribution data
│       ├── professors.db            # RateMyProfessors data
│       └── *.csv                   # Degree plan CSVs (one per major)
│
├── requirements.txt                 # Python dependencies
└── .env.example                     # Template for environment variables
```

---

## Getting Started (Local Setup)

### Prerequisites
- **Git**
- **Node.js 18+** and npm
- **Python 3.10+**

### 1. Clone the Repo

```bash
git clone https://github.com/acmuta/SmartAdvisors.git
cd SmartAdvisors
```

### 2. Frontend Setup

```bash
cd client
npm install
```

Then create a file called `.env` inside the `client/` folder:

```
client/.env
```

Add this line to it (ask the team lead for the actual Client ID):

```
VITE_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
```

> **Note:** The `.env` file is gitignored and never committed. Each developer needs their own local copy. The Google OAuth Client ID is free — see `.env.example` for instructions on creating your own.

Then start the dev server:

```bash
npm run dev
```

Frontend runs at **http://localhost:5173**

### 3. Backend Setup

From the repo root or the `server/` directory:

```bash
cd server
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r ../requirements.txt
python3 run.py
```

Backend runs at **http://127.0.0.1:8000**

> **Note:** No backend `.env` file is needed for local development. Database paths are auto-detected.

---

## App Flow

```
WelcomePage
├── Continue as Guest → UploadScreen → TranscriptReview → PreferenceForm → RecommendationDashboard
└── Sign In (Google) → LoginPage → UploadScreen → TranscriptReview → DegreePlanSetup → SemesterPlanView
```

### Guest Mode
1. Upload transcript PDF
2. Select major
3. Review parsed courses
4. Set preferences (extra credit, clear grading, etc.)
5. Get recommended courses + ranked professors

### Signed-In Mode (Google)
1. Sign in with Google
2. Upload transcript PDF
3. Select major
4. Review parsed courses
5. Pick courses for next semester and set credit hour target
6. Get a full semester-by-semester degree plan to graduation

---

## How It Works

### Algorithm Overview
- Parses transcript PDF to extract completed courses
- Expands completed set with transitive prerequisites
- Filters degree plan to find courses with all prerequisites satisfied
- Looks up professors from grade distribution and RateMyProfessors data
- Scores professors based on student preferences (extra credit, difficulty, tags, etc.)

### Scoring Signals
- `quality_rating` — primary base score (0–5)
- `would_take_again` — strong trust signal, boosts/dampens base score
- `total_ratings` — confidence multiplier (fewer reviews = regress toward neutral)
- `difficulty_rating` — used when `clearGrading` preference is set
- `tags` — matched against actual RateMyProfessors tag strings

---

## Databases

All databases are included in the repo under `server/data/`. No external database setup needed.

| Database | Contents |
|---|---|
| `classes.db` | Degree plan tables for each major |
| `grades.sqlite` | UTA grade distribution data (course offerings, GPAs, instructor names) |
| `professors.db` | RateMyProfessors data (ratings, difficulty, tags) |

### Updating Degree Plans

```bash
cd server
source venv/bin/activate
python3 -c "from app.scripts.load_degree_plan import load_all; load_all()"
```

CSV format:
```
Formal Name,Course Name,Prerequisites,Corequisites,Requirement
CSE 1310,Introduction to Computers and Programming,[None],[None],required
CSE 4303,Computer Graphics,"CSE 3380, CSE 3318, MATH 3330",[None],elective
```

---

## API Endpoints

### POST `/api/parse-transcript`
Upload a transcript PDF to extract completed courses.

**Request:** `multipart/form-data` with `transcript` field (PDF file)

**Response:**
```json
{
  "success": true,
  "courses": ["CSE 1310", "CSE 1320", "MATH 1426"]
}
```

### POST `/api/recommendations`
Get course and professor recommendations (guest flow).

**Request:** `multipart/form-data`
- `completed_courses` — JSON array of course codes
- `department` — major code (CE, CSE, EE, MAE, IE)
- `preferences` — JSON object of preference flags

**Response:**
```json
{
  "success": true,
  "recommendations": [...],
  "electiveRecommendations": [...],
  "stats": {
    "totalRequiredCourses": 30,
    "completedRequiredCourses": 12,
    "totalElectiveSlots": 7,
    "remainingElectiveSlots": 7
  }
}
```

### POST `/api/degree-plan`
Generate a full semester-by-semester degree plan (signed-in flow).

**Request:** `application/json`
```json
{
  "completed_courses": ["CSE 1310", "CSE 1320"],
  "department": "CSE",
  "credits_per_semester": 15,
  "selected_next_semester": ["CSE 2312", "CSE 2315"]
}
```

**Response:**
```json
{
  "success": true,
  "plan": [...],
  "totalSemesters": 6,
  "totalRemainingHours": 78,
  "eligibleCourses": [...],
  "stats": {
    "totalCourses": 45,
    "completedCourses": 12,
    "totalHours": 130,
    "completedHours": 38
  }
}
```

---

## Google Sign-In Setup (for contributors)

Google Sign-In uses `@react-oauth/google`. The Client ID is free and requires no billing.

To create your own Client ID for local development:
1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a project → APIs & Services → OAuth consent screen → External
3. APIs & Services → Credentials → Create OAuth Client ID → Web application
4. Add `http://localhost:5173` to Authorized JavaScript Origins
5. Copy the Client ID into `client/.env` as `VITE_GOOGLE_CLIENT_ID=...`

---

## Repo Conventions

### Commits
Use Conventional Commits:
- `feat(ui): add dark mode toggle`
- `fix(api): handle null user_id on login`
- `docs(readme): clarify quickstart`

### Pull Requests
- Small, focused PRs preferred
- Link issues with `Fixes #123`
- Include testing steps and screenshots for UI changes

### Secrets
- Never commit `.env` files or credentials
- Keep `.env.example` updated when adding new env vars

---

## Status & Links
- **Phase:** In Development
- **Communication:** Discord #smart-advisors
- **Open issues:** Use repo Issues tab

## Maintainers
- Kanishkar Manoj ([@kanishkarmanoj](https://github.com/kanishkarmanoj))
- Directors / Contacts: Tobi and Prajit Viswanadha — DM on Discord
