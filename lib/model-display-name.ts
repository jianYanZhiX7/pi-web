/**
 * A model's name as the composer labels it: the name itself, without the
 * ` · <vendor>` suffix some providers carry in their models.json names.
 * Display only; the picker keeps the whole name so its rows stay apart.
 */
export function displayModelName(name: string): string {
  const cut = name.indexOf(" · ");
  if (cut <= 0) return name;
  return name.slice(0, cut).trim() || name;
}
