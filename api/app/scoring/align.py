def align(expected: str, heard: str) -> dict:
    """S4: word-level edit-distance alignment. Pure function, inputs already normalized."""
    e, h = expected.split(), heard.split()
    n, m = len(e), len(h)
    d = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(n + 1): d[i][0] = i
    for j in range(m + 1): d[0][j] = j
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            d[i][j] = min(d[i-1][j] + 1, d[i][j-1] + 1, d[i-1][j-1] + (e[i-1] != h[j-1]))
    i, j, out = n, m, []
    while i or j:
        if i and j and d[i][j] == d[i-1][j-1] + (e[i-1] != h[j-1]):
            out.append([e[i-1], h[j-1], "ok" if e[i-1] == h[j-1] else "sub"]); i -= 1; j -= 1
        elif i and d[i][j] == d[i-1][j] + 1:
            out.append([e[i-1], None, "omit"]); i -= 1
        else:
            out.append([None, h[j-1], "ins"]); j -= 1
    out.reverse()
    errors = {k: sum(1 for a in out if a[2] == k) for k in ("omit", "sub", "ins")}
    wer = round(sum(errors.values()) / max(n, 1), 2)
    return {"alignment": out, "errors": errors, "wer": wer, "accuracy": round(max(0.0, 1 - wer), 2)}
