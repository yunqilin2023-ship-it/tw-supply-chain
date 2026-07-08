import companiesJson from "../data/companies.json";
import industriesJson from "../data/industries.json";

export type Exchange = "TWSE" | "TPEx";
export type Tier = "upstream" | "midstream" | "downstream";

export interface Company {
  code: string;
  exchange: Exchange;
  nameZh: string;
  nameEn: string;
  industrySlug: string;
  tier: Tier;
  subCategory: string;
  description: string;
  descriptionSource: string;
  website: string;
  lastVerifiedDate: string;
}

export interface IndustryTier {
  key: Tier;
  labelZh: string;
  subCategories: string[];
}

export interface Industry {
  slug: string;
  nameZh: string;
  nameEn: string;
  summary: string;
  tiers: IndustryTier[];
}

export interface FinancialSnapshot {
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

export interface RevenueSnapshot {
  yearMonth: string;
  revenue: number | null;
  yoyGrowthPct: number | null;
  sourceEndpoint: string;
  fetchedAt: string;
}

export interface PriceRow {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const companies = companiesJson as Company[];
const industries = industriesJson as Industry[];

export function getAllIndustries(): Industry[] {
  return industries;
}

export function getIndustry(slug: string): Industry | undefined {
  return industries.find((i) => i.slug === slug);
}

export function getAllCompanies(): Company[] {
  return companies;
}

export function getCompany(code: string): Company | undefined {
  return companies.find((c) => c.code === code);
}

export function getCompaniesByIndustry(slug: string): Company[] {
  return companies.filter((c) => c.industrySlug === slug);
}

export function getCompaniesByIndustryAndTier(
  slug: string,
  tier: Tier
): Company[] {
  return companies.filter(
    (c) => c.industrySlug === slug && c.tier === tier
  );
}

// Generated data (financials/revenue/prices) is fetched at build time by
// scripts/fetch-data.ts and committed under src/data/generated/. Loaded
// dynamically here since not every company necessarily has a file yet
// (e.g. before the first fetch-data run for a newly added seed company).
export async function getCompanyFinancials(
  code: string
): Promise<FinancialSnapshot[]> {
  try {
    const mod = await import(
      `../data/generated/company-financials/${code}.json`
    );
    return (mod.default ?? mod) as FinancialSnapshot[];
  } catch {
    return [];
  }
}

export async function getCompanyRevenue(
  code: string
): Promise<RevenueSnapshot[]> {
  try {
    const mod = await import(`../data/generated/company-revenue/${code}.json`);
    return (mod.default ?? mod) as RevenueSnapshot[];
  } catch {
    return [];
  }
}

export async function getCompanyPrices(code: string): Promise<PriceRow[]> {
  try {
    const mod = await import(`../data/generated/company-prices/${code}.json`);
    return (mod.default ?? mod) as PriceRow[];
  } catch {
    return [];
  }
}
