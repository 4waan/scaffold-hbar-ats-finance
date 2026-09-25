import type { ReactNode } from "react";

type FacilityStepProps = {
  index: number;
  title: string;
  actor: string;
  active: boolean;
  completed: boolean;
  receipt?: string;
  onSelect: () => void;
  children: ReactNode;
};

export function FacilityStep({
  index,
  title,
  actor,
  active,
  completed,
  receipt,
  onSelect,
  children,
}: FacilityStepProps) {
  return (
    <section
      className={`facilityStep ${active ? "active" : ""} ${completed ? "complete" : ""}`}
      data-active={active ? "true" : "false"}
    >
      <button
        aria-expanded={active}
        className="stepHeading"
        id={`facility-step-${index}`}
        onClick={onSelect}
        type="button"
      >
        <span>{String(index + 1).padStart(2, "0")}</span>
        <b>{title}</b>
        <small>{completed && !active ? (receipt ?? "Reviewed") : actor}</small>
        <i aria-hidden="true">{active ? "Close" : "Open"}</i>
      </button>
      {active && <div className="stepBody">{children}</div>}
    </section>
  );
}
