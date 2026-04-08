import { useState } from "react";

const teams = [
  {
    name: "Toronto Blue Jays",
    sport: "Baseball",
    id: 4424,
    color: "#134A8E",
    accent: "#E8291C",
    logo: "🐦",
    last: { result: "L", score: "2-14", opponent: "Los Angeles Dodgers", date: "Apr 6" },
    next: { opponent: "Los Angeles Dodgers", date: "Tue, Apr 7", time: "7:07 PM", venue: "Rogers Centre" },
    record: "3-5",
    streak: "L3",
    standing: "4th AL East",
    playingToday: true,
  },
  {
    name: "Toronto Raptors",
    sport: "Basketball",
    id: 4387,
    color: "#CE1141",
    accent: "#000000",
    logo: "🦖",
    last: { result: "L", score: "115-123", opponent: "Sacramento Kings", date: "Apr 2" },
    next: { opponent: "Miami Heat", date: "Tue, Apr 7", time: "7:30 PM", venue: "Scotiabank Arena" },
    record: "24-52",
    streak: "L5",
    standing: "14th East",
    playingToday: true,
  },
  {
    name: "Toronto Maple Leafs",
    sport: "Hockey",
    id: 4380,
    color: "#00205B",
    accent: "#FFFFFF",
    logo: "🍁",
    last: { result: "W", score: "4-3", opponent: "New York Rangers", date: "Mar 25" },
    next: { opponent: "Washington Capitals", date: "Wed, Apr 8", time: "7:30 PM", venue: "Scotiabank Arena" },
    record: "41-24-11",
    streak: "W2",
    standing: "2nd Atlantic",
    playingToday: false,
  },
];

const resultColor = (r) => (r === "W" ? "#22c55e" : r === "L" ? "#ef4444" : "#f59e0b");
const resultBg = (r) => (r === "W" ? "rgba(34,197,94,0.12)" : r === "L" ? "rgba(239,68,68,0.12)" : "rgba(245,158,11,0.12)");

// ─── SUMMARIZED VIEW ──────────────────────────────────────────────────────────
function SummarizedCard({ team }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
      background: "rgba(255,255,255,0.04)", borderRadius: 10,
      border: "1px solid rgba(255,255,255,0.07)",
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 8,
        background: team.color, display: "flex", alignItems: "center",
        justifyContent: "center", fontSize: 18, flexShrink: 0,
      }}>{team.logo}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: "#fff", fontWeight: 600, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {team.name}
          </span>
          <span style={{
            fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 20,
            color: resultColor(team.last.result), background: resultBg(team.last.result),
            flexShrink: 0, marginLeft: 8,
          }}>{team.last.result} {team.last.score}</span>
        </div>
        <div style={{ color: "#9ca3af", fontSize: 11, marginTop: 2 }}>
          Next: <span style={{ color: "#d1d5db" }}>{team.next.opponent}</span> · {team.next.date} {team.next.time}
        </div>
      </div>
    </div>
  );
}

// ─── STANDARD VIEW ────────────────────────────────────────────────────────────
function StandardCard({ team }) {
  return (
    <div style={{
      borderRadius: 12, overflow: "hidden",
      border: "1px solid rgba(255,255,255,0.08)",
      background: "rgba(255,255,255,0.04)",
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        background: `linear-gradient(135deg, ${team.color}33 0%, transparent 100%)`,
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: team.color, display: "flex",
          alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0,
        }}>{team.logo}</div>
        <div style={{ flex: 1 }}>
          <div style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{team.name}</div>
          <div style={{ color: "#9ca3af", fontSize: 11, marginTop: 1 }}>
            {team.sport} · {team.record} · <span style={{ color: "#6b7280" }}>{team.standing}</span>
          </div>
        </div>
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          padding: "4px 10px", borderRadius: 8,
          background: resultBg(team.last.result),
        }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: resultColor(team.last.result) }}>
            {team.last.result}
          </span>
          <span style={{ fontSize: 10, color: resultColor(team.last.result), fontWeight: 600 }}>
            {team.last.score}
          </span>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
        <div style={{ padding: "10px 14px", borderRight: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ color: "#6b7280", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Last Game</div>
          <div style={{ color: "#d1d5db", fontSize: 12, marginTop: 3 }}>vs. {team.last.opponent}</div>
          <div style={{ color: "#6b7280", fontSize: 11 }}>{team.last.date}</div>
        </div>
        <div style={{ padding: "10px 14px" }}>
          <div style={{ color: "#6b7280", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Next Game</div>
          <div style={{ color: "#d1d5db", fontSize: 12, marginTop: 3 }}>vs. {team.next.opponent}</div>
          <div style={{ color: "#6b7280", fontSize: 11 }}>{team.next.date} · {team.next.time}</div>
        </div>
      </div>
    </div>
  );
}

// ─── DETAILED VIEW ────────────────────────────────────────────────────────────
function DetailedCard({ team }) {
  return (
    <div style={{
      borderRadius: 14, overflow: "hidden",
      border: "1px solid rgba(255,255,255,0.1)",
      background: "rgba(255,255,255,0.04)",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 14, padding: "14px 16px",
        background: `linear-gradient(135deg, ${team.color}55 0%, ${team.color}11 100%)`,
        borderBottom: "1px solid rgba(255,255,255,0.07)",
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: 12, background: team.color,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 24, flexShrink: 0, boxShadow: `0 4px 12px ${team.color}66`,
        }}>{team.logo}</div>
        <div style={{ flex: 1 }}>
          <div style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>{team.name}</div>
          <div style={{ color: "#9ca3af", fontSize: 12, marginTop: 2 }}>{team.sport} · {team.standing}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ color: "#6b7280", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>Record</div>
          <div style={{ color: "#e5e7eb", fontWeight: 700, fontSize: 14 }}>{team.record}</div>
          <div style={{
            fontSize: 10, fontWeight: 700, marginTop: 2,
            color: team.streak.startsWith("W") ? "#22c55e" : "#ef4444",
          }}>{team.streak}</div>
        </div>
      </div>

      {/* Last Game */}
      <div style={{
        padding: "12px 16px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        display: "flex", alignItems: "center", gap: 12,
      }}>
        <div style={{
          width: 44, height: 44, borderRadius: 10, flexShrink: 0,
          background: resultBg(team.last.result),
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          border: `1px solid ${resultColor(team.last.result)}33`,
        }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: resultColor(team.last.result) }}>
            {team.last.result}
          </span>
          <span style={{ fontSize: 9, fontWeight: 600, color: resultColor(team.last.result) }}>
            {team.last.score}
          </span>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ color: "#6b7280", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Last Game · {team.last.date}
          </div>
          <div style={{ color: "#e5e7eb", fontSize: 13, marginTop: 3, fontWeight: 500 }}>
            vs. {team.last.opponent}
          </div>
          <div style={{
            display: "inline-block", marginTop: 4, fontSize: 10, fontWeight: 700,
            padding: "1px 8px", borderRadius: 20,
            background: resultBg(team.last.result),
            color: resultColor(team.last.result),
          }}>
            {team.last.result === "W" ? "Win" : team.last.result === "L" ? "Loss" : "OT"}
          </div>
        </div>
      </div>

      {/* Next Game */}
      <div style={{
        padding: "12px 16px",
        display: "flex", alignItems: "center", gap: 12,
        background: "rgba(255,255,255,0.02)",
      }}>
        <div style={{
          width: 44, height: 44, borderRadius: 10, flexShrink: 0,
          background: "rgba(99,102,241,0.12)",
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          border: "1px solid rgba(99,102,241,0.25)",
        }}>
          <span style={{ fontSize: 11 }}>📅</span>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ color: "#6b7280", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Next Game
          </div>
          <div style={{ color: "#e5e7eb", fontSize: 13, marginTop: 3, fontWeight: 500 }}>
            vs. {team.next.opponent}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
            <span style={{ color: "#9ca3af", fontSize: 11 }}>{team.next.date} · {team.next.time}</span>
          </div>
        </div>
        <div style={{
          textAlign: "right", color: "#9ca3af", fontSize: 11,
          maxWidth: 110, flexShrink: 0,
        }}>
          <div style={{ color: "#6366f1", fontWeight: 600, fontSize: 11 }}>📍</div>
          <div style={{ lineHeight: 1.3, marginTop: 2 }}>{team.next.venue}</div>
        </div>
      </div>
    </div>
  );
}

// ─── TODAY VIEW ───────────────────────────────────────────────────────────────
function TodayCard({ team }) {
  return (
    <div style={{
      borderRadius: 14, overflow: "hidden",
      border: `1px solid ${team.color}55`,
      background: `linear-gradient(160deg, ${team.color}22 0%, rgba(255,255,255,0.03) 100%)`,
      position: "relative",
    }}>
      {/* Game Day badge */}
      <div style={{
        position: "absolute", top: 10, right: 10,
        background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.35)",
        borderRadius: 20, padding: "2px 9px",
        display: "flex", alignItems: "center", gap: 5,
      }}>
        <div style={{
          width: 6, height: 6, borderRadius: "50%", background: "#22c55e",
          boxShadow: "0 0 6px #22c55e",
          animation: "pulse 1.8s ease-in-out infinite",
        }} />
        <span style={{ color: "#22c55e", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Game Day
        </span>
      </div>

      {/* Team header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "14px 16px 10px",
      }}>
        <div style={{
          width: 44, height: 44, borderRadius: 11, background: team.color,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 22, flexShrink: 0,
          boxShadow: `0 4px 14px ${team.color}55`,
        }}>{team.logo}</div>
        <div>
          <div style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{team.name}</div>
          <div style={{ color: "#9ca3af", fontSize: 11, marginTop: 1 }}>{team.sport} · {team.record}</div>
        </div>
      </div>

      {/* Matchup block */}
      <div style={{
        margin: "0 12px",
        background: "rgba(0,0,0,0.25)",
        borderRadius: 10,
        padding: "12px 14px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        border: "1px solid rgba(255,255,255,0.06)",
      }}>
        <div style={{ textAlign: "center", flex: 1 }}>
          <div style={{ fontSize: 22 }}>{team.logo}</div>
          <div style={{ color: "#e5e7eb", fontWeight: 700, fontSize: 12, marginTop: 4 }}>Toronto</div>
          <div style={{ color: "#9ca3af", fontSize: 10 }}>{team.record}</div>
        </div>
        <div style={{ textAlign: "center", padding: "0 12px" }}>
          <div style={{ color: "#6b7280", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>vs</div>
          <div style={{
            color: "#fff", fontWeight: 800, fontSize: 16, marginTop: 4,
            letterSpacing: "0.02em",
          }}>{team.next.time}</div>
          <div style={{ color: "#6b7280", fontSize: 10, marginTop: 2 }}>Tonight</div>
        </div>
        <div style={{ textAlign: "center", flex: 1 }}>
          <div style={{ fontSize: 22 }}>🏟️</div>
          <div style={{ color: "#e5e7eb", fontWeight: 700, fontSize: 12, marginTop: 4, maxWidth: 80, margin: "4px auto 0" }}>
            {team.next.opponent.split(" ").slice(-1)[0]}
          </div>
          <div style={{ color: "#9ca3af", fontSize: 10 }}>{team.next.opponent.split(" ").slice(0, -1).join(" ")}</div>
        </div>
      </div>

      {/* Venue + last game */}
      <div style={{
        display: "flex", gap: 0,
        margin: "8px 12px 12px",
        borderRadius: 8, overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.06)",
      }}>
        <div style={{
          flex: 1, padding: "8px 12px",
          borderRight: "1px solid rgba(255,255,255,0.06)",
          background: "rgba(255,255,255,0.02)",
        }}>
          <div style={{ color: "#6b7280", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Venue</div>
          <div style={{ color: "#d1d5db", fontSize: 11, marginTop: 3, lineHeight: 1.3 }}>{team.next.venue}</div>
        </div>
        <div style={{
          flex: 1, padding: "8px 12px",
          background: "rgba(255,255,255,0.02)",
        }}>
          <div style={{ color: "#6b7280", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Last Result</div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 3 }}>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 12,
              color: resultColor(team.last.result), background: resultBg(team.last.result),
            }}>{team.last.result}</span>
            <span style={{ color: "#d1d5db", fontSize: 11 }}>{team.last.score}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function TodayEmptyTeam({ team }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
      background: "rgba(255,255,255,0.02)", borderRadius: 10,
      border: "1px solid rgba(255,255,255,0.05)",
      opacity: 0.5,
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: 8, background: team.color,
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0,
        filter: "grayscale(0.5)",
      }}>{team.logo}</div>
      <div style={{ flex: 1 }}>
        <div style={{ color: "#9ca3af", fontWeight: 600, fontSize: 12 }}>{team.name}</div>
        <div style={{ color: "#4b5563", fontSize: 11, marginTop: 1 }}>No game today · Next: {team.next.date}</div>
      </div>
      <div style={{ color: "#374151", fontSize: 11 }}>—</div>
    </div>
  );
}

// ─── WIDGET SHELL ─────────────────────────────────────────────────────────────
function WidgetShell({ title, subtitle, children }) {
  return (
    <div style={{
      background: "#1c1c1e", borderRadius: 16, width: 340,
      border: "1px solid rgba(255,255,255,0.1)",
      boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
      overflow: "hidden",
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 16px 12px", borderBottom: "1px solid rgba(255,255,255,0.08)",
      }}>
        <div>
          <div style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>Sports</div>
          <div style={{ color: "#6b7280", fontSize: 11, marginTop: 1 }}>{subtitle}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: 16, padding: 2 }}>↻</button>
          <button style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: 16, padding: 2 }}>✕</button>
        </div>
      </div>
      <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: 8 }}>
        {children}
      </div>
    </div>
  );
}

// ─── VIEW TOGGLE ──────────────────────────────────────────────────────────────
const views = ["Today", "Summarized", "Standard", "Detailed"];

export default function App() {
  const [activeView, setActiveView] = useState("Today");
  const todayTeams = teams.filter(t => t.playingToday);
  const restTeams = teams.filter(t => !t.playingToday);

  return (
    <div style={{
      minHeight: "100vh", background: "#111113",
      display: "flex", flexDirection: "column", alignItems: "center",
      padding: "32px 24px", gap: 32, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    }}>
      {/* Pulse animation keyframes */}
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>

      {/* Header */}
      <div style={{ textAlign: "center" }}>
        <h1 style={{ color: "#fff", fontSize: 22, fontWeight: 700, margin: 0 }}>Sports Widget — Layout Concepts</h1>
        <p style={{ color: "#6b7280", fontSize: 13, marginTop: 6 }}>Click a view to preview all four layouts</p>
      </div>

      {/* Toggle */}
      <div style={{
        display: "flex", gap: 4, background: "rgba(255,255,255,0.07)",
        borderRadius: 12, padding: 4,
      }}>
        {views.map(v => (
          <button key={v} onClick={() => setActiveView(v)} style={{
            padding: "7px 18px", borderRadius: 9, border: "none", cursor: "pointer",
            fontWeight: 600, fontSize: 13, transition: "all 0.2s",
            background: activeView === v ? (v === "Today" ? "#22c55e" : "#fff") : "transparent",
            color: activeView === v ? "#111" : "#9ca3af",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            {v === "Today" && <span style={{ width: 6, height: 6, borderRadius: "50%", background: activeView === "Today" ? "#111" : "#22c55e", display: "inline-block" }} />}
            {v}
          </button>
        ))}
      </div>

      {/* Widgets */}
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", justifyContent: "center", alignItems: "flex-start" }}>

        {activeView === "Today" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <div style={{
              background: "rgba(34,197,94,0.1)", borderRadius: 8, padding: "4px 14px",
              color: "#22c55e", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em",
              border: "1px solid rgba(34,197,94,0.25)",
            }}>Today · Tue, Apr 7 · {todayTeams.length} of {teams.length} teams playing</div>
            <WidgetShell subtitle={`Today · ${todayTeams.length} games`}>
              {todayTeams.map(t => <TodayCard key={t.id} team={t} />)}
              {restTeams.length > 0 && (
                <div style={{ marginTop: 4 }}>
                  <div style={{ color: "#4b5563", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6, paddingLeft: 2 }}>
                    No game today
                  </div>
                  {restTeams.map(t => <TodayEmptyTeam key={t.id} team={t} />)}
                </div>
              )}
            </WidgetShell>
            <div style={{ color: "#4b5563", fontSize: 11, maxWidth: 340, textAlign: "center", lineHeight: 1.5 }}>
              Filters to only teams with games today. Each card shows the matchup, tip-off time, and venue front and center. Teams without a game appear dimmed below.
            </div>
          </div>
        )}

        {activeView === "Summarized" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <div style={{
              background: "rgba(255,255,255,0.06)", borderRadius: 8, padding: "4px 14px",
              color: "#9ca3af", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em",
            }}>Summarized — Compact at-a-glance</div>
            <WidgetShell subtitle="My Teams · All Sports">
              {teams.map(t => <SummarizedCard key={t.id} team={t} />)}
            </WidgetShell>
            <div style={{ color: "#4b5563", fontSize: 11, maxWidth: 340, textAlign: "center", lineHeight: 1.5 }}>
              Single-row cards. Win/loss badge + next game inline. Best for users who check scores quickly throughout the day.
            </div>
          </div>
        )}
        {activeView === "Standard" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <div style={{
              background: "rgba(255,255,255,0.06)", borderRadius: 8, padding: "4px 14px",
              color: "#9ca3af", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em",
            }}>Standard — Balanced info density</div>
            <WidgetShell subtitle="My Teams · All Sports">
              {teams.map(t => <StandardCard key={t.id} team={t} />)}
            </WidgetShell>
            <div style={{ color: "#4b5563", fontSize: 11, maxWidth: 340, textAlign: "center", lineHeight: 1.5 }}>
              Two-panel layout with team color headers. Last + next game side by side. Matches the original layout's spirit with better hierarchy.
            </div>
          </div>
        )}
        {activeView === "Detailed" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <div style={{
              background: "rgba(255,255,255,0.06)", borderRadius: 8, padding: "4px 14px",
              color: "#9ca3af", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em",
            }}>Detailed — Full context</div>
            <WidgetShell subtitle="My Teams · All Sports">
              {teams.map(t => <DetailedCard key={t.id} team={t} />)}
            </WidgetShell>
            <div style={{ color: "#4b5563", fontSize: 11, maxWidth: 340, textAlign: "center", lineHeight: 1.5 }}>
              Rich cards with record, streak, venue, and color-coded result tiles. Ideal for fans who want full context without leaving the widget.
            </div>
          </div>
        )}
      </div>

      {/* Key improvements callout */}
      <div style={{
        background: "rgba(255,255,255,0.04)", borderRadius: 14,
        border: "1px solid rgba(255,255,255,0.08)",
        padding: "16px 20px", maxWidth: 600, width: "100%",
      }}>
        <div style={{ color: "#9ca3af", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
          Improvements over original
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
          {[
            ["📅", "Today view", "Game-day cards for teams playing now — dimmed for teams with no game"],
            ["🎨", "Team color accents", "Each card reflects the team's brand color instead of uniform grey"],
            ["🟢", "Color-coded results", "Win/loss is instantly scannable with green/red rather than text only"],
            ["📊", "Record + streak", "Standing and recent form added for real context (Detailed view)"],
          ].map(([icon, title, desc]) => (
            <div key={title} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 22 }}>{icon}</div>
              <div style={{ color: "#e5e7eb", fontWeight: 600, fontSize: 12, marginTop: 4 }}>{title}</div>
              <div style={{ color: "#6b7280", fontSize: 11, marginTop: 3, lineHeight: 1.4 }}>{desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
