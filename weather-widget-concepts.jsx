import { useState } from "react";

// ─── Shared Mock Data ───────────────────────────────────────────────────────
const current = {
  location: "Toronto, Ontario",
  updated: "3:30 PM",
  temp: -1,
  feelsLike: -6,
  condition: "Partly Cloudy",
  precip: "0 mm",
  wind: "19 km/h",
  gusts: "27 km/h",
  alert: "Freezing temperatures",
};

const hourly = [
  { time: "12 AM", icon: "☁️", temp: 0,  rain: 23, wind: "3 km/h" },
  { time: "1 AM",  icon: "🌧️", temp: 1,  rain: 37, wind: "12 km/h" },
  { time: "2 AM",  icon: "🌧️", temp: 0,  rain: 8,  wind: "27 km/h" },
  { time: "3 AM",  icon: "☁️", temp: -2, rain: 1,  wind: "28 km/h" },
  { time: "4 AM",  icon: "☁️", temp: -3, rain: 5,  wind: "22 km/h" },
  { time: "5 AM",  icon: "🌫️", temp: -4, rain: 10, wind: "18 km/h" },
  { time: "6 AM",  icon: "🌫️", temp: -4, rain: 12, wind: "15 km/h" },
];

const daily = [
  { day: "Today",  icon: "⛅", hi: -1,  lo: -7,  rain: 20, wind: "19 km/h", condition: "Partly Cloudy" },
  { day: "Wed",    icon: "🌧️", hi: 2,   lo: -3,  rain: 70, wind: "25 km/h", condition: "Rain" },
  { day: "Thu",    icon: "🌦️", hi: 5,   lo: 0,   rain: 45, wind: "20 km/h", condition: "Showers" },
  { day: "Fri",    icon: "☀️", hi: 8,   lo: 1,   rain: 5,  wind: "14 km/h", condition: "Sunny" },
  { day: "Sat",    icon: "⛅", hi: 6,   lo: 2,   rain: 15, wind: "11 km/h", condition: "Partly Cloudy" },
  { day: "Sun",    icon: "🌧️", hi: 4,   lo: -1,  rain: 65, wind: "22 km/h", condition: "Rain" },
  { day: "Mon",    icon: "☁️", hi: 3,   lo: -2,  rain: 30, wind: "17 km/h", condition: "Cloudy" },
];

// ─── Shared Global Toggle ───────────────────────────────────────────────────
function ModeToggle({ mode, setMode }) {
  return (
    <div style={{ display: "flex", gap: 4, background: "rgba(255,255,255,0.08)", borderRadius: 8, padding: 3 }}>
      {["hourly", "daily"].map((m) => (
        <button
          key={m}
          onClick={() => setMode(m)}
          style={{
            padding: "3px 12px",
            borderRadius: 6,
            border: "none",
            cursor: "pointer",
            fontSize: 11,
            fontWeight: 600,
            textTransform: "capitalize",
            background: mode === m ? "rgba(255,255,255,0.18)" : "transparent",
            color: mode === m ? "#fff" : "rgba(255,255,255,0.5)",
            transition: "all 0.15s",
          }}
        >
          {m}
        </button>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// VERSION 1 — "Condensed Stack" — single-column, ultra-compact
// ══════════════════════════════════════════════════════════════════
function WidgetV1() {
  const [mode, setMode] = useState("hourly");

  return (
    <div style={{
      width: 300,
      background: "linear-gradient(145deg, #1a1f2e 0%, #0f1623 100%)",
      borderRadius: 16,
      padding: "14px 16px",
      fontFamily: "'Inter', 'Segoe UI', sans-serif",
      color: "#fff",
      boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
      border: "1px solid rgba(255,255,255,0.07)",
    }}>

      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.3 }}>{current.location}</div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 1 }}>Updated {current.updated}</div>
        </div>
        <ModeToggle mode={mode} setMode={setMode} />
      </div>

      {/* Current temp block */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <div style={{ fontSize: 42, lineHeight: 1 }}>⛅</div>
        <div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ fontSize: 36, fontWeight: 300, lineHeight: 1 }}>{current.temp}°</span>
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>/{current.feelsLike}°</span>
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 1 }}>{current.condition}</div>
        </div>
      </div>

      {/* Alert */}
      {current.alert && (
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          background: "rgba(251,146,60,0.12)", border: "1px solid rgba(251,146,60,0.25)",
          borderRadius: 7, padding: "5px 9px", marginBottom: 8,
        }}>
          <span style={{ fontSize: 11 }}>⚠️</span>
          <span style={{ fontSize: 11, color: "#fb923c", fontWeight: 500 }}>{current.alert}</span>
        </div>
      )}

      {/* Stats chips */}
      <div style={{ display: "flex", gap: 5, marginBottom: 12 }}>
        {[["🌧", current.precip], ["💨", current.wind], ["💨", `${current.gusts} gusts`]].map(([icon, val], i) => (
          <div key={i} style={{
            flex: 1, background: "rgba(255,255,255,0.06)", borderRadius: 7,
            padding: "5px 6px", textAlign: "center",
          }}>
            <div style={{ fontSize: 11 }}>{icon}</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", marginTop: 2, whiteSpace: "nowrap" }}>{val}</div>
          </div>
        ))}
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: "rgba(255,255,255,0.07)", marginBottom: 10 }} />

      {/* Hourly forecast — horizontal scroll pills */}
      {mode === "hourly" && (
        <div style={{ overflowX: "auto", display: "flex", gap: 6, paddingBottom: 4 }}>
          {hourly.map((h, i) => (
            <div key={i} style={{
              minWidth: 52, background: i === 0 ? "rgba(99,179,237,0.15)" : "rgba(255,255,255,0.05)",
              border: i === 0 ? "1px solid rgba(99,179,237,0.3)" : "1px solid transparent",
              borderRadius: 10, padding: "7px 5px", textAlign: "center", flexShrink: 0,
            }}>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", marginBottom: 3 }}>{h.time}</div>
              <div style={{ fontSize: 15 }}>{h.icon}</div>
              <div style={{ fontSize: 12, fontWeight: 600, marginTop: 3 }}>{h.temp}°</div>
              <div style={{ fontSize: 10, color: "#63b3ed", marginTop: 2 }}>{h.rain}%</div>
            </div>
          ))}
        </div>
      )}

      {/* Daily forecast — compact rows */}
      {mode === "daily" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {daily.map((d, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center",
              background: i === 0 ? "rgba(99,179,237,0.08)" : "transparent",
              borderRadius: 7, padding: "4px 4px",
            }}>
              <div style={{ width: 36, fontSize: 11, color: i === 0 ? "#63b3ed" : "rgba(255,255,255,0.6)", fontWeight: i === 0 ? 700 : 400 }}>{d.day}</div>
              <div style={{ fontSize: 15, marginRight: 6 }}>{d.icon}</div>
              {/* Rain bar */}
              <div style={{ flex: 1, height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2, overflow: "hidden", marginRight: 8 }}>
                <div style={{ width: `${d.rain}%`, height: "100%", background: d.rain > 40 ? "#63b3ed" : "rgba(99,179,237,0.35)", borderRadius: 2 }} />
              </div>
              <div style={{ fontSize: 10, color: "#63b3ed", width: 24, textAlign: "right" }}>{d.rain}%</div>
              <div style={{ fontSize: 11, fontWeight: 600, width: 26, textAlign: "right" }}>{d.hi}°</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", width: 24, textAlign: "right" }}>{d.lo}°</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// VERSION 2 — "Split Panel" — left: current, right: forecast
// ══════════════════════════════════════════════════════════════════
function WidgetV2() {
  const [mode, setMode] = useState("hourly");

  return (
    <div style={{
      width: 340,
      background: "#111827",
      borderRadius: 16,
      fontFamily: "'Inter', 'Segoe UI', sans-serif",
      color: "#fff",
      boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
      border: "1px solid rgba(255,255,255,0.06)",
      overflow: "hidden",
    }}>

      {/* Alert banner (top) */}
      {current.alert && (
        <div style={{
          background: "rgba(251,146,60,0.15)", borderBottom: "1px solid rgba(251,146,60,0.2)",
          padding: "6px 14px", display: "flex", alignItems: "center", gap: 6,
        }}>
          <span style={{ fontSize: 11 }}>⚠️</span>
          <span style={{ fontSize: 11, color: "#fb923c", fontWeight: 600 }}>{current.alert}</span>
        </div>
      )}

      <div style={{ display: "flex" }}>

        {/* Left panel — current conditions */}
        <div style={{
          width: 130, padding: "14px 12px",
          borderRight: "1px solid rgba(255,255,255,0.07)",
          display: "flex", flexDirection: "column", justifyContent: "space-between",
          background: "linear-gradient(180deg, rgba(30,58,138,0.15) 0%, transparent 100%)",
        }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, lineHeight: 1.3, marginBottom: 1 }}>{current.location}</div>
            <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.35)", marginBottom: 10 }}>Updated {current.updated}</div>
            <div style={{ fontSize: 34 }}>⛅</div>
            <div style={{ fontSize: 32, fontWeight: 300, lineHeight: 1, marginTop: 4 }}>{current.temp}°<span style={{ fontSize: 14 }}>C</span></div>
            <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.45)", marginTop: 3 }}>Feels {current.feelsLike}°</div>
            <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.6)", marginTop: 2 }}>{current.condition}</div>
          </div>

          {/* Stats */}
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 5 }}>
            {[["💧", "Precip", current.precip], ["💨", "Wind", current.wind], ["🌬️", "Gusts", current.gusts]].map(([icon, label, val], i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ fontSize: 11 }}>{icon}</span>
                <div>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", lineHeight: 1 }}>{label}</div>
                  <div style={{ fontSize: 10.5, fontWeight: 600 }}>{val}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right panel — forecast */}
        <div style={{ flex: 1, padding: "12px 10px" }}>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
            <ModeToggle mode={mode} setMode={setMode} />
          </div>

          {mode === "hourly" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {hourly.map((h, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "4px 6px", borderRadius: 7,
                  background: i === 0 ? "rgba(99,179,237,0.12)" : "transparent",
                }}>
                  <div style={{ width: 32, fontSize: 10, color: "rgba(255,255,255,0.5)" }}>{h.time}</div>
                  <div style={{ fontSize: 14, width: 20 }}>{h.icon}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, width: 26 }}>{h.temp}°</div>
                  {/* Rain indicator */}
                  <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 4 }}>
                    <div style={{ flex: 1, height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
                      <div style={{ width: `${h.rain}%`, height: "100%", background: h.rain > 30 ? "#63b3ed" : "rgba(99,179,237,0.3)", borderRadius: 2 }} />
                    </div>
                    <div style={{ fontSize: 9.5, color: "#63b3ed", width: 22 }}>{h.rain}%</div>
                  </div>
                  <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.4)", width: 38 }}>{h.wind}</div>
                </div>
              ))}
            </div>
          )}

          {mode === "daily" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {daily.map((d, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "4px 6px", borderRadius: 7,
                  background: i === 0 ? "rgba(99,179,237,0.12)" : "transparent",
                }}>
                  <div style={{ width: 30, fontSize: 10, color: i === 0 ? "#63b3ed" : "rgba(255,255,255,0.5)", fontWeight: i === 0 ? 700 : 400 }}>{d.day}</div>
                  <div style={{ fontSize: 14, width: 20 }}>{d.icon}</div>
                  {/* Rain bar */}
                  <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 4 }}>
                    <div style={{ flex: 1, height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
                      <div style={{ width: `${d.rain}%`, height: "100%", background: d.rain > 40 ? "#63b3ed" : "rgba(99,179,237,0.3)", borderRadius: 2 }} />
                    </div>
                    <div style={{ fontSize: 9.5, color: "#63b3ed", width: 22 }}>{d.rain}%</div>
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 700, width: 20 }}>{d.hi}°</div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", width: 20 }}>{d.lo}°</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// VERSION 3 — "Timeline Card" — visual temp bars + clear hierarchy
// ══════════════════════════════════════════════════════════════════
function WidgetV3() {
  const [mode, setMode] = useState("hourly");
  const [alertDismissed, setAlertDismissed] = useState(false);

  const minTemp = Math.min(...hourly.map(h => h.temp));
  const maxTemp = Math.max(...hourly.map(h => h.temp));
  const range = maxTemp - minTemp || 1;

  const dailyMinAll = Math.min(...daily.map(d => d.lo));
  const dailyMaxAll = Math.max(...daily.map(d => d.hi));
  const dailyRange = dailyMaxAll - dailyMinAll || 1;

  return (
    <div style={{
      width: 320,
      background: "linear-gradient(160deg, #0f172a 0%, #1e1b4b 100%)",
      borderRadius: 18,
      padding: "14px 15px 15px",
      fontFamily: "'Inter', 'Segoe UI', sans-serif",
      color: "#fff",
      boxShadow: "0 12px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06)",
    }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ fontSize: 22 }}>⛅</span>
          <div>
            <div style={{ fontSize: 28, fontWeight: 200, lineHeight: 1 }}>
              {current.temp}°
              <span style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", fontWeight: 400, marginLeft: 4 }}>feels {current.feelsLike}°</span>
            </div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 1 }}>{current.location} · {current.updated}</div>
          </div>
        </div>
        <ModeToggle mode={mode} setMode={setMode} />
      </div>

      {/* Stats row */}
      <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
        {[["💧", current.precip], ["💨", current.wind], ["🌬️", current.gusts]].map(([icon, val], i) => (
          <div key={i} style={{
            flex: 1, display: "flex", alignItems: "center", gap: 4,
            background: "rgba(255,255,255,0.06)", borderRadius: 8, padding: "5px 8px",
          }}>
            <span style={{ fontSize: 12 }}>{icon}</span>
            <span style={{ fontSize: 10.5, color: "rgba(255,255,255,0.65)" }}>{val}</span>
          </div>
        ))}
      </div>

      {/* Alert — dismissible */}
      {current.alert && !alertDismissed && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "rgba(251,146,60,0.1)", border: "1px solid rgba(251,146,60,0.22)",
          borderRadius: 8, padding: "5px 10px", marginBottom: 10,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 11 }}>⚠️</span>
            <span style={{ fontSize: 10.5, color: "#fdba74", fontWeight: 500 }}>{current.alert}</span>
          </div>
          <button onClick={() => setAlertDismissed(true)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", cursor: "pointer", fontSize: 13, padding: "0 0 0 4px", lineHeight: 1 }}>×</button>
        </div>
      )}

      {/* Divider */}
      <div style={{ height: 1, background: "rgba(255,255,255,0.07)", marginBottom: 12 }} />

      {/* Hourly — vertical bars with temp dots */}
      {mode === "hourly" && (
        <div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8 }}>Next 7 Hours</div>
          <div style={{ display: "flex", gap: 5, alignItems: "flex-end" }}>
            {hourly.map((h, i) => {
              const pct = ((h.temp - minTemp) / range) * 60 + 10;
              return (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: i === 0 ? "#a5f3fc" : "#fff" }}>{h.temp}°</div>
                  {/* Bar */}
                  <div style={{ width: "100%", height: 56, background: "rgba(255,255,255,0.05)", borderRadius: 6, position: "relative", overflow: "hidden", display: "flex", alignItems: "flex-end" }}>
                    {/* Rain fill */}
                    <div style={{ width: "100%", background: `rgba(99,179,237,${h.rain / 150 + 0.05})`, height: `${h.rain}%`, transition: "height 0.3s" }} />
                    {/* Temp dot */}
                    <div style={{
                      position: "absolute", left: "50%", transform: "translateX(-50%)",
                      bottom: `${pct}%`,
                      width: 5, height: 5, borderRadius: "50%",
                      background: i === 0 ? "#a5f3fc" : "rgba(255,255,255,0.7)",
                      boxShadow: i === 0 ? "0 0 6px #a5f3fc" : "none",
                    }} />
                  </div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>{h.icon}</div>
                  <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.4)" }}>{h.time}</div>
                </div>
              );
            })}
          </div>
          {/* Wind row */}
          <div style={{ display: "flex", gap: 5, marginTop: 6 }}>
            {hourly.map((h, i) => (
              <div key={i} style={{ flex: 1, textAlign: "center", fontSize: 9, color: "rgba(255,255,255,0.3)" }}>{h.wind}</div>
            ))}
          </div>
        </div>
      )}

      {/* Daily — range bars */}
      {mode === "daily" && (
        <div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8 }}>7-Day Forecast</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {daily.map((d, i) => {
              const loPos = ((d.lo - dailyMinAll) / dailyRange) * 100;
              const hiPos = ((d.hi - dailyMinAll) / dailyRange) * 100;
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <div style={{ width: 30, fontSize: 10, color: i === 0 ? "#a5f3fc" : "rgba(255,255,255,0.5)", fontWeight: i === 0 ? 700 : 400 }}>{d.day}</div>
                  <div style={{ fontSize: 14, width: 18 }}>{d.icon}</div>
                  <div style={{ fontSize: 9.5, color: "#63b3ed", width: 22 }}>💧{d.rain}%</div>
                  {/* Temp range bar */}
                  <div style={{ flex: 1, height: 5, background: "rgba(255,255,255,0.07)", borderRadius: 3, position: "relative" }}>
                    <div style={{
                      position: "absolute",
                      left: `${loPos}%`,
                      width: `${hiPos - loPos}%`,
                      height: "100%",
                      borderRadius: 3,
                      background: `linear-gradient(90deg, #60a5fa, ${d.hi > 3 ? "#fbbf24" : "#93c5fd"})`,
                    }} />
                  </div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", width: 20, textAlign: "right" }}>{d.lo}°</div>
                  <div style={{ fontSize: 11, fontWeight: 700, width: 20, textAlign: "right" }}>{d.hi}°</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// Root — showcase all 3 side by side
// ══════════════════════════════════════════════════════════════════
export default function App() {
  return (
    <div style={{
      minHeight: "100vh",
      background: "#080c14",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: "32px 24px",
      gap: 32,
      fontFamily: "'Inter', 'Segoe UI', sans-serif",
    }}>
      <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 11, letterSpacing: 1, textTransform: "uppercase" }}>
        Weather Widget — 3 Compact Concepts · Toggle hourly / daily on each
      </div>

      <div style={{ display: "flex", gap: 28, flexWrap: "wrap", justifyContent: "center", alignItems: "flex-start" }}>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
          <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase" }}>v1 · Condensed Stack</div>
          <WidgetV1 />
          <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 10, textAlign: "center", maxWidth: 280, lineHeight: 1.5 }}>
            Single-column pill cards. Minimal, pill-style hourly scroll. Daily shows rain probability bars inline.
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
          <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase" }}>v2 · Split Panel</div>
          <WidgetV2 />
          <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 10, textAlign: "center", maxWidth: 300, lineHeight: 1.5 }}>
            Left: static current conditions. Right: scrollable forecast. Dense but scannable. Alert banner at top.
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
          <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase" }}>v3 · Timeline Card</div>
          <WidgetV3 />
          <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 10, textAlign: "center", maxWidth: 290, lineHeight: 1.5 }}>
            Visual bar chart for hourly rain + temp dots. Daily shows gradient hi/lo range bars. Alert is dismissible.
          </div>
        </div>

      </div>
    </div>
  );
}
