from __future__ import annotations

import argparse
from pathlib import Path

from app import SanmaApp
from config import load_config
from database import Database


def project_root() -> Path:
    return Path(__file__).resolve().parent.parent


def init_database() -> None:
    base_dir = project_root()
    config = load_config(base_dir)
    db = Database(base_dir / config["database_path"])
    db.initialize()
    db.seed_defaults()
    print(f"Database ready: {db.path}")


def main() -> None:
    parser = argparse.ArgumentParser(description="重汽三码合一程序")
    parser.add_argument("--init-db", action="store_true", help="初始化数据库并退出")
    parser.add_argument("--selfcheck", action="store_true", help="运行联机前自检并退出")
    args = parser.parse_args()

    if args.init_db:
        init_database()
        return

    if args.selfcheck:
        from selfcheck import main as run_selfcheck
        run_selfcheck()
        return

    app = SanmaApp(project_root())
    app.run()


if __name__ == "__main__":
    main()
