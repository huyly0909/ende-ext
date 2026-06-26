"""Generate lock icons — slim lock with rotated 'LH' monogram as keyhole."""
from PIL import Image, ImageDraw, ImageFont
import os

SIZES = [128, 48, 16]
OUT_DIR = os.path.join(os.path.dirname(__file__), 'icons')

C1 = (168, 85, 247)   # purple
C2 = (6, 182, 212)    # cyan

def lerp_color(t):
    return tuple(int(C1[i] + (C2[i] - C1[i]) * t) for i in range(3))

def draw_lock(size):
    s = size * 4
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # ── Slim lock proportions ──
    pad_x = s * 0.18
    pad_bottom = s * 0.08
    body_w = s - 2 * pad_x
    body_h = body_w * 0.72
    body_top = s - pad_bottom - body_h
    body_left = pad_x
    body_r = body_w * 0.16

    # ── Shackle ──
    shackle_w = body_w * 0.58
    shackle_left = (s - shackle_w) / 2
    shackle_top = s * 0.08
    shackle_thick = body_w * 0.13

    # Draw body
    draw.rounded_rectangle(
        [body_left, body_top, body_left + body_w, body_top + body_h],
        radius=body_r, fill=(255, 255, 255, 255),
    )

    # Draw shackle
    outer_box = [shackle_left, shackle_top,
                 shackle_left + shackle_w, shackle_top + shackle_w]
    inner_box = [shackle_left + shackle_thick, shackle_top + shackle_thick,
                 shackle_left + shackle_w - shackle_thick,
                 shackle_top + shackle_w - shackle_thick]
    draw.pieslice(outer_box, 180, 360, fill=(255, 255, 255, 255))
    draw.pieslice(inner_box, 180, 360, fill=(0, 0, 0, 0))

    arc_cy = shackle_top + shackle_w / 2
    leg_bottom = body_top + 1
    draw.rectangle([shackle_left, arc_cy, shackle_left + shackle_thick, leg_bottom],
                   fill=(255, 255, 255, 255))
    draw.rectangle([shackle_left + shackle_w - shackle_thick, arc_cy,
                    shackle_left + shackle_w, leg_bottom],
                   fill=(255, 255, 255, 255))

    # ── "LH" rotated 90° as keyhole ──
    font_size = int(body_h * 0.38)
    font = None
    for fp in [
        '/System/Library/Fonts/Helvetica.ttc',
        '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
        '/System/Library/Fonts/Supplemental/Helvetica Neue.ttc',
    ]:
        if os.path.exists(fp):
            try:
                font = ImageFont.truetype(fp, font_size, index=0)
                break
            except Exception:
                continue
    if font is None:
        font = ImageFont.load_default()

    # Render LH on a separate transparent layer, then rotate 90°
    text = 'LH'
    tmp = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    tmp_draw = ImageDraw.Draw(tmp)
    bbox = tmp_draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]

    # Draw text centered in tmp
    tx = (s - tw) / 2 - bbox[0]
    ty = (s - th) / 2 - bbox[1]
    tmp_draw.text((tx, ty), text, fill=(255, 255, 255, 255), font=font)

    # Rotate 90° clockwise and squash height to look like keyhole
    tmp_rotated = tmp.rotate(90, resample=Image.BICUBIC, expand=False)

    # Squash vertically: scale down height to ~55% to make it keyhole-shaped
    squash_factor = 0.55
    new_h = int(s * squash_factor)
    tmp_squashed = tmp_rotated.resize((s, new_h), Image.LANCZOS)

    # Paste squashed text centered onto a full-size mask
    mask = Image.new('L', (s, s), 0)
    # Center in the lock body
    body_center_y = int(body_top + body_h / 2)
    paste_y = body_center_y - new_h // 2
    # Extract alpha channel as mask
    squashed_alpha = tmp_squashed.split()[3]
    mask.paste(squashed_alpha, (0, paste_y))

    # Erase pixels where mask is white (cutout effect)
    pixels = img.load()
    mask_pixels = mask.load()
    for y in range(s):
        for x in range(s):
            if mask_pixels[x, y] > 100:
                pixels[x, y] = (0, 0, 0, 0)

    # ── Apply gradient ──
    for y in range(s):
        for x in range(s):
            r, g, b, a = pixels[x, y]
            if a > 0 and r == 255 and g == 255 and b == 255:
                t = (x / s) * 0.55 + (1 - y / s) * 0.45
                t = max(0.0, min(1.0, t))
                gr, gg, gb = lerp_color(t)
                pixels[x, y] = (gr, gg, gb, a)

    img = img.resize((size, size), Image.LANCZOS)
    return img

for sz in SIZES:
    icon = draw_lock(sz)
    path = os.path.join(OUT_DIR, f'icon{sz}.png')
    icon.save(path, 'PNG')
    print(f'✅ {path} ({sz}x{sz})')
print('Done!')
