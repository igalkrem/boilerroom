// Parent-entity verification (a create route confirming the campaign or ad squad it
// is about to write under actually belongs to the caller's ad account) has two very
// different failure modes, and collapsing them is what turns a transient upstream
// blip into an aborted launch reported as bad user input.
//
//   - Snapchat says the entity does not exist  -> the id really is wrong. Reject.
//   - Snapchat was unreachable, rate limited,  -> we do not know. Say so, so the
//     or returned 5xx                             orchestrator's build log tells the
//                                                 operator to retry rather than to
//                                                 go hunting for a bad id that is
//                                                 in fact one we just created.
//
// snapFetch throws `Snapchat API error <status>: <body>`; the entity getters throw
// a bare "… not found" when the response parses but carries no entity.
export function isEntityNotFound(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /not found/i.test(msg) || /Snapchat API error 404\b/.test(msg);
}
