export interface CountryGroup {
  id: string;
  name: string;
  countryCodes: string[]; // ISO 3166-1 alpha-2, uppercase — same format as
                          // AdSquadPresetData.geoCountryCodes / MetaAdSetPresetData.geoCountryCodes
  createdAt: string;
}
