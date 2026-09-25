import Link from "next/link";
import { RecipeExplorer } from "@/components/RecipeExplorer";
import { referenceDeployment } from "@/lib/reference";

export default function OverviewPage() {
  const repaid = referenceDeployment.positions.find(
    (position) => position.state === "REPAID",
  );
  const defaulted = referenceDeployment.positions.find(
    (position) => position.state === "DEFAULTED",
  );

  return (
    <main className="homePage">
      <section className="homeFrame promiseFrame">
        <div className="frameIndex">01 / Promise</div>
        <div className="promiseCopy">
          <span className="kicker">A secure financing kernel for Hedera</span>
          <h1>Make ATS assets financeable.</h1>
          <p>
            Start with native custody, exact HBAR accounting, live cash
            conversion, scheduled maturity, and evidence reconstruction already
            composed. Change the financing policy, not the safety model.
          </p>
          <Link className="primaryButton" href="#recipes">
            Explore a financing recipe
          </Link>
        </div>
        <p className="frameAside">
          One ATS asset. One bilateral obligation. One terminal collateral
          action.
        </p>
      </section>

      <section className="homeFrame recipeFrame" id="recipes">
        <div className="frameIndex">02 / Recipe</div>
        <RecipeExplorer />
      </section>

      <section className="homeFrame proofFrame">
        <div className="frameIndex">03 / Proof</div>
        <div className="proofIntro">
          <span className="kicker">Public testnet evidence</span>
          <h2>Every claim has a source.</h2>
          <p>
            The reference record separates contract state, ATS balances, Pyth
            data, HSS schedules, Mirror receipts, and HashScan links. Missing
            proof stays visibly pending.
          </p>
          <Link className="primaryButton" href="/verify?position=repaid">
            Verify the lifecycle
          </Link>
        </div>
        <div className="terminalLines" aria-label="Reference terminal paths">
          <div>
            <span>Repaid path</span>
            <b>{repaid ? "Verified" : "Awaiting publication"}</b>
            <small>
              {repaid ? `Hold ${repaid.holdId}` : "No claim invented"}
            </small>
          </div>
          <div>
            <span>Default path</span>
            <b>{defaulted ? "Verified" : "Awaiting publication"}</b>
            <small>
              {defaulted
                ? defaulted.terminalPath.replaceAll("-", " ")
                : "No claim invented"}
            </small>
          </div>
        </div>
      </section>
    </main>
  );
}
