"use client";

import { useMemo, useState } from "react";
import {
  formatUnits,
  isAddress,
  isHex,
  parseUnits,
  type Address,
  type Hex,
} from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import {
  facilityRecipes,
  getRecipe,
  type FacilityRecipe,
} from "@collateral-rail/shared/recipes";
import { FacilityStep } from "@/components/FacilityStep";
import { addresses, isLiveMode } from "@/lib/chain";
import { atsAbi, oracleAbi, pythAbi, railAbi } from "@/lib/contracts";
import { referenceDeployment } from "@/lib/reference";

const PRICE_ID =
  "0x3728e591097635310e6341af53db8b7ee42da9b3a8d918f9463ce9cca886dfbd";

const steps = [
  ["Choose recipe", "Read only"],
  ["Set terms", "Lender"],
  ["Price and fund", "Lender"],
  ["Approve and lock", "Borrower"],
  ["Repay or settle", "Borrower or any account"],
  ["Withdraw credit", "Lender or borrower"],
] as const;

type Preview = readonly [bigint, bigint, bigint, bigint, bigint, bigint];
type Mode = "reference" | "live";

type FacilityConsoleProps = {
  initialMode: Mode;
  initialRecipeId: string;
};

function hbar(tinybar: bigint) {
  return `${formatUnits(tinybar, 8)} HBAR`;
}

function errorText(error: unknown) {
  return error instanceof Error
    ? error.message.split("\n")[0]
    : "The transaction could not be prepared.";
}

function policyLine(recipe: FacilityRecipe) {
  return `${recipe.policy.maximumAdvanceBps / 100}% advance · ${recipe.policy.maximumAnnualRateBps / 100}% maximum APR · ${recipe.policy.maximumTermSeconds}s maximum term`;
}

export function FacilityConsole({
  initialMode,
  initialRecipeId,
}: FacilityConsoleProps) {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync, isPending } = useWriteContract();
  const [mode, setModeState] = useState<Mode>(initialMode);
  const [recipe, setRecipeState] = useState(() => getRecipe(initialRecipeId));
  const [activeStep, setActiveStep] = useState(0);
  const [completed, setCompleted] = useState<Set<number>>(new Set());
  const [borrower, setBorrower] = useState("");
  const [collateral, setCollateral] = useState(
    recipe.defaultTerms.collateralAmount,
  );
  const [principalUsd, setPrincipalUsd] = useState(
    recipe.defaultTerms.principalUsd,
  );
  const [rateBps, setRateBps] = useState(
    String(recipe.defaultTerms.annualRateBps),
  );
  const [termSeconds, setTermSeconds] = useState(
    String(recipe.defaultTerms.termSeconds),
  );
  const [positionId, setPositionId] = useState("");
  const [preview, setPreview] = useState<Preview>();
  const [allowanceSubmitted, setAllowanceSubmitted] = useState(false);
  const [terminalChoice, setTerminalChoice] = useState<"repay" | "settle">(
    "repay",
  );
  const [message, setMessage] = useState(
    "Reference mode is ready. No wallet or secret is required.",
  );
  const [transactionHash, setTransactionHash] = useState<Hex>();

  const terms = useMemo(() => {
    if (!isAddress(borrower)) return undefined;
    try {
      return {
        borrower: borrower as Address,
        collateralAmount: BigInt(collateral),
        principalUsdE8: parseUnits(principalUsd, 8),
        annualRateBps: Number(rateBps),
        termSeconds: BigInt(termSeconds),
        offerExpiresAt: BigInt(Math.floor(Date.now() / 1000) + 3_600),
      } as const;
    } catch {
      return undefined;
    }
  }, [borrower, collateral, principalUsd, rateBps, termSeconds]);

  const ready =
    mode === "live" && isLiveMode && isConnected && Boolean(publicClient);

  function replaceUrl(nextRecipe: string, nextMode: Mode) {
    window.history.replaceState(
      null,
      "",
      `/facility?recipe=${encodeURIComponent(nextRecipe)}&mode=${nextMode}`,
    );
  }

  function setMode(nextMode: Mode) {
    setModeState(nextMode);
    setActiveStep(0);
    replaceUrl(recipe.id, nextMode);
  }

  function chooseRecipe(id: string) {
    const next = getRecipe(id);
    setRecipeState(next);
    setCollateral(next.defaultTerms.collateralAmount);
    setPrincipalUsd(next.defaultTerms.principalUsd);
    setRateBps(String(next.defaultTerms.annualRateBps));
    setTermSeconds(String(next.defaultTerms.termSeconds));
    setPreview(undefined);
    setCompleted(new Set());
    replaceUrl(next.id, mode);
  }

  function finishStep(
    step: number,
    next = Math.min(step + 1, steps.length - 1),
  ) {
    setCompleted((current) => new Set(current).add(step));
    setActiveStep(next);
    window.requestAnimationFrame(() => {
      document.getElementById(`facility-step-${next}`)?.focus();
    });
  }

  async function run(
    label: string,
    action: () => Promise<Hex | void>,
    onSuccess?: () => void,
  ) {
    try {
      setMessage(`${label} is waiting for confirmation.`);
      const hash = await action();
      if (hash) setTransactionHash(hash);
      setMessage(`${label} submitted successfully.`);
      onSuccess?.();
    } catch (error) {
      setMessage(errorText(error));
    }
  }

  async function quote() {
    if (!publicClient || !addresses.rail || !terms) {
      setMessage(
        "Enter a valid borrower and terms. Public live addresses are also required.",
      );
      return;
    }
    try {
      const result = await publicClient.readContract({
        address: addresses.rail,
        abi: railAbi,
        functionName: "previewOffer",
        args: [terms],
      });
      setPreview(result);
      setMessage("Quote read from the rail using its validated Pyth price.");
    } catch (error) {
      setMessage(errorText(error));
    }
  }

  async function updatePyth() {
    if (!publicClient || !addresses.oracle) return;
    const oracleAddress = addresses.oracle;
    await run("Pyth update", async () => {
      const url = `https://hermes.pyth.network/v2/updates/price/latest?ids[]=${PRICE_ID.slice(2)}&encoding=hex`;
      const response = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        throw new Error(`Hermes returned HTTP ${response.status}.`);
      }
      const payload = (await response.json()) as {
        binary?: { data?: string[] };
      };
      const values = payload.binary?.data ?? [];
      if (
        values.length === 0 ||
        values.some((value) => !/^[a-fA-F0-9]+$/.test(value))
      ) {
        throw new Error("Hermes returned no valid update payload.");
      }
      const updateData = values.map((value) => `0x${value}` as Hex);
      const fee = await publicClient.readContract({
        address: addresses.pyth,
        abi: pythAbi,
        functionName: "getUpdateFee",
        args: [updateData],
      });
      return writeContractAsync({
        address: oracleAddress,
        abi: oracleAbi,
        functionName: "updatePrice",
        args: [updateData],
        value: fee,
      });
    });
  }

  async function fund() {
    if (!addresses.rail || !terms || !preview) return;
    await run(
      "Offer funding",
      () =>
        writeContractAsync({
          address: addresses.rail!,
          abi: railAbi,
          functionName: "fundOffer",
          args: [terms],
          value: preview[1],
        }),
      () => finishStep(2),
    );
  }

  async function approve() {
    if (!addresses.atsToken || !addresses.rail) return;
    await run(
      "ATS allowance",
      () =>
        writeContractAsync({
          address: addresses.atsToken!,
          abi: atsAbi,
          functionName: "approve",
          args: [addresses.rail!, BigInt(collateral)],
        }),
      () => setAllowanceSubmitted(true),
    );
  }

  function validPositionId(): Hex | undefined {
    return isHex(positionId) && positionId.length === 66
      ? (positionId as Hex)
      : undefined;
  }

  async function accept() {
    const id = validPositionId();
    if (!addresses.rail || !id) return;
    await run(
      "Offer acceptance",
      () =>
        writeContractAsync({
          address: addresses.rail!,
          abi: railAbi,
          functionName: "acceptOffer",
          args: [id],
        }),
      () => finishStep(3),
    );
  }

  async function cancel() {
    const id = validPositionId();
    if (!addresses.rail || !id) return;
    await run("Offer cancellation", () =>
      writeContractAsync({
        address: addresses.rail!,
        abi: railAbi,
        functionName: "cancelOffer",
        args: [id],
      }),
    );
  }

  async function repay() {
    const id = validPositionId();
    if (!addresses.rail || !id || !publicClient) return;
    await run(
      "Repayment",
      async () => {
        const position = await publicClient.readContract({
          address: addresses.rail!,
          abi: railAbi,
          functionName: "getPosition",
          args: [id],
        });
        return writeContractAsync({
          address: addresses.rail!,
          abi: railAbi,
          functionName: "repay",
          args: [id],
          value: position.repaymentTinybar,
        });
      },
      () => finishStep(4),
    );
  }

  async function settle() {
    const id = validPositionId();
    if (!addresses.rail || !id) return;
    await run(
      "Permissionless settlement",
      () =>
        writeContractAsync({
          address: addresses.rail!,
          abi: railAbi,
          functionName: "settle",
          args: [id],
        }),
      () => finishStep(4),
    );
  }

  async function withdraw() {
    if (!addresses.rail) return;
    await run(
      "Credit withdrawal",
      () =>
        writeContractAsync({
          address: addresses.rail!,
          abi: railAbi,
          functionName: "withdraw",
        }),
      () => finishStep(5),
    );
  }

  function referenceBody(step: number) {
    const selectedPosition =
      referenceDeployment.positions[
        step === 4 && terminalChoice === "settle" ? 1 : 0
      ];
    const lifecycle = referenceDeployment.lifecycle as Record<
      string,
      string | null
    >;
    const transactionKey = [
      null,
      null,
      "fundedOffer",
      "holdCreation",
      terminalChoice === "repay" ? "repaidFacility" : "maturedDefault",
      "liveConfigurationRead",
    ][step];
    const hash = transactionKey ? lifecycle[transactionKey] : null;

    return (
      <div className="referenceStep">
        {step === 0 && (
          <>
            <label className="fieldLabel">
              Financing recipe
              <select
                value={recipe.id}
                onChange={(event) => chooseRecipe(event.target.value)}
              >
                {facilityRecipes.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name}
                  </option>
                ))}
              </select>
            </label>
            <p>{recipe.purpose}</p>
          </>
        )}
        <p>
          {referenceDeployment.status === "verified"
            ? "This step is reconstructed from the committed Hedera testnet record."
            : referenceDeployment.notice}
        </p>
        {step === 1 && <p className="monoLine">{policyLine(recipe)}</p>}
        {step === 2 && (
          <dl className="proofMiniLedger">
            <div>
              <dt>Pyth HBAR/USD</dt>
              <dd>
                {referenceDeployment.pyth
                  ? formatUnits(BigInt(referenceDeployment.pyth.priceUsdE8), 8)
                  : "Pending"}
              </dd>
            </div>
            <div>
              <dt>Cash leg</dt>
              <dd>Exact tinybar</dd>
            </div>
          </dl>
        )}
        {step === 3 && (
          <p className="monoLine">
            {selectedPosition
              ? `ATS hold ${selectedPosition.holdId} · ${selectedPosition.collateralAmount} units`
              : "ATS hold proof pending"}
          </p>
        )}
        {step === 4 && (
          <div className="choiceRow" role="group" aria-label="Terminal path">
            <button
              aria-pressed={terminalChoice === "repay"}
              onClick={() => setTerminalChoice("repay")}
              type="button"
            >
              Repaid path
            </button>
            <button
              aria-pressed={terminalChoice === "settle"}
              onClick={() => setTerminalChoice("settle")}
              type="button"
            >
              Default path
            </button>
          </div>
        )}
        {step === 5 && (
          <p className="monoLine">
            Cash liabilities and HSS reserves are proven as separate balances.
          </p>
        )}
        {hash && (
          <a
            className="proofLink"
            href={`https://hashscan.io/testnet/transaction/${hash}`}
            rel="noreferrer"
            target="_blank"
          >
            Open this receipt on HashScan
          </a>
        )}
        <button
          className="primaryButton"
          onClick={() => finishStep(step)}
          type="button"
        >
          {step === steps.length - 1 ? "Replay complete" : "Continue"}
        </button>
      </div>
    );
  }

  function liveBody(step: number) {
    if (step === 0) {
      return (
        <>
          <label className="fieldLabel">
            Financing recipe
            <select
              value={recipe.id}
              onChange={(event) => chooseRecipe(event.target.value)}
            >
              {facilityRecipes.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </option>
              ))}
            </select>
          </label>
          <p>{recipe.purpose}</p>
          <p className="monoLine">{policyLine(recipe)}</p>
          <button
            className="primaryButton"
            onClick={() => finishStep(0)}
            type="button"
          >
            Use this recipe
          </button>
        </>
      );
    }

    if (step === 1) {
      return (
        <>
          <div className="compactForm">
            <label className="fieldLabel wide">
              Borrower address
              <input
                value={borrower}
                onChange={(event) => setBorrower(event.target.value)}
                placeholder="0x..."
              />
            </label>
            <label className="fieldLabel">
              Collateral units
              <input
                inputMode="numeric"
                value={collateral}
                onChange={(event) => setCollateral(event.target.value)}
              />
            </label>
            <label className="fieldLabel">
              Principal, USD
              <input
                inputMode="decimal"
                value={principalUsd}
                onChange={(event) => setPrincipalUsd(event.target.value)}
              />
            </label>
            <label className="fieldLabel">
              Annual rate, bps
              <input
                inputMode="numeric"
                value={rateBps}
                onChange={(event) => setRateBps(event.target.value)}
              />
            </label>
            <label className="fieldLabel">
              Term, seconds
              <input
                inputMode="numeric"
                value={termSeconds}
                onChange={(event) => setTermSeconds(event.target.value)}
              />
            </label>
          </div>
          <button
            className="primaryButton"
            disabled={!terms}
            onClick={() => finishStep(1)}
            type="button"
          >
            Apply terms
          </button>
        </>
      );
    }

    if (step === 2) {
      return (
        <>
          <p>
            Pyth converts the USD cash terms into exact tinybar. It does not
            value the ATS security.
          </p>
          {preview && (
            <dl className="proofMiniLedger">
              <div>
                <dt>Principal</dt>
                <dd>{hbar(preview[1])}</dd>
              </div>
              <div>
                <dt>Repayment</dt>
                <dd>{hbar(preview[2])}</dd>
              </div>
              <div>
                <dt>HBAR/USD</dt>
                <dd>${formatUnits(preview[4], 8)}</dd>
              </div>
            </dl>
          )}
          <button
            className="primaryButton"
            disabled={!ready || !terms || isPending}
            onClick={preview ? fund : quote}
            type="button"
          >
            {preview ? "Fund exact HBAR" : "Preview offer"}
          </button>
          <details className="technicalDetails">
            <summary>Technical details</summary>
            <p>
              If the stored quote is stale, submit a fresh Hermes payload before
              previewing again.
            </p>
            <button
              className="secondaryButton"
              disabled={!ready || isPending}
              onClick={updatePyth}
              type="button"
            >
              Update Pyth
            </button>
          </details>
        </>
      );
    }

    if (step === 3) {
      return (
        <>
          <label className="fieldLabel">
            Offer ID
            <input
              value={positionId}
              onChange={(event) => setPositionId(event.target.value)}
              placeholder="0x + 64 hex characters"
            />
          </label>
          <p>
            The ATS hold is read back after creation. Amount, escrow,
            destination, partition, and expiry must match.
          </p>
          <button
            className="primaryButton"
            disabled={
              !ready || isPending || (allowanceSubmitted && !validPositionId())
            }
            onClick={allowanceSubmitted ? accept : approve}
            type="button"
          >
            {allowanceSubmitted
              ? "Accept and lock collateral"
              : "Approve ATS collateral"}
          </button>
          <details className="technicalDetails">
            <summary>Technical details</summary>
            <button
              className="secondaryButton"
              disabled={!ready || !validPositionId() || isPending}
              onClick={cancel}
              type="button"
            >
              Cancel funded offer
            </button>
          </details>
        </>
      );
    }

    if (step === 4) {
      return (
        <>
          <label className="fieldLabel">
            Position ID
            <input
              value={positionId}
              onChange={(event) => setPositionId(event.target.value)}
              placeholder="0x + 64 hex characters"
            />
          </label>
          <div className="choiceRow" role="group" aria-label="Terminal action">
            <button
              aria-pressed={terminalChoice === "repay"}
              onClick={() => setTerminalChoice("repay")}
              type="button"
            >
              Repay and release
            </button>
            <button
              aria-pressed={terminalChoice === "settle"}
              onClick={() => setTerminalChoice("settle")}
              type="button"
            >
              Settle overdue
            </button>
          </div>
          <button
            className="primaryButton"
            disabled={!ready || !validPositionId() || isPending}
            onClick={terminalChoice === "repay" ? repay : settle}
            type="button"
          >
            Submit terminal action
          </button>
          <details className="technicalDetails">
            <summary>Technical details</summary>
            <p>
              HSS improves timing. Public settlement remains the correctness
              path when automation is unavailable.
            </p>
          </details>
        </>
      );
    }

    return (
      <>
        <p>
          Pull payments keep external HBAR transfers outside the facility state
          transition.
        </p>
        <button
          className="primaryButton"
          disabled={!ready || isPending}
          onClick={withdraw}
          type="button"
        >
          Withdraw available credit
        </button>
      </>
    );
  }

  return (
    <div className="workbenchShell">
      <header className="workbenchIntro">
        <div>
          <span className="kicker">Facility workbench</span>
          <h1>One obligation, step by step.</h1>
        </div>
        <div className="modeSwitch" aria-label="Facility mode">
          <button
            aria-pressed={mode === "reference"}
            onClick={() => setMode("reference")}
            type="button"
          >
            Reference replay
          </button>
          <button
            aria-pressed={mode === "live"}
            onClick={() => setMode("live")}
            type="button"
          >
            Live wallet
          </button>
        </div>
      </header>

      <div className="workbenchContext">
        <span>{recipe.name}</span>
        <span>Hedera testnet · 296</span>
        <span>
          {mode === "reference"
            ? referenceDeployment.status
            : "Wallet execution"}
        </span>
      </div>

      {mode === "live" && !isLiveMode && (
        <div className="inlineNotice" role="note">
          <b>Live addresses are not configured.</b>
          <span>
            Add public rail, ATS token, and oracle addresses. Signing stays in
            the connected wallet.
          </span>
        </div>
      )}

      <div className="facilitySteps">
        {steps.map(([title, actor], index) => (
          <FacilityStep
            active={activeStep === index}
            actor={actor}
            completed={completed.has(index)}
            index={index}
            key={title}
            onSelect={() => setActiveStep(index)}
            receipt={mode === "reference" ? "Reviewed" : "Submitted"}
            title={title}
          >
            {mode === "reference" ? referenceBody(index) : liveBody(index)}
          </FacilityStep>
        ))}
      </div>

      <div className="statusLine" role="status">
        <span>{message}</span>
        {transactionHash && (
          <a
            href={`https://hashscan.io/testnet/transaction/${transactionHash}`}
            rel="noreferrer"
            target="_blank"
          >
            View receipt
          </a>
        )}
        {address && <small>Signer {address}</small>}
      </div>
    </div>
  );
}
