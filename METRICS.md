# Packet Panic metrics scorecard

Status: **pre-launch**  
Measurement window: **fourteen days from production launch**

| Metric | Baseline | Day 14 target | Verified result |
| --- | ---: | ---: | ---: |
| Unique visitors | 0 | 300 | Pending |
| Game starts | 0 | Observe | Pending |
| Completed plays | 0 | 250 unlocks daily sponsor | Pending |
| Share rate | 0% | 8% | Pending |
| Returning-player rate | 0% | 10% | Pending |
| Qualified sponsor replies | 0 | 3 | Pending |
| Paid sponsors | 0 | 1 | Pending |
| Gross revenue | ₹0 | ₹2,495 first milestone | Pending |

## Definitions

- **Unique visitor:** the privacy-configured analytics project's anonymous daily/period unique count; known bots and team QA traffic are excluded.
- **Completed play:** one `game_complete` event per anonymous browser and puzzle day for reporting. Client retries must be deduplicated during analysis.
- **Successful share:** at most one `share_completed` result per anonymous browser and puzzle day for reporting, even if the player uses copy or native share more than once.
- **Share rate:** deduplicated successful shares divided by deduplicated completed plays.
- **Returning-player rate:** unique visitors whose completion occurs with `returning_player=true`, divided by all unique visitors in the fourteen-day window.
- **Qualified sponsor reply:** a response from a relevant organization that explicitly asks for inventory, audience, pricing, timing, or a proposal.
- **Paid sponsor:** Razorpay reports a manually reviewed payment link as captured; return-page visits do not count.

Raw dashboards are not public. The Cramzz ledger publishes only verified aggregate bands, revenue totals, and the final decision.
