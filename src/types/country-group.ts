export interface CountryGroup {
  id: string;
  name: string;
  countryCodes: string[]; // ISO 3166-1 alpha-2, uppercase — same format as
                          // AdSquadPresetData.geoCountryCodes / MetaAdSetPresetData.geoCountryCodes
  isWorldwide?: boolean; // true = target every country (Meta: geo_locations.country_groups: ["worldwide"]);
                         // countryCodes may be empty when this is set
  excludedCountryCodes?: string[]; // countries to exclude from targeting (Meta: geo_locations.excluded_countries)
  createdAt: string;
}
