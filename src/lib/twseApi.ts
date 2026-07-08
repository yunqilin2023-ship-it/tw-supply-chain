// Typed wrappers around verified TWSE OpenAPI + legacy endpoints.
// All endpoints here were confirmed live via curl on 2026-07-08 (see plan doc).
// Bulk /opendata + /exchangeReport endpoints have no CORS header — callers
// must run these at build time (Node), never client-side in the browser.

const OPENAPI_BASE = "https://openapi.twse.com.tw/v1";
const LEGACY_BASE = "https://www.twse.com.tw";

export interface TwseCompanyBasic {
  出表日期: string;
  公司代號: string;
  公司名稱: string;
  公司簡稱: string;
  產業別: string;
  上市日期: string;
  網址: string;
  英文簡稱: string;
}

export interface TwseIncomeStatement {
  公司代號: string;
  公司名稱: string;
  年度: string;
  季別: string;
  營業收入: string;
  營業成本: string;
  "營業利益（損失）": string;
  "稅前淨利（淨損）": string;
  "本期淨利（淨損）": string;
  "基本每股盈餘（元）": string;
}

export interface TwseBalanceSheet {
  公司代號: string;
  公司名稱: string;
  年度: string;
  季別: string;
  流動資產: string;
  資產總額: string;
  負債總額: string;
  權益總額: string;
  每股參考淨值: string;
}

export interface TwseMonthlyRevenue {
  公司代號: string;
  公司名稱: string;
  資料年月: string;
  "營業收入-當月營收": string;
  "營業收入-去年當月營收": string;
  "營業收入-上月比較增減(%)": string;
  "營業收入-去年同月增減(%)": string;
}

export interface TwseStockDayRow {
  date: string; // YYYY-MM-DD, normalized from ROC date
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`TWSE request failed: ${res.status} ${url}`);
  }
  return res.json() as Promise<T>;
}

/** 上市公司基本資料(全部公司,快照,需自行依公司代號篩選)。 */
export function getCompanyBasicInfo(): Promise<TwseCompanyBasic[]> {
  return fetchJson(`${OPENAPI_BASE}/opendata/t187ap03_L`);
}

/** 上市公司月營收彙總表(僅最新一個月的快照)。 */
export function getMonthlyRevenue(): Promise<TwseMonthlyRevenue[]> {
  return fetchJson(`${OPENAPI_BASE}/opendata/t187ap05_L`);
}

/** 上市公司綜合損益表,一般產業(僅最新一季的快照)。 */
export function getIncomeStatement(): Promise<TwseIncomeStatement[]> {
  return fetchJson(`${OPENAPI_BASE}/opendata/t187ap06_L_ci`);
}

/** 上市公司資產負債表,一般產業(僅最新一季的快照)。 */
export function getBalanceSheet(): Promise<TwseBalanceSheet[]> {
  return fetchJson(`${OPENAPI_BASE}/opendata/t187ap07_L_ci`);
}

/**
 * 個股月成交行情(舊版端點,CORS 開放,可回溯多年)。
 * date 需為當月第一天,格式 YYYYMM01。一次呼叫回傳整個月的日線。
 */
export async function getStockDayHistory(
  stockNo: string,
  yyyymm: string
): Promise<TwseStockDayRow[]> {
  const url = `${LEGACY_BASE}/rwd/zh/afterTrading/STOCK_DAY?date=${yyyymm}01&stockNo=${stockNo}&response=json`;
  const raw = await fetchJson<{ stat: string; data?: string[][] }>(url);
  if (raw.stat !== "OK" || !raw.data) return [];
  // TWSE row shape: [日期, 成交股數, 成交金額, 開盤價, 最高價, 最低價, 收盤價, 漲跌價差, 成交筆數, 註記]
  return raw.data.map(([rocDate, volume, , open, high, low, close]) => ({
    date: rocDateToIso(rocDate),
    open: parseFloat(open.replace(/,/g, "")),
    high: parseFloat(high.replace(/,/g, "")),
    low: parseFloat(low.replace(/,/g, "")),
    close: parseFloat(close.replace(/,/g, "")),
    volume: parseInt(volume.replace(/,/g, ""), 10) || 0,
  }));
}

/** 民國年月日(114/06/01)轉西元 ISO 日期字串。 */
function rocDateToIso(rocDate: string): string {
  const [y, m, d] = rocDate.split("/");
  const year = parseInt(y, 10) + 1911;
  return `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}
