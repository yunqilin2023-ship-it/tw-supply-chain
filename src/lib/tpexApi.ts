// Typed wrappers around verified TPEx OpenAPI endpoints.
// All endpoints here were confirmed live via curl on 2026-07-08 (see plan doc).
// No CORS header on any of these — callers must run at build time (Node).
//
// IMPORTANT (verified, not guessed): TPEx has NO per-stock historical price
// endpoint equivalent to TWSE's legacy STOCK_DAY. Checked the full TPEx
// OpenAPI swagger spec (225 paths) — every quote/trading endpoint is an
// all-market snapshot for the latest day only (tpex_mainboard_quotes,
// tpex_mainboard_daily_close_quotes, etc.), none take a per-stock date-range
// parameter. TPEx price history for seed companies must be assembled the
// same way as financials: accumulate daily snapshots via the scheduled
// refresh job, or backfill from MOPS/another source — see plan Section 7.

const OPENAPI_BASE = "https://www.tpex.org.tw/openapi/v1";

export interface TpexCompanyBasic {
  Date: string;
  SecuritiesCompanyCode: string;
  CompanyName: string;
  CompanyAbbreviation: string;
  SecuritiesIndustryCode: string;
  DateOfListing: string;
  WebAddress: string;
  Symbol: string;
}

// Note the mixed key naming below is not a typo — it mirrors what TPEx's
// API actually returns (verified by curl), which differs field-by-field
// from both TWSE's naming and from TPEx's own other endpoints.
export interface TpexIncomeStatement {
  Date: string;
  Year: string;
  Season: string;
  SecuritiesCompanyCode: string;
  CompanyName: string;
  營業收入: string;
  營業成本: string;
  "營業利益（損失）": string;
  "稅前淨利（淨損）": string;
  "本期淨利（淨損）": string;
  "基本每股盈餘（元）": string;
}

export interface TpexBalanceSheet {
  Date: string;
  年度: string;
  季別: string;
  SecuritiesCompanyCode: string;
  CompanyName: string;
  流動資產: string;
  資產總計: string; // NOT 資產總額 — TPEx uses different wording than TWSE here
  負債總計: string; // NOT 負債總額
  權益總計: string; // NOT 權益總額
  每股參考淨值: string;
}

export interface TpexMonthlyRevenue {
  公司代號: string;
  公司名稱: string;
  資料年月: string;
  "營業收入-當月營收": string;
  "營業收入-去年當月營收": string;
  "營業收入-上月比較增減(%)": string;
  "營業收入-去年同月增減(%)": string;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`TPEx request failed: ${res.status} ${url}`);
  }
  return res.json() as Promise<T>;
}

/** 上櫃公司基本資料(全部公司,快照,需自行依代號篩選)。 */
export function getCompanyBasicInfo(): Promise<TpexCompanyBasic[]> {
  return fetchJson(`${OPENAPI_BASE}/mopsfin_t187ap03_O`);
}

/** 上櫃公司月營收彙總表(僅最新一個月的快照)。 */
export function getMonthlyRevenue(): Promise<TpexMonthlyRevenue[]> {
  return fetchJson(`${OPENAPI_BASE}/mopsfin_t187ap05_O`);
}

/** 上櫃公司綜合損益表,一般產業(僅最新一季的快照)。 */
export function getIncomeStatement(): Promise<TpexIncomeStatement[]> {
  return fetchJson(`${OPENAPI_BASE}/mopsfin_t187ap06_O_ci`);
}

/** 上櫃公司資產負債表,一般產業(僅最新一季的快照)。 */
export function getBalanceSheet(): Promise<TpexBalanceSheet[]> {
  return fetchJson(`${OPENAPI_BASE}/mopsfin_t187ap07_O_ci`);
}

/** 上櫃股票收盤行情(全市場,僅最新一日快照,需自行依代號篩選)。 */
export function getMainboardQuotes(): Promise<Record<string, unknown>[]> {
  return fetchJson(`${OPENAPI_BASE}/tpex_mainboard_quotes`);
}
