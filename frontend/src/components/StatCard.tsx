export function StatCard({
  label,
  value,
  sub,
  variant,
}: {
  label: string;
  value: string | number;
  sub?: string;
  variant?: "positive" | "negative" | "neutral";
}) {
  return (
    <div className={`stat-card ${variant ?? ""}`}>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}
