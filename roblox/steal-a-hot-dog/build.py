#!/usr/bin/env python3
"""Build StealAHotDog.rbxlx, a Roblox place file, from the Lua sources in src/.

Roblox Studio opens the resulting XML place directly (File -> Open from File).
Run:  python3 build.py
"""

from __future__ import annotations

import os
import sys
from xml.sax.saxutils import escape

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, "src")
OUTPUT = os.path.join(ROOT, "StealAHotDog.rbxlx")


class Item:
    def __init__(self, cls, props=None, children=None):
        self.cls = cls
        self.props = props or []
        self.children = children or []


def p_string(name, value):
    return f"<string name=\"{name}\">{escape(value)}</string>"


def p_bool(name, value):
    return f"<bool name=\"{name}\">{'true' if value else 'false'}</bool>"


def p_int(name, value):
    return f"<int name=\"{name}\">{int(value)}</int>"


def p_float(name, value):
    return f"<float name=\"{name}\">{float(value)}</float>"


def p_token(name, value):
    return f"<token name=\"{name}\">{int(value)}</token>"


def p_color3uint8(name, rgb):
    r, g, b = rgb
    packed = (0xFF << 24) | (r << 16) | (g << 8) | b
    return f"<Color3uint8 name=\"{name}\">{packed}</Color3uint8>"


def p_color3(name, rgb):
    r, g, b = (channel / 255.0 for channel in rgb)
    return (
        f"<Color3 name=\"{name}\"><R>{r}</R><G>{g}</G><B>{b}</B></Color3>"
    )


def p_vector3(name, xyz):
    x, y, z = xyz
    return (
        f"<Vector3 name=\"{name}\"><X>{x}</X><Y>{y}</Y><Z>{z}</Z></Vector3>"
    )


def p_cframe(name, position):
    x, y, z = position
    return (
        f"<CoordinateFrame name=\"{name}\">"
        f"<X>{x}</X><Y>{y}</Y><Z>{z}</Z>"
        "<R00>1</R00><R01>0</R01><R02>0</R02>"
        "<R10>0</R10><R11>1</R11><R12>0</R12>"
        "<R20>0</R20><R21>0</R21><R22>1</R22>"
        "</CoordinateFrame>"
    )


def p_source(path):
    full = os.path.join(SRC, path)
    with open(full, "r", encoding="utf-8") as handle:
        source = handle.read()
    if "]]>" in source:
        raise SystemExit(f"{path} contains ']]>' which cannot be embedded in CDATA")
    return f"<ProtectedString name=\"Source\"><![CDATA[\n{source}]]></ProtectedString>"


MATERIAL_PLASTIC = 256
MATERIAL_GRASS = 1280
MATERIAL_NEON = 288


def script_item(cls, name, path):
    return Item(cls, [p_string("Name", name), p_source(path)])


def part(name, size, position, rgb, material=MATERIAL_PLASTIC, cls="Part", extra=None):
    props = [
        p_string("Name", name),
        p_bool("Anchored", True),
        p_bool("CanCollide", True),
        p_vector3("size", size),
        p_cframe("CFrame", position),
        p_color3uint8("Color3uint8", rgb),
        p_token("Material", material),
        p_token("TopSurface", 0),
        p_token("BottomSurface", 0),
    ]
    props.extend(extra or [])
    return Item(cls, props)


def build_tree():
    workspace = Item(
        "Workspace",
        [p_string("Name", "Workspace")],
        [
            part("Baseplate", (2048, 16, 2048), (0, -8, 0), (62, 110, 62), MATERIAL_GRASS),
            part(
                "SpawnLocation",
                (24, 1, 24),
                (0, 1.5, 0),
                (255, 176, 60),
                MATERIAL_NEON,
                cls="SpawnLocation",
                extra=[p_bool("Neutral", True), p_int("Duration", 0)],
            ),
        ],
    )

    lighting = Item(
        "Lighting",
        [
            p_string("Name", "Lighting"),
            p_float("Brightness", 2.5),
            p_float("ClockTime", 14.5),
            p_bool("GlobalShadows", True),
            p_color3("Ambient", (70, 72, 84)),
            p_color3("OutdoorAmbient", (120, 122, 136)),
        ],
    )

    replicated_storage = Item(
        "ReplicatedStorage",
        [p_string("Name", "ReplicatedStorage")],
        [
            script_item("ModuleScript", "HotDogData", "ReplicatedStorage/HotDogData.lua"),
            Item(
                "Folder",
                [p_string("Name", "Remotes")],
                [
                    Item("RemoteEvent", [p_string("Name", "BuyHotDog")]),
                    Item("RemoteEvent", [p_string("Name", "SellHotDog")]),
                    Item("RemoteEvent", [p_string("Name", "BaseUpdate")]),
                    Item("RemoteEvent", [p_string("Name", "Notify")]),
                ],
            ),
        ],
    )

    server_script_service = Item(
        "ServerScriptService",
        [p_string("Name", "ServerScriptService")],
        [
            script_item("Script", "Main", "ServerScriptService/Main.server.lua"),
            Item(
                "Folder",
                [p_string("Name", "Modules")],
                [
                    script_item("ModuleScript", "Plots", "ServerScriptService/Modules/Plots.lua"),
                    script_item("ModuleScript", "HotDogs", "ServerScriptService/Modules/HotDogs.lua"),
                ],
            ),
        ],
    )

    starter_player = Item(
        "StarterPlayer",
        [p_string("Name", "StarterPlayer")],
        [
            Item(
                "StarterPlayerScripts",
                [p_string("Name", "StarterPlayerScripts")],
                [script_item("LocalScript", "Client", "StarterPlayerScripts/Client.client.lua")],
            )
        ],
    )

    players = Item(
        "Players",
        [p_string("Name", "Players"), p_bool("CharacterAutoLoads", True), p_float("RespawnTime", 4)],
    )

    return [workspace, lighting, replicated_storage, server_script_service, starter_player, players]


def serialise(items):
    lines = [
        '<roblox xmlns:xmime="http://www.w3.org/2005/05/xmlmime" '
        'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" '
        'xsi:noNamespaceSchemaLocation="http://www.roblox.com/roblox.xsd" version="4">',
        '  <Meta name="ExplicitAutoJoints">true</Meta>',
    ]

    counter = [0]

    def emit(item, depth):
        referent = f"RBX{counter[0]}"
        counter[0] += 1
        pad = "  " * depth

        lines.append(f'{pad}<Item class="{item.cls}" referent="{referent}">')
        lines.append(f"{pad}  <Properties>")
        for prop in item.props:
            lines.append(f"{pad}    {prop}")
        lines.append(f"{pad}  </Properties>")
        for child in item.children:
            emit(child, depth + 1)
        lines.append(f"{pad}</Item>")

    for item in items:
        emit(item, 1)

    lines.append("</roblox>")
    return "\n".join(lines) + "\n"


def main():
    xml = serialise(build_tree())
    with open(OUTPUT, "w", encoding="utf-8") as handle:
        handle.write(xml)
    size = os.path.getsize(OUTPUT)
    print(f"Wrote {OUTPUT} ({size:,} bytes)")


if __name__ == "__main__":
    sys.exit(main())
