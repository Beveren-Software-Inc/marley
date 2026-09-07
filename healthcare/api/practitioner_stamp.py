"""Generate Healthcare Practitioner stamp images (hospital / name / role / license)."""

from __future__ import annotations

import io
import os
import re

import frappe
from frappe import _
from frappe.utils.file_manager import save_file

DEFAULT_HOSPITAL = "Serene Psychiatry Hospital"
STAMP_HOSPITAL_COLOR = (31, 111, 139)  # #1F6F8B from the Serene stamp samples
STAMP_BORDER = (0, 0, 0)
STAMP_TEXT = (0, 0, 0)
STAMP_BG = (255, 255, 255)
STAMP_WIDTH = 900
STAMP_HEIGHT = 320
STAMP_MARGIN = 18


def stamp_attach_field() -> str:
	meta = frappe.get_meta("Healthcare Practitioner")
	if meta.has_field("doctors_stamp"):
		return "doctors_stamp"
	if meta.has_field("doctors_satmp"):
		return "doctors_satmp"
	frappe.throw(_("Healthcare Practitioner is missing a Doctors Stamp attach field."))


def _safe_filename_part(value: str) -> str:
	text = re.sub(r"[^A-Za-z0-9._-]+", "-", (value or "").strip())
	return text.strip("-")[:60] or "practitioner"


def _load_font(size: int, *, bold: bool = False, serif: bool = False):
	from PIL import ImageFont

	candidates = []
	if serif:
		candidates.extend(
			[
				"/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf",
				"/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf" if bold else "/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf",
				"/System/Library/Fonts/Supplemental/Georgia Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Georgia.ttf",
				"/Library/Fonts/Georgia Bold.ttf" if bold else "/Library/Fonts/Georgia.ttf",
			]
		)
	candidates.extend(
		[
			"/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
			"/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
			"/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
			"/Library/Fonts/Arial Bold.ttf" if bold else "/Library/Fonts/Arial.ttf",
		]
	)
	for path in candidates:
		if path and os.path.exists(path):
			try:
				return ImageFont.truetype(path, size)
			except Exception:
				continue
	return ImageFont.load_default()


def _text_width(draw, text: str, font) -> int:
	bbox = draw.textbbox((0, 0), text, font=font)
	return bbox[2] - bbox[0]


def _fit_font(draw, text: str, max_width: int, start_size: int, *, bold: bool, serif: bool = False):
	size = start_size
	while size >= 14:
		font = _load_font(size, bold=bold, serif=serif)
		if _text_width(draw, text, font) <= max_width:
			return font
		size -= 2
	return _load_font(14, bold=bold, serif=serif)


def _draw_spaced_center(draw, text: str, y: int, font, fill, tracking: int, canvas_width: int):
	"""Draw centered text with extra letter spacing (hospital line in the sample stamps)."""
	if not text:
		return
	widths = [_text_width(draw, ch, font) for ch in text]
	total = sum(widths) + tracking * max(len(text) - 1, 0)
	x = (canvas_width - total) // 2
	for ch, w in zip(text, widths):
		draw.text((x, y), ch, font=font, fill=fill)
		x += w + tracking


def _xml_escape(text: str) -> str:
	return (
		(text or "")
		.replace("&", "&amp;")
		.replace("<", "&lt;")
		.replace(">", "&gt;")
		.replace('"', "&quot;")
	)


def render_practitioner_stamp_svg(hospital: str, doctor_name: str, role: str, licence_no: str) -> bytes:
	licence_line = f"License No. {licence_no}".strip() if licence_no else "License No."
	svg = f"""<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="{STAMP_WIDTH}" height="{STAMP_HEIGHT}" viewBox="0 0 {STAMP_WIDTH} {STAMP_HEIGHT}">
  <rect x="8" y="8" width="{STAMP_WIDTH - 16}" height="{STAMP_HEIGHT - 16}" fill="#ffffff" stroke="#000000" stroke-width="4"/>
  <text x="{STAMP_WIDTH // 2}" y="88" text-anchor="middle" font-family="Cambria, Georgia, 'Times New Roman', serif" font-size="28" font-weight="700" fill="#1F6F8B" letter-spacing="2.4">{_xml_escape(hospital)}</text>
  <text x="{STAMP_WIDTH // 2}" y="150" text-anchor="middle" font-family="Calibri, Arial, Helvetica, sans-serif" font-size="30" font-weight="700" fill="#000000">{_xml_escape(doctor_name)}</text>
  <text x="{STAMP_WIDTH // 2}" y="200" text-anchor="middle" font-family="Calibri, Arial, Helvetica, sans-serif" font-size="22" fill="#000000">{_xml_escape(role)}</text>
  <text x="{STAMP_WIDTH // 2}" y="248" text-anchor="middle" font-family="Calibri, Arial, Helvetica, sans-serif" font-size="22" fill="#000000">{_xml_escape(licence_line)}</text>
</svg>
"""
	return svg.encode("utf-8")


def render_practitioner_stamp_png(hospital: str, doctor_name: str, role: str, licence_no: str) -> bytes:
	from PIL import Image, ImageDraw

	img = Image.new("RGB", (STAMP_WIDTH, STAMP_HEIGHT), STAMP_BG)
	draw = ImageDraw.Draw(img)
	inner = (
		STAMP_MARGIN,
		STAMP_MARGIN,
		STAMP_WIDTH - STAMP_MARGIN,
		STAMP_HEIGHT - STAMP_MARGIN,
	)
	draw.rectangle(inner, outline=STAMP_BORDER, width=4)

	max_text_width = STAMP_WIDTH - 80
	hospital_font = _fit_font(draw, hospital, max_text_width, 28, bold=True, serif=True)
	name_font = _fit_font(draw, doctor_name, max_text_width, 32, bold=True)
	role_font = _fit_font(draw, role, max_text_width, 24, bold=False)
	licence_line = f"License No. {licence_no}".strip() if licence_no else "License No."
	licence_font = _fit_font(draw, licence_line, max_text_width, 24, bold=False)

	lines = [
		("hospital", hospital, hospital_font),
		("name", doctor_name, name_font),
		("role", role, role_font),
		("licence", licence_line, licence_font),
	]
	heights = []
	for _, text, font in lines:
		bbox = draw.textbbox((0, 0), text or " ", font=font)
		heights.append(bbox[3] - bbox[1])
	gap = 10
	block = sum(heights) + gap * (len(lines) - 1)
	y = (STAMP_HEIGHT - block) // 2

	_draw_spaced_center(draw, hospital, y, hospital_font, STAMP_HOSPITAL_COLOR, 3, STAMP_WIDTH)
	y += heights[0] + gap
	draw.text(
		((STAMP_WIDTH - _text_width(draw, doctor_name, name_font)) // 2, y),
		doctor_name,
		font=name_font,
		fill=STAMP_TEXT,
	)
	y += heights[1] + gap
	draw.text(
		((STAMP_WIDTH - _text_width(draw, role, role_font)) // 2, y),
		role,
		font=role_font,
		fill=STAMP_TEXT,
	)
	y += heights[2] + gap
	draw.text(
		((STAMP_WIDTH - _text_width(draw, licence_line, licence_font)) // 2, y),
		licence_line,
		font=licence_font,
		fill=STAMP_TEXT,
	)

	buf = io.BytesIO()
	img.save(buf, format="PNG")
	return buf.getvalue()


def render_practitioner_stamp(hospital: str, doctor_name: str, role: str, licence_no: str) -> tuple[bytes, str]:
	try:
		return render_practitioner_stamp_png(hospital, doctor_name, role, licence_no), "png"
	except Exception:
		return render_practitioner_stamp_svg(hospital, doctor_name, role, licence_no), "svg"


def stamp_copy_for_practitioner(doc) -> dict:
	hospital = (doc.get("hospital") or "").strip() or DEFAULT_HOSPITAL
	name = (doc.get("practitioner_name") or "").strip()
	if not name:
		parts = [doc.get("first_name"), doc.get("middle_name"), doc.get("last_name")]
		name = " ".join(p.strip() for p in parts if p and str(p).strip())
	name = (name or "").strip().upper()
	if not name:
		frappe.throw(_("Practitioner name is required to generate a stamp."))

	role = (doc.get("stamp_role") or "").strip() if doc.get("stamp_role") else ""
	if not role and doc.get("medical_role"):
		role = str(doc.medical_role).strip()
	role = role or "Medical Practitioner"
	licence_no = (doc.get("licence_no") or "").strip()
	return {
		"hospital": hospital,
		"doctor_name": name,
		"role": role,
		"licence_no": licence_no,
	}


def _remove_existing_stamp_files(name: str, field: str) -> None:
	files = frappe.get_all(
		"File",
		filters={
			"attached_to_doctype": "Healthcare Practitioner",
			"attached_to_name": name,
			"attached_to_field": field,
		},
		pluck="name",
	)
	for file_name in files:
		frappe.delete_doc("File", file_name, ignore_permissions=True, force=1)


@frappe.whitelist()
def generate_practitioner_stamp(name: str | None = None) -> dict:
	name = (name or "").strip()
	if not name:
		frappe.throw(_("Healthcare Practitioner is required"))
	if not frappe.db.exists("Healthcare Practitioner", name):
		frappe.throw(_("Healthcare Practitioner {0} not found").format(name))

	doc = frappe.get_doc("Healthcare Practitioner", name)
	copy = stamp_copy_for_practitioner(doc)
	content, ext = render_practitioner_stamp(
		copy["hospital"],
		copy["doctor_name"],
		copy["role"],
		copy["licence_no"],
	)

	field = stamp_attach_field()
	_remove_existing_stamp_files(name, field)

	filename = "doctor-stamp-{0}-{1}.{2}".format(
		_safe_filename_part(name),
		_safe_filename_part(copy["licence_no"] or "no-licence"),
		ext,
	)
	file_doc = save_file(
		filename,
		content,
		"Healthcare Practitioner",
		name,
		folder=None,
		decode=False,
		is_private=0,
		df=field,
	)
	frappe.db.set_value("Healthcare Practitioner", name, field, file_doc.file_url, update_modified=False)
	return {
		"status": "ok",
		"name": name,
		"file_url": file_doc.file_url,
		"licence_no": copy["licence_no"],
	}


@frappe.whitelist()
def preview_generate_doctors_stamps() -> dict:
	frappe.only_for(("System Manager", "Healthcare Administrator"))
	total = frappe.db.count("Healthcare Practitioner")
	with_licence = frappe.db.count("Healthcare Practitioner", {"licence_no": ["!=", ""]})
	return {"candidates": total, "with_licence": with_licence}


@frappe.whitelist()
def generate_all_practitioner_stamps() -> dict:
	frappe.only_for(("System Manager", "Healthcare Administrator"))
	names = frappe.get_all("Healthcare Practitioner", pluck="name", order_by="name")
	ok = skip = errors = 0
	error_samples: list[str] = []
	for name in names:
		try:
			generate_practitioner_stamp(name)
			ok += 1
		except Exception:
			errors += 1
			if len(error_samples) < 8:
				error_samples.append(f"{name}: {frappe.get_traceback().splitlines()[-1]}")
	frappe.db.commit()
	return {
		"ok": True,
		"updated": ok,
		"skip": skip,
		"errors": errors,
		"total": len(names),
		"error_samples": error_samples,
		"message": _("Generated stamps for {0} of {1} practitioners ({2} errors).").format(
			ok, len(names), errors
		),
	}
