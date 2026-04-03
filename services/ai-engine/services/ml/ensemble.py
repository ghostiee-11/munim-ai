"""
MunimAI Forecast Ensemble
Combines TFT + Chronos + Prophet predictions with adaptive weighting.

Weighting strategy:
- Merchant has >= 6 months data → TFT: 0.5, Chronos: 0.3, Prophet: 0.2
- Merchant has 3-6 months → TFT: 0.3, Chronos: 0.4, Prophet: 0.3
- Merchant has < 3 months → Chronos: 0.7, Prophet: 0.3 (cold start)
"""

import numpy as np
from dataclasses import dataclass
from typing import Optional


@dataclass
class ForecastResult:
    """Single day forecast result"""
    date: str
    predicted_income: float
    predicted_expense: float
    predicted_net: float
    confidence_upper: float
    confidence_lower: float
    is_festival: bool = False
    festival_name: Optional[str] = None
    is_crisis: bool = False
    crisis_severity: Optional[str] = None  # "mild", "moderate", "severe"


@dataclass
class ForecastSummary:
    """Summary of multi-day forecast"""
    daily_forecasts: list[ForecastResult]
    total_predicted_income: float
    total_predicted_expense: float
    total_predicted_net: float
    crisis_dates: list[dict]  # [{date, severity, predicted_net}]
    festival_impacts: list[dict]  # [{date, festival_name, multiplier}]
    recommendations: list[str]  # Hindi action recommendations


class ForecastEnsemble:
    """
    Adaptive ensemble of forecasting models.

    For production: Uses TFT + Chronos + Prophet
    For demo: Uses pre-computed forecasts from seed data with realistic noise
    """

    def __init__(self, data_months: int = 6):
        self.data_months = data_months
        self._set_weights()

    def _set_weights(self):
        """Set model weights based on available data"""
        if self.data_months >= 6:
            self.weights = {"tft": 0.5, "chronos": 0.3, "prophet": 0.2}
        elif self.data_months >= 3:
            self.weights = {"tft": 0.3, "chronos": 0.4, "prophet": 0.3}
        else:
            self.weights = {"tft": 0.0, "chronos": 0.7, "prophet": 0.3}

    def combine_predictions(
        self,
        tft_preds: Optional[np.ndarray],
        chronos_preds: Optional[np.ndarray],
        prophet_preds: Optional[np.ndarray],
    ) -> np.ndarray:
        """Weighted combination of model predictions"""
        predictions = []
        weights = []

        if tft_preds is not None and self.weights["tft"] > 0:
            predictions.append(tft_preds)
            weights.append(self.weights["tft"])

        if chronos_preds is not None and self.weights["chronos"] > 0:
            predictions.append(chronos_preds)
            weights.append(self.weights["chronos"])

        if prophet_preds is not None and self.weights["prophet"] > 0:
            predictions.append(prophet_preds)
            weights.append(self.weights["prophet"])

        if not predictions:
            raise ValueError("No predictions available for ensemble")

        # Normalize weights
        total_weight = sum(weights)
        weights = [w / total_weight for w in weights]

        # Weighted average
        result = np.zeros_like(predictions[0])
        for pred, weight in zip(predictions, weights):
            result += pred * weight

        return result

    def generate_recommendations(self, summary: ForecastSummary) -> list[str]:
        """Generate Hindi action recommendations based on forecast"""
        recommendations = []

        # Crisis recommendations
        if summary.crisis_dates:
            first_crisis = summary.crisis_dates[0]
            days_until = first_crisis.get("days_until", 0)

            if days_until <= 7:
                recommendations.append(
                    f"⚠️ {days_until} din mein cash crunch aa sakta hai. "
                    f"Abhi se udhari collection tez karein."
                )
            elif days_until <= 14:
                recommendations.append(
                    f"📊 {days_until} din mein cash tight ho sakta hai. "
                    f"Top 5 udhari reminders bhejein."
                )
            elif days_until <= 30:
                recommendations.append(
                    f"💡 {days_until} din baad cash slow hoga. "
                    f"Supplier payments reschedule karein."
                )

        # Festival recommendations
        upcoming_festivals = [f for f in summary.festival_impacts if f.get("days_until", 99) <= 14]
        if upcoming_festivals:
            fest = upcoming_festivals[0]
            recommendations.append(
                f"🎉 {fest['festival_name']} {fest.get('days_until', 0)} din mein hai! "
                f"Extra stock order karein — revenue {int((fest['multiplier'] - 1) * 100)}% badhega."
            )

        # General financial advice
        if summary.total_predicted_net > 0:
            savings_pct = min(20, int(summary.total_predicted_net / summary.total_predicted_income * 100))
            recommendations.append(
                f"💰 Next 30 din mein Rs {summary.total_predicted_net:,.0f} profit expected. "
                f"{savings_pct}% save karein lean period ke liye."
            )

        return recommendations
