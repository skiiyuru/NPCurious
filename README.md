# NPCurious

A coordinated multi-agent system for the [Deliveroo.js](https://github.com/unitn-ASA/Deliveroo.js) parcel delivery game, built for the **Autonomous Software Agents** course at the University of Trento (A.Y. 2025-26).

## Overview

Agent A is a BDI agent that navigates, collects, and delivers parcels autonomously. Agent B is a full BDI player with an LLM coordinator feature that interprets natural-language missions from the game chat and solves them through an iterative tool-calling loop. The coordinator can act on Agent B itself or delegate commands to Agent A over the game socket via `assign_to_teammate`.

**Belief revision:** Bayesian correction for missing parcels within sensing range, exponential decay for parcels outside range. **Strategy adaptation:** the LLM can set policies (carry capacity, locked batching) and constraints (delivery zone whitelist/blacklist, tile avoidance, reward thresholds) that persistently modify autonomous behaviour. **PDDL integration:** an external planner with local A\* fallback for navigation.

## Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [pnpm](https://pnpm.io/) or npm

## Setup

```bash
git clone <repo-url>
cd NPCurious
pnpm install
cp .env.example .env
```

Set `HOST`, `TOKEN` (Agent A), `TOKEN_B` (Agent B), and `LLM_BASE_URL` in `.env`.

## Usage

```bash
pnpm start:a    # Agent A (BDI player)
pnpm start:b    # Agent B (BDI player + LLM coordinator)
```
