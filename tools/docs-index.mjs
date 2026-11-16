import fs from "node:fs";
import path from "node:path";

const root = "docs";
const index = path.join(root, "INDEX.md");
const old = fs.existsSync(index) ? fs.readFileSync(index, "utf8") : "";
const prior = new Map(
  [...old.matchAll(/\| (DOC-\d+) \| \[.*?\]\((.*?)\)/g)].map((m) => [
    decodeURI(m[2]),
    m[1],
  ]),
);
let next =
  Math.max(0, ...[...prior.values()].map((x) => Number(x.slice(4)))) + 1;
function walk(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)],
    );
}
const files = [
  ...new Set([
    ...walk(root).map((x) => path.relative(root, x).replaceAll("\\", "/")),
    "INDEX.md",
  ]),
].sort();
const rows = files.map((file) => {
  const id = prior.get(file) || `DOC-${String(next++).padStart(3, "0")}`;
  const body =
    file === "INDEX.md" ? "" : fs.readFileSync(path.join(root, file), "utf8");
  const status =
    file === "INDEX.md"
      ? "ACTIVE"
      : body.match(/Trạng thái: (\w+)/)?.[1] ||
        (file.endsWith(".md") ? "REFERENCE" : "ARTIFACT");
  const owner = body.match(/Chủ sở hữu: ([^|\n]+)/)?.[1]?.trim() || "TL";
  const related = body.match(/Liên quan D: ([^\n]+)/)?.[1]?.trim() || "D01–D12";
  return `| ${id} | [${file}](${encodeURI(file)}) | ${status} | ${owner} | 2026-11-05 | ${related} |`;
});
const output =
  "# Chỉ mục tài liệu local\n\nTrạng thái: ACTIVE | Chủ sở hữu: TL | Ngày: 2026-11-07 | Liên quan D: D01–D12\n\nID ổn định, tăng dần khi thêm file. INDEX liệt kê các file hiện có tại máy, gồm cả tài liệu Git ignore. Trên remote chỉ giữ [kế hoạch triển khai](Ke_hoach_trien_khai_Smart_Self_Checkout.md) và [kế hoạch phát hành](05-release.md) theo [.gitignore](.gitignore). REFERENCE là hồ sơ lịch sử, ARTIFACT là hiện vật prototype/test. Không đổi tài liệu cũ thành bằng chứng triển khai.\n\n| ID | Tài liệu / hiện vật | Trạng thái | Chủ sở hữu | Ngày | Liên quan D |\n|---|---|---|---|---|---|\n" +
  rows.join("\n") +
  "\n";
if (process.argv.includes("--check")) {
  const listed = new Set(prior.keys());
  if (
    files.some((x) => !listed.has(x)) ||
    [...listed].some((x) => !files.includes(x)) ||
    new Set(prior.values()).size !== prior.size
  )
    throw Error("INDEX missing/extra files or duplicate IDs; run docs:index");
  for (const file of files.filter((x) => x.endsWith(".md"))) {
    const text = fs.readFileSync(path.join(root, file), "utf8");
    for (const m of text.matchAll(/\]\(([^)]+)\)/g)) {
      const target = m[1].replace(/^<|>$/g, "").split("#")[0];
      if (!target || /^(https?:|[A-Z]:|\/)/i.test(target)) continue;
      if (
        !fs.existsSync(
          path.resolve(root, path.dirname(file), decodeURI(target)),
        )
      )
        throw Error(`${file}: broken link ${target}`);
    }
  }
  console.log(
    `INDEX PASS: ${files.length} files, stable unique IDs, local links checked.`,
  );
} else {
  fs.writeFileSync(index, output);
  console.log(`Indexed ${files.length} files.`);
}
