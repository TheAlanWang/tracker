// Edit-mode drafts vs. server updates (another member, the AI agent, MCP, or
// our own description autosave): a draft the user hasn't touched — still
// equal to the server value it was hydrated from — follows the new server
// value; an edited draft is kept. Without this, Save would send stale
// untouched drafts and silently revert someone else's change.
export function rebaseDraft<T>(draft: T, prevServer: T, nextServer: T): T {
  return Object.is(draft, prevServer) ? nextServer : draft;
}
