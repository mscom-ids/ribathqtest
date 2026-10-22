# Hifz points — current rules

## The two targets

- **S** = the student's scheduled Hifz sessions in the month, minus applicable cancellations. Unconfirmed sessions stay in this target.
- **D** = Hifz point-days: a date with 2 or more non-cancelled sessions counts as 1 day; a date with 1 session counts as 0.75 day. No session counts as 0. A saved manual month setting can override D.

Monthly scores use the full month's target, even early in the month. Custom-date student reports use their selected period. Actual attendance is counted only through the report's end date. Different periods can therefore give different scores.

## Students still memorizing

| Component | Calculation | Maximum |
|---|---|---|
| New Hifz | Exact Mushaf pages recited ÷ (D × 0.9) × 30 | 30 |
| Recent Revision | Distinct revision dates ÷ (D × 0.7) × 20 | 20 |
| Juz Revision | Juz revised ÷ (eligible point-days × 0.5) × applicable Juz maximum | Up to 20 |
| Attendance | (Present sessions + 0.5 × Late sessions) ÷ S × 30 | 30 |

Each component stops at its maximum. Totals are rounded to 2 decimal places.

Juz Revision becomes applicable **the day after the first Juz is completed**. Before that the base maximum is 80, not 100. In the transition month, the Juz maximum is prorated by eligible Hifz point-days, now out of 20 rather than 15. Once fully applicable, the base maximum is 100. No conversion to a percentage is applied to non-Hafiz grades, even when Juz is N/A or prorated.

## Extra New Hifz bonus — non-Hafiz only

- First reach the New Hifz page target (D × 0.9), Recent Revision at least 18/20, and Juz Revision at least 90% of its applicable maximum.
- Juz must be applicable. An N/A Juz component does not satisfy this condition.
- Bonus = extra pages beyond the New Hifz target ÷ that target × 30, capped at 20 points. This is the same per-page rate used for base New Hifz.
- It is **not a flat +20**. With D = 20 the target is 18 pages and each extra page earns 30 ÷ 18 = 1.6667 points: 1 extra page gives 1.67, 2 gives 3.33, 3 gives 5, and 12 gives the capped 20.
- Extra Recent or Juz Revision does not earn extra points. If either revision threshold is not reached, extra pages earn no bonus, however many pages were recited.
- Total = base components + bonus, at most 120. For an 18-page target, 21 pages earns 30 base New Hifz + 5 bonus, if eligible. With all other components full, that is 105 points and grade O.
- At exactly 90% revision results, the base total may be below 100; bonus is added to the actual base, not to an assumed 100.

## Juz portions and Juz Clear

- Full Juz = 1; half = 0.5; quarter = 0.25.
- Recent Revision **Juz Clear** earns one revision-day credit plus the portion's Juz credit. Multiple entries on the same date still give only one recent-day credit.
- Example with D = 20 and Juz fully applicable: recent day = 20 ÷ 14 = 1.43; half Juz = 0.5 ÷ 10 × 20 = 1; combined = **2.43**.

## Students who have completed all 30 Juz

| Component | Calculation | Maximum |
|---|---|---|
| New Revision | New Juz revised ÷ (D × 0.3) × 40 | 40 |
| Old Revision | Old Juz revised ÷ (D × 0.75) × 30 | 30 |
| Attendance | (Present sessions + 0.5 × Late sessions) ÷ S × 30 | 30 |

Base total = 100. Stage is evaluated at the start of the month/selected report period.

**Hafiz bonus:** both New and Old monthly targets must be fully completed first. Then extra New Juz earns 40 ÷ (D × 0.3) per Juz, and extra Old Juz earns 30 ÷ (D × 0.75) per Juz. Add both excess contributions and cap the **combined bonus at 20**. Incomplete Old cannot be compensated for by extra New, or vice versa. Attendance is not a bonus-unlock condition.

Example D = 20: New target = 6 Juz, Old target = 15 Juz. After both are complete:

- Extra New: full = 6.67 points, half = 3.33, quarter = 1.67.
- Extra Old: full = 2 points, half = 1, quarter = 0.50.
- Extra half New + quarter Old = 3.83 bonus, not +20. With full attendance, total = 103.83 and grade O.
- Total never exceeds 120. No bonus if either revision target is incomplete, even if its rounded display appears full.

## Attendance labels versus attendance points

- Present: attended, full attendance credit.
- Late: attended, but only half attendance credit; shown separately.
- Absent / Outside / Leave: no attendance credit.
- Unconfirmed: not yet recorded, **not proof of absence**; zero credit until marked and remains in S.
- Cancelled: removed from the target.

The attendance table's rate is (Present + Late) ÷ scheduled non-cancelled sessions. The **attendance score rate** uses Present + half of Late. These rates intentionally differ when someone is late.

## Points, grades and the October screenshot

The leaderboard and monthly report now show **actual earned points**. Previously, percentage × 0.7 rescaled a 55-point student's 0.33 into approximately 0.42, while a 70-point student's score stayed 0.33. That rescaling has been removed.

Both stages use earned points directly: **O (Outstanding) above 100**, A++ from 95 through 100, A+ ≥90, A ≥80, B+ ≥70, B ≥60, C+ ≥50, C ≥40, D+ ≥35; below 35 is NO GRADE. Grades are recalculated from live performance, including eligible bonus, rather than a stored manual grade override. No conversion from a 70-point scale is used.

Equal attendance earns equal points when the session target is equal. Legitimate differences in cancellations or schedule membership can still change a student's target. Manual monthly display overrides are separate from live-log performance calculations.
