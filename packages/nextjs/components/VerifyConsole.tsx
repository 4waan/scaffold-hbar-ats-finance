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
import { lifecycleLabels, referenceDeployment } from "@/lib/reference";

type Evidence = {
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

export function VerifyConsole() {
  const publicClient = usePublicClient();
  const [positionId, setPositionId] = useState("");
  const [transactionId, setTransactionId] = useState("");
  const [evidence, setEvidence] = useState<Evidence>();
  const [mirrorEvidence, setMirrorEvidence] =
    useState<Record<string, unknown>>();
  const [message, setMessage] = useState(
    "Enter a position ID to compare live state with public evidence.",
  );

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
      const position = await publicClient.readContract({
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
          args: [DEFAULT_PARTITION, position.borrower],
        }),
        publicClient.readContract({
          address: addresses.atsToken,
          abi: atsAbi,
          functionName: "getHeldAmountForByPartition",
          args: [DEFAULT_PARTITION, position.borrower],
        }),
      ]);
      setEvidence({
        state: positionStates[position.state] ?? `Unknown ${position.state}`,
        automation:
          automationStates[position.automation] ??
          `Unknown ${position.automation}`,
        lender: position.lender,
        borrower: position.borrower,
        collateral: position.collateralAmount.toString(),
        free: free.toString(),
        held: held.toString(),
        principal: `${formatUnits(position.principalTinybar, 8)} HBAR`,
        repayment: `${formatUnits(position.repaymentTinybar, 8)} HBAR`,
        maturity: new Date(Number(position.maturity) * 1000).toISOString(),
        schedule: position.scheduleAddress,
      });
      setMessage(
        "Live contract state loaded. Free and held ATS balances are shown separately.",
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
      setMessage(
        "Enter a Hedera transaction ID or a 32-byte transaction hash.",
      );
      return;
    }
    try {
      const response = await fetch(
        `https://testnet.mirrornode.hedera.com/api/v1/transactions/${encodeURIComponent(transactionId)}`,
        { headers: { Accept: "application/json" } },
      );
      if (!response.ok)
        throw new Error(`Mirror Node returned HTTP ${response.status}.`);
      const payload = (await response.json()) as Record<string, unknown>;
      const transactions = Array.isArray(payload.transactions)
        ? payload.transactions
        : [];
      if (transactions.length === 0)
        throw new Error("HTTP 200 contained no matching transaction.");
      setMirrorEvidence({ transactions, links: payload.links ?? null });
      setMessage(
        "Mirror evidence loaded. Inspect the result and pagination metadata before treating it as proof.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Mirror Node read failed.",
      );
    }
  }

  return (
    <div className="verifyShell">
      <section className="verifyHero">
        <span className="eyebrow">Evidence reconstruction</span>
        <h1>
          Trust the receipt.
          <br />
          Then verify the state.
        </h1>
        <p>
          HashScan proves deployed runtime code. Mirror Node and direct reads
          prove what the facility is now.
        </p>
      </section>

      <section className="verifyGrid">
        <article className="verifyCard liveState">
          <span className="cardNumber">01</span>
          <h2>Position state</h2>
          <p>Read the rail, then pair free and held ATS balances.</p>
          <label>
            Position ID
            <input
              value={positionId}
              onChange={(event) => setPositionId(event.target.value)}
              placeholder="0x…"
            />
          </label>
          <button
            className="primaryButton"
            disabled={!isLiveMode}
            onClick={readPosition}
            type="button"
          >
            Read live state
          </button>
          {evidence && (
            <dl>
              {Object.entries(evidence).map(([key, value]) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          )}
        </article>

        <article className="verifyCard mirrorState">
          <span className="cardNumber">02</span>
          <h2>Mirror receipt</h2>
          <p>
            A successful HTTP response is not enough. Require a nonempty
            matching transaction list.
          </p>
          <label>
            Transaction ID or hash
            <input
              value={transactionId}
              onChange={(event) => setTransactionId(event.target.value)}
              placeholder="0.0.123@… or 0x…"
            />
          </label>
          <button
            className="secondaryButton"
            onClick={readMirror}
            type="button"
          >
            Query Mirror Node
          </button>
          {mirrorEvidence && (
            <pre>{JSON.stringify(mirrorEvidence, null, 2).slice(0, 4000)}</pre>
          )}
        </article>
      </section>

      <section className="referenceLedger">
        <div>
          <span className="cardNumber">03</span>
          <h2>Committed reference lifecycle</h2>
          <p>{referenceDeployment.notice}</p>
        </div>
        <div className="checkpointList">
          {lifecycleLabels.map(([key, label]) => {
            const value = (
              referenceDeployment.lifecycle as Record<string, string | null>
            )[key];
            return (
              <div key={key}>
                <i className={value ? "complete" : "pending"} />
                <span>{label}</span>
                <b>{value ? "verified" : "pending"}</b>
              </div>
            );
          })}
        </div>
      </section>

      <div className="transactionBar" role="status">
        <span>{message}</span>
      </div>
    </div>
  );
}
