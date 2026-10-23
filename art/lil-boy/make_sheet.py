"""Builds the Lil Boy sprite sheet PNGs.

Run: python3 art/lil-boy/make_sheet.py
Needs Pillow. Writes the sheets next to this script.
"""

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent

BODY = (204, 123, 94, 255)  # sampled from the original screenshot
EYE = (0, 0, 0, 255)
LID = (120, 62, 44, 255)
HEART = (232, 80, 110, 255)
ZZZ = (124, 146, 186, 255)

FRAME = 16  # frame size in art pixels
SCALE = 8  # scale of the big sheet
OX = 2  # sprite is 12 px wide, centred in the frame
GROUND = 15  # bottom row of the frame
LEGS = (2, 4, 7, 9)

HEART_SMALL = [".X..X.", "XXXXXX", "XXXXXX", ".XXXX.", "..XX.."]
HEART_BIG = [".XX..XX.", "XXXXXXXX", "XXXXXXXX", "XXXXXXXX", ".XXXXXX.",
             "..XXXX..", "...XX..."]
Z_SMALL = ["XXXX", "..X.", ".X..", "XXXX"]
Z_BIG = ["XXXXX", "...X.", "..X..", ".X...", "XXXXX"]


def lil_boy(lift=0, squish=False, legs=(2, 2, 2, 2), eyes=True, look=0,
            arms=(2, 2), extras=()):
    """One 16x16 frame.

    lift: how far the whole boy is off the ground.
    squish: body sinks one row and the legs shrink to one row.
    legs: length of each leg (cols 2, 4, 7, 9); a short leg is a raised foot.
    eyes: True for open, "closed" for shut lids, False for none.
    look: shifts the eyes left (-1) or right (+1).
    arms: top row of the left and right 2x2 arm, relative to the body top.
    extras: (pattern, x, y, colour) stamps such as hearts and Zs.
    """
    img = Image.new("RGBA", (FRAME, FRAME), (0, 0, 0, 0))
    px = img.load()

    def put(x, y, c):
        if 0 <= x < FRAME and 0 <= y < FRAME:
            px[x, y] = c

    leg_rows = 1 if squish else 2
    top = GROUND - lift - leg_rows - 5  # body is 6 rows tall

    for y in range(top, top + 6):
        for x in range(2, 10):
            put(OX + x, y, BODY)
    for side, row in zip((0, 10), arms):
        for y in range(top + row, top + row + 2):
            for x in (side, side + 1):
                put(OX + x, y, BODY)
    for col, length in zip(LEGS, legs):
        length = min(length, leg_rows)
        for y in range(top + 6, top + 6 + length):
            put(OX + col, y, BODY)
    if eyes == "closed":
        for x in (3, 4, 7, 8):
            put(OX + x, top + 1, LID)
    elif eyes:
        put(OX + 3 + look, top + 1, EYE)
        put(OX + 8 + look, top + 1, EYE)
    for pattern, ex, ey, colour in extras:
        for dy, line in enumerate(pattern):
            for dx, ch in enumerate(line):
                if ch == "X":
                    put(ex + dx, ey + dy, colour)
    return img


def mirror(frames):
    return [f.transpose(Image.FLIP_LEFT_RIGHT) for f in frames]


walk_right = [
    lil_boy(look=1),
    lil_boy(look=1, legs=(1, 2, 1, 2)),
    lil_boy(look=1, lift=1),
    lil_boy(look=1, legs=(2, 1, 2, 1)),
]

ANIMATIONS = [
    ("idle", [
        lil_boy(),
        lil_boy(),
        lil_boy(squish=True),
        lil_boy(squish=True),
    ]),
    ("blink", [
        lil_boy(),
        lil_boy(),
        lil_boy(eyes="closed"),
        lil_boy(),
    ]),
    ("look around", [
        lil_boy(),
        lil_boy(look=-1),
        lil_boy(),
        lil_boy(look=1),
    ]),
    ("walk right", walk_right),
    ("walk left", mirror(walk_right)),
    ("jump", [
        lil_boy(squish=True),
        lil_boy(lift=2, arms=(1, 1)),
        lil_boy(lift=4, arms=(0, 0), legs=(1, 1, 1, 1)),
        lil_boy(lift=3, arms=(1, 1)),
        lil_boy(squish=True, arms=(3, 3)),
        lil_boy(),
    ]),
    ("wave", [
        lil_boy(arms=(2, 1)),
        lil_boy(arms=(2, 0)),
        lil_boy(arms=(2, 1)),
        lil_boy(arms=(2, 0)),
    ]),
    ("cheer", [
        lil_boy(squish=True),
        lil_boy(lift=1, arms=(0, 0)),
        lil_boy(lift=2, arms=(-1, -1)),
        lil_boy(lift=1, arms=(0, 0)),
    ]),
    ("love", [
        lil_boy(extras=[(HEART_SMALL, 5, 2, HEART)]),
        lil_boy(squish=True, extras=[(HEART_BIG, 4, 0, HEART)]),
        lil_boy(extras=[(HEART_SMALL, 5, 2, HEART)]),
        lil_boy(squish=True, extras=[(HEART_BIG, 4, 0, HEART)]),
    ]),
    ("sleep", [
        lil_boy(squish=True, eyes="closed", extras=[(Z_SMALL, 9, 4, ZZZ)]),
        lil_boy(eyes="closed", extras=[(Z_SMALL, 10, 3, ZZZ)]),
        lil_boy(squish=True, eyes="closed", extras=[(Z_BIG, 10, 1, ZZZ)]),
        lil_boy(eyes="closed", extras=[(Z_BIG, 11, 0, ZZZ)]),
    ]),
]

COLS = max(len(frames) for _, frames in ANIMATIONS)


def build_sheet():
    sheet = Image.new("RGBA", (COLS * FRAME, len(ANIMATIONS) * FRAME),
                      (0, 0, 0, 0))
    for row, (_, frames) in enumerate(ANIMATIONS):
        for col, frame in enumerate(frames):
            sheet.paste(frame, (col * FRAME, row * FRAME))
    return sheet


def big(img, scale=SCALE):
    return img.resize((img.width * scale, img.height * scale), Image.NEAREST)


def font(size, bold=False):
    name = "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"
    try:
        return ImageFont.truetype(f"/usr/share/fonts/truetype/dejavu/{name}",
                                  size)
    except OSError:
        return ImageFont.load_default()


def build_preview():
    """A labelled sheet for people to look at."""
    cell = FRAME * SCALE
    gap = 12
    label_w = 210
    pad = 40
    head = 150
    bg = (250, 247, 242, 255)
    tile = (240, 234, 225, 255)
    ink = (60, 46, 40, 255)
    soft = (150, 132, 120, 255)

    width = pad * 2 + label_w + COLS * cell + (COLS - 1) * gap
    height = head + pad + len(ANIMATIONS) * (cell + gap) - gap + pad
    out = Image.new("RGBA", (width, height), bg)
    d = ImageDraw.Draw(out)

    hero = big(lil_boy(), 4)
    out.alpha_composite(hero, (pad - 8, pad - 22))
    d.text((pad + hero.width + 8, pad + 6), "Lil Boy", font=font(44, True),
           fill=ink)
    d.text((pad + hero.width + 10, pad + 60),
           f"sprite sheet  ·  {FRAME}×{FRAME} px frames  ·  "
           f"{len(ANIMATIONS)} animations",
           font=font(20), fill=soft)

    for row, (name, frames) in enumerate(ANIMATIONS):
        y = head + pad + row * (cell + gap)
        d.text((pad, y + cell // 2 - 22), name, font=font(26, True), fill=ink)
        d.text((pad, y + cell // 2 + 10), f"{len(frames)} frames",
               font=font(18), fill=soft)
        for col in range(COLS):
            x = pad + label_w + col * (cell + gap)
            d.rounded_rectangle((x, y, x + cell - 1, y + cell - 1), 10,
                                fill=tile)
            if col < len(frames):
                out.alpha_composite(big(frames[col]), (x, y))
                d.text((x + 8, y + 6), str(col + 1), font=font(15),
                       fill=soft)
    return out


def build_gif():
    """Every animation playing side by side, for a quick look."""
    scale = 6
    cell = FRAME * scale
    steps = 12  # lcm of 4 and 6 frames
    frames = []
    for step in range(steps):
        canvas = Image.new("RGBA", (cell * 5, cell * 2), (250, 247, 242, 255))
        for i, (_, anim) in enumerate(ANIMATIONS):
            f = big(anim[step % len(anim)], scale)
            canvas.alpha_composite(f, ((i % 5) * cell, (i // 5) * cell))
        frames.append(canvas.convert("P", palette=Image.ADAPTIVE))
    frames[0].save(OUT / "lil-boy-preview.gif", save_all=True,
                   append_images=frames[1:], duration=180, loop=0,
                   disposal=2)


def main():
    sheet = build_sheet()
    sheet.save(OUT / "lil-boy-sheet-1x.png")
    big(sheet).save(OUT / "lil-boy-sheet.png")
    build_preview().save(OUT / "lil-boy-sheet-labelled.png")
    build_gif()

    meta = {
        "image": "lil-boy-sheet-1x.png",
        "frameWidth": FRAME,
        "frameHeight": FRAME,
        "animations": [
            {"name": name, "row": row, "frames": len(frames)}
            for row, (name, frames) in enumerate(ANIMATIONS)
        ],
    }
    (OUT / "lil-boy-sheet.json").write_text(json.dumps(meta, indent=2) + "\n")


if __name__ == "__main__":
    main()
