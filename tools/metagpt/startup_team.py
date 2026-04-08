"""
MetaGPT "software company" quickstart (programmatic).
Requires: Python 3.9+, pip install -r requirements.txt, and LLM config (see MetaGPT docs).

This script does NOT ship in the mobile app — use it on your dev machine to generate or
iterate on features. For incremental work on this repo, prefer the CLI in run_incremental.ps1.
"""

from __future__ import annotations

import asyncio
import os
import sys

# Ensure repo root is not required for metagpt imports; metagpt must be on PYTHONPATH via venv.


async def startup(idea: str) -> None:
    from metagpt.roles import Architect, Engineer, ProductManager, ProjectManager
    from metagpt.team import Team

    company = Team()
    company.hire(
        [
            ProductManager(),
            Architect(),
            ProjectManager(),
            Engineer(),
        ]
    )
    company.invest(investment=float(os.environ.get("METAGPT_INVESTMENT", "3.0")))
    company.run_project(idea=idea)
    n_round = int(os.environ.get("METAGPT_N_ROUND", "5"))
    await company.run(n_round=n_round)


def main() -> None:
    idea = " ".join(sys.argv[1:]).strip() or "write a cli blackjack game"
    asyncio.run(startup(idea=idea))


if __name__ == "__main__":
    main()
