# models.py
# Data structures for the WRAITH environment
# Extends OpenEnv base classes — Action, Observation, State

from pydantic import Field, ConfigDict
from typing import List, Optional, Any, Dict

try:
    from openenv import Action, Observation
    from openenv.core.env_server import State
except ImportError:
    # local fallback so env.py tests still run without openenv installed
    from pydantic import BaseModel
    class Action(BaseModel): pass
    class Observation(BaseModel): pass
    class State(BaseModel): pass


class WraithAction(Action):
    """
    What the WRAITH boss decides to do each round.
    The LLM outputs this. Extends OpenEnv Action.
    """
    model_config = ConfigDict(
        extra="forbid",
        validate_assignment=True,
        arbitrary_types_allowed=True,
    )

    attack: str = Field(
        description="One of: SWEEP_LEFT, FEINT_RIGHT, OVERHEAD, WAIT"
    )
    reasoning: str = Field(
        description="Why WRAITH chose this attack based on the player behavioral profile"
    )
    metadata: Dict[str, Any] = Field(
        default_factory=dict,
        description="Additional metadata"
    )


class WraithObservation(Observation):
    """
    What the WRAITH boss sees each round.
    Extends OpenEnv Observation — done, reward, metadata are inherited.
    """
    model_config = ConfigDict(
        extra="forbid",
        validate_assignment=True,
        arbitrary_types_allowed=True,
    )

    # OpenEnv required fields (re-declared for clarity)
    done: bool = Field(default=False, description="Whether the episode has terminated")
    reward: Optional[float] = Field(default=None, description="Reward signal from last action")
    metadata: Dict[str, Any] = Field(default_factory=dict)

    # WRAITH-specific observation fields
    profile_text: str = Field(
        description="Natural language behavioral profile of the player"
    )
    available_attacks: List[str] = Field(
        default=["SWEEP_LEFT", "FEINT_RIGHT", "OVERHEAD", "WAIT"],
        description="Attacks the boss can choose from"
    )
    round_number: int = Field(description="Current round number")
    boss_hp: float = Field(description="WRAITH boss current health points")
    player_hp: float = Field(description="Player current health points")


class WraithState(State):
    """
    Full internal state of the environment. Extends OpenEnv State.
    """
    model_config = ConfigDict(
        extra="forbid",
        validate_assignment=True,
        arbitrary_types_allowed=True,
    )

    round: int = Field(default=0)
    boss_hp: float = Field(default=100.0)
    player_hp: float = Field(default=100.0)
    done: bool = Field(default=False)
    player_moves: List[str] = Field(default_factory=list)
