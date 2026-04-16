export default function TheoryPanel() {
  return (
    <section className="panel theory-panel">
      <h2>Theory & formulas</h2>

      <details open>
        <summary>Solar geometry</summary>
        <p className="theory-p">
          The solar position is described by declination (δ), hour angle (ω), altitude (α) and
          azimuth. The incidence angle θ<sub>i</sub> is the angle between the sun direction and the
          panel normal — its cosine scales the direct beam.
        </p>
        <pre className="formula">{`δ = 23.45° · sin( 360 · (284 + n) / 365 )
ω = 15° · (t_solar − 12)
cos(θ_z) = sin(φ) sin(δ) + cos(φ) cos(δ) cos(ω)
α = 90° − θ_z
cos(θ_i) = ŝ · n̂   (unit sun & normal vectors)`}</pre>
      </details>

      <details open>
        <summary>Irradiance on tilted plane (isotropic sky)</summary>
        <pre className="formula">{`POA_beam    = DNI · max(0, cos θ_i) · SF
POA_diffuse = DHI · (1 + cos β) / 2
POA_ground  = ρ · GHI · (1 − cos β) / 2
POA_total   = POA_beam + POA_diffuse + POA_ground`}</pre>
        <p className="theory-p">
          <strong>Irradiance</strong> is instantaneous power per area (W/m²). Integrating POA over a
          day gives <strong>daily irradiation</strong> (Wh/m² or kWh/m²/day).
        </p>
      </details>

      <details>
        <summary>PV electrical model (single-diode inspired)</summary>
        <pre className="formula">{`I = I_ph − I_0 ( exp((V + I·Rs)/(n·Ns·Vt)) − 1 ) − (V + I·Rs)/R_sh
I_ph(G,T)  = I_sc,ref · (G/1000) · [1 + α_Isc · (T − 25)]
V_oc(G,T)  = V_oc,ref · [1 + β_Voc · (T − 25)] · [1 + 0.06 ln(G/1000)]
P_max = V_mp · I_mp
FF    = (V_mp · I_mp) / (V_oc · I_sc)`}</pre>
        <p className="theory-p">
          Increasing irradiance strongly raises current; raising temperature mainly drops V<sub>oc</sub>.
        </p>
      </details>

      <details>
        <summary>Cell temperature (NOCT)</summary>
        <pre className="formula">{`T_cell ≈ T_ambient + ((NOCT − 20) / 800) · POA_total`}</pre>
      </details>

      <details>
        <summary>Bypass & blocking diodes</summary>
        <p className="theory-p">
          A <strong>bypass diode</strong> sits in parallel with a cell substring and turns on when
          that substring is shaded, letting the rest of the module keep producing current.
          A <strong>blocking diode</strong> prevents reverse current from battery or parallel string
          into a weaker source (e.g. at night or in a shaded parallel string).
        </p>
      </details>

      <details>
        <summary>MPPT — Perturb and Observe</summary>
        <p className="theory-p">
          Apply a small voltage perturbation ΔV; if power rises, keep stepping in the same
          direction, otherwise reverse. Around the MPP the controller oscillates within ΔV.
        </p>
        <p className="theory-p">
          <strong>Incremental Conductance</strong> compares dI/dV with −I/V. The MPP is reached
          when dI/dV + I/V = 0.
        </p>
      </details>

      <details>
        <summary>Energy estimate</summary>
        <pre className="formula">{`P_panel ≈ η · A · POA_total    (instantaneous)
E_day   ≈ Σ P_panel(t) · Δt     (over 24 h)`}</pre>
      </details>
    </section>
  );
}
