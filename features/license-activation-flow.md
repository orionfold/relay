---
title: License Activation Flow
status: completed
priority: P1
layer: PLG Core
dependencies:
  - local-license-manager
  - stripe-billing-integration
  - subscription-management-ui
---

# License Activation Flow

> **Superseded by `community-edition-simplification` (2026-04-13).** This feature shipped but was later fully reverted when ainative pivoted to a 100% free Community Edition with no tiers, billing, or cloud dependency. Kept as historical record.

## Description

The end-to-end journey from purchase to premium features unlocked. Supports two activation paths that converge on the same result:

**Path A — In-app purchase (primary):** User clicks upgrade in `/settings/subscription` → Stripe Checkout → returns to app → `LicenseManager.validate()` finds the license by email → auto-activates. No license key needed.

**Path B — Marketing site purchase:** User pays on orionfold.com/relay → receives install email → runs `npx ainative` → signs in with Supabase Auth (same email) → `LicenseManager.validate()` finds the license → auto-activates. No license key needed.

**Path C — Manual key entry (fallback):** For edge cases where email matching fails, a license key input form exists in `/settings/subscription`. User enters key → validates against Supabase → activates.

The primary UX is **zero-friction email-based activation** — pay, sign in with the same email, done. The license key form is a safety net, not the primary flow.

## User Story

As a user who just upgraded via Stripe Checkout in the app, I want my premium features to unlock automatically when I return — no key entry, no extra steps.

As a user who purchased on orionfold.com/relay before installing, I want to sign in with my email and have my subscription recognized automatically.

As a user whose email matching failed, I want a fallback license key form so I can still activate manually.

## Technical Approach

### License Key Format

License keys follow a human-readable format with built-in checksum:

```
STAG-XXXX-XXXX-XXXX-XXXX
```

- Prefix: `STAG-` (identifies ainative keys)
- 16 alphanumeric characters in 4 groups (uppercase, no ambiguous chars like 0/O, 1/I/L)
- Last 4 characters are a CRC-16 checksum of the first 12
- Example: `STAG-A3BF-K7MN-P2QR-W9X4`

Client-side validation can reject malformed keys before hitting the API.

### Activation Form UI

Added to `src/components/settings/subscription-section.tsx` within the existing SubscriptionSection:

```tsx
{license.tier === 'community' && (
  <FormSectionCard title="Activate License" description="Enter a license key to unlock premium features">
    <form onSubmit={handleActivate} className="flex items-end gap-3">
      <div className="flex-1 space-y-2">
        <Label htmlFor="license-key">License Key</Label>
        <Input
          id="license-key"
          placeholder="STAG-XXXX-XXXX-XXXX-XXXX"
          value={licenseKey}
          onChange={(e) => setLicenseKey(formatLicenseKey(e.target.value))}
          className="font-mono tracking-wider"
          maxLength={24}
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      <Button type="submit" disabled={!isValidFormat || activating}>
        {activating ? (
          <>
            <Loader2 className="size-4 animate-spin mr-2" />
            Activating...
          </>
        ) : (
          'Activate'
        )}
      </Button>
    </form>

    {/* Error display */}
    {activationError && (
      <div className="mt-3 surface-card-muted rounded-lg border border-status-error/25 p-3 flex items-start gap-2">
        <XCircle className="size-4 text-status-error shrink-0 mt-0.5" />
        <p className="text-sm text-status-error">{activationError}</p>
      </div>
    )}
  </FormSectionCard>
)}
```

### Auto-Formatting

The `formatLicenseKey()` helper auto-inserts dashes as the user types and uppercases input:

```ts
function formatLicenseKey(raw: string): string {
  const clean = raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 20);
  const parts = ['STAG'];
  for (let i = 0; i < clean.length; i += 4) {
    if (i === 0 && clean.startsWith('STAG')) continue;
    parts.push(clean.slice(i, i + 4));
  }
  return parts.join('-');
}
```

### Client-Side Validation

Before hitting the API, validate:

1. **Format**: Matches `STAG-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}`
2. **Checksum**: Last 4 chars match CRC-16 of first 12 payload chars
3. **No ambiguous chars**: Rejects 0, O, 1, I, L (prevents typos)

```ts
function isValidFormat(key: string): boolean {
  return /^STAG-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(key);
}
```

### API Endpoint

`POST /api/license/activate`

```ts
export async function POST(request: Request) {
  const { key } = await request.json();

  // 1. Server-side format validation
  if (!isValidLicenseKey(key)) {
    return NextResponse.json(
      { error: 'Invalid license key format' },
      { status: 400 }
    );
  }

  // 2. Call license manager to activate
  try {
    const result = await licenseManager.activate(key);

    return NextResponse.json({
      success: true,
      tier: result.tier,
      expiresAt: result.expiresAt,
    });
  } catch (error) {
    if (error instanceof LicenseError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }
    throw error;
  }
}
```

### License Manager Activation

In `src/lib/license/manager.ts`, the `activate()` method:

```ts
async activate(key: string): Promise<ActivationResult> {
  // 1. Query Supabase for the license key record
  const { data: license, error } = await this.supabase
    .from('licenses')
    .select('*')
    .eq('key', key)
    .single();

  if (error || !license) {
    throw new LicenseError('invalid_key', 'License key not found', 404);
  }

  // 2. Check if already activated by another user
  if (license.activated_by && license.activated_by !== this.userId) {
    throw new LicenseError('already_used', 'This license key has already been activated', 409);
  }

  // 3. Check expiration
  if (license.expires_at && new Date(license.expires_at) < new Date()) {
    throw new LicenseError('expired', 'This license key has expired', 410);
  }

  // 4. Activate: update Supabase record
  await this.supabase
    .from('licenses')
    .update({
      activated_by: this.userId,
      activated_at: new Date().toISOString(),
      device_id: this.deviceId,
    })
    .eq('id', license.id);

  // 5. Update local license cache
  await this.updateLocalLicense({
    tier: license.tier,
    key: key,
    expiresAt: license.expires_at,
    activatedAt: new Date().toISOString(),
  });

  return {
    tier: license.tier,
    expiresAt: license.expires_at,
  };
}
```

### Error States

Specific error messages for each failure mode:

| Error Code | HTTP Status | User Message |
|-----------|-------------|-------------|
| `invalid_key` | 404 | "License key not found. Check for typos and try again." |
| `already_used` | 409 | "This license key has already been activated on another account." |
| `expired` | 410 | "This license key has expired. Please purchase a new subscription." |
| `format_error` | 400 | "Invalid license key format. Keys look like STAG-XXXX-XXXX-XXXX-XXXX." |
| `network_error` | 503 | "Unable to verify license. Check your internet connection and try again." |

Each error is displayed in the inline error banner below the input field (not a toast — errors need to persist while the user corrects the input).

### Success Flow

On successful activation:

1. **API returns** `{ success: true, tier: 'operator', expiresAt: '...' }`
2. **UI updates immediately**:
   - License key form disappears (tier is no longer 'community')
   - Tier badge in Current Plan section updates to new tier
   - Usage cards refresh with new limits
   - Upgrade CTAs across the app disappear on next render
3. **Toast notification**: `sonner.success('Welcome to Operator! Your premium features are now active.')`
4. **Page revalidation**: Call `router.refresh()` to trigger Server Component re-fetch of license status

```tsx
async function handleActivate(e: FormEvent) {
  e.preventDefault();
  setActivating(true);
  setActivationError(null);

  try {
    const res = await fetch('/api/license/activate', {
      method: 'POST',
      body: JSON.stringify({ key: licenseKey }),
    });

    const data = await res.json();

    if (!res.ok) {
      setActivationError(data.error);
      return;
    }

    toast.success(`Welcome to ${data.tier}!`, {
      description: 'Your premium features are now active.',
    });

    router.refresh();
  } catch {
    setActivationError('Unable to verify license. Check your internet connection.');
  } finally {
    setActivating(false);
  }
}
```

### Path A: In-App Purchase (Primary Flow)

When Stripe Checkout completes, it redirects to `/settings/subscription?success=true`:

```tsx
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  if (params.get('success') === 'true') {
    // Stripe purchase just completed — webhook already created license in Supabase
    // LicenseManager.validate() will find it by the user's Supabase Auth email
    fetch('/api/license/refresh', { method: 'POST' })
      .then(() => {
        toast.success('Purchase complete! Your subscription is now active.');
        router.replace('/settings/subscription');
        router.refresh();
      });
  }
}, []);
```

No license key needed — the Stripe webhook already created the license row in Supabase, linked to the user's email. The refresh call triggers `LicenseManager.validate()` which finds the license.

### Path B: Marketing Site Purchase

1. User pays on orionfold.com/relay via Stripe Payment Link
2. Stripe webhook creates license row in Supabase (linked to email)
3. User receives email: "Install `npx ainative` and sign in with this email"
4. User installs, opens app, goes to `/settings/subscription`
5. Sees "Sign in to activate" prompt (Supabase Auth with email/GitHub)
6. Signs in → `LicenseManager.validate()` finds license by email → auto-activates
7. Toast: "Welcome to {tier}! Your premium features are now active."

The subscription page detects when a user signs in for the first time and auto-runs license validation:

```tsx
// On Supabase Auth state change
useEffect(() => {
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN') {
      fetch('/api/license/refresh', { method: 'POST' })
        .then((res) => res.json())
        .then((data) => {
          if (data.tier !== 'community') {
            toast.success(`Welcome to ${data.tier}!`, {
              description: 'Your premium features are now active.',
            });
            router.refresh();
          }
        });
    }
  });
  return () => subscription.unsubscribe();
}, []);
```

### Path C: Manual Key Entry (Fallback)

For edge cases where email matching fails (different email used on Stripe vs Supabase Auth), the license key form provides a manual activation path. This uses the existing form implementation above.

### Post-Activation State Changes

After activation, the entire subscription page transforms:

| Element | Before (Community) | After (Operator+) |
|---------|-------------------|-------------------|
| Tier badge | `secondary` StatusChip | `default` or `success` StatusChip |
| License form | Visible with input | Hidden |
| Usage cards | Low limits (50, 10, 5, 30d) | Higher limits (500, 100, 50, 1yr) |
| Upgrade buttons | "Upgrade to Operator/Scale" | Hidden or "Upgrade to Scale" |
| Manage button | Hidden | "Manage Subscription" (Stripe Portal) |
| Upgrade banners | Visible across app | Hidden |

### Security Considerations

- License keys are never logged in plaintext (redacted in agent_logs)
- API endpoint rate-limited to 5 attempts per minute per IP (prevent brute force)
- Failed activation attempts are logged to Supabase for abuse detection
- Local license cache stores only tier and expiry, not the full key
- HTTPS required for all license validation requests

## Acceptance Criteria

- [ ] License key input form appears in SubscriptionSection for Community tier users
- [ ] Auto-formatting inserts dashes and uppercases input as user types
- [ ] Client-side validation rejects malformed keys before API call
- [ ] `POST /api/license/activate` validates key against Supabase and returns tier info
- [ ] Specific error messages for invalid, already-used, and expired keys
- [ ] Error displayed inline below input field (not toast)
- [ ] Successful activation triggers toast, hides form, updates tier badge and usage cards
- [ ] `router.refresh()` re-fetches server data to reflect new tier
- [ ] Stripe return URL (`?activated=true`) triggers auto-refresh of license status
- [ ] Post-activation: upgrade CTAs hidden, manage button shown, limits expanded
- [ ] Rate limiting on activation endpoint (5 attempts/minute/IP)
- [ ] Failed attempts logged to Supabase for abuse detection
- [ ] License key not stored in plaintext in local logs

## Scope Boundaries

**Included:**
- License key input form with auto-formatting and validation
- `POST /api/license/activate` API endpoint
- Supabase license key lookup and activation
- Error handling for invalid, already-used, and expired keys
- Success flow with toast, page refresh, and state transitions
- Stripe return URL handling for auto-activation
- Rate limiting on activation endpoint
- Post-activation UI state changes across subscription page

**Excluded:**
- License key generation (handled by Stripe webhook in stripe-billing-integration)
- Email delivery of license keys (handled by Stripe/Supabase trigger)
- License key revocation/deactivation — future admin feature
- Multi-device activation (one key = one device for V1) — future
- Offline activation (requires internet for Supabase validation) — architectural constraint
- License transfer between accounts — future
- Grace period for expired licenses — hard cutoff for V1

## References

- Depends on: `features/local-license-manager.md` — `licenseManager.activate()`, local cache management
- Depends on: `features/stripe-billing-integration.md` — Stripe Checkout, webhook license key generation
- Depends on: `features/subscription-management-ui.md` — SubscriptionSection where the form lives
- Related: `features/upgrade-cta-banners.md` — banners disappear after activation
- Related: `features/community-edition-soft-limits.md` — limits expand after tier upgrade
- Settings page: `src/app/settings/page.tsx` — existing settings architecture
- Supabase: `features/supabase-cloud-backend.md` — licenses table, RLS policies
- Design system: `design-system/MASTER.md` — FormSectionCard, status colors, elevation patterns
