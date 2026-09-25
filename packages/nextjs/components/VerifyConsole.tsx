"use client";

import { useState } from "react";
import { formatUnits, isHex, type Hex } from "viem";
import { usePublicClient } from "wagmi";
import { addresses, isLiveMode } from "@/lib/chain";
import {
  atsAbi,
  automationStates,
  DEFAULT_PARTITION,
  positionStates,
  railAbi,
} from "@/lib/contracts";
import { referenceDeployment } from "@/lib/reference";

type PositionSelection = "repaid" | "defaulted";

type LiveEvidence = {
  state: string;
  automation: string;
  lender: string;
  borrower: string;
  collateral: string;
  free: string;
  held: string;
  principal: string;
  repayment: string;
  maturity: string;
  schedule: string;
};

type MirrorFact = {
  result: string;
  consensusTimestamp: string;
  transactionId: string;
};

type VerifyConsoleProps = {
  initialPosition: PositionSelection;
};

function hashScanTransaction(hash: string | null) {
  return hash ? `https://hashscan.io/testnet/transaction/${hash}` : undefined;
}

export function VerifyConsole({ initialPosition }: VerifyConsoleProps) {
  const publicClient = usePublicClient();
  const [selection, setSelection] =
    useState<PositionSelection>(initialPosition);
  const [positionId, setPositionId] = useState("");
  const [transactionId, setTransactionId] = useState("");
  const [liveEvidence, setLiveEvidence] = useState<LiveEvidence>();
  const [mirrorFact, setMirrorFact] = useState<MirrorFact>();
  const [rawMirror, setRawMirror] = useState<Record<string, unknown>>();
  const [message, setMessage] = useState(
    "Select a terminal path to inspect its claims and sources.",
  );

  const lifecycle = referenceDeployment.lifecycle as Record<
    string,
    string | null
  >;
  const position = referenceDeployment.positions.find((candidate) =>
    selection === "repaid"
      ? candidate.state === "REPAID"
      : candidate.state === "DEFAULTED",
  );
  const terminalHash =
    selection === "repaid"
      ? lifecycle.repaidFacility
      : lifecycle.maturedDefault;

  const claims = [
    {
      claim: "A fresh HBAR/USD cash quote was submitted.",
      source: "Pyth adapter and Mirror receipt",
      detail: referenceDeployment.pyth
        ? `$${formatUnits(BigInt(referenceDeployment.pyth.priceUsdE8), 8)} at ${referenceDeployment.pyth.publishTime}`
        : "Awaiting verified publication",
      link: hashScanTransaction(lifecycle.pythPriceUpdate),
    },
    {
      claim: "The lender funded an exact HBAR principal.",
      source: "AtsCollateralRail and Mirror receipt",
      detail: position
        ? `${formatUnits(BigInt(position.principalTinybar), 8)} HBAR`
        : "Awaiting verified publication",
      link: hashScanTransaction(lifecycle.fundedOffer),
    },
    {
      claim: "ATS collateral entered a distinct native hold.",
      source: "ATS partition hold inspection",
      detail: position
        ? `Hold ${position.holdId}, ${position.collateralAmount} units`
        : "Awaiting verified publication",
      link: hashScanTransaction(lifecycle.holdCreation),
    },
    {
      claim: "Maturity automation was mined and confirmed.",
      source: "HSS entity and Mirror Node",
      detail: position?.scheduleAddress ?? "Awaiting verified publication",
      link:
        referenceDeployment.schedules.find(
          (schedule) => schedule.address === position?.scheduleAddress,
        )?.hashScan ?? hashScanTransaction(lifecycle.hssScheduleCreation),
    },
    {
      claim:
        selection === "repaid"
          ? "Repayment released the collateral hold."
          : "Overdue collateral reached one terminal execution.",
      source:
        selection === "repaid"
          ? "Rail state and ATS hold release"
          : !position
            ? "Rail terminal state and ATS hold execution"
            : position.terminalPath === "permissionless-fallback"
              ? "Permissionless fallback and ATS hold execution"
              : "HSS call and ATS hold execution",
      detail: position
        ? `${position.state} via ${position.terminalPath.replaceAll("-", " ")}`
        : "Awaiting verified publication",
      link: hashScanTransaction(terminalHash),
    },
  ];

  function selectPosition(next: PositionSelection) {
    setSelection(next);
    window.history.replaceState(null, "", `/verify?position=${next}`);
  }

  async function readPosition() {
    if (
      !publicClient ||
      !addresses.rail ||
      !addresses.atsToken ||
      !isHex(positionId) ||
      positionId.length !== 66
    ) {
      setMessage("A live deployment and a 32-byte position ID are required.");
      return;
    }
    try {
      const id = positionId as Hex;
      const result = await publicClient.readContract({
        address: addresses.rail,
        abi: railAbi,
        functionName: "getPosition",
        args: [id],
      });
      const [free, held] = await Promise.all([
        publicClient.readContract({
          address: addresses.atsToken,
          abi: atsAbi,
          functionName: "balanceOfByPartition",
          args: [DEFAULT_PARTITION, result.borrower],
        }),
        publicClient.readContract({
          address: addresses.atsToken,
          abi: atsAbi,
          functionName: "getHeldAmountForByPartition",
          args: [DEFAULT_PARTITION, result.borrower],
        }),
      ]);
      setLiveEvidence({
        state: positionStates[result.state] ?? `Unknown ${result.state}`,
        automation:
          automationStates[result.automation] ?? `Unknown ${result.automation}`,
        lender: result.lender,
        borrower: result.borrower,
        collateral: result.collateralAmount.toString(),
        free: free.toString(),
        held: held.toString(),
        principal: `${formatUnits(result.principalTinybar, 8)} HBAR`,
        repayment: `${formatUnits(result.repaymentTinybar, 8)} HBAR`,
        maturity: new Date(Number(result.maturity) * 1000).toISOString(),
        schedule: result.scheduleAddress,
      });
      setMessage(
        "Live state loaded. Free and held ATS balances remain separate.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message.split("\n")[0]
          : "State read failed.",
      );
    }
  }

  async function readMirror() {
    if (!/^(0x[a-fA-F0-9]{64}|\d+\.\d+\.\d+-\d+-\d+)$/.test(transactionId)) {
      setMessage("Enter a Hedera transaction ID or 32-byte transaction hash.");
      return;
    }
    try {
      const response = await fetch(
        `https://testnet.mirrornode.hedera.com/api/v1/transactions/${encodeURIComponent(transactionId)}`,
        { headers: { Accept: "application/json" } },
      );
      if (!response.ok) {
        throw new Error(`Mirror Node returned HTTP ${response.status}.`);
      }
      const payload = (await response.json()) as Record<string, unknown>;
      const transactions = Array.isArray(payload.transactions)
        ? payload.transactions
        : [];
      const first = transactions[0] as Record<string, unknown> | undefined;
      if (!first) {
        throw new Error("HTTP 200 contained no matching transaction.");
      }
      setMirrorFact({
        result: String(first.result ?? "UNKNOWN"),
        consensusTimestamp: String(first.consensus_timestamp ?? "Unavailable"),
        transactionId: String(first.transaction_id ?? transactionId),
      });
      setRawMirror({ transactions, links: payload.links ?? null });
      setMessage("Mirror facts loaded and parsed from a nonempty result set.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Mirror Node read failed.",
      );
    }
  }

  return (
    <div className="proofShell">
      <header className="proofHeader">
        <div>
          <span className="kicker">Financial proof ledger</span>
          <h1>Follow one position from claim to source.</h1>
        </div>
        <div className="positionSwitch" aria-label="Reference position">
          <button
            aria-pressed={selection === "repaid"}
            onClick={() => selectPosition("repaid")}
            type="button"
          >
            Repaid position
          </button>
          <button
            aria-pressed={selection === "defaulted"}
            onClick={() => selectPosition("defaulted")}
            type="button"
          >
            Defaulted position
          </button>
        </div>
      </header>

      <section className="selectedProof" aria-label="Selected position proof">
        <div className="positionIdentity">
          <span>{selection} path</span>
          <b>{position?.id ?? "Reference evidence pending"}</b>
          <small>
            {position
              ? `Hold ${position.holdId} · ${position.automation} automation`
              : referenceDeployment.notice}
          </small>
        </div>

        <ol className="proofClaims">
          {claims.map((item, index) => (
            <li key={item.claim}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div>
                <h2>{item.claim}</h2>
                <p>{item.detail}</p>
                <small>{item.source}</small>
              </div>
              {item.link ? (
                <a href={item.link} rel="noreferrer" target="_blank">
                  Proof link
                </a>
              ) : (
                <b>Pending</b>
              )}
            </li>
          ))}
        </ol>
      </section>

      <section className="factLedger" aria-label="Separate financial facts">
        <h2>Facts that must not be collapsed</h2>
        <dl>
          <div>
            <dt>Free ATS balance</dt>
            <dd>
              {referenceDeployment.ats
                ? referenceDeployment.ats.balances.borrower.free
                : "Pending"}
            </dd>
          </div>
          <div>
            <dt>Held ATS balance</dt>
            <dd>
              {referenceDeployment.ats
                ? referenceDeployment.ats.balances.borrower.held
                : "Pending"}
            </dd>
          </div>
          <div>
            <dt>Pyth cash quote</dt>
            <dd>
              {referenceDeployment.pyth
                ? `$${formatUnits(BigInt(referenceDeployment.pyth.priceUsdE8), 8)}`
                : "Pending"}
            </dd>
          </div>
          <div>
            <dt>Cash liabilities</dt>
            <dd>
              {referenceDeployment.accounting
                ? `${formatUnits(BigInt(referenceDeployment.accounting.cashLiabilitiesTinybar), 8)} HBAR`
                : "Pending"}
            </dd>
          </div>
          <div>
            <dt>HSS reserve</dt>
            <dd>
              {referenceDeployment.accounting
                ? `${formatUnits(BigInt(referenceDeployment.accounting.reservedAutomationTinybar), 8)} HBAR`
                : "Pending"}
            </dd>
          </div>
        </dl>
      </section>

      <details className="liveVerifier">
        <summary>Verify another live position</summary>
        <div className="liveVerifierGrid">
          <section>
            <h2>Contract state</h2>
            <label className="fieldLabel">
              Position ID
              <input
                value={positionId}
                onChange={(event) => setPositionId(event.target.value)}
                placeholder="0x..."
              />
            </label>
            <button
              className="primaryButton"
              disabled={!isLiveMode}
              onClick={readPosition}
              type="button"
            >
              Read contract state
            </button>
            {liveEvidence && (
              <dl className="parsedFacts">
                {Object.entries(liveEvidence).map(([key, value]) => (
                  <div key={key}>
                    <dt>{key}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </section>
          <section>
            <h2>Mirror receipt</h2>
            <label className="fieldLabel">
              Transaction ID or hash
              <input
                value={transactionId}
                onChange={(event) => setTransactionId(event.target.value)}
                placeholder="0.0.123-123-456 or 0x..."
              />
            </label>
            <button
              className="primaryButton"
              onClick={readMirror}
              type="button"
            >
              Query Mirror Node
            </button>
            {mirrorFact && (
              <dl className="parsedFacts">
                {Object.entries(mirrorFact).map(([key, value]) => (
                  <div key={key}>
                    <dt>{key}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            )}
            {rawMirror && (
              <details className="rawEvidence">
                <summary>Raw Mirror JSON</summary>
                <pre>{JSON.stringify(rawMirror, null, 2).slice(0, 4_000)}</pre>
              </details>
            )}
          </section>
        </div>
      </details>

      <details className="rawEvidence referenceRaw">
        <summary>Raw committed reference record</summary>
        <pre>{JSON.stringify(referenceDeployment, null, 2)}</pre>
      </details>

      <div className="statusLine" role="status">
        {message}
      </div>
    </div>
  );
}
