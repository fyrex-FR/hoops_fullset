#!/usr/bin/env python3
import csv
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

NS = {
    "a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}


def column_index(cell_ref: str) -> int:
    letters = re.match(r"[A-Z]+", cell_ref).group(0)
    value = 0
    for letter in letters:
        value = value * 26 + ord(letter) - 64
    return value - 1


def read_xlsx(path: Path) -> list[dict[str, str]]:
    with zipfile.ZipFile(path) as archive:
        shared_strings: list[str] = []
        if "xl/sharedStrings.xml" in archive.namelist():
            root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            for item in root.findall("a:si", NS):
                shared_strings.append("".join(t.text or "" for t in item.findall(".//a:t", NS)))

        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        rels = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        target_by_id = {rel.attrib["Id"]: rel.attrib["Target"] for rel in rels}

        records: list[dict[str, str]] = []
        for sheet in workbook.findall("a:sheets/a:sheet", NS):
            sheet_name = sheet.attrib["name"]
            rel_id = sheet.attrib["{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"]
            worksheet_path = "xl/" + target_by_id[rel_id].lstrip("/")
            worksheet_path = worksheet_path.replace("xl/xl/", "xl/")
            worksheet = ET.fromstring(archive.read(worksheet_path))
            current_subset = sheet_name

            for row in worksheet.findall("a:sheetData/a:row", NS):
                values = ["", "", ""]
                for cell in row.findall("a:c", NS):
                    index = column_index(cell.attrib.get("r", "A"))
                    if index > 2:
                        continue
                    value_node = cell.find("a:v", NS)
                    value = ""
                    if value_node is not None:
                        value = value_node.text or ""
                        if cell.attrib.get("t") == "s":
                            value = shared_strings[int(value)]
                    elif cell.attrib.get("t") == "inlineStr":
                        value = "".join(t.text or "" for t in cell.findall(".//a:t", NS))
                    values[index] = value.strip()

                number, player, team = values
                if not number:
                    continue
                if not player and not team:
                    lower = number.lower()
                    if "cards" not in lower and "#s" not in lower:
                        current_subset = number
                    continue
                if player and team:
                    records.append(
                        {
                            "set_slug": "2025-26-topps-nba-hoops-basketball",
                            "set_name": "2025-26 Topps NBA Hoops Basketball",
                            "category": sheet_name,
                            "subset": current_subset,
                            "card_number": number,
                            "player_name": player.rstrip(",").strip(),
                            "team_name": team,
                        }
                    )

    return records


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: import_checklist.py INPUT.xlsx OUTPUT.csv", file=sys.stderr)
        return 2

    input_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2])
    output_path.parent.mkdir(parents=True, exist_ok=True)
    records = read_xlsx(input_path)

    with output_path.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(
            file,
            fieldnames=[
                "set_slug",
                "set_name",
                "category",
                "subset",
                "card_number",
                "player_name",
                "team_name",
            ],
        )
        writer.writeheader()
        writer.writerows(records)

    print(f"wrote {len(records)} cards to {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

