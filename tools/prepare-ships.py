"""Chroma-key the magenta backdrop out of the generated ship art and trim to the hull."""

import sys
from PIL import Image

SHIPS = ["carrier", "battleship", "cruiser", "submarine", "destroyer"]
RAW = "/home/ubuntu/assets/raw"
OUT = sys.argv[1] if len(sys.argv) > 1 else "/home/ubuntu/assets/out"


def is_magenta(r: int, g: int, b: int) -> bool:
    """Magenta backdrop: red and blue both high, green low."""
    return r > 150 and b > 150 and g < 110 and (r - g) > 70 and (b - g) > 70


def key(name: str) -> None:
    img = Image.open(f"{RAW}/{name}.png").convert("RGBA")
    pixels = img.load()
    width, height = img.size

    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            if is_magenta(r, g, b):
                pixels[x, y] = (r, g, b, 0)
            elif r > g and b > g:
                # Magenta spill on the antialiased hull edge. The plastic is neutral
                # grey, so any pixel where red and blue both exceed green is picking up
                # the backdrop; clamping them down to green removes the pink halo.
                pixels[x, y] = (g, g, g, a)

    bbox = img.getbbox()
    img = img.crop(bbox)
    # 450px covers a 2× desktop render of the widest hull (~210 CSS px) with room to
    # spare; the source art is three times that, and paid for it in transfer size.
    img.thumbnail((450, 450), Image.LANCZOS)
    img.save(f"{OUT}/{name}.png", optimize=True)
    print(f"{name}: {img.size[0]}x{img.size[1]}")


if __name__ == "__main__":
    for ship in SHIPS:
        key(ship)
