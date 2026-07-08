// Build-time data fetch script. Pulls the latest snapshot from TWSE/TPEx
// OpenAPI for every company in src/data/companies.json and appends new
// records into src/data/generated/*. Safe to re-run: dedupes by period/date
// so repeated runs (e.g. the scheduled refresh-data.yml workflow) just grow
// the time series rather than duplicating entries.
//
// TWSE/TPEx financial-statement and revenue endpoints only ever return the
// latest quarter/month (verified — see plan doc), so 3 years of history is
// built up by (a) running this script repeatedly over time, and (b) a
// separate one-time MOPS backfill for the initial 3-year seed (tracked as
// its own task, not part of this script).

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import * as twse from "../src/lib/twseApi";
import * as tpex from "../src/lib/tpexApi";
import companies from "../src/data/companies.json";

const DATA_DIR = path.join(import.meta.dirname, "..", "src", "data", "generated");
const THROTTLE_MS = 1200;
const MAX_RETRIES = 3;

type Exchange = "TWSE" | "TPEx";
interface SeedCompany {
  code: string;
  exchange: Exchange;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readJsonArray<T>(filePath: string): Promise<T[]> {
  try {
    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw) as T[];
  } catch {
    return [];
  }
}

async function writeJsonArray(filePath: string, data: unknown[]) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

function toNumberOrNull(v: string | undefined): number | null {
  if (v === undefined || v === "") return null;
  const n = parseFloat(v);
  return Number.isNaN(n) ? null : n;
}

async function upsertFinancials(
  code: string,
  record: {
    year: string;
    quarter: string;
    reportDate: string;
    revenue: number | null;
    operatingIncome: number | null;
    netIncome: number | null;
    eps: number | null;
    totalAssets: number | null;
    totalLiabilities: number | null;
    totalEquity: number | null;
    bookValuePerShare: number | null;
    sourceEndpoint: string;
    fetchedAt: string;
  }
) {
  const filePath = path.join(DATA_DIR, "company-financials", `${code}.json`);
  const existing = await readJsonArray<typeof record>(filePath);
  const withoutSamePeriod = existing.filter(
    (r) => !(r.year === record.year && r.quarter === record.quarter)
  );
  withoutSamePeriod.push(record);
  withoutSamePeriod.sort(
    (a, b) => Number(a.year) - Number(b.year) || Number(a.quarter) - Number(b.quarter)
  );
  await writeJsonArray(filePath, withoutSamePeriod);
}

async function upsertRevenue(
  code: string,
  record: {
    yearMonth: string;
    revenue: number | null;
    yoyGrowthPct: number | null;
    sourceEndpoint: string;
    fetchedAt: string;
  }
) {
  const filePath = path.join(DATA_DIR, "company-revenue", `${code}.json`);
  const existing = await readJsonArray<typeof record>(filePath);
  const withoutSameMonth = existing.filter((r) => r.yearMonth !== record.yearMonth);
  withoutSameMonth.push(record);
  withoutSameMonth.sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));
  await writeJsonArray(filePath, withoutSameMonth);
}

async function upsertPrices(code: string, rows: twse.TwseStockDayRow[]) {
  const filePath = path.join(DATA_DIR, "company-prices", `${code}.json`);
  const existing = await readJsonArray<twse.TwseStockDayRow>(filePath);
  const byDate = new Map(existing.map((r) => [r.date, r]));
  for (const row of rows) byDate.set(row.date, row);
  const merged = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  await writeJsonArray(filePath, merged);
}

async function fetchTwseSeed(seeds: SeedCompany[], fetchedAt: string) {
  const twseSeeds = seeds.filter((s) => s.exchange === "TWSE");
  if (twseSeeds.length === 0) return;

  console.log(`[TWSE] fetching bulk snapshots for ${twseSeeds.length} companies...`);
  const [income, balance, revenue] = await Promise.all([
    twse.getIncomeStatement(),
    twse.getBalanceSheet(),
    twse.getMonthlyRevenue(),
  ]);

  for (const { code } of twseSeeds) {
    const inc = income.find((r) => r.公司代號 === code);
    const bal = balance.find((r) => r.公司代號 === code);
    if (inc && bal) {
      await upsertFinancials(code, {
        year: inc.年度,
        quarter: inc.季別,
        reportDate: `${inc.年度}Q${inc.季別}`,
        revenue: toNumberOrNull(inc.營業收入),
        operatingIncome: toNumberOrNull(inc["營業利益（損失）"]),
        netIncome: toNumberOrNull(inc["本期淨利（淨損）"]),
        eps: toNumberOrNull(inc["基本每股盈餘（元）"]),
        totalAssets: toNumberOrNull(bal.資產總額),
        totalLiabilities: toNumberOrNull(bal.負債總額),
        totalEquity: toNumberOrNull(bal.權益總額),
        bookValuePerShare: toNumberOrNull(bal.每股參考淨值),
        sourceEndpoint: "openapi.twse.com.tw/v1/opendata/t187ap06_L_ci + t187ap07_L_ci",
        fetchedAt,
      });
    } else {
      console.warn(`[TWSE] ${code}: no income/balance sheet row found this run`);
    }

    const rev = revenue.find((r) => r.公司代號 === code);
    if (rev) {
      await upsertRevenue(code, {
        yearMonth: rev.資料年月,
        revenue: toNumberOrNull(rev["營業收入-當月營收"]),
        yoyGrowthPct: toNumberOrNull(rev["營業收入-去年同月增減(%)"]),
        sourceEndpoint: "openapi.twse.com.tw/v1/opendata/t187ap05_L",
        fetchedAt,
      });
    }
  }
}

async function fetchTpexSeed(seeds: SeedCompany[], fetchedAt: string) {
  const tpexSeeds = seeds.filter((s) => s.exchange === "TPEx");
  if (tpexSeeds.length === 0) return;

  console.log(`[TPEx] fetching bulk snapshots for ${tpexSeeds.length} companies...`);
  const [income, balance, revenue] = await Promise.all([
    tpex.getIncomeStatement(),
    tpex.getBalanceSheet(),
    tpex.getMonthlyRevenue(),
  ]);

  for (const { code } of tpexSeeds) {
    const inc = income.find((r) => r.SecuritiesCompanyCode === code);
    const bal = balance.find((r) => r.SecuritiesCompanyCode === code);
    if (inc && bal) {
      await upsertFinancials(code, {
        year: inc.Year,
        quarter: inc.Season,
        reportDate: `${inc.Year}Q${inc.Season}`,
        revenue: toNumberOrNull(inc.營業收入),
        operatingIncome: toNumberOrNull(inc["營業利益（損失）"]),
        netIncome: toNumberOrNull(inc["本期淨利（淨損）"]),
        eps: toNumberOrNull(inc["基本每股盈餘（元）"]),
        totalAssets: toNumberOrNull(bal.資產總計),
        totalLiabilities: toNumberOrNull(bal.負債總計),
        totalEquity: toNumberOrNull(bal.權益總計),
        bookValuePerShare: toNumberOrNull(bal.每股參考淨值),
        sourceEndpoint:
          "tpex.org.tw/openapi/v1/mopsfin_t187ap06_O_ci + mopsfin_t187ap07_O_ci",
        fetchedAt,
      });
    } else {
      console.warn(`[TPEx] ${code}: no income/balance sheet row found this run`);
    }

    const rev = revenue.find((r) => r.公司代號 === code);
    if (rev) {
      await upsertRevenue(code, {
        yearMonth: rev.資料年月,
        revenue: toNumberOrNull(rev["營業收入-當月營收"]),
        yoyGrowthPct: toNumberOrNull(rev["營業收入-去年同月增減(%)"]),
        sourceEndpoint: "tpex.org.tw/openapi/v1/mopsfin_t187ap05_O",
        fetchedAt,
      });
    }
  }
}

/** TWSE's legacy STOCK_DAY endpoint silently rate-limits under sustained load
 * (observed as HTTP 307 responses instead of real data during bulk backfill
 * testing) — retry with backoff instead of giving up on the first failure. */
async function fetchWithRetry(code: string, yyyymm: string) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await twse.getStockDayHistory(code, yyyymm);
    } catch (err) {
      if (attempt === MAX_RETRIES) throw err;
      const backoffMs = THROTTLE_MS * attempt * 2;
      console.warn(
        `[TWSE] ${code} ${yyyymm}: attempt ${attempt} failed (${(err as Error).message}), retrying in ${backoffMs}ms`
      );
      await sleep(backoffMs);
    }
  }
  return [];
}

/** Fetch up to `months` of price history for TWSE seed companies. TPEx has
 * no equivalent endpoint (verified) so is skipped here — see plan Section 7. */
async function fetchTwsePriceHistory(seeds: SeedCompany[], months: number) {
  const twseSeeds = seeds.filter((s) => s.exchange === "TWSE");
  const now = new Date();

  for (const { code } of twseSeeds) {
    console.log(`[TWSE] price history for ${code} (${months} months)...`);
    for (let i = 0; i < months; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const yyyymm = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
      try {
        const rows = await fetchWithRetry(code, yyyymm);
        await upsertPrices(code, rows);
      } catch (err) {
        console.warn(`[TWSE] ${code} ${yyyymm}: giving up — ${(err as Error).message}`);
      }
      await sleep(THROTTLE_MS);
    }
  }
}

async function main() {
  const seeds = companies as SeedCompany[];
  const fetchedAt = new Date().toISOString();

  await fetchTwseSeed(seeds, fetchedAt);
  await fetchTpexSeed(seeds, fetchedAt);

  const monthsArg = process.argv.find((a) => a.startsWith("--price-months="));
  const months = monthsArg ? parseInt(monthsArg.split("=")[1], 10) : 1;
  if (months > 0) {
    await fetchTwsePriceHistory(seeds, months);
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
