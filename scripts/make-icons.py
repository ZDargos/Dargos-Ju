"""Draws the Dargos Ju app icon (white 句 on red) into the Android launcher icon resources.

Run from the repo root on Windows (uses the Microsoft YaHei Bold font):  python scripts/make-icons.py
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

RED = (192, 57, 43, 255)
WHITE = (255, 255, 255, 255)
FONT = "C:/Windows/Fonts/msyhbd.ttc"
RES = Path("android/app/src/main/res")
DENSITIES = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}


def glyph(img: Image.Image, scale: float) -> None:
    d = ImageDraw.Draw(img)
    w, h = img.size
    font = ImageFont.truetype(FONT, int(h * scale))
    box = d.textbbox((0, 0), "句", font=font)
    x = (w - (box[2] - box[0])) / 2 - box[0]
    y = (h - (box[3] - box[1])) / 2 - box[1]
    d.text((x, y), "句", font=font, fill=WHITE)


def render(size: int, shape: str) -> Image.Image:
    big = size * 4  # draw large, then downsample for smooth edges
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if shape == "round":
        d.ellipse((0, 0, big - 1, big - 1), fill=RED)
        glyph(img, 0.56)
    elif shape == "square":
        d.rounded_rectangle((0, 0, big - 1, big - 1), radius=big * 0.22, fill=RED)
        glyph(img, 0.62)
    else:  # adaptive foreground: glyph inside the 66% safe zone, transparent background
        glyph(img, 0.40)
    return img.resize((size, size), Image.LANCZOS)


for name, k in DENSITIES.items():
    folder = RES / f"mipmap-{name}"
    render(round(48 * k), "square").save(folder / "ic_launcher.png")
    render(round(48 * k), "round").save(folder / "ic_launcher_round.png")
    render(round(108 * k), "foreground").save(folder / "ic_launcher_foreground.png")

(RES / "values" / "ic_launcher_background.xml").write_text(
    '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#C0392B</color>\n</resources>\n',
    encoding="utf-8",
)
# Web app (PWA) icons: plain squares (iOS rounds the corners itself) and a maskable icon with padding.
def full_square(size: int, scale: float) -> Image.Image:
    big = size * 4
    img = Image.new("RGBA", (big, big), RED)
    glyph(img, scale)
    return img.resize((size, size), Image.LANCZOS)

full_square(180, 0.62).convert("RGB").save("public/apple-touch-icon.png")
full_square(192, 0.62).save("public/icon-192.png")
full_square(512, 0.62).save("public/icon-512.png")
full_square(512, 0.46).save("public/icon-maskable-512.png")
print("Icons written.")

# Launch screen: the icon centred on the app background, at each existing splash size.
icon = render(512, "square")
for splash in RES.glob("drawable*/splash.png"):
    w, h = Image.open(splash).size
    img = Image.new("RGBA", (w, h), (247, 244, 238, 255))
    s = int(min(w, h) * 0.28)
    img.alpha_composite(icon.resize((s, s), Image.LANCZOS), ((w - s) // 2, (h - s) // 2))
    img.convert("RGB").save(splash)
print("Splash screens written.")
