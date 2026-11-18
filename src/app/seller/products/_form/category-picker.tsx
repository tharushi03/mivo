"use client";

import { useState } from "react";
import { DEPARTMENTS, findCategory, findDepartment } from "@/lib/categories";

type Placement = { department: string; category: string; subcategory: string };

/**
 * Three linked dropdowns: Women / Men / Kids › category › sub-category.
 * Changing one resets the ones after it. The server checks the result again.
 */
export function CategoryPicker({ initial, inputClass, error }: { initial: Placement; inputClass: string; error?: string }) {
  const [v, setV] = useState<Placement>(initial);
  const dept = findDepartment(v.department) ?? DEPARTMENTS[0];
  const category = findCategory(dept.slug, v.category);
  const subs = category?.subs ?? [];

  return (
    <fieldset>
      <legend className="mb-1 block text-sm font-medium">Where it shows in the menu</legend>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="department" className="mb-1 block text-xs text-text-secondary">
            Section
          </label>
          <select
            id="department"
            name="department"
            value={dept.slug}
            onChange={(e) => setV({ department: e.target.value, category: "", subcategory: "" })}
            className={inputClass}
          >
            {DEPARTMENTS.map((d) => (
              <option key={d.slug} value={d.slug}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="category" className="mb-1 block text-xs text-text-secondary">
            Category
          </label>
          <select
            id="category"
            name="category"
            value={category?.slug ?? ""}
            onChange={(e) => setV({ ...v, department: dept.slug, category: e.target.value, subcategory: "" })}
            required
            className={inputClass}
          >
            <option value="" disabled>
              Choose…
            </option>
            {dept.categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="subcategory" className="mb-1 block text-xs text-text-secondary">
            Sub-category
          </label>
          <select
            id="subcategory"
            name="subcategory"
            value={subs.some((x) => x.slug === v.subcategory) ? v.subcategory : ""}
            onChange={(e) => setV({ ...v, department: dept.slug, subcategory: e.target.value })}
            required={subs.length > 0}
            disabled={subs.length === 0}
            className={`${inputClass} disabled:opacity-50`}
          >
            <option value="" disabled={subs.length > 0}>
              {category ? (subs.length ? "Choose…" : "None needed") : "Pick a category first"}
            </option>
            {subs.map((x) => (
              <option key={x.slug} value={x.slug}>
                {x.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {error && <p className="mt-1 text-xs text-error">{error}</p>}
    </fieldset>
  );
}
