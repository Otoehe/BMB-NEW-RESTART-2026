[
  {
    "inputs": [
      { "internalType": "address", "name": "usdtAddress", "type": "address" },
      { "internalType": "address", "name": "treasury", "type": "address" },
      { "internalType": "address", "name": "signer", "type": "address" }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "uint256", "name": "orderId", "type": "uint256" },
      { "indexed": true, "internalType": "address", "name": "client", "type": "address" },
      { "indexed": true, "internalType": "address", "name": "performer", "type": "address" },
      { "indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256" },
      { "indexed": false, "internalType": "address", "name": "referrer", "type": "address" }
    ],
    "name": "OrderCreated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "uint256", "name": "orderId", "type": "uint256" }
    ],
    "name": "DisputeOpened",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "uint256", "name": "orderId", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "performerPart", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "platformPart", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "referrerPart", "type": "uint256" }
    ],
    "name": "Released",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "uint256", "name": "orderId", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "amountReturned", "type": "uint256" }
    ],
    "name": "Refunded",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "platformTreasury",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "usdt",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "voteSigner",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "orderId", "type": "uint256" },
      { "internalType": "address", "name": "performer", "type": "address" },
      { "internalType": "address", "name": "referrerOrZero", "type": "address" },
      { "internalType": "uint256", "name": "amount", "type": "uint256" }
    ],
    "name": "createOrder",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "orderId", "type": "uint256" },
      { "internalType": "bytes", "name": "executorSignature", "type": "bytes" }
    ],
    "name": "confirmCompletionByCustomer",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "orderId", "type": "uint256" }],
    "name": "openDispute",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "orderId", "type": "uint256" }
    ],
    "name": "orders",
    "outputs": [
      { "internalType": "address", "name": "client", "type": "address" },
      { "internalType": "address", "name": "performer", "type": "address" },
      { "internalType": "address", "name": "referrer", "type": "address" },
      { "internalType": "uint256", "name": "amount", "type": "uint256" },
      { "internalType": "uint8", "name": "status", "type": "uint8" },
      { "internalType": "bool", "name": "clientConfirmed", "type": "bool" },
      { "internalType": "uint64", "name": "disputeOpenedAt", "type": "uint64" },
      { "internalType": "uint32", "name": "votesClient", "type": "uint32" },
      { "internalType": "uint32", "name": "votesPerformer", "type": "uint32" },
      { "internalType": "uint32", "name": "totalVotes", "type": "uint32" },
      { "internalType": "uint32", "name": "finalizeNonce", "type": "uint32" }
    ],
    "stateMutability": "view",
    "type": "function"
  }
]
