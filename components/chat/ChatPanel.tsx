"use client";

import { ArrowLeft, Lock, MessageCircle, SendHorizontal, ShieldAlert } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { MAX_MESSAGE_LENGTH } from "@/lib/chat";
import type { ChatView } from "@/lib/services/chat";
import { cn } from "@/lib/utils";

import { getChatAction, sendMessageAction } from "@/app/safety/actions";

const time = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" });

/**
 * Keeps a ride's chat fresh: every 3 seconds, and right after sending.
 * With `open`, messages from the other side are marked seen.
 */
export function useChat(rideId: string, open: boolean, enabled = true) {
  const [chat, setChat] = useState<ChatView | null>(null);
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  async function refresh() {
    const result = await getChatAction({ rideId, markRead: openRef.current });
    if (result.ok) setChat(result.data);
  }
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  });

  useEffect(() => {
    if (!enabled) return;
    void refreshRef.current();
    const timer = setInterval(() => void refreshRef.current(), 3_000);
    return () => clearInterval(timer);
  }, [enabled, open]);

  return { chat, refresh };
}

/** The button that opens chat, with the unread count. */
export function ChatButton({ unread, onClick }: { unread: number; onClick: () => void }) {
  return (
    <Button
      variant="outline"
      onClick={onClick}
      aria-label={unread > 0 ? `Chat, ${unread} unread` : "Chat"}
      className="relative h-[54px] rounded-lg px-5"
    >
      <MessageCircle className="size-5" aria-hidden />
      <span className="font-bold">Chat</span>
      {unread > 0 && (
        <span className="absolute -top-1.5 -right-1.5 flex size-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
          {unread}
        </span>
      )}
    </Button>
  );
}

/**
 * "6b · Chat with Pilot" and "4b · Chat with rider (driving-safe)". The
 * Pilot gets big quick replies, and a keyboard only while parked at the
 * pickup. No phone numbers are involved.
 */
export function ChatPanel({
  rideId,
  chat,
  title,
  subtitle,
  side,
  onSent,
  onClose,
}: {
  rideId: string;
  chat: ChatView | null;
  title: string;
  subtitle: string;
  side: "rider" | "pilot";
  onSent: () => Promise<void>;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const end = useRef<HTMLDivElement>(null);
  const count = chat?.messages.length ?? 0;

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [count]);

  function send(body: string, isQuickReply: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await sendMessageAction({ rideId, body, isQuickReply });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      if (!isQuickReply) setText("");
      await onSent();
    });
  }

  const pilot = side === "pilot";
  return (
    <div className="fixed inset-0 z-40 flex bg-ink/40 md:items-center md:justify-center">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="chat-title"
        className="flex h-full w-full flex-col bg-background md:h-[85dvh] md:max-w-[480px] md:overflow-hidden md:rounded-3xl"
      >
        <header className="flex items-center gap-3 border-b border-border bg-card px-4 pt-5 pb-3.5">
          <button
            type="button"
            onClick={onClose}
            aria-label={pilot ? "Back to navigation" : "Back to trip"}
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted"
          >
            <ArrowLeft className="size-[22px]" aria-hidden strokeWidth={2.2} />
          </button>
          <span className="flex min-w-0 flex-1 flex-col">
            <span id="chat-title" className="font-bold">
              {title}
            </span>
            <span className="truncate text-[13px] text-muted-foreground">{subtitle}</span>
          </span>
        </header>

        {pilot && chat && !chat.canType && chat.open && (
          <p className="mx-4 mt-3 flex items-center gap-2.5 rounded-lg bg-warn-soft px-3.5 py-3 text-sm font-semibold text-warn">
            <ShieldAlert className="size-5 shrink-0" aria-hidden />
            You may be driving — typing is off. Tap a reply. You can type once you&apos;re parked at
            the pickup.
          </p>
        )}

        <div
          className="flex flex-1 flex-col gap-2.5 overflow-y-auto px-4 py-3.5"
          aria-live="polite"
        >
          <span className="mx-auto flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-xs text-muted-foreground">
            <Lock className="size-3" aria-hidden />
            Private chat · phone numbers stay hidden
          </span>
          {chat === null && <p className="m-auto text-sm text-muted-foreground">Loading…</p>}
          {chat?.messages.length === 0 && (
            <p className="m-auto text-center text-sm text-muted-foreground">
              No messages yet. {pilot ? "Tap a reply below." : "Say hi, or tap a quick reply."}
            </p>
          )}
          <ul aria-label="Messages" className="mt-auto flex flex-col gap-2.5">
            {chat?.messages.map((m) => (
              <li
                key={m.id}
                className={cn("flex flex-col gap-0.5", m.mine ? "items-end" : "items-start")}
              >
                <span
                  className={cn(
                    "max-w-[80%] px-3.5 py-2.5 leading-snug",
                    pilot ? "text-[17px] font-medium" : "text-[15px]",
                    m.mine
                      ? "rounded-[18px_18px_6px_18px] bg-ink text-on-ink"
                      : "rounded-[18px_18px_18px_6px] bg-card",
                  )}
                >
                  {m.body}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {time.format(new Date(m.createdAt))}
                  {m.mine && (m.seen ? " · Seen" : " · Sent")}
                </span>
              </li>
            ))}
          </ul>
          <div ref={end} />
        </div>

        {chat && !chat.open ? (
          <p className="border-t border-border bg-card px-4 py-4 text-center text-sm text-muted-foreground">
            This chat has closed.
          </p>
        ) : (
          <div className="flex flex-col gap-2.5 border-t border-border bg-card px-4 pt-2.5 pb-5">
            {error && (
              <p role="alert" className="text-sm font-semibold text-danger-text">
                {error}
              </p>
            )}
            <div
              className={cn(pilot ? "grid grid-cols-2 gap-2" : "flex gap-2 overflow-x-auto pb-0.5")}
              role="group"
              aria-label="Quick replies"
            >
              {chat?.quickReplies.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => send(q, true)}
                  disabled={pending}
                  className={cn(
                    "rounded-full border border-border font-semibold whitespace-nowrap",
                    pilot
                      ? "min-h-[60px] rounded-lg bg-muted px-3 text-[15px] leading-tight font-bold whitespace-normal"
                      : "h-[38px] shrink-0 px-3.5 text-sm",
                  )}
                >
                  {q}
                </button>
              ))}
            </div>
            {chat?.canType && (
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (text.trim()) send(text, false);
                }}
              >
                <label htmlFor="chat-input" className="sr-only">
                  Message
                </label>
                <input
                  id="chat-input"
                  value={text}
                  onChange={(e) => setText(e.target.value.slice(0, MAX_MESSAGE_LENGTH))}
                  placeholder={`Message ${title.split(" ")[0]}…`}
                  autoComplete="off"
                  className="h-12 min-w-0 flex-1 rounded-md bg-muted px-4 text-[15px] outline-none focus:ring-2 focus:ring-ring"
                />
                <Button
                  type="submit"
                  disabled={pending || !text.trim()}
                  aria-label="Send"
                  className="size-12 rounded-md p-0"
                >
                  <SendHorizontal className="size-5" aria-hidden />
                </Button>
              </form>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
