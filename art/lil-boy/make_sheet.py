"""Builds the Lil Boy sprite sheets.

Lil Boy is a desktop pet for a coding agent. Each animation is one row of
24x24 frames in the sheet, and lil-boy-sheet.json lists every row with its
frame count, suggested speed and whether it loops.

Run: python3 art/lil-boy/make_sheet.py
Needs Pillow. Writes the sheets next to this script.
"""

import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent

FRAME = 24  # frame size in art pixels
GROUND = FRAME - 1
SCALE = 4  # scale of the big sheet

PAL = {
    "B": (204, 123, 94),  # body, sampled from the original screenshot
    "E": (0, 0, 0),  # eyes
    "L": (120, 62, 44),  # eyelids and mouth
    "p": (240, 150, 160),  # blush
    "K": (52, 48, 58),  # ink
    "W": (250, 250, 250),
    "T": (210, 214, 222),  # light grey
    "S": (160, 166, 178),  # grey
    "s": (112, 118, 132),  # dark grey
    "R": (226, 72, 72),
    "r": (160, 44, 44),
    "G": (92, 184, 104),
    "Y": (247, 200, 66),
    "y": (206, 146, 38),
    "O": (242, 132, 54),
    "C": (110, 196, 232),
    "c": (56, 124, 196),
    "P": (160, 112, 220),
    "H": (232, 80, 110),
    "Z": (124, 146, 186),
    "N": (140, 92, 62),
}

# Patterns are rows of palette letters. "." is see-through and "X" takes the
# ink passed with the stamp.
QUESTION = [".XXXX.", "XX..XX", "....XX", "...XX.", "..XX..", "......",
            "..XX.."]
EXCLAIM = ["XX", "XX", "XX", "XX", "..", "XX"]
CHECK = ["......XX", ".....XX.", "XX..XX..", ".XXXX...", "..XX...."]
CROSS = ["XX..XX", ".XXXX.", "..XX..", ".XXXX.", "XX..XX"]
HEART_SMALL = [".X..X.", "XXXXXX", "XXXXXX", ".XXXX.", "..XX.."]
HEART_BIG = [".XX..XX.", "XXXXXXXX", "XXXXXXXX", "XXXXXXXX", ".XXXXXX.",
             "..XXXX..", "...XX..."]
Z_SMALL = ["XXXX", "..X.", ".X..", "XXXX"]
Z_BIG = ["XXXXX", "...X.", "..X..", ".X...", "XXXXX"]
STAR = [".Y.", "YWY", ".Y."]
SPARKLE = ["..Y..", "..Y..", "YYWYY", "..Y..", "..Y.."]
PUFF = [".SS.", "STTS", "STTS", ".SS."]
SWEAT = [".C.", "CCC", "CCC"]
TEAR = ["C", "C"]
NOTE = [".XX", ".X.", ".X.", "XX.", "XX."]
ANGER = [".R.R.", "RR.RR", ".....", "RR.RR", ".R.R."]
STEAM_A = [".X", "X.", ".X"]
STEAM_B = ["X.", ".X", "X."]
COIN = [".Y.", "YyY", ".Y."]
ARC_NEAR = ["X.", ".X", ".X", "X."]
ARC_FAR = ["X..", ".X.", "..X", "..X", ".X.", "X.."]
ARROW_UP = ["..X..", ".XXX.", "XXXXX", ".XXX.", ".XXX."]
ARROW_DOWN = ARROW_UP[::-1]
COMMIT = [".X.", "XXX", ".X."]
BULB = [".KKKK.", "KYYYWK", "KYYYYK", "KYYYYK", ".KYYK.", "..SS..", "..ss.."]
BULB_OFF = [row.replace("Y", "T").replace("W", "T") for row in BULB]
RAYS = [".....YY.....", ".Y........Y.", "..Y......Y..", "............",
        "YY........YY"]
THOUGHT = ["..KKK.KKK..", ".KWWWKWWWK.", "KWWWWWWWWWK", "KWWWWWWWWWK",
           ".KWWWWWWWK.", "..KKKKKKK.."]
SPEECH = [".KKKKKKKKKKK.", "KWWWWWWWWWWWK", "KWWWWWWWWWWWK",
          "KWWWWWWWWWWWK", ".KWWKKKKKKKK.", ".KWK.........", ".KK.........."]
CLOUD = ["...SSS.....", "..STTTSSS..", ".STTTTTTTS.", "STTTTTTTTTS",
         ".SSSSSSSSS."]
ROCKET = ["..R..", ".SSS.", ".ScS.", ".SSS.", "RSSSR", "R.s.R"]
FLAME_A = [".OYO.", "..Y.."]
FLAME_B = ["..O..", ".OYO.", "..Y.."]
HOURGLASS_TOP = ["NNNNNNN", ".KYYYK.", ".KYYYK.", "..KYK..", "...K...",
                 "..K.K..", ".K...K.", ".K...K.", "NNNNNNN"]
HOURGLASS_MID = ["NNNNNNN", ".K...K.", ".KYYYK.", "..KYK..", "...Y...",
                 "..K.K..", ".K...K.", ".KYYYK.", "NNNNNNN"]
HOURGLASS_END = ["NNNNNNN", ".K...K.", ".K...K.", "..K.K..", "...K...",
                 "..KYK..", ".KYYYK.", ".KYYYK.", "NNNNNNN"]
BATTERY = ["KKKKKKKK.", "K......KK", "K......KK", "KKKKKKKK."]
MAGNIFIER = ["...KKK.", "..KWCCK", "..KCCCK", "..KCCCK", "..NKKK.", ".NN....",
             "NN....."]
BUG_A = ["K.....", ".KPPP.", "KKPPPP", ".K.K.K"]
BUG_B = ["K.....", ".KPPP.", "KKPPPP", "K.K.K."]
SPLAT = ["P.........P", ".P.......P.", "..PPPPPPP.."]
DUCK = [".....YY..", "....YYKY.", "....YYYOO", "Y...YYY..", "YYyyyYYY.",
        "YYYyyYYY.", ".YYYYYY.."]
MUG = ["..sNNs", "sssWWs", "s.sWWs", "sssWWs", "..ssss"]
MUG_SIP = ["sNNs", "sWWs", "sWWs", "sWWs", "ssss"]
LID = ["ssssssss", "sSSSSSSs", "sSSTTSSs", "sSSSSSSs", "sSSSSSSs"]
PAPER = ["SSSSSSSS", "SWWWWWWS", "SWssssWS", "SWWWWWWS", "SWsssWWS",
         "SSSSSSSS"]
WORLD = ["...GG.......GG..", ".GGGGG....GGGG..", "GGGG.....GGGGGG.",
         "GGG.......GGG...", ".GG........GG...", "..GG.......G....",
         "...GGG..........", "....GG.....GG...", "..........GG...."]
CODE_LINES = ["PPP.CCCC", "..YY.GGGGG", "..PP.CCC.OO", "....GGGGGG",
              "..PPPP.YY"]
SPINNER = [(4, 0), (7, 1), (8, 4), (7, 7), (4, 8), (1, 7), (0, 4), (1, 1)]
CONFETTI = [(1, 0, "R"), (5, 6, "Y"), (9, 2, "C"), (13, 9, "G"), (17, 3, "P"),
            (21, 7, "O"), (3, 11, "C"), (19, 12, "Y"), (11, 14, "H"),
            (7, 4, "G"), (15, 0, "H"), (22, 13, "P")]

LEG_COLS = (2, 4, 7, 9)


def blank():
    return Image.new("RGBA", (FRAME, FRAME), (0, 0, 0, 0))


def stamp(img, pattern, x, y, ink=None):
    px = img.load()
    for dy, line in enumerate(pattern):
        for dx, ch in enumerate(line):
            if ch != "." and 0 <= x + dx < FRAME and 0 <= y + dy < FRAME:
                px[x + dx, y + dy] = PAL[ink if ch == "X" else ch] + (255,)


def stamped(img, stamps):
    img = img.copy()
    for s in stamps:
        stamp(img, *s)
    return img


def above(pattern, ink=None, dx=0, dy=0):
    """A stamp centred over his head."""
    w, h = len(pattern[0]), len(pattern)
    return (pattern, 12 - (w + 1) // 2 + dx, 14 - h + dy, ink)


def pet(dx=0, lift=0, legs=2, steps=None, body=6, wide=False, eyes="open",
        look=0, look_y=0, arms=(2, 2), mouth=None, blush=False, tint=None,
        back=(), front=()):
    """One frame of Lil Boy.

    dx, lift: move him right / up off the ground.
    legs: leg length in rows (1 is crouched, 0 is sitting, 3 is dangling).
    steps: per-leg lengths for cols 2, 4, 7, 9; a shorter leg is a raised foot.
    body: body height in rows; wide makes him a pixel wider on each side.
    eyes: open, closed, heavy, wide, x, cross, angry, sad or none.
    look, look_y: move open eyes left/right and up/down.
    arms: each arm's top row relative to the body top, (row, height), or None.
    mouth: smile, line, or ("open", height).
    back, front: stamps drawn behind and in front of him.
    """
    img = blank()
    for s in back:
        stamp(img, *s)
    px = img.load()
    skin = (tint or PAL["B"]) + (255,)
    ox = 6 + dx
    top = GROUND - lift - legs - body + 1
    x0, x1 = (1, 10) if wide else (2, 9)

    def fill(cols, rows, colour=skin):
        for x in cols:
            for y in rows:
                if 0 <= ox + x < FRAME and 0 <= top + y < FRAME:
                    px[ox + x, top + y] = colour

    def dot(col, row, ch):
        fill((col,), (row,), PAL[ch] + (255,))

    fill(range(x0, x1 + 1), range(body))
    for cols, arm in (((x0 - 2, x0 - 1), arms[0]),
                      ((x1 + 1, x1 + 2), arms[1])):
        if arm is not None:
            row, height = arm if isinstance(arm, tuple) else (arm, 2)
            fill(cols, range(row, row + height))
    for col, length in zip(LEG_COLS, steps or (legs,) * 4):
        fill((col,), range(body, body + min(length, legs)))

    if eyes == "open":
        dot(3 + look, 1 + look_y, "E")
        dot(8 + look, 1 + look_y, "E")
    elif eyes in ("closed", "heavy"):
        for col in (3, 4, 7, 8):
            dot(col, 1, "L")
        if eyes == "heavy":
            dot(3, 2, "E")
            dot(8, 2, "E")
    elif eyes == "wide":
        for col in (3, 4, 7, 8):
            dot(col, 1, "W")
            dot(col, 2, "W")
        dot(3, 2, "E")
        dot(8, 2, "E")
    elif eyes == "x":
        for cx in (3, 8):
            for d in (-1, 0, 1):
                dot(cx + d, 1 + d, "E")
                dot(cx + d, 1 - d, "E")
    elif eyes == "cross":
        dot(4, 1, "E")
        dot(7, 1, "E")
    elif eyes == "angry":
        for col, row in ((2, 0), (3, 0), (4, 1), (9, 0), (8, 0), (7, 1),
                         (3, 2), (8, 2)):
            dot(col, row, "E")
    elif eyes == "sad":
        for col, row in ((2, 1), (3, 0), (9, 1), (8, 0)):
            dot(col, row, "L")
        dot(3, 2, "E")
        dot(8, 2, "E")

    if mouth == "smile":
        for col, row in ((4, 3), (5, 4), (6, 4), (7, 3)):
            dot(col, row, "L")
    elif mouth == "line":
        dot(5, 3, "L")
        dot(6, 3, "L")
    elif mouth:
        for row in range(3, 3 + mouth[1]):
            dot(5, row, "L")
            dot(6, row, "L")
    if blush:
        dot(2, 2, "p")
        dot(9, 2, "p")

    for s in front:
        stamp(img, *s)
    return img


def flip(frames):
    return [f.transpose(Image.FLIP_LEFT_RIGHT) for f in frames]


def turn(frames, how):
    return [f.transpose(how) for f in frames]


def dither(img):
    """Every other pixel, for fading in and out."""
    img = img.copy()
    px = img.load()
    for y in range(FRAME):
        for x in range(FRAME):
            if (x + y) % 2:
                px[x, y] = (0, 0, 0, 0)
    return img


def glitch(img, band, shift):
    """Red and cyan ghosts plus one torn band of rows."""
    out = blank()
    mask = img.getchannel("A")
    for ink, off in (("R", -1), ("C", 1)):
        ghost = blank()
        ghost.paste(PAL[ink] + (255,), (off, 0, FRAME + off, FRAME), mask)
        out.alpha_composite(ghost)
    out.alpha_composite(img)
    y0, y1 = band
    strip = out.crop((0, y0, FRAME, y1))
    out.paste((0, 0, 0, 0), (0, y0, FRAME, y1))
    out.paste(strip, (shift, y0))
    return out


def blend(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(PAL[a], PAL[b]))


def rotate_pattern(pattern):
    """A quarter turn clockwise."""
    return ["".join(row[x] for row in reversed(pattern))
            for x in range(len(pattern[0]))]


def window(w, h, lights=True):
    title = "sRsYsG" + "s" * (w - 6) if lights else "s" * w
    return [title] + ["s" + "K" * (w - 2) + "s"] * (h - 2) + ["s" * w]


def globe(spin):
    rows = []
    for y in range(9):
        row = ""
        for x in range(9):
            if (x - 4) ** 2 + (y - 4) ** 2 > 20:
                row += "."
            else:
                row += "G" if WORLD[y][(x + spin) % 16] == "G" else "c"
        rows.append(row)
    return rows


def spinner(step):
    grid = [["."] * 10 for _ in range(10)]
    for i, (x, y) in enumerate(SPINNER):
        age = (step - i) % 8
        ch = "c" if age == 0 else "C" if age == 1 else "S"
        for yy in (y, y + 1):
            grid[yy][x] = grid[yy][x + 1] = ch
    return ["".join(row) for row in grid]


def clipboard(done):
    rows = [["N"] * 12 for _ in range(12)]
    for y in range(1, 11):
        for x in range(1, 11):
            rows[y][x] = "W"
    for i, y in enumerate((2, 5, 8)):
        for yy in (y, y + 1):
            rows[yy][2] = rows[yy][3] = "G" if i < done else "S"
        for x in range(5, 10):
            rows[y][x] = "S"
    clip = ["....SSSS....", "NNNNSssSNNNN"]
    return clip + ["".join(row) for row in rows[1:]]


def progress(filled):
    inner = "s" + "G" * filled + "K" * (16 - filled) + "s"
    return ["s" * 18, inner, inner, inner, "s" * 18]


def confetti(k):
    bits = []
    for x, y, ink in CONFETTI:
        bit = ["XX"] if (x + k) % 2 else ["X", "X"]
        bits.append((bit, x, (y + 2 * k) % 16, ink))
    return bits


# Basics ----------------------------------------------------------------------

def basics():
    sit = dict(legs=0, arms=(3, 3))
    return [
        ("idle", 4, True, [pet(), pet(), pet(legs=1), pet(legs=1)]),
        ("blink", 6, True, [pet(), pet(), pet(eyes="closed"), pet()]),
        ("look around", 4, True,
         [pet(), pet(look=-1), pet(), pet(look=1)]),
        ("sit", 3, True,
         [pet(**sit), pet(**sit), pet(**sit, eyes="closed"), pet(**sit)]),
        ("stretch", 6, False, [
            pet(),
            pet(arms=(1, 1)),
            pet(body=7, arms=((-1, 3), (-1, 3)), eyes="closed"),
            pet(body=7, lift=1, arms=((-2, 3), (-2, 3)), eyes="closed"),
            pet(arms=(1, 1)),
            pet(),
        ]),
        ("yawn", 5, False, [
            pet(),
            pet(eyes="closed", mouth=("open", 1)),
            pet(eyes="closed", mouth=("open", 2), arms=(1, 1)),
            pet(eyes="closed", mouth=("open", 3), arms=(0, 0), body=7),
            pet(eyes="closed", mouth=("open", 1)),
            pet(eyes="closed"),
        ]),
        ("sleep", 3, True, [
            pet(legs=1, eyes="closed", front=[(Z_SMALL, 15, 12, "Z")]),
            pet(eyes="closed", front=[(Z_SMALL, 16, 10, "Z")]),
            pet(legs=1, eyes="closed", front=[(Z_BIG, 16, 7, "Z")]),
            pet(eyes="closed", front=[(Z_BIG, 17, 5, "Z")]),
        ]),
        ("wake up", 5, False, [
            pet(legs=1, eyes="closed"),
            pet(legs=1, eyes="heavy"),
            pet(legs=1),
            pet(eyes="closed"),
            pet(arms=(1, 1)),
            pet(),
        ]),
    ]


# Moving around the desktop ---------------------------------------------------

def moving():
    walk = [pet(look=1), pet(look=1, steps=(1, 2, 1, 2)),
            pet(look=1, lift=1), pet(look=1, steps=(2, 1, 2, 1))]

    streaks = [[(["XXXX"], 1, 17, "S"), (["XXX"], 0, 20, "S")],
               [(["XXX"], 0, 18, "S"), (["XXXX"], 2, 21, "S")]]
    poses = [dict(steps=(2, 1, 2, 1), arms=(1, 3)),
             dict(lift=1, steps=(1, 1, 1, 1)),
             dict(steps=(1, 2, 1, 2), arms=(3, 1)),
             dict(lift=1, steps=(1, 1, 1, 1))]
    run = [pet(dx=1, look=1, back=streaks[i % 2], **pose)
           for i, pose in enumerate(poses)]

    jump = [
        pet(legs=1),
        pet(lift=2, arms=(1, 1)),
        pet(lift=4, arms=(0, 0), steps=(1, 1, 1, 1)),
        pet(lift=3, arms=(1, 1)),
        pet(legs=1, arms=(3, 3)),
        pet(),
    ]

    climb = turn(walk, Image.ROTATE_90)

    dragged = [
        pet(lift=7, legs=3, dx=sway, steps=steps, arms=arms, eyes="wide")
        for sway, steps, arms in ((-1, (3, 2, 3, 2), (0, 1)),
                                  (0, (3, 3, 3, 3), (1, 1)),
                                  (1, (2, 3, 2, 3), (1, 0)),
                                  (0, (3, 3, 3, 3), (1, 1)))
    ]

    fall = []
    for i in range(4):
        up = (-1, 3) if i % 2 == 0 else (-2, 3)
        lines = [(["X", "X", "X"], 9, 5 - 2 * (i % 2), "S"),
                 (["X", "X"], 14, 2 + 2 * (i % 2), "S")]
        fall.append(pet(lift=4, eyes="wide", arms=(up, up), back=lines,
                        steps=(1, 2, 1, 2) if i % 2 else (2, 1, 2, 1)))

    land = [
        pet(legs=0, body=4, wide=True, arms=(1, 1), eyes="closed",
            back=[(PUFF, 1, 19), (PUFF, 19, 19)]),
        pet(legs=1, arms=(3, 3), eyes="closed",
            back=[(PUFF, 0, 17), (PUFF, 20, 17)]),
        pet(lift=1, arms=(1, 1)),
        pet(),
    ]

    edge = [pet(legs=3, arms=(4, 4), steps=steps, eyes=eyes)
            for steps, eyes in (((3, 2, 2, 3), "open"),
                                ((2, 3, 3, 2), "open"),
                                ((3, 2, 2, 3), "closed"),
                                ((2, 3, 3, 2), "open"))]

    peek = [pet(lift=-4, look=look, eyes=eyes)
            for look, eyes in ((-1, "open"), (-1, "open"), (0, "closed"),
                               (1, "open"), (1, "open"), (0, "open"))]

    ring = [(PUFF, 3, 14), (PUFF, 17, 14), (PUFF, 4, 20), (PUFF, 16, 20)]
    spawn = [
        stamped(blank(), [(STAR, 10, 18)]),
        stamped(blank(), [(SPARKLE, 9, 16)] + ring),
        stamped(dither(pet()), ring),
        stamped(pet(), [(PUFF, 1, 12), (PUFF, 19, 12)]),
        pet(legs=1),
        pet(),
    ]
    despawn = [
        pet(),
        pet(legs=1),
        pet(lift=1, arms=(0, 0)),
        stamped(dither(pet()), ring),
        stamped(blank(), [(SPARKLE, 9, 16)] + ring),
        stamped(blank(), [(STAR, 10, 18)]),
    ]

    return [
        ("walk right", 8, True, walk),
        ("walk left", 8, True, flip(walk)),
        ("run right", 12, True, run),
        ("run left", 12, True, flip(run)),
        ("jump", 10, False, jump),
        ("climb right wall", 8, True, climb),
        ("climb left wall", 8, True, flip(climb)),
        ("ceiling crawl right", 8, True,
         turn(flip(walk), Image.ROTATE_180)),
        ("ceiling crawl left", 8, True, turn(walk, Image.ROTATE_180)),
        ("dragged", 8, True, dragged),
        ("fall", 10, True, fall),
        ("land", 10, False, land),
        ("sit on edge", 4, True, edge),
        ("peek", 4, True, peek),
        ("pop up", 10, False, [pet(lift=-7), pet(lift=-5), pet(lift=-3),
                               pet(legs=1), pet(lift=2, arms=(0, 0)),
                               pet()]),
        ("duck down", 10, False, [pet(), pet(legs=1), pet(lift=-2),
                                  pet(lift=-4), pet(lift=-6), blank()]),
        ("spawn", 10, False, spawn),
        ("despawn", 10, False, despawn),
    ]


# Coding ----------------------------------------------------------------------

def coding():
    tap = [(1, 2), (2, 1)]

    laptop = [(LID, 8, 18), (["XXXXXXXXXX"], 7, 23, "s")]
    bits = [[(["X"], 4, 13, "C"), (["X"], 19, 11, "G")],
            [(["X"], 5, 10, "Y"), (["X"], 18, 14, "P")],
            [(["X"], 3, 12, "G"), (["X"], 20, 12, "C")],
            [(["X"], 4, 9, "P"), (["X"], 19, 9, "Y")]]
    typing = [pet(arms=tap[k % 2], front=laptop + bits[k]) for k in range(4)]

    writing = []
    for k in range(8):
        lines = min(k, 5)
        stamps = [(window(18, 12), 3, 1)]
        stamps += [([CODE_LINES[i]], 5, 3 + 2 * i) for i in range(lines)]
        if lines < 5:
            cursor = (5, 3 + 2 * lines)
        else:
            cursor = (6 + len(CODE_LINES[4]), 11)
        if k % 2 == 0 or lines < 5:
            stamps.append((["X"], *cursor, "W"))
        writing.append(pet(look_y=-1, arms=tap[k % 2] if k < 6 else (2, 2),
                           front=stamps))

    terminal = []
    for k in range(8):
        stamps = [(window(16, 10, lights=False), 4, 3), (["X"], 6, 5, "G")]
        command = {2: "WWW", 3: "WWW.WW.WWWW"}.get(k, "WWW.WW.WWWW")
        if k >= 2:
            stamps.append(([command], 8, 5, None))
        if k < 3:
            stamps.append((["X"], 8 + (len(command) + 1 if k == 2 else 0), 5,
                           "W" if k != 1 else "K"))
        if k >= 4:
            stamps.append((["SSSSSSS"], 6, 7))
        if k >= 5:
            stamps.append((["GGGG.GG"], 6, 9))
        if k >= 6:
            stamps.append((["X"], 6, 11, "G"))
            if k == 6:
                stamps.append((["X"], 8, 11, "W"))
        terminal.append(pet(look_y=-1, arms=tap[k % 2] if k < 4 else (2, 2),
                            front=stamps))

    trail = [(["X"], 15, 14, "s"), (["XX", "XX"], 16, 11, "s"), (THOUGHT, 12, 3)]
    thinking = []
    for k in range(8):
        dots = [(["X"], 15 + 2 * i, 6, "K") for i in range(k % 4)]
        thinking.append(pet(look=1 if k < 4 else 0, look_y=-1,
                            front=trail + dots))

    reading = [pet(look=look, front=[(PAPER, 8, 18)])
               for look in (-1, 0, 1, -1, 0, 1)]

    right = [pet(look=1, look_y=look_y, arms=(2, 1),
                 front=[(MAGNIFIER, 16, 11 + bob)])
             for bob, look_y in ((0, 0), (-1, -1), (0, 0), (1, 0))]
    searching = right + flip(right)

    web = [pet(look_y=-1, front=[above(globe(2 * k))]) for k in range(8)]
    loading = [pet(look_y=-1, eyes="closed" if k == 5 else "open",
                   front=[above(spinner(k))]) for k in range(8)]

    bar = []
    for k in range(8):
        stamps = [(progress(round(16 * k / 7)), 3, 8)]
        if k < 7:
            bar.append(pet(look_y=-1, front=stamps))
        else:
            bar.append(pet(lift=1, arms=(0, 0), eyes="closed",
                           mouth="smile", front=stamps))

    todo = [pet(look_y=-1, front=[above(clipboard(n))]) for n in range(4)]
    todo += [pet(lift=2, arms=(0, 0), eyes="closed", mouth="smile",
                 front=[above(clipboard(3), dy=-1)]),
             pet(front=[above(clipboard(3))])]

    def tests(colours, front=(), **kw):
        dots = [(["XX", "XX"], x, 9, c)
                for x, c in zip((3, 7, 11, 15, 19), colours)]
        return pet(front=dots + list(front), **kw)

    def running(k, total=5):
        return "G" * k + "Y" + "S" * (total - k - 1)

    follow = (-1, -1, 0, 1, 1)
    passing = [tests(running(k), look=follow[k], look_y=-1) for k in range(5)]
    passing += [tests("GGGGG", lift=2, arms=(0, 0), eyes="closed",
                      mouth="smile"),
                tests("GGGGG", lift=1, arms=(1, 1), eyes="closed",
                      mouth="smile"),
                tests("GGGGG")]
    failing = [tests(running(k), look=follow[k], look_y=-1) for k in range(4)]
    failing += [tests("GGGRS", lift=1, eyes="wide"),
                tests("GGGRS", legs=1, eyes="closed"),
                tests("GGGRS", eyes="sad", front=[(SWEAT, 17, 13)]),
                tests("GGGRS", eyes="sad", front=[(SWEAT, 17, 15)])]

    def bugged(x, k, front=(), **kw):
        bug = (BUG_A if k % 2 == 0 else BUG_B, x, 20)
        return pet(front=[bug] + list(front), **kw)

    alarm = above(EXCLAIM, "R")
    bug_found = [
        bugged(22, 0),
        bugged(20, 1, look=1),
        bugged(19, 2, look=1),
        bugged(18, 3, look=1, front=[alarm]),
        bugged(18, 4, dx=-1, eyes="wide", front=[above(EXCLAIM, "R", dx=-1)]),
        bugged(18, 5, dx=-2, eyes="wide",
               front=[above(EXCLAIM, "R", dx=-2), (SWEAT, 3, 13)]),
        bugged(18, 6, dx=-2, eyes="angry"),
        bugged(18, 7, dx=-2, eyes="angry", arms=(1, 1)),
    ]

    squash = [
        bugged(16, 0, dx=-4, look=1),
        bugged(16, 1, dx=-4, legs=1, eyes="angry"),
        bugged(16, 2, dx=-1, lift=5, look=1, arms=(0, 0)),
        bugged(16, 3, dx=2, lift=6, look=1, arms=(0, 0),
               steps=(1, 1, 1, 1)),
        bugged(16, 4, dx=5, lift=2, eyes="closed", arms=(1, 1)),
        pet(dx=5, legs=1, eyes="closed", back=[(SPLAT, 11, 21)]),
        pet(dx=5, lift=1, arms=(0, 0), eyes="closed", mouth="smile",
            back=[(SPLAT, 11, 21)]),
        pet(dx=5, back=[(SPLAT, 11, 21)]),
    ]

    def duck_bulb(lit):
        x, y = 13, 7
        if not lit:
            return [(BULB_OFF, x, y)]
        return [(RAYS, x - 3, y - 2), (BULB, x, y)]

    duck = (DUCK, 0, 17)
    chatter = [(["X.X"], 8, 13, "s"), (["X.X.X"], 7, 13, "s")]
    rubber_duck = [
        pet(dx=4, look=-1, back=[duck]),
        pet(dx=4, look=-1, mouth=("open", 1), back=[duck, chatter[0]]),
        pet(dx=4, look=-1, back=[duck, chatter[1]]),
        pet(dx=4, look=-1, mouth=("open", 1), back=[duck, chatter[0]]),
        pet(dx=4, look=-1, look_y=-1, back=[(DUCK, 0, 16)]),
        pet(dx=4, look_y=-1, back=[duck], front=duck_bulb(False)),
        pet(dx=4, lift=2, arms=(0, 0), back=[duck], front=duck_bulb(True)),
        pet(dx=4, eyes="closed", mouth="smile", back=[duck],
            front=duck_bulb(True)),
    ]

    def graph(length, new=None):
        stamps = [(["X" * length], 2, 8, "s"), (COMMIT, 4, 7, "O"),
                  (COMMIT, 11, 7, "O")]
        if new:
            stamps.append((COMMIT, 18, 7, new))
        return stamps

    commit = [
        pet(look_y=-1, front=graph(12)),
        pet(look=1, look_y=-1, front=graph(16)),
        pet(look=1, look_y=-1, front=graph(19, "W")),
        pet(look=1, legs=1, front=graph(19, "O")),
        pet(lift=1, arms=(0, 0), eyes="closed",
            front=graph(19, "O") + [(STAR, 20, 2)]),
        pet(front=graph(19, "O")),
    ]

    cloud = (CLOUD, 6, 0)
    push = [
        pet(legs=1, arms=(1, 1), front=[(ARROW_UP, 9, 11, "G"), cloud]),
        pet(lift=1, arms=(0, 0), front=[(ARROW_UP, 9, 8, "G"), cloud]),
        pet(arms=(1, 1), look_y=-1, front=[(ARROW_UP, 9, 5, "G"), cloud]),
        pet(look_y=-1, front=[(ARROW_UP, 9, 2, "G"), cloud]),
        pet(look_y=-1, front=[cloud, (STAR, 18, 0)]),
        pet(eyes="closed", mouth="smile", front=[cloud, (STAR, 18, 0)]),
    ]
    pull = [
        pet(look_y=-1, front=[(ARROW_DOWN, 9, 2, "c"), cloud]),
        pet(look_y=-1, front=[(ARROW_DOWN, 9, 5, "c"), cloud]),
        pet(look_y=-1, arms=(1, 1), front=[(ARROW_DOWN, 9, 8, "c"), cloud]),
        pet(arms=(0, 0), front=[(ARROW_DOWN, 9, 11, "c"), cloud]),
        pet(legs=1, eyes="closed", front=[cloud]),
        pet(eyes="closed", mouth="smile", front=[cloud]),
    ]

    def rocket(y, flame, smoke=()):
        stamps = [(ROCKET, 17, y)]
        if flame:
            stamps.append((flame, 17, y + 6))
        return stamps + list(smoke)

    deploy = [
        pet(dx=-4, look=1, front=rocket(18, None)),
        pet(dx=-4, look=1, front=rocket(17, FLAME_A,
                                        [(PUFF, 14, 20), (PUFF, 21, 20)])),
        pet(dx=-4, look=1, look_y=-1,
            front=rocket(12, FLAME_B, [(PUFF, 14, 19), (PUFF, 20, 19)])),
        pet(dx=-4, look=1, look_y=-1, front=rocket(6, FLAME_A,
                                                   [(PUFF, 16, 20)])),
        pet(dx=-4, look=1, look_y=-1, arms=(0, 0),
            front=rocket(0, FLAME_B)),
        pet(dx=-4, lift=2, arms=(0, 0), front=rocket(-6, FLAME_A)),
        pet(dx=-4, lift=1, arms=(0, 0), eyes="closed",
            front=[(SPARKLE, 17, 0)]),
        pet(dx=-4, eyes="closed", mouth="smile", front=[(STAR, 18, 1)]),
    ]

    ask = [pet(arms=(2, arm), eyes=eyes,
               front=[above(QUESTION, "c", dx=-1, dy=dy)])
           for arm, dy, eyes in (((-1, 3), 0, "open"), ((-2, 3), -1, "open"),
                                 ((-1, 3), 0, "open"),
                                 ((-2, 3), -1, "closed"))]

    glass = [HOURGLASS_TOP, HOURGLASS_TOP, HOURGLASS_MID, HOURGLASS_MID,
             HOURGLASS_END, HOURGLASS_END, rotate_pattern(HOURGLASS_END),
             HOURGLASS_TOP]
    waiting = [pet(look=(-1, -1, 0, 0, 1, 1, 0, 0)[k],
                   steps=(2, 2, 2, 1) if k % 2 else None,
                   front=[above(glass[k])]) for k in range(8)]

    return [
        ("typing", 10, True, typing),
        ("writing code", 6, True, writing),
        ("terminal", 5, True, terminal),
        ("thinking", 4, True, thinking),
        ("reading", 3, True, reading),
        ("searching", 5, True, searching),
        ("web search", 8, True, web),
        ("loading", 10, True, loading),
        ("progress", 5, False, bar),
        ("todo list", 4, False, todo),
        ("tests passing", 5, False, passing),
        ("tests failing", 5, False, failing),
        ("bug found", 6, False, bug_found),
        ("squash bug", 8, False, squash),
        ("rubber duck", 4, True, rubber_duck),
        ("git commit", 6, False, commit),
        ("git push", 8, False, push),
        ("git pull", 8, False, pull),
        ("deploy", 8, False, deploy),
        ("ask permission", 4, True, ask),
        ("waiting", 4, True, waiting),
    ]


# Reactions -------------------------------------------------------------------

def reactions():
    def ok(dy=-1):
        return above(CHECK, "G", dy=dy)

    def no(dy=-1):
        return above(CROSS, "R", dy=dy)

    def bulb(lit, dy=0):
        x, y = 9, 7 + dy
        if not lit:
            return [(BULB_OFF, x, y)]
        return [(RAYS, x - 3, y - 2), (BULB, x, y)]

    q = above(QUESTION, "c")
    bang = above(EXCLAIM, "R")

    twinkle = [[(SPARKLE, 1, 6), (STAR, 18, 3)],
               [(STAR, 3, 8), (SPARKLE, 17, 9)],
               [(STAR, 19, 2), (SPARKLE, 6, 1)],
               [(SPARKLE, 15, 3), (STAR, 2, 13)]]

    party = [dict(legs=1), dict(lift=2, arms=(0, 0), mouth="smile"),
             dict(lift=3, arms=((-1, 3), (-1, 3)), eyes="closed",
                  mouth="smile"),
             dict(lift=1, arms=(0, 0), mouth="smile")]

    hot = [blend("B", "R", 0.4), blend("B", "R", 0.65)]
    steam = [[(STEAM_A, 9, 11, "S"), (STEAM_B, 14, 9, "S")],
             [(STEAM_B, 9, 9, "S"), (STEAM_A, 14, 11, "S")],
             [(STEAM_A, 9, 7, "S"), (STEAM_B, 14, 10, "S")]]

    def battery(on):
        stamps = [above(BATTERY)]
        if on:
            stamps.append((["X", "X"], 8, 11, "R"))
        return stamps

    sweat = [(SWEAT, 3, 12), (SWEAT, 19, 11), (SWEAT, 2, 10), (SWEAT, 20, 13)]

    return [
        ("success", 6, False, [
            pet(),
            pet(legs=1, front=[ok(2)]),
            pet(lift=2, arms=(0, 0), eyes="closed", front=[ok()]),
            pet(lift=1, arms=(1, 1), eyes="closed", front=[ok()]),
            pet(mouth="smile", front=[ok(), (STAR, 3, 8), (STAR, 18, 5)]),
            pet(front=[ok()]),
        ]),
        ("error", 6, False, [
            pet(),
            pet(legs=1, eyes="closed", front=[no(2)]),
            pet(dx=-1, eyes="closed", front=[no()]),
            pet(dx=1, eyes="closed", front=[no()]),
            pet(eyes="sad", front=[no()]),
            pet(eyes="sad", legs=1, front=[no()]),
        ]),
        ("idea", 6, False, [
            pet(look_y=-1),
            pet(look_y=-1, front=bulb(False)),
            pet(look_y=-1, front=bulb(True)),
            pet(lift=2, arms=(0, 0), front=bulb(True, -1)),
            pet(lift=1, arms=(1, 1), front=bulb(True, -1)),
            pet(mouth="smile", front=bulb(True)),
        ]),
        ("confused", 5, True, [
            pet(front=[q]),
            pet(look=-1, front=[q]),
            pet(look=-1, arms=(2, (-1, 3)), front=[q]),
            pet(look=1, arms=(2, 1), front=[q]),
            pet(look=1, arms=(2, (-1, 3)), front=[q]),
            pet(front=[q]),
        ]),
        ("alert", 8, False, [
            pet(),
            pet(lift=3, eyes="wide", arms=(0, 0),
                front=[above(EXCLAIM, "R", dy=-3)]),
            pet(lift=1, eyes="wide", arms=(1, 1),
                front=[above(EXCLAIM, "R", dy=-1)]),
            pet(eyes="wide", front=[bang]),
        ]),
        ("sparkle", 5, True,
         [pet(eyes="closed" if k == 2 else "open", mouth="smile", front=t)
          for k, t in enumerate(twinkle)]),
        ("celebrate", 8, True,
         [pet(back=confetti(k), **party[k % 4]) for k in range(8)]),
        ("glitch", 10, True, [
            pet(),
            glitch(pet(), (17, 19), 2),
            pet(eyes="x"),
            glitch(pet(eyes="x"), (19, 22), -2),
            glitch(pet(), (15, 17), 1),
            pet(),
        ]),
        ("overheat", 6, True,
         [pet(tint=hot[k % 2], eyes="heavy", front=steam[k % 3])
          for k in range(6)]),
        ("tired", 3, True,
         [pet(legs=1, arms=(3, 3), eyes="closed" if k == 3 else "heavy",
              front=battery(k % 2 == 0)) for k in range(6)]),
        ("panic", 10, True,
         [pet(dx=(-1, 1)[k % 2], eyes="wide",
              arms=((0, 2), (2, 0))[k % 2], front=[sweat[k]])
          for k in range(4)]),
    ]


# Moods and chatting ----------------------------------------------------------

def moods():
    def orbit(k):
        stars = []
        for i in range(3):
            a = math.radians(k * 30 + i * 120)
            stars.append((STAR, round(11.5 + 6 * math.cos(a)) - 1,
                          round(11 + 2 * math.sin(a)) - 1))
        return stars

    happy = dict(eyes="closed", mouth="smile", blush=True)

    notes = [[(NOTE, 2, 11, "P"), (NOTE, 19, 6, "c")],
             [(NOTE, 3, 9, "P"), (NOTE, 18, 8, "c")],
             [(NOTE, 2, 7, "P"), (NOTE, 19, 10, "c")],
             [(NOTE, 3, 5, "c"), (NOTE, 18, 12, "P")]]
    steps = [dict(dx=-1, arms=(0, 2), steps=(2, 2, 1, 2)),
             dict(legs=1, arms=(1, 1)),
             dict(dx=1, arms=(2, 0), steps=(2, 1, 2, 2)),
             dict(legs=1, arms=(1, 1))]
    dance = [pet(back=notes[k % 4], **steps[k % 4],
                 **(dict(eyes="closed", mouth="smile") if k >= 4 else {}))
             for k in range(8)]

    def coffee(arm, y, steam=None, **kw):
        front = [(steam, 19, y - 3, "S")] if steam else []
        return pet(arms=(2, arm), back=[(MUG, 16, y)], front=front, **kw)

    sip = dict(arms=(2, 0), eyes="closed", front=[(MUG_SIP, 16, 14)])
    drink = [
        coffee(2, 17, STEAM_A),
        coffee(2, 17, STEAM_B),
        coffee(1, 16, STEAM_A),
        pet(**sip),
        pet(**sip),
        coffee(1, 16, eyes="closed", mouth="smile"),
        pet(arms=(2, 2), eyes="closed", mouth="smile",
            back=[(MUG, 16, 17)], front=[(STAR, 4, 10)]),
        coffee(2, 17, STEAM_B),
    ]

    chomp = dict(legs=1, eyes="closed", mouth="line")
    eat = [
        pet(look=1, front=[(COIN, 20, 17)]),
        pet(look=1, mouth=("open", 2), front=[(COIN, 16, 18)]),
        pet(mouth=("open", 2), front=[(COIN, 11, 18)]),
        pet(**chomp),
        pet(eyes="closed", mouth="line", front=[(COIN, 20, 16)]),
        pet(look=1, mouth=("open", 2), front=[(COIN, 16, 18)]),
        pet(**chomp),
        pet(**happy, front=[(STAR, 18, 9)]),
    ]

    bubble = (SPEECH, 9, 7)
    talk = []
    for k in range(6):
        dots = [(["X"], 13 + 2 * i, 8 if i == k % 3 else 9, "s")
                for i in range(3)]
        talk.append(pet(mouth=("open", 1) if k % 2 == 0 else None,
                        front=[bubble] + dots))

    near, far = (ARC_NEAR, 3, 15, "c"), (ARC_FAR, 0, 14, "c")
    listen = [pet(look=-1, front=[near]),
              pet(look=-1, front=[near, far]),
              pet(look=-1, look_y=1, legs=1, front=[far]),
              pet(look=-1)]

    return [
        ("wave", 6, True, [pet(arms=(2, 1)), pet(arms=(2, 0)),
                           pet(arms=(2, 1)), pet(arms=(2, 0))]),
        ("cheer", 8, True, [pet(legs=1), pet(lift=1, arms=(0, 0)),
                            pet(lift=2, arms=(-1, -1)),
                            pet(lift=1, arms=(0, 0))]),
        ("love", 4, True, [
            pet(blush=True, front=[(HEART_SMALL, 9, 8, "H")]),
            pet(legs=1, blush=True, front=[(HEART_BIG, 8, 6, "H")]),
            pet(blush=True, front=[(HEART_SMALL, 9, 8, "H")]),
            pet(legs=1, blush=True, front=[(HEART_BIG, 8, 6, "H")]),
        ]),
        ("happy", 6, True, [pet(**happy), pet(lift=1, arms=(1, 1), **happy),
                            pet(legs=1, **happy),
                            pet(lift=1, arms=(1, 1), **happy)]),
        ("sad", 3, True, [
            pet(eyes="sad"),
            pet(eyes="sad", front=[(TEAR, 9, 19)]),
            pet(eyes="sad", front=[(TEAR, 9, 21)]),
            pet(eyes="sad", legs=1, front=[(TEAR, 9, 22)]),
        ]),
        ("angry", 8, True, [
            pet(eyes="angry", arms=(1, 1), front=[(ANGER, 17, 9)]),
            pet(dx=1, eyes="angry", front=[(ANGER, 18, 8)]),
            pet(eyes="angry", arms=(1, 1), front=[(ANGER, 17, 9)]),
            pet(dx=-1, eyes="angry", front=[(ANGER, 16, 8)]),
        ]),
        ("dizzy", 6, True,
         [pet(dx=(0, 1, 0, -1)[k], eyes="cross" if k % 2 else "open",
              front=orbit(k)) for k in range(4)]),
        ("scared", 12, True,
         [pet(dx=(0, 1, 0, -1)[k], legs=1, eyes="wide", arms=(1, 1),
              front=[(SWEAT, 18, 12 + k % 2)]) for k in range(4)]),
        ("nod yes", 6, True, [pet(), pet(look_y=1, legs=1), pet(),
                              pet(look_y=1, legs=1)]),
        ("shake no", 8, True, [pet(dx=-1, look=-1), pet(), pet(dx=1, look=1),
                               pet()]),
        ("shrug", 5, False, [pet(), pet(arms=(1, 1), look_y=-1),
                             pet(arms=(0, 0), eyes="closed", mouth="line"),
                             pet(arms=(0, 0), eyes="closed", mouth="line")]),
        ("dance", 8, True, dance),
        ("coffee", 4, True, drink),
        ("eat tokens", 6, True, eat),
        ("talking", 6, True, talk),
        ("listening", 4, True, listen),
    ]


SECTIONS = [
    ("Basics", basics()),
    ("Moving around", moving()),
    ("Coding", coding()),
    ("Reactions", reactions()),
    ("Moods & chatting", moods()),
]
ANIMATIONS = [(section, *anim) for section, anims in SECTIONS
              for anim in anims]
COLS = max(len(frames) for *_, frames in ANIMATIONS)


def build_sheet():
    sheet = Image.new("RGBA", (COLS * FRAME, len(ANIMATIONS) * FRAME),
                      (0, 0, 0, 0))
    for row, (*_, frames) in enumerate(ANIMATIONS):
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
    """A labelled sheet for people to look at, in two columns."""
    cell = FRAME * SCALE
    gap = 8
    label_w = 270
    pad = 48
    col_gap = 72
    head = 190
    title_h = 64
    row_h = cell + gap
    bg = (250, 247, 242, 255)
    tile = (240, 234, 225, 255)
    ink = (60, 46, 40, 255)
    soft = (150, 132, 120, 255)
    accent = (204, 123, 94, 255)

    heights = [title_h + len(anims) * row_h for _, anims in SECTIONS]
    split = min(range(1, len(SECTIONS)),
                key=lambda i: max(sum(heights[:i]), sum(heights[i:])))
    columns = [SECTIONS[:split], SECTIONS[split:]]
    col_w = label_w + COLS * row_h - gap
    width = pad * 2 + col_w * 2 + col_gap
    height = head + max(sum(heights[:split]), sum(heights[split:])) + pad
    out = Image.new("RGBA", (width, height), bg)
    d = ImageDraw.Draw(out)

    hero = big(pet(), 5)
    out.alpha_composite(hero, (pad - 20, pad - 40))
    d.text((pad + hero.width, pad + 4), "Lil Boy", font=font(56, True),
           fill=ink)
    d.text((pad + hero.width + 2, pad + 76),
           f"coding agent desktop pet  ·  {len(ANIMATIONS)} animations  ·  "
           f"{FRAME}×{FRAME} px frames",
           font=font(24), fill=soft)

    for c, sections in enumerate(columns):
        x0 = pad + c * (col_w + col_gap)
        y = head
        for title, anims in sections:
            d.text((x0, y + 14), title.upper(), font=font(26, True),
                   fill=accent)
            d.line((x0, y + title_h - 14, x0 + col_w, y + title_h - 14),
                   fill=tile, width=3)
            y += title_h
            for name, fps, loop, frames in anims:
                d.text((x0, y + cell // 2 - 24), name, font=font(24, True),
                       fill=ink)
                d.text((x0, y + cell // 2 + 8),
                       f"{len(frames)} frames · {fps} fps"
                       + ("" if loop else " · once"),
                       font=font(17), fill=soft)
                for i in range(COLS):
                    x = x0 + label_w + i * row_h
                    d.rounded_rectangle((x, y, x + cell - 1, y + cell - 1), 8,
                                        fill=tile)
                    if i < len(frames):
                        out.alpha_composite(big(frames[i]), (x, y))
                        d.text((x + 6, y + 4), str(i + 1), font=font(13),
                               fill=soft)
                y += row_h
    return out


def build_gif():
    """Every animation playing at once, for a quick look."""
    scale = 3
    per_row = 10
    cell_w, cell_h, label_h = 104, FRAME * scale, 18
    rows = math.ceil(len(ANIMATIONS) / per_row)
    label = font(11)
    base = Image.new("RGBA", (cell_w * per_row, rows * (cell_h + label_h) + 8),
                     (250, 247, 242, 255))
    d = ImageDraw.Draw(base)
    for i, (_, name, *_rest) in enumerate(ANIMATIONS):
        x, y = (i % per_row) * cell_w, (i // per_row) * (cell_h + label_h)
        w = d.textlength(name, font=label)
        d.text((x + (cell_w - w) / 2, y + cell_h + 2), name, font=label,
               fill=(120, 104, 94, 255))
    frames = []
    for step in range(24):  # 24 steps fits 4, 6 and 8 frame loops
        canvas = base.copy()
        for i, (*_, anim) in enumerate(ANIMATIONS):
            x = (i % per_row) * cell_w + (cell_w - cell_h) // 2
            y = (i // per_row) * (cell_h + label_h)
            canvas.alpha_composite(big(anim[step % len(anim)], scale), (x, y))
        frames.append(canvas.convert("P", palette=Image.ADAPTIVE))
    frames[0].save(OUT / "lil-boy-preview.gif", save_all=True,
                   append_images=frames[1:], duration=160, loop=0,
                   disposal=2)


def main():
    sheet = build_sheet()
    sheet.save(OUT / "lil-boy-sheet-1x.png")
    big(sheet).save(OUT / "lil-boy-sheet.png")
    build_preview().save(OUT / "lil-boy-sheet-labelled.png")
    build_gif()

    meta = {
        "image": "lil-boy-sheet-1x.png",
        "image4x": "lil-boy-sheet.png",
        "frameWidth": FRAME,
        "frameHeight": FRAME,
        "animations": [
            {"name": name, "category": section, "row": row,
             "frames": len(frames), "fps": fps, "loop": loop}
            for row, (section, name, fps, loop, frames)
            in enumerate(ANIMATIONS)
        ],
    }
    (OUT / "lil-boy-sheet.json").write_text(json.dumps(meta, indent=2) + "\n")


if __name__ == "__main__":
    main()
