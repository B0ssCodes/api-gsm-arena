import axios from "axios";
import cheerio from "cheerio";
import chromium from "chrome-aws-lambda";
import puppeteer from "puppeteer-core";

import { PhoneInfo } from "../types";

// Determine if running in development or production
const isDev = process.env.NODE_ENV !== "production";

// Browser configuration helper
const getBrowserConfig = async () => {
  const args = [...chromium.args, "--no-sandbox", "--disable-setuid-sandbox"];
  let executablePath;

  if (isDev) {
    switch (process.platform) {
      case "win32":
        executablePath =
          "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
        break;
      case "darwin":
        executablePath =
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
        break;
      case "linux":
        executablePath = "/usr/bin/google-chrome";
        break;
      default:
        throw new Error(`Unsupported platform: ${process.platform}`);
    }
  } else {
    executablePath = await chromium.executablePath;
  }

  return {
    args,
    defaultViewport: chromium.defaultViewport,
    executablePath,
    headless: isDev ? true : chromium.headless,
  };
};

// Close browser asynchronously
const closeBrowserAsync = (browser: any) => {
  // Run browser cleanup in background
  (async () => {
    try {
      // Try graceful close with timeout
      await Promise.race([
        browser.close(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Timeout")), 3000)
        ),
      ]).catch(async () => {
        // Force close if graceful close fails
        try {
          const pages = await browser.pages().catch((): any[] => []);
          await Promise.all(
            pages.map((page: any) =>
              page.close({ force: true }).catch(() => {})
            )
          );
          await Promise.race([
            browser.close(),
            new Promise((resolve) => setTimeout(resolve, 1000)),
          ]);
        } catch (e) {
          // Ignore any errors in force close
        }
      });
    } catch (e) {
      // Ignore any errors in browser closing
    }
  })();
};

const formatQuery = (query: string): string => {
  return query.replace(" ", "+");
};

export const scrapeSearch = async (
  query: string,
  list: PhoneInfo[] = []
): Promise<PhoneInfo[]> => {
  let browser;

  try {
    // Launch browser with optimized config
    const browserConfig = await getBrowserConfig();
    browser = await puppeteer.launch(browserConfig);

    // Open page and navigate
    const page = await browser.newPage();
    await page.setDefaultNavigationTimeout(20000); // Shorter timeout

    // Optimize page performance
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      // Only allow essential content types
      const resourceType = request.resourceType();
      if (["image", "stylesheet", "font", "media"].includes(resourceType)) {
        request.abort();
      } else {
        request.continue();
      }
    });

    // Navigate to search page
    const url = `https://www.gsmarena.com/res.php3?sSearch=${formatQuery(
      query
    )}`;
    await page.goto(url, { waitUntil: "domcontentloaded" });

    // Wait for results to load
    await page.waitForSelector("#decrypted", { timeout: 15000 });

    // Extract the content with a single evaluation in the page context
    const phones = await page.evaluate(() => {
      const results: PhoneInfo[] = [];
      const items = document.querySelectorAll(
        "div#review-body > .makers > ul > li"
      );

      items.forEach((item) => {
        const link = item.querySelector("a");
        const img = item.querySelector("a > img");
        const nameEl = item.querySelector("a > strong > span");

        if (link && nameEl && img) {
          const name = nameEl.textContent?.trim() || "";

          results.push({
            id: link.getAttribute("href") || "",
            name: name,
            image: img.getAttribute("src") || "",
          });
        }
      });

      return results;
    });

    // Merge results with existing list
    list.push(...phones);

    // Start browser closing in the background
    closeBrowserAsync(browser);

    // Return results immediately
    return list;
  } catch (error) {
    console.error(
      "Error in scrapeSearch:",
      error instanceof Error ? error.message : "Unknown error"
    );

    // Clean up browser if it exists
    if (browser) {
      closeBrowserAsync(browser);
    }

    return list;
  }
};
