class Node:
    def __init__(self, value: int) -> None:
        self.value = value
        self.left = None
        self.right = None


class BST:
    def __init__(self, root: int) -> None:
        self.root = Node(root)

    def insert(self, new_val: int) -> None:
        self.insert_helper(self.root, new_val)

    def insert_helper(self, current: Node, new_val: int) -> None:
        if current.data < new_val:
            if current.right:
                self.insert_helper(current.right, new_val)
            else:
                current.right = Node(new_val)
        else:
            if current.left:
                self.insert_helper(current.left, new_val)
            else:
                current.left = Node(new_val)

    def search(self, find_val: int) -> bool:
        return self.search_helper(self.root, find_val)

    def search_helper(self, current: Node | None, find_val: int) -> bool:
        if current:
            if current.data == find_val:
                return True
            elif current.data < find_val:
                return self.search_helper(current.right, find_val)
            else:
                return self.search_helper(current.left, find_val)

    # Used by the tests: do not change.
    def in_order(self) -> list[int]:
        values = []

        def walk(node: Node | None) -> None:
            if node:
                walk(node.left)
                values.append(node.value)
                walk(node.right)

        walk(self.root)
        return values
