import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
const [driver, suite] = process.argv.slice(2);
if (
  !["native", "docker"].includes(driver) ||
  !["integration", "browser"].includes(suite)
)
  throw Error("Expected native|docker and integration|browser");
mkdirSync("test-results", { recursive: true });
const reporters = [
  "--test-reporter=spec",
  "--test-reporter-destination=stdout",
  "--test-reporter=junit",
  `--test-reporter-destination=test-results/${suite}-${driver}.xml`,
];
const args =
  suite === "integration"
    ? [
        "--import",
        "tsx",
        "--test",
        ...reporters,
        "--test-concurrency=1",
        "backend/tests/*.test.ts",
      ]
    : ["--test", ...reporters, "tests/app.browser.cjs"];
const result = spawnSync(process.execPath, args, {
  env: { ...process.env, SSC_DB_DRIVER: driver },
  stdio: "inherit",
  windowsHide: true,
});
process.exitCode = result.status ?? 1;
