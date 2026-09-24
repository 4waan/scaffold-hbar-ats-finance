export const railAbi = [
  {
    type: "function",
    name: "previewOffer",
    stateMutability: "view",
    inputs: [
      {
        name: "terms",
        type: "tuple",
        components: [
          { name: "borrower", type: "address" },
          { name: "collateralAmount", type: "uint128" },
          { name: "principalUsdE8", type: "uint128" },
          { name: "annualRateBps", type: "uint16" },
          { name: "termSeconds", type: "uint64" },
          { name: "offerExpiresAt", type: "uint64" },
        ],
      },
    ],
    outputs: [
      { name: "maximumPrincipalUsdE8", type: "uint256" },
      { name: "principalTinybar", type: "uint256" },
      { name: "repaymentTinybar", type: "uint256" },
      { name: "maturity", type: "uint64" },
      { name: "priceUsdE8", type: "uint256" },
      { name: "publishTime", type: "uint64" },
    ],
  },
  {
    type: "function",
    name: "fundOffer",
    stateMutability: "payable",
    inputs: [
      {
        name: "terms",
        type: "tuple",
        components: [
          { name: "borrower", type: "address" },
          { name: "collateralAmount", type: "uint128" },
          { name: "principalUsdE8", type: "uint128" },
          { name: "annualRateBps", type: "uint16" },
          { name: "termSeconds", type: "uint64" },
          { name: "offerExpiresAt", type: "uint64" },
        ],
      },
    ],
    outputs: [{ name: "offerId", type: "bytes32" }],
  },
  {
    type: "function",
    name: "cancelOffer",
    stateMutability: "nonpayable",
    inputs: [{ name: "offerId", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "acceptOffer",
    stateMutability: "nonpayable",
    inputs: [{ name: "offerId", type: "bytes32" }],
    outputs: [{ name: "positionId", type: "bytes32" }],
  },
  {
    type: "function",
    name: "repay",
    stateMutability: "payable",
    inputs: [{ name: "positionId", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "settle",
    stateMutability: "nonpayable",
    inputs: [{ name: "positionId", type: "bytes32" }],
    outputs: [{ name: "executed", type: "bool" }],
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "getPosition",
    stateMutability: "view",
    inputs: [{ name: "positionId", type: "bytes32" }],
    outputs: [
      {
        name: "position",
        type: "tuple",
        components: [
          { name: "lender", type: "address" },
          { name: "borrower", type: "address" },
          { name: "collateralAmount", type: "uint256" },
          { name: "holdId", type: "uint256" },
          { name: "principalTinybar", type: "uint256" },
          { name: "repaymentTinybar", type: "uint256" },
          { name: "openedAt", type: "uint64" },
          { name: "maturity", type: "uint64" },
          { name: "scheduleAddress", type: "address" },
          { name: "state", type: "uint8" },
          { name: "automation", type: "uint8" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "cashLiabilities",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "reservedAutomation",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;

export const atsAbi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "balanceOfByPartition",
    stateMutability: "view",
    inputs: [
      { name: "partition", type: "bytes32" },
      { name: "account", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "getHeldAmountForByPartition",
    stateMutability: "view",
    inputs: [
      { name: "partition", type: "bytes32" },
      { name: "account", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "getKycStatusFor",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint8" }],
  },
] as const;

export const pythAbi = [
  {
    type: "function",
    name: "getUpdateFee",
    stateMutability: "view",
    inputs: [{ name: "updateData", type: "bytes[]" }],
    outputs: [{ name: "feeAmount", type: "uint256" }],
  },
] as const;

export const oracleAbi = [
  {
    type: "function",
    name: "updatePrice",
    stateMutability: "payable",
    inputs: [{ name: "updateData", type: "bytes[]" }],
    outputs: [{ type: "uint256" }, { type: "uint256" }, { type: "uint64" }],
  },
  {
    type: "function",
    name: "latestHbarUsd",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }, { type: "uint256" }, { type: "uint64" }],
  },
] as const;

export const DEFAULT_PARTITION = `0x${"0".repeat(63)}1` as const;

export const positionStates = ["None", "Open", "Repaid", "Defaulted"] as const;
export const automationStates = [
  "None",
  "Pending",
  "Completed",
  "Unavailable",
] as const;
