---
title: Marketplace Reviews
status: dropped
dropped: "Not pursuing — app distribution/marketplace ambition cut per _IDEAS/reprioritze.md §4 (concentration cutline, 2026-06-29)."
priority: P3
milestone: post-mvp
source: brainstorm session 2026-04-11
dependencies: [marketplace-app-publishing, telemetry-foundation]
---

# Marketplace Reviews

> **Deferred 2026-04-14.** Part of the marketplace / apps-distribution vision, which has no active plan after the pivot to 100% free Community Edition. Kept in the backlog pending future product direction.

## Description

Star ratings and text reviews are table stakes for any marketplace. What makes
ainative's review system distinctive is **verified-usage weighting**: ratings
from users who actually installed the app and ran its schedules for 7+ days
count double in the weighted average. This eliminates drive-by reviews and
rewards creators whose apps deliver sustained value.

V1 keeps the scope tight: submit a rating + text, display on the detail page,
and let creators respond. No editing, no upvoting, no complex threading.

## User Story

As a ainative user, I want to see honest ratings from people who actually used
an app before I install it, so I can trust the marketplace signal and avoid
apps that look good on paper but fail in practice.

As an app creator, I want to respond to reviews and see verified-usage ratings
weighted higher, so the feedback loop rewards quality and discourages
uninformed drive-by ratings.

## Technical Approach

### 1. Review Data Model

Supabase `app_reviews` table:

```sql
CREATE TABLE app_reviews (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL REFERENCES app_packages(app_id),
  user_id TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  text TEXT,                          -- optional review text
  verified_install BOOLEAN NOT NULL DEFAULT false,
  install_duration_days INTEGER,      -- days between install and review
  flagged BOOLEAN NOT NULL DEFAULT false,
  flagged_reason TEXT,
  creator_response TEXT,              -- one response per review
  creator_response_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(app_id, user_id)            -- one review per user per app
);
```

### 2. Verified-Usage Detection

When a user submits a review, the system checks:

1. Does the user have an `app_instances` row for this app with
   `status = 'installed'` or `status = 'disabled'`?
2. If yes, compute `install_duration_days` as days between `installed_at`
   and now.
3. Set `verified_install = true` if the app is/was installed.

The 7-day threshold for 2x weighting is applied at rating calculation time,
not at submission time — so early reviewers still get verified status, they
just get normal (1x) weight until they pass the 7-day mark.

### 3. Weighted Rating Algorithm

```ts
function computeWeightedRating(reviews: AppReview[]): number {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const review of reviews) {
    // Base weight
    let weight = 1;

    // 2x for verified users with 7+ days of usage
    if (review.verifiedInstall && (review.installDurationDays ?? 0) >= 7) {
      weight = 2;
    }

    weightedSum += review.rating * weight;
    totalWeight += weight;
  }

  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}
```

The weighted average is recalculated and cached on `app_packages.average_rating`
whenever a new review is submitted. The marketplace listing shows this
pre-computed value.

### 4. Review Submission

**UI:** Review form on the app detail page (below the description section):

- Star selector (1-5, required)
- Text area (optional, max 1000 chars)
- "Verified User" badge shown if the user has the app installed
- Submit button

**API:** `POST /api/marketplace/apps/[id]/reviews`

Request:
```json
{
  "rating": 4,
  "text": "Great for tracking crypto positions. Could use better charting."
}
```

Processing:
1. Check user hasn't already reviewed this app (UNIQUE constraint)
2. Check verified install status from `app_instances`
3. Insert review
4. Recalculate weighted average on `app_packages`
5. Return created review

### 5. Review Display

On the app detail page, below the description:

**Rating summary:**
```
★ 4.3 (42 ratings)
■■■■■ 5 ★  18
■■■■░ 4 ★  12
■■■░░ 3 ★   7
■░░░░ 2 ★   3
░░░░░ 1 ★   2
```

**Review list:**
- Sorted by: Most helpful (verified + recent) | Newest | Highest | Lowest
- Each review shows:
  - Star rating
  - User name (or "Anonymous")
  - "Verified User — 45 days" badge (if verified)
  - Review text
  - Date
  - Creator response (if any), indented below

**Marketplace card:**
- Shows average rating + review count: `★ 4.3 (42)`
- Hidden if fewer than 5 ratings (prevents gaming with few reviews)

### 6. Moderation Queue

Reviews can be flagged by any user (button on each review). Flagged reviews:
- Set `flagged = true` with a `flagged_reason`
- Hidden from public display until reviewed
- V1: admin reviews in Supabase dashboard
- Future: dedicated moderation UI

Auto-flag triggers (optional V1):
- Review text contains known offensive patterns
- User submitted 5+ reviews in 1 hour (spam detection)

### 7. Creator Response

Creators can respond to any review once:

**UI:** "Respond" button on each review (visible only to the app creator).
Opens an inline text area.

**API:** `POST /api/marketplace/apps/[id]/reviews/[reviewId]/respond`

```json
{ "response": "Thanks for the feedback! Charting is on the roadmap." }
```

Only the app creator can respond. One response per review (no back-and-forth).

### 8. API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/marketplace/apps/[id]/reviews` | GET | List reviews for an app |
| `/api/marketplace/apps/[id]/reviews` | POST | Submit a review |
| `/api/marketplace/apps/[id]/reviews/[rid]/respond` | POST | Creator response |
| `/api/marketplace/apps/[id]/reviews/[rid]/flag` | POST | Flag a review |

## Acceptance Criteria

- [ ] Users can submit a 1-5 star rating with optional text review.
- [ ] One review per user per app (UNIQUE constraint enforced).
- [ ] Verified-install badge shown for users who have the app installed.
- [ ] Weighted average gives 2x weight to verified users with 7+ days usage.
- [ ] Average rating cached on `app_packages` and displayed on marketplace cards.
- [ ] Rating hidden on cards when fewer than 5 reviews exist.
- [ ] Review list on detail page with sort options (helpful/newest/highest/lowest).
- [ ] Creator can respond to reviews (one response per review).
- [ ] Flag button hides review from public display.
- [ ] Rating distribution bar chart shown on detail page.

## Scope Boundaries

**Included:**
- Star rating submission with optional text
- Verified-usage weighting (2x for 7+ day users)
- Review display on detail page and rating on cards
- Creator response (one per review)
- Flag/moderation flow (admin review in Supabase for V1)
- Weighted average caching

**Excluded:**
- Editing reviews after submission
- Upvoting/downvoting reviews
- Review threading (only one creator response)
- Dedicated moderation UI (V1 uses Supabase dashboard)
- Review import from external sources
- Machine learning spam detection (V1 uses simple heuristics)

## References

- Source: brainstorm session 2026-04-11, plan §6d
- Related: `marketplace-app-publishing` (app_packages table),
  `marketplace-app-listing` (display ratings on cards and detail page),
  `creator-portal` (rating data in analytics),
  `telemetry-foundation` (usage data for verified status)
- Files to create:
  - `src/app/api/marketplace/apps/[id]/reviews/route.ts`
  - `src/app/api/marketplace/apps/[id]/reviews/[rid]/respond/route.ts`
  - `src/app/api/marketplace/apps/[id]/reviews/[rid]/flag/route.ts`
  - `src/components/marketplace/review-form.tsx`
  - `src/components/marketplace/review-list.tsx`
  - `src/components/marketplace/rating-summary.tsx`
- Files to modify:
  - `src/app/marketplace/apps/[id]/page.tsx` — add reviews section
  - `src/components/marketplace/app-card.tsx` — display rating
  - `src/lib/marketplace/marketplace-client.ts` — add review methods
