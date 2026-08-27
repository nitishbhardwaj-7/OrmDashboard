const { execSync } = require("child_process");

try {
  console.log("Installing Playwright Python module & Chromium browser for cloud environment...");
  try {
    execSync("pip3 install playwright || pip install playwright", { stdio: "inherit" });
  } catch (e) {
    console.warn("pip install warning:", e.message);
  }

  try {
    execSync("python3 -m playwright install --with-deps chromium || python3 -m playwright install chromium || python -m playwright install chromium || npx playwright install chromium", { stdio: "inherit" });
  } catch (e) {
    console.warn("playwright install chromium warning:", e.message);
  }
} catch (err) {
  console.warn("Notice: Playwright auto-install notice:", err.message);
}
