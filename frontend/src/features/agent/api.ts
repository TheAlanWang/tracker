import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/api/client";
import { supabase } from "@/lib/supabase";

// One agent turn streams a sequence of SSE events; the hook folds them into a
// growing chat thread. Mirrors the event shapes emitted by
// backend/app/services/agent.py.

export type AgentToolStatus = "running" | "ok" | "error";

export type AgentToolEntry = {
  name: string;
  status: AgentToolStatus;
  summary?: string;
};

export type AgentChatMessage = {
  role: "user" | "assistant";
  content: string;
  // Tool-call pills shown inline with an assistant turn.
  tools?: AgentToolEntry[];
};

export type AgentQuota = { used: number; cap: number; remaining: number };

// Why the panel is unusable, if it is: out of monthly messages, or the
// deployment has no Anthropic key configured.
export type AgentBlockedReason = "quota" | "not_configured" | null;

// Tools that mutate the board. When one succeeds we invalidate the task
// cache so the board/list updates live — same keys useCreateTask /
// useUpdateTask invalidate.
const WRITE_TOOLS = new Set(["create_task", "update_task", "add_comment"]);

export function useAgentChat(projectId: string) {
  const qc = useQueryClient();
  const [messages, setMessages] = useState<AgentChatMessage[]>([]);
  const [isStreaming, setStreaming] = useState(false);
  const [quota, setQuota] = useState<AgentQuota | null>(null);
  const [blocked, setBlocked] = useState<AgentBlockedReason>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Mutate the in-flight assistant turn (always the last message).
  const updateLast = useCallback(
    (fn: (m: AgentChatMessage) => AgentChatMessage) => {
      setMessages((prev) => {
        const i = prev.length - 1;
        if (i < 0 || prev[i].role !== "assistant") return prev;
        const next = [...prev];
        next[i] = fn(next[i]);
        return next;
      });
    },
    [],
  );

  const handleEvent = useCallback(
    (evt: Record<string, unknown>) => {
      switch (evt.type) {
        case "text_delta":
          updateLast((m) => ({ ...m, content: m.content + (evt.text as string) }));
          break;
        case "tool_call":
          updateLast((m) => ({
            ...m,
            tools: [
              ...(m.tools ?? []),
              { name: evt.name as string, status: "running" },
            ],
          }));
          break;
        case "tool_result": {
          const ok = Boolean(evt.ok);
          updateLast((m) => {
            let flipped = false;
            const tools = (m.tools ?? []).map((t) => {
              if (!flipped && t.status === "running" && t.name === evt.name) {
                flipped = true;
                return {
                  ...t,
                  status: (ok ? "ok" : "error") as AgentToolStatus,
                  summary: evt.summary as string | undefined,
                };
              }
              return t;
            });
            return { ...m, tools };
          });
          if (ok && WRITE_TOOLS.has(evt.name as string)) {
            qc.invalidateQueries({ queryKey: ["projects", projectId, "tasks"] });
            qc.invalidateQueries({ queryKey: ["tasks"] });
          }
          break;
        }
        case "quota":
          setQuota({
            used: evt.used as number,
            cap: evt.cap as number,
            remaining: evt.remaining as number,
          });
          break;
        case "error":
          updateLast((m) => ({
            ...m,
            content:
              m.content + (m.content ? "\n\n" : "") + "⚠️ " + (evt.message as string),
          }));
          break;
        // "done" needs no handling — the stream ends.
      }
    },
    [updateLast, qc, projectId],
  );

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isStreaming) return;

      // Thread to send: prior turns + the new user message (role/content only;
      // tool pills are UI state, not replayed).
      const thread = [
        ...messages.map((m) => ({ role: m.role, content: m.content })),
        { role: "user" as const, content: trimmed },
      ];

      // Optimistically render the user bubble + an empty assistant turn that
      // the stream fills in.
      setMessages((prev) => [
        ...prev,
        { role: "user", content: trimmed },
        { role: "assistant", content: "", tools: [] },
      ]);
      setStreaming(true);
      setBlocked(null);

      const ctrl = new AbortController();
      abortRef.current = ctrl;

      try {
        const { data: sess } = await supabase.auth.getSession();
        const token = sess.session?.access_token;
        const res = await fetch(
          `${apiClient.defaults.baseURL}/projects/${projectId}/agent`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ messages: thread }),
            signal: ctrl.signal,
          },
        );

        if (!res.ok || !res.body) {
          // Pre-stream errors (quota enforced before streaming, missing key).
          let detail: unknown = null;
          try {
            detail = (await res.json()).detail;
          } catch {
            /* non-JSON body */
          }
          if (res.status === 402) {
            setBlocked("quota");
            if (detail && typeof detail === "object") {
              const d = detail as { used?: number; cap?: number };
              if (typeof d.cap === "number")
                setQuota({ used: d.used ?? d.cap, cap: d.cap, remaining: 0 });
            }
          } else if (res.status === 503) {
            setBlocked("not_configured");
          } else {
            updateLast((m) => ({
              ...m,
              content: "⚠️ The assistant is unavailable right now.",
            }));
          }
          // Drop the empty assistant placeholder for the blocked states.
          if (res.status === 402 || res.status === 503) {
            setMessages((prev) => prev.slice(0, -1));
          }
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const frames = buf.split("\n\n");
          buf = frames.pop() ?? ""; // keep the trailing partial frame
          for (const frame of frames) {
            const line = frame.split("\n").find((l) => l.startsWith("data:"));
            if (!line) continue;
            try {
              handleEvent(JSON.parse(line.slice(5).trim()));
            } catch {
              /* skip malformed frame */
            }
          }
        }
      } catch (e) {
        if (!(e instanceof DOMException && e.name === "AbortError")) {
          updateLast((m) => ({
            ...m,
            content:
              m.content + (m.content ? "\n\n" : "") + "⚠️ Connection lost.",
          }));
        }
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [messages, isStreaming, projectId, handleEvent, updateLast],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setBlocked(null);
  }, []);

  // Load the saved conversation when the project changes, so the thread
  // survives reload / reopen / a different device. Tool pills aren't
  // persisted — history is plain {role, content}.
  useEffect(() => {
    let cancelled = false;
    setMessages([]);
    apiClient
      .get<{ messages: AgentChatMessage[] }>(`/projects/${projectId}/agent/history`)
      .then(({ data }) => {
        if (!cancelled && data.messages?.length) setMessages(data.messages);
      })
      .catch(() => {
        /* no history yet, or not configured — start empty */
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // Clear the saved conversation (and the visible thread). Long-term memory
  // is untouched — that's cleared by asking the assistant to "forget".
  const clearChat = useCallback(async () => {
    abortRef.current?.abort();
    setMessages([]);
    setBlocked(null);
    try {
      await apiClient.delete(`/projects/${projectId}/agent/history`);
    } catch {
      /* best-effort */
    }
  }, [projectId]);

  return { messages, isStreaming, quota, blocked, send, stop, reset, clearChat };
}
