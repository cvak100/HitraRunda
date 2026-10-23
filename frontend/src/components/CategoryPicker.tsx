export type CategoryOption = {
  slug: string;
  name: string;
  question_count?: number;
  classic_question_count?: number;
};

/** false = brez števila; all / classic = število v oklepaju. */
export type CategoryCountMode = false | "all" | "classic";

/**
 * Enaka predstavitev kategorij povsod — 2 stolpca, celotna imena.
 * ``showCounts``: false | "all" | "classic" (ala).
 */
export function CategoryPicker({
  categories,
  value,
  onChange,
  legend = "Kategorije",
  showCounts = false,
  disabled = false,
  showSelectAll = false,
}: {
  categories: CategoryOption[];
  value: string[];
  onChange: (next: string[]) => void;
  legend?: string;
  showCounts?: CategoryCountMode;
  disabled?: boolean;
  showSelectAll?: boolean;
}) {
  function toggle(slug: string) {
    if (disabled) return;
    onChange(value.includes(slug) ? value.filter((item) => item !== slug) : [...value, slug]);
  }

  function countFor(category: CategoryOption) {
    if (!showCounts) return null;
    const n =
      showCounts === "classic"
        ? (category.classic_question_count ?? 0)
        : (category.question_count ?? 0);
    return n;
  }

  return (
    <fieldset className="category-picker" disabled={disabled}>
      <legend>
        {legend}
        {categories.length ? ` (${value.length}/${categories.length})` : ""}
      </legend>
      {categories.length > 0 ? (
        <div className="category-picker-grid">
          {categories.map((category) => {
            const count = countFor(category);
            return (
              <label key={category.slug} className="check category-picker-item">
                <input
                  type="checkbox"
                  checked={value.includes(category.slug)}
                  disabled={disabled}
                  onChange={() => toggle(category.slug)}
                />
                <span className="category-picker-name">
                  {category.name}
                  {count != null ? ` (${count})` : ""}
                </span>
              </label>
            );
          })}
        </div>
      ) : (
        <p className="fine">Ni kategorij.</p>
      )}
      {showSelectAll && categories.length > 0 ? (
        <div className="actions category-picker-actions">
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(categories.map((c) => c.slug))}
          >
            Vse
          </button>
          <button type="button" disabled={disabled} onClick={() => onChange([])}>
            Nobena
          </button>
        </div>
      ) : null}
    </fieldset>
  );
}
