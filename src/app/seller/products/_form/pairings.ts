// "Style it with": shared by the product form (client) and its Server Actions.
export const MAX_PAIRINGS = 4;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The ticked product ids, in order, without duplicates. `error` if there are too many or junk. */
export function parsePairWith(formData: FormData) {
  const ids = [...new Set(formData.getAll("pairWith").map(String))];
  if (ids.some((id) => !UUID.test(id))) return { ids: [], error: "Pick the pieces again." };
  if (ids.length > MAX_PAIRINGS) return { ids: ids.slice(0, MAX_PAIRINGS), error: `Pick up to ${MAX_PAIRINGS} pieces.` };
  return { ids };
}
