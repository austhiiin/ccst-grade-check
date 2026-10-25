# Student Grade Portal

A web portal where students enter their **Student ID number** to view their **Midterm** and **Final** grades, and where an admin uploads the instructor's Excel Rating Sheet to publish them.

**Stack:** React + TypeScript (Vite) · Tailwind CSS · Supabase (Postgres, Auth, RLS, RPC)

---

## 1. Verified Input File Format

Verified against `Rating_Sheet_2026-2027_BSCPE-1B.xlsx` (DLSP FORM No. XIII, Rating Sheet).

| Item | Finding |
|---|---|
| Sheets | 1 sheet: `Rating Sheet` |
| Class metadata | Free-text labels in header cells (see below) |
| Student table header | Rows 10–11 (two-row merged header) |
| Student rows | Rows 12–25 (14 students), numbered in column A |
| Footer | Row 26 onward (certification, signatures, notes), **not** student data |
| Grade scale | Columns J–L, rows 10–22 (reference table, **not** student data) |
| Current grades | `MID-TERM` and `FINAL` are **empty** in this file (grades not yet encoded) |
| Sheet dimension | Declared as `A1:L989`, but real data ends at row 25 |

### Column map (student rows)

| Column | Content | Example |
|---|---|---|
| A | Row number | `1` |
| C | Name (`SURNAME, FIRST MIDDLE`, uppercase; merged B:C) | `BENITEZ, MARCH THEA DIMAYUGA` |
| D | **Student No.** (text, `YY-NNNNN`), the lookup key | `26-47798` |
| E | Program, Year & Section | `BSCPE-1B` |
| F | Midterm grade | *(empty)* |
| G | Final grade | *(empty)* |
| H | Remarks | *(empty)* |

### Metadata cells (parsed by label, not fixed position)

| Cell | Content |
|---|---|
| A6 | `Instructor : MR. JOHN AUSTHIN F. SABATER` |
| E6 / G6 | `Sem : FIRST` / `AY : 2026-2027` |
| A7 | `Course Code : CPE112` |
| E7 / G7 | `Days : TUE, THU` / `Time : ...` |
| A8 | `Course Title : PROGRAMMING LOGIC AND DESIGN` |

### Grade scale (cols J–L)

`98-100 → 1.00 Excellent`, `95-97 → 1.25`, `92-94 → 1.50`, `89-91 → 1.75`, `86-88 → 2.00`, `83-85 → 2.25`, `80-82 → 2.50`, `77-79 → 2.75`, `75-76 → 3.00 Passing`, `70-74 → 4.00 Incomplete`, `below 70 → 5.00 Failed`, plus the codes `UW` (Unofficially Withdrawn) and `AW` (Officially Withdrawn).

### Data quirks the parser must handle

- **Student numbers are text** in the format `YY-NNNNN` (7 digits plus a hyphen). Never convert them to numbers, or leading zeros are lost (e.g. `22-08475`, `21-03724`).
- **Students from different cohorts** share the sheet (`21-`, `22-`, `25-`, `26-`), so don't assume the prefix matches the section.
- **Grades can be non-numeric**: besides `1.00`–`5.00`, values such as `UW`, `AW`, `INC` may appear. Store grades as **text**.
- **Empty grade cells** must display as "Not yet available", not `0` or blank.
- **Numeric grades may arrive as numbers or strings** (`1.5` vs `'1.50'`); normalize to 2 decimals.
- **Trailing whitespace** in names (e.g. `'ISIP, KATHLYN ELISSE '`) and non-ASCII letters (`PADEÑO`). Names are display-only now, so just trim them.
- **Layout may shift between files** (more or fewer students, different subject). Locate rows by label, never by hard-coded row numbers.

---

## 2. Features

### Student side (`/`)
- Single input: **Student ID** (e.g. `26-47798`).
- Input is forgiving: `2647798`, `26 47798`, `26–47798` (en dash) and surrounding spaces all work. Only the 7 digits are compared.
- Shows, per subject: course code and title, instructor, semester and AY, Midterm, Final, Remarks.
- A student enrolled in several uploaded classes sees all of them.
- Shows "Not yet available" for empty or unpublished grades.
- If the ID isn't found, show a generic message ("No grades found for that ID").

### Admin side (`/admin`)
- Supabase Auth login (email and password); only users in the `admins` table get access.
- Upload `.xlsx`. The file is parsed **in the browser** and a **preview** is shown: class metadata, student count, and warnings (missing or malformed student no., duplicate student no., invalid grade).
- Confirm to save. Re-uploading the same class (same course code, semester, AY, and section) **updates** existing rows, so you can upload the midterm file first and the finals file later.
- Per-class **publish toggle** for Midterm and Final, so grades stay hidden until you release them.
- Class list with student counts, last updated time, delete, and an **Edit students** page for saved
  student numbers, names, program/section, grades, and remarks.

---

## 3. Architecture

```
Excel (.xlsx)
   │  upload (admin, browser)
   ▼
SheetJS parser ──► preview + validation ──► Supabase (RLS: admin only writes)
                                                  │
Student enters ID ──► Edge Function (rate limit + CAPTCHA) ──► rpc('lookup_grades')
                                                  │
                                      only that student's published rows
```

- **Students never read tables directly.** RLS blocks all `anon` access. They go through one `SECURITY DEFINER` RPC function that returns only the matched student's published grades.
- **Admins** write through normal Supabase client calls, authorized by RLS (`admins` table).

### Suggested structure

```
src/
  lib/
    supabase.ts            # client
    parseRatingSheet.ts    # xlsx → { classInfo, students[], warnings[] }
    studentNo.ts           # normalizeStudentNo(), mirrors SQL
  pages/
    StudentLookup.tsx
    admin/
      Login.tsx
      Dashboard.tsx
      UploadPreview.tsx
  components/
    GradeCard.tsx
    ProtectedRoute.tsx
  types/index.ts
supabase/
  migrations/20261025203311_init.sql
  functions/lookup/index.ts   # optional Edge Function wrapper
```

---

## 4. Database

The executable schema, row-level security policies, grants, and `lookup_grades` RPC live in
[the Supabase migration](./supabase/migrations/20261025203311_init.sql). It creates:

- `admins`, which maps Supabase Auth users permitted to administer the portal.
- `classes`, which stores course metadata and per-term publish controls.
- `grades`, which stores student numbers as text and grades as text (including `UW`, `AW`, and
  `INC`).
- `lookup_grades(text)`, the only anonymous read path. It accepts exactly seven digits after
  removing non-digits and returns grades only according to each class's publish controls.

Anonymous table access is revoked and RLS restricts normal table operations to admins. Apply the
migration to your Supabase project before running the app.

---

## 5. Excel Parsing Rules (`parseRatingSheet.ts`)

Use [SheetJS](https://sheetjs.com/) (`xlsx`) with `cellDates: false`, `raw: false`.

1. **Metadata:** scan the top ~10 rows for labels `Instructor :`, `Sem :`, `AY :`, `Course Code :`, `Course Title :` and take the text after the colon (trimmed).
2. **Find the header row:** the row whose cells contain `NAME OF STUDENTS`. Student data begins after the two-row header.
3. **Read student rows** while column A is a number. Missing student numbers are reported as warnings and skipped during import; stop at the first non-student row.
4. **Column detection:** locate columns by header text (`Student No.`, `Program`, `MID-TERM`, `FINAL`, `REMARKS`) rather than letter; the name is in the merged B:C area.
5. **Student No.:** read as text, trim, and validate against `^\d{2}-\d{5}$`. Anything else becomes a warning (the row is still importable if its digits make 7).
6. **Names:** trim and collapse whitespace; stored for display only.
7. **Grades:** empty → `null`. Number → format to 2 decimals. Text such as `UW`, `AW`, `INC` → uppercase string. Anything else → warning.
8. **Section:** take the most common value of the `Program / Yr. & Sec` column (here `BSCPE-1B`).
9. **Ignore** the grade scale in J–L and everything after the student rows.
10. **Validation warnings:** missing student no., malformed student no., duplicate student no. within the file, grade outside `1.00–5.00` and the known codes.

---

## 6. Setup

```bash
# 1. Scaffold
npm create vite@latest grade-portal -- --template react-ts
cd grade-portal
npm install @supabase/supabase-js react-router-dom xlsx
npm install -D tailwindcss @tailwindcss/vite

# 2. Environment (copy .env.example to .env.local and fill in the project values)
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key>

# 3. Database
#    Run supabase/migrations/20261025203311_init.sql in the Supabase SQL editor,
#    or apply it with the Supabase CLI.
#    Create your admin user in Authentication → Users, then:
#    insert into admins (user_id) values ('<that user uuid>');

# 4. Run
npm run dev
```

Tailwind v4 (Vite plugin): add `@import "tailwindcss";` to `src/index.css` and register `@tailwindcss/vite` in `vite.config.ts`.

> Only the Supabase publishable key belongs in this frontend config. Never put a
> **service_role/secret** key in a browser app.

---

## 7. Security and Privacy Notes

A student ID is a **better key than a name**: it's unique and needs no fuzzy matching. But it is still a **weak secret**. It's printed on class lists, follows a predictable `YY-NNNNN` pattern, and classmates may know each other's. The main new risk is **enumeration**: a script can try IDs one by one.

- [x] No direct table access for anonymous users (RLS); everything goes through one RPC.
- [x] Strict 7-digit check, so partial IDs return nothing.
- [x] Publish toggles so grades are hidden until released.
- [x] No endpoint lists students or classes to anonymous users.
- [ ] **Strongly recommended:** route lookups through a Supabase Edge Function with **CAPTCHA** (e.g. Cloudflare Turnstile) and **per-IP rate limiting** (e.g. 10 attempts per 15 minutes). Without this, anyone can script through IDs.
- [ ] **Recommended:** add a second factor that only the student knows (birthdate, or a PIN you hand out). Student ID alone only stops casual snooping.
- [ ] **Optional:** mask the displayed name (e.g. `B***** M. T. D.`) so someone who guesses a valid ID doesn't also learn who it belongs to.
- [ ] Grades are personal information under the Data Privacy Act of 2012 (RA 10173). Confirm with your school that publishing this way is permitted, and delete old classes when no longer needed.

---

## 8. Roadmap

1. Edge Function with CAPTCHA and rate limiting
2. Add parser unit tests using the sample file
3. Deploy (Vercel or Netlify for the frontend)
