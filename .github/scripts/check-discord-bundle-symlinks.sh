#!/usr/bin/env bash
set -euo pipefail

root="${1:-}"
[[ -n "$root" && -d "$root" && ! -L "$root" ]] || {
  echo "Discord bundle symlink validation requires a regular directory root." >&2
  exit 1
}

root="$(realpath -e -- "$root")"

while IFS= read -r -d '' link_path; do
  if ! resolved_path="$(readlink -f -- "$link_path")"; then
    echo "Packaged Discord release contains a dangling symlink: $link_path" >&2
    exit 1
  fi

  case "$resolved_path" in
    "$root" | "$root"/*) ;;
    *)
      echo "Packaged Discord release symlink escapes the bundle: $link_path -> $resolved_path" >&2
      exit 1
      ;;
  esac
done < <(find "$root" -type l -print0)
