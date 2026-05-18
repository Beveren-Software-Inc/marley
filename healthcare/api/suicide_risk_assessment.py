"""Backward-compatible API path for Clinical Suicide Risk Assessment.

The implementation lives in ``clinical_suicide``; some clients call
``healthcare.api.suicide_risk_assessment.*``.
"""

from healthcare.api.clinical_suicide import (  # noqa: F401
	create_suicide_risk_assessment,
	get_suicide_risk_assessments,
	calculate_risk_score,
	get_risk_level,
)
