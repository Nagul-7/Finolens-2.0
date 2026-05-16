from .schemas import SignalRequest, SignalResponse


def generate_signal(request: SignalRequest) -> SignalResponse:
    """
    Combines all indicators into a single signal.
    Implemented in Section 5.
    """
    raise NotImplementedError("Signal engine — implemented in Section 5")
