# Master Prompt: Hifz Institution ERP (Institution OS)

## 1. System Overview

Build a multi-portal ERP for a Hifz (Quran Memorization) Institution using **Next.js 16**, **Tailwind CSS**, and **Supabase (PostgreSQL)**. The system must support Admin, Principal, Vice Principal, School Controller, Staff (Usthad), and Parent roles.

## 2. Core Constraints & Logic

* **ID System:** Student IDs must be auto-generated in the format `R000` (e.g., R001, R165).
* **Attendance Rule:** Usthads can edit attendance for their assigned students for up to **7 days** only. After 7 days, the record is locked for everyone except Admin/Principal.
* **Study Modes:** 1. **New Verses:** Record by Surah Name + Verse Range (Start to End). Support multiple entries per day (e.g., finishing one Surah and starting another).
2. **Recent Revision:** Tracking the last 5-10 pages studied.
3. **Juz Revision:** Tracking by Juz, Half-Juz, or Quarter-Juz (Q1, Q2, Q3, Q4).
* **Progress Calculation:** * **Primary Metric:** Completion % = `(Total Completed Juz / 30) * 100`.
* A Juz is "Complete" only when the final verse of that Juz is recorded in 'New Verses' mode.


* **Class Schedule:** Default classes are Subh, Breakfast, and Lunch. Admin/Principal can toggle which classes are active for specific Batches/Standards daily.

## 3. Database Schema Requirements

* **Students Table:** Name, Adm No (Primary Key), Photo, DOB (auto-calculate Age), Address, Parent Info (Father/Mother Name, Phone, Email), Aadhar, Batch Year, School Standard.
* **Staff Table:** Name, Photo, Email (Login), Password (Admin-assigned), Role.
* **Hifz_Logs Table:** `student_id`, `usthad_id`, `entry_date`, `session_type` (Subh/BF/Lunch), `mode`, `surah_name`, `start_v`, `end_v`, `rating` (1-5).
* **Attendance Table:** `student_id`, `date`, `session`, `status` (Present/Absent/Leave).
* **Leave Table:** `student_id`, `type` (Institutional/Medical-In/Medical-Out/Exam/Individual), `exit_timestamp`, `return_timestamp`, `recorded_by`.

## 4. Portal Features

* **Admin:** Full RBAC management. Can assign students to Usthads.
* **Principal/VP:** Edit permissions for student/staff details and Hifz logs.
* **School Controller:** Entry/View for School Subject marks.
* **Staff (Usthad):** Daily recording UI. Quick-entry for attendance and Hifz.
* **Parents:** View-only dashboard. Multi-child support (toggle between children). View progress charts (Week/Month/Year).

## 5. UI/UX Style

* **Theme:** Elegant, modern, and minimal.
* **Palette:** Emerald Green (#064e3b), Clean White, and Slate Gray.
* **Components:** Use Shadcn/UI. Use a "Global Command Bar" for Admin actions.

## 6. Development Instructions for Antigravity Agent

1. **Phase 1:** Setup Supabase schema with Row Level Security (RLS) to ensure Parents can only see their children.
2. **Phase 2:** Build the `quran_map.json` utility to define Juz boundaries and the progress calculation logic.
3. **Phase 3:** Create the Login system (no signup). Default Admin login should be pre-seeded.
4. **Phase 4:** Develop the Usthad "Daily Entry" mobile-responsive view.
5. **Phase 5:** Build the Parent Progress Dashboard with Juz-completion rings.
