import React from 'react';

const medal = (rank) => rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null;
const barColor = (pct) => pct >= 90 ? '#16a34a' : pct >= 75 ? '#3b82f6' : pct >= 60 ? '#f59e0b' : '#ef4444';

/**
 * Attendance leaderboard for a section — shared by students and teachers.
 * props: ranking [{ rank, percentage, present, total, student{ name, rollNumber, _id } }]
 *        highlightId — student id to highlight (the viewing student), optional
 */
export default function ClassRanking({ ranking = [], highlightId }) {
  if (!ranking.length) {
    return (
      <div className="card"><div className="card-body" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
        <div style={{ fontSize: '2rem', marginBottom: 8 }}>🏆</div>
        No attendance recorded yet for this class.
      </div></div>
    );
  }

  return (
    <div className="card">
      <div className="card-body" style={{ padding: 0 }}>
        <table className="table" style={{ width: '100%' }}>
          <thead>
            <tr><th style={{ width: 60 }}>Rank</th><th>Student</th><th style={{ width: 90 }}>Present</th><th style={{ width: 200 }}>Attendance</th></tr>
          </thead>
          <tbody>
            {ranking.map((r) => {
              const me = highlightId && String(r.student._id) === String(highlightId);
              return (
                <tr key={r.student._id} style={me ? { background: 'color-mix(in srgb, var(--primary) 10%, transparent)' } : undefined}>
                  <td>
                    <span style={{ fontWeight: 700, fontSize: '.95rem' }}>
                      {medal(r.rank) || `#${r.rank}`}
                    </span>
                  </td>
                  <td>
                    <strong>{r.student.name}</strong>
                    {me && <span style={{ marginLeft: 6, fontSize: '.72rem', color: 'var(--primary)', fontWeight: 700 }}>YOU</span>}
                    {r.student.rollNumber ? <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>Roll {r.student.rollNumber}</div> : null}
                  </td>
                  <td style={{ fontSize: '.85rem', color: 'var(--text-muted)' }}>{r.present}/{r.total}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, height: 8, background: 'var(--bg-secondary)', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ width: `${r.percentage}%`, height: '100%', background: barColor(r.percentage) }} />
                      </div>
                      <strong style={{ fontSize: '.82rem', minWidth: 38, textAlign: 'right', color: barColor(r.percentage) }}>{r.percentage}%</strong>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
