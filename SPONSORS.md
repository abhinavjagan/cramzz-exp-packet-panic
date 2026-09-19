# Founding Node placement contract

Production placements are static entries in `sponsors.json`. The committed inventory is deliberately empty until an application is reviewed and its individual Razorpay Payment Link is manually confirmed as **captured** in the dashboard.

## Activation checklist

1. Review the brand, destination, creative rights, and prohibited-category policy.
2. Confirm the payment is captured in Razorpay; a browser return or callback alone is insufficient.
3. Store an approved PNG or WebP logo under 10 MB in `public/sponsors/`. Do not hotlink a remote image and do not accept SVG/HTML.
4. Add one placement with `reviewed: true`, `paymentStatus: "captured"`, an HTTPS destination without embedded credentials, and an inclusive date window of exactly 30 days.
5. Run `npm run check` and the browser suite, then obtain normal review before release.

The Founding Node offer is capped at 20 total ₹499 bookings. Each booking covers one 30-day window. Only the seven eligible routers can carry sponsors, so at most seven placements run concurrently; later buyers receive the next non-overlapping window rather than an unavailable simultaneous slot.

Expired placement records remain in `sponsors.json` permanently so the 20-booking lifetime cap stays auditable. Never recycle a placement `id`. At expiry, remove `logoPath` and the corresponding asset if needed, but retain the record, brand, destination, node, date window, review flag, and captured status for the inventory count.

The build fails closed if a placement is malformed, is not exactly 30 inclusive calendar days, is unpaid, unreviewed, outside the 20-booking cap, has a missing, disguised, or over-10-MB local logo, exceeds seven active placements, overlaps another placement on the same router, or targets Origin, Destination, or the trap node. JSON Schema documents the 30-day rule, while the TypeScript validator enforces the cross-date calculation that JSON Schema cannot express. A router can be booked again only after its earlier placement window ends. Sponsorship metadata is consumed only by the UI layer; the puzzle generator and scoring engine never import it. A placement receives an explicit “Sponsored” label and assistive description, and its outbound link uses `rel="sponsored nofollow noopener noreferrer"`.

Never include sponsor contact details, payment identifiers, or private creative-review notes in this public file.
