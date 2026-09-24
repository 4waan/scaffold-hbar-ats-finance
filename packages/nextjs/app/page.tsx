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
        <div className="eyebrow">Scaffold-HBAR external template</div>
        <h1>
          Finance a security.
          <br />
          Keep custody native.
        </h1>
        <p className="heroCopy">
          A focused bilateral rail for HBAR financing against ATS-issued bonds.
          Every integration is guarded by a failure mode that has been
          reproduced, sourced, or made explicit as an assumption.
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

      <section className="architecture sectionBlock">
        <div className="sectionHeading">
          <div>
            <span className="index">02</span>
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
          <span className="index">03</span>
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
          <span className="index">04</span>
          <h2>From clone to rail</h2>
        </div>
        <ol>
          <li>
            <b>Inspect</b>
            <span>Run the app with no secrets and read the field guide.</span>
          </li>
          <li>
            <b>Fund</b>
            <span>
              Create Hedera testnet accounts and an encrypted Foundry keystore.
            </span>
          </li>
          <li>
            <b>Bootstrap</b>
            <span>
              Deploy the ATS bond, configure SSI and KYC, issue, then deploy the
              rail.
            </span>
          </li>
          <li>
            <b>Prove</b>
            <span>
              Run the Mirror verifier and publish only addresses and transaction
              hashes.
            </span>
          </li>
        </ol>
      </section>
    </main>
  );
}
