"""
Thompson Sampling for Udhari Collection Optimization

Multi-armed bandit that learns the optimal collection strategy per debtor.
Each (channel, tone, timing) combination is an "arm" with a Beta distribution.

Reference: Thompson, 1933. "On the likelihood that one unknown probability exceeds another"
Modern application: Chapelle & Li, 2011. "An Empirical Evaluation of Thompson Sampling"
"""

import random
import math
from dataclasses import dataclass, field
from typing import Optional
import json


@dataclass
class ArmStats:
    """Statistics for one action arm (Beta distribution parameters)"""
    alpha: float = 1.0  # Success count + prior
    beta: float = 1.0   # Failure count + prior

    def sample(self) -> float:
        """Sample from Beta(alpha, beta) distribution"""
        return random.betavariate(self.alpha, self.beta)

    @property
    def mean(self) -> float:
        """Expected value of the Beta distribution"""
        return self.alpha / (self.alpha + self.beta)

    @property
    def total_trials(self) -> int:
        """Total observations (minus prior)"""
        return int(self.alpha + self.beta - 2)

    def update(self, reward: float):
        """
        Update arm statistics with observed reward.
        reward: 0.0 (ignored) to 1.0 (paid in full immediately)
        """
        if reward > 0:
            self.alpha += reward  # Partial payments give partial alpha boost
        else:
            self.beta += 1.0

    def to_dict(self) -> dict:
        return {"alpha": self.alpha, "beta": self.beta, "mean": round(self.mean, 3), "trials": self.total_trials}


# Action space
CHANNELS = ["whatsapp_text", "whatsapp_voice", "sms"]
TONES = ["friendly_reminder", "polite_follow_up", "firm_request", "urgent_notice", "escalation_notice"]
TIMINGS = ["morning_9am", "afternoon_2pm", "evening_7pm", "weekend_10am"]


def _action_key(channel: str, tone: str, timing: str) -> str:
    return f"{channel}|{tone}|{timing}"


def _parse_action_key(key: str) -> tuple:
    parts = key.split("|")
    return parts[0], parts[1], parts[2]


@dataclass
class DebtorState:
    """State representation for a debtor"""
    debtor_name: str
    amount: float
    days_overdue: int
    reminder_count: int
    last_response: Optional[str] = None  # "paid", "partial", "replied", "ignored", "read"
    debtor_has_paytm: bool = True
    debtor_digital_activity: float = 0.5  # 0-1 scale


@dataclass
class CollectionAction:
    """Recommended collection action"""
    channel: str
    tone: str
    timing: str
    confidence: float
    action_key: str
    reasoning: str


class ThompsonSamplingCollector:
    """
    Per-debtor Thompson Sampling agent for collection optimization.

    State: debtor profile + history
    Action: (channel x tone x timing) = 3 x 5 x 4 = 60 possible actions
    Reward: based on debtor response

    The agent maintains separate arm statistics per debtor,
    learning individual preferences over time.
    """

    def __init__(self):
        # debtor_id -> {action_key -> ArmStats}
        self.debtor_arms: dict[str, dict[str, ArmStats]] = {}
        # Global prior (shared across debtors for cold start)
        self.global_arms: dict[str, ArmStats] = {}
        self._initialize_global_arms()

    def _initialize_global_arms(self):
        """Initialize global arms with domain knowledge priors"""
        for channel in CHANNELS:
            for tone in TONES:
                for timing in TIMINGS:
                    key = _action_key(channel, tone, timing)
                    # Set informed priors based on domain knowledge
                    alpha, beta = 1.0, 1.0

                    # WhatsApp text is generally most effective
                    if channel == "whatsapp_text":
                        alpha += 0.5
                    # Morning messages have highest open rates
                    if timing == "morning_9am":
                        alpha += 0.3
                    # Polite tone works best initially
                    if tone == "friendly_reminder":
                        alpha += 0.3
                    # SMS has lower engagement
                    if channel == "sms":
                        beta += 0.3

                    self.global_arms[key] = ArmStats(alpha=alpha, beta=beta)

    def _get_debtor_arms(self, debtor_id: str) -> dict[str, ArmStats]:
        """Get or create arm stats for a debtor, initialized from global prior"""
        if debtor_id not in self.debtor_arms:
            self.debtor_arms[debtor_id] = {}
            # Copy global priors
            for key, global_arm in self.global_arms.items():
                self.debtor_arms[debtor_id][key] = ArmStats(
                    alpha=global_arm.alpha,
                    beta=global_arm.beta,
                )
        return self.debtor_arms[debtor_id]

    def _filter_valid_actions(self, state: DebtorState) -> list[str]:
        """
        Filter actions based on debtor state and business rules.

        Rules:
        - Don't escalate beyond max level
        - Don't use voice for first contact
        - Match tone to days overdue
        - Don't send SMS if debtor has WhatsApp + Paytm
        """
        valid_actions = []
        max_tone_idx = min(state.reminder_count + 1, len(TONES) - 1)

        for channel in CHANNELS:
            # Skip SMS if debtor is on WhatsApp
            if channel == "sms" and state.debtor_has_paytm:
                continue
            # Skip voice for first reminder
            if channel == "whatsapp_voice" and state.reminder_count == 0:
                continue

            for tone_idx, tone in enumerate(TONES):
                # Don't escalate too fast
                if tone_idx > max_tone_idx:
                    continue
                # Don't use friendly tone after 30+ days
                if tone == "friendly_reminder" and state.days_overdue > 30:
                    continue

                for timing in TIMINGS:
                    # Skip weekend timing on weekdays (and vice versa)
                    valid_actions.append(_action_key(channel, tone, timing))

        return valid_actions

    def select_action(self, debtor_id: str, state: DebtorState) -> CollectionAction:
        """
        Select the best collection action using Thompson Sampling.

        1. Filter valid actions based on business rules
        2. Sample from each arm's Beta distribution
        3. Select the arm with highest sample value
        4. Return the recommended action
        """
        arms = self._get_debtor_arms(debtor_id)
        valid_keys = self._filter_valid_actions(state)

        if not valid_keys:
            # Fallback: friendly WhatsApp reminder
            return CollectionAction(
                channel="whatsapp_text",
                tone="friendly_reminder",
                timing="morning_9am",
                confidence=0.5,
                action_key=_action_key("whatsapp_text", "friendly_reminder", "morning_9am"),
                reasoning="Fallback action — no valid actions after filtering",
            )

        # Thompson Sampling: sample from each arm's posterior
        best_key = None
        best_sample = -1.0

        for key in valid_keys:
            arm = arms.get(key, ArmStats())
            sample = arm.sample()
            if sample > best_sample:
                best_sample = sample
                best_key = key

        channel, tone, timing = _parse_action_key(best_key)
        arm = arms[best_key]

        reasoning = (
            f"Selected {channel}/{tone}/{timing} with "
            f"Beta({arm.alpha:.1f}, {arm.beta:.1f}), "
            f"mean={arm.mean:.3f}, sampled={best_sample:.3f}, "
            f"trials={arm.total_trials}"
        )

        return CollectionAction(
            channel=channel,
            tone=tone,
            timing=timing,
            confidence=arm.mean,
            action_key=best_key,
            reasoning=reasoning,
        )

    def update(self, debtor_id: str, action_key: str, response: str, amount_paid: float, total_amount: float):
        """
        Update arm statistics based on debtor response.

        Reward signal:
        - paid (full): 1.0
        - partial: amount_paid / total_amount (0.0 - 1.0)
        - replied (but didn't pay): 0.3 (engagement is partial success)
        - read (but didn't reply): 0.1 (at least they saw it)
        - ignored (not delivered/read): 0.0
        """
        arms = self._get_debtor_arms(debtor_id)

        if action_key not in arms:
            arms[action_key] = ArmStats()

        # Calculate reward
        if response == "paid":
            reward = 1.0
        elif response == "partial_paid":
            reward = min(1.0, amount_paid / total_amount) if total_amount > 0 else 0.5
        elif response == "replied":
            reward = 0.3
        elif response == "read":
            reward = 0.1
        else:  # ignored, failed, etc.
            reward = 0.0

        arms[action_key].update(reward)

        # Also update global arms (with lower weight for knowledge transfer)
        if action_key in self.global_arms:
            self.global_arms[action_key].update(reward * 0.3)

    def get_debtor_stats(self, debtor_id: str) -> dict:
        """Get all arm statistics for a debtor (for debugging/display)"""
        arms = self._get_debtor_arms(debtor_id)
        stats = {}
        for key, arm in sorted(arms.items(), key=lambda x: x[1].mean, reverse=True):
            if arm.total_trials > 0:  # Only show arms with data
                channel, tone, timing = _parse_action_key(key)
                stats[key] = {
                    "channel": channel,
                    "tone": tone,
                    "timing": timing,
                    **arm.to_dict(),
                }
        return stats

    def get_best_strategy(self, debtor_id: str) -> dict:
        """Get the current best-known strategy for a debtor"""
        arms = self._get_debtor_arms(debtor_id)
        best_key = max(arms.keys(), key=lambda k: arms[k].mean)
        channel, tone, timing = _parse_action_key(best_key)
        arm = arms[best_key]
        return {
            "channel": channel,
            "tone": tone,
            "timing": timing,
            "success_rate": round(arm.mean, 3),
            "total_interactions": arm.total_trials,
        }

    def serialize(self) -> str:
        """Serialize state to JSON for persistence"""
        data = {
            "debtor_arms": {
                d_id: {key: arm.to_dict() for key, arm in arms.items()}
                for d_id, arms in self.debtor_arms.items()
            },
            "global_arms": {key: arm.to_dict() for key, arm in self.global_arms.items()},
        }
        return json.dumps(data)

    @classmethod
    def deserialize(cls, json_str: str) -> "ThompsonSamplingCollector":
        """Reconstruct from serialized JSON"""
        data = json.loads(json_str)
        collector = cls()
        for d_id, arms_data in data.get("debtor_arms", {}).items():
            collector.debtor_arms[d_id] = {
                key: ArmStats(alpha=a["alpha"], beta=a["beta"])
                for key, a in arms_data.items()
            }
        for key, a in data.get("global_arms", {}).items():
            collector.global_arms[key] = ArmStats(alpha=a["alpha"], beta=a["beta"])
        return collector


# Singleton instance
_collector_instance: Optional[ThompsonSamplingCollector] = None


def get_collector() -> ThompsonSamplingCollector:
    global _collector_instance
    if _collector_instance is None:
        _collector_instance = ThompsonSamplingCollector()
    return _collector_instance
