"use client";

import { FormEvent, useState } from "react";

type Props = {
  propertyId: string;
  open: boolean;
  onClose: () => void;
  onSubmit: (input: {
    customer_name: string;
    mobile_number: string;
    disclaimer_accepted: boolean;
    from_date: string;
    to_date: string;
    members: number;
  }) => Promise<void>;
};

function defaultFromDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaultToDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

export default function LeadCaptureModal({ propertyId, open, onClose, onSubmit }: Props) {
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [fromDate, setFromDate] = useState(defaultFromDate());
  const [toDate, setToDate] = useState(defaultToDate());
  const [members, setMembers] = useState(2);
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handle = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (!fromDate || !toDate) {
        throw new Error("Select valid travel dates.");
      }
      if (new Date(toDate).getTime() < new Date(fromDate).getTime()) {
        throw new Error("Till date should be after from date.");
      }
      if (members <= 0) {
        throw new Error("Members should be at least 1.");
      }
      await onSubmit({
        customer_name: name,
        mobile_number: mobile,
        disclaimer_accepted: accepted,
        from_date: fromDate,
        to_date: toDate,
        members,
      });
      setName("");
      setMobile("");
      setFromDate(defaultFromDate());
      setToDate(defaultToDate());
      setMembers(2);
      setAccepted(false);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-foreground/40 p-4 backdrop-blur-sm">
      <form
        className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-luxe"
        onSubmit={handle}
      >
        <p className="text-[0.7rem] font-medium uppercase tracking-[0.3em] text-accent">Aditi Stays</p>
        <h3 className="mt-2 text-balance text-2xl font-semibold leading-tight text-foreground">
          Check Availability · {propertyId}
        </h3>

        <div className="mt-5 space-y-3">
          <label className="block text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Name
            <input
              className="mt-1.5 w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm font-normal normal-case tracking-normal text-foreground placeholder:text-muted-foreground/70 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Your full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
          <label className="block text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Mobile Number
            <input
              className="mt-1.5 w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm font-normal normal-case tracking-normal text-foreground placeholder:text-muted-foreground/70 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Mobile number"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              required
            />
          </label>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            From date
            <input
              type="date"
              className="mt-1.5 w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm font-normal normal-case tracking-normal text-foreground transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              required
            />
          </label>
          <label className="block text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Till date
            <input
              type="date"
              className="mt-1.5 w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm font-normal normal-case tracking-normal text-foreground transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              required
            />
          </label>
        </div>
        <label className="mt-3 block text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Number of members
          <input
            type="number"
            min={1}
            className="mt-1.5 w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm font-normal normal-case tracking-normal text-foreground transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={members}
            onChange={(e) => setMembers(Number(e.target.value) || 0)}
            required
          />
        </label>

        <label className="mt-4 flex items-start gap-3 rounded-xl border border-border bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-input accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <span className="leading-relaxed">
            Chat will be recorded for internal training purposes &amp; compliance.
          </span>
        </label>

        {error ? <p className="mt-3 text-sm font-medium text-destructive">{error}</p> : null}

        <div className="mt-5 flex justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border bg-transparent px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground shadow-luxe-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Submitting..." : "Start Chat"}
          </button>
        </div>
      </form>
    </div>
  );
}
