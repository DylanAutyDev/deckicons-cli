import path from "node:path";

export function slugify(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "icon";
}

export function uniqueSlugs(
  files: string[],
): Array<{ file: string; slug: string }> {
  const counts = new Map<string, number>();

  return files.map((file) => {
    const base = path.basename(file, path.extname(file));
    const slug = slugify(base);
    const count = counts.get(slug) ?? 0;
    counts.set(slug, count + 1);

    return {
      file,
      slug: count === 0 ? slug : `${slug}-${count + 1}`,
    };
  });
}
