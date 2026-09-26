class Node:
    def __init__(self, value):
        self.value = value
        self.left = None
        self.right = None


def build_tree(values):
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


def preorder(root):
    pass


def inorder(root):
    pass


def postorder(root):
    pass


def height(root):
    pass


def depth(root, value):
    pass


def is_full(root):
    pass


def is_complete(root):
    pass
