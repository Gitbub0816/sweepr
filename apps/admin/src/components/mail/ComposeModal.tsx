/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { Modal, Input, Button } from "@sweepr/ui";
import type { ComposeState } from "./types";
import { isValidEmailList, isValidOptionalEmailList } from "./utils";

interface Props {
  boxAddress: string | null;
  compose: ComposeState;
  sending: boolean;
  onChange: (patch: Partial<ComposeState>) => void;
  onSend: () => void;
  onClose: () => void;
}

const MODE_TITLE: Record<ComposeState["mode"], string> = {
  new: "New message",
  reply: "Reply",
  "reply-all": "Reply All",
  forward: "Forward",
};

export function ComposeModal({ boxAddress, compose, sending, onChange, onSend, onClose }: Props) {
  const [touched, setTouched] = useState(false);
  const firstFieldRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (compose.open) {
      setTouched(false);
      const t = setTimeout(() => firstFieldRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [compose.open]);

  const toValid = isValidEmailList(compose.to);
  const ccValid = isValidOptionalEmailList(compose.cc);
  const subjectValid = compose.subject.trim().length > 0;
  const bodyValid = compose.body.trim().length > 0;
  const canSend = toValid && ccValid && subjectValid && bodyValid && !sending;

  function handleSend() {
    setTouched(true);
    if (!canSend) return;
    onSend();
  }

  return (
    <Modal
      open={compose.open}
      onOpenChange={(open) => { if (!open) onClose(); }}
      title={`${MODE_TITLE[compose.mode]}${boxAddress ? ` — from ${boxAddress}` : ""}`}
      className="max-w-lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSend} disabled={!canSend || sending} loading={sending}>
            <Send className="mr-1 h-4 w-4" aria-hidden="true" /> {sending ? "Sending…" : "Send"}
          </Button>
        </>
      }
    >
      <div
        className="space-y-3"
        onKeyDown={(e) => {
          if (e.key === "Escape") { e.stopPropagation(); onClose(); }
        }}
      >
        <Input
          ref={firstFieldRef}
          label="To"
          placeholder="recipient@example.com"
          value={compose.to}
          onChange={(e) => onChange({ to: e.target.value })}
          error={touched && !toValid ? "Enter at least one valid email address" : undefined}
        />
        <Input
          label="Cc"
          placeholder="cc@example.com (optional)"
          value={compose.cc}
          onChange={(e) => onChange({ cc: e.target.value })}
          error={touched && !ccValid ? "Enter valid email addresses" : undefined}
        />
        <Input
          label="Subject"
          placeholder="Subject"
          value={compose.subject}
          onChange={(e) => onChange({ subject: e.target.value })}
          error={touched && !subjectValid ? "Subject is required" : undefined}
        />
        <div>
          <label htmlFor="compose-body" className="mb-1.5 block text-sm font-medium text-charcoal dark:text-slate-200">
            Message
          </label>
          <textarea
            id="compose-body"
            value={compose.body}
            onChange={(e) => onChange({ body: e.target.value })}
            rows={10}
            placeholder="Write your message…"
            className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-charcoal placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-seafoam-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
          {touched && !bodyValid && <p className="mt-1 text-xs text-red-600">Message body is required</p>}
        </div>
      </div>
    </Modal>
  );
}
