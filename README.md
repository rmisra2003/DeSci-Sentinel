# 🛡️ DeSci Sentinel

An autonomous research evaluation agent that helps scientists discover the right BioDAO in the [Bio.xyz](https://bio.xyz) ecosystem for their work.

## What It Does

DeSci Sentinel is a prototype that demonstrates how scientific research can be automatically evaluated, scored, and matched to the most relevant funding DAO. When a user submits an IPFS Content Identifier (CID) containing their research:

1. **Ownership Verification** — Checks Pinata IPFS metadata to confirm the submitter's connected wallet matches the wallet embedded in the research metadata.
2. **Plagiarism & Freshness** — Uses the Tavily AI Search API to search the live web and ensure the research is novel and not copied from existing publications.
3. **Duplicate Detection** — SHA-256 fingerprinting prevents the same content from being funded twice.
4. **AI Scoring** — An LLM evaluates the text and assigns scores (out of 25) for Reproducibility, Methodology, Novelty, and Impact.
5. **BioDAO Discovery** — Based on keywords in the research (e.g., "longevity", "psychedelics", "cryopreservation"), the AI recommends which of the 10 active BioDAOs is the best match:

   | BioDAO | Focus Area |
   |---|---|
   | [VitaDAO](https://vitadao.com) | Longevity |
   | [HairDAO](https://hairdao.xyz) | Dermatology |
   | [PsyDAO](https://psydao.io) | Psychedelic Medicine |
   | [CryoDAO](https://cryodao.org) | Cryobiology |
   | [AthenaDAO](https://athenadao.co) | Women's Health |
   | [ValleyDAO](https://valleydao.bio) | Synthetic Biology |
   | [CerebrumDAO](https://cerebrumdao.com) | Neuroscience |
   | [Curetopia](https://curetopia.xyz) | Rare Diseases |
   | [Long COVID Labs](https://longcovidlabs.org) | Post-Viral Syndromes |
   | [Quantum Biology DAO](https://quantumbiology.xyz) | Quantum Biology |

6. **Simulated Grant Payout** — If the research scores above an 80% trust threshold and the user signs with their Solana wallet, a Devnet transaction is executed simulating a BioDAO grant.

## How It Connects to Bio.xyz

DeSci Sentinel acts as a **discovery layer** for the Bio.xyz ecosystem. It uses publicly available information about the 10 active BioDAOs (names, focus areas, websites) and maps research submissions to the most relevant one using AI keyword analysis.

**What is real:**
- ✅ The 10 BioDAOs listed are real organizations in the Bio.xyz ecosystem
- ✅ IPFS ownership verification runs against real Pinata metadata
- ✅ Plagiarism detection searches the live web via Tavily AI
- ✅ Solana Devnet payouts are real on-chain transactions
- ✅ The Bio Launchpad feed scrapes live data from `app.bio.xyz`

**What is simulated:**
- ℹ️ The $BIO token is our own Devnet mint, not Bio Protocol's mainnet token
- ℹ️ BioDAO discovery is educational — we do not submit to DAOs on your behalf
- ℹ️ The scoring model is a heuristic LLM evaluation, not peer review

## Tech Stack

- **Frontend**: React 19 + Vite + TailwindCSS + `@solana/wallet-adapter-react`
- **Backend**: Node.js + Express + TypeScript + Socket.IO
- **Blockchain**: Solana Devnet (`@solana/web3.js`, `@solana/spl-token`)
- **Storage**: IPFS via Pinata
- **AI**: Tavily Search API for plagiarism, LLM for scoring
- **Deployment**: Render (single-service deployment via root `package.json`)

## Future Vision

The payout system is built to be **token-agnostic** — it only needs a mint address and a recipient wallet. Right now it uses a custom Devnet SPL token to simulate grants.

If Bio Protocol ever issues an official **$BIO SPL token on Solana**, DeSci Sentinel could become a real autonomous grant agent:
1. Evaluate submitted research (ownership, plagiarism, quality scoring)
2. Route it to the right BioDAO based on the research topic
3. Distribute actual $BIO funding to the researcher's wallet

The entire pipeline is already built and working. The only missing piece is a real token mint address — which is a single environment variable swap.

## Running Locally

### Prerequisites
- Node.js v20+
- Pinata JWT, Tavily API Key, Solana Devnet Keypair

### Backend
```bash
cd bio-scholar-backend
npm install
# Create .env with PINATA_JWT, TAVILY_API_KEY, AGENT_WALLET_KEYPAIR
npm run dev  # Runs on port 3001
```

### Frontend
```bash
cd Frontend
npm install
# Create .env with VITE_BACKEND_URL=http://localhost:3001
npm run dev  # Runs on port 3000
```

## my X id is @rammisraai
## my email id - rammisraai@gmail.com

