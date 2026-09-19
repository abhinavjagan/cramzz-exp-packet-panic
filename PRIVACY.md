# Packet Panic privacy notes

Packet Panic is designed to be playable without an account and without transmitting personal gameplay data.

## Stored on the player's device

The game stores completed puzzle IDs, outcome, score, grade, hop count, last win date, and streak in `localStorage` under `cramzz:packet-panic:progress:v2:<mode>:<epoch>`. Preview and configured-launch namespaces are intentionally separate, so preview testers are not counted as returning launch players and their preview streak cannot enter the live game. When production analytics is configured, Cramzz also stores a random anonymous analytics ID under `cramzz.analytics.anonymous-id.v1`; it rotates after 30 days and is shared only across the `cramzz.space` origin. Both records can be removed by clearing site data.

## Permitted analytics

Only these events may be emitted:

`experiment_view`, `game_start`, `game_complete`, `share_opened`, `share_completed`, `challenge_visit`, `sponsor_cta_clicked`, `sponsor_form_opened`, and `payment_returned`.

Only these properties may accompany them:

- experiment and puzzle identifiers;
- source and campaign tokens limited to 64 ASCII letters, numbers, dots, underscores, and hyphens;
- broad referrer class (`direct`, `internal`, `search`, `social`, or `referral`);
- whether this browser has a prior completion;
- non-identifying outcome, latency, reliability, hop count, and grade.

The full referrer URL, name, email, advertising identifier, device fingerprint, sponsor form contents, payment information, and free-form player input must not be captured. The capture request necessarily transits the analytics provider's network, but every event sets `$geoip_disable: true` to prevent location enrichment and `$process_person_profile: false` to prevent person-profile creation. DNT and Global Privacy Control disable transmission. Autocapture and session replay are not loaded.

The `payment_returned` event records only that the browser returned from a payment flow. It never grants a placement or claims payment was successful.

## External sponsor form

Selecting the sponsor call to action may open a separately hosted form governed by its own notice. Sponsor contact details and creative must remain outside public repositories and public analytics.
