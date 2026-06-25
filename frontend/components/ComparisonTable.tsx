"use client";

import { Property } from "@/types";

type Props = {
  properties: Property[];
};

export default function ComparisonTable({ properties }: Props) {
  if (properties.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Select wishlist items and run comparison.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border shadow-card">
      <table className="min-w-full text-sm">
        <thead className="bg-muted text-muted-foreground">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">
              Property ID
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">
              Location
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide">
              Nightly Price
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">
              Amenities
            </th>
          </tr>
        </thead>
        <tbody>
          {properties.map((p) => (
            <tr
              key={p.id}
              className="border-t border-border text-foreground transition-colors hover:bg-muted/40"
            >
              <td className="px-4 py-3 font-semibold text-primary">{p.id}</td>
              <td className="px-4 py-3">{p.location}</td>
              <td className="px-4 py-3 text-right font-display tabular-nums">
                ₹{p.nightly_price}
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {p.amenities.join(", ")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
