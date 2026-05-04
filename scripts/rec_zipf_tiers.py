"""Shared Zipf → recognizability tier used by pickle export and extended-metrics builder.

Keep thresholds in sync wherever `zipf_frequency` tiers are referenced.
"""


def zipf_to_rec(z: float) -> int:
    if z >= 6.8:
        return 10
    if z >= 6.0:
        return 9
    if z >= 5.2:
        return 8
    if z >= 4.4:
        return 7
    if z >= 3.6:
        return 6
    if z >= 2.8:
        return 5
    if z >= 2.0:
        return 4
    if z >= 1.2:
        return 3
    return 2 if z >= 0.5 else 1
