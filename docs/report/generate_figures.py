"""Generate the figure set used in the IEEE-style report.

Reproduces (in Python) the same physics the TypeScript simulator uses:
  - single-diode inspired I(V) Newton solver
  - isotropic-sky POA irradiance
  - NOCT cell temperature estimate
  - Perturb-and-Observe MPPT

Run from repo root:
    python3 docs/report/generate_figures.py
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "public" / "data"
OUT = ROOT / "docs" / "report" / "figures"
OUT.mkdir(parents=True, exist_ok=True)

# ---------- style ------------------------------------------------------------

plt.rcParams.update({
    "figure.dpi": 150,
    "savefig.dpi": 200,
    "savefig.bbox": "tight",
    "font.family": "serif",
    "font.size": 10,
    "axes.grid": True,
    "grid.alpha": 0.3,
    "axes.spines.top": False,
    "axes.spines.right": False,
})

ACCENT = "#2b65c7"
WARM = "#e08a2a"
GREEN = "#2f9167"
RED = "#c44a4a"
GREY = "#4a4a4a"

# ---------- physics ----------------------------------------------------------

K_BOLTZ = 1.380649e-23
Q_CHARGE = 1.602176634e-19
G_REF = 1000.0

DEFAULT_MODULE = {
    "iscRef": 5.0, "vocRef": 22.0, "impRef": 4.55, "vmpRef": 17.6,
    "ns": 36, "alphaIsc": 0.0005, "betaVoc": -0.0032, "gammaPmax": -0.0045,
    "n": 1.3, "rs": 0.15, "rsh": 250.0, "areaM2": 0.65, "noct": 45.0,
    "etaRef": 0.155,
}


def thermal_voltage(n, ns, t_c):
    return n * ns * K_BOLTZ * (t_c + 273.15) / Q_CHARGE


def photo_current(params, G, t_c):
    return params["iscRef"] * (G / G_REF) * (1 + params["alphaIsc"] * (t_c - 25))


def voc_at(params, G, t_c):
    voc0 = params["vocRef"] + params["betaVoc"] * params["vocRef"] * (t_c - 25)
    ratio = max(G / G_REF, 1e-3)
    return max(voc0 * (1 + 0.06 * math.log(ratio)), 0.5)


def current_at_voltage(params, G, t_c, v):
    if G <= 0:
        return 0.0
    iph = photo_current(params, G, t_c)
    voc = voc_at(params, G, t_c)
    vt = thermal_voltage(params["n"], params["ns"], t_c)
    i0 = iph / (math.exp(voc / vt) - 1) if voc > 0 else 1e-10
    I = iph
    for _ in range(10):
        vd = v + I * params["rs"]
        exp_t = math.exp(min(vd / vt, 60))
        f = iph - i0 * (exp_t - 1) - vd / params["rsh"] - I
        df = -i0 * params["rs"] / vt * exp_t - params["rs"] / params["rsh"] - 1
        step = f / df
        I -= step
        if abs(step) < 1e-6:
            break
    return max(0.0, min(I, iph))


def iv_curve(params, G, t_c, n_pts=120):
    voc = voc_at(params, max(G, 1), t_c) if G > 0 else 0
    v = np.linspace(0, voc, n_pts)
    i = np.array([current_at_voltage(params, G, t_c, float(vi)) for vi in v])
    p = v * i
    return v, i, p


def poa_breakdown(dni, dhi, ghi, tilt_deg, cos_inc, albedo=0.2):
    tilt = math.radians(tilt_deg)
    beam = dni * max(0.0, cos_inc)
    diffuse = dhi * (1 + math.cos(tilt)) / 2
    reflected = albedo * ghi * (1 - math.cos(tilt)) / 2
    return beam, diffuse, reflected


def declination(doy):
    return 23.45 * math.sin(math.radians(360 * (284 + doy) / 365))


def solar_altitude(lat_deg, doy, hour):
    dec = math.radians(declination(doy))
    hra = math.radians(15 * (hour - 12))
    phi = math.radians(lat_deg)
    cz = math.sin(phi) * math.sin(dec) + math.cos(phi) * math.cos(dec) * math.cos(hra)
    return math.degrees(math.asin(max(-1, min(1, cz))))


def solar_azimuth(lat_deg, doy, hour):
    dec = math.radians(declination(doy))
    hra = math.radians(15 * (hour - 12))
    phi = math.radians(lat_deg)
    alt = math.radians(solar_altitude(lat_deg, doy, hour))
    if math.cos(alt) < 1e-6:
        return 0.0
    cos_az = (math.sin(phi) * math.sin(alt) - math.sin(dec)) / (math.cos(phi) * math.cos(alt))
    az = math.degrees(math.acos(max(-1, min(1, cos_az))))
    return az if hra >= 0 else -az


def incidence_cos(lat_deg, doy, hour, tilt_deg, az_panel_deg=0.0):
    alt = math.radians(solar_altitude(lat_deg, doy, hour))
    az = math.radians(solar_azimuth(lat_deg, doy, hour))
    tilt = math.radians(tilt_deg)
    az_p = math.radians(az_panel_deg)
    sun = (math.cos(alt) * math.sin(az), math.sin(alt), math.cos(alt) * math.cos(az))
    n = (math.sin(tilt) * math.sin(az_p), math.cos(tilt), math.sin(tilt) * math.cos(az_p))
    return max(0.0, sum(a * b for a, b in zip(sun, n)))


# ---------- figures ----------------------------------------------------------

def fig_iv_pv_irradiance():
    """I-V and P-V curves at several irradiance levels."""
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(9.6, 3.6))
    for G, color, label in [
        (1000, ACCENT, "1000 W/m²"),
        (750, GREEN,  "750 W/m²"),
        (500, WARM,   "500 W/m²"),
        (250, RED,    "250 W/m²"),
    ]:
        v, i, p = iv_curve(DEFAULT_MODULE, G, 25)
        ax1.plot(v, i, color=color, linewidth=1.8, label=label)
        ax2.plot(v, p, color=color, linewidth=1.8, label=label)
        mpp = int(np.argmax(p))
        ax1.plot(v[mpp], i[mpp], 'o', color=color, markersize=5)
        ax2.plot(v[mpp], p[mpp], 'o', color=color, markersize=5)
    ax1.set_xlabel("Voltage V (V)")
    ax1.set_ylabel("Current I (A)")
    ax1.set_title("I–V curves — irradiance sweep at 25 °C")
    ax1.legend(loc="lower left", fontsize=8)
    ax2.set_xlabel("Voltage V (V)")
    ax2.set_ylabel("Power P (W)")
    ax2.set_title("P–V curves — irradiance sweep at 25 °C")
    ax2.legend(loc="upper left", fontsize=8)
    fig.tight_layout()
    fig.savefig(OUT / "fig_iv_pv_irradiance.png")
    plt.close(fig)


def fig_iv_pv_temperature():
    """I-V and P-V curves at several cell temperatures."""
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(9.6, 3.6))
    for T, color, label in [
        (15,  ACCENT, "15 °C"),
        (25,  GREEN,  "25 °C (STC)"),
        (45,  WARM,   "45 °C"),
        (65,  RED,    "65 °C"),
    ]:
        v, i, p = iv_curve(DEFAULT_MODULE, 1000, T)
        ax1.plot(v, i, color=color, linewidth=1.8, label=label)
        ax2.plot(v, p, color=color, linewidth=1.8, label=label)
        mpp = int(np.argmax(p))
        ax1.plot(v[mpp], i[mpp], 'o', color=color, markersize=5)
        ax2.plot(v[mpp], p[mpp], 'o', color=color, markersize=5)
    ax1.set_xlabel("Voltage V (V)")
    ax1.set_ylabel("Current I (A)")
    ax1.set_title("I–V curves — temperature sweep at 1000 W/m²")
    ax1.legend(loc="lower left", fontsize=8)
    ax2.set_xlabel("Voltage V (V)")
    ax2.set_ylabel("Power P (W)")
    ax2.set_title("P–V curves — temperature sweep at 1000 W/m²")
    ax2.legend(loc="upper left", fontsize=8)
    fig.tight_layout()
    fig.savefig(OUT / "fig_iv_pv_temperature.png")
    plt.close(fig)


def fig_shading_bypass():
    """Bypass-diode on vs off, with one substring at 20% irradiance."""
    curves = []
    for Gs in [1000, 200, 1000]:  # middle substring shaded
        curves.append(iv_curve(DEFAULT_MODULE, Gs, 35, n_pts=80))
    # Series combination: at each I, sum V across substrings
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(9.6, 3.6))
    for bypass_on, color, label in [(True, ACCENT, "Bypass ON"), (False, RED, "Bypass OFF")]:
        n = 120
        I = np.linspace(0, 5.2, n)
        V_total = np.zeros_like(I)
        for v, i_ss, _ in curves:
            # invert each substring: voltage at given current
            V_ss = np.zeros_like(I)
            for k, Ik in enumerate(I):
                # find voltage for this current
                # iv stored V ascending, i descending — do linear search
                found = False
                for j in range(len(i_ss) - 1):
                    if i_ss[j] >= Ik >= i_ss[j + 1]:
                        di = i_ss[j] - i_ss[j + 1]
                        t = (i_ss[j] - Ik) / di if di > 0 else 0
                        V_ss[k] = v[j] + t * (v[j + 1] - v[j])
                        found = True
                        break
                if not found:
                    if Ik >= i_ss[0]:
                        V_ss[k] = -0.7 if bypass_on else 0.0
                    else:
                        V_ss[k] = v[-1]
            V_total += V_ss
        V_total = np.maximum(V_total, 0)
        P_total = V_total * I
        ax1.plot(V_total, I, color=color, linewidth=1.8, label=label)
        ax2.plot(V_total, P_total, color=color, linewidth=1.8, label=label)
        mpp = int(np.argmax(P_total))
        ax2.plot(V_total[mpp], P_total[mpp], 'o', color=color, markersize=6,
                 label=f"{label} · Pmax = {P_total[mpp]:.1f} W")
    ax1.set_xlabel("String voltage V (V)")
    ax1.set_ylabel("String current I (A)")
    ax1.set_title("Partial shading (substring 2 at 20 % G)")
    ax1.legend(loc="best", fontsize=8)
    ax2.set_xlabel("String voltage V (V)")
    ax2.set_ylabel("Power P (W)")
    ax2.set_title("Bypass diode recovers most of the power")
    ax2.legend(loc="upper left", fontsize=8)
    fig.tight_layout()
    fig.savefig(OUT / "fig_shading_bypass.png")
    plt.close(fig)


def fig_mppt_trajectory():
    """Perturb & Observe MPPT homing in on Pmax."""
    v_arr, i_arr, p_arr = iv_curve(DEFAULT_MODULE, 900, 35, n_pts=200)
    # P&O simulation
    dv = 0.25
    v_now = 5.0
    history = []
    direction = 1
    prev_v = v_now
    prev_p = 0.0
    for step in range(90):
        p_now = np.interp(v_now, v_arr, p_arr)
        if step > 0:
            dP = p_now - prev_p
            if dP < 0:
                direction = -direction
        history.append((step, v_now, p_now))
        prev_v = v_now
        prev_p = p_now
        v_now = max(0.1, min(v_now + direction * dv, v_arr[-1] * 0.99))
    steps = np.array([h[0] for h in history])
    vs = np.array([h[1] for h in history])
    ps = np.array([h[2] for h in history])
    mpp_idx = int(np.argmax(p_arr))

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(9.6, 3.6))
    ax1.plot(v_arr, p_arr, color=GREY, linewidth=1.6, label="P–V curve")
    ax1.plot(v_arr[mpp_idx], p_arr[mpp_idx], '*', color=WARM, markersize=14, label=f"MPP ({p_arr[mpp_idx]:.1f} W)")
    ax1.plot(vs, ps, 'o-', color=GREEN, markersize=3, linewidth=0.8, alpha=0.75, label="P&O trajectory")
    ax1.set_xlabel("Voltage V (V)")
    ax1.set_ylabel("Power P (W)")
    ax1.set_title("MPPT (Perturb & Observe) on the P–V curve")
    ax1.legend(loc="upper left", fontsize=8)

    ax2.plot(steps, ps, color=GREEN, linewidth=1.5)
    ax2.axhline(p_arr[mpp_idx], color=WARM, linestyle="--", linewidth=1, label=f"Pmax = {p_arr[mpp_idx]:.1f} W")
    ax2.set_xlabel("MPPT iteration")
    ax2.set_ylabel("Tracked power (W)")
    ax2.set_title("Convergence toward Pmax")
    ax2.legend(loc="lower right", fontsize=8)
    fig.tight_layout()
    fig.savefig(OUT / "fig_mppt_trajectory.png")
    plt.close(fig)


def fig_daily_poa():
    """Daily POA profile (June solstice vs December solstice) at NIT Trichy."""
    lat = 10.759
    fig, ax = plt.subplots(figsize=(9.6, 3.6))
    hours = np.linspace(0, 24, 97)
    for doy, tilt, color, label in [
        (172, 10, WARM,   "Jun solstice · tilt 10°"),
        (172, 28, RED,    "Jun solstice · tilt 28°"),
        (355, 10, ACCENT, "Dec solstice · tilt 10°"),
        (355, 28, GREEN,  "Dec solstice · tilt 28°"),
    ]:
        poa = []
        for h in hours:
            alt = solar_altitude(lat, doy, h)
            if alt <= 0:
                poa.append(0)
                continue
            alt_factor = math.sin(math.radians(alt))
            dni, dhi, ghi = 900 * alt_factor, 100 * alt_factor, 1000 * alt_factor
            cos_i = incidence_cos(lat, doy, h, tilt)
            b, d, r = poa_breakdown(dni, dhi, ghi, tilt, cos_i)
            poa.append(b + d + r)
        ax.plot(hours, poa, color=color, linewidth=1.6, label=label)
    ax.set_xlabel("Solar time (h)")
    ax.set_ylabel("POA irradiance (W/m²)")
    ax.set_title("Plane-of-array irradiance at NIT Trichy (10.76 °N)")
    ax.legend(loc="upper right", fontsize=8)
    ax.set_xlim(0, 24)
    ax.set_xticks([0, 4, 8, 12, 16, 20, 24])
    fig.tight_layout()
    fig.savefig(OUT / "fig_daily_poa.png")
    plt.close(fig)


def fig_nasa_monthly():
    """Monthly climatology from NASA POWER for NIT Trichy."""
    with open(DATA / "nasa-power-nit-trichy-climatology.json") as f:
        clim = json.load(f)
    p = clim["properties"]["parameter"]
    months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"]
    ghi = [p["ALLSKY_SFC_SW_DWN"][m]  for m in months]
    dni = [p["ALLSKY_SFC_SW_DNI"][m]  for m in months]
    dhi = [p["ALLSKY_SFC_SW_DIFF"][m] for m in months]
    t2m = [p["T2M"][m] for m in months]

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(9.6, 3.6))
    x = np.arange(len(months))
    w = 0.27
    ax1.bar(x - w, ghi, w, color=ACCENT, label="GHI")
    ax1.bar(x,      dni, w, color=WARM,  label="DNI")
    ax1.bar(x + w,  dhi, w, color=GREEN, label="DHI")
    ax1.set_xticks(x)
    ax1.set_xticklabels(months, fontsize=8)
    ax1.set_ylabel("kWh/m²/day")
    ax1.set_title("Monthly solar resource at NIT Trichy (NASA POWER)")
    ax1.legend(loc="upper right", fontsize=8)

    ax2.plot(months, t2m, color=RED, marker="o", linewidth=1.8)
    ax2.set_ylabel("T₂ₘ (°C)")
    ax2.set_title(f"Monthly mean air temperature (annual = {p['T2M']['ANN']:.1f} °C)")
    for i, v in enumerate(t2m):
        ax2.annotate(f"{v:.1f}", (i, v), textcoords="offset points", xytext=(0, 6),
                     ha="center", fontsize=7, color=GREY)
    fig.tight_layout()
    fig.savefig(OUT / "fig_nasa_monthly.png")
    plt.close(fig)


def fig_nasa_daily():
    """Full-year daily GHI/DNI/DHI for NIT Trichy from NASA POWER 2023."""
    with open(DATA / "nasa-power-nit-trichy-2023.json") as f:
        daily = json.load(f)
    p = daily["properties"]["parameter"]
    keys = sorted(p["ALLSKY_SFC_SW_DWN"].keys())
    ghi = np.array([p["ALLSKY_SFC_SW_DWN"][k] for k in keys])
    dni = np.array([p["ALLSKY_SFC_SW_DNI"][k] for k in keys])
    dhi = np.array([p["ALLSKY_SFC_SW_DIFF"][k] for k in keys])
    t2m = np.array([p["T2M"][k] for k in keys])
    doy = np.arange(1, len(keys) + 1)

    fig, ax = plt.subplots(figsize=(9.6, 3.6))
    ax.plot(doy, ghi, color=ACCENT, linewidth=0.8, label="GHI", alpha=0.9)
    ax.plot(doy, dni, color=WARM,   linewidth=0.8, label="DNI", alpha=0.9)
    ax.plot(doy, dhi, color=GREEN,  linewidth=0.8, label="DHI", alpha=0.9)
    # 7-day rolling for readability
    def ma(x, w=7):
        return np.convolve(x, np.ones(w)/w, mode="same")
    ax.plot(doy, ma(ghi), color=ACCENT, linewidth=1.8)
    ax.plot(doy, ma(dni), color=WARM,   linewidth=1.8)
    ax.plot(doy, ma(dhi), color=GREEN,  linewidth=1.8)
    ax.set_xlabel("Day of year (2023)")
    ax.set_ylabel("kWh/m²/day")
    ax.set_title(f"Daily solar resource at NIT Trichy 2023 (mean GHI = {ghi.mean():.2f}, DNI = {dni.mean():.2f})")
    ax.set_xlim(1, 365)
    ax.legend(loc="lower right", fontsize=8)
    fig.tight_layout()
    fig.savefig(OUT / "fig_nasa_daily.png")
    plt.close(fig)


def fig_tilt_sweep():
    """Annual yield vs panel tilt at NIT Trichy latitude."""
    lat = 10.759
    tilts = np.arange(0, 56, 2)
    annual = []
    for t in tilts:
        total = 0.0
        for doy in range(1, 366):
            day_sum = 0.0
            for h in np.arange(0, 24, 0.5):
                alt = solar_altitude(lat, doy, h)
                if alt <= 0:
                    continue
                f = math.sin(math.radians(alt))
                ci = incidence_cos(lat, doy, h, float(t))
                b, d, r = poa_breakdown(900 * f, 100 * f, 1000 * f, float(t), ci)
                day_sum += (b + d + r) * 0.5
            total += day_sum
        annual.append(total / 1000.0)
    annual = np.array(annual)
    best = int(np.argmax(annual))

    fig, ax = plt.subplots(figsize=(9.6, 3.6))
    ax.plot(tilts, annual, color=ACCENT, linewidth=1.8)
    ax.plot(tilts[best], annual[best], '*', color=WARM, markersize=16,
            label=f"Optimum tilt = {tilts[best]}°  ({annual[best]:.0f} kWh/m²/yr)")
    ax.axvline(lat, color=GREY, linestyle="--", linewidth=1, label=f"Latitude = {lat}°")
    ax.set_xlabel("Panel tilt β (°)")
    ax.set_ylabel("Annual POA irradiation (kWh/m²/yr)")
    ax.set_title("Annual POA vs tilt at NIT Trichy (south-facing)")
    ax.legend(loc="lower center", fontsize=8)
    fig.tight_layout()
    fig.savefig(OUT / "fig_tilt_sweep.png")
    plt.close(fig)


def fig_solar_angles():
    """Solar altitude and azimuth over a day at NIT Trichy, three seasons."""
    lat = 10.759
    hours = np.linspace(4, 20, 161)
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(9.6, 3.6))
    for doy, color, label in [
        (80,  ACCENT, "Mar equinox"),
        (172, WARM,   "Jun solstice"),
        (266, GREEN,  "Sep equinox"),
        (355, RED,    "Dec solstice"),
    ]:
        alts = [solar_altitude(lat, doy, h) for h in hours]
        azs  = [solar_azimuth(lat, doy, h) for h in hours]
        ax1.plot(hours, alts, color=color, linewidth=1.8, label=label)
        ax2.plot(hours, azs,  color=color, linewidth=1.8, label=label)
    ax1.set_xlabel("Solar time (h)")
    ax1.set_ylabel("Altitude α (°)")
    ax1.set_title("Solar altitude at NIT Trichy")
    ax1.axhline(0, color=GREY, linewidth=0.8)
    ax1.legend(loc="upper right", fontsize=8)
    ax2.set_xlabel("Solar time (h)")
    ax2.set_ylabel("Azimuth (° from south)")
    ax2.set_title("Solar azimuth at NIT Trichy")
    ax2.axhline(0, color=GREY, linewidth=0.8)
    ax2.legend(loc="upper right", fontsize=8)
    fig.tight_layout()
    fig.savefig(OUT / "fig_solar_angles.png")
    plt.close(fig)


def fig_rooftop_potential():
    """Rooftop PV potential for NIT Trichy from OSM footprints."""
    with open(DATA / "nit-trichy-buildings.json") as f:
        dump = json.load(f)
    areas, heights = [], []
    names = []
    for el in dump["elements"]:
        tags = el.get("tags") or {}
        geo = el.get("geometry") or []
        if len(geo) < 3:
            continue
        # shoelace area in degrees -> approx m² at ~10.76° lat
        mlat = 111320
        mlon = 111320 * math.cos(math.radians(10.76))
        pts = [((g["lon"] - 78.817) * mlon, -(g["lat"] - 10.759) * mlat) for g in geo]
        s = 0.0
        for i in range(len(pts)):
            j = (i + 1) % len(pts)
            s += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1]
        A = abs(s) / 2
        areas.append(A)
        # height estimate
        if tags.get("height"):
            try:
                heights.append(float(tags["height"]))
            except ValueError:
                heights.append(7)
        elif tags.get("building:levels"):
            try:
                heights.append(float(tags["building:levels"]) * 3.2)
            except ValueError:
                heights.append(7)
        else:
            k = tags.get("building", "")
            heights.append({"hostel": 12, "residential": 12, "apartments": 12,
                            "university": 9, "school": 9, "college": 9,
                            "shed": 3.5, "garage": 3.5}.get(k, 7))
        names.append(tags.get("name", f"#{el.get('id')}"))

    areas = np.array(areas)
    heights = np.array(heights)
    usable = 0.6 * areas
    rating_w = usable * 180
    print(f"   total building footprint: {areas.sum()/1e4:.2f} ha")
    print(f"   usable rooftop area: {usable.sum()/1e4:.2f} ha")
    print(f"   estimated aggregate rooftop PV: {rating_w.sum()/1e6:.2f} MW")

    # Top 15 by area
    order = np.argsort(-usable)[:15]
    top_names = [names[i][:28] if names[i] else f"Building #{i}" for i in order]
    top_kw = rating_w[order] / 1000

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(9.6, 3.8))
    ax1.hist(usable, bins=40, color=ACCENT, alpha=0.85)
    ax1.set_xlabel("Usable roof area (m²)")
    ax1.set_ylabel("Building count")
    ax1.set_title(f"NIT Trichy roof-area distribution (n = {len(areas)})")

    ax2.barh(range(len(top_kw)), top_kw, color=WARM)
    ax2.set_yticks(range(len(top_kw)))
    ax2.set_yticklabels(top_names, fontsize=8)
    ax2.invert_yaxis()
    ax2.set_xlabel("Estimated rooftop PV (kW peak)")
    ax2.set_title(f"Top 15 buildings · aggregate = {rating_w.sum()/1e6:.1f} MW peak")
    fig.tight_layout()
    fig.savefig(OUT / "fig_rooftop_potential.png")
    plt.close(fig)
    return rating_w.sum() / 1e6, areas.sum()


def fig_architecture():
    """System architecture block diagram rendered via matplotlib patches."""
    fig, ax = plt.subplots(figsize=(9.6, 5.0))
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 6)
    ax.axis("off")

    def box(x, y, w, h, label, color):
        ax.add_patch(plt.Rectangle((x, y), w, h, facecolor=color, edgecolor="black", lw=1.4))
        ax.text(x + w/2, y + h/2, label, ha="center", va="center", fontsize=9)

    def arrow(x1, y1, x2, y2):
        ax.annotate("", xy=(x2, y2), xytext=(x1, y1),
                    arrowprops=dict(arrowstyle="->", lw=1.2, color="black"))

    ax.text(5, 5.75, "Interactive 3D Solar PV Simulator — module graph",
            ha="center", fontsize=11, fontweight="bold")

    # Left column: inputs
    box(0.2, 4.2, 2.4, 0.55, "User controls (sliders)", "#fbe2c6")
    box(0.2, 3.45, 2.4, 0.55, "Scenario presets", "#fbe2c6")
    box(0.2, 2.7, 2.4, 0.55, "NASA POWER climate", "#d9e8fb")
    box(0.2, 1.95, 2.4, 0.55, "OSM buildings + features", "#d9e8fb")
    box(0.2, 1.2, 2.4, 0.55, "Esri satellite tile", "#d9e8fb")

    # Centre column: state + core modules
    box(3.1, 4.2, 2.5, 0.55, "Zustand state store", "#fff4a8")
    box(3.1, 3.35, 2.5, 0.55, "Solar geometry module", "#c8e7cc")
    box(3.1, 2.55, 2.5, 0.55, "Irradiance (POA) module", "#c8e7cc")
    box(3.1, 1.75, 2.5, 0.55, "Single-diode PV model", "#c8e7cc")
    box(3.1, 0.95, 2.5, 0.55, "Shading + bypass diode", "#c8e7cc")
    box(3.1, 0.15, 2.5, 0.55, "MPPT (P&O / IncCond)", "#c8e7cc")

    # Right column: views
    box(6.2, 4.6, 3.5, 0.55, "World view (3D globe)", "#e3d1ec")
    box(6.2, 3.85, 3.5, 0.55, "NIT Trichy campus (3D)", "#e3d1ec")
    box(6.2, 3.1, 3.5, 0.55, "Panel scene + shadows", "#e3d1ec")
    box(6.2, 2.35, 3.5, 0.55, "I–V / P–V charts", "#e3d1ec")
    box(6.2, 1.6, 3.5, 0.55, "Shading & diode compare", "#e3d1ec")
    box(6.2, 0.85, 3.5, 0.55, "MPPT tracker view", "#e3d1ec")
    box(6.2, 0.1, 3.5, 0.55, "Metrics + theory panel", "#e3d1ec")

    # Arrows: inputs -> store/modules
    arrow(2.6, 4.45, 3.1, 4.45)
    arrow(2.6, 3.7, 3.1, 4.35)
    arrow(2.6, 2.95, 3.1, 2.8)
    arrow(2.6, 2.2, 3.1, 1.95)
    arrow(2.6, 1.45, 3.1, 0.95)

    # Modules -> views (right side)
    arrow(5.6, 3.6, 6.2, 3.3)
    arrow(5.6, 2.8, 6.2, 2.5)
    arrow(5.6, 2.0, 6.2, 2.5)
    arrow(5.6, 1.2, 6.2, 1.85)
    arrow(5.6, 0.4, 6.2, 1.1)
    arrow(5.6, 4.4, 6.2, 4.2)
    arrow(5.6, 4.4, 6.2, 3.6)

    fig.tight_layout()
    fig.savefig(OUT / "fig_architecture.png")
    plt.close(fig)


def fig_fdata_summary():
    """Key summary numbers as a styled panel."""
    fig, ax = plt.subplots(figsize=(9.6, 2.4))
    ax.axis("off")
    rows = [
        ("Annual mean GHI (NIT Trichy)", "5.55 kWh/m²/day"),
        ("Annual mean DNI",               "3.64 kWh/m²/day"),
        ("Annual mean T₂ₘ",                 "27.6 °C"),
        ("Optimum south-facing tilt",      "≈ 10° (near-equatorial)"),
        ("Buildings from OSM",             "308 footprints"),
        ("Total usable rooftop area",      "≈ 8.1 ha (60 % of 13.6 ha footprint)"),
        ("Estimated aggregate roof PV",   "≈ 14.6 MW peak at 180 W/m²"),
    ]
    for i, (k, v) in enumerate(rows):
        y = 1 - i * 0.13 - 0.05
        ax.text(0.02, y, k, fontsize=10, color=GREY)
        ax.text(0.55, y, v, fontsize=10, fontweight="bold", color=ACCENT)
    fig.tight_layout()
    fig.savefig(OUT / "fig_summary.png")
    plt.close(fig)


# ---------- main -------------------------------------------------------------

def main():
    generators = [
        ("I-V/P-V vs irradiance",     fig_iv_pv_irradiance),
        ("I-V/P-V vs temperature",    fig_iv_pv_temperature),
        ("Partial shading / bypass",  fig_shading_bypass),
        ("MPPT P&O trajectory",       fig_mppt_trajectory),
        ("Daily POA profile",         fig_daily_poa),
        ("NASA monthly climatology",  fig_nasa_monthly),
        ("NASA daily 2023 series",    fig_nasa_daily),
        ("Annual POA vs tilt",        fig_tilt_sweep),
        ("Solar altitude/azimuth",    fig_solar_angles),
        ("Rooftop PV potential",      fig_rooftop_potential),
        ("Architecture diagram",      fig_architecture),
        ("Summary numbers",           fig_fdata_summary),
    ]
    for name, fn in generators:
        print(f"  building {name}")
        fn()
    print(f"\n✓ Figures written to {OUT}")


if __name__ == "__main__":
    main()
