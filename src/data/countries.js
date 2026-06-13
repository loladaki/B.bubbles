// Source: UN World Population Prospects 2024 (approximate projections).
// births / population in millions for years 2025, 2030, 2050.
export const YEARS = [2025, 2030, 2050];

export const CONTINENTS = {
  Asia:        { color: '#ff6fa0' },
  Africa:      { color: '#ff8b3d' },
  Europe:      { color: '#6b7fff' },
  'N. America':{ color: '#b85eff' },
  'S. America':{ color: '#4dd6a6' },
  Oceania:     { color: '#ffd24d' },
};

export const COUNTRIES = [
  // name, code, continent, flag, births[2025,2030,2050], pop[2025,2030,2050]
  { name: 'India',         code: 'IND', continent: 'Asia',       flag: '🇮🇳', births: [23.1, 22.0, 17.5], pop: [1450, 1515, 1670] },
  { name: 'China',         code: 'CHN', continent: 'Asia',       flag: '🇨🇳', births: [8.7,  7.5,  5.5 ], pop: [1410, 1390, 1310] },
  { name: 'Nigeria',       code: 'NGA', continent: 'Africa',     flag: '🇳🇬', births: [7.6,  8.2,  9.5 ], pop: [230,  265,  380 ] },
  { name: 'Pakistan',      code: 'PAK', continent: 'Asia',       flag: '🇵🇰', births: [6.9,  7.0,  6.8 ], pop: [250,  275,  365 ] },
  { name: 'DR Congo',      code: 'COD', continent: 'Africa',     flag: '🇨🇩', births: [4.6,  5.1,  6.8 ], pop: [109,  130,  215 ] },
  { name: 'Indonesia',     code: 'IDN', continent: 'Asia',       flag: '🇮🇩', births: [4.4,  4.2,  3.5 ], pop: [285,  295,  320 ] },
  { name: 'Ethiopia',      code: 'ETH', continent: 'Africa',     flag: '🇪🇹', births: [4.2,  4.4,  4.8 ], pop: [130,  150,  215 ] },
  { name: 'United States', code: 'USA', continent: 'N. America', flag: '🇺🇸', births: [3.7,  3.7,  3.6 ], pop: [345,  355,  380 ] },
  { name: 'Bangladesh',    code: 'BGD', continent: 'Asia',       flag: '🇧🇩', births: [3.4,  3.2,  2.6 ], pop: [175,  185,  200 ] },
  { name: 'Egypt',         code: 'EGY', continent: 'Africa',     flag: '🇪🇬', births: [2.5,  2.4,  2.3 ], pop: [116,  130,  165 ] },
  { name: 'Brazil',        code: 'BRA', continent: 'S. America', flag: '🇧🇷', births: [2.5,  2.3,  1.9 ], pop: [217,  222,  220 ] },
  { name: 'Tanzania',      code: 'TZA', continent: 'Africa',     flag: '🇹🇿', births: [2.4,  2.7,  3.7 ], pop: [70,   82,   130 ] },
  { name: 'Mexico',        code: 'MEX', continent: 'N. America', flag: '🇲🇽', births: [2.0,  1.9,  1.6 ], pop: [131,  137,  145 ] },
  { name: 'Philippines',   code: 'PHL', continent: 'Asia',       flag: '🇵🇭', births: [1.8,  1.7,  1.5 ], pop: [116,  125,  150 ] },
  { name: 'Uganda',        code: 'UGA', continent: 'Africa',     flag: '🇺🇬', births: [1.7,  1.9,  2.5 ], pop: [51,   60,   95  ] },
  { name: 'Sudan',         code: 'SDN', continent: 'Africa',     flag: '🇸🇩', births: [1.7,  1.8,  2.0 ], pop: [51,   58,   80  ] },
  { name: 'Kenya',         code: 'KEN', continent: 'Africa',     flag: '🇰🇪', births: [1.5,  1.5,  1.6 ], pop: [57,   65,   85  ] },
  { name: 'Angola',        code: 'AGO', continent: 'Africa',     flag: '🇦🇴', births: [1.4,  1.6,  2.2 ], pop: [38,   44,   70  ] },
  { name: 'Vietnam',       code: 'VNM', continent: 'Asia',       flag: '🇻🇳', births: [1.3,  1.2,  1.0 ], pop: [101,  105,  110 ] },
  { name: 'South Africa',  code: 'ZAF', continent: 'Africa',     flag: '🇿🇦', births: [1.2,  1.2,  1.1 ], pop: [64,   67,   75  ] },
  { name: 'Russia',        code: 'RUS', continent: 'Europe',     flag: '🇷🇺', births: [1.2,  1.1,  1.0 ], pop: [144,  142,  130 ] },
  { name: 'Iran',          code: 'IRN', continent: 'Asia',       flag: '🇮🇷', births: [1.1,  1.0,  0.85], pop: [92,   96,   105 ] },
  { name: 'Türkiye',       code: 'TUR', continent: 'Asia',       flag: '🇹🇷', births: [1.1,  1.0,  0.85], pop: [87,   90,   95  ] },
  { name: 'Japan',         code: 'JPN', continent: 'Asia',       flag: '🇯🇵', births: [0.75, 0.65, 0.55], pop: [124,  119,  105 ] },
  { name: 'Germany',       code: 'DEU', continent: 'Europe',     flag: '🇩🇪', births: [0.71, 0.68, 0.62], pop: [84,   83,   79  ] },
  { name: 'United Kingdom',code: 'GBR', continent: 'Europe',     flag: '🇬🇧', births: [0.68, 0.66, 0.62], pop: [69,   71,   74  ] },
  { name: 'France',        code: 'FRA', continent: 'Europe',     flag: '🇫🇷', births: [0.66, 0.62, 0.58], pop: [66,   67,   67  ] },
  { name: 'Australia',     code: 'AUS', continent: 'Oceania',    flag: '🇦🇺', births: [0.30, 0.30, 0.31], pop: [27,   29,   34  ] },
];

// Linear interpolation between known years.
export function interpolate(values, year) {
  if (year <= YEARS[0]) return values[0];
  if (year >= YEARS[YEARS.length - 1]) return values[values.length - 1];
  for (let i = 0; i < YEARS.length - 1; i++) {
    const y0 = YEARS[i], y1 = YEARS[i + 1];
    if (year >= y0 && year <= y1) {
      const t = (year - y0) / (y1 - y0);
      return values[i] + t * (values[i + 1] - values[i]);
    }
  }
  return values[0];
}
