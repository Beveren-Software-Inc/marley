"""Generate the Healthcare Settings discharge stamp (red DISCHARGED rubber stamp)."""

from __future__ import annotations

import io
import os

import frappe
from frappe import _
from frappe.utils.file_manager import save_file

# Classic rubber-stamp red matching Serene discharge form samples
STAMP_INK = (196, 30, 58)  # #C41E3A
STAMP_INK_HEX = "#C41E3A"
STAMP_BG = (255, 255, 255)
STAMP_WIDTH = 640
STAMP_HEIGHT = 220
STAMP_MARGIN = 14
STAMP_BORDER_WIDTH = 8
STAMP_TEXT = "DISCHARGED"
SETTINGS_DOCTYPE = "Healthcare Settings"
SETTINGS_NAME = "Healthcare Settings"
ATTACH_FIELD = "discharge_stamp"


def _load_font(size: int, *, bold: bool = True):
	from PIL import ImageFont

	candidates = [
		"/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
		"/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
		"/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
		"/Library/Fonts/Arial Bold.ttf" if bold else "/Library/Fonts/Arial.ttf",
		"/System/Library/Fonts/Supplemental/Helvetica.ttc",
	]
	for path in candidates:
		if path and os.path.exists(path):
			try:
				return ImageFont.truetype(path, size)
			except Exception:
				continue
	return ImageFont.load_default()


def _text_size(draw, text: str, font) -> tuple[int, int]:
	bbox = draw.textbbox((0, 0), text, font=font)
	return bbox[2] - bbox[0], bbox[3] - bbox[1]


def _fit_font(draw, text: str, max_width: int, start_size: int):
	size = start_size
	while size >= 28:
		font = _load_font(size, bold=True)
		w, _ = _text_size(draw, text, font)
		if w <= max_width:
			return font
		size -= 2
	return _load_font(28, bold=True)


def render_discharge_stamp_svg() -> bytes:
	svg = f"""<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="{STAMP_WIDTH}" height="{STAMP_HEIGHT}" viewBox="0 0 {STAMP_WIDTH} {STAMP_HEIGHT}">
  <rect x="{STAMP_MARGIN}" y="{STAMP_MARGIN}" width="{STAMP_WIDTH - 2 * STAMP_MARGIN}" height="{STAMP_HEIGHT - 2 * STAMP_MARGIN}" fill="#ffffff" stroke="{STAMP_INK_HEX}" stroke-width="{STAMP_BORDER_WIDTH}"/>
  <text x="{STAMP_WIDTH // 2}" y="{STAMP_HEIGHT // 2 + 18}" text-anchor="middle" font-family="Arial Black, Arial, Helvetica, sans-serif" font-size="72" font-weight="800" fill="{STAMP_INK_HEX}" letter-spacing="4">{STAMP_TEXT}</text>
</svg>
"""
	return svg.encode("utf-8")


def render_discharge_stamp_png() -> bytes:
	from PIL import Image, ImageDraw

	img = Image.new("RGB", (STAMP_WIDTH, STAMP_HEIGHT), STAMP_BG)
	draw = ImageDraw.Draw(img)
	inner = (
		STAMP_MARGIN,
		STAMP_MARGIN,
		STAMP_WIDTH - STAMP_MARGIN,
		STAMP_HEIGHT - STAMP_MARGIN,
	)
	# Thick double-look border like a rubber stamp
	draw.rectangle(inner, outline=STAMP_INK, width=STAMP_BORDER_WIDTH)
	inset = STAMP_MARGIN + 6
	draw.rectangle(
		(inset, inset, STAMP_WIDTH - inset, STAMP_HEIGHT - inset),
		outline=STAMP_INK,
		width=3,
	)

	max_text_width = STAMP_WIDTH - 80
	font = _fit_font(draw, STAMP_TEXT, max_text_width, 78)
	tw, th = _text_size(draw, STAMP_TEXT, font)
	x = (STAMP_WIDTH - tw) // 2
	y = (STAMP_HEIGHT - th) // 2 - 4
	draw.text((x, y), STAMP_TEXT, font=font, fill=STAMP_INK)

	buf = io.BytesIO()
	img.save(buf, format="PNG")
	return buf.getvalue()


def render_discharge_stamp() -> tuple[bytes, str]:
	try:
		return render_discharge_stamp_png(), "png"
	except Exception:
		return render_discharge_stamp_svg(), "svg"


def _remove_existing_discharge_stamp_files() -> None:
	files = frappe.get_all(
		"File",
		filters={
			"attached_to_doctype": SETTINGS_DOCTYPE,
			"attached_to_name": SETTINGS_NAME,
			"attached_to_field": ATTACH_FIELD,
		},
		pluck="name",
	)
	for file_name in files:
		frappe.delete_doc("File", file_name, ignore_permissions=True, force=1)


@frappe.whitelist()
def generate_discharge_stamp() -> dict:
	"""Create/replace Healthcare Settings → Discharge Stamp with a red DISCHARGED image."""
	frappe.only_for(("System Manager", "Healthcare Administrator"))

	if not frappe.get_meta(SETTINGS_DOCTYPE).has_field(ATTACH_FIELD):
		frappe.throw(_("Healthcare Settings is missing the Discharge Stamp attach field."))

	content, ext = render_discharge_stamp()
	_remove_existing_discharge_stamp_files()

	filename = f"discharge-stamp.{ext}"
	file_doc = save_file(
		filename,
		content,
		SETTINGS_DOCTYPE,
		SETTINGS_NAME,
		folder=None,
		decode=False,
		is_private=0,
		df=ATTACH_FIELD,
	)
	frappe.db.set_single_value(SETTINGS_DOCTYPE, ATTACH_FIELD, file_doc.file_url)
	frappe.db.commit()
	return {
		"status": "ok",
		"file_url": file_doc.file_url,
		"message": _("Discharge stamp generated and attached to Healthcare Settings."),
	}
