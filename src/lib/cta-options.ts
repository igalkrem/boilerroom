// Shared call-to-action option lists — used by both the preset form
// (creativeDefaults.callToAction) and the canvas wizard's per-article CTA
// picker (providerToArticle[].callToAction), so the two never drift apart.

// Snapchat's real call_to_action enum (submission-orchestrator.ts sends these
// verbatim for non-SNAP_AD creative types).
export const SNAP_CTA_OPTIONS = [
  { value: "", label: "— None —" },
  { value: "MORE", label: "More" },
  { value: "SHOP_NOW", label: "Shop Now" },
  { value: "SIGN_UP", label: "Sign Up" },
  { value: "DOWNLOAD", label: "Download" },
  { value: "WATCH", label: "Watch" },
  { value: "GET_NOW", label: "Get Now" },
  { value: "ORDER_NOW", label: "Order Now" },
  { value: "BOOK_NOW", label: "Book Now" },
  { value: "APPLY_NOW", label: "Apply Now" },
  { value: "BUY_NOW", label: "Buy Now" },
];

// Meta's real call_to_action_type enum, grouped to match how Ads Manager
// presents them. Confirmed live against Meta's ad-creative creation tooling —
// distinct from Snapchat's list above (e.g. Meta's "Learn More" is
// LEARN_MORE, not MORE; there is no GET_NOW on Meta's side at all).
export const META_CTA_GROUPS: Array<{ label: string; options: { value: string; label: string }[] }> = [
  {
    label: "Shopping",
    options: [
      { value: "SHOP_NOW", label: "Shop Now" },
      { value: "BUY_NOW", label: "Buy Now" },
      { value: "ORDER_NOW", label: "Order Now" },
      { value: "START_ORDER", label: "Start Order" },
      { value: "ADD_TO_CART", label: "Add to Cart" },
      { value: "SEE_SHOP", label: "See Shop" },
      { value: "BROWSE_SHOP", label: "Browse Shop" },
      { value: "VIEW_PRODUCT", label: "View Product" },
      { value: "BUY", label: "Buy" },
      { value: "SELL_NOW", label: "Sell Now" },
      { value: "SHOP_WITH_AI", label: "Shop with AI" },
    ],
  },
  {
    label: "General",
    options: [
      { value: "LEARN_MORE", label: "Learn More" },
      { value: "SIGN_UP", label: "Sign Up" },
      { value: "OPEN_LINK", label: "Open Link" },
      { value: "GET_STARTED", label: "Get Started" },
      { value: "SEE_MORE", label: "See More" },
      { value: "FIND_OUT_MORE", label: "Find Out More" },
      { value: "VISIT_WEBSITE", label: "Visit Website" },
      { value: "GET_DETAILS", label: "Get Details" },
      { value: "CONFIRM", label: "Confirm" },
      { value: "NO_BUTTON", label: "No Button" },
    ],
  },
  {
    label: "Contact",
    options: [
      { value: "CALL_NOW", label: "Call Now" },
      { value: "CALL", label: "Call" },
      { value: "CONTACT_US", label: "Contact Us" },
      { value: "CONTACT", label: "Contact" },
      { value: "GET_QUOTE", label: "Get Quote" },
      { value: "GET_A_QUOTE", label: "Get a Quote" },
      { value: "MESSAGE_PAGE", label: "Message Page" },
      { value: "WHATSAPP_MESSAGE", label: "WhatsApp Message" },
      { value: "GET_IN_TOUCH", label: "Get in Touch" },
      { value: "AUDIO_CALL", label: "Audio Call" },
      { value: "VIDEO_CALL", label: "Video Call" },
      { value: "EMAIL_NOW", label: "Email Now" },
      { value: "ASK_A_QUESTION", label: "Ask a Question" },
      { value: "CHAT_NOW", label: "Chat Now" },
      { value: "CHAT_WITH_US", label: "Chat with Us" },
      { value: "ASK_FOR_MORE_INFO", label: "Ask for More Info" },
    ],
  },
  {
    label: "Booking",
    options: [
      { value: "BOOK_NOW", label: "Book Now" },
      { value: "BOOK_TRAVEL", label: "Book Travel" },
      { value: "REQUEST_TIME", label: "Request Time" },
      { value: "MAKE_AN_APPOINTMENT", label: "Make an Appointment" },
      { value: "BOOK_A_CONSULTATION", label: "Book a Consultation" },
      { value: "GET_SHOWTIMES", label: "Get Showtimes" },
      { value: "BUY_TICKETS", label: "Buy Tickets" },
    ],
  },
  {
    label: "App",
    options: [
      { value: "INSTALL_APP", label: "Install App" },
      { value: "INSTALL_MOBILE_APP", label: "Install Mobile App" },
      { value: "USE_APP", label: "Use App" },
      { value: "USE_MOBILE_APP", label: "Use Mobile App" },
      { value: "DOWNLOAD", label: "Download" },
      { value: "PLAY_GAME", label: "Play Game" },
      { value: "OPEN_INSTANT_APP", label: "Open Instant App" },
      { value: "UPDATE_APP", label: "Update App" },
    ],
  },
  {
    label: "Lead Gen",
    options: [
      { value: "APPLY_NOW", label: "Apply Now" },
      { value: "INQUIRE_NOW", label: "Inquire Now" },
      { value: "GET_OFFER", label: "Get Offer" },
      { value: "GET_DIRECTIONS", label: "Get Directions" },
    ],
  },
  {
    label: "Engagement",
    options: [
      { value: "SUBSCRIBE", label: "Subscribe" },
      { value: "FOLLOW_PAGE", label: "Follow Page" },
      { value: "EVENT_RSVP", label: "RSVP" },
      { value: "DONATE", label: "Donate" },
      { value: "DONATE_NOW", label: "Donate Now" },
      { value: "RAISE_MONEY", label: "Raise Money" },
      { value: "REFER_FRIENDS", label: "Refer Friends" },
    ],
  },
  {
    label: "Media",
    options: [
      { value: "WATCH_VIDEO", label: "Watch Video" },
      { value: "WATCH_MORE", label: "Watch More" },
      { value: "LISTEN_NOW", label: "Listen Now" },
      { value: "LISTEN_MUSIC", label: "Listen Music" },
      { value: "WATCH_LIVE_VIDEO", label: "Watch Live Video" },
    ],
  },
];

// Values that are valid call_to_action strings on BOTH platforms (same
// literal string accepted by Snapchat's call_to_action and Meta's
// call_to_action_type) — used when a single article is connected to ad
// accounts on both platforms at once, since one stored CTA value currently
// has to serve every campaign built from that article regardless of platform.
export const SHARED_CTA_OPTIONS = SNAP_CTA_OPTIONS.filter((o) =>
  ["", "SHOP_NOW", "SIGN_UP", "DOWNLOAD", "ORDER_NOW", "BOOK_NOW", "APPLY_NOW", "BUY_NOW"].includes(o.value)
);
