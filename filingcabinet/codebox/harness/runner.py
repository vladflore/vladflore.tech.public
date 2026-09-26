"""Test harness for structured problems.

Runs inside Piston as the entry file (`main.py`) next to:
  - solution.py   the user's code
  - problem.json  the problem definition (function, compare, tests)

Two kinds of test:
  - call test:       {"name", "args", "expected"}  ->  function(*args) == expected
  - expression test: {"name", "expr", "setup"?, "expected" | "raises"}
      `setup` (statements) runs first, then `expr` is evaluated, both in a fresh
      copy of the user's module namespace. Lets tests exercise classes, decorators,
      generators, context managers: "list(Countdown(3))", "Account(-5)".
      "raises": "ValueError" passes if that exception (or a subclass) is raised.
Either kind may add "output": the exact text the test must print.

Output protocol (one line each, flushed immediately so partial results
survive if the run is killed):
  @@ERROR  {"kind", "error"}                                   fatal, no tests ran
  @@RESULT {"name", "passed", "expected", "actual", "error", "stdout", "ms"}
            (+ "raises" / "expected_output" when the test has them)
            (skipped tests have "skipped": true once the time budget is spent)
  @@SUMMARY {"passed", "total"}                                 run completed
Anything else on stdout is the user's own top-level output (truncated).
"""

import copy
import importlib
import io
import json
import math
import os
import signal
import sys
import time
import traceback
from collections import Counter
from contextlib import redirect_stdout

DEFAULT_TIMEOUT_S = 1.0
# Whole run must finish before Piston's run_timeout (3s default) kills it.
TOTAL_BUDGET_S = 2.0
FLOAT_TOLERANCE = 1e-6
# Output caps keep every run far below Piston's output limit (PISTON_OUTPUT_MAX_SIZE).
MAX_STDOUT_CHARS = 1000
MAX_VALUE_CHARS = 1000
USER_FILE = "solution.py"

_out = sys.__stdout__


class TestTimeout(BaseException):
    """BaseException so a user's `except Exception` can't swallow it."""


def emit(tag, payload):
    _out.write(f"@@{tag} {json.dumps(payload)}\n")
    _out.flush()


def json_safe(value):
    """NaN/Infinity aren't valid JSON (the browser can't parse them): make them strings."""
    if isinstance(value, float) and not math.isfinite(value):
        return "NaN" if math.isnan(value) else ("Infinity" if value > 0 else "-Infinity")
    if isinstance(value, list):
        return [json_safe(v) for v in value]
    if isinstance(value, dict):
        return {k: json_safe(v) for k, v in value.items()}
    return value


def normalize(value):
    """Round-trip through JSON so tuples == lists and results are serializable."""
    return json_safe(json.loads(json.dumps(value, default=repr)))


def displayable(value):
    """Huge results are compared in full but shown as a truncated preview."""
    text = json.dumps(value)
    if len(text) <= MAX_VALUE_CHARS:
        return value
    return f"{text[:MAX_VALUE_CHARS]}... [truncated {len(text) - MAX_VALUE_CHARS} chars]"


def user_traceback(exc):
    """Traceback limited to frames from the user's file, with bare file names."""
    frames = [
        f
        for f in traceback.extract_tb(exc.__traceback__)
        if os.path.basename(f.filename) == USER_FILE
    ]
    for f in frames:
        f.filename = USER_FILE
    if isinstance(exc, SyntaxError) and exc.filename:
        exc.filename = os.path.basename(exc.filename)
    lines = traceback.format_list(frames) if frames else []
    lines += traceback.format_exception_only(type(exc), exc)
    return "".join(lines).rstrip()


def truncate(text, limit=MAX_STDOUT_CHARS):
    if len(text) <= limit:
        return text
    return text[:limit] + f"\n... [truncated {len(text) - limit} chars]"


def floats_equal(a, b):
    if isinstance(a, bool) or isinstance(b, bool):
        return a == b
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return math.isclose(a, b, rel_tol=FLOAT_TOLERANCE, abs_tol=FLOAT_TOLERANCE)
    if isinstance(a, list) and isinstance(b, list):
        return len(a) == len(b) and all(floats_equal(x, y) for x, y in zip(a, b))
    if isinstance(a, dict) and isinstance(b, dict):
        return a.keys() == b.keys() and all(floats_equal(a[k], b[k]) for k in a)
    return a == b


def unordered_equal(a, b):
    if isinstance(a, list) and isinstance(b, list):
        try:
            return sorted(a) == sorted(b)
        except TypeError:
            # Unorderable elements (dicts, mixed types): compare as multisets.
            key = lambda x: json.dumps(x, sort_keys=True)
            return Counter(map(key, a)) == Counter(map(key, b))
    return a == b


COMPARATORS = {
    "exact": lambda a, b: a == b,
    "unordered": unordered_equal,
    "float": floats_equal,
}


def _on_alarm(signum, frame):
    raise TestTimeout()


def skipped_result(test):
    return {
        "name": test["name"],
        "passed": False,
        "skipped": True,
        "expected": test.get("expected"),
        "actual": None,
        "error": "Skipped: total time budget exhausted",
        "stdout": "",
        "ms": 0,
    }


def evaluate(module, fn, test):
    """The value a test checks: a call of the problem's function, or an expression."""
    if "expr" not in test:
        return fn(*copy.deepcopy(test["args"]))
    namespace = dict(vars(module))
    if test.get("setup"):
        exec(compile(test["setup"], "<test>", "exec"), namespace)
    return eval(compile(test["expr"], "<test>", "eval"), namespace)


def raised_matches(exc, name):
    return any(cls.__name__ == name for cls in type(exc).__mro__)


def run_test(module, fn, test, compare, timeout_s):
    captured = io.StringIO()
    raises = test.get("raises")
    result = {
        "name": test["name"],
        "passed": False,
        "expected": test.get("expected"),
        "actual": None,
        "error": None,
        "stdout": "",
        "ms": 0,
    }
    if raises:
        result["raises"] = raises
    if "output" in test:
        result["expected_output"] = test["output"]
    start = time.perf_counter()
    signal.setitimer(signal.ITIMER_REAL, timeout_s)
    try:
        try:
            with redirect_stdout(captured):
                actual = evaluate(module, fn, test)
        except Exception as e:
            if not (raises and raised_matches(e, raises)):
                raise
            actual, raised = None, True
        else:
            raised = False
        finally:
            signal.setitimer(signal.ITIMER_REAL, 0)
            result["ms"] = round((time.perf_counter() - start) * 1000, 2)
        output_ok = captured.getvalue() == test.get("output", captured.getvalue())
        if raises:
            result["passed"] = raised and output_ok
            if not raised:
                result["actual"] = displayable(normalize(actual))
        else:
            actual = normalize(actual)
            result["passed"] = compare(actual, test["expected"]) and output_ok
            result["actual"] = displayable(actual)
    except TestTimeout:
        result["error"] = f"Time limit exceeded ({round(timeout_s, 2):g}s)"
    except RecursionError as e:
        # Full traceback would be ~1000 identical frames.
        result["error"] = f"RecursionError: {e}"
    except SystemExit as e:
        result["error"] = f"SystemExit({e.code}): exit() stops the program; return a value instead"
    except Exception as e:
        result["error"] = truncate(user_traceback(e), MAX_VALUE_CHARS)
    result["stdout"] = truncate(captured.getvalue())
    return result


def main():
    with open("problem.json") as f:
        problem = json.load(f)

    deadline = time.perf_counter() + TOTAL_BUDGET_S
    signal.signal(signal.SIGALRM, _on_alarm)
    sys.path.insert(0, os.getcwd())
    captured = io.StringIO()
    signal.setitimer(signal.ITIMER_REAL, TOTAL_BUDGET_S)
    try:
        with redirect_stdout(captured):
            module = importlib.import_module(USER_FILE[:-3])
    except TestTimeout:
        module = None
        error = f"Time limit exceeded while loading {USER_FILE} ({TOTAL_BUDGET_S:g}s)"
    except BaseException as e:
        module = None
        error = truncate(user_traceback(e), MAX_VALUE_CHARS)
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
    top_level_output = truncate(captured.getvalue())
    if top_level_output:
        _out.write(top_level_output if top_level_output.endswith("\n") else top_level_output + "\n")
    if module is None:
        emit("ERROR", {"kind": "import", "error": error})
        return

    fn = None
    if any("expr" not in test for test in problem["tests"]):
        fn_name = problem["function"]
        fn = getattr(module, fn_name, None)
        if not callable(fn):
            emit("ERROR", {"kind": "missing_function", "error": f"Function '{fn_name}' not found"})
            return

    compare = COMPARATORS[problem.get("compare", "exact")]
    timeout_s = float(problem.get("timeout", DEFAULT_TIMEOUT_S))

    passed = 0
    tests = problem["tests"]
    for test in tests:
        remaining = deadline - time.perf_counter()
        if remaining <= 0:
            emit("RESULT", skipped_result(test))
            continue
        result = run_test(module, fn, test, compare, min(timeout_s, remaining))
        passed += result["passed"]
        emit("RESULT", result)

    emit("SUMMARY", {"passed": passed, "total": len(tests)})


if __name__ == "__main__":
    main()
    # Hard exit: a thread the user's code left running (e.g. a deadlocked pool worker)
    # would otherwise keep the process alive until Piston kills it.
    sys.stdout.flush()
    os._exit(0)
