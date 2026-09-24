export function StatusDot({ ready, label }: { ready: boolean; label: string }) {
  return (
    <span className={`statusDot ${ready ? "ready" : "pending"}`}>
      <span aria-hidden="true" />
      {label}
    </span>
  );
}
