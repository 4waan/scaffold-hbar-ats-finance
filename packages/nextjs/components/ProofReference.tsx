import {
  isScheduleProof,
  isStateProof,
  isTransactionProof,
  type ReferenceProof,
  safeHashScanLink,
} from "@/lib/proofs";

type ProofReferenceProps = {
  proof: ReferenceProof | null | undefined;
};

export function ProofReference({ proof }: ProofReferenceProps) {
  if (!proof) return <b className="proofPending">Proof pending</b>;

  if (isTransactionProof(proof)) {
    return (
      <div className="typedProof" data-proof-type="transaction">
        <span>Transaction receipt</span>
        <small>
          {proof.result} at {proof.consensusTimestamp}
        </small>
        <a
          className="proofLink"
          href={safeHashScanLink(proof.hashScan, "transaction")}
          rel="noopener noreferrer"
          target="_blank"
        >
          Open transaction on HashScan
        </a>
      </div>
    );
  }

  if (isScheduleProof(proof)) {
    return (
      <div className="typedProof" data-proof-type="schedule">
        <span>HSS schedule</span>
        <small>
          {proof.scheduleId}
          {proof.executedTimestamp
            ? ` executed at ${proof.executedTimestamp}`
            : " execution pending"}
        </small>
        <a
          className="proofLink"
          href={safeHashScanLink(proof.hashScan, "schedule")}
          rel="noopener noreferrer"
          target="_blank"
        >
          Open schedule on HashScan
        </a>
      </div>
    );
  }

  if (isStateProof(proof)) {
    return (
      <div className="typedProof" data-proof-type="state">
        <span>Verified contract state</span>
        <small>
          Block {proof.blockNumber} via {proof.rpcOrigin}
        </small>
      </div>
    );
  }

  return <b className="proofInvalid">Invalid proof omitted</b>;
}
