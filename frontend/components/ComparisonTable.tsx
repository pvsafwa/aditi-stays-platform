"use client";

import { Property } from "@/types";

type Props = {
  properties: Property[];
};

export default function ComparisonTable({ properties }: Props) {
  if (properties.length === 0) {
    return <p className="text-sm text-slate-500">Select wishlist items and run comparison.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-100">
          <tr>
            <th className="px-4 py-2 text-left text-slate-700">Property ID</th>
            <th className="px-4 py-2 text-left text-slate-700">Location</th>
            <th className="px-4 py-2 text-left text-slate-700">Nightly Price</th>
            <th className="px-4 py-2 text-left text-slate-700">Amenities</th>
          </tr>
        </thead>
        <tbody>
          {properties.map((p) => (
            <tr key={p.id} className="border-t border-slate-200 text-slate-700">
              <td className="px-4 py-3 font-semibold text-amber-700">{p.id}</td>
              <td className="px-4 py-3">{p.location}</td>
              <td className="px-4 py-3">₹{p.nightly_price}</td>
              <td className="px-4 py-3">{p.amenities.join(", ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
