"""
Command & Control Layer Package (`lasius.core.control`).

Purpose & Role:
    Provides transport-agnostic command models (`Order`, `OrderResult`) and the
    central `OrderDispatcher` that arbitrates between synchronous real-time
    controls, asynchronous test sequences, and Priority-99 Emergency Stops.

Exports:
    - `Order`, `OrderAction`, `OrderPriority`, `OrderStatus`, `OrderResult`.
    - `OrderDispatcher`.
"""

from .orders import (
    Order,
    OrderAction,
    OrderPriority,
    OrderStatus,
    OrderResult,
)
from .dispatcher import OrderDispatcher

__all__ = [
    "Order",
    "OrderAction",
    "OrderPriority",
    "OrderStatus",
    "OrderResult",
    "OrderDispatcher",
]
