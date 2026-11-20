import { Option } from "@packages/ddd-kit";

export type SchoolHolidayProvider = "education-nationale" | "openholidays";

export type BankHolidayProvider = "api-gouv" | "nager-date";

export interface CountryCoverage {
  code: string;
  schoolHolidays: SchoolHolidayProvider | null;
  bankHolidays: BankHolidayProvider | null;
}

export const FRANCE = "FR";

const OPEN_HOLIDAYS_SCHOOL_COUNTRIES = new Set(
  "AD AL AT BE BG BR BY CH CZ DE EE ES HR HU IE IT LI LT LU LV MC MD MT MX NL PL PT RO RS SE SI SK SM VA ZA".split(
    " ",
  ),
);

const NAGER_DATE_COUNTRIES =
  "AD AG AI AL AM AO AR AT AU AW AX BA BB BD BE BF BG BH BI BJ BL BM BO BQ BR BS BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG ER ES ET FI FK FM FO GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GT GW GY HK HN HR HT HU ID IE IM IQ IS IT JE JM JP KE KH KI KM KN KR KY KZ LC LI LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MN MP MQ MR MS MT MW MX MZ NA NC NE NF NG NI NL NO NR NU NZ PA PE PF PG PH PL PM PN PR PT PW PY RO RS RU RW SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TG TK TN TO TR TT TV TZ UA UG US UY VA VC VE VG VI VN VU WF WS YE ZA ZM ZW".split(
    " ",
  );

function coverageOfForeign(code: string): CountryCoverage {
  return {
    code,
    schoolHolidays: OPEN_HOLIDAYS_SCHOOL_COUNTRIES.has(code) ? "openholidays" : null,
    bankHolidays: "nager-date",
  };
}

const FRANCE_COVERAGE: CountryCoverage = {
  code: FRANCE,
  schoolHolidays: "education-nationale",
  bankHolidays: "api-gouv",
};

export const COUNTRIES: readonly CountryCoverage[] = [
  FRANCE_COVERAGE,
  ...NAGER_DATE_COUNTRIES.map(coverageOfForeign),
].sort((left, right) => left.code.localeCompare(right.code));

const BY_CODE = new Map(COUNTRIES.map((country) => [country.code, country]));

export function coverageOf(code: string): Option<CountryCoverage> {
  return Option.fromNullable(BY_CODE.get(code));
}
