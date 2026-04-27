// Maps uppercase country names (as returned by KingsRoad) to ISO-2 codes.
// Snapchat stats use ISO-2 codes for the country breakdown dimension.
const NAME_TO_CODE: Record<string, string> = {
  "AFGHANISTAN": "AF", "ALBANIA": "AL", "ALGERIA": "DZ", "ANDORRA": "AD",
  "ANGOLA": "AO", "ARGENTINA": "AR", "ARMENIA": "AM", "AUSTRALIA": "AU",
  "AUSTRIA": "AT", "AZERBAIJAN": "AZ", "BAHRAIN": "BH", "BANGLADESH": "BD",
  "BELARUS": "BY", "BELGIUM": "BE", "BOLIVIA": "BO", "BOSNIA AND HERZEGOVINA": "BA",
  "BOTSWANA": "BW", "BRAZIL": "BR", "BULGARIA": "BG", "CAMBODIA": "KH",
  "CAMEROON": "CM", "CANADA": "CA", "CHILE": "CL", "CHINA": "CN",
  "COLOMBIA": "CO", "COSTA RICA": "CR", "CROATIA": "HR", "CUBA": "CU",
  "CYPRUS": "CY", "CZECH REPUBLIC": "CZ", "CZECHIA": "CZ", "DENMARK": "DK",
  "DOMINICAN REPUBLIC": "DO", "ECUADOR": "EC", "EGYPT": "EG", "EL SALVADOR": "SV",
  "ESTONIA": "EE", "ETHIOPIA": "ET", "FINLAND": "FI", "FRANCE": "FR",
  "GEORGIA": "GE", "GERMANY": "DE", "GHANA": "GH", "GREECE": "GR",
  "GUATEMALA": "GT", "HONDURAS": "HN", "HONG KONG": "HK", "HUNGARY": "HU",
  "ICELAND": "IS", "INDIA": "IN", "INDONESIA": "ID", "IRAQ": "IQ",
  "IRELAND": "IE", "ISRAEL": "IL", "ITALY": "IT", "JAMAICA": "JM",
  "JAPAN": "JP", "JORDAN": "JO", "KAZAKHSTAN": "KZ", "KENYA": "KE",
  "KUWAIT": "KW", "LATVIA": "LV", "LEBANON": "LB", "LIBYA": "LY",
  "LIECHTENSTEIN": "LI", "LITHUANIA": "LT", "LUXEMBOURG": "LU", "MALAYSIA": "MY",
  "MALTA": "MT", "MEXICO": "MX", "MOLDOVA": "MD", "MONGOLIA": "MN",
  "MONTENEGRO": "ME", "MOROCCO": "MA", "MOZAMBIQUE": "MZ", "MYANMAR": "MM",
  "NEPAL": "NP", "NETHERLANDS": "NL", "NEW ZEALAND": "NZ", "NICARAGUA": "NI",
  "NIGERIA": "NG", "NORTH MACEDONIA": "MK", "NORWAY": "NO", "OMAN": "OM",
  "PAKISTAN": "PK", "PANAMA": "PA", "PARAGUAY": "PY", "PERU": "PE",
  "PHILIPPINES": "PH", "POLAND": "PL", "PORTUGAL": "PT", "PUERTO RICO": "PR",
  "QATAR": "QA", "ROMANIA": "RO", "RUSSIA": "RU", "RUSSIAN FEDERATION": "RU",
  "SAUDI ARABIA": "SA", "SENEGAL": "SN", "SERBIA": "RS", "SINGAPORE": "SG",
  "SLOVAKIA": "SK", "SLOVENIA": "SI", "SOUTH AFRICA": "ZA", "SOUTH KOREA": "KR",
  "SPAIN": "ES", "SRI LANKA": "LK", "SWEDEN": "SE", "SWITZERLAND": "CH",
  "TAIWAN": "TW", "TANZANIA": "TZ", "THAILAND": "TH", "TRINIDAD AND TOBAGO": "TT",
  "TUNISIA": "TN", "TURKEY": "TR", "UKRAINE": "UA", "UNITED ARAB EMIRATES": "AE",
  "UNITED KINGDOM": "GB", "UNITED STATES": "US", "URUGUAY": "UY",
  "UZBEKISTAN": "UZ", "VENEZUELA": "VE", "VIETNAM": "VN", "YEMEN": "YE",
  "ZIMBABWE": "ZW",
};

const CODE_TO_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(NAME_TO_CODE).map(([name, code]) => [code, name])
);

export function countryNameToCode(name: string): string {
  return NAME_TO_CODE[name.toUpperCase().trim()] ?? "";
}

export function countryCodeToName(code: string): string {
  return CODE_TO_NAME[code.toUpperCase()] ?? code;
}
