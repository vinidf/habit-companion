# Habit Companion

Habit Companion is a gentle, mobile-first habit tracker built around consistency, flexible weekly goals, visual momentum, and small positive rewards.

## Frequency modes

- Every day: consecutive-day momentum.
- Set days: choose the weekdays that define the ideal week.
- Flexible week: choose a target such as 3 times per week without fixed days.
- Weekly habits can also have a lower minimum that keeps the habit active without counting the week as an ideal week.

## Rewards

Milestones use 1, 3, 7, 14, 30, 45, 60, 90, 120, 180, 270, 360, 500, 730, and 1000 successful units. Daily habits measure days; weekly habits measure successful weeks.

Completions also trigger brief encouragement and occasional small, health-conscious real-world reward suggestions.

## Data

Data is stored in IndexedDB on the device. The app includes JSON export and import for portable backups. A service worker keeps the app available offline after the first visit.

## GitHub Pages

The included GitHub Actions workflow deploys the repository as a static Pages site. In the repository settings, set Pages → Build and deployment → Source to GitHub Actions.

## Live app

https://vinidf.github.io/habit-companion/
