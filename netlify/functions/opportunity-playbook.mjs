/**
 * Solvenna coach opportunity playbook (from Ryan's Excel Summary sheet).
 * Fired when the primary company trails/leads Compare To peers on the mapped metric.
 * Claude rewrites these for execs — do not paste guidance verbatim into the UI.
 */

/** Ratio above peer mean that counts as "much above" (25%). */
export const MUCH_ABOVE_PEER_RATIO = 1.25;

/** Cap how many fired rules go into the Claude user message. */
export const OPPORTUNITY_GUIDANCE_CAP = 8;

/**
 * @typedef {{
 *   id: string,
 *   metricId: string | null,
 *   metricLabel: string,
 *   when: 'below_peers' | 'above_peers' | 'much_above_peers' | 'below_or_above_peers',
 *   indicates: string | null,
 *   guidance: string
 * }} OpportunityRule
 */

/** @type {OpportunityRule[]} */
export const OPPORTUNITY_PLAYBOOK = [
  {
    id: "aov-below-peers",
    metricId: null,
    metricLabel: "AOV",
    when: "below_peers",
    indicates: "Poor product personalization",
    guidance:
      "When AOV trails peers, evaluate site analytics, data capture, and data integration with the product recommendation engine to strengthen personalization.",
  },
  {
    id: "conv-pct-below-peers",
    metricId: "conv_pct",
    metricLabel: "Conv %",
    when: "below_peers",
    indicates: "Poor product personalization; cart abandonment opportunity",
    guidance:
      "When conversion trails peers, evaluate site analytics, data capture, and product-rec engine integration. Address cart abandonment with cart email and display retargeting.",
  },
  {
    id: "multi-visit-pct-below-peers",
    metricId: "multi_visit_pct",
    metricLabel: "% Multi Visit",
    when: "below_peers",
    indicates: "Poor email segmentation and content",
    guidance:
      "Understand why loyal customers are not returning. Use historical data for segmentation; coordinate SMS, push, and email; focus segmentation and improve content so multi-visit behavior recovers.",
  },
  {
    id: "return-visitors-pct-below-peers",
    metricId: "return_visitors_pct",
    metricLabel: "Return Visitors %",
    when: "below_peers",
    indicates: "Poor email segmentation and content",
    guidance:
      "Understand why loyal customers are not returning. Use historical data for segmentation; coordinate SMS, push, and email; focus segmentation and improve content to lift return visits.",
  },
  {
    id: "bounce-pct-above-peers",
    metricId: "bounce_pct",
    metricLabel: "Bounce %",
    when: "above_peers",
    indicates: "Site analytics not recognizing visitors / weak personalized content or campaign landing pages",
    guidance:
      "When bounce is high vs peers, improve visitor recognition in site analytics, strengthen personalized content, and tighten campaign landing pages so traffic lands on relevant experiences.",
  },
  {
    id: "mail-visits-pct-below-peers",
    metricId: null,
    metricLabel: "Mail Visits %",
    when: "below_peers",
    indicates: "Email program underperformance (capture, segmentation, content, triggers)",
    guidance:
      "Strengthen data capture, segmentation, content, triggered messaging, and cross-channel orchestration to grow mail-driven visits.",
  },
  {
    id: "owned-visits-pct-below-peers",
    metricId: "owned_visits_pct",
    metricLabel: "Owned Visits %",
    when: "below_peers",
    indicates: "Owned (email + SEO) underperformance",
    guidance:
      "Improve email and SEO. Synchronize channel and campaign triggers with personalized landing pages so owned traffic converts and retains.",
  },
  {
    id: "owned-traffic-retention-index-below-peers",
    metricId: "owned_traffic_retention_index",
    metricLabel: "Owned Traffic Retention Index",
    when: "below_peers",
    indicates: "Owned traffic not retaining; trigger/landing mismatch",
    guidance:
      "Improve email and SEO retention. Synchronize channel and campaign triggers with personalized landing pages so owned visitors return.",
  },
  {
    id: "paid-visits-pct-much-above-peers",
    metricId: "paid_visits_pct",
    metricLabel: "Paid Visits %",
    when: "much_above_peers",
    indicates: "Paid share too high relative to owned",
    guidance:
      "When paid visits are much higher than peers, look at owned underperformance — rebalance toward owned channels rather than over-relying on paid.",
  },
  {
    id: "paid-traffic-retention-index-below-peers",
    metricId: "paid_traffic_retention_index",
    metricLabel: "Paid Traffic Retention Index",
    when: "below_peers",
    indicates: "Paid channels underperforming on retention",
    guidance:
      "Identify which paid channels underperform on retention and synchronize triggers to the landing page experience.",
  },
  {
    id: "spam-pct-above-peers",
    metricId: "spam_pct",
    metricLabel: "Spam %",
    when: "above_peers",
    indicates: "Audience dislikes what is sent or how often",
    guidance:
      "Improve segmentation and content; use more triggered messages and less carpet bombing so spam complaints fall.",
  },
  {
    id: "list-unique-visits-below-or-above-peers",
    metricId: null,
    metricLabel: "List/Unique Visits",
    when: "below_or_above_peers",
    indicates: "List size vs unique visitors imbalance",
    guidance:
      "Lower than peers means a small list vs uniques — invest in email capture. Higher means a large list not visiting monthly — improve the email program so list members engage.",
  },
  {
    id: "list-campaign-pct-above-peers",
    metricId: "list_campaign_pct",
    metricLabel: "% List/Campaign",
    when: "above_peers",
    indicates: "Cutting wide swaths; weak meaningful segmentation",
    guidance:
      "Review data gathering for meaningful segmentation so campaigns stop cutting wide swaths of the list.",
  },
  {
    id: "email-user-day-above-peers",
    metricId: "email_user_day",
    metricLabel: "Email/User/Day",
    when: "above_peers",
    indicates: "Audience dislikes what is sent or how often",
    guidance:
      "Improve segmentation and content; favor more triggers and less carpet bombing to reduce send pressure per user.",
  },
  {
    id: "email-power-index-below-peers",
    metricId: "email_power_index",
    metricLabel: "Email POWER Index",
    when: "below_peers",
    indicates: "Sending a lot of mail with low traffic response; impersonal offers",
    guidance:
      "Address segmentation, content, frequency, and site analytics. Impersonal offers drive a low POWER Index — tighten relevance so mail produces traffic.",
  },
];
