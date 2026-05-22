#!/usr/bin/env python3
import csv
import sys
from pathlib import Path
from typing import Optional


def sql_literal(value: Optional[str]) -> str:
    if value is None:
        return "null"
    return "'" + value.replace("'", "''") + "'"


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: generate_supabase_seed.py INPUT.csv OUTPUT.sql", file=sys.stderr)
        return 2

    input_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2])
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with input_path.open(newline="", encoding="utf-8") as file:
        source_rows = list(csv.DictReader(file))

    if not source_rows:
        print("input checklist is empty", file=sys.stderr)
        return 1

    rows = []
    seen_keys = set()
    duplicates = []
    for row in source_rows:
        key = (row["category"], row["subset"], row["card_number"])
        if key in seen_keys:
            duplicates.append(row)
            continue
        seen_keys.add(key)
        rows.append(row)

    set_slug = source_rows[0]["set_slug"]
    set_name = source_rows[0]["set_name"]
    release_year = set_slug.split("-topps-", 1)[0]

    lines = [
        "begin;",
        "",
        "with upserted_set as (",
        "  insert into public.hoops_card_sets (slug, name, release_year)",
        f"  values ({sql_literal(set_slug)}, {sql_literal(set_name)}, {sql_literal(release_year)})",
        "  on conflict (slug) do update",
        "    set name = excluded.name, release_year = excluded.release_year",
        "  returning id",
        ")",
        "insert into public.hoops_cards (set_id, category, subset, card_number, player_name, team_name)",
        "select upserted_set.id, seed.category, seed.subset, seed.card_number, seed.player_name, seed.team_name",
        "from upserted_set",
        "cross join (values",
    ]

    values = []
    for row in rows:
        values.append(
            "  ("
            + ", ".join(
                [
                    sql_literal(row["category"]),
                    sql_literal(row["subset"]),
                    sql_literal(row["card_number"]),
                    sql_literal(row["player_name"]),
                    sql_literal(row["team_name"]),
                ]
            )
            + ")"
        )

    lines.extend(",\n".join(values).splitlines())
    lines.extend(
        [
            ") as seed(category, subset, card_number, player_name, team_name)",
            "on conflict (set_id, card_number, subset) do update",
            "  set category = excluded.category,",
            "      player_name = excluded.player_name,",
            "      team_name = excluded.team_name;",
            "",
            "commit;",
            "",
        ]
    )

    output_path.write_text("\n".join(lines), encoding="utf-8")
    if duplicates:
        print(f"skipped {len(duplicates)} duplicate card keys", file=sys.stderr)
    print(f"wrote {len(rows)} cards to {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
