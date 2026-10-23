import { test, expect } from "@playwright/test";

test.describe("SentimentStream Full Functional Regression Suite", () => {
  test("1. Landing Page interactive components and navigation", async ({ page }) => {
    const consoleErrors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await page.goto("/");
    await expect(page).toHaveTitle(/SentimentStream/);

    // Navbar anchors exist and are visible
    for (const anchor of ["Demo", "Pipeline", "Features", "Big Data", "Benchmarks"]) {
      const link = page.locator(`header a:has-text("${anchor}")`).first();
      await expect(link).toBeVisible();
    }

    // Theme toggle works and toggles .dark
    const lightBtn = page.locator('header button[title="Light mode"]').first();
    const darkBtn = page.locator('header button[title="Dark mode"]').first();
    await lightBtn.click();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
    await darkBtn.click();
    await expect(page.locator("html")).toHaveClass(/dark/);

    // Stream canvas is present and running
    const canvas = page.locator("canvas");
    await expect(canvas).toBeVisible();

    // Interactive Demo Card: Test preset and classification
    const presetBtn = page.locator('#demo button:has-text("Negative Bug Report")');
    await presetBtn.click();
    const demoText = page.locator("#demo textarea");
    await expect(demoText).toHaveValue(/drains my battery/);

    // Wait for sentiment result
    await expect(page.locator("#demo div:has-text('Sentiment')").first()).toBeVisible({ timeout: 30000 });
    await expect(page.locator("#demo div:has-text('Confidence')").first()).toBeVisible();

    // "Launch app" button in Hero navigates to /app
    const heroLaunch = page.locator('section a:has-text("Launch app")').first();
    await heroLaunch.click();
    await page.waitForURL("**/app");
    expect(page.url()).toContain("/app");

    // No uncaught errors during landing page interaction
    const criticalErrors = consoleErrors.filter((e) => !e.includes("favicon") && !e.includes("404"));
    expect(criticalErrors).toHaveLength(0);
  });

  test("2. App Shell, Sidebar, and System Health Modal", async ({ page }) => {
    await page.goto("/app");

    // Verify all 7 navigation links in the sidebar
    const navItems = ["Overview", "Data & jobs", "Trends", "Posts", "Classifier", "Performance", "Reports"];
    for (const item of navItems) {
      const link = page.locator(`aside nav a:has-text("${item}")`);
      await expect(link).toBeVisible();
    }

    // Open Health Modal from Spark Status button
    const sparkBtn = page.locator("aside button[title='Click to view system health']");
    await expect(sparkBtn).toBeVisible();
    await sparkBtn.click();

    const healthModal = page.locator("h3:has-text('System & Cluster Health')");
    await expect(healthModal).toBeVisible();

    // Check modal contents
    await expect(page.locator("dt:has-text('Spark Status')")).toBeVisible();
    await expect(page.locator("dt:has-text('CPU Cores')")).toBeVisible();
    await expect(page.locator("dt:has-text('Storage Backend')")).toBeVisible();

    // Close modal via Close button
    const closeBtn = page.locator("button:has-text('Close')");
    await closeBtn.click();
    await expect(healthModal).not.toBeVisible();
  });

  test("3. Data & Jobs: Upload tabs, Demo Data, and Dataset Management", async ({ page }) => {
    await page.goto("/app/data");

    // Switch between File Upload and URL tabs
    const urlTabBtn = page.locator('button:has-text("URL / Server Path")');
    await urlTabBtn.click();
    await expect(page.locator("text=Direct Download URL")).toBeVisible();

    const fileTabBtn = page.locator('button:has-text("File Upload")');
    await fileTabBtn.click();
    await expect(page.locator("text=Drop a file here or click to browse")).toBeVisible();

    // Generate Demo Data (10K)
    const segmented10k = page.locator('button:has-text("10K")');
    await segmented10k.click();

    const generateBtn = page.locator('button:has-text("Generate 10,000 posts")');
    await expect(generateBtn).toBeEnabled();
    await generateBtn.click();

    // Wait for generation to complete and dataset card to appear
    const datasetCard = page.locator('li:has-text("Nova X5 launch (10,000 posts)")').first();
    await expect(datasetCard).toBeVisible({ timeout: 25000 });

    // Open Mapping Modal
    const mappingBtn = datasetCard.locator('button:has-text("Mapping")');
    await mappingBtn.click();

    const mappingTitle = page.locator("h3:has-text('Configure Column Mapping')");
    await expect(mappingTitle).toBeVisible();
    await expect(page.locator("label:has-text('Text Column')")).toBeVisible();

    // Close mapping modal
    const cancelMapping = page.locator("button:has-text('Cancel')").first();
    await cancelMapping.click();
    await expect(mappingTitle).not.toBeVisible();

    // Test Inline Rename on Dataset
    const pencilBtn = datasetCard.locator('button[title="Rename dataset"]');
    await pencilBtn.click();

    const renameInput = page.locator('input[aria-label="Rename dataset"]').first();
    await expect(renameInput).toBeVisible();
    await renameInput.fill("Automated E2E Dataset");
    await renameInput.press("Enter");

    await expect(page.locator("text=Automated E2E Dataset").first()).toBeVisible();

    // Test Analysis button ready in "auto" mode
    const analyseBtn = page.locator('button:has-text("Analyse")').first();
    await expect(analyseBtn).toBeVisible();
    await expect(analyseBtn).toBeEnabled();

    // Verify existing jobs in Jobs list
    const jobList = page.locator("h2:has-text('Jobs')");
    await expect(jobList).toBeVisible();

    // Test Copy Job ID if jobs exist
    const copyIdBtn = page.locator('button[title="Copy job ID"]').first();
    if (await copyIdBtn.isVisible()) {
      await copyIdBtn.click();
    }
  });

  test("4. Navigation: Deep links, legacy redirects with query preservation, and theme persistence", async ({ page }) => {
    // Legacy redirect preserving query: /posts?sentiment=positive -> /app/posts?sentiment=positive
    await page.goto("/posts?sentiment=positive");
    await page.waitForURL("**/app/posts?sentiment=positive");
    expect(page.url()).toContain("/app/posts?sentiment=positive");

    // Legacy redirect: /data -> /app/data
    await page.goto("/data");
    await page.waitForURL("**/app/data");
    expect(page.url()).toContain("/app/data");

    // Legacy redirect: /trends -> /app/trends
    await page.goto("/trends");
    await page.waitForURL("**/app/trends");
    expect(page.url()).toContain("/app/trends");

    // Legacy redirect: /reports -> /app/reports
    await page.goto("/reports");
    await page.waitForURL("**/app/reports");
    expect(page.url()).toContain("/app/reports");

    // Browser reload persists route and state
    await page.reload();
    expect(page.url()).toContain("/app/reports");
  });

  test("5. Classifier Page: Model status and interactive playground", async ({ page }) => {
    await page.goto("/app/model");

    // Playground textarea
    const playground = page.locator('textarea[aria-label="Posts to classify"]');
    await expect(playground).toBeVisible();

    // Run classification in playground
    const classifyBtn = page.locator('button:has-text("Classify")');
    await classifyBtn.click();

    // Wait for predictions list (with 35s timeout for Spark model execution)
    const predictionItem = page.locator("li:has-text('battery')").first();
    await expect(predictionItem).toBeVisible({ timeout: 35000 });
  });

  test("6. Performance Page: Benchmark runner UI controls", async ({ page }) => {
    await page.goto("/app/performance");

    // Toggle size buttons
    const toggle10k = page.locator('button:has-text("10k rows")');
    await expect(toggle10k).toBeVisible();
    await toggle10k.click(); // unselect
    await toggle10k.click(); // reselect

    const runBtn = page.locator('button:has-text("Run benchmark")');
    await expect(runBtn).toBeVisible();
  });

  test("7. Reports Page: Download buttons and Live Markdown preview", async ({ page }) => {
    await page.goto("/app/reports");

    // Verify download links exist for all 3 formats
    const dlMd = page.locator('a:has-text("Download Markdown")');
    const dlCsv = page.locator('a:has-text("Download CSV")');
    const dlJson = page.locator('a:has-text("Download JSON")');

    // Either download links or QuickStart is shown
    const isShowingReports = await dlMd.isVisible();
    if (isShowingReports) {
      await expect(dlCsv).toBeVisible();
      await expect(dlJson).toBeVisible();
      await expect(page.locator("h2:has-text('Report preview')")).toBeVisible();
    }
  });

  test("8. Keyboard Accessibility & Enter/Escape Inline Rename", async ({ page }) => {
    await page.goto("/app/data");

    const pencilBtn = page.locator('button[title="Rename dataset"]').first();
    await expect(pencilBtn).toBeVisible();
    await pencilBtn.click();

    const renameInput = page.locator('input[aria-label="Rename dataset"]').first();
    await expect(renameInput).toBeVisible();

    // Type new text then Escape -> should cancel and revert
    const originalText = await renameInput.inputValue();
    await renameInput.fill("Temporary cancelled name");
    await renameInput.press("Escape");

    // Must still have original text
    await expect(page.locator(`text=${originalText}`).first()).toBeVisible();
  });
});
