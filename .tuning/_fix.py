import re, sys

P = "src/cards/data/starter.ts"


def edit(deck_const, subs):
    s = open(P, encoding="utf-8").read()
    i = s.index("export const %s = parseDeck(" % deck_const)
    j = s.index("] });", i)
    body = s[i:j]
    for old, new in subs:
        assert old in body, "%s missing: %s" % (deck_const, old)
        body = body.replace(old, new, 1)
    open(P, "w", encoding="utf-8").write(s[:i] + body + s[j:])


def merge(deck_const):
    s = open(P, encoding="utf-8").read()
    i = s.index("export const %s = parseDeck(" % deck_const)
    j = s.index("] });", i)
    body = s[i:j]
    counts, order = {}, []
    for cid, n in re.findall(r"cardId: '([a-z0-9-]+)', count: (\d+)", body):
        if cid not in counts:
            order.append(cid)
        counts[cid] = counts.get(cid, 0) + int(n)
    head = body[: body.index("cards: [") + len("cards: [")]
    entries = ", ".join("{ cardId: '%s', count: %d }" % (c, counts[c]) for c in order)
    open(P, "w", encoding="utf-8").write(s[:i] + head + "\n  " + entries + ",\n" + s[j:])


def report():
    s = open(P, encoding="utf-8").read()
    bad = []
    for m in re.finditer(r"parseDeck\(\{ name: '([^']+)'.*?cards: \[(.*?)\n\] \}\);", s, re.S):
        cs = re.findall(r"cardId: '([a-z0-9-]+)', count: (\d+)", m.group(2))
        t = sum(int(c) for _, c in cs)
        over = [c for c, n in cs if int(n) > 3]
        if t != 30 or over:
            bad.append((m.group(1), t, over))
    print("problems:", bad or "none")


def show(names):
    s = open(P, encoding="utf-8").read()
    for name in names:
        m = re.search(r"parseDeck\(\{ name: '" + re.escape(name) + r"'.*?cards: \[(.*?)\n\] \}\);", s, re.S)
        cs = re.findall(r"cardId: '([a-z0-9-]+)', count: (\d+)", m.group(1))
        print("%s (%d): %s" % (name, sum(int(c) for _, c in cs), ", ".join("%sx%s" % (a, b) for a, b in cs)))
