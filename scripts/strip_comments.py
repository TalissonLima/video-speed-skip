"""Comment stripping for the release build (stdlib only, dev tool).

JS: a small scanner that understands strings, template literals (including ${...}) and regex
literals, so "//" inside a string or a pattern like /[»›>]/ is never treated as a comment.
Lines that contained only a comment are dropped entirely; code is otherwise left untouched.
"""
import re

# Keywords after which a "/" starts a regex literal instead of a division.
_REGEX_AFTER_WORD = {"return", "typeof", "case", "in", "of", "delete", "void", "throw", "new", "else", "do", "yield", "await"}
_REGEX_AFTER_CHAR = set("(,=:[!&|?{};+-*%<>~^")


def strip_js(src: str) -> str:
    n = len(src)
    out: list[str] = []
    st = {"i": 0, "line_start": 0, "comment": False, "code": False}

    def emit(ch: str) -> None:
        out.append(ch)
        if ch == "\n":
            st["line_start"], st["comment"], st["code"] = len(out), False, False
        elif not ch.isspace():
            st["code"] = True

    def regex_allowed() -> bool:
        tail = "".join(out[-24:]).rstrip()
        if not tail:
            return True
        last = tail[-1]
        if last in _REGEX_AFTER_CHAR:
            return True
        if last.isalnum() or last in "_$":
            word = re.search(r"[A-Za-z_$][\w$]*$", tail)
            return bool(word and word.group(0) in _REGEX_AFTER_WORD)
        return False  # after ")", "]", a string, ... it's a division

    def copy_string(quote: str) -> None:
        i = st["i"]
        emit(src[i]); i += 1
        while i < n:
            c = src[i]
            emit(c); i += 1
            if c == "\\" and i < n:
                emit(src[i]); i += 1
            elif c == quote:
                break
        st["i"] = i

    def copy_regex() -> None:
        i = st["i"]
        emit(src[i]); i += 1
        in_class = False
        while i < n:
            c = src[i]
            emit(c); i += 1
            if c == "\\" and i < n:
                emit(src[i]); i += 1
            elif c == "[":
                in_class = True
            elif c == "]":
                in_class = False
            elif c == "/" and not in_class:
                break
        st["i"] = i

    def copy_template() -> None:
        i = st["i"]
        emit(src[i]); i += 1
        while i < n:
            c = src[i]
            if c == "\\" and i + 1 < n:
                emit(c); emit(src[i + 1]); i += 2
            elif c == "`":
                emit(c); i += 1
                break
            elif c == "$" and src[i + 1:i + 2] == "{":
                emit("$"); emit("{"); i += 2
                st["i"] = i
                scan(until_brace=True)
                i = st["i"]
            else:
                emit(c); i += 1
        st["i"] = i

    def scan(until_brace: bool = False) -> None:
        depth = 0
        while st["i"] < n:
            i = st["i"]
            c = src[i]
            nxt = src[i + 1] if i + 1 < n else ""
            if c == "/" and nxt == "/":                       # line comment
                st["comment"] = True
                while st["i"] < n and src[st["i"]] != "\n":
                    st["i"] += 1
            elif c == "/" and nxt == "*":                     # block comment
                st["comment"] = True
                end = src.find("*/", i + 2)
                st["i"] = n if end == -1 else end + 2
            elif c in "'\"":
                copy_string(c)
            elif c == "`":
                copy_template()
            elif c == "/" and regex_allowed():
                copy_regex()
            elif c == "\n":
                st["i"] += 1
                if st["comment"] and not st["code"]:          # the line was only a comment: drop it
                    del out[st["line_start"]:]
                    st["comment"] = False
                else:
                    if st["comment"]:                         # trailing comment removed: trim the gap it left
                        while out and out[-1] in " \t":
                            out.pop()
                    emit("\n")
            else:
                if until_brace:
                    if c == "{":
                        depth += 1
                    elif c == "}":
                        if depth == 0:
                            emit(c)
                            st["i"] += 1
                            return
                        depth -= 1
                emit(c)
                st["i"] += 1

    scan()
    return "".join(out)


def strip_css(src: str) -> str:
    src = re.sub(r"^[ \t]*/\*.*?\*/[ \t]*\n", "", src, flags=re.S | re.M)  # comment-only lines
    return re.sub(r"[ \t]*/\*.*?\*/", "", src, flags=re.S)                  # trailing / inline comments


def strip_html(src: str) -> str:
    src = re.sub(r"^[ \t]*<!--.*?-->[ \t]*\n", "", src, flags=re.S | re.M)
    return re.sub(r"[ \t]*<!--.*?-->", "", src, flags=re.S)


import ast
import io
import tokenize


def strip_py(src: str) -> str:
    """Remove every `#` comment from Python source (keeps a shebang). Uses the tokenizer, so a '#' inside a string is safe."""
    lines = src.splitlines(keepends=True)
    comments = [t for t in tokenize.generate_tokens(io.StringIO(src).readline)
                if t.type == tokenize.COMMENT and not (t.start[0] == 1 and t.string.startswith("#!"))]
    for t in reversed(comments):
        row, col = t.start
        line = lines[row - 1]
        before = line[:col].rstrip()
        lines[row - 1] = "" if not before.strip() else before + ("\n" if line.endswith("\n") else "")
    out = "".join(lines)
    return re.sub(r"\n{4,}", "\n\n\n", out)


def strip_py_js_strings(src: str) -> str:
    """The tests keep JavaScript inside triple-quoted Python strings: strip the JS comments in those (docstrings are left alone)."""
    tree = ast.parse(src)
    docstrings = set()
    for node in ast.walk(tree):
        if isinstance(node, (ast.Module, ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)) and node.body:
            first = node.body[0]
            if isinstance(first, ast.Expr) and isinstance(first.value, ast.Constant) and isinstance(first.value.value, str):
                docstrings.add(id(first.value))
    lines = src.splitlines(keepends=True)
    offsets = [0]
    for line in lines:
        offsets.append(offsets[-1] + len(line))

    def at(row, col_bytes):
        return offsets[row - 1] + len(lines[row - 1].encode()[:col_bytes].decode())

    edits = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Constant) and isinstance(node.value, str) and id(node) not in docstrings \
                and node.end_lineno > node.lineno:
            start, end = at(node.lineno, node.col_offset), at(node.end_lineno, node.end_col_offset)
            literal = src[start:end]
            quote = literal[:3]
            if quote in ('"""', "'''") and literal.endswith(quote) and re.search(r"(^|\s)//|/\*", literal):
                edits.append((start, end, quote + strip_js(literal[3:-3]) + quote))
    for start, end, new in sorted(edits, reverse=True):
        src = src[:start] + new + src[end:]
    return src


def strip_html_page(src: str) -> str:
    """A whole HTML page: its comments, plus the comments inside its inline <style> and <script> blocks."""
    src = strip_html(src)
    src = re.sub(r"<style>(.*?)</style>", lambda m: "<style>" + strip_css(m.group(1)) + "</style>", src, flags=re.S)
    return re.sub(r"<script>(.*?)</script>", lambda m: "<script>" + strip_js(m.group(1)) + "</script>", src, flags=re.S)
