const { execSync } = require("child_process");

try {
  console.log("Checking Playwright Chromium installation for cloud environment...");
  execSync("python3 -m playwright install chromium || python -m playwright install chromium", { stdio: "inherit" });
} catch (err) {
  console.warn("Notice: Playwright auto-install notice:", err.message);
}
