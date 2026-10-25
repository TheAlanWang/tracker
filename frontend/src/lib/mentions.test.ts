// @-mention completion for the live editor: same matching and inserted
// token as the old MentionTextarea.
import { CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import type { Member } from "@/features/members/api";

import { mentionCompletion } from "./mentions";

const member = (id: string, display_name: string | null, email: string): Member =>
  ({ user_id: id, display_name, email }) as Member;

const joy = member("1", "Joy Li", "joy.li@x.com");
const ben1 = member("2", "Ben Park", "ben.park@x.com");
const ben2 = member("3", "Ben Ito", "bito@x.com");
const members = [joy, ben1, ben2];

function complete(text: string) {
  const state = EditorState.create({ doc: text });
  return mentionCompletion(members)(new CompletionContext(state, text.length, false)) as CompletionResult | null;
}

describe("mentionCompletion", () => {
  it("offers members for @ after whitespace, replacing the @prefix", () => {
    const r = complete("hi @jo")!;
    expect(r.from).toBe(3);
    expect(r.options.map((o) => o.label)).toEqual(["Joy Li"]);
    expect(r.options[0].apply).toBe("@joy ");
  });

  it("matches any word of the name or the email local part", () => {
    expect(complete("@li")!.options.map((o) => o.label)).toEqual(["Joy Li"]);
    expect(complete("@bito")!.options.map((o) => o.label)).toEqual(["Ben Ito"]);
  });

  it("no completion inside an email address", () => {
    expect(complete("foo@jo")).toBeNull();
  });

  it("a shared first name inserts the email local part", () => {
    const r = complete("@ben")!;
    expect(r.options.map((o) => o.apply)).toEqual(["@ben.park ", "@bito "]);
  });
});
