// Fetch solar-resource and temperature data from NASA POWER (free, CORS-enabled).
// Endpoint: https://power.larc.nasa.gov/docs/services/api/temporal/daily/
// Parameters:
//   ALLSKY_SFC_SW_DWN  - Global Horizontal Irradiance (kWh/m²/day)
//   ALLSKY_SFC_SW_DNI  - Direct Normal Irradiance (kWh/m²/day)
//   ALLSKY_SFC_SW_DIFF - Diffuse Horizontal Irradiance (kWh/m²/day)
//   T2M                - 2-metre air temperature (°C, daily mean)

export interface ClimateResult {
  latitude: number;
  longitude: number;
  dateISO: string;
  /** Peak-hour equivalents converted back to W/m² at solar noon (educational approx). */
  dni: number;
  dhi: number;
  ghi: number;
  ambientTempC: number;
  raw: {
    ghiKwhDay: number;
    dniKwhDay: number;
    dhiKwhDay: number;
    tempC: number;
  };
}

function dayOfYearToDate(year: number, doy: number): Date {
  const d = new Date(Date.UTC(year, 0, 1));
  d.setUTCDate(doy);
  return d;
}

function formatPowerDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

// Convert daily kWh/m² to an approximate solar-noon W/m² assuming a
// sinusoidal daylight envelope of ~10 effective peak-sun-hours.
// This is *educational* — enough to seed reasonable sliders.
function kwhDayToPeakIrradiance(kwhPerDay: number): number {
  const peakSunHours = Math.max(kwhPerDay, 0);
  const peakIrradiance = peakSunHours * 1000 / 6; // spread over 6 h of strong sun
  return Math.min(peakIrradiance, 1100);
}

export async function fetchClimateFor(
  latitude: number,
  longitude: number,
  dayOfYear: number,
  year = 2023,
  signal?: AbortSignal,
): Promise<ClimateResult> {
  const date = dayOfYearToDate(year, dayOfYear);
  const dateStr = formatPowerDate(date);

  const params = new URLSearchParams({
    parameters: 'ALLSKY_SFC_SW_DWN,ALLSKY_SFC_SW_DNI,ALLSKY_SFC_SW_DIFF,T2M',
    community: 'RE',
    longitude: longitude.toFixed(4),
    latitude: latitude.toFixed(4),
    start: dateStr,
    end: dateStr,
    format: 'JSON',
  });

  const url = `https://power.larc.nasa.gov/api/temporal/daily/point?${params.toString()}`;

  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`NASA POWER request failed: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  const p = data?.properties?.parameter;
  if (!p) throw new Error('Unexpected NASA POWER response shape');

  const ghiKwhDay = Number(p.ALLSKY_SFC_SW_DWN?.[dateStr] ?? 0);
  const dniKwhDay = Number(p.ALLSKY_SFC_SW_DNI?.[dateStr] ?? 0);
  const dhiKwhDay = Number(p.ALLSKY_SFC_SW_DIFF?.[dateStr] ?? 0);
  const tempC = Number(p.T2M?.[dateStr] ?? 25);

  // POWER uses -999 to signal missing data. Treat it as zero for irradiance.
  const clean = (v: number) => (v < -100 ? 0 : v);

  return {
    latitude,
    longitude,
    dateISO: date.toISOString().slice(0, 10),
    dni: kwhDayToPeakIrradiance(clean(dniKwhDay)),
    dhi: kwhDayToPeakIrradiance(clean(dhiKwhDay)),
    ghi: kwhDayToPeakIrradiance(clean(ghiKwhDay)),
    ambientTempC: clean(tempC) === 0 && tempC < -100 ? 25 : clean(tempC),
    raw: {
      ghiKwhDay: clean(ghiKwhDay),
      dniKwhDay: clean(dniKwhDay),
      dhiKwhDay: clean(dhiKwhDay),
      tempC: clean(tempC),
    },
  };
}

export function formatLatLon(lat: number, lon: number): string {
  const latDir = lat >= 0 ? 'N' : 'S';
  const lonDir = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(2)}°${latDir}, ${Math.abs(lon).toFixed(2)}°${lonDir}`;
}
