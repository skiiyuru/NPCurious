# NPCurious

An autonomous agent for the [Deliveroo.js](https://github.com/unitn-ASA/Deliveroo.js) parcel delivery game, built for the **Autonomous Software Agents** course at the University of Trento (A.Y. 2025-26).

## Overview

NPCurious is a BDI-based agent that autonomously navigates a grid environment, picking up and delivering parcels to maximize score. The project will extend to include an LLM-based agent capable of interpreting natural language objectives and coordinating with the BDI agent.

## Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [pnpm](https://pnpm.io/)
- Access to a Deliveroo.js server (local or UniTN VPN)

## Setup

```bash
git clone the repo
cd NPCurious
pnpm install
```

Create a `.env` file from the example:

```bash
cp .env.example .env
```

Set your `HOST` and `TOKEN` values (get your token from the Deliveroo.js 3D client).

## Usage

```bash
node index.js
```

## Development

This project enforces code quality via Git hooks:

- **Prettier** — auto-formats staged files on commit
- **Commitlint** — enforces [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `chore:`, etc.)

Hooks are managed by [Husky](https://typicode.github.io/husky/) + [lint-staged](https://github.com/lint-staged/lint-staged).

## Team

- Steve
- Thomas

## License

[MIT](LICENSE)

```

Adjust the repo URL, team details, and any specifics. You can always expand sections as the project grows!
```
