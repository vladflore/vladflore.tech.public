def numbered(items: list[str]) -> list[str]:
    """["tea", "milk"] -> ["1. tea", "2. milk"]"""
    result = []
    for i in range(len(items)):
        result.append(str(i + 1) + ". " + items[i])
    return result


def positions(text: str, char: str) -> list[int]:
    """Every index where char appears in text."""
    found = []
    for i in range(len(text)):
        if text[i] == char:
            found.append(i)
    return found


def order_total(prices: list[float], quantities: list[int]) -> float:
    """Sum of price * quantity; the lists must have the same length."""
    if len(prices) != len(quantities):
        raise ValueError("prices and quantities differ in length")
    total = 0
    for i in range(len(prices)):
        total = total + prices[i] * quantities[i]
    return total


def first_change(old: list, new: list) -> int | None:
    """Index of the first item that differs (same-length lists), or None."""
    i = 0
    while i < len(old):
        if old[i] != new[i]:
            return i
        i += 1
    return None


def to_dict(keys: list, values: list) -> dict:
    """Pair each key with the value at the same position."""
    result = {}
    for i in range(len(keys)):
        result[keys[i]] = values[i]
    return result
