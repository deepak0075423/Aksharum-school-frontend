#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Runs ON the EC2 server. .github/workflows/deploy.yml uploads the built site
# (dist/ as a .tgz) and pipes this file over SSH:
#
#   ssh server 'bash -s -- <build.tgz> <domain> [web-root]' < deploy/server-install.sh
#
#   1. finds the folder the site is served from, unless [web-root] is given:
#      the `root` of <domain>'s nginx server block, or — when nginx forwards
#      the site to a local port (production on Nov 17 2026: 127.0.0.1:3000) —
#      the folder `pm2 serve` serves on that port (~/Aksharum-school-frontend/dist).
#      pm2 serve reads the files on every request, so no restart is needed.
#   2. copies the new hashed files in assets/ first, then the other files, and
#      swaps index.html last — a page open in someone's browser can still load
#      the lazy chunks it was built with
#   3. deletes asset files no build has used for 14 days
#
# Lines starting ::error:: / ::warning:: become annotations on the GitHub run.
# ─────────────────────────────────────────────────────────────────────────────

# Inside main() so bash has read the whole script before anything runs.
main() {
    set -Eeuo pipefail
    shopt -s dotglob nullglob

    TGZ="${1:?uploaded build}"    # global: the EXIT trap removes it
    local DOMAIN="${2:?site domain}"
    local ROOT="${3:-}"
    local GIVEN="$ROOT"
    trap 'rm -f "$TGZ"' EXIT

    # ── which folder ────────────────────────────────────────────────────────
    [ -n "$ROOT" ] || ROOT="$(find_root "$DOMAIN")"
    [ -n "$ROOT" ] || fail "Could not find the folder $DOMAIN is served from (no nginx root, and no pm2 serve process on the port nginx forwards to). Set the repository variable FRONTEND_DIR."
    ROOT="${ROOT%/}"
    case "$ROOT" in
        ""|/|/bin|/boot|/dev|/etc|/home|/lib|/opt|/proc|/root|/sbin|/srv|/sys|/tmp|/usr|/var|/var/www|"$HOME")
            fail "Refusing to install the site straight into '$ROOT'" ;;
    esac
    [ -d "$ROOT" ] || fail "$ROOT (the folder for $DOMAIN) does not exist"
    if [ -z "$GIVEN" ] && [ ! -f "$ROOT/index.html" ]; then
        fail "$ROOT has no index.html — it does not look like the site folder. Set the repository variable FRONTEND_DIR if it really is."
    fi

    local SUDO=""
    if [ ! -w "$ROOT" ] || { [ -d "$ROOT/assets" ] && [ ! -w "$ROOT/assets" ]; }; then
        sudo -n true 2>/dev/null || fail "$ROOT is not writable by $(whoami) and sudo asks for a password"
        SUDO="sudo -n"
    fi

    # ── unpack ──────────────────────────────────────────────────────────────
    STAGE="$(mktemp -d)"          # global: the EXIT trap removes it
    trap 'rm -f "$TGZ"; rm -rf "$STAGE"' EXIT
    tar -xzf "$TGZ" -C "$STAGE"
    { [ -f "$STAGE/index.html" ] && [ -d "$STAGE/assets" ]; } || fail "The uploaded build has no index.html or assets/"

    # ── install ─────────────────────────────────────────────────────────────
    $SUDO mkdir -p "$ROOT/assets"
    $SUDO cp -R "$STAGE/assets/." "$ROOT/assets/"
    local f
    for f in "$STAGE"/*; do
        case "$(basename "$f")" in index.html|assets) continue ;; esac
        $SUDO cp -R "$f" "$ROOT/"
    done
    $SUDO cp "$STAGE/index.html" "$ROOT/.index.html.new"
    $SUDO mv -f "$ROOT/.index.html.new" "$ROOT/index.html"

    # Files just copied carry today's date; anything older than 14 days in
    # assets/ belongs to no build since then.
    local stale
    stale="$($SUDO find "$ROOT/assets" -type f -mtime +14 | wc -l | tr -d ' ')"
    [ "$stale" = 0 ] || $SUDO find "$ROOT/assets" -type f -mtime +14 -delete
    echo "✅ Installed $(find "$STAGE" -type f | wc -l | tr -d ' ') files into $ROOT; removed $stale old asset file(s)"
}

fail() { echo "::error::$*"; exit 1; }

# Prints the folder <domain> is served from, or nothing. Read-only.
find_root() {
    local found port dir
    command -v python3 >/dev/null 2>&1 || { echo "::warning::python3 is missing — cannot read the nginx config" >&2; return 0; }
    found="$( { sudo -n nginx -T 2>/dev/null || cat /etc/nginx/nginx.conf /etc/nginx/sites-enabled/* /etc/nginx/conf.d/*.conf 2>/dev/null || true; } \
              | python3 -c "$NGINX_ROOT_PY" "$1" || true)"
    case "$found" in
        root:*)
            echo "nginx serves $1 from ${found#root:}" >&2
            echo "${found#root:}" ;;
        proxy:*)
            port="${found#proxy:}"
            dir="$(pm2 jlist 2>/dev/null | node -e '
                let list = [];
                for (const line of require("fs").readFileSync(0, "utf8").split("\n").reverse()) {
                    if (!line.trim().startsWith("[")) continue;
                    try { const v = JSON.parse(line); if (Array.isArray(v)) { list = v; break; } } catch (e) {}
                }
                const env = (p) => ({ ...((p.pm2_env || {}).env || {}), ...(p.pm2_env || {}) });
                const hit = list.find((p) => String(env(p).PM2_SERVE_PORT) === process.argv[1] && env(p).PM2_SERVE_PATH);
                if (hit) console.log(env(hit).PM2_SERVE_PATH);
            ' "$port" 2>/dev/null || true)"
            if [ -n "$dir" ]; then echo "nginx forwards $1 to port $port, where pm2 serve serves $dir" >&2; echo "$dir"
            else echo "::warning::nginx forwards $1 to port $port, but no pm2 serve process listens there" >&2; fi ;;
    esac
}

# Reads `nginx -T` on stdin. For the server block whose server_name lists the
# domain, prints "root:<folder>" (its own `root`, else the one in `location /`)
# or, when `location /` forwards to a local port, "proxy:<port>".
read -r -d '' NGINX_ROOT_PY <<'PY' || true
import re, sys
domain = sys.argv[1].lower()
text = re.sub(r"(?m)(^|\s)#.*$", " ", sys.stdin.read())
TOKEN = r"\"(?:[^\"\\]|\\.)*\"" + "|" + r"'(?:[^'\\]|\\.)*'" + "|" + r"[{};]|[^\s{};]+"
toks = re.findall(TOKEN, text)

def parse(i):
    out, cur = [], []
    while i < len(toks):
        t = toks[i]; i += 1
        if t == "{":
            kids, i = parse(i); out.append((cur, kids)); cur = []
        elif t == "}":
            return out, i
        elif t == ";":
            out.append((cur, None)); cur = []
        else:
            cur.append(t.strip("\"'"))
    return out, i

def servers(nodes):
    for args, kids in nodes:
        if kids is None:
            continue
        if args[:1] == ["server"]:
            yield kids
        else:
            yield from servers(kids)

def root_of(kids):
    for args, sub in kids:
        if sub is None and args[:1] == ["root"] and len(args) > 1:
            return args[1]
    for args, sub in kids:
        if sub is not None and args[:1] == ["location"] and args[-1:] == ["/"]:
            for a, s in sub:
                if s is None and a[:1] in (["root"], ["alias"]) and len(a) > 1:
                    return a[1]
    return None

def proxy_port(kids):
    for args, sub in kids:
        if sub is not None and args[:1] == ["location"] and args[-1:] == ["/"]:
            for a, s in sub:
                if s is None and a[:1] == ["proxy_pass"] and len(a) > 1:
                    m = re.match(r"https?://(?:127\.0\.0\.1|localhost|\[::1\]):(\d+)", a[1])
                    if m:
                        return m.group(1)
    return None

roots, ports = [], []
for kids in servers(parse(0)[0]):
    names = [n.lower() for a, s in kids if s is None and a[:1] == ["server_name"] for n in a[1:]]
    if domain in names:
        r = root_of(kids)
        if r and "$" not in r:
            roots.append(r.rstrip("/") or "/")
        p = proxy_port(kids)
        if p:
            ports.append(p)
if ports:
    print("proxy:" + ports[0])
elif roots:
    print("root:" + roots[0])
PY

main "$@"
