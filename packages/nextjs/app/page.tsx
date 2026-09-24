import Link from "next/link";
import { StatusDot } from "@/components/StatusDot";
import { isLiveMode } from "@/lib/chain";
import { lifecycleLabels, referenceDeployment } from "@/lib/reference";

const integrations = [
  ["ATS", "Native security, internal KYC, partition hold", true],
  ["Pyth", "Fresh HBAR/USD cash conversion", true],
  ["HSS", "Capacity-aware maturity call with public fallback", true],
  ["Mirror Node", "Receipt, entity, and state evidence", true],
] as const;

const protectedSeams = [
  [
    "Holds, not Clearing",
    "The ATS is deployed with mutually exclusive Clearing disabled.",
  ],
  [
    "Compliance before custody",
    "The rail validates KYC, allowance, free balance, and terms before hold creation.",
  ],
  [
    "Post-create inspection",
    "Every hold is read back and checked for amount, escrow, destination, partition, and expiry.",
  ],
  [
    "Checked HSS responses",
    "Response code 22, capacity, and a nonzero mined schedule address are all required.",
  ],
  [
    "Permissionless recovery",
    "No keeper is required. Any account can settle an overdue open position.",
  ],
  [
    "Evidence, not simulation",
    "Mirror receipts and state reads back every published lifecycle claim.",
  ],
] as const;

export default function OverviewPage() {
  const lifecycle = referenceDeployment.lifecycle as Record<
    string,
    string | null
  >;
  const completedEvidence = lifecycleLabels.filter(([key]) =>
    Boolean(lifecycle[key]),
  ).length;

  return (
    <main>
      <section className="hero">
        <div className="eyebrow">Production-grade ATS financing recipe</div>
        <h1>
          Scaffold the hard part.
          <br />
          Prove every seam.
        </h1>
        <p className="heroCopy">
          Collateral Rail gives developers a reusable path for HBAR financing
          against ATS-issued securities. It includes the native custody rail,
          maturity automation, cash conversion, public evidence, and regression
          guards for Hedera behaviors that happy-path examples leave exposed.
        </p>
        <div className="heroActions">
          <Link className="primaryButton" href="/facility">
            Open the facility console
          </Link>
          <Link className="secondaryButton" href="/verify">
            Reconstruct a position
          </Link>
        </div>
        <div className="heroRule" />
        <div className="heroMetrics">
          <div>
            <strong>70%</strong>
            <span>maximum advance</span>
          </div>
          <div>
            <strong>120s</strong>
            <span>maximum quote age</span>
          </div>
          <div>
            <strong>3</strong>
            <span>HSS capacity slots</span>
          </div>
          <div>
            <strong>0</strong>
            <span>keepers required</span>
          </div>
        </div>
      </section>

      <section className="sectionBlock">
        <div className="sectionHeading">
          <div>
            <span className="index">01</span>
            <h2>One obligation, four proofs</h2>
          </div>
          <p>
            The contract composes native services without pretending one service
            proves another.
          </p>
        </div>
        <div className="integrationGrid">
          {integrations.map(([name, description, ready]) => (
            <article className="integrationCard" key={name}>
              <StatusDot ready={ready} label="implemented" />
              <h3>{name}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="sectionBlock seamSection">
        <div className="sectionHeading">
          <div>
            <span className="index">02</span>
            <h2>Failure modes solved once</h2>
          </div>
          <p>
            The scaffold is useful because each integration seam is converted
            into code, a guard, and a regression test that downstream teams
            keep.
          </p>
        </div>
        <div className="seamGrid">
          {protectedSeams.map(([name, description], index) => (
            <article key={name}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <h3>{name}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="architecture sectionBlock">
        <div className="sectionHeading">
          <div>
            <span className="index">03</span>
            <h2>The facility state machine</h2>
          </div>
          <p>
            Cash moves as pull-payment credit. Collateral stays in an ATS hold
            until one terminal action.
          </p>
        </div>
        <div className="railDiagram" aria-label="Facility lifecycle">
          <div>
            <span>01</span>
            <b>Quote</b>
            <small>Pyth HBAR/USD</small>
          </div>
          <i>→</i>
          <div>
            <span>02</span>
            <b>Fund</b>
            <small>Exact tinybar</small>
          </div>
          <i>→</i>
          <div>
            <span>03</span>
            <b>Hold</b>
            <small>ATS partition</small>
          </div>
          <i>→</i>
          <div className="split">
            <span>04</span>
            <b>Repay / default</b>
            <small>One terminal path</small>
          </div>
        </div>
      </section>

      <section className="sectionBlock evidencePanel">
        <div>
          <span className="index">04</span>
          <h2>Evidence before adjectives</h2>
          <p>
            Reference mode never invents a deployment. The committed record
            remains visibly incomplete until the live verifier has confirmed
            each receipt, role, immutable, balance, hold, and schedule.
          </p>
        </div>
        <div className="evidenceScore">
          <strong>
            {completedEvidence}/{lifecycleLabels.length}
          </strong>
          <span>verified lifecycle checkpoints</span>
          <StatusDot
            ready={isLiveMode}
            label={referenceDeployment.status.replaceAll("-", " ")}
          />
        </div>
      </section>

      <section className="sectionBlock setupGrid">
        <div>
          <span className="index">05</span>
          <h2>Inspect in under five minutes</h2>
        </div>
        <ol>
          <li>
            <b>Scaffold</b>
            <span>
              Run <code>npm create scaffold-hbar@latest</code> with this public
              template.
            </span>
          </li>
          <li>
            <b>Boot</b>
            <span>
              Install dependencies and run <code>yarn dev</code>. No secrets are
              required.
            </span>
          </li>
          <li>
            <b>Replay</b>
            <span>
              Open the facility route and inspect both committed terminal paths.
            </span>
          </li>
          <li>
            <b>Verify</b>
            <span>
              Reconstruct contract, ATS, HSS, Pyth, Mirror, and HashScan
              evidence.
            </span>
          </li>
        </ol>
      </section>
    </main>
  );
}
