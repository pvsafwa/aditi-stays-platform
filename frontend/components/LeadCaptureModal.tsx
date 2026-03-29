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
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4">
      <form className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl" onSubmit={handle}>
        <h3 className="text-xl font-bold text-slate-800">Check Availability · {propertyId}</h3>

        <input
          className="mt-4 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-700"
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <input
          className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-700"
          placeholder="Mobile Number"
          value={mobile}
          onChange={(e) => setMobile(e.target.value)}
          required
        />
        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="text-xs text-slate-600">
            From date
            <input
              type="date"
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-700"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              required
            />
          </label>
          <label className="text-xs text-slate-600">
            Till date
            <input
              type="date"
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-700"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              required
            />
          </label>
        </div>
        <label className="mt-3 block text-xs text-slate-600">
          Number of members
          <input
            type="number"
            min={1}
            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-700"
            value={members}
            onChange={(e) => setMembers(Number(e.target.value) || 0)}
            required
          />
        </label>

        <label className="mt-3 flex gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
          Chat will be recorded for internal training purposes & compliance.
        </label>

        {error ? <p className="mt-2 text-sm text-rose-600">{error}</p> : null}

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-300 px-4 py-2 text-sm text-slate-700">
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60"
          >
            {loading ? "Submitting..." : "Start Chat"}
          </button>
        </div>
      </form>
    </div>
  );
}
