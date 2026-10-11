// Older backends can send a review message while leaving reviewRequired false.
export function needsTerminalReview(result) {
  return result?.reviewRequired === true
    || /^(session_unknown:|unrecognised_code:)/.test(result?.reason || "")
    || ["unrecognised_envelope", "session_not_found_review_required", "status_query_rejected_review_required", "payment_details_require_review"].includes(result?.reason);
}
