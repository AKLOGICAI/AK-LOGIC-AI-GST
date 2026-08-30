"""Delivery provider interface, registry, and default SelfPickup implementation.
Ensures we don't hardcode providers directly.
"""
from abc import ABC, abstractmethod
from typing import Optional, Dict

class DeliveryProvider(ABC):
    """Abstract base class for all delivery providers.
    """
    @property
    @abstractmethod
    def code(self) -> str:
        """String identifier code for the provider.
        """
        pass

    @property
    @abstractmethod
    def name(self) -> str:
        """Display name of the provider.
        """
        pass

    @abstractmethod
    def verify_reference(self, reference: str) -> bool:
        """Checks if a tracking reference or confirmation code is valid.
        """
        pass

class SelfPickupProvider(DeliveryProvider):
    """Delivery provider for self-pickup where buyer picks up from seller.
    """
    @property
    def code(self) -> str:
        return "self_pickup"

    @property
    def name(self) -> str:
        return "Self Pickup"

    def verify_reference(self, reference: str) -> bool:
        # Self pickup does not require tracking reference check
        return True

class DeliveryRegistry:
    """Registry to keep track of available delivery providers.
    """
    def __init__(self):
        self._registry: Dict[str, DeliveryProvider] = {}

    def register(self, provider: DeliveryProvider) -> None:
        self._registry[provider.code] = provider

    def get(self, code: str) -> Optional[DeliveryProvider]:
        return self._registry.get(code)

# Global Registry Instance and Default Registration
delivery_registry = DeliveryRegistry()
delivery_registry.register(SelfPickupProvider())
