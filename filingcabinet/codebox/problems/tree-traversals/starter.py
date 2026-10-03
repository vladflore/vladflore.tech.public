# Given: do not change.
class Node:
    def __init__(self, value: int) -> None:
        self.value = value
        self.left = None
        self.right = None


# Given: do not change.
def build_tree(values: list[int | None]) -> Node | None:
    """Level-order list to a tree; None marks a missing node: [1, 2, 3, None, 5]."""
    if not values or values[0] is None:
        return None
    nodes = [None if v is None else Node(v) for v in values]
    children = iter(nodes[1:])
    for node in nodes:
        if node is None:
            continue
        node.left = next(children, None)
        node.right = next(children, None)
    return nodes[0]


def preorder(root: Node | None) -> list[int]:
    pass


def inorder(root: Node | None) -> list[int]:
    pass


def postorder(root: Node | None) -> list[int]:
    pass


def height(root: Node | None) -> int:
    pass


def depth(root: Node | None, value: int) -> int:
    pass


def is_full(root: Node | None) -> bool:
    pass


def is_complete(root: Node | None) -> bool:
    pass
