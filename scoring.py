"""CRO-Score Calculation Engine & Tier Classification"""

from typing import Dict, Any


def calculate_cro_score(stats: Dict[str, Any]) -> float:
    """
    Calculate 100-point scale CRO-Score.
    Weights:
    - Quality (전문성/품질): 25%
    - Scale (규모/재무안정성): 20%
    - Reputation (업계 평판): 20%
    - Retention (낮은 퇴사율/근속성): 15%
    - Volume (과제 수행력): 10%
    - Service Range (커버 업무 범위): 10%
    """
    weights = {
        "quality": 0.25,
        "scale_score": 0.20,
        "reputation": 0.20,
        "retention": 0.15,
        "volume": 0.10,
        "service_range": 0.10,
    }

    total = 0.0
    for k, w in weights.items():
        val = stats.get(k)
        if val is None or not isinstance(val, (int, float)):
            val = 50.0  # default median value
        # Clamp value between 0.0 and 100.0
        val = max(0.0, min(100.0, float(val)))
        total += val * w

    return round(total, 1)


def calculate_tier(score: float) -> str:
    """
    Map CRO-Score to Tier.
    - S+ : >= 92.0 (Top 5% 최우수)
    - S  : >= 86.0 (선도 대형/글로벌)
    - A  : >= 78.0 (우수 전문 강소)
    - B  : >= 70.0 (일반)
    - C  : < 70.0 (초기/보완필요)
    """
    if score >= 92.0:
        return "S+"
    elif score >= 86.0:
        return "S"
    elif score >= 78.0:
        return "A"
    elif score >= 70.0:
        return "B"
    else:
        return "C"


def normalize_value(val: float, min_val: float, max_val: float, invert: bool = False) -> float:
    """Min-Max normalization to 0-100 scale."""
    if max_val == min_val:
        return 50.0
    norm = (val - min_val) / (max_val - min_val)
    if invert:
        norm = 1.0 - norm
    norm = max(0.0, min(1.0, norm))
    return round(norm * 100.0, 1)
