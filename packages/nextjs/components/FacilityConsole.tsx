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
import { addresses, isLiveMode } from "@/lib/chain";
import { atsAbi, oracleAbi, pythAbi, railAbi } from "@/lib/contracts";
import { referenceDeployment } from "@/lib/reference";

const PRICE_ID =
  "0x3728e591097635310e6341af53db8b7ee42da9b3a8d918f9463ce9cca886dfbd";

type Preview = readonly [bigint, bigint, bigint, bigint, bigint, bigint];

function hbar(tinybar: bigint) {
  return `${formatUnits(tinybar, 8)} HBAR`;
}

function errorText(error: unknown) {
  return error instanceof Error
    ? error.message.split("\n")[0]
    : "The transaction could not be prepared.";
}

export function FacilityConsole() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync, isPending } = useWriteContract();
  const [mode, setMode] = useState<"reference" | "live">("reference");
  const [borrower, setBorrower] = useState("");
  const [collateral, setCollateral] = useState("10");
  const [principalUsd, setPrincipalUsd] = useState("70");
  const [rateBps, setRateBps] = useState("1000");
  const [termDays, setTermDays] = useState("30");
  const [positionId, setPositionId] = useState("");
  const [preview, setPreview] = useState<Preview>();
  const [message, setMessage] = useState(
    "Reference mode is ready. Add public deployment addresses to transact.",
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
        termSeconds: BigInt(Math.round(Number(termDays) * 86_400)),
        offerExpiresAt: BigInt(Math.floor(Date.now() / 1000) + 3_600),
      } as const;
    } catch {
      return undefined;
    }
  }, [borrower, collateral, principalUsd, rateBps, termDays]);

  const ready =
    mode === "live" && isLiveMode && isConnected && Boolean(publicClient);

  async function run(label: string, action: () => Promise<Hex | void>) {
    try {
      setMessage(`${label} is waiting for confirmation.`);
      const hash = await action();
      if (hash) setTransactionHash(hash);
      setMessage(`${label} submitted successfully.`);
    } catch (error) {
      setMessage(errorText(error));
    }
  }

  async function quote() {
    if (!publicClient || !addresses.rail || !terms) {
      setMessage(
        "Enter a valid borrower and facility terms. Live addresses are required for a quote.",
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
      setMessage(
        "Quote read from the rail using the current validated Pyth price.",
      );
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
      if (!response.ok)
        throw new Error(`Hermes returned HTTP ${response.status}.`);
      const payload = (await response.json()) as {
        binary?: { data?: string[] };
      };
      const updateData =
        payload.binary?.data?.map((value) => `0x${value}` as Hex) ?? [];
      if (updateData.length === 0)
        throw new Error("Hermes returned no update payload.");
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
    await run("Offer funding", () =>
      writeContractAsync({
        address: addresses.rail!,
        abi: railAbi,
        functionName: "fundOffer",
        args: [terms],
        value: preview[1],
      }),
    );
  }

  async function approve() {
    if (!addresses.atsToken || !addresses.rail) return;
    await run("ATS allowance", () =>
      writeContractAsync({
        address: addresses.atsToken!,
        abi: atsAbi,
        functionName: "approve",
        args: [addresses.rail!, BigInt(collateral)],
      }),
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
    await run("Offer acceptance", () =>
      writeContractAsync({
        address: addresses.rail!,
        abi: railAbi,
        functionName: "acceptOffer",
        args: [id],
      }),
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
    await run("Repayment", async () => {
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
    });
  }

  async function settle() {
    const id = validPositionId();
    if (!addresses.rail || !id) return;
    await run("Permissionless settlement", () =>
      writeContractAsync({
        address: addresses.rail!,
        abi: railAbi,
        functionName: "settle",
        args: [id],
      }),
    );
  }

  async function withdraw() {
    if (!addresses.rail) return;
    await run("Credit withdrawal", () =>
      writeContractAsync({
        address: addresses.rail!,
        abi: railAbi,
        functionName: "withdraw",
      }),
    );
  }

  return (
    <div className="consoleShell">
      <aside className="workflowRail">
        <span>Facility workflow</span>
        {["Price", "Fund", "Approve", "Accept", "Repay", "Recover"].map(
          (item, index) => (
            <div className="workflowStep" key={item}>
              <i>{String(index + 1).padStart(2, "0")}</i>
              <b>{item}</b>
            </div>
          ),
        )}
      </aside>

      <div className="consoleMain">
        <div className="consoleIntro">
          <div>
            <span className="eyebrow">Bilateral facility</span>
            <h1>Move cash. Encumber the security.</h1>
          </div>
          <div className="networkReadout">
            <span>Network</span>
            <b>Hedera testnet · 296</b>
          </div>
        </div>

        <div className="modeSwitch" aria-label="Facility mode">
          <button
            aria-pressed={mode === "reference"}
            className={mode === "reference" ? "active" : ""}
            onClick={() => setMode("reference")}
            type="button"
          >
            Reference replay
          </button>
          <button
            aria-pressed={mode === "live"}
            className={mode === "live" ? "active" : ""}
            onClick={() => setMode("live")}
            type="button"
          >
            Live wallet
          </button>
        </div>

        {mode === "reference" && (
          <section className="referenceReplay" aria-label="Reference replay">
            <div>
              <span className="eyebrow">Public evidence</span>
              <h2>Replay both terminal paths</h2>
              <p>
                This mode reads the committed testnet record. It never needs a
                wallet or a private key.
              </p>
            </div>
            {referenceDeployment.positions.length === 2 ? (
              <div className="replayPositions">
                {referenceDeployment.positions.map((position) => (
                  <article key={position.id}>
                    <span>{position.state}</span>
                    <b>{position.terminalPath.replaceAll("-", " ")}</b>
                    <small>Hold {position.holdId}</small>
                    <a
                      href={`https://hashscan.io/testnet/contract/${referenceDeployment.addresses.rail}`}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Inspect rail on HashScan ↗
                    </a>
                  </article>
                ))}
              </div>
            ) : (
              <div className="noticeBox">
                <b>Evidence pending</b>
                <span>{referenceDeployment.notice}</span>
              </div>
            )}
          </section>
        )}

        {mode === "live" && !isLiveMode && (
          <div className="noticeBox">
            <b>Live mode needs public addresses</b>
            <span>
              Set the rail, ATS token, and oracle public addresses. Signatures
              stay in the connected wallet.
            </span>
          </div>
        )}

        <section className="consoleSection">
          <div className="consoleSectionHead">
            <span>01</span>
            <div>
              <h2>Terms and cash quote</h2>
              <p>
                Pyth converts USD terms to tinybar. It does not value the bond.
              </p>
            </div>
          </div>
          <div className="formGrid">
            <label className="wide">
              Borrower address
              <input
                value={borrower}
                onChange={(event) => setBorrower(event.target.value)}
                placeholder="0x…"
              />
            </label>
            <label>
              Collateral units
              <input
                inputMode="numeric"
                value={collateral}
                onChange={(event) => setCollateral(event.target.value)}
              />
            </label>
            <label>
              Principal, USD
              <input
                inputMode="decimal"
                value={principalUsd}
                onChange={(event) => setPrincipalUsd(event.target.value)}
              />
            </label>
            <label>
              Annual rate, bps
              <input
                inputMode="numeric"
                value={rateBps}
                onChange={(event) => setRateBps(event.target.value)}
              />
            </label>
            <label>
              Term, days
              <input
                inputMode="decimal"
                value={termDays}
                onChange={(event) => setTermDays(event.target.value)}
              />
            </label>
          </div>
          <div className="actionRow">
            <button
              className="secondaryButton"
              disabled={!ready || isPending}
              onClick={updatePyth}
              type="button"
            >
              Update Pyth
            </button>
            <button
              className="primaryButton"
              disabled={!ready || !terms || isPending}
              onClick={quote}
              type="button"
            >
              Preview offer
            </button>
            <button
              className="primaryButton"
              disabled={!ready || !preview || isPending}
              onClick={fund}
              type="button"
            >
              Fund exact HBAR
            </button>
          </div>
          {preview && (
            <div className="quoteStrip">
              <div>
                <span>Principal</span>
                <b>{hbar(preview[1])}</b>
              </div>
              <div>
                <span>Repayment</span>
                <b>{hbar(preview[2])}</b>
              </div>
              <div>
                <span>Maximum USD</span>
                <b>${formatUnits(preview[0], 8)}</b>
              </div>
              <div>
                <span>HBAR/USD</span>
                <b>${formatUnits(preview[4], 8)}</b>
              </div>
            </div>
          )}
        </section>

        <section className="consoleSection">
          <div className="consoleSectionHead">
            <span>02</span>
            <div>
              <h2>Collateral and terminal action</h2>
              <p>
                The borrower approves the rail, then the hold is inspected
                before the position opens.
              </p>
            </div>
          </div>
          <label className="positionInput">
            Offer or position ID
            <input
              value={positionId}
              onChange={(event) => setPositionId(event.target.value)}
              placeholder="0x + 64 hex characters"
            />
          </label>
          <div className="actionGrid">
            <button
              disabled={!ready || isPending}
              onClick={approve}
              type="button"
            >
              Approve ATS
            </button>
            <button
              disabled={!ready || !validPositionId() || isPending}
              onClick={accept}
              type="button"
            >
              Accept and hold
            </button>
            <button
              disabled={!ready || !validPositionId() || isPending}
              onClick={cancel}
              type="button"
            >
              Cancel offer
            </button>
            <button
              disabled={!ready || !validPositionId() || isPending}
              onClick={repay}
              type="button"
            >
              Repay and release
            </button>
            <button
              disabled={!ready || !validPositionId() || isPending}
              onClick={settle}
              type="button"
            >
              Settle overdue
            </button>
            <button
              disabled={!ready || isPending}
              onClick={withdraw}
              type="button"
            >
              Withdraw credit
            </button>
          </div>
        </section>

        <div className="transactionBar" role="status">
          <span>{message}</span>
          {transactionHash && (
            <a
              href={`https://hashscan.io/testnet/transaction/${transactionHash}`}
              rel="noreferrer"
              target="_blank"
            >
              HashScan ↗
            </a>
          )}
          {address && <small>Signer {address}</small>}
        </div>
      </div>
    </div>
  );
}
