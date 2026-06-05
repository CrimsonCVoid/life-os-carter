import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Server-side proxy for Open-Meteo current + daily forecast.
 *
 * Open-Meteo is free and keyless, so unlike the other Wave 6 integrations
 * this route is live, not dormant. Bearer-gated via requireUser() so the
 * iOS client (and web session) reach it the same way as every other
 * /api/* route — the middleware only validates header *shape*.
 *
 * Returns a compact normalized snapshot the client can render without
 * knowing Open-Meteo's response layout.
 */

const OPEN_METEO = "https://api.open-meteo.com/v1/forecast";

export type WeatherResponse = {
  tempC: number | null;
  tempF: number | null;
  conditionCode: number | null;
  conditionText: string;
  humidityPct: number | null;
  windKph: number | null;
  daily: {
    high: number | null;
    low: number | null;
    precipitationProbabilityPct: number | null;
  };
};

// WMO weather interpretation codes → short human label.
// https://open-meteo.com/en/docs (WMO Weather interpretation codes table)
function conditionText(code: number | null | undefined): string {
  if (code == null) return "Unknown";
  if (code === 0) return "Clear";
  if (code === 1) return "Mostly clear";
  if (code === 2) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if (code === 45 || code === 48) return "Fog";
  if (code >= 51 && code <= 57) return "Drizzle";
  if (code >= 61 && code <= 67) return "Rain";
  if (code >= 71 && code <= 77) return "Snow";
  if (code >= 80 && code <= 82) return "Rain showers";
  if (code === 85 || code === 86) return "Snow showers";
  if (code === 95) return "Thunderstorm";
  if (code === 96 || code === 99) return "Thunderstorm with hail";
  return "Unknown";
}

type OpenMeteoCurrent = {
  temperature_2m?: number;
  relative_humidity_2m?: number;
  weather_code?: number;
  wind_speed_10m?: number;
};
type OpenMeteoDaily = {
  temperature_2m_max?: number[];
  temperature_2m_min?: number[];
  precipitation_probability_max?: number[];
};
type OpenMeteoResponse = {
  current?: OpenMeteoCurrent;
  daily?: OpenMeteoDaily;
};

function num(v: number | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function firstNum(arr: number[] | undefined): number | null {
  const v = arr?.[0];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export async function GET(req: Request): Promise<NextResponse> {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const lat = Number(searchParams.get("lat"));
  const lon = Number(searchParams.get("lon"));
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    lat < -90 ||
    lat > 90 ||
    lon < -180 ||
    lon > 180
  ) {
    return NextResponse.json({ error: "invalid lat/lon" }, { status: 400 });
  }
  const date = searchParams.get("date");

  const url = new URL(OPEN_METEO);
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lon));
  url.searchParams.set(
    "current",
    "temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m"
  );
  url.searchParams.set(
    "daily",
    "temperature_2m_max,temperature_2m_min,precipitation_probability_max"
  );
  url.searchParams.set("wind_speed_unit", "kmh");
  url.searchParams.set("timezone", "auto");
  // When a specific date is requested, pin the daily window to it; otherwise
  // Open-Meteo defaults to today + forecast and daily[0] is today.
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    url.searchParams.set("start_date", date);
    url.searchParams.set("end_date", date);
  }

  let res: Response;
  try {
    res = await fetch(url.toString());
  } catch {
    return NextResponse.json({ error: "weather failed" }, { status: 502 });
  }
  if (!res.ok) {
    return NextResponse.json(
      { error: "weather failed", status: res.status },
      { status: 502 }
    );
  }

  const data = (await res.json()) as OpenMeteoResponse;
  const c = data.current ?? {};
  const tempC = num(c.temperature_2m);

  const body: WeatherResponse = {
    tempC,
    tempF: tempC == null ? null : Math.round((tempC * 9) / 5 + 32),
    conditionCode: num(c.weather_code),
    conditionText: conditionText(c.weather_code),
    humidityPct: num(c.relative_humidity_2m),
    windKph: num(c.wind_speed_10m),
    daily: {
      high: firstNum(data.daily?.temperature_2m_max),
      low: firstNum(data.daily?.temperature_2m_min),
      precipitationProbabilityPct: firstNum(
        data.daily?.precipitation_probability_max
      ),
    },
  };
  return NextResponse.json(body);
}
